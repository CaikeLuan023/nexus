// ==================== CHAMADOS ====================

let chamadoAtualId = null;
let _chamadosData = [];

document.addEventListener('DOMContentLoaded', () => {
    carregarProvedores(document.getElementById('filtroProvedor'));
    carregarProvedores(document.getElementById('chamadoProvedor'));
    carregarResponsaveis();
    carregarChamados();

    // Restaurar vista salva
    if (localStorage.getItem('chamados_vista') === 'kanban') setVistaKanban(true);

    // Filtros automáticos
    [
        'filtroProvedor',
        'filtroCategoria',
        'filtroStatus',
        'filtroPrioridade',
        'filtroDataInicio',
        'filtroDataFim'
    ].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', carregarChamados);
    });

    // Upload de anexo
    document.getElementById('formAnexo').addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('inputAnexo');
        if (!input.files.length || !chamadoAtualId) return;

        const formData = new FormData();
        for (const file of input.files) formData.append('arquivos', file);

        try {
            await fetch(`/api/chamados/${chamadoAtualId}/anexos`, { method: 'POST', body: formData });
            input.value = '';
            mostrarToast('Anexo(s) enviado(s)!');
            verChamado(chamadoAtualId);
        } catch (err) {
            mostrarToast('Erro ao enviar anexo', 'error');
        }
    });
});

