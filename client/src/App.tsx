import { useState, useEffect } from 'react';
import { GuestProvider, useGuest } from './context/GuestContext';
import { Navbar } from './components/Navbar';
import { Dashboard } from './components/Dashboard';
import { RoomView } from './components/RoomView';
import { DeviceSettingsModal } from './components/DeviceSettingsModal';
import { api } from './services/api';

function MainApp() {
  const { isLoading } = useGuest();

  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [activeInviteToken, setActiveInviteToken] = useState<string | undefined>(undefined);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [initialLoadingNotice, setInitialLoadingNotice] = useState<string | null>(null);

  // Check URL on mount and route change: /room/:id or /invite/:token
  useEffect(() => {
    if (isLoading) return;

    const handleUrlRoute = async () => {
      const path = window.location.pathname;

      if (path.startsWith('/invite/')) {
        const token = path.replace('/invite/', '').split('/')[0];
        if (token) {
          try {
            setInitialLoadingNotice('Validating and joining room...');
            const res = await api.validateInvitation(token);
            await api.joinRoom(res.roomId, { inviteToken: token });
            setActiveRoomId(res.roomId);
            setActiveInviteToken(token);
            window.history.replaceState(null, '', `/room/${res.roomId}`);
          } catch (err: any) {
            console.error('Failed to validate invite:', err);
            alert(err.message || 'Invitation is invalid or has expired.');
            window.history.replaceState(null, '', '/');
          } finally {
            setInitialLoadingNotice(null);
          }
        }
      } else if (path.startsWith('/room/')) {
        const roomId = path.replace('/room/', '').split('/')[0];
        if (roomId) {
          try {
            await api.joinRoom(roomId);
          } catch (err) {
            console.warn('Direct room join check:', err);
          }
          setActiveRoomId(roomId);
        }
      }
    };

    handleUrlRoute();

    const onPopState = () => {
      handleUrlRoute();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [isLoading]);

  const handleEnterRoom = (roomId: string, inviteToken?: string) => {
    setActiveRoomId(roomId);
    setActiveInviteToken(inviteToken);
    window.history.pushState(null, '', `/room/${roomId}`);
  };

  const handleLeaveRoom = () => {
    setActiveRoomId(null);
    setActiveInviteToken(undefined);
    window.history.pushState(null, '', '/');
  };

  if (isLoading || initialLoadingNotice) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center text-white">
        <div className="w-12 h-12 rounded-2xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center animate-spin mb-4">
          <div className="w-4 h-4 rounded-full bg-indigo-400" />
        </div>
        <p className="text-sm font-semibold text-gray-300">
          {initialLoadingNotice || 'Initializing anonymous session...'}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col font-sans">
      <Navbar onOpenSettings={() => setIsSettingsOpen(true)} />

      <main className="flex-1 flex flex-col overflow-hidden">
        {activeRoomId ? (
          <RoomView
            roomId={activeRoomId}
            initialInviteToken={activeInviteToken}
            onLeave={handleLeaveRoom}
          />
        ) : (
          <Dashboard onEnterRoom={handleEnterRoom} />
        )}
      </main>

      <DeviceSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <GuestProvider>
      <MainApp />
    </GuestProvider>
  );
}
