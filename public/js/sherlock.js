// ==================== SHERLOCK - AI DATA ANALYSIS AGENT ====================

let conversaAtual = null;
let mensagensContainer = null;
let enviando = false;

document.addEventListener('DOMContentLoaded', () => {
    mensagensContainer = document.getElementById('sherlockMessages');
    carregarConversas();
});

// ==================== CONVERSAS ====================

async function carregarConversas() {
    try {
        const conversas = await api('/api/sherlock/conversas');
        const list = document.getElementById('conversasList');
        if (!conversas.length) {
            list.innerHTML = '<div class="text-center text-muted py-3 small">Nenhuma conversa ainda</div>';
            return;
        }
        list.innerHTML = conversas.map(c => `
            <div class="sherlock-conversa-item ${conversaAtual === c.id ? 'active' : ''}"
                 onclick="abrirConversa(${c.id})">
                <div class="sherlock-conversa-titulo">${escapeHtml(c.titulo)}</div>
                <div class="sherlock-conversa-data">${formatarDataHora(c.atualizado_em)}</div>
                <button class="sherlock-conversa-delete btn-close btn-close-sm"
                    onclick="event.stopPropagation();excluirConversa(${c.id})" title="Excluir"></button>
            </div>
        `).join('');
    } catch (e) {
        console.error('Erro ao carregar conversas:', e);
    }
}

async function abrirConversa(id) {
    try {
        const msgs = await api(`/api/sherlock/conversas/${id}/mensagens`);
        conversaAtual = id;
        document.getElementById('sherlockWelcome').style.display = 'none';
        mensagensContainer.style.display = 'flex';
        mensagensContainer.innerHTML = '';
        for (const m of msgs) {
            appendMensagem(m.role, m.conteudo, m.tempo_resposta_ms);
        }
        scrollToBottom();
        carregarConversas();
    } catch (e) {
        mostrarToast('Erro ao abrir conversa', 'error');
    }
}

function novaConversa() {
    conversaAtual = null;
    document.getElementById('sherlockWelcome').style.display = 'flex';
    mensagensContainer.style.display = 'none';
    mensagensContainer.innerHTML = '';
    document.getElementById('sherlockInput').focus();
}

async function excluirConversa(id) {
    if (!confirm('Excluir esta conversa?')) return;
    try {
        await api(`/api/sherlock/conversas/${id}`, { method: 'DELETE' });
        if (conversaAtual === id) novaConversa();
        carregarConversas();
        mostrarToast('Conversa excluida');
    } catch (e) {
        mostrarToast('Erro ao excluir', 'error');
    }
}

function toggleHistorico() {
    const sidebar = document.getElementById('sherlockSidebar');
    sidebar.style.display = sidebar.style.display === 'none' ? 'flex' : 'none';
}

// ==================== MENSAGENS ====================

async function enviarMensagem() {
    const input = document.getElementById('sherlockInput');
    const texto = input.value.trim();
    if (!texto || enviando) return;

    enviando = true;
    input.value = '';
    document.getElementById('btnEnviar').disabled = true;

    document.getElementById('sherlockWelcome').style.display = 'none';
    mensagensContainer.style.display = 'flex';

    appendMensagem('user', texto);
    scrollToBottom();

    document.getElementById('sherlockTyping').style.display = 'block';
    scrollToBottom();

    try {
        const resp = await api('/api/sherlock/chat', {
            method: 'POST',
            body: { mensagem: texto, conversa_id: conversaAtual }
        });

        document.getElementById('sherlockTyping').style.display = 'none';
        conversaAtual = resp.conversa_id;
        appendMensagem('assistant', resp.mensagem, resp.tempo_ms);
        scrollToBottom();
        carregarConversas();
    } catch (e) {
        document.getElementById('sherlockTyping').style.display = 'none';
        appendMensagem('assistant', 'Desculpe, ocorreu um erro: ' + e.message);
        scrollToBottom();
    }

    enviando = false;
    document.getElementById('btnEnviar').disabled = false;
    input.focus();
}

