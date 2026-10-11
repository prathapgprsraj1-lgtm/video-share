import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import {
  Plus,
  LogIn,
  Shield,
  Video,
  Users,
  Lock,
  ArrowRight,
  Clock,
  Sparkles,
} from 'lucide-react';

interface DashboardProps {
  onEnterRoom: (roomId: string, inviteToken?: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onEnterRoom }) => {
  // Create Room state
  const [roomName, setRoomName] = useState('');
  const [description, setDescription] = useState('');
  const [password, setPassword] = useState('');
  const [waitingRoom, setWaitingRoom] = useState(false);
  const [maxParticipants, setMaxParticipants] = useState(25);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Join Room state
  const [joinInput, setJoinInput] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);

  // Recent Rooms
  const [recentRooms, setRecentRooms] = useState<Array<{ id: string; name: string; timestamp: number }>>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('connectroom_recent');
      if (stored) {
        setRecentRooms(JSON.parse(stored));
      }
    } catch (e) {
      console.warn(e);
    }
  }, []);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomName.trim()) return;

    setIsCreating(true);
    setCreateError(null);

    try {
      const res = await api.createRoom({
        name: roomName.trim(),
        description: description.trim() || undefined,
        password: password.trim() || undefined,
        waitingRoom,
        maxParticipants,
      });

      // Save to recent
      const updated = [{ id: res.room.id, name: res.room.name, timestamp: Date.now() }, ...recentRooms.filter((r) => r.id !== res.room.id)].slice(0, 5);
      localStorage.setItem('connectroom_recent', JSON.stringify(updated));

      onEnterRoom(res.room.id, res.inviteToken);
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create room');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = joinInput.trim();
    if (!raw) return;

    setIsJoining(true);
    setJoinError(null);

    try {
      // Check if user pasted full invite URL e.g. http://localhost:5173/invite/abc or room/room-xxx
      let targetRoomId = raw;
      let targetInviteToken: string | undefined = undefined;

      if (raw.includes('/invite/')) {
        const token = raw.split('/invite/')[1].split('?')[0].split('/')[0];
        const valRes = await api.validateInvitation(token);
        targetRoomId = valRes.roomId;
        targetInviteToken = token;
      } else if (raw.includes('/room/')) {
        targetRoomId = raw.split('/room/')[1].split('?')[0].split('/')[0];
      }

      const res = await api.joinRoom(targetRoomId, {
        password: joinPassword || undefined,
        inviteToken: targetInviteToken,
      });

      // Save to recent
      const updated = [{ id: targetRoomId, name: res.room.name, timestamp: Date.now() }, ...recentRooms.filter((r) => r.id !== targetRoomId)].slice(0, 5);
      localStorage.setItem('connectroom_recent', JSON.stringify(updated));

      onEnterRoom(targetRoomId, targetInviteToken);
    } catch (err: any) {
      if (err.message && err.message.toLowerCase().includes('password')) {
        setNeedsPassword(true);
      }
      setJoinError(err.message || 'Could not join room');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      {/* Hero Header */}
      <div className="text-center max-w-3xl mx-auto mb-12">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-4">
          <Sparkles className="w-3.5 h-3.5" />
          No signup • Instant Anonymous Rooms • Full Media Suite
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight mb-4">
          Meet, chat, and share{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
            without barriers
          </span>
        </h1>
        <p className="text-gray-400 text-base sm:text-lg">
          Zero accounts. Zero passwords. Create a room in seconds, invite anyone with a single link, and communicate
          with crystal-clear video, screen sharing, and interactive chat.
        </p>
      </div>

      {/* Main Grid: Create & Join */}
      <div className="grid md:grid-cols-2 gap-8 mb-12">
        {/* Card 1: Create a Room */}
        <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 sm:p-8 shadow-xl backdrop-blur-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                <Plus className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Create a New Room</h2>
                <p className="text-xs text-gray-400">Start a real-time room and invite guests</p>
              </div>
            </div>

            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  Room Name *
                </label>
                <input
                  type="text"
                  required
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="e.g. Design Critique / Evening Hangout"
                  className="w-full bg-gray-800/90 border border-gray-700/80 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 text-sm outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Topic or agenda for this meeting"
                  className="w-full bg-gray-800/90 border border-gray-700/80 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 text-sm outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    Room Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Optional"
                    className="w-full bg-gray-800/90 border border-gray-700/80 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2 text-white placeholder-gray-500 text-sm outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    Capacity
                  </label>
                  <select
                    value={maxParticipants}
                    onChange={(e) => setMaxParticipants(Number(e.target.value))}
                    className="w-full bg-gray-800/90 border border-gray-700/80 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3 py-2 text-white text-sm outline-none"
                  >
                    <option value={10}>10 Participants</option>
                    <option value={25}>25 Participants</option>
                    <option value={50}>50 Participants</option>
                  </select>
                </div>
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-300 select-none">
                  <input
                    type="checkbox"
                    checked={waitingRoom}
                    onChange={(e) => setWaitingRoom(e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-800 border-gray-700 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-gray-900"
                  />
                  <span>Enable Waiting Room (Host approves each guest)</span>
                </label>
              </div>

              {createError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                  {createError}
                </div>
              )}

              <button
                type="submit"
                disabled={isCreating || !roomName.trim()}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold text-sm shadow-lg shadow-indigo-600/30 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {isCreating ? 'Creating Room...' : 'Create Room & Get Link'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

        {/* Card 2: Join a Room */}
        <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 sm:p-8 shadow-xl backdrop-blur-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center border border-purple-500/30">
                <LogIn className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Join Existing Room</h2>
                <p className="text-xs text-gray-400">Enter with a Room ID or pasted Invite Link</p>
              </div>
            </div>

            <form onSubmit={handleJoinRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  Room ID or Invite URL
                </label>
                <input
                  type="text"
                  required
                  value={joinInput}
                  onChange={(e) => setJoinInput(e.target.value)}
                  placeholder="e.g. room-7x2q-m9a1 or paste invitation link"
                  className="w-full bg-gray-800/90 border border-gray-700/80 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 text-sm outline-none"
                />
              </div>

              {needsPassword && (
                <div className="animate-in fade-in duration-150">
                  <label className="block text-xs font-semibold text-purple-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    Room Password Required
                  </label>
                  <input
                    type="password"
                    required
                    value={joinPassword}
                    onChange={(e) => setJoinPassword(e.target.value)}
                    placeholder="Enter room password"
                    className="w-full bg-gray-800/90 border border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 text-sm outline-none"
                  />
                </div>
              )}

              {joinError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                  {joinError}
                </div>
              )}

              <button
                type="submit"
                disabled={isJoining || !joinInput.trim()}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm shadow-lg shadow-purple-600/30 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {isJoining ? 'Joining Room...' : 'Join Room'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {/* Recent Rooms */}
            {recentRooms.length > 0 && (
              <div className="mt-6 pt-5 border-t border-gray-800">
                <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  <Clock className="w-3.5 h-3.5" />
                  Recent Rooms
                </div>
                <div className="space-y-2">
                  {recentRooms.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => onEnterRoom(r.id)}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl bg-gray-800/60 hover:bg-gray-800 border border-gray-700/40 text-left transition-colors text-sm group"
                    >
                      <span className="font-medium text-gray-200 group-hover:text-purple-300">{r.name}</span>
                      <span className="text-xs text-gray-500 group-hover:text-gray-400">{r.id}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Feature Pills */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-gray-800/80">
        <div className="p-4 rounded-xl bg-gray-900/50 border border-gray-800 flex items-center gap-3">
          <Shield className="w-5 h-5 text-emerald-400 shrink-0" />
          <div>
            <h4 className="text-sm font-semibold text-gray-200">Zero Signup</h4>
            <p className="text-xs text-gray-400">Temporary guest ID</p>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-gray-900/50 border border-gray-800 flex items-center gap-3">
          <Video className="w-5 h-5 text-indigo-400 shrink-0" />
          <div>
            <h4 className="text-sm font-semibold text-gray-200">HD Group Media</h4>
            <p className="text-xs text-gray-400">WebRTC camera & mic</p>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-gray-900/50 border border-gray-800 flex items-center gap-3">
          <Users className="w-5 h-5 text-purple-400 shrink-0" />
          <div>
            <h4 className="text-sm font-semibold text-gray-200">Screen Sharing</h4>
            <p className="text-xs text-gray-400">Simultaneous chat</p>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-gray-900/50 border border-gray-800 flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <h4 className="text-sm font-semibold text-gray-200">Watch Together</h4>
            <p className="text-xs text-gray-400">Synchronized video</p>
          </div>
        </div>
      </div>
    </div>
  );
};
