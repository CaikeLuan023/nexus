// ==================== WHATSAPP (WAHA) - COMPLETO ====================

let allChats = [];
let currentChatId = null;
let currentChatName = null;
let statusInterval = null;
let messagesInterval = null;
let chatsLoaded = false;
let replyToMessage = null;
let currentReactionMsgId = null;
let eventSource = null;
let lastMessageCount = 0;
let messagesOffset = 0;
let allTemplates = [];
let profilePicCache = {};
let atendimentoFiltro = 'todos';
let _currentUserInfo = null;
let _isAdmin = false;

document.addEventListener('DOMContentLoaded', () => {
    checkStatus();
    statusInterval = setInterval(checkStatus, 10000);
    connectSSE();
    carregarTemplates();
    carregarAutoRespostas();
    carregarNotificacoes();
    carregarAgendamentos();
    carregarVinculos();
    carregarMetricas();
    updateUnreadBadge();
    setInterval(updateUnreadBadge, 30000);
    checkHashChat();
    // Inicializar fila de atendimento
    const waitUser = setInterval(() => {
        if (window._currentUser) {
            clearInterval(waitUser);
            _currentUserInfo = window._currentUser;
            _isAdmin = _currentUserInfo.perfil === 'admin';
            initQueueUI();
        }
    }, 200);
});

function checkHashChat() {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#chat=')) {
        const chatId = decodeURIComponent(hash.substring(6));
        if (chatId) {
            // Wait for chats to load, then auto-select
            const waitForChats = setInterval(() => {
                if (chatsLoaded && allChats.length) {
                    clearInterval(waitForChats);
                    const chat = allChats.find(c => getChatId(c) === chatId);
                    const name = chat ? (chat.name || getChatId(chat).split('@')[0]) : chatId.split('@')[0];
                    selectChat(chatId, name);
                    window.location.hash = '';
                }
            }, 500);
            // Timeout after 30s
            setTimeout(() => clearInterval(waitForChats), 30000);
        }
    }
}

// ==================== HELPERS ====================

function getChatId(chat) {
    if (chat.id && typeof chat.id === 'object') return chat.id._serialized;
    return chat.id || String(chat.id);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function getMsgId(msg) {
    return msg.id || msg.messageId || '';
}

// ==================== SSE: REAL-TIME ====================

function connectSSE() {
    if (eventSource) eventSource.close();
    eventSource = new EventSource('/api/whatsapp/events');
    eventSource.onmessage = (e) => {
        try { handleSSEEvent(JSON.parse(e.data)); } catch {}
    };
    eventSource.onerror = () => { setTimeout(connectSSE, 2000); };
}

function handleSSEEvent(event) {
    const type = event.event || event.type;
    // Ignorar callbacks de status de mensagem (entrega/leitura)
    if (type === 'message.status') return;
    if (type === 'message' && event.payload) {
        const msg = event.payload;
        // Ignorar mensagens sem conteudo (callbacks vazios)
        if (!msg.body && !msg.type || msg.type === 'chat' && !msg.body) {
            loadChats();
            return;
        }
        const chatId = typeof msg.from === 'object' ? msg.from._serialized : (msg.from || '');
        const toChatId = typeof msg.to === 'object' ? msg.to._serialized : (msg.to || msg.from || '');
        const relevantChat = msg.fromMe ? toChatId : chatId;

        // Filtrar por atendimento: nao-admin so ve msgs dos seus chats ou fila
        if (!_isAdmin && msg._atendimento && !relevantChat.includes('@g.us')) {
            const atend = msg._atendimento;
            if (atend.status === 'em_atendimento' && atend.agente_id !== _currentUserInfo?.id) {
                return; // Mensagem de chat atribuido a outro agente
            }
        }

        if (relevantChat === currentChatId && !msg.fromMe) {
            appendMessage(msg);
            _lastMsgIds = '';
            fetch('/api/whatsapp/seen', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({chatId:currentChatId}) }).catch(()=>{});
        }
        if (!msg.fromMe && relevantChat !== currentChatId) {
            playNotifSound();
            showMessageNotification(msg, relevantChat);
        }
        loadChats();
        updateUnreadBadge();
    }
    // Eventos de fila de atendimento
    if (type === 'atendimento.novo' || type === 'atendimento.atribuido' || type === 'atendimento.transferido' || type === 'atendimento.finalizado') {
        loadChats();
        // Se meu chat foi transferido para outro, fechar
        if (type === 'atendimento.transferido' && event.payload?.chat_id === currentChatId) {
            if (!_isAdmin && event.payload.agente_id !== _currentUserInfo?.id) {
                mostrarToast('Este chat foi transferido para ' + (event.payload.agente_nome || 'outro agente'), 'warning');
                currentChatId = null;
                document.getElementById('noChat').style.display = '';
                document.getElementById('activeChatContainer').style.display = 'none';
            }
        }
        // Notificar novo na fila
        if (type === 'atendimento.novo') playNotifSound();
    }
    if (type === 'presence.update' && event.payload) handlePresence(event.payload);
}

function showMessageNotification(msg, chatId) {
    const senderName = msg.senderName || msg.chatName || chatId;
    const text = msg.body || msg.text || '';
    const typeLabel = { ptt:'🎤 Audio', audio:'🎤 Audio', image:'📷 Imagem', sticker:'🏷️ Sticker', video:'🎥 Video', document:'📄 Documento' };
    const preview = text ? text.substring(0, 80) : (typeLabel[msg.type] || 'Nova mensagem');
    const pic = profilePicCache[chatId];
    const avatarHtml = pic
        ? `<img src="${pic}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0">`
        : `<div style="width:36px;height:36px;border-radius:50%;background:#25d366;color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:0.85rem"><i class="bi bi-person-fill"></i></div>`;

    const notif = document.createElement('div');
    notif.className = 'whatsapp-notif-toast';
    notif.innerHTML = `<div class="d-flex align-items-start gap-2" style="cursor:pointer" onclick="notifGoToChat('${escapeHtml(chatId)}','${escapeHtml(senderName.replace(/'/g,''))}')">
        ${avatarHtml}
        <div style="min-width:0;flex:1">
            <div class="fw-bold" style="font-size:0.85rem">${escapeHtml(senderName)}</div>
            <div style="font-size:0.8rem;opacity:0.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(preview)}</div>
        </div>
        <button class="btn-close btn-close-white" style="font-size:0.6rem;flex-shrink:0;margin-top:2px" onclick="event.stopPropagation();this.closest('.whatsapp-notif-toast').remove()"></button>
    </div>`;
    document.body.appendChild(notif);
    // Animate in
    requestAnimationFrame(() => notif.classList.add('show'));
    // Auto remove after 6s
    setTimeout(() => {
        notif.classList.remove('show');
        setTimeout(() => notif.remove(), 300);
    }, 6000);
}

function notifGoToChat(chatId, name) {
    // Remove all notifications
    document.querySelectorAll('.whatsapp-notif-toast').forEach(el => el.remove());
    // Navigate to chat tab if not active
    const chatTab = document.querySelector('#whatsappTabs .nav-link[data-bs-target="#tabChat"]');
    if (chatTab) chatTab.click();
    selectChat(chatId, name);
}

function playNotifSound() {
    if (typeof playGlobalNotifSound === 'function') return playGlobalNotifSound();
    try { const a = document.getElementById('notifSound'); if (a) { a.currentTime = 0; a.play().catch(() => {}); } } catch {}
}

function handlePresence(data) {
    const chatId = data.id || data.chatId || '';
    if (chatId !== currentChatId) return;
    const ind = document.getElementById('typingIndicator');
    if (data.type === 'composing' || data.type === 'recording') {
        ind.style.display = 'flex';
        document.getElementById('typingName').textContent = data.type === 'recording' ? 'gravando audio...' : 'digitando...';
    } else { ind.style.display = 'none'; }
}

// ==================== STATUS ====================

async function checkStatus() {
    try {
        const res = await fetch('/api/whatsapp/status');
        const data = await res.json();
        updateStatusUI(data);
    } catch { updateStatusUI({ status: 'STOPPED' }); }
}

