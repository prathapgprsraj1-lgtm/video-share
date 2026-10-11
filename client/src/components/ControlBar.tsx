import React from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  PhoneOff,
  MessageSquare,
  Users,
  Settings,
  UserPlus,
  Film,
  Power,
} from 'lucide-react';

interface ControlBarProps {
  isMicOn: boolean;
  isCamOn: boolean;
  isScreenSharing: boolean;
  isChatOpen: boolean;
  isParticipantsOpen: boolean;
  unreadCount: number;
  participantCount: number;
  isHost: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleScreenShare: () => void;
  onToggleChat: () => void;
  onToggleParticipants: () => void;
  onOpenInvite: () => void;
  onOpenWatchTogether: () => void;
  onOpenSettings: () => void;
  onLeaveRoom: () => void;
  onEndRoom?: () => void;
}

export const ControlBar: React.FC<ControlBarProps> = ({
  isMicOn,
  isCamOn,
  isScreenSharing,
  isChatOpen,
  isParticipantsOpen,
  unreadCount,
  participantCount,
  isHost,
  onToggleMic,
  onToggleCam,
  onToggleScreenShare,
  onToggleChat,
  onToggleParticipants,
  onOpenInvite,
  onOpenWatchTogether,
  onOpenSettings,
  onLeaveRoom,
  onEndRoom,
}) => {
  return (
    <div className="h-20 bg-gray-900/95 border-t border-gray-800/80 px-4 sm:px-8 flex items-center justify-between shrink-0 select-none backdrop-blur-md z-20">
      {/* Left section: Room Shortcuts */}
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenInvite}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gray-800/80 hover:bg-gray-800 text-gray-200 border border-gray-700/60 transition-colors text-xs font-semibold shadow-sm"
          title="Invite Link & QR Code"
        >
          <UserPlus className="w-4 h-4 text-indigo-400" />
          <span className="hidden sm:inline">Invite</span>
        </button>

        <button
          onClick={onOpenWatchTogether}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-purple-600/15 hover:bg-purple-600/25 text-purple-300 border border-purple-500/30 transition-colors text-xs font-semibold shadow-sm"
          title="Watch Videos Together"
        >
          <Film className="w-4 h-4 text-purple-400" />
          <span className="hidden sm:inline">Watch Together</span>
        </button>
      </div>

      {/* Center: Core Audio/Video/Screen Media Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Mic Toggle */}
        <button
          onClick={onToggleMic}
          title={isMicOn ? 'Mute Microphone' : 'Unmute Microphone'}
          className={`p-3 sm:px-4 rounded-2xl flex items-center gap-2 font-semibold text-xs transition-all shadow-md ${
            isMicOn
              ? 'bg-gray-800 text-emerald-400 border border-gray-700 hover:bg-gray-750'
              : 'bg-rose-600/90 hover:bg-rose-600 text-white shadow-rose-600/20'
          }`}
        >
          {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          <span className="hidden md:inline">{isMicOn ? 'Mute' : 'Unmute'}</span>
        </button>

        {/* Cam Toggle */}
        <button
          onClick={onToggleCam}
          title={isCamOn ? 'Turn Camera Off' : 'Turn Camera On'}
          className={`p-3 sm:px-4 rounded-2xl flex items-center gap-2 font-semibold text-xs transition-all shadow-md ${
            isCamOn
              ? 'bg-gray-800 text-emerald-400 border border-gray-700 hover:bg-gray-750'
              : 'bg-rose-600/90 hover:bg-rose-600 text-white shadow-rose-600/20'
          }`}
        >
          {isCamOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          <span className="hidden md:inline">{isCamOn ? 'Stop Video' : 'Start Video'}</span>
        </button>

        {/* Screen Share Toggle */}
        <button
          onClick={onToggleScreenShare}
          title={isScreenSharing ? 'Stop Screen Sharing' : 'Share Screen'}
          className={`p-3 sm:px-4 rounded-2xl flex items-center gap-2 font-semibold text-xs transition-all shadow-md ${
            isScreenSharing
              ? 'bg-indigo-600 hover:bg-indigo-500 text-white ring-2 ring-indigo-400/50'
              : 'bg-gray-800 hover:bg-gray-750 text-gray-300 border border-gray-700'
          }`}
        >
          <Monitor className="w-5 h-5" />
          <span className="hidden md:inline">{isScreenSharing ? 'Stop Presenting' : 'Share Screen'}</span>
        </button>

        {/* Device Settings */}
        <button
          onClick={onOpenSettings}
          title="Device Settings"
          className="p-3 rounded-2xl bg-gray-800/80 hover:bg-gray-750 text-gray-400 hover:text-white border border-gray-700 transition-colors"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* Right: Panels & Leave/End actions */}
      <div className="flex items-center gap-2">
        {/* Chat Drawer Toggle */}
        <button
          onClick={onToggleChat}
          title="Toggle Chat"
          className={`relative p-3 rounded-2xl border transition-colors ${
            isChatOpen
              ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30'
              : 'bg-gray-800/80 text-gray-400 hover:text-white border-gray-700 hover:bg-gray-750'
          }`}
        >
          <MessageSquare className="w-5 h-5" />
          {unreadCount > 0 && !isChatOpen && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-bounce">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Participants Drawer Toggle */}
        <button
          onClick={onToggleParticipants}
          title="Toggle Participants"
          className={`relative p-3 rounded-2xl border transition-colors ${
            isParticipantsOpen
              ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30'
              : 'bg-gray-800/80 text-gray-400 hover:text-white border-gray-700 hover:bg-gray-750'
          }`}
        >
          <Users className="w-5 h-5" />
          <span className="absolute -top-1 -right-1 px-1.5 py-0.2 bg-gray-700 text-gray-200 text-[10px] font-bold rounded-full border border-gray-600">
            {participantCount}
          </span>
        </button>

        {/* Leave Room */}
        <button
          onClick={onLeaveRoom}
          title="Leave Room"
          className="px-3.5 py-2.5 rounded-2xl bg-rose-600/15 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 flex items-center gap-1.5 text-xs font-semibold transition-colors"
        >
          <PhoneOff className="w-4 h-4 text-rose-400" />
          <span className="hidden sm:inline">Leave</span>
        </button>

        {/* Host: End Room for Everyone */}
        {isHost && onEndRoom && (
          <button
            onClick={onEndRoom}
            title="End room for all participants"
            className="p-2.5 rounded-2xl bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold transition-all shadow-md shadow-rose-700/30"
          >
            <Power className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
