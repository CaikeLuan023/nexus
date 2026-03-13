// ==================== LOGS & MONITORAMENTO ====================

let logOffsets = { api: 0, webhooks: 0, erp: 0, integracoes: 0, ia: 0, erpComm: 0 };
let autoRefreshInterval = null;
const LOG_LIMIT = 50;

document.addEventListener('DOMContentLoaded', () => {
    const hoje = new Date().toISOString().split('T')[0];
    document.getElementById('logDataFim').value = hoje;
    carregarResumo();
    carregarLogAPI();
    iniciarAutoRefresh();

    document.getElementById('autoRefreshToggle').addEventListener('change', (e) => {
        if (e.target.checked) iniciarAutoRefresh();
        else pararAutoRefresh();
    });
});

function iniciarAutoRefresh() {
    pararAutoRefresh();
    autoRefreshInterval = setInterval(() => {
        carregarResumo();
        atualizarTabAtual();
    }, 15000);
}

function pararAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}

function getFiltrosDatas() {
    const data_inicio = document.getElementById('logDataInicio').value || '';
    const data_fim = document.getElementById('logDataFim').value || '';
    let qs = '';
    if (data_inicio) qs += `&data_inicio=${data_inicio}`;
    if (data_fim) qs += `&data_fim=${data_fim}`;
    return qs;
}

function getTabAtiva() {
    const active = document.querySelector('.nav-tabs .nav-link.active');
    if (!active) return 'api';
    const target = active.getAttribute('data-bs-target') || '';
    if (target.includes('Webhooks')) return 'webhooks';
    if (target.includes('ERPComm')) return 'erpComm';
    if (target.includes('ERP')) return 'erp';
    if (target.includes('Integracoes')) return 'integracoes';
    if (target.includes('WhatsApp')) return 'ia';
    return 'api';
}

function atualizarTabAtual() {
    const tab = getTabAtiva();
    carregarResumo();
    if (tab === 'api') carregarLogAPI();
    else if (tab === 'webhooks') carregarLogWebhooks();
    else if (tab === 'erp') carregarLogERP();
    else if (tab === 'erpComm') carregarLogERPComm();
    else if (tab === 'integracoes') carregarLogIntegracoes();
    else if (tab === 'ia') carregarLogIA();
}

// ========== RESUMO ==========

async function carregarResumo() {
    try {
        const data = await api('/api/logs/resumo');
        document.getElementById('logRequests').textContent = data.requests_hoje || 0;
        document.getElementById('logErros').textContent = data.erros_hoje || 0;
        document.getElementById('logTempoMedio').textContent = (data.tempo_medio_ms || 0) + 'ms';
        document.getElementById('logSyncs').textContent = data.syncs_erp_hoje || 0;
        document.getElementById('logWebhooks').textContent = data.webhooks_hoje || 0;
        document.getElementById('logWebhooksErro').textContent = data.webhooks_erro_hoje || 0;
        const erpCommEl = document.getElementById('logERPComm');
        if (erpCommEl) erpCommEl.textContent = data.erp_comm_hoje || 0;
        const erpCommErroEl = document.getElementById('logERPCommErro');
        if (erpCommErroEl) erpCommErroEl.textContent = data.erp_comm_erro_hoje || 0;
    } catch (err) {
        console.error('Erro ao carregar resumo logs:', err);
    }
}

// ========== API REQUESTS ==========

