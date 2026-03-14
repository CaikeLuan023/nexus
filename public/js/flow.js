// ==================== FLOW BUILDER ====================

let editor = null;
let currentFlowId = null;
let selectedNodeId = null;

const NODE_CONFIGS = {
    inicio: {
        inputs: 0,
        outputs: 1,
        data: {},
        label: 'Inicio',
        icon: 'bi-play-circle text-success',
        desc: 'Ponto de entrada'
    },
    mensagem: {
        inputs: 1,
        outputs: 1,
        data: { texto: '' },
        label: 'Mensagem',
        icon: 'bi-chat-left-text text-primary',
        desc: 'Enviar texto'
    },
    menu: {
        inputs: 1,
        outputs: 10,
        data: {
            titulo: 'Selecione uma opcao:',
            opcoes: [{ texto: 'Opcao 1' }, { texto: 'Opcao 2' }, { texto: 'Opcao 3' }],
            tentativas: 3,
            msg_erro: 'Opcao invalida. Tente novamente.'
        },
        label: 'Menu',
        icon: 'bi-list-ol text-warning',
        desc: 'Menu de opcoes'
    },
    condicao: {
        inputs: 1,
        outputs: 2,
        data: { campo: '', operador: '==', valor: '' },
        label: 'Condicao',
        icon: 'bi-signpost-split text-info',
        desc: 'Se/Senao'
    },
    entrada: {
        inputs: 1,
        outputs: 1,
        data: { prompt: 'Digite:', variavel: 'resposta' },
        label: 'Entrada',
        icon: 'bi-input-cursor-text',
        desc: 'Aguardar input'
    },
    integracao: {
        inputs: 1,
        outputs: 2,
        data: { url: '', metodo: 'GET', body: '', variavel_resultado: '' },
        label: 'Integracao',
        icon: 'bi-plug',
        desc: 'Chamar API'
    },
    transferir: {
        inputs: 1,
        outputs: 0,
        data: { mensagem: 'Voce sera transferido para um atendente.' },
        label: 'Transferir',
        icon: 'bi-headset',
        desc: 'Para atendente'
    },
    fim: {
        inputs: 1,
        outputs: 0,
        data: { mensagem: '' },
        label: 'Fim',
        icon: 'bi-stop-circle text-danger',
        desc: 'Encerrar fluxo'
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
            tbody.innerHTML =
                '<tr><td colspan="7" class="text-center text-muted py-4"><i class="bi bi-diagram-3 me-1"></i>Nenhum fluxo criado. Clique em "Novo Fluxo" para comecar.</td></tr>';
            return;
        }
        tbody.innerHTML = fluxos
            .map(
                (f) => `
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
        `
            )
            .join('');
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function novoFluxo() {
    try {
        const flow = await api('/api/whatsapp/flows', { method: 'POST', body: { nome: 'Novo Fluxo' } });
        await editarFluxo(flow.id);
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function excluirFluxo(id) {
    if (!confirm('Excluir este fluxo? Todas as sessoes ativas serao encerradas.')) return;
    try {
        await api(`/api/whatsapp/flows/${id}`, { method: 'DELETE' });
        mostrarToast('Fluxo excluido');
        carregarListaFluxos();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function toggleAtivo(id, ativo) {
    try {
        await api(`/api/whatsapp/flows/${id}/ativar`, { method: 'PUT', body: { ativo } });
        mostrarToast(ativo ? 'Fluxo ativado' : 'Fluxo desativado');
        carregarListaFluxos();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
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
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
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
    document.querySelectorAll('.flow-palette-node').forEach((el) => {
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
    const posX =
        (clientX - editorBounds.left) / (editor.zoom || 1) -
        (editor.precanvas?.getBoundingClientRect().left - editorBounds.left || 0) / (editor.zoom || 1);
    const posY =
        (clientY - editorBounds.top) / (editor.zoom || 1) -
        (editor.precanvas?.getBoundingClientRect().top - editorBounds.top || 0) / (editor.zoom || 1);

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
            html =
                '<p class="text-muted small mb-0">Ponto de entrada do fluxo. Conecte a saida ao proximo no. Cada fluxo deve ter um no Inicio.</p>';
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
                ${(data.opcoes || [])
                    .map(
                        (op, i) => `
                    <div class="input-group input-group-sm mb-1">
                        <span class="input-group-text" style="min-width:28px;justify-content:center">${i + 1}</span>
                        <input type="text" class="form-control" value="${escapeHtmlGlobal(op.texto)}"
                            oninput="atualizarOpcaoMenu(${nodeId}, ${i}, this.value)">
                        ${data.opcoes.length > 2 ? `<button class="btn btn-outline-danger" onclick="removerOpcaoMenu(${nodeId}, ${i})"><i class="bi bi-x"></i></button>` : ''}
                    </div>
                `
                    )
                    .join('')}
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
            case 'mensagem':
                desc = (nodeData.data.texto || '').substring(0, 25) + (nodeData.data.texto?.length > 25 ? '...' : '');
                break;
            case 'condicao':
                desc = `${nodeData.data.campo || ''} ${nodeData.data.operador || ''} ${nodeData.data.valor || ''}`;
                break;
            case 'entrada':
                desc = nodeData.data.variavel ? `→ ${nodeData.data.variavel}` : 'Aguardar input';
                break;
            case 'integracao':
                desc = (nodeData.data.url || '').substring(0, 25) || 'Chamar API';
                break;
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
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
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
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
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

// ==================== TEMPLATES INTELIGENTES ====================

let _templateSelecionado = null;

// Helper: Construir JSON Drawflow a partir de nos e conexoes
function buildDrawflowJson(nodes, connections) {
    const data = {};
    for (const n of nodes) {
        const cfg = NODE_CONFIGS[n.name] || {};
        const numInputs = n.name === 'inicio' ? 0 : 1;
        const numOutputs = n.name === 'menu' ? Math.max((n.data.opcoes || []).length, 3) : (cfg.outputs || 0);

        const inputs = {};
        for (let i = 1; i <= numInputs; i++) inputs[`input_${i}`] = { connections: [] };
        const outputs = {};
        for (let i = 1; i <= numOutputs; i++) outputs[`output_${i}`] = { connections: [] };

        data[String(n.id)] = {
            id: n.id,
            name: n.name,
            data: n.data || {},
            class: n.name,
            html: buildNodeHtml(n.name, n.data || {}),
            typenode: 'default',
            inputs,
            outputs,
            pos_x: n.x,
            pos_y: n.y
        };
    }
    for (const c of connections) {
        const from = data[String(c.from)];
        const to = data[String(c.to)];
        if (from && to) {
            const outKey = c.output || 'output_1';
            const inKey = c.input || 'input_1';
            if (from.outputs[outKey]) from.outputs[outKey].connections.push({ node: String(c.to), input: inKey });
            if (to.inputs[inKey]) to.inputs[inKey].connections.push({ node: String(c.from), output: outKey });
        }
    }
    return { drawflow: { Home: { data } } };
}

// ==================== DEFINICAO DOS 6 TEMPLATES ====================

const FLOW_TEMPLATES = [
    {
        id: 'sac',
        nome: 'SAC / Atendimento',
        descricao: 'Menu de atendimento com opcoes de departamento e transferencia para atendente.',
        icon: 'bi-headset',
        cor: '#0d6efd',
        campos: [
            { id: 'empresa', label: 'Nome da empresa', tipo: 'text', default: 'nossa empresa' },
            { id: 'saudacao', label: 'Mensagem de boas-vindas', tipo: 'textarea', default: 'Ola! Bem-vindo ao atendimento. Como posso ajudar?' },
            { id: 'opcoes', label: 'Departamentos (1 por linha)', tipo: 'textarea', default: 'Suporte Tecnico\nFinanceiro\nComercial\nOutros' },
            { id: 'msg_transferencia', label: 'Mensagem ao transferir', tipo: 'text', default: 'Voce sera transferido para um atendente. Aguarde um momento.' }
        ],
        gerar(cfg) {
            const opcoes = cfg.opcoes.split('\n').map(s => s.trim()).filter(Boolean);
            const nodes = [
                { id: 1, name: 'inicio', data: {}, x: 50, y: 50 },
                { id: 2, name: 'mensagem', data: { texto: cfg.saudacao }, x: 50, y: 220 },
                { id: 3, name: 'menu', data: { titulo: 'Selecione o departamento:', opcoes: opcoes.map(t => ({ texto: t })), tentativas: 3, msg_erro: 'Opcao invalida. Tente novamente.' }, x: 50, y: 420 }
            ];
            const connections = [
                { from: 1, to: 2 },
                { from: 2, to: 3 }
            ];
            opcoes.forEach((op, i) => {
                const msgId = 10 + i * 2;
                const trfId = 11 + i * 2;
                const xPos = i * 280;
                nodes.push({ id: msgId, name: 'mensagem', data: { texto: 'Conectando ao setor de ' + op + '...' }, x: xPos, y: 650 });
                nodes.push({ id: trfId, name: 'transferir', data: { mensagem: cfg.msg_transferencia }, x: xPos, y: 850 });
                connections.push({ from: 3, output: `output_${i + 1}`, to: msgId });
                connections.push({ from: msgId, to: trfId });
            });
            return buildDrawflowJson(nodes, connections);
        }
    },
    {
        id: 'boleto',
        nome: '2a Via de Boleto',
        descricao: 'Coleta CPF do cliente, consulta API e envia link do boleto ou mensagem de erro.',
        icon: 'bi-receipt',
        cor: '#198754',
        campos: [
            { id: 'saudacao', label: 'Mensagem inicial', tipo: 'textarea', default: 'Ola! Vou te ajudar a gerar a 2a via do seu boleto.' },
            { id: 'url_api', label: 'URL da API de boleto', tipo: 'text', default: 'https://api.exemplo.com/boleto?cpf={cpf}' },
            { id: 'msg_sucesso', label: 'Mensagem de sucesso', tipo: 'textarea', default: 'Aqui esta seu boleto: {link_boleto}' },
            { id: 'msg_erro', label: 'Mensagem de erro', tipo: 'textarea', default: 'Nao encontramos boletos pendentes para este CPF. Verifique e tente novamente.' }
        ],
        gerar(cfg) {
            const nodes = [
                { id: 1, name: 'inicio', data: {}, x: 50, y: 50 },
                { id: 2, name: 'mensagem', data: { texto: cfg.saudacao }, x: 50, y: 220 },
                { id: 3, name: 'entrada', data: { prompt: 'Por favor, informe seu CPF (somente numeros):', variavel: 'cpf' }, x: 50, y: 400 },
                { id: 4, name: 'integracao', data: { url: cfg.url_api, metodo: 'GET', body: '', variavel_resultado: 'link_boleto' }, x: 50, y: 590 },
                { id: 5, name: 'mensagem', data: { texto: cfg.msg_sucesso }, x: -150, y: 800 },
                { id: 6, name: 'mensagem', data: { texto: cfg.msg_erro }, x: 280, y: 800 },
                { id: 7, name: 'fim', data: { mensagem: 'Obrigado! Ate mais.' }, x: -150, y: 980 },
                { id: 8, name: 'fim', data: { mensagem: '' }, x: 280, y: 980 }
            ];
            const connections = [
                { from: 1, to: 2 },
                { from: 2, to: 3 },
                { from: 3, to: 4 },
                { from: 4, output: 'output_1', to: 5 },
                { from: 4, output: 'output_2', to: 6 },
                { from: 5, to: 7 },
                { from: 6, to: 8 }
            ];
            return buildDrawflowJson(nodes, connections);
        }
    },
    {
        id: 'nps',
        nome: 'Pesquisa NPS',
        descricao: 'Pesquisa de satisfacao: coleta nota (0-10), comentario e agradece.',
        icon: 'bi-star-half',
        cor: '#ffc107',
        campos: [
            { id: 'saudacao', label: 'Mensagem inicial', tipo: 'textarea', default: 'Ola! Gostaríamos de saber sua opiniao sobre nosso atendimento.' },
            { id: 'pergunta_nota', label: 'Pergunta da nota', tipo: 'text', default: 'De 0 a 10, qual nota voce da para nosso servico?' },
            { id: 'pergunta_comentario', label: 'Pergunta do comentario', tipo: 'text', default: 'Deixe um comentario sobre sua experiencia (opcional):' },
            { id: 'agradecimento', label: 'Mensagem de agradecimento', tipo: 'textarea', default: 'Obrigado pelo seu feedback! Sua opiniao e muito importante para nos.' }
        ],
        gerar(cfg) {
            const nodes = [
                { id: 1, name: 'inicio', data: {}, x: 50, y: 50 },
                { id: 2, name: 'mensagem', data: { texto: cfg.saudacao }, x: 50, y: 220 },
                { id: 3, name: 'entrada', data: { prompt: cfg.pergunta_nota, variavel: 'nota' }, x: 50, y: 400 },
                { id: 4, name: 'entrada', data: { prompt: cfg.pergunta_comentario, variavel: 'comentario' }, x: 50, y: 590 },
                { id: 5, name: 'mensagem', data: { texto: cfg.agradecimento + '\n\nNota: {nota}\nComentario: {comentario}' }, x: 50, y: 780 },
                { id: 6, name: 'fim', data: { mensagem: '' }, x: 50, y: 960 }
            ];
            const connections = [
                { from: 1, to: 2 },
                { from: 2, to: 3 },
                { from: 3, to: 4 },
                { from: 4, to: 5 },
                { from: 5, to: 6 }
            ];
            return buildDrawflowJson(nodes, connections);
        }
    },
    {
        id: 'status',
        nome: 'Verificar Conexao',
        descricao: 'Consulta status da conexao do cliente via CPF e retorna informacoes.',
        icon: 'bi-wifi',
        cor: '#0dcaf0',
        campos: [
            { id: 'saudacao', label: 'Mensagem inicial', tipo: 'textarea', default: 'Ola! Vou verificar o status da sua conexao.' },
            { id: 'url_api', label: 'URL da API de status', tipo: 'text', default: 'https://api.exemplo.com/status?cpf={cpf}' },
            { id: 'msg_sucesso', label: 'Mensagem com status', tipo: 'textarea', default: 'Status da sua conexao:\n\n{resultado_status}\n\nSe precisar de mais ajuda, digite "atendente".' },
            { id: 'msg_erro', label: 'Mensagem de erro', tipo: 'textarea', default: 'Nao foi possivel consultar o status. Vamos transferir voce para um atendente.' }
        ],
        gerar(cfg) {
            const nodes = [
                { id: 1, name: 'inicio', data: {}, x: 50, y: 50 },
                { id: 2, name: 'mensagem', data: { texto: cfg.saudacao }, x: 50, y: 220 },
                { id: 3, name: 'entrada', data: { prompt: 'Informe seu CPF:', variavel: 'cpf' }, x: 50, y: 400 },
                { id: 4, name: 'integracao', data: { url: cfg.url_api, metodo: 'GET', body: '', variavel_resultado: 'resultado_status' }, x: 50, y: 590 },
                { id: 5, name: 'mensagem', data: { texto: cfg.msg_sucesso }, x: -150, y: 800 },
                { id: 6, name: 'mensagem', data: { texto: cfg.msg_erro }, x: 280, y: 800 },
                { id: 7, name: 'fim', data: { mensagem: 'Obrigado! Ate mais.' }, x: -150, y: 980 },
                { id: 8, name: 'transferir', data: { mensagem: 'Transferindo para um atendente...' }, x: 280, y: 980 }
            ];
            const connections = [
                { from: 1, to: 2 },
                { from: 2, to: 3 },
                { from: 3, to: 4 },
                { from: 4, output: 'output_1', to: 5 },
                { from: 4, output: 'output_2', to: 6 },
                { from: 5, to: 7 },
                { from: 6, to: 8 }
            ];
            return buildDrawflowJson(nodes, connections);
        }
    },
    {
        id: 'agendamento',
        nome: 'Agendamento de Visita',
        descricao: 'Coleta nome, endereco e horario preferido, confirma e transfere para agente.',
        icon: 'bi-calendar-check',
        cor: '#6f42c1',
        campos: [
            { id: 'saudacao', label: 'Mensagem inicial', tipo: 'textarea', default: 'Ola! Vamos agendar uma visita tecnica para voce.' },
            { id: 'msg_confirmacao', label: 'Mensagem de confirmacao', tipo: 'textarea', default: 'Confirme os dados da visita:\n\nNome: {nome}\nEndereco: {endereco}\nHorario: {horario}\n\nEsta correto?' },
            { id: 'msg_agendado', label: 'Mensagem ao confirmar', tipo: 'text', default: 'Visita agendada com sucesso! Um tecnico ira ate voce.' }
        ],
        gerar(cfg) {
            const nodes = [
                { id: 1, name: 'inicio', data: {}, x: 50, y: 50 },
                { id: 2, name: 'mensagem', data: { texto: cfg.saudacao }, x: 50, y: 200 },
                { id: 3, name: 'entrada', data: { prompt: 'Qual seu nome completo?', variavel: 'nome' }, x: 50, y: 370 },
                { id: 4, name: 'entrada', data: { prompt: 'Qual o endereco da visita?', variavel: 'endereco' }, x: 50, y: 540 },
                { id: 5, name: 'entrada', data: { prompt: 'Qual horario preferido? (ex: Manha, Tarde, Noite)', variavel: 'horario' }, x: 50, y: 710 },
                { id: 6, name: 'menu', data: { titulo: cfg.msg_confirmacao, opcoes: [{ texto: 'Sim, confirmar' }, { texto: 'Nao, cancelar' }], tentativas: 3, msg_erro: 'Responda 1 para Sim ou 2 para Nao.' }, x: 50, y: 900 },
                { id: 7, name: 'mensagem', data: { texto: cfg.msg_agendado }, x: -150, y: 1120 },
                { id: 8, name: 'transferir', data: { mensagem: 'Transferindo para confirmar horario disponivel...' }, x: -150, y: 1300 },
                { id: 9, name: 'mensagem', data: { texto: 'Agendamento cancelado. Se precisar, estamos a disposicao!' }, x: 280, y: 1120 },
                { id: 10, name: 'fim', data: { mensagem: '' }, x: 280, y: 1300 }
            ];
            const connections = [
                { from: 1, to: 2 },
                { from: 2, to: 3 },
                { from: 3, to: 4 },
                { from: 4, to: 5 },
                { from: 5, to: 6 },
                { from: 6, output: 'output_1', to: 7 },
                { from: 6, output: 'output_2', to: 9 },
                { from: 7, to: 8 },
                { from: 9, to: 10 }
            ];
            return buildDrawflowJson(nodes, connections);
        }
    },
    {
        id: 'financeiro',
        nome: 'Cobranca / Financeiro',
        descricao: 'Menu financeiro: 2a via, negociacao, contestacao. Cada opcao com sub-fluxo.',
        icon: 'bi-cash-coin',
        cor: '#dc3545',
        campos: [
            { id: 'saudacao', label: 'Mensagem inicial', tipo: 'textarea', default: 'Ola! Bem-vindo ao setor financeiro. Como posso ajudar?' },
            { id: 'opcoes', label: 'Opcoes do menu (1 por linha)', tipo: 'textarea', default: '2a Via de Boleto\nNegociar Divida\nContestar Cobranca\nFalar com Atendente' }
        ],
        gerar(cfg) {
            const opcoes = cfg.opcoes.split('\n').map(s => s.trim()).filter(Boolean);
            const nodes = [
                { id: 1, name: 'inicio', data: {}, x: 50, y: 50 },
                { id: 2, name: 'mensagem', data: { texto: cfg.saudacao }, x: 50, y: 220 },
                { id: 3, name: 'entrada', data: { prompt: 'Primeiro, informe seu CPF:', variavel: 'cpf' }, x: 50, y: 400 },
                { id: 4, name: 'menu', data: { titulo: 'O que voce precisa?', opcoes: opcoes.map(t => ({ texto: t })), tentativas: 3, msg_erro: 'Opcao invalida.' }, x: 50, y: 590 }
            ];
            const connections = [
                { from: 1, to: 2 },
                { from: 2, to: 3 },
                { from: 3, to: 4 }
            ];
            opcoes.forEach((op, i) => {
                const msgId = 10 + i * 2;
                const endId = 11 + i * 2;
                const xPos = i * 280;
                const isLast = op.toLowerCase().includes('atendente');
                nodes.push({ id: msgId, name: 'mensagem', data: { texto: isLast ? 'Transferindo para um atendente...' : 'Processando sua solicitacao de "' + op + '" para o CPF {cpf}...' }, x: xPos, y: 830 });
                if (isLast) {
                    nodes.push({ id: endId, name: 'transferir', data: { mensagem: 'Aguarde enquanto conectamos voce a um atendente.' }, x: xPos, y: 1020 });
                } else {
                    nodes.push({ id: endId, name: 'transferir', data: { mensagem: 'Um atendente vai finalizar sua solicitacao de ' + op + '.' }, x: xPos, y: 1020 });
                }
                connections.push({ from: 4, output: `output_${i + 1}`, to: msgId });
                connections.push({ from: msgId, to: endId });
            });
            return buildDrawflowJson(nodes, connections);
        }
    }
];

// ==================== GALERIA DE TEMPLATES ====================

function abrirGaleriaTemplates() {
    const container = document.getElementById('galeriaTemplates');
    container.innerHTML = FLOW_TEMPLATES.map(t => `
        <div class="col-md-6">
            <div class="card h-100 border-0 shadow-sm" style="cursor:pointer;transition:transform .15s"
                 onmouseenter="this.style.transform='translateY(-3px)'" onmouseleave="this.style.transform=''"
                 onclick="selecionarTemplate('${t.id}')">
                <div class="card-body">
                    <div class="d-flex align-items-center mb-2">
                        <div style="width:40px;height:40px;border-radius:10px;background:${t.cor}15;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                            <i class="bi ${t.icon}" style="font-size:1.2rem;color:${t.cor}"></i>
                        </div>
                        <div class="ms-3">
                            <h6 class="mb-0 fw-bold">${t.nome}</h6>
                        </div>
                    </div>
                    <p class="text-muted small mb-0">${t.descricao}</p>
                </div>
            </div>
        </div>
    `).join('');
    new bootstrap.Modal(document.getElementById('modalTemplates')).show();
}

function selecionarTemplate(templateId) {
    const t = FLOW_TEMPLATES.find(tp => tp.id === templateId);
    if (!t) return;
    _templateSelecionado = t;

    // Fechar galeria
    bootstrap.Modal.getInstance(document.getElementById('modalTemplates'))?.hide();

    // Preencher modal de customizacao
    document.getElementById('customTemplateTitle').innerHTML = '<i class="bi ' + t.icon + ' me-2" style="color:' + t.cor + '"></i>' + t.nome;
    const body = document.getElementById('customTemplateBody');
    body.innerHTML = t.campos.map(c => {
        if (c.tipo === 'textarea') {
            return `<div class="mb-3">
                <label class="form-label small fw-semibold">${c.label}</label>
                <textarea class="form-control form-control-sm" id="tplCampo_${c.id}" rows="3">${c.default || ''}</textarea>
            </div>`;
        }
        return `<div class="mb-3">
            <label class="form-label small fw-semibold">${c.label}</label>
            <input type="text" class="form-control form-control-sm" id="tplCampo_${c.id}" value="${c.default || ''}">
        </div>`;
    }).join('');

    // Abrir com delay para animacao
    setTimeout(() => {
        new bootstrap.Modal(document.getElementById('modalCustomTemplate')).show();
    }, 300);
}

async function gerarFluxoDoTemplate() {
    if (!_templateSelecionado) return;
    const t = _templateSelecionado;

    // Coletar valores do formulario
    const cfg = {};
    for (const c of t.campos) {
        const el = document.getElementById('tplCampo_' + c.id);
        cfg[c.id] = el ? el.value : (c.default || '');
    }

    // Gerar JSON do fluxo
    const flowJson = t.gerar(cfg);

    // Fechar modal
    bootstrap.Modal.getInstance(document.getElementById('modalCustomTemplate'))?.hide();

    try {
        // Criar fluxo via API
        const flow = await api('/api/whatsapp/flows', {
            method: 'POST',
            body: { nome: t.nome, descricao: t.descricao, dados_flow: JSON.stringify(flowJson) }
        });
        mostrarToast('Fluxo "' + t.nome + '" gerado com sucesso!');

        // Abrir no editor
        await editarFluxo(flow.id);
    } catch (err) {
        mostrarToast('Erro ao gerar fluxo: ' + err.message, 'error');
    }

    _templateSelecionado = null;
}
