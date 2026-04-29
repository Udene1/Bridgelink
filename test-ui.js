const http = require('http');

async function send(roomId, password, message, deviceId) {
    const data = JSON.stringify({ message: message, sender: 'User', deviceId: deviceId });
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

async function run() {
    const ROOM = 'UITest';
    console.log(`--- Simulating Device 1 (Me) ---`);
    await send(ROOM, '123', 'Hello from Me (Left)', 'device-me');
    
    console.log(`--- Simulating Device 2 (Others) ---`);
    await send(ROOM, '123', 'Hello from Someone Else (Right)', 'device-other');
    
    console.log(`--- Verifying API Data ---`);
    const req = http.request({
        hostname: '127.0.0.1', port: 3000, path: '/api/messages', method: 'GET',
        headers: { 'x-room-id': ROOM, 'x-password': '123' }
    }, (res) => {
        let body = '';
        res.on('data', (c) => body += c);
        res.on('end', () => {
            const msgs = JSON.parse(body);
            msgs.forEach(m => console.log(`[${m.deviceId}] ${m.text}`));
            if (msgs[0].deviceId === 'device-me' && msgs[1].deviceId === 'device-other') {
                console.log('SUCCESS: Persistence and Identity confirmed.');
            } else {
                console.log('FAILURE: Identity mismatch.');
            }
        });
    });
    req.end();
}

run();
