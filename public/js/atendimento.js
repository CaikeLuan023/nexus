// ==================== CENTRAL DE ATENDIMENTO ====================

let _atdChats = [];
let _atdCurrentChatId = null;
let _atdCurrentChatName = null;
let _atdEventSource = null;
let _atdReplyTo = null;
let _atdPicCache = {};
let _atdLastMsgCount = 0;
let _atdChatsLoaded = false;
let _atdLastStatus = '';
let _atdQrLoading = false;
let _atdMsgPollInterval = null;

// Queue system
let _atdFiltro = 'todos';
let _atdUserInfo = null;
let _atdIsAdmin = false;
let _atdFilteredChats = [];
let _atdTransferChatId = null;

document.addEventListener('DOMContentLoaded', () => {
    atdCheckStatus();
    setInterval(atdCheckStatus, 10000);
    atdConnectSSE();
    atdInitQueue();
});

async function atdInitQueue() {
    // Wait for _currentUser from app.js
    let tries = 0;
    while (!window._currentUser && tries < 30) {
        await new Promise(r => setTimeout(r, 200));
        tries++;
    }
    if (window._currentUser) {
        _atdUserInfo = window._currentUser;
        _atdIsAdmin = _atdUserInfo.perfil === 'admin';
    }
    const filtersDiv = document.getElementById('atdQueueFilters');
    const btnsDiv = document.getElementById('atdFilterBtns');
    if (!filtersDiv || !btnsDiv) return;
    filtersDiv.style.display = 'block';

    if (_atdIsAdmin) {
        btnsDiv.innerHTML = `
            <button class="btn btn-sm btn-primary atd-filter-btn active" data-filtro="todos" onclick="atdSetFiltro('todos')">Todos</button>
            <button class="btn btn-sm btn-outline-secondary atd-filter-btn" data-filtro="fila" onclick="atdSetFiltro('fila')">
                <i class="bi bi-hourglass-split me-1"></i>Fila <span class="badge bg-warning text-dark ms-1" id="atdBadgeFila">0</span>
            </button>
            <button class="btn btn-sm btn-outline-secondary atd-filter-btn" data-filtro="em_atendimento" onclick="atdSetFiltro('em_atendimento')">Atendendo</button>`;
    } else {
        btnsDiv.innerHTML = `
            <button class="btn btn-sm btn-outline-warning atd-filter-btn" data-filtro="fila" onclick="atdSetFiltro('fila')">
                <i class="bi bi-hourglass-split me-1"></i>Fila <span class="badge bg-warning text-dark ms-1" id="atdBadgeFila">0</span>
            </button>
            <button class="btn btn-sm btn-primary atd-filter-btn active" data-filtro="meus" onclick="atdSetFiltro('meus')">
                <i class="bi bi-person-check me-1"></i>Meus <span class="badge bg-light text-dark ms-1" id="atdBadgeMeus">0</span>
            </button>`;
        _atdFiltro = 'meus';
    }
}

function atdSetFiltro(filtro) {
    _atdFiltro = filtro;
    document.querySelectorAll('.atd-filter-btn').forEach(b => {
        b.classList.remove('btn-primary', 'active');
        b.classList.add('btn-outline-secondary');
    });
    const activeBtn = document.querySelector(`.atd-filter-btn[data-filtro="${filtro}"]`);
    if (activeBtn) {
        activeBtn.classList.remove('btn-outline-secondary');
        activeBtn.classList.add('btn-primary', 'active');
    }
    atdRenderChats(_atdChats);
}

// ==================== HELPERS ====================

// Wrapper for POST/PUT/DELETE that includes CSRF token (uses getCsrfToken from app.js)
async function atdFetch(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        const token = typeof getCsrfToken === 'function' ? await getCsrfToken() : null;
        if (token) {
            options.headers = { ...options.headers, 'X-CSRF-Token': token };
        }
    }
    return fetch(url, options);
}

