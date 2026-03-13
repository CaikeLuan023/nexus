// ==================== VENDAS.JS ====================

let todosNegocios = [];
let todasTarefas = [];
let todasVisitas = [];
let todosContratos = [];
let usuarioAtual = null;
let isAdmin = false;

const ESTAGIOS = [
    { key: 'lead', label: 'Lead', cor: '#6c757d', icon: 'bi-person-plus' },
    { key: 'contato', label: 'Contato', cor: '#0dcaf0', icon: 'bi-telephone' },
    { key: 'proposta', label: 'Proposta', cor: '#0d6efd', icon: 'bi-file-earmark-text' },
    { key: 'negociacao', label: 'Negociação', cor: '#ffc107', icon: 'bi-chat-dots' },
    { key: 'ativado', label: 'Ativado', cor: '#198754', icon: 'bi-check-circle' },
    { key: 'perdido', label: 'Perdido', cor: '#dc3545', icon: 'bi-x-circle' }
];

const TIPO_TAREFA_LABELS = {
    follow_up: { label: 'Follow-up', cor: 'primary', icon: 'bi-arrow-repeat' },
    ligacao: { label: 'Ligação', cor: 'info', icon: 'bi-telephone' },
    reuniao: { label: 'Reunião', cor: 'warning', icon: 'bi-people' },
    email: { label: 'Email', cor: 'secondary', icon: 'bi-envelope' },
    whatsapp: { label: 'WhatsApp', cor: 'success', icon: 'bi-whatsapp' }
};

const PLANO_LABELS = {
    zapping_lite_plus: 'Zapping Lite Plus',
    zapping_full: 'Zapping Full',
    liteplus_full: 'Lite Plus + Full'
};

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const user = await api('/api/me');
        usuarioAtual = user;
        isAdmin = user.perfil === 'admin';

        // Mostrar filtro de vendedor para admin
        if (isAdmin) {
            document.getElementById('filtroVendedorGlobal').style.display = '';
            document.getElementById('btnNovaMeta').style.display = '';
            await carregarVendedores();
        }

        // Set periodo default para metas
        const hoje = new Date();
        document.getElementById('metaPeriodo').value = hoje.toISOString().substring(0, 7);

        // Tab change events
        document.querySelectorAll('#vendasTabs button').forEach((btn) => {
            btn.addEventListener('shown.bs.tab', (e) => {
                const target = e.target.getAttribute('data-bs-target');
                if (target === '#tabDashboard') carregarDashboardVendas();
                if (target === '#tabPipeline') carregarNegocios();
                if (target === '#tabMetas') carregarMetas();
                if (target === '#tabAgenda') carregarTarefas();
                if (target === '#tabVisitas') carregarVisitas();
                if (target === '#tabPropostas') carregarPropostas();
                if (target === '#tabContratos') carregarContratos();
                if (target === '#tabComissoes') carregarComissoes();
            });
        });

        // Mostrar botao config email e follow-up para admin
        if (isAdmin) {
            const btnCfg = document.getElementById('btnConfigEmail');
            if (btnCfg) btnCfg.style.display = '';
            const btnFup = document.getElementById('btnFollowUpConfig');
            if (btnFup) btnFup.style.display = '';
            const btnCom = document.getElementById('tabComissoesBtn');
            if (btnCom) btnCom.style.display = '';
        }

        // Comissao periodo default
        const comPeriodo = document.getElementById('comissaoPeriodo');
        if (comPeriodo) {
            comPeriodo.value = new Date().toISOString().substring(0, 7);
            comPeriodo.addEventListener('change', () => carregarComissoes());
        }

        // Toggle enviar via WhatsApp/Email
        document.getElementById('enviarViaWhatsApp')?.addEventListener('change', (e) => {
            document.getElementById('campoWhatsApp').classList.toggle('d-none', !e.target.checked);
        });
        document.getElementById('enviarViaEmail')?.addEventListener('change', (e) => {
            document.getElementById('campoEmail').classList.toggle('d-none', !e.target.checked);
        });

        // Estagio change mostra/esconde motivo perda
        document.getElementById('negocioEstagio').addEventListener('change', (e) => {
            document.getElementById('campoMotivoPerdaContainer').style.display =
                e.target.value === 'perdido' ? '' : 'none';
        });

        // Visita status change mostra resultado
        document.getElementById('visitaStatus').addEventListener('change', (e) => {
            document.getElementById('visitaResultadoContainer').style.display =
                e.target.value === 'realizada' ? '' : 'none';
        });

        // Filtro vendedor global
        document.getElementById('filtroVendedorGlobal').addEventListener('change', () => {
            const activeTab = document.querySelector('#vendasTabs .nav-link.active');
            const target = activeTab?.getAttribute('data-bs-target');
            if (target === '#tabDashboard') carregarDashboardVendas();
            if (target === '#tabPipeline') carregarNegocios();
            if (target === '#tabMetas') carregarMetas();
            if (target === '#tabAgenda') carregarTarefas();
            if (target === '#tabVisitas') carregarVisitas();
            if (target === '#tabPropostas') carregarPropostas();
            if (target === '#tabContratos') carregarContratos();
            if (target === '#tabComissoes') carregarComissoes();
        });

        // Meta periodo change
        document.getElementById('metaPeriodo').addEventListener('change', () => carregarMetas());

        // Carregar dashboard inicial
        carregarDashboardVendas();
    } catch (err) {
        console.error('Erro ao inicializar vendas:', err);
    }
});

async function carregarVendedores() {
    try {
        const usuarios = await api('/api/usuarios');
        const vendedores = usuarios.filter((u) => u.perfil === 'vendedor' || u.perfil === 'admin');
        const select = document.getElementById('filtroVendedorGlobal');
        const metaSelect = document.getElementById('metaVendedor');

        vendedores.forEach((v) => {
            const opt = document.createElement('option');
            opt.value = v.nome;
            opt.textContent = v.nome;
            select.appendChild(opt);

            if (metaSelect) {
                const opt2 = opt.cloneNode(true);
                metaSelect.appendChild(opt2);
            }
        });
    } catch (err) {
        console.error('Erro ao carregar vendedores:', err);
    }
}

function getVendedorFiltro() {
    if (!isAdmin) return '';
    return document.getElementById('filtroVendedorGlobal').value;
}

// ==================== PIPELINE ====================

async function carregarNegocios() {
    try {
        let url = '/api/vendas/negocios';
        const vendedor = getVendedorFiltro();
        if (vendedor) url += '?vendedor=' + encodeURIComponent(vendedor);
        todosNegocios = await api(url);
        renderKanban();
    } catch (err) {
        mostrarToast('Erro ao carregar negócios: ' + err.message, 'error');
    }
}

function renderKanban() {
    const board = document.getElementById('kanbanBoard');
    board.innerHTML = '';

    let totalValor = 0;
    let countAtivos = 0;

    ESTAGIOS.forEach((estagio) => {
        const negocios = todosNegocios.filter((n) => n.estagio === estagio.key);
        const valorEstagio = negocios.reduce((sum, n) => sum + (n.valor_estimado || 0), 0);

        if (estagio.key !== 'ativado' && estagio.key !== 'perdido') {
            totalValor += valorEstagio;
            countAtivos += negocios.length;
        }

        const col = document.createElement('div');
        col.className = 'kanban-column';
        col.setAttribute('data-estagio', estagio.key);

        col.innerHTML = `
            <div class="kanban-column-header">
                <div class="d-flex align-items-center gap-2">
                    <i class="bi ${estagio.icon}" style="color:${estagio.cor}"></i>
                    <span class="fw-bold">${estagio.label}</span>
                    <span class="badge bg-secondary rounded-pill">${negocios.length}</span>
                </div>
                <small class="text-muted">${formatarMoeda(valorEstagio)}</small>
            </div>
            <div class="kanban-cards" data-estagio="${estagio.key}">
                ${negocios.map((n) => renderKanbanCard(n, estagio)).join('')}
            </div>
        `;

        // Drop zone
        const cardsContainer = col.querySelector('.kanban-cards');
        cardsContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            cardsContainer.classList.add('kanban-drop-hover');
        });
        cardsContainer.addEventListener('dragleave', () => {
            cardsContainer.classList.remove('kanban-drop-hover');
        });
        cardsContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            cardsContainer.classList.remove('kanban-drop-hover');
            const negocioId = e.dataTransfer.getData('text/plain');
            const novoEstagio = cardsContainer.getAttribute('data-estagio');
            moverEstagio(negocioId, novoEstagio);
        });

        board.appendChild(col);
    });

    // Forecast: pipeline ponderado por probabilidade
    const PROBABILIDADE_ESTAGIO = { lead: 0.1, contato: 0.25, proposta: 0.5, negociacao: 0.75 };
    let forecast = 0;
    todosNegocios.forEach((n) => {
        const prob = PROBABILIDADE_ESTAGIO[n.estagio] || 0;
        forecast += (n.valor_estimado || 0) * prob;
    });

    document.getElementById('pipelineResumo').innerHTML =
        `${countAtivos} negocios ativos | Pipeline: ${formatarMoeda(totalValor)} | <span class="text-info" title="Pipeline ponderado por probabilidade de conversao"><i class="bi bi-graph-up-arrow"></i> Forecast: ${formatarMoeda(forecast)}</span>`;
}

function renderKanbanCard(negocio, estagio) {
    const nome = negocio.provedor_nome || negocio.provedor_nome_lead || 'Sem nome';
    const plano = PLANO_LABELS[negocio.plano_interesse] || negocio.plano_interesse || '';
    const valor = negocio.valor_estimado ? formatarMoeda(negocio.valor_estimado) : '';
    const data = negocio.criado_em ? formatarData(negocio.criado_em) : '';

    // Esfriando: calcular dias sem interacao
    const lastUpdate = negocio.atualizado_em || negocio.criado_em;
    const diasSemInteracao = lastUpdate ? Math.floor((Date.now() - new Date(lastUpdate).getTime()) / 86400000) : 0;
    let esfriandoClass = '';
    let esfriandoTip = '';
    if (estagio.key !== 'ativado' && estagio.key !== 'perdido') {
        if (diasSemInteracao > 7) {
            esfriandoClass = 'negocio-frio';
            esfriandoTip = `Sem interacao ha ${diasSemInteracao} dias`;
        } else if (diasSemInteracao > 3) {
            esfriandoClass = 'negocio-esfriando';
            esfriandoTip = `Sem interacao ha ${diasSemInteracao} dias`;
        }
    }

    // Contato rapido
    const contato = negocio.contato_lead || '';
    let contatoRapido = '';
    if (contato) {
        const num = contato.replace(/\D/g, '');
        if (num.length >= 10) {
            contatoRapido += `<a href="https://wa.me/${num}" target="_blank" class="kanban-contato-rapido" onclick="event.stopPropagation()" title="WhatsApp"><i class="bi bi-whatsapp"></i></a>`;
            contatoRapido += `<a href="tel:${num}" class="kanban-contato-rapido" onclick="event.stopPropagation()" title="Ligar"><i class="bi bi-telephone"></i></a>`;
        }
        if (contato.includes('@')) {
            contatoRapido += `<a href="mailto:${contato}" class="kanban-contato-rapido" onclick="event.stopPropagation()" title="Email"><i class="bi bi-envelope"></i></a>`;
        }
    }

    return `
        <div class="kanban-card estagio-${negocio.estagio} ${esfriandoClass}" draggable="true"
             ondragstart="event.dataTransfer.setData('text/plain', '${negocio.id}')"
             onclick="verDetalheNegocio(${negocio.id})"
             ${esfriandoTip ? `title="${esfriandoTip}"` : ''}>
            <div class="kanban-card-title">${escapeHtml(nome)}</div>
            ${plano ? `<div class="kanban-card-plano">${escapeHtml(plano)}</div>` : ''}
            <div class="kanban-card-footer">
                ${valor ? `<span class="kanban-card-valor">${valor}</span>` : ''}
                <span class="kanban-card-data">${data}</span>
            </div>
            ${contatoRapido ? `<div class="kanban-contatos-rapidos">${contatoRapido}</div>` : ''}
            ${negocio.responsavel_vendedor ? `<div class="kanban-card-vendedor"><i class="bi bi-person-fill"></i> ${escapeHtml(negocio.responsavel_vendedor)}</div>` : ''}
            ${esfriandoTip ? `<div class="kanban-esfriando-label"><i class="bi bi-snow"></i> ${diasSemInteracao}d</div>` : ''}
        </div>
    `;
}

