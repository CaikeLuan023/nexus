// ==================== CONFIGURACOES ====================

let _ativOffset = 0;
const _ativLimit = 50;

document.addEventListener('DOMContentLoaded', () => {
    carregarConfig();
    carregarBackups();
    carregarUsuariosAtiv();
    carregarAtividades();
    carregarRegras();
    carregarRecorrentes();
    carregarTokens();
    carregarWebhooks();
    carregarErpStatus();
    carregarSLA();
    carregarSLADashboard();
    carregarWhatsAppIA();
    carregarIAHistorico();
    carregarRetencao();
    carregarIntegExternas();
});

// ==================== GERAL ====================

async function carregarConfig() {
    try {
        const map = await api('/api/config/geral');

        document.getElementById('cfgNomeSistema').value = map.nome_sistema || 'Nexus';
        document.getElementById('cfgTimezone').value = map.timezone || 'America/Sao_Paulo';
        document.getElementById('cfgItensPorPagina').value = map.itens_por_pagina || '20';

        if (map.logo_url) {
            const preview = document.getElementById('cfgLogoPreview');
            preview.src = map.logo_url;
            preview.style.display = 'inline-block';
        }
    } catch (err) {
        mostrarToast('Erro ao carregar configuracoes: ' + err.message, 'error');
    }
}

