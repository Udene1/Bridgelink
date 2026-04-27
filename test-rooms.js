const http = require('http');

function testRoom(roomId, password, message) {
    const data = JSON.stringify({ message: message, sender: 'Tester' });
    const options = {
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/messages',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length,
            'x-room-id': roomId,
            'x-password': password
        }
    };

    const req = http.request(options, (res) => {
        let responseBody = '';
        console.log(`[POST ${roomId}] Status: ${res.statusCode}`);
        res.on('data', (chunk) => { responseBody += chunk; });
        res.on('end', () => console.log(`[POST ${roomId}] Body: ${responseBody}`));
    });
    req.write(data);
    req.end();
}

function getRoom(roomId, password) {
    const options = {
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/messages',
        method: 'GET',
        headers: { 'x-room-id': roomId, 'x-password': password }
    };
    const req = http.request(options, (res) => {
        let responseBody = '';
        console.log(`[GET ${roomId}] Status: ${res.statusCode}`);
        res.on('data', (chunk) => { responseBody += chunk; });
        res.on('end', () => console.log(`[GET ${roomId}] Body: ${responseBody}`));
    });
    req.end();
}

// Sequence:
// 1. Create Room A
testRoom('RoomA', '123', 'Secret A Message');
// 2. Create Room B
setTimeout(() => testRoom('RoomB', '456', 'Secret B Message'), 500);
// 3. Get Room A (should only have Secret A)
setTimeout(() => getRoom('RoomA', '123'), 1000);
// 4. Try getting Room A with wrong password
setTimeout(() => getRoom('RoomA', 'wrong'), 1500);
