// api/chat.js - SIMPLE WORKING VERSION (No Supabase)
const TELEGRAM_TOKEN = "8470259022:AAEvcxMTV1xLmQyz2dcxwr94RbLsdvJGiqg";
const ADMIN_CHAT_ID = "6142816761";

// Simple in-memory storage (works perfectly)
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
        
        messages.push({
            id: 2,
            username: 'system',
            message: '💬 This is a group chat. Be respectful and enjoy chatting!',
            timestamp: new Date().toISOString(),
            type: 'system'
        });
    }
}

initializeData();

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
                message: 'ChatXMN Backend is running perfectly!',
                timestamp: new Date().toISOString(),
                database: 'In-memory (Working)',
                stats: {
                    users: users.length,
                    messages: messages.length,
                    online: Object.keys(sessions).length
                }
            });
        }

        // Test endpoint
        if (req.method === 'GET' && path === '/api/test') {
            return res.status(200).json({
                success: true,
                message: '✅ Backend is working perfectly!',
                server: 'Vercel',
                version: '1.0',
                timestamp: new Date().toISOString()
            });
        }

        // Get stats
        if (req.method === 'GET' && path === '/api/stats') {
            return res.status(200).json({
                users: users.length,
                messages: messages.length,
                online: Object.keys(sessions).length,
                status: 'online'
            });
        }

        // Signup endpoint - SIMPLE & WORKING
        if (req.method === 'POST' && path === '/api/signup') {
            try {
                const { username, password } = await req.json();
                
                console.log('Signup attempt:', { username, password });
                
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

                if (password.length < 6) {
                    return res.status(400).json({ 
                        success: false,
                        error: 'Password must be at least 6 characters' 
                    });
                }

                // Check if username exists
                if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
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
                console.log('New user created:', newUser.username);

                // Telegram notification
                try {
                    const telegramResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: ADMIN_CHAT_ID,
                            text: `🆕 NEW USER SIGNUP!\n\n👤 Username: ${username}\n🆔 User ID: ${newUser.id}\n⏰ Time: ${new Date().toLocaleString()}\n🌐 Total Users: ${users.length}`
                        })
                    });
                    
                    if (telegramResponse.ok) {
                        console.log('✅ Telegram notification sent successfully');
                    } else {
                        console.log('⚠️ Telegram notification failed');
                    }
                } catch (tgError) {
                    console.log('⚠️ Telegram notification error:', tgError.message);
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
                    error: 'Server error: ' + error.message 
                });
            }
        }

        // Login endpoint - SIMPLE & WORKING
        if (req.method === 'POST' && path === '/api/login') {
            try {
                const { username, password } = await req.json();

                console.log('Login attempt:', { username });

                if (!username || !password) {
                    return res.status(400).json({ 
                        success: false,
                        error: 'Username and password are required' 
                    });
                }

                // Find user
                const user = users.find(u => 
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

                console.log('User logged in:', user.username);

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

        // Get messages - PUBLIC
        if (req.method === 'GET' && path === '/api/messages') {
            return res.status(200).json(messages);
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
                console.log('New message from:', user.username);

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

        // Clear all data (for testing)
        if (req.method === 'DELETE' && path === '/api/clear') {
            users = [];
            messages = [];
            sessions = {};
            initializeData();
            return res.json({ success: true, message: 'All data cleared' });
        }

        // 404 for unknown routes
        return res.status(404).json({ 
            success: false,
            error: 'Endpoint not found',
            available: [
                'GET  /api/health',
                'GET  /api/test', 
                'GET  /api/stats',
                'GET  /api/messages',
                'POST /api/signup',
                'POST /api/login', 
                'POST /api/messages',
                'GET  /api/me',
                'DELETE /api/clear'
            ]
        });

    } catch (error) {
        console.error('Server error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
    }
