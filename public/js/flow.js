// ==================== FLOW BUILDER ====================

let editor = null;
let currentFlowId = null;
let selectedNodeId = null;

const NODE_CONFIGS = {
    inicio: {
        inputs: 0, outputs: 1,
        data: {},
        label: 'Inicio', icon: 'bi-play-circle text-success', desc: 'Ponto de entrada'
    },
    mensagem: {
        inputs: 1, outputs: 1,
        data: { texto: '' },
        label: 'Mensagem', icon: 'bi-chat-left-text text-primary', desc: 'Enviar texto'
    },
    menu: {
        inputs: 1, outputs: 10,
        data: { titulo: 'Selecione uma opcao:', opcoes: [{ texto: 'Opcao 1' }, { texto: 'Opcao 2' }, { texto: 'Opcao 3' }], tentativas: 3, msg_erro: 'Opcao invalida. Tente novamente.' },
        label: 'Menu', icon: 'bi-list-ol text-warning', desc: 'Menu de opcoes'
    },
    condicao: {
        inputs: 1, outputs: 2,
        data: { campo: '', operador: '==', valor: '' },
        label: 'Condicao', icon: 'bi-signpost-split text-info', desc: 'Se/Senao'
    },
    entrada: {
        inputs: 1, outputs: 1,
        data: { prompt: 'Digite:', variavel: 'resposta' },
        label: 'Entrada', icon: 'bi-input-cursor-text', desc: 'Aguardar input'
    },
    integracao: {
        inputs: 1, outputs: 2,
        data: { url: '', metodo: 'GET', body: '', variavel_resultado: '' },
        label: 'Integracao', icon: 'bi-plug', desc: 'Chamar API'
    },
    transferir: {
        inputs: 1, outputs: 0,
        data: { mensagem: 'Voce sera transferido para um atendente.' },
        label: 'Transferir', icon: 'bi-headset', desc: 'Para atendente'
    },
    fim: {
        inputs: 1, outputs: 0,
        data: { mensagem: '' },
        label: 'Fim', icon: 'bi-stop-circle text-danger', desc: 'Encerrar fluxo'
    }
};

// ==================== INIT ====================

document.addEventListener('DOMContentLoaded', () => {
    carregarListaFluxos();
});

// ==================== LISTA DE FLUXOS ====================