async function salvarConfig(e) {
    e.preventDefault();
    try {
        await api('/api/config/geral', {
            method: 'PUT',
            body: {
                nome_sistema: document.getElementById('cfgNomeSistema').value,
                timezone: document.getElementById('cfgTimezone').value,
                itens_por_pagina: document.getElementById('cfgItensPorPagina').value
            }
        });
        mostrarToast('Configuracoes salvas com sucesso!');
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

async function uploadLogo() {
    const fileInput = document.getElementById('cfgLogoFile');
    if (!fileInput.files.length) return;

    const formData = new FormData();
    formData.append('logo', fileInput.files[0]);

    try {
        const res = await fetch('/api/config/geral/logo', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.erro || 'Erro ao enviar logo');

        const preview = document.getElementById('cfgLogoPreview');
        preview.src = data.logo_url;
        preview.style.display = 'inline-block';
        mostrarToast('Logo atualizado!');
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

// ==================== BACKUPS ====================

async function carregarBackups() {
    try {
        const backups = await api('/api/config/backups');
        const tbody = document.getElementById('tabelaBackups');

        if (!backups.length) {
            tbody.innerHTML =
                '<tr><td colspan="7" class="text-center text-muted py-4">Nenhum backup encontrado</td></tr>';
            return;
        }

        tbody.innerHTML = backups
            .map(
                (b) => `
            <tr>
                <td>${b.id}</td>
                <td><i class="bi bi-file-earmark-zip me-1"></i>${b.nome_arquivo}</td>
                <td>${formatarTamanho(b.tamanho)}</td>
                <td><span class="badge bg-${b.tipo === 'automatico' ? 'info' : 'primary'}">${b.tipo}</span></td>
                <td>${b.criado_por || '-'}</td>
                <td>${formatarDataHora(b.criado_em)}</td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <a href="/api/config/backup/${b.id}/download" class="btn btn-outline-primary" title="Download">
                            <i class="bi bi-download"></i>
                        </a>
                        <button class="btn btn-outline-danger" onclick="excluirBackup(${b.id})" title="Excluir">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `
            )
            .join('');
    } catch (err) {
        mostrarToast('Erro ao carregar backups: ' + err.message, 'error');
    }
}

function formatarTamanho(bytes) {
    if (!bytes) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function criarBackup() {
    if (!confirm('Criar backup do banco de dados agora?')) return;
    try {
        const result = await api('/api/config/backup', { method: 'POST' });
        mostrarToast('Backup criado: ' + result.nome_arquivo);
        carregarBackups();
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

async function excluirBackup(id) {
    if (!confirm('Excluir este backup?')) return;
    try {
        await api('/api/config/backup/' + id, { method: 'DELETE' });
        mostrarToast('Backup excluido');
        carregarBackups();
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

// ==================== LOG DE ATIVIDADES ====================

async function carregarUsuariosAtiv() {
    try {
        const users = await api('/api/usuarios/lista');
        const select = document.getElementById('filtroUsuarioAtiv');
        users.forEach((u) => {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = u.nome;
            select.appendChild(opt);
        });
    } catch (e) {}
}

async function carregarAtividades(append) {
    if (!append) _ativOffset = 0;
    try {
        const params = new URLSearchParams();
        const modulo = document.getElementById('filtroModulo').value;
        const usuario = document.getElementById('filtroUsuarioAtiv').value;
        const dataInicio = document.getElementById('filtroDataInicio').value;
        const dataFim = document.getElementById('filtroDataFim').value;

        if (modulo) params.set('modulo', modulo);
        if (usuario) params.set('usuario_id', usuario);
        if (dataInicio) params.set('data_inicio', dataInicio);
        if (dataFim) params.set('data_fim', dataFim);
        params.set('limit', _ativLimit);
        params.set('offset', _ativOffset);

        const atividades = await api('/api/atividades?' + params.toString());
        const tbody = document.getElementById('tabelaAtividades');

        if (!append) tbody.innerHTML = '';

        if (!atividades.length && !append) {
            tbody.innerHTML =
                '<tr><td colspan="6" class="text-center text-muted py-4">Nenhuma atividade encontrada</td></tr>';
            document.getElementById('btnMaisAtividades').style.display = 'none';
            return;
        }

        const acaoIcons = {
            criar: '<span class="badge bg-success"><i class="bi bi-plus-lg"></i> Criar</span>',
            editar: '<span class="badge bg-primary"><i class="bi bi-pencil"></i> Editar</span>',
            excluir: '<span class="badge bg-danger"><i class="bi bi-trash"></i> Excluir</span>',
            status: '<span class="badge bg-info"><i class="bi bi-arrow-repeat"></i> Status</span>',
            login: '<span class="badge bg-secondary"><i class="bi bi-box-arrow-in-right"></i> Login</span>',
            logout: '<span class="badge bg-secondary"><i class="bi bi-box-arrow-right"></i> Logout</span>'
        };

        const moduloIcons = {
            chamados: 'bi-ticket-detailed',
            provedores: 'bi-building',
            projetos: 'bi-kanban',
            treinamentos: 'bi-mortarboard',
            vendas: 'bi-cash-coin',
            usuarios: 'bi-people-fill',
            auth: 'bi-shield-lock',
            configuracoes: 'bi-gear'
        };

        tbody.innerHTML += atividades
            .map((a) => {
                let detalhes = a.detalhes || '';
                try {
                    const d = JSON.parse(detalhes);
                    detalhes = Object.entries(d)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(', ');
                } catch {}
                if (detalhes.length > 100) detalhes = detalhes.substring(0, 100) + '...';
                const iconModulo = moduloIcons[a.modulo] || 'bi-circle';

                return `<tr>
                <td class="text-nowrap"><small>${formatarDataHora(a.criado_em)}</small></td>
                <td>${a.usuario_nome || 'Sistema'}</td>
                <td>${acaoIcons[a.acao] || `<span class="badge bg-secondary">${a.acao}</span>`}</td>
                <td><i class="bi ${iconModulo} me-1"></i>${a.modulo}</td>
                <td><small>${detalhes}</small></td>
                <td><small class="text-muted">${a.ip || '-'}</small></td>
            </tr>`;
            })
            .join('');

        document.getElementById('btnMaisAtividades').style.display =
            atividades.length >= _ativLimit ? 'inline-block' : 'none';
    } catch (err) {
        mostrarToast('Erro ao carregar atividades: ' + err.message, 'error');
    }
}

function carregarMaisAtividades() {
    _ativOffset += _ativLimit;
    carregarAtividades(true);
}

function limparFiltrosAtiv() {
    document.getElementById('filtroModulo').value = '';
    document.getElementById('filtroUsuarioAtiv').value = '';
    document.getElementById('filtroDataInicio').value = '';
    document.getElementById('filtroDataFim').value = '';
    carregarAtividades();
}

// ==================== REGRAS AUTOMATICAS ====================

async function carregarRegras() {
    try {
        const regras = await api('/api/regras-automaticas');
        const tbody = document.getElementById('tabelaRegras');
        if (!regras.length) {
            tbody.innerHTML =
                '<tr><td colspan="7" class="text-center text-muted py-4">Nenhuma regra cadastrada</td></tr>';
            return;
        }
        const gatilhos = {
            chamado_pendente_dias: 'Chamado Pendente X dias',
            projeto_atrasado: 'Projeto Atrasado',
            tarefa_vencida: 'Tarefa Vencida',
            negocio_parado: 'Negocio Parado'
        };
        const acoes = { notificar: 'Notificar', alterar_status: 'Alterar Status', criar_tarefa: 'Criar Tarefa' };
        tbody.innerHTML = regras
            .map(
                (r) => `<tr>
            <td>${r.id}</td><td>${r.nome}</td>
            <td><small>${gatilhos[r.tipo_gatilho] || r.tipo_gatilho}</small></td>
            <td><small>${acoes[r.acao] || r.acao}</small></td>
            <td><span class="badge bg-${r.ativo ? 'success' : 'secondary'}">${r.ativo ? 'Ativo' : 'Inativo'}</span></td>
            <td><small>${r.ultima_execucao ? formatarDataHora(r.ultima_execucao) : '-'}</small></td>
            <td><button class="btn btn-sm btn-outline-danger btn-action" onclick="excluirRegra(${r.id})"><i class="bi bi-trash"></i></button></td>
        </tr>`
            )
            .join('');
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

async function abrirModalRegra() {
    const nome = prompt('Nome da regra:');
    if (!nome) return;
    const tipo_gatilho = prompt('Gatilho (chamado_pendente_dias / projeto_atrasado):') || 'chamado_pendente_dias';
    const acao = prompt('Acao (notificar / alterar_status):') || 'notificar';
    const dias = prompt('Dias (para chamado_pendente_dias):') || '3';
    try {
        await api('/api/regras-automaticas', {
            method: 'POST',
            body: { nome, tipo_gatilho, condicao_valor: { dias: parseInt(dias) }, acao }
        });
        mostrarToast('Regra criada!');
        carregarRegras();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function excluirRegra(id) {
    if (!confirm('Excluir esta regra?')) return;
    try {
        await api('/api/regras-automaticas/' + id, { method: 'DELETE' });
        carregarRegras();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

// ==================== TAREFAS RECORRENTES ====================

async function carregarRecorrentes() {
    try {
        const tarefas = await api('/api/tarefas-recorrentes');
        const tbody = document.getElementById('tabelaRecorrentes');
        if (!tarefas.length) {
            tbody.innerHTML =
                '<tr><td colspan="7" class="text-center text-muted py-4">Nenhuma tarefa recorrente</td></tr>';
            return;
        }
        const freqs = { diario: 'Diario', semanal: 'Semanal', quinzenal: 'Quinzenal', mensal: 'Mensal' };
        tbody.innerHTML = tarefas
            .map(
                (t) => `<tr>
            <td>${t.id}</td><td>${t.titulo}</td><td>${t.modulo}</td>
            <td>${freqs[t.frequencia] || t.frequencia}</td>
            <td><span class="badge bg-${t.ativo ? 'success' : 'secondary'}">${t.ativo ? 'Ativo' : 'Inativo'}</span></td>
            <td><small>${t.proxima_execucao ? formatarDataHora(t.proxima_execucao) : '-'}</small></td>
            <td><button class="btn btn-sm btn-outline-danger btn-action" onclick="excluirRecorrente(${t.id})"><i class="bi bi-trash"></i></button></td>
        </tr>`
            )
            .join('');
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

async function abrirModalRecorrente() {
    const titulo = prompt('Titulo da tarefa:');
    if (!titulo) return;
    const modulo = prompt('Modulo (treinamento / visita / tarefa):') || 'tarefa';
    const frequencia = prompt('Frequencia (diario / semanal / quinzenal / mensal):') || 'semanal';
    try {
        await api('/api/tarefas-recorrentes', { method: 'POST', body: { titulo, modulo, frequencia } });
        mostrarToast('Tarefa recorrente criada!');
        carregarRecorrentes();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function excluirRecorrente(id) {
    if (!confirm('Excluir esta tarefa recorrente?')) return;
    try {
        await api('/api/tarefas-recorrentes/' + id, { method: 'DELETE' });
        carregarRecorrentes();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

// ==================== INTEGRACOES ====================

async function carregarTokens() {
    try {
        const tokens = await api('/api/config/api-tokens');
        const tbody = document.getElementById('tabelaTokens');
        if (!tokens.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">Nenhum token</td></tr>';
            return;
        }
        tbody.innerHTML = tokens
            .map(
                (t) => `<tr>
            <td>${t.nome}</td>
            <td><code class="small">${t.token.substring(0, 20)}...</code></td>
            <td><span class="badge bg-${t.ativo ? 'success' : 'secondary'}" style="cursor:pointer" onclick="toggleToken(${t.id})">${t.ativo ? 'Ativo' : 'Inativo'}</span></td>
            <td><small>${t.ultimo_uso ? formatarDataHora(t.ultimo_uso) : 'Nunca'}</small></td>
            <td><button class="btn btn-sm btn-outline-danger btn-action" onclick="excluirToken(${t.id})"><i class="bi bi-trash"></i></button></td>
        </tr>`
            )
            .join('');
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

async function criarApiToken() {
    const nome = prompt('Nome do token:');
    if (!nome) return;
    try {
        const result = await api('/api/config/api-tokens', { method: 'POST', body: { nome } });
        mostrarToast('Token criado! Copie: ' + result.token);
        carregarTokens();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function toggleToken(id) {
    try {
        await api('/api/config/api-tokens/' + id + '/toggle', { method: 'PATCH' });
        carregarTokens();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function excluirToken(id) {
    if (!confirm('Excluir este token?')) return;
    try {
        await api('/api/config/api-tokens/' + id, { method: 'DELETE' });
        carregarTokens();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function carregarWebhooks() {
    try {
        const webhooks = await api('/api/config/webhooks');
        const tbody = document.getElementById('tabelaWebhooks');
        if (!webhooks.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">Nenhum webhook</td></tr>';
            return;
        }
        tbody.innerHTML = webhooks
            .map((w) => {
                let eventos = w.eventos;
                try {
                    eventos = JSON.parse(eventos).join(', ');
                } catch {}
                return `<tr>
                <td>${w.nome}</td><td><small>${w.url}</small></td>
                <td><small>${eventos}</small></td>
                <td><span class="badge bg-${w.ativo ? 'success' : 'secondary'}">${w.ativo ? 'Ativo' : 'Inativo'}</span></td>
                <td><button class="btn btn-sm btn-outline-danger btn-action" onclick="excluirWebhook(${w.id})"><i class="bi bi-trash"></i></button></td>
            </tr>`;
            })
            .join('');
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

async function criarWebhook() {
    const nome = prompt('Nome do webhook:');
    if (!nome) return;
    const url = prompt('URL do webhook:');
    if (!url) return;
    const eventosStr =
        prompt('Eventos (separados por virgula): chamado.criado, chamado.editado, projeto.criado') || 'chamado.criado';
    try {
        await api('/api/config/webhooks', {
            method: 'POST',
            body: { nome, url, eventos: eventosStr.split(',').map((e) => e.trim()) }
        });
        mostrarToast('Webhook criado!');
        carregarWebhooks();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function excluirWebhook(id) {
    if (!confirm('Excluir este webhook?')) return;
    try {
        await api('/api/config/webhooks/' + id, { method: 'DELETE' });
        carregarWebhooks();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

// ==================== INTEGRACOES ERP ====================

let _erpSelecionado = null;

const ERP_UI_CONFIG = {
    ixc: {
        label: 'IXC Provedor',
        icon: 'bi-server',
        color: '#007bff',
        urlPlaceholder: 'https://seudominio.ixcsoft.com.br/webservice/v1',
        urlHint: 'Formato: https://dominio/webservice/v1',
        showToken: true,
        extraFields: []
    },
    ispfy: {
        label: 'ISPFY',
        icon: 'bi-hdd-network',
        color: '#6f42c1',
        urlPlaceholder: 'https://seuhost:8043',
        urlHint: 'HTTPS porta 8043 ou HTTP porta 8020',
        showToken: true,
        extraFields: []
    },
    hubsoft: {
        label: 'Hubsoft',
        icon: 'bi-cloud',
        color: '#28a745',
        urlPlaceholder: 'https://seudominio.hubsoft.com.br',
        urlHint: 'URL base da instalacao Hubsoft',
        showToken: false,
        extraFields: [
            { key: 'client_id', label: 'Client ID', type: 'text' },
            { key: 'client_secret', label: 'Client Secret', type: 'password' },
            { key: 'username', label: 'Usuario OAuth', type: 'text' },
            { key: 'password', label: 'Senha OAuth', type: 'password' }
        ]
    },
    sgp: {
        label: 'SGP',
        icon: 'bi-diagram-3',
        color: '#fd7e14',
        urlPlaceholder: 'https://seudominio.sgp.net.br',
        urlHint: 'URL base da API SGP',
        showToken: true,
        extraFields: [
            { key: 'app', label: 'App ID', type: 'text' },
            {
                key: 'auth_mode',
                label: 'Modo de Autenticacao',
                type: 'select',
                options: [
                    { value: 'token_body', label: 'Token + App no Body' },
                    { value: 'basic', label: 'Basic Auth' }
                ]
            },
            { key: 'basic_user', label: 'Usuario (Basic Auth)', type: 'text', showWhen: { auth_mode: 'basic' } },
            { key: 'basic_pass', label: 'Senha (Basic Auth)', type: 'password', showWhen: { auth_mode: 'basic' } }
        ]
    },
    atlaz: {
        label: 'Atlaz',
        icon: 'bi-globe2',
        color: '#17a2b8',
        urlPlaceholder: 'https://api.atlaz.com.br',
        urlHint: 'URL base da API Atlaz',
        showToken: true,
        extraFields: []
    }
};

async function carregarErpStatus() {
    try {
        const erps = await api('/api/erp/todos');
        const container = document.getElementById('erpStatusCards');
        if (!container) return;
        container.innerHTML = erps
            .map((erp) => {
                const ui = ERP_UI_CONFIG[erp.tipo] || {};
                const statusBadge = erp.configurado
                    ? erp.ativo
                        ? '<span class="badge bg-success">Configurado</span>'
                        : '<span class="badge bg-warning text-dark">Inativo</span>'
                    : '<span class="badge bg-secondary">Nao configurado</span>';
                const syncText = erp.ultimo_sync
                    ? '<small class="text-muted">Sync: ' +
                      new Date(erp.ultimo_sync).toLocaleString('pt-BR') +
                      '</small>'
                    : '<small class="text-muted">Nunca sincronizado</small>';
                return `<div class="col-6 col-md-4 col-lg">
                <div class="card h-100 text-center" style="cursor:pointer;border-left:3px solid ${ui.color || '#6c757d'}" onclick="selecionarErp('${erp.tipo}')">
                    <div class="card-body py-3">
                        <i class="bi ${ui.icon || 'bi-cloud'} mb-1" style="font-size:1.5rem;color:${ui.color || '#6c757d'}"></i>
                        <h6 class="mb-1">${ui.label || erp.tipo}</h6>
                        ${statusBadge}
                        <div class="mt-1">${syncText}</div>
                    </div>
                </div>
            </div>`;
            })
            .join('');
    } catch (err) {
        const container = document.getElementById('erpStatusCards');
        if (container) container.innerHTML = '<div class="text-danger">Erro ao carregar: ' + err.message + '</div>';
    }
}

async function selecionarErp(tipo) {
    _erpSelecionado = tipo;
    const ui = ERP_UI_CONFIG[tipo];
    if (!ui) return;

    document.getElementById('erpConfigPanel').style.display = '';
    document.getElementById('erpConfigTitle').innerHTML =
        '<i class="bi ' + ui.icon + ' me-2" style="color:' + ui.color + '"></i>Configuracao ' + ui.label;
    document.getElementById('erpUrlBase').placeholder = ui.urlPlaceholder;
    document.getElementById('erpUrlHint').textContent = ui.urlHint;
    document.getElementById('erpTokenGroup').style.display = ui.showToken ? '' : 'none';
    document.getElementById('erpToken').value = '';
    document.getElementById('erpTesteResultado').innerHTML = '';

    // Render extra fields
    const extraContainer = document.getElementById('erpExtraFields');
    if (ui.extraFields.length > 0) {
        extraContainer.innerHTML =
            '<div class="row g-3">' +
            ui.extraFields
                .map((f) => {
                    if (f.type === 'select') {
                        return (
                            '<div class="col-md-6" id="erpExtra_' +
                            f.key +
                            '_wrap"><label class="form-label fw-bold">' +
                            f.label +
                            '</label>' +
                            '<select class="form-select" id="erpExtra_' +
                            f.key +
                            '" onchange="erpExtraFieldChanged()">' +
                            f.options.map((o) => '<option value="' + o.value + '">' + o.label + '</option>').join('') +
                            '</select></div>'
                        );
                    }
                    return (
                        '<div class="col-md-6" id="erpExtra_' +
                        f.key +
                        '_wrap"><label class="form-label fw-bold">' +
                        f.label +
                        '</label>' +
                        '<input type="' +
                        (f.type || 'text') +
                        '" class="form-control" id="erpExtra_' +
                        f.key +
                        '" placeholder="' +
                        f.label +
                        '"></div>'
                    );
                })
                .join('') +
            '</div>';
    } else {
        extraContainer.innerHTML = '';
    }

    // Load existing config
    try {
        const config = await api('/api/erp/' + tipo + '/config');
        if (config.url_base) {
            document.getElementById('erpUrlBase').value = config.url_base;
            document.getElementById('erpStatus').innerHTML = config.ativo
                ? '<span class="badge bg-success"><i class="bi bi-check-circle me-1"></i>Configurado</span>'
                : '<span class="badge bg-warning text-dark">Inativo</span>';
            if (config.ultimo_sync) {
                document.getElementById('erpUltimoSync').textContent =
                    'Ultima sincronizacao: ' + new Date(config.ultimo_sync).toLocaleString('pt-BR');
            }
            if (config.extras_parsed) {
                for (const [key, val] of Object.entries(config.extras_parsed)) {
                    const el = document.getElementById('erpExtra_' + key);
                    if (el) el.value = val;
                }
            }
            erpExtraFieldChanged();
        } else {
            document.getElementById('erpUrlBase').value = '';
            document.getElementById('erpStatus').innerHTML = '<span class="badge bg-secondary">Nao configurado</span>';
            document.getElementById('erpUltimoSync').textContent = 'Nenhuma sincronizacao realizada';
        }
    } catch {}

    // Scroll to config panel
    document.getElementById('erpConfigPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function erpExtraFieldChanged() {
    const ui = ERP_UI_CONFIG[_erpSelecionado];
    if (!ui) return;
    for (const f of ui.extraFields) {
        if (f.showWhen) {
            const wrap = document.getElementById('erpExtra_' + f.key + '_wrap');
            if (wrap) {
                let visible = true;
                for (const [depKey, depVal] of Object.entries(f.showWhen)) {
                    const depEl = document.getElementById('erpExtra_' + depKey);
                    if (depEl && depEl.value !== depVal) visible = false;
                }
                wrap.style.display = visible ? '' : 'none';
            }
        }
    }
}

function fecharErpConfig() {
    document.getElementById('erpConfigPanel').style.display = 'none';
    _erpSelecionado = null;
}

async function salvarErpConfig() {
    if (!_erpSelecionado) return;
    const url_base = document.getElementById('erpUrlBase').value.trim();
    const token = document.getElementById('erpToken').value.trim();
    const ui = ERP_UI_CONFIG[_erpSelecionado];
    if (!url_base) return mostrarToast('URL base obrigatoria', 'error');
    if (ui.showToken && !token) return mostrarToast('Token obrigatorio', 'error');

    const extras = {};
    if (ui.extraFields) {
        for (const f of ui.extraFields) {
            const el = document.getElementById('erpExtra_' + f.key);
            if (el) extras[f.key] = el.value;
        }
    }

    try {
        await api('/api/erp/' + _erpSelecionado + '/config', {
            method: 'POST',
            body: { url_base, token: token || null, extras: JSON.stringify(extras) }
        });
        mostrarToast('Configuracao ' + ui.label + ' salva!');
        carregarErpStatus();
        selecionarErp(_erpSelecionado);
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

async function testarErpConexao() {
    if (!_erpSelecionado) return;
    const resultado = document.getElementById('erpTesteResultado');
    resultado.innerHTML = '<div class="spinner-border spinner-border-sm text-primary me-2"></div>Testando conexao...';
    try {
        const r = await api('/api/erp/' + _erpSelecionado + '/testar');
        if (r.ok) {
            resultado.innerHTML =
                '<div class="alert alert-success mt-2"><i class="bi bi-check-circle me-1"></i>Conexao bem sucedida! Status HTTP: ' +
                r.status +
                '</div>';
            carregarErpStatus();
        } else {
            resultado.innerHTML =
                '<div class="alert alert-danger mt-2"><i class="bi bi-x-circle me-1"></i>Falha: ' +
                (r.erro || 'Erro desconhecido') +
                '</div>';
        }
    } catch (err) {
        resultado.innerHTML =
            '<div class="alert alert-danger mt-2"><i class="bi bi-x-circle me-1"></i>Erro: ' + err.message + '</div>';
    }
}

async function sincronizarErp() {
    if (!_erpSelecionado) return;
    const resultado = document.getElementById('erpTesteResultado');
    resultado.innerHTML =
        '<div class="spinner-border spinner-border-sm text-success me-2"></div>Sincronizando dados...';
    try {
        const r = await api('/api/erp/' + _erpSelecionado + '/sync', { method: 'POST' });
        if (r.sucesso) {
            resultado.innerHTML =
                '<div class="alert alert-success mt-2">' +
                '<i class="bi bi-check-circle me-1"></i><strong>Sincronizacao concluida!</strong><br>' +
                'Total: ' + r.total + ' registros | ' +
                'Novos: ' + r.novos + ' | ' +
                'Atualizados: ' + r.atualizados + ' | ' +
                'Erros: ' + r.erros + ' | ' +
                'Duracao: ' + (r.duracao_ms / 1000).toFixed(1) + 's</div>';
            document.getElementById('erpUltimoSync').textContent =
                'Ultima sincronizacao: ' + new Date().toLocaleString('pt-BR');
            carregarErpStatus();
        } else {
            resultado.innerHTML =
                '<div class="alert alert-danger mt-2"><i class="bi bi-x-circle me-1"></i>Falha: ' +
                (r.erro || 'Erro desconhecido') +
                '</div>';
        }
    } catch (err) {
        resultado.innerHTML =
            '<div class="alert alert-danger mt-2"><i class="bi bi-x-circle me-1"></i>Erro: ' + err.message + '</div>';
    }
}

async function removerErpConfig() {
    if (!_erpSelecionado) return;
    const ui = ERP_UI_CONFIG[_erpSelecionado];
    if (!confirm('Remover integracao ' + ui.label + '? Isso apaga a configuracao salva.')) return;
    try {
        await api('/api/erp/' + _erpSelecionado + '/config', { method: 'DELETE' });
        mostrarToast('Integracao ' + ui.label + ' removida!');
        fecharErpConfig();
        carregarErpStatus();
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

function toggleErpToken() {
    const input = document.getElementById('erpToken');
    const icon = document.getElementById('erpTokenIcon');
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'bi bi-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'bi bi-eye';
    }
}

// ==================== SLA ====================

async function carregarSLA() {
    try {
        const regras = await api('/api/sla/config');
        const tbody = document.getElementById('tabelaSLA');
        if (!tbody) return;
        if (!regras.length) {
            tbody.innerHTML =
                '<tr><td colspan="6" class="text-center text-muted py-3">Nenhuma regra SLA configurada</td></tr>';
            return;
        }
        const prioMap = { baixa: 'secondary', normal: 'info', alta: 'warning', critica: 'danger' };
        tbody.innerHTML = regras
            .map(
                (r) => `
            <tr>
                <td class="fw-medium text-capitalize">${r.categoria}</td>
                <td><span class="badge bg-${prioMap[r.prioridade] || 'info'}">${r.prioridade}</span></td>
                <td>${r.tempo_resposta_horas}h</td>
                <td>${r.tempo_resolucao_horas}h</td>
                <td>${r.ativo ? '<span class="badge bg-success">Ativo</span>' : '<span class="badge bg-secondary">Inativo</span>'}</td>
                <td>
                    <div class="d-flex gap-1">
                        <button class="btn btn-sm btn-outline-primary btn-action" onclick="editarSLA(${r.id})"><i class="bi bi-pencil"></i></button>
                        <button class="btn btn-sm btn-outline-${r.ativo ? 'warning' : 'success'} btn-action" onclick="toggleSLA(${r.id}, ${r.ativo ? 0 : 1})" title="${r.ativo ? 'Desativar' : 'Ativar'}">
                            <i class="bi bi-${r.ativo ? 'pause' : 'play'}"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger btn-action" onclick="excluirSLA(${r.id})"><i class="bi bi-trash"></i></button>
                    </div>
                </td>
            </tr>
        `
            )
            .join('');
    } catch (err) {
        console.error('Erro ao carregar SLA:', err);
    }
}

async function carregarSLADashboard() {
    try {
        const d = await api('/api/sla/dashboard');
        const el = (id) => document.getElementById(id);
        if (el('slaTotalAbertos')) el('slaTotalAbertos').textContent = d.total_abertos || 0;
        if (el('slaDentro')) el('slaDentro').textContent = d.sla_dentro || 0;
        if (el('slaCriticos')) el('slaCriticos').textContent = d.sla_criticos || 0;
        if (el('slaEstourados')) el('slaEstourados').textContent = d.sla_estourados || 0;
    } catch {}
}

let _slaRegras = [];

function abrirModalSLA() {
    document.getElementById('slaId').value = '';
    document.getElementById('slaCategoria').value = 'usuario';
    document.getElementById('slaPrioridade').value = 'normal';
    document.getElementById('slaTempoResposta').value = '24';
    document.getElementById('slaTempoResolucao').value = '72';
    document.getElementById('modalSLATitulo').textContent = 'Nova Regra SLA';
    new bootstrap.Modal(document.getElementById('modalSLA')).show();
}

async function editarSLA(id) {
    try {
        const regras = await api('/api/sla/config');
        const r = regras.find((x) => x.id === id);
        if (!r) return;
        document.getElementById('slaId').value = r.id;
        document.getElementById('slaCategoria').value = r.categoria;
        document.getElementById('slaPrioridade').value = r.prioridade;
        document.getElementById('slaTempoResposta').value = r.tempo_resposta_horas;
        document.getElementById('slaTempoResolucao').value = r.tempo_resolucao_horas;
        document.getElementById('modalSLATitulo').textContent = 'Editar Regra SLA';
        new bootstrap.Modal(document.getElementById('modalSLA')).show();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function salvarSLA() {
    const id = document.getElementById('slaId').value;
    const data = {
        categoria: document.getElementById('slaCategoria').value,
        prioridade: document.getElementById('slaPrioridade').value,
        tempo_resposta_horas: Number(document.getElementById('slaTempoResposta').value),
        tempo_resolucao_horas: Number(document.getElementById('slaTempoResolucao').value)
    };
    if (!data.tempo_resposta_horas || !data.tempo_resolucao_horas) {
        mostrarToast('Preencha os tempos', 'warning');
        return;
    }
    try {
        if (id) {
            await api(`/api/sla/config/${id}`, { method: 'PUT', body: data });
            mostrarToast('Regra SLA atualizada!');
        } else {
            await api('/api/sla/config', { method: 'POST', body: data });
            mostrarToast('Regra SLA criada!');
        }
        bootstrap.Modal.getInstance(document.getElementById('modalSLA')).hide();
        carregarSLA();
        carregarSLADashboard();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function toggleSLA(id, novoStatus) {
    try {
        const regras = await api('/api/sla/config');
        const r = regras.find((x) => x.id === id);
        if (!r) return;
        await api(`/api/sla/config/${id}`, { method: 'PUT', body: { ...r, ativo: novoStatus } });
        mostrarToast(novoStatus ? 'Regra ativada' : 'Regra desativada');
        carregarSLA();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function excluirSLA(id) {
    if (!confirm('Excluir esta regra SLA?')) return;
    try {
        await api(`/api/sla/config/${id}`, { method: 'DELETE' });
        mostrarToast('Regra SLA excluida!');
        carregarSLA();
        carregarSLADashboard();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

// ==================== WHATSAPP IA ====================

async function carregarWhatsAppIA() {
    try {
        const config = await api('/api/whatsapp-ia/config');
        if (config) {
            document.getElementById('iaAtivo').checked = !!config.ativo;
            document.getElementById('iaContextoKB').checked = !!config.contexto_kb;
            document.getElementById('iaModelo').value = config.modelo || 'gpt-3.5-turbo';
            document.getElementById('iaMaxTokens').value = config.max_tokens || 500;
            document.getElementById('iaPromptSistema').value = config.prompt_sistema || '';
            // Don't populate API key for security
        }
    } catch {}
}

async function salvarWhatsAppIA(e) {
    e.preventDefault();
    try {
        await api('/api/whatsapp-ia/config', {
            method: 'PUT',
            body: {
                ativo: document.getElementById('iaAtivo').checked ? 1 : 0,
                contexto_kb: document.getElementById('iaContextoKB').checked ? 1 : 0,
                modelo: document.getElementById('iaModelo').value,
                max_tokens: Number(document.getElementById('iaMaxTokens').value),
                api_key: document.getElementById('iaApiKey').value || undefined,
                prompt_sistema: document.getElementById('iaPromptSistema').value
            }
        });
        mostrarToast('Configuracao IA salva!');
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

function toggleIAKey() {
    const input = document.getElementById('iaApiKey');
    const icon = document.getElementById('iaKeyIcon');
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'bi bi-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'bi bi-eye';
    }
}

async function carregarIAHistorico() {
    try {
        const historico = await api('/api/whatsapp-ia/historico');
        const tbody = document.getElementById('tabelaIAHistorico');
        if (!tbody) return;
        if (!historico.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">Nenhum registro</td></tr>';
            return;
        }
        tbody.innerHTML = historico
            .slice(0, 50)
            .map(
                (h) => `
            <tr>
                <td><small>${formatarDataHora(h.criado_em)}</small></td>
                <td><small>${h.chat_id || '-'}</small></td>
                <td><small class="d-inline-block text-truncate" style="max-width:200px">${escapeHtmlGlobal(h.mensagem_entrada || '')}</small></td>
                <td><small class="d-inline-block text-truncate" style="max-width:200px">${escapeHtmlGlobal(h.resposta_ia || '')}</small></td>
                <td><span class="badge bg-info">${h.classificacao || '-'}</span></td>
                <td>${h.aprovado ? '<i class="bi bi-check-circle text-success"></i>' : '<i class="bi bi-dash-circle text-muted"></i>'}</td>
            </tr>
        `
            )
            .join('');
    } catch {}
}

// ==================== LGPD ====================

function _lgpdQuery() {
    const doc = document.getElementById('lgpdDocumento').value.trim();
    const nome = document.getElementById('lgpdNome')?.value.trim() || '';
    const params = new URLSearchParams();
    if (doc) params.set('documento', doc);
    if (nome) params.set('nome', nome);
    return params;
}

async function consultarTitular() {
    const params = _lgpdQuery();
    if (!params.toString()) return mostrarToast('Informe documento ou nome', 'warning');
    const container = document.getElementById('lgpdResultadoTitular');
    container.style.display = '';
    container.innerHTML = '<div class="spinner-border spinner-border-sm"></div> Consultando base local...';
    try {
        const dados = await api('/api/lgpd/dados-titular?' + params.toString());
        const total = (dados.provedores?.length || 0) + (dados.chamados?.length || 0) + (dados.negocios?.length || 0);
        if (!total) {
            container.innerHTML =
                '<div class="alert alert-warning"><i class="bi bi-exclamation-triangle me-1"></i>Nenhum dado encontrado na base local. Tente "Consultar ERP" para buscar diretamente no sistema do provedor.</div>';
            return;
        }
        let html =
            '<div class="alert alert-success mb-2"><i class="bi bi-check-circle me-1"></i><strong>' +
            total +
            ' registro(s) encontrado(s) na base local</strong></div>';
        if (dados.provedores?.length) {
            html +=
                '<div class="card p-2 mb-2"><h6 class="mb-2"><i class="bi bi-building me-1"></i>Provedores (' +
                dados.provedores.length +
                ')</h6>';
            html +=
                '<div class="table-responsive"><table class="table table-sm table-bordered mb-0"><thead><tr><th>ID</th><th>Nome</th><th>CNPJ</th><th>Email</th><th>Telefone</th><th>Acoes</th></tr></thead><tbody>';
            dados.provedores.forEach((p) => {
                html +=
                    '<tr><td>' +
                    p.id +
                    '</td><td>' +
                    escapeHtmlGlobal(p.nome || '') +
                    '</td><td>' +
                    escapeHtmlGlobal(p.cnpj || '-') +
                    '</td><td>' +
                    escapeHtmlGlobal(p.email || '-') +
                    '</td><td>' +
                    escapeHtmlGlobal(p.telefone || '-') +
                    '</td>';
                html +=
                    '<td><button class="btn btn-xs btn-outline-danger" onclick="anonimizarTitular(' +
                    p.id +
                    ",'" +
                    escapeHtmlGlobal(p.nome || '').replace(/'/g, "\\'") +
                    '\')" title="Anonimizar dados"><i class="bi bi-shield-x"></i></button></td></tr>';
            });
            html += '</tbody></table></div></div>';
        }
        if (dados.chamados?.length) {
            html +=
                '<div class="card p-2 mb-2"><h6 class="mb-2"><i class="bi bi-ticket me-1"></i>Chamados (' +
                dados.chamados.length +
                ')</h6>';
            html +=
                '<div class="table-responsive"><table class="table table-sm table-bordered mb-0"><thead><tr><th>ID</th><th>Titulo</th><th>Status</th><th>Prioridade</th><th>Criado em</th></tr></thead><tbody>';
            dados.chamados.forEach((c) => {
                html +=
                    '<tr><td>' +
                    c.id +
                    '</td><td>' +
                    escapeHtmlGlobal(c.titulo || '') +
                    '</td><td>' +
                    escapeHtmlGlobal(c.status || '') +
                    '</td><td>' +
                    escapeHtmlGlobal(c.prioridade || '') +
                    '</td><td>' +
                    (c.criado_em || '') +
                    '</td></tr>';
            });
            html += '</tbody></table></div></div>';
        }
        if (dados.negocios?.length) {
            html +=
                '<div class="card p-2 mb-2"><h6 class="mb-2"><i class="bi bi-briefcase me-1"></i>Negocios (' +
                dados.negocios.length +
                ')</h6>';
            html +=
                '<div class="table-responsive"><table class="table table-sm table-bordered mb-0"><thead><tr><th>Lead</th><th>Estagio</th><th>Plano</th><th>Valor</th></tr></thead><tbody>';
            dados.negocios.forEach((n) => {
                html +=
                    '<tr><td>' +
                    escapeHtmlGlobal(n.provedor_nome_lead || '') +
                    '</td><td>' +
                    escapeHtmlGlobal(n.estagio || '') +
                    '</td><td>' +
                    escapeHtmlGlobal(n.plano_interesse || '') +
                    '</td><td>' +
                    (n.valor_estimado || '-') +
                    '</td></tr>';
            });
            html += '</tbody></table></div></div>';
        }
        if (dados.consentimentos?.length) {
            html +=
                '<div class="card p-2 mb-2"><h6 class="mb-2"><i class="bi bi-clipboard-check me-1"></i>Consentimentos (' +
                dados.consentimentos.length +
                ')</h6><ul class="mb-0">';
            dados.consentimentos.forEach((c) => {
                html +=
                    '<li>' +
                    escapeHtmlGlobal(c.tipo_consentimento) +
                    ': <span class="badge bg-' +
                    (c.consentido ? 'success">Concedido' : 'danger">Revogado') +
                    '</span> - ' +
                    (c.data_consentimento || '') +
                    '</li>';
            });
            html += '</ul></div>';
        }
        html += '<div class="d-flex gap-2 mt-2">';
        html +=
            '<button class="btn btn-sm btn-outline-primary" onclick="exportarDadosTitular()"><i class="bi bi-download me-1"></i>Exportar Dados (JSON)</button>';
        html += '</div>';
        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = '<div class="alert alert-danger">Erro: ' + escapeHtmlGlobal(err.message) + '</div>';
    }
}

async function consultarTitularERP() {
    const params = _lgpdQuery();
    if (!params.toString()) return mostrarToast('Informe documento ou nome', 'warning');
    const container = document.getElementById('lgpdResultadoTitular');
    container.style.display = '';
    container.innerHTML =
        '<div class="spinner-border spinner-border-sm"></div> Consultando ERPs em tempo real (pode demorar)...';
    try {
        const dados = await api('/api/lgpd/consulta-erp?' + params.toString());
        if (!dados.erps?.length) {
            container.innerHTML =
                '<div class="alert alert-warning"><i class="bi bi-cloud-slash me-1"></i>' +
                escapeHtmlGlobal(dados.mensagem || 'Nenhum resultado encontrado nos ERPs.') +
                '</div>';
            return;
        }
        let html = '';
        let temResultado = false;
        for (const erp of dados.erps) {
            if (erp.erro) {
                html +=
                    '<div class="alert alert-danger mb-2"><strong>' +
                    escapeHtmlGlobal(erp.erp_label) +
                    ':</strong> ' +
                    escapeHtmlGlobal(erp.erro) +
                    '</div>';
                continue;
            }
            if (!erp.clientes?.length) continue;
            temResultado = true;
            html +=
                '<div class="card p-2 mb-2"><h6 class="mb-2"><i class="bi bi-cloud-check me-1 text-info"></i>' +
                escapeHtmlGlobal(erp.erp_label) +
                ' (' +
                erp.clientes.length +
                ' encontrado(s))</h6>';
            html +=
                '<div class="table-responsive"><table class="table table-sm table-bordered mb-0"><thead><tr><th>Nome</th><th>Documento</th><th>Email</th><th>Telefone</th><th>Status</th><th>Contratos</th></tr></thead><tbody>';
            for (const c of erp.clientes) {
                const contratos = c.contratos?.length
                    ? c.contratos
                          .map(
                              (ct) =>
                                  escapeHtmlGlobal(ct.plano || '-') + ' (' + escapeHtmlGlobal(ct.status || '-') + ')'
                          )
                          .join(', ')
                    : '-';
                html +=
                    '<tr><td>' +
                    escapeHtmlGlobal(c.nome || '') +
                    '</td><td>' +
                    escapeHtmlGlobal(c.documento || '') +
                    '</td><td>' +
                    escapeHtmlGlobal(c.email || '') +
                    '</td><td>' +
                    escapeHtmlGlobal(c.telefone || '') +
                    '</td><td>' +
                    escapeHtmlGlobal(c.status || '') +
                    '</td><td class="small">' +
                    contratos +
                    '</td></tr>';
            }
            html += '</tbody></table></div></div>';
        }
        if (!temResultado && !html) html = '<div class="alert alert-warning">Nenhum titular encontrado nos ERPs.</div>';
        else
            html =
                '<div class="alert alert-info mb-2"><i class="bi bi-cloud-check me-1"></i><strong>Dados obtidos em tempo real dos ERPs</strong></div>' +
                html;
        html +=
            '<div class="d-flex gap-2 mt-2"><button class="btn btn-sm btn-outline-primary" onclick="exportarDadosTitular()"><i class="bi bi-download me-1"></i>Exportar Todos os Dados (JSON)</button></div>';
        container.innerHTML = html;
    } catch (err) {
        container.innerHTML =
            '<div class="alert alert-danger">Erro ao consultar ERP: ' + escapeHtmlGlobal(err.message) + '</div>';
    }
}

async function exportarDadosTitular() {
    const params = _lgpdQuery();
    if (!params.toString()) return mostrarToast('Informe documento ou nome', 'warning');
    try {
        const res = await fetch('/api/lgpd/exportar-dados?' + params.toString(), { credentials: 'include' });
        if (!res.ok) throw new Error('Erro ao exportar');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'lgpd-dados-titular-' + Date.now() + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        mostrarToast('Dados exportados com sucesso!');
    } catch (err) {
        mostrarToast('Erro ao exportar: ' + err.message, 'error');
    }
}

async function anonimizarTitular(provedorId, nome) {
    if (
        !confirm(
            'ATENCAO: Esta acao e IRREVERSIVEL!\n\nTodos os dados pessoais de "' +
                nome +
                '" serao anonimizados conforme Art. 18 da LGPD.\n\nDeseja continuar?'
        )
    )
        return;
    if (!confirm('Confirme novamente: Anonimizar TODOS os dados de "' + nome + '"?')) return;
    try {
        await api('/api/lgpd/anonimizar', { method: 'POST', body: { provedor_id: provedorId, escopo: 'completo' } });
        mostrarToast('Dados anonimizados com sucesso!');
        consultarTitular();
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

async function carregarRetencao() {
    try {
        const regras = await api('/api/lgpd/retencao');
        const tbody = document.getElementById('tabelaRetencao');
        if (!tbody) return;
        if (!regras.length) {
            tbody.innerHTML =
                '<tr><td colspan="6" class="text-center text-muted py-3">Nenhuma regra de retencao</td></tr>';
            return;
        }
        const acaoMap = { anonimizar: 'warning', excluir: 'danger', arquivar: 'info' };
        tbody.innerHTML = regras
            .map(
                (r) => `
            <tr>
                <td class="fw-medium">${r.tabela}</td>
                <td>${r.campo || '<em class="text-muted">Todos</em>'}</td>
                <td>${r.tempo_retencao_dias} dias</td>
                <td><span class="badge bg-${acaoMap[r.acao] || 'secondary'}">${r.acao}</span></td>
                <td>${r.ativo ? '<span class="badge bg-success">Ativo</span>' : '<span class="badge bg-secondary">Inativo</span>'}</td>
                <td><button class="btn btn-sm btn-outline-danger btn-action" onclick="excluirRetencao(${r.id})"><i class="bi bi-trash"></i></button></td>
            </tr>
        `
            )
            .join('');
    } catch {}
}

function abrirModalRetencao() {
    document.getElementById('retTabela').value = 'provedores';
    document.getElementById('retCampo').value = '';
    document.getElementById('retDias').value = '365';
    document.getElementById('retAcao').value = 'anonimizar';
    new bootstrap.Modal(document.getElementById('modalRetencao')).show();
}

async function salvarRetencao() {
    try {
        await api('/api/lgpd/retencao', {
            method: 'POST',
            body: {
                tabela: document.getElementById('retTabela').value,
                campo: document.getElementById('retCampo').value || null,
                tempo_retencao_dias: Number(document.getElementById('retDias').value),
                acao: document.getElementById('retAcao').value
            }
        });
        mostrarToast('Regra de retencao criada!');
        bootstrap.Modal.getInstance(document.getElementById('modalRetencao')).hide();
        carregarRetencao();
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

async function excluirRetencao(id) {
    if (!confirm('Excluir esta regra de retencao?')) return;
    try {
        await api('/api/lgpd/retencao/' + id, { method: 'DELETE' });
        mostrarToast('Regra excluida!');
        carregarRetencao();
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

async function gerarRelatorioLGPD() {
    const container = document.getElementById('lgpdRelatorio');
    container.innerHTML = '<div class="spinner-border spinner-border-sm"></div> Gerando relatorio...';
    try {
        const rel = await api('/api/lgpd/relatorio');
        let html = '<div class="row g-3 mb-3">';
        html +=
            '<div class="col-md-3"><div class="card text-center p-3"><div class="fs-4 fw-bold text-primary">' +
            (rel.tabelas?.reduce((s, t) => s + (t.registros || 0), 0) || 0) +
            '</div><small class="text-muted">Registros Totais</small></div></div>';
        html +=
            '<div class="col-md-3"><div class="card text-center p-3"><div class="fs-4 fw-bold text-success">' +
            (rel.total_consentimentos || 0) +
            '</div><small class="text-muted">Consentimentos</small></div></div>';
        html +=
            '<div class="col-md-3"><div class="card text-center p-3"><div class="fs-4 fw-bold text-warning">' +
            (rel.tabelas?.filter((t) => t.retencao).length || 0) +
            '</div><small class="text-muted">Regras Retencao</small></div></div>';
        html +=
            '<div class="col-md-3"><div class="card text-center p-3"><div class="fs-4 fw-bold text-danger">' +
            (rel.total_anonimizados || 0) +
            '</div><small class="text-muted">Anonimizados</small></div></div>';
        html += '</div>';
        if (rel.tabelas?.length) {
            html +=
                '<div class="table-responsive mt-2"><table class="table table-sm table-bordered"><thead><tr><th>Tabela</th><th>Registros</th><th>Retencao</th><th>Status</th></tr></thead><tbody>';
            rel.tabelas.forEach((t) => {
                const ret = t.retencao;
                html += '<tr><td class="fw-medium">' + escapeHtmlGlobal(t.tabela) + '</td><td>' + t.registros + '</td>';
                html +=
                    '<td>' +
                    (ret
                        ? ret.tempo_retencao_dias + ' dias (' + escapeHtmlGlobal(ret.acao) + ')'
                        : '<span class="text-muted">Sem regra</span>') +
                    '</td>';
                html +=
                    '<td>' +
                    (ret
                        ? '<span class="badge bg-success">Configurado</span>'
                        : '<span class="badge bg-warning">Pendente</span>') +
                    '</td></tr>';
            });
            html += '</tbody></table></div>';
        }
        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = '<div class="alert alert-danger">Erro: ' + escapeHtmlGlobal(err.message) + '</div>';
    }
}

// ==================== INTEGRACOES EXTERNAS ====================

const INTEG_EXT_UI = {
    google_calendar: { label: 'Google Calendar', icon: 'bi-calendar-check', color: '#4285F4' },
    slack: { label: 'Slack', icon: 'bi-slack', color: '#4A154B' },
    discord: { label: 'Discord', icon: 'bi-discord', color: '#5865F2' },
    n8n: { label: 'N8N', icon: 'bi-diagram-3', color: '#FF6D5A' },
    zapier: { label: 'Zapier', icon: 'bi-lightning-charge', color: '#FF4A00' },
    webhook_generico: { label: 'Webhook Generico', icon: 'bi-broadcast', color: '#6c757d' }
};

async function carregarIntegExternas() {
    try {
        const integs = await api('/api/integracoes-externas');
        const container = document.getElementById('integExternasCards');
        if (!container) return;
        if (!integs.length) {
            container.innerHTML =
                '<div class="col-12 text-center text-muted py-3">Nenhuma integracao externa configurada</div>';
            return;
        }
        container.innerHTML = integs
            .map((i) => {
                const ui = INTEG_EXT_UI[i.tipo] || { label: i.tipo, icon: 'bi-plug', color: '#6c757d' };
                let configParsed = {};
                try {
                    configParsed = JSON.parse(i.config || '{}');
                } catch {}
                return `<div class="col-md-4">
                <div class="card h-100" style="border-left:3px solid ${ui.color}">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start">
                            <div>
                                <i class="bi ${ui.icon}" style="font-size:1.3rem;color:${ui.color}"></i>
                                <h6 class="mt-1 mb-0">${i.nome || ui.label}</h6>
                                <small class="text-muted">${ui.label}</small>
                            </div>
                            <span class="badge bg-${i.ativo ? 'success' : 'secondary'}">${i.ativo ? 'Ativo' : 'Inativo'}</span>
                        </div>
                        ${configParsed.url ? '<div class="mt-2"><small class="text-muted text-break">' + configParsed.url + '</small></div>' : ''}
                        <div class="mt-2 d-flex gap-1">
                            <button class="btn btn-sm btn-outline-primary btn-action" onclick="editarIntegExt(${i.id})"><i class="bi bi-pencil"></i></button>
                            <button class="btn btn-sm btn-outline-${i.ativo ? 'warning' : 'success'} btn-action" onclick="toggleIntegExt(${i.id}, ${i.ativo ? 0 : 1})">
                                <i class="bi bi-${i.ativo ? 'pause' : 'play'}"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-danger btn-action" onclick="excluirIntegExt(${i.id})"><i class="bi bi-trash"></i></button>
                        </div>
                    </div>
                </div>
            </div>`;
            })
            .join('');
    } catch {
        const container = document.getElementById('integExternasCards');
        if (container)
            container.innerHTML =
                '<div class="col-12 text-center text-muted py-3">Nenhuma integracao externa configurada</div>';
    }
}

function abrirModalIntegExt() {
    document.getElementById('integExtId').value = '';
    document.getElementById('integExtTipo').value = 'google_calendar';
    document.getElementById('integExtNome').value = '';
    document.getElementById('integExtUrl').value = '';
    document.getElementById('integExtToken').value = '';
    document.getElementById('modalIntegExtTitulo').textContent = 'Nova Integracao';
    new bootstrap.Modal(document.getElementById('modalIntegExt')).show();
}

async function editarIntegExt(id) {
    try {
        const integs = await api('/api/integracoes-externas');
        const i = integs.find((x) => x.id === id);
        if (!i) return;
        let configParsed = {};
        try {
            configParsed = JSON.parse(i.config || '{}');
        } catch {}
        document.getElementById('integExtId').value = i.id;
        document.getElementById('integExtTipo').value = i.tipo;
        document.getElementById('integExtNome').value = i.nome || '';
        document.getElementById('integExtUrl').value = configParsed.url || '';
        document.getElementById('integExtToken').value = '';
        document.getElementById('modalIntegExtTitulo').textContent = 'Editar Integracao';
        new bootstrap.Modal(document.getElementById('modalIntegExt')).show();
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

async function salvarIntegExt() {
    const id = document.getElementById('integExtId').value;
    const data = {
        tipo: document.getElementById('integExtTipo').value,
        nome: document.getElementById('integExtNome').value,
        config: JSON.stringify({
            url: document.getElementById('integExtUrl').value,
            token: document.getElementById('integExtToken').value || undefined
        })
    };
    if (!data.nome) return mostrarToast('Nome obrigatorio', 'warning');
    try {
        if (id) {
            await api('/api/integracoes-externas/' + id, { method: 'PUT', body: data });
            mostrarToast('Integracao atualizada!');
        } else {
            await api('/api/integracoes-externas', { method: 'POST', body: data });
            mostrarToast('Integracao criada!');
        }
        bootstrap.Modal.getInstance(document.getElementById('modalIntegExt')).hide();
        carregarIntegExternas();
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

async function toggleIntegExt(id, novoStatus) {
    try {
        const integs = await api('/api/integracoes-externas');
        const i = integs.find((x) => x.id === id);
        if (!i) return;
        await api('/api/integracoes-externas/' + id, { method: 'PUT', body: { ...i, ativo: novoStatus } });
        mostrarToast(novoStatus ? 'Integracao ativada' : 'Integracao desativada');
        carregarIntegExternas();
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}

async function excluirIntegExt(id) {
    if (!confirm('Excluir esta integracao?')) return;
    try {
        await api('/api/integracoes-externas/' + id, { method: 'DELETE' });
        mostrarToast('Integracao excluida!');
        carregarIntegExternas();
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}