async function carregarLogAPI(mais) {
    if (!mais) logOffsets.api = 0;
    try {
        const endpoint = document.getElementById('filtroEndpoint').value || '';
        const status = document.getElementById('filtroStatusAPI').value || '';
        let url = `/api/logs/api-requests?limit=${LOG_LIMIT}&offset=${logOffsets.api}`;
        if (endpoint) url += `&endpoint=${encodeURIComponent(endpoint)}`;
        if (status) url += `&status=${status}`;
        url += getFiltrosDatas();

        const data = await api(url);
        const tbody = document.getElementById('tabelaLogAPI');

        if (!data.length && !mais) {
            tbody.innerHTML =
                '<tr><td colspan="8" class="text-center text-muted py-4"><i class="bi bi-check-circle text-success fs-3 d-block mb-2"></i>Nenhum log de API encontrado</td></tr>';
            document.getElementById('btnMaisAPI').style.display = 'none';
            return;
        }

        const html = data
            .map((r) => {
                const statusClass =
                    r.status_code >= 500
                        ? 'text-bg-danger'
                        : r.status_code >= 400
                          ? 'text-bg-warning'
                          : 'text-bg-success';
                const tempoClass =
                    r.tempo_resposta_ms > 1000
                        ? 'text-danger fw-bold'
                        : r.tempo_resposta_ms > 500
                          ? 'text-warning'
                          : '';
                return `<tr>
                <td class="small">${formatarDataHora(r.criado_em)}</td>
                <td><span class="badge bg-secondary">${esc(r.metodo)}</span></td>
                <td class="small text-truncate" style="max-width:250px" title="${esc(r.endpoint)}">${esc(r.endpoint)}</td>
                <td><span class="badge ${statusClass}">${r.status_code || '-'}</span></td>
                <td class="${tempoClass}">${r.tempo_resposta_ms || 0}ms</td>
                <td class="small">${esc(r.api_token_nome || '-')}</td>
                <td class="small">${esc(r.ip || '-')}</td>
                <td class="small text-danger text-truncate" style="max-width:200px" title="${esc(r.erro || '')}">${esc(r.erro || '-')}</td>
            </tr>`;
            })
            .join('');

        if (mais) tbody.innerHTML += html;
        else tbody.innerHTML = html;

        logOffsets.api += data.length;
        document.getElementById('btnMaisAPI').style.display = data.length >= LOG_LIMIT ? '' : 'none';
    } catch (err) {
        console.error('Erro logs API:', err);
        mostrarToast('Erro ao carregar logs API: ' + err.message, 'error');
    }
}

// ========== WEBHOOKS ==========

async function carregarLogWebhooks(mais) {
    if (!mais) logOffsets.webhooks = 0;
    try {
        const evento = document.getElementById('filtroEventoWH').value || '';
        const sucesso = document.getElementById('filtroSucessoWH').value;
        let url = `/api/logs/webhooks?limit=${LOG_LIMIT}&offset=${logOffsets.webhooks}`;
        if (evento) url += `&evento=${encodeURIComponent(evento)}`;
        if (sucesso !== '') url += `&sucesso=${sucesso}`;
        url += getFiltrosDatas();

        const data = await api(url);
        const tbody = document.getElementById('tabelaLogWebhooks');

        if (!data.length && !mais) {
            tbody.innerHTML =
                '<tr><td colspan="7" class="text-center text-muted py-4"><i class="bi bi-broadcast text-muted fs-3 d-block mb-2"></i>Nenhum disparo de webhook registrado</td></tr>';
            document.getElementById('btnMaisWebhooks').style.display = 'none';
            return;
        }

        const html = data
            .map((r) => {
                const statusBadge = r.sucesso
                    ? '<span class="badge text-bg-success">OK</span>'
                    : '<span class="badge text-bg-danger">Falha</span>';
                const statusCode = r.status_code ? `<span class="badge bg-secondary">${r.status_code}</span>` : '-';
                return `<tr class="${!r.sucesso ? 'table-danger' : ''}">
                <td class="small">${formatarDataHora(r.criado_em)}</td>
                <td><span class="badge bg-info text-dark">${esc(r.evento)}</span></td>
                <td class="small text-truncate" style="max-width:200px" title="${esc(r.url)}">${esc(r.url)}</td>
                <td>${statusCode}</td>
                <td>${r.tempo_resposta_ms || 0}ms</td>
                <td>${statusBadge}</td>
                <td class="small text-danger text-truncate" style="max-width:200px" title="${esc(r.erro || '')}">${esc(r.erro || '-')}</td>
            </tr>`;
            })
            .join('');

        if (mais) tbody.innerHTML += html;
        else tbody.innerHTML = html;

        logOffsets.webhooks += data.length;
        document.getElementById('btnMaisWebhooks').style.display = data.length >= LOG_LIMIT ? '' : 'none';
    } catch (err) {
        console.error('Erro logs webhooks:', err);
        mostrarToast('Erro ao carregar logs webhooks: ' + err.message, 'error');
    }
}

