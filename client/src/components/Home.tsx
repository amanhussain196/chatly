import { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { useNavigate } from 'react-router-dom';
import { User, Plus, Users } from 'lucide-react';

const Home = () => {
    const { socket } = useSocket();
    const navigate = useNavigate();
    const [username, setUsername] = useState('');
    const [roomCode, setRoomCode] = useState('');
    const [error, setError] = useState('');
    const [view, setView] = useState<'main' | 'create' | 'join'>('main');

    const validateUsername = () => {
        if (username.length < 3 || username.length > 15) {
            setError('Username must be 3-15 chars');
            return false;
        }
        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            setError('Alphanumeric & underscores only');
            return false;
        }
        return true;
    };

    const handleCreateRoom = () => {
        if (!validateUsername()) return;
        if (socket) {
            socket.emit('create_room', { username, isPrivate: true });
            // Listen for success in parent or here, but ideally we wait for event
            socket.once('room_created', ({ roomId }) => {
                navigate(`/room/${roomId}`, { state: { username } });
            });
        }
    };

    const handleJoinRoom = () => {
        if (!validateUsername()) return;
        if (roomCode.length < 6) {
            setError('Invalid Room Code');
            return;
        }
        if (socket) {
            socket.emit('join_room', { username, roomId: roomCode });
            socket.once('room_joined', ({ roomId }) => {
                navigate(`/room/${roomId}`, { state: { username } });
            });
            socket.once('error', (msg) => {
                setError(msg);
            });
        }
    };

    return (
        <div className="container" style={{ justifyContent: 'center', padding: '20px' }}>
            <div className="card animate-fade-in" style={{ textAlign: 'center' }}>
                <h1 style={{ fontSize: '2.5rem', marginBottom: '8px', background: 'linear-gradient(to right, #6366f1, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    Chatly
                </h1>
                <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>
                    Connect & Play with Friends
                </p>

                {view === 'main' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ position: 'relative' }}>
                            <User size={20} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                            <input
                                className="input-field"
                                style={{ paddingLeft: '48px' }}
                                placeholder="Enter Username"
                                value={username}
                                onChange={(e) => { setUsername(e.target.value); setError(''); }}
                            />
                        </div>
                        {error && <p style={{ color: 'var(--danger)', fontSize: '0.875rem' }}>{error}</p>}

                        <button className="btn-primary" onClick={() => { if (validateUsername()) setView('create'); }}>
                            <Plus size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
                            Create Room
                        </button>
                        <button className="btn-secondary" onClick={() => { if (validateUsername()) setView('join'); }}>
                            <Users size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
                            Join Room
                        </button>
                    </div>
                )}

                {view === 'create' && (
                    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <p style={{ fontSize: '1.1rem' }}>Hi, <b>{username}</b>!</p>
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
                        <p style={{ fontSize: '1.1rem' }}>Hi, <b>{username}</b>!</p>
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

            </div>
        </div>
    );
};

export default Home;
