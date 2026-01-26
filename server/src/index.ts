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
// Map userId -> socketId for global reachability
const userSessions: Record<string, string> = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('register_session', ({ userId, username }) => {
        if (userId) {
            userSessions[userId] = socket.id;
            console.log(`Registered session for ${username} (${userId})`);
        }
    });

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
        const canonicalRoomId = roomId.toUpperCase();
        let room = rooms[canonicalRoomId];

        // Auto-create DM rooms if they don't exist
        if (!room && canonicalRoomId.startsWith('DM_')) {
            console.log(`[DEBUG] Creating NEW DM Room: ${canonicalRoomId} (Max: 20)`);
            room = {
                id: canonicalRoomId,
                hostId: socket.id,
                users: [],
                settings: {
                    maxPlayers: 20, // Allow multiple devices/tabs per user
                    isPrivate: true
                }
            };
            rooms[canonicalRoomId] = room;
        }

        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }

        const uniqueUserIds = new Set<string>();
        room.users.forEach(u => {
            if (u.userId) uniqueUserIds.add(u.userId);
            else uniqueUserIds.add(u.id);
        });

        // Allow if:
        // 1. User ID is already in the room (rejoining from another tab)
        // 2. Socket ID is already in the room (updating session/metadata)
        const isSocketInRoom = room.users.some(u => u.id === socket.id);
        const isRejoining = (userId && uniqueUserIds.has(userId)) || isSocketInRoom;

        console.log(`[DEBUG] Join Request: Room=${canonicalRoomId}, User=${username}, ID=${userId || 'guest'} (Socket: ${socket.id})`);
        console.log(`[DEBUG] Room State: TotalUsers=${room.users.length}, UniqueUsers=${uniqueUserIds.size}, Max=${room.settings.maxPlayers}`);
        console.log(`[DEBUG] Decision: IsRejoining=${isRejoining}, Full=${uniqueUserIds.size >= room.settings.maxPlayers}`);

        if (!isRejoining && uniqueUserIds.size >= room.settings.maxPlayers) {
            console.log(`[DEBUG] -> BLOCKED: Room Full`);
            socket.emit('error', 'Room is full');
            return;
        }

        // Fetch message history using Canonical ID
        try {
            const history = await Message.find({ roomId: canonicalRoomId })
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

        let isHost = false;

        // Check if user with same userId already exists in the room
        if (userId && !userId.startsWith('guest-')) {
            const existingUserIndex = room.users.findIndex(u => u.userId === userId);
            if (existingUserIndex !== -1) {
                // Preserve Host status
                if (room.users[existingUserIndex].isHost) {
                    isHost = true;
                }

                // Remove the old user entry to prevent duplicates
                // We could also disconnect the old socket, but for now just managing the list is enough
                const oldSocketId = room.users[existingUserIndex].id;

                // Remove from room.users
                room.users.splice(existingUserIndex, 1);

                // Remove from users map if it exists there under the old socket ID
                // Note: user might be switching devices or tabs
                if (users[oldSocketId]) {
                    // Optional: maybe we don't need to delete from users map immediately 
                    // as the disconnect event might handle it, but it's cleaner to ensure we know this is a replacement.
                }
            }
        }

        // If room is empty (first joiner or replacing the only user), make host
        if (room.users.length === 0) {
            isHost = true;
        }

        const newUser: User = {
            id: socket.id,
            userId,
            username,
            roomId: room.id,
            isHost,
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
        const canonicalRoomId = roomId.toUpperCase();
        const user = users[socket.id];

        // Strict check: user must be in the room they are sending to
        if (user && user.roomId === canonicalRoomId) {
            const msgData = {
                roomId: canonicalRoomId,
                senderId: user.userId || socket.id,
                senderUsername: user.username,
                text: message,
                status: 'sent'
            };

            try {
                const newMsg = new Message(msgData);
                await newMsg.save();

                io.to(canonicalRoomId).emit('receive_message', {
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
        const canonicalRoomId = roomId.toUpperCase();
        try {
            await Message.findByIdAndUpdate(messageId, { status: 'read' });
            io.to(canonicalRoomId).emit('message_status_update', { id: messageId, status: 'read' });
        } catch (e) { }
    });

    socket.on('get_room_state', ({ roomId }) => {
        if (typeof roomId === 'string') {
            const r = rooms[roomId.toUpperCase()];
            if (r) {
                socket.emit('room_users_update', r.users);
            }
        }
    });

    socket.on('toggle_mute', ({ roomId }) => {
        const canonicalRoomId = roomId.toUpperCase();
        const user = users[socket.id];
        if (user && user.roomId === canonicalRoomId) {
            user.isMuted = !user.isMuted;
            io.to(canonicalRoomId).emit('room_users_update', rooms[canonicalRoomId].users);
        }
    });


    socket.on('webrtc_ready', ({ roomId }) => {
        // Assume roomId comes correct or use user.roomId?
        // Safer to use user.roomId
        const user = users[socket.id];
        if (user && user.roomId) {
            socket.broadcast.to(user.roomId).emit('webrtc_ready', { id: socket.id });
        }
    });

    socket.on('signal', ({ targetId, signal }) => {
        io.to(targetId).emit('signal', { senderId: socket.id, signal });
    });

    // --- Call Features (1-1) ---
    // --- Call Features (1-1) ---
    socket.on('initiate_call', ({ roomId, callerName, callerUserId }) => {
        const canonicalRoomId = roomId.toUpperCase();

        // Strategy 1: Broadcast to room (works if user is IN the room)
        socket.broadcast.to(canonicalRoomId).emit('incoming_call', {
            callerId: socket.id,
            callerName,
            roomId
        });

        // Strategy 2: Direct message if it's a DM and user is elsewhere (Home Screen)
        // Format: DM_USER1_USER2 (Sorted)
        if (canonicalRoomId.startsWith('DM_') && callerUserId) {
            const parts = canonicalRoomId.replace('DM_', '').split('_');
            const receiverId = parts.find((id: string) => id !== callerUserId);

            console.log(`[Call Debug] Caller: ${callerUserId}, Room: ${canonicalRoomId}`);
            console.log(`[Call Debug] Parts: ${JSON.stringify(parts)}, Receiver Calculated: ${receiverId}`);
            console.log(`[Call Debug] UserSessions Keys: ${Object.keys(userSessions).length} keys`);

            if (receiverId) {
                const receiverSocketId = userSessions[receiverId];
                console.log(`[Call Debug] Receiver Socket ID: ${receiverSocketId}`);
                console.log(`[Call Logic] DM Call from ${callerUserId} to ${receiverId}. Target Socket: ${receiverSocketId}`);

                // Need to check if receiverSocketId is actually connected
                if (receiverSocketId && receiverSocketId !== socket.id) {
                    io.to(receiverSocketId).emit('incoming_call', {
                        callerId: socket.id,
                        callerName,
                        roomId // Send roomId so they know which room to join
                    });
                }
            }
        }
    });

    socket.on('accept_call', ({ roomId }) => {
        const canonicalRoomId = roomId.toUpperCase();
        socket.broadcast.to(canonicalRoomId).emit('call_accepted');
    });

    socket.on('decline_call', ({ roomId }) => {
        const canonicalRoomId = roomId.toUpperCase();
        socket.broadcast.to(canonicalRoomId).emit('call_declined');
    });

    socket.on('end_call', ({ roomId }) => {
        const canonicalRoomId = roomId.toUpperCase();
        socket.broadcast.to(canonicalRoomId).emit('call_ended');
    });
    // ---------------------------

    socket.on('disconnect', () => {
        const user = users[socket.id];
        if (user && user.roomId) {
            const room = rooms[user.roomId]; // user.roomId is already uppercase from join_room
            if (room) {
                room.users = room.users.filter(u => u.id !== socket.id);

                io.to(room.id).emit('user_left', { username: user.username, id: socket.id });
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
