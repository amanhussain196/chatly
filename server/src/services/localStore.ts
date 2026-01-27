
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(__dirname, '../../data');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface StoredMessage {
    id: string;
    roomId: string;
    text: string;
    sender: string; // username
    senderId: string;
    timestamp: string;
    status: 'sent' | 'delivered' | 'read';
}

class LocalMessageStore {
    private messages: StoredMessage[] = [];
    private retentionMs = 24 * 60 * 60 * 1000; // 24 hours

    constructor() {
        this.load();
        // Run cleanup every hour
        setInterval(() => this.cleanup(), 60 * 60 * 1000);
    }

    private load() {
        try {
            if (fs.existsSync(MESSAGES_FILE)) {
                const data = fs.readFileSync(MESSAGES_FILE, 'utf-8');
                this.messages = JSON.parse(data);
                console.log(`[LocalStore] Loaded ${this.messages.length} messages.`);
                this.cleanup(); // Clean up on load
            }
        } catch (error) {
            console.error('[LocalStore] Failed to load messages:', error);
            this.messages = [];
        }
    }

    private save() {
        try {
            fs.writeFileSync(MESSAGES_FILE, JSON.stringify(this.messages, null, 2));
        } catch (error) {
            console.error('[LocalStore] Failed to save messages:', error);
        }
    }

    public cleanup() {
        const now = Date.now();
        const initialCount = this.messages.length;
        this.messages = this.messages.filter(msg => {
            const msgTime = new Date(msg.timestamp).getTime();
            return (now - msgTime) < this.retentionMs;
        });

        if (this.messages.length !== initialCount) {
            console.log(`[LocalStore] Cleaned up ${initialCount - this.messages.length} expired messages.`);
            this.save();
        }
    }

    public addMessage(msg: StoredMessage) {
        this.messages.push(msg);
        this.save();
    }

    public getHistory(roomId: string): StoredMessage[] {
        return this.messages
            .filter(m => m.roomId === roomId)
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }

    public markRead(messageId: string) {
        const msg = this.messages.find(m => m.id === messageId);
        if (msg) {
            msg.status = 'read';
            this.save();
        }
    }
}

export const localStore = new LocalMessageStore();