function updateStatusUI(data) {
    const bar = document.getElementById('statusBar');
    const text = document.getElementById('statusText');
    const qrPanel = document.getElementById('qrPanel');
    const chatPanel = document.getElementById('chatPanel');
    const btnStart = document.getElementById('btnStart');
    const btnStop = document.getElementById('btnStop');
    let status = (data.status || 'STOPPED').toUpperCase();
    if (data.connected === true) status = 'WORKING';
    bar.className = 'whatsapp-status-bar';

    if (status === 'WORKING' || status === 'CONNECTED') {
        bar.classList.add('connected'); text.textContent = 'Conectado ao WhatsApp';
        qrPanel.style.display = 'none'; chatPanel.style.display = 'flex';
        btnStart.style.display = 'none'; btnStop.style.display = '';
        if (!chatsLoaded) loadChats();
        loadMassContacts();
    } else if (status === 'SCAN_QR_CODE' || status === 'STARTING') {
        bar.classList.add('connecting');
        text.textContent = status === 'SCAN_QR_CODE' ? 'Aguardando leitura do QR Code...' : 'Iniciando sessao...';
        qrPanel.style.display = ''; chatPanel.style.display = 'none';
        btnStart.style.display = 'none'; btnStop.style.display = '';
        if (status === 'SCAN_QR_CODE') refreshQR();
        chatsLoaded = false;
    } else {
        bar.classList.add('disconnected'); text.textContent = 'Desconectado';
        qrPanel.style.display = 'none'; chatPanel.style.display = 'none';
        btnStart.style.display = ''; btnStop.style.display = 'none';
        clearChatState();
    }
}

function clearChatState() {
    allChats = []; currentChatId = null; currentChatName = null; chatsLoaded = false; replyToMessage = null; messagesOffset = 0;
    if (messagesInterval) { clearInterval(messagesInterval); messagesInterval = null; }
}

// ==================== SESSION ====================

async function startSession() {
    const btn = document.getElementById('btnStart');
    btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Iniciando...';
    try { await fetch('/api/whatsapp/start', { method: 'POST' }); setTimeout(checkStatus, 2000); }
    catch { mostrarToast('Erro ao iniciar sessao', 'error'); }
    btn.disabled = false; btn.innerHTML = '<i class="bi bi-play-circle me-1"></i> Iniciar Sessao';
}

async function stopSession() {
    if (!confirm('Desconectar do WhatsApp?')) return;
    try { await fetch('/api/whatsapp/stop', { method: 'POST' }); clearChatState(); checkStatus(); mostrarToast('Sessao encerrada'); }
    catch { mostrarToast('Erro ao parar sessao', 'error'); }
}

async function refreshQR() {
    const container = document.getElementById('qrContainer');
    container.innerHTML = '<div class="spinner-border text-success"></div>';
    try {
        const res = await fetch('/api/whatsapp/qr');
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('image')) {
            // WAHA retorna imagem direto
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            container.innerHTML = `<img src="${url}" alt="QR Code" style="max-width:280px;border-radius:12px;border:2px solid #e9ecef">`;
        } else {
            const data = await res.json();
            if (data.value) {
                const src = data.value.startsWith('data:') ? data.value : `data:image/png;base64,${data.value}`;
                container.innerHTML = `<img src="${src}" alt="QR Code" style="max-width:280px;border-radius:12px;border:2px solid #e9ecef">`;
            } else {
                container.innerHTML = '<p class="text-muted">QR nao disponivel. Clique em Iniciar Sessao.</p>';
            }
        }
    } catch { container.innerHTML = '<p class="text-danger">Erro ao carregar QR Code.</p>'; }
}

// ==================== CHATS ====================

async function loadChats() {
    const container = document.getElementById('chatsList');
    try {
        if (!chatsLoaded) container.innerHTML = '<div class="text-center text-muted py-3"><div class="spinner-border spinner-border-sm me-1"></div> Carregando conversas...</div>';
        const res = await fetch('/api/whatsapp/chats?limit=50');
        if (!res.ok) {
            if (!chatsLoaded) container.innerHTML = '<div class="text-center text-muted py-3"><i class="bi bi-exclamation-triangle text-warning me-1"></i>Timeout. <a href="#" onclick="loadChats();return false">Tentar novamente</a></div>';
            return;
        }
        const chats = await res.json();
        if (!Array.isArray(chats)) return;
        allChats = chats.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        chatsLoaded = true;
        renderChats(allChats);
    } catch {
        if (!chatsLoaded) container.innerHTML = '<div class="text-center text-muted py-3"><i class="bi bi-exclamation-triangle text-warning me-1"></i>Erro. <a href="#" onclick="loadChats();return false">Tentar novamente</a></div>';
    }
}

function filterChats() {
    const q = document.getElementById('searchChats').value.toLowerCase();
    renderChats(!q ? allChats : allChats.filter(c => (c.name || getChatId(c)).toLowerCase().includes(q)));
}

function renderChats(chats) {
    const container = document.getElementById('chatsList');

    // Aplicar filtro de atendimento
    let filtered = chats;
    if (atendimentoFiltro === 'fila') {
        filtered = chats.filter(c => c.atendimento && c.atendimento.status === 'fila');
    } else if (atendimentoFiltro === 'meus') {
        filtered = chats.filter(c => c.atendimento && c.atendimento.status === 'em_atendimento' && c.atendimento.agente_id === _currentUserInfo?.id);
    } else if (atendimentoFiltro === 'em_atendimento') {
        filtered = chats.filter(c => c.atendimento && c.atendimento.status === 'em_atendimento');
    }
    // 'todos' = sem filtro

    // Atualizar badges de contagem
    const filaCount = chats.filter(c => c.atendimento && c.atendimento.status === 'fila').length;
    const meusCount = chats.filter(c => c.atendimento && c.atendimento.status === 'em_atendimento' && c.atendimento.agente_id === _currentUserInfo?.id).length;
    const badgeFila = document.getElementById('badgeFila');
    const badgeMeus = document.getElementById('badgeMeus');
    if (badgeFila) badgeFila.textContent = filaCount;
    if (badgeMeus) badgeMeus.textContent = meusCount;

    if (!filtered.length) { container.innerHTML = '<div class="text-center text-muted py-4">Nenhuma conversa</div>'; return; }

    // Guardar referencia filtrada para selectChatByIndex
    window._filteredChats = filtered;

    container.innerHTML = filtered.map((c, i) => {
        const chatId = getChatId(c), name = c.name || chatId || '?';
        const lastMsg = c.lastMessage?.body || '';
        const lastType = c.lastMessage?.type || '';
        const preview = lastMsg || ({ ptt:'🎤 Audio', image:'📷 Imagem', sticker:'🏷️ Sticker', video:'🎥 Video', document:'📄 Doc' }[lastType] || '');
        const isGroup = c.isGroup || false;
        const unread = c.unreadCount > 0 ? `<span class="badge bg-success rounded-pill ms-1" style="font-size:0.7rem">${c.unreadCount}</span>` : '';
        const avatarStyle = isGroup ? 'background:linear-gradient(135deg,#128c7e,#25d366);color:#fff' : '';
        const lastTime = c.timestamp ? new Date(c.timestamp*1000).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '';
        const cachedPic = profilePicCache[chatId];
        const avatarContent = cachedPic
            ? `<img src="${cachedPic}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`
            : `<i class="bi ${isGroup?'bi-people-fill':'bi-person-fill'}"></i>`;

        // Badge de status do atendimento
        let statusBadge = '';
        if (c.atendimento && !isGroup) {
            if (c.atendimento.status === 'fila') {
                statusBadge = '<span class="badge bg-warning text-dark ms-1" style="font-size:0.6rem">Fila</span>';
            } else if (c.atendimento.status === 'em_atendimento') {
                const label = c.atendimento.agente_id === _currentUserInfo?.id ? 'Voce' : (c.atendimento.agente_nome || '');
                statusBadge = `<span class="badge bg-primary ms-1" style="font-size:0.6rem">${escapeHtml(label)}</span>`;
            }
        }

        return `<div class="whatsapp-contact-item ${chatId===currentChatId?'active':''}" data-chat-id="${escapeHtml(chatId)}" onclick="selectFilteredChat(${i})">
            <div class="whatsapp-contact-avatar" id="avatar-${CSS.escape(chatId)}" ${avatarStyle&&!cachedPic?`style="${avatarStyle}"`:''}>${avatarContent}</div>
            <div class="whatsapp-contact-info">
                <div class="d-flex justify-content-between align-items-center">
                    <div class="whatsapp-contact-name">${escapeHtml(name)}${statusBadge}</div>
                    <small class="text-muted flex-shrink-0 ms-1" style="font-size:0.7rem">${lastTime}</small>
                </div>
                <div class="d-flex justify-content-between align-items-center">
                    <div class="whatsapp-contact-last-msg">${escapeHtml(preview.substring(0,45))}</div>
                    ${unread}
                </div>
            </div>
        </div>`;
    }).join('');
    loadProfilePictures(filtered);
}