// ========== ERP SYNC ==========

async function carregarLogERP(mais) {
    if (!mais) logOffsets.erp = 0;
    try {
        const tipo = document.getElementById('filtroTipoERP').value || '';
        let url = `/api/logs/erp-sync?limit=${LOG_LIMIT}&offset=${logOffsets.erp}`;
        if (tipo) url += `&tipo=${tipo}`;
        url += getFiltrosDatas();

        const data = await api(url);
        const tbody = document.getElementById('tabelaLogERP');

        if (!data.length && !mais) {
            tbody.innerHTML =
                '<tr><td colspan="7" class="text-center text-muted py-4"><i class="bi bi-arrow-repeat text-muted fs-3 d-block mb-2"></i>Nenhum log de sync ERP encontrado</td></tr>';
            document.getElementById('btnMaisERP').style.display = 'none';
            return;
        }

        const html = data
            .map(
                (r) => `<tr class="${r.erros > 0 ? 'table-danger' : ''}">
            <td class="small">${formatarDataHora(r.criado_em)}</td>
            <td><span class="badge bg-secondary">${esc(r.tipo || '-')}</span></td>
            <td>${esc(r.entidade || '-')}</td>
            <td>${r.total_registros || 0}</td>
            <td><span class="text-success">${r.novos || 0}</span> / <span class="text-primary">${r.atualizados || 0}</span> / <span class="text-danger">${r.erros || 0}</span></td>
            <td>${r.duracao_ms || 0}ms</td>
            <td class="small text-truncate" style="max-width:250px" title="${esc(r.detalhes || '')}">${esc(r.detalhes || '-')}</td>
        </tr>`
            )
            .join('');

        if (mais) tbody.innerHTML += html;
        else tbody.innerHTML = html;

        logOffsets.erp += data.length;
        document.getElementById('btnMaisERP').style.display = data.length >= LOG_LIMIT ? '' : 'none';
    } catch (err) {
        console.error('Erro logs ERP:', err);
        mostrarToast('Erro ao carregar logs ERP: ' + err.message, 'error');
    }
}

// ========== INTEGRACOES ==========

async function carregarLogIntegracoes(mais) {
    if (!mais) logOffsets.integracoes = 0;
    try {
        let url = `/api/logs/integracoes?limit=${LOG_LIMIT}&offset=${logOffsets.integracoes}`;
        url += getFiltrosDatas();

        const data = await api(url);
        const tbody = document.getElementById('tabelaLogIntegracoes');

        if (!data.length && !mais) {
            tbody.innerHTML =
                '<tr><td colspan="6" class="text-center text-muted py-4"><i class="bi bi-plug text-muted fs-3 d-block mb-2"></i>Nenhum log de integracoes encontrado</td></tr>';
            document.getElementById('btnMaisIntegracoes').style.display = 'none';
            return;
        }

        const html = data
            .map((r) => {
                const acaoBadge =
                    r.acao === 'criar'
                        ? 'text-bg-success'
                        : r.acao === 'excluir'
                          ? 'text-bg-danger'
                          : 'text-bg-primary';
                return `<tr>
                <td class="small">${formatarDataHora(r.criado_em)}</td>
                <td>${esc(r.usuario_nome || 'Sistema')}</td>
                <td><span class="badge ${acaoBadge}">${esc(r.acao)}</span></td>
                <td><span class="badge bg-secondary">${esc(r.modulo)}</span></td>
                <td class="small text-truncate" style="max-width:350px" title="${esc(r.detalhes || '')}">${esc(r.detalhes || '-')}</td>
                <td class="small">${esc(r.ip || '-')}</td>
            </tr>`;
            })
            .join('');

        if (mais) tbody.innerHTML += html;
        else tbody.innerHTML = html;

        logOffsets.integracoes += data.length;
        document.getElementById('btnMaisIntegracoes').style.display = data.length >= LOG_LIMIT ? '' : 'none';
    } catch (err) {
        console.error('Erro logs integracoes:', err);
        mostrarToast('Erro ao carregar logs integracoes: ' + err.message, 'error');
    }
}

