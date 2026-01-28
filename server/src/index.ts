import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import friendRoutes from './routes/friends';
import { Message } from './models/Message';
import { localStore } from './services/localStore';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/ping', (req, res) => {
    console.log('[HTTP] /ping received from ' + req.ip);
    res.send({ status: 'ok', msg: 'Server is reachable' });
});

if (!process.env.MONGO_URI) {
    console.warn("WARNING: MONGO_URI not set. Auth features will fail.");
}

if (process.env.MONGO_URI) {
    mongoose.connect(process.env.MONGO_URI)
        .then(() => console.log('MongoDB Connected'))
        .catch(err => console.error('MongoDB Connection Error:', err));
} else {
    console.log("!!! NO MONGO_URI SET - RUNNING IN GUEST/MEMORY MODE (No DB) !!!");
}

app.use('/api/auth', authRoutes);
app.use('/api/friends', friendRoutes);

const PORT = process.env.PORT || 3002;

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// --- Types ---
interface ChatUser {
    id: string; // socket.id
    userId?: string; // auth id
    username: string;
    roomId?: string;
    isHost: boolean;
    isMuted: boolean;
}

interface ChatRoom {
    id: string;
    hostId: string;
    users: ChatUser[];
    settings: {
        maxPlayers: number;
        isPrivate: boolean;
    };
    game?: {
        type: 'tictactoe' | 'pingpong' | 'stacktower' | 'ninemenmorris' | 'connect4';
        state: any;
        timer?: any; // NodeJS.Timeout
    };
}

// --- Globals ---
const rooms: Record<string, ChatRoom> = {};
const users: Record<string, ChatUser> = {};
const userSessions: Record<string, string> = {}; // userId -> socketId

// --- Game Logic Helpers ---
const checkWinner = (board: any[]) => {
    const winPatterns = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ];
    for (const pattern of winPatterns) {
        const [a, b, c] = pattern;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
    }
    if (!board.includes(null)) return 'draw';
    return null;
};

const minimax = (board: any[], depth: number, isMaximizing: boolean, aiSymbol: string, humanSymbol: string) => {
    const result = checkWinner(board);
    if (result === aiSymbol) return 10 - depth;
    if (result === humanSymbol) return depth - 10;
    if (result === 'draw') return 0;

    if (isMaximizing) {
        let bestScore = -Infinity;
        for (let i = 0; i < 9; i++) {
            if (board[i] === null) {
                board[i] = aiSymbol;
                const score = minimax(board, depth + 1, false, aiSymbol, humanSymbol);
                board[i] = null;
                bestScore = Math.max(score, bestScore);
            }
        }
        return bestScore;
    } else {
        let bestScore = Infinity;
        for (let i = 0; i < 9; i++) {
            if (board[i] === null) {
                board[i] = humanSymbol;
                const score = minimax(board, depth + 1, true, aiSymbol, humanSymbol);
                board[i] = null;
                bestScore = Math.min(score, bestScore);
            }
        }
        return bestScore;
    }
};

const getBestMove = (board: any[], aiSymbol: string) => {
    let bestScore = -Infinity;
    let move = -1;
    const humanSymbol = aiSymbol === 'X' ? 'O' : 'X';
    if (board.filter((c: any) => c !== null).length === 0) return 4;

    for (let i = 0; i < 9; i++) {
        if (board[i] === null) {
            board[i] = aiSymbol;
            const score = minimax(board, 0, false, aiSymbol, humanSymbol);
            board[i] = null;
            if (score > bestScore) {
                bestScore = score;
                move = i;
            }
        }
    }
    return move;
};

// Helper to strip timer/internal data before sending to client
const getSafeGame = (game: any) => {
    if (!game) return null;
    return {
        type: game.type,
        state: game.state
    };
};

const resetGameTimer = (room: any, roomId: string, turnPlayerId: string) => {
    if (room.game.timer) clearTimeout(room.game.timer);

    // AI moves instantly, no need for timer against it
    if (turnPlayerId === 'AI') return;

    room.game.state.lastMoveTime = Date.now();

    room.game.timer = setTimeout(() => {
        const game = room.game.state;
        // Check availability just in case
        if (!game || game.winner || game.draw) return;

        const loserId = turnPlayerId;
        // Winner is the *other* player (simplified for 2p)
        const winner = game.players.find((p: any) => p.id !== loserId);

        if (winner) {
            game.winner = winner.id;
            game.winReason = 'timeout';
            io.to(roomId).emit('game_update', getSafeGame(room.game));
        }
    }, 15000);
};



// --- Ping Pong Logic ---
const PADDLE_HEIGHT = 100;
const PADDLE_WIDTH = 10;
const BALL_SIZE = 10;
const BOARD_WIDTH = 800;
const BOARD_HEIGHT = 600;
const PADDLE_SPEED = 20;

const resetBall = (state: any) => {
    state.ball.x = BOARD_WIDTH / 2;
    state.ball.y = BOARD_HEIGHT / 2;
    state.ball.dx = (Math.random() > 0.5 ? 1 : -1) * (4.5 + state.difficulty);
    state.ball.dy = (Math.random() > 0.5 ? 1 : -1) * (4.5 + state.difficulty);
};

