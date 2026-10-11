import React, { useState } from 'react';
import { Film, X, Play } from 'lucide-react';

interface WatchTogetherModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartWatch: (mediaUrl: string) => void;
}

const DEMO_VIDEOS = [
  {
    title: 'Big Buck Bunny (Animation Demo)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  },
  {
    title: 'For Bigger Blazes (HD Sample)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  },
  {
    title: 'Tears of Steel (Sci-Fi Demo)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
  },
];

export const WatchTogetherModal: React.FC<WatchTogetherModalProps> = ({
  isOpen,
  onClose,
  onStartWatch,
}) => {
  const [videoUrl, setVideoUrl] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoUrl.trim()) return;
    onStartWatch(videoUrl.trim());
    onClose();
  };

  const handleSelectDemo = (url: string) => {
    onStartWatch(url);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-4 border-b border-gray-800">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Film className="w-5 h-5 text-purple-400" />
              Watch Together Mode
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">Synchronized video playback for all participants</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Video Direct URL (MP4 / WebM)
            </label>
            <input
              type="url"
              required
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://example.com/video.mp4"
              className="w-full bg-gray-800 border border-gray-700 focus:border-purple-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={!videoUrl.trim()}
            className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30 disabled:opacity-50 transition-all"
          >
            <Play className="w-4 h-4 fill-white" />
            Start Synchronized Session
          </button>
        </form>

        {/* Demo Samples */}
        <div className="pt-2 border-t border-gray-800">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-2">
            Or test with a sample video:
          </span>
          <div className="space-y-1.5">
            {DEMO_VIDEOS.map((demo) => (
              <button
                key={demo.url}
                onClick={() => handleSelectDemo(demo.url)}
                className="w-full p-2.5 rounded-xl bg-gray-800/60 hover:bg-gray-800 border border-gray-700/50 text-left text-xs text-gray-200 hover:text-purple-300 flex items-center justify-between transition-colors group"
              >
                <span>{demo.title}</span>
                <Play className="w-3.5 h-3.5 text-gray-500 group-hover:text-purple-400 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
