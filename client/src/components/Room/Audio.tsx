import { useEffect, useRef } from "react";
import SimplePeer from "simple-peer";
import VoiceVisualizer from "./VoiceVisualizer";

const Audio = ({ peer, stream }: { peer?: SimplePeer.Instance, stream: MediaStream | null }) => {
    const ref = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        if (ref.current) {
            if (stream) {
                ref.current.srcObject = stream;
                ref.current.play().catch(e => console.error("Audio play failed:", e));
            } else if (peer) {
                peer.on("stream", (s) => {
                    if (ref.current) {
                        ref.current.srcObject = s;
                        ref.current.play().catch(e => console.error("Audio play failed (peer event):", e));
                    }
                });
            }
        }
    }, [stream, peer]);

    return (
        <div style={{ display: 'inline-block', margin: '4px' }}>
            <audio playsInline autoPlay ref={ref} />
            {stream && <VoiceVisualizer stream={stream} />}
        </div>
    );
};

export default Audio;
