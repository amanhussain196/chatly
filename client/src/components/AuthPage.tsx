import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

const AuthPage = () => {
    const [authMode, setAuthMode] = useState<'login' | 'signup' | 'guest'>('login');
    const [formData, setFormData] = useState({ username: '', email: '', password: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);

    const { login, loginGuest, checkAvailability } = useAuth();
    const navigate = useNavigate();

    // Real-time validation
    useEffect(() => {
        const check = async () => {
            if (authMode !== 'login' && formData.username.length > 2) {
                const isAvailable = await checkAvailability(formData.username, '');
                setUsernameAvailable(isAvailable);
            } else {
                setUsernameAvailable(null);
            }
        };
        const timer = setTimeout(check, 500);
        return () => clearTimeout(timer);
    }, [formData.username, authMode]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        if (authMode === 'guest') {
            if (usernameAvailable) {
                loginGuest(formData.username);
                navigate('/');
            } else {
                setError('Username is not available');
            }
            setLoading(false);
            return;
        }

        try {
            const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
            const payload = authMode === 'login'
                ? { identifier: formData.username, password: formData.password }
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
        <div className="app-container">
            <div className="glass-card animate-fade-in" style={{ padding: '40px 24px' }}>

                {/* Header Section */}
                <div className="mb-4 animate-float" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <img src="/chatly_logo.png" alt="Chatly" style={{ width: '80px', height: '80px', objectFit: 'contain' }} />
                    <h1 className="text-gradient" style={{ fontSize: '3rem', fontWeight: 800, margin: 0 }}>
                        Chatly
                    </h1>
                </div>

                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '24px', color: 'var(--text-main)' }}>
                    {authMode === 'login' ? 'Welcome Back' : authMode === 'signup' ? 'Create Account' : 'Guest Access'}
                </h2>

                {error && (
                    <div style={{ background: '#fef2f2', color: '#ef4444', padding: '12px', borderRadius: '12px', marginBottom: '16px', fontSize: '0.9rem' }}>
                        {error}
                    </div>
                )}

                {/* Form Section */}
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>

                    {authMode === 'signup' && (
                        <div style={{ textAlign: 'left' }}>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}>Email</label>
                            <input
                                className="input-pill"
                                type="email"
                                required
                                placeholder="name@example.com"
                                style={{ textAlign: 'left', paddingLeft: '20px' }}
                                value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                            />
                        </div>
                    )}

                    <div style={{ textAlign: 'left' }}>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                            {authMode === 'login' ? 'Username or Email' : 'Username'}
                        </label>
                        <div style={{ position: 'relative' }}>
                            <input
                                className="input-pill"
                                type="text"
                                required
                                placeholder={authMode === 'login' ? "Enter your username" : "Choose a unique username"}
                                style={{
                                    textAlign: 'left',
                                    paddingLeft: '20px',
                                    borderColor: (authMode !== 'login' && usernameAvailable === false) ? '#ef4444' : undefined
                                }}
                                value={formData.username}
                                onChange={e => setFormData({ ...formData, username: e.target.value })}
                            />
                            {authMode !== 'login' && usernameAvailable !== null && (
                                <span style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem', fontWeight: 700, color: usernameAvailable ? '#22c55e' : '#ef4444' }}>
                                    {usernameAvailable ? '✓ Available' : '✕ Taken'}
                                </span>
                            )}
                        </div>
                    </div>

                    {authMode !== 'guest' && (
                        <div style={{ textAlign: 'left' }}>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}>Password</label>
                            <input
                                className="input-pill"
                                type="password"
                                required
                                placeholder="••••••••"
                                style={{ textAlign: 'left', paddingLeft: '20px' }}
                                value={formData.password}
                                onChange={e => setFormData({ ...formData, password: e.target.value })}
                            />
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn-primary"
                        disabled={loading || (authMode !== 'login' && usernameAvailable === false)}
                        style={{ marginTop: '16px' }}
                    >
                        {loading ? 'Processing...' : (authMode === 'login' ? 'Login' : authMode === 'signup' ? 'Sign Up' : 'Start as Guest')}
                    </button>
                </form>

                {/* Footer / Toggle Section */}
                <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    {authMode === 'login' ? (
                        <>
                            <span>
                                New here?{' '}
                                <button
                                    onClick={() => setAuthMode('signup')}
                                    style={{ background: 'transparent', border: 'none', color: '#3b82f6', fontWeight: 700, cursor: 'pointer' }}
                                >
                                    Sign Up
                                </button>
                            </span>
                            <span>
                                Just want to play?{' '}
                                <button
                                    onClick={() => setAuthMode('guest')}
                                    style={{ background: 'transparent', border: 'none', color: '#3b82f6', fontWeight: 700, cursor: 'pointer' }}
                                >
                                    Guest Mode
                                </button>
                            </span>
                        </>
                    ) : (
                        <span>
                            Already have an account?{' '}
                            <button
                                onClick={() => setAuthMode('login')}
                                style={{ background: 'transparent', border: 'none', color: '#3b82f6', fontWeight: 700, cursor: 'pointer' }}
                            >
                                Login
                            </button>
                        </span>
                    )}
                </div>
            </div>

            <div style={{ textAlign: 'center', marginTop: '24px', opacity: 0.5, fontSize: '0.8rem' }}>
                © 2026 Chatly • Secure & Fun
            </div>
        </div>
    );
};

export default AuthPage;
