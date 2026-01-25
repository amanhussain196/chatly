import { useEffect, useRef } from "react";
import SimplePeer from "simple-peer";
import VoiceVisualizer from "./VoiceVisualizer";

const Audio = ({ peer, stream }: { peer?: SimplePeer.Instance, stream: MediaStream | null }) => {
    const ref = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        if (!stream && peer) {
            // Fallback for legacy if needed, but we prefer props
            peer.on("stream", (s) => {
                if (ref.current) ref.current.srcObject = s;
            });
        } else if (stream && ref.current) {
            ref.current.srcObject = stream;
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
