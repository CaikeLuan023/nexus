// ==================== RELATORIOS ====================

let _charts = {};

document.addEventListener('DOMContentLoaded', () => {
    carregarProvedores(document.getElementById('relProvedor'));
    // Definir periodo padrao: ultimo mes
    const hoje = new Date();
    const mesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, hoje.getDate());
    document.getElementById('relDataInicio').value = mesPassado.toISOString().split('T')[0];
    document.getElementById('relDataFim').value = hoje.toISOString().split('T')[0];
    gerarRelatorio();
});

function getFilters() {
    return {
        data_inicio: document.getElementById('relDataInicio').value,
        data_fim: document.getElementById('relDataFim').value,
        provedor_id: document.getElementById('relProvedor').value
    };
}

function buildParams(filters) {
    const p = new URLSearchParams();
    if (filters.data_inicio) p.set('data_inicio', filters.data_inicio);
    if (filters.data_fim) p.set('data_fim', filters.data_fim);
    if (filters.provedor_id) p.set('provedor_id', filters.provedor_id);
    return p.toString();
}

async function gerarRelatorio() {
    const filters = getFilters();
    const params = buildParams(filters);
    await Promise.all([
        gerarRelatorioChamados(params),
        gerarRelatorioVendas(params),
        gerarRelatorioTreinamentos(params),
        gerarRelatorioProvedores()
    ]);
}

async function gerarRelatorioChamados(params) {
    try {
        const d = await api(`/api/relatorios/chamados?${params}`);
        document.getElementById('relChamTotal').textContent = d.total;
        document.getElementById('relChamResolvidos').textContent = d.resolvidos;
        document.getElementById('relChamPendentes').textContent = d.pendentes;
        document.getElementById('relChamTempoMedio').textContent = d.tempo_medio_dias;

        // Tabela
        const tbody = document.getElementById('relChamTabela');
        if (d.chamados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3">Nenhum registro</td></tr>';
        } else {
            tbody.innerHTML = d.chamados
                .slice(0, 100)
                .map(
                    (c) => `
                <tr>
                    <td>${c.id}</td>
                    <td>${c.provedor_nome}</td>
                    <td>${c.titulo}</td>
                    <td>${c.categoria}</td>
                    <td>${c.prioridade || 'normal'}</td>
                    <td>${c.status}</td>
                    <td><small>${c.data_abertura || '-'}</small></td>
                    <td><small>${c.data_resolucao || '-'}</small></td>
                </tr>
            `
                )
                .join('');
        }

        // Chart Categoria
        createChart(
            'chartChamCategoria',
            'doughnut',
            {
                labels: Object.keys(d.por_categoria),
                datasets: [
                    {
                        data: Object.values(d.por_categoria),
                        backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#C9CBCF']
                    }
                ]
            },
            'Chamados por Categoria'
        );

        // Chart Mensal
        const meses = Object.keys(d.por_mes).sort();
        createChart(
            'chartChamMensal',
            'bar',
            {
                labels: meses,
                datasets: [{ label: 'Chamados', data: meses.map((m) => d.por_mes[m]), backgroundColor: '#36A2EB' }]
            },
            'Chamados por Mes'
        );
    } catch (err) {
        console.error('Rel chamados:', err);
    }
}

