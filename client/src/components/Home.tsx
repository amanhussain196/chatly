import { useState, useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, PhoneIncoming, X, Check, LogOut, ArrowLeft } from 'lucide-react';
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
            setIncomingCall(data);
            if (!ringtoneRef.current) {
                ringtoneRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZURE');
                ringtoneRef.current.loop = true;
            }
            ringtoneRef.current.play().catch((e: unknown) => console.log('Ringtone play failed:', e));
            if ('vibrate' in navigator) navigator.vibrate([200, 100, 200, 100, 200]);
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
            ringtoneRef.current?.pause();
            if (ringtoneRef.current) ringtoneRef.current.currentTime = 0;
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
            const nameToUse = user ? user.username : username;
            const idToUse = user ? user.id : undefined;
            socket.emit('create_room', { username: nameToUse, userId: idToUse, isPrivate: true });
            const onCreated = ({ roomId }: { roomId: string }) => {
                navigate(`/room/${roomId}`, { state: { username: nameToUse } });
                socket.off('room_created', onCreated);
            };
            socket.once('room_created', onCreated);
        }
    };

    const handleJoinRoom = () => {
        const nameToUse = user ? user.username : username;
        const idToUse = user ? user.id : undefined;

        if (roomCode.length < 6) {
            setError('Code must be 6 characters');
            return;
        }
        if (socket) {
            socket.emit('join_room', { username: nameToUse, userId: idToUse, roomId: roomCode });
            const onJoined = ({ roomId }: { roomId: string }) => {
                navigate(`/room/${roomId}`, { state: { username: nameToUse } });
                socket.off('room_joined', onJoined);
            };
            socket.once('room_joined', onJoined);
            socket.once('error', (msg: string) => setError(msg));
        }
    };

    return (
        <div className="app-container">
            {/* Incoming Call Overlay */}
            {incomingCall && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', zIndex: 9999,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '32px'
                }}>
                    <div className="animate-float" style={{
                        width: 120, height: 120, borderRadius: '50%',
                        background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 0 40px rgba(59, 130, 246, 0.4)' // Blue glow
                    }}>
                        <PhoneIncoming size={56} color="#3b82f6" />
                    </div>
                    <div style={{ textAlign: 'center', color: 'white' }}>
                        <h2 style={{ fontSize: '2rem', fontWeight: 700 }}>{incomingCall.callerName}</h2>
                        <p style={{ opacity: 0.8 }}>Incoming Call...</p>
                    </div>
                    <div style={{ display: 'flex', gap: '40px' }}>
                        <button onClick={declineCall} style={{ background: '#ef4444', color: 'white', padding: '20px', borderRadius: '50%', border: 'none' }}>
                            <X size={32} />
                        </button>
                        <button onClick={acceptCall} style={{ background: '#22c55e', color: 'white', padding: '20px', borderRadius: '50%', border: 'none' }}>
                            <Check size={32} />
                        </button>
                    </div>
                </div>
            )}

            {/* Main Content Card */}
            <div className="glass-card animate-fade-in">

                {/* Logo & Brand */}
                <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} className="animate-float">
                    <img src="/chatly_logo.png" alt="Chatly" style={{ width: '80px', height: '80px', objectFit: 'contain' }} />
                    <h1 className="text-gradient" style={{ fontSize: '3rem', fontWeight: 800, margin: 0 }}>Chatly</h1>
                </div>
                <p className="text-muted" style={{ marginBottom: '32px' }}>
                    Social Gaming & Chat
                </p>

                {error && (
                    <div style={{ background: '#fef2f2', color: '#ef4444', padding: '12px', borderRadius: '12px', marginBottom: '16px', fontSize: '0.9rem' }}>
                        {error}
                    </div>
                )}

                {/* VIEW: MAIN */}
                {view === 'main' && (
                    <div className="w-full flex-col gap-4">
                        {user && (
                            <div style={{ marginBottom: '16px' }}>
                                <p style={{ fontSize: '1.1rem', color: 'var(--text-main)' }}>
                                    Hello, <b>{user.username}</b> 👋
                                </p>
                            </div>
                        )}

                        {/* Friends List Integration */}
                        {user && !user.id?.startsWith('guest-') && (
                            <div style={{ marginBottom: '20px' }}>
                                <FriendsComponent />
                            </div>
                        )}

                        <button className="btn-primary" onClick={() => { setView('create'); setError(''); }}>
                            <Plus size={20} strokeWidth={3} />
                            Create Room
                        </button>

                        <button className="btn-secondary" onClick={() => { setView('join'); setError(''); }}>
                            <Users size={20} />
                            Join Room
                        </button>

                        {user && (
                            <button onClick={logout} className="btn-ghost">
                                <LogOut size={16} style={{ display: 'inline', marginRight: 6 }} />
                                Logout
                            </button>
                        )}
                    </div>
                )}

                {/* VIEW: CREATE */}
                {view === 'create' && (
                    <div className="w-full flex-col gap-4 animate-fade-in">
                        <div className="mb-4">
                            <h3 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Create Room</h3>
                            <p className="text-muted">Start a space for your friends.</p>
                        </div>

                        <button className="btn-primary" onClick={handleCreateRoom}>
                            Start Instant Room
                        </button>

                        <button className="btn-secondary" onClick={() => { setView('main'); setError(''); }}>
                            <ArrowLeft size={18} /> Back
                        </button>
                    </div>
                )}

                {/* VIEW: JOIN */}
                {view === 'join' && (
                    <div className="w-full flex-col gap-4 animate-fade-in">
                        <div className="mb-4">
                            <h3 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Join Room</h3>
                            <p className="text-muted">Enter the 6-character code.</p>
                        </div>

                        <input
                            className="input-pill"
                            placeholder="CODE"
                            maxLength={6}
                            value={roomCode}
                            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                        />

                        <button className="btn-primary" onClick={handleJoinRoom}>
                            Join Now
                        </button>

                        <button className="btn-secondary" onClick={() => { setView('main'); setError(''); }}>
                            <ArrowLeft size={18} /> Back
                        </button>
                    </div>
                )}
            </div>

            <div style={{ textAlign: 'center', marginTop: '32px', opacity: 0.5 }}>
                <p style={{ fontSize: '0.8rem' }}>© 2026 Chatly • Version 1.0</p>
            </div>
        </div>
    );
};

export default Home;
