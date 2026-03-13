// ==================== PROJETOS ====================

let _projetoAtualId = null;
let _projetosData = [];

document.addEventListener('DOMContentLoaded', () => {
    carregarProvedores(document.getElementById('projetoProvedor'));
    carregarResponsaveisProjeto();
    carregarProjetos();

    // Restaurar vista salva
    if (localStorage.getItem('projetos_vista') === 'kanban') setProjetosVistaKanban(true);

    document.getElementById('filtroStatus').addEventListener('change', carregarProjetos);

    // Upload de anexo projeto
    document.getElementById('formAnexoProjeto').addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('inputAnexoProjeto');
        if (!input.files.length || !_projetoAtualId) return;

        const formData = new FormData();
        for (const file of input.files) formData.append('arquivos', file);

        try {
            await fetch(`/api/projetos/${_projetoAtualId}/anexos`, { method: 'POST', body: formData });
            input.value = '';
            mostrarToast('Anexo(s) enviado(s)!');
            verProjeto(_projetoAtualId);
        } catch (err) {
            mostrarToast('Erro ao enviar anexo', 'error');
        }
    });
});

async function carregarProjetos() {
    const status = document.getElementById('filtroStatus').value;
    const params = status ? `?status=${status}` : '';

    try {
        const projetos = await api(`/api/projetos${params}`);
        _projetosData = projetos;
        renderTabela(projetos);
        if (localStorage.getItem('projetos_vista') === 'kanban') renderKanbanProjetos(projetos);
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function carregarResponsaveisProjeto() {
    try {
        const users = await api('/api/usuarios/lista');
        const sel = document.getElementById('projetoResponsavel');
        sel.innerHTML = '<option value="">Nenhum</option>';
        users.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = u.nome;
            sel.appendChild(opt);
        });
    } catch {}
}

function progressBar(pct) {
    const p = pct || 0;
    const color = p >= 100 ? 'bg-success' : p >= 50 ? 'bg-info' : p >= 25 ? 'bg-warning' : 'bg-secondary';
    return `<div class="progress" style="height:18px;min-width:80px">
        <div class="progress-bar ${color}" style="width:${p}%">${p}%</div>
    </div>`;
}

function renderTabela(projetos) {
    const tbody = document.getElementById('tabelaProjetos');
    if (projetos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">Nenhum projeto encontrado</td></tr>';
        return;
    }

    tbody.innerHTML = projetos.map(p => `
        <tr>
            <td class="text-muted">${p.id}</td>
            <td class="fw-medium">${p.titulo}</td>
            <td>${p.provedor_nome || p.provedor_manual || '<span class="text-muted">-</span>'}</td>
            <td>${badgePrioridade(p.prioridade)}</td>
            <td>${progressBar(p.percentual_conclusao)}</td>
            <td>
                <select class="form-select form-select-sm status-select status-${p.status}" style="width:auto;display:inline" onchange="mudarStatusProjeto(${p.id}, this.value, this)">
                    <option value="em_andamento" ${p.status === 'em_andamento' ? 'selected' : ''}>Em Andamento</option>
                    <option value="pausado" ${p.status === 'pausado' ? 'selected' : ''}>Pausado</option>
                    <option value="concluido" ${p.status === 'concluido' ? 'selected' : ''}>Concluído</option>
                    <option value="cancelado" ${p.status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
                </select>
            </td>
            <td><small>${formatarData(p.data_inicio)}</small></td>
            <td><small>${formatarData(p.data_previsao)}</small></td>
            <td>
                <div class="d-flex gap-1">
                    <button class="btn btn-sm btn-outline-info btn-action" onclick="verProjeto(${p.id})" title="Detalhes"><i class="bi bi-eye"></i></button>
                    <button class="btn btn-sm btn-outline-primary btn-action" onclick="editarProjeto(${p.id})" title="Editar"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-danger btn-action" onclick="excluirProjeto(${p.id})" title="Excluir"><i class="bi bi-trash"></i></button>
                </div>
            </td>
        </tr>
    `).join('');
}

