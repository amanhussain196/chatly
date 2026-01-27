import React, { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';

interface PingPongProps {
    gameState: any;
    socket: Socket | null;
    roomId: string;
    currentUserId: string;
    isHost: boolean;
}

const BOARD_WIDTH = 800;
const BOARD_HEIGHT = 600;
const PADDLE_HEIGHT = 100;
const BALL_SIZE = 10;

const PingPong: React.FC<PingPongProps> = ({ gameState, socket, roomId, currentUserId, isHost }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Identify if I am Player 1 (Left) or Player 2 (Right) or Spectator
    const p1 = gameState.players[0];
    const p2 = gameState.players[1];
    const isP1 = currentUserId === p1.id;
    const isP2 = currentUserId === p2.id;
    const isSpectator = !isP1 && !isP2;

    const [winner, setWinner] = useState<any>(null);

    useEffect(() => {
        if (gameState.winner) {
            const winPlayer = gameState.players.find((p: any) => p.id === gameState.winner);
            setWinner(winPlayer);
        } else {
            setWinner(null);
        }
    }, [gameState.winner]);

    // Input Handling (Mouse/Touch)
    const handleInput = (clientY: number) => {
        if (isSpectator || !socket || winner) return;

        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            // Calculate scale if canvas is resized via CSS
            const scaleY = BOARD_HEIGHT / rect.height;
            const relativeY = (clientY - rect.top) * scaleY;

            // Center the paddle on the mouse
            const targetY = relativeY - (PADDLE_HEIGHT / 2);

            socket.emit('paddle_move', { roomId, y: targetY });
        }
    };

    const onMouseMove = (e: React.MouseEvent) => handleInput(e.clientY);
    const onTouchMove = (e: React.TouchEvent) => handleInput(e.touches[0].clientY);

    // Drawing & Animation Loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;

        // Visual State (Interpolated)
        const visualBall = { x: gameState.ball.x, y: gameState.ball.y };

        const render = () => {
            // Lerp towards target (Simple Smoothing: move 20% of the distance per frame)
            visualBall.x += (gameState.ball.x - visualBall.x) * 0.3;
            visualBall.y += (gameState.ball.y - visualBall.y) * 0.3;

            // Clear
            ctx.fillStyle = '#1e293b'; // Dark background
            ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

            // Mid Dotted Line
            ctx.beginPath();
            ctx.setLineDash([15, 15]);
            ctx.moveTo(BOARD_WIDTH / 2, 0);
            ctx.lineTo(BOARD_WIDTH / 2, BOARD_HEIGHT);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 4;
            ctx.stroke();
            ctx.setLineDash([]); // Reset

            // Render Paddles (Use direct state for paddles as they are instantaneous or controlled by different events)
            // P1 (Left) - Blue
            ctx.fillStyle = '#3b82f6';
            ctx.fillRect(20, gameState.players[0].y, 10, PADDLE_HEIGHT);

            // P2 (Right) - Red
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(BOARD_WIDTH - 30, gameState.players[1].y, 10, PADDLE_HEIGHT);

            // Render Ball - White (Use interpolated Visual Position)
            ctx.beginPath();
            ctx.fillStyle = '#ffffff';
            ctx.arc(visualBall.x + BALL_SIZE / 2, visualBall.y + BALL_SIZE / 2, BALL_SIZE / 2, 0, Math.PI * 2);
            ctx.fill();

            // Debug/Difficulty Info
            if (gameState.difficulty > 0) {
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.font = '14px monospace';
                ctx.fillText(`Speed: x${(1 + gameState.difficulty / 10).toFixed(1)}`, BOARD_WIDTH / 2 - 40, BOARD_HEIGHT - 20);
            }

            animationFrameId = requestAnimationFrame(render);
        };

        render();

        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, [gameState]);


    return (
        <div style={{
            width: '100%', height: '100%',
            display: 'flex', flexDirection: 'column',
            justifyContent: 'center', alignItems: 'center',
            background: 'rgba(0,0,0,0.9)', color: 'white'
        }}>

            {/* Header / Scoreboard */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '800px',
                marginBottom: '10px', padding: '0 20px'
            }}>
                <div style={{ textAlign: 'left', color: '#3b82f6' }}>
                    <h3 style={{ margin: 0 }}>{p1.username} {isP1 ? '(YOU)' : ''}</h3>
                    <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                        {[...Array(3)].map((_, i) => (
                            <span key={i} style={{ opacity: i < p1.lives ? 1 : 0.2 }}>❤️</span>
                        ))}
                    </div>
                </div>

                <div style={{ textAlign: 'right', color: '#ef4444' }}>
                    <h3 style={{ margin: 0 }}>{p2.username} {isP2 ? '(YOU)' : ''}</h3>
                    <div style={{ display: 'flex', gap: '4px', marginTop: '4px', justifyContent: 'flex-end' }}>
                        {[...Array(3)].map((_, i) => (
                            <span key={i} style={{ opacity: i < p2.lives ? 1 : 0.2 }}>❤️</span>
                        ))}
                    </div>
                </div>
            </div>

            {/* Game Board Container */}
            <div
                ref={containerRef}
                onMouseMove={onMouseMove}
                onTouchMove={onTouchMove}
                style={{
                    position: 'relative',
                    width: '100%', maxWidth: '800px',
                    aspectRatio: '4/3',
                    border: '4px solid #334155',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    cursor: (isP1 || isP2) ? 'none' : 'default', // Hide cursor for players
                    touchAction: 'none'
                }}
            >
                <canvas
                    ref={canvasRef}
                    width={BOARD_WIDTH}
                    height={BOARD_HEIGHT}
                    style={{ width: '100%', height: '100%' }} // Responsive scaling
                />

                {/* Overlays */}
                {winner && (
                    <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.8)',
                        display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center'
                    }}>
                        <h1 style={{ fontSize: '3rem', color: winner.id === p1.id ? '#3b82f6' : '#ef4444' }}>
                            {winner.username} WINS!
                        </h1>
                        {isHost && (
                            <button
                                onClick={() => socket?.emit('restart_game', { roomId })}
                                style={{ padding: '16px 32px', fontSize: '1.2rem', marginTop: '20px', cursor: 'pointer', background: 'white', color: 'black', border: 'none', borderRadius: '8px' }}
                            >
                                Play Again
                            </button>
                        )}
                        {isHost && (
                            <button
                                onClick={() => socket?.emit('end_game', { roomId })}
                                style={{ marginTop: '10px', background: 'transparent', color: '#94a3b8', border: 'none', textDecoration: 'underline', cursor: 'pointer' }}
                            >
                                Close Game
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Host Controls (Bottom) */}
            {isHost && !winner && (
                <div style={{ marginTop: '20px' }}>
                    <button
                        onClick={() => socket?.emit('end_game', { roomId })}
                        style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}
                    >
                        End Game
                    </button>
                </div>
            )}

            {isSpectator && (
                <p style={{ color: '#94a3b8', marginTop: '10px' }}>Spectating Mode</p>
            )}
        </div>
    );
};

export default PingPong;
