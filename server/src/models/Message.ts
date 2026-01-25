import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema({
    roomId: { type: String, required: true, index: true },
    senderId: { type: String, required: true }, // Auth ID or socket ID (if guest)
    senderUsername: { type: String, required: true },
    text: { type: String, required: true },
    status: {
        type: String,
        enum: ['sent', 'delivered', 'read'],
        default: 'sent'
    },
    createdAt: { type: Date, default: Date.now },
    readers: [{ type: String }] // List of userIds who have read it
});

// TTL Index: Expire after 24 hours (86400 seconds)
MessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

export const Message = mongoose.model('Message', MessageSchema);
