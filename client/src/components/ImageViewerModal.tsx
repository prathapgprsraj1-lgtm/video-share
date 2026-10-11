import React from 'react';
import { X, Download } from 'lucide-react';

interface ImageViewerModalProps {
  imageUrl: string | null;
  onClose: () => void;
}

export const ImageViewerModal: React.FC<ImageViewerModalProps> = ({ imageUrl, onClose }) => {
  if (!imageUrl) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10" onClick={(e) => e.stopPropagation()}>
        <a
          href={imageUrl}
          download="shared-image"
          target="_blank"
          rel="noreferrer"
          className="p-2 rounded-xl bg-gray-800/80 hover:bg-gray-700 text-white transition-colors flex items-center gap-1.5 text-xs font-semibold"
        >
          <Download className="w-4 h-4" />
          Download
        </a>
        <button
          onClick={onClose}
          className="p-2 rounded-xl bg-gray-800/80 hover:bg-gray-700 text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <img
        src={imageUrl}
        alt="Enlarged media"
        onClick={(e) => e.stopPropagation()}
        className="max-w-[90vw] max-h-[85vh] object-contain rounded-xl shadow-2xl"
      />
    </div>
  );
};
