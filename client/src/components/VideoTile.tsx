import React, { useEffect, useRef } from 'react';
import { MicOff, Shield, Monitor } from 'lucide-react';
import type { ParticipantMediaState } from '../types';

interface VideoTileProps {
  stream?: MediaStream | null;
  displayName: string;
  avatarUrl: string;
  isLocal?: boolean;
  role?: 'host' | 'moderator' | 'participant';
  mediaState?: ParticipantMediaState;
  isScreenShare?: boolean;
}

export const VideoTile: React.FC<VideoTileProps> = ({
  stream,
  displayName,
  avatarUrl,
  isLocal = false,
  role = 'participant',
  mediaState,
  isScreenShare = false,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  const hasVideoTrack = Boolean(
    stream && stream.getVideoTracks().length > 0 && stream.getVideoTracks()[0].enabled
  );

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const isSpeaking = mediaState?.isSpeaking || false;
  const isMicMuted = mediaState ? !mediaState.audioEnabled : false;

  return (
    <div
      className={`relative w-full h-full min-h-[160px] bg-gray-950/90 rounded-2xl overflow-hidden border transition-all flex items-center justify-center select-none ${
        isSpeaking
          ? 'border-emerald-500 shadow-lg shadow-emerald-500/20 ring-2 ring-emerald-500/40'
          : 'border-gray-800 hover:border-gray-700'
      }`}
    >
      {/* Video Element */}
      {hasVideoTrack ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={`w-full h-full object-cover ${isLocal && !isScreenShare ? '-scale-x-100' : ''}`}
        />
      ) : (
        /* Avatar Fallback */
        <div className="flex flex-col items-center justify-center p-4">
          <div
            className={`w-20 h-20 rounded-full overflow-hidden bg-gray-800 border-2 transition-transform ${
              isSpeaking ? 'border-emerald-400 scale-105 shadow-xl shadow-emerald-500/30' : 'border-gray-700'
            }`}
          >
            <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
          </div>
          <span className="mt-3 text-sm font-semibold text-gray-200">{displayName}</span>
        </div>
      )}

      {/* Top Indicators */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10">
        {role === 'host' && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold uppercase tracking-wider">
            <Shield className="w-3 h-3" />
            Host
          </span>
        )}
        {isScreenShare && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold uppercase tracking-wider">
            <Monitor className="w-3 h-3" />
            Screen
          </span>
        )}
      </div>

      {/* Top Right Mic Status */}
      {isMicMuted && (
        <div className="absolute top-3 right-3 p-1.5 rounded-lg bg-rose-500/80 text-white z-10 shadow-md">
          <MicOff className="w-3.5 h-3.5" />
        </div>
      )}

      {/* Bottom Name Pill */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between z-10 pointer-events-none">
        <span className="px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-white text-xs font-medium truncate max-w-[85%] border border-white/10">
          {displayName} {isLocal && '(You)'}
        </span>
      </div>
    </div>
  );
};
