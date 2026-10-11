import type { Server, Socket } from 'socket.io';
import { GuestSessionRepo, RoomRepo, RoomMemberRepo, MessageRepo, WatchSessionRepo } from '../db/index.js';
import type { GuestSession, ParticipantMediaState } from '../types.js';

// Map of roomId -> Map of guestId -> socketId
const roomSockets = new Map<string, Map<string, string>>();
// Map of roomId -> Map of guestId -> ParticipantMediaState
const roomMediaStates = new Map<string, Map<string, ParticipantMediaState>>();
// Active screen sharers per room: roomId -> guestId
const roomScreenSharers = new Map<string, string>();

export function setupSocketHandlers(io: Server) {
  // Socket authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers['authorization']?.replace('Bearer ', '');
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const session = GuestSessionRepo.findByToken(token);
    if (!session) {
      return next(new Error('Invalid guest session token'));
    }

    socket.data.guest = session;
    next();
  });

  io.on('connection', (socket: Socket) => {
    const guest = socket.data.guest as GuestSession;

    // Join a room
    socket.on('room:join', ({ roomId }) => {
      if (!roomId) return;

      const room = RoomRepo.findById(roomId);
      if (!room || room.status === 'ended') {
        socket.emit('room:error', { message: 'Room has ended or does not exist' });
        return;
      }

      // Check membership
      const member = RoomMemberRepo.find(roomId, guest.id);
      if (!member || member.membership_status !== 'active') {
        socket.emit('room:error', { message: 'Not an authorized active member' });
        return;
      }

      socket.join(roomId);

      // Track socket in room
      if (!roomSockets.has(roomId)) {
        roomSockets.set(roomId, new Map());
      }
      roomSockets.get(roomId)!.set(guest.id, socket.id);

      // Initialize media state
      if (!roomMediaStates.has(roomId)) {
        roomMediaStates.set(roomId, new Map());
      }
      const initialMediaState: ParticipantMediaState = {
        audioEnabled: false,
        videoEnabled: false,
        screenShareEnabled: false,
        isSpeaking: false,
      };
      roomMediaStates.get(roomId)!.set(guest.id, initialMediaState);

      // Gather current participants
      const activeMembers = RoomMemberRepo.getActiveMembers(roomId);
      const mediaStates: Record<string, ParticipantMediaState> = {};
      const statesMap = roomMediaStates.get(roomId)!;
      for (const [gId, st] of statesMap.entries()) {
        mediaStates[gId] = st;
      }

      const activeScreenSharer = roomScreenSharers.get(roomId) || null;
      const watchSession = WatchSessionRepo.get(roomId);

      // Send initial room snapshot to joining guest
      socket.emit('room:state', {
        room: {
          id: room.id,
          name: room.name,
          description: room.description,
          isLocked: Boolean(room.is_locked),
          waitingRoomEnabled: Boolean(room.waiting_room_enabled),
          ownerGuestId: room.owner_guest_id,
        },
        participants: activeMembers.map((m) => ({
          guestId: m.guest_id,
          displayName: m.display_name,
          avatarUrl: m.avatar_url,
          role: m.role,
          mediaState: statesMap.get(m.guest_id) || initialMediaState,
        })),
        screenSharer: activeScreenSharer,
        watchSession: watchSession
          ? {
              mediaSource: watchSession.media_source,
              playbackStatus: watchSession.playback_status,
              playbackPosition: watchSession.playback_position,
              serverUpdatedAt: watchSession.server_updated_at,
            }
          : null,
      });

      // Broadcast join to existing room members
      socket.to(roomId).emit('room:participant_joined', {
        guestId: guest.id,
        displayName: guest.display_name,
        avatarUrl: guest.avatar_url,
        role: member.role,
        mediaState: initialMediaState,
      });

      // Broadcast system message
      const sysMsg = {
        id: `sys_${Date.now()}`,
        room_id: roomId,
        sender_guest_id: 'system',
        message_type: 'system',
        content: `${guest.display_name} joined the room`,
        created_at: new Date().toISOString(),
        sender_name: 'System',
      };
      io.to(roomId).emit('chat:message', sysMsg);
    });

    // Leave a room
    socket.on('room:leave', ({ roomId }) => {
      if (!roomId) return;
      handleParticipantLeave(socket, roomId, guest);
    });

    // Chat Message
    socket.on('chat:message', ({ roomId, content, messageType = 'text', replyToMessageId }) => {
      if (!roomId || !content) return;

      const member = RoomMemberRepo.find(roomId, guest.id);
      if (!member || member.membership_status !== 'active') return;

      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const now = new Date().toISOString();

      const newMsg = {
        id: messageId,
        room_id: roomId,
        sender_guest_id: guest.id,
        message_type: messageType,
        content: content.trim(),
        reply_to_message_id: replyToMessageId || null,
        created_at: now,
        updated_at: null,
        deleted_at: null,
      };

      MessageRepo.create(newMsg as any);

      // Fetch reply info if applicable
      let reply_to = null;
      if (replyToMessageId) {
        const parent = MessageRepo.findById(replyToMessageId);
        if (parent) {
          const sender = GuestSessionRepo.findById(parent.sender_guest_id);
          reply_to = {
            id: parent.id,
            content: parent.content,
            sender_name: sender?.display_name || 'Guest',
          };
        }
      }

      const broadcastMsg = {
        ...newMsg,
        sender_name: guest.display_name,
        sender_avatar: guest.avatar_url,
        reply_to,
        reactions: [],
        attachments: [],
      };

      io.to(roomId).emit('chat:message', broadcastMsg);
    });

    // Typing status
    socket.on('chat:typing', ({ roomId, isTyping }) => {
      if (!roomId) return;
      socket.to(roomId).emit('chat:typing', {
        guestId: guest.id,
        displayName: guest.display_name,
        isTyping: Boolean(isTyping),
      });
    });

    // Emoji reaction
    socket.on('chat:reaction', ({ roomId, messageId, emoji }) => {
      if (!roomId || !messageId || !emoji) return;
      const res = MessageRepo.toggleReaction(messageId, guest.id, emoji);
      io.to(roomId).emit('chat:reaction', {
        messageId,
        guestId: guest.id,
        emoji,
        action: res.action,
      });
    });

    // Participant Media State (Mute/Unmute, Cam on/off, Speaking)
    socket.on('participant:media_state', ({ roomId, mediaState }) => {
      if (!roomId || !mediaState) return;

      const statesMap = roomMediaStates.get(roomId);
      if (statesMap) {
        const current = statesMap.get(guest.id) || {
          audioEnabled: false,
          videoEnabled: false,
          screenShareEnabled: false,
          isSpeaking: false,
        };
        const updated = { ...current, ...mediaState };
        statesMap.set(guest.id, updated);

        socket.to(roomId).emit('participant:media_state', {
          guestId: guest.id,
          mediaState: updated,
        });
      }
    });

    // Screen sharing status
    socket.on('participant:screen_share', ({ roomId, isSharing }) => {
      if (!roomId) return;
      if (isSharing) {
        roomScreenSharers.set(roomId, guest.id);
      } else {
        if (roomScreenSharers.get(roomId) === guest.id) {
          roomScreenSharers.delete(roomId);
        }
      }

      io.to(roomId).emit('participant:screen_share_state', {
        guestId: isSharing ? guest.id : null,
        displayName: isSharing ? guest.display_name : null,
        isSharing,
      });
    });

    // WebRTC Peer-to-Peer Mesh Signaling
    socket.on('signal:offer', ({ toGuestId, roomId, offer }) => {
      const targetSocketId = roomSockets.get(roomId)?.get(toGuestId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('signal:offer', {
          fromGuestId: guest.id,
          fromName: guest.display_name,
          offer,
        });
      }
    });

    socket.on('signal:answer', ({ toGuestId, roomId, answer }) => {
      const targetSocketId = roomSockets.get(roomId)?.get(toGuestId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('signal:answer', {
          fromGuestId: guest.id,
          answer,
        });
      }
    });

    socket.on('signal:ice', ({ toGuestId, roomId, candidate }) => {
      const targetSocketId = roomSockets.get(roomId)?.get(toGuestId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('signal:ice', {
          fromGuestId: guest.id,
          candidate,
        });
      }
    });

    // Host Moderation Actions
    socket.on('room:moderation', ({ roomId, action, targetGuestId }) => {
      if (!roomId || !action) return;

      const member = RoomMemberRepo.find(roomId, guest.id);
      if (!member || member.role !== 'host') return;

      if (action === 'kick' && targetGuestId) {
        RoomMemberRepo.updateStatus(roomId, targetGuestId, 'kicked');
        const targetSocketId = roomSockets.get(roomId)?.get(targetGuestId);
        if (targetSocketId) {
          io.to(targetSocketId).emit('room:kicked', { message: 'You have been removed from the room by the host.' });
        }
        io.to(roomId).emit('room:participant_left', { guestId: targetGuestId, reason: 'kicked' });
      } else if (action === 'mute' && targetGuestId) {
        const targetSocketId = roomSockets.get(roomId)?.get(targetGuestId);
        if (targetSocketId) {
          io.to(targetSocketId).emit('room:force_mute');
        }
      } else if (action === 'lock') {
        const room = RoomRepo.findById(roomId);
        if (room) {
          const newLocked = room.is_locked ? 0 : 1;
          RoomRepo.update(roomId, { is_locked: newLocked });
          io.to(roomId).emit('room:lock_state', { isLocked: Boolean(newLocked) });
        }
      } else if (action === 'approve' && targetGuestId) {
        RoomMemberRepo.updateStatus(roomId, targetGuestId, 'active');
        const targetSocketId = roomSockets.get(roomId)?.get(targetGuestId);
        if (targetSocketId) {
          io.to(targetSocketId).emit('room:approved');
        }
      }
    });

    // Host End Room
    socket.on('room:end', ({ roomId }) => {
      if (!roomId) return;
      const member = RoomMemberRepo.find(roomId, guest.id);
      if (!member || member.role !== 'host') return;

      RoomRepo.end(roomId);
      io.to(roomId).emit('room:ended', { message: 'The host has ended this room session.' });
      roomSockets.delete(roomId);
      roomMediaStates.delete(roomId);
      roomScreenSharers.delete(roomId);
    });

    // Watch Together Mode
    socket.on('watch:start', ({ roomId, mediaSource }) => {
      if (!roomId || !mediaSource) return;
      const now = new Date().toISOString();
      WatchSessionRepo.upsert({
        id: `watch_${Date.now()}`,
        room_id: roomId,
        host_guest_id: guest.id,
        media_source: mediaSource,
        playback_status: 'playing',
        playback_position: 0,
        server_updated_at: now,
        created_at: now,
        ended_at: null,
      });

      io.to(roomId).emit('watch:state', {
        mediaSource,
        playbackStatus: 'playing',
        playbackPosition: 0,
        hostId: guest.id,
        serverUpdatedAt: now,
      });
    });

    socket.on('watch:play', ({ roomId, currentTime }) => {
      if (!roomId) return;
      const now = new Date().toISOString();
      const session = WatchSessionRepo.get(roomId);
      if (session) {
        WatchSessionRepo.upsert({
          ...session,
          playback_status: 'playing',
          playback_position: currentTime || 0,
          server_updated_at: now,
        });
      }
      socket.to(roomId).emit('watch:play', { currentTime, serverUpdatedAt: now });
    });

    socket.on('watch:pause', ({ roomId, currentTime }) => {
      if (!roomId) return;
      const now = new Date().toISOString();
      const session = WatchSessionRepo.get(roomId);
      if (session) {
        WatchSessionRepo.upsert({
          ...session,
          playback_status: 'paused',
          playback_position: currentTime || 0,
          server_updated_at: now,
        });
      }
      socket.to(roomId).emit('watch:pause', { currentTime, serverUpdatedAt: now });
    });

    socket.on('watch:seek', ({ roomId, currentTime }) => {
      if (!roomId) return;
      const now = new Date().toISOString();
      const session = WatchSessionRepo.get(roomId);
      if (session) {
        WatchSessionRepo.upsert({
          ...session,
          playback_position: currentTime || 0,
          server_updated_at: now,
        });
      }
      socket.to(roomId).emit('watch:seek', { currentTime, serverUpdatedAt: now });
    });

    socket.on('watch:stop', ({ roomId }) => {
      if (!roomId) return;
      WatchSessionRepo.end(roomId);
      io.to(roomId).emit('watch:stop');
    });

    // Disconnect handler
    socket.on('disconnect', () => {
      for (const [roomId, socketsMap] of roomSockets.entries()) {
        if (socketsMap.get(guest.id) === socket.id) {
          handleParticipantLeave(socket, roomId, guest);
        }
      }
    });
  });
}

function handleParticipantLeave(socket: Socket, roomId: string, guest: GuestSession) {
  socket.leave(roomId);
  const socketsMap = roomSockets.get(roomId);
  if (socketsMap) {
    socketsMap.delete(guest.id);
  }

  const statesMap = roomMediaStates.get(roomId);
  if (statesMap) {
    statesMap.delete(guest.id);
  }

  if (roomScreenSharers.get(roomId) === guest.id) {
    roomScreenSharers.delete(roomId);
    socket.to(roomId).emit('participant:screen_share_state', {
      guestId: null,
      displayName: null,
      isSharing: false,
    });
  }

  RoomMemberRepo.updateStatus(roomId, guest.id, 'left');

  socket.to(roomId).emit('room:participant_left', {
    guestId: guest.id,
    displayName: guest.display_name,
  });

  const sysMsg = {
    id: `sys_${Date.now()}`,
    room_id: roomId,
    sender_guest_id: 'system',
    message_type: 'system',
    content: `${guest.display_name} left the room`,
    created_at: new Date().toISOString(),
    sender_name: 'System',
  };
  socket.to(roomId).emit('chat:message', sysMsg);
}
