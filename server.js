const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me';

// Ensure uploads directory exists at startup
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json());

// ---------------------------------------------------------
// CRITICAL: Health check must be BEFORE any auth middleware
// ---------------------------------------------------------
app.get('/', (req, res, next) => {
    // Some platforms ping / instead of /health
    if (req.headers['user-agent'] && (req.headers['user-agent'].includes('HealthCheck') || req.headers['user-agent'].includes('kube-probe'))) {
        return res.status(200).send('OK');
    }
    
    // Explicitly serve index.html or fallback to 200 OK
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
    } else {
        return res.status(200).send('Bridge-Link Server Running');
    }
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth Middleware
const auth = (req, res, next) => {
    const password = req.headers['x-password'];
    if (password === ADMIN_PASSWORD) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

app.use(express.static(path.join(__dirname, 'public'))); // Serve frontend files from 'public' folder (publicly)

// Health check endpoint for deployment platforms
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Storage for messages (in-memory for simplicity, could use a file)
let messages = [];

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath);
        }
        cb(null, uploadPath);
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
    messages.push(newMessage);
    res.status(201).json(newMessage);
});

app.get('/api/messages', auth, (req, res) => {
    res.json(messages);
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
    const uploadPath = path.join(__dirname, 'uploads');
    fs.readdir(uploadPath, (err, files) => {
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
    const filePath = path.join(__dirname, 'uploads', filename);
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

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server started on port ${PORT}`);
    const localIp = getLocalIp();
    console.log(`[Network URL] http://${localIp}:${PORT}`);
});
