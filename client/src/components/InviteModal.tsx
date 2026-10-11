import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, Share2, X, Link, QrCode } from 'lucide-react';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  inviteToken?: string;
  roomName: string;
}

export const InviteModal: React.FC<InviteModalProps> = ({
  isOpen,
  onClose,
  roomId,
  inviteToken,
  roomName,
}) => {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  if (!isOpen) return null;

  const origin = window.location.origin;
  const inviteUrl = inviteToken
    ? `${origin}/invite/${inviteToken}`
    : `${origin}/room/${roomId}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${roomName} on ConnectRoom`,
          text: `Join our instant anonymous room: ${roomName}`,
          url: inviteUrl,
        });
      } catch (e) {
        // user cancelled
      }
    } else {
      handleCopy();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-4 border-b border-gray-800">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Link className="w-5 h-5 text-indigo-400" />
              Invite Participants
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">{roomName}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="py-5 space-y-4">
          {/* Invite URL Input Box */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Invitation Link
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={inviteUrl}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3.5 py-2 text-xs text-gray-200 outline-none select-all"
              />
              <button
                onClick={handleCopy}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-1.5 shrink-0 transition-colors shadow-md shadow-indigo-600/30"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Room ID Badge */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-gray-800/60 border border-gray-800 text-xs">
            <span className="text-gray-400">Direct Room ID:</span>
            <span className="font-mono font-bold text-indigo-300">{roomId}</span>
          </div>

          {/* QR Code toggle */}
          {showQr ? (
            <div className="flex flex-col items-center justify-center p-4 bg-white rounded-xl">
              <QRCodeSVG value={inviteUrl} size={180} />
              <span className="text-gray-800 text-xs font-medium mt-2">Scan with camera to join</span>
            </div>
          ) : null}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => setShowQr(!showQr)}
              className="flex-1 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-750 text-gray-300 border border-gray-700/60 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <QrCode className="w-4 h-4 text-gray-400" />
              {showQr ? 'Hide QR Code' : 'Show QR Code'}
            </button>

            {typeof navigator.share === 'function' && (
              <button
                onClick={handleNativeShare}
                className="flex-1 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-750 text-gray-300 border border-gray-700/60 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <Share2 className="w-4 h-4 text-indigo-400" />
                Native Share
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
