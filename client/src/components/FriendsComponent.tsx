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

    // Initialize from cache if available to prevent flickering
    const [friends, setFriends] = useState<Friend[]>(() => {
        try {
            const cached = localStorage.getItem('friends_cache');
            return cached ? JSON.parse(cached) : [];
        } catch { return []; }
    });
    const [requests, setRequests] = useState<Friend[]>(() => {
        try {
            const cached = localStorage.getItem('requests_cache');
            return cached ? JSON.parse(cached) : [];
        } catch { return []; }
    });

    const [addUsername, setAddUsername] = useState('');
    const [msg, setMsg] = useState({ text: '', type: '' });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (token) {
            fetchFriends();
        }
    }, [token]);

    // ... existing functions ...

    const [unreadMap, setUnreadMap] = useState<Record<string, boolean>>({});

    const updateUnreadState = () => {
        const newMap: Record<string, boolean> = {};
        if (friends) {
            friends.forEach(f => {
                if (user?.id) {
                    const ids = [user.id, f._id].sort();
                    const roomId = `dm_${ids[0]}_${ids[1]}`.toUpperCase();
                    newMap[f._id] = localStorage.getItem(`unread_${roomId}`) === 'true';
                }
            });
        }
        setUnreadMap(newMap);
    };

    useEffect(() => {
        updateUnreadState();
    }, [friends, user]);

    useEffect(() => {
        const handleStorage = () => updateUnreadState();
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, [friends, user]);

    const hasUnread = (friendId: string) => {
        return unreadMap[friendId] || false;
    };

    const clearUnread = (friendId: string) => {
        if (!user?.id) return;
        const ids = [user.id, friendId].sort();
        const roomId = `dm_${ids[0]}_${ids[1]}`.toUpperCase();
        localStorage.removeItem(`unread_${roomId}`);
        updateUnreadState();
    };

    const startChat = (friendId: string, friendUsername: string) => {
        if (!user || !user.id || !friendId) return;
        clearUnread(friendId); // Clear dot when entering chat

        const ids = [user.id, friendId].sort();
        const roomId = `dm_${ids[0]}_${ids[1]}`;
        navigate(`/room/${roomId}`, { state: { username: user.username, friendUsername } });
    };

    const fetchFriends = async () => {
        try {
            const res = await axios.get(`${API_URL}/api/friends`);

            // Only update if we have valid data
            if (res.data) {
                setFriends(res.data.friends || []);
                setRequests(res.data.requests || []);

                // Cache the results
                localStorage.setItem('friends_cache', JSON.stringify(res.data.friends || []));
                localStorage.setItem('requests_cache', JSON.stringify(res.data.requests || []));
            }
        } catch (err) {
            console.error(err);
            // On error, we silently keep the cached data instead of wiping it
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
        <div style={{ marginTop: '24px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)' }}>Friends</h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={() => setView('list')}
                        style={{
                            padding: '8px 12px',
                            background: view === 'list' ? 'var(--primary-gradient)' : 'rgba(0,0,0,0.05)',
                            border: 'none',
                            borderRadius: '20px',
                            color: view === 'list' ? 'white' : 'var(--text-muted)',
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            transition: 'all 0.2s'
                        }}
                    >
                        My Friends
                    </button>
                    <button
                        onClick={() => setView('add')}
                        style={{
                            padding: '8px 12px',
                            background: view === 'add' ? 'var(--primary-gradient)' : 'rgba(0,0,0,0.05)',
                            border: 'none',
                            borderRadius: '20px',
                            color: view === 'add' ? 'white' : 'var(--text-muted)',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        <UserPlus size={18} />
                    </button>
                </div>
            </div>

            {view === 'add' && (
                <div className="animate-fade-in">
                    <form onSubmit={sendRequest} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                        <input
                            className="input-pill"
                            value={addUsername}
                            onChange={e => setAddUsername(e.target.value)}
                            placeholder="Username..."
                            style={{ flex: 1, padding: '10px 16px', textAlign: 'left', fontSize: '0.9rem' }}
                        />
                        <button type="submit" disabled={loading || !addUsername} className="btn-primary" style={{ width: 'auto', padding: '10px 20px', borderRadius: '20px' }}>
                            Add
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
                            <h3 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>Pending Requests</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {requests.map(req => (
                                    <div key={req._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div style={{ width: '36px', height: '36px', background: '#f1f5f9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                                                <User size={18} />
                                            </div>
                                            <span>{req.username}</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button onClick={() => acceptRequest(req._id)} style={{ padding: '8px', background: '#22c55e', border: 'none', borderRadius: '50%', color: 'white', cursor: 'pointer', display: 'flex', boxShadow: '0 2px 5px rgba(34, 197, 94, 0.3)' }} title="Accept">
                                                <Check size={16} strokeWidth={3} />
                                            </button>
                                            <button onClick={() => declineRequest(req._id)} style={{ padding: '8px', background: '#ef4444', border: 'none', borderRadius: '50%', color: 'white', cursor: 'pointer', display: 'flex', boxShadow: '0 2px 5px rgba(239, 68, 68, 0.3)' }} title="Decline">
                                                <X size={16} strokeWidth={3} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Friends List */}
                    <div>
                        <h3 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>Your Friends ({friends.length})</h3>
                        {friends.length === 0 ? (
                            <div style={{ padding: '24px', textAlign: 'center', background: '#f8fafc', borderRadius: '16px', border: '2px dashed #e2e8f0' }}>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No friends yet.</p>
                                <button onClick={() => setView('add')} style={{ background: 'none', border: 'none', color: '#3b82f6', fontWeight: 700, marginTop: '8px', cursor: 'pointer' }}>
                                    Find Friends
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {friends.map(friend => (
                                    <div key={friend._id} onClick={() => startChat(friend._id, friend.username)} style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '12px', background: 'white', borderRadius: '16px',
                                        cursor: 'pointer', border: '1px solid transparent',
                                        transition: 'all 0.2s',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
                                    }}
                                        onMouseEnter={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
                                        onMouseLeave={(e) => e.currentTarget.style.borderColor = 'transparent'}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative' }}>
                                            <div style={{ width: '40px', height: '40px', background: 'linear-gradient(135deg, #3b82f6, #6366f1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', boxShadow: '0 2px 5px rgba(59, 130, 246, 0.3)' }}>
                                                <span style={{ fontWeight: '800', fontSize: '1rem' }}>{friend.username.charAt(0).toUpperCase()}</span>
                                            </div>
                                            <span>{friend.username}</span>
                                            {/* Unread Dot */}
                                            {hasUnread(friend._id) && (
                                                <div style={{
                                                    width: '12px', height: '12px',
                                                    background: '#ef4444', borderRadius: '50%',
                                                    position: 'absolute', top: -2, left: -2,
                                                    border: '2px solid white'
                                                }} />
                                            )}
                                        </div>
                                        <div style={{ color: '#94a3b8' }}>
                                            <MessageSquare size={18} color={hasUnread(friend._id) ? '#ef4444' : '#94a3b8'} />
                                        </div>
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
