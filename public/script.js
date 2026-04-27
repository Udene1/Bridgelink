// DOM Elements
const messageDisplay = document.getElementById('message-display');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');
const fileList = document.getElementById('file-list');
const connectionInfo = document.getElementById('connection-info');
const notification = document.getElementById('notification');

let lastMessageCount = 0;
let lastFileCount = 0;
let adminPassword = localStorage.getItem('bridge_password') || '';

// Initialize
async function init() {
    checkAuth();
    updateConnectionInfo();
    fetchMessages();
    fetchFiles();
    
    // Poll for new data every 3 seconds
    setInterval(() => {
        if (adminPassword) {
            fetchMessages();
            fetchFiles();
        }
    }, 3000);
}

function checkAuth() {
    if (!adminPassword) {
        adminPassword = prompt('Please enter the Bridge-Link password:');
        if (adminPassword) {
            localStorage.setItem('bridge_password', adminPassword);
        }
    }
}

// Update connection status
function updateConnectionInfo() {
    const host = window.location.hostname;
    const port = window.location.port;
    connectionInfo.textContent = `Connected to ${host}:${port}`;
}

// Fetch messages from backend
async function fetchMessages() {
    try {
        const response = await fetch('/api/messages', {
            headers: { 'x-password': adminPassword }
        });
        
        if (response.status === 401) {
            adminPassword = '';
            localStorage.removeItem('bridge_password');
            checkAuth();
            return;
        }
        
        const messages = await response.json();
        
        if (messages.length !== lastMessageCount) {
            renderMessages(messages);
            lastMessageCount = messages.length;
        }
    } catch (error) {
        console.error('Error fetching messages:', error);
    }
}

// Render messages to the container
function renderMessages(messages) {
    if (messages.length === 0) {
        messageDisplay.innerHTML = '<div class="empty-state">No messages yet. Send one to start!</div>';
        return;
    }

    messageDisplay.innerHTML = messages.map(msg => `
        <div class="message-item">
            <div class="sender">${msg.sender} • ${new Date(msg.timestamp).toLocaleTimeString()}</div>
            <div class="text">${formatText(msg.text)}</div>
        </div>
    `).join('');
    
    // Scroll to bottom
    messageDisplay.scrollTop = messageDisplay.scrollHeight;
}

// Simple link formatting
function formatText(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, (url) => `<a href="${url}" target="_blank" style="color: var(--primary);">${url}</a>`);
}

// Send message
async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    // Visual feedback
    sendBtn.disabled = true;
    sendBtn.classList.add('loading');

    try {
        const response = await fetch('/api/messages', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-password': adminPassword
            },
            body: JSON.stringify({ message: text, sender: 'Device' })
        });

        if (response.ok) {
            messageInput.value = '';
            fetchMessages();
            showNotification('Message sent!');
        } else if (response.status === 401) {
            showNotification('Error: Invalid password. Please re-enter.');
            adminPassword = '';
            localStorage.removeItem('bridge_password');
            checkAuth();
        } else {
            const err = await response.json();
            showNotification(`Error: ${err.error || 'Failed to send'}`);
        }
    } catch (error) {
        console.error('Error sending message:', error);
        showNotification('Network error. Check connection.');
    } finally {
        sendBtn.disabled = false;
        sendBtn.classList.remove('loading');
    }
}

// Fetch files from backend
async function fetchFiles() {
    try {
        const response = await fetch('/api/files', {
            headers: { 'x-password': adminPassword }
        });
        
        if (response.status === 401) return; // Handled by messages fetch
        
        const files = await response.json();
        
        if (files.length !== lastFileCount) {
            renderFiles(files);
            lastFileCount = files.length;
        }
    } catch (error) {
        console.error('Error fetching files:', error);
    }
}

// Render files to the container
function renderFiles(files) {
    if (files.length === 0) {
        fileList.innerHTML = '<div class="empty-state">No files shared yet.</div>';
        return;
    }

    fileList.innerHTML = files.map(file => `
        <div class="file-item">
            <div class="file-icon">📄</div>
            <div class="file-info">
                <div class="file-name">${file.originalName}</div>
                <div class="file-meta">Click to download</div>
            </div>
            <a href="#" onclick="downloadFile('${file.filename}'); return false;" class="download-link">📥</a>
        </div>
    `).sort((a,b) => -1).join(''); // Show newest first
}

async function downloadFile(filename) {
    const response = await fetch(`/api/download/${filename}`, {
        headers: { 'x-password': adminPassword }
    });
    if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename.split('-').slice(1).join('-');
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
    }
}

// Upload file
async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    showNotification('Uploading...');

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'x-password': adminPassword },
            body: formData
        });

        if (response.ok) {
            fetchFiles();
            showNotification('File uploaded successfully!');
        } else {
            showNotification('Upload failed');
        }
    } catch (error) {
        console.error('Error uploading file:', error);
        showNotification('Error during upload');
    }
}

// Event Listeners
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        uploadFile(e.target.files[0]);
    }
});

// Drag and drop handling
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--primary)';
    dropZone.style.background = 'var(--glass)';
});

dropZone.addEventListener('dragleave', () => {
    dropZone.style.borderColor = 'var(--border)';
    dropZone.style.background = 'transparent';
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--border)';
    dropZone.style.background = 'transparent';
    if (e.dataTransfer.files.length > 0) {
        uploadFile(e.dataTransfer.files[0]);
    }
});

// Utility
function showNotification(text) {
    notification.textContent = text;
    notification.classList.remove('hidden');
    setTimeout(() => {
        notification.classList.add('hidden');
    }, 3000);
}

// Start app
init();
