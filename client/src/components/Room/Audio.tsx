import { useEffect, useRef, useState } from "react";
import SimplePeer from "simple-peer";
import VoiceVisualizer from "./VoiceVisualizer";

const Audio = ({ peer, stream }: { peer?: SimplePeer.Instance, stream: MediaStream | null }) => {
    const ref = useRef<HTMLAudioElement>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const retryCountRef = useRef(0);
    const maxRetries = 10;
    const [isPlaying, setIsPlaying] = useState(false);

    // Initialize AudioContext and ensure it's resumed
    const ensureAudioContext = async () => {
        try {
            if (!audioContextRef.current) {
                // @ts-ignore - AudioContext is available in browsers
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                if (AudioContextClass) {
                    audioContextRef.current = new AudioContextClass();
                    console.log('[Audio] AudioContext created');
                }
            }

            if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
                console.log('[Audio] Resuming suspended AudioContext...');
                await audioContextRef.current.resume();
                console.log('[Audio] AudioContext resumed successfully, state:', audioContextRef.current.state);
            }
        } catch (e) {
            console.error('[Audio] Failed to initialize/resume AudioContext:', e);
        }
    };

    // Setup user interaction listeners to unlock audio on mobile
    useEffect(() => {
        const unlockAudio = async () => {
            console.log('[Audio] User interaction detected, unlocking audio...');
            await ensureAudioContext();

            // Try to play any pending audio
            if (ref.current && ref.current.srcObject && !isPlaying) {
                try {
                    await ref.current.play();
                    setIsPlaying(true);
                    console.log('[Audio] Audio unlocked and playing after user interaction');
                } catch (e) {
                    console.error('[Audio] Failed to play after user interaction:', e);
                }
            }
        };

        // Listen for various user interaction events (critical for mobile)
        document.addEventListener('touchstart', unlockAudio, { once: true });
        document.addEventListener('touchend', unlockAudio, { once: true });
        document.addEventListener('click', unlockAudio, { once: true });

        return () => {
            document.removeEventListener('touchstart', unlockAudio);
            document.removeEventListener('touchend', unlockAudio);
            document.removeEventListener('click', unlockAudio);
        };
    }, [isPlaying]);

    useEffect(() => {
        const playAudio = async (audioStream: MediaStream, retryCount = 0) => {
            if (!ref.current) return;

            try {
                console.log(`[Audio] Attempting to play audio stream (attempt ${retryCount + 1})...`);

                // Ensure AudioContext is active FIRST
                await ensureAudioContext();

                // Configure audio element for mobile
                const audioEl = ref.current;
                audioEl.setAttribute('playsinline', 'true');
                audioEl.setAttribute('webkit-playsinline', 'true');
                audioEl.muted = false;
                audioEl.volume = 1.0;

                // Set the stream
                audioEl.srcObject = audioStream;

                // Wait for loadedmetadata event (important for mobile)
                await new Promise<void>((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error('Timeout waiting for loadedmetadata'));
                    }, 5000);

                    const handleLoadedMetadata = () => {
                        clearTimeout(timeout);
                        console.log('[Audio] Audio metadata loaded');
                        resolve();
                    };

                    if (audioEl.readyState >= 1) {
                        // Metadata already loaded
                        clearTimeout(timeout);
                        resolve();
                    } else {
                        audioEl.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
                    }
                });

                // Attempt to play
                await audioEl.play();
                setIsPlaying(true);
                retryCountRef.current = 0; // Reset retry count on success
                console.log('[Audio] Audio playing successfully');
            } catch (e: any) {
                console.error(`[Audio] Audio play failed (attempt ${retryCount + 1}):`, e.message);

                // Retry with exponential backoff
                if (retryCount < maxRetries) {
                    const delay = Math.min(300 * Math.pow(1.5, retryCount), 3000);
                    console.log(`[Audio] Retrying in ${delay}ms...`);

                    setTimeout(() => {
                        playAudio(audioStream, retryCount + 1);
                    }, delay);
                } else {
                    console.error('[Audio] Max retries reached. Waiting for user interaction...');
                    // The user interaction listeners will handle this
                }
            }
        };

        if (ref.current) {
            // Reset playing state when stream changes
            setIsPlaying(false);
            retryCountRef.current = 0;

            if (stream) {
                console.log('[Audio] Direct stream provided');
                playAudio(stream);
            } else if (peer) {
                console.log('[Audio] Waiting for peer stream...');
                const handleStream = (s: MediaStream) => {
                    console.log('[Audio] Received peer stream');
                    playAudio(s);
                };

                peer.on("stream", handleStream);

                // Cleanup peer listener
                return () => {
                    peer.off("stream", handleStream);
                };
            }
        }

        // Cleanup
        return () => {
            if (ref.current) {
                ref.current.pause();
                ref.current.srcObject = null;
            }
        };
    }, [stream, peer]);

    return (
        <div style={{ display: 'inline-block', margin: '4px', position: 'relative' }}>
            <audio
                playsInline
                autoPlay
                muted={false}
                ref={ref}
                style={{ display: 'none' }}
            />
            {stream && <VoiceVisualizer stream={stream} />}
            {!isPlaying && stream && (
                <div style={{
                    position: 'absolute',
                    top: -10,
                    left: 0,
                    fontSize: '0.6rem',
                    color: 'orange',
                    whiteSpace: 'nowrap'
                }}>
                    🔊 Connecting...
                </div>
            )}
        </div>
    );
};

export default Audio;
