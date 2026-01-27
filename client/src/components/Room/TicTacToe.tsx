import React from 'react';
// import { User } from 'lucide-react';

interface Player {
    id: string; // socket id
    username: string;
    symbol: 'X' | 'O';
}

interface GameState {
    board: (string | null)[];
    turn: string; // socket id
    players: Player[];
    winner: string | null; // socket id or 'draw'
    draw: boolean;
    lastMoveTime?: number;
    winReason?: string;
}

interface TicTacToeProps {
    gameState: GameState;
    socket: any;
    roomId: string; // canonical room id
    currentUserId: string; // socket id of current user
    // onClose: () => void;
    isHost: boolean;
}

const TicTacToe: React.FC<TicTacToeProps> = ({ gameState, socket, roomId, currentUserId, isHost }) => {
    const { board, turn, players, winner, draw, lastMoveTime, winReason } = gameState;

    const isMyTurn = turn === currentUserId;
    const winnerPlayer = players.find(p => p.id === winner);

    // Timer State
    const [timeLeft, setTimeLeft] = React.useState(15);

    React.useEffect(() => {
        if (winner || draw) {
            setTimeLeft(0);
            return;
        }

        const updateTimer = () => {
            if (!lastMoveTime) return;
            const now = Date.now();
            const elapsed = (now - lastMoveTime) / 1000;
            const remaining = Math.max(0, 15 - elapsed);
            setTimeLeft(Math.floor(remaining));
        };

        updateTimer(); // Initial call
        const interval = setInterval(updateTimer, 500);
        return () => clearInterval(interval);
    }, [lastMoveTime, winner, draw]);

    const handleCellClick = (index: number) => {
        if (!isMyTurn || board[index] !== null || winner || draw) return;
        socket.emit('make_move', { roomId, index });
    };

    const handleBackToRoom = () => {
        socket.emit('end_game', { roomId });
    };

    const handleRestartGame = () => {
        socket.emit('restart_game', { roomId });
    };

    const getStatusMessage = () => {
        if (winner) {
            if (winner === currentUserId) return `You Won! ${winReason === 'timeout' ? '(Opponent Timeout)' : '🎉'}`;
            if (winnerPlayer) return `${winnerPlayer.username} Won! ${winReason === 'timeout' ? '(Timeout)' : ''}`;
            return "Player Won!";
        }
        if (draw) return "It's a Draw! 🤝";

        if (isMyTurn) return `Your Turn (${timeLeft}s)`;
        const validTurnPlayer = players.find(p => p.id === turn);
        return `${validTurnPlayer?.username || 'Opponent'}'s Turn (${timeLeft}s)`;
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            width: '100%',
            background: 'var(--bg-card)',
            color: 'white',
            padding: '20px',
            position: 'absolute',
            top: 0,
            left: 0,
            zIndex: 10
        }}>
            {/* Header */}
            <div style={{ marginBottom: '20px', textAlign: 'center' }}>
                <h2 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '8px' }}>Tic Tac Toe</h2>
                <div style={{ fontSize: '1.2rem', color: isMyTurn ? 'var(--primary)' : 'var(--text-muted)' }}>
                    {getStatusMessage()}
                </div>
                {/* Visual Timer Bar */}
                {(!winner && !draw) && (
                    <div style={{ width: '200px', height: '4px', background: '#334155', margin: '10px auto', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{
                            height: '100%',
                            width: `${(timeLeft / 15) * 100}%`,
                            background: timeLeft < 5 ? 'var(--danger)' : 'var(--primary)',
                            transition: 'width 0.5s linear'
                        }} />
                    </div>
                )}
            </div>

            {/* Players Info (Keep existing...) */}
            <div style={{ display: 'flex', gap: '40px', marginBottom: '30px' }}>
                {players.map(p => (
                    <div key={p.id} style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        opacity: turn === p.id ? 1 : 0.5,
                        transform: turn === p.id ? 'scale(1.1)' : 'scale(1)',
                        transition: 'all 0.3s'
                    }}>
                        <div style={{
                            width: '50px',
                            height: '50px',
                            borderRadius: '50%',
                            background: p.symbol === 'X' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(236, 72, 153, 0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginBottom: '8px',
                            border: turn === p.id ? `2px solid ${p.symbol === 'X' ? '#3b82f6' : '#ec4899'}` : 'none'
                        }}>
                            <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: p.symbol === 'X' ? '#3b82f6' : '#ec4899' }}>{p.symbol}</span>
                        </div>
                        <span style={{ fontWeight: 'bold' }}>{p.username}</span>
                    </div>
                ))}
            </div>

            {/* Board */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
                background: '#334155',
                padding: '8px',
                borderRadius: '12px',
                pointerEvents: (isMyTurn && !winner && !draw) ? 'auto' : 'none'
            }}>
                {board.map((cell, index) => (
                    <div
                        key={index}
                        onClick={() => handleCellClick(index)}
                        style={{
                            width: '80px',
                            height: '80px',
                            background: 'var(--bg-card)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '2.5rem',
                            fontWeight: 'bold',
                            cursor: (isMyTurn && !cell) ? 'pointer' : 'default',
                            color: cell === 'X' ? '#3b82f6' : '#ec4899',
                            borderRadius: '4px'
                        }}
                    >
                        {cell}
                    </div>
                ))}
            </div>

            {/* Footer / Controls */}
            <div style={{ display: 'flex', gap: '16px', marginTop: '30px' }}>
                {isHost && (
                    <button
                        onClick={handleRestartGame}
                        style={{
                            background: 'var(--primary)',
                            color: 'white',
                            border: 'none',
                            padding: '10px 20px',
                            borderRadius: '8px',
                            cursor: 'pointer'
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
                            padding: '10px 20px',
                            borderRadius: '8px',
                            cursor: 'pointer'
                        }}
                    >
                        Back to Room
                    </button>
                )}
            </div>
        </div>
    );
};

export default TicTacToe;
