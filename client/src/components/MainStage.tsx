import React, { useRef, useEffect } from 'react';
import { VideoTile } from './VideoTile';
import { Monitor, X } from 'lucide-react';
import type { Participant, WatchSession } from '../types';

interface MainStageProps {
  localStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  currentGuest: { id: string; displayName: string; avatarUrl: string };
  currentRole: 'host' | 'moderator' | 'participant';
  participants: Participant[];
  screenSharerGuestId: string | null;
  watchSession: WatchSession | null;
  onWatchPlay?: (time: number) => void;
  onWatchPause?: (time: number) => void;
  onWatchSeek?: (time: number) => void;
  onStopWatch?: () => void;
  localMediaState: { audioEnabled: boolean; videoEnabled: boolean; screenShareEnabled: boolean; isSpeaking: boolean };
}

export const MainStage: React.FC<MainStageProps> = ({
  localStream,
  localScreenStream,
  remoteStreams,
  currentGuest,
  currentRole,
  participants,
  screenSharerGuestId,
  watchSession,
  onWatchPlay,
  onWatchPause,
  onWatchSeek,
  onStopWatch,
  localMediaState,
}) => {
  const watchVideoRef = useRef<HTMLVideoElement>(null);
  const isSyncingRef = useRef(false);

  // Synchronized Watch Together player logic
  useEffect(() => {
    if (!watchVideoRef.current || !watchSession) return;
    const video = watchVideoRef.current;

    isSyncingRef.current = true;

    // Check drift
    if (Math.abs(video.currentTime - watchSession.playbackPosition) > 1.5) {
      video.currentTime = watchSession.playbackPosition;
    }

    if (watchSession.playbackStatus === 'playing') {
      video.play().catch(() => {});
    } else {
      video.pause();
    }

    const t = setTimeout(() => {
      isSyncingRef.current = false;
    }, 400);

    return () => clearTimeout(t);
  }, [watchSession]);

  const handleVideoPlay = () => {
    if (isSyncingRef.current || !watchVideoRef.current) return;
    onWatchPlay?.(watchVideoRef.current.currentTime);
  };

  const handleVideoPause = () => {
    if (isSyncingRef.current || !watchVideoRef.current) return;
    onWatchPause?.(watchVideoRef.current.currentTime);
  };

  const handleVideoSeeked = () => {
    if (isSyncingRef.current || !watchVideoRef.current) return;
    onWatchSeek?.(watchVideoRef.current.currentTime);
  };

  // Check if screen sharing is active
  const isLocalScreenSharing = Boolean(localScreenStream);
  const activeScreenStream = isLocalScreenSharing
    ? localScreenStream
    : screenSharerGuestId
    ? remoteStreams[screenSharerGuestId]
    : null;

  const presenter = participants.find((p) => p.guestId === screenSharerGuestId);
  const presenterName = isLocalScreenSharing ? 'You' : presenter?.displayName || 'Participant';

  // Screen Share Theater Mode
  if (activeScreenStream) {
    return (
      <div className="flex-1 flex flex-col p-3 sm:p-4 gap-3 overflow-hidden bg-gray-950">
        {/* Main Theater Display */}
        <div className="flex-1 relative rounded-2xl overflow-hidden bg-black border border-indigo-500/30 flex items-center justify-center shadow-2xl">
          <video
            autoPlay
            playsInline
            muted={isLocalScreenSharing}
            ref={(el) => {
              if (el && activeScreenStream) el.srcObject = activeScreenStream;
            }}
            className="w-full h-full object-contain"
          />
          <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/70 backdrop-blur-md border border-white/10 text-white text-xs font-semibold">
            <Monitor className="w-4 h-4 text-indigo-400" />
            <span>{presenterName} is sharing their screen</span>
          </div>
        </div>

        {/* Bottom participant strip */}
        <div className="h-28 sm:h-32 flex items-center gap-3 overflow-x-auto py-1 shrink-0">
          {/* Local participant */}
          <div className="w-44 h-full shrink-0">
            <VideoTile
              stream={localStream}
              displayName={currentGuest.displayName}
              avatarUrl={currentGuest.avatarUrl}
              isLocal
              role={currentRole}
              mediaState={localMediaState}
            />
          </div>

          {/* Remote participants */}
          {participants
            .filter((p) => p.guestId !== currentGuest.id)
            .map((p) => (
              <div key={p.guestId} className="w-44 h-full shrink-0">
                <VideoTile
                  stream={remoteStreams[p.guestId]}
                  displayName={p.displayName}
                  avatarUrl={p.avatarUrl}
                  role={p.role}
                  mediaState={p.mediaState}
                />
              </div>
            ))}
        </div>
      </div>
    );
  }

  // Watch Together Theater Mode
  if (watchSession) {
    return (
      <div className="flex-1 flex flex-col p-3 sm:p-4 gap-3 overflow-hidden bg-gray-950">
        <div className="flex-1 relative rounded-2xl overflow-hidden bg-black border border-purple-500/30 flex items-center justify-center shadow-2xl group">
          <video
            ref={watchVideoRef}
            src={watchSession.mediaSource}
            controls
            onPlay={handleVideoPlay}
            onPause={handleVideoPause}
            onSeeked={handleVideoSeeked}
            className="w-full h-full object-contain"
          />
          {currentRole === 'host' && onStopWatch && (
            <button
              onClick={onStopWatch}
              className="absolute top-4 right-4 p-2 rounded-xl bg-black/70 hover:bg-rose-600 text-white border border-white/15 transition-colors z-20 flex items-center gap-1.5 text-xs font-semibold"
              title="Stop Watch Together for everyone"
            >
              <X className="w-4 h-4" />
              End Session
            </button>
          )}
        </div>

        {/* Bottom participant strip */}
        <div className="h-28 sm:h-32 flex items-center gap-3 overflow-x-auto py-1 shrink-0">
          <div className="w-44 h-full shrink-0">
            <VideoTile
              stream={localStream}
              displayName={currentGuest.displayName}
              avatarUrl={currentGuest.avatarUrl}
              isLocal
              role={currentRole}
              mediaState={localMediaState}
            />
          </div>
          {participants
            .filter((p) => p.guestId !== currentGuest.id)
            .map((p) => (
              <div key={p.guestId} className="w-44 h-full shrink-0">
                <VideoTile
                  stream={remoteStreams[p.guestId]}
                  displayName={p.displayName}
                  avatarUrl={p.avatarUrl}
                  role={p.role}
                  mediaState={p.mediaState}
                />
              </div>
            ))}
        </div>
      </div>
    );
  }

  // Standard Video Grid
  const totalTiles = 1 + participants.filter((p) => p.guestId !== currentGuest.id).length;
  let gridCols = 'grid-cols-1';
  if (totalTiles === 2) gridCols = 'grid-cols-1 sm:grid-cols-2';
  else if (totalTiles <= 4) gridCols = 'grid-cols-2';
  else if (totalTiles <= 9) gridCols = 'grid-cols-2 sm:grid-cols-3';
  else gridCols = 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4';

  return (
    <div className="flex-1 p-3 sm:p-5 overflow-y-auto bg-gray-950 flex items-center justify-center">
      <div className={`grid ${gridCols} gap-3 sm:gap-4 w-full h-full max-h-full auto-rows-fr`}>
        {/* Local user tile */}
        <VideoTile
          stream={localStream}
          displayName={currentGuest.displayName}
          avatarUrl={currentGuest.avatarUrl}
          isLocal
          role={currentRole}
          mediaState={localMediaState}
        />

        {/* Remote participant tiles */}
        {participants
          .filter((p) => p.guestId !== currentGuest.id)
          .map((p) => (
            <VideoTile
              key={p.guestId}
              stream={remoteStreams[p.guestId]}
              displayName={p.displayName}
              avatarUrl={p.avatarUrl}
              role={p.role}
              mediaState={p.mediaState}
            />
          ))}
      </div>
    </div>
  );
};
