import React, { useEffect, useRef } from 'react';

interface VoiceVisualizerProps {
    stream: MediaStream | null | undefined;
    isMuted?: boolean;
}

const VoiceVisualizer: React.FC<VoiceVisualizerProps> = ({ stream, isMuted }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

    useEffect(() => {
        if (!stream || isMuted) {
            if (canvasRef.current) {
                const ctx = canvasRef.current.getContext('2d');
                ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            }
            return;
        }

        const init = () => {
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            }

            const ctx = audioContextRef.current;
            if (ctx.state === 'suspended') {
                ctx.resume();
            }

            // Check if stream is active
            if (stream.getAudioTracks().length === 0) return;

            analyserRef.current = ctx.createAnalyser();
            analyserRef.current.fftSize = 256;

            try {
                sourceRef.current = ctx.createMediaStreamSource(stream);
                sourceRef.current.connect(analyserRef.current);
                draw();
            } catch (e) {
                console.error("Error creating media source", e);
            }
        };

        const draw = () => {
            if (!canvasRef.current || !analyserRef.current) return;

            const bufferLength = analyserRef.current.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            analyserRef.current.getByteFrequencyData(dataArray);

            // Average volume
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
                sum += dataArray[i];
            }
            const average = sum / bufferLength;

            const ctx = canvasRef.current.getContext('2d');
            if (ctx) {
                const width = canvasRef.current.width;
                const height = canvasRef.current.height;

                ctx.clearRect(0, 0, width, height);

                // Draw a dynamic bar/circle
                // Let's do a simple vertical bar
                const barHeight = (average / 150) * height; // Scale it

                const gradient = ctx.createLinearGradient(0, height, 0, 0);
                gradient.addColorStop(0, '#10b981'); // Green
                gradient.addColorStop(1, '#34d399');

                ctx.fillStyle = gradient;
                // Center it
                const barWidth = 6;
                ctx.beginPath();
                ctx.roundRect((width - barWidth) / 2, height - barHeight, barWidth, barHeight, 4);
                ctx.fill();
            }

            animationRef.current = requestAnimationFrame(draw);
        };

        init();

        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
            if (sourceRef.current) sourceRef.current.disconnect();
            // Do not close AudioContext as it might be shared or expensive to recreate constantly
        };
    }, [stream, isMuted]);

    return <canvas ref={canvasRef} width={20} height={30} style={{ display: 'block' }} />;
};

export default VoiceVisualizer;
