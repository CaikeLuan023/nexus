// ==================== DASHBOARD VENDEDOR ====================

let chartPipeline = null;
let chartAtivacoes = null;

document.addEventListener('DOMContentLoaded', () => {
    // Filtro periodo: toggle custom fields
    document.getElementById('dashFiltroPeriodo')?.addEventListener('change', (e) => {
        const isCustom = e.target.value === 'custom';
        document.getElementById('dashFiltroInicio')?.classList.toggle('d-none', !isCustom);
        document.getElementById('dashFiltroFim')?.classList.toggle('d-none', !isCustom);
    });
    carregarDashboard();
    carregarRanking();
    carregarComissoesHistorico();
});

function getPeriodoFiltro() {
    const sel = document.getElementById('dashFiltroPeriodo')?.value || 'este_mes';
    const hoje = new Date();
    let inicio, fim;
    if (sel === 'este_mes') {
        inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().substring(0, 10);
        fim = hoje.toISOString().substring(0, 10);
    } else if (sel === 'mes_anterior') {
        inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1).toISOString().substring(0, 10);
        fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0).toISOString().substring(0, 10);
    } else if (sel === '3_meses') {
        inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1).toISOString().substring(0, 10);
        fim = hoje.toISOString().substring(0, 10);
    } else {
        inicio = document.getElementById('dashFiltroInicio')?.value || '';
        fim = document.getElementById('dashFiltroFim')?.value || '';
    }
    return { inicio, fim };
}

function aplicarFiltroPeriodo() {
    carregarDashboard();
    carregarRanking();
}

async function carregarDashboard() {
    try {
        const { inicio, fim } = getPeriodoFiltro();
        let url = '/api/vendas/dashboard-vendedor';
        if (inicio || fim) url += `?inicio=${inicio}&fim=${fim}`;
        const data = await api(url);
        renderStats(data.stats);
        renderPipelineChart(data.negocios_por_estagio);
        renderAtivacoesMesChart(data.ativacoes_por_mes);
        renderValorPipeline(data.valor_pipeline);
        renderMetas(data.metas);
        renderProximasTarefas(data.proximas_tarefas);
        renderProdutividade(data);
        renderPerformance(data.performance, data.stats);
        renderNegociosParados(data.performance?.negocios_parados);

        // Periodo label
        const hoje = new Date();
        document.getElementById('dashPeriodo').textContent =
            hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    } catch (err) {
        console.error('Erro ao carregar dashboard:', err);
        mostrarToast('Erro ao carregar dashboard: ' + err.message, 'error');
    }
}

function renderStats(stats) {
    document.getElementById('statNegociosAtivos').textContent = stats.negocios_ativos || 0;
    document.getElementById('statAtivacoesMes').textContent = stats.ativacoes_mes || 0;
    document.getElementById('statTarefasPendentes').textContent = stats.tarefas_pendentes || 0;

    const taxa = stats.taxa_conversao || 0;
    document.getElementById('statTaxaConversao').textContent = taxa.toFixed(1) + '%';
}

function renderPipelineChart(dados) {
    const ctx = document.getElementById('chartPipelineEstagio');
    if (!ctx) return;

    const labels = [];
    const values = [];
    const colors = [];

    const estagioConfig = {
        lead: { label: 'Lead', cor: '#6c757d' },
        contato: { label: 'Contato', cor: '#0dcaf0' },
        proposta: { label: 'Proposta', cor: '#0d6efd' },
        negociacao: { label: 'Negociação', cor: '#ffc107' },
        ativado: { label: 'Ativado', cor: '#198754' },
        perdido: { label: 'Perdido', cor: '#dc3545' }
    };

    for (const [key, config] of Object.entries(estagioConfig)) {
        const item = dados.find(d => d.estagio === key);
        labels.push(config.label);
        values.push(item ? item.total : 0);
        colors.push(config.cor);
    }

    if (chartPipeline) chartPipeline.destroy();

    chartPipeline = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim() || '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#333',
                        padding: 12,
                        usePointStyle: true,
                        pointStyleWidth: 12
                    }
                }
            }
        }
    });
}

