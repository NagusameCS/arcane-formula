// ─────────────────────────────────────────────
//  PEER-TO-PEER NETWORKING VIA PEERJS
//  WebRTC P2P — works cross-internet
// ─────────────────────────────────────────────

const Network = (() => {
    let peer = null;
    let conn = null;
    let _isHost = false;
    let roomCode = '';
    let connected = false;
    let onMessage = null;
    let onConnected = null;
    let onDisconnected = null;

    const PREFIX = 'arcform-';

    // Free public TURN + STUN servers for reliable NAT traversal
    const ICE_CONFIG = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            {
                urls: 'turn:openrelay.metered.ca:80',
                username: 'openrelayproject',
                credential: 'openrelayproject',
            },
            {
                urls: 'turn:openrelay.metered.ca:443',
                username: 'openrelayproject',
                credential: 'openrelayproject',
            },
            {
                urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                username: 'openrelayproject',
                credential: 'openrelayproject',
            },
        ]
    };

    function generateCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
        return code;
    }

    function log(msg) {
        console.log('[Network]', msg);
    }

    function makePeer(id) {
        const opts = {
            debug: 1,
            config: ICE_CONFIG,
        };
        return id ? new Peer(id, opts) : new Peer(opts);
    }

    function cleanup() {
        if (conn) { try { conn.close(); } catch(e) {} conn = null; }
        if (peer) { try { peer.destroy(); } catch(e) {} peer = null; }
        connected = false;
    }

    function createRoom(callbacks) {
        cleanup();
        onMessage = callbacks.onMessage;
        onConnected = callbacks.onConnected;
        onDisconnected = callbacks.onDisconnected;
        _isHost = true;
        roomCode = generateCode();

        return new Promise((resolve, reject) => {
            let settled = false;
            let retries = 0;
            const MAX_RETRIES = 3;

            function attempt(code) {
                log('Creating room: ' + code + ' (attempt ' + (retries + 1) + ')');
                peer = makePeer(PREFIX + code);

                peer.on('open', (id) => {
                    if (settled) return;
                    settled = true;
                    roomCode = code;
                    log('Room created: ' + code + ', peer id: ' + id);
                    resolve(code);
                });

                peer.on('connection', (c) => {
                    log('Incoming connection from opponent');
                    conn = c;
                    if (conn.open) {
                        log('Connection already open');
                        setupConnection();
                    } else {
                        conn.on('open', () => {
                            log('Host-side connection opened');
                            setupConnection();
                        });
                    }
                });

                peer.on('error', (err) => {
                    log('Peer error: ' + err.type + ' - ' + err.message);
                    if (err.type === 'unavailable-id' && retries < MAX_RETRIES) {
                        retries++;
                        try { peer.destroy(); } catch(e) {}
                        attempt(generateCode());
                    } else if (!settled) {
                        settled = true;
                        reject(new Error(friendlyError(err)));
                    }
                });

                peer.on('disconnected', () => {
                    log('Peer disconnected from signaling, reconnecting...');
                    if (peer && !peer.destroyed) {
                        try { peer.reconnect(); } catch(e) {}
                    }
                });
            }

            attempt(roomCode);

            setTimeout(() => {
                if (!settled) {
                    settled = true;
                    reject(new Error('Could not reach signaling server. Check your connection.'));
                }
            }, 15000);
        });
    }

    function joinRoom(code, callbacks) {
        cleanup();
        onMessage = callbacks.onMessage;
        onConnected = callbacks.onConnected;
        onDisconnected = callbacks.onDisconnected;
        _isHost = false;
        roomCode = code.toUpperCase().trim();

        return new Promise((resolve, reject) => {
            let settled = false;

            log('Joining room: ' + roomCode);
            peer = makePeer();

            peer.on('open', (myId) => {
                log('My peer id: ' + myId + ', connecting to ' + PREFIX + roomCode);
                conn = peer.connect(PREFIX + roomCode, { reliable: true, serialization: 'json' });

                conn.on('open', () => {
                    if (settled) return;
                    settled = true;
                    log('Connection established!');
                    setupConnection();
                    resolve();
                });

                conn.on('error', (err) => {
                    log('Connection error: ' + err);
                    if (!settled) {
                        settled = true;
                        reject(new Error('Failed to connect to room. Is the code correct?'));
                    }
                });
            });

            peer.on('error', (err) => {
                log('Peer error: ' + err.type + ' - ' + err.message);
                if (!settled) {
                    settled = true;
                    if (err.type === 'peer-unavailable') {
                        reject(new Error('Room "' + roomCode + '" not found. Check the code and try again.'));
                    } else {
                        reject(new Error(friendlyError(err)));
                    }
                }
            });

            peer.on('disconnected', () => {
                log('Peer disconnected from signaling');
                if (peer && !peer.destroyed) {
                    try { peer.reconnect(); } catch(e) {}
                }
            });

            setTimeout(() => {
                if (!settled) {
                    settled = true;
                    cleanup();
                    reject(new Error('Connection timed out. The room may no longer exist.'));
                }
            }, 15000);
        });
    }

    function setupConnection() {
        connected = true;

        conn.on('data', (data) => {
            if (onMessage) onMessage(data);
        });

        conn.on('close', () => {
            log('Connection closed');
            connected = false;
            if (onDisconnected) onDisconnected();
        });

        conn.on('error', (err) => {
            log('Connection error: ' + err);
            connected = false;
            if (onDisconnected) onDisconnected();
        });

        if (onConnected) onConnected();
    }

    function send(data) {
        if (conn && conn.open) {
            try { conn.send(data); } catch(e) { log('Send error: ' + e); }
        }
    }

    function disconnect() {
        cleanup();
    }

    function friendlyError(err) {
        switch (err.type) {
            case 'browser-incompatible': return 'Your browser does not support WebRTC.';
            case 'disconnected': return 'Lost connection to signaling server.';
            case 'network': return 'Network error. Check your internet connection.';
            case 'peer-unavailable': return 'Room not found.';
            case 'server-error': return 'Signaling server error. Try again in a moment.';
            case 'socket-error': return 'Socket error. Check your connection.';
            case 'socket-closed': return 'Connection to server was closed.';
            case 'unavailable-id': return 'Room code collision. Try again.';
            case 'webrtc': return 'WebRTC error. Try a different browser.';
            default: return err.message || 'Unknown connection error.';
        }
    }

    return {
        createRoom,
        joinRoom,
        send,
        disconnect,
        isConnected: () => connected,
        isHost: () => _isHost,
        getCode: () => roomCode,
    };
})();