async function moverEstagio(negocioId, novoEstagio) {
    try {
        await api(`/api/vendas/negocios/${negocioId}/estagio`, {
            method: 'PATCH',
            body: { estagio: novoEstagio }
        });
        await carregarNegocios();
        mostrarToast('Estágio atualizado!');
    } catch (err) {
        mostrarToast('Erro ao mover: ' + err.message, 'error');
    }
}

function abrirModalNegocio(negocio = null) {
    document.getElementById('negocioId').value = negocio ? negocio.id : '';
    document.getElementById('negocioNomeLead').value = negocio ? negocio.provedor_nome_lead || '' : '';
    document.getElementById('negocioContato').value = negocio ? negocio.contato_lead || '' : '';
    document.getElementById('negocioEstagio').value = negocio ? negocio.estagio : 'lead';
    document.getElementById('negocioPlano').value = negocio ? negocio.plano_interesse || '' : '';
    document.getElementById('negocioValor').value = negocio ? negocio.valor_estimado || '' : '';
    document.getElementById('negocioOrigem').value = negocio ? negocio.origem || '' : '';
    document.getElementById('negocioMotivo').value = negocio ? negocio.motivo_perda || '' : '';
    document.getElementById('negocioObs').value = negocio ? negocio.observacoes || '' : '';
    document.getElementById('modalNegocioTitulo').textContent = negocio ? 'Editar Negócio' : 'Novo Negócio';
    document.getElementById('campoMotivoPerdaContainer').style.display =
        negocio && negocio.estagio === 'perdido' ? '' : 'none';

    // Carregar provedores
    carregarProvedores(document.getElementById('negocioProvedorId'), negocio ? negocio.provedor_id : null);

    new bootstrap.Modal(document.getElementById('modalNegocio')).show();
}

