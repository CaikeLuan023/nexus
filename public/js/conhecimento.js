// ==================== BASE DE CONHECIMENTO ====================

let _kbArtigos = [];

document.addEventListener('DOMContentLoaded', () => {
    carregarCategorias();
    carregarArtigos();
});

async function carregarCategorias() {
    try {
        const cats = await api('/api/kb/categorias');
        const sidebar = document.getElementById('kbCategorias');
        const filtro = document.getElementById('kbFiltroCategoria');
        const artigoCat = document.getElementById('artigoCategoria');

        const filtroAtual = document.getElementById('kbFiltroCategoria').value;
        sidebar.innerHTML = `<a href="#" class="kb-cat-item${!filtroAtual ? ' active' : ''}" onclick="event.preventDefault();document.getElementById('kbFiltroCategoria').value='';carregarArtigos()">
            <div class="kb-cat-icon"><i class="bi bi-grid-3x3-gap"></i></div><span>Categorias</span></a>` +
            cats.map(c => `<a href="#" class="kb-cat-item${filtroAtual==c.id ? ' active' : ''}" onclick="event.preventDefault();document.getElementById('kbFiltroCategoria').value='${c.id}';carregarArtigos()">
                <div class="kb-cat-icon"><i class="bi ${c.icone || 'bi-folder'}"></i></div><span>${c.nome}</span>
            </a>`).join('');

        filtro.innerHTML = '<option value="">Todas as categorias</option>' +
            cats.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');

        artigoCat.innerHTML = '<option value="">Sem categoria</option>' +
            cats.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
    } catch (err) { console.error('KB categorias:', err); }
}

async function carregarArtigos() {
    try {
        const categoria_id = document.getElementById('kbFiltroCategoria').value;
        const params = categoria_id ? `?categoria_id=${categoria_id}` : '';
        const artigos = await api(`/api/kb/artigos${params}`);
        _kbArtigos = artigos;
        renderArtigos(artigos);
    } catch (err) { console.error('KB artigos:', err); }
}

function buscarArtigos() {
    const busca = document.getElementById('kbBusca').value.toLowerCase();
    const filtrados = _kbArtigos.filter(a =>
        a.titulo.toLowerCase().includes(busca) ||
        (a.tags || '').toLowerCase().includes(busca) ||
        (a.conteudo || '').toLowerCase().includes(busca)
    );
    renderArtigos(filtrados);
}

