const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const os = require('os');

const app = express();
// --- CONFIGURATION ---
const PORT = process.env.PORT || 3000;

// Set up uploads directory (robust for serverless/read-only FS)
let uploadsDir = path.join(__dirname, 'uploads');
try {
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
        console.log(`[Init] Created uploads directory: ${uploadsDir}`);
    }
} catch (err) {
    console.warn(`[Init] Warning: Could not create local uploads directory, falling back to /tmp/uploads: ${err.message}`);
    uploadsDir = path.join('/tmp', 'bridge-link-uploads');
    if (!fs.existsSync(uploadsDir)) {
        try {
            fs.mkdirSync(uploadsDir, { recursive: true });
            console.log(`[Init] Created fallback uploads directory: ${uploadsDir}`);
        } catch (tmpErr) {
            console.error(`[Init] Critical Error: Could not create fallback uploads directory: ${tmpErr.message}`);
        }
    }
}

// Middleware
app.use(cors());
app.use(express.json());

// Common container ping paths
const healthPaths = ['/health', '/ping', '/live', '/ready'];


app.use((req, res, next) => {
    // Intercept health checks at middleware level to guarantee response
    // Logic: pxxl/vercel often ping / or /health
    const isHealthCheck = healthPaths.includes(req.path) || 
                         (req.headers['user-agent'] && (
                             req.headers['user-agent'].includes('HealthCheck') || 
                             req.headers['user-agent'].includes('kube-probe') ||
                             req.headers['user-agent'].includes('Vercel')
                         ));

    if (isHealthCheck) {
        return res.status(200).json({ 
            status: 'ok', 
            service: 'bridge-link',
            timestamp: new Date().toISOString() 
        });
    }
    
    next();
});

app.get('/', (req, res) => {
    // Explicitly serve index.html or fallback to 200 OK
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
    } else {
        return res.status(200).send('Bridge-Link Server Running');
    }
});

// Storage for rooms (in-memory: { [roomId]: { password, messages: [] } })
const rooms = {};

// Auth Middleware (Room-based)
const auth = (req, res, next) => {
    const roomId = req.headers['x-room-id'];
    const password = req.headers['x-password'];

    if (!roomId) {
        return res.status(401).json({ error: 'Room ID required' });
    }
    if (!password) {
        return res.status(401).json({ error: 'Password required' });
    }

    // Sanitize roomId to prevent path traversal
    if (roomId.includes('..') || roomId.includes('/') || roomId.includes('\\')) {
        return res.status(400).json({ error: 'Invalid Room ID' });
    }

    if (!rooms[roomId]) {
        rooms[roomId] = { password, messages: [] };
    } else if (rooms[roomId].password !== password) {
        return res.status(401).json({ error: 'Incorrect password for this room' });
    }

    req.roomId = roomId;
    next();
};

app.use(express.static(path.join(__dirname, 'public'))); // Serve frontend files from 'public' folder (publicly)

// Health check endpoint for deployment platforms
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const roomUploadsDir = path.join(uploadsDir, req.roomId || 'default');
        if (!fs.existsSync(roomUploadsDir)) {
            try {
                fs.mkdirSync(roomUploadsDir, { recursive: true });
            } catch (e) {}
        }
        cb(null, roomUploadsDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

// API Endpoints (All protected by auth)

// Message endpoints
app.post('/api/messages', auth, (req, res) => {
    const { message, sender } = req.body;
    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }
    const newMessage = {
        id: Date.now(),
        text: message,
        sender: sender || 'Anonymous',
        timestamp: new Date().toISOString()
    };
    rooms[req.roomId].messages.push(newMessage);
    res.status(201).json(newMessage);
});

app.get('/api/messages', auth, (req, res) => {
    res.json(rooms[req.roomId].messages);
});

// File endpoints
app.post('/api/upload', auth, upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    res.status(201).json({
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        path: `/api/download/${req.file.filename}`
    });
});

app.get('/api/files', auth, (req, res) => {
    const roomUploadsDir = path.join(uploadsDir, req.roomId);
    if (!fs.existsSync(roomUploadsDir)) {
        return res.json([]);
    }
    
    fs.readdir(roomUploadsDir, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Unable to list files' });
        }
        const fileList = files.map(file => ({
            filename: file,
            originalName: file.split('-').slice(1).join('-'), // Remove timestamp prefix
            path: `/api/download/${file}`
        }));
        res.json(fileList);
    });
});

app.get('/api/download/:filename', auth, (req, res) => {
    const filename = req.params.filename;
    // ensure no directory traversal in filename
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
        return res.status(400).json({ error: 'Invalid filename' });
    }
    const filePath = path.join(uploadsDir, req.roomId, filename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }
    res.download(filePath);
});


// Helper to get local IP address
function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

// Global error handler to prevent crashes
app.use((err, req, res, next) => {
    console.error('Server error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`[Server] Started successfully on port ${PORT}`);
    try {
        // Only log network URL if not in a Vercel/PXXL environment
        if (!process.env.VERCEL && !process.env.PXXL_DEPLOY) {
            const localIp = getLocalIp();
            console.log(`[Network URL] http://${localIp}:${PORT}`);
        }
    } catch (e) {
        // Silently skip if network discovery fails
    }
});

// Export app for serverless platforms
module.exports = app;
