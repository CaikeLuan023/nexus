// ==================== ORDENS DE SERVICO ====================

let _osData = [];
let _tecnicosList = [];
let _osDetalheAtualId = null;
let _galeriaFotos = [];
let _galeriaIndex = 0;

// ==================== BADGE HELPERS ====================

function badgeStatusOS(status) {
    const cores = {
        rascunho: 'secondary',
        enviada: 'info',
        aceita: 'primary',
        em_deslocamento: 'warning',
        em_execucao: 'purple',
        concluida: 'success',
        recusada: 'danger',
        cancelada: 'dark'
    };
    const labels = {
        rascunho: 'Rascunho',
        enviada: 'Enviada',
        aceita: 'Aceita',
        em_deslocamento: 'Em Deslocamento',
        em_execucao: 'Em Execucao',
        concluida: 'Concluida',
        recusada: 'Recusada',
        cancelada: 'Cancelada'
    };
    const cor = cores[status] || 'secondary';
    const style = cor === 'purple' ? ' style="background-color:#7209b7"' : '';
    return `<span class="badge bg-${cor}"${style}>${labels[status] || status}</span>`;
}

function badgePrioridadeOS(prioridade) {
    const cores = {
        baixa: 'secondary',
        normal: 'info',
        alta: 'warning',
        urgente: 'danger'
    };
    const labels = {
        baixa: 'Baixa',
        normal: 'Normal',
        alta: 'Alta',
        urgente: 'Urgente'
    };
    return `<span class="badge bg-${cores[prioridade] || 'secondary'}">${labels[prioridade] || prioridade}</span>`;
}

function labelTipoServico(tipo) {
    const labels = {
        instalacao: 'Instalacao',
        manutencao: 'Manutencao',
        reparo: 'Reparo',
        troca_equipamento: 'Troca de Equipamento',
        vistoria: 'Vistoria',
        visita_tecnica: 'Visita Tecnica',
        desinstalacao: 'Desinstalacao',
        outro: 'Outro'
    };
    return labels[tipo] || tipo || '-';
}

// ==================== HELPERS ====================

function _setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function _setHtml(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
}

function _show(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('d-none');
}

function _hide(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('d-none');
}

// ==================== DATA LOADING ====================

async function carregarOS() {
    const params = new URLSearchParams();
    const status = document.getElementById('filtroStatusOS')?.value;
    const tecnico = document.getElementById('filtroTecnicoOS')?.value;
    const prioridade = document.getElementById('filtroPrioridadeOS')?.value;
    const tipoServico = document.getElementById('filtroTipoServicoOS')?.value;
    const dataInicio = document.getElementById('filtroDataInicioOS')?.value;
    const dataFim = document.getElementById('filtroDataFimOS')?.value;

    if (status) params.set('status', status);
    if (tecnico) params.set('tecnico_id', tecnico);
    if (prioridade) params.set('prioridade', prioridade);
    if (tipoServico) params.set('tipo_servico', tipoServico);
    if (dataInicio) params.set('data_inicio', dataInicio);
    if (dataFim) params.set('data_fim', dataFim);

    try {
        const lista = await api(`/api/ordens-servico?${params}`);
        _osData = lista;
        renderTabelaOS(lista);
        if (localStorage.getItem('os_vista') === 'kanban') {
            renderKanbanOS(lista);
        }
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function carregarTecnicos() {
    try {
        _tecnicosList = await api('/api/tecnicos');
        // Populate filter select
        const filtroSel = document.getElementById('filtroTecnicoOS');
        if (filtroSel) {
            filtroSel.innerHTML = '<option value="">Todos</option>';
            _tecnicosList.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = t.nome;
                filtroSel.appendChild(opt);
            });
        }
        // Populate modal select
        popularSelectTecnicos(document.getElementById('osTecnicoId'));
    } catch (err) {
        // Silencioso - lista de tecnicos pode estar vazia
    }
}

function popularSelectTecnicos(selectEl, selecionado) {
    if (!selectEl) return;
    selectEl.innerHTML = '<option value="">Nenhum (atribuir depois)</option>';
    _tecnicosList.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.nome;
        if (selecionado && t.id == selecionado) opt.selected = true;
        selectEl.appendChild(opt);
    });
}

async function carregarResumo() {
    try {
        await api('/api/ordens-servico/resumo');
    } catch (err) {
        // Silencioso
    }
}

// ==================== VIEW TOGGLE ====================

