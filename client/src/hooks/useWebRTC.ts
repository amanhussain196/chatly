import { useEffect, useRef, useState } from 'react';
import SimplePeer from 'simple-peer';
import { Socket } from 'socket.io-client';

interface Peer {
    peerID: string;
    peer: SimplePeer.Instance;
    stream: MediaStream | null;
    connectionState: 'new' | 'connecting' | 'connected' | 'failed' | 'disconnected';
    isInitiator: boolean;
}

export const useWebRTC = (socket: Socket | null, roomId: string, userId: string, enabled: boolean = true) => {
    const [peers, setPeers] = useState<Peer[]>([]);
    const peersRef = useRef<Peer[]>([]);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [logs, setLogs] = useState<string[]>([]);

    const streamRef = useRef<MediaStream | null>(null);

    const addLog = (msg: string) => {
        console.log(msg);
        setLogs(prev => [...prev.slice(-19), new Date().toLocaleTimeString() + ': ' + msg]);
    };

    const updatePeerState = (id: string, state: Peer['connectionState']) => {
        const index = peersRef.current.findIndex(p => p.peerID === id);
        if (index > -1) {
            peersRef.current[index].connectionState = state;
            setPeers([...peersRef.current]);
        }
    };

    // Helper to update stream safely
    const updatePeerStream = (id: string, stream: MediaStream) => {
        const index = peersRef.current.findIndex(p => p.peerID === id);
        if (index > -1) {
            peersRef.current[index].stream = stream;
            setPeers([...peersRef.current]);
        }
    };

    useEffect(() => {
        if (!socket || !userId || !enabled) return;

        let isCancelled = false;

        const initWebRTC = async () => {
            try {
                addLog('Requesting user media...');

                // Request audio with mobile-optimized settings
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: false,
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                        sampleRate: 48000,
                        // Mobile-specific constraints
                        channelCount: 1, // Mono for better mobile performance
                    }
                });

                if (isCancelled) {
                    stream.getTracks().forEach(t => t.stop());
                    return;
                }

                // Ensure audio tracks are enabled (critical for mobile)
                stream.getAudioTracks().forEach(track => {
                    track.enabled = true;
                    console.log(`Audio track enabled: ${track.id}, state: ${track.readyState}`);
                });

                addLog(`Got local stream: ${stream.id} with ${stream.getAudioTracks().length} audio tracks`);
                streamRef.current = stream;
                setLocalStream(stream);

                socket.emit('webrtc_ready', { roomId });

                socket.on('webrtc_ready', (payload: { id: string }) => {
                    if (payload.id === socket.id) return;
                    addLog(`New user ready: ${payload.id}`);

                    if (peersRef.current.find(p => p.peerID === payload.id)) return;

                    try {
                        addLog(`Creating initiator peer for ${payload.id}`);
                        const peer = createPeer(payload.id, socket.id!, stream);
                        const peerObj: Peer = {
                            peerID: payload.id,
                            peer,
                            stream: null,
                            connectionState: 'connecting',
                            isInitiator: true
                        };
                        peersRef.current.push(peerObj);
                        setPeers([...peersRef.current]);
                    } catch (e: any) {
                        addLog(`CRITICAL Error creating initiator peer: ${e.message}`);
                        console.error(e);
                    }
                });

                socket.on('signal', (payload: { senderId: string, signal: any }) => {
                    let item = peersRef.current.find(p => p.peerID === payload.senderId);

                    // COLLISION HANDLING
                    // If we are trying to initiate (have a peer) AND the incoming signal is an OFFER,
                    // it means we have a race condition (glare).
                    if (item && item.isInitiator && payload.signal.type === 'offer') {
                        addLog(`Collision detected with ${payload.senderId}`);
                        // Tie-breaker: If my ID is "smaller", I surrender my initiator role.
                        if (socket.id! < payload.senderId) {
                            addLog(`I am smaller (${socket.id} < ${payload.senderId}), surrendering initiator role.`);
                            item.peer.destroy();
                            peersRef.current = peersRef.current.filter(p => p.peerID !== payload.senderId);
                            item = undefined; // Treat as if we have no peer, so we accept their offer below
                        } else {
                            addLog(`I am larger, ignoring their offer. Waiting for my answer.`);
                            return; // Ignore this signal. They will surrender.
                        }
                    }

                    // If peer exists but is failed/destroyed, we might want to replace it
                    // (Unless we just destroyed it above intentionally)
                    if (item && !item.peer.destroyed) {
                        item.peer.signal(payload.signal);
                    } else {
                        // If it existed but was destroyed (or surrendered), remove it first (cleanly)
                        if (item) {
                            peersRef.current = peersRef.current.filter(p => p.peerID !== payload.senderId);
                        }

                        addLog(`Received signal from new/reconnecting peer: ${payload.senderId}`);
                        const peer = addPeer(payload.signal, payload.senderId, stream);
                        const peerObj: Peer = {
                            peerID: payload.senderId,
                            peer,
                            stream: null,
                            connectionState: 'connecting',
                            isInitiator: false
                        };
                        peersRef.current.push(peerObj);
                        setPeers([...peersRef.current]);
                    }
                });

                socket.on('request_reconnect', ({ requesterId }: { requesterId: string }) => {
                    addLog(`Received reconnect request from ${requesterId}`);

                    const existingPeer = peersRef.current.find(p => p.peerID === requesterId);

                    // Prevent double-restart: if we are already connecting to them, ignore 
                    if (existingPeer && existingPeer.connectionState === 'connecting') {
                        addLog(`Ignored reconnect request from ${requesterId} - already connecting.`);
                        return;
                    }

                    if (existingPeer) {
                        if (existingPeer.peer) existingPeer.peer.destroy();
                    }

                    // Remove old record
                    peersRef.current = peersRef.current.filter(p => p.peerID !== requesterId);

                    // Create NEW initiator peer
                    try {
                        const peer = createPeer(requesterId, socket.id!, stream);
                        const peerObj: Peer = {
                            peerID: requesterId,
                            peer,
                            stream: null,
                            connectionState: 'connecting',
                            isInitiator: true
                        };
                        peersRef.current.push(peerObj);
                        setPeers([...peersRef.current]);
                        addLog(`Re-created initiator peer for ${requesterId}`);
                    } catch (e: any) {
                        addLog(`Error re-creating peer: ${e.message}`);
                    }
                });

                socket.on('user_left', (payload: { id: string }) => {
                    addLog(`User left: ${payload.id}`);
                    const peerObj = peersRef.current.find(p => p.peerID === payload.id);
                    if (peerObj) {
                        peerObj.peer.destroy();
                    }
                    const newPeers = peersRef.current.filter(p => p.peerID !== payload.id);
                    peersRef.current = newPeers;
                    setPeers(newPeers);
                });

            } catch (err: any) {
                addLog(`Failed to get user media: ${err.message}`);
                console.error("Failed to get user media", err);
            }
        };

        initWebRTC();

        return () => {
            isCancelled = true;
            addLog("Cleaning up WebRTC");

            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }

            socket.off('webrtc_ready');
            socket.off('signal');
            socket.off('user_left');
            socket.off('request_reconnect');

            peersRef.current.forEach(p => p.peer.destroy());
            peersRef.current = [];
            setPeers([]);
        };
    }, [socket, userId, roomId, enabled]);

    function createPeer(userToSignal: string, _callerID: string, stream: MediaStream) {
        const peer = new SimplePeer({
            initiator: true,
            trickle: true,
            stream,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                    { urls: 'stun:stun3.l.google.com:19302' },
                    { urls: 'stun:stun4.l.google.com:19302' },
                    {
                        urls: 'turn:openrelay.metered.ca:80',
                        username: 'openrelayproject',
                        credential: 'openrelayproject'
                    },
                    {
                        urls: 'turn:openrelay.metered.ca:443',
                        username: 'openrelayproject',
                        credential: 'openrelayproject'
                    },
                    {
                        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                        username: 'openrelayproject',
                        credential: 'openrelayproject'
                    }
                ],
                iceTransportPolicy: 'all',
                iceCandidatePoolSize: 10
            }
        });

        peer.on('signal', (signal) => {
            socket?.emit('signal', { targetId: userToSignal, signal });
        });

        peer.on('stream', (remoteStream) => {
            addLog(`Received stream from ${userToSignal}`);
            updatePeerStream(userToSignal, remoteStream);
        });

        peer.on('connect', () => {
            addLog(`Peer connected (Init): ${userToSignal}`);
            updatePeerState(userToSignal, 'connected');
        });

        peer.on('error', (err) => {
            addLog(`Peer error (Init) ${userToSignal}: ${err.message}`);
            updatePeerState(userToSignal, 'failed');

            // Attempt reconnection after a delay
            setTimeout(() => {
                if (streamRef.current) {
                    // Check if a REPLACEMENT peer is already connecting (prevent double-connect)
                    const currentPeer = peersRef.current.find(p => p.peerID === userToSignal);

                    // distinct check: ensure we don't block ourselves if WE are the one who failed
                    // SimplePeer instances don't have a unique ID property exposed easily, but object reference works.
                    // However, we don't have reference to the 'new' peer created by request_reconnect here easily without looking at the array.

                    if (currentPeer && currentPeer.connectionState === 'connecting' && currentPeer.peer !== peer) {
                        addLog(`Reconnection to ${userToSignal} already in progress by another peer. Skipping.`);
                        return;
                    }

                    addLog(`Attempting to reconnect to ${userToSignal}...`);

                    // Clean up old peer if it exists
                    if (currentPeer) {
                        currentPeer.peer.destroy();
                        peersRef.current = peersRef.current.filter(p => p.peerID !== userToSignal);
                    }

                    const newPeer = createPeer(userToSignal, socket?.id || '', streamRef.current);
                    const peerObj: Peer = {
                        peerID: userToSignal,
                        peer: newPeer,
                        stream: null,
                        connectionState: 'connecting',
                        isInitiator: true
                    };
                    peersRef.current.push(peerObj);
                    setPeers([...peersRef.current]);
                }
            }, 3000);
        });

        // Add close/disconnect handlers
        peer.on('close', () => {
            addLog(`Peer closed (Init): ${userToSignal}`);
            updatePeerState(userToSignal, 'disconnected');
        });

        // Monitor ICE connection state
        // @ts-ignore - _pc is internal SimplePeer property
        if (peer._pc) {
            // @ts-ignore
            peer._pc.oniceconnectionstatechange = () => {
                // @ts-ignore
                const state = peer._pc?.iceConnectionState;
                addLog(`ICE state (Init) ${userToSignal}: ${state}`);

                if (state === 'failed' || state === 'disconnected') {
                    updatePeerState(userToSignal, 'failed');
                } else if (state === 'connected' || state === 'completed') {
                    updatePeerState(userToSignal, 'connected');
                }
            };
        }

        return peer;
    }

    function addPeer(incomingSignal: any, callerID: string, stream: MediaStream) {
        const peer = new SimplePeer({
            initiator: false,
            trickle: true,
            stream,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                    { urls: 'stun:stun3.l.google.com:19302' },
                    { urls: 'stun:stun4.l.google.com:19302' },
                    {
                        urls: 'turn:openrelay.metered.ca:80',
                        username: 'openrelayproject',
                        credential: 'openrelayproject'
                    },
                    {
                        urls: 'turn:openrelay.metered.ca:443',
                        username: 'openrelayproject',
                        credential: 'openrelayproject'
                    },
                    {
                        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                        username: 'openrelayproject',
                        credential: 'openrelayproject'
                    }
                ],
                iceTransportPolicy: 'all',
                iceCandidatePoolSize: 10
            }
        });

        peer.on('signal', (signal) => {
            socket?.emit('signal', { targetId: callerID, signal });
        });

        peer.on('stream', (remoteStream) => {
            addLog(`Received stream from ${callerID}`);
            updatePeerStream(callerID, remoteStream);
        });

        peer.on('connect', () => {
            addLog(`Peer connected (Recv): ${callerID}`);
            updatePeerState(callerID, 'connected');
        });

        peer.on('error', (err) => {
            addLog(`Peer error (Recv) ${callerID}: ${err.message}`);
            updatePeerState(callerID, 'failed');

            // Attempt reconnection for receiver peer as well
            setTimeout(() => {
                if (streamRef.current) {
                    addLog(`Attempting to reconnect to ${callerID} (receiver)...`);
                    // Signal to the other peer to reinitiate
                    socket?.emit('request_reconnect', { targetId: callerID });
                }
            }, 3000);
        });

        peer.on('close', () => {
            addLog(`Peer closed (Recv): ${callerID}`);
            updatePeerState(callerID, 'disconnected');
        });

        // Monitor ICE connection state
        // @ts-ignore
        if (peer._pc) {
            // @ts-ignore
            peer._pc.oniceconnectionstatechange = () => {
                // @ts-ignore
                const state = peer._pc?.iceConnectionState;
                addLog(`ICE state (Recv) ${callerID}: ${state}`);

                if (state === 'failed' || state === 'disconnected') {
                    updatePeerState(callerID, 'failed');
                } else if (state === 'connected' || state === 'completed') {
                    updatePeerState(callerID, 'connected');
                }
            };
        }

        peer.signal(incomingSignal);

        return peer;
    }

    const toggleMute = () => {
        if (streamRef.current) {
            const track = streamRef.current.getAudioTracks()[0];
            track.enabled = !track.enabled;
            return !track.enabled;
        }
        return true;
    };

    return { peers, toggleMute, stream: localStream, logs };
};
