import React, { useEffect, useState, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useWebRTC } from '../../hooks/useWebRTC';
import Audio from './Audio';
import VoiceVisualizer from './VoiceVisualizer';

import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { Mic, MicOff, Send, PhoneOff, Copy, User as UserIcon, MessageSquare } from 'lucide-react';


interface User {
    id: string;
    username: string;
    isHost: boolean;
    isMuted: boolean;
}

interface Message {
    id: string;
    text: string;
    sender: string;
    timestamp: string;
}

const Room = () => {
    const { roomId } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const { socket } = useSocket();

    const [users, setUsers] = useState<User[]>([]);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [activeTab, setActiveTab] = useState<'chat' | 'people'>('chat');

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const { user } = useAuth(); // Get user from context

    useEffect(() => {
        if (!socket) return;

        const effectiveUsername = user?.username || location.state?.username;

        // Safety check: if accessed directly without state AND not logged in
        if (!effectiveUsername) {
            navigate('/');
            return;
        }

        // Join room logic here if not already joined by Home? 
        // actually Home emits 'create_room' or 'join_room' then navigates. 
        // But if we refresh /room/ID, we need to rejoin.
        // For now, let's just assume the flow from Home. 
        // If direct access, we might need to emit 'join_room' again.
        if (user && !location.state?.username) {
            socket.emit('join_room', { username: user.username, roomId });
        }


        // Request initial state in case we missed the update
        socket.emit('get_room_state', { roomId });

        socket.on('room_users_update', (roomUsers: User[]) => {
            setUsers(roomUsers);
            const me = roomUsers.find(u => u.id === socket.id);
            if (me) setCurrentUser(me);
        });

        socket.on('receive_message', (message: Message) => {
            setMessages(prev => [...prev, message]);
        });

        socket.on('user_joined', ({ username }) => {
            setMessages(prev => [...prev, { id: Date.now().toString(), text: `${username} joined the room.`, sender: 'System', timestamp: new Date().toISOString() }]);
        });

        socket.on('user_left', ({ username }) => {
            setMessages(prev => [...prev, { id: Date.now().toString(), text: `${username} left the room.`, sender: 'System', timestamp: new Date().toISOString() }]);
        });

        return () => {
            socket.off('room_users_update');
            socket.off('receive_message');
            socket.off('user_joined');
            socket.off('user_left');
        };
    }, [socket, roomId, location.state, navigate]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, activeTab]);

    // WebRTC
    const { peers, toggleMute: toggleAudioMute, stream, logs } = useWebRTC(socket, roomId || '', currentUser?.id || '');
    const [showLogs, setShowLogs] = useState(false);

    const sendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (newMessage.trim() && socket) {
            socket.emit('send_message', { message: newMessage, roomId });
            setNewMessage('');
        }
    };

    const handleToggleMute = () => {
        toggleAudioMute(); // Real mic toggle
        // UI toggle broadcast
        if (socket) {
            socket.emit('toggle_mute', { roomId });
        }
    };

    const copyRoomCode = () => {
        navigator.clipboard.writeText(roomId || '');
        // Could add a toast notification here
        alert('Room Code Copied: ' + roomId);
    };

    const leaveRoom = () => {
        if (confirm('Are you sure you want to leave?')) {
            navigate('/');
            window.location.reload(); // Simple way to reset socket state cleanly
        }
    };

    if (!currentUser) return <div className="container" style={{ justifyContent: 'center', alignItems: 'center' }}>Loading...</div>;

    return (
        <div className="container" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ padding: '16px', background: 'var(--bg-card)', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: '700' }}>Room: <span style={{ fontFamily: 'monospace', color: 'var(--primary)', cursor: 'pointer' }} onClick={copyRoomCode}>{roomId} <Copy size={14} style={{ display: 'inline' }} /></span></h2>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{users.length} Online</span>
                </div>
                <button onClick={leaveRoom} style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: '8px', borderRadius: '50%' }}>
                    <PhoneOff size={20} />
                </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <button
                    style={{ flex: 1, padding: '12px', background: 'transparent', color: activeTab === 'chat' ? 'var(--primary)' : 'var(--text-muted)', borderBottom: activeTab === 'chat' ? '2px solid var(--primary)' : 'none' }}
                    onClick={() => setActiveTab('chat')}
                >
                    Chat
                </button>
                <button
                    style={{ flex: 1, padding: '12px', background: 'transparent', color: activeTab === 'people' ? 'var(--primary)' : 'var(--text-muted)', borderBottom: activeTab === 'people' ? '2px solid var(--primary)' : 'none' }}
                    onClick={() => setActiveTab('people')}
                >
                    People
                </button>
                <button
                    style={{ padding: '12px', background: 'transparent', color: showLogs ? 'var(--accent)' : 'var(--text-muted)' }}
                    onClick={() => setShowLogs(!showLogs)}
                >
                    Logs
                </button>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>

                {/* Chat Tab */}
                {activeTab === 'chat' && (
                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {messages.map((msg) => (
                                <div key={msg.id} style={{
                                    alignSelf: msg.sender === 'System' ? 'center' : (msg.sender === currentUser.username ? 'flex-end' : 'flex-start'),
                                    maxWidth: '85%',
                                    textAlign: msg.sender === 'System' ? 'center' : 'left'
                                }}>
                                    {msg.sender === 'System' ? (
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '12px' }}>{msg.text}</span>
                                    ) : (
                                        <div>
                                            {msg.sender !== currentUser.username && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', paddingLeft: '8px' }}>{msg.sender}</span>}
                                            <div style={{
                                                background: msg.sender === currentUser.username ? 'var(--primary)' : 'var(--bg-card)',
                                                color: 'white',
                                                padding: '10px 14px',
                                                borderRadius: '18px',
                                                borderTopRightRadius: msg.sender === currentUser.username ? '4px' : '18px',
                                                borderTopLeftRadius: msg.sender !== currentUser.username ? '4px' : '18px'
                                            }}>
                                                {msg.text}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>

                        <form onSubmit={sendMessage} style={{ padding: '12px', background: 'var(--bg-card)', display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                placeholder="Type a message..."
                                style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: 'none', padding: '12px', borderRadius: '24px', color: 'white' }}
                            />
                            <button type="submit" disabled={!newMessage.trim()} style={{ background: 'var(--primary)', color: 'white', padding: '10px', borderRadius: '50%', opacity: newMessage.trim() ? 1 : 0.5 }}>
                                <Send size={20} />
                            </button>
                        </form>
                    </div>
                )}

                {/* People Tab */}
                {activeTab === 'people' && (
                    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', height: '100%' }}>
                        {users.map(u => {
                            // Find the stream for this user
                            let userStream = null;
                            let connectionState = '';
                            if (u.id === currentUser.id) {
                                userStream = stream; // Local stream
                            } else {
                                const peer = peers.find(p => p.peerID === u.id);
                                userStream = peer?.stream;
                                connectionState = peer?.connectionState || 'unknown';
                            }

                            return (
                                <div key={u.id} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ width: '40px', height: '40px', background: 'linear-gradient(135deg, #1e293b, #334155)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <UserIcon size={20} />
                                        </div>
                                        <div>
                                            <p style={{ fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                {u.username}
                                                {u.id?.startsWith('guest-') ? (
                                                    <span title="Guest User">❓</span>
                                                ) : (
                                                    <span title="Registered User">🔵</span>
                                                )}
                                                {u.id === currentUser.id && '(You)'}
                                            </p>
                                            <p style={{ fontSize: '0.8rem', color: u.isHost ? 'var(--accent)' : 'var(--text-muted)' }}>
                                                {u.isHost ? 'Host' : 'Participant'}
                                                {connectionState && <span style={{ marginLeft: 8, fontSize: '0.7rem', color: connectionState === 'connected' ? 'var(--success)' : 'var(--danger)' }}>({connectionState})</span>}
                                            </p>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        {/* Visualizer for this user */}
                                        {!u.isMuted && userStream && (
                                            <div style={{ width: 20, height: 20 }}>
                                                <VoiceVisualizer stream={userStream} />
                                            </div>
                                        )}
                                        {u.isMuted ? <MicOff size={18} color="var(--danger)" /> : <Mic size={18} color="var(--success)" />}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Debug Logs */}
                {showLogs && (
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 100, overflowY: 'auto', padding: 16, fontSize: '0.8rem', fontFamily: 'monospace' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                            <h3>WebRTC Logs</h3>
                            <button onClick={() => setShowLogs(false)} style={{ color: 'red' }}>Close</button>
                        </div>
                        {logs.map((log, i) => (
                            <div key={i} style={{ borderBottom: '1px solid #333', padding: '2px 0' }}>{log}</div>
                        ))}
                    </div>
                )}

            </div>

            {/* Audio Players - Hidden/Background but Visualizers Visible */}
            <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 8 }}>
                {peers.map((peer) => (
                    <Audio key={peer.peerID} peer={peer.peer} stream={peer.stream} />
                ))}
            </div>

            {/* Voice Controls (Sticky Footer Style) */}
            <div style={{ padding: '16px', background: 'var(--bg-card)', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
                <button onClick={handleToggleMute} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'transparent', color: currentUser.isMuted ? 'var(--danger)' : 'white' }}>
                    <div style={{ position: 'relative', padding: '12px', background: currentUser.isMuted ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.1)', borderRadius: '50%' }}>
                        {currentUser.isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                        {/* Local Visualizer Overlay */}
                        {!currentUser.isMuted && stream && (
                            <div style={{ position: 'absolute', bottom: -5, left: '50%', transform: 'translateX(-50%)' }}>
                                <VoiceVisualizer stream={stream} />
                            </div>
                        )}
                    </div>
                    <span style={{ fontSize: '0.75rem' }}>{currentUser.isMuted ? 'Unmute' : 'Mute'}</span>
                </button>

                <button disabled style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'transparent', color: 'var(--text-muted)', opacity: 0.5 }}>
                    <div style={{ padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '50%' }}>
                        <MessageSquare size={24} />
                    </div>
                    <span style={{ fontSize: '0.75rem' }}>Start Game</span>
                </button>
            </div>

        </div>
    );
};

export default Room;