async function gerarRelatorioVendas(params) {
    try {
        const d = await api(`/api/relatorios/vendas?${params}`);
        document.getElementById('relVendasTotal').textContent = d.total;
        document.getElementById('relVendasAtivados').textContent = d.ativados;
        document.getElementById('relVendasPipeline').textContent = d.pipeline;
        document.getElementById('relVendasValor').textContent =
            'R$ ' + (d.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

        const tbody = document.getElementById('relVendasTabela');
        if (d.negocios.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">Nenhum registro</td></tr>';
        } else {
            tbody.innerHTML = d.negocios
                .slice(0, 100)
                .map(
                    (n) => `
                <tr>
                    <td>${n.id}</td>
                    <td>${n.provedor_nome_lead || '-'}</td>
                    <td>${n.estagio}</td>
                    <td>${n.responsavel_vendedor}</td>
                    <td>R$ ${(n.valor_estimado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td><small>${n.criado_em || '-'}</small></td>
                </tr>
            `
                )
                .join('');
        }

        createChart(
            'chartVendasFunil',
            'bar',
            {
                labels: Object.keys(d.por_estagio),
                datasets: [
                    {
                        label: 'Negocios',
                        data: Object.values(d.por_estagio),
                        backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40']
                    }
                ]
            },
            'Funil de Vendas'
        );
    } catch (err) {
        console.error('Rel vendas:', err);
    }
}

async function gerarRelatorioTreinamentos(params) {
    try {
        const d = await api(`/api/relatorios/treinamentos?${params}`);
        document.getElementById('relTreinTotal').textContent = d.total;
        document.getElementById('relTreinRealizados').textContent = d.realizados;
        document.getElementById('relTreinAgendados').textContent = d.agendados;

        const tbody = document.getElementById('relTreinTabela');
        if (d.treinamentos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Nenhum registro</td></tr>';
        } else {
            tbody.innerHTML = d.treinamentos
                .slice(0, 100)
                .map(
                    (t) => `
                <tr>
                    <td>${t.id}</td>
                    <td>${t.provedor_nome}</td>
                    <td>${t.titulo}</td>
                    <td><small>${t.data_treinamento}</small></td>
                    <td>${t.status}</td>
                </tr>
            `
                )
                .join('');
        }
    } catch (err) {
        console.error('Rel treinamentos:', err);
    }
}

async function gerarRelatorioProvedores() {
    try {
        const d = await api('/api/relatorios/provedores');
        document.getElementById('relProvTotal').textContent = d.total;

        const tbody = document.getElementById('relProvTabela');
        if (d.provedores.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">Nenhum registro</td></tr>';
        } else {
            tbody.innerHTML = d.provedores
                .map(
                    (p) => `
                <tr>
                    <td>${p.id}</td>
                    <td>${p.nome}</td>
                    <td>${p.erp || '-'}</td>
                    <td>${p.plano || '-'}</td>
                    <td>${p.total_chamados}</td>
                    <td>${p.total_treinamentos}</td>
                </tr>
            `
                )
                .join('');
        }

        createChart(
            'chartProvERP',
            'pie',
            {
                labels: Object.keys(d.por_erp),
                datasets: [
                    {
                        data: Object.values(d.por_erp),
                        backgroundColor: [
                            '#FF6384',
                            '#36A2EB',
                            '#FFCE56',
                            '#4BC0C0',
                            '#9966FF',
                            '#FF9F40',
                            '#C9CBCF',
                            '#66BB6A'
                        ]
                    }
                ]
            },
            'Por ERP'
        );

        createChart(
            'chartProvPlano',
            'pie',
            {
                labels: Object.keys(d.por_plano),
                datasets: [
                    {
                        data: Object.values(d.por_plano),
                        backgroundColor: ['#4BC0C0', '#FF9F40', '#9966FF', '#FF6384', '#36A2EB', '#FFCE56']
                    }
                ]
            },
            'Por Plano'
        );
    } catch (err) {
        console.error('Rel provedores:', err);
    }
}

function createChart(canvasId, type, data, title) {
    if (_charts[canvasId]) _charts[canvasId].destroy();
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    _charts[canvasId] = new Chart(ctx, {
        type,
        data,
        options: {
            responsive: true,
            plugins: { title: { display: true, text: title }, legend: { position: type === 'bar' ? 'top' : 'right' } },
            scales: type === 'bar' ? { y: { beginAtZero: true } } : {}
        }
    });
}

function exportarPDF() {
    const activeTab = document.querySelector('.tab-content .tab-pane.active');
    const tipo = activeTab?.id?.replace('tabRel', '').toLowerCase() || 'chamados';
    const params = buildParams(getFilters());
    window.open(`/api/relatorios/${tipo}/pdf?${params}`, '_blank');
}

function exportarCSV() {
    const activeTab = document.querySelector('.tab-content .tab-pane.active');
    const tipo = activeTab?.id?.replace('tabRel', '').toLowerCase() || 'chamados';
    const params = buildParams(getFilters());
    window.open(`/api/relatorios/${tipo}/csv?${params}`, '_blank');
}
