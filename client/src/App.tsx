import { type ReactNode, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from './components/Home';
import Room from './components/Room/Room';
import AuthPage from './components/AuthPage';
import { SocketProvider, useSocket } from './context/SocketContext';
import { AuthProvider, useAuth } from './context/AuthContext';

function PrivateRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>Loading...</div>;

  return user ? children : <Navigate to="/auth" />;
}

function AppContent() {
  const { socket } = useSocket();
  const audioContextRef = useRef<AudioContext | null>(null);
  // const { user } = useAuth(); // Access auth to ensure we are logged in

  // Initialize AudioContext globally for mobile (CRITICAL for mobile APK)
  useEffect(() => {
    const initGlobalAudioContext = async () => {
      try {
        // @ts-ignore
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass && !audioContextRef.current) {
          audioContextRef.current = new AudioContextClass();
          console.log('[App] Global AudioContext created, state:', audioContextRef.current.state);

          // Try to resume immediately
          if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
            console.log('[App] Global AudioContext resumed on init');
          }
        }
      } catch (e) {
        console.error('[App] Failed to create global AudioContext:', e);
      }
    };

    // Initialize on mount
    initGlobalAudioContext();

    // Resume AudioContext on any user interaction (critical for mobile)
    const resumeAudioContext = async () => {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        try {
          await audioContextRef.current.resume();
          console.log('[App] Global AudioContext resumed after user interaction, state:', audioContextRef.current.state);
        } catch (e) {
          console.error('[App] Failed to resume AudioContext:', e);
        }
      }
    };

    // Listen for user interactions to unlock audio
    document.addEventListener('touchstart', resumeAudioContext, { passive: true });
    document.addEventListener('touchend', resumeAudioContext, { passive: true });
    document.addEventListener('click', resumeAudioContext);
    document.addEventListener('keydown', resumeAudioContext);

    return () => {
      document.removeEventListener('touchstart', resumeAudioContext);
      document.removeEventListener('touchend', resumeAudioContext);
      document.removeEventListener('click', resumeAudioContext);
      document.removeEventListener('keydown', resumeAudioContext);
    };
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handleNotification = ({ roomId }: { roomId: string }) => {
      console.log('[App] New Notification received for room:', roomId);
      if (roomId) {
        localStorage.setItem(`unread_${roomId.toUpperCase()}`, 'true');
        // Dispatch storage event manually for same-tab updates
        window.dispatchEvent(new Event('storage'));
      }
    };

    socket.on('new_notification', handleNotification);

    return () => {
      socket.off('new_notification', handleNotification);
    };
  }, [socket]);

  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/" element={
        <PrivateRoute>
          <Home />
        </PrivateRoute>
      } />
      <Route path="/room/:roomId" element={
        <PrivateRoute>
          <Room />
        </PrivateRoute>
      } />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;