const updatePingPong = (roomId: string) => {
    const room = rooms[roomId];
    if (!room || !room.game || room.game.type !== 'pingpong') return;

    const state = room.game.state;
    if (state.status !== 'playing') return;

    // Move Ball
    state.ball.x += state.ball.dx;
    state.ball.y += state.ball.dy;

    // Wall Collisions (Top/Bottom)
    if (state.ball.y <= 0 || state.ball.y >= BOARD_HEIGHT - BALL_SIZE) {
        state.ball.dy *= -1;
    }

    // Paddles
    // Player 1 (Left) - x = 20
    if (state.ball.x <= 30 && state.ball.x >= 20 &&
        state.ball.y + BALL_SIZE >= state.players[0].y &&
        state.ball.y <= state.players[0].y + PADDLE_HEIGHT) {
        state.ball.dx *= -1;
        state.ball.dx += (state.ball.dx > 0 ? 0.5 : -0.5); // Increase speed slightly
        state.difficulty += 0.1;
    }

    // Player 2 (Right) - x = BOARD_WIDTH - 30
    if (state.ball.x >= BOARD_WIDTH - 40 && state.ball.x <= BOARD_WIDTH - 30 &&
        state.ball.y + BALL_SIZE >= state.players[1].y &&
        state.ball.y <= state.players[1].y + PADDLE_HEIGHT) {
        state.ball.dx *= -1;
        state.ball.dx += (state.ball.dx > 0 ? 0.5 : -0.5); // Increase speed slightly
        state.difficulty += 0.1;
    }

    // Scoring
    if (state.ball.x < 0) {
        // P2 Scored (P1 lost life)
        state.players[0].lives -= 1;
        resetBall(state);
        if (state.players[0].lives <= 0) {
            state.status = 'ended';
            state.winner = state.players[1].id;
        }
    } else if (state.ball.x > BOARD_WIDTH) {
        // P1 Scored (P2 lost life)
        state.players[1].lives -= 1;
        resetBall(state);
        if (state.players[1].lives <= 0) {
            state.status = 'ended';
            state.winner = state.players[0].id;
        }
    }

    // Send Update
    io.to(roomId).emit('game_update', getSafeGame(room.game));

    if (state.status === 'ended') {
        clearInterval(room.game.timer);
    }
};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.onAny((event, ...args) => {
        // console.log(`[SERVER RAW EVENT] Event: '${event}' from ${socket.id}`);
    });

    socket.on('register_session', ({ userId, username }) => {
        if (userId) {
            userSessions[userId] = socket.id;
            console.log(`Registered session for ${username} (${userId})`);
        }
    });

    socket.on('create_room', ({ username, userId, isPrivate }) => {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        const newUser: ChatUser = { id: socket.id, userId, username, roomId, isHost: true, isMuted: false };

        users[socket.id] = newUser;
        rooms[roomId] = {
            id: roomId, hostId: socket.id, users: [newUser],
            settings: { maxPlayers: 8, isPrivate }
        };

        socket.join(roomId);
        socket.emit('room_created', { roomId, user: newUser });
        io.to(roomId).emit('room_users_update', rooms[roomId].users);
    });



    socket.on('join_room', async ({ username, userId, roomId }) => {
        const canonicalRoomId = roomId.toUpperCase();
        let room = rooms[canonicalRoomId];

        // DM Room Auto-Creation
        if (!room && canonicalRoomId.startsWith('DM_')) {
            room = {
                id: canonicalRoomId, hostId: socket.id, users: [],
                settings: { maxPlayers: 20, isPrivate: true }
            };
            rooms[canonicalRoomId] = room;
        }

        if (!room) { socket.emit('error', 'Room not found'); return; }

        const uniqueUserIds = new Set<string>();
        room.users.forEach(u => uniqueUserIds.add(u.userId || u.id));
        const isSocketInRoom = room.users.some(u => u.id === socket.id);
        const isRejoining = (userId && uniqueUserIds.has(userId)) || isSocketInRoom;

        if (!isRejoining && uniqueUserIds.size >= room.settings.maxPlayers) {
            socket.emit('error', 'Room is full');
            return;
        }

        // Host logic for rejoin
        let isHost = room.users.length === 0;
        if (userId) { // Allow guests to rejoin/replace too now that we have stable IDs
            const existingUserIndex = room.users.findIndex(u => u.userId === userId);
            if (existingUserIndex !== -1) {
                if (room.users[existingUserIndex].isHost) isHost = true;

                // Remove the OLD socket session for this user
                const oldSocketId = room.users[existingUserIndex].id;
                // Optional: Force disconnect logic for the old socket if needed?
                // For now, just remove from room list

                room.users.splice(existingUserIndex, 1);
            }
        }

        const newUser: ChatUser = { id: socket.id, userId, username, roomId: room.id, isHost, isMuted: false };
        users[socket.id] = newUser;
        room.users.push(newUser);

        socket.join(room.id);
        socket.emit('room_joined', { roomId: room.id, user: newUser });
        io.to(room.id).emit('user_joined', { username, id: socket.id });
        io.to(room.id).emit('room_users_update', room.users);

        if (room.game) socket.emit('game_started', getSafeGame(room.game));

        // --- MESSAGE HISTORY ---
        if (process.env.MONGO_URI) {
            (async () => {
                try {
                    const history = await Message.find({ roomId: canonicalRoomId }).sort({ createdAt: 1 }).limit(50);
                    socket.emit('message_history', history.map(msg => ({
                        id: msg._id.toString(), text: msg.text, sender: msg.senderUsername,
                        timestamp: msg.createdAt.toISOString(), status: msg.status
                    })));
                } catch (e) { console.error("History Fetch Error:", e); }
            })();
        } else {
            // Memory/Local Mode History
            const history = localStore.getHistory(canonicalRoomId);
            socket.emit('message_history', history);
        }

    });

    socket.on('get_room_state', ({ roomId }) => {
        const canonicalRoomId = roomId.toUpperCase();
        const room = rooms[canonicalRoomId];

        if (room) {
            // Send user list
            socket.emit('room_users_update', room.users);

            // Check if current user is implicitly in room
            const me = room.users.find(u => u.id === socket.id);
            if (me) {
                socket.emit('room_joined', { roomId: room.id, user: me });
            }

            // Sync game state if active
            if (room.game) {
                socket.emit('game_started', getSafeGame(room.game));
                // Also send specific game updates if needed
                socket.emit('game_update', getSafeGame(room.game));
            }
        }
    });

    // --- Game Handlers ---

    const handleMessageDistribution = async (canonicalRoomId: string, sender: ChatUser, message: string, tempId: string, timestamp: string) => {
        const msgPayload = {
            id: tempId,
            text: message,
            sender: sender.username,
            timestamp: timestamp,
            status: 'sent',
            roomId: canonicalRoomId
        };

        // Save to Local Store immediately if no DB (or even if DB fails, but here we treat it as primary for no-DB mode)
        if (!process.env.MONGO_URI) {
            localStore.addMessage({
                id: tempId,
                roomId: canonicalRoomId,
                text: message,
                sender: sender.username,
                senderId: sender.userId || sender.id,
                timestamp: timestamp,
                status: 'sent' as any
            });
        }

        // 1. Emit to everyone in the room (standard case)
        io.to(canonicalRoomId).emit('receive_message', msgPayload);

        // 2. Offline / Out-of-Room Notification Logic for DMs
        if (canonicalRoomId.startsWith('DM_')) {
            const parts = canonicalRoomId.replace('DM_', '').split('_');
            const receiverId = parts.find((id: string) => id.toLowerCase() !== sender.userId?.toLowerCase());

            if (receiverId) {
                // Find socket by Auth ID
                const receiverSocketId = userSessions[receiverId] || userSessions[receiverId.toLowerCase()];

                // If receiver is connected
                if (receiverSocketId) {
                    io.to(receiverSocketId).emit('receive_message', msgPayload);
                    io.to(receiverSocketId).emit('new_notification', { roomId: canonicalRoomId });
                }
            }
        }
    };

    socket.on('send_message', async ({ message, roomId }) => {
        const canonicalRoomId = roomId.toUpperCase();
        const user = users[socket.id];

        if (user && user.roomId === canonicalRoomId) {
            const tempId = Math.random().toString(36).substr(2, 9);
            const timestamp = new Date().toISOString();

            await handleMessageDistribution(canonicalRoomId, user, message, tempId, timestamp);

            // 2. Persist to DB (Fire and Forget)
            if (process.env.MONGO_URI) {
                const msgData = {
                    roomId: canonicalRoomId, senderId: user.userId || socket.id, senderUsername: user.username,
                    text: message, status: 'sent', createdAt: timestamp
                };
                try {
                    const newMsg = new Message(msgData);
                    await newMsg.save();
                } catch (e) {
                    console.error("Message Save Error:", e);
                }
            }
        }
    });

    socket.on('toggle_mute', ({ roomId }) => {
        const canonicalRoomId = roomId.toUpperCase();
        const user = users[socket.id];
        const room = rooms[canonicalRoomId];

        if (user && room) {
            user.isMuted = !user.isMuted;

            // Sync local room user list if user is in that room
            const userInRoom = room.users.find(u => u.id === socket.id);
            if (userInRoom) {
                userInRoom.isMuted = user.isMuted;
            }

            io.to(canonicalRoomId).emit('room_users_update', room.users);
        }
    });

    socket.on('mark_read', async ({ messageId, roomId }) => {
        // Echo the read status safely
        if (roomId) {
            io.to(roomId.toUpperCase()).emit('message_status_update', { id: messageId, status: 'read' });
        }

        // Update Local Store
        if (!process.env.MONGO_URI) {
            localStore.markRead(messageId);
        }

        // Update DB if available
        if (process.env.MONGO_URI && messageId && !messageId.includes('.')) {
            try {
                await Message.findByIdAndUpdate(messageId, { status: 'read' });
            } catch (e) { }
        }
    });

    // --- Signaling / WebRTC / Calls ---

    socket.on('webrtc_ready', ({ roomId }) => {
        const u = users[socket.id];
        if (u && u.roomId) socket.broadcast.to(u.roomId).emit('webrtc_ready', { id: socket.id });
    });

    socket.on('signal', ({ targetId, signal }) => {
        io.to(targetId).emit('signal', { senderId: socket.id, signal });
    });

    socket.on('initiate_call', ({ roomId, callerName, callerUserId }) => {
        const canonicalRoomId = roomId.toUpperCase();

        // Broadcast to room (good for group calls or finding socket)
        socket.broadcast.to(canonicalRoomId).emit('incoming_call', { callerId: socket.id, callerName, roomId });

        // Targeted Call Logic (for DMs)
        if (canonicalRoomId.startsWith('DM_') && callerUserId) {
            const parts = canonicalRoomId.replace('DM_', '').split('_');
            const receiverIdUpper = parts.find((id: string) => id.toLowerCase() !== callerUserId.toLowerCase());

            if (receiverIdUpper) {
                // Try finding by Auth ID first
                const receiverSocketId = userSessions[receiverIdUpper.toLowerCase()] || userSessions[receiverIdUpper];
                if (receiverSocketId && receiverSocketId !== socket.id) {
                    io.to(receiverSocketId).emit('incoming_call', { callerId: socket.id, callerName, roomId });
                }
            }
        }
    });

    socket.on('accept_call', ({ roomId }) => {
        socket.broadcast.to(roomId.toUpperCase()).emit('call_accepted');
    });

    socket.on('decline_call', ({ roomId }) => {
        socket.broadcast.to(roomId.toUpperCase()).emit('call_declined');
    });

    socket.on('end_call', ({ roomId }) => {
        socket.broadcast.to(roomId.toUpperCase()).emit('call_ended');
    });

    // --- Game Handlers ---

    socket.on('start_game', ({ roomId, gameType, players }) => {
        const canonicalRoomId = roomId.toUpperCase();
        const room = rooms[canonicalRoomId];
        const user = users[socket.id];

        if (room && user && user.isHost && user.roomId === canonicalRoomId) {
            if (room.game && room.game.timer) clearTimeout(room.game.timer); // Clear existing

            if (gameType === 'tictactoe') {
                room.game = {
                    type: 'tictactoe',
                    state: {
                        board: Array(9).fill(null),
                        turn: players[0].id,
                        players: players,
                        winner: null,
                        draw: false,
                        lastMoveTime: Date.now()
                    }
                };
                resetGameTimer(room, canonicalRoomId, players[0].id);
            } else if (gameType === 'pingpong') {
                room.game = {
                    type: 'pingpong',
                    state: {
                        players: players.map((p: any) => ({ ...p, lives: 3, y: BOARD_HEIGHT / 2 - PADDLE_HEIGHT / 2 })),
                        ball: { x: BOARD_WIDTH / 2, y: BOARD_HEIGHT / 2, dx: 0, dy: 0 },
                        dimensions: { width: BOARD_WIDTH, height: BOARD_HEIGHT },
                        status: 'playing',
                        difficulty: 0,
                        winner: null
                    },
                    timer: setInterval(() => updatePingPong(canonicalRoomId), 15)
                };
                resetBall(room.game.state);
            } else if (gameType === 'stacktower') {
                room.game = {
                    type: 'stacktower',
                    state: {
                        players: players.map((p: any) => ({
                            ...p,
                            score: 0,
                            width: 300,
                            status: 'playing',
                            history: [] // Stores placed blocks { width, offset }
                        })),
                        winner: null
                    }
                };
            } else if (gameType === 'ninemenmorris') {
                room.game = {
                    type: 'ninemenmorris',
                    state: {
                        board: Array(24).fill(null), // 24 positions
                        turn: players[0].id,
                        players: players.map((p: any, idx: number) => ({
                            ...p,
                            color: idx === 0 ? 'red' : 'blue'
                        })),
                        winner: null,
                        phase: 'placing', // placing, moving, flying, removing
                        piecesPlaced: { [players[0].id]: 0, [players[1].id]: 0 },
                        piecesOnBoard: { [players[0].id]: 0, [players[1].id]: 0 },
                        selectedPosition: null,
                        millFormed: false,
                        lastMoveTime: Date.now()
                    }
                };
                resetGameTimer(room, canonicalRoomId, players[0].id);
            } else if (gameType === 'connect4') {
                // Initialize 8 rows x 8 cols board (Requested Update)
                const board = Array(8).fill(null).map(() => Array(8).fill(null));
                room.game = {
                    type: 'connect4',
                    state: {
                        board,
                        turn: players[0].id,
                        players: players.map((p: any, idx: number) => ({
                            ...p,
                            color: idx === 0 ? 'red' : 'blue'
                        })),
                        winner: null,
                        winningCells: [],
                        lastMoveTime: Date.now()
                    }
                };
                resetGameTimer(room, canonicalRoomId, players[0].id);
            }

            io.to(canonicalRoomId).emit('game_started', getSafeGame(room.game));
        } else {
            console.log("Start Game Failed: Permission denied or room not found");
        }
    });

    socket.on('paddle_move', ({ roomId, y }) => {
        const canonicalRoomId = roomId.toUpperCase();
        const room = rooms[canonicalRoomId];
        if (!room || !room.game || room.game.type !== 'pingpong') return;

        const player = room.game.state.players.find((p: any) => p.id === socket.id);
        if (player) {
            // Clamp Position
            player.y = Math.max(0, Math.min(BOARD_HEIGHT - PADDLE_HEIGHT, y));
        }
    });

    socket.on('stack_place', ({ roomId, width, offset, score, gameOver }) => {
        const canonicalRoomId = roomId.toUpperCase();
        const room = rooms[canonicalRoomId];
        if (!room || !room.game || room.game.type !== 'stacktower') return;

        const player = room.game.state.players.find((p: any) => p.id === socket.id);
        const opponent = room.game.state.players.find((p: any) => p.id !== socket.id);

        if (player) {
            player.width = width;
            player.score = score;
            if (gameOver) player.status = 'gameover';
            player.history.push({ width, offset });

            // Check Winner (If I am game over, did opponent already lose?)
            if (gameOver) {
                if (opponent.status === 'gameover') {
                    // Both lost, compare scores
                    if (player.score > opponent.score) room.game.state.winner = player.id;
                    else if (opponent.score > player.score) room.game.state.winner = opponent.id;
                    else room.game.state.winner = 'draw';
                } else {
                    // I lost, pending opponent failure? Or typically instant loss in VS mode?
                    // User said "Whoever places more blocks". So we wait for both to fail? 
                    // Let's assume unlimited play until failure. If one fails, the other can keep playing to beat the score.
                    // If opponent is already gameover and has higher score, they win.
                    if (opponent.status === 'gameover' && opponent.score > player.score) {
                        room.game.state.winner = opponent.id;
                    }
                    // If opponent is still playing, no winner yet.
                }
            } else {
                // Check if I just surpassed a 'dead' opponent? (Optional instant win)
                if (opponent.status === 'gameover' && player.score > opponent.score) {
                    room.game.state.winner = player.id;
                }
            }

            io.to(canonicalRoomId).emit('game_update', getSafeGame(room.game));
        }
    });

    socket.on('restart_game', ({ roomId }) => {
        const canonicalRoomId = roomId.toUpperCase();
        const room = rooms[canonicalRoomId];
        const user = users[socket.id];

        if (room && room.game && user && user.isHost) {
            // Re-sync players with current room users to handle reconnections (new Socket IDs)
            if (room.users.length >= 2) {
                // Try to match existing game players to current room users by userId
                const currentUsers = room.users;
                const gamePlayers = room.game.state.players;

                const updatedPlayers = gamePlayers.map((gp: any) => {
                    const foundUser = currentUsers.find((u: any) => u.userId === gp.userId);
                    if (foundUser) {
                        return { ...gp, id: foundUser.id, username: foundUser.username };
                    }
                    return gp;
                });
                room.game.state.players = updatedPlayers;
            }

            const players = room.game.state.players;
            if (room.game.timer) {
                clearTimeout(room.game.timer); // Clear TTT timeout
                clearInterval(room.game.timer); // Clear PingPong interval
            }

            if (room.game.type === 'tictactoe') {
                room.game.state.board = Array(9).fill(null);
                room.game.state.winner = null;
                room.game.state.draw = false;
                room.game.state.turn = players[0].id;
                room.game.state.lastMoveTime = Date.now();
                resetGameTimer(room, canonicalRoomId, players[0].id);
                io.to(canonicalRoomId).emit('game_update', getSafeGame(room.game));
            } else if (room.game.type === 'pingpong') {
                room.game.state.winner = null;
                room.game.state.status = 'playing';
                room.game.state.difficulty = 0;
                room.game.state.players.forEach((p: any) => { p.lives = 3; p.y = BOARD_HEIGHT / 2 - PADDLE_HEIGHT / 2; });
                resetBall(room.game.state);
                room.game.timer = setInterval(() => updatePingPong(canonicalRoomId), 15);
                io.to(canonicalRoomId).emit('game_update', getSafeGame(room.game));
            } else if (room.game.type === 'stacktower') {
                room.game.state.winner = null;
                room.game.state.players.forEach((p: any) => {
                    p.score = 0;
                    p.width = 300;
                    p.status = 'playing';
                    p.history = [];
                });
                io.to(canonicalRoomId).emit('game_update', getSafeGame(room.game));
            } else if (room.game.type === 'ninemenmorris') {
                room.game.state.board = Array(24).fill(null);
                room.game.state.winner = null;
                room.game.state.winReason = null;
                room.game.state.phase = 'placing';
                room.game.state.turn = players[0].id;
                room.game.state.piecesPlaced = { [players[0].id]: 0, [players[1].id]: 0 };
                room.game.state.piecesOnBoard = { [players[0].id]: 0, [players[1].id]: 0 };
                room.game.state.selectedPosition = null;
                room.game.state.millFormed = false;
                room.game.state.lastMoveTime = Date.now();
                resetGameTimer(room, canonicalRoomId, players[0].id);
                io.to(canonicalRoomId).emit('game_update', getSafeGame(room.game));
            } else if (room.game.type === 'connect4') {
                room.game.state.board = Array(8).fill(null).map(() => Array(8).fill(null));
                room.game.state.winner = null;
                room.game.state.winningCells = [];
                room.game.state.turn = players[0].id;
                room.game.state.lastMoveTime = Date.now();
                resetGameTimer(room, canonicalRoomId, players[0].id);
                io.to(canonicalRoomId).emit('game_update', getSafeGame(room.game));
            }
        }
    });

    socket.on('end_game', ({ roomId }) => {
        const canonicalRoomId = roomId.toUpperCase();
        const room = rooms[canonicalRoomId];
        const user = users[socket.id];
        if (room && user && user.isHost) {
            if (room.game) {
                if (room.game.timer) {
                    clearTimeout(room.game.timer);
                    clearInterval(room.game.timer);
                }
                delete room.game;
                io.to(canonicalRoomId).emit('game_ended');
            }
        }
    });

    socket.on('make_move', ({ roomId, index }) => {
        const canonicalRoomId = roomId.toUpperCase();
        const room = rooms[canonicalRoomId];

        // Validation
        if (!room || !room.game || room.game.state.winner || room.game.state.draw) return;

        const game = room.game.state;
        if (game.turn !== socket.id) return;
        if (game.board[index] !== null) return;

        // Execute Move
        const player = game.players.find((p: any) => p.id === socket.id);
        if (!player) return;

        game.board[index] = player.symbol;
        const winnerSymbol = checkWinner(game.board);

        // Check Status
        if (winnerSymbol === player.symbol) {
            game.winner = socket.id;
            if (room.game && room.game.timer) clearTimeout(room.game.timer);
        } else if (winnerSymbol === 'draw') {
            game.draw = true;
            if (room.game && room.game.timer) clearTimeout(room.game.timer);
        } else {
            const nextIdx = (game.players.findIndex((p: any) => p.id === socket.id) + 1) % game.players.length;
            game.turn = game.players[nextIdx].id;
            resetGameTimer(room, canonicalRoomId, game.turn);
        }

        io.to(canonicalRoomId).emit('game_update', getSafeGame(room.game));

        // AI Logic
        if (!game.winner && !game.draw && game.turn === 'AI') {
            const aiPlayer = game.players.find((p: any) => p.id === 'AI');
            setTimeout(() => {
                // Re-validate state inside timeout
                if (!room || !room.game || room.game.state.winner || room.game.state.draw) return;

                const currentGame = room.game.state; // Use fresh reference if needed (though it's same object)
                const bestMove = getBestMove(currentGame.board, aiPlayer.symbol);
                if (bestMove !== -1) {
                    currentGame.board[bestMove] = aiPlayer.symbol;
                    const w = checkWinner(currentGame.board);

                    if (w === aiPlayer.symbol) {
                        currentGame.winner = 'AI';
                        if (room.game && room.game.timer) clearTimeout(room.game.timer);
                    } else if (w === 'draw') {
                        currentGame.draw = true;
                        if (room.game && room.game.timer) clearTimeout(room.game.timer);
                    } else {
                        const next = (currentGame.players.findIndex((p: any) => p.id === 'AI') + 1) % currentGame.players.length;
                        currentGame.turn = currentGame.players[next].id;
                        resetGameTimer(room, canonicalRoomId, currentGame.turn);
                    }
                    io.to(canonicalRoomId).emit('game_update', getSafeGame(room.game));
                }
            }, 600);
        }
    });

    // Nine Men's Morris Move Handler
    socket.on('morris_move', ({ roomId, position }) => {
        const canonicalRoomId = roomId.toUpperCase();
        const room = rooms[canonicalRoomId];

        if (!room || !room.game || room.game.type !== 'ninemenmorris') return;
        if (room.game.state.winner) return;

        const game = room.game.state;
        if (game.turn !== socket.id) return;

        const player = game.players.find((p: any) => p.id === socket.id);
        if (!player) return;

        const opponent = game.players.find((p: any) => p.id !== socket.id);

        // Helper: Check if position forms a mill
        const checkMill = (board: any[], pos: number, playerId: string) => {
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
        const isInMill = (board: any[], pos: number) => {
            const piece = board[pos];
            if (!piece) return false;
            return checkMill(board, pos, piece);
        };

        // Helper: Check if all opponent pieces are in mills
        const allPiecesInMills = (playerId: string) => {
            for (let i = 0; i < 24; i++) {
                if (game.board[i] === playerId) {
                    if (!isInMill(game.board, i)) {
                        return false;
                    }
                }
            }
            return true;
        };

        // Helper: Check if player has any valid moves
        const hasValidMoves = (playerId: string) => {
            const adjacency: number[][] = [
                // Outer square: 0-7
                [1, 7],        // 0: top-left
                [0, 2, 9],     // 1: top-center
                [1, 3],        // 2: top-right
                [2, 4, 11],    // 3: right-top
                [3, 5],        // 4: right-bottom
                [4, 6, 13],    // 5: bottom-center
                [5, 7],        // 6: bottom-left
                [0, 6, 15],    // 7: left-center
                // Middle square: 8-15
                [9, 15],       // 8: top-left
                [1, 8, 10, 17], // 9: top-center (connects to outer 1 and inner 17)
                [9, 11],       // 10: top-right
                [3, 10, 12, 19], // 11: right-center (connects to outer 3 and inner 19)
                [11, 13],      // 12: bottom-right
                [5, 12, 14, 21], // 13: bottom-center (connects to outer 5 and inner 21)
                [13, 15],      // 14: bottom-left
                [7, 8, 14, 23], // 15: left-center (connects to outer 7 and inner 23)
                // Inner square: 16-23
                [17, 23],      // 16: top-left
                [9, 16, 18],   // 17: top-center (connects to middle 9)
                [17, 19],      // 18: top-right
                [11, 18, 20],  // 19: right-center (connects to middle 11)
                [19, 21],      // 20: bottom-right
                [13, 20, 22],  // 21: bottom-center (connects to middle 13)
                [21, 23],      // 22: bottom-left
                [15, 16, 22]   // 23: left-center (connects to middle 15)
            ];

            if (game.piecesOnBoard[playerId] === 3) {
                return game.board.includes(null);
            }

            for (let i = 0; i < 24; i++) {
                if (game.board[i] === playerId) {
                    for (const adj of adjacency[i]) {
                        if (game.board[adj] === null) return true;
                    }
                }
            }
            return false;
        };

        // Helper: Check if there are any removable pieces
        const hasRemovablePieces = (opponentId: string) => {
            const allInMills = allPiecesInMills(opponentId);
            for (let i = 0; i < 24; i++) {
                if (game.board[i] === opponentId) {
                    if (!isInMill(game.board, i) || allInMills) {
                        return true;
                    }
                }
            }
            return false;
        };

        // PHASE: REMOVING (after mill formed)
        if (game.phase === 'removing') {
            if (game.board[position] === opponent.id) {
                const pieceInMill = isInMill(game.board, position);
                const allOpponentInMills = allPiecesInMills(opponent.id);

                if (!pieceInMill || allOpponentInMills) {
                    game.board[position] = null;
                    game.piecesOnBoard[opponent.id]--;
                    game.millFormed = false;

                    if (game.piecesPlaced[player.id] < 9 || game.piecesPlaced[opponent.id] < 9) {
                        game.phase = 'placing';
                    } else if (game.piecesOnBoard[socket.id] === 3 || game.piecesOnBoard[opponent.id] === 3) {
                        game.phase = 'flying';
                    } else {
                        game.phase = 'moving';
                    }

                    game.turn = opponent.id;
                    game.lastMoveTime = Date.now();
                    resetGameTimer(room, canonicalRoomId, opponent.id);
                }
            }

            // PHASE 1: PLACING
        } else if (game.phase === 'placing') {
            if (game.board[position] !== null) return; // Position occupied

            // Place piece
            game.board[position] = socket.id;
            game.piecesPlaced[socket.id]++;
            game.piecesOnBoard[socket.id]++;

            // Check if mill formed
            if (checkMill(game.board, position, socket.id)) {
                if (hasRemovablePieces(opponent.id)) {
                    game.phase = 'removing';
                    game.millFormed = true;
                } else {
                    if (game.piecesPlaced[player.id] >= 9 && game.piecesPlaced[opponent.id] >= 9) {
                        game.phase = 'moving';
                    }
                    game.turn = opponent.id;
                    game.lastMoveTime = Date.now();
                    resetGameTimer(room, canonicalRoomId, opponent.id);
                }
            } else {
                if (game.piecesPlaced[player.id] >= 9 && game.piecesPlaced[opponent.id] >= 9) {
                    game.phase = 'moving';
                }
                game.turn = opponent.id;
                game.lastMoveTime = Date.now();
                resetGameTimer(room, canonicalRoomId, opponent.id);
            }

            // PHASE 2: MOVING
        } else if (game.phase === 'moving') {
            const adjacency: number[][] = [
                // Outer square: 0-7
                [1, 7],        // 0: top-left
                [0, 2, 9],     // 1: top-center
                [1, 3],        // 2: top-right
                [2, 4, 11],    // 3: right-top
                [3, 5],        // 4: right-bottom
                [4, 6, 13],    // 5: bottom-center
                [5, 7],        // 6: bottom-left
                [0, 6, 15],    // 7: left-center
                // Middle square: 8-15
                [9, 15],       // 8: top-left
                [1, 8, 10, 17], // 9: top-center
                [9, 11],       // 10: top-right
                [3, 10, 12, 19], // 11: right-center
                [11, 13],      // 12: bottom-right
                [5, 12, 14, 21], // 13: bottom-center
                [13, 15],      // 14: bottom-left
                [7, 8, 14, 23], // 15: left-center
                // Inner square: 16-23
                [17, 23],      // 16: top-left
                [9, 16, 18],   // 17: top-center
                [17, 19],      // 18: top-right
                [11, 18, 20],  // 19: right-center
                [19, 21],      // 20: bottom-right
                [13, 20, 22],  // 21: bottom-center
                [21, 23],      // 22: bottom-left
                [15, 16, 22]   // 23: left-center
            ];

            if (game.selectedPosition === null) {
                // Select a piece to move
                if (game.board[position] === socket.id) {
                    game.selectedPosition = position;
                }
            } else {
                // Move selected piece
                if (game.board[position] === null) {
                    const isAdjacent = adjacency[game.selectedPosition].includes(position);

                    if (isAdjacent) {
                        // Move piece
                        game.board[position] = socket.id;
                        game.board[game.selectedPosition] = null;
                        game.selectedPosition = null;

                        // Check if mill formed
                        if (checkMill(game.board, position, socket.id)) {
                            if (hasRemovablePieces(opponent.id)) {
                                game.phase = 'removing';
                                game.millFormed = true;
                            } else {
                                if (game.piecesOnBoard[socket.id] === 3) {
                                    game.phase = 'flying';
                                }
                                game.turn = opponent.id;
                                game.lastMoveTime = Date.now();
                                resetGameTimer(room, canonicalRoomId, opponent.id);
                            }
                        } else {
                            if (game.piecesOnBoard[socket.id] === 3) {
                                game.phase = 'flying';
                            }
                            game.turn = opponent.id;
                            game.lastMoveTime = Date.now();
                            resetGameTimer(room, canonicalRoomId, opponent.id);
                        }
                    }
                } else if (game.board[position] === socket.id) {
                    // Reselect different piece
                    game.selectedPosition = position;
                }
            }

            // PHASE 3: FLYING (when player has only 3 pieces)
        } else if (game.phase === 'flying') {
            if (game.selectedPosition === null) {
                // Select a piece
                if (game.board[position] === socket.id) {
                    game.selectedPosition = position;
                }
            } else {
                // Fly to any empty position
                if (game.board[position] === null) {
                    game.board[position] = socket.id;
                    game.board[game.selectedPosition] = null;
                    game.selectedPosition = null;

                    // Check if mill formed
                    if (checkMill(game.board, position, socket.id)) {
                        if (hasRemovablePieces(opponent.id)) {
                            game.phase = 'removing';
                            game.millFormed = true;
                        } else {
                            game.turn = opponent.id;
                            game.lastMoveTime = Date.now();
                            resetGameTimer(room, canonicalRoomId, opponent.id);
                        }
                    } else {
                        game.turn = opponent.id;
                        game.lastMoveTime = Date.now();
                        resetGameTimer(room, canonicalRoomId, opponent.id);
                    }
                } else if (game.board[position] === socket.id) {
                    // Reselect
                    game.selectedPosition = position;
                }
            }
        }

        // Check win/draw conditions
        if (game.phase !== 'placing' && game.phase !== 'removing') {
            if (game.piecesOnBoard[opponent.id] < 3) {
                game.winner = socket.id;
                if (room.game && room.game.timer) clearTimeout(room.game.timer);
            } else if (!hasValidMoves(opponent.id)) {
                game.winner = 'draw';
                game.winReason = 'stalemate';
                if (room.game && room.game.timer) clearTimeout(room.game.timer);
            }
        }

        io.to(canonicalRoomId).emit('game_update', getSafeGame(room.game));
    });

    // Connect 4 Move Handler
    socket.on('connect4_move', ({ roomId, column }) => {
        const canonicalRoomId = roomId.toUpperCase();
        const room = rooms[canonicalRoomId];

        if (!room || !room.game || room.game.type !== 'connect4') return;
        if (room.game.state.winner) return;

        const game = room.game.state;
        if (game.turn !== socket.id) return;

        // Check valid column (8 cols)
        if (column < 0 || column >= 8) return;

        // Find lowest empty row in column (8 rows)
        let rowToPlace = -1;
        for (let r = 7; r >= 0; r--) {
            if (game.board[r][column] === null) {
                rowToPlace = r;
                break;
            }
        }

        if (rowToPlace === -1) return; // Column full

        // Place piece
        game.board[rowToPlace][column] = socket.id;

        // Check Win
        const checkWin = (row: number, col: number, player: string) => {
            // Directions: [dr, dc]
            const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]]; // Horiz, Vert, Diag, Anti-Diag

            for (const [dr, dc] of dirs) {
                let count = 1;
                const winningCells = [{ r: row, c: col }];

                // Check forward
                for (let i = 1; i < 4; i++) {
                    const r = row + (dr * i);
                    const c = col + (dc * i);
                    if (r >= 0 && r < 8 && c >= 0 && c < 8 && game.board[r][c] === player) {
                        count++;
                        winningCells.push({ r, c });
                    } else break;
                }

                // Check backward
                for (let i = 1; i < 4; i++) {
                    const r = row - (dr * i);
                    const c = col - (dc * i);
                    if (r >= 0 && r < 8 && c >= 0 && c < 8 && game.board[r][c] === player) {
                        count++;
                        winningCells.push({ r, c });
                    } else break;
                }

                if (count >= 4) {
                    return winningCells;
                }
            }
            return null;
        };

        const winningCells = checkWin(rowToPlace, column, socket.id);
        if (winningCells) {
            game.winner = socket.id;
            game.winningCells = winningCells;
            if (room.game.timer) clearTimeout(room.game.timer);
        } else {
            // Check Draw (Full Board)
            const isFull = game.board.every((row: any[]) => row.every((cell: any) => cell !== null));
            if (isFull) {
                game.winner = 'draw';
                if (room.game.timer) clearTimeout(room.game.timer);
            } else {
                // Switch Turn
                const opponent = game.players.find((p: any) => p.id !== socket.id);
                game.turn = opponent.id;
                game.lastMoveTime = Date.now();
                resetGameTimer(room, canonicalRoomId, opponent.id);
            }
        }

        io.to(canonicalRoomId).emit('game_update', getSafeGame(room.game));
    });


    socket.on('disconnect', () => {
        const user = users[socket.id];
        if (user && user.roomId) {
            const room = rooms[user.roomId];
            if (room) {
                room.users = room.users.filter(u => u.id !== socket.id);
                io.to(room.id).emit('user_left', { username: user.username, id: socket.id });
                io.to(room.id).emit('room_users_update', room.users);

                // Game cleanup if player leaves
                if (room.game && room.game.state.players.some((p: any) => p.id === socket.id)) {
                    if (room.game.timer) {
                        clearTimeout(room.game.timer);
                        clearInterval(room.game.timer);
                    }
                    delete room.game;
                    io.to(room.id).emit('game_ended');
                }

                if (room.users.length === 0) {
                    delete rooms[room.id];
                } else if (user.isHost) {
                    // Reassign Host
                    if (room.users[0]) {
                        room.users[0].isHost = true;
                        room.hostId = room.users[0].id;
                        io.to(room.id).emit('room_users_update', room.users);
                    }
                }
            }
        }
        delete users[socket.id];
        console.log('User disconnected:', socket.id);
    });
});

server.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});