function renderAtivacoesMesChart(dados) {
    const ctx = document.getElementById('chartAtivacoesMes');
    if (!ctx) return;

    const labels = dados.map(d => {
        const [ano, mes] = d.mes.split('-');
        return new Date(ano, mes - 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
    });
    const values = dados.map(d => d.total);

    if (chartAtivacoes) chartAtivacoes.destroy();

    chartAtivacoes = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Ativações',
                data: values,
                borderColor: '#198754',
                backgroundColor: 'rgba(25, 135, 84, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 5,
                pointBackgroundColor: '#198754',
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#666'
                    },
                    grid: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim() || '#e9ecef'
                    }
                },
                x: {
                    ticks: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#666'
                    },
                    grid: { display: false }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function renderValorPipeline(valor) {
    document.getElementById('valorPipeline').textContent =
        'R$ ' + Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderMetas(metas) {
    const container = document.getElementById('dashMetasContainer');
    if (!metas || !metas.length) {
        container.innerHTML = '<div class="text-center text-muted py-3">Nenhuma meta definida para este mês</div>';
        return;
    }

    const TIPO_META_LABELS = {
        quantidade_ativacoes: 'Qtd. Ativações',
        quantidade_upsells: 'Qtd. Upsells',
        valor_contratos: 'Valor Contratos'
    };

    container.innerHTML = metas.map(m => {
        const pct = Math.min(m.percentual_atingido || 0, 100);
        const corBarra = pct >= 100 ? 'bg-success' : pct >= 50 ? 'bg-primary' : 'bg-warning';
        const isValor = m.tipo_meta === 'valor_contratos';
        const alvo = isValor ? formatarMoeda(m.valor_alvo) : m.valor_alvo;
        const atingido = isValor ? formatarMoeda(m.valor_atingido || 0) : (m.valor_atingido || 0);

        return `
            <div class="mb-3">
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <strong>${TIPO_META_LABELS[m.tipo_meta] || m.tipo_meta}</strong>
                    <span>${atingido} / ${alvo}</span>
                </div>
                <div class="progress" style="height:22px">
                    <div class="progress-bar ${corBarra}" style="width:${pct}%">${pct.toFixed(0)}%</div>
                </div>
                ${m.comissao_calculada ? `<small class="text-muted">Comissão estimada: ${formatarMoeda(m.comissao_calculada)}</small>` : ''}
            </div>
        `;
    }).join('');
}

function renderProximasTarefas(tarefas) {
    const container = document.getElementById('dashTarefasContainer');
    if (!tarefas || !tarefas.length) {
        container.innerHTML = '<div class="text-center text-muted py-3">Nenhuma tarefa pendente</div>';
        return;
    }

    const TIPO_LABELS = {
        follow_up: { cor: 'primary', icon: 'bi-arrow-repeat' },
        ligacao: { cor: 'info', icon: 'bi-telephone' },
        reuniao: { cor: 'warning', icon: 'bi-people' },
        email: { cor: 'secondary', icon: 'bi-envelope' },
        whatsapp: { cor: 'success', icon: 'bi-whatsapp' }
    };

    const agora = new Date();

    container.innerHTML = `
        <div class="list-group list-group-flush">
            ${tarefas.map(t => {
                const tipo = TIPO_LABELS[t.tipo] || { cor: 'secondary', icon: 'bi-circle' };
                const dataHora = t.data_hora ? new Date(t.data_hora.replace(' ', 'T')) : null;
                const atrasada = dataHora && dataHora < agora;

                return `
                    <div class="list-group-item d-flex align-items-center gap-3 px-0 ${atrasada ? 'border-start border-danger border-3' : ''}">
                        <span class="badge bg-${tipo.cor}"><i class="bi ${tipo.icon}"></i></span>
                        <div class="flex-grow-1">
                            <strong>${escapeHtml(t.titulo)}</strong>
                            ${atrasada ? '<span class="badge bg-danger ms-1">Atrasada</span>' : ''}
                            <br>
                            <small class="text-muted">${dataHora ? formatarDataHora(t.data_hora) : '-'}</small>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function formatarMoeda(valor) {
    return 'R$ ' + Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ==================== RANKING ====================

async function carregarRanking() {
    try {
        const periodo = new Date().toISOString().substring(0, 7);
        const vendedores = await api('/api/vendas/ranking?periodo=' + periodo);
        const container = document.getElementById('dashRankingContainer');
        if (!vendedores.length) {
            container.innerHTML = '<div class="text-center text-muted py-3">Sem dados</div>';
            return;
        }
        container.innerHTML = vendedores.map((v, i) => {
            let badge = '';
            if (v.percentual_meta >= 100) badge = '<span class="badge bg-warning text-dark">Ouro</span>';
            else if (v.percentual_meta >= 70) badge = '<span class="badge bg-secondary">Prata</span>';
            else if (v.percentual_meta >= 50) badge = '<span class="badge" style="background:#cd7f32;color:#fff">Bronze</span>';

            const medal = i === 0 ? '<i class="bi bi-trophy-fill text-warning fs-5"></i>' :
                          i === 1 ? '<i class="bi bi-trophy-fill text-secondary fs-5"></i>' :
                          i === 2 ? '<i class="bi bi-trophy-fill fs-5" style="color:#cd7f32"></i>' :
                          `<span class="badge bg-light text-dark">${i + 1}</span>`;

            const foto = v.foto_url ? `<img src="${v.foto_url}" class="rounded-circle" width="32" height="32" style="object-fit:cover">` :
                `<div class="rounded-circle bg-primary bg-opacity-10 text-primary d-flex align-items-center justify-content-center" style="width:32px;height:32px;font-size:.75rem;font-weight:700">${(v.nome || '?')[0].toUpperCase()}</div>`;

            return `
                <div class="d-flex align-items-center gap-2 mb-2 p-2 rounded ranking-item" style="background:var(--bg-body,#f8f9fa)">
                    <div style="width:30px;text-align:center">${medal}</div>
                    ${foto}
                    <div class="flex-grow-1">
                        <strong>${escapeHtml(v.nome)}</strong> ${badge}
                        <small class="text-muted d-block">${v.ativacoes_mes || 0} ativacoes${v.meta_ativacoes ? ` / ${v.meta_ativacoes} meta` : ''}</small>
                    </div>
                    <span class="fw-bold text-success">${formatarMoeda(v.valor_pipeline || 0)}</span>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error('Erro ranking:', err);
    }
}

// ==================== PRODUTIVIDADE ====================

function renderProdutividade(data) {
    const container = document.getElementById('dashProdutividadeContainer');
    if (!container) return;
    const stats = data.stats || {};
    const tarefas = data.proximas_tarefas || [];
    const tarefasHoje = tarefas.filter(t => {
        if (!t.data_hora) return false;
        const d = new Date(t.data_hora.replace(' ', 'T'));
        const hoje = new Date();
        return d.toDateString() === hoje.toDateString();
    });

    container.innerHTML = `
        <div class="row g-2 text-center mb-3">
            <div class="col-4">
                <div class="p-2 rounded" style="background:var(--bg-body,#f8f9fa)">
                    <h4 class="mb-0 text-primary">${stats.negocios_ativos || 0}</h4>
                    <small class="text-muted">Negocios</small>
                </div>
            </div>
            <div class="col-4">
                <div class="p-2 rounded" style="background:var(--bg-body,#f8f9fa)">
                    <h4 class="mb-0 text-success">${stats.ativacoes_mes || 0}</h4>
                    <small class="text-muted">Ativacoes</small>
                </div>
            </div>
            <div class="col-4">
                <div class="p-2 rounded" style="background:var(--bg-body,#f8f9fa)">
                    <h4 class="mb-0 text-warning">${stats.tarefas_pendentes || 0}</h4>
                    <small class="text-muted">Pendentes</small>
                </div>
            </div>
        </div>
        <h6 class="mb-2"><i class="bi bi-list-check me-1"></i>Tarefas de Hoje (${tarefasHoje.length})</h6>
        ${tarefasHoje.length ? tarefasHoje.map(t => `
            <div class="d-flex align-items-center gap-2 mb-1">
                <i class="bi bi-circle text-muted" style="font-size:.5rem"></i>
                <small>${escapeHtml(t.titulo)}</small>
                <small class="text-muted ms-auto">${t.data_hora ? formatarDataHora(t.data_hora).split(' ')[1] : ''}</small>
            </div>
        `).join('') : '<small class="text-muted">Nenhuma tarefa para hoje</small>'}
    `;
}

// ==================== PERFORMANCE VS EQUIPE ====================

function renderPerformance(perf, stats) {
    const container = document.getElementById('dashPerformanceContainer');
    if (!container || !perf) { if (container) container.innerHTML = '<div class="text-center text-muted py-3">Sem dados</div>'; return; }

    const ativacoes = stats.ativacoes_mes || 0;
    const mediaAtiv = perf.media_equipe_ativacoes || 0;
    const diffAtiv = mediaAtiv > 0 ? Math.round(((ativacoes - mediaAtiv) / mediaAtiv) * 100) : 0;
    const diffIcon = diffAtiv >= 0 ? 'bi-arrow-up-short text-success' : 'bi-arrow-down-short text-danger';

    container.innerHTML = `
        <div class="mb-2">
            <div class="d-flex justify-content-between align-items-center">
                <small class="text-muted">Ativacoes vs Equipe</small>
                <span class="fw-bold"><i class="bi ${diffIcon}"></i>${Math.abs(diffAtiv)}%</span>
            </div>
            <div class="progress" style="height:6px">
                <div class="progress-bar ${diffAtiv >= 0 ? 'bg-success' : 'bg-danger'}" style="width:${Math.min(Math.abs(diffAtiv) + 50, 100)}%"></div>
            </div>
        </div>
        <div class="mb-2">
            <div class="d-flex justify-content-between">
                <small class="text-muted">Tempo medio fechamento</small>
                <span class="fw-bold">${perf.tempo_medio_fechamento || 0} dias</span>
            </div>
        </div>
        <div class="mb-2">
            <div class="d-flex justify-content-between">
                <small class="text-muted">Perdidos no mes</small>
                <span class="fw-bold text-danger">${perf.perdidos_mes || 0}</span>
            </div>
        </div>
        <div>
            <div class="d-flex justify-content-between">
                <small class="text-muted">Negocios parados</small>
                <span class="fw-bold text-warning">${(perf.negocios_parados || []).length}</span>
            </div>
        </div>
    `;
}

function renderNegociosParados(parados) {
    const row = document.getElementById('rowNegociosParados');
    const container = document.getElementById('dashNegociosParadosContainer');
    if (!row || !container) return;
    if (!parados || !parados.length) { row.style.display = 'none'; return; }
    row.style.display = '';

    container.innerHTML = `
        <div class="table-responsive">
            <table class="table table-sm mb-0">
                <thead><tr><th>Negocio</th><th>Estagio</th><th>Dias Parado</th><th>Valor</th><th>Acao</th></tr></thead>
                <tbody>
                    ${parados.map(n => {
                        const nome = escapeHtml(n.provedor_nome_lead || n.provedor_nome || 'Lead #' + n.id);
                        const diasCor = n.dias_parado > 14 ? 'text-danger' : n.dias_parado > 7 ? 'text-warning' : '';
                        return `
                            <tr>
                                <td><strong>${nome}</strong></td>
                                <td><span class="badge bg-secondary">${n.estagio}</span></td>
                                <td class="${diasCor} fw-bold">${n.dias_parado} dias</td>
                                <td>${formatarMoeda(n.valor_estimado || 0)}</td>
                                <td><a href="/vendas" class="btn btn-sm btn-outline-primary"><i class="bi bi-arrow-right"></i></a></td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// ==================== HISTORICO COMISSOES ====================

async function carregarComissoesHistorico() {
    try {
        const comissoes = await api('/api/vendas/comissoes');
        const container = document.getElementById('dashComissoesContainer');
        if (!container) return;
        if (!comissoes.length) {
            container.innerHTML = '<div class="text-center text-muted py-3">Nenhuma comissao registrada</div>';
            return;
        }

        // Agrupar por periodo
        const porPeriodo = {};
        comissoes.forEach(c => {
            const p = c.periodo || 'Sem periodo';
            if (!porPeriodo[p]) porPeriodo[p] = { total: 0, itens: 0, paga: 0 };
            porPeriodo[p].total += (c.valor_comissao || 0);
            porPeriodo[p].itens++;
            if (c.status === 'paga') porPeriodo[p].paga += (c.valor_comissao || 0);
        });

        const totalGeral = comissoes.reduce((s, c) => s + (c.valor_comissao || 0), 0);

        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-sm mb-2">
                    <thead><tr><th>Periodo</th><th>Qtd</th><th>Valor</th><th>Status</th></tr></thead>
                    <tbody>
                        ${Object.entries(porPeriodo).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6).map(([p, d]) => `
                            <tr>
                                <td>${p}</td>
                                <td>${d.itens}</td>
                                <td>${formatarMoeda(d.total)}</td>
                                <td>${d.paga >= d.total ? '<span class="badge bg-success">Paga</span>' : '<span class="badge bg-warning text-dark">Pendente</span>'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="text-end fw-bold">Total acumulado: <span class="text-success">${formatarMoeda(totalGeral)}</span></div>
        `;
    } catch (err) {
        console.error('Erro comissoes:', err);
    }
}
