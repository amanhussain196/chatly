import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

const AuthPage = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [formData, setFormData] = useState({ username: '', email: '', password: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);

    const { login, checkAvailability } = useAuth();
    const navigate = useNavigate();

    // Real-time validation
    useEffect(() => {
        const check = async () => {
            if (!isLogin && formData.username.length > 2) {
                const isAvailable = await checkAvailability(formData.username, '');
                setUsernameAvailable(isAvailable);
            } else {
                setUsernameAvailable(null);
            }
        };
        const timer = setTimeout(check, 500);
        return () => clearTimeout(timer);
    }, [formData.username, isLogin]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
            const payload = isLogin
                ? { identifier: formData.username, password: formData.password } // Allow login with email too if user types it
                : formData;

            const res = await axios.post(`${API_URL}${endpoint}`, payload);

            login(res.data.token, res.data.user);
            navigate('/');
        } catch (err: any) {
            setError(err.response?.data?.message || 'Authentication failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: 20 }}>
            <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: 20, background: 'linear-gradient(to right, #a78bfa, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Chatly
            </h1>

            <div className="card" style={{ width: '100%', maxWidth: 400, padding: 24 }}>
                <h2 style={{ fontSize: '1.5rem', marginBottom: 20, textAlign: 'center' }}>
                    {isLogin ? 'Welcome Back' : 'Create Account'}
                </h2>

                {error && <div style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', padding: 10, borderRadius: 8, marginBottom: 16 }}>{error}</div>}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {!isLogin && (
                        <div>
                            <label style={{ display: 'block', marginBottom: 8 }}>Email</label>
                            <input
                                type="email"
                                required
                                style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid #333', background: '#1e293b', color: 'white' }}
                                value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                            />
                        </div>
                    )}

                    <div>
                        <label style={{ display: 'block', marginBottom: 8 }}>Username</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type="text"
                                required
                                style={{ width: '100%', padding: 12, borderRadius: 8, border: `1px solid ${usernameAvailable === false ? 'red' : '#333'}`, background: '#1e293b', color: 'white' }}
                                value={formData.username}
                                onChange={e => setFormData({ ...formData, username: e.target.value })}
                            />
                            {!isLogin && usernameAvailable !== null && (
                                <span style={{ position: 'absolute', right: 10, top: 12, fontSize: 12, color: usernameAvailable ? 'green' : 'red' }}>
                                    {usernameAvailable ? 'Available' : 'Taken'}
                                </span>
                            )}
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', marginBottom: 8 }}>Password</label>
                        <input
                            type="password"
                            required
                            style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid #333', background: '#1e293b', color: 'white' }}
                            value={formData.password}
                            onChange={e => setFormData({ ...formData, password: e.target.value })}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading || (!isLogin && usernameAvailable === false)}
                        style={{ padding: 12, background: 'var(--primary)', color: 'white', borderRadius: 8, border: 'none', cursor: 'pointer', marginTop: 8, opacity: loading ? 0.7 : 1 }}
                    >
                        {loading ? 'Processing...' : (isLogin ? 'Login' : 'Sign Up')}
                    </button>
                </form>

                <div style={{ marginTop: 20, textAlign: 'center', fontSize: '0.9rem', color: '#94a3b8' }}>
                    {isLogin ? "Don't have an account? " : "Already have an account? "}
                    <button
                        onClick={() => setIsLogin(!isLogin)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                        {isLogin ? 'Sign Up' : 'Login'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AuthPage;
