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
            const guestUsername = sessionStorage.getItem('guest_username');
            const guestId = sessionStorage.getItem('guest_id');

            if (!token && guestUsername) {
                const id = guestId || 'guest-' + Math.random().toString(36).substr(2, 9);
                if (!guestId) sessionStorage.setItem('guest_id', id);

                setUser({
                    id: id,
                    username: guestUsername,
                    email: ''
                });
            }

            setIsLoading(false);
        };
        initAuth();
    }, [token]);

    const login = (newToken: string, newUser: User) => {
        localStorage.setItem('token', newToken);
        sessionStorage.removeItem('guest_username'); // Clear guest if logging in
        setToken(newToken);
        setUser(newUser);
        axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    };

    const loginGuest = (username: string) => {
        const id = 'guest-' + Math.random().toString(36).substr(2, 9);
        const guestUser = {
            id,
            username,
            email: ''
        };
        sessionStorage.setItem('guest_username', username);
        sessionStorage.setItem('guest_id', id);
        setUser(guestUser);
    };

    const logout = () => {
        localStorage.removeItem('token');
        sessionStorage.removeItem('guest_username');
        setToken(null);
        setUser(null);
        delete axios.defaults.headers.common['Authorization'];
    };

    const checkAvailability = async (username: string, email: string) => {
        try {
            const res = await axios.post(`${API_URL}/api/auth/check-availability`, { username, email });
            return res.data.available;
        } catch (error: any) {
            console.warn('Username availability check failed (likely no DB):', error.message);
            // If server is in guest/memory mode (no MongoDB), allow all usernames
            // This prevents blocking users when database is not configured
            return true; // Assume available in guest mode
        }
    };

    return (
        <AuthContext.Provider value={{ user, token, isLoading, login, logout, checkAvailability, loginGuest }}>
            {children}
        </AuthContext.Provider>
    );
};