// ========== WHATSAPP IA ==========

async function carregarLogIA(mais) {
    if (!mais) logOffsets.ia = 0;
    try {
        let url = `/api/logs/whatsapp-ia?limit=${LOG_LIMIT}&offset=${logOffsets.ia}`;
        url += getFiltrosDatas();

        const data = await api(url);
        const tbody = document.getElementById('tabelaLogIA');

        if (!data.length && !mais) {
            tbody.innerHTML =
                '<tr><td colspan="7" class="text-center text-muted py-4"><i class="bi bi-whatsapp text-muted fs-3 d-block mb-2"></i>Nenhum log de WhatsApp IA encontrado</td></tr>';
            document.getElementById('btnMaisIA').style.display = 'none';
            return;
        }

        const html = data
            .map((r) => {
                const statusBadge = r.enviado
                    ? '<span class="badge text-bg-success">Enviado</span>'
                    : r.aprovado
                      ? '<span class="badge text-bg-warning">Aprovado</span>'
                      : '<span class="badge text-bg-secondary">Pendente</span>';
                return `<tr>
                <td class="small">${formatarDataHora(r.criado_em)}</td>
                <td>${esc(r.chat_nome || r.chat_id || '-')}</td>
                <td class="small text-truncate" style="max-width:200px" title="${esc(r.mensagem_entrada || '')}">${esc(r.mensagem_entrada || '-')}</td>
                <td class="small text-truncate" style="max-width:200px" title="${esc(r.resposta_ia || '')}">${esc(r.resposta_ia || '-')}</td>
                <td><span class="badge bg-info text-dark">${esc(r.classificacao || '-')}</span></td>
                <td>${r.tokens_usados || '-'}</td>
                <td>${statusBadge}</td>
            </tr>`;
            })
            .join('');

        if (mais) tbody.innerHTML += html;
        else tbody.innerHTML = html;

        logOffsets.ia += data.length;
        document.getElementById('btnMaisIA').style.display = data.length >= LOG_LIMIT ? '' : 'none';
    } catch (err) {
        console.error('Erro logs WhatsApp IA:', err);
        mostrarToast('Erro ao carregar logs WhatsApp IA: ' + err.message, 'error');
    }
}

// ========== COMUNICACAO ERP ==========

