const http = require('http');

async function send(roomId, password, message) {
    const data = JSON.stringify({ message: message, sender: 'Tester' });
    return new Promise((resolve) => {
        const req = http.request({
            hostname: '127.0.0.1', port: 3000, path: '/api/messages', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': data.length, 'x-room-id': roomId, 'x-password': password }
        }, (res) => {
            res.on('data', () => {});
            res.on('end', resolve);
        });
        req.write(data);
        req.end();
    });
}

async function get(roomId, password) {
    return new Promise((resolve) => {
        const req = http.request({
            hostname: '127.0.0.1', port: 3000, path: '/api/messages', method: 'GET',
            headers: { 'x-room-id': roomId, 'x-password': password }
        }, (res) => {
            let body = '';
            res.on('data', (c) => body += c);
            res.on('end', () => resolve(JSON.parse(body)));
        });
        req.end();
    });
}

async function run() {
    console.log('--- Phase 1: Sending message to RoomPersist ---');
    await send('RoomPersist', '123', 'Persistent Message');
    const msgs = await get('RoomPersist', '123');
    console.log('Count before restart:', msgs.length);
    
    console.log('--- Phase 2: Simulating Restart (Wait for user to restart node or just verify disk) ---');
    // In this automated test, we'll just check if the file exists on disk
}

run();
