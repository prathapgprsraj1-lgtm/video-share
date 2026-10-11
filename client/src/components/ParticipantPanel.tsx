import React from 'react';
import type { Participant } from '../types';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  UserX,
  VolumeX,
  Check,
  X,
  Lock,
  Unlock,
} from 'lucide-react';

interface ParticipantPanelProps {
  participants: Participant[];
  waitingParticipants?: Participant[];
  currentGuestId: string;
  isHost: boolean;
  isLocked: boolean;
  onToggleLock?: () => void;
  onKick?: (targetGuestId: string) => void;
  onMute?: (targetGuestId: string) => void;
  onApproveWaiting?: (targetGuestId: string, approve: boolean) => void;
}

export const ParticipantPanel: React.FC<ParticipantPanelProps> = ({
  participants,
  waitingParticipants = [],
  currentGuestId,
  isHost,
  isLocked,
  onToggleLock,
  onKick,
  onMute,
  onApproveWaiting,
}) => {
  return (
    <div className="flex flex-col h-full bg-gray-900 border-l border-gray-800 w-full sm:w-80 md:w-88 select-none">
      {/* Header */}
      <div className="h-14 px-4 border-b border-gray-800 flex items-center justify-between shrink-0">
        <h3 className="font-bold text-white text-sm flex items-center gap-2">
          Participants
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 font-medium">
            {participants.length}
          </span>
        </h3>

        {/* Host Lock Control */}
        {isHost && onToggleLock && (
          <button
            onClick={onToggleLock}
            title={isLocked ? 'Room is Locked (Click to Unlock)' : 'Room is Unlocked (Click to Lock)'}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border transition-colors ${
              isLocked
                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-white'
            }`}
          >
            {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            {isLocked ? 'Locked' : 'Unlocked'}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Waiting Room Section for Host */}
        {isHost && waitingParticipants.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>Waiting Room ({waitingParticipants.length})</span>
            </h4>
            <div className="space-y-1.5">
              {waitingParticipants.map((p) => (
                <div
                  key={p.guestId}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-gray-800/80 border border-amber-500/30"
                >
                  <div className="flex items-center gap-2">
                    <img src={p.avatarUrl} alt="" className="w-6 h-6 rounded-full" />
                    <span className="text-sm font-medium text-white">{p.displayName}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onApproveWaiting?.(p.guestId, true)}
                      title="Admit Guest"
                      className="p-1.5 rounded-lg bg-emerald-600/30 text-emerald-300 hover:bg-emerald-600 hover:text-white transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onApproveWaiting?.(p.guestId, false)}
                      title="Deny Access"
                      className="p-1.5 rounded-lg bg-rose-600/30 text-rose-300 hover:bg-rose-600 hover:text-white transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active Participants List */}
        <div className="space-y-2">
          <div className="space-y-1.5">
            {participants.map((p) => {
              const isMe = p.guestId === currentGuestId;
              const isParticipantSpeaking = p.mediaState?.isSpeaking;
              const isMicActive = p.mediaState?.audioEnabled;
              const isCamActive = p.mediaState?.videoEnabled;
              const isScreenActive = p.mediaState?.screenShareEnabled;

              return (
                <div
                  key={p.guestId}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-gray-800/40 hover:bg-gray-800/80 border border-gray-800 transition-colors group"
                >
                  {/* Left: Avatar & Name */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`relative w-8 h-8 rounded-full overflow-hidden bg-gray-700 shrink-0 ${
                        isParticipantSpeaking ? 'ring-2 ring-emerald-500' : ''
                      }`}
                    >
                      <img src={p.avatarUrl} alt="" className="w-full h-full object-cover" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-gray-200 truncate">
                          {p.displayName} {isMe && '(You)'}
                        </span>
                        {p.role === 'host' && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-bold uppercase shrink-0">
                            Host
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Media Indicators & Host Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Media icons */}
                    <div className="flex items-center gap-1 text-gray-400">
                      {isScreenActive && <Monitor className="w-3.5 h-3.5 text-indigo-400" />}
                      {isCamActive ? (
                        <Video className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <VideoOff className="w-3.5 h-3.5 text-gray-600" />
                      )}
                      {isMicActive ? (
                        <Mic className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <MicOff className="w-3.5 h-3.5 text-rose-500" />
                      )}
                    </div>

                    {/* Host Moderation Controls */}
                    {isHost && !isMe && (
                      <div className="hidden group-hover:flex items-center gap-1 pl-1 border-l border-gray-700">
                        {onMute && (
                          <button
                            onClick={() => onMute(p.guestId)}
                            title="Force Mute Participant"
                            className="p-1 rounded-lg text-gray-400 hover:text-amber-300 hover:bg-gray-700 transition-colors"
                          >
                            <VolumeX className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {onKick && (
                          <button
                            onClick={() => onKick(p.guestId)}
                            title="Remove Participant from Room"
                            className="p-1 rounded-lg text-gray-400 hover:text-rose-400 hover:bg-gray-700 transition-colors"
                          >
                            <UserX className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
