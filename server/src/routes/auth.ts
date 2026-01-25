import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'secret_key_change_me_in_prod';

// Register
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Basic validation
        if (!username || !email || !password) {
            res.status(400).json({ message: 'All fields are required' });
            return; // Add return to stop execution
        }

        // Check exists
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            res.status(400).json({ message: 'User already exists' });
            return;
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            username,
            email,
            password: hashedPassword
        });

        await newUser.save();

        const token = jwt.sign({ id: newUser._id, username: newUser.username }, JWT_SECRET);

        res.status(201).json({ token, user: { id: newUser._id, username: newUser.username, email: newUser.email } });

    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { identifier, password } = req.body; // identifier = email or username

        // Find user
        const user = await User.findOne({
            $or: [{ email: identifier }, { username: identifier }]
        });

        if (!user) {
            res.status(400).json({ message: 'Invalid credentials' });
            return;
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            res.status(400).json({ message: 'Invalid credentials' });
            return;
        }

        const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET);

        res.json({ token, user: { id: user._id, username: user.username, email: user.email } });

    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// Check availability (Realtime)
router.post('/check-availability', async (req, res) => {
    try {
        const { username, email } = req.body;
        const query: any = {};
        if (username) query.username = username;
        if (email) query.email = email;

        const user = await User.findOne({ $or: [query] });
        res.json({ available: !user });
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// Validate Token (Auto-login)
router.get('/me', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            res.status(401).json({ message: 'No token' });
            return;
        }

        const decoded: any = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');

        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        res.json({ user });
    } catch (err) {
        res.status(401).json({ message: 'Invalid token' });
    }
});

export default router;
