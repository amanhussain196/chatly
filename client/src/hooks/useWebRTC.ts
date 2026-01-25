import { useEffect, useRef, useState } from 'react';
import SimplePeer from 'simple-peer';
import { Socket } from 'socket.io-client';

interface Peer {
    peerID: string;
    peer: SimplePeer.Instance;
    stream: MediaStream | null;
    connectionState: 'new' | 'connecting' | 'connected' | 'failed' | 'disconnected';
}

export const useWebRTC = (socket: Socket | null, roomId: string, userId: string) => {
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
        if (!socket || !userId) return;

        let isCancelled = false;

        const initWebRTC = async () => {
            try {
                addLog('Requesting user media...');
                const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
                if (isCancelled) {
                    stream.getTracks().forEach(t => t.stop());
                    return;
                }

                addLog(`Got local stream: ${stream.id}`);
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
                            connectionState: 'connecting'
                        };
                        peersRef.current.push(peerObj);
                        setPeers([...peersRef.current]);
                    } catch (e: any) {
                        addLog(`CRITICAL Error creating initiator peer: ${e.message}`);
                        console.error(e);
                    }
                });

                socket.on('signal', (payload: { senderId: string, signal: any }) => {
                    const item = peersRef.current.find(p => p.peerID === payload.senderId);
                    if (item) {
                        item.peer.signal(payload.signal);
                    } else {
                        addLog(`Received signal from new peer: ${payload.senderId}`);
                        const peer = addPeer(payload.signal, payload.senderId, stream);
                        const peerObj: Peer = {
                            peerID: payload.senderId,
                            peer,
                            stream: null,
                            connectionState: 'connecting'
                        };
                        peersRef.current.push(peerObj);
                        setPeers([...peersRef.current]);
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

            peersRef.current.forEach(p => p.peer.destroy());
            peersRef.current = [];
            setPeers([]);
        };
    }, [socket, userId, roomId]);

    function createPeer(userToSignal: string, _callerID: string, stream: MediaStream) {
        const peer = new SimplePeer({
            initiator: true,
            trickle: true,
            stream,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' }
                ]
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
        });

        // Add close/disconnect handlers
        peer.on('close', () => updatePeerState(userToSignal, 'disconnected'));

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
                    { urls: 'stun:global.stun.twilio.com:3478' }
                ]
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
        });

        peer.on('close', () => updatePeerState(callerID, 'disconnected'));

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
