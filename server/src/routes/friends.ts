import express from 'express';
import { User } from '../models/User';
import jwt from 'jsonwebtoken';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'secret_key_change_me_in_prod';

// Middleware to authenticate user
const authMiddleware = async (req: any, res: any, next: any) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ message: 'Auth failed' });

        const decoded: any = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.id;
        next();
    } catch (err) {
        res.status(401).json({ message: 'Auth failed' });
    }
};

// Send Friend Request
router.post('/request', authMiddleware, async (req: any, res) => {
    if (!process.env.MONGO_URI) return res.status(503).json({ message: 'Feature unavailable in Guest Mode' });
    try {
        const { username } = req.body;
        const senderId = req.userId;

        const targetUser = await User.findOne({ username });
        if (!targetUser) return res.status(404).json({ message: 'User not found' });

        if (targetUser._id.toString() === senderId) {
            return res.status(400).json({ message: 'Cannot add yourself' });
        }

        // Check if already friends
        if (targetUser.friends.includes(senderId)) {
            return res.status(400).json({ message: 'Already friends' });
        }

        // Check if request already sent
        if (targetUser.friendRequests.includes(senderId)) {
            return res.status(400).json({ message: 'Request already sent' });
        }

        targetUser.friendRequests.push(senderId);
        await targetUser.save();

        res.json({ message: 'Friend request sent' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Accept Friend Request
router.post('/accept', authMiddleware, async (req: any, res) => {
    if (!process.env.MONGO_URI) return res.status(503).json({ message: 'Feature unavailable in Guest Mode' });
    try {
        const { requesterId } = req.body; // The person who sent the request
        const userId = req.userId; // The person accepting it

        const user = await User.findById(userId);
        const requester = await User.findById(requesterId);

        if (!user || !requester) return res.status(404).json({ message: 'User not found' });

        // Check availability
        if (!user.friendRequests.includes(requesterId)) {
            return res.status(400).json({ message: 'No request found' });
        }

        // Add to friends
        user.friends.push(requesterId);
        requester.friends.push(userId);

        // Remove from requests
        user.friendRequests = user.friendRequests.filter(id => id.toString() !== requesterId);

        await user.save();
        await requester.save();

        res.json({ message: 'Friend accepted' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Decline/Cancel Friend Request
router.post('/decline', authMiddleware, async (req: any, res) => {
    try {
        const { requesterId } = req.body;
        const userId = req.userId;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.friendRequests = user.friendRequests.filter(id => id.toString() !== requesterId);
        await user.save();

        res.json({ message: 'Request declined' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get Friends & Requests
router.get('/', authMiddleware, async (req: any, res) => {
    if (!process.env.MONGO_URI) {
        // Return empty structure in guest mode so UI doesn't break
        res.json({ friends: [], requests: [] });
        return;
    }
    try {
        const user = await User.findById(req.userId)
            .populate('friends', 'username email _id')
            .populate('friendRequests', 'username email _id');

        if (!user) return res.status(404).json({ message: 'User not found' });

        res.json({
            friends: user.friends,
            requests: user.friendRequests
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
