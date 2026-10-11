import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useGuest } from '../context/GuestContext';
import { api } from '../services/api';
import { useWebRTC } from '../hooks/useWebRTC';
import { MainStage } from './MainStage';
import { ChatPanel } from './ChatPanel';
import { ParticipantPanel } from './ParticipantPanel';
import { ControlBar } from './ControlBar';
import { InviteModal } from './InviteModal';
import { WatchTogetherModal } from './WatchTogetherModal';
import { DeviceSettingsModal } from './DeviceSettingsModal';
import type { RoomInfo, Participant, Message, WatchSession } from '../types';
import { AlertCircle, ArrowLeft } from 'lucide-react';

interface RoomViewProps {
  roomId: string;
  initialInviteToken?: string;
  onLeave: () => void;
}

export const RoomView: React.FC<RoomViewProps> = ({ roomId, initialInviteToken, onLeave }) => {
  const { guest, token } = useGuest();

  const [socket, setSocket] = useState<Socket | null>(null);
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [currentRole, setCurrentRole] = useState<'host' | 'moderator' | 'participant'>('participant');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [waitingParticipants, setWaitingParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // States
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isWatchOpen, setIsWatchOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [screenSharerId, setScreenSharerId] = useState<string | null>(null);
  const [watchSession, setWatchSession] = useState<WatchSession | null>(null);
  const [isLocked, setIsLocked] = useState(false);

  // Status flags
  const [roomEndedMessage, setRoomEndedMessage] = useState<string | null>(null);
  const [kickedMessage, setKickedMessage] = useState<string | null>(null);

  // WebRTC Hook
  const {
    localStream,
    localScreenStream,
    remoteStreams,
    isMicOn,
    isCamOn,
    isScreenSharing,
    isSpeaking,
    toggleMic,
    toggleCam,
    startScreenShare,
    stopScreenShare,
    cleanup: cleanupWebRTC,
  } = useWebRTC(socket, roomId, guest?.id || null);

  // Socket Connection setup
  useEffect(() => {
    if (!token || !guest) return;

    const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;
    const s = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    s.on('connect', () => {
      s.emit('room:join', { roomId });
    });

    s.on('room:state', (data) => {
      setRoomInfo(data.room);
      setIsLocked(data.room.isLocked);
      setParticipants(data.participants);
      setScreenSharerId(data.screenSharer);
      if (data.watchSession) setWatchSession(data.watchSession);

      const me = data.participants.find((p: Participant) => p.guestId === guest.id);
      if (me) setCurrentRole(me.role);
    });

    s.on('room:participant_joined', (p: Participant) => {
      setParticipants((prev) => {
        if (prev.some((x) => x.guestId === p.guestId)) return prev;
        return [...prev, p];
      });
    });

    s.on('room:participant_left', ({ guestId }: { guestId: string }) => {
      setParticipants((prev) => prev.filter((p) => p.guestId !== guestId));
      setScreenSharerId((prev) => (prev === guestId ? null : prev));
    });

    s.on('room:error', ({ message }: { message: string }) => {
      console.warn('Room error:', message);
    });

    s.on('room:kicked', ({ message }: { message: string }) => {
      setKickedMessage(message || 'You were removed from the room by the host.');
    });

    s.on('room:force_mute', () => {
      if (isMicOn) toggleMic();
    });

    s.on('room:lock_state', ({ isLocked }: { isLocked: boolean }) => {
      setIsLocked(isLocked);
    });

    s.on('room:ended', ({ message }: { message: string }) => {
      setRoomEndedMessage(message || 'The host has ended this room.');
    });

    // Chat Events
    s.on('chat:message', (newMsg: Message) => {
      setMessages((prev) => [...prev, newMsg]);
      setIsChatOpen((open) => {
        if (!open) setUnreadCount((c) => c + 1);
        return open;
      });
    });

    s.on('chat:reaction', ({ messageId, guestId, emoji, action }) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const currentReactions = m.reactions || [];
          const existing = currentReactions.find((r) => r.emoji === emoji);

          let updated;
          if (action === 'added') {
            if (existing) {
              updated = currentReactions.map((r) =>
                r.emoji === emoji ? { ...r, count: r.count + 1, users: [...r.users, guestId] } : r
              );
            } else {
              updated = [...currentReactions, { emoji, count: 1, users: [guestId] }];
            }
          } else {
            updated = currentReactions
              .map((r) =>
                r.emoji === emoji ? { ...r, count: r.count - 1, users: r.users.filter((u) => u !== guestId) } : r
              )
              .filter((r) => r.count > 0);
          }
          return { ...m, reactions: updated };
        })
      );
    });

    s.on('chat:typing', ({ displayName, isTyping }: { displayName: string; isTyping: boolean }) => {
      setTypingUsers((prev) => {
        if (isTyping) {
          if (!prev.includes(displayName)) return [...prev, displayName];
          return prev;
        } else {
          return prev.filter((n) => n !== displayName);
        }
      });
    });

    // Participant Media States
    s.on('participant:media_state', ({ guestId, mediaState }) => {
      setParticipants((prev) =>
        prev.map((p) => (p.guestId === guestId ? { ...p, mediaState: { ...p.mediaState, ...mediaState } } : p))
      );
    });

    s.on('participant:screen_share_state', ({ guestId, isSharing }) => {
      setScreenSharerId(isSharing ? guestId : null);
      setParticipants((prev) =>
        prev.map((p) =>
          p.guestId === guestId
            ? { ...p, mediaState: { ...p.mediaState, screenShareEnabled: isSharing } as any }
            : p
        )
      );
    });

    // Watch Together events
    s.on('watch:state', (state: WatchSession) => {
      setWatchSession(state);
    });

    s.on('watch:play', ({ currentTime, serverUpdatedAt }) => {
      setWatchSession((prev) =>
        prev ? { ...prev, playbackStatus: 'playing', playbackPosition: currentTime, serverUpdatedAt } : null
      );
    });

    s.on('watch:pause', ({ currentTime, serverUpdatedAt }) => {
      setWatchSession((prev) =>
        prev ? { ...prev, playbackStatus: 'paused', playbackPosition: currentTime, serverUpdatedAt } : null
      );
    });

    s.on('watch:seek', ({ currentTime, serverUpdatedAt }) => {
      setWatchSession((prev) =>
        prev ? { ...prev, playbackPosition: currentTime, serverUpdatedAt } : null
      );
    });

    s.on('watch:stop', () => {
      setWatchSession(null);
    });

    setSocket(s);

    // Initial message fetch
    api.getMessages(roomId).then((res) => {
      setMessages(res.messages);
    }).catch(console.warn);

    return () => {
      s.emit('room:leave', { roomId });
      s.disconnect();
    };
  }, [roomId, token, guest]);

  // Chat Actions
  const handleSendMessage = (content: string, type = 'text', replyToId?: string) => {
    if (!socket) return;
    socket.emit('chat:message', {
      roomId,
      content,
      messageType: type,
      replyToMessageId: replyToId,
    });
  };

  const handleUploadFile = async (file: File, caption?: string) => {
    const res = await api.uploadFile(roomId, file, caption);
    if (socket) {
      socket.emit('chat:message', {
        roomId,
        content: res.message.content,
        messageType: res.message.message_type,
      });
    }
    setMessages((prev) => [...prev, res.message]);
  };

  const handleEditMessage = async (messageId: string, content: string) => {
    await api.editMessage(messageId, content);
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, content } : m)));
  };

  const handleDeleteMessage = async (messageId: string) => {
    await api.deleteMessage(messageId);
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, content: '[Message deleted]', deleted_at: new Date().toISOString() } : m))
    );
  };

  const handleToggleReaction = (messageId: string, emoji: string) => {
    if (socket) {
      socket.emit('chat:reaction', { roomId, messageId, emoji });
    }
  };

  const handleTyping = (isTyping: boolean) => {
    if (socket) {
      socket.emit('chat:typing', { roomId, isTyping });
    }
  };

  // Moderation
  const handleToggleLock = () => {
    if (socket && currentRole === 'host') {
      socket.emit('room:moderation', { roomId, action: 'lock' });
    }
  };

  const handleKickParticipant = (targetGuestId: string) => {
    if (socket && currentRole === 'host') {
      socket.emit('room:moderation', { roomId, action: 'kick', targetGuestId });
    }
  };

  const handleMuteParticipant = (targetGuestId: string) => {
    if (socket && currentRole === 'host') {
      socket.emit('room:moderation', { roomId, action: 'mute', targetGuestId });
    }
  };

  const handleApproveWaiting = (targetGuestId: string, approve: boolean) => {
    if (socket && currentRole === 'host') {
      socket.emit('room:moderation', { roomId, action: approve ? 'approve' : 'kick', targetGuestId });
      setWaitingParticipants((prev) => prev.filter((p) => p.guestId !== targetGuestId));
    }
  };

  // Host End Room
  const handleEndRoom = () => {
    if (!window.confirm('Are you sure you want to end this room for all participants?')) return;
    if (socket && currentRole === 'host') {
      socket.emit('room:end', { roomId });
    }
  };

  // Watch Together actions
  const handleStartWatch = (mediaSource: string) => {
    if (socket) {
      socket.emit('watch:start', { roomId, mediaSource });
    }
  };

  const handleWatchPlay = (time: number) => {
    if (socket) socket.emit('watch:play', { roomId, currentTime: time });
  };

  const handleWatchPause = (time: number) => {
    if (socket) socket.emit('watch:pause', { roomId, currentTime: time });
  };

  const handleWatchSeek = (time: number) => {
    if (socket) socket.emit('watch:seek', { roomId, currentTime: time });
  };

  const handleStopWatch = () => {
    if (socket) socket.emit('watch:stop', { roomId });
  };

  const handleLeaveRoom = () => {
    cleanupWebRTC();
    api.leaveRoom(roomId).catch(() => {});
    onLeave();
  };

  // Special states: Room Ended or Kicked
  if (roomEndedMessage || kickedMessage) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-gray-950">
        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-8 max-w-md w-full text-center shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-4 border border-rose-500/30">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Room Session Ended</h2>
          <p className="text-sm text-gray-400 mb-6">{roomEndedMessage || kickedMessage}</p>
          <button
            onClick={onLeave}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-4rem)] overflow-hidden bg-gray-950 relative">
      {/* Top Room Banner Bar */}
      <div className="h-10 px-4 bg-gray-900/80 border-b border-gray-800/60 flex items-center justify-between text-xs text-gray-400 shrink-0 select-none">
        <div className="flex items-center gap-2 truncate">
          <span className="font-bold text-gray-200 truncate">{roomInfo?.name || 'Active Room'}</span>
          <span className="text-gray-600">•</span>
          <span className="font-mono text-gray-500">{roomId}</span>
          {isLocked && (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-semibold border border-amber-500/30">
              Locked
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Live
          </span>
        </div>
      </div>

      {/* Main Content Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Main Stage (Videos & Screen Share) */}
        <MainStage
          localStream={localStream}
          localScreenStream={localScreenStream}
          remoteStreams={remoteStreams}
          currentGuest={guest!}
          currentRole={currentRole}
          participants={participants}
          screenSharerGuestId={screenSharerId}
          watchSession={watchSession}
          onWatchPlay={handleWatchPlay}
          onWatchPause={handleWatchPause}
          onWatchSeek={handleWatchSeek}
          onStopWatch={handleStopWatch}
          localMediaState={{
            audioEnabled: isMicOn,
            videoEnabled: isCamOn,
            screenShareEnabled: isScreenSharing,
            isSpeaking,
          }}
        />

        {/* Collapsible Drawers */}
        {isChatOpen && (
          <ChatPanel
            messages={messages}
            currentGuest={guest!}
            onSendMessage={handleSendMessage}
            onUploadFile={handleUploadFile}
            onEditMessage={handleEditMessage}
            onDeleteMessage={handleDeleteMessage}
            onToggleReaction={handleToggleReaction}
            onTyping={handleTyping}
            typingUsers={typingUsers}
          />
        )}

        {isParticipantsOpen && (
          <ParticipantPanel
            participants={participants}
            waitingParticipants={waitingParticipants}
            currentGuestId={guest!.id}
            isHost={currentRole === 'host'}
            isLocked={isLocked}
            onToggleLock={handleToggleLock}
            onKick={handleKickParticipant}
            onMute={handleMuteParticipant}
            onApproveWaiting={handleApproveWaiting}
          />
        )}
      </div>

      {/* Bottom Control Bar */}
      <ControlBar
        isMicOn={isMicOn}
        isCamOn={isCamOn}
        isScreenSharing={isScreenSharing}
        isChatOpen={isChatOpen}
        isParticipantsOpen={isParticipantsOpen}
        unreadCount={unreadCount}
        participantCount={participants.length}
        isHost={currentRole === 'host'}
        onToggleMic={toggleMic}
        onToggleCam={toggleCam}
        onToggleScreenShare={isScreenSharing ? stopScreenShare : startScreenShare}
        onToggleChat={() => {
          setIsChatOpen((prev) => {
            if (!prev) setUnreadCount(0);
            return !prev;
          });
          setIsParticipantsOpen(false);
        }}
        onToggleParticipants={() => {
          setIsParticipantsOpen((prev) => !prev);
          setIsChatOpen(false);
        }}
        onOpenInvite={() => setIsInviteOpen(true)}
        onOpenWatchTogether={() => setIsWatchOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onLeaveRoom={handleLeaveRoom}
        onEndRoom={currentRole === 'host' ? handleEndRoom : undefined}
      />

      {/* Modals */}
      <InviteModal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        roomId={roomId}
        inviteToken={initialInviteToken}
        roomName={roomInfo?.name || 'ConnectRoom'}
      />

      <WatchTogetherModal
        isOpen={isWatchOpen}
        onClose={() => setIsWatchOpen(false)}
        onStartWatch={handleStartWatch}
      />

      <DeviceSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
};