async function carregarListaFluxos() {
    try {
        const fluxos = await api('/api/whatsapp/flows');
        const tbody = document.getElementById('tabelaFluxos');
        if (!fluxos.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4"><i class="bi bi-diagram-3 me-1"></i>Nenhum fluxo criado. Clique em "Novo Fluxo" para comecar.</td></tr>';
            return;
        }
        tbody.innerHTML = fluxos.map(f => `
            <tr>
                <td><strong>${escapeHtmlGlobal(f.nome)}</strong></td>
                <td class="text-muted">${escapeHtmlGlobal(f.descricao || '-')}</td>
                <td>${f.ativo ? '<span class="badge bg-success">Ativo</span>' : '<span class="badge bg-secondary">Inativo</span>'}</td>
                <td><span class="badge bg-info">${f.sessoes_ativas || 0}</span></td>
                <td>v${f.versao}</td>
                <td>${formatarDataHora(f.atualizado_em)}</td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary" onclick="editarFluxo(${f.id})" title="Editar">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-outline-${f.ativo ? 'warning' : 'success'}" onclick="toggleAtivo(${f.id}, ${f.ativo ? 0 : 1})" title="${f.ativo ? 'Desativar' : 'Ativar'}">
                            <i class="bi bi-${f.ativo ? 'pause' : 'play'}"></i>
                        </button>
                        <button class="btn btn-outline-secondary" onclick="duplicarFluxo(${f.id})" title="Duplicar">
                            <i class="bi bi-copy"></i>
                        </button>
                        <button class="btn btn-outline-danger" onclick="excluirFluxo(${f.id})" title="Excluir">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function novoFluxo() {
    try {
        const flow = await api('/api/whatsapp/flows', { method: 'POST', body: { nome: 'Novo Fluxo' } });
        await editarFluxo(flow.id);
    } catch (err) { mostrarToast(err.message, 'error'); }
}

async function excluirFluxo(id) {
    if (!confirm('Excluir este fluxo? Todas as sessoes ativas serao encerradas.')) return;
    try {
        await api(`/api/whatsapp/flows/${id}`, { method: 'DELETE' });
        mostrarToast('Fluxo excluido');
        carregarListaFluxos();
    } catch (err) { mostrarToast(err.message, 'error'); }
}

async function toggleAtivo(id, ativo) {
    try {
        await api(`/api/whatsapp/flows/${id}/ativar`, { method: 'PUT', body: { ativo } });
        mostrarToast(ativo ? 'Fluxo ativado' : 'Fluxo desativado');
        carregarListaFluxos();
    } catch (err) { mostrarToast(err.message, 'error'); }
}

async function duplicarFluxo(id) {
    try {
        const original = await api(`/api/whatsapp/flows/${id}`);
        await api('/api/whatsapp/flows', {
            method: 'POST',
            body: { nome: original.nome + ' (copia)', descricao: original.descricao, dados_flow: original.dados_flow }
        });
        mostrarToast('Fluxo duplicado');
        carregarListaFluxos();
    } catch (err) { mostrarToast(err.message, 'error'); }
}

// ==================== EDITOR DRAWFLOW ====================

function initEditor() {
    const container = document.getElementById('drawflow');
    editor = new Drawflow(container);
    editor.reroute = true;
    editor.reroute_fix_curvature = true;
    editor.force_first_input = false;
    editor.start();

    editor.on('nodeSelected', (nodeId) => {
        selectedNodeId = nodeId;
        mostrarConfigNode(nodeId);
    });
    editor.on('nodeUnselected', () => {
        selectedNodeId = null;
        document.getElementById('flowConfigPanel').style.display = 'none';
    });
    editor.on('nodeRemoved', () => {
        selectedNodeId = null;
        document.getElementById('flowConfigPanel').style.display = 'none';
    });

    setupDragDrop();
}

function setupDragDrop() {
    document.querySelectorAll('.flow-palette-node').forEach(el => {
        el.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('node-type', el.dataset.node);
        });
    });

    const canvas = document.getElementById('drawflow');
    canvas.addEventListener('drop', (e) => {
        e.preventDefault();
        const nodeType = e.dataTransfer.getData('node-type');
        if (!nodeType) return;
        addNode(nodeType, e.clientX, e.clientY);
    });
    canvas.addEventListener('dragover', (e) => e.preventDefault());
}

// ==================== NODE FACTORY ====================

function buildNodeHtml(type, data) {
    const cfg = NODE_CONFIGS[type];
    if (!cfg) return '';
    let desc = cfg.desc;
    if (type === 'mensagem' && data.texto) desc = data.texto.substring(0, 25) + (data.texto.length > 25 ? '...' : '');
    if (type === 'menu') desc = `${(data.opcoes || []).length} opcoes`;
    if (type === 'condicao' && data.campo) desc = `${data.campo} ${data.operador} ${data.valor}`;
    if (type === 'entrada' && data.variavel) desc = `→ ${data.variavel}`;
    if (type === 'integracao' && data.url) desc = data.url.substring(0, 25);

    let outputLabels = '';
    if (type === 'condicao') outputLabels = '<div class="flow-node-outputs-label">1=Sim | 2=Nao</div>';
    if (type === 'integracao') outputLabels = '<div class="flow-node-outputs-label">1=OK | 2=Erro</div>';
    if (type === 'menu' && data.opcoes) {
        const labels = data.opcoes.map((o, i) => `${i + 1}=${o.texto}`).join(' | ');
        outputLabels = `<div class="flow-node-outputs-label">${labels}</div>`;
    }

    return `<div class="flow-node-title"><i class="bi ${cfg.icon}"></i> ${cfg.label}</div>
            <div class="flow-node-desc">${escapeHtmlGlobal(desc)}</div>${outputLabels}`;
}

function addNode(type, clientX, clientY) {
    const cfg = NODE_CONFIGS[type];
    if (!cfg) return;

    const editorBounds = document.getElementById('drawflow').getBoundingClientRect();
    const posX = (clientX - editorBounds.left) / (editor.zoom || 1) - (editor.precanvas?.getBoundingClientRect().left - editorBounds.left || 0) / (editor.zoom || 1);
    const posY = (clientY - editorBounds.top) / (editor.zoom || 1) - (editor.precanvas?.getBoundingClientRect().top - editorBounds.top || 0) / (editor.zoom || 1);

    const data = JSON.parse(JSON.stringify(cfg.data));
    const html = buildNodeHtml(type, data);
    const outputs = type === 'menu' ? Math.max(data.opcoes.length, 3) : cfg.outputs;

    editor.addNode(type, cfg.inputs, outputs, posX, posY, type, data, html);
}

// ==================== CONFIG PANEL ====================

function mostrarConfigNode(nodeId) {
    const nodeInfo = editor.getNodeFromId(nodeId);
    if (!nodeInfo) return;

    const panel = document.getElementById('flowConfigPanel');
    const title = document.getElementById('configPanelTitle');
    const body = document.getElementById('configPanelBody');
    panel.style.display = '';

    const cfg = NODE_CONFIGS[nodeInfo.name];
    title.textContent = cfg ? cfg.label : 'No';
    const data = nodeInfo.data || {};
    let html = '';

    switch (nodeInfo.name) {
        case 'inicio':
            html = '<p class="text-muted small mb-0">Ponto de entrada do fluxo. Conecte a saida ao proximo no. Cada fluxo deve ter um no Inicio.</p>';
            break;
        case 'mensagem':
            html = `<div class="mb-2">
                <label class="form-label small fw-semibold">Texto da mensagem</label>
                <textarea class="form-control form-control-sm" rows="5" id="cfgTexto"
                    oninput="atualizarDadosNode(${nodeId}, 'texto', this.value)">${escapeHtmlGlobal(data.texto || '')}</textarea>
                <small class="text-muted">Use <code>{variavel}</code> para dados coletados</small>
            </div>`;
            break;
        case 'menu':
            html = `<div class="mb-2">
                <label class="form-label small fw-semibold">Titulo do menu</label>
                <input type="text" class="form-control form-control-sm" value="${escapeHtmlGlobal(data.titulo || '')}"
                    oninput="atualizarDadosNode(${nodeId}, 'titulo', this.value)">
            </div>
            <label class="form-label small fw-semibold">Opcoes (cada saida = 1 opcao)</label>
            <div id="menuOpcoes">
                ${(data.opcoes || []).map((op, i) => `
                    <div class="input-group input-group-sm mb-1">
                        <span class="input-group-text" style="min-width:28px;justify-content:center">${i + 1}</span>
                        <input type="text" class="form-control" value="${escapeHtmlGlobal(op.texto)}"
                            oninput="atualizarOpcaoMenu(${nodeId}, ${i}, this.value)">
                        ${(data.opcoes.length > 2) ? `<button class="btn btn-outline-danger" onclick="removerOpcaoMenu(${nodeId}, ${i})"><i class="bi bi-x"></i></button>` : ''}
                    </div>
                `).join('')}
            </div>
            <button class="btn btn-sm btn-outline-primary mt-1 w-100" onclick="adicionarOpcaoMenu(${nodeId})">
                <i class="bi bi-plus me-1"></i>Adicionar opcao
            </button>
            <hr class="my-2">
            <div class="mb-2">
                <label class="form-label small fw-semibold">Mensagem de erro</label>
                <input type="text" class="form-control form-control-sm" value="${escapeHtmlGlobal(data.msg_erro || 'Opcao invalida.')}"
                    oninput="atualizarDadosNode(${nodeId}, 'msg_erro', this.value)">
            </div>
            <div class="mb-2">
                <label class="form-label small fw-semibold">Tentativas max.</label>
                <input type="number" class="form-control form-control-sm" value="${data.tentativas || 3}" min="1" max="10"
                    oninput="atualizarDadosNode(${nodeId}, 'tentativas', parseInt(this.value))">
            </div>`;
            break;
        case 'condicao':
            html = `<div class="mb-2">
                <label class="form-label small fw-semibold">Variavel</label>
                <input type="text" class="form-control form-control-sm" value="${escapeHtmlGlobal(data.campo || '')}"
                    oninput="atualizarDadosNode(${nodeId}, 'campo', this.value)" placeholder="nome_variavel">
            </div>
            <div class="mb-2">
                <label class="form-label small fw-semibold">Operador</label>
                <select class="form-select form-select-sm" onchange="atualizarDadosNode(${nodeId}, 'operador', this.value)">
                    <option value="==" ${data.operador === '==' ? 'selected' : ''}>Igual a (==)</option>
                    <option value="!=" ${data.operador === '!=' ? 'selected' : ''}>Diferente (!=)</option>
                    <option value="contem" ${data.operador === 'contem' ? 'selected' : ''}>Contem</option>
                    <option value="nao_contem" ${data.operador === 'nao_contem' ? 'selected' : ''}>Nao contem</option>
                    <option value="existe" ${data.operador === 'existe' ? 'selected' : ''}>Existe (nao vazio)</option>
                    <option value="vazio" ${data.operador === 'vazio' ? 'selected' : ''}>Vazio</option>
                </select>
            </div>
            <div class="mb-2">
                <label class="form-label small fw-semibold">Valor</label>
                <input type="text" class="form-control form-control-sm" value="${escapeHtmlGlobal(data.valor || '')}"
                    oninput="atualizarDadosNode(${nodeId}, 'valor', this.value)">
            </div>
            <div class="alert alert-secondary small py-1 px-2 mb-0">Saida 1 = Verdadeiro<br>Saida 2 = Falso</div>`;
            break;
        case 'entrada':
            html = `<div class="mb-2">
                <label class="form-label small fw-semibold">Mensagem de prompt</label>
                <textarea class="form-control form-control-sm" rows="2"
                    oninput="atualizarDadosNode(${nodeId}, 'prompt', this.value)">${escapeHtmlGlobal(data.prompt || '')}</textarea>
            </div>
            <div class="mb-2">
                <label class="form-label small fw-semibold">Salvar em variavel</label>
                <input type="text" class="form-control form-control-sm" value="${escapeHtmlGlobal(data.variavel || '')}"
                    oninput="atualizarDadosNode(${nodeId}, 'variavel', this.value)" placeholder="nome_variavel">
                <small class="text-muted">Use <code>{nome_variavel}</code> em outros nos</small>
            </div>`;
            break;
        case 'integracao':
            html = `<div class="mb-2">
                <label class="form-label small fw-semibold">URL</label>
                <input type="text" class="form-control form-control-sm" value="${escapeHtmlGlobal(data.url || '')}"
                    oninput="atualizarDadosNode(${nodeId}, 'url', this.value)" placeholder="https://...">
            </div>
            <div class="mb-2">
                <label class="form-label small fw-semibold">Metodo</label>
                <select class="form-select form-select-sm" onchange="atualizarDadosNode(${nodeId}, 'metodo', this.value)">
                    <option value="GET" ${data.metodo === 'GET' ? 'selected' : ''}>GET</option>
                    <option value="POST" ${data.metodo === 'POST' ? 'selected' : ''}>POST</option>
                    <option value="PUT" ${data.metodo === 'PUT' ? 'selected' : ''}>PUT</option>
                </select>
            </div>
            <div class="mb-2">
                <label class="form-label small fw-semibold">Body (JSON)</label>
                <textarea class="form-control form-control-sm" rows="3"
                    oninput="atualizarDadosNode(${nodeId}, 'body', this.value)">${escapeHtmlGlobal(data.body || '')}</textarea>
                <small class="text-muted">Suporta <code>{variavel}</code></small>
            </div>
            <div class="mb-2">
                <label class="form-label small fw-semibold">Salvar resultado em</label>
                <input type="text" class="form-control form-control-sm" value="${escapeHtmlGlobal(data.variavel_resultado || '')}"
                    oninput="atualizarDadosNode(${nodeId}, 'variavel_resultado', this.value)" placeholder="resultado">
            </div>
            <div class="alert alert-secondary small py-1 px-2 mb-0">Saida 1 = Sucesso<br>Saida 2 = Erro</div>`;
            break;
        case 'transferir':
            html = `<div class="mb-2">
                <label class="form-label small fw-semibold">Mensagem ao transferir</label>
                <textarea class="form-control form-control-sm" rows="2"
                    oninput="atualizarDadosNode(${nodeId}, 'mensagem', this.value)">${escapeHtmlGlobal(data.mensagem || '')}</textarea>
            </div>`;
            break;
        case 'fim':
            html = `<div class="mb-2">
                <label class="form-label small fw-semibold">Mensagem de encerramento</label>
                <textarea class="form-control form-control-sm" rows="2"
                    oninput="atualizarDadosNode(${nodeId}, 'mensagem', this.value)">${escapeHtmlGlobal(data.mensagem || '')}</textarea>
                <small class="text-muted">Opcional. Enviada ao encerrar o fluxo.</small>
            </div>`;
            break;
    }

    body.innerHTML = html;
}

// ==================== DATA HELPERS ====================

function atualizarDadosNode(nodeId, campo, valor) {
    const nodeData = editor.getNodeFromId(nodeId);
    if (!nodeData) return;
    nodeData.data[campo] = valor;
    editor.updateNodeDataFromId(nodeId, nodeData.data);
    // Update visual
    const nodeEl = document.querySelector(`#node-${nodeId} .flow-node-desc`);
    if (nodeEl) {
        let desc = '';
        switch (nodeData.name) {
            case 'mensagem': desc = (nodeData.data.texto || '').substring(0, 25) + (nodeData.data.texto?.length > 25 ? '...' : ''); break;
            case 'condicao': desc = `${nodeData.data.campo || ''} ${nodeData.data.operador || ''} ${nodeData.data.valor || ''}`; break;
            case 'entrada': desc = nodeData.data.variavel ? `→ ${nodeData.data.variavel}` : 'Aguardar input'; break;
            case 'integracao': desc = (nodeData.data.url || '').substring(0, 25) || 'Chamar API'; break;
        }
        if (desc) nodeEl.textContent = desc;
    }
}

function atualizarOpcaoMenu(nodeId, index, valor) {
    const nodeData = editor.getNodeFromId(nodeId);
    if (!nodeData || !nodeData.data.opcoes) return;
    nodeData.data.opcoes[index].texto = valor;
    editor.updateNodeDataFromId(nodeId, nodeData.data);
    // Update outputs label
    const labelEl = document.querySelector(`#node-${nodeId} .flow-node-outputs-label`);
    if (labelEl) {
        labelEl.textContent = nodeData.data.opcoes.map((o, i) => `${i + 1}=${o.texto}`).join(' | ');
    }
}

function adicionarOpcaoMenu(nodeId) {
    const nodeData = editor.getNodeFromId(nodeId);
    if (!nodeData) return;
    if ((nodeData.data.opcoes || []).length >= 10) {
        mostrarToast('Maximo de 10 opcoes', 'warning');
        return;
    }
    nodeData.data.opcoes = nodeData.data.opcoes || [];
    nodeData.data.opcoes.push({ texto: `Opcao ${nodeData.data.opcoes.length + 1}` });
    editor.updateNodeDataFromId(nodeId, nodeData.data);
    mostrarConfigNode(nodeId);
}

function removerOpcaoMenu(nodeId, index) {
    const nodeData = editor.getNodeFromId(nodeId);
    if (!nodeData || !nodeData.data.opcoes || nodeData.data.opcoes.length <= 2) return;
    nodeData.data.opcoes.splice(index, 1);
    editor.updateNodeDataFromId(nodeId, nodeData.data);
    mostrarConfigNode(nodeId);
}

// ==================== SAVE / LOAD ====================

async function editarFluxo(id) {
    try {
        const flow = await api(`/api/whatsapp/flows/${id}`);
        currentFlowId = flow.id;

        document.getElementById('viewLista').style.display = 'none';
        document.getElementById('viewEditor').style.display = '';

        if (!editor) initEditor();
        else editor.clear();

        document.getElementById('flowNome').value = flow.nome || '';
        document.getElementById('flowDescricao').value = flow.descricao || '';
        document.getElementById('flowAtivo').checked = !!flow.ativo;

        if (flow.dados_flow && flow.dados_flow !== '{}') {
            try {
                editor.import(JSON.parse(flow.dados_flow));
            } catch (e) {
                console.error('Erro ao importar fluxo:', e);
                mostrarToast('Erro ao carregar canvas do fluxo', 'error');
            }
        }
    } catch (err) { mostrarToast(err.message, 'error'); }
}

async function salvarFluxo() {
    if (!currentFlowId || !editor) return;
    try {
        const dados_flow = JSON.stringify(editor.export());
        const nome = document.getElementById('flowNome').value.trim() || 'Sem nome';
        const descricao = document.getElementById('flowDescricao').value.trim();
        await api(`/api/whatsapp/flows/${currentFlowId}`, {
            method: 'PUT',
            body: { nome, descricao, dados_flow }
        });
        mostrarToast('Fluxo salvo com sucesso!');
    } catch (err) { mostrarToast(err.message, 'error'); }
}

function voltarLista() {
    document.getElementById('viewLista').style.display = '';
    document.getElementById('viewEditor').style.display = 'none';
    currentFlowId = null;
    selectedNodeId = null;
    document.getElementById('flowConfigPanel').style.display = 'none';
    carregarListaFluxos();
}

function limparCanvas() {
    if (!editor) return;
    if (confirm('Limpar todo o canvas? Esta acao nao pode ser desfeita.')) editor.clear();
}

function excluirNodeSelecionado() {
    if (selectedNodeId && editor) {
        editor.removeNodeId(`node-${selectedNodeId}`);
    }
}

async function toggleFlowAtivo() {
    if (!currentFlowId) return;
    const ativo = document.getElementById('flowAtivo').checked;
    try {
        await api(`/api/whatsapp/flows/${currentFlowId}/ativar`, { method: 'PUT', body: { ativo } });
        mostrarToast(ativo ? 'Fluxo ativado' : 'Fluxo desativado');
    } catch (err) {
        mostrarToast(err.message, 'error');
        document.getElementById('flowAtivo').checked = !ativo;
    }
}