function setVistaTabela() {
    localStorage.setItem('os_vista', 'tabela');
    const vistaTabela = document.getElementById('vistaTabelaOS');
    const vistaKanban = document.getElementById('vistaKanbanOS');
    const btnTabela = document.getElementById('btnVistaTabelaOS');
    const btnKanban = document.getElementById('btnVistaKanbanOS');
    if (vistaTabela) vistaTabela.style.display = '';
    if (vistaKanban) vistaKanban.style.display = 'none';
    if (btnTabela) btnTabela.classList.add('active');
    if (btnKanban) btnKanban.classList.remove('active');
}

function setVistaKanban(skipSave) {
    if (!skipSave) localStorage.setItem('os_vista', 'kanban');
    const vistaTabela = document.getElementById('vistaTabelaOS');
    const vistaKanban = document.getElementById('vistaKanbanOS');
    const btnTabela = document.getElementById('btnVistaTabelaOS');
    const btnKanban = document.getElementById('btnVistaKanbanOS');
    if (vistaTabela) vistaTabela.style.display = 'none';
    if (vistaKanban) vistaKanban.style.display = 'flex';
    if (btnTabela) btnTabela.classList.remove('active');
    if (btnKanban) btnKanban.classList.add('active');
    renderKanbanOS(_osData);
}

// ==================== TABLE RENDERING ====================

function renderTabelaOS(lista) {
    const tbody = document.getElementById('tabelaOS');
    if (!tbody) return;

    if (!lista || lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">Nenhuma ordem de servico encontrada</td></tr>';
        return;
    }

    tbody.innerHTML = lista.map(os => {
        const tecnicoNome = os.tecnico_nome || '<span class="text-muted">Nao atribuido</span>';
        return `
        <tr>
            <td class="text-muted fw-medium">${escapeHtmlGlobal(os.numero)}</td>
            <td>${escapeHtmlGlobal(os.cliente_nome)}</td>
            <td>${escapeHtmlGlobal(labelTipoServico(os.tipo_servico))}</td>
            <td>${tecnicoNome}</td>
            <td>${badgePrioridadeOS(os.prioridade)}</td>
            <td>${badgeStatusOS(os.status)}</td>
            <td><small>${os.data_agendamento ? formatarData(os.data_agendamento) : '-'}</small></td>
            <td>
                <div class="d-flex gap-1">
                    <button class="btn btn-sm btn-outline-info btn-action" onclick="abrirDetalheOS(${os.id})" title="Detalhes"><i class="bi bi-eye"></i></button>
                    ${os.status === 'rascunho' ? `<button class="btn btn-sm btn-outline-primary btn-action" onclick="abrirModalOS(${os.id})" title="Editar"><i class="bi bi-pencil"></i></button>` : ''}
                    ${os.status === 'rascunho' ? `<button class="btn btn-sm btn-outline-success btn-action" onclick="enviarOS(${os.id})" title="Enviar para Tecnico"><i class="bi bi-send"></i></button>` : ''}
                    ${os.status === 'rascunho' ? `<button class="btn btn-sm btn-outline-danger btn-action" onclick="excluirOS(${os.id})" title="Excluir"><i class="bi bi-trash"></i></button>` : ''}
                    ${['enviada', 'aceita', 'em_deslocamento', 'em_execucao'].includes(os.status) ? `<button class="btn btn-sm btn-outline-dark btn-action" onclick="cancelarOS(${os.id})" title="Cancelar"><i class="bi bi-x-circle"></i></button>` : ''}
                </div>
            </td>
        </tr>`;
    }).join('');
}

// ==================== KANBAN RENDERING ====================