async function salvarNegocio() {
    const id = document.getElementById('negocioId').value;
    const provedor_id = document.getElementById('negocioProvedorId').value || null;
    const provedor_nome_lead = document.getElementById('negocioNomeLead').value.trim();
    const contato_lead = document.getElementById('negocioContato').value.trim();
    const estagio = document.getElementById('negocioEstagio').value;
    const plano_interesse = document.getElementById('negocioPlano').value;
    const valor_estimado = parseFloat(document.getElementById('negocioValor').value) || 0;
    const origem = document.getElementById('negocioOrigem').value;
    const motivo_perda = document.getElementById('negocioMotivo').value.trim();
    const observacoes = document.getElementById('negocioObs').value.trim();

    if (!provedor_id && !provedor_nome_lead) {
        mostrarToast('Informe um provedor ou nome do lead', 'warning');
        return;
    }

    const body = {
        provedor_id,
        provedor_nome_lead,
        contato_lead,
        estagio,
        plano_interesse,
        valor_estimado,
        origem,
        motivo_perda,
        observacoes,
        responsavel_vendedor: usuarioAtual.nome
    };

    try {
        if (id) {
            await api(`/api/vendas/negocios/${id}`, { method: 'PUT', body });
            mostrarToast('Negócio atualizado!');
        } else {
            await api('/api/vendas/negocios', { method: 'POST', body });
            mostrarToast('Negócio criado!');
        }
        bootstrap.Modal.getInstance(document.getElementById('modalNegocio')).hide();
        carregarNegocios();
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

async function verDetalheNegocio(id) {
    try {
        const negocio = await api(`/api/vendas/negocios/${id}`);
        const est = ESTAGIOS.find((e) => e.key === negocio.estagio) || {};

        document.getElementById('detalheNegocioTitulo').textContent =
            negocio.provedor_nome || negocio.provedor_nome_lead || 'Negócio #' + negocio.id;

        document.getElementById('detalheNegocioConteudo').innerHTML = `
            <div class="row g-3">
                <div class="col-md-6">
                    <strong>Provedor/Lead:</strong> ${escapeHtml(negocio.provedor_nome || negocio.provedor_nome_lead || '-')}
                </div>
                <div class="col-md-6">
                    <strong>Estágio:</strong>
                    <span class="badge" style="background:${est.cor || '#6c757d'}">${est.label || negocio.estagio}</span>
                </div>
                <div class="col-md-6">
                    <strong>Contato:</strong> ${escapeHtml(negocio.contato_lead || '-')}
                </div>
                <div class="col-md-6">
                    <strong>Plano:</strong> ${PLANO_LABELS[negocio.plano_interesse] || negocio.plano_interesse || '-'}
                </div>
                <div class="col-md-6">
                    <strong>Valor:</strong> ${negocio.valor_estimado ? formatarMoeda(negocio.valor_estimado) : '-'}
                </div>
                <div class="col-md-6">
                    <strong>Origem:</strong> ${escapeHtml(negocio.origem || '-')}
                </div>
                <div class="col-md-6">
                    <strong>Vendedor:</strong> ${escapeHtml(negocio.responsavel_vendedor || '-')}
                </div>
                <div class="col-md-6">
                    <strong>Criado em:</strong> ${formatarData(negocio.criado_em)}
                </div>
                ${negocio.motivo_perda ? `<div class="col-12"><strong>Motivo da Perda:</strong> ${escapeHtml(negocio.motivo_perda)}</div>` : ''}
                ${negocio.observacoes ? `<div class="col-12"><strong>Obs:</strong> ${escapeHtml(negocio.observacoes)}</div>` : ''}
            </div>
            <div class="mt-3 d-flex gap-2">
                <button class="btn btn-sm btn-outline-primary" onclick="editarNegocioDetalhe(${negocio.id})">
                    <i class="bi bi-pencil me-1"></i>Editar
                </button>
                ${
                    negocio.provedor_id
                        ? `<button class="btn btn-sm btn-outline-info" onclick="bootstrap.Modal.getInstance(document.getElementById('modalDetalheNegocio')).hide(); setTimeout(() => abrirHistoricoProvedor(${negocio.provedor_id}), 300)">
                    <i class="bi bi-clock-history me-1"></i>Historico
                </button>`
                        : ''
                }
                <button class="btn btn-sm btn-outline-danger" onclick="excluirNegocio(${negocio.id})">
                    <i class="bi bi-trash me-1"></i>Excluir
                </button>
            </div>
        `;

        // Interacoes
        renderInteracoes(negocio.interacoes || []);

        // Guardar ID para interacoes
        document.getElementById('modalDetalheNegocio').setAttribute('data-negocio-id', negocio.id);

        new bootstrap.Modal(document.getElementById('modalDetalheNegocio')).show();
    } catch (err) {
        mostrarToast('Erro ao carregar detalhes: ' + err.message, 'error');
    }
}

function renderInteracoes(interacoes) {
    const container = document.getElementById('listaInteracoes');
    if (!interacoes.length) {
        container.innerHTML = '<div class="text-muted text-center py-2">Nenhuma interação registrada</div>';
        return;
    }
    container.innerHTML = interacoes
        .map((i) => {
            const tipo = TIPO_TAREFA_LABELS[i.tipo] || { label: i.tipo, cor: 'secondary', icon: 'bi-chat' };
            return `
            <div class="d-flex gap-2 align-items-start mb-2 p-2 rounded" style="background:var(--bg-body)">
                <span class="badge bg-${tipo.cor} mt-1"><i class="bi ${tipo.icon}"></i></span>
                <div class="flex-grow-1">
                    <div>${escapeHtml(i.descricao)}</div>
                    <small class="text-muted">${i.criado_por || ''} - ${formatarDataHora(i.criado_em)}</small>
                </div>
            </div>
        `;
        })
        .join('');
}

async function adicionarInteracao() {
    const negocioId = document.getElementById('modalDetalheNegocio').getAttribute('data-negocio-id');
    const tipo = document.getElementById('interacaoTipo').value;
    const descricao = document.getElementById('interacaoTexto').value.trim();

    if (!descricao) {
        mostrarToast('Digite a interação', 'warning');
        return;
    }

    try {
        await api(`/api/vendas/negocios/${negocioId}/interacoes`, {
            method: 'POST',
            body: { tipo, descricao }
        });
        document.getElementById('interacaoTexto').value = '';

        // Recarregar detalhes
        const negocio = await api(`/api/vendas/negocios/${negocioId}`);
        renderInteracoes(negocio.interacoes || []);
        mostrarToast('Interação adicionada!');
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

async function editarNegocioDetalhe(id) {
    bootstrap.Modal.getInstance(document.getElementById('modalDetalheNegocio')).hide();
    const negocio = todosNegocios.find((n) => n.id === id);
    if (negocio) {
        setTimeout(() => abrirModalNegocio(negocio), 300);
    }
}

async function excluirNegocio(id) {
    const ok = await confirmar('Tem certeza que deseja excluir este negócio?');
    if (!ok) return;

    try {
        await api(`/api/vendas/negocios/${id}`, { method: 'DELETE' });
        mostrarToast('Negócio excluído!');
        const detalheModal = bootstrap.Modal.getInstance(document.getElementById('modalDetalheNegocio'));
        if (detalheModal) detalheModal.hide();
        carregarNegocios();
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

// ==================== METAS ====================

async function carregarMetas() {
    try {
        const periodo = document.getElementById('metaPeriodo').value;
        const vendedor = getVendedorFiltro();
        let url = `/api/vendas/metas/progresso?periodo=${periodo}`;
        if (vendedor) url += '&vendedor=' + encodeURIComponent(vendedor);

        const metas = await api(url);
        renderMetas(metas);
    } catch (err) {
        mostrarToast('Erro ao carregar metas: ' + err.message, 'error');
    }
}

function renderMetas(metas) {
    const container = document.getElementById('metasContainer');

    if (!metas.length) {
        container.innerHTML = '<div class="text-center text-muted py-5">Nenhuma meta para este período</div>';
        return;
    }

    const TIPO_META_LABELS = {
        quantidade_ativacoes: 'Qtd. Ativações',
        quantidade_upsells: 'Qtd. Upsells',
        valor_contratos: 'Valor Contratos'
    };

    container.innerHTML = `
        <div class="table-container">
            <div class="table-responsive">
                <table class="table table-hover mb-0">
                    <thead>
                        <tr>
                            <th>Vendedor</th>
                            <th>Tipo</th>
                            <th>Alvo</th>
                            <th>Atingido</th>
                            <th>Progresso</th>
                            <th>Comissão</th>
                            ${isAdmin ? '<th>Ações</th>' : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${metas
                            .map((m) => {
                                const pct = Math.min(m.percentual_atingido || 0, 100);
                                const corBarra = pct >= 100 ? 'bg-success' : pct >= 50 ? 'bg-primary' : 'bg-warning';
                                const isValor = m.tipo_meta === 'valor_contratos';
                                const alvo = isValor ? formatarMoeda(m.valor_alvo) : m.valor_alvo;
                                const atingido = isValor ? formatarMoeda(m.valor_atingido || 0) : m.valor_atingido || 0;
                                const comissao = m.comissao_calculada ? formatarMoeda(m.comissao_calculada) : '-';

                                return `
                                <tr>
                                    <td><strong>${escapeHtml(m.vendedor)}</strong></td>
                                    <td>${TIPO_META_LABELS[m.tipo_meta] || m.tipo_meta}</td>
                                    <td>${alvo}</td>
                                    <td>${atingido}</td>
                                    <td style="min-width:200px">
                                        <div class="d-flex align-items-center gap-2">
                                            <div class="progress flex-grow-1" style="height:20px">
                                                <div class="progress-bar ${corBarra}" style="width:${pct}%">${pct.toFixed(0)}%</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td>${comissao}</td>
                                    ${
                                        isAdmin
                                            ? `
                                        <td>
                                            <button class="btn btn-sm btn-outline-primary btn-action" onclick='abrirModalMeta(${JSON.stringify(m)})' title="Editar">
                                                <i class="bi bi-pencil"></i>
                                            </button>
                                            <button class="btn btn-sm btn-outline-danger btn-action" onclick="excluirMeta(${m.id})" title="Excluir">
                                                <i class="bi bi-trash"></i>
                                            </button>
                                        </td>
                                    `
                                            : ''
                                    }
                                </tr>
                            `;
                            })
                            .join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function abrirModalMeta(meta = null) {
    document.getElementById('metaId').value = meta ? meta.id : '';
    document.getElementById('metaPeriodoInput').value = meta
        ? meta.periodo_referencia
        : document.getElementById('metaPeriodo').value;
    document.getElementById('metaTipo').value = meta ? meta.tipo_meta : 'quantidade_ativacoes';
    document.getElementById('metaValorAlvo').value = meta ? meta.valor_alvo : '';
    document.getElementById('metaComissao').value = meta ? meta.percentual_comissao || '' : '';
    document.getElementById('modalMetaTitulo').textContent = meta ? 'Editar Meta' : 'Nova Meta';

    // Set vendedor
    if (meta && meta.vendedor) {
        const sel = document.getElementById('metaVendedor');
        // Garantir que o vendedor existe nas opções
        let found = false;
        for (let opt of sel.options) {
            if (opt.value === meta.vendedor) {
                opt.selected = true;
                found = true;
                break;
            }
        }
        if (!found) {
            const opt = document.createElement('option');
            opt.value = meta.vendedor;
            opt.textContent = meta.vendedor;
            opt.selected = true;
            sel.appendChild(opt);
        }
    }

    new bootstrap.Modal(document.getElementById('modalMeta')).show();
}

async function salvarMeta() {
    const id = document.getElementById('metaId').value;
    const vendedor = document.getElementById('metaVendedor').value;
    const periodo_referencia = document.getElementById('metaPeriodoInput').value;
    const tipo_meta = document.getElementById('metaTipo').value;
    const valor_alvo = parseFloat(document.getElementById('metaValorAlvo').value);
    const percentual_comissao = parseFloat(document.getElementById('metaComissao').value) || 0;

    if (!vendedor || !periodo_referencia || !valor_alvo) {
        mostrarToast('Preencha todos os campos obrigatórios', 'warning');
        return;
    }

    const body = { vendedor, periodo_referencia, tipo_meta, valor_alvo, percentual_comissao };

    try {
        if (id) {
            await api(`/api/vendas/metas/${id}`, { method: 'PUT', body });
            mostrarToast('Meta atualizada!');
        } else {
            await api('/api/vendas/metas', { method: 'POST', body });
            mostrarToast('Meta criada!');
        }
        bootstrap.Modal.getInstance(document.getElementById('modalMeta')).hide();
        carregarMetas();
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

async function excluirMeta(id) {
    const ok = await confirmar('Excluir esta meta?');
    if (!ok) return;
    try {
        await api(`/api/vendas/metas/${id}`, { method: 'DELETE' });
        mostrarToast('Meta excluída!');
        carregarMetas();
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

// ==================== AGENDA / TAREFAS ====================

async function carregarTarefas() {
    try {
        const status = document.getElementById('filtroTarefaStatus').value;
        const vendedor = getVendedorFiltro();
        let url = '/api/vendas/tarefas?';
        if (status) url += 'status=' + status + '&';
        if (vendedor) url += 'vendedor=' + encodeURIComponent(vendedor);

        todasTarefas = await api(url);
        renderTarefas();
    } catch (err) {
        mostrarToast('Erro ao carregar tarefas: ' + err.message, 'error');
    }
}

function renderTarefas() {
    const tbody = document.getElementById('tabelaTarefas');
    if (!todasTarefas.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Nenhuma tarefa encontrada</td></tr>';
        return;
    }

    const agora = new Date();

    tbody.innerHTML = todasTarefas
        .map((t) => {
            const tipo = TIPO_TAREFA_LABELS[t.tipo] || { label: t.tipo, cor: 'secondary', icon: 'bi-circle' };
            const dataHora = t.data_hora ? new Date(t.data_hora.replace(' ', 'T')) : null;
            const atrasada = t.status === 'pendente' && dataHora && dataHora < agora;

            const statusBadges = {
                pendente: '<span class="badge bg-warning">Pendente</span>',
                concluida: '<span class="badge bg-success">Concluída</span>',
                cancelada: '<span class="badge bg-secondary">Cancelada</span>'
            };

            const provedorNegocio = [t.provedor_nome, t.negocio_nome].filter(Boolean).join(' / ') || '-';

            return `
            <tr class="${atrasada ? 'table-danger' : ''}">
                <td><span class="badge bg-${tipo.cor}"><i class="bi ${tipo.icon} me-1"></i>${tipo.label}</span></td>
                <td>
                    <strong>${escapeHtml(t.titulo)}</strong>
                    ${atrasada ? '<span class="badge bg-danger ms-1">Atrasada</span>' : ''}
                    ${t.descricao ? `<br><small class="text-muted">${escapeHtml(t.descricao)}</small>` : ''}
                </td>
                <td>${escapeHtml(provedorNegocio)}</td>
                <td>${dataHora ? formatarDataHora(t.data_hora) : '-'}</td>
                <td>${statusBadges[t.status] || t.status}</td>
                <td>
                    <div class="d-flex gap-1">
                        ${
                            t.status === 'pendente'
                                ? `
                            <button class="btn btn-sm btn-outline-success btn-action" onclick="concluirTarefa(${t.id})" title="Concluir">
                                <i class="bi bi-check-lg"></i>
                            </button>
                        `
                                : ''
                        }
                        <button class="btn btn-sm btn-outline-primary btn-action" onclick='abrirModalTarefa(${JSON.stringify(t)})' title="Editar">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger btn-action" onclick="excluirTarefa(${t.id})" title="Excluir">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
        })
        .join('');
}

function abrirModalTarefa(tarefa = null) {
    document.getElementById('tarefaId').value = tarefa ? tarefa.id : '';
    document.getElementById('tarefaTitulo').value = tarefa ? tarefa.titulo : '';
    document.getElementById('tarefaTipo').value = tarefa ? tarefa.tipo : 'follow_up';
    document.getElementById('tarefaDescricao').value = tarefa ? tarefa.descricao || '' : '';
    document.getElementById('modalTarefaTitulo').textContent = tarefa ? 'Editar Tarefa' : 'Nova Tarefa';

    // Data hora
    if (tarefa && tarefa.data_hora) {
        const dt = tarefa.data_hora.replace(' ', 'T');
        document.getElementById('tarefaDataHora').value = dt.substring(0, 16);
    } else {
        document.getElementById('tarefaDataHora').value = '';
    }

    // Carregar provedores e negocios
    carregarProvedores(document.getElementById('tarefaProvedor'), tarefa ? tarefa.provedor_id : null);
    carregarNegociosSelect(document.getElementById('tarefaNegocio'), tarefa ? tarefa.negocio_id : null);

    new bootstrap.Modal(document.getElementById('modalTarefa')).show();
}

async function carregarNegociosSelect(selectEl, selecionado) {
    try {
        const negocios = await api('/api/vendas/negocios');
        selectEl.innerHTML = '<option value="">Nenhum</option>';
        negocios.forEach((n) => {
            const opt = document.createElement('option');
            opt.value = n.id;
            opt.textContent = n.provedor_nome || n.provedor_nome_lead || 'Negócio #' + n.id;
            if (selecionado && n.id == selecionado) opt.selected = true;
            selectEl.appendChild(opt);
        });
    } catch (err) {
        console.error('Erro ao carregar negócios para select:', err);
    }
}

async function salvarTarefa() {
    const id = document.getElementById('tarefaId').value;
    const titulo = document.getElementById('tarefaTitulo').value.trim();
    const tipo = document.getElementById('tarefaTipo').value;
    const data_hora = document.getElementById('tarefaDataHora').value;
    const descricao = document.getElementById('tarefaDescricao').value.trim();
    const provedor_id = document.getElementById('tarefaProvedor').value || null;
    const negocio_id = document.getElementById('tarefaNegocio').value || null;

    if (!titulo || !data_hora) {
        mostrarToast('Preencha título e data/hora', 'warning');
        return;
    }

    const body = {
        titulo,
        tipo,
        data_hora: data_hora.replace('T', ' '),
        descricao,
        provedor_id,
        negocio_id,
        responsavel: usuarioAtual.nome
    };

    try {
        if (id) {
            await api(`/api/vendas/tarefas/${id}`, { method: 'PUT', body });
            mostrarToast('Tarefa atualizada!');
        } else {
            await api('/api/vendas/tarefas', { method: 'POST', body });
            mostrarToast('Tarefa criada!');
        }
        bootstrap.Modal.getInstance(document.getElementById('modalTarefa')).hide();
        carregarTarefas();
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

async function concluirTarefa(id) {
    try {
        await api(`/api/vendas/tarefas/${id}/status`, {
            method: 'PATCH',
            body: { status: 'concluida' }
        });
        mostrarToast('Tarefa concluída!');
        carregarTarefas();
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

async function excluirTarefa(id) {
    const ok = await confirmar('Excluir esta tarefa?');
    if (!ok) return;
    try {
        await api(`/api/vendas/tarefas/${id}`, { method: 'DELETE' });
        mostrarToast('Tarefa excluída!');
        carregarTarefas();
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

// ==================== VISITAS ====================

async function carregarVisitas() {
    try {
        const status = document.getElementById('filtroVisitaStatus').value;
        const vendedor = getVendedorFiltro();
        let url = '/api/vendas/visitas?';
        if (status) url += 'status=' + status + '&';
        if (vendedor) url += 'vendedor=' + encodeURIComponent(vendedor);

        todasVisitas = await api(url);
        renderVisitas();
    } catch (err) {
        mostrarToast('Erro ao carregar visitas: ' + err.message, 'error');
    }
}

function renderVisitas() {
    const tbody = document.getElementById('tabelaVisitas');
    if (!todasVisitas.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">Nenhuma visita encontrada</td></tr>';
        return;
    }

    const statusBadges = {
        agendada: '<span class="badge bg-primary">Agendada</span>',
        realizada: '<span class="badge bg-success">Realizada</span>',
        cancelada: '<span class="badge bg-danger">Cancelada</span>',
        remarcada: '<span class="badge bg-warning">Remarcada</span>'
    };

    const tipoBadges = {
        presencial: '<span class="badge bg-info"><i class="bi bi-geo-alt me-1"></i>Presencial</span>',
        remota: '<span class="badge bg-secondary"><i class="bi bi-camera-video me-1"></i>Remota</span>'
    };

    tbody.innerHTML = todasVisitas
        .map(
            (v) => `
        <tr>
            <td><strong>${escapeHtml(v.provedor_nome || '-')}</strong></td>
            <td>${formatarData(v.data_visita)}</td>
            <td>${v.hora_visita || '-'}</td>
            <td>${tipoBadges[v.tipo_visita] || v.tipo_visita}</td>
            <td>${statusBadges[v.status] || v.status}</td>
            <td><small>${escapeHtml(v.endereco || '-')}</small></td>
            <td>${escapeHtml(v.responsavel || '-')}</td>
            <td>
                <div class="d-flex gap-1">
                    <button class="btn btn-sm btn-outline-primary btn-action" onclick='abrirModalVisita(${JSON.stringify(v)})' title="Editar">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger btn-action" onclick="excluirVisita(${v.id})" title="Excluir">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `
        )
        .join('');
}

function abrirModalVisita(visita = null) {
    document.getElementById('visitaId').value = visita ? visita.id : '';
    document.getElementById('visitaData').value = visita ? visita.data_visita : '';
    document.getElementById('visitaHora').value = visita ? visita.hora_visita || '' : '';
    document.getElementById('visitaTipo').value = visita ? visita.tipo_visita : 'presencial';
    document.getElementById('visitaStatus').value = visita ? visita.status : 'agendada';
    document.getElementById('visitaEndereco').value = visita ? visita.endereco || '' : '';
    document.getElementById('visitaObs').value = visita ? visita.observacoes || '' : '';
    document.getElementById('visitaResultado').value = visita ? visita.resultado || '' : '';
    document.getElementById('modalVisitaTitulo').textContent = visita ? 'Editar Visita' : 'Nova Visita';
    document.getElementById('visitaResultadoContainer').style.display =
        visita && visita.status === 'realizada' ? '' : 'none';

    carregarProvedores(document.getElementById('visitaProvedor'), visita ? visita.provedor_id : null);
    carregarNegociosSelect(document.getElementById('visitaNegocio'), visita ? visita.negocio_id : null);

    new bootstrap.Modal(document.getElementById('modalVisita')).show();
}

async function salvarVisita() {
    const id = document.getElementById('visitaId').value;
    const provedor_id = document.getElementById('visitaProvedor').value;
    const negocio_id = document.getElementById('visitaNegocio').value || null;
    const data_visita = document.getElementById('visitaData').value;
    const hora_visita = document.getElementById('visitaHora').value;
    const tipo_visita = document.getElementById('visitaTipo').value;
    const status = document.getElementById('visitaStatus').value;
    const endereco = document.getElementById('visitaEndereco').value.trim();
    const observacoes = document.getElementById('visitaObs').value.trim();
    const resultado = document.getElementById('visitaResultado').value.trim();

    if (!provedor_id || !data_visita) {
        mostrarToast('Preencha provedor e data', 'warning');
        return;
    }

    const body = {
        provedor_id,
        negocio_id,
        data_visita,
        hora_visita,
        tipo_visita,
        status,
        endereco,
        observacoes,
        resultado,
        responsavel: usuarioAtual.nome
    };

    try {
        if (id) {
            await api(`/api/vendas/visitas/${id}`, { method: 'PUT', body });
            mostrarToast('Visita atualizada!');
        } else {
            await api('/api/vendas/visitas', { method: 'POST', body });
            mostrarToast('Visita agendada!');
        }
        bootstrap.Modal.getInstance(document.getElementById('modalVisita')).hide();
        carregarVisitas();
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

async function excluirVisita(id) {
    const ok = await confirmar('Excluir esta visita?');
    if (!ok) return;
    try {
        await api(`/api/vendas/visitas/${id}`, { method: 'DELETE' });
        mostrarToast('Visita excluída!');
        carregarVisitas();
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

// ==================== PROPOSTAS ====================

let todasPropostas = [];

async function carregarPropostas() {
    try {
        const status = document.getElementById('filtroPropostaStatus').value;
        const vendedor = getVendedorFiltro();
        let url = '/api/vendas/propostas?';
        if (status) url += 'status=' + status + '&';
        if (vendedor) url += 'vendedor=' + encodeURIComponent(vendedor);

        todasPropostas = await api(url);
        renderPropostas();
    } catch (err) {
        mostrarToast('Erro ao carregar propostas: ' + err.message, 'error');
    }
}

function renderPropostas() {
    const tbody = document.getElementById('tabelaPropostas');
    if (!todasPropostas.length) {
        tbody.innerHTML =
            '<tr><td colspan="8" class="text-center text-muted py-4">Nenhuma proposta encontrada</td></tr>';
        return;
    }

    const statusBadges = {
        rascunho: '<span class="badge bg-secondary">Rascunho</span>',
        enviada: '<span class="badge bg-primary">Enviada</span>',
        aceita: '<span class="badge bg-success">Aceita</span>',
        recusada: '<span class="badge bg-danger">Recusada</span>'
    };

    const viaBadges = {
        whatsapp: '<span class="badge bg-success"><i class="bi bi-whatsapp me-1"></i>WhatsApp</span>',
        email: '<span class="badge bg-info"><i class="bi bi-envelope me-1"></i>Email</span>',
        ambos: '<span class="badge bg-warning text-dark"><i class="bi bi-whatsapp me-1"></i><i class="bi bi-envelope"></i></span>'
    };

    tbody.innerHTML = todasPropostas
        .map((p) => {
            let planosArr = [];
            try {
                planosArr = JSON.parse(p.planos || '[]');
            } catch {}
            const planosStr = planosArr.map((pl) => pl.nome).join(', ') || '-';

            return `
            <tr>
                <td><strong>${escapeHtml(p.provedor_nome)}</strong></td>
                <td>${escapeHtml(p.titulo)}</td>
                <td><small>${escapeHtml(planosStr)}</small></td>
                <td>${formatarMoeda(p.valor_total || 0)}</td>
                <td>${statusBadges[p.status] || p.status}</td>
                <td>${viaBadges[p.enviada_via] || '-'}</td>
                <td>${formatarData(p.criado_em)}</td>
                <td>
                    <div class="d-flex gap-1 flex-wrap">
                        <button class="btn btn-sm btn-outline-danger btn-action" onclick="gerarPDF(${p.id})" title="Gerar/Download PDF">
                            <i class="bi bi-file-pdf"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-success btn-action" onclick="abrirModalEnviar(${p.id})" title="Enviar">
                            <i class="bi bi-send"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-info btn-action" onclick="gerarFormulario(${p.id})" title="Gerar Formulario">
                            <i class="bi bi-file-text"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-warning btn-action" onclick="abrirRastreamento(${p.id})" title="Rastreamento">
                            <i class="bi bi-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-secondary btn-action" onclick="duplicarProposta(${p.id})" title="Duplicar">
                            <i class="bi bi-copy"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-primary btn-action" onclick='editarProposta(${p.id})' title="Editar">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger btn-action" onclick="excluirProposta(${p.id})" title="Excluir">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
        })
        .join('');
}

function propostaProvedorChange() {
    const sel = document.getElementById('propostaProvedorId');
    const opt = sel.options[sel.selectedIndex];
    if (opt && opt.value) {
        document.getElementById('propostaProvedorNome').value = opt.textContent;
    }
}

function calcularValorTotal() {
    let total = 0;

    // Planos principais
    if (document.getElementById('planoLitePlus').checked) {
        total += parseFloat(document.getElementById('precoLitePlus').value) || 0;
    }
    if (document.getElementById('planoFull').checked) {
        total += parseFloat(document.getElementById('precoFull').value) || 0;
    }
    if (document.getElementById('planoCombo').checked) {
        total += parseFloat(document.getElementById('precoCombo').value) || 0;
    }

    // Adicionais
    document.querySelectorAll('#propostaAdicionais .adicional').forEach((card) => {
        const check = card.querySelector('.adicional-check');
        const preco = card.querySelector('.adicional-preco');
        if (check.checked) {
            total += parseFloat(preco.value) || 0;
        }
    });

    document.getElementById('propostaValorTotal').value = total.toFixed(2);
}

function getPlanosSelecionados() {
    const planos = [];

    if (document.getElementById('planoLitePlus').checked) {
        planos.push({
            nome: 'Zapping Lite Plus',
            preco: parseFloat(document.getElementById('precoLitePlus').value) || 0
        });
    }
    if (document.getElementById('planoFull').checked) {
        planos.push({ nome: 'Zapping Full', preco: parseFloat(document.getElementById('precoFull').value) || 0 });
    }
    if (document.getElementById('planoCombo').checked) {
        planos.push({ nome: 'Lite Plus + Full', preco: parseFloat(document.getElementById('precoCombo').value) || 0 });
    }

    document.querySelectorAll('#propostaAdicionais .adicional').forEach((card) => {
        const check = card.querySelector('.adicional-check');
        const preco = card.querySelector('.adicional-preco');
        if (check.checked) {
            planos.push({ nome: check.getAttribute('data-nome'), preco: parseFloat(preco.value) || 0 });
        }
    });

    return planos;
}

function setPlanosSelecionados(planos) {
    // Limpar tudo
    document.getElementById('planoLitePlus').checked = false;
    document.getElementById('precoLitePlus').value = '';
    document.getElementById('planoFull').checked = false;
    document.getElementById('precoFull').value = '';
    document.getElementById('planoCombo').checked = false;
    document.getElementById('precoCombo').value = '';

    document.querySelectorAll('#propostaAdicionais .adicional').forEach((card) => {
        card.querySelector('.adicional-check').checked = false;
        card.querySelector('.adicional-preco').value = '';
    });

    if (!planos) return;

    planos.forEach((p) => {
        if (p.nome === 'Zapping Lite Plus') {
            document.getElementById('planoLitePlus').checked = true;
            document.getElementById('precoLitePlus').value = p.preco;
        } else if (p.nome === 'Zapping Full') {
            document.getElementById('planoFull').checked = true;
            document.getElementById('precoFull').value = p.preco;
        } else if (p.nome === 'Lite Plus + Full') {
            document.getElementById('planoCombo').checked = true;
            document.getElementById('precoCombo').value = p.preco;
        } else {
            // Adicional
            document.querySelectorAll('#propostaAdicionais .adicional').forEach((card) => {
                const check = card.querySelector('.adicional-check');
                if (check.getAttribute('data-nome') === p.nome) {
                    check.checked = true;
                    card.querySelector('.adicional-preco').value = p.preco;
                }
            });
        }
    });

    calcularValorTotal();
}

function abrirModalProposta(proposta = null) {
    document.getElementById('propostaId').value = proposta ? proposta.id : '';
    document.getElementById('propostaProvedorNome').value = proposta ? proposta.provedor_nome || '' : '';
    document.getElementById('propostaTitulo').value = proposta ? proposta.titulo : 'Proposta Comercial - Zapping TV';
    document.getElementById('propostaValidade').value = proposta ? proposta.validade_dias : 30;
    document.getElementById('propostaStatus').value = proposta ? proposta.status : 'rascunho';
    document.getElementById('propostaCondicoes').value = proposta ? proposta.condicoes || '' : '';
    document.getElementById('modalPropostaTitulo').textContent = proposta ? 'Editar Proposta' : 'Nova Proposta';

    // Planos
    let planosArr = [];
    if (proposta && proposta.planos) {
        try {
            planosArr = JSON.parse(proposta.planos);
        } catch {}
    }
    setPlanosSelecionados(planosArr);
    if (proposta) {
        document.getElementById('propostaValorTotal').value = (proposta.valor_total || 0).toFixed(2);
    }

    // Carregar selects
    carregarProvedores(document.getElementById('propostaProvedorId'), proposta ? proposta.provedor_id : null);
    carregarNegociosSelect(document.getElementById('propostaNegocioId'), proposta ? proposta.negocio_id : null);

    new bootstrap.Modal(document.getElementById('modalProposta')).show();
}

async function editarProposta(id) {
    try {
        const proposta = await api(`/api/vendas/propostas/${id}`);
        abrirModalProposta(proposta);
    } catch (err) {
        mostrarToast('Erro ao carregar proposta: ' + err.message, 'error');
    }
}

async function salvarProposta() {
    const id = document.getElementById('propostaId').value;
    const provedor_id = document.getElementById('propostaProvedorId').value || null;
    const provedor_nome = document.getElementById('propostaProvedorNome').value.trim();
    const titulo = document.getElementById('propostaTitulo').value.trim();
    const negocio_id = document.getElementById('propostaNegocioId').value || null;
    const planos = getPlanosSelecionados();
    const valor_total = parseFloat(document.getElementById('propostaValorTotal').value) || 0;
    const validade_dias = parseInt(document.getElementById('propostaValidade').value) || 30;
    const status = document.getElementById('propostaStatus').value;
    const condicoes = document.getElementById('propostaCondicoes').value.trim();

    if (!provedor_nome || !titulo) {
        mostrarToast('Preencha o nome do provedor e título', 'warning');
        return;
    }

    const body = {
        provedor_id,
        provedor_nome,
        titulo,
        negocio_id,
        planos: JSON.stringify(planos),
        valor_total,
        validade_dias,
        status,
        condicoes
    };

    try {
        if (id) {
            await api(`/api/vendas/propostas/${id}`, { method: 'PUT', body });
            mostrarToast('Proposta atualizada!');
        } else {
            await api('/api/vendas/propostas', { method: 'POST', body });
            mostrarToast('Proposta criada!');
        }
        bootstrap.Modal.getInstance(document.getElementById('modalProposta')).hide();
        carregarPropostas();
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

async function gerarPDF(id) {
    try {
        mostrarToast('Gerando PDF...', 'info');
        await api(`/api/vendas/propostas/${id}/gerar-pdf`, { method: 'POST' });
        // Download
        window.open(`/api/vendas/propostas/${id}/download`, '_blank');
        mostrarToast('PDF gerado!');
    } catch (err) {
        mostrarToast('Erro ao gerar PDF: ' + err.message, 'error');
    }
}

function abrirModalEnviar(id) {
    document.getElementById('enviarPropostaId').value = id;

    // Tentar preencher WhatsApp do provedor
    const proposta = todasPropostas.find((p) => p.id === id);
    document.getElementById('enviarWhatsAppNumero').value = proposta?.whatsapp_destino || '';
    document.getElementById('enviarEmailDestino').value = proposta?.email_destino || '';

    // Reset checkboxes
    document.getElementById('enviarViaWhatsApp').checked = true;
    document.getElementById('enviarViaEmail').checked = false;
    document.getElementById('campoWhatsApp').classList.remove('d-none');
    document.getElementById('campoEmail').classList.add('d-none');

    new bootstrap.Modal(document.getElementById('modalEnviarProposta')).show();
}

async function executarEnvio() {
    const id = document.getElementById('enviarPropostaId').value;
    const viaWA = document.getElementById('enviarViaWhatsApp').checked;
    const viaEmail = document.getElementById('enviarViaEmail').checked;
    const mensagem = document.getElementById('enviarMensagem').value.trim();
    const incluirPDF = document.getElementById('enviarIncluirPDF').checked;
    const incluirFormulario = document.getElementById('enviarIncluirFormulario').checked;

    if (!viaWA && !viaEmail) {
        mostrarToast('Selecione pelo menos uma forma de envio', 'warning');
        return;
    }

    const btn = document.getElementById('btnEnviarProposta');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Enviando...';

    try {
        // Gerar PDF primeiro (se marcado)
        if (incluirPDF) {
            await api(`/api/vendas/propostas/${id}/gerar-pdf`, { method: 'POST' });
        }

        if (viaWA) {
            const numero = document.getElementById('enviarWhatsAppNumero').value.trim();
            if (!numero) {
                throw new Error('Informe o número do WhatsApp');
            }
            await api(`/api/vendas/propostas/${id}/enviar-whatsapp`, {
                method: 'POST',
                body: { numero: numero, mensagem, incluir_pdf: incluirPDF, incluir_formulario: incluirFormulario }
            });
            mostrarToast('Enviada via WhatsApp!');
        }

        if (viaEmail) {
            const email = document.getElementById('enviarEmailDestino').value.trim();
            if (!email) {
                throw new Error('Informe o email de destino');
            }
            await api(`/api/vendas/propostas/${id}/enviar-email`, {
                method: 'POST',
                body: { email, mensagem, incluir_pdf: incluirPDF, incluir_formulario: incluirFormulario }
            });
            mostrarToast('Enviada via Email!');
        }

        bootstrap.Modal.getInstance(document.getElementById('modalEnviarProposta')).hide();
        carregarPropostas();
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-send me-1"></i>Enviar';
    }
}

async function gerarFormulario(id) {
    try {
        const result = await api(`/api/vendas/propostas/${id}/gerar-formulario`, { method: 'POST' });
        const url = window.location.origin + '/formulario/' + result.token;

        // Copiar para clipboard
        await navigator.clipboard.writeText(url);
        mostrarToast('Link do formulário copiado! ' + url, 'success');
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

async function excluirProposta(id) {
    const ok = await confirmar('Excluir esta proposta?');
    if (!ok) return;
    try {
        await api(`/api/vendas/propostas/${id}`, { method: 'DELETE' });
        mostrarToast('Proposta excluída!');
        carregarPropostas();
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

// ==================== FORMULARIOS PREENCHIDOS ====================

async function abrirFormulariosPreenchidos() {
    const container = document.getElementById('listaFormularios');
    container.innerHTML =
        '<div class="text-center text-muted py-4"><span class="spinner-border spinner-border-sm"></span> Carregando...</div>';

    new bootstrap.Modal(document.getElementById('modalFormularios')).show();

    try {
        const formularios = await api('/api/vendas/formularios');
        if (!formularios.length) {
            container.innerHTML = '<div class="text-center text-muted py-4">Nenhum formulário encontrado</div>';
            return;
        }

        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-hover mb-0">
                    <thead>
                        <tr>
                            <th>Provedor</th>
                            <th>Status</th>
                            <th>Criado em</th>
                            <th>Preenchido em</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${formularios
                            .map((f) => {
                                const statusBadge =
                                    f.status === 'preenchido'
                                        ? '<span class="badge bg-success">Preenchido</span>'
                                        : '<span class="badge bg-warning">Pendente</span>';
                                return `
                                <tr>
                                    <td><strong>${escapeHtml(f.provedor_nome)}</strong></td>
                                    <td>${statusBadge}</td>
                                    <td>${formatarData(f.criado_em)}</td>
                                    <td>${f.preenchido_em ? formatarDataHora(f.preenchido_em) : '-'}</td>
                                    <td>
                                        <div class="d-flex gap-1">
                                            ${
                                                f.status === 'preenchido'
                                                    ? `
                                                <button class="btn btn-sm btn-outline-primary btn-action" onclick="verDadosFormulario(${f.id})" title="Ver dados">
                                                    <i class="bi bi-eye"></i>
                                                </button>
                                            `
                                                    : ''
                                            }
                                            <button class="btn btn-sm btn-outline-secondary btn-action" onclick="copiarLinkFormulario('${f.token}')" title="Copiar link">
                                                <i class="bi bi-link-45deg"></i>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `;
                            })
                            .join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (err) {
        container.innerHTML = '<div class="text-center text-danger py-4">Erro ao carregar formulários</div>';
    }
}

async function verDadosFormulario(id) {
    try {
        const form = await api(`/api/vendas/formularios/${id}`);
        let dados = {};
        try {
            dados = JSON.parse(form.dados || '{}');
        } catch {}

        const labels = {
            razao_social: 'Razão Social',
            cnpj: 'CNPJ',
            responsavel: 'Responsável',
            email: 'Email',
            telefone: 'Telefone',
            endereco: 'Endereço',
            qtd_assinantes: 'Qtd. Assinantes',
            erp: 'ERP',
            observacoes: 'Observações'
        };

        let html = '<div class="row g-2">';
        for (const [key, val] of Object.entries(dados)) {
            html += `
                <div class="col-md-6">
                    <strong>${labels[key] || key}:</strong><br>
                    ${escapeHtml(String(val || '-'))}
                </div>
            `;
        }
        html += '</div>';

        const container = document.getElementById('listaFormularios');
        container.innerHTML = `
            <div class="mb-3">
                <button class="btn btn-sm btn-outline-secondary" onclick="abrirFormulariosPreenchidos()">
                    <i class="bi bi-arrow-left me-1"></i>Voltar
                </button>
                <span class="ms-2 fw-bold">${escapeHtml(form.provedor_nome)}</span>
            </div>
            ${html}
        `;
    } catch (err) {
        mostrarToast('Erro ao carregar dados: ' + err.message, 'error');
    }
}

async function copiarLinkFormulario(token) {
    const url = window.location.origin + '/formulario/' + token;
    await navigator.clipboard.writeText(url);
    mostrarToast('Link copiado!');
}

// ==================== CONFIG EMAIL ====================

async function abrirConfigEmail() {
    try {
        const config = await api('/api/config/email');
        document.getElementById('configSmtpHost').value = config.smtp_host || 'smtp.gmail.com';
        document.getElementById('configSmtpPort').value = config.smtp_port || 587;
        document.getElementById('configSmtpUser').value = config.smtp_user || '';
        document.getElementById('configSmtpPass').value = config.smtp_pass || '';
        document.getElementById('configNomeRemetente').value = config.nome_remetente || 'Nexus';
        document.getElementById('configEmailAtivo').checked = !!config.ativo;
    } catch (err) {
        // Config não encontrada, usar defaults
    }

    new bootstrap.Modal(document.getElementById('modalConfigEmail')).show();
}

async function salvarConfigEmail() {
    const body = {
        smtp_host: document.getElementById('configSmtpHost').value.trim(),
        smtp_port: parseInt(document.getElementById('configSmtpPort').value) || 587,
        smtp_user: document.getElementById('configSmtpUser').value.trim(),
        smtp_pass: document.getElementById('configSmtpPass').value,
        nome_remetente: document.getElementById('configNomeRemetente').value.trim(),
        ativo: document.getElementById('configEmailAtivo').checked ? 1 : 0
    };

    try {
        await api('/api/config/email', { method: 'PUT', body });
        mostrarToast('Configuração salva!');
        bootstrap.Modal.getInstance(document.getElementById('modalConfigEmail')).hide();
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

async function testarEmail() {
    try {
        mostrarToast('Enviando email de teste...', 'info');
        await api('/api/config/email/testar', { method: 'POST' });
        mostrarToast('Email de teste enviado com sucesso!');
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

// ==================== DASHBOARD DE VENDAS ====================

async function carregarDashboardVendas() {
    try {
        const vendedor = getVendedorFiltro();
        let url = '/api/vendas/dashboard';
        if (vendedor) url += '?vendedor=' + encodeURIComponent(vendedor);
        const data = await api(url);

        // KPIs
        document.getElementById('kpiTotalNegocios').textContent = data.kpis.totalNegocios;
        document.getElementById('kpiAtivacoes').textContent = data.kpis.totalAtivados;
        document.getElementById('kpiTaxaConversao').textContent = data.kpis.taxaConversao + '%';
        document.getElementById('kpiValorPipeline').textContent = formatarMoeda(data.kpis.valorPipeline);
        document.getElementById('kpiAtivMes').textContent = data.kpis.ativacoesMes;
        document.getElementById('kpiPropostas').textContent = data.propostas.enviadas;
        document.getElementById('kpiPropostasAceitas').textContent = data.propostas.aceitas;
        document.getElementById('kpiVisitasMes').textContent = data.kpis.visitasMes;

        // Funil
        const estagioOrdem = ['lead', 'contato', 'proposta', 'negociacao', 'ativado', 'perdido'];
        const funilContainer = document.getElementById('dashFunil');
        const maxFunil = Math.max(...data.funil.map((f) => f.total), 1);
        funilContainer.innerHTML = estagioOrdem
            .map((key) => {
                const est = ESTAGIOS.find((e) => e.key === key) || {};
                const item = data.funil.find((f) => f.estagio === key) || { total: 0, valor: 0 };
                const pct = (item.total / maxFunil) * 100;
                return `
                <div class="d-flex align-items-center gap-2 mb-2">
                    <div style="width:100px"><small><i class="bi ${est.icon || ''}" style="color:${est.cor || '#999'}"></i> ${est.label || key}</small></div>
                    <div class="flex-grow-1">
                        <div class="progress" style="height:22px">
                            <div class="progress-bar" style="width:${pct}%;background:${est.cor || '#999'}">${item.total}</div>
                        </div>
                    </div>
                    <small class="text-muted" style="width:90px;text-align:right">${formatarMoeda(item.valor)}</small>
                </div>
            `;
            })
            .join('');

        // Ativacoes por mes (barras simples)
        const ativContainer = document.getElementById('dashAtivacoesMes');
        if (data.ativacoesPorMes.length === 0) {
            ativContainer.innerHTML = '<div class="text-center text-muted py-3">Sem dados</div>';
        } else {
            const maxAtiv = Math.max(...data.ativacoesPorMes.map((a) => a.total), 1);
            ativContainer.innerHTML = `<div class="d-flex align-items-end gap-2 justify-content-center" style="height:180px">
                ${data.ativacoesPorMes
                    .map((a) => {
                        const h = Math.max((a.total / maxAtiv) * 150, 10);
                        const mesLabel = a.mes.substring(5);
                        return `<div class="text-center">
                        <div style="height:${h}px;width:35px;background:linear-gradient(180deg,#D93B63,#F2CC1A);border-radius:4px 4px 0 0" title="${a.total}"></div>
                        <small class="d-block mt-1">${mesLabel}</small>
                        <small class="fw-bold">${a.total}</small>
                    </div>`;
                    })
                    .join('')}
            </div>`;
        }

        // Ranking
        const rankContainer = document.getElementById('dashRanking');
        if (data.rankingVendedores.length === 0) {
            rankContainer.innerHTML = '<div class="text-center text-muted py-3">Sem dados</div>';
        } else {
            rankContainer.innerHTML = data.rankingVendedores
                .map((r, i) => {
                    const medal =
                        i === 0
                            ? '<i class="bi bi-trophy-fill text-warning"></i>'
                            : i === 1
                              ? '<i class="bi bi-trophy-fill text-secondary"></i>'
                              : i === 2
                                ? '<i class="bi bi-trophy-fill" style="color:#cd7f32"></i>'
                                : `<span class="badge bg-secondary">${i + 1}</span>`;
                    return `
                    <div class="d-flex align-items-center gap-2 mb-2 p-2 rounded" style="background:var(--bg-body,#f8f9fa)">
                        ${medal}
                        <div class="flex-grow-1">
                            <strong>${escapeHtml(r.vendedor)}</strong>
                            <small class="text-muted d-block">${r.ativacoes} ativacoes | ${r.total_negocios} negocios</small>
                        </div>
                        <span class="fw-bold text-success">${formatarMoeda(r.valor_ativado)}</span>
                    </div>
                `;
                })
                .join('');
        }

        // Por Origem
        const origemContainer = document.getElementById('dashOrigem');
        if (data.porOrigem.length === 0) {
            origemContainer.innerHTML = '<div class="text-center text-muted py-3">Sem dados</div>';
        } else {
            const cores = ['#D93B63', '#E26E47', '#F2CC1A', '#198754', '#0dcaf0', '#6c757d', '#a855f7'];
            const maxOri = Math.max(...data.porOrigem.map((o) => o.total), 1);
            origemContainer.innerHTML = data.porOrigem
                .map(
                    (o, i) => `
                <div class="d-flex align-items-center gap-2 mb-2">
                    <span style="width:10px;height:10px;border-radius:50%;background:${cores[i % cores.length]};flex-shrink:0"></span>
                    <span style="width:110px">${escapeHtml(o.origem)}</span>
                    <div class="progress flex-grow-1" style="height:18px">
                        <div class="progress-bar" style="width:${(o.total / maxOri) * 100}%;background:${cores[i % cores.length]}">${o.total}</div>
                    </div>
                </div>
            `
                )
                .join('');
        }

        // Propostas resumo
        const propContainer = document.getElementById('dashPropostas');
        const p = data.propostas;
        propContainer.innerHTML = `
            <div class="row g-3 text-center">
                <div class="col-md-3 col-6">
                    <div class="p-3 rounded" style="background:var(--bg-body,#f8f9fa)">
                        <h4 class="mb-0">${p.total}</h4>
                        <small class="text-muted">Total Propostas</small>
                    </div>
                </div>
                <div class="col-md-3 col-6">
                    <div class="p-3 rounded" style="background:var(--bg-body,#f8f9fa)">
                        <h4 class="mb-0 text-primary">${p.enviadas}</h4>
                        <small class="text-muted">Enviadas</small>
                    </div>
                </div>
                <div class="col-md-3 col-6">
                    <div class="p-3 rounded" style="background:var(--bg-body,#f8f9fa)">
                        <h4 class="mb-0 text-success">${p.aceitas}</h4>
                        <small class="text-muted">Aceitas</small>
                    </div>
                </div>
                <div class="col-md-3 col-6">
                    <div class="p-3 rounded" style="background:var(--bg-body,#f8f9fa)">
                        <h4 class="mb-0 text-danger">${p.recusadas}</h4>
                        <small class="text-muted">Recusadas</small>
                    </div>
                </div>
            </div>
        `;

        // Carregar alertas de follow-up
        carregarFollowUpAlertas();
    } catch (err) {
        console.error('Erro dashboard vendas:', err);
    }
}

// ==================== FOLLOW-UP AUTOMATICO ====================

async function carregarFollowUpAlertas() {
    try {
        const vendedor = getVendedorFiltro();
        let url = '/api/vendas/followup/alertas';
        if (vendedor) url += '?vendedor=' + encodeURIComponent(vendedor);
        const alertas = await api(url);

        const container = document.getElementById('followupAlertas');
        if (!alertas.length) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = `
            <div class="alert alert-warning alert-dismissible fade show mb-3">
                <strong><i class="bi bi-bell me-1"></i>${alertas.length} Alertas de Follow-up</strong>
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                <div class="mt-2">
                    ${alertas
                        .slice(0, 5)
                        .map(
                            (a) => `
                        <div class="d-flex align-items-center gap-2 mb-1">
                            <i class="bi ${a.icone} text-${a.cor}"></i>
                            <span>${escapeHtml(a.titulo)}</span>
                            <small class="text-muted ms-auto">${escapeHtml(a.descricao)}</small>
                        </div>
                    `
                        )
                        .join('')}
                    ${alertas.length > 5 ? `<small class="text-muted">... e mais ${alertas.length - 5} alertas</small>` : ''}
                </div>
            </div>
        `;
    } catch (err) {
        console.error('Erro follow-up alertas:', err);
    }
}

async function abrirFollowUpConfig() {
    const container = document.getElementById('followupConfigLista');
    container.innerHTML = '<div class="text-center"><span class="spinner-border spinner-border-sm"></span></div>';
    new bootstrap.Modal(document.getElementById('modalFollowUpConfig')).show();

    try {
        const configs = await api('/api/vendas/followup/config');
        const tipoLabels = {
            proposta_sem_resposta: 'Proposta sem resposta',
            proposta_expirando: 'Proposta expirando',
            formulario_preenchido: 'Formulario preenchido'
        };

        container.innerHTML = configs
            .map(
                (c) => `
            <div class="card mb-2">
                <div class="card-body py-2 px-3">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <strong>${tipoLabels[c.tipo] || c.tipo}</strong>
                            <small class="text-muted d-block">${escapeHtml(c.mensagem || '')}</small>
                        </div>
                        <div class="d-flex align-items-center gap-2">
                            <input type="number" class="form-control form-control-sm" style="width:60px" value="${c.dias_apos}" min="0"
                                onchange="atualizarFollowUpConfig(${c.id}, this.value, ${c.ativo})">
                            <small>dias</small>
                            <div class="form-check form-switch ms-2">
                                <input class="form-check-input" type="checkbox" ${c.ativo ? 'checked' : ''}
                                    onchange="atualizarFollowUpConfig(${c.id}, ${c.dias_apos}, this.checked ? 1 : 0)">
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `
            )
            .join('');
    } catch (err) {
        container.innerHTML = '<div class="text-center text-danger">Erro ao carregar</div>';
    }
}

async function atualizarFollowUpConfig(id, dias, ativo) {
    try {
        await api(`/api/vendas/followup/config/${id}`, {
            method: 'PUT',
            body: { dias_apos: Number(dias), ativo: ativo ? 1 : 0 }
        });
        mostrarToast('Configuracao atualizada!');
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

// ==================== HISTORICO POR PROVEDOR ====================

async function abrirHistoricoProvedor(provedorId) {
    const container = document.getElementById('historicoProvedorConteudo');
    container.innerHTML =
        '<div class="text-center"><span class="spinner-border spinner-border-sm"></span> Carregando...</div>';
    new bootstrap.Modal(document.getElementById('modalHistoricoProvedor')).show();

    try {
        const data = await api(`/api/vendas/historico-provedor/${provedorId}`);
        const titulo = document.querySelector('#modalHistoricoProvedor .modal-title');
        titulo.innerHTML = `<i class="bi bi-clock-history me-2"></i>Historico: ${escapeHtml(data.provedor.nome)}`;

        if (!data.eventos.length) {
            container.innerHTML = '<div class="text-center text-muted py-4">Nenhuma interacao encontrada</div>';
            return;
        }

        container.innerHTML = `
            <div class="timeline-vendas">
                ${data.eventos
                    .map(
                        (e) => `
                    <div class="timeline-item">
                        <div class="timeline-icon" style="background:${e.cor}">
                            <i class="bi ${e.icone}"></i>
                        </div>
                        <div class="timeline-content">
                            <div class="d-flex justify-content-between">
                                <strong>${escapeHtml(e.titulo)}</strong>
                                <small class="text-muted">${formatarDataHora(e.data)}</small>
                            </div>
                            <div class="text-muted small">${escapeHtml(e.descricao)}</div>
                            ${e.responsavel ? `<small class="badge bg-secondary mt-1">${escapeHtml(e.responsavel)}</small>` : ''}
                        </div>
                    </div>
                `
                    )
                    .join('')}
            </div>
        `;
    } catch (err) {
        container.innerHTML = `<div class="text-center text-danger">Erro: ${err.message}</div>`;
    }
}

// ==================== TEMPLATES DE PROPOSTA ====================

async function abrirTemplates() {
    const container = document.getElementById('listaTemplates');
    container.innerHTML = '<div class="text-center"><span class="spinner-border spinner-border-sm"></span></div>';
    new bootstrap.Modal(document.getElementById('modalTemplates')).show();

    try {
        const templates = await api('/api/vendas/templates');
        if (!templates.length) {
            container.innerHTML = '<div class="text-center text-muted py-3">Nenhum template salvo</div>';
            return;
        }

        container.innerHTML = templates
            .map((t) => {
                let planos = [];
                try {
                    planos = JSON.parse(t.planos || '[]');
                } catch {}
                return `
                <div class="card mb-2">
                    <div class="card-body py-2 px-3">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <strong>${escapeHtml(t.nome)}</strong>
                                <small class="text-muted d-block">${planos.map((p) => p.nome).join(', ') || 'Sem planos'} | Validade: ${t.validade_dias} dias</small>
                            </div>
                            <div class="d-flex gap-1">
                                <button class="btn btn-sm btn-outline-primary btn-action" onclick="usarTemplate(${t.id})" title="Usar este template">
                                    <i class="bi bi-box-arrow-in-right"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-danger btn-action" onclick="excluirTemplate(${t.id})" title="Excluir">
                                    <i class="bi bi-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            })
            .join('');
    } catch (err) {
        container.innerHTML = '<div class="text-center text-danger">Erro ao carregar</div>';
    }
}

async function salvarTemplate() {
    const nome = document.getElementById('templateNome').value.trim();
    if (!nome) {
        mostrarToast('Informe o nome do template', 'warning');
        return;
    }

    const planos = getPlanosSelecionados();
    const condicoes = document.getElementById('propostaCondicoes').value.trim();
    const validade_dias = parseInt(document.getElementById('propostaValidade').value) || 30;

    try {
        await api('/api/vendas/templates', {
            method: 'POST',
            body: { nome, planos: JSON.stringify(planos), condicoes, validade_dias }
        });
        mostrarToast('Template salvo!');
        document.getElementById('templateNome').value = '';
        abrirTemplates();
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

async function usarTemplate(id) {
    try {
        const templates = await api('/api/vendas/templates');
        const t = templates.find((tpl) => tpl.id === id);
        if (!t) return;

        let planos = [];
        try {
            planos = JSON.parse(t.planos || '[]');
        } catch {}

        // Fechar modal templates
        bootstrap.Modal.getInstance(document.getElementById('modalTemplates')).hide();

        // Abrir modal proposta com dados do template
        setTimeout(() => {
            abrirModalProposta();
            setTimeout(() => {
                setPlanosSelecionados(planos);
                document.getElementById('propostaCondicoes').value = t.condicoes || '';
                document.getElementById('propostaValidade').value = t.validade_dias || 30;
                calcularValorTotal();
            }, 200);
        }, 300);

        mostrarToast('Template aplicado!');
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

async function excluirTemplate(id) {
    const ok = await confirmar('Excluir este template?');
    if (!ok) return;
    try {
        await api(`/api/vendas/templates/${id}`, { method: 'DELETE' });
        mostrarToast('Template excluido!');
        abrirTemplates();
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

// ==================== RASTREAMENTO DE PROPOSTA ====================

async function abrirRastreamento(id) {
    const container = document.getElementById('rastreamentoConteudo');
    container.innerHTML = '<div class="text-center"><span class="spinner-border spinner-border-sm"></span></div>';
    new bootstrap.Modal(document.getElementById('modalRastreamento')).show();

    try {
        const data = await api(`/api/vendas/propostas/${id}/rastreamento`);
        container.innerHTML = `
            <div class="text-center mb-3">
                <h2 class="mb-0" style="color:#D93B63">${data.visualizacoes}</h2>
                <small class="text-muted">visualizacoes do PDF</small>
            </div>
            ${
                data.detalhes.length > 0
                    ? `
                <div class="table-responsive">
                    <table class="table table-sm mb-0">
                        <thead><tr><th>Data</th><th>IP</th><th>Navegador</th></tr></thead>
                        <tbody>
                            ${data.detalhes
                                .map(
                                    (d) => `
                                <tr>
                                    <td>${formatarDataHora(d.visualizado_em)}</td>
                                    <td><small>${escapeHtml(d.ip || '-')}</small></td>
                                    <td><small>${escapeHtml((d.user_agent || '').substring(0, 50))}</small></td>
                                </tr>
                            `
                                )
                                .join('')}
                        </tbody>
                    </table>
                </div>
            `
                    : '<div class="text-center text-muted">Nenhuma visualizacao registrada</div>'
            }
        `;
    } catch (err) {
        container.innerHTML = `<div class="text-center text-danger">Erro: ${err.message}</div>`;
    }
}

// ==================== DUPLICAR PROPOSTA ====================

async function duplicarProposta(id) {
    try {
        const nova = await api(`/api/vendas/propostas/${id}/duplicar`, { method: 'POST' });
        mostrarToast('Proposta duplicada! #' + nova.id);
        carregarPropostas();
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

// ==================== COMISSOES ====================

async function carregarComissoes() {
    try {
        const periodo = document.getElementById('comissaoPeriodo').value;
        const vendedor = getVendedorFiltro();
        let url = '/api/vendas/comissoes?';
        if (periodo) url += 'periodo=' + periodo + '&';
        if (vendedor) url += 'vendedor=' + encodeURIComponent(vendedor);

        const comissoes = await api(url);
        renderComissoes(comissoes);

        // Carregar resumo
        let urlResumo =
            '/api/vendas/comissoes/relatorio?periodo=' + (periodo || new Date().toISOString().substring(0, 7));
        if (vendedor) urlResumo += '&vendedor=' + encodeURIComponent(vendedor);
        const resumo = await api(urlResumo);
        renderComissaoResumo(resumo);
    } catch (err) {
        mostrarToast('Erro ao carregar comissoes: ' + err.message, 'error');
    }
}

function renderComissoes(comissoes) {
    const tbody = document.getElementById('tabelaComissoes');
    if (!comissoes.length) {
        tbody.innerHTML =
            '<tr><td colspan="7" class="text-center text-muted py-4">Nenhuma comissao encontrada</td></tr>';
        return;
    }

    const statusBadges = {
        pendente: '<span class="badge bg-warning">Pendente</span>',
        paga: '<span class="badge bg-success">Paga</span>',
        cancelada: '<span class="badge bg-danger">Cancelada</span>'
    };

    tbody.innerHTML = comissoes
        .map(
            (c) => `
        <tr>
            <td><strong>${escapeHtml(c.vendedor)}</strong></td>
            <td>${escapeHtml(c.descricao || '-')}</td>
            <td>${formatarMoeda(c.valor_base || 0)}</td>
            <td>${c.percentual || 0}%</td>
            <td><strong class="text-success">${formatarMoeda(c.valor_comissao || 0)}</strong></td>
            <td>${statusBadges[c.status] || c.status}</td>
            <td>
                <div class="d-flex gap-1">
                    ${
                        isAdmin && c.status === 'pendente'
                            ? `
                        <button class="btn btn-sm btn-outline-success btn-action" onclick="marcarComissaoPaga(${c.id})" title="Marcar como paga">
                            <i class="bi bi-check-lg"></i>
                        </button>
                    `
                            : ''
                    }
                    ${
                        isAdmin
                            ? `
                        <button class="btn btn-sm btn-outline-danger btn-action" onclick="excluirComissao(${c.id})" title="Excluir">
                            <i class="bi bi-trash"></i>
                        </button>
                    `
                            : ''
                    }
                </div>
            </td>
        </tr>
    `
        )
        .join('');
}

function renderComissaoResumo(resumo) {
    const container = document.getElementById('comissaoResumo');
    if (!resumo.resumo.length) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <div class="row g-2 mb-2">
            ${resumo.resumo
                .map(
                    (r) => `
                <div class="col-md-4">
                    <div class="card">
                        <div class="card-body py-2 px-3 text-center">
                            <strong>${escapeHtml(r.vendedor)}</strong>
                            <h4 class="text-success mb-0">${formatarMoeda(r.total_valor)}</h4>
                            <small class="text-muted">${r.total_comissoes} comissoes | Base: ${formatarMoeda(r.total_base)}</small>
                        </div>
                    </div>
                </div>
            `
                )
                .join('')}
        </div>
        <div class="text-end">
            <strong>Total Geral: <span class="text-success">${formatarMoeda(resumo.total_geral)}</span></strong>
        </div>
    `;
}

async function calcularComissoes() {
    const periodo = document.getElementById('comissaoPeriodo').value;
    if (!periodo) {
        mostrarToast('Selecione um periodo', 'warning');
        return;
    }

    try {
        const result = await api('/api/vendas/comissoes/calcular', { method: 'POST', body: { periodo } });
        mostrarToast(`${result.comissoes_geradas} comissoes calculadas para ${periodo}`);
        carregarComissoes();
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

async function marcarComissaoPaga(id) {
    try {
        await api(`/api/vendas/comissoes/${id}/status`, { method: 'PATCH', body: { status: 'paga' } });
        mostrarToast('Comissao marcada como paga!');
        carregarComissoes();
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

async function excluirComissao(id) {
    const ok = await confirmar('Excluir esta comissao?');
    if (!ok) return;
    try {
        await api(`/api/vendas/comissoes/${id}`, { method: 'DELETE' });
        mostrarToast('Comissao excluida!');
        carregarComissoes();
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

// --- Regras de Comissao ---

async function abrirRegrasComissao() {
    const container = document.getElementById('listaRegrasComissao');
    container.innerHTML = '<div class="text-center"><span class="spinner-border spinner-border-sm"></span></div>';
    new bootstrap.Modal(document.getElementById('modalRegrasComissao')).show();

    // Popular select vendedores
    try {
        const usuarios = await api('/api/usuarios');
        const sel = document.getElementById('regraVendedor');
        sel.innerHTML = '<option value="">Vendedor...</option>';
        usuarios
            .filter((u) => u.perfil === 'vendedor' || u.perfil === 'admin')
            .forEach((u) => {
                sel.innerHTML += `<option value="${escapeHtml(u.nome)}">${escapeHtml(u.nome)}</option>`;
            });
    } catch {}

    try {
        const regras = await api('/api/vendas/comissoes/regras');
        const tipoLabels = { por_ativacao: 'Por Ativacao', por_valor: '% do Valor', por_plano: 'Por Plano' };

        if (!regras.length) {
            container.innerHTML = '<div class="text-center text-muted py-3">Nenhuma regra configurada</div>';
            return;
        }

        container.innerHTML = regras
            .map(
                (r) => `
            <div class="d-flex align-items-center gap-2 mb-2 p-2 rounded" style="background:var(--bg-body,#f8f9fa)">
                <div class="flex-grow-1">
                    <strong>${escapeHtml(r.vendedor)}</strong> -
                    <span class="badge bg-info">${tipoLabels[r.tipo] || r.tipo}</span>
                    ${r.percentual ? `<span class="badge bg-success">${r.percentual}%</span>` : ''}
                    ${r.valor_fixo ? `<span class="badge bg-warning">R$ ${Number(r.valor_fixo).toFixed(2)}</span>` : ''}
                    ${r.plano_filtro ? `<small class="text-muted">Plano: ${escapeHtml(r.plano_filtro)}</small>` : ''}
                </div>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" ${r.ativo ? 'checked' : ''}
                        onchange="toggleRegraComissao(${r.id}, this.checked)">
                </div>
                <button class="btn btn-sm btn-outline-danger btn-action" onclick="excluirRegraComissao(${r.id})">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        `
            )
            .join('');
    } catch (err) {
        container.innerHTML = '<div class="text-center text-danger">Erro ao carregar</div>';
    }
}

async function salvarRegraComissao() {
    const vendedor = document.getElementById('regraVendedor').value;
    const tipo = document.getElementById('regraTipo').value;
    const percentual = parseFloat(document.getElementById('regraPercentual').value) || 0;
    const valor_fixo = parseFloat(document.getElementById('regraValorFixo').value) || 0;

    if (!vendedor) {
        mostrarToast('Selecione um vendedor', 'warning');
        return;
    }

    try {
        await api('/api/vendas/comissoes/regras', { method: 'POST', body: { vendedor, tipo, percentual, valor_fixo } });
        mostrarToast('Regra adicionada!');
        abrirRegrasComissao();
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

async function toggleRegraComissao(id, ativo) {
    try {
        await api(`/api/vendas/comissoes/regras/${id}`, { method: 'PUT', body: { ativo: ativo ? 1 : 0 } });
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

async function excluirRegraComissao(id) {
    try {
        await api(`/api/vendas/comissoes/regras/${id}`, { method: 'DELETE' });
        mostrarToast('Regra excluida!');
        abrirRegrasComissao();
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

// ==================== UTILS ====================

function formatarMoeda(valor) {
    return 'R$ ' + Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ==================== CONTRATOS ====================

async function carregarContratos() {
    try {
        const status = document.getElementById('filtroContratoStatus')?.value || '';
        let url = '/api/vendas/contratos';
        if (status) url += '?status=' + status;
        todosContratos = await api(url);
        renderContratos();
    } catch (err) {
        mostrarToast('Erro ao carregar contratos: ' + err.message, 'error');
    }
}

function renderContratos() {
    const tbody = document.getElementById('tabelaContratos');
    if (!todosContratos.length) {
        tbody.innerHTML =
            '<tr><td colspan="7" class="text-center text-muted py-4">Nenhum contrato encontrado</td></tr>';
        return;
    }
    const statusBadges = {
        pendente: '<span class="badge bg-secondary">Pendente</span>',
        enviado: '<span class="badge bg-primary">Enviado</span>',
        assinado: '<span class="badge bg-success">Assinado</span>',
        cancelado: '<span class="badge bg-danger">Cancelado</span>'
    };
    tbody.innerHTML = todosContratos
        .map(
            (c) => `
        <tr>
            <td><strong>${escapeHtml(c.provedor_nome)}</strong></td>
            <td>${escapeHtml(c.titulo)}</td>
            <td>${formatarMoeda(c.valor_mensal || 0)}</td>
            <td>${statusBadges[c.status] || c.status}</td>
            <td>${c.assinatura_nome ? `<span class="text-success"><i class="bi bi-check-circle me-1"></i>${escapeHtml(c.assinatura_nome)}</span>` : '-'}</td>
            <td>${formatarData(c.criado_em)}</td>
            <td>
                <div class="d-flex gap-1 flex-wrap">
                    <button class="btn btn-sm btn-outline-danger btn-action" onclick="gerarPDFContrato(${c.id})" title="Gerar PDF">
                        <i class="bi bi-file-pdf"></i>
                    </button>
                    ${
                        c.status !== 'assinado'
                            ? `<button class="btn btn-sm btn-outline-success btn-action" onclick="enviarParaAceite(${c.id})" title="Enviar para aceite digital">
                        <i class="bi bi-send"></i>
                    </button>`
                            : ''
                    }
                    ${
                        c.assinatura_token
                            ? `<button class="btn btn-sm btn-outline-info btn-action" onclick="verLinkAceite('${c.assinatura_token}')" title="Ver link de aceite">
                        <i class="bi bi-link-45deg"></i>
                    </button>`
                            : ''
                    }
                    <button class="btn btn-sm btn-outline-primary btn-action" onclick="editarContrato(${c.id})" title="Editar">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger btn-action" onclick="excluirContrato(${c.id})" title="Excluir">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `
        )
        .join('');
}

function contratoProvedorChange() {
    const sel = document.getElementById('contratoProvedorId');
    const opt = sel.options[sel.selectedIndex];
    if (opt && opt.value) {
        document.getElementById('contratoProvedorNome').value = opt.textContent;
    }
}

async function abrirModalContrato(contrato = null) {
    document.getElementById('contratoId').value = '';
    document.getElementById('contratoTitulo').value = '';
    document.getElementById('contratoNumero').value = '';
    document.getElementById('contratoProvedorNome').value = '';
    document.getElementById('contratoConteudo').value = '';
    document.getElementById('contratoValorMensal').value = '';
    document.getElementById('contratoValorTotal').value = '';
    document.getElementById('contratoDataInicio').value = '';
    document.getElementById('contratoDataFim').value = '';
    document.getElementById('contratoStatus').value = 'pendente';

    // Carregar provedores
    try {
        const provs = await api('/api/provedores');
        const sel = document.getElementById('contratoProvedorId');
        sel.innerHTML =
            '<option value="">Selecione...</option>' +
            provs.map((p) => `<option value="${p.id}">${escapeHtml(p.nome)}</option>`).join('');
    } catch {}

    // Carregar negocios
    await carregarNegociosSelect(document.getElementById('contratoNegocioId'));

    // Carregar propostas
    try {
        const props = await api('/api/vendas/propostas');
        const sel = document.getElementById('contratoPropostaId');
        sel.innerHTML =
            '<option value="">Nenhuma</option>' +
            props
                .map((p) => `<option value="${p.id}">${escapeHtml(p.titulo)} - ${escapeHtml(p.provedor_nome)}</option>`)
                .join('');
    } catch {}

    document.getElementById('modalContratoTitulo').textContent = 'Novo Contrato';
    new bootstrap.Modal(document.getElementById('modalContrato')).show();
}

async function editarContrato(id) {
    const contrato = todosContratos.find((c) => c.id === id);
    if (!contrato) return;
    await abrirModalContrato();
    document.getElementById('contratoId').value = contrato.id;
    document.getElementById('contratoTitulo').value = contrato.titulo || '';
    document.getElementById('contratoNumero').value = contrato.numero_contrato || '';
    document.getElementById('contratoProvedorNome').value = contrato.provedor_nome || '';
    document.getElementById('contratoConteudo').value = contrato.conteudo || '';
    document.getElementById('contratoValorMensal').value = contrato.valor_mensal || '';
    document.getElementById('contratoValorTotal').value = contrato.valor_total || '';
    document.getElementById('contratoDataInicio').value = contrato.data_inicio || '';
    document.getElementById('contratoDataFim').value = contrato.data_fim || '';
    document.getElementById('contratoStatus').value = contrato.status || 'pendente';
    if (contrato.provedor_id) document.getElementById('contratoProvedorId').value = contrato.provedor_id;
    if (contrato.negocio_id) document.getElementById('contratoNegocioId').value = contrato.negocio_id;
    if (contrato.proposta_id) document.getElementById('contratoPropostaId').value = contrato.proposta_id;
    document.getElementById('modalContratoTitulo').textContent = 'Editar Contrato';
}

async function salvarContrato() {
    const id = document.getElementById('contratoId').value;
    const dados = {
        provedor_id: document.getElementById('contratoProvedorId').value || null,
        provedor_nome: document.getElementById('contratoProvedorNome').value,
        titulo: document.getElementById('contratoTitulo').value,
        numero_contrato: document.getElementById('contratoNumero').value,
        negocio_id: document.getElementById('contratoNegocioId').value || null,
        proposta_id: document.getElementById('contratoPropostaId').value || null,
        conteudo: document.getElementById('contratoConteudo').value,
        valor_mensal: parseFloat(document.getElementById('contratoValorMensal').value) || 0,
        valor_total: parseFloat(document.getElementById('contratoValorTotal').value) || 0,
        data_inicio: document.getElementById('contratoDataInicio').value || null,
        data_fim: document.getElementById('contratoDataFim').value || null,
        status: document.getElementById('contratoStatus').value
    };
    if (!dados.titulo || !dados.provedor_nome) return mostrarToast('Titulo e provedor obrigatorios', 'error');
    try {
        if (id) {
            await api('/api/vendas/contratos/' + id, { method: 'PUT', body: dados });
        } else {
            await api('/api/vendas/contratos', { method: 'POST', body: dados });
        }
        bootstrap.Modal.getInstance(document.getElementById('modalContrato'))?.hide();
        mostrarToast(id ? 'Contrato atualizado!' : 'Contrato criado!');
        carregarContratos();
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

async function gerarPDFContrato(id) {
    try {
        const r = await api('/api/vendas/contratos/' + id + '/gerar-pdf', { method: 'POST' });
        if (r.ok) {
            window.open('/api/vendas/contratos/' + id + '/download', '_blank');
            mostrarToast('PDF gerado!');
        }
    } catch (err) {
        mostrarToast('Erro ao gerar PDF: ' + err.message, 'error');
    }
}

async function enviarParaAceite(id) {
    try {
        const r = await api('/api/vendas/contratos/' + id + '/enviar', { method: 'POST' });
        if (r.ok) {
            const url = window.location.origin + r.url;
            document.getElementById('aceiteLinkUrl').value = url;
            new bootstrap.Modal(document.getElementById('modalAceiteLink')).show();
            carregarContratos();
        }
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

function verLinkAceite(token) {
    const url = window.location.origin + '/contrato-aceite/' + token;
    document.getElementById('aceiteLinkUrl').value = url;
    new bootstrap.Modal(document.getElementById('modalAceiteLink')).show();
}

function copiarAceiteLink() {
    const input = document.getElementById('aceiteLinkUrl');
    input.select();
    navigator.clipboard.writeText(input.value).then(() => {
        mostrarToast('Link copiado!');
    });
}

async function excluirContrato(id) {
    if (!confirm('Tem certeza que deseja excluir este contrato?')) return;
    try {
        await api('/api/vendas/contratos/' + id, { method: 'DELETE' });
        mostrarToast('Contrato excluido!');
        carregarContratos();
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}
