import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface User {
    id: string;
    username: string;
    email: string;
}

interface AuthContextProps {
    user: User | null;
    token: string | null;
    isLoading: boolean;
    login: (token: string, user: User) => void;
    logout: () => void;
    checkAvailability: (username: string, email: string) => Promise<boolean>;
    loginGuest: (username: string) => void;
}

const AuthContext = createContext<AuthContextProps>({
    user: null,
    token: null,
    isLoading: true,
    login: () => { },
    logout: () => { },
    checkAvailability: async () => false,
    loginGuest: () => { },
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const initAuth = async () => {
            if (token) {
                try {
                    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
                    const res = await axios.get(`${API_URL}/api/auth/me`);
                    setUser(res.data.user);
                } catch (err) {
                    // Start of modification: Don't auto logout if token fails, check guest
                    localStorage.removeItem('token');
                    setToken(null);
                    delete axios.defaults.headers.common['Authorization'];
                }
            }

            // Check for guest if no logged in user
            const guestUser = localStorage.getItem('guest_username');
            if (!token && guestUser) {
                setUser({
                    id: 'guest-' + Math.random().toString(36).substr(2, 9),
                    username: guestUser,
                    email: ''
                });
            }

            setIsLoading(false);
        };
        initAuth();
    }, [token]);

    const login = (newToken: string, newUser: User) => {
        localStorage.setItem('token', newToken);
        localStorage.removeItem('guest_username'); // Clear guest if logging in
        setToken(newToken);
        setUser(newUser);
        axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    };

    const loginGuest = (username: string) => {
        const guestUser = {
            id: 'guest-' + Math.random().toString(36).substr(2, 9),
            username,
            email: ''
        };
        localStorage.setItem('guest_username', username);
        setUser(guestUser);
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('guest_username');
        setToken(null);
        setUser(null);
        delete axios.defaults.headers.common['Authorization'];
    };

    const checkAvailability = async (username: string, email: string) => {
        try {
            const res = await axios.post(`${API_URL}/api/auth/check-availability`, { username, email });
            return res.data.available;
        } catch (error) {
            console.error(error);
            return false;
        }
    };

    return (
        <AuthContext.Provider value={{ user, token, isLoading, login, logout, checkAvailability, loginGuest }}>
            {children}
        </AuthContext.Provider>
    );
};
