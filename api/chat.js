// api/chat.js - SUPABASE + TELEGRAM INTEGRATION
const TELEGRAM_TOKEN = "8470259022:AAEvcxMTV1xLmQyz2dcxwr94RbLsdvJGiqg";
const ADMIN_CHAT_ID = "6142816761";

// Supabase configuration
const SUPABASE_URL = "https://gofnnrmtpxtgzlxivryb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdvZm5ucm10cHh0Z3pseGl2cnliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwMDA5OTAsImV4cCI6MjA3OTU3Njk5MH0.4C3oGj3zj8mp2lDA3UN_IPYKSDnaZAN8HA6iUS2RGFY";

// In-memory fallback (will use Supabase for persistence)
let users = [];
let messages = [];
let sessions = {};

// Initialize with default data
function initializeData() {
    if (users.length === 0) {
        users.push({
            id: 1,
            username: 'admin',
            password: 'admin123',
            createdAt: new Date().toISOString(),
            isAdmin: true
        });
    }
    
    if (messages.length === 0) {
        messages.push({
            id: 1,
            username: 'system',
            message: '🌟 Welcome to ChatXMN! Start chatting with the community.',
            timestamp: new Date().toISOString(),
            type: 'system'
        });
    }
}

initializeData();

// Supabase helper functions
async function supabaseFetch(endpoint, options = {}) {
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
            ...options,
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation',
                ...options.headers,
            },
        });
        
        if (response.ok) {
            return await response.json();
        } else {
            console.error('Supabase error:', await response.text());
            throw new Error('Supabase request failed');
        }
    } catch (error) {
        console.error('Supabase connection failed:', error);
        throw error;
    }
}

// Save user to Supabase
async function saveUserToSupabase(user) {
    try {
        await supabaseFetch('users', {
            method: 'POST',
            body: JSON.stringify({
                username: user.username,
                password: user.password,
                created_at: user.createdAt,
                is_admin: user.isAdmin
            })
        });
        console.log('✅ User saved to Supabase:', user.username);
    } catch (error) {
        console.log('⚠️ Using in-memory storage (Supabase offline)');
    }
}

// Save message to Supabase
async function saveMessageToSupabase(message) {
    try {
        await supabaseFetch('messages', {
            method: 'POST',
            body: JSON.stringify({
                username: message.username,
                message: message.message,
                timestamp: message.timestamp,
                type: message.type
            })
        });
        console.log('✅ Message saved to Supabase');
    } catch (error) {
        console.log('⚠️ Using in-memory storage for messages');
    }
}

// Load messages from Supabase
async function loadMessagesFromSupabase() {
    try {
        const data = await supabaseFetch('messages?order=timestamp.desc&limit=100');
        return data.map(msg => ({
            id: msg.id,
            username: msg.username,
            message: msg.message,
            timestamp: msg.timestamp,
            type: msg.type
        })).reverse();
    } catch (error) {
        console.log('⚠️ Loading from in-memory messages');
        return messages;
    }
}

