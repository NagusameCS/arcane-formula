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

    // ── ICE SERVER CONFIG ──
    // Cloudflare TURN creds are fetched at runtime via CORS proxies.
    // Multiple fallback TURN servers with static creds are also included.

    const STUN_SERVERS = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
    ];

    const STATIC_TURN = [
        // freestun.net — free public TURN (UDP + TCP)
        { urls: 'turn:freestun.net:3478', username: 'free', credential: 'free' },
        { urls: 'turn:freestun.net:3478?transport=tcp', username: 'free', credential: 'free' },
        // Open Relay Project (Metered) — may or may not still work
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    ];

    // Cache fetched ICE config
    let cachedICE = null;
    let cacheTime = 0;
    const CACHE_TTL = 1800000; // 30 min (Cloudflare creds rotate)

    // Fetch Cloudflare TURN creds through multiple CORS proxy fallbacks
    async function fetchCloudflareTURN() {
        const cfURL = 'https://speed.cloudflare.com/turn-creds';
        const proxies = [
            (u) => 'https://corsproxy.io/?' + encodeURIComponent(u),
            (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
            (u) => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
        ];

        // First try direct (works if same-origin or CORS is added later)
        try {
            const r = await fetchWithTimeout(cfURL, 4000);
            if (r.ok) {
                const data = await r.json();
                if (data && data.urls) return data;
            }
        } catch(e) { /* CORS blocked, expected */ }

        // Try each CORS proxy
        for (const makeURL of proxies) {
            try {
                const url = makeURL(cfURL);
                log('Trying TURN via proxy: ' + url.substring(0, 50) + '...');
                const r = await fetchWithTimeout(url, 5000);
                if (!r.ok) continue;
                const text = await r.text();
                // Some proxies wrap in JSON, try to extract
                let data;
                try { data = JSON.parse(text); } catch(e) { continue; }
                // allorigins wraps in {contents: "..."}, handle that
                if (data.contents) {
                    try { data = JSON.parse(data.contents); } catch(e) { continue; }
                }
                if (data && data.urls && data.username) {
                    log('Got Cloudflare TURN creds via proxy');
                    return data;
                }
            } catch(e) {
                log('Proxy failed: ' + e.message);
            }
        }
        return null;
    }

    function fetchWithTimeout(url, ms) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), ms);
        return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
    }

    async function getICEConfig() {
        if (cachedICE && Date.now() - cacheTime < CACHE_TTL) {
            return cachedICE;
        }

        let cloudflareServers = [];
        try {
            log('Fetching Cloudflare TURN credentials...');
            const creds = await fetchCloudflareTURN();
            if (creds && creds.urls && creds.username) {
                const urls = Array.isArray(creds.urls) ? creds.urls : [creds.urls];
                cloudflareServers = [{
                    urls: urls,
                    username: creds.username,
                    credential: creds.credential,
                }];
                log('Cloudflare TURN ready: ' + urls.join(', '));
            } else {
                log('Cloudflare TURN: no valid creds returned');
            }
        } catch (e) {
            log('Cloudflare TURN fetch failed: ' + e.message);
        }

        const allServers = [
            ...STUN_SERVERS,
            ...cloudflareServers,
            ...STATIC_TURN,
        ];

        cachedICE = { iceServers: allServers };
        cacheTime = Date.now();

        const turnCount = cloudflareServers.length > 0
            ? cloudflareServers[0].urls.length
            : 0;
        log('ICE config: ' + allServers.length + ' entries, '
            + turnCount + ' Cloudflare TURN, '
            + STATIC_TURN.length + ' static TURN');
        return cachedICE;
    }

    function generateCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
        return code;
    }

    function log(msg) {
        console.log('[Network]', msg);
    }

    async function makePeer(id) {
        const iceConfig = await getICEConfig();
        const opts = { debug: 1, config: iceConfig };
        return id ? new Peer(id, opts) : new Peer(opts);
    }

    function cleanup() {
        if (conn) { try { conn.close(); } catch(e) {} conn = null; }
        if (peer) { try { peer.destroy(); } catch(e) {} peer = null; }
        connected = false;
    }

    function monitorICE(pc, label) {
        if (!pc) return;
        pc.addEventListener('iceconnectionstatechange', () => {
            log(label + ' ICE: ' + pc.iceConnectionState);
        });
        pc.addEventListener('icegatheringstatechange', () => {
            log(label + ' gathering: ' + pc.iceGatheringState);
        });
        pc.addEventListener('connectionstatechange', () => {
            log(label + ' state: ' + pc.connectionState);
        });
        // Log candidate types to diagnose STUN vs TURN vs relay
        pc.addEventListener('icecandidate', (e) => {
            if (e.candidate) {
                const c = e.candidate;
                log(label + ' candidate: ' + c.type + ' ' + (c.protocol||'') + ' ' + (c.relatedAddress||c.address||'') + ':' + (c.relatedPort||c.port||''));
            } else {
                log(label + ' ICE gathering complete');
            }
        });
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

            async function attempt(code) {
                log('Creating room: ' + code + ' (attempt ' + (retries + 1) + ')');
                try {
                    peer = await makePeer(PREFIX + code);
                } catch (e) {
                    if (!settled) { settled = true; reject(new Error('Failed to create peer: ' + e.message)); }
                    return;
                }

                peer.on('open', (id) => {
                    if (settled) return;
                    settled = true;
                    roomCode = code;
                    log('Room created: ' + code);
                    resolve(code);
                });

                peer.on('connection', (c) => {
                    log('Incoming connection from opponent');
                    conn = c;

                    // Monitor ICE on the underlying RTCPeerConnection
                    setTimeout(() => {
                        if (conn && conn.peerConnection) monitorICE(conn.peerConnection, 'Host');
                    }, 200);

                    if (conn.open) {
                        log('Connection already open');
                        setupConnection();
                    } else {
                        conn.on('open', () => {
                            log('Host data channel opened');
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
                    log('Signaling disconnected, reconnecting...');
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
            }, 20000);
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

            (async () => {
                try {
                    peer = await makePeer();
                } catch (e) {
                    if (!settled) { settled = true; reject(new Error('Failed to create peer: ' + e.message)); }
                    return;
                }

                peer.on('open', (myId) => {
                    log('My peer id: ' + myId + ', connecting to ' + PREFIX + roomCode);
                    conn = peer.connect(PREFIX + roomCode, { reliable: true, serialization: 'json' });

                    setTimeout(() => {
                        if (conn && conn.peerConnection) monitorICE(conn.peerConnection, 'Client');
                    }, 500);

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
                            reject(new Error('Failed to connect. Is the code correct?'));
                        }
                    });
                });

                peer.on('error', (err) => {
                    log('Peer error: ' + err.type + ' - ' + err.message);
                    if (!settled) {
                        settled = true;
                        if (err.type === 'peer-unavailable') {
                            reject(new Error('Room "' + roomCode + '" not found. Check the code.'));
                        } else {
                            reject(new Error(friendlyError(err)));
                        }
                    }
                });

                peer.on('disconnected', () => {
                    log('Signaling disconnected');
                    if (peer && !peer.destroyed) {
                        try { peer.reconnect(); } catch(e) {}
                    }
                });

                setTimeout(() => {
                    if (!settled) {
                        settled = true;
                        cleanup();
                        reject(new Error('Connection timed out. Try again — if it persists, a firewall may be blocking WebRTC.'));
                    }
                }, 25000);
            })();
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

    function disconnect() { cleanup(); }

    function friendlyError(err) {
        switch (err.type) {
            case 'browser-incompatible': return 'Your browser does not support WebRTC.';
            case 'disconnected': return 'Lost connection to signaling server.';
            case 'network': return 'Network error. Check your internet.';
            case 'peer-unavailable': return 'Room not found.';
            case 'server-error': return 'Signaling server error. Try again.';
            case 'socket-error': return 'Socket error. Check your connection.';
            case 'socket-closed': return 'Connection to server closed.';
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
