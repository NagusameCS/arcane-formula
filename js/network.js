// ─────────────────────────────────────────────
//  PEER-TO-PEER NETWORKING VIA PEERJS
//  WebRTC P2P — works cross-internet
// ─────────────────────────────────────────────

const Network = (() => {
    let peer = null;
    let conn = null;
    let isHost = false;
    let roomCode = '';
    let connected = false;
    let onMessage = null;
    let onConnected = null;
    let onDisconnected = null;

    const PREFIX = 'arcform-'; // namespace to avoid PeerJS ID collisions

    function generateCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
        return code;
    }

    function createRoom(callbacks) {
        onMessage = callbacks.onMessage;
        onConnected = callbacks.onConnected;
        onDisconnected = callbacks.onDisconnected;
        isHost = true;
        roomCode = generateCode();

        return new Promise((resolve, reject) => {
            peer = new Peer(PREFIX + roomCode, {
                debug: 0,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                    ]
                }
            });

            peer.on('open', (id) => {
                resolve(roomCode);
            });

            peer.on('connection', (c) => {
                conn = c;
                setupConnection();
            });

            peer.on('error', (err) => {
                if (err.type === 'unavailable-id') {
                    // Room code collision — try again
                    peer.destroy();
                    roomCode = generateCode();
                    peer = new Peer(PREFIX + roomCode, { debug: 0 });
                    peer.on('open', () => resolve(roomCode));
                    peer.on('connection', (c) => { conn = c; setupConnection(); });
                    peer.on('error', (e) => reject(e));
                } else {
                    reject(err);
                }
            });
        });
    }

    function joinRoom(code, callbacks) {
        onMessage = callbacks.onMessage;
        onConnected = callbacks.onConnected;
        onDisconnected = callbacks.onDisconnected;
        isHost = false;
        roomCode = code.toUpperCase();

        return new Promise((resolve, reject) => {
            peer = new Peer(undefined, {
                debug: 0,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                    ]
                }
            });

            peer.on('open', () => {
                conn = peer.connect(PREFIX + roomCode, { reliable: true });
                conn.on('open', () => {
                    setupConnection();
                    resolve();
                });
                conn.on('error', reject);
            });

            peer.on('error', (err) => {
                reject(err);
            });

            // Timeout
            setTimeout(() => {
                if (!connected) reject(new Error('Connection timed out'));
            }, 10000);
        });
    }

    function setupConnection() {
        connected = true;

        conn.on('data', (data) => {
            if (onMessage) onMessage(data);
        });

        conn.on('close', () => {
            connected = false;
            if (onDisconnected) onDisconnected();
        });

        conn.on('error', () => {
            connected = false;
            if (onDisconnected) onDisconnected();
        });

        if (onConnected) onConnected();
    }

    function send(data) {
        if (conn && conn.open) {
            conn.send(data);
        }
    }

    function disconnect() {
        if (conn) conn.close();
        if (peer) peer.destroy();
        conn = null;
        peer = null;
        connected = false;
    }

    return {
        createRoom,
        joinRoom,
        send,
        disconnect,
        isConnected: () => connected,
        isHost: () => isHost,
        getCode: () => roomCode,
    };
})();
