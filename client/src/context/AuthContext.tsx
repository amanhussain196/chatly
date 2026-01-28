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
    const [user, setUser] = useState<User | null>(() => {
        try {
            const savedUser = localStorage.getItem('user_data');
            return savedUser ? JSON.parse(savedUser) : null;
        } catch (e) {
            return null;
        }
    });

    const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
    // If we have a cached user and token, we are not "loading" in the blocking sense
    const [isLoading, setIsLoading] = useState(!user && !!token);

    useEffect(() => {
        const initAuth = async () => {
            // Set a timeout for the entire auth process to prevent indefinite loading
            const authTimeout = setTimeout(() => {
                console.warn('[Auth] Auth initialization timeout, proceeding...');
                setIsLoading(false);
            }, 5000); // 5 second timeout

            try {
                if (token) {
                    try {
                        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

                        // Add timeout to the API call
                        const res = await axios.get(`${API_URL}/api/auth/me`, {
                            timeout: 3000 // 3 second timeout for API call
                        });

                        setUser(res.data.user);
                        localStorage.setItem('user_data', JSON.stringify(res.data.user));
                    } catch (err: any) {
                        console.error("Auth check failed:", err.message);

                        // Only logout if it's an authentication error (401/403)
                        // If it's a network error, keep the cached user
                        if (err.response && (err.response.status === 401 || err.response.status === 403)) {
                            localStorage.removeItem('token');
                            localStorage.removeItem('user_data');
                            setToken(null);
                            setUser(null);
                            delete axios.defaults.headers.common['Authorization'];
                        }
                    }
                }
            } finally {
                clearTimeout(authTimeout);
            }

            // Check for guest if no logged in user (and no cached user)
            const guestUsername = sessionStorage.getItem('guest_username');
            const guestId = sessionStorage.getItem('guest_id');

            if (!token && !user && guestUsername) {
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
        localStorage.setItem('user_data', JSON.stringify(newUser));
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
        localStorage.removeItem('user_data');
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