function enviarSugestao(texto) {
    document.getElementById('sherlockInput').value = texto;
    enviarMensagem();
}

function appendMensagem(role, conteudo, tempoMs) {
    const div = document.createElement('div');
    div.className = `sherlock-msg sherlock-msg-${role}`;

    const avatarIcon = role === 'user' ? 'bi-person-fill' : 'bi-search';

    let htmlContent;
    if (role === 'assistant') {
        htmlContent = formatarRespostaSherlock(conteudo);
    } else {
        htmlContent = escapeHtml(conteudo);
    }

    let metaHtml = '';
    if (tempoMs && role === 'assistant') {
        const secs = (tempoMs / 1000).toFixed(1);
        metaHtml = `<div class="sherlock-msg-meta"><small class="text-muted">${secs}s</small></div>`;
    }

    div.innerHTML = `
        <div class="sherlock-msg-avatar"><i class="bi ${avatarIcon}"></i></div>
        <div class="sherlock-msg-content">
            <div class="sherlock-msg-bubble">${htmlContent}</div>
            ${metaHtml}
        </div>
    `;

    mensagensContainer.appendChild(div);
}

function formatarRespostaSherlock(text) {
    // Escape HTML first for safety, but preserve markdown structure
    let escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Code blocks: ```text```
    escaped = escaped.replace(/```([^`]+)```/gs, '<pre class="sherlock-code"><code>$1</code></pre>');
    // Inline code: `text`
    escaped = escaped.replace(/`([^`]+)`/g, '<code class="sherlock-inline-code">$1</code>');

    // Markdown tables
    escaped = escaped.replace(/\n?\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)*)/g, (match, header, body) => {
        const headers = header.split('|').map(h => h.trim()).filter(Boolean);
        const rows = body.trim().split('\n').map(row =>
            row.split('|').map(c => c.trim()).filter(Boolean)
        );
        let html = '<div class="table-responsive my-2"><table class="table table-sm table-bordered mb-0"><thead><tr>';
        headers.forEach(h => html += `<th class="small">${h}</th>`);
        html += '</tr></thead><tbody>';
        rows.forEach(r => {
            html += '<tr>';
            r.forEach(c => html += `<td class="small">${c}</td>`);
            html += '</tr>';
        });
        html += '</tbody></table></div>';
        return html;
    });

    // Headers
    escaped = escaped.replace(/^### (.+)$/gm, '<h6 class="mt-3 mb-1 fw-bold">$1</h6>');
    escaped = escaped.replace(/^## (.+)$/gm, '<h5 class="mt-3 mb-1 fw-bold">$1</h5>');
    // Bold
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic
    escaped = escaped.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
    // Unordered lists
    escaped = escaped.replace(/((?:^|\n)- .+(?:\n- .+)*)/g, (match) => {
        const items = match.trim().split('\n').map(line => `<li>${line.replace(/^- /, '')}</li>`).join('');
        return `<ul class="mb-2 ps-3">${items}</ul>`;
    });
    // Ordered lists
    escaped = escaped.replace(/((?:^|\n)\d+\. .+(?:\n\d+\. .+)*)/g, (match) => {
        const items = match.trim().split('\n').map(line => `<li>${line.replace(/^\d+\. /, '')}</li>`).join('');
        return `<ol class="mb-2 ps-3">${items}</ol>`;
    });
    // Line breaks
    escaped = escaped.replace(/\n/g, '<br>');

    return escaped;
}

function scrollToBottom() {
    if (mensagensContainer) {
        setTimeout(() => { mensagensContainer.scrollTop = mensagensContainer.scrollHeight; }, 50);
    }
}

// Helper - uses global escapeHtml from app.js if available
function escapeHtml(str) {
    if (typeof escapeHtmlGlobal === 'function') return escapeHtmlGlobal(str);
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