async function carregarChamados() {
    const params = new URLSearchParams();
    const provedor = document.getElementById('filtroProvedor').value;
    const categoria = document.getElementById('filtroCategoria').value;
    const status = document.getElementById('filtroStatus').value;
    const prioridade = document.getElementById('filtroPrioridade')?.value;
    const dataInicio = document.getElementById('filtroDataInicio').value;
    const dataFim = document.getElementById('filtroDataFim').value;

    if (provedor) params.set('provedor_id', provedor);
    if (categoria) params.set('categoria', categoria);
    if (status) params.set('status', status);
    if (prioridade) params.set('prioridade', prioridade);
    if (dataInicio) params.set('data_inicio', dataInicio);
    if (dataFim) params.set('data_fim', dataFim);

    try {
        const chamados = await api(`/api/chamados?${params}`);
        _chamadosData = chamados;
        renderTabela(chamados);
        if (localStorage.getItem('chamados_vista') === 'kanban') renderKanban(chamados);
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

function badgePrioridade(p) {
    const map = {
        baixa: '<span class="badge bg-secondary">Baixa</span>',
        normal: '<span class="badge bg-info">Normal</span>',
        alta: '<span class="badge bg-warning text-dark">Alta</span>',
        critica: '<span class="badge bg-danger">Critica</span>'
    };
    return map[p] || map.normal;
}

function slaIndicator(c) {
    if (c.status === 'resolvido' || c.status === 'fechado') {
        return c.sla_estourado
            ? '<span class="badge bg-danger"><i class="bi bi-x-circle me-1"></i>Estourado</span>'
            : '<span class="badge bg-success"><i class="bi bi-check-circle me-1"></i>OK</span>';
    }
    if (!c.sla_resolucao_limite) return '<span class="text-muted">-</span>';
    const agora = new Date();
    const limite = new Date(c.sla_resolucao_limite.replace(' ', 'T'));
    const diff = limite - agora;
    if (c.sla_estourado || diff <= 0) {
        return '<span class="badge bg-danger"><i class="bi bi-exclamation-triangle me-1"></i>Estourado</span>';
    }
    const horasRestantes = diff / 3600000;
    if (horasRestantes <= 2) {
        return `<span class="badge bg-warning text-dark"><i class="bi bi-clock me-1"></i>${Math.ceil(horasRestantes)}h</span>`;
    }
    if (horasRestantes <= 24) {
        return `<span class="badge bg-info"><i class="bi bi-clock me-1"></i>${Math.ceil(horasRestantes)}h</span>`;
    }
    return `<span class="badge bg-success"><i class="bi bi-clock me-1"></i>${Math.ceil(horasRestantes / 24)}d</span>`;
}

function renderTabela(chamados) {
    const tbody = document.getElementById('tabelaChamados');
    if (chamados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">Nenhum chamado encontrado</td></tr>';
        return;
    }

    tbody.innerHTML = chamados
        .map(
            (c) => `
        <tr>
            <td class="text-muted">${c.id}</td>
            <td class="fw-medium">${c.provedor_nome}</td>
            <td>${c.titulo}</td>
            <td>${badgeCategoria(c.categoria)}</td>
            <td>${badgePrioridade(c.prioridade)}</td>
            <td>${badgeStatus(c.status)}</td>
            <td>${slaIndicator(c)}</td>
            <td><small>${formatarData(c.data_abertura)}</small></td>
            <td>
                <div class="d-flex gap-1">
                    <button class="btn btn-sm btn-outline-info btn-action" onclick="verChamado(${c.id})" title="Detalhes"><i class="bi bi-eye"></i></button>
                    <button class="btn btn-sm btn-outline-primary btn-action" onclick="editarChamado(${c.id})" title="Editar"><i class="bi bi-pencil"></i></button>
                    ${c.status === 'pendente' || c.status === 'em_andamento' ? `<button class="btn btn-sm btn-outline-success btn-action" onclick="resolverChamado(${c.id})" title="Resolver"><i class="bi bi-check-lg"></i></button>` : ''}
                    <button class="btn btn-sm btn-outline-danger btn-action" onclick="excluirChamado(${c.id})" title="Excluir"><i class="bi bi-trash"></i></button>
                </div>
            </td>
        </tr>
    `
        )
        .join('');
}

async function carregarResponsaveis() {
    try {
        const users = await api('/api/usuarios/lista');
        const sel = document.getElementById('chamadoResponsavel');
        sel.innerHTML = '<option value="">Nenhum</option>';
        users.forEach((u) => {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = u.nome;
            sel.appendChild(opt);
        });
    } catch {}
}

function abrirModalChamado() {
    document.getElementById('chamadoId').value = '';
    document.getElementById('chamadoProvedor').value = '';
    document.getElementById('chamadoCategoria').value = '';
    document.getElementById('chamadoTitulo').value = '';
    document.getElementById('chamadoDescricao').value = '';
    document.getElementById('chamadoPrioridade').value = 'normal';
    document.getElementById('chamadoResponsavel').value = '';
    document.getElementById('campoStatus').style.display = 'none';
    document.getElementById('campoResolucao').style.display = 'none';
    document.getElementById('modalChamadoTitulo').textContent = 'Novo Chamado';
    new bootstrap.Modal(document.getElementById('modalChamado')).show();
}

async function editarChamado(id) {
    try {
        const c = await api(`/api/chamados/${id}`);
        document.getElementById('chamadoId').value = c.id;
        document.getElementById('chamadoProvedor').value = c.provedor_id;
        document.getElementById('chamadoCategoria').value = c.categoria;
        document.getElementById('chamadoTitulo').value = c.titulo;
        document.getElementById('chamadoDescricao').value = c.descricao || '';
        document.getElementById('chamadoPrioridade').value = c.prioridade || 'normal';
        document.getElementById('chamadoStatus').value = c.status;
        document.getElementById('chamadoResolucao').value = c.resolucao || '';
        document.getElementById('chamadoResponsavel').value = c.responsavel_id || '';
        document.getElementById('campoStatus').style.display = '';
        document.getElementById('campoResolucao').style.display = '';
        document.getElementById('modalChamadoTitulo').textContent = 'Editar Chamado';
        new bootstrap.Modal(document.getElementById('modalChamado')).show();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function salvarChamado() {
    const id = document.getElementById('chamadoId').value;
    const data = {
        provedor_id: document.getElementById('chamadoProvedor').value,
        titulo: document.getElementById('chamadoTitulo').value.trim(),
        descricao: document.getElementById('chamadoDescricao').value.trim(),
        categoria: document.getElementById('chamadoCategoria').value,
        prioridade: document.getElementById('chamadoPrioridade').value || 'normal',
        responsavel_id: document.getElementById('chamadoResponsavel').value || null
    };

    if (!data.provedor_id || !data.titulo || !data.categoria) {
        mostrarToast('Preencha todos os campos obrigatórios', 'warning');
        return;
    }

    if (id) {
        data.status = document.getElementById('chamadoStatus').value;
        data.resolucao = document.getElementById('chamadoResolucao').value.trim();
    }

    try {
        if (id) {
            await api(`/api/chamados/${id}`, { method: 'PUT', body: data });
            mostrarToast('Chamado atualizado!');
        } else {
            await api('/api/chamados', { method: 'POST', body: data });
            mostrarToast('Chamado criado!');
        }
        bootstrap.Modal.getInstance(document.getElementById('modalChamado')).hide();
        carregarChamados();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function verChamado(id) {
    chamadoAtualId = id;
    try {
        const c = await api(`/api/chamados/${id}`);
        const container = document.getElementById('detalhesConteudo');

        let anexosHtml = '';
        if (c.anexos && c.anexos.length > 0) {
            // Store image paths for gallery
            window._galeriaAnexos = c.anexos
                .filter((a) => /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(a.nome_arquivo))
                .map((a) => '/' + a.caminho);

            const fileIconMap = {
                pdf: 'bi-file-earmark-pdf text-danger',
                doc: 'bi-file-earmark-word text-primary',
                docx: 'bi-file-earmark-word text-primary',
                xls: 'bi-file-earmark-excel text-success',
                xlsx: 'bi-file-earmark-excel text-success',
                ppt: 'bi-file-earmark-ppt text-warning',
                pptx: 'bi-file-earmark-ppt text-warning',
                zip: 'bi-file-earmark-zip text-secondary',
                rar: 'bi-file-earmark-zip text-secondary',
                mp4: 'bi-file-earmark-play text-info',
                mp3: 'bi-file-earmark-music text-info',
                txt: 'bi-file-earmark-text text-muted',
                csv: 'bi-file-earmark-spreadsheet text-success'
            };

            anexosHtml = `
                <h6 class="mt-3 mb-2"><i class="bi bi-paperclip me-1"></i>Anexos (${c.anexos.length})</h6>
                <div class="d-flex flex-wrap gap-2">
                    ${c.anexos
                        .map((a) => {
                            const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(a.nome_arquivo);
                            if (isImage) {
                                return `<div class="position-relative">
                                <img src="/${a.caminho}" class="anexo-thumb" onclick="ampliarImagem('/${a.caminho}')" title="${a.nome_arquivo}">
                                <button class="btn btn-sm btn-danger position-absolute top-0 end-0" style="padding:0.1rem 0.3rem;font-size:0.65rem" onclick="excluirAnexo(${a.id})"><i class="bi bi-x"></i></button>
                            </div>`;
                            }
                            const ext = a.nome_arquivo.split('.').pop().toLowerCase();
                            const icon = fileIconMap[ext] || 'bi-file-earmark text-muted';
                            return `<div class="anexo-file">
                            <i class="bi ${icon} fs-4"></i>
                            <a href="/${a.caminho}" target="_blank" class="text-decoration-none flex-grow-1">${a.nome_arquivo}</a>
                            <button class="btn btn-sm btn-outline-danger" style="padding:0.1rem 0.3rem;font-size:0.65rem" onclick="excluirAnexo(${a.id})"><i class="bi bi-x"></i></button>
                        </div>`;
                        })
                        .join('')}
                </div>
            `;
        }

        // SLA banner
        let slaBannerHtml = '';
        if (c.sla_resolucao_limite && c.status !== 'fechado') {
            const agora = new Date();
            const limiteResp = c.sla_resposta_limite ? new Date(c.sla_resposta_limite.replace(' ', 'T')) : null;
            const limiteResol = new Date(c.sla_resolucao_limite.replace(' ', 'T'));
            const diffResol = limiteResol - agora;
            let slaClass = 'success';
            let slaIcon = 'bi-check-circle';
            let slaLabel = 'SLA dentro do prazo';
            if (c.sla_estourado || diffResol <= 0) {
                slaClass = 'danger';
                slaIcon = 'bi-exclamation-triangle';
                slaLabel = 'SLA ESTOURADO';
            } else if (diffResol <= 7200000) {
                slaClass = 'warning';
                slaIcon = 'bi-clock-history';
                slaLabel = 'SLA proximo de estourar';
            }
            slaBannerHtml = `
                <div class="alert alert-${slaClass} d-flex align-items-center py-2 mb-0" role="alert">
                    <i class="bi ${slaIcon} me-2 fs-5"></i>
                    <div class="flex-grow-1">
                        <strong>${slaLabel}</strong>
                        <div class="d-flex gap-4 mt-1" style="font-size:0.85rem">
                            <span><i class="bi bi-reply me-1"></i>Resposta: ${c.sla_respondido_em ? formatarDataHora(c.sla_respondido_em) : limiteResp ? 'ate ' + formatarDataHora(c.sla_resposta_limite) : '-'}</span>
                            <span><i class="bi bi-check2-all me-1"></i>Resolucao: ${c.status === 'resolvido' ? formatarDataHora(c.data_resolucao) : 'ate ' + formatarDataHora(c.sla_resolucao_limite)}</span>
                        </div>
                    </div>
                    <div class="text-end">
                        ${badgePrioridade(c.prioridade)}
                    </div>
                </div>`;
        }
        const slaContainer = document.getElementById('slaBannerContainer');
        if (slaContainer) slaContainer.innerHTML = slaBannerHtml;

        container.innerHTML = `
            <div class="row g-3">
                <div class="col-md-4">
                    <small class="text-muted">Provedor</small>
                    <p class="fw-medium mb-2">${c.provedor_nome}</p>
                </div>
                <div class="col-md-3">
                    <small class="text-muted">Categoria</small>
                    <p class="mb-2">${badgeCategoria(c.categoria)}</p>
                </div>
                <div class="col-md-2">
                    <small class="text-muted">Prioridade</small>
                    <p class="mb-2">${badgePrioridade(c.prioridade)}</p>
                </div>
                <div class="col-md-3">
                    <small class="text-muted">Status</small>
                    <p class="mb-2">${badgeStatus(c.status)}</p>
                </div>
                <div class="col-12">
                    <small class="text-muted">Título</small>
                    <p class="fw-medium mb-2">${c.titulo}</p>
                </div>
                <div class="col-12">
                    <small class="text-muted">Descrição</small>
                    <p class="mb-2">${c.descricao || '<span class="text-muted">-</span>'}</p>
                </div>
                <div class="col-md-4">
                    <small class="text-muted">Abertura</small>
                    <p class="mb-2">${formatarDataHora(c.data_abertura)}</p>
                </div>
                <div class="col-md-4">
                    <small class="text-muted">Resolução</small>
                    <p class="mb-2">${c.data_resolucao ? formatarDataHora(c.data_resolucao) : '-'}</p>
                </div>
                <div class="col-md-4">
                    <small class="text-muted">Detalhes da Resolução</small>
                    <p class="mb-2">${c.resolucao || '-'}</p>
                </div>
            </div>
            ${anexosHtml}
        `;

        new bootstrap.Modal(document.getElementById('modalDetalhes')).show();
        carregarComentariosChamado(id);
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

let galeriaImagens = [];
let galeriaIndice = 0;

function ampliarImagem(src) {
    // Build gallery from stored image paths
    if (window._galeriaAnexos && window._galeriaAnexos.length > 0) {
        galeriaImagens = window._galeriaAnexos;
        galeriaIndice = galeriaImagens.indexOf(src);
        if (galeriaIndice === -1) galeriaIndice = 0;
    } else {
        galeriaImagens = [src];
        galeriaIndice = 0;
    }

    atualizarGaleria();

    // Show/hide navigation buttons
    const navBtns = document.querySelectorAll('.galeria-nav');
    navBtns.forEach((btn) => (btn.style.display = galeriaImagens.length > 1 ? 'block' : 'none'));

    new bootstrap.Modal(document.getElementById('modalImagem')).show();
}

function atualizarGaleria() {
    document.getElementById('imagemAmpliada').src = galeriaImagens[galeriaIndice];
    const counter = document.getElementById('galeriaCounter');
    if (counter)
        counter.textContent = galeriaImagens.length > 1 ? `${galeriaIndice + 1} / ${galeriaImagens.length}` : '';
}

function galeriaAnterior() {
    galeriaIndice = (galeriaIndice - 1 + galeriaImagens.length) % galeriaImagens.length;
    atualizarGaleria();
}

function galeriaProxima() {
    galeriaIndice = (galeriaIndice + 1) % galeriaImagens.length;
    atualizarGaleria();
}

async function resolverChamado(id) {
    try {
        const c = await api(`/api/chamados/${id}`);
        await api(`/api/chamados/${id}`, {
            method: 'PUT',
            body: { ...c, status: 'resolvido' }
        });
        mostrarToast('Chamado resolvido!');
        carregarChamados();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function excluirChamado(id) {
    if (!(await confirmar('Tem certeza que deseja excluir este chamado e todos os seus anexos?'))) return;
    try {
        await api(`/api/chamados/${id}`, { method: 'DELETE' });
        mostrarToast('Chamado excluído!');
        carregarChamados();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function excluirAnexo(id) {
    try {
        await api(`/api/anexos/${id}`, { method: 'DELETE' });
        mostrarToast('Anexo removido!');
        verChamado(chamadoAtualId);
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

function limparFiltros() {
    document.getElementById('filtroProvedor').value = '';
    document.getElementById('filtroCategoria').value = '';
    document.getElementById('filtroStatus').value = '';
    document.getElementById('filtroPrioridade').value = '';
    document.getElementById('filtroDataInicio').value = '';
    document.getElementById('filtroDataFim').value = '';
    carregarChamados();
}

// ==================== NOVO PROVEDOR (inline) ====================

function abrirModalNovoProvedor() {
    document.getElementById('novoProvedorNome').value = '';
    document.getElementById('novoProvedorContato').value = '';
    document.getElementById('novoProvedorPlano').value = '';
    document.getElementById('novoProvedorModelo').value = '';
    document.getElementById('novoProvedorERP').value = '';
    document.querySelectorAll('.novo-prov-add').forEach((cb) => (cb.checked = false));
    new bootstrap.Modal(document.getElementById('modalNovoProvedor')).show();
}

async function salvarNovoProvedor() {
    const nome = document.getElementById('novoProvedorNome').value.trim();
    const contato = document.getElementById('novoProvedorContato').value.trim();
    const plano = document.getElementById('novoProvedorPlano').value;
    const modelo_integracao = document.getElementById('novoProvedorModelo').value;
    const erp = document.getElementById('novoProvedorERP').value;
    const adicionais = Array.from(document.querySelectorAll('.novo-prov-add:checked'))
        .map((cb) => cb.value)
        .join(',');

    if (!nome) {
        mostrarToast('Nome do provedor é obrigatório', 'warning');
        return;
    }

    try {
        const novo = await api('/api/provedores', {
            method: 'POST',
            body: { nome, contato, plano, modelo_integracao, erp, adicionais }
        });
        mostrarToast(`Provedor "${novo.nome}" cadastrado!`);
        bootstrap.Modal.getInstance(document.getElementById('modalNovoProvedor')).hide();

        // Atualizar dropdowns e selecionar o novo provedor
        await carregarProvedores(document.getElementById('chamadoProvedor'), novo.id);
        await carregarProvedores(document.getElementById('filtroProvedor'));
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

// ==================== KANBAN BOARD ====================

function setVistaTabela() {
    localStorage.setItem('chamados_vista', 'tabela');
    document.getElementById('vistaTabela').style.display = '';
    document.getElementById('vistaKanban').style.display = 'none';
    document.getElementById('btnVistaTabela').classList.add('active');
    document.getElementById('btnVistaKanban').classList.remove('active');
}

function setVistaKanban(skipSave) {
    if (!skipSave) localStorage.setItem('chamados_vista', 'kanban');
    document.getElementById('vistaTabela').style.display = 'none';
    document.getElementById('vistaKanban').style.display = 'flex';
    document.getElementById('btnVistaTabela').classList.remove('active');
    document.getElementById('btnVistaKanban').classList.add('active');
    renderKanban(_chamadosData);
}

function renderKanban(chamados) {
    const board = document.getElementById('vistaKanban');
    const columns = [
        { status: 'pendente', label: 'Pendente', color: 'warning' },
        { status: 'em_andamento', label: 'Em Andamento', color: 'primary' },
        { status: 'resolvido', label: 'Resolvido', color: 'success' },
        { status: 'fechado', label: 'Fechado', color: 'secondary' }
    ];

    board.innerHTML = columns
        .map((col) => {
            const items = chamados.filter((c) => c.status === col.status);
            return `
            <div class="kanban-column">
                <div class="kanban-column-header">
                    <span class="text-${col.color}">${col.label}</span>
                    <span class="badge bg-${col.color}">${items.length}</span>
                </div>
                <div class="kanban-column-body" data-status="${col.status}"
                     ondragover="event.preventDefault();this.classList.add('drag-over')"
                     ondragleave="this.classList.remove('drag-over')"
                     ondrop="dropKanban(event, '${col.status}')">
                    ${items
                        .map(
                            (c) => `
                        <div class="kanban-card" draggable="true"
                             ondragstart="event.dataTransfer.setData('text/plain','${c.id}');this.classList.add('dragging')"
                             ondragend="this.classList.remove('dragging')"
                             onclick="verChamado(${c.id})">
                            <div class="d-flex justify-content-between align-items-start">
                                <div class="kanban-card-title">${c.titulo}</div>
                                ${slaIndicator(c)}
                            </div>
                            <div class="kanban-card-meta">
                                <i class="bi bi-building me-1"></i>${c.provedor_nome}
                                <span class="ms-2">${badgeCategoria(c.categoria)}</span>
                                <span class="ms-2">${badgePrioridade(c.prioridade)}</span>
                            </div>
                            <div class="kanban-card-meta mt-1">
                                <i class="bi bi-calendar me-1"></i>${formatarData(c.data_abertura)}
                            </div>
                        </div>
                    `
                        )
                        .join('')}
                </div>
            </div>
        `;
        })
        .join('');
}

async function dropKanban(event, newStatus) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    const id = event.dataTransfer.getData('text/plain');
    if (!id) return;

    try {
        await api(`/api/chamados/${id}/status`, { method: 'PATCH', body: { status: newStatus } });
        carregarChamados();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

// ==================== COMENTARIOS CHAMADO ====================

async function carregarComentariosChamado(chamadoId) {
    try {
        const comentarios = await api(`/api/comentarios/chamado/${chamadoId}`);
        const container = document.getElementById('chamadoComentarios');
        if (!comentarios.length) {
            container.innerHTML = '<div class="text-center text-muted py-2"><small>Nenhum comentario</small></div>';
            return;
        }
        container.innerHTML = comentarios
            .map((c) => {
                const iniciais = c.usuario_nome
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .substring(0, 2)
                    .toUpperCase();
                return `<div class="comentario-item">
                <div class="comentario-avatar">${iniciais}</div>
                <div class="comentario-body">
                    <div class="comentario-header"><strong>${c.usuario_nome}</strong> - ${formatarDataHora(c.criado_em)}</div>
                    <div class="comentario-texto">${c.texto}</div>
                </div>
            </div>`;
            })
            .join('');
        container.scrollTop = container.scrollHeight;
    } catch {}
}

async function enviarComentarioChamado() {
    const input = document.getElementById('novoComentarioChamado');
    const texto = input.value.trim();
    if (!texto || !chamadoAtualId) return;

    try {
        await api(`/api/comentarios/chamado/${chamadoAtualId}`, { method: 'POST', body: { texto } });
        input.value = '';
        carregarComentariosChamado(chamadoAtualId);
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

function gerarPDFChamados() {
    const params = new URLSearchParams();
    const provedor = document.getElementById('filtroProvedor').value;
    const status = document.getElementById('filtroStatus').value;
    const dataInicio = document.getElementById('filtroDataInicio').value;
    const dataFim = document.getElementById('filtroDataFim').value;
    if (provedor) params.set('provedor_id', provedor);
    if (status) params.set('status', status);
    if (dataInicio) params.set('data_inicio', dataInicio);
    if (dataFim) params.set('data_fim', dataFim);
    window.open('/api/relatorios/chamados/pdf?' + params.toString(), '_blank');
}
