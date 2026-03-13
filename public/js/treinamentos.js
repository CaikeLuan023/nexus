// ==================== TREINAMENTOS ====================

const LABELS_STATUS_TREINAMENTO = {
    pendente: 'Pendente',
    agendado: 'Agendado',
    realizado: 'Realizado'
};

let todosTreinamentos = [];

document.addEventListener('DOMContentLoaded', () => {
    carregarProvedores(document.getElementById('filtroProvedor'));
    carregarProvedores(document.getElementById('treinamentoProvedor'));
    carregarTreinamentos();

    document.getElementById('filtroProvedor').addEventListener('change', carregarTreinamentos);
    document.getElementById('filtroStatusTreinamento').addEventListener('change', carregarTreinamentos);

    // Verificar notificações a cada 60 segundos
    setInterval(verificarNotificacoes, 60000);
});

async function carregarTreinamentos() {
    const provedor = document.getElementById('filtroProvedor').value;
    const params = provedor ? `?provedor_id=${provedor}` : '';

    try {
        const treinamentos = await api(`/api/treinamentos${params}`);
        todosTreinamentos = treinamentos;

        // Filtro de status no frontend
        const statusFiltro = document.getElementById('filtroStatusTreinamento').value;
        let filtrados = treinamentos;
        if (statusFiltro) {
            filtrados = treinamentos.filter(t => t.status === statusFiltro);
        }

        renderTabela(filtrados);
        atualizarCards(treinamentos);
        verificarNotificacoes();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

function atualizarCards(treinamentos) {
    const pendentes = treinamentos.filter(t => t.status === 'pendente').length;
    const agendados = treinamentos.filter(t => t.status === 'agendado').length;
    const realizados = treinamentos.filter(t => t.status === 'realizado').length;

    document.getElementById('totalPendentes').textContent = pendentes;
    document.getElementById('totalAgendados').textContent = agendados;
    document.getElementById('totalRealizados').textContent = realizados;
    document.getElementById('totalGeral').textContent = treinamentos.length;
}

function badgeStatusTreinamento(status) {
    const cores = { pendente: 'warning', agendado: 'primary', realizado: 'success' };
    const icones = { pendente: 'bi-clock', agendado: 'bi-calendar-event', realizado: 'bi-check-circle' };
    return `<span class="badge bg-${cores[status] || 'secondary'}"><i class="bi ${icones[status] || ''} me-1"></i>${LABELS_STATUS_TREINAMENTO[status] || status}</span>`;
}

function renderTabela(treinamentos) {
    const tbody = document.getElementById('tabelaTreinamentos');
    if (treinamentos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">Nenhum treinamento encontrado</td></tr>';
        return;
    }

    tbody.innerHTML = treinamentos.map(t => {
        const horaFormatada = t.hora_treinamento || '-';
        const ehHoje = isHoje(t.data_treinamento);
        const rowClass = ehHoje && t.status !== 'realizado' ? 'table-warning' : '';

        return `
            <tr class="${rowClass}">
                <td class="text-muted">${t.id}</td>
                <td class="fw-medium">${t.provedor_nome}</td>
                <td>${t.titulo}${ehHoje && t.status !== 'realizado' ? ' <i class="bi bi-bell-fill text-warning" title="Treinamento hoje!"></i>' : ''}</td>
                <td><small>${formatarData(t.data_treinamento)}</small></td>
                <td><small>${horaFormatada}</small></td>
                <td>
                    <select class="form-select form-select-sm status-select-treino status-treino-${t.status}" style="width:auto;display:inline" onchange="mudarStatusTreinamento(${t.id}, this.value, this)">
                        <option value="pendente" ${t.status === 'pendente' ? 'selected' : ''}>Pendente</option>
                        <option value="agendado" ${t.status === 'agendado' ? 'selected' : ''}>Agendado</option>
                        <option value="realizado" ${t.status === 'realizado' ? 'selected' : ''}>Realizado</option>
                    </select>
                </td>
                <td><small class="text-muted">${t.descricao || '-'}</small></td>
                <td>
                    <div class="d-flex gap-1">
                        <button class="btn btn-sm btn-outline-primary btn-action" onclick="editarTreinamento(${t.id})" title="Editar"><i class="bi bi-pencil"></i></button>
                        <button class="btn btn-sm btn-outline-danger btn-action" onclick="excluirTreinamento(${t.id})" title="Excluir"><i class="bi bi-trash"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function isHoje(dateStr) {
    if (!dateStr) return false;
    const hoje = new Date().toISOString().split('T')[0];
    return dateStr === hoje;
}

function verificarNotificacoes() {
    const container = document.getElementById('notificacoesTreinamentos');
    if (!container) return;

    const hoje = new Date().toISOString().split('T')[0];
    const agora = new Date();
    const horaAtual = agora.getHours().toString().padStart(2, '0') + ':' + agora.getMinutes().toString().padStart(2, '0');

    const treinamentosHoje = todosTreinamentos.filter(t =>
        t.data_treinamento === hoje && t.status !== 'realizado'
    );

    if (treinamentosHoje.length === 0) {
        container.style.display = 'none';
        return;
    }

    let html = '';
    treinamentosHoje.forEach(t => {
        const hora = t.hora_treinamento || '';
        let tipo = 'info';
        let icone = 'bi-calendar-event';
        let mensagem = '';

        if (hora && hora <= horaAtual) {
            tipo = 'danger';
            icone = 'bi-bell-fill';
            mensagem = `AGORA/ATRASADO - ${t.provedor_nome}: "${t.titulo}" agendado para ${hora}`;
        } else if (hora) {
            tipo = 'warning';
            icone = 'bi-clock';
            mensagem = `HOJE ${hora} - ${t.provedor_nome}: "${t.titulo}"`;
        } else {
            tipo = 'info';
            icone = 'bi-calendar-event';
            mensagem = `HOJE - ${t.provedor_nome}: "${t.titulo}"`;
        }

        html += `
            <div class="alert alert-${tipo} d-flex align-items-center py-2 mb-2" role="alert">
                <i class="bi ${icone} me-2 fs-5"></i>
                <div class="flex-grow-1">
                    <strong>${mensagem}</strong>
                    <small class="ms-2">(${LABELS_STATUS_TREINAMENTO[t.status] || t.status})</small>
                </div>
                <button class="btn btn-sm btn-outline-${tipo === 'danger' ? 'danger' : 'dark'} ms-2" onclick="marcarRealizado(${t.id})" title="Marcar como realizado">
                    <i class="bi bi-check-lg"></i> Realizado
                </button>
            </div>
        `;
    });

    container.innerHTML = html;
    container.style.display = 'block';
}

async function marcarRealizado(id) {
    try {
        await api(`/api/treinamentos/${id}/status`, {
            method: 'PATCH',
            body: { status: 'realizado' }
        });
        mostrarToast('Treinamento marcado como realizado!');
        carregarTreinamentos();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function mudarStatusTreinamento(id, novoStatus, selectEl) {
    if (selectEl) {
        selectEl.className = selectEl.className.replace(/status-treino-\w+/g, '').trim();
        selectEl.classList.add('form-select', 'form-select-sm', 'status-select-treino', `status-treino-${novoStatus}`);
    }
    try {
        await api(`/api/treinamentos/${id}/status`, {
            method: 'PATCH',
            body: { status: novoStatus }
        });
        mostrarToast('Status atualizado!');
        carregarTreinamentos();
    } catch (err) {
        mostrarToast(err.message, 'error');
        carregarTreinamentos();
    }
}

function limparFiltros() {
    document.getElementById('filtroProvedor').value = '';
    document.getElementById('filtroStatusTreinamento').value = '';
    carregarTreinamentos();
}

function abrirModalTreinamento() {
    document.getElementById('treinamentoId').value = '';
    document.getElementById('treinamentoProvedor').value = '';
    document.getElementById('treinamentoTitulo').value = '';
    document.getElementById('treinamentoData').value = '';
    document.getElementById('treinamentoHora').value = '';
    document.getElementById('treinamentoStatus').value = 'agendado';
    document.getElementById('treinamentoDescricao').value = '';
    document.getElementById('modalTreinamentoTitulo').textContent = 'Novo Treinamento';
    new bootstrap.Modal(document.getElementById('modalTreinamento')).show();
}

async function editarTreinamento(id) {
    try {
        const treinamentos = await api('/api/treinamentos');
        const t = treinamentos.find(tr => tr.id === id);
        if (!t) return;

        document.getElementById('treinamentoId').value = t.id;
        document.getElementById('treinamentoProvedor').value = t.provedor_id;
        document.getElementById('treinamentoTitulo').value = t.titulo;
        document.getElementById('treinamentoData').value = t.data_treinamento;
        document.getElementById('treinamentoHora').value = t.hora_treinamento || '';
        document.getElementById('treinamentoStatus').value = t.status || 'agendado';
        document.getElementById('treinamentoDescricao').value = t.descricao || '';
        document.getElementById('modalTreinamentoTitulo').textContent = 'Editar Treinamento';
        new bootstrap.Modal(document.getElementById('modalTreinamento')).show();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function salvarTreinamento() {
    const id = document.getElementById('treinamentoId').value;
    const data = {
        provedor_id: document.getElementById('treinamentoProvedor').value,
        titulo: document.getElementById('treinamentoTitulo').value.trim(),
        data_treinamento: document.getElementById('treinamentoData').value,
        hora_treinamento: document.getElementById('treinamentoHora').value || null,
        status: document.getElementById('treinamentoStatus').value,
        descricao: document.getElementById('treinamentoDescricao').value.trim()
    };

    if (!data.provedor_id || !data.titulo || !data.data_treinamento) {
        mostrarToast('Preencha todos os campos obrigatórios', 'warning');
        return;
    }

    try {
        if (id) {
            await api(`/api/treinamentos/${id}`, { method: 'PUT', body: data });
            mostrarToast('Treinamento atualizado!');
        } else {
            await api('/api/treinamentos', { method: 'POST', body: data });
            mostrarToast('Treinamento registrado!');
        }
        bootstrap.Modal.getInstance(document.getElementById('modalTreinamento')).hide();
        carregarTreinamentos();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function excluirTreinamento(id) {
    if (!await confirmar('Tem certeza que deseja excluir este treinamento?')) return;
    try {
        await api(`/api/treinamentos/${id}`, { method: 'DELETE' });
        mostrarToast('Treinamento excluído!');
        carregarTreinamentos();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}