function renderArtigos(artigos) {
    const container = document.getElementById('kbArtigos');
    if (!artigos.length) {
        container.innerHTML = '<div class="col-12 text-center text-muted py-4">Nenhum artigo encontrado</div>';
        return;
    }
    container.innerHTML = artigos.map(a => `
        <div class="col-md-6">
            <div class="kb-article-card" onclick="verArtigo(${a.id})">
                <div class="kb-article-icon">
                    <i class="bi bi-file-text"></i>
                </div>
                <div class="kb-article-body">
                    <h6 class="kb-article-title">${a.titulo}</h6>
                    <p class="kb-article-preview">${stripKBMarkdown((a.conteudo || '')).substring(0, 120)}...</p>
                    <div class="kb-article-meta">
                        ${a.categoria_nome ? `<span class="badge bg-primary">${a.categoria_nome}</span>` : ''}
                        ${(a.tags || '').split(',').filter(t=>t.trim()).slice(0,3).map(t => `<span class="badge bg-secondary">${t.trim()}</span>`).join('')}
                        <span class="kb-article-views"><i class="bi bi-eye"></i> ${a.visualizacoes || 0}</span>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

function stripKBMarkdown(text) {
    return text
        .replace(/^={3,}$/gm, '')
        .replace(/^#{2,3}\s+/gm, '')
        .replace(/\*\*/g, '')
        .replace(/^>\s+/gm, '')
        .replace(/^-\s+/gm, '- ')
        .replace(/`/g, '')
        .replace(/\n{2,}/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function formatarConteudoKB(texto) {
    let html = texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // === underline headers (legacy)
    html = html.replace(/^(.+)\n={3,}$/gm, '<h4 class="kb-section-title">$1</h4>');

    // ### subsection headers
    html = html.replace(/^### (.+)$/gm, '<h5 class="kb-subsection">$1</h5>');

    // ## section headers
    html = html.replace(/^## (.+)$/gm, '<h4 class="kb-section-title">$1</h4>');

    // ALL CAPS label ending with : (legacy)
    html = html.replace(/^([A-Z][A-Z\s\/\(\)]+:)\s*$/gm, '<h5 class="kb-subsection">$1</h5>');

    // > callout/tip
    html = html.replace(/^&gt; (.+)$/gm, '<div class="kb-callout"><i class="bi bi-lightbulb me-2"></i>$1</div>');

    // Numbered items
    html = html.replace(/^(\d+)\.\s+(.+)$/gm, '<div class="kb-item"><span class="kb-item-num">$1.</span> $2</div>');

    // Bullet items
    html = html.replace(/^- (.+)$/gm, '<div class="kb-bullet"><i class="bi bi-chevron-right"></i>$1</div>');

    // Keyword label alone on line
    html = html.replace(/^([A-Z][A-Za-z\s\/]+):\s*$/gm, '<h6 class="kb-label">$1</h6>');

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Inline code
    html = html.replace(/`(.+?)`/g, '<code class="kb-code">$1</code>');

    // Wrap remaining lines
    html = html.split('\n').map(line => {
        const trimmed = line.trim();
        if (!trimmed) return '<div class="kb-spacer"></div>';
        if (trimmed.startsWith('<')) return line;
        return `<div class="kb-line">${line}</div>`;
    }).join('\n');

    return html;
}

async function verArtigo(id) {
    try {
        const a = await api(`/api/kb/artigos/${id}`);
        document.getElementById('verArtigoTitulo').textContent = a.titulo;
        document.getElementById('verArtigoConteudo').innerHTML = `<div class="kb-content">${formatarConteudoKB(a.conteudo)}</div>`;
        document.getElementById('verArtigoMeta').innerHTML = `
            ${a.categoria_nome ? `<span class="badge bg-primary me-2">${a.categoria_nome}</span>` : ''}
            <i class="bi bi-eye me-1"></i>${a.visualizacoes} visualizacoes | Atualizado: ${a.atualizado_em || a.criado_em}`;
        new bootstrap.Modal(document.getElementById('modalVerArtigo')).show();
    } catch (err) { mostrarToast(err.message, 'error'); }
}

function abrirModalArtigo() {
    document.getElementById('artigoId').value = '';
    document.getElementById('artigoTitulo').value = '';
    document.getElementById('artigoConteudo').value = '';
    document.getElementById('artigoTags').value = '';
    document.getElementById('artigoCategoria').value = '';
    document.getElementById('artigoPublicado').value = '1';
    document.getElementById('modalArtigoTitulo').textContent = 'Novo Artigo';
    new bootstrap.Modal(document.getElementById('modalArtigo')).show();
}

async function editarArtigo(id) {
    try {
        const a = await api(`/api/kb/artigos/${id}`);
        document.getElementById('artigoId').value = a.id;
        document.getElementById('artigoTitulo').value = a.titulo;
        document.getElementById('artigoConteudo').value = a.conteudo;
        document.getElementById('artigoTags').value = a.tags || '';
        document.getElementById('artigoCategoria').value = a.categoria_id || '';
        document.getElementById('artigoPublicado').value = a.publicado;
        document.getElementById('modalArtigoTitulo').textContent = 'Editar Artigo';
        new bootstrap.Modal(document.getElementById('modalArtigo')).show();
    } catch (err) { mostrarToast(err.message, 'error'); }
}

async function salvarArtigo() {
    const id = document.getElementById('artigoId').value;
    const data = {
        titulo: document.getElementById('artigoTitulo').value.trim(),
        conteudo: document.getElementById('artigoConteudo').value.trim(),
        tags: document.getElementById('artigoTags').value.trim(),
        categoria_id: document.getElementById('artigoCategoria').value || null,
        publicado: Number(document.getElementById('artigoPublicado').value)
    };
    if (!data.titulo || !data.conteudo) { mostrarToast('Titulo e conteudo sao obrigatorios', 'warning'); return; }

    try {
        if (id) {
            await api(`/api/kb/artigos/${id}`, { method: 'PUT', body: data });
            mostrarToast('Artigo atualizado!');
        } else {
            await api('/api/kb/artigos', { method: 'POST', body: data });
            mostrarToast('Artigo criado!');
        }
        bootstrap.Modal.getInstance(document.getElementById('modalArtigo')).hide();
        carregarArtigos();
    } catch (err) { mostrarToast(err.message, 'error'); }
}

async function excluirArtigo(id) {
    if (!confirm('Excluir este artigo?')) return;
    try {
        await api(`/api/kb/artigos/${id}`, { method: 'DELETE' });
        mostrarToast('Artigo excluido!');
        carregarArtigos();
    } catch (err) { mostrarToast(err.message, 'error'); }
}

function abrirModalCategoria() {
    document.getElementById('categoriaId').value = '';
    document.getElementById('categoriaNome').value = '';
    document.getElementById('categoriaIcone').value = 'bi-folder';
    new bootstrap.Modal(document.getElementById('modalCategoria')).show();
}

async function salvarCategoria() {
    const data = {
        nome: document.getElementById('categoriaNome').value.trim(),
        icone: document.getElementById('categoriaIcone').value.trim() || 'bi-folder'
    };
    if (!data.nome) { mostrarToast('Nome obrigatorio', 'warning'); return; }

    try {
        await api('/api/kb/categorias', { method: 'POST', body: data });
        mostrarToast('Categoria criada!');
        bootstrap.Modal.getInstance(document.getElementById('modalCategoria')).hide();
        carregarCategorias();
    } catch (err) { mostrarToast(err.message, 'error'); }
}

async function excluirCategoria(id) {
    if (!confirm('Excluir esta categoria?')) return;
    try {
        await api(`/api/kb/categorias/${id}`, { method: 'DELETE' });
        mostrarToast('Categoria excluida!');
        carregarCategorias();
        carregarArtigos();
    } catch (err) { mostrarToast(err.message, 'error'); }
}
