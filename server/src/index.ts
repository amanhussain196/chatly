import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import friendRoutes from './routes/friends';
import { Message } from './models/Message';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json()); // Enable JSON body parsing

// Check if MONGO_URI is set
if (!process.env.MONGO_URI) {
    console.warn("WARNING: MONGO_URI not set. Auth features will fail.");
}

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/chatly')
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error('MongoDB Connection Error:', err));

app.use('/api/auth', authRoutes);
app.use('/api/friends', friendRoutes);

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3001;

// State management (Keep it in memory for now as per requirements)
interface User {
    id: string;
    userId?: string; // Auth ID or Guest ID
    username: string;
    roomId?: string;
    isHost: boolean;
    isMuted: boolean;
}

interface Room {
    id: string;
    hostId: string;
    users: User[];
    settings: {
        maxPlayers: number;
        isPrivate: boolean;
    };
}

const rooms: Record<string, Room> = {};
const users: Record<string, User> = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create_room', ({ username, userId, isPrivate }) => {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();

        const newUser: User = {
            id: socket.id,
            userId,
            username,
            roomId,
            isHost: true,
            isMuted: false
        };

        users[socket.id] = newUser;
        rooms[roomId] = {
            id: roomId,
            hostId: socket.id,
            users: [newUser],
            settings: {
                maxPlayers: 8, // Default
                isPrivate
            }
        };

        socket.join(roomId);
        socket.emit('room_created', { roomId, user: newUser });
        io.to(roomId).emit('room_users_update', rooms[roomId].users);
    });



    socket.on('join_room', async ({ username, userId, roomId }) => {
        let room = rooms[roomId.toUpperCase()];

        // Auto-create DM rooms if they don't exist
        if (!room && roomId.startsWith('dm_')) {
            const newRoomId = roomId; // Case sensitive for DMs? Or keep upper? 
            // My client sorts IDs. IDs might be mixed case. 
            // Better to keep exact ID for DMs.
            // But rooms map uses uppercase keys? 
            // Standard create_room uses random alphanumeric uppercase.
            // Let's rely on the client sending exact ID. 
            // But if I store it, I should be consistent. 
            // Let's use the detailed ID as the key for DMs.

            room = {
                id: roomId,
                hostId: socket.id, // The first joiner is host (doesn't matter much for DMs)
                users: [],
                settings: {
                    maxPlayers: 2,
                    isPrivate: true
                }
            };
            rooms[roomId.toUpperCase()] = room; // Store with Upper key like others?
            // If I store as Upper, I must ensure client sends/checks Upper? 
            // Mongo IDs are lower case usually. 
            // Let's just use roomId as is for the ID property, but store in map with Upper Key to match lookup?
            // "dm_abc_123".toUpperCase() -> "DM_ABC_123". 
            // As long as lookup `rooms[roomId.toUpperCase()]` finds it, we are good.
        }

        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }

        if (room.users.length >= room.settings.maxPlayers) {
            socket.emit('error', 'Room is full');
            return;
        }

        // Fetch message history
        try {
            const history = await Message.find({ roomId })
                .sort({ createdAt: 1 })
                .limit(50);

            socket.emit('message_history', history.map(msg => ({
                id: msg._id.toString(),
                text: msg.text,
                sender: msg.senderUsername,
                timestamp: msg.createdAt.toISOString(),
                status: msg.status
            })));
        } catch (e) {
            console.error(e);
        }

        const newUser: User = {
            id: socket.id,
            userId, // Store the auth ID
            username,
            roomId: room.id,
            isHost: false,
            isMuted: false
        };

        users[socket.id] = newUser;
        room.users.push(newUser);

        socket.join(room.id);
        socket.emit('room_joined', { roomId: room.id, user: newUser });
        io.to(room.id).emit('user_joined', { username, id: socket.id });
        io.to(room.id).emit('room_users_update', room.users);
    });

    socket.on('send_message', async ({ message, roomId }) => {
        const user = users[socket.id];
        if (user && user.roomId === roomId) {
            const msgData = {
                roomId,
                senderId: user.userId || socket.id,
                senderUsername: user.username,
                text: message,
                status: 'sent'
            };

            try {
                const newMsg = new Message(msgData);
                await newMsg.save();

                io.to(roomId).emit('receive_message', {
                    id: newMsg._id.toString(),
                    text: newMsg.text,
                    sender: newMsg.senderUsername,
                    timestamp: newMsg.createdAt.toISOString(),
                    status: newMsg.status
                });
            } catch (e) {
                console.error("Msg Save Error", e);
            }
        }
    });

    socket.on('mark_read', async ({ messageId, roomId }) => {
        // Update DB
        try {
            await Message.findByIdAndUpdate(messageId, { status: 'read' });
            io.to(roomId).emit('message_status_update', { id: messageId, status: 'read' });
        } catch (e) { }
    });

    socket.on('get_room_state', ({ roomId }) => {
        const room = rooms[roomId]; // roomId is case sensitive in keys? In join_room we used roomId.toUpperCase()... wait.
        // In create_room: roomId = Math.random()...toUpperCase()
        // In join_room: const room = rooms[roomId.toUpperCase()];
        // So yes, keys are uppercase.
        // But the client might satisfy the roomId param from the URL which calls logic.

        // Let's ensure we look it up correctly.
        if (typeof roomId === 'string') {
            const r = rooms[roomId.toUpperCase()];
            if (r) {
                socket.emit('room_users_update', r.users);
            }
        }
    });

    socket.on('toggle_mute', ({ roomId }) => {
        const user = users[socket.id];
        if (user && user.roomId === roomId) {
            user.isMuted = !user.isMuted;
            io.to(roomId).emit('room_users_update', rooms[roomId].users);
        }
    });


    socket.on('webrtc_ready', ({ roomId }) => {
        socket.broadcast.to(roomId).emit('webrtc_ready', { id: socket.id });
    });

    // WebRTC Signaling
    socket.on('signal', ({ targetId, signal }) => {
        io.to(targetId).emit('signal', { senderId: socket.id, signal });
    });

    socket.on('disconnect', () => {
        const user = users[socket.id];
        if (user && user.roomId) {
            const room = rooms[user.roomId];
            if (room) {
                room.users = room.users.filter(u => u.id !== socket.id);

                io.to(room.id).emit('user_left', { username: user.username, id: socket.id }); // Send ID for peer cleanup
                io.to(room.id).emit('room_users_update', room.users);

                if (room.users.length === 0) {
                    delete rooms[room.id];
                } else if (user.isHost) {
                    // Assign new host
                    room.users[0].isHost = true;
                    room.hostId = room.users[0].id;
                    io.to(room.id).emit('room_users_update', room.users);
                }
            }
        }
        delete users[socket.id];
        console.log('User disconnected:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
