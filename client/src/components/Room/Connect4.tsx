import React, { useState, useEffect } from 'react';

interface Player {
    id: string;
    username: string;
    color: 'red' | 'blue';
}

interface GameState {
    board: (string | null)[][]; // 6 rows x 7 cols
    turn: string; // socket id
    players: Player[];
    winner: string | null;
    winReason?: string;
    lastMoveTime?: number;
    winningCells?: { r: number, c: number }[]; // For highlighting
}

interface Connect4Props {
    gameState: GameState;
    socket: any;
    roomId: string;
    currentUserId: string;
    isHost: boolean;
}

const Connect4: React.FC<Connect4Props> = ({ gameState, socket, roomId, currentUserId, isHost }) => {
    const { board, turn, players, winner, winningCells, lastMoveTime, winReason } = gameState;

    const isMyTurn = turn === currentUserId;
    const winnerPlayer = players.find(p => p.id === winner);
    const [timeLeft, setTimeLeft] = useState(30);
    const [hoverCol, setHoverCol] = useState<number | null>(null);

    // Timer logic
    useEffect(() => {
        if (winner) {
            setTimeLeft(0);
            return;
        }
        const updateTimer = () => {
            if (!lastMoveTime) return;
            const now = Date.now();
            const elapsed = (now - lastMoveTime) / 1000;
            const remaining = Math.max(0, 30 - elapsed);
            setTimeLeft(Math.floor(remaining));
        };
        updateTimer();
        const interval = setInterval(updateTimer, 500);
        return () => clearInterval(interval);
    }, [lastMoveTime, winner]);

    const handleColumnClick = (colIndex: number) => {
        if (!isMyTurn || winner) return;
        socket.emit('connect4_move', { roomId, column: colIndex });
    };

    const handleBackToRoom = () => {
        socket.emit('end_game', { roomId });
    };

    const handleRestartGame = () => {
        socket.emit('restart_game', { roomId });
    };

    const getStatusMessage = () => {
        if (winner) {
            if (winner === 'draw') return "It's a Draw!";
            if (winner === currentUserId) return `You Won! ${winReason === 'timeout' ? '(Opponent Timeout)' : '🎉'}`;
            if (winnerPlayer) return `${winnerPlayer.username} Won! ${winReason === 'timeout' ? '(Timeout)' : ''}`;
            return "Player Won!";
        }
        if (isMyTurn) return `Your Turn (${timeLeft}s)`;
        const opponent = players.find(p => p.id === turn);
        return `${opponent?.username || 'Opponent'}'s Turn (${timeLeft}s)`;
    };


    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
            height: '100%', width: '100%', background: 'var(--bg-card)', color: 'white',
            padding: '10px', position: 'absolute', top: 0, left: 0, zIndex: 10, overflowY: 'auto'
        }}>
            <div style={{ width: '100%', maxWidth: '600px', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: '20px' }}>

                {/* Header */}
                <div style={{ marginBottom: '15px', textAlign: 'center', width: '100%' }}>
                    <h2 style={{ fontSize: 'clamp(1.5rem, 5vw, 2rem)', fontWeight: 'bold', margin: '0 0 5px 0', background: 'linear-gradient(45deg, #ff2222, #0066ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        Connect 4
                    </h2>
                    <div style={{ fontSize: 'clamp(1rem, 3vw, 1.2rem)', color: isMyTurn && !winner ? 'var(--primary)' : 'var(--text-muted)', fontWeight: '500' }}>
                        {getStatusMessage()}
                    </div>
                </div>

                {/* Players Info */}
                <div style={{ display: 'flex', gap: '40px', marginBottom: '20px', justifyContent: 'center' }}>
                    {players.map(p => (
                        <div key={p.id} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            opacity: turn === p.id ? 1 : 0.6,
                            transform: turn === p.id ? 'scale(1.1)' : 'scale(1)',
                            transition: 'all 0.3s'
                        }}>
                            <div style={{
                                width: '40px', height: '40px', borderRadius: '50%',
                                background: p.color === 'red' ? '#ff2222' : '#0066ff',
                                boxShadow: turn === p.id ? `0 0 15px ${p.color === 'red' ? '#ff2222' : '#0066ff'}` : 'none',
                                border: '3px solid rgba(255,255,255,0.4)',
                                marginBottom: '5px'
                            }} />
                            <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{p.username}</span>
                        </div>
                    ))}
                </div>

                {/* Game Board */}
                <div style={{
                    padding: '12px',
                    background: '#eab308', // Yellow Board
                    borderRadius: '12px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                    border: '5px solid #ca8a04',
                    width: 'min(450px, 90vw)',
                    maxWidth: '100%',
                    // aspectRatio: '1/1', // Removed to let height wrap content naturally
                    display: 'flex',
                    flexDirection: 'column',
                }}>
                    {/* Columns Container - Using Grid for perfect even spacing */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(8, 1fr)',
                        width: '100%',
                        height: '100%',
                        gap: '8px'
                    }}>
                        {Array(8).fill(0).map((_, c) => (
                            <div key={c}
                                onClick={() => handleColumnClick(c)}
                                onMouseEnter={() => setHoverCol(c)}
                                onMouseLeave={() => setHoverCol(null)}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    // Removed flex: 1, Grid handles width
                                    gap: '8px',
                                    height: '100%',
                                    cursor: isMyTurn && !winner ? 'pointer' : 'default',
                                    background: (isMyTurn && !winner && hoverCol === c) ? 'rgba(255,255,255,0.2)' : 'transparent',
                                    borderRadius: '4px',
                                    padding: '2px'
                                }}
                            >
                                {/* Render cells for this column (Rows 0-7) */}
                                {board.map((row, r) => {
                                    const cellPlayerId = row[c];
                                    const cellPlayer = players.find(p => p.id === cellPlayerId);
                                    const isWinningPiece = winningCells?.some(wc => wc.r === r && wc.c === c);

                                    return (
                                        <div key={`${r}-${c}`} style={{
                                            width: '100%',
                                            aspectRatio: '1/1', // Ensure cells are square
                                            borderRadius: '50%',
                                            backgroundColor: cellPlayer ? (cellPlayer.color === 'red' ? '#ff2222' : '#0066ff') : '#1e1e1e',
                                            boxShadow: cellPlayer
                                                ? 'inset -2px -2px 5px rgba(0,0,0,0.5), inset 2px 2px 5px rgba(255,255,255,0.3)'
                                                : 'inset 2px 2px 5px rgba(0,0,0,0.5)',
                                            border: isWinningPiece ? '3px solid #fff' : 'none',
                                            animation: isWinningPiece ? 'pulse 1s infinite' : (cellPlayer ? 'dropIn 0.5s ease-out' : 'none'),
                                            opacity: winner && !isWinningPiece && cellPlayer ? 0.6 : 1,
                                            zIndex: 2
                                        }} />
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Preview Piece (Floating above hovering column) - Optional Polish */}
                {/* Controls */}
                <div style={{ display: 'flex', gap: '15px', marginTop: '25px' }}>
                    {isHost && (
                        <button
                            onClick={handleRestartGame}
                            style={{
                                background: 'var(--primary)', color: 'white', border: 'none',
                                padding: '10px 20px', borderRadius: '8px', cursor: 'pointer',
                                fontWeight: 'bold'
                            }}
                        >
                            Restart Game
                        </button>
                    )}
                    {isHost && (
                        <button
                            onClick={handleBackToRoom}
                            style={{
                                background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)',
                                border: '1px solid var(--danger)', padding: '10px 20px',
                                borderRadius: '8px', cursor: 'pointer'
                            }}
                        >
                            Back to Room
                        </button>
                    )}
                </div>

            </div>

            <style>{`
                @keyframes pulse {
                    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.7); }
                    70% { transform: scale(1.1); box-shadow: 0 0 0 10px rgba(255, 255, 255, 0); }
                    100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }
                }
                @keyframes dropIn {
                    0% { transform: translateY(-300px); opacity: 0; }
                    60% { transform: translateY(0); opacity: 1; }
                    80% { transform: translateY(-20px); }
                    100% { transform: translateY(0); }
                }
            `}</style>
        </div>
    );
};

export default Connect4;
