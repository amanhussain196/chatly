import React, { useEffect, useState, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useWebRTC } from '../../hooks/useWebRTC';
import Audio from './Audio';
import VoiceVisualizer from './VoiceVisualizer';

import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { Mic, MicOff, Send, PhoneOff, Copy, User as UserIcon, MessageSquare, Phone, PhoneIncoming, X, Check } from 'lucide-react';


interface User {
    id: string; // Socket ID
    userId?: string; // Auth ID
    username: string;
    isHost: boolean;
    isMuted: boolean;
}

interface Message {
    id: string;
    text: string;
    sender: string;
    timestamp: string;
    status?: 'sent' | 'delivered' | 'read';
}

const Room = () => {
    const { roomId } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const { socket } = useSocket();
    const { user } = useAuth(); // Ensure we have the auth user context
    const isDM = roomId?.toLowerCase().startsWith('dm_');

    const [users, setUsers] = useState<User[]>([]);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [activeTab, setActiveTab] = useState<'chat' | 'people'>('chat');
    const [showLogs, setShowLogs] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);



    useEffect(() => {
        if (!socket) return;

        const effectiveUsername = user?.username || location.state?.username;

        // Safety check: if accessed directly without state AND not logged in
        if (!effectiveUsername) {
            navigate('/');
            return;
        }

        const joinRoom = () => {
            setError(null); // Clear previous errors (like Room Full) on retry
            if (roomId) {
                console.log('Joining room:', roomId);
                socket.emit('join_room', { username: effectiveUsername, userId: user?.id, roomId });
            }
        };

        if (socket.connected) {
            joinRoom();
        } else {
            socket.on('connect', joinRoom);
        }

        // Request initial state in case we missed the update
        socket.emit('get_room_state', { roomId });

        socket.on('room_users_update', (roomUsers: User[]) => {
            console.log('Users updated:', roomUsers);
            setUsers(roomUsers);
            const me = roomUsers.find(u => u.id === socket.id);
            if (me) setCurrentUser(me);
        });

        socket.on('message_history', (history: Message[]) => {
            setMessages(history);
            // Mark all as read if from others
            if (history.length > 0) {
                // simplified read marking for now
            }
        });

        socket.on('receive_message', (message: Message) => {
            setMessages(prev => [...prev, message]);

            // Mark read if it's not from me
            if (message.sender !== effectiveUsername) {
                socket.emit('mark_read', { messageId: message.id, roomId });
            }
        });

        socket.on('message_status_update', ({ id, status }: { id: string, status: 'read' }) => {
            setMessages(prev => prev.map(msg => msg.id === id ? { ...msg, status } : msg));
        });

        socket.on('user_joined', ({ username }) => {
            setMessages(prev => [...prev, { id: Date.now().toString(), text: `${username} joined the room.`, sender: 'System', timestamp: new Date().toISOString() }]);
        });

        socket.on('user_left', ({ username }) => {
            setMessages(prev => [...prev, { id: Date.now().toString(), text: `${username} left the room.`, sender: 'System', timestamp: new Date().toISOString() }]);
        });

        socket.on('error', (msg: string) => {
            console.error('Socket Error:', msg);
            setError(msg);
        });

        return () => {
            socket.off('connect', joinRoom);
            socket.off('room_users_update');
            socket.off('receive_message');
            socket.off('user_joined');
            socket.off('user_left');
            socket.off('message_history');
            socket.off('message_status_update');
            socket.off('error');
        };
    }, [socket, roomId, location.state, navigate, user]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, activeTab]);

    const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'ringing' | 'connected'>(
        location.state?.callConnected ? 'connected' : 'idle'
    );
    const [incomingCall, setIncomingCall] = useState<{ callerId: string, callerName: string } | null>(null);

    // WebRTC: Enabled if NOT DM, OR if DM and Call is Connected
    const webrtcEnabled = !isDM || callStatus === 'connected';

    // WebRTC
    const { peers, toggleMute: toggleAudioMute, stream, logs } = useWebRTC(socket, roomId || '', currentUser?.id || '', webrtcEnabled);

    useEffect(() => {
        if (!socket) return;

        socket.on('incoming_call', ({ callerId, callerName }) => {
            if (callStatus === 'idle') {
                setIncomingCall({ callerId, callerName });
                setCallStatus('ringing');
            }
        });

        socket.on('call_accepted', () => {
            if (callStatus === 'calling') {
                setCallStatus('connected');
            }
        });

        socket.on('call_declined', () => {
            setCallStatus('idle');
            alert('Call Declined');
        });

        socket.on('call_ended', () => {
            setCallStatus('idle');
            setIncomingCall(null);
        });

        return () => {
            socket.off('incoming_call');
            socket.off('call_accepted');
            socket.off('call_declined');
            socket.off('call_ended');
        };
    }, [socket, callStatus]);

    const initiateCall = () => {
        if (socket) {
            setCallStatus('calling');
            socket.emit('initiate_call', {
                roomId,
                callerName: currentUser?.username,
                callerUserId: user?.id || currentUser?.userId || currentUser?.id
            });
        }
    };

    const acceptCall = () => {
        if (socket) {
            socket.emit('accept_call', { roomId });
            setCallStatus('connected');
            setIncomingCall(null);
        }
    };

    const declineCall = () => {
        if (socket) {
            socket.emit('decline_call', { roomId });
            setCallStatus('idle');
            setIncomingCall(null);
        }
    };

    const endCall = () => {
        if (socket) {
            socket.emit('end_call', { roomId });
            setCallStatus('idle');
        }
    };

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
        alert('Room Code Copied: ' + roomId);
    };



    const friendUsername = location.state?.friendUsername;

    useEffect(() => {
        if (isDM) setActiveTab('chat');
    }, [isDM]);

    const leaveRoom = () => {
        if (isDM) {
            navigate('/');
            // window.location.reload(); // Not needed for DM simple back? 
            // Ideally we leave the room socket-wise too, but keeping it optional is okay. 
            // To be clean:
            window.location.reload();
        } else {
            if (confirm('Are you sure you want to leave?')) {
                navigate('/');
                window.location.reload();
            }
        }
    };

    if (error) {
        return (
            <div className="container" style={{ justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: '16px' }}>
                <h2 style={{ color: 'var(--danger)' }}>Error</h2>
                <p>{error}</p>
                <button className="btn-secondary" onClick={() => navigate('/')}>Go Home</button>
            </div>
        );
    }

    if (!currentUser) return (
        <div className="container" style={{ justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: '8px' }}>
            <p>Loading Room...</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Waiting for server response...</p>
        </div>
    );

    return (
        <div className="container" style={{ height: '100vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>

            {/* Calling Overlay (Outgoing) */}
            {callStatus === 'calling' && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.85)', zIndex: 50,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '24px'
                }}>
                    <div className="animate-pulse" style={{ width: 100, height: 100, borderRadius: '50%', background: 'rgba(99, 102, 241, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <UserIcon size={48} color="var(--primary)" />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <h3 style={{ fontSize: '1.5rem' }}>Calling {friendUsername || 'User'}...</h3>
                        <p style={{ color: 'var(--text-muted)' }}>Waiting for response</p>
                    </div>
                    <button onClick={endCall} style={{ background: 'var(--danger)', padding: '16px', borderRadius: '50%', color: 'white', border: 'none' }}>
                        <PhoneOff size={32} />
                    </button>
                </div>
            )}

            {/* Incoming Call Overlay */}
            {callStatus === 'ringing' && incomingCall && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.9)', zIndex: 60,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '32px'
                }}>
                    <div className="animate-bounce" style={{ width: 100, height: 100, borderRadius: '50%', background: 'rgba(34, 197, 94, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <PhoneIncoming size={48} color="var(--success)" />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <h3 style={{ fontSize: '1.8rem' }}>{incomingCall.callerName}</h3>
                        <p style={{ color: 'var(--text-muted)' }}>Incoming Voice Call</p>
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

            {/* Header */}
            <div style={{ padding: '16px', background: 'var(--bg-card)', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    {isDM ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #4f46e5, #ec4899)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{friendUsername?.charAt(0).toUpperCase() || '?'}</span>
                            </div>
                            <div>
                                <h2 style={{ fontSize: '1.2rem', fontWeight: '700' }}>{friendUsername || 'Private Chat'}</h2>
                                {callStatus === 'connected' && <span style={{ fontSize: '0.8rem', color: 'var(--success)' }}>Call Connected</span>}
                            </div>
                        </div>
                    ) : (
                        <div>
                            <h2 style={{ fontSize: '1.2rem', fontWeight: '700' }}>Room: <span style={{ fontFamily: 'monospace', color: 'var(--primary)', cursor: 'pointer' }} onClick={copyRoomCode}>{roomId} <Copy size={14} style={{ display: 'inline' }} /></span></h2>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{users.length} Online</span>
                        </div>
                    )}
                </div>
                {isDM ? (
                    <button onClick={leaveRoom} style={{ background: 'transparent', color: 'var(--text-muted)', padding: '8px', borderRadius: '50%' }}>
                        <span style={{ fontSize: '1.2rem' }}>←</span>
                    </button>
                ) : (
                    <button onClick={leaveRoom} style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: '8px', borderRadius: '50%' }}>
                        <PhoneOff size={20} />
                    </button>
                )}
            </div>

            {/* Tabs (Hidden for DM) */}
            {!isDM && (
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
            )}

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
                                                borderTopLeftRadius: msg.sender !== currentUser.username ? '4px' : '18px',
                                                position: 'relative',
                                                paddingBottom: '20px' // Make room for tick
                                            }}>
                                                {msg.text}
                                                {msg.sender === currentUser.username && (
                                                    <span style={{ position: 'absolute', bottom: '4px', right: '8px', fontSize: '0.6rem' }}>
                                                        {msg.status === 'read' ? '✓✓' : '✓'}
                                                    </span>
                                                )}
                                            </div>
                                            {msg.sender === currentUser.username && (
                                                <style>
                                                    {`
                                                        span[title="Read"] { color: #4ade80; }
                                                    `}
                                                </style>
                                            )}
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
                                                {u.userId && !u.userId.startsWith('guest-') ? (
                                                    <span title="Registered User">✅</span>
                                                ) : (
                                                    <span title="Guest User">❓</span>
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

            {/* Footer Controls */}
            <div style={{ padding: '16px', background: 'var(--bg-card)', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>

                {/* Microphone - Show in Group Rooms OR if Call is Connected in DM */}
                {(!isDM || callStatus === 'connected') && (
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
                )}

                {/* Call Button - Show ONLY in DM when Idle */}
                {isDM && callStatus === 'idle' && (
                    <button onClick={initiateCall} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'transparent', color: 'var(--success)' }}>
                        <div style={{ padding: '12px', background: 'rgba(34, 197, 94, 0.1)', borderRadius: '50%' }}>
                            <Phone size={24} />
                        </div>
                        <span style={{ fontSize: '0.75rem' }}>Call</span>
                    </button>
                )}

                {/* End Call Button - Show ONLY in DM when Connected */}
                {isDM && callStatus === 'connected' && (
                    <button onClick={endCall} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'transparent', color: 'var(--danger)' }}>
                        <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '50%' }}>
                            <PhoneOff size={24} />
                        </div>
                        <span style={{ fontSize: '0.75rem' }}>End</span>
                    </button>
                )}

                {/* Start Game - Show ONLY in Group Rooms */}
                {!isDM && (
                    <button disabled style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'transparent', color: 'var(--text-muted)', opacity: 0.5 }}>
                        <div style={{ padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '50%' }}>
                            <MessageSquare size={24} />
                        </div>
                        <span style={{ fontSize: '0.75rem' }}>Start Game</span>
                    </button>
                )}
            </div>

        </div>
    );
};

export default Room;