async function loadProfilePictures(chats) {
    // Carregar fotos de perfil do WAHA em paralelo (batch de 5)
    const toLoad = chats.filter(c => profilePicCache[getChatId(c)] === undefined).slice(0, 20);
    for (const c of toLoad) profilePicCache[getChatId(c)] = null; // marcar como carregando
    const batch = 5;
    for (let i = 0; i < toLoad.length; i += batch) {
        await Promise.all(toLoad.slice(i, i + batch).map(async c => {
            const chatId = getChatId(c);
            try {
                const res = await fetch(`/api/whatsapp/profile-pic/${encodeURIComponent(chatId)}`);
                const data = await res.json();
                if (data.profilePictureUrl) {
                    profilePicCache[chatId] = data.profilePictureUrl;
                    const avatarEl = document.getElementById(`avatar-${CSS.escape(chatId)}`);
                    if (avatarEl) {
                        avatarEl.style.background = 'none';
                        avatarEl.innerHTML = `<img src="${data.profilePictureUrl}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
                    }
                }
            } catch {}
        }));
    }
}

function selectChatByIndex(i) { const c = allChats[i]; if(c) selectChat(getChatId(c), c.name || getChatId(c)); }
function selectFilteredChat(i) { const c = (window._filteredChats || allChats)[i]; if(c) selectChat(getChatId(c), c.name || getChatId(c)); }

function markChatAsRead(chatId) {
    // Atualizar estado local imediatamente
    const chat = allChats.find(c => getChatId(c) === chatId);
    if (chat && chat.unreadCount > 0) {
        chat.unreadCount = 0;
        // Re-render contacts list para remover badge
        renderChats(allChats);
        updateUnreadBadge();
    }
    // Enviar para o servidor (WAHA)
    fetch('/api/whatsapp/seen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId })
    }).catch(() => {});
}

async function selectChat(chatId, name) {
    const chatData = allChats.find(c => getChatId(c) === chatId);
    const isGroup = chatData?.isGroup || false;

    // Auto-claim: se agente clica em chat da fila, atribui para si
    if (!isGroup && chatData?.atendimento?.status === 'fila' && !_isAdmin) {
        try {
            const res = await fetch('/api/whatsapp/atendimentos/atribuir', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId })
            });
            if (!res.ok) {
                const err = await res.json();
                mostrarToast(err.erro || 'Erro ao atribuir chat', 'error');
                return;
            }
            chatData.atendimento.status = 'em_atendimento';
            chatData.atendimento.agente_id = _currentUserInfo.id;
            chatData.atendimento.agente_nome = _currentUserInfo.nome;
            renderChats(allChats);
            mostrarToast('Chat atribuido a voce', 'success');
        } catch { mostrarToast('Erro ao atribuir chat', 'error'); return; }
    }

    // Nao-admin nao pode abrir chat de outro agente
    if (!isGroup && !_isAdmin && chatData?.atendimento?.status === 'em_atendimento' && chatData?.atendimento?.agente_id !== _currentUserInfo?.id) {
        mostrarToast('Esta conversa esta sendo atendida por outro agente', 'warning');
        return;
    }

    currentChatId = chatId; currentChatName = name; cancelReply(); messagesOffset = 0; _lastMsgIds = ''; _localPendingMsgs = [];
    document.getElementById('noChat').style.display = 'none';
    const ac = document.getElementById('activeChatContainer');
    ac.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0';
    const headerAvatarStyle = isGroup ? 'background:linear-gradient(135deg,#128c7e,#25d366);color:#fff' : '';
    const headerPic = profilePicCache[chatId];
    const headerAvatarContent = headerPic
        ? `<img src="${headerPic}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`
        : `<i class="bi ${isGroup?'bi-people-fill':'bi-person-fill'}"></i>`;
    document.getElementById('chatHeaderInfo').innerHTML = `<div class="d-flex align-items-center gap-2"><div class="whatsapp-contact-avatar" style="width:36px;height:36px;font-size:0.8rem;${headerAvatarStyle&&!headerPic?headerAvatarStyle:''}">${headerAvatarContent}</div><div><div class="fw-medium" style="font-size:0.95rem">${escapeHtml(name)}</div><small class="text-muted" style="font-size:0.75rem">${isGroup?'Grupo':'Online'}</small></div></div>`;

    // Botoes de acao do atendimento
    const headerActions = document.getElementById('chatHeaderActions');
    if (headerActions) {
        let actionsHtml = '';
        const atend = chatData?.atendimento;
        if (atend && !isGroup) {
            if (atend.status === 'em_atendimento' && (atend.agente_id === _currentUserInfo?.id || _isAdmin)) {
                actionsHtml += `<button class="btn btn-outline-warning btn-sm" onclick="transferirChat('${escapeHtml(chatId)}')" title="Transferir"><i class="bi bi-arrow-left-right"></i></button>`;
                actionsHtml += `<button class="btn btn-outline-danger btn-sm" onclick="finalizarChat('${escapeHtml(chatId)}')" title="Finalizar"><i class="bi bi-check-circle"></i></button>`;
            }
        }
        headerActions.innerHTML = actionsHtml;
    }

    document.querySelectorAll('.whatsapp-contact-item').forEach(el => el.classList.toggle('active', el.dataset.chatId === chatId));
    document.getElementById('messagesBody').innerHTML = '<div class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm me-2"></div>Carregando...</div>';
    document.getElementById('messageInput').focus();
    checkProviderLink(chatId);
    markChatAsRead(chatId);
    await loadMessages();
    if (messagesInterval) clearInterval(messagesInterval);
    messagesInterval = setInterval(loadMessages, 3000);
    loadTemplatesPicker();
}

async function checkProviderLink(chatId) {
    const badge = document.getElementById('providerBadge');
    try {
        const res = await fetch(`/api/whatsapp/provedor-por-chat/${encodeURIComponent(chatId)}`);
        const data = await res.json();
        if (data && data.provedor_nome) {
            badge.style.display = 'block';
            document.getElementById('providerBadgeName').textContent = data.provedor_nome;
            document.getElementById('providerBadgeLink').href = `/provedores#${data.provedor_id}`;
        } else {
            badge.style.display = 'none';
        }
    } catch { badge.style.display = 'none'; }
}

// ==================== MESSAGES ====================

let _lastMsgIds = '';
let _localPendingMsgs = []; // mensagens enviadas localmente aguardando sync

async function loadMessages() {
    if (!currentChatId) return;
    try {
        const res = await fetch(`/api/whatsapp/messages/${encodeURIComponent(currentChatId)}?limit=50`);
        if (!res.ok) return;
        const msgs = await res.json();
        if (!Array.isArray(msgs)) return;

        // Verificar se houve mudanca real (evitar re-render desnecessario)
        const newIds = msgs.map(m => m.id || m.messageId || '').join(',');
        if (newIds === _lastMsgIds && !_localPendingMsgs.length) return;
        _lastMsgIds = newIds;

        // Mesclar mensagens locais pendentes que ainda nao apareceram na API
        const apiIds = new Set(msgs.map(m => m.id));
        const stillPending = _localPendingMsgs.filter(lm => !apiIds.has(lm.id) && (Date.now()/1000 - lm.timestamp) < 30);
        _localPendingMsgs = stillPending;
        const allMsgs = [...msgs, ...stillPending];

        renderMessages(allMsgs);
        document.getElementById('loadMoreBar').style.display = msgs.length >= 50 ? 'block' : 'none';
    } catch {}
}

async function loadOlderMessages() {
    if (!currentChatId) return;
    messagesOffset += 50;
    try {
        const res = await fetch(`/api/whatsapp/messages-page/${encodeURIComponent(currentChatId)}?limit=50&offset=${messagesOffset}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.messages && data.messages.length) {
            const body = document.getElementById('messagesBody');
            const prevHeight = body.scrollHeight;
            const oldHtml = body.innerHTML;
            const newMsgs = data.messages.sort((a, b) => (a.timestamp||0) - (b.timestamp||0));
            const newHtml = newMsgs.map(m => renderSingleMessage(m)).filter(Boolean).join('');
            body.innerHTML = newHtml + oldHtml;
            body.scrollTop = body.scrollHeight - prevHeight;
            if (!data.hasMore) document.getElementById('loadMoreBar').style.display = 'none';
        } else {
            document.getElementById('loadMoreBar').style.display = 'none';
            mostrarToast('Nao ha mais mensagens anteriores', 'info');
        }
    } catch {}
}

function renderMessages(messages) {
    const body = document.getElementById('messagesBody');
    if (!messages.length) {
        body.innerHTML = '<div class="text-center text-muted py-4"><i class="bi bi-chat-dots" style="font-size:2rem"></i><br><small>Envie uma mensagem para iniciar a conversa.<br>As mensagens aparecerao aqui a partir de agora.</small></div>';
        lastMessageCount = 0;
        return;
    }
    const wasBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 100;
    const sorted = [...messages].sort((a, b) => (a.timestamp||0) - (b.timestamp||0));
    body.innerHTML = sorted.map(m => renderSingleMessage(m)).filter(Boolean).join('');
    if (wasBottom || lastMessageCount !== sorted.length) body.scrollTop = body.scrollHeight;
    lastMessageCount = sorted.length;
}

function renderSingleMessage(m) {
    const fromMe = m.fromMe||false, text = m.body||m.text||'', type = m.type||'', msgId = getMsgId(m);
    const mediaUrl = m._mediaUrl || '';
    let content = escapeHtml(text), mediaHtml = '';

    if (m.hasMedia || ['image','video','ptt','audio','sticker','document'].includes(type)) {
        const mediaParam = mediaUrl ? `,'${escapeHtml(mediaUrl)}'` : '';
        if (type==='image'||type==='sticker') {
            if (mediaUrl) mediaHtml = `<div class="msg-media"><img src="${mediaUrl}" style="max-width:250px;border-radius:8px;cursor:pointer" onclick="openMedia('${msgId}','image'${mediaParam})" onerror="this.outerHTML='<div class=\\'msg-media\\' onclick=\\'openMedia(&quot;${msgId}&quot;,&quot;image&quot;${mediaParam})\\'><i class=\\'bi bi-image fs-3\\'></i><br><small>Ver imagem</small></div>'"></div>`;
            else mediaHtml = `<div class="msg-media" onclick="openMedia('${msgId}','image')"><i class="bi bi-image fs-3"></i><br><small>${type==='sticker'?'Sticker':'Ver imagem'}</small></div>`;
        }
        else if (type==='video') mediaHtml = `<div class="msg-media" onclick="openMedia('${msgId}','video'${mediaParam})"><i class="bi bi-play-circle fs-3"></i><br><small>Video</small></div>`;
        else if (type==='ptt'||type==='audio') mediaHtml = `<div class="msg-media-audio"><i class="bi bi-mic-fill"></i> Audio ${m.duration?'('+m.duration+'s)':''}</div>`;
        else if (type==='document') mediaHtml = `<div class="msg-media" onclick="openMedia('${msgId}','document'${mediaParam})"><i class="bi bi-file-earmark fs-3"></i><br><small>${escapeHtml(m.filename||'Doc')}</small></div>`;
        if (!content) content = {ptt:'🎤',audio:'🎤',image:'📷',sticker:'🏷️',video:'🎥',document:'📄',location:'📍',vcard:'👤'}[type]||'';
    }
    if (!content && !mediaHtml) return '';

    // Format WhatsApp markdown
    content = formatWhatsAppText(content);

    const time = m.timestamp ? new Date(m.timestamp*1000).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '';
    const sender = !fromMe && m.senderName ? `<div class="msg-sender">${escapeHtml(m.senderName)}</div>` : '';
    let quotedHtml = '';
    if (m.hasQuotedMsg && m.quotedMsg) quotedHtml = `<div class="msg-quoted"><small class="fw-bold">${escapeHtml(m.quotedMsg.participant||'')}</small><br>${escapeHtml((m.quotedMsg.body||'').substring(0,80))}</div>`;
    let reactHtml = '';
    if (m.reactions?.length) reactHtml = `<div class="msg-reactions">${m.reactions.map(r=>`<span class="msg-reaction">${r.text||r.reaction||r}</span>`).join('')}</div>`;

    const senderSafe = (m.senderName||(fromMe?'Voce':'')).replace(/'/g,'').replace(/"/g,'');
    const textSafe = (text||'').substring(0,80).replace(/'/g,'').replace(/"/g,'');
    return `<div class="msg-bubble ${fromMe?'msg-sent':'msg-received'}" data-msg-id="${msgId}">
        ${sender}${quotedHtml}${mediaHtml}${content?`<div>${content}</div>`:''}
        <div class="msg-footer"><span class="msg-time">${time}</span>
            <div class="msg-actions">
                <button class="msg-action-btn" onclick="setReply('${msgId}','${escapeHtml(senderSafe)}','${escapeHtml(textSafe)}')" title="Responder"><i class="bi bi-reply"></i></button>
                <button class="msg-action-btn" onclick="showReactionPicker(event,'${msgId}')" title="Reagir"><i class="bi bi-emoji-smile"></i></button>
                <button class="msg-action-btn" onclick="openForwardModal('${msgId}')" title="Encaminhar"><i class="bi bi-forward"></i></button>
            </div>
        </div>${reactHtml}
    </div>`;
}

function formatWhatsAppText(text) {
    if (!text) return text;
    // Bold: *text*
    text = text.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
    // Italic: _text_
    text = text.replace(/\_([^_]+)\_/g, '<em>$1</em>');
    // Strikethrough: ~text~
    text = text.replace(/\~([^~]+)\~/g, '<del>$1</del>');
    // Monospace: ```text```
    text = text.replace(/\`\`\`([^`]+)\`\`\`/g, '<code>$1</code>');
    return text;
}

function appendMessage(msg) {
    const body = document.getElementById('messagesBody');
    const html = renderSingleMessage(msg);
    if (html) {
        body.innerHTML += html;
        body.scrollTop = body.scrollHeight;
    }
}

// ==================== REPLY ====================

function setReply(msgId, name, text) {
    replyToMessage = msgId;
    document.getElementById('replyPreview').style.display = 'flex';
    document.getElementById('replyName').textContent = name || 'Mensagem';
    document.getElementById('replyText').textContent = text;
    document.getElementById('messageInput').focus();
}
function cancelReply() { replyToMessage = null; const rp = document.getElementById('replyPreview'); if(rp) rp.style.display = 'none'; }

// ==================== REACTIONS ====================

function showReactionPicker(e, msgId) {
    e.stopPropagation(); currentReactionMsgId = msgId;
    const picker = document.getElementById('reactionPicker');
    picker.style.display = 'flex';
    const rect = e.target.closest('.msg-bubble').getBoundingClientRect();
    picker.style.top = (rect.top - 50 + window.scrollY) + 'px';
    picker.style.left = (rect.left + 20) + 'px';
    setTimeout(() => document.addEventListener('click', hideReactionPicker, { once: true }), 10);
}
function hideReactionPicker() { document.getElementById('reactionPicker').style.display = 'none'; }

async function sendReaction(msgId, reaction) {
    hideReactionPicker();
    try { await fetch('/api/whatsapp/react', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({messageId:msgId,reaction,chatId:currentChatId}) }); }
    catch { mostrarToast('Erro ao reagir','error'); }
}

// ==================== FORWARD (Encaminhar) ====================

function openForwardModal(msgId) {
    document.getElementById('forwardMsgId').value = msgId;
    const list = document.getElementById('forwardContactsList');
    list.innerHTML = allChats.map(c => {
        const chatId = getChatId(c), name = c.name || chatId.split('@')[0];
        return `<div class="forward-contact-item whatsapp-contact-item" data-name="${escapeHtml(name.toLowerCase())}" onclick="forwardTo('${escapeHtml(chatId)}')">
            <div class="whatsapp-contact-avatar" style="width:32px;height:32px;font-size:0.7rem;background:#dfe6e9;color:#636e72"><i class="bi bi-person-fill"></i></div>
            <div class="whatsapp-contact-info"><div class="whatsapp-contact-name">${escapeHtml(name)}</div></div>
        </div>`;
    }).join('');
    new bootstrap.Modal(document.getElementById('modalEncaminhar')).show();
}

function filterForwardList() {
    const q = document.getElementById('forwardSearch').value.toLowerCase();
    document.querySelectorAll('#forwardContactsList .forward-contact-item').forEach(el => {
        el.style.display = el.dataset.name.includes(q) ? '' : 'none';
    });
}

async function forwardTo(chatId) {
    const msgId = document.getElementById('forwardMsgId').value;
    try {
        await fetch('/api/whatsapp/forward', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({messageId:msgId,chatId,fromChatId:currentChatId}) });
        bootstrap.Modal.getInstance(document.getElementById('modalEncaminhar')).hide();
        mostrarToast('Mensagem encaminhada!');
    } catch { mostrarToast('Erro ao encaminhar','error'); }
}

// ==================== MEDIA ====================

async function openMedia(msgId, mediaType, directUrl) {
    // Se temos URL direta, usar proxy
    const url = directUrl
        ? `/api/whatsapp/media/${encodeURIComponent(msgId)}?url=${encodeURIComponent(directUrl)}`
        : `/api/whatsapp/media/${encodeURIComponent(msgId)}`;

    if (mediaType === 'document') {
        window.open(directUrl || url, '_blank');
        return;
    }

    const modal = new bootstrap.Modal(document.getElementById('modalWhatsappMedia'));
    const img = document.getElementById('mediaViewerImg');
    const video = document.getElementById('mediaViewerVideo');
    const loading = document.getElementById('mediaLoading');
    const downloadLink = document.getElementById('mediaDownloadLink');
    const newTabLink = document.getElementById('mediaNewTabLink');

    img.style.display = 'none';
    video.style.display = 'none';
    loading.style.display = 'block';
    loading.innerHTML = '<div class="spinner-border text-light"></div><p class="text-light mt-2">Carregando midia...</p>';
    img.src = '';
    video.src = '';
    downloadLink.href = url;
    newTabLink.href = directUrl || url;

    modal.show();

    try {
        // Se temos URL direta, tentar carregar direto (mais rapido)
        const fetchUrl = directUrl || url;
        const res = await fetch(directUrl ? url : fetchUrl);
        if (!res.ok) throw new Error('Erro ao carregar');
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);

        loading.style.display = 'none';

        if (blob.type.startsWith('video/')) {
            video.src = objectUrl;
            video.style.display = 'block';
        } else {
            img.src = objectUrl;
            img.style.display = 'block';
        }

        downloadLink.href = objectUrl;
    } catch (err) {
        loading.innerHTML = '<p class="text-danger"><i class="bi bi-exclamation-triangle fs-3"></i><br>Erro ao carregar midia</p><a href="' + (directUrl || url) + '" target="_blank" class="btn btn-sm btn-outline-light mt-2">Abrir em nova aba</a>';
    }
}

async function sendFile(input) {
    if (!input.files.length || !currentChatId) return;
    const fd = new FormData();
    fd.append('chatId', currentChatId);
    fd.append('file', input.files[0]);
    fd.append('caption', prompt('Legenda (opcional):','') || '');
    try {
        mostrarToast('Enviando arquivo...','info');
        await fetch('/api/whatsapp/send-file', { method:'POST', body:fd });
        mostrarToast('Arquivo enviado!');
        setTimeout(loadMessages, 1000);
    } catch { mostrarToast('Erro ao enviar arquivo','error'); }
    input.value = '';
}

// ==================== SEND MESSAGE ====================

function handleInputKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    if (e.key === 'Escape') hideQuickTemplates();
}

function handleInputChange(e) {
    const val = e.target.value;
    if (val === '/') {
        showQuickTemplates('');
    } else if (val.startsWith('/') && val.length > 1) {
        showQuickTemplates(val.substring(1).toLowerCase());
    } else {
        hideQuickTemplates();
    }
}

function showQuickTemplates(filter) {
    const popup = document.getElementById('quickTemplatesPopup');
    const list = document.getElementById('quickTemplatesList');
    const filtered = allTemplates.filter(t => !filter || t.nome.toLowerCase().includes(filter) || t.texto.toLowerCase().includes(filter));
    if (!filtered.length) { popup.style.display = 'none'; return; }
    list.innerHTML = filtered.map(t => `<div class="quick-template-item" onclick="useQuickTemplate(${t.id})"><strong>${escapeHtml(t.nome)}</strong><br><small class="text-muted">${escapeHtml(t.texto.substring(0,60))}</small></div>`).join('');
    popup.style.display = 'block';
}

function hideQuickTemplates() { document.getElementById('quickTemplatesPopup').style.display = 'none'; }

function useQuickTemplate(id) {
    const t = allTemplates.find(x => x.id === id);
    if (t) { document.getElementById('messageInput').value = t.texto; hideQuickTemplates(); document.getElementById('messageInput').focus(); }
}

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    if (!text || !currentChatId) return;
    hideQuickTemplates();
    const btn = document.getElementById('btnSend');
    btn.disabled = true; input.value = '';
    fetch('/api/whatsapp/typing', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({chatId:currentChatId}) }).catch(()=>{});
    try {
        const payload = { chatId: currentChatId, text };
        if (replyToMessage) payload.quotedMessageId = replyToMessage;
        const sendRes = await fetch('/api/whatsapp/send', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
        const sendData = await sendRes.json();
        cancelReply();
        // Criar mensagem local com estrutura completa para sobreviver ao refresh
        const localMsg = {
            id: sendData.messageId || ('local_' + Date.now()),
            from: currentChatId,
            fromMe: true,
            body: text,
            type: 'chat',
            timestamp: Math.floor(Date.now() / 1000),
            senderName: ''
        };
        _localPendingMsgs.push(localMsg);
        _lastMsgIds = ''; // forcar re-render no proximo loadMessages
        appendMessage(localMsg);
    } catch { mostrarToast('Erro ao enviar','error'); input.value = text; }
    btn.disabled = false; input.focus();
}

// ==================== FORMATTING ====================

function toggleFormatBar() {
    const bar = document.getElementById('formatBar');
    bar.style.display = bar.style.display === 'none' ? 'flex' : 'none';
}

function applyFormat(type) {
    const input = document.getElementById('messageInput');
    const start = input.selectionStart, end = input.selectionEnd;
    const selected = input.value.substring(start, end);
    const wraps = { bold: '*', italic: '_', strike: '~', mono: '```' };
    const w = wraps[type] || '';
    if (selected) {
        input.value = input.value.substring(0, start) + w + selected + w + input.value.substring(end);
    } else {
        input.value += w + w;
        input.setSelectionRange(input.value.length - w.length, input.value.length - w.length);
    }
    input.focus();
}

// ==================== SEARCH ====================

function toggleGlobalSearch() {
    const panel = document.getElementById('globalSearchPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    if (panel.style.display === 'block') document.getElementById('globalSearchInput').focus();
}

async function globalSearch() {
    const q = document.getElementById('globalSearchInput').value.trim();
    if (!q) return;
    const container = document.getElementById('globalSearchResults');
    container.innerHTML = '<div class="text-center py-2"><div class="spinner-border spinner-border-sm"></div> Buscando...</div>';
    try {
        const res = await fetch(`/api/whatsapp/search?q=${encodeURIComponent(q)}`);
        const results = await res.json();
        if (!results.length) { container.innerHTML = '<div class="text-muted py-2">Nenhum resultado</div>'; return; }
        container.innerHTML = results.map(r => {
            const chatId = r._chatId || r.from || '';
            const chatName = r._chatName || r.senderName || chatId;
            const time = r.timestamp ? new Date(r.timestamp*1000).toLocaleString('pt-BR') : '';
            return `<div class="search-result-item" onclick="selectChat('${escapeHtml(chatId)}','${escapeHtml(chatName)}')">
                <div class="fw-bold">${escapeHtml(chatName)}</div>
                <div class="text-truncate">${escapeHtml(r.body||'')}</div>
                <small class="text-muted">${time}</small>
            </div>`;
        }).join('');
    } catch { container.innerHTML = '<div class="text-danger py-2">Erro na busca</div>'; }
}

function toggleChatSearch() {
    const bar = document.getElementById('chatSearchBar');
    bar.style.display = bar.style.display === 'none' ? 'block' : 'none';
    if (bar.style.display === 'block') document.getElementById('chatSearchInput').focus();
}

async function searchInChat() {
    const q = document.getElementById('chatSearchInput').value.trim();
    if (!q || !currentChatId) return;
    try {
        const res = await fetch(`/api/whatsapp/search?q=${encodeURIComponent(q)}&chatId=${encodeURIComponent(currentChatId)}`);
        const results = await res.json();
        if (!results.length) { mostrarToast('Nenhum resultado','info'); return; }
        // Highlight in messages
        const body = document.getElementById('messagesBody');
        const regex = new RegExp(escapeHtml(q), 'gi');
        body.innerHTML = body.innerHTML.replace(regex, match => `<mark>${match}</mark>`);
        mostrarToast(`${results.length} resultado(s) encontrado(s)`);
    } catch { mostrarToast('Erro na busca','error'); }
}

// ==================== EXPORT ====================

function exportChat(format) {
    if (!currentChatId) return;
    window.open(`/api/whatsapp/export/${encodeURIComponent(currentChatId)}?format=${format}`, '_blank');
}

// ==================== VINCULAR PROVEDOR AO CHAT ====================

async function vincularProvedorChat() {
    if (!currentChatId) return;
    try {
        const res = await fetch('/api/provedores');
        const provedores = await res.json();
        const sel = document.getElementById('vinculoProvedorId');
        sel.innerHTML = '<option value="">Selecione...</option>' + provedores.map(p => `<option value="${p.id}">${escapeHtml(p.nome)}</option>`).join('');
        document.getElementById('vinculoChatId').innerHTML = `<option value="${escapeHtml(currentChatId)}">${escapeHtml(currentChatName || currentChatId)}</option>`;
        new bootstrap.Modal(document.getElementById('modalVinculo')).show();
    } catch { mostrarToast('Erro ao carregar provedores','error'); }
}

// ==================== UNREAD BADGE (SIDEBAR) ====================

async function updateUnreadBadge() {
    try {
        const res = await fetch('/api/whatsapp/unread-count');
        const data = await res.json();
        const badge = document.getElementById('sidebarUnreadBadge');
        if (badge) {
            if (data.total > 0) {
                badge.textContent = data.total > 99 ? '99+' : data.total;
                badge.style.display = '';
            } else {
                badge.style.display = 'none';
            }
        }
    } catch {}
}

// ==================== TEMPLATES ====================

async function carregarTemplates() {
    try { allTemplates = await api('/api/whatsapp/templates'); renderTabelaTemplates(allTemplates); renderMassTemplateSelect(allTemplates); } catch {}
}

function renderTabelaTemplates(templates) {
    const tbody = document.getElementById('tabelaTemplates');
    if (!tbody) return;
    if (!templates.length) { tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">Nenhum template</td></tr>'; return; }
    const cats = {geral:'Geral',chamados:'Chamados',treinamentos:'Treinamentos',projetos:'Projetos'};
    tbody.innerHTML = templates.map(t => `<tr>
        <td class="fw-medium">${escapeHtml(t.nome)}</td>
        <td><span class="badge bg-secondary">${cats[t.categoria]||t.categoria}</span></td>
        <td><small>${escapeHtml(t.texto.substring(0,80))}${t.texto.length>80?'...':''}</small></td>
        <td><button class="btn btn-sm btn-outline-primary btn-action" onclick="editarTemplate(${t.id})"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger btn-action" onclick="excluirTemplate(${t.id})"><i class="bi bi-trash"></i></button></td>
    </tr>`).join('');
}

function abrirModalTemplate() {
    document.getElementById('templateId').value = '';
    document.getElementById('templateNome').value = '';
    document.getElementById('templateTexto').value = '';
    document.getElementById('templateCategoria').value = 'geral';
    document.getElementById('modalTemplateTitulo').textContent = 'Novo Template';
    new bootstrap.Modal(document.getElementById('modalTemplate')).show();
}

async function editarTemplate(id) {
    const t = allTemplates.find(x => x.id === id);
    if (!t) return;
    document.getElementById('templateId').value = t.id;
    document.getElementById('templateNome').value = t.nome;
    document.getElementById('templateTexto').value = t.texto;
    document.getElementById('templateCategoria').value = t.categoria;
    document.getElementById('modalTemplateTitulo').textContent = 'Editar Template';
    new bootstrap.Modal(document.getElementById('modalTemplate')).show();
}

async function salvarTemplate() {
    const id = document.getElementById('templateId').value;
    const data = { nome: document.getElementById('templateNome').value.trim(), texto: document.getElementById('templateTexto').value.trim(), categoria: document.getElementById('templateCategoria').value };
    if (!data.nome || !data.texto) { mostrarToast('Preencha nome e texto','warning'); return; }
    try {
        if (id) await api(`/api/whatsapp/templates/${id}`, {method:'PUT',body:data});
        else await api('/api/whatsapp/templates', {method:'POST',body:data});
        bootstrap.Modal.getInstance(document.getElementById('modalTemplate')).hide();
        carregarTemplates(); mostrarToast('Template salvo!');
    } catch(e) { mostrarToast(e.message,'error'); }
}

async function excluirTemplate(id) {
    if (!await confirmar('Excluir este template?')) return;
    try { await api(`/api/whatsapp/templates/${id}`,{method:'DELETE'}); carregarTemplates(); mostrarToast('Excluido'); } catch(e) { mostrarToast(e.message,'error'); }
}

function loadTemplatesPicker() {
    const list = document.getElementById('templatesPickerList');
    if(list) list.innerHTML = allTemplates.map(x => `<div class="templates-picker-item" onclick="useTemplate(${x.id})">${escapeHtml(x.nome)}</div>`).join('');
}
function toggleTemplatesPicker() { const p = document.getElementById('templatesPicker'); p.style.display = p.style.display==='none'?'block':'none'; }
function useTemplate(id) {
    const t = allTemplates.find(x => x.id === id);
    if (t) { document.getElementById('messageInput').value = t.texto; toggleTemplatesPicker(); document.getElementById('messageInput').focus(); }
}

// ==================== AUTO-RESPOSTAS (BOT) ====================

async function carregarAutoRespostas() { try { renderTabelaBot(await api('/api/whatsapp/auto-respostas')); } catch {} }

function renderTabelaBot(respostas) {
    const tbody = document.getElementById('tabelaBot');
    if (!tbody) return;
    if (!respostas.length) { tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">Nenhuma regra</td></tr>'; return; }
    tbody.innerHTML = respostas.map(r => `<tr class="${!r.ativo?'table-secondary':''}">
        <td><code>${escapeHtml(r.palavra_chave)}</code></td>
        <td><small>${escapeHtml(r.resposta.substring(0,80))}${r.resposta.length>80?'...':''}</small></td>
        <td><span class="badge bg-${r.ativo?'success':'secondary'}" style="cursor:pointer" onclick="toggleAutoResposta(${r.id},${r.ativo?0:1})">${r.ativo?'Ativo':'Inativo'}</span></td>
        <td><button class="btn btn-sm btn-outline-primary btn-action" onclick="editarAutoResposta(${r.id})"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger btn-action" onclick="excluirAutoResposta(${r.id})"><i class="bi bi-trash"></i></button></td>
    </tr>`).join('');
}

function abrirModalAutoResposta() {
    document.getElementById('autoRespostaId').value = '';
    document.getElementById('autoRespostaPalavra').value = '';
    document.getElementById('autoRespostaTexto').value = '';
    document.getElementById('modalAutoRespostaTitulo').textContent = 'Nova Regra';
    new bootstrap.Modal(document.getElementById('modalAutoResposta')).show();
}

async function editarAutoResposta(id) {
    const r = (await api('/api/whatsapp/auto-respostas')).find(x => x.id === id);
    if (!r) return;
    document.getElementById('autoRespostaId').value = r.id;
    document.getElementById('autoRespostaPalavra').value = r.palavra_chave;
    document.getElementById('autoRespostaTexto').value = r.resposta;
    document.getElementById('modalAutoRespostaTitulo').textContent = 'Editar Regra';
    new bootstrap.Modal(document.getElementById('modalAutoResposta')).show();
}

async function salvarAutoResposta() {
    const id = document.getElementById('autoRespostaId').value;
    const data = { palavra_chave: document.getElementById('autoRespostaPalavra').value.trim(), resposta: document.getElementById('autoRespostaTexto').value.trim(), ativo: true };
    if (!data.palavra_chave || !data.resposta) { mostrarToast('Preencha todos os campos','warning'); return; }
    try {
        if (id) await api(`/api/whatsapp/auto-respostas/${id}`,{method:'PUT',body:data});
        else await api('/api/whatsapp/auto-respostas',{method:'POST',body:data});
        bootstrap.Modal.getInstance(document.getElementById('modalAutoResposta')).hide();
        carregarAutoRespostas(); mostrarToast('Regra salva!');
    } catch(e) { mostrarToast(e.message,'error'); }
}

async function toggleAutoResposta(id, ativo) {
    const r = (await api('/api/whatsapp/auto-respostas')).find(x => x.id === id);
    if (!r) return;
    try { await api(`/api/whatsapp/auto-respostas/${id}`,{method:'PUT',body:{...r,ativo:!!ativo}}); carregarAutoRespostas(); } catch(e) { mostrarToast(e.message,'error'); }
}

async function excluirAutoResposta(id) {
    if (!await confirmar('Excluir esta regra?')) return;
    try { await api(`/api/whatsapp/auto-respostas/${id}`,{method:'DELETE'}); carregarAutoRespostas(); mostrarToast('Excluida'); } catch(e) { mostrarToast(e.message,'error'); }
}

// ==================== NOTIFICACOES ====================

async function carregarNotificacoes() { try { renderNotificacoes(await api('/api/whatsapp/notificacoes')); } catch {} }

function renderNotificacoes(notifs) {
    const container = document.getElementById('notificacoesList');
    if (!container) return;
    const labels = {
        chamado_aberto:{label:'Chamado Aberto',icon:'bi-ticket-detailed',color:'primary'},
        chamado_resolvido:{label:'Chamado Resolvido',icon:'bi-check-circle',color:'success'},
        treinamento_agendado:{label:'Treinamento Agendado',icon:'bi-mortarboard',color:'info'},
        projeto_atualizado:{label:'Projeto Atualizado',icon:'bi-kanban',color:'warning'}
    };
    container.innerHTML = notifs.map(n => {
        const l = labels[n.tipo]||{label:n.tipo,icon:'bi-bell',color:'secondary'};
        return `<div class="card mb-2"><div class="card-body p-3">
            <div class="d-flex align-items-start gap-3">
                <div class="form-check form-switch mt-1">
                    <input class="form-check-input" type="checkbox" id="notif_${n.id}" ${n.ativo?'checked':''} onchange="salvarNotificacao(${n.id})">
                </div>
                <div class="flex-grow-1">
                    <div class="fw-bold mb-2"><i class="bi ${l.icon} text-${l.color} me-1"></i>${l.label}</div>
                    <div class="mb-2"><label class="form-label mb-1"><small>Chat ID destino:</small></label>
                        <input class="form-control form-control-sm" id="notif_chat_${n.id}" value="${escapeHtml(n.chat_id||'')}" placeholder="5511999999999"></div>
                    <div><label class="form-label mb-1"><small>Template:</small></label>
                        <textarea class="form-control form-control-sm" id="notif_tpl_${n.id}" rows="2">${escapeHtml(n.mensagem_template||'')}</textarea></div>
                    <button class="btn btn-sm btn-outline-primary mt-2" onclick="salvarNotificacao(${n.id})"><i class="bi bi-check me-1"></i>Salvar</button>
                </div>
            </div>
        </div></div>`;
    }).join('');
}

async function salvarNotificacao(id) {
    const ativo = document.getElementById(`notif_${id}`).checked;
    const chat_id = document.getElementById(`notif_chat_${id}`).value.trim();
    const mensagem_template = document.getElementById(`notif_tpl_${id}`).value.trim();
    try { await api(`/api/whatsapp/notificacoes/${id}`,{method:'PUT',body:{ativo,chat_id,mensagem_template}}); mostrarToast('Salvo!'); }
    catch(e) { mostrarToast(e.message,'error'); }
}

// ==================== ENVIO EM MASSA ====================

let massSelectedChats = new Set();

function loadMassContacts() {
    const container = document.getElementById('massContactsList');
    if (!container || !allChats.length) return;
    container.innerHTML = allChats.filter(c => !c.isGroup).map(c => {
        const chatId = getChatId(c), name = c.name || chatId;
        return `<label class="mass-contact-item"><input type="checkbox" value="${escapeHtml(chatId)}" onchange="updateMassCount()" ${massSelectedChats.has(chatId)?'checked':''}><span>${escapeHtml(name)}</span></label>`;
    }).join('');
    updateMassCount();
}

function renderMassTemplateSelect(templates) {
    const sel = document.getElementById('massTemplate');
    if(sel) sel.innerHTML = '<option value="">-- Template --</option>' + templates.map(t => `<option value="${escapeHtml(t.texto)}">${escapeHtml(t.nome)}</option>`).join('');
}
function applyMassTemplate() { const v = document.getElementById('massTemplate').value; if(v) document.getElementById('massMessage').value = v; }
function massSelectAll() { document.querySelectorAll('#massContactsList input[type=checkbox]').forEach(cb=>cb.checked=true); updateMassCount(); }
function massDeselectAll() { document.querySelectorAll('#massContactsList input[type=checkbox]').forEach(cb=>cb.checked=false); massSelectedChats.clear(); updateMassCount(); }
function updateMassCount() {
    massSelectedChats = new Set([...document.querySelectorAll('#massContactsList input:checked')].map(cb=>cb.value));
    const b = document.getElementById('massSelectedCount'); if(b) b.textContent = `${massSelectedChats.size} selecionados`;
}

async function enviarMassa() {
    const chatIds = [...massSelectedChats], text = document.getElementById('massMessage').value.trim(), delay = parseInt(document.getElementById('massDelay').value)||3;
    if (!chatIds.length) { mostrarToast('Selecione contatos','warning'); return; }
    if (!text) { mostrarToast('Digite uma mensagem','warning'); return; }
    if (!confirm(`Enviar para ${chatIds.length} contatos?`)) return;
    const btn = document.getElementById('btnMassSend'), prog = document.getElementById('massProgress'), bar = document.getElementById('massProgressBar'), pt = document.getElementById('massProgressText');
    btn.disabled = true; prog.style.display = 'block'; bar.style.width = '0%'; bar.textContent = '0%';
    try {
        const res = await fetch('/api/whatsapp/send-mass', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({chatIds,text,delayMs:delay*1000}) });
        const result = await res.json();
        const sent = result.results?.filter(r=>r.status==='sent').length||0;
        bar.style.width = '100%'; bar.textContent = '100%';
        pt.textContent = `${sent}/${chatIds.length} enviados`;
        mostrarToast(`Enviado para ${sent} de ${chatIds.length}`);
    } catch { mostrarToast('Erro no envio em massa','error'); }
    btn.disabled = false;
}

// ==================== AGENDAMENTOS ====================

async function carregarAgendamentos() {
    try {
        const data = await api('/api/whatsapp/agendamentos');
        renderTabelaAgendamentos(data);
    } catch {}
}

function renderTabelaAgendamentos(agendamentos) {
    const tbody = document.getElementById('tabelaAgendamentos');
    if (!tbody) return;
    if (!agendamentos.length) { tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Nenhum agendamento</td></tr>'; return; }
    const statusBadge = { pendente: 'warning', enviado: 'success', erro: 'danger' };
    tbody.innerHTML = agendamentos.map(a => `<tr>
        <td>${escapeHtml(a.chat_nome || a.chat_id)}</td>
        <td><small>${escapeHtml(a.texto.substring(0,60))}${a.texto.length>60?'...':''}</small></td>
        <td>${new Date(a.data_envio).toLocaleString('pt-BR')}</td>
        <td><span class="badge bg-${statusBadge[a.status]||'secondary'}">${a.status}</span></td>
        <td>${a.status==='pendente'?`<button class="btn btn-sm btn-outline-danger btn-action" onclick="excluirAgendamento(${a.id})"><i class="bi bi-trash"></i></button>`:''}</td>
    </tr>`).join('');
}

function abrirModalAgendamento() {
    const sel = document.getElementById('agendChatId');
    sel.innerHTML = '<option value="">Selecione...</option>' + allChats.map(c => {
        const chatId = getChatId(c), name = c.name || chatId.split('@')[0];
        return `<option value="${escapeHtml(chatId)}" data-name="${escapeHtml(name)}">${escapeHtml(name)}</option>`;
    }).join('');
    document.getElementById('agendTexto').value = '';
    document.getElementById('agendDataEnvio').value = '';
    new bootstrap.Modal(document.getElementById('modalAgendamento')).show();
}

async function salvarAgendamento() {
    const chat_id = document.getElementById('agendChatId').value;
    const chat_nome = document.getElementById('agendChatId').selectedOptions[0]?.dataset?.name || '';
    const texto = document.getElementById('agendTexto').value.trim();
    const data_envio = document.getElementById('agendDataEnvio').value;
    if (!chat_id || !texto || !data_envio) { mostrarToast('Preencha todos os campos','warning'); return; }
    try {
        await api('/api/whatsapp/agendamentos', { method:'POST', body:{ chat_id, chat_nome, texto, data_envio: data_envio.replace('T', ' ') } });
        bootstrap.Modal.getInstance(document.getElementById('modalAgendamento')).hide();
        carregarAgendamentos();
        mostrarToast('Agendamento criado!');
    } catch(e) { mostrarToast(e.message,'error'); }
}

async function excluirAgendamento(id) {
    if (!await confirmar('Cancelar este agendamento?')) return;
    try { await api(`/api/whatsapp/agendamentos/${id}`,{method:'DELETE'}); carregarAgendamentos(); mostrarToast('Cancelado'); }
    catch(e) { mostrarToast(e.message,'error'); }
}

// ==================== VINCULOS ====================

async function carregarVinculos() {
    try {
        const data = await api('/api/whatsapp/provedores-vinculados');
        renderTabelaVinculos(data);
    } catch {}
}

function renderTabelaVinculos(vinculos) {
    const tbody = document.getElementById('tabelaVinculos');
    if (!tbody) return;
    if (!vinculos.length) { tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted py-3">Nenhum vinculo</td></tr>'; return; }
    tbody.innerHTML = vinculos.map(v => `<tr>
        <td class="fw-medium">${escapeHtml(v.provedor_nome)}</td>
        <td><code>${escapeHtml(v.chat_id)}</code></td>
        <td>
            <button class="btn btn-sm btn-outline-success btn-action me-1" onclick="selectChat('${escapeHtml(v.chat_id)}','${escapeHtml(v.provedor_nome)}')" title="Abrir chat"><i class="bi bi-chat"></i></button>
            <button class="btn btn-sm btn-outline-danger btn-action" onclick="excluirVinculo(${v.provedor_id})"><i class="bi bi-trash"></i></button>
        </td>
    </tr>`).join('');
}

async function abrirModalVinculo() {
    try {
        const [provedores] = await Promise.all([api('/api/provedores')]);
        document.getElementById('vinculoProvedorId').innerHTML = '<option value="">Selecione...</option>' + provedores.map(p => `<option value="${p.id}">${escapeHtml(p.nome)}</option>`).join('');
        document.getElementById('vinculoChatId').innerHTML = '<option value="">Selecione...</option>' + allChats.map(c => {
            const chatId = getChatId(c), name = c.name || chatId.split('@')[0];
            return `<option value="${escapeHtml(chatId)}">${escapeHtml(name)}</option>`;
        }).join('');
        new bootstrap.Modal(document.getElementById('modalVinculo')).show();
    } catch { mostrarToast('Erro ao carregar dados','error'); }
}

async function salvarVinculo() {
    const provedor_id = document.getElementById('vinculoProvedorId').value;
    const chat_id = document.getElementById('vinculoChatId').value;
    if (!provedor_id || !chat_id) { mostrarToast('Selecione provedor e chat','warning'); return; }
    try {
        await api('/api/whatsapp/vincular-provedor', { method:'POST', body:{ provedor_id: Number(provedor_id), chat_id } });
        bootstrap.Modal.getInstance(document.getElementById('modalVinculo')).hide();
        carregarVinculos();
        mostrarToast('Vinculo criado!');
    } catch(e) { mostrarToast(e.message,'error'); }
}

async function excluirVinculo(provedorId) {
    if (!await confirmar('Remover este vinculo?')) return;
    try { await api(`/api/whatsapp/desvincular-provedor/${provedorId}`,{method:'DELETE'}); carregarVinculos(); mostrarToast('Removido'); }
    catch(e) { mostrarToast(e.message,'error'); }
}

// ==================== METRICAS ====================

let chartMsgPorDia = null;

async function carregarMetricas() {
    // Carregar metricas de atendimento
    carregarMetricasAtendimento();
    try {
        const data = await api('/api/whatsapp/metricas');
        document.getElementById('metricaEnviadas').textContent = data.enviadas || 0;
        document.getElementById('metricaRecebidas').textContent = data.recebidas || 0;
        document.getElementById('metricaTotal').textContent = (data.enviadas || 0) + (data.recebidas || 0);

        // Chart: mensagens por dia
        if (data.porDia && data.porDia.length) {
            const dias = [...new Set(data.porDia.map(d => d.dia))].sort();
            const enviadasPorDia = dias.map(d => (data.porDia.find(x => x.dia === d && x.tipo === 'enviada') || {}).total || 0);
            const recebidasPorDia = dias.map(d => (data.porDia.find(x => x.dia === d && x.tipo === 'recebida') || {}).total || 0);
            const diasLabel = dias.map(d => { const p = d.split('-'); return `${p[2]}/${p[1]}`; });

            if (chartMsgPorDia) chartMsgPorDia.destroy();
            const ctx = document.getElementById('chartMsgPorDia');
            if (ctx) {
                chartMsgPorDia = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: diasLabel,
                        datasets: [
                            { label: 'Enviadas', data: enviadasPorDia, backgroundColor: '#25d366' },
                            { label: 'Recebidas', data: recebidasPorDia, backgroundColor: '#4361ee' }
                        ]
                    },
                    options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
                });
            }
        }

        // Top contatos
        const topList = document.getElementById('topContatosList');
        if (topList && data.topContatos) {
            topList.innerHTML = data.topContatos.length ? data.topContatos.map((c, i) =>
                `<div class="d-flex align-items-center gap-2 py-1 ${i?'border-top':''}">
                    <span class="badge bg-secondary">${i+1}</span>
                    <span class="flex-grow-1 text-truncate" style="font-size:0.85rem">${escapeHtml(c.chat_nome||'?')}</span>
                    <span class="badge bg-primary">${c.total}</span>
                </div>`
            ).join('') : '<div class="text-muted text-center py-3">Sem dados ainda</div>';
        }
    } catch {}
}

// ==================== FILA DE ATENDIMENTO ====================

function initQueueUI() {
    const filterBar = document.getElementById('queueFilterBar');
    if (!filterBar) return;
    if (_isAdmin) {
        atendimentoFiltro = 'todos';
        filterBar.innerHTML = `<div class="btn-group btn-group-sm w-100" role="group">
            <button class="btn btn-outline-success active" onclick="setFiltro('todos',this)">Todos</button>
            <button class="btn btn-outline-warning" onclick="setFiltro('fila',this)">Fila <span id="badgeFila" class="badge bg-warning text-dark ms-1">0</span></button>
            <button class="btn btn-outline-primary" onclick="setFiltro('em_atendimento',this)">Atendendo</button>
        </div>`;
    } else {
        atendimentoFiltro = 'fila';
        filterBar.innerHTML = `<div class="btn-group btn-group-sm w-100" role="group">
            <button class="btn btn-outline-warning active" onclick="setFiltro('fila',this)">Fila <span id="badgeFila" class="badge bg-warning text-dark ms-1">0</span></button>
            <button class="btn btn-outline-primary" onclick="setFiltro('meus',this)">Meus <span id="badgeMeus" class="badge bg-primary ms-1">0</span></button>
        </div>`;
    }
    if (allChats.length) renderChats(allChats);
}

function setFiltro(filtro, btn) {
    atendimentoFiltro = filtro;
    if (btn) {
        btn.closest('.btn-group').querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }
    renderChats(allChats);
}

async function transferirChat(chatId) {
    try {
        const res = await fetch('/api/whatsapp/atendimentos/agentes');
        const agentes = await res.json();
        const options = agentes
            .filter(a => a.id !== _currentUserInfo?.id)
            .map(a => `<option value="${a.id}">${escapeHtml(a.nome)}</option>`)
            .join('');
        document.getElementById('transferAgentSelect').innerHTML = options;
        document.getElementById('transferChatId').value = chatId;
        new bootstrap.Modal(document.getElementById('modalTransferir')).show();
    } catch { mostrarToast('Erro ao carregar agentes', 'error'); }
}

async function confirmarTransferencia() {
    const chatId = document.getElementById('transferChatId').value;
    const paraAgenteId = document.getElementById('transferAgentSelect').value;
    if (!paraAgenteId) { mostrarToast('Selecione um agente', 'warning'); return; }
    try {
        const res = await fetch('/api/whatsapp/atendimentos/transferir', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, para_agente_id: parseInt(paraAgenteId) })
        });
        if (res.ok) {
            bootstrap.Modal.getInstance(document.getElementById('modalTransferir')).hide();
            mostrarToast('Chat transferido com sucesso!');
            currentChatId = null;
            document.getElementById('noChat').style.display = '';
            document.getElementById('activeChatContainer').style.display = 'none';
            loadChats();
        } else {
            const err = await res.json();
            mostrarToast(err.erro || 'Erro ao transferir', 'error');
        }
    } catch { mostrarToast('Erro ao transferir', 'error'); }
}

async function finalizarChat(chatId) {
    if (!await confirmar('Finalizar este atendimento?')) return;
    try {
        const res = await fetch('/api/whatsapp/atendimentos/finalizar', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, notas: '' })
        });
        if (res.ok) {
            mostrarToast('Atendimento finalizado!');
            currentChatId = null;
            document.getElementById('noChat').style.display = '';
            document.getElementById('activeChatContainer').style.display = 'none';
            loadChats();
        } else {
            const err = await res.json();
            mostrarToast(err.erro || 'Erro ao finalizar', 'error');
        }
    } catch { mostrarToast('Erro ao finalizar', 'error'); }
}

async function carregarMetricasAtendimento() {
    try {
        const data = await api('/api/whatsapp/atendimentos/metricas');
        const el = (id) => document.getElementById(id);
        if (el('metricaAtendNaFila')) el('metricaAtendNaFila').textContent = data.na_fila || 0;
        if (el('metricaAtendEmAtend')) el('metricaAtendEmAtend').textContent = data.em_atendimento || 0;
        if (el('metricaAtendFinalizados')) el('metricaAtendFinalizados').textContent = data.finalizados_hoje || 0;
        const tempoSeg = data.tempo_medio_espera_seg || 0;
        if (el('metricaAtendTempoMedio')) el('metricaAtendTempoMedio').textContent = tempoSeg >= 60 ? Math.round(tempoSeg / 60) + 'm' : tempoSeg + 's';
        const container = document.getElementById('atendPorAgenteContainer');
        const body = document.getElementById('atendPorAgenteBody');
        if (container && body && data.por_agente && data.por_agente.length) {
            container.style.display = '';
            body.innerHTML = data.por_agente.map(a =>
                `<tr><td>${escapeHtml(a.agente_nome || '?')}</td><td>${a.em_atendimento || 0}</td><td>${a.finalizados_hoje || 0}</td></tr>`
            ).join('');
        }
    } catch {}
}
