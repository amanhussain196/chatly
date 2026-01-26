import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext'; // Import Auth

const SOCKET_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface SocketContextProps {
    socket: Socket | null;
    isConnected: boolean;
}

const SocketContext = createContext<SocketContextProps>({
    socket: null,
    isConnected: false,
});

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }: { children: ReactNode }) => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const { user } = useAuth(); // Get authenticated user

    useEffect(() => {
        const newSocket = io(SOCKET_URL, {
            transports: ['websocket'],
            autoConnect: true,
        });

        newSocket.on('connect', () => {
            console.log('Connected to socket server');
            setIsConnected(true);

            // Register session immediately if user is already known (or will update when user changes)
            if (user && user.id) {
                newSocket.emit('register_session', { userId: user.id, username: user.username });
            }
        });

        newSocket.on('disconnect', () => {
            console.log('Disconnected from socket server');
            setIsConnected(false);
        });

        setSocket(newSocket);

        return () => {
            newSocket.close();
        };
    }, []);

    // Effect to register session when user logs in AFTER socket connects
    useEffect(() => {
        if (socket && isConnected && user && user.id) {
            console.log(`[Client] Registering session for ${user.username} (${user.id})`);
            socket.emit('register_session', { userId: user.id, username: user.username });
        }
    }, [socket, isConnected, user]);

    return (
        <SocketContext.Provider value={{ socket, isConnected }}>
            {children}
        </SocketContext.Provider>
    );
};