async function carregarLogERPComm(mais) {
    if (!mais) logOffsets.erpComm = 0;
    try {
        const erp_tipo = document.getElementById('filtroERPCommTipo').value || '';
        const sucesso = document.getElementById('filtroERPCommSucesso').value;
        const contexto = document.getElementById('filtroERPCommContexto').value || '';
        let url = `/api/logs/erp-comunicacao?limit=${LOG_LIMIT}&offset=${logOffsets.erpComm}`;
        if (erp_tipo) url += `&erp_tipo=${encodeURIComponent(erp_tipo)}`;
        if (sucesso !== '') url += `&sucesso=${sucesso}`;
        if (contexto) url += `&contexto=${encodeURIComponent(contexto)}`;
        url += getFiltrosDatas();

        const data = await api(url);
        const tbody = document.getElementById('tabelaLogERPComm');

        if (!data.length && !mais) {
            tbody.innerHTML =
                '<tr><td colspan="9" class="text-center text-muted py-4"><i class="bi bi-arrow-left-right text-muted fs-3 d-block mb-2"></i>Nenhum log de comunicacao ERP encontrado.<br><small>Os logs aparecerao quando houver comunicacao com ERPs configurados.</small></td></tr>';
            document.getElementById('btnMaisERPComm').style.display = 'none';
            return;
        }

        const ctxLabels = {
            teste_conexao: 'Teste',
            sync_clientes: 'Sync',
            consulta_clientes: 'Clientes',
            consulta_contratos: 'Contratos',
            consulta_planos: 'Planos',
            lgpd_consulta_erp: 'LGPD',
            lgpd_consulta_contratos: 'LGPD Contr.',
            lgpd_exportar_dados: 'LGPD Export'
        };

        const html = data
            .map((r) => {
                const statusClass = !r.sucesso
                    ? 'text-bg-danger'
                    : r.response_status >= 400
                      ? 'text-bg-warning'
                      : 'text-bg-success';
                const tempoClass =
                    r.tempo_resposta_ms > 3000
                        ? 'text-danger fw-bold'
                        : r.tempo_resposta_ms > 1000
                          ? 'text-warning'
                          : '';
                const ctxBadge = r.contexto
                    ? `<span class="badge bg-secondary">${esc(ctxLabels[r.contexto] || r.contexto)}</span>`
                    : '-';
                const resultBadge = r.sucesso
                    ? '<span class="badge text-bg-success">OK</span>'
                    : '<span class="badge text-bg-danger">Falha</span>';
                const urlShort = r.url ? r.url.replace(/https?:\/\/[^/]+/, '...') : '-';
                return `<tr class="${!r.sucesso ? 'table-danger' : ''}">
                <td class="small">${formatarDataHora(r.criado_em)}</td>
                <td><span class="badge bg-info text-dark">${esc(r.erp_label || r.erp_tipo)}</span></td>
                <td><span class="badge bg-secondary">${esc(r.metodo)}</span></td>
                <td class="small text-truncate" style="max-width:200px" title="${esc(r.url || '')}">${esc(urlShort)}</td>
                <td><span class="badge ${statusClass}">${r.response_status || '-'}</span></td>
                <td class="${tempoClass}">${r.tempo_resposta_ms || 0}ms</td>
                <td>${ctxBadge}</td>
                <td>${resultBadge}</td>
                <td><button class="btn btn-xs btn-outline-primary" onclick="verDetalheERPComm(${r.id})" title="Ver payload completo"><i class="bi bi-eye"></i></button></td>
            </tr>`;
            })
            .join('');

        if (mais) tbody.innerHTML += html;
        else tbody.innerHTML = html;

        logOffsets.erpComm += data.length;
        document.getElementById('btnMaisERPComm').style.display = data.length >= LOG_LIMIT ? '' : 'none';
    } catch (err) {
        console.error('Erro logs ERP comunicacao:', err);
        mostrarToast('Erro ao carregar logs ERP: ' + err.message, 'error');
    }
}

