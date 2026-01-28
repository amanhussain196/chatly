import React, { useState, useEffect } from 'react';

interface Player {
    id: string;
    username: string;
    color: 'red' | 'blue';
}

interface GameState {
    board: (string | null)[]; // 24 positions
    turn: string; // socket id
    players: Player[];
    winner: string | null;
    phase: 'placing' | 'moving' | 'flying' | 'removing'; // Game phases
    piecesPlaced: { [playerId: string]: number };
    piecesOnBoard: { [playerId: string]: number };
    selectedPosition: number | null;
    millFormed: boolean;
    lastMoveTime?: number;
    winReason?: string;
}

interface NineMensMorrisProps {
    gameState: GameState;
    socket: any;
    roomId: string;
    currentUserId: string;
    isHost: boolean;
}

const NineMensMorris: React.FC<NineMensMorrisProps> = ({ gameState, socket, roomId, currentUserId, isHost }) => {
    const { board, turn, players, winner, phase, piecesPlaced, piecesOnBoard, selectedPosition, millFormed, lastMoveTime, winReason } = gameState;

    const isMyTurn = turn === currentUserId;
    const winnerPlayer = players.find(p => p.id === winner);
    const [timeLeft, setTimeLeft] = useState(30);

    // Timer
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

    // Board positions (24 positions in 3 concentric squares)
    const positions = [
        // Outer square
        { x: 50, y: 50, connections: [1, 9] },      // 0
        { x: 250, y: 50, connections: [0, 2, 4] },  // 1
        { x: 450, y: 50, connections: [1, 14] },    // 2
        { x: 450, y: 250, connections: [2, 4, 7] }, // 3
        { x: 450, y: 450, connections: [1, 3, 5] }, // 4
        { x: 250, y: 450, connections: [4, 6, 7] }, // 5
        { x: 50, y: 450, connections: [5, 11] },    // 6
        { x: 50, y: 250, connections: [3, 5, 9] },  // 7
        // Middle square
        { x: 100, y: 100, connections: [9, 16] },   // 8
        { x: 250, y: 100, connections: [0, 7, 8, 10, 11] }, // 9
        { x: 400, y: 100, connections: [9, 18] },   // 10
        { x: 400, y: 250, connections: [9, 10, 12, 15] }, // 11
        { x: 400, y: 400, connections: [11, 20] },  // 12
        { x: 250, y: 400, connections: [5, 12, 14, 15] }, // 13
        { x: 100, y: 400, connections: [2, 13, 22] }, // 14
        { x: 100, y: 250, connections: [6, 11, 13, 16] }, // 15
        // Inner square
        { x: 150, y: 150, connections: [8, 17] },   // 16
        { x: 250, y: 150, connections: [16, 18] },  // 17
        { x: 350, y: 150, connections: [10, 17] },  // 18
        { x: 350, y: 250, connections: [18, 20] },  // 19
        { x: 350, y: 350, connections: [12, 19] },  // 20
        { x: 250, y: 350, connections: [13, 20, 22] }, // 21
        { x: 150, y: 350, connections: [14, 21] },  // 22
        { x: 150, y: 250, connections: [15, 22] },  // 23
    ];

    const handlePositionClick = (index: number) => {
        if (!isMyTurn || winner) return;
        socket.emit('morris_move', { roomId, position: index });
    };

    const handleBackToRoom = () => {
        socket.emit('end_game', { roomId });
    };

    const handleRestartGame = () => {
        socket.emit('restart_game', { roomId });
    };

    const getStatusMessage = () => {
        if (winner) {
            if (winner === 'draw') return "Game Draw! (Stalemate)";
            if (winner === currentUserId) return `You Won! ${winReason === 'timeout' ? '(Opponent Timeout)' : '🎉'}`;
            if (winnerPlayer) return `${winnerPlayer.username} Won! ${winReason === 'timeout' ? '(Timeout)' : ''}`;
            return "Player Won!";
        }

        const myPiecesPlaced = piecesPlaced[currentUserId] || 0;
        const myPiecesOnBoard = piecesOnBoard[currentUserId] || 0;

        if (phase === 'removing') {
            if (isMyTurn) return `Remove opponent's piece! - ${timeLeft}s`;
            const validTurnPlayer = players.find(p => p.id === turn);
            return `${validTurnPlayer?.username || 'Opponent'} is removing a piece (${timeLeft}s)`;
        } else if (phase === 'placing') {
            const remaining = 9 - myPiecesPlaced;
            if (isMyTurn) return `Place your piece (${remaining} left) - ${timeLeft}s`;
            const validTurnPlayer = players.find(p => p.id === turn);
            return `${validTurnPlayer?.username || 'Opponent'} is placing (${timeLeft}s)`;
        } else if (phase === 'moving') {
            if (isMyTurn) return `Move your piece (${myPiecesOnBoard} on board) - ${timeLeft}s`;
            const validTurnPlayer = players.find(p => p.id === turn);
            return `${validTurnPlayer?.username || 'Opponent'} is moving (${timeLeft}s)`;
        } else if (phase === 'flying') {
            if (isMyTurn) return `Fly to any position (${myPiecesOnBoard} left) - ${timeLeft}s`;
            const validTurnPlayer = players.find(p => p.id === turn);
            return `${validTurnPlayer?.username || 'Opponent'} is flying (${timeLeft}s)`;
        }

        return '';
    };

    const getPieceColor = (position: number) => {
        const piece = board[position];
        if (!piece) return null;
        const player = players.find(p => p.id === piece);
        return player?.color || 'white';
    };

    const isPositionSelected = (index: number) => {
        return selectedPosition === index;
    };

    // Helper: Check if position forms a mill
    const checkMill = (board: (string | null)[], pos: number, playerId: string) => {
        const mills = [
            // Outer square
            [0, 1, 2], [2, 3, 4], [4, 5, 6], [6, 7, 0],
            // Middle square
            [8, 9, 10], [10, 11, 12], [12, 13, 14], [14, 15, 8],
            // Inner square
            [16, 17, 18], [18, 19, 20], [20, 21, 22], [22, 23, 16],
            // Cross lines
            [1, 9, 17], [3, 11, 19], [5, 13, 21], [7, 15, 23]
        ];

        return mills.some(mill => {
            return mill.includes(pos) && mill.every(p => board[p] === playerId);
        });
    };

    // Helper: Check if piece is part of a mill
    const isInMill = (board: (string | null)[], pos: number) => {
        const piece = board[pos];
        if (!piece) return false;
        return checkMill(board, pos, piece);
    };

    // Helper: Check if all opponent pieces are in mills
    const allPiecesInMills = (playerId: string) => {
        for (let i = 0; i < 24; i++) {
            if (board[i] === playerId) {
                if (!isInMill(board, i)) {
                    return false; // Found a piece not in a mill
                }
            }
        }
        return true; // All pieces are in mills
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            height: '100%',
            width: '100%',
            background: 'var(--bg-card)',
            color: 'white',
            padding: '10px',
            position: 'absolute',
            top: 0,
            left: 0,
            zIndex: 10,
            overflow: 'auto',
            boxSizing: 'border-box'
        }}>
            <div style={{
                width: '100%',
                maxWidth: '600px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                paddingBottom: '20px'
            }}>
                {/* Header */}
                <div style={{ marginBottom: '10px', textAlign: 'center', width: '100%' }}>
                    <h2 style={{ fontSize: 'clamp(1.2rem, 4vw, 1.8rem)', fontWeight: 'bold', marginBottom: '8px', margin: '0 0 8px 0' }}>Nine Men's Morris</h2>
                    <div style={{ fontSize: 'clamp(0.9rem, 3vw, 1.1rem)', color: isMyTurn ? 'var(--primary)' : 'var(--text-muted)' }}>
                        {getStatusMessage()}
                    </div>
                    {/* Timer Bar */}
                    {!winner && (
                        <div style={{ width: '100%', maxWidth: '200px', height: '4px', background: '#334155', margin: '10px auto', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{
                                height: '100%',
                                width: `${(timeLeft / 30) * 100}%`,
                                background: timeLeft < 10 ? 'var(--danger)' : 'var(--primary)',
                                transition: 'width 0.5s linear'
                            }} />
                        </div>
                    )}
                </div>

                {/* Players Info */}
                <div style={{ display: 'flex', gap: 'clamp(20px, 5vw, 40px)', marginBottom: '15px', flexWrap: 'wrap', justifyContent: 'center' }}>
                    {players.map(p => {
                        const placed = piecesPlaced[p.id] || 0;
                        const onBoard = piecesOnBoard[p.id] || 0;
                        return (
                            <div key={p.id} style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                opacity: turn === p.id ? 1 : 0.5,
                                transform: turn === p.id ? 'scale(1.05)' : 'scale(1)',
                                transition: 'all 0.3s'
                            }}>
                                <div style={{
                                    width: 'clamp(40px, 10vw, 50px)',
                                    height: 'clamp(40px, 10vw, 50px)',
                                    borderRadius: '50%',
                                    background: p.color === 'red' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginBottom: '6px',
                                    border: turn === p.id ? `2px solid ${p.color === 'red' ? '#ef4444' : '#3b82f6'}` : 'none'
                                }}>
                                    <div style={{
                                        width: 'clamp(25px, 6vw, 30px)',
                                        height: 'clamp(25px, 6vw, 30px)',
                                        borderRadius: '50%',
                                        background: p.color === 'red' ? '#ef4444' : '#3b82f6',
                                        border: '2px solid #666'
                                    }} />
                                </div>
                                <span style={{ fontWeight: 'bold', fontSize: 'clamp(0.8rem, 2.5vw, 1rem)' }}>{p.username}</span>
                                <span style={{ fontSize: 'clamp(0.7rem, 2vw, 0.85rem)', color: 'var(--text-muted)' }}>
                                    {phase === 'placing' ? `${9 - placed} to place` : `${onBoard} on board`}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* Game Board - Responsive */}
                <div style={{
                    position: 'relative',
                    width: '100%',
                    maxWidth: 'min(450px, 90vw, calc(100vh - 350px))',
                    aspectRatio: '1 / 1',
                    margin: '10px auto'
                }}>
                    {/* Board Lines */}
                    <svg width="100%" height="100%" viewBox="0 0 500 500" style={{ position: 'absolute', top: 0, left: 0 }}>
                        {/* Outer square */}
                        <rect x="50" y="50" width="400" height="400" fill="none" stroke="#666" strokeWidth="2" />
                        {/* Middle square */}
                        <rect x="100" y="100" width="300" height="300" fill="none" stroke="#666" strokeWidth="2" />
                        {/* Inner square */}
                        <rect x="150" y="150" width="200" height="200" fill="none" stroke="#666" strokeWidth="2" />
                        {/* Connecting lines */}
                        <line x1="250" y1="50" x2="250" y2="150" stroke="#666" strokeWidth="2" />
                        <line x1="250" y1="350" x2="250" y2="450" stroke="#666" strokeWidth="2" />
                        <line x1="50" y1="250" x2="150" y2="250" stroke="#666" strokeWidth="2" />
                        <line x1="350" y1="250" x2="450" y2="250" stroke="#666" strokeWidth="2" />
                    </svg>

                    {/* Positions */}
                    {positions.map((pos, index) => {
                        const piece = board[index];
                        const color = getPieceColor(index);
                        const isSelected = isPositionSelected(index);
                        const canClick = isMyTurn && !winner;

                        let isRemovable = false;
                        if (isMyTurn && phase === 'removing' && piece && piece !== currentUserId) {
                            const opponentId = piece;
                            const pieceInMill = isInMill(board, index);
                            const allOpponentInMills = allPiecesInMills(opponentId);

                            if (!pieceInMill || allOpponentInMills) {
                                isRemovable = true;
                            }
                        }

                        return (
                            <div
                                key={index}
                                onClick={() => handlePositionClick(index)}
                                style={{
                                    position: 'absolute',
                                    left: `calc(${(pos.x / 500) * 100}% - 15px)`,
                                    top: `calc(${(pos.y / 500) * 100}% - 15px)`,
                                    width: 'clamp(24px, 6vw, 30px)',
                                    height: 'clamp(24px, 6vw, 30px)',
                                    borderRadius: '50%',
                                    background: piece ? (color === 'red' ? '#ef4444' : '#3b82f6') : '#334155',
                                    border: isSelected ? '3px solid var(--primary)' : isRemovable ? '3px solid #f59e0b' : '2px solid #666',
                                    cursor: canClick ? 'pointer' : 'default',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s',
                                    boxShadow: isSelected ? '0 0 10px var(--primary)' : isRemovable ? '0 0 15px #f59e0b' : 'none',
                                    transform: isSelected ? 'scale(1.2)' : isRemovable ? 'scale(1.1)' : 'scale(1)',
                                    zIndex: isSelected ? 10 : isRemovable ? 5 : 1,
                                    animation: isRemovable ? 'pulse 1s infinite' : 'none'
                                }}
                                title={`Position ${index}`}
                            >
                                {!piece && canClick && phase !== 'removing' && (
                                    <div style={{
                                        width: '8px',
                                        height: '8px',
                                        borderRadius: '50%',
                                        background: 'rgba(255,255,255,0.3)'
                                    }} />
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Controls */}
                <div style={{ display: 'flex', gap: '12px', marginTop: '15px', flexWrap: 'wrap', justifyContent: 'center' }}>
                    {isHost && (
                        <button
                            onClick={handleRestartGame}
                            style={{
                                background: 'var(--primary)',
                                color: 'white',
                                border: 'none',
                                padding: 'clamp(8px, 2vw, 10px) clamp(16px, 4vw, 20px)',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontSize: 'clamp(0.85rem, 2.5vw, 1rem)'
                            }}
                        >
                            Restart Game
                        </button>
                    )}

                    {isHost && (
                        <button
                            onClick={handleBackToRoom}
                            style={{
                                background: 'rgba(239, 68, 68, 0.1)',
                                color: 'var(--danger)',
                                border: '1px solid var(--danger)',
                                padding: 'clamp(8px, 2vw, 10px) clamp(16px, 4vw, 20px)',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontSize: 'clamp(0.85rem, 2.5vw, 1rem)'
                            }}
                        >
                            Back to Room
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NineMensMorris;
