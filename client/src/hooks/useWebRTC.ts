import { useEffect, useRef, useState } from 'react';
import SimplePeer from 'simple-peer';
import { Socket } from 'socket.io-client';

interface Peer {
    peerID: string;
    peer: SimplePeer.Instance;
    stream: MediaStream | null; // Added stream tracking
}

export const useWebRTC = (socket: Socket | null, roomId: string, userId: string) => {
    const [peers, setPeers] = useState<Peer[]>([]);
    const peersRef = useRef<Peer[]>([]);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const streamRef = useRef<MediaStream | null>(null); // Keep ref for cleanup

    useEffect(() => {
        if (!socket || !userId) return;

        // Flag to prevent race conditions during cleanup/init
        let isCancelled = false;

        const initWebRTC = async () => {
            try {
                // Determine if we need to request permissions again or reuse? 
                // Always fresh for safety in this effect lifecycle.
                const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
                if (isCancelled) {
                    // Cleanup usage if effect was cancelled during await
                    stream.getTracks().forEach(t => t.stop());
                    return;
                }

                console.log("Got local stream:", stream.id);
                streamRef.current = stream;
                setLocalStream(stream); // Trigger re-render for UI visualizer

                // Signal that we are ready for WebRTC
                socket.emit('webrtc_ready', { roomId });

                socket.on('webrtc_ready', (payload: { id: string }) => {
                    if (payload.id === socket.id) return;
                    console.log("New user ready, initiating:", payload.id);

                    // Check if we already have a connection to this peer (double JOIN event protection)
                    if (peersRef.current.find(p => p.peerID === payload.id)) return;

                    const peer = createPeer(payload.id, socket.id!, stream);
                    const peerObj: Peer = {
                        peerID: payload.id,
                        peer,
                        stream: null
                    };
                    peersRef.current.push(peerObj);
                    setPeers([...peersRef.current]);
                });

                socket.on('signal', (payload: { senderId: string, signal: any }) => {
                    const item = peersRef.current.find(p => p.peerID === payload.senderId);
                    if (item) {
                        item.peer.signal(payload.signal);
                    } else {
                        console.log("Received signal from new peer:", payload.senderId);
                        const peer = addPeer(payload.signal, payload.senderId, stream);
                        const peerObj: Peer = {
                            peerID: payload.senderId,
                            peer,
                            stream: null
                        };
                        peersRef.current.push(peerObj);
                        setPeers([...peersRef.current]);
                    }
                });

                socket.on('user_left', (payload: { id: string }) => {
                    console.log("User left:", payload.id);
                    const peerObj = peersRef.current.find(p => p.peerID === payload.id);
                    if (peerObj) {
                        peerObj.peer.destroy();
                    }
                    const newPeers = peersRef.current.filter(p => p.peerID !== payload.id);
                    peersRef.current = newPeers;
                    setPeers(newPeers);
                });

            } catch (err) {
                console.error("Failed to get user media", err);
            }
        };

        initWebRTC();

        return () => {
            isCancelled = true;
            console.log("Cleaning up WebRTC");

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
            trickle: false,
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
            console.log("Received remote stream from initiator peer");
            updatePeerStream(userToSignal, remoteStream);
        });

        peer.on('connect', () => console.log("Peer connected (Initiator)"));
        peer.on('error', (err) => console.error("Peer error (Initiator):", err));

        return peer;
    }

    function addPeer(incomingSignal: any, callerID: string, stream: MediaStream) {
        const peer = new SimplePeer({
            initiator: false,
            trickle: false,
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
            console.log("Received remote stream from receiver peer");
            updatePeerStream(callerID, remoteStream);
        });

        peer.on('connect', () => console.log("Peer connected (Receiver)"));
        peer.on('error', (err) => console.error("Peer error (Receiver):", err));

        peer.signal(incomingSignal);

        return peer;
    }

    // Helper to update state safely
    const updatePeerStream = (id: string, stream: MediaStream) => {
        const index = peersRef.current.findIndex(p => p.peerID === id);
        if (index > -1) {
            peersRef.current[index].stream = stream;
            setPeers([...peersRef.current]);
        }
    };

    const toggleMute = () => {
        if (streamRef.current) {
            const track = streamRef.current.getAudioTracks()[0];
            track.enabled = !track.enabled;
            return !track.enabled; // return isMuted (inverted) logic: enabled=true means NOT muted.
            // Actually better to just sync with UI state.
        }
        return true;
    };

    return { peers, toggleMute, stream: localStream };
};
