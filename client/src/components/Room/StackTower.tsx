import React, { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';

interface StackTowerProps {
    gameState: any;
    socket: Socket | null;
    roomId: string;
    currentUserId: string;
    isHost: boolean;
}

const BOARD_WIDTH = 400;
const BLOCK_HEIGHT = 20;
const INITIAL_WIDTH = 250;
const SPEED_BASE = 4;

// Color palette for blocks
const BLOCK_COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
    '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
    '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
    '#ec4899', '#f43f5e'
];

const StackTower: React.FC<StackTowerProps> = ({ gameState, socket, roomId, currentUserId, isHost }) => {
    const p1 = gameState.players[0];

    const me = gameState.players.find((p: any) => p.id === currentUserId);
    const opponent = gameState.players.find((p: any) => p.id !== currentUserId);

    if (!me) return null;

    const amIP1 = me.id === p1.id;

    const [myWidth, setMyWidth] = useState(INITIAL_WIDTH);
    const [myScore, setMyScore] = useState(0);
    const [myGameOver, setMyGameOver] = useState(false);

    const movingBlockRef = useRef({
        x: 0,
        direction: 1,
        speed: SPEED_BASE,
        lastTime: 0
    });

    const [localHistory, setLocalHistory] = useState<{ width: number, offset: number, color: string }[]>([]);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const requestRef = useRef<number | undefined>(undefined);

    // Initial Setup / Reset
    useEffect(() => {
        if (me.score === 0 && me.status === 'playing') {
            setMyWidth(INITIAL_WIDTH);
            setMyScore(0);
            setMyGameOver(false);
            setLocalHistory([]);
            // Randomize starting position and direction
            const randomStart = Math.random() > 0.5 ? -150 : 150;
            const randomDir = Math.random() > 0.5 ? 1 : -1;
            movingBlockRef.current = { x: randomStart, direction: randomDir, speed: SPEED_BASE, lastTime: 0 };
        }
    }, [gameState.winner, me.score, me.status]);

    // Animation Loop
    useEffect(() => {
        const animate = (time: number) => {
            if (myGameOver || gameState.winner) {
                draw();
                requestRef.current = requestAnimationFrame(animate);
                return;
            }

            movingBlockRef.current.lastTime = time;

            const currentSpeed = movingBlockRef.current.speed + (myScore * 0.1);

            movingBlockRef.current.x += movingBlockRef.current.direction * currentSpeed;

            if (movingBlockRef.current.x > 200) {
                movingBlockRef.current.direction = -1;
            } else if (movingBlockRef.current.x < -200) {
                movingBlockRef.current.direction = 1;
            }

            draw();
            requestRef.current = requestAnimationFrame(animate);
        };

        const draw = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw Separator
            ctx.fillStyle = '#334155';
            ctx.fillRect(0, canvas.height / 2 - 2, canvas.width, 4);

            // === Draw My Game (Bottom) ===
            ctx.save();
            ctx.translate(canvas.width / 2, canvas.height * 0.75);

            ctx.fillStyle = amIP1 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)';
            ctx.fillRect(-canvas.width / 2, -canvas.height / 4, canvas.width, canvas.height / 2);

            // Tower grows from bottom upward with camera scroll when tall
            const baseY = canvas.height / 4 - BLOCK_HEIGHT; // Bottom of visible area

            // Camera scrolls up when tower gets tall (after ~11 blocks)
            const maxVisibleBlocks = 11;
            const cameraOffset = Math.max(0, (localHistory.length - maxVisibleBlocks) * BLOCK_HEIGHT);

            // Clip to prevent blocks from falling into other areas
            ctx.save();
            ctx.beginPath();
            ctx.rect(-canvas.width / 2, -canvas.height / 4, canvas.width, canvas.height / 2);
            ctx.clip();

            localHistory.forEach((block, index) => {
                const y = baseY - (index * BLOCK_HEIGHT) + cameraOffset; // Stack upward from base with camera offset

                // Draw block with color and border
                ctx.fillStyle = block.color;
                ctx.fillRect(block.offset - block.width / 2, y, block.width, BLOCK_HEIGHT);

                // Draw border
                ctx.strokeStyle = '#1e293b';
                ctx.lineWidth = 2;
                ctx.strokeRect(block.offset - block.width / 2, y, block.width, BLOCK_HEIGHT);
            });

            // Draw Moving Block
            if (!myGameOver && !gameState.winner) {
                const currentY = baseY - (localHistory.length * BLOCK_HEIGHT) + cameraOffset;
                const nextColor = BLOCK_COLORS[localHistory.length % BLOCK_COLORS.length];

                ctx.fillStyle = nextColor;
                ctx.fillRect(movingBlockRef.current.x - myWidth / 2, currentY, myWidth, BLOCK_HEIGHT);

                ctx.strokeStyle = '#1e293b';
                ctx.lineWidth = 2;
                ctx.strokeRect(movingBlockRef.current.x - myWidth / 2, currentY, myWidth, BLOCK_HEIGHT);
            }

            ctx.restore(); // Restore clipping

            ctx.restore();

            // === Draw Opponent Game (Top) ===
            if (opponent) {
                ctx.save();
                ctx.translate(canvas.width / 2, canvas.height * 0.25);

                ctx.fillStyle = amIP1 ? 'rgba(59, 130, 246, 0.1)' : 'rgba(239, 68, 68, 0.1)';
                ctx.fillRect(-canvas.width / 2, -canvas.height / 4, canvas.width, canvas.height / 2);

                const opHistory = opponent.history || [];
                // Tower grows from bottom upward for opponent too with camera scroll
                const opBaseY = canvas.height / 4 - BLOCK_HEIGHT;
                const opCameraOffset = Math.max(0, (opHistory.length - maxVisibleBlocks) * BLOCK_HEIGHT);

                // Clip to prevent blocks from falling into other areas
                ctx.save();
                ctx.beginPath();
                ctx.rect(-canvas.width / 2, -canvas.height / 4, canvas.width, canvas.height / 2);
                ctx.clip();

                opHistory.forEach((block: any, index: number) => {
                    const y = opBaseY - (index * BLOCK_HEIGHT) + opCameraOffset;

                    ctx.fillStyle = block.color || BLOCK_COLORS[index % BLOCK_COLORS.length];
                    ctx.fillRect(block.offset - block.width / 2, y, block.width, BLOCK_HEIGHT);

                    ctx.strokeStyle = '#1e293b';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(block.offset - block.width / 2, y, block.width, BLOCK_HEIGHT);
                });

                ctx.restore(); // Restore clipping

                if (opponent.status === 'gameover') {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                    ctx.font = '20px serif';
                    ctx.fillText("CRASHED", -40, 0);
                }

                ctx.restore();
            }
        };

        requestRef.current = requestAnimationFrame(animate);
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [myGameOver, gameState.winner, myScore, myWidth, localHistory, opponent, amIP1]);

    // Handle Tap / Click
    const handleTap = () => {
        if (myGameOver || gameState.winner || me.status === 'gameover') return;
        if (!socket) return;

        const currentX = movingBlockRef.current.x;

        let newWidth = myWidth;
        let newOffset = currentX;

        if (localHistory.length > 0) {
            const prev = localHistory[localHistory.length - 1];

            const prevLeft = prev.offset - prev.width / 2;
            const prevRight = prev.offset + prev.width / 2;
            const currLeft = currentX - myWidth / 2;
            const currRight = currentX + myWidth / 2;

            const overlapLeft = Math.max(prevLeft, currLeft);
            const overlapRight = Math.min(prevRight, currRight);
            const overlap = overlapRight - overlapLeft;

            if (overlap <= 0) {
                setMyGameOver(true);
                socket.emit('stack_place', { roomId, width: 0, offset: 0, score: myScore, gameOver: true, color: '' });
                return;
            }

            newWidth = overlap;
            newOffset = (overlapLeft + overlapRight) / 2;
        }

        const newScore = myScore + 1;
        const blockColor = BLOCK_COLORS[localHistory.length % BLOCK_COLORS.length];

        setMyWidth(newWidth);
        setMyScore(newScore);
        const newEntry = { width: newWidth, offset: newOffset, color: blockColor };
        setLocalHistory(prev => [...prev, newEntry]);

        // Randomize next block spawn position and direction
        const randomStart = Math.random() > 0.5 ? -150 : 150;
        const randomDir = Math.random() > 0.5 ? 1 : -1;
        movingBlockRef.current.x = randomStart;
        movingBlockRef.current.direction = randomDir;

        socket.emit('stack_place', { roomId, width: newWidth, offset: newOffset, score: newScore, gameOver: false, color: blockColor });
    };

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#0f172a' }}>
            <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, color: 'white' }}>
                Opponent Score: {opponent?.score || 0}
            </div>
            <div style={{ position: 'absolute', bottom: 10, left: 10, zIndex: 10, color: 'white' }}>
                My Score: {myScore}
            </div>

            {gameState.winner && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 20, background: 'rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                    <h1>{gameState.winner === 'draw' ? 'DRAW!' : (gameState.winner === currentUserId ? 'YOU WIN!' : 'YOU LOSE!')}</h1>
                    {isHost && (
                        <button onClick={() => socket?.emit('restart_game', { roomId })} style={{ padding: '10px 20px', fontSize: '1.2rem', marginTop: 10 }}>Play Again</button>
                    )}
                </div>
            )}

            <div
                style={{ width: '100%', maxWidth: '500px', height: '100%', cursor: 'pointer' }}
                onMouseDown={handleTap}
                onTouchStart={handleTap}
            >
                <canvas
                    ref={canvasRef}
                    width={BOARD_WIDTH}
                    height={800}
                    style={{ width: '100%', height: '100%', display: 'block' }}
                />
            </div>
        </div>
    );
};

export default StackTower;