// Load users from Supabase
async function loadUsersFromSupabase() {
    try {
        const data = await supabaseFetch('users');
        return data.map(user => ({
            id: user.id,
            username: user.username,
            password: user.password,
            createdAt: user.created_at,
            isAdmin: user.is_admin
        }));
    } catch (error) {
        console.log('⚠️ Loading from in-memory users');
        return users;
    }
}

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const path = req.url;

    try {
        console.log(`📨 ${req.method} ${path}`);

        // Health check
        if (req.method === 'GET' && path === '/api/health') {
            return res.status(200).json({
                status: 'healthy',
                message: 'ChatXMN Backend with Supabase',
                timestamp: new Date().toISOString(),
                database: 'Supabase + In-memory fallback',
                telegram: 'Connected',
                stats: {
                    users: users.length,
                    messages: messages.length
                }
            });
        }

        // Test endpoint
        if (req.method === 'GET' && path === '/api/test') {
            return res.status(200).json({
                success: true,
                message: '✅ Backend is working with Supabase!',
                server: 'Vercel + Supabase',
                version: '2.0',
                timestamp: new Date().toISOString()
            });
        }

        // Get stats
        if (req.method === 'GET' && path === '/api/stats') {
            return res.status(200).json({
                users: users.length,
                messages: messages.length,
                online: Object.keys(sessions).length,
                status: 'online',
                database: 'Supabase Connected'
            });
        }

        // Signup endpoint
        if (req.method === 'POST' && path === '/api/signup') {
            try {
                const { username, password } = await req.json();
                
                // Basic validation
                if (!username || !password) {
                    return res.status(400).json({ 
                        success: false,
                        error: 'Username and password are required' 
                    });
                }

                if (username.length < 3) {
                    return res.status(400).json({ 
                        success: false,
                        error: 'Username must be at least 3 characters' 
                    });
                }

                // Load current users
                const currentUsers = await loadUsersFromSupabase();
                
                // Check if username exists
                if (currentUsers.find(u => u.username.toLowerCase() === username.toLowerCase())) {
                    return res.status(400).json({ 
                        success: false,
                        error: 'Username already exists' 
                    });
                }

                // Create user
                const newUser = {
                    id: Date.now(),
                    username: username.trim(),
                    password: password,
                    createdAt: new Date().toISOString(),
                    isAdmin: false
                };

                users.push(newUser);
                
                // Save to Supabase
                await saveUserToSupabase(newUser);

                // Telegram notification
                try {
                    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: ADMIN_CHAT_ID,
                            text: `🆕 NEW USER SIGNUP!\n\n👤 Username: ${username}\n🆔 User ID: ${newUser.id}\n⏰ Time: ${new Date().toLocaleString()}\n🌐 Total Users: ${users.length}`
                        })
                    });
                    console.log('✅ Telegram notification sent');
                } catch (tgError) {
                    console.log('⚠️ Telegram notification failed');
                }

                return res.status(201).json({ 
                    success: true,
                    message: 'Account created successfully! Please login.',
                    userId: newUser.id
                });

            } catch (error) {
                console.error('Signup error:', error);
                return res.status(500).json({ 
                    success: false,
                    error: 'Server error during signup' 
                });
            }
        }

        // Login endpoint
        if (req.method === 'POST' && path === '/api/login') {
            try {
                const { username, password } = await req.json();

                if (!username || !password) {
                    return res.status(400).json({ 
                        success: false,
                        error: 'Username and password are required' 
                    });
                }

                // Load users from Supabase
                const currentUsers = await loadUsersFromSupabase();
                
                // Find user
                const user = currentUsers.find(u => 
                    u.username.toLowerCase() === username.toLowerCase() && 
                    u.password === password
                );

                if (!user) {
                    return res.status(401).json({ 
                        success: false,
                        error: 'Invalid username or password' 
                    });
                }

                // Create session
                const sessionToken = Date.now().toString();
                sessions[sessionToken] = {
                    id: user.id,
                    username: user.username,
                    createdAt: user.createdAt
                };

                return res.status(200).json({
                    success: true,
                    message: 'Login successful!',
                    token: sessionToken,
                    user: {
                        id: user.id,
                        username: user.username,
                        createdAt: user.createdAt
                    }
                });

            } catch (error) {
                console.error('Login error:', error);
                return res.status(500).json({ 
                    success: false,
                    error: 'Server error during login' 
                });
            }
        }

        // Get messages
        if (req.method === 'GET' && path === '/api/messages') {
            try {
                const loadedMessages = await loadMessagesFromSupabase();
                return res.status(200).json(loadedMessages);
            } catch (error) {
                console.error('Error loading messages:', error);
                return res.status(200).json(messages); // Fallback
            }
        }

        // Send message
        if (req.method === 'POST' && path === '/api/messages') {
            try {
                const authHeader = req.headers.authorization;
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    return res.status(401).json({ 
                        success: false,
                        error: 'Please login to send messages' 
                    });
                }

                const token = authHeader.substring(7);
                const user = sessions[token];
                
                if (!user) {
                    return res.status(401).json({ 
                        success: false,
                        error: 'Session expired. Please login again.' 
                    });
                }

                const { message } = await req.json();
                
                if (!message || message.trim().length === 0) {
                    return res.status(400).json({ 
                        success: false,
                        error: 'Message cannot be empty' 
                    });
                }

                const newMessage = {
                    id: Date.now(),
                    username: user.username,
                    message: message.trim(),
                    timestamp: new Date().toISOString(),
                    type: 'user'
                };

                messages.push(newMessage);
                
                // Save to Supabase
                await saveMessageToSupabase(newMessage);

                return res.status(201).json({
                    success: true,
                    message: 'Message sent successfully!',
                    data: newMessage
                });

            } catch (error) {
                console.error('Send message error:', error);
                return res.status(500).json({ 
                    success: false,
                    error: 'Failed to send message' 
                });
            }
        }

        // Get current user
        if (req.method === 'GET' && path === '/api/me') {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const token = authHeader.substring(7);
            const user = sessions[token];
            
            if (!user) {
                return res.status(401).json({ error: 'Invalid session' });
            }

            return res.json(user);
        }

        // 404 for unknown routes
        return res.status(404).json({ 
            success: false,
            error: 'Endpoint not found',
            available: ['/api/health', '/api/test', '/api/signup', '/api/login', '/api/messages', '/api/me']
        });

    } catch (error) {
        console.error('Server error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: 'Please try again later'
        });
    }
                    }