function atdEscape(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function atdGetChatId(chat) {
    if (chat.id && typeof chat.id === 'object') return chat.id._serialized;
    return chat.id || String(chat.id);
}

function atdGetMsgId(msg) {
    return msg.id || msg.messageId || '';
}

function atdPlaySound() {
    // Use global AudioContext from app.js if available
    if (typeof playGlobalNotifSound === 'function') {
        playGlobalNotifSound();
        return;
    }
    try { const a = document.getElementById('atdNotifSound'); if (a) { a.currentTime = 0; a.play().catch(() => {}); } } catch {}
}

// ==================== STATUS ====================

async function atdCheckStatus() {
    try {
        const res = await fetch('/api/whatsapp/status');
        const data = await res.json();
        atdUpdateStatus(data);
    } catch { atdUpdateStatus({ status: 'STOPPED' }); }
}

function atdUpdateStatus(data) {
    const dot = document.getElementById('atdStatusDot');
    const text = document.getElementById('atdStatusText');
    const qrPanel = document.getElementById('atdQrPanel');
    const layout = document.getElementById('atdLayout');
    const btnStart = document.getElementById('atdBtnStart');
    const btnStop = document.getElementById('atdBtnStop');
    const qrContainer = document.getElementById('atdQrContainer');
    const status = (data.status || '').toUpperCase();
    const statusChanged = status !== _atdLastStatus;
    _atdLastStatus = status;

    if (status === 'WORKING' || status === 'CONNECTED') {
        dot.className = 'atd-status-indicator connected';
        text.textContent = 'Conectado';
        qrPanel.style.display = 'none';
        layout.style.display = 'flex';
        btnStart.style.display = 'none';
        btnStop.style.display = '';
        if (!_atdChatsLoaded) atdLoadChats();
    } else if (status === 'SCAN_QR_CODE') {
        dot.className = 'atd-status-indicator connecting';
        text.textContent = 'Aguardando QR Code...';
        qrPanel.style.display = 'flex';
        layout.style.display = 'none';
        btnStart.style.display = 'none';
        btnStop.style.display = '';
        // So carrega QR quando status muda ou nao tem QR ainda
        if (statusChanged || !qrContainer.querySelector('img')) {
            atdRefreshQR();
        }
        _atdChatsLoaded = false;
    } else if (status === 'STARTING') {
        dot.className = 'atd-status-indicator connecting';
        text.textContent = 'Iniciando...';
        qrPanel.style.display = 'flex';
        layout.style.display = 'none';
        btnStart.style.display = 'none';
        btnStop.style.display = '';
        qrContainer.innerHTML = '<div class="spinner-border text-primary"></div><p class="text-muted mt-2">Iniciando sessao...</p>';
        _atdChatsLoaded = false;
    } else {
        // STOPPED, FAILED, etc
        dot.className = 'atd-status-indicator disconnected';
        text.textContent = 'Desconectado';
        qrPanel.style.display = 'flex';
        layout.style.display = 'none';
        btnStart.style.display = '';
        btnStop.style.display = 'none';
        qrContainer.innerHTML = '<div class="text-center"><i class="bi bi-wifi-off" style="font-size:3rem;color:#ccc"></i><p class="text-muted mt-2">Clique em <strong>Iniciar Sessao</strong> para conectar</p></div>';
        _atdChatsLoaded = false;
    }
}

// ==================== SESSION CONTROL ====================

async function atdStartSession() {
    const btn = document.getElementById('atdBtnStart');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Iniciando...';
    document.getElementById('atdQrContainer').innerHTML = '<div class="spinner-border text-primary"></div><p class="text-muted mt-2">Iniciando sessao...</p>';
    try {
        const res = await atdFetch('/api/whatsapp/start', { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
            // Polling rapido ate QR aparecer
            let tries = 0;
            const poll = setInterval(async () => {
                tries++;
                await atdCheckStatus();
                if (_atdLastStatus === 'SCAN_QR_CODE' || _atdLastStatus === 'WORKING' || tries > 10) {
                    clearInterval(poll);
                }
            }, 2000);
        } else {
            mostrarToast(data.erro || 'Erro ao iniciar', 'error');
        }
    } catch { mostrarToast('Erro ao iniciar sessao', 'error'); }
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-play-circle me-1"></i>Iniciar Sessao';
}

async function atdStopSession() {
    if (!confirm('Desconectar do atendimento?')) return;
    try {
        await atdFetch('/api/whatsapp/stop', { method: 'POST' });
        _atdChats = [];
        _atdCurrentChatId = null;
        _atdChatsLoaded = false;
        atdCheckStatus();
        mostrarToast('Sessao encerrada');
    } catch { mostrarToast('Erro ao desconectar', 'error'); }
}

async function atdRefreshQR() {
    if (_atdQrLoading) return;
    _atdQrLoading = true;
    const container = document.getElementById('atdQrContainer');
    container.innerHTML = '<div class="spinner-border text-primary"></div><p class="text-muted mt-2">Carregando QR Code...</p>';
    try {
        const res = await fetch('/api/whatsapp/qr');
        if (!res.ok) throw new Error('Status ' + res.status);
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('image')) {
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            container.innerHTML = `<img src="${url}" alt="QR Code">`;
        } else {
            const data = await res.json();
            if (data.value) {
                const src = data.value.startsWith('data:') ? data.value : `data:image/png;base64,${data.value}`;
                container.innerHTML = `<img src="${src}" alt="QR Code">`;
            } else {
                container.innerHTML = '<div class="text-center"><i class="bi bi-qr-code" style="font-size:3rem;color:#ccc"></i><p class="text-muted mt-2">QR nao disponivel. Clique em Atualizar QR.</p></div>';
            }
        }
    } catch {
        container.innerHTML = '<div class="text-center"><i class="bi bi-exclamation-triangle" style="font-size:2rem;color:#f59e0b"></i><p class="text-muted mt-2">Erro ao carregar QR. Clique em Atualizar QR.</p></div>';
    }
    _atdQrLoading = false;
}

// ==================== SSE ====================

function atdConnectSSE() {
    if (_atdEventSource) _atdEventSource.close();
    _atdEventSource = new EventSource('/api/whatsapp/events');
    _atdEventSource.onmessage = (e) => {
        try {
            const event = JSON.parse(e.data);
            atdHandleSSE(event);
        } catch {}
    };
    _atdEventSource.onerror = () => {
        if (_atdEventSource) _atdEventSource.close();
        _atdEventSource = null;
        setTimeout(atdConnectSSE, 2000);
    };
}

function atdHandleSSE(event) {
    const type = event.event || event.type;
    if (type === 'message.status') return;

    // Queue events
    if (type === 'atendimento.novo' || type === 'atendimento.atribuido' || type === 'atendimento.transferido' || type === 'atendimento.finalizado') {
        atdLoadChats();
        return;
    }

    if (type === 'message' && event.payload) {
        const msg = event.payload;
        if (!msg.body && !msg.type) { atdLoadChats(); return; }
        const chatId = typeof msg.from === 'object' ? msg.from._serialized : (msg.from || '');
        const toChatId = typeof msg.to === 'object' ? msg.to._serialized : (msg.to || msg.from || '');
        const relevantChat = msg.fromMe ? toChatId : chatId;

        // Client-side filtering: skip messages from chats assigned to other agents (non-admin)
        if (!_atdIsAdmin && !relevantChat.includes('@g.us') && msg._atendimento) {
            const atd = msg._atendimento;
            if (atd.status === 'em_atendimento' && atd.agente_id !== (_atdUserInfo?.id || 0)) {
                return; // Not our chat
            }
        }

        if (relevantChat === _atdCurrentChatId && !msg.fromMe) {
            atdAppendMessage(msg);
            atdFetch('/api/whatsapp/seen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId: _atdCurrentChatId }) }).catch(() => {});
        }
        if (!msg.fromMe && relevantChat !== _atdCurrentChatId) {
            atdPlaySound();
            atdShowNotif(msg, relevantChat);
            // Incrementar unread localmente
            const chat = _atdChats.find(c => atdGetChatId(c) === relevantChat);
            if (chat) {
                chat.unreadCount = (chat.unreadCount || 0) + 1;
                chat.timestamp = Math.floor(Date.now() / 1000);
                if (msg.body || msg.type) {
                    chat.lastMessage = { body: msg.body || '', type: msg.type || 'chat', timestamp: chat.timestamp };
                }
            }
        }
        // Atualizar lista localmente primeiro, depois buscar do servidor
        if (_atdChats.length) {
            _atdChats.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            atdRenderChats(_atdChats);
        }
        atdLoadChats();
    }
    if (type === 'presence.update' && event.payload) {
        const chatId = event.payload.id || event.payload.chatId || '';
        if (chatId !== _atdCurrentChatId) return;
        const typing = document.getElementById('atdTyping');
        if (event.payload.type === 'composing' || event.payload.type === 'recording') {
            typing.style.display = 'flex';
            document.getElementById('atdTypingText').textContent = event.payload.type === 'recording' ? 'gravando audio...' : 'digitando...';
        } else { typing.style.display = 'none'; }
    }
}

function atdShowNotif(msg, chatId) {
    const name = msg.senderName || msg.chatName || chatId.split('@')[0];
    const text = msg.body || msg.text || '';
    const preview = text ? text.substring(0, 60) : 'Nova mensagem';
    const pic = _atdPicCache[chatId];
    const avatar = pic
        ? `<img src="${pic}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0">`
        : `<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:.85rem"><i class="bi bi-person-fill"></i></div>`;

    const el = document.createElement('div');
    el.className = 'atd-notif-toast';
    el.innerHTML = `<div class="d-flex align-items-start gap-2" style="cursor:pointer" onclick="atdGoToChat('${atdEscape(chatId)}','${atdEscape(name.replace(/'/g, ''))}')">
        ${avatar}
        <div style="min-width:0;flex:1">
            <div class="fw-bold" style="font-size:.85rem">${atdEscape(name)}</div>
            <div style="font-size:.8rem;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${atdEscape(preview)}</div>
        </div>
        <button class="btn-close btn-close-white" style="font-size:.6rem;flex-shrink:0" onclick="event.stopPropagation();this.closest('.atd-notif-toast').remove()"></button>
    </div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 5000);
}

function atdGoToChat(chatId, name) {
    document.querySelectorAll('.atd-notif-toast').forEach(el => el.remove());
    atdSelectChat(chatId, name);
}

// ==================== CHATS LIST ====================

async function atdLoadChats() {
    try {
        if (!_atdChatsLoaded) {
            document.getElementById('atdChatsList').innerHTML = '<div class="atd-contacts-empty"><div class="spinner-border spinner-border-sm text-primary me-2"></div>Carregando...</div>';
        }
        const res = await fetch('/api/whatsapp/chats?limit=50');
        if (!res.ok) return;
        const chats = await res.json();
        if (!Array.isArray(chats)) return;
        _atdChats = chats.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        _atdChatsLoaded = true;
        atdRenderChats(_atdChats);
    } catch {}
}

function atdFilterChats() {
    const q = document.getElementById('atdSearchInput').value.toLowerCase();
    atdRenderChats(!q ? _atdChats : _atdChats.filter(c => (c.name || atdGetChatId(c)).toLowerCase().includes(q)));
}

function atdRenderChats(chats) {
    const container = document.getElementById('atdChatsList');

    // Apply queue filter
    let filtered = chats;
    const searchQ = (document.getElementById('atdSearchInput')?.value || '').toLowerCase();

    if (_atdFiltro === 'fila') {
        filtered = chats.filter(c => c.atendimento && c.atendimento.status === 'fila');
    } else if (_atdFiltro === 'meus') {
        filtered = chats.filter(c => {
            if (c.isGroup) return true;
            return c.atendimento && c.atendimento.agente_id === (_atdUserInfo?.id || 0) && c.atendimento.status === 'em_atendimento';
        });
    } else if (_atdFiltro === 'em_atendimento') {
        filtered = chats.filter(c => c.atendimento && c.atendimento.status === 'em_atendimento');
    }
    // 'todos' shows everything

    if (searchQ) {
        filtered = filtered.filter(c => (c.name || atdGetChatId(c)).toLowerCase().includes(searchQ));
    }

    _atdFilteredChats = filtered;

    // Update badge counts
    const naFila = chats.filter(c => c.atendimento?.status === 'fila').length;
    const meus = chats.filter(c => c.atendimento?.agente_id === (_atdUserInfo?.id || 0) && c.atendimento?.status === 'em_atendimento').length;
    const badgeFila = document.getElementById('atdBadgeFila');
    const badgeMeus = document.getElementById('atdBadgeMeus');
    if (badgeFila) badgeFila.textContent = naFila;
    if (badgeMeus) badgeMeus.textContent = meus;

    if (!filtered.length) {
        const msgs = { fila: 'Nenhum chat na fila', meus: 'Nenhum chat atribuído a você', em_atendimento: 'Nenhum chat em atendimento', todos: 'Nenhuma conversa encontrada' };
        container.innerHTML = `<div class="atd-contacts-empty">${msgs[_atdFiltro] || msgs.todos}</div>`;
        return;
    }

    container.innerHTML = filtered.map((c, i) => {
        const chatId = atdGetChatId(c);
        const name = c.name || chatId.split('@')[0] || '?';
        const lastMsg = c.lastMessage?.body || '';
        const lastType = c.lastMessage?.type || '';
        const typeLabels = { ptt: 'Audio', image: 'Imagem', sticker: 'Sticker', video: 'Video', document: 'Documento' };
        const preview = lastMsg || typeLabels[lastType] || '';
        const unread = c.unreadCount > 0 ? `<span class="atd-contact-badge">${c.unreadCount}</span>` : '';
        const time = c.timestamp ? new Date(c.timestamp * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
        const isActive = chatId === _atdCurrentChatId;
        const cachedPic = _atdPicCache[chatId];
        const avatarContent = cachedPic
            ? `<img src="${cachedPic}" alt="">`
            : `<span>${(name[0] || '?').toUpperCase()}</span>`;

        // Queue status badge
        let statusBadge = '';
        if (c.atendimento) {
            if (c.atendimento.status === 'fila') {
                statusBadge = '<span class="badge bg-warning text-dark" style="font-size:.6rem;padding:1px 4px">Fila</span>';
            } else if (c.atendimento.status === 'em_atendimento') {
                const agName = c.atendimento.agente_id === (_atdUserInfo?.id || 0) ? 'Você' : (c.atendimento.agente_nome || 'Agente');
                statusBadge = `<span class="badge bg-success" style="font-size:.6rem;padding:1px 4px">${atdEscape(agName)}</span>`;
            }
        }

        return `<div class="atd-contact-item ${isActive ? 'active' : ''} ${c.unreadCount > 0 ? 'unread' : ''}" onclick="atdSelectFilteredIdx(${i})">
            <div class="atd-contact-avatar" id="atd-av-${CSS.escape(chatId)}">${avatarContent}</div>
            <div class="atd-contact-body">
                <div class="atd-contact-top">
                    <span class="atd-contact-name">${atdEscape(name)} ${statusBadge}</span>
                    <span class="atd-contact-time">${time}</span>
                </div>
                <div class="atd-contact-bottom">
                    <span class="atd-contact-preview">${atdEscape(preview.substring(0, 40))}</span>
                    ${unread}
                </div>
            </div>
        </div>`;
    }).join('');

    atdLoadPics(filtered);
}

function atdSelectFilteredIdx(i) {
    const c = _atdFilteredChats[i];
    if (c) atdSelectChat(atdGetChatId(c), c.name || atdGetChatId(c).split('@')[0]);
}

async function atdLoadPics(chats) {
    const toLoad = chats.filter(c => _atdPicCache[atdGetChatId(c)] === undefined).slice(0, 15);
    for (const c of toLoad) _atdPicCache[atdGetChatId(c)] = null;
    for (let i = 0; i < toLoad.length; i += 5) {
        await Promise.all(toLoad.slice(i, i + 5).map(async c => {
            const chatId = atdGetChatId(c);
            try {
                const res = await fetch(`/api/whatsapp/profile-pic/${encodeURIComponent(chatId)}`);
                const data = await res.json();
                if (data.profilePictureUrl) {
                    _atdPicCache[chatId] = data.profilePictureUrl;
                    const el = document.getElementById(`atd-av-${CSS.escape(chatId)}`);
                    if (el) el.innerHTML = `<img src="${data.profilePictureUrl}" alt="">`;
                }
            } catch {}
        }));
    }
}

// ==================== SELECT CHAT ====================

function atdSelectChatIdx(i) {
    const c = _atdChats[i];
    if (c) atdSelectChat(atdGetChatId(c), c.name || atdGetChatId(c).split('@')[0]);
}

async function atdSelectChat(chatId, name) {
    const chat = _atdChats.find(c => atdGetChatId(c) === chatId);
    const isGroup = chatId.includes('@g.us');

    // Auto-claim: if agent clicks on a chat in queue, assign it to themselves
    if (!_atdIsAdmin && !isGroup && chat?.atendimento?.status === 'fila') {
        try {
            const res = await atdFetch('/api/whatsapp/atendimentos/atribuir', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId })
            });
            if (res.ok) {
                const data = await res.json();
                if (chat.atendimento) {
                    chat.atendimento.status = 'em_atendimento';
                    chat.atendimento.agente_id = _atdUserInfo?.id;
                    chat.atendimento.agente_nome = _atdUserInfo?.nome;
                }
                mostrarToast('Chat atribuído a você!');
                atdRenderChats(_atdChats);
            } else if (res.status === 409) {
                mostrarToast('Chat já foi atribuído a outro agente', 'error');
                atdLoadChats();
                return;
            }
        } catch (e) { console.error('Erro ao atribuir:', e); }
    }

    // Block non-admin from opening another agent's chat
    if (!_atdIsAdmin && !isGroup && chat?.atendimento?.status === 'em_atendimento' && chat?.atendimento?.agente_id !== (_atdUserInfo?.id || 0)) {
        mostrarToast('Este chat está sendo atendido por outro agente', 'error');
        return;
    }

    _atdCurrentChatId = chatId;
    _atdCurrentChatName = name;
    _atdReplyTo = null;
    document.getElementById('atdReplyPreview').style.display = 'none';

    // Show active chat
    document.getElementById('atdEmptyState').style.display = 'none';
    const ac = document.getElementById('atdActiveChat');
    ac.style.display = 'flex';

    // Mobile: hide contacts
    document.querySelector('.atd-contacts-panel')?.classList.add('atd-mobile-hidden');
    document.querySelector('.atd-messages-panel')?.classList.add('atd-mobile-show');

    // Header
    document.getElementById('atdChatName').textContent = name;
    document.getElementById('atdChatStatus').textContent = '';
    const pic = _atdPicCache[chatId];
    const avatarEl = document.getElementById('atdChatAvatar');
    if (pic) {
        avatarEl.innerHTML = `<img src="${pic}" alt="">`;
    } else {
        avatarEl.innerHTML = `<span>${(name[0] || '?').toUpperCase()}</span>`;
    }

    // Action buttons (Assumir / Transferir / Finalizar)
    const actionsDiv = document.getElementById('atdChatActions');
    if (actionsDiv && !isGroup && chat?.atendimento) {
        let btns = '';
        const atdStatus = chat.atendimento.status;
        const isMine = chat.atendimento.agente_id === (_atdUserInfo?.id || 0);

        if (atdStatus === 'fila') {
            // Chat na fila: mostrar Assumir + Transferir (atribuir a outro) + Finalizar
            btns += `<button class="btn btn-sm btn-success" onclick="atdAssumirChat('${atdEscape(chatId)}')" title="Assumir atendimento">
                <i class="bi bi-person-check me-1"></i>Assumir
            </button>`;
            btns += `<button class="btn btn-sm btn-outline-primary" onclick="atdTransferirChat('${atdEscape(chatId)}')" title="Atribuir a outro agente">
                <i class="bi bi-arrow-left-right"></i>
            </button>`;
            btns += `<button class="btn btn-sm btn-outline-danger" onclick="atdFinalizarChat('${atdEscape(chatId)}')" title="Finalizar">
                <i class="bi bi-check-circle"></i>
            </button>`;
        } else if (atdStatus === 'em_atendimento' && (isMine || _atdIsAdmin)) {
            // Chat em atendimento (meu ou admin): Transferir + Finalizar
            btns += `<button class="btn btn-sm btn-outline-primary" onclick="atdTransferirChat('${atdEscape(chatId)}')" title="Transferir">
                <i class="bi bi-arrow-left-right"></i>
            </button>`;
            btns += `<button class="btn btn-sm btn-outline-danger" onclick="atdFinalizarChat('${atdEscape(chatId)}')" title="Finalizar atendimento">
                <i class="bi bi-check-circle"></i>
            </button>`;
        }
        actionsDiv.innerHTML = btns;
    } else if (actionsDiv) {
        actionsDiv.innerHTML = '';
    }

    // Highlight in list
    document.querySelectorAll('.atd-contact-item').forEach(el => el.classList.remove('active'));

    // Mark as read
    if (chat && chat.unreadCount > 0) {
        chat.unreadCount = 0;
        atdRenderChats(_atdChats);
    }
    atdFetch('/api/whatsapp/seen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId }) }).catch(() => {});

    // Load messages + polling fallback
    _atdLastMsgCount = 0;
    await atdLoadMessages(true);
    if (_atdMsgPollInterval) clearInterval(_atdMsgPollInterval);
    _atdMsgPollInterval = setInterval(atdLoadMessages, 3000);

    document.getElementById('atdMessageInput').focus();
}

function atdVoltarLista() {
    document.querySelector('.atd-contacts-panel')?.classList.remove('atd-mobile-hidden');
    document.querySelector('.atd-messages-panel')?.classList.remove('atd-mobile-show');
}

async function atdLoadMessages(showSpinner) {
    if (!_atdCurrentChatId) return;
    const body = document.getElementById('atdMessagesBody');
    if (showSpinner || !body.children.length || body.querySelector('.spinner-border')) {
        body.innerHTML = '<div class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm"></div></div>';
    }

    try {
        const res = await fetch(`/api/whatsapp/messages/${encodeURIComponent(_atdCurrentChatId)}?limit=50`);
        if (!res.ok) return;
        const messages = await res.json();
        const arr = Array.isArray(messages) ? messages : [];
        // So re-renderizar se a qtd de mensagens mudou (evita flicker)
        if (arr.length !== _atdLastMsgCount) {
            _atdLastMsgCount = arr.length;
            atdRenderMessages(arr);
        }
    } catch {}
}

// ==================== RENDER MESSAGES ====================

function atdRenderMessages(messages) {
    const body = document.getElementById('atdMessagesBody');
    if (!messages.length) {
        body.innerHTML = '<div class="text-center text-muted py-5"><i class="bi bi-chat-square-text" style="font-size:2.5rem;opacity:.3"></i><br><small>Envie uma mensagem para iniciar</small></div>';
        _atdLastMsgCount = 0;
        return;
    }
    const wasBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 100;
    const sorted = [...messages].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    body.innerHTML = sorted.map(m => atdRenderBubble(m)).filter(Boolean).join('');
    if (wasBottom || _atdLastMsgCount !== sorted.length) body.scrollTop = body.scrollHeight;
    _atdLastMsgCount = sorted.length;
}

function atdRenderBubble(m) {
    const fromMe = m.fromMe || false;
    const text = m.body || m.text || '';
    const type = m.type || '';
    const msgId = atdGetMsgId(m);
    const mediaUrl = m._mediaUrl || '';
    let content = atdEscape(text);
    let mediaHtml = '';

    if (m.hasMedia || ['image', 'video', 'ptt', 'audio', 'sticker', 'document'].includes(type)) {
        const mediaParam = mediaUrl ? `,'${atdEscape(mediaUrl)}'` : '';
        if (type === 'image' || type === 'sticker') {
            if (mediaUrl) mediaHtml = `<div class="atd-media"><img src="${mediaUrl}" onclick="atdOpenMedia('${msgId}','image'${mediaParam})" onerror="this.outerHTML='<div class=\\'atd-media-placeholder\\' onclick=\\'atdOpenMedia(&quot;${msgId}&quot;,&quot;image&quot;${mediaParam})\\'><i class=\\'bi bi-image fs-3\\'></i></div>'"></div>`;
            else mediaHtml = `<div class="atd-media-placeholder" onclick="atdOpenMedia('${msgId}','image')"><i class="bi bi-image fs-3"></i></div>`;
        } else if (type === 'video') {
            mediaHtml = `<div class="atd-media-placeholder" onclick="atdOpenMedia('${msgId}','video'${mediaParam})"><i class="bi bi-play-circle fs-3"></i><br><small>Video</small></div>`;
        } else if (type === 'ptt' || type === 'audio') {
            mediaHtml = `<div class="atd-media-audio"><i class="bi bi-mic-fill me-1"></i>Audio ${m.duration ? '(' + m.duration + 's)' : ''}</div>`;
        } else if (type === 'document') {
            mediaHtml = `<div class="atd-media-placeholder" onclick="atdOpenMedia('${msgId}','document'${mediaParam})"><i class="bi bi-file-earmark fs-3"></i><br><small>${atdEscape(m.filename || 'Documento')}</small></div>`;
        }
        if (!content) {
            const labels = { ptt: 'Audio', audio: 'Audio', image: 'Imagem', sticker: 'Sticker', video: 'Video', document: 'Documento' };
            content = labels[type] || '';
        }
    }
    if (!content && !mediaHtml) return '';

    const time = m.timestamp ? new Date(m.timestamp * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
    const sender = !fromMe && m.senderName ? `<div class="atd-bubble-sender">${atdEscape(m.senderName)}</div>` : '';
    let quotedHtml = '';
    if (m.hasQuotedMsg && m.quotedMsg) {
        quotedHtml = `<div class="atd-bubble-quoted"><small class="fw-bold">${atdEscape(m.quotedMsg.participant || '')}</small><br>${atdEscape((m.quotedMsg.body || '').substring(0, 60))}</div>`;
    }

    const nameSafe = (m.senderName || (fromMe ? 'Voce' : '')).replace(/'/g, '').replace(/"/g, '');
    const textSafe = (text || '').substring(0, 60).replace(/'/g, '').replace(/"/g, '');

    return `<div class="atd-bubble ${fromMe ? 'atd-bubble-sent' : 'atd-bubble-received'}" data-msg-id="${msgId}">
        ${sender}${quotedHtml}${mediaHtml}${content ? `<div class="atd-bubble-text">${content}</div>` : ''}
        <div class="atd-bubble-footer">
            <span class="atd-bubble-time">${time}</span>
            <button class="atd-reply-btn" onclick="atdSetReply('${msgId}','${atdEscape(nameSafe)}','${atdEscape(textSafe)}')" title="Responder"><i class="bi bi-reply"></i></button>
        </div>
    </div>`;
}

function atdAppendMessage(msg) {
    const body = document.getElementById('atdMessagesBody');
    const html = atdRenderBubble(msg);
    if (html) {
        body.innerHTML += html;
        body.scrollTop = body.scrollHeight;
    }
}

// ==================== REPLY ====================

function atdSetReply(msgId, name, text) {
    _atdReplyTo = msgId;
    document.getElementById('atdReplyPreview').style.display = 'flex';
    document.getElementById('atdReplyName').textContent = name || 'Mensagem';
    document.getElementById('atdReplyText').textContent = text;
    document.getElementById('atdMessageInput').focus();
}

function atdCancelReply() {
    _atdReplyTo = null;
    document.getElementById('atdReplyPreview').style.display = 'none';
}

// ==================== SEND ====================

async function atdSendMessage() {
    const input = document.getElementById('atdMessageInput');
    const text = input.value.trim();
    if (!text || !_atdCurrentChatId) return;

    const btn = document.getElementById('atdBtnSend');
    btn.disabled = true;
    input.value = '';

    atdFetch('/api/whatsapp/typing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId: _atdCurrentChatId }) }).catch(() => {});

    try {
        const payload = { chatId: _atdCurrentChatId, text };
        if (_atdReplyTo) payload.quotedMessageId = _atdReplyTo;
        const res = await atdFetch('/api/whatsapp/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        atdCancelReply();

        // Append local message
        const localMsg = {
            id: data.messageId || ('local_' + Date.now()),
            body: text,
            fromMe: true,
            timestamp: Math.floor(Date.now() / 1000),
            type: 'chat'
        };
        atdAppendMessage(localMsg);
        atdLoadChats();
    } catch {
        mostrarToast('Erro ao enviar mensagem', 'error');
    }
    btn.disabled = false;
    input.focus();
}

async function atdSendFile(input) {
    if (!input.files.length || !_atdCurrentChatId) return;
    const fd = new FormData();
    fd.append('chatId', _atdCurrentChatId);
    fd.append('file', input.files[0]);
    fd.append('caption', '');
    try {
        mostrarToast('Enviando arquivo...', 'info');
        await atdFetch('/api/whatsapp/send-file', { method: 'POST', body: fd });
        mostrarToast('Arquivo enviado!');
        setTimeout(atdLoadMessages, 1000);
    } catch { mostrarToast('Erro ao enviar arquivo', 'error'); }
    input.value = '';
}

// ==================== MEDIA ====================

async function atdOpenMedia(msgId, mediaType, directUrl) {
    const url = directUrl
        ? `/api/whatsapp/media/${encodeURIComponent(msgId)}?url=${encodeURIComponent(directUrl)}`
        : `/api/whatsapp/media/${encodeURIComponent(msgId)}`;

    if (mediaType === 'document') { window.open(directUrl || url, '_blank'); return; }

    const modal = new bootstrap.Modal(document.getElementById('atdModalMedia'));
    const img = document.getElementById('atdMediaImg');
    const video = document.getElementById('atdMediaVideo');
    const loading = document.getElementById('atdMediaLoading');
    const download = document.getElementById('atdMediaDownload');

    img.style.display = 'none'; video.style.display = 'none'; loading.style.display = 'block';
    img.src = ''; video.src = '';
    download.href = url;
    modal.show();

    try {
        const res = await fetch(directUrl ? url : url);
        if (!res.ok) throw new Error();
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        loading.style.display = 'none';
        if (blob.type.startsWith('video/')) { video.src = objectUrl; video.style.display = 'block'; }
        else { img.src = objectUrl; img.style.display = 'block'; }
        download.href = objectUrl;
    } catch {
        loading.innerHTML = '<p class="text-danger"><i class="bi bi-exclamation-triangle fs-3"></i><br>Erro ao carregar</p>';
    }
}

// ==================== SEARCH ====================

function atdToggleSearch() {
    const bar = document.getElementById('atdChatSearchBar');
    bar.style.display = bar.style.display === 'none' ? 'flex' : 'none';
    if (bar.style.display === 'flex') document.getElementById('atdChatSearchInput').focus();
}

function atdSearchInChat() {
    const q = document.getElementById('atdChatSearchInput').value.toLowerCase();
    if (!q) return;
    const bubbles = document.querySelectorAll('.atd-bubble');
    let found = false;
    bubbles.forEach(b => {
        const text = b.textContent.toLowerCase();
        if (text.includes(q) && !found) {
            b.scrollIntoView({ behavior: 'smooth', block: 'center' });
            b.style.outline = '2px solid #667eea';
            setTimeout(() => b.style.outline = '', 2000);
            found = true;
        }
    });
    if (!found) mostrarToast('Nenhuma mensagem encontrada', 'info');
}

// ==================== QUEUE: ASSUME, TRANSFER & FINALIZE ====================

async function atdAssumirChat(chatId) {
    try {
        const res = await atdFetch('/api/whatsapp/atendimentos/atribuir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId })
        });
        if (res.ok) {
            mostrarToast('Chat atribuído a você!');
            const chat = _atdChats.find(c => atdGetChatId(c) === chatId);
            if (chat?.atendimento) {
                chat.atendimento.status = 'em_atendimento';
                chat.atendimento.agente_id = _atdUserInfo?.id;
                chat.atendimento.agente_nome = _atdUserInfo?.nome;
            }
            atdRenderChats(_atdChats);
            // Re-render action buttons
            if (_atdCurrentChatId === chatId) {
                atdSelectChat(chatId, _atdCurrentChatName);
            }
        } else if (res.status === 409) {
            mostrarToast('Chat já foi atribuído a outro agente', 'error');
            atdLoadChats();
        } else {
            const data = await res.json();
            mostrarToast(data.erro || 'Erro ao assumir', 'error');
        }
    } catch { mostrarToast('Erro ao assumir chat', 'error'); }
}

async function atdTransferirChat(chatId) {
    _atdTransferChatId = chatId;
    const select = document.getElementById('atdTransferAgente');
    select.innerHTML = '<option value="">Carregando...</option>';
    document.getElementById('atdTransferNota').value = '';
    const modal = new bootstrap.Modal(document.getElementById('atdModalTransferir'));
    modal.show();

    try {
        const res = await fetch('/api/whatsapp/atendimentos/agentes');
        const agentes = await res.json();
        const myId = _atdUserInfo?.id || 0;
        const options = agentes.filter(a => a.id !== myId).map(a => `<option value="${a.id}">${atdEscape(a.nome)} (${a.perfil})</option>`).join('');
        select.innerHTML = options || '<option value="">Nenhum agente disponível</option>';
    } catch {
        select.innerHTML = '<option value="">Erro ao carregar</option>';
    }
}

async function atdConfirmarTransferencia() {
    const agenteId = document.getElementById('atdTransferAgente').value;
    if (!agenteId || !_atdTransferChatId) {
        mostrarToast('Selecione um agente', 'error');
        return;
    }
    try {
        const res = await atdFetch('/api/whatsapp/atendimentos/transferir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: _atdTransferChatId,
                para_agente_id: parseInt(agenteId),
                notas: document.getElementById('atdTransferNota').value
            })
        });
        if (res.ok) {
            mostrarToast('Chat transferido com sucesso!');
            bootstrap.Modal.getInstance(document.getElementById('atdModalTransferir'))?.hide();
            // Close current chat if it was transferred
            if (_atdCurrentChatId === _atdTransferChatId) {
                _atdCurrentChatId = null;
                document.getElementById('atdActiveChat').style.display = 'none';
                document.getElementById('atdEmptyState').style.display = 'flex';
                document.getElementById('atdChatActions').innerHTML = '';
            }
            atdLoadChats();
        } else {
            const data = await res.json();
            mostrarToast(data.erro || 'Erro ao transferir', 'error');
        }
    } catch { mostrarToast('Erro ao transferir', 'error'); }
}

async function atdFinalizarChat(chatId) {
    if (!confirm('Finalizar este atendimento?')) return;
    try {
        const res = await atdFetch('/api/whatsapp/atendimentos/finalizar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId })
        });
        if (res.ok) {
            mostrarToast('Atendimento finalizado!');
            if (_atdCurrentChatId === chatId) {
                _atdCurrentChatId = null;
                document.getElementById('atdActiveChat').style.display = 'none';
                document.getElementById('atdEmptyState').style.display = 'flex';
                document.getElementById('atdChatActions').innerHTML = '';
            }
            atdLoadChats();
        } else {
            const data = await res.json();
            mostrarToast(data.erro || 'Erro ao finalizar', 'error');
        }
    } catch { mostrarToast('Erro ao finalizar', 'error'); }
}
