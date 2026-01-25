import { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { useNavigate } from 'react-router-dom';
import { Plus, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Home = () => {
    const { socket } = useSocket();
    const navigate = useNavigate();
    const { user, logout } = useAuth();

    // Default username to auth user if available
    const [username, setUsername] = useState('');
    const [roomCode, setRoomCode] = useState('');
    const [error, setError] = useState('');
    const [view, setView] = useState<'main' | 'create' | 'join'>('main');

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
        <div className="container" style={{ justifyContent: 'center', padding: '20px' }}>
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

                {view === 'main' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

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
