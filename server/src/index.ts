import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

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

    socket.on('create_room', ({ username, isPrivate }) => {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();

        const newUser: User = {
            id: socket.id,
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

    socket.on('join_room', ({ username, roomId }) => {
        const room = rooms[roomId.toUpperCase()];

        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }

        if (room.users.length >= room.settings.maxPlayers) {
            socket.emit('error', 'Room is full');
            return;
        }

        const newUser: User = {
            id: socket.id,
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

    socket.on('send_message', ({ message, roomId }) => {
        const user = users[socket.id];
        if (user && user.roomId === roomId) {
            io.to(roomId).emit('receive_message', {
                id: Math.random().toString(36).substr(2, 9),
                text: message,
                sender: user.username,
                timestamp: new Date().toISOString()
            });
        }
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
