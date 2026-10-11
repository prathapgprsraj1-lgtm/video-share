import React, { useState } from 'react';
import { useGuest } from '../context/GuestContext';
import { Sparkles, User, Settings, Check } from 'lucide-react';

interface NavbarProps {
  onOpenSettings?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenSettings }) => {
  const { guest, updateProfile } = useGuest();
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleOpenEdit = () => {
    if (guest) setDisplayName(guest.displayName);
    setIsEditingProfile(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    setIsSaving(true);
    try {
      await updateProfile(displayName.trim());
      setIsEditingProfile(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <header className="h-16 border-b border-gray-800/80 bg-gray-900/90 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white font-bold text-xl">
            <Sparkles className="w-5 h-5 text-indigo-100" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-tight text-white">ConnectRoom</span>
              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Anonymous
              </span>
            </div>
            <p className="text-xs text-gray-400 hidden sm:block">No sign-in • End-to-end real-time communication</p>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-3">
          {/* Guest Identity Pill */}
          {guest && (
            <button
              onClick={handleOpenEdit}
              title="Click to change your display name"
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-gray-800/80 border border-gray-700/60 hover:border-indigo-500/50 hover:bg-gray-800 transition-all text-sm group"
            >
              <img
                src={guest.avatarUrl}
                alt={guest.displayName}
                className="w-6 h-6 rounded-full bg-gray-700 object-cover"
              />
              <span className="font-medium text-gray-200 group-hover:text-indigo-300 transition-colors">
                {guest.displayName}
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </button>
          )}

          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="p-2 rounded-xl bg-gray-800/60 text-gray-400 hover:text-white hover:bg-gray-800 border border-gray-700/40 transition-colors"
              title="Device Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>

      {/* Edit Profile Modal */}
      {isEditingProfile && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
              <User className="w-5 h-5 text-indigo-400" />
              Edit Anonymous Identity
            </h3>
            <p className="text-sm text-gray-400 mb-5">
              Change your display name at any time. No email, password, or sign-up needed.
            </p>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={32}
                  className="w-full bg-gray-800 border border-gray-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 outline-none text-sm"
                  placeholder="e.g. Alex"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsEditingProfile(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !displayName.trim()}
                  className="px-5 py-2 rounded-xl text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all"
                >
                  <Check className="w-4 h-4" />
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
