import { useState, useEffect } from 'react';
import axios from 'axios';
import { UserPlus, Check, X, MessageSquare, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

import { useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface Friend {
    _id: string;
    username: string;
    email: string;
}

const FriendsComponent = () => {
    const { token, user } = useAuth(); // Need token for requests

    const navigate = useNavigate();
    const [view, setView] = useState<'list' | 'add'>('list');
    const [friends, setFriends] = useState<Friend[]>([]);
    const [requests, setRequests] = useState<Friend[]>([]);
    const [addUsername, setAddUsername] = useState('');
    const [msg, setMsg] = useState({ text: '', type: '' });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (token) {
            fetchFriends();
        }
    }, [token]);

    // ... existing functions ...

    const startChat = (friendId: string, friendUsername: string) => {
        if (!user || !user.id || !friendId) return;

        // Deterministic Room ID for 1-to-1 chat
        const ids = [user.id, friendId].sort();
        const roomId = `dm_${ids[0]}_${ids[1]}`;

        // Navigate immediately - Room.tsx handles the actual join/creation handshake
        navigate(`/room/${roomId}`, { state: { username: user.username, friendUsername } });
    };

    const fetchFriends = async () => {
        try {
            const res = await axios.get(`${API_URL}/api/friends`);
            setFriends(res.data.friends);
            setRequests(res.data.requests);
        } catch (err) {
            console.error(err);
        }
    };

    const sendRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMsg({ text: '', type: '' });
        try {
            await axios.post(`${API_URL}/api/friends/request`, { username: addUsername });
            setMsg({ text: 'Request sent successfully!', type: 'success' });
            setAddUsername('');
        } catch (err: any) {
            setMsg({ text: err.response?.data?.message || 'Failed to send request', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const acceptRequest = async (requesterId: string) => {
        try {
            await axios.post(`${API_URL}/api/friends/accept`, { requesterId });
            fetchFriends();
        } catch (err) {
            alert('Error accepting request');
        }
    };

    const declineRequest = async (requesterId: string) => {
        try {
            await axios.post(`${API_URL}/api/friends/decline`, { requesterId });
            fetchFriends();
        } catch (err) {
            alert('Error declining request');
        }
    };



    return (
        <div className="card" style={{ padding: '20px', marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '1.2rem' }}>Friends</h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={() => setView('list')}
                        style={{ padding: '8px', background: view === 'list' ? 'var(--primary)' : 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer' }}
                    >
                        My Friends
                    </button>
                    <button
                        onClick={() => setView('add')}
                        style={{ padding: '8px', background: view === 'add' ? 'var(--primary)' : 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer' }}
                    >
                        <UserPlus size={16} />
                    </button>
                </div>
            </div>

            {view === 'add' && (
                <div className="animate-fade-in">
                    <form onSubmit={sendRequest} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                        <input
                            value={addUsername}
                            onChange={e => setAddUsername(e.target.value)}
                            placeholder="Enter username to add..."
                            style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #333', background: '#1e293b', color: 'white' }}
                        />
                        <button type="submit" disabled={loading || !addUsername} style={{ padding: '10px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                            Send
                        </button>
                    </form>
                    {msg.text && (
                        <p style={{ color: msg.type === 'success' ? '#4ade80' : '#f87171', fontSize: '0.9rem', marginBottom: '16px' }}>
                            {msg.text}
                        </p>
                    )}
                </div>
            )}

            {view === 'list' && (
                <div className="animate-fade-in">
                    {/* Requests Section */}
                    {requests.length > 0 && (
                        <div style={{ marginBottom: '24px' }}>
                            <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>Pending Requests</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {requests.map(req => (
                                    <div key={req._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ width: '32px', height: '32px', background: '#334155', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <User size={16} />
                                            </div>
                                            <span>{req.username}</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button onClick={() => acceptRequest(req._id)} style={{ padding: '6px', background: '#22c55e', border: 'none', borderRadius: '50%', color: 'white', cursor: 'pointer', display: 'flex' }} title="Accept">
                                                <Check size={16} />
                                            </button>
                                            <button onClick={() => declineRequest(req._id)} style={{ padding: '6px', background: '#ef4444', border: 'none', borderRadius: '50%', color: 'white', cursor: 'pointer', display: 'flex' }} title="Decline">
                                                <X size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Friends List */}
                    <div>
                        <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>Your Friends ({friends.length})</h3>
                        {friends.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>No friends yet. Add someone!</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {friends.map(friend => (
                                    <div key={friend._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ width: '32px', height: '32px', background: '#4f46e5', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <span style={{ fontWeight: 'bold' }}>{friend.username.charAt(0).toUpperCase()}</span>
                                            </div>
                                            <span>{friend.username}</span>
                                        </div>
                                        <button onClick={() => startChat(friend._id, friend.username)} style={{ padding: '8px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px', color: 'var(--primary)', cursor: 'pointer' }} title="Message">
                                            <MessageSquare size={18} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default FriendsComponent;
