// api/chat.js - ChatXMN Backend with MongoDB
const { MongoClient, ObjectId } = require('mongodb');

const TELEGRAM_TOKEN = "8470259022:AAEvcxMTV1xLmQyz2dcxwr94RbLsdvJGiqg";
const ADMIN_CHAT_ID = "6142816761";

// Your MongoDB connection string
const MONGODB_URI = "mongodb+srv://xmn:7T3GWR4QZKbXKwNp@xmnchat.htmckjn.mongodb.net/?appName=xmnchat";
const DB_NAME = "xmnchat";

let client;
let userSessions = {};

// MongoDB connection helper
async function connectDB() {
    if (!client) {
        client = new MongoClient(MONGODB_URI);
        await client.connect();
        console.log('✅ Connected to MongoDB');
    }
    return client.db(DB_NAME);
}

// Initialize database with default data
async function initializeDB() {
    try {
        const db = await connectDB();
        
        // Create collections if they don't exist
        const usersCollection = db.collection('users');
        const messagesCollection = db.collection('messages');
        
        // Add default admin user if no users exist
        const userCount = await usersCollection.countDocuments();
        if (userCount === 0) {
            await usersCollection.insertOne({
                username: 'admin',
                password: 'admin123',
                createdAt: new Date(),
                isAdmin: true
            });
            console.log('✅ Default admin user created');
        }
        
        // Add welcome message if no messages exist
        const messageCount = await messagesCollection.countDocuments();
        if (messageCount === 0) {
            await messagesCollection.insertOne({
                username: 'system',
                message: '🌟 Welcome to ChatXMN! Start chatting with the community.',
                timestamp: new Date(),
                type: 'system'
            });
            console.log('✅ Welcome message created');
        }
        
    } catch (error) {
        console.error('Database initialization error:', error);
    }
}

// Initialize on startup
initializeDB();

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;

    // Auth middleware
    const authHeader = req.headers.authorization;
    let currentUser = null;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        currentUser = userSessions[token];
    }

    try {
        // Public routes
        if (req.method === 'POST' && path === '/api/signup') {
            return await handleSignup(req, res);
        }

        if (req.method === 'POST' && path === '/api/login') {
            return await handleLogin(req, res);
        }

        // Protected routes require authentication
        if (!currentUser) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const db = await connectDB();
        const usersCollection = db.collection('users');
        const messagesCollection = db.collection('messages');

        if (req.method === 'GET' && path === '/api/messages') {
            const messages = await messagesCollection.find().sort({ timestamp: -1 }).limit(100).toArray();
            return res.status(200).json(messages.reverse());
        }

        if (req.method === 'POST' && path === '/api/messages') {
            return await handleSendMessage(req, res, currentUser, messagesCollection);
        }

        if (req.method === 'GET' && path === '/api/users') {
            const users = await usersCollection.find(
                { username: { $ne: currentUser.username } },
                { projection: { password: 0 } }
            ).toArray();
            return res.status(200).json(users);
        }

        if (req.method === 'GET' && path === '/api/me') {
            return res.status(200).json(currentUser);
        }

        if (req.method === 'GET' && path === '/api/stats') {
            const userCount = await usersCollection.countDocuments();
            const messageCount = await messagesCollection.countDocuments();
            return res.status(200).json({
                users: userCount,
                messages: messageCount,
                online: Object.keys(userSessions).length
            });
        }

        return res.status(404).json({ error: 'Endpoint not found' });

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: 'Database connection failed' });
    }
}

async function handleSignup(req, res) {
    try {
        const { username, password } = await req.json();

        // Validation
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        if (username.length < 3) {
            return res.status(400).json({ error: 'Username must be at least 3 characters' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const db = await connectDB();
        const usersCollection = db.collection('users');

        // Check if username exists
        const existingUser = await usersCollection.findOne({ 
            username: { $regex: `^${username}$`, $options: 'i' } 
        });

        if (existingUser) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        // Create new user
        const newUser = {
            username: username.trim(),
            password: password, // In production, hash this!
            createdAt: new Date(),
            isAdmin: false
        };

        const result = await usersCollection.insertOne(newUser);

        // Send Telegram notification
        await sendTelegramNotification(
            `🆕 NEW USER SIGNUP!\n\n` +
            `👤 Username: ${username}\n` +
            `🆔 User ID: ${result.insertedId}\n` +
            `⏰ Time: ${new Date().toLocaleString()}\n` +
            `🌐 Total Users: ${await usersCollection.countDocuments()}`
        );

        return res.status(201).json({ 
            success: true, 
            message: 'Account created successfully! Please login.',
            userId: result.insertedId 
        });

    } catch (error) {
        console.error('Signup Error:', error);
        return res.status(500).json({ error: 'Failed to create account' });
    }
}

async function handleLogin(req, res) {
    try {
        const { username, password } = await req.json();

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const db = await connectDB();
        const usersCollection = db.collection('users');

        // Find user (case-insensitive)
        const user = await usersCollection.findOne({ 
            username: { $regex: `^${username}$`, $options: 'i' } 
        });

        if (!user || user.password !== password) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Create session
        const sessionToken = Date.now().toString();
        userSessions[sessionToken] = {
            id: user._id.toString(),
            username: user.username,
            createdAt: user.createdAt,
            isAdmin: user.isAdmin
        };

        // Clean up old sessions (older than 24 hours)
        cleanupSessions();

        return res.status(200).json({
            success: true,
            message: 'Login successful!',
            token: sessionToken,
            user: {
                id: user._id.toString(),
                username: user.username,
                createdAt: user.createdAt,
                isAdmin: user.isAdmin
            }
        });

    } catch (error) {
        console.error('Login Error:', error);
        return res.status(500).json({ error: 'Login failed' });
    }
}

async function handleSendMessage(req, res, user, messagesCollection) {
    try {
        const { message } = await req.json();

        if (!message || message.trim().length === 0) {
            return res.status(400).json({ error: 'Message cannot be empty' });
        }

        if (message.length > 500) {
            return res.status(400).json({ error: 'Message too long (max 500 characters)' });
        }

        const newMessage = {
            username: user.username,
            message: message.trim(),
            timestamp: new Date(),
            type: 'user'
        };

        await messagesCollection.insertOne(newMessage);

        return res.status(201).json({ 
            success: true, 
            message: 'Message sent successfully' 
        });

    } catch (error) {
        console.error('Send Message Error:', error);
        return res.status(500).json({ error: 'Failed to send message' });
    }
}

function cleanupSessions() {
    const now = Date.now();
    for (const [token, session] of Object.entries(userSessions)) {
        // Remove sessions older than 24 hours
        if (now - parseInt(token) > 24 * 60 * 60 * 1000) {
            delete userSessions[token];
        }
    }
}

async function sendTelegramNotification(text) {
    try {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: ADMIN_CHAT_ID,
                text: text,
                parse_mode: 'HTML'
            })
        });
    } catch (error) {
        console.error('Telegram notification failed:', error);
    }
              },