async function verDetalheERPComm(id) {
    const modal = new bootstrap.Modal(document.getElementById('modalERPCommDetalhe'));
    const body = document.getElementById('modalERPCommBody');
    body.innerHTML =
        '<div class="text-center py-3"><div class="spinner-border spinner-border-sm"></div> Carregando payload...</div>';
    modal.show();

    try {
        const d = await api('/api/logs/erp-comunicacao/' + id);
        let html = '<div class="row g-3">';

        // Info basica
        html += '<div class="col-12"><div class="d-flex gap-3 flex-wrap">';
        html += `<span class="badge bg-info text-dark fs-6">${esc(d.erp_label || d.erp_tipo)}</span>`;
        html += `<span class="badge bg-secondary fs-6">${esc(d.metodo)} ${esc(d.url)}</span>`;
        html += `<span class="badge ${d.sucesso ? 'bg-success' : 'bg-danger'} fs-6">${d.sucesso ? 'Sucesso' : 'Falha'} - ${d.response_status || 'N/A'}</span>`;
        html += `<span class="badge bg-dark fs-6">${d.tempo_resposta_ms}ms</span>`;
        if (d.contexto) html += `<span class="badge bg-warning text-dark fs-6">${esc(d.contexto)}</span>`;
        html += `<span class="text-muted">${formatarDataHora(d.criado_em)}</span>`;
        html += '</div></div>';

        if (d.erro) {
            html += `<div class="col-12"><div class="alert alert-danger mb-0"><strong>Erro:</strong> ${esc(d.erro)}</div></div>`;
        }

        // Request
        html +=
            '<div class="col-md-6"><div class="card"><div class="card-header bg-primary text-white py-1"><strong><i class="bi bi-arrow-up-right me-1"></i>REQUEST (Enviado ao ERP)</strong></div><div class="card-body p-2">';
        html += '<h6 class="small fw-bold mb-1">Headers:</h6>';
        html +=
            '<pre class="bg-dark text-light p-2 rounded small mb-2" style="max-height:200px;overflow:auto">' +
            esc(
                typeof d.request_headers === 'object'
                    ? JSON.stringify(d.request_headers, null, 2)
                    : d.request_headers || 'N/A'
            ) +
            '</pre>';
        html += '<h6 class="small fw-bold mb-1">Body:</h6>';
        html +=
            '<pre class="bg-dark text-light p-2 rounded small" style="max-height:300px;overflow:auto">' +
            esc(formatJsonSafe(d.request_body)) +
            '</pre>';
        html += '</div></div></div>';

        // Response
        html +=
            '<div class="col-md-6"><div class="card"><div class="card-header py-1 ' +
            (d.sucesso ? 'bg-success' : 'bg-danger') +
            ' text-white"><strong><i class="bi bi-arrow-down-left me-1"></i>RESPONSE (Recebido do ERP)</strong></div><div class="card-body p-2">';
        html +=
            '<h6 class="small fw-bold mb-1">Status: <span class="badge ' +
            (d.response_status >= 400 ? 'bg-danger' : 'bg-success') +
            '">' +
            (d.response_status || 'N/A') +
            '</span></h6>';
        html += '<h6 class="small fw-bold mb-1">Headers:</h6>';
        html +=
            '<pre class="bg-dark text-light p-2 rounded small mb-2" style="max-height:200px;overflow:auto">' +
            esc(
                typeof d.response_headers === 'object'
                    ? JSON.stringify(d.response_headers, null, 2)
                    : d.response_headers || 'N/A'
            ) +
            '</pre>';
        html += '<h6 class="small fw-bold mb-1">Body:</h6>';
        html +=
            '<pre class="bg-dark text-light p-2 rounded small" style="max-height:400px;overflow:auto">' +
            esc(formatJsonSafe(d.response_body)) +
            '</pre>';
        html += '</div></div></div>';

        html += '</div>';
        body.innerHTML = html;
    } catch (err) {
        body.innerHTML = '<div class="alert alert-danger">Erro: ' + esc(err.message) + '</div>';
    }
}

function formatJsonSafe(str) {
    if (!str) return 'N/A';
    try {
        return JSON.stringify(JSON.parse(str), null, 2);
    } catch {
        return str;
    }
}

// ========== EXPORTAR CSV ==========

function exportarCSVAtual() {
    const tab = getTabAtiva();
    const mapa = {
        api: { id: 'tabelaLogAPI', nome: 'api_requests' },
        webhooks: { id: 'tabelaLogWebhooks', nome: 'webhooks' },
        erp: { id: 'tabelaLogERP', nome: 'erp_sync' },
        erpComm: { id: 'tabelaLogERPComm', nome: 'erp_comunicacao' },
        integracoes: { id: 'tabelaLogIntegracoes', nome: 'integracoes' },
        ia: { id: 'tabelaLogIA', nome: 'whatsapp_ia' }
    };
    const info = mapa[tab];
    if (!info) return;

    const table = document.getElementById(info.id).closest('table');
    if (!table) return;

    const headers = [];
    table.querySelectorAll('thead th').forEach((th) => headers.push(th.textContent.trim()));

    const rows = [];
    table.querySelectorAll('tbody tr').forEach((tr) => {
        const cells = [];
        tr.querySelectorAll('td').forEach((td) => cells.push('"' + td.textContent.trim().replace(/"/g, '""') + '"'));
        if (cells.length > 1) rows.push(cells.join(';'));
    });

    if (!rows.length) {
        mostrarToast('Nenhum dado para exportar', 'error');
        return;
    }

    const bom = '\uFEFF';
    const csv = bom + headers.join(';') + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs_${info.nome}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    mostrarToast('CSV exportado!', 'success');
}

// ========== UTILS ==========

function formatarDataHora(dt) {
    if (!dt) return '-';
    const d = new Date(dt);
    if (isNaN(d)) return dt;
    return (
        d.toLocaleDateString('pt-BR') +
        ' ' +
        d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    );
}

function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