function abrirModalProjeto() {
    document.getElementById('projetoId').value = '';
    document.getElementById('projetoTitulo').value = '';
    document.getElementById('projetoDescricao').value = '';
    document.getElementById('projetoProvedor').value = '';
    document.getElementById('projetoProvedorManual').value = '';
    document.getElementById('projetoPrioridade').value = 'media';
    document.getElementById('projetoStatus').value = 'em_andamento';
    document.getElementById('projetoDataInicio').value = new Date().toISOString().split('T')[0];
    document.getElementById('projetoDataPrevisao').value = '';
    document.getElementById('projetoResponsavel').value = '';
    document.getElementById('projetoPercentual').value = 0;
    document.getElementById('projetoPercentualLabel').textContent = '0';
    document.getElementById('modalProjetoTitulo').textContent = 'Novo Projeto';
    new bootstrap.Modal(document.getElementById('modalProjeto')).show();
}

async function editarProjeto(id) {
    try {
        const projetos = await api('/api/projetos');
        const p = projetos.find(pr => pr.id === id);
        if (!p) return;

        document.getElementById('projetoId').value = p.id;
        document.getElementById('projetoTitulo').value = p.titulo;
        document.getElementById('projetoDescricao').value = p.descricao || '';
        document.getElementById('projetoProvedor').value = p.provedor_id || '';
        document.getElementById('projetoProvedorManual').value = p.provedor_manual || '';
        document.getElementById('projetoPrioridade').value = p.prioridade;
        document.getElementById('projetoStatus').value = p.status;
        document.getElementById('projetoDataInicio').value = p.data_inicio;
        document.getElementById('projetoDataPrevisao').value = p.data_previsao || '';
        document.getElementById('projetoResponsavel').value = p.responsavel_id || '';
        document.getElementById('projetoPercentual').value = p.percentual_conclusao || 0;
        document.getElementById('projetoPercentualLabel').textContent = p.percentual_conclusao || 0;
        document.getElementById('modalProjetoTitulo').textContent = 'Editar Projeto';
        new bootstrap.Modal(document.getElementById('modalProjeto')).show();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function salvarProjeto() {
    const id = document.getElementById('projetoId').value;
    const provedorSelect = document.getElementById('projetoProvedor').value;
    const provedorManual = document.getElementById('projetoProvedorManual').value.trim();
    const data = {
        titulo: document.getElementById('projetoTitulo').value.trim(),
        descricao: document.getElementById('projetoDescricao').value.trim(),
        provedor_id: provedorSelect || null,
        provedor_manual: !provedorSelect && provedorManual ? provedorManual : null,
        prioridade: document.getElementById('projetoPrioridade').value,
        status: document.getElementById('projetoStatus').value,
        data_inicio: document.getElementById('projetoDataInicio').value,
        data_previsao: document.getElementById('projetoDataPrevisao').value || null,
        responsavel_id: document.getElementById('projetoResponsavel').value || null,
        percentual_conclusao: Number(document.getElementById('projetoPercentual').value) || 0
    };

    if (!data.titulo || !data.data_inicio) {
        mostrarToast('Título e data de início são obrigatórios', 'warning');
        return;
    }

    try {
        if (id) {
            await api(`/api/projetos/${id}`, { method: 'PUT', body: data });
            mostrarToast('Projeto atualizado!');
        } else {
            await api('/api/projetos', { method: 'POST', body: data });
            mostrarToast('Projeto criado!');
        }
        bootstrap.Modal.getInstance(document.getElementById('modalProjeto')).hide();
        carregarProjetos();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function mudarStatusProjeto(id, novoStatus, selectEl) {
    // Atualizar cor imediatamente
    if (selectEl) {
        selectEl.className = selectEl.className.replace(/status-\w+/g, '').trim();
        selectEl.classList.add('form-select', 'form-select-sm', 'status-select', `status-${novoStatus}`);
    }
    try {
        const projetos = await api('/api/projetos');
        const p = projetos.find(pr => pr.id === id);
        if (!p) return;

        await api(`/api/projetos/${id}`, {
            method: 'PUT',
            body: { ...p, status: novoStatus }
        });
        mostrarToast('Status atualizado!');
    } catch (err) {
        mostrarToast(err.message, 'error');
        carregarProjetos();
    }
}

async function excluirProjeto(id) {
    if (!await confirmar('Tem certeza que deseja excluir este projeto?')) return;
    try {
        await api(`/api/projetos/${id}`, { method: 'DELETE' });
        mostrarToast('Projeto excluído!');
        carregarProjetos();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function verProjeto(id) {
    _projetoAtualId = id;
    try {
        const projetos = await api('/api/projetos');
        const p = projetos.find(pr => pr.id === id);
        if (!p) return;

        const container = document.getElementById('detalhesProjetoConteudo');

        let anexosHtml = '';
        if (p.anexos && p.anexos.length > 0) {
            const fileIconMap = {
                pdf: 'bi-file-earmark-pdf text-danger',
                doc: 'bi-file-earmark-word text-primary', docx: 'bi-file-earmark-word text-primary',
                xls: 'bi-file-earmark-excel text-success', xlsx: 'bi-file-earmark-excel text-success',
                ppt: 'bi-file-earmark-ppt text-warning', pptx: 'bi-file-earmark-ppt text-warning',
                zip: 'bi-file-earmark-zip text-secondary', rar: 'bi-file-earmark-zip text-secondary',
                mp4: 'bi-file-earmark-play text-info', mp3: 'bi-file-earmark-music text-info',
                txt: 'bi-file-earmark-text text-muted', csv: 'bi-file-earmark-spreadsheet text-success'
            };

            anexosHtml = `
                <h6 class="mt-3 mb-2"><i class="bi bi-paperclip me-1"></i>Anexos (${p.anexos.length})</h6>
                <div class="d-flex flex-wrap gap-2">
                    ${p.anexos.map(a => {
                        const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(a.nome_arquivo);
                        if (isImage) {
                            return `<div class="position-relative">
                                <img src="/${a.caminho}" class="anexo-thumb" title="${a.nome_arquivo}">
                                <button class="btn btn-sm btn-danger position-absolute top-0 end-0" style="padding:0.1rem 0.3rem;font-size:0.65rem" onclick="excluirAnexoProjeto(${a.id})"><i class="bi bi-x"></i></button>
                            </div>`;
                        }
                        const ext = a.nome_arquivo.split('.').pop().toLowerCase();
                        const icon = fileIconMap[ext] || 'bi-file-earmark text-muted';
                        return `<div class="anexo-file">
                            <i class="bi ${icon} fs-4"></i>
                            <a href="/${a.caminho}" target="_blank" class="text-decoration-none flex-grow-1">${a.nome_arquivo}</a>
                            <button class="btn btn-sm btn-outline-danger" style="padding:0.1rem 0.3rem;font-size:0.65rem" onclick="excluirAnexoProjeto(${a.id})"><i class="bi bi-x"></i></button>
                        </div>`;
                    }).join('')}
                </div>
            `;
        }

        container.innerHTML = `
            <div class="row g-3">
                <div class="col-md-6">
                    <small class="text-muted">Titulo</small>
                    <p class="fw-medium mb-2">${p.titulo}</p>
                </div>
                <div class="col-md-3">
                    <small class="text-muted">Prioridade</small>
                    <p class="mb-2">${badgePrioridade(p.prioridade)}</p>
                </div>
                <div class="col-md-3">
                    <small class="text-muted">Status</small>
                    <p class="mb-2">${badgeStatus ? badgeStatus(p.status) : p.status}</p>
                </div>
                <div class="col-md-6">
                    <small class="text-muted">Provedor</small>
                    <p class="fw-medium mb-2">${p.provedor_nome || p.provedor_manual || '<span class="text-muted">-</span>'}</p>
                </div>
                <div class="col-md-3">
                    <small class="text-muted">Data Inicio</small>
                    <p class="mb-2">${formatarData(p.data_inicio)}</p>
                </div>
                <div class="col-md-3">
                    <small class="text-muted">Previsao</small>
                    <p class="mb-2">${p.data_previsao ? formatarData(p.data_previsao) : '-'}</p>
                </div>
                <div class="col-12">
                    <small class="text-muted">Descricao</small>
                    <p class="mb-2">${p.descricao || '<span class="text-muted">-</span>'}</p>
                </div>
            </div>
            ${anexosHtml}
        `;

        new bootstrap.Modal(document.getElementById('modalDetalhesProjeto')).show();
        carregarComentariosProjeto(id);
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function excluirAnexoProjeto(id) {
    try {
        await api(`/api/anexos/${id}`, { method: 'DELETE' });
        mostrarToast('Anexo removido!');
        verProjeto(_projetoAtualId);
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

// ==================== COMENTARIOS PROJETO ====================

async function carregarComentariosProjeto(projetoId) {
    try {
        const comentarios = await api(`/api/comentarios/projeto/${projetoId}`);
        const container = document.getElementById('projetoComentarios');
        if (!comentarios.length) {
            container.innerHTML = '<div class="text-center text-muted py-2"><small>Nenhum comentario</small></div>';
            return;
        }
        container.innerHTML = comentarios.map(c => {
            const iniciais = c.usuario_nome.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            return `<div class="comentario-item">
                <div class="comentario-avatar">${iniciais}</div>
                <div class="comentario-body">
                    <div class="comentario-header"><strong>${c.usuario_nome}</strong> - ${formatarDataHora(c.criado_em)}</div>
                    <div class="comentario-texto">${c.texto}</div>
                </div>
            </div>`;
        }).join('');
        container.scrollTop = container.scrollHeight;
    } catch {}
}

async function enviarComentarioProjeto() {
    const input = document.getElementById('novoComentarioProjeto');
    const texto = input.value.trim();
    if (!texto || !_projetoAtualId) return;

    try {
        await api(`/api/comentarios/projeto/${_projetoAtualId}`, { method: 'POST', body: { texto } });
        input.value = '';
        carregarComentariosProjeto(_projetoAtualId);
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

// ==================== KANBAN PROJETOS ====================

function setProjetosVistaLista() {
    localStorage.setItem('projetos_vista', 'lista');
    document.getElementById('vistaListaProjetos').style.display = '';
    document.getElementById('vistaKanbanProjetos').style.display = 'none';
    document.getElementById('btnVistaLista').classList.add('active');
    document.getElementById('btnVistaKanban').classList.remove('active');
}

function setProjetosVistaKanban(skipSave) {
    if (!skipSave) localStorage.setItem('projetos_vista', 'kanban');
    document.getElementById('vistaListaProjetos').style.display = 'none';
    document.getElementById('vistaKanbanProjetos').style.display = 'flex';
    document.getElementById('btnVistaLista').classList.remove('active');
    document.getElementById('btnVistaKanban').classList.add('active');
    renderKanbanProjetos(_projetosData);
}

function renderKanbanProjetos(projetos) {
    const board = document.getElementById('vistaKanbanProjetos');
    if (!board) return;
    const columns = [
        { status: 'em_andamento', label: 'Em Andamento', color: 'primary' },
        { status: 'pausado', label: 'Pausado', color: 'warning' },
        { status: 'em_revisao', label: 'Em Revisao', color: 'info' },
        { status: 'concluido', label: 'Concluido', color: 'success' },
        { status: 'cancelado', label: 'Cancelado', color: 'secondary' }
    ];

    board.innerHTML = columns.map(col => {
        const items = projetos.filter(p => p.status === col.status);
        return `
            <div class="kanban-column">
                <div class="kanban-column-header">
                    <span class="text-${col.color}">${col.label}</span>
                    <span class="badge bg-${col.color}">${items.length}</span>
                </div>
                <div class="kanban-column-body" data-status="${col.status}"
                     ondragover="event.preventDefault();this.classList.add('drag-over')"
                     ondragleave="this.classList.remove('drag-over')"
                     ondrop="dropKanbanProjeto(event, '${col.status}')">
                    ${items.map(p => `
                        <div class="kanban-card" draggable="true"
                             ondragstart="event.dataTransfer.setData('text/plain','${p.id}');this.classList.add('dragging')"
                             ondragend="this.classList.remove('dragging')"
                             onclick="verProjeto(${p.id})">
                            <div class="kanban-card-title">${p.titulo}</div>
                            <div class="kanban-card-meta">
                                <i class="bi bi-building me-1"></i>${p.provedor_nome || p.provedor_manual || '-'}
                                <span class="ms-2">${badgePrioridade(p.prioridade)}</span>
                            </div>
                            ${progressBar(p.percentual_conclusao)}
                            <div class="kanban-card-meta mt-1">
                                ${p.responsavel_nome ? '<i class="bi bi-person me-1"></i>' + p.responsavel_nome : ''}
                                <span class="ms-auto"><i class="bi bi-calendar me-1"></i>${formatarData(p.data_previsao) || '-'}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
}

async function dropKanbanProjeto(event, newStatus) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    const id = event.dataTransfer.getData('text/plain');
    if (!id) return;

    try {
        await api(`/api/projetos/${id}/status`, { method: 'PATCH', body: { status: newStatus } });
        carregarProjetos();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}
