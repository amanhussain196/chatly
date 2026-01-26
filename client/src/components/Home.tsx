import { useState, useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, PhoneIncoming, X, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import FriendsComponent from './FriendsComponent';

const Home = () => {
    const { socket } = useSocket();
    const navigate = useNavigate();
    const { user, logout } = useAuth();

    // Default username to auth user if available
    const [username, setUsername] = useState('');
    const [roomCode, setRoomCode] = useState('');
    const [error, setError] = useState('');
    const [view, setView] = useState<'main' | 'create' | 'join'>('main');

    // Call Handling
    const [incomingCall, setIncomingCall] = useState<{ callerId: string, callerName: string, roomId: string } | null>(null);
    const ringtoneRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        if (!socket) return;

        socket.on('incoming_call', (data) => {
            console.log("Incoming call received in Home:", data);
            setIncomingCall(data);

            // Play ringtone
            if (!ringtoneRef.current) {
                ringtoneRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZURE');
                ringtoneRef.current.loop = true;
            }
            ringtoneRef.current.play().catch((e: unknown) => console.log('Ringtone play failed:', e));

            // Vibrate if supported
            if ('vibrate' in navigator) {
                navigator.vibrate([200, 100, 200, 100, 200]);
            }
        });

        socket.on('call_ended', () => {
            setIncomingCall(null);
            ringtoneRef.current?.pause();
            if (ringtoneRef.current) ringtoneRef.current.currentTime = 0;
        });

        return () => {
            socket.off('incoming_call');
            socket.off('call_ended');
            ringtoneRef.current?.pause();
        };
    }, [socket]);

    const acceptCall = () => {
        if (incomingCall && socket) {
            socket.emit('accept_call', { roomId: incomingCall.roomId });
            // Stop ringtone
            ringtoneRef.current?.pause();
            if (ringtoneRef.current) ringtoneRef.current.currentTime = 0;
            // Navigate to room with 'connected' state so Room.tsx knows to start WebRTC
            navigate(`/room/${incomingCall.roomId}`, {
                state: {
                    username: user?.username,
                    friendUsername: incomingCall.callerName,
                    callConnected: true
                }
            });
            setIncomingCall(null);
        }
    };

    const declineCall = () => {
        if (incomingCall && socket) {
            socket.emit('decline_call', { roomId: incomingCall.roomId });
            // Stop ringtone
            ringtoneRef.current?.pause();
            if (ringtoneRef.current) ringtoneRef.current.currentTime = 0;
            setIncomingCall(null);
        }
    };

    useEffect(() => {
        if (user) {
            setUsername(user.username);
        }
    }, [user]);

    const handleCreateRoom = () => {
        if (socket) {
            // Use authenticated username if available, else local state (though we guard access now)
            const nameToUse = user ? user.username : username;
            const idToUse = user ? user.id : undefined;

            socket.emit('create_room', { username: nameToUse, userId: idToUse, isPrivate: true });
            socket.once('room_created', ({ roomId }) => {
                navigate(`/room/${roomId}`, { state: { username: nameToUse } });
            });
        }
    };

    const handleJoinRoom = () => {
        const nameToUse = user ? user.username : username;
        const idToUse = user ? user.id : undefined;

        if (roomCode.length < 6) {
            setError('Invalid Room Code');
            return;
        }
        if (socket) {
            socket.emit('join_room', { username: nameToUse, userId: idToUse, roomId: roomCode });
            socket.once('room_joined', ({ roomId }) => {
                navigate(`/room/${roomId}`, { state: { username: nameToUse } });
            });
            socket.once('error', (msg: string) => {
                setError(msg);
            });
        }
    };

    return (
        <div className="container" style={{ justifyContent: 'center', padding: '20px', position: 'relative' }}>
            {/* Incoming Call Overlay */}
            {incomingCall && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.9)', zIndex: 9999,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '32px'
                }}>
                    <div className="animate-bounce" style={{ width: 100, height: 100, borderRadius: '50%', background: 'rgba(34, 197, 94, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <PhoneIncoming size={48} color="var(--success)" />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <h3 style={{ fontSize: '1.8rem' }}>{incomingCall.callerName}</h3>
                        <p style={{ color: 'var(--text-muted)' }}>Incoming Call...</p>
                    </div>
                    <div style={{ display: 'flex', gap: '48px' }}>
                        <button onClick={declineCall} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', background: 'transparent', color: 'var(--danger)' }}>
                            <div style={{ background: 'rgba(239, 68, 68, 0.2)', padding: '20px', borderRadius: '50%' }}>
                                <X size={32} />
                            </div>
                            <span>Decline</span>
                        </button>
                        <button onClick={acceptCall} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', background: 'transparent', color: 'var(--success)' }}>
                            <div style={{ background: 'rgba(34, 197, 94, 0.2)', padding: '20px', borderRadius: '50%' }}>
                                <Check size={32} />
                            </div>
                            <span>Accept</span>
                        </button>
                    </div>
                </div>
            )}

            <div className="card animate-fade-in" style={{ textAlign: 'center' }}>
                <h1 style={{ fontSize: '2.5rem', marginBottom: '8px', background: 'linear-gradient(to right, #6366f1, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    Chatly
                </h1>
                <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>
                    Connect & Play with Friends
                </p>

                {user && (
                    <p style={{ color: 'var(--accent)', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        Welcome, <b>{user.username}</b>
                        {user.id?.startsWith('guest-') ? (
                            <span title="Guest User">❓</span>
                        ) : (
                            <span title="Registered User">✅</span>
                        )}
                    </p>
                )}

                {/* Friends Section for Registered Users */}
                {user && !user.id?.startsWith('guest-') && view === 'main' && (
                    <FriendsComponent />
                )}

                {view === 'main' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '20px' }}>
                        {error && <p style={{ color: 'var(--danger)', fontSize: '0.875rem' }}>{error}</p>}

                        <button className="btn-primary" onClick={() => setView('create')}>
                            <Plus size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
                            Create Room
                        </button>
                        <button className="btn-secondary" onClick={() => setView('join')}>
                            <Users size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
                            Join Room
                        </button>
                    </div>
                )}

                {view === 'create' && (
                    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Ready to host a game night?</p>
                        <button className="btn-primary" onClick={handleCreateRoom}>
                            Start New Room
                        </button>
                        <button className="btn-secondary" onClick={() => setView('main')} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)' }}>
                            Back
                        </button>
                    </div>
                )}

                {view === 'join' && (
                    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <input
                            className="input-field"
                            placeholder="Enter Room Code"
                            value={roomCode}
                            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                            maxLength={6}
                            style={{ textAlign: 'center', letterSpacing: '2px', fontSize: '1.2rem', textTransform: 'uppercase' }}
                        />
                        {error && <p style={{ color: 'var(--danger)', fontSize: '0.875rem' }}>{error}</p>}
                        <button className="btn-primary" onClick={handleJoinRoom}>
                            Join Now
                        </button>
                        <button className="btn-secondary" onClick={() => setView('main')} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)' }}>
                            Back
                        </button>
                    </div>
                )}

                {user && (
                    <div style={{ marginTop: '24px' }}>
                        <button onClick={logout} style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.9rem', textDecoration: 'underline' }}>
                            Logout
                        </button>
                    </div>
                )}

            </div>
        </div>
    );
};

export default Home;