function renderKanbanOS(lista) {
    const board = document.getElementById('vistaKanbanOS');
    if (!board) return;

    const columns = [
        { status: 'rascunho', label: 'Rascunho', color: 'secondary', icon: 'bi-pencil' },
        { status: 'enviada', label: 'Enviada', color: 'info', icon: 'bi-send' },
        { status: 'aceita', label: 'Aceita', color: 'primary', icon: 'bi-check-circle' },
        { status: 'em_deslocamento', label: 'Em Deslocamento', color: 'warning', icon: 'bi-truck' },
        { status: 'em_execucao', label: 'Em Execucao', color: 'purple', icon: 'bi-gear' },
        { status: 'concluida', label: 'Concluida', color: 'success', icon: 'bi-check2-all' }
    ];

    board.innerHTML = columns.map(col => {
        const items = (lista || []).filter(os => os.status === col.status);
        const badgeClass = col.color === 'purple' ? 'badge-em_execucao' : `bg-${col.color}`;
        return `
        <div class="kanban-column">
            <div class="kanban-column-header">
                <span><i class="bi ${col.icon} me-1"></i>${col.label}</span>
                <span class="badge ${badgeClass}">${items.length}</span>
            </div>
            <div class="kanban-cards">
                ${items.length === 0 ? '<div class="text-center text-muted py-3" style="font-size:0.8rem">Nenhuma OS</div>' : items.map(os => `
                    <div class="kanban-card" onclick="abrirDetalheOS(${os.id})">
                        <div class="d-flex justify-content-between align-items-start mb-1">
                            <div class="card-title">${escapeHtmlGlobal(os.numero)}</div>
                            ${badgePrioridadeOS(os.prioridade)}
                        </div>
                        <div class="card-meta mb-1">
                            <i class="bi bi-person me-1"></i>${escapeHtmlGlobal(os.cliente_nome)}
                        </div>
                        <div class="card-meta mb-1">
                            <i class="bi bi-tools me-1"></i>${escapeHtmlGlobal(labelTipoServico(os.tipo_servico))}
                        </div>
                        <div class="card-meta">
                            <i class="bi bi-person-gear me-1"></i>${os.tecnico_nome || '<span class="text-muted">Sem tecnico</span>'}
                            ${os.data_agendamento ? `<span class="ms-2"><i class="bi bi-calendar me-1"></i>${formatarData(os.data_agendamento)}</span>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>`;
    }).join('');
}

// ==================== CRUD - MODAL CRIAR/EDITAR ====================

async function abrirModalOS(id) {
    // Reset all fields manually
    document.getElementById('osId').value = '';
    document.getElementById('osClienteNome').value = '';
    document.getElementById('osClienteTelefone').value = '';
    document.getElementById('osClienteDocumento').value = '';
    document.getElementById('osEndereco').value = '';
    document.getElementById('osEnderecoComplemento').value = '';
    document.getElementById('osTipoServico').value = '';
    document.getElementById('osDescricao').value = '';
    document.getElementById('osPrioridade').value = 'normal';
    document.getElementById('osEquipamentos').value = '';
    document.getElementById('osDataAgendamento').value = '';
    _setText('modalOSTitulo', 'Nova Ordem de Servico');

    // Populate tecnico dropdown
    popularSelectTecnicos(document.getElementById('osTecnicoId'));

    // Reset checklist
    const checklistContainer = document.getElementById('osChecklistContainer');
    if (checklistContainer) checklistContainer.innerHTML = '';

    // Clear new checklist input
    const novoItem = document.getElementById('osNovoChecklistItem');
    if (novoItem) novoItem.value = '';

    if (id) {
        // Edit mode - load existing data
        try {
            const os = await api(`/api/ordens-servico/${id}`);
            document.getElementById('osId').value = os.id;
            _setText('modalOSTitulo', 'Editar OS ' + (os.numero || ''));
            document.getElementById('osClienteNome').value = os.cliente_nome || '';
            document.getElementById('osClienteTelefone').value = os.cliente_telefone || '';
            document.getElementById('osClienteDocumento').value = os.cliente_documento || '';
            document.getElementById('osEndereco').value = os.endereco || '';
            document.getElementById('osEnderecoComplemento').value = os.endereco_complemento || '';
            document.getElementById('osTipoServico').value = os.tipo_servico || '';
            document.getElementById('osDescricao').value = os.descricao || '';
            document.getElementById('osPrioridade').value = os.prioridade || 'normal';
            document.getElementById('osDataAgendamento').value = os.data_agendamento ? os.data_agendamento.substring(0, 16) : '';

            // Tecnico
            popularSelectTecnicos(document.getElementById('osTecnicoId'), os.tecnico_id);

            // Equipamentos
            const eqEl = document.getElementById('osEquipamentos');
            if (eqEl) {
                try {
                    const equipamentos = os.equipamentos ? JSON.parse(os.equipamentos) : [];
                    eqEl.value = equipamentos.join(', ');
                } catch {
                    eqEl.value = os.equipamentos || '';
                }
            }

            // Checklist items
            if (os.checklist && os.checklist.length > 0 && checklistContainer) {
                os.checklist.forEach(item => {
                    adicionarItemChecklist(item.descricao);
                });
            }
        } catch (err) {
            mostrarToast(err.message, 'error');
            return;
        }
    }

    // Close detail modal if open
    fecharModalDetalhe();

    const modal = new bootstrap.Modal(document.getElementById('modalOS'));
    modal.show();
}

async function salvarOS(statusDesejado) {
    const id = document.getElementById('osId').value;
    const clienteNome = document.getElementById('osClienteNome').value.trim();
    const endereco = document.getElementById('osEndereco').value.trim();
    const tipoServico = document.getElementById('osTipoServico').value;

    if (!clienteNome || !endereco || !tipoServico) {
        mostrarToast('Preencha os campos obrigatorios: Cliente, Endereco e Tipo de Servico', 'warning');
        return;
    }

    // Build equipamentos array from textarea (comma or newline separated)
    const eqText = document.getElementById('osEquipamentos')?.value || '';
    const equipamentos = eqText.split(/[,\n]/).map(l => l.trim()).filter(Boolean);

    // Build checklist array
    const checklistInputs = document.querySelectorAll('.os-checklist-input');
    const checklist = [];
    checklistInputs.forEach(input => {
        const desc = input.value.trim();
        if (desc) checklist.push({ descricao: desc });
    });

    const data = {
        tecnico_id: document.getElementById('osTecnicoId')?.value || null,
        cliente_nome: clienteNome,
        cliente_telefone: document.getElementById('osClienteTelefone')?.value.trim() || null,
        cliente_documento: document.getElementById('osClienteDocumento')?.value.trim() || null,
        endereco: endereco,
        endereco_complemento: document.getElementById('osEnderecoComplemento')?.value.trim() || null,
        tipo_servico: tipoServico,
        descricao: document.getElementById('osDescricao')?.value.trim() || null,
        equipamentos: equipamentos.length > 0 ? equipamentos : null,
        prioridade: document.getElementById('osPrioridade')?.value || 'normal',
        data_agendamento: document.getElementById('osDataAgendamento')?.value || null,
        checklist: checklist
    };

    try {
        let resultado;
        if (id) {
            resultado = await api(`/api/ordens-servico/${id}`, { method: 'PUT', body: data });
        } else {
            resultado = await api('/api/ordens-servico', { method: 'POST', body: data });
        }

        bootstrap.Modal.getInstance(document.getElementById('modalOS'))?.hide();

        // Enviar automaticamente se status desejado = enviada
        if (statusDesejado === 'enviada') {
            const osId = id || resultado.id;
            if (!data.tecnico_id) {
                mostrarToast('Atribua um tecnico antes de enviar', 'warning');
            } else {
                await enviarOS(osId);
            }
        } else {
            mostrarToast(id ? 'OS atualizada!' : 'OS criada!');
        }

        carregarOS();
        carregarResumo();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function excluirOS(id) {
    if (!confirm('Tem certeza que deseja excluir esta Ordem de Servico?')) return;
    try {
        await api(`/api/ordens-servico/${id}`, { method: 'DELETE' });
        mostrarToast('Ordem de Servico excluida!');
        carregarOS();
        carregarResumo();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

// ==================== DETAIL MODAL ====================

async function abrirDetalheOS(id) {
    _osDetalheAtualId = id;
    try {
        const os = await api(`/api/ordens-servico/${id}`);

        // Header
        _setText('detalheOSNumero', os.numero || 'OS #---');
        _setHtml('detalheOSStatusBadge', badgeStatusOS(os.status));
        const idEl = document.getElementById('detalheOSId');
        if (idEl) idEl.value = os.id;

        // Info fields
        _setText('detalheCliente', os.cliente_nome || '---');
        _setText('detalheTelefone', os.cliente_telefone || '---');
        _setText('detalheEndereco', (os.endereco || '---') + (os.endereco_complemento ? ' - ' + os.endereco_complemento : ''));
        _setText('detalheTipo', labelTipoServico(os.tipo_servico));
        _setText('detalheTecnico', os.tecnico_nome || 'Nao atribuido');
        _setText('detalhePrioridade', (os.prioridade || '---').charAt(0).toUpperCase() + (os.prioridade || '').slice(1));
        _setText('detalheAgendamento', os.data_agendamento ? formatarData(os.data_agendamento) : '---');
        _setText('detalheCriadaEm', os.criado_em ? formatarDataHora(os.criado_em) : '---');
        _setText('detalheConcluidaEm', os.data_conclusao ? formatarDataHora(os.data_conclusao) : '---');

        // Timeline (historico)
        renderTimeline(os.historico || [], document.getElementById('detalheTimeline'));

        // Chat
        carregarMensagensOS(id);

        // Fotos - split by type
        renderFotosDetalhe(os.fotos || []);

        // Checklist
        renderChecklistDetalhe(os.checklist || []);

        // Assinatura
        const assinaturaContainer = document.getElementById('detalheAssinaturaContainer');
        const assinaturaEl = document.getElementById('detalheAssinatura');
        if (os.assinatura_base64 && assinaturaContainer && assinaturaEl) {
            assinaturaContainer.style.display = '';
            assinaturaEl.innerHTML = `<img src="${os.assinatura_base64}" style="max-height:100px" alt="Assinatura">`;
        } else if (assinaturaContainer) {
            if (os.status === 'concluida') {
                assinaturaContainer.style.display = '';
                if (assinaturaEl) assinaturaEl.innerHTML = '<span class="text-muted">Sem assinatura registrada</span>';
            } else {
                assinaturaContainer.style.display = 'none';
            }
        }

        // Action buttons
        renderBotoesAcao(os);

        // Show modal
        const modalEl = document.getElementById('modalDetalheOS');
        let modal = bootstrap.Modal.getInstance(modalEl);
        if (!modal) modal = new bootstrap.Modal(modalEl);
        modal.show();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

function renderBotoesAcao(os) {
    // Hide all action buttons first
    const btnIds = ['btnEnviarOS', 'btnAceitarOS', 'btnRecusarOS', 'btnDeslocamentoOS', 'btnIniciarExecucaoOS', 'btnConcluirOS', 'btnCancelarOS', 'btnEditarOS'];
    btnIds.forEach(id => _hide(id));

    // Show relevant buttons based on status
    switch (os.status) {
        case 'rascunho':
            _show('btnEditarOS');
            if (os.tecnico_id) _show('btnEnviarOS');
            break;
        case 'enviada':
            _show('btnAceitarOS');
            _show('btnRecusarOS');
            _show('btnCancelarOS');
            break;
        case 'aceita':
            _show('btnDeslocamentoOS');
            _show('btnCancelarOS');
            break;
        case 'em_deslocamento':
            _show('btnIniciarExecucaoOS');
            _show('btnCancelarOS');
            break;
        case 'em_execucao':
            _show('btnConcluirOS');
            _show('btnCancelarOS');
            break;
    }
}

function fecharModalDetalhe() {
    const modalEl = document.getElementById('modalDetalheOS');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
}

// ==================== ACOES DO MODAL DETALHE ====================

function acaoOS(statusAlvo) {
    if (!_osDetalheAtualId) return;
    const id = _osDetalheAtualId;

    switch (statusAlvo) {
        case 'enviada': enviarOS(id); break;
        case 'aceita': aceitarOS(id); break;
        case 'recusada': recusarOS(id); break;
        case 'em_deslocamento': deslocamentoOS(id); break;
        case 'em_execucao': iniciarOS(id); break;
        case 'concluida': concluirOS(id); break;
        case 'cancelada': cancelarOS(id); break;
    }
}

function editarOS() {
    if (!_osDetalheAtualId) return;
    abrirModalOS(_osDetalheAtualId);
}

// ==================== TIMELINE (HISTORICO) ====================

function renderTimeline(historico, container) {
    if (!container) return;
    if (!historico || historico.length === 0) {
        container.innerHTML = '<div class="text-center text-muted py-2"><small>Nenhum historico</small></div>';
        return;
    }

    container.innerHTML = historico.map(h => {
        return `
            <div class="timeline-item">
                <div class="timeline-time">${h.criado_em ? formatarDataHora(h.criado_em) : ''}</div>
                <div class="timeline-text">
                    <strong>${escapeHtmlGlobal(h.usuario_nome || 'Sistema')}</strong>
                    ${h.de_status && h.para_status ? ` - ${badgeStatusOS(h.de_status)} <i class="bi bi-arrow-right mx-1"></i> ${badgeStatusOS(h.para_status)}` : ''}
                    ${h.detalhes ? `<br><small class="text-muted">${escapeHtmlGlobal(h.detalhes)}</small>` : ''}
                </div>
            </div>`;
    }).join('');
}

// ==================== CHAT / MENSAGENS ====================

async function carregarMensagensOS(osId) {
    const container = document.getElementById('detalheChatMessages');
    if (!container) return;

    try {
        const msgs = await api(`/api/ordens-servico/${osId}/mensagens`);
        renderChat(msgs, container);
    } catch (err) {
        container.innerHTML = '<div class="text-center text-muted py-2"><small>Erro ao carregar mensagens</small></div>';
    }
}

function renderChat(mensagens, container) {
    if (!container) return;
    if (!mensagens || mensagens.length === 0) {
        container.innerHTML = '<div class="text-center text-muted py-3"><i class="bi bi-chat-dots fs-3 d-block mb-1"></i>Nenhuma mensagem ainda.</div>';
        return;
    }

    const meuId = window._currentUser?.id;
    container.innerHTML = mensagens.map(m => {
        const ehMeu = m.usuario_id === meuId;
        const hora = m.criado_em ? m.criado_em.substring(11, 16) : '';
        return `
            <div class="chat-msg ${ehMeu ? 'sent' : 'received'}">
                ${!ehMeu ? `<div class="fw-semibold" style="font-size:0.75rem">${escapeHtmlGlobal(m.usuario_nome || '?')}</div>` : ''}
                <div>${escapeHtmlGlobal(m.texto)}</div>
                <div class="msg-time">${hora}</div>
            </div>`;
    }).join('');
    container.scrollTop = container.scrollHeight;
}

async function enviarMensagemOS() {
    const input = document.getElementById('detalheChatInput');
    const texto = input?.value.trim();
    if (!texto || !_osDetalheAtualId) return;

    try {
        await api(`/api/ordens-servico/${_osDetalheAtualId}/mensagens`, {
            method: 'POST',
            body: { texto }
        });
        input.value = '';
        carregarMensagensOS(_osDetalheAtualId);
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

// ==================== FOTOS ====================

function renderFotosDetalhe(fotos) {
    const antesContainer = document.getElementById('detalheFotosAntes');
    const depoisContainer = document.getElementById('detalheFotosDepois');

    const fotosAntes = (fotos || []).filter(f => f.tipo === 'antes');
    const fotosDepois = (fotos || []).filter(f => f.tipo === 'depois' || f.tipo === 'evidencia');

    if (antesContainer) {
        if (fotosAntes.length === 0) {
            antesContainer.innerHTML = '<div class="text-center text-muted py-3 w-100">Nenhuma foto registrada.</div>';
        } else {
            antesContainer.innerHTML = fotosAntes.map(f => `
                <img src="${escapeHtmlGlobal(f.caminho)}" onclick="ampliarFotoOS(${JSON.stringify(fotos.map(x => x.caminho))}, ${fotos.indexOf(f)})"
                     title="${escapeHtmlGlobal(f.legenda || 'Antes')}" alt="Foto antes">
            `).join('');
        }
    }

    if (depoisContainer) {
        if (fotosDepois.length === 0) {
            depoisContainer.innerHTML = '<div class="text-center text-muted py-3 w-100">Nenhuma foto registrada.</div>';
        } else {
            depoisContainer.innerHTML = fotosDepois.map(f => `
                <img src="${escapeHtmlGlobal(f.caminho)}" onclick="ampliarFotoOS(${JSON.stringify(fotos.map(x => x.caminho))}, ${fotos.indexOf(f)})"
                     title="${escapeHtmlGlobal(f.legenda || f.tipo)}" alt="Foto ${f.tipo}">
            `).join('');
        }
    }

    // Store all photos for gallery navigation
    _galeriaFotos = (fotos || []).map(f => f.caminho);
}

function ampliarFotoOS(fotos, index) {
    if (typeof fotos === 'string') {
        // Single image fallback
        _galeriaFotos = [fotos];
        _galeriaIndex = 0;
    } else {
        _galeriaFotos = fotos;
        _galeriaIndex = index || 0;
    }

    const modalImg = document.getElementById('modalImagemOS');
    const imgEl = document.getElementById('imagemAmpliadaOS');
    const counter = document.getElementById('galeriaOSCounter');

    if (modalImg && imgEl) {
        imgEl.src = _galeriaFotos[_galeriaIndex];
        if (counter) {
            counter.textContent = _galeriaFotos.length > 1 ? `${_galeriaIndex + 1} / ${_galeriaFotos.length}` : '';
        }
        new bootstrap.Modal(modalImg).show();
    } else {
        window.open(_galeriaFotos[_galeriaIndex], '_blank');
    }
}

function galeriaOSAnterior() {
    if (_galeriaFotos.length <= 1) return;
    _galeriaIndex = (_galeriaIndex - 1 + _galeriaFotos.length) % _galeriaFotos.length;
    const imgEl = document.getElementById('imagemAmpliadaOS');
    const counter = document.getElementById('galeriaOSCounter');
    if (imgEl) imgEl.src = _galeriaFotos[_galeriaIndex];
    if (counter) counter.textContent = `${_galeriaIndex + 1} / ${_galeriaFotos.length}`;
}

function galeriaOSProxima() {
    if (_galeriaFotos.length <= 1) return;
    _galeriaIndex = (_galeriaIndex + 1) % _galeriaFotos.length;
    const imgEl = document.getElementById('imagemAmpliadaOS');
    const counter = document.getElementById('galeriaOSCounter');
    if (imgEl) imgEl.src = _galeriaFotos[_galeriaIndex];
    if (counter) counter.textContent = `${_galeriaIndex + 1} / ${_galeriaFotos.length}`;
}

async function excluirFotoOS(fotoId) {
    if (!confirm('Remover esta foto?')) return;
    try {
        await api(`/api/ordens-servico/fotos/${fotoId}`, { method: 'DELETE' });
        mostrarToast('Foto removida!');
        if (_osDetalheAtualId) abrirDetalheOS(_osDetalheAtualId);
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

// ==================== CHECKLIST ====================

function renderChecklistDetalhe(checklist) {
    const container = document.getElementById('detalheChecklistItems');
    const progressText = document.getElementById('checklistProgressText');
    const progressPercent = document.getElementById('checklistProgressPercent');
    const progressBar = document.getElementById('checklistProgressBar');

    if (!container) return;

    if (!checklist || checklist.length === 0) {
        container.innerHTML = '<div class="text-center text-muted py-3">Nenhum item no checklist.</div>';
        if (progressText) progressText.textContent = '0/0';
        if (progressPercent) progressPercent.textContent = '0%';
        if (progressBar) progressBar.style.width = '0%';
        return;
    }

    const total = checklist.length;
    const concluidos = checklist.filter(i => i.concluido).length;
    const pct = total > 0 ? Math.round((concluidos / total) * 100) : 0;

    if (progressText) progressText.textContent = `${concluidos}/${total}`;
    if (progressPercent) progressPercent.textContent = `${pct}%`;
    if (progressBar) progressBar.style.width = `${pct}%`;

    container.innerHTML = checklist.map(item => `
        <div class="checklist-item">
            <input class="form-check-input" type="checkbox" ${item.concluido ? 'checked' : ''} onchange="toggleChecklist(${item.id})" id="ck-${item.id}">
            <label class="flex-grow-1 ${item.concluido ? 'text-decoration-line-through text-muted' : ''}" for="ck-${item.id}">
                ${escapeHtmlGlobal(item.descricao)}
            </label>
            ${item.concluido_em ? `<small class="text-muted">${formatarDataHora(item.concluido_em)}</small>` : ''}
        </div>
    `).join('');
}

async function toggleChecklist(itemId) {
    try {
        await api(`/api/ordens-servico/checklist/${itemId}`, { method: 'PATCH' });
        if (_osDetalheAtualId) abrirDetalheOS(_osDetalheAtualId);
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

// ==================== DYNAMIC CHECKLIST IN CREATE MODAL ====================

function adicionarItemChecklist(valor) {
    const container = document.getElementById('osChecklistContainer');
    if (!container) return;

    // If called without a value, get from the input field
    if (!valor) {
        const input = document.getElementById('osNovoChecklistItem');
        if (input) {
            valor = input.value.trim();
            input.value = '';
        }
    }

    if (!valor) return;

    const div = document.createElement('div');
    div.className = 'd-flex gap-2 mb-2 align-items-center';
    div.innerHTML = `
        <input type="text" class="form-control form-control-sm os-checklist-input" placeholder="Descricao do item..." value="${escapeHtmlGlobal(valor)}">
        <button type="button" class="btn btn-sm btn-outline-danger" onclick="removerItemChecklist(this)"><i class="bi bi-x"></i></button>
    `;
    container.appendChild(div);
}

function removerItemChecklist(el) {
    const row = el.closest('.d-flex');
    if (row) row.remove();
}

// ==================== STATUS ACTIONS ====================

async function enviarOS(id) {
    try {
        await api(`/api/ordens-servico/${id}/enviar`, { method: 'PATCH' });
        mostrarToast('OS enviada para o tecnico!');
        carregarOS();
        carregarResumo();
        if (_osDetalheAtualId === id) abrirDetalheOS(id);
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function aceitarOS(id) {
    try {
        await api(`/api/ordens-servico/${id}/aceitar`, { method: 'PATCH' });
        mostrarToast('OS aceita!');
        carregarOS();
        carregarResumo();
        if (_osDetalheAtualId === id) abrirDetalheOS(id);
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function recusarOS(id) {
    const motivo = prompt('Motivo da recusa:');
    if (motivo === null) return;
    try {
        await api(`/api/ordens-servico/${id}/recusar`, { method: 'PATCH', body: { motivo } });
        mostrarToast('OS recusada');
        carregarOS();
        carregarResumo();
        if (_osDetalheAtualId === id) abrirDetalheOS(id);
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function deslocamentoOS(id) {
    try {
        await api(`/api/ordens-servico/${id}/deslocamento`, { method: 'PATCH' });
        mostrarToast('Em deslocamento!');
        carregarOS();
        carregarResumo();
        if (_osDetalheAtualId === id) abrirDetalheOS(id);
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function iniciarOS(id) {
    try {
        await api(`/api/ordens-servico/${id}/iniciar`, { method: 'PATCH' });
        mostrarToast('Execucao iniciada!');
        carregarOS();
        carregarResumo();
        if (_osDetalheAtualId === id) abrirDetalheOS(id);
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function concluirOS(id) {
    const observacoes = prompt('Observacoes do tecnico (opcional):');
    if (observacoes === null) return;
    try {
        await api(`/api/ordens-servico/${id}/concluir`, {
            method: 'PATCH',
            body: { observacoes_tecnico: observacoes || null }
        });
        mostrarToast('OS concluida!', 'success');
        carregarOS();
        carregarResumo();
        if (_osDetalheAtualId === id) abrirDetalheOS(id);
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function cancelarOS(id) {
    const motivo = prompt('Motivo do cancelamento:');
    if (motivo === null) return;
    try {
        await api(`/api/ordens-servico/${id}/cancelar`, {
            method: 'PATCH',
            body: { motivo }
        });
        mostrarToast('OS cancelada');
        carregarOS();
        carregarResumo();
        if (_osDetalheAtualId === id) abrirDetalheOS(id);
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

// ==================== FILTER HELPERS ====================

function limparFiltrosOS() {
    const ids = ['filtroStatusOS', 'filtroTecnicoOS', 'filtroPrioridadeOS', 'filtroTipoServicoOS', 'filtroDataInicioOS', 'filtroDataFimOS'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    carregarOS();
}

// ==================== SSE EVENT HANDLER ====================

function setupOSSSEListener() {
    if (typeof _globalSSE === 'undefined' || !_globalSSE) return;

    const originalOnMessage = _globalSSE.onmessage;
    _globalSSE.onmessage = (e) => {
        if (originalOnMessage) originalOnMessage(e);

        try {
            const event = JSON.parse(e.data);
            if (event.event === 'os.status' || event.event === 'os.nova') {
                carregarOS();
                carregarResumo();
                if (_osDetalheAtualId && event.payload && event.payload.os_id === _osDetalheAtualId) {
                    abrirDetalheOS(_osDetalheAtualId);
                }
            }
            if (event.event === 'os.mensagem' && event.payload) {
                if (_osDetalheAtualId && event.payload.os_id === _osDetalheAtualId) {
                    carregarMensagensOS(_osDetalheAtualId);
                }
            }
        } catch {}
    };
}

// ==================== INIT ====================

document.addEventListener('DOMContentLoaded', () => {
    // Load tecnicos, then load OS
    carregarTecnicos().then(() => {
        carregarOS();
        carregarResumo();
    });

    // Restore saved view
    if (localStorage.getItem('os_vista') === 'kanban') {
        setVistaKanban(true);
    }

    // Auto-filter on change
    const filterIds = ['filtroStatusOS', 'filtroTecnicoOS', 'filtroPrioridadeOS', 'filtroTipoServicoOS', 'filtroDataInicioOS', 'filtroDataFimOS'];
    filterIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', carregarOS);
    });

    // Send message on Enter key in chat input
    const chatInput = document.getElementById('detalheChatInput');
    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                enviarMensagemOS();
            }
        });
    }

    // Add checklist item on Enter key
    const checklistInput = document.getElementById('osNovoChecklistItem');
    if (checklistInput) {
        checklistInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                adicionarItemChecklist();
            }
        });
    }

    // Setup SSE listener for OS events after a short delay
    setTimeout(setupOSSSEListener, 3000);
});
