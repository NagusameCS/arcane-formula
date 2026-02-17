// ─────────────────────────────────────────────
//  PARTY-BASED P2P NETWORKING (PeerJS WebRTC)
//  Persistent parties that survive mode switches
//  Optimised: batched sync, fast ICE, connection pooling
// ─────────────────────────────────────────────

const Network = (() => {
    /* ── state ── */
    let peer          = null;
    let connections   = [];          // [{ conn, peerId, nick, ready, color }]
    let _isHost       = false;
    let partyCode     = '';
    let connected     = false;
    let myNick        = '';
    let myColor       = '#4488ff';

    /* callbacks (set once by main.js) */
    let onMessage        = null;
    let onConnected      = null;
    let onDisconnected   = null;
    let onPeerJoin       = null;
    let onPeerLeave      = null;
    let onPartyUpdate    = null;

    const PREFIX = 'arcform-';

    /* ── ICE config (cached, pre-fetched) ── */
    const STUN = [
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

    /* ── Message batching (reduces WebRTC overhead) ── */
    let sendQueue     = [];
    let batchTimer    = null;
    const BATCH_MS    = 16;

    function flushQueue() {
        if (sendQueue.length === 0) return;
        const batch = sendQueue.length === 1 ? sendQueue[0] : { _b: sendQueue };
        sendQueue = [];
        for (const entry of connections) {
            if (entry.conn.open) {
                try { entry.conn.send(batch); } catch(e) {}
            }
        }
    }

    function startBatching() {
        if (batchTimer) return;
        batchTimer = setInterval(flushQueue, BATCH_MS);
    }
    function stopBatching() {
        if (batchTimer) { clearInterval(batchTimer); batchTimer = null; }
        flushQueue();
    }

    /* ── ICE helpers ── */
    async function fetchCloudflareTURN() {
        const cfURL = 'https://speed.cloudflare.com/turn-creds';
        const proxies = [
            (u) => 'https://corsproxy.io/?' + encodeURIComponent(u),
            (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
            (u) => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
        ];
        try {
            const r = await fetchWithTimeout(cfURL, 4000);
            if (r.ok) { const d = await r.json(); if (d && d.urls) return d; }
        } catch(e) {}
        for (const mkURL of proxies) {
            try {
                const r = await fetchWithTimeout(mkURL(cfURL), 5000);
                if (!r.ok) continue;
                const txt = await r.text();
                let d; try { d = JSON.parse(txt); } catch(e) { continue; }
                if (d.contents) { try { d = JSON.parse(d.contents); } catch(e) { continue; } }
                if (d && d.urls && d.username) return d;
            } catch(e) {}
        }
        return null;
    }

    function fetchWithTimeout(url, ms) {
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), ms);
        return fetch(url, { signal: c.signal }).finally(() => clearTimeout(t));
    }

    async function getICEConfig() {
        if (cachedICE && Date.now() - cacheTime < CACHE_TTL) return cachedICE;
        let cf = [];
        try {
            const creds = await fetchCloudflareTURN();
            if (creds && creds.urls && creds.username) {
                cf = [{ urls: Array.isArray(creds.urls) ? creds.urls : [creds.urls], username: creds.username, credential: creds.credential }];
            }
        } catch(e) {}
        cachedICE = { iceServers: [...STUN, ...cf, ...STATIC_TURN] };
        cacheTime = Date.now();
        return cachedICE;
    }

    // Pre-warm ICE on page load
    getICEConfig().catch(() => {});

    function generateCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
        return code;
    }

    function log(msg) { console.log('[Party]', msg); }

    async function makePeer(id) {
        const ice = await getICEConfig();
        const opts = { debug: 0, config: ice };
        return id ? new Peer(id, opts) : new Peer(opts);
    }

    function cleanup() {
        stopBatching();
        for (const e of connections) { try { e.conn.close(); } catch(x) {} }
        connections = [];
        if (peer) { try { peer.destroy(); } catch(x) {} peer = null; }
        connected = false;
    }

    // ── Rejoin support ──
    function savePartyInfo() {
        try {
            sessionStorage.setItem('arcform-party', JSON.stringify({
                code: partyCode, isHost: _isHost, nick: myNick, color: myColor, ts: Date.now(),
            }));
        } catch(e) {}
    }
    function getSavedParty() {
        try {
            const raw = sessionStorage.getItem('arcform-party');
            if (!raw) return null;
            const d = JSON.parse(raw);
            // Expire after 30 minutes
            if (Date.now() - d.ts > 30 * 60 * 1000) { sessionStorage.removeItem('arcform-party'); return null; }
            return d;
        } catch(e) { return null; }
    }
    function clearSavedParty() {
        try { sessionStorage.removeItem('arcform-party'); } catch(e) {}
    }

    function monitorICE(pc, label) {
        if (!pc) return;
        pc.addEventListener('iceconnectionstatechange', () => log(label + ' ICE:' + pc.iceConnectionState));
    }

    /* ── Connection wiring ── */
    function setupConn(c, peerId) {
        const entry = { conn: c, peerId: peerId || c.peer, nick: '', ready: false, color: '#ff4444' };
        connections.push(entry);
        connected = true;
        startBatching();

        c.on('data', (raw) => {
            // Un-batch
            if (raw && raw._b && Array.isArray(raw._b)) {
                for (const m of raw._b) dispatchMessage(m, entry);
            } else {
                dispatchMessage(raw, entry);
            }
        });

        const onGone = () => {
            log('Peer gone: ' + entry.peerId);
            connections = connections.filter(e => e !== entry);
            connected = connections.length > 0;
            if (onPeerLeave) onPeerLeave(entry.peerId);
            firePartyUpdate();
            if (connections.length === 0) {
                stopBatching();
                if (onDisconnected) onDisconnected();
            }
        };
        c.on('close', onGone);
        c.on('error', onGone);

        if (onPeerJoin) onPeerJoin(entry.peerId);
        if (onConnected && connections.length === 1) onConnected();
        firePartyUpdate();

        // Send our info immediately
        c.send({ type: '_party-info', nick: myNick, color: myColor, ready: false });
    }

    function dispatchMessage(raw, entry) {
        if (!raw || !raw.type) return;
        if (raw.type === '_party-info') {
            entry.nick  = raw.nick  || entry.nick;
            entry.color = raw.color || entry.color;
            entry.ready = !!raw.ready;
            firePartyUpdate();
            return;
        }
        if (raw.type === '_party-ready') {
            entry.ready = !!raw.ready;
            firePartyUpdate();
        }
        if (onMessage) onMessage(raw, entry.peerId);
    }

    function firePartyUpdate() {
        if (onPartyUpdate) onPartyUpdate(getMembers());
    }

    /* ── PUBLIC: Create Party ── */
    function createParty(callbacks) {
        cleanup();
        applyCallbacks(callbacks);
        _isHost = true;
        partyCode = generateCode();

        return new Promise((resolve, reject) => {
            let settled = false;
            let retries = 0;

            async function attempt(code) {
                log('Creating party: ' + code);
                try { peer = await makePeer(PREFIX + code); } catch(e) {
                    if (!settled) { settled = true; reject(new Error('Peer create failed: ' + e.message)); }
                    return;
                }

                peer.on('open', () => {
                    if (settled) return;
                    settled = true;
                    partyCode = code;
                    log('Party live: ' + code);
                    savePartyInfo();
                    resolve(code);
                });

                peer.on('connection', (c) => {
                    log('Peer connecting (total → ' + (connections.length + 1) + ')');
                    const wire = () => {
                        setupConn(c, c.peer);
                        setTimeout(() => { if (c.peerConnection) monitorICE(c.peerConnection, 'H→' + c.peer); }, 200);
                    };
                    if (c.open) wire(); else c.on('open', wire);
                });

                peer.on('error', (err) => {
                    log('Peer err: ' + err.type);
                    if (err.type === 'unavailable-id' && retries < 3) {
                        retries++; try { peer.destroy(); } catch(x) {}
                        attempt(generateCode());
                    } else if (!settled) { settled = true; reject(new Error(friendlyError(err))); }
                });

                peer.on('disconnected', () => {
                    if (peer && !peer.destroyed) { try { peer.reconnect(); } catch(x) {} }
                });
            }

            attempt(partyCode);
            setTimeout(() => { if (!settled) { settled = true; reject(new Error('Could not reach signaling server.')); } }, 15000);
        });
    }

    /* ── PUBLIC: Join Party ── */
    function joinParty(code, callbacks) {
        cleanup();
        applyCallbacks(callbacks);
        _isHost = false;
        partyCode = code.toUpperCase().trim();

        return new Promise((resolve, reject) => {
            let settled = false;
            log('Joining party: ' + partyCode);

            (async () => {
                try { peer = await makePeer(); } catch(e) {
                    if (!settled) { settled = true; reject(new Error('Peer create failed: ' + e.message)); }
                    return;
                }

                peer.on('open', (myId) => {
                    log('My id: ' + myId);
                    const c = peer.connect(PREFIX + partyCode, { reliable: true, serialization: 'json' });
                    setTimeout(() => { if (c && c.peerConnection) monitorICE(c.peerConnection, 'Client'); }, 500);
                    c.on('open', () => {
                        if (settled) return;
                        settled = true;
                        log('Connected!');
                        setupConn(c, c.peer);
                        savePartyInfo();
                        resolve();
                    });
                    c.on('error', (err) => {
                        if (!settled) { settled = true; reject(new Error('Connect failed. Wrong code?')); }
                    });
                });

                peer.on('error', (err) => {
                    if (!settled) {
                        settled = true;
                        reject(new Error(err.type === 'peer-unavailable' ? 'Party "' + partyCode + '" not found.' : friendlyError(err)));
                    }
                });

                peer.on('disconnected', () => {
                    if (peer && !peer.destroyed) { try { peer.reconnect(); } catch(x) {} }
                });

                setTimeout(() => { if (!settled) { settled = true; cleanup(); reject(new Error('Timed out.')); } }, 15000);
            })();
        });
    }

    function applyCallbacks(cb) {
        if (!cb) return;
        onMessage      = cb.onMessage      || null;
        onConnected    = cb.onConnected    || null;
        onDisconnected = cb.onDisconnected || null;
        onPeerJoin     = cb.onPeerJoin     || null;
        onPeerLeave    = cb.onPeerLeave    || null;
        onPartyUpdate  = cb.onPartyUpdate  || null;
    }

    /* ── PUBLIC: Send (batched broadcast) ── */
    function send(data, targetPeerId) {
        if (targetPeerId) {
            const entry = connections.find(e => e.peerId === targetPeerId);
            if (entry && entry.conn.open) { try { entry.conn.send(data); } catch(e) {} }
        } else {
            sendQueue.push(data);
        }
    }

    /* ── PUBLIC: sendNow (skip batching) ── */
    function sendNow(data) {
        for (const entry of connections) {
            if (entry.conn.open) { try { entry.conn.send(data); } catch(e) {} }
        }
    }

    /* ── Party state helpers ── */
    function setNick(n) { myNick = n; broadcastInfo(); }
    function setColor(c) { myColor = c; broadcastInfo(); }
    function setReady(r) {
        broadcastInfo();
        send({ type: '_party-ready', ready: !!r });
    }
    function broadcastInfo() {
        sendNow({ type: '_party-info', nick: myNick, color: myColor });
    }

    function getMembers() {
        const members = connections.map(e => ({
            id: e.peerId,
            nick: e.nick || e.peerId.replace(PREFIX, '').substring(0, 8),
            color: e.color,
            ready: e.ready,
            isHost: false,
        }));
        members.unshift({
            id: 'self',
            nick: myNick || 'You',
            color: myColor,
            ready: false,
            isHost: _isHost,
        });
        return members;
    }

    function allReady() {
        return connections.length > 0 && connections.every(e => e.ready);
    }

    function getPeerIds() { return connections.map(e => e.peerId); }
    function disconnect() { cleanup(); }
    function getPeerCount() { return connections.length; }

    function friendlyError(err) {
        const m = {
            'browser-incompatible': 'Browser lacks WebRTC.',
            'disconnected': 'Lost signaling server.',
            'network': 'Network error.',
            'peer-unavailable': 'Party not found.',
            'server-error': 'Server error. Retry.',
            'socket-error': 'Socket error.',
            'socket-closed': 'Server connection closed.',
            'unavailable-id': 'Code collision. Retry.',
            'webrtc': 'WebRTC error.',
        };
        return m[err.type] || err.message || 'Connection error.';
    }

    return {
        createParty, joinParty, send, sendNow, disconnect,
        isConnected : () => connected,
        isHost      : () => _isHost,
        getCode     : () => partyCode,
        getPeerCount,
        getPeerIds,
        getMembers,
        allReady,
        setNick, setColor, setReady,
        getSavedParty, clearSavedParty,
        rejoinParty : (callbacks) => {
            const saved = getSavedParty();
            if (!saved || !saved.code) return Promise.reject(new Error('No saved party'));
            myNick = saved.nick || ''; myColor = saved.color || '#4488ff';
            if (saved.isHost) return createParty(callbacks);
            return joinParty(saved.code, callbacks);
        },
    };
})();
