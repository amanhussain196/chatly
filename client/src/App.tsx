import { type ReactNode, useEffect } from 'react';
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
  // const { user } = useAuth(); // Access auth to ensure we are logged in

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
