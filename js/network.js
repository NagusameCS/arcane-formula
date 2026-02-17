// ─────────────────────────────────────────────
//  PEER-TO-PEER NETWORKING VIA PEERJS
//  WebRTC P2P — works cross-internet
//  v2: Multi-peer support (2+ players), late join, broadcast
// ─────────────────────────────────────────────

const Network = (() => {
    let peer = null;
    let connections = []; // Array of { conn, peerId }
    let _isHost = false;
    let roomCode = '';
    let connected = false;
    let onMessage = null;
    let onConnected = null;
    let onDisconnected = null;
    let onPeerJoin = null;
    let onPeerLeave = null;

    const PREFIX = 'arcform-';

    // ── ICE SERVER CONFIG ──
    const STUN_SERVERS = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
    ];

    const STATIC_TURN = [
        { urls: 'turn:freestun.net:3478', username: 'free', credential: 'free' },
        { urls: 'turn:freestun.net:3478?transport=tcp', username: 'free', credential: 'free' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    ];

    let cachedICE = null;
    let cacheTime = 0;
    const CACHE_TTL = 1800000;

    async function fetchCloudflareTURN() {
        const cfURL = 'https://speed.cloudflare.com/turn-creds';
        const proxies = [
            (u) => 'https://corsproxy.io/?' + encodeURIComponent(u),
            (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
            (u) => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
        ];
        try {
            const r = await fetchWithTimeout(cfURL, 4000);
            if (r.ok) { const data = await r.json(); if (data && data.urls) return data; }
        } catch(e) {}
        for (const makeURL of proxies) {
            try {
                const url = makeURL(cfURL);
                log('Trying TURN via proxy: ' + url.substring(0, 50) + '...');
                const r = await fetchWithTimeout(url, 5000);
                if (!r.ok) continue;
                const text = await r.text();
                let data;
                try { data = JSON.parse(text); } catch(e) { continue; }
                if (data.contents) { try { data = JSON.parse(data.contents); } catch(e) { continue; } }
                if (data && data.urls && data.username) { log('Got Cloudflare TURN creds via proxy'); return data; }
            } catch(e) { log('Proxy failed: ' + e.message); }
        }
        return null;
    }

    function fetchWithTimeout(url, ms) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), ms);
        return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
    }

    async function getICEConfig() {
        if (cachedICE && Date.now() - cacheTime < CACHE_TTL) return cachedICE;
        let cloudflareServers = [];
        try {
            log('Fetching Cloudflare TURN credentials...');
            const creds = await fetchCloudflareTURN();
            if (creds && creds.urls && creds.username) {
                const urls = Array.isArray(creds.urls) ? creds.urls : [creds.urls];
                cloudflareServers = [{ urls, username: creds.username, credential: creds.credential }];
                log('Cloudflare TURN ready: ' + urls.join(', '));
            }
        } catch (e) { log('Cloudflare TURN fetch failed: ' + e.message); }
        cachedICE = { iceServers: [...STUN_SERVERS, ...cloudflareServers, ...STATIC_TURN] };
        cacheTime = Date.now();
        return cachedICE;
    }

    function generateCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
        return code;
    }

    function log(msg) { console.log('[Network]', msg); }

    async function makePeer(id) {
        const iceConfig = await getICEConfig();
        const opts = { debug: 1, config: iceConfig };
        return id ? new Peer(id, opts) : new Peer(opts);
    }

    function cleanup() {
        for (const entry of connections) { try { entry.conn.close(); } catch(e) {} }
        connections = [];
        if (peer) { try { peer.destroy(); } catch(e) {} peer = null; }
        connected = false;
    }

    function monitorICE(pc, label) {
        if (!pc) return;
        pc.addEventListener('iceconnectionstatechange', () => log(label + ' ICE: ' + pc.iceConnectionState));
        pc.addEventListener('connectionstatechange', () => log(label + ' state: ' + pc.connectionState));
    }

    // ── Setup a single connection ──
    function setupSingleConnection(c, peerId) {
        const entry = { conn: c, peerId: peerId || c.peer };
        connections.push(entry);
        connected = true;

        c.on('data', (data) => { if (onMessage) onMessage(data, entry.peerId); });
        c.on('close', () => {
            log('Connection closed: ' + entry.peerId);
            connections = connections.filter(e => e !== entry);
            connected = connections.length > 0;
            if (onPeerLeave) onPeerLeave(entry.peerId);
            if (connections.length === 0 && onDisconnected) onDisconnected();
        });
        c.on('error', (err) => {
            log('Connection error (' + entry.peerId + '): ' + err);
            connections = connections.filter(e => e !== entry);
            connected = connections.length > 0;
            if (onPeerLeave) onPeerLeave(entry.peerId);
            if (connections.length === 0 && onDisconnected) onDisconnected();
        });

        if (onPeerJoin) onPeerJoin(entry.peerId);
        if (onConnected && connections.length === 1) onConnected();
    }

    // ── HOST: Create Room (accepts multiple connections + late join) ──
    function createRoom(callbacks) {
        cleanup();
        onMessage = callbacks.onMessage;
        onConnected = callbacks.onConnected;
        onDisconnected = callbacks.onDisconnected;
        onPeerJoin = callbacks.onPeerJoin || null;
        onPeerLeave = callbacks.onPeerLeave || null;
        _isHost = true;
        roomCode = generateCode();

        return new Promise((resolve, reject) => {
            let settled = false;
            let retries = 0;

            async function attempt(code) {
                log('Creating room: ' + code + ' (attempt ' + (retries + 1) + ')');
                try { peer = await makePeer(PREFIX + code); } catch (e) {
                    if (!settled) { settled = true; reject(new Error('Failed to create peer: ' + e.message)); }
                    return;
                }

                peer.on('open', (id) => {
                    if (settled) return;
                    settled = true; roomCode = code;
                    log('Room created: ' + code);
                    resolve(code);
                });

                // Accept ALL incoming connections (multi-player + late join)
                peer.on('connection', (c) => {
                    log('Incoming connection from: ' + c.peer + ' (total: ' + (connections.length + 1) + ')');
                    const doSetup = () => {
                        setupSingleConnection(c, c.peer);
                        setTimeout(() => { if (c.peerConnection) monitorICE(c.peerConnection, 'Host->' + c.peer); }, 200);
                    };
                    if (c.open) doSetup();
                    else c.on('open', doSetup);
                });

                peer.on('error', (err) => {
                    log('Peer error: ' + err.type + ' - ' + err.message);
                    if (err.type === 'unavailable-id' && retries < 3) {
                        retries++; try { peer.destroy(); } catch(e) {}
                        attempt(generateCode());
                    } else if (!settled) { settled = true; reject(new Error(friendlyError(err))); }
                });

                peer.on('disconnected', () => {
                    log('Signaling disconnected, reconnecting...');
                    if (peer && !peer.destroyed) { try { peer.reconnect(); } catch(e) {} }
                });
            }

            attempt(roomCode);
            setTimeout(() => { if (!settled) { settled = true; reject(new Error('Could not reach signaling server.')); } }, 20000);
        });
    }

    // ── CLIENT: Join Room ──
    function joinRoom(code, callbacks) {
        cleanup();
        onMessage = callbacks.onMessage;
        onConnected = callbacks.onConnected;
        onDisconnected = callbacks.onDisconnected;
        onPeerJoin = callbacks.onPeerJoin || null;
        onPeerLeave = callbacks.onPeerLeave || null;
        _isHost = false;
        roomCode = code.toUpperCase().trim();

        return new Promise((resolve, reject) => {
            let settled = false;
            log('Joining room: ' + roomCode);

            (async () => {
                try { peer = await makePeer(); } catch (e) {
                    if (!settled) { settled = true; reject(new Error('Failed to create peer: ' + e.message)); }
                    return;
                }

                peer.on('open', (myId) => {
                    log('My peer id: ' + myId + ', connecting to ' + PREFIX + roomCode);
                    const c = peer.connect(PREFIX + roomCode, { reliable: true, serialization: 'json' });
                    setTimeout(() => { if (c && c.peerConnection) monitorICE(c.peerConnection, 'Client'); }, 500);
                    c.on('open', () => {
                        if (settled) return;
                        settled = true;
                        log('Connection established!');
                        setupSingleConnection(c, c.peer);
                        resolve();
                    });
                    c.on('error', (err) => {
                        log('Connection error: ' + err);
                        if (!settled) { settled = true; reject(new Error('Failed to connect. Is the code correct?')); }
                    });
                });

                peer.on('error', (err) => {
                    log('Peer error: ' + err.type + ' - ' + err.message);
                    if (!settled) {
                        settled = true;
                        reject(new Error(err.type === 'peer-unavailable' ? 'Room "' + roomCode + '" not found.' : friendlyError(err)));
                    }
                });

                peer.on('disconnected', () => {
                    log('Signaling disconnected');
                    if (peer && !peer.destroyed) { try { peer.reconnect(); } catch(e) {} }
                });

                setTimeout(() => { if (!settled) { settled = true; cleanup(); reject(new Error('Connection timed out.')); } }, 25000);
            })();
        });
    }

    // ── SEND: Broadcast to all, or send to specific peer ──
    function send(data, targetPeerId) {
        if (targetPeerId) {
            const entry = connections.find(e => e.peerId === targetPeerId);
            if (entry && entry.conn.open) { try { entry.conn.send(data); } catch(e) { log('Send error: ' + e); } }
        } else {
            for (const entry of connections) {
                if (entry.conn.open) { try { entry.conn.send(data); } catch(e) { log('Send error: ' + e); } }
            }
        }
    }

    function disconnect() { cleanup(); }
    function getPeerCount() { return connections.length; }

    function friendlyError(err) {
        const map = {
            'browser-incompatible': 'Your browser does not support WebRTC.',
            'disconnected': 'Lost connection to signaling server.',
            'network': 'Network error. Check your internet.',
            'peer-unavailable': 'Room not found.',
            'server-error': 'Signaling server error. Try again.',
            'socket-error': 'Socket error. Check your connection.',
            'socket-closed': 'Connection to server closed.',
            'unavailable-id': 'Room code collision. Try again.',
            'webrtc': 'WebRTC error. Try a different browser.',
        };
        return map[err.type] || err.message || 'Unknown connection error.';
    }

    return {
        createRoom, joinRoom, send, disconnect,
        isConnected: () => connected,
        isHost: () => _isHost,
        getCode: () => roomCode,
        getPeerCount,
    };
})();
