// ==================== DASHBOARD ====================
// Constantes carregadas de DashboardUtils (dashboard-utils.js)

const CORES = DashboardUtils.CORES;
const CORES_CATEGORIA = DashboardUtils.CORES_CATEGORIA;
const LABELS_MODELO = DashboardUtils.LABELS_MODELO;
const LABELS_ERP = DashboardUtils.LABELS_ERP;
const LABELS_PLANO = DashboardUtils.LABELS_PLANO;
const LABELS_STATUS_TREIN = DashboardUtils.LABELS_STATUS_TREIN;
const LABELS_STATUS_PROJ = DashboardUtils.LABELS_STATUS_PROJ;
const CORES_STATUS_TREIN = DashboardUtils.CORES_STATUS_TREIN;
const CORES_STATUS_PROJ = DashboardUtils.CORES_STATUS_PROJ;

// Dados armazenados para exportação
let dashData = {};

document.addEventListener('DOMContentLoaded', async () => {
    await carregarWidgetLayout();
    carregarDashboard();
});

async function carregarDashboard() {
    try {
        const [
            resumo,
            porProvedor,
            porCategoria,
            porMes,
            recentes,
            abertosProvedor,
            porResponsavel,
            porModelo,
            porERP,
            porPlano,
            treinPorStatus,
            treinPorMes,
            projPorStatus,
            projPorPrioridade
        ] = await Promise.all([
            api('/api/dashboard/resumo'),
            api('/api/dashboard/chamados-por-provedor'),
            api('/api/dashboard/chamados-por-categoria'),
            api('/api/dashboard/chamados-por-mes'),
            api('/api/dashboard/chamados-recentes'),
            api('/api/dashboard/chamados-abertos-por-provedor'),
            api('/api/dashboard/provedores-por-responsavel'),
            api('/api/dashboard/provedores-por-modelo'),
            api('/api/dashboard/provedores-por-erp'),
            api('/api/dashboard/provedores-por-plano'),
            api('/api/dashboard/treinamentos-por-status'),
            api('/api/dashboard/treinamentos-por-mes'),
            api('/api/dashboard/projetos-por-status'),
            api('/api/dashboard/projetos-por-prioridade')
        ]);

        // Armazenar para exportação
        dashData = {
            resumo,
            porProvedor,
            porCategoria,
            porMes,
            recentes,
            abertosProvedor,
            porResponsavel,
            porModelo,
            porERP,
            porPlano,
            treinPorStatus,
            treinPorMes,
            projPorStatus,
            projPorPrioridade
        };

        // === Cards resumo ===
        document.getElementById('totalProvedores').textContent = resumo.total_provedores || 0;
        document.getElementById('totalChamados').textContent = resumo.total_chamados || 0;
        document.getElementById('pendentes').textContent = resumo.pendentes || 0;
        document.getElementById('resolvidos').textContent = resumo.resolvidos || 0;
        document.getElementById('totalTreinamentos').textContent = resumo.total_treinamentos || 0;
        document.getElementById('projetosAtivos').textContent = resumo.projetos_ativos || 0;

        // === Provedores por Responsável ===
        renderDoughnut(
            'chartResponsavel',
            porResponsavel,
            (r) => r.responsavel,
            (r) => r.total
        );

        // === Provedores por Modelo ===
        renderDoughnut(
            'chartModelo',
            porModelo,
            (r) => LABELS_MODELO[r.modelo] || r.modelo,
            (r) => r.total
        );

        // === Provedores por ERP ===
        renderBar(
            'chartERP',
            porERP,
            (r) => LABELS_ERP[r.erp] || r.erp,
            (r) => r.total,
            'Provedores'
        );

        // === Provedores por Plano ===
        renderDoughnut(
            'chartPlano',
            porPlano,
            (r) => LABELS_PLANO[r.plano] || r.plano,
            (r) => r.total
        );

        // === Treinamentos por Status ===
        if (treinPorStatus.length > 0) {
            new Chart(document.getElementById('chartTreinStatus'), {
                type: 'doughnut',
                data: {
                    labels: treinPorStatus.map((r) => LABELS_STATUS_TREIN[r.status] || r.status),
                    datasets: [
                        {
                            data: treinPorStatus.map((r) => r.total),
                            backgroundColor: treinPorStatus.map((r) => CORES_STATUS_TREIN[r.status] || '#a0a0a0'),
                            borderWidth: 2,
                            hoverOffset: 8
                        }
                    ]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 } } } }
                }
            });
        } else {
            document.getElementById('chartTreinStatus').style.display = 'none';
        }

        // === Treinamentos por Mês ===
        if (treinPorMes.length > 0) {
            const mesesTrein = treinPorMes.map((r) => {
                const [ano, mes] = r.mes.split('-');
                return new Date(ano, mes - 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
            });
            new Chart(document.getElementById('chartTreinMes'), {
                type: 'bar',
                data: {
                    labels: mesesTrein,
                    datasets: [
                        {
                            label: 'Treinamentos',
                            data: treinPorMes.map((r) => r.total),
                            backgroundColor: '#7209b7',
                            borderRadius: 6,
                            maxBarThickness: 40
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
                }
            });
        } else {
            document.getElementById('chartTreinMes').style.display = 'none';
        }

        // === Chamados por Provedor ===
        if (porProvedor.length > 0) {
            document.getElementById('emptyChartProvedor').style.display = 'none';
            new Chart(document.getElementById('chartProvedor'), {
                type: 'bar',
                data: {
                    labels: porProvedor.map((r) => r.nome),
                    datasets: [
                        {
                            label: 'Chamados',
                            data: porProvedor.map((r) => r.total),
                            backgroundColor: porProvedor.map((_, i) => CORES[i % CORES.length]),
                            borderRadius: 6,
                            maxBarThickness: 50
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, ticks: { stepSize: 1 } },
                        x: { ticks: { maxRotation: 45, minRotation: 0, font: { size: 11 } } }
                    }
                }
            });
        } else {
            document.getElementById('chartProvedor').style.display = 'none';
            document.getElementById('emptyChartProvedor').style.display = '';
        }

        // === Chamados por Categoria ===
        if (porCategoria.length > 0) {
            document.getElementById('emptyChartCategoria').style.display = 'none';
            new Chart(document.getElementById('chartCategoria'), {
                type: 'doughnut',
                data: {
                    labels: porCategoria.map((r) => labelCategoria(r.categoria)),
                    datasets: [
                        {
                            data: porCategoria.map((r) => r.total),
                            backgroundColor: porCategoria.map((r) => CORES_CATEGORIA[r.categoria] || '#a0a0a0'),
                            borderWidth: 2,
                            hoverOffset: 8
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom', labels: { padding: 15, font: { size: 12 } } } }
                }
            });
        } else {
            document.getElementById('chartCategoria').style.display = 'none';
            document.getElementById('emptyChartCategoria').style.display = '';
        }

        // === Chamados por Mês ===
        if (porMes.length > 0) {
            document.getElementById('emptyChartMes').style.display = 'none';
            const meses = porMes.map((r) => {
                const [ano, mes] = r.mes.split('-');
                return new Date(ano, mes - 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
            });
            new Chart(document.getElementById('chartMes'), {
                type: 'line',
                data: {
                    labels: meses,
                    datasets: [
                        {
                            label: 'Chamados',
                            data: porMes.map((r) => r.total),
                            borderColor: '#f59e0b',
                            backgroundColor: 'rgba(245, 158, 11, 0.1)',
                            fill: true,
                            tension: 0.4,
                            pointRadius: 4,
                            pointHoverRadius: 6
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
                }
            });
        } else {
            document.getElementById('chartMes').style.display = 'none';
            document.getElementById('emptyChartMes').style.display = '';
        }

        // === Projetos por Status ===
        if (projPorStatus.length > 0) {
            document.getElementById('emptyChartProjStatus').style.display = 'none';
            new Chart(document.getElementById('chartProjStatus'), {
                type: 'doughnut',
                data: {
                    labels: projPorStatus.map((r) => LABELS_STATUS_PROJ[r.status] || r.status),
                    datasets: [
                        {
                            data: projPorStatus.map((r) => r.total),
                            backgroundColor: projPorStatus.map((r) => CORES_STATUS_PROJ[r.status] || '#a0a0a0'),
                            borderWidth: 2,
                            hoverOffset: 8
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 } } } }
                }
            });
        } else {
            document.getElementById('chartProjStatus').style.display = 'none';
            document.getElementById('emptyChartProjStatus').style.display = '';
        }

        // Tabela de chamados recentes
        renderRecentes(recentes);

        // Tabela de chamados abertos por provedor
        renderAbertosProvedor(abertosProvedor);

        // Analytics & Tendencias
        carregarAnalytics();
    } catch (err) {
        mostrarToast('Erro ao carregar dashboard: ' + err.message, 'error');
    }
}

// === Helpers de gráficos reutilizáveis ===

function renderDoughnut(canvasId, data, labelFn, valueFn) {
    if (!data || data.length === 0) return;
    new Chart(document.getElementById(canvasId), {
        type: 'doughnut',
        data: {
            labels: data.map(labelFn),
            datasets: [
                {
                    data: data.map(valueFn),
                    backgroundColor: data.map((_, i) => CORES[i % CORES.length]),
                    borderWidth: 2,
                    hoverOffset: 8
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { padding: 12, font: { size: 11 } } } }
        }
    });
}

function renderBar(canvasId, data, labelFn, valueFn, datasetLabel) {
    if (!data || data.length === 0) return;
    new Chart(document.getElementById(canvasId), {
        type: 'bar',
        data: {
            labels: data.map(labelFn),
            datasets: [
                {
                    label: datasetLabel,
                    data: data.map(valueFn),
                    backgroundColor: data.map((_, i) => CORES[i % CORES.length]),
                    borderRadius: 6,
                    maxBarThickness: 40
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });
}

function renderRecentes(chamados) {
    const tbody = document.getElementById('tabelaRecentes');
    if (chamados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">Nenhum chamado registrado</td></tr>';
        return;
    }

    tbody.innerHTML = chamados
        .map(
            (c) => `
        <tr>
            <td class="text-muted">${c.id}</td>
            <td class="fw-medium">${c.provedor_nome}</td>
            <td>${c.titulo}</td>
            <td>${badgeCategoria(c.categoria)}</td>
            <td>${badgeStatus(c.status)}</td>
            <td><small>${formatarData(c.data_abertura)}</small></td>
        </tr>
    `
        )
        .join('');
}

function renderAbertosProvedor(dados) {
    const container = document.getElementById('tabelaAbertosProvedor');

    if (dados.length === 0) {
        container.innerHTML =
            '<div class="text-center text-muted py-3"><i class="bi bi-check-circle me-1"></i>Nenhum chamado aberto</div>';
        return;
    }

    const porProvedor = {};
    dados.forEach((d) => {
        if (!porProvedor[d.nome]) porProvedor[d.nome] = [];
        porProvedor[d.nome].push(d);
    });

    let html = '<div class="list-group list-group-flush">';
    for (const [nome, categorias] of Object.entries(porProvedor)) {
        const totalProv = categorias.reduce((sum, c) => sum + c.total, 0);
        const badges = categorias
            .map((c) => `${badgeCategoria(c.categoria)} <small class="text-muted">${c.total}</small>`)
            .join(' ');

        html += `
            <div class="list-group-item px-2 py-2">
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <span class="fw-medium">${nome}</span>
                    <span class="badge bg-danger rounded-pill">${totalProv}</span>
                </div>
                <div class="d-flex flex-wrap gap-1">${badges}</div>
            </div>
        `;
    }
    html += '</div>';
    container.innerHTML = html;
}

// ==================== EXPORTAÇÃO DASHBOARD ====================

const LABELS_STATUS = {
    pendente: 'Pendente',
    em_andamento: 'Em Andamento',
    resolvido: 'Resolvido',
    fechado: 'Fechado',
    concluido: 'Concluído',
    pausado: 'Pausado',
    cancelado: 'Cancelado'
};

function getDashboardAbas() {
    const d = dashData;
    if (!d.resumo) return [];

    const abas = [];

    // Aba 1: Resumo Geral
    abas.push({
        nome: 'Resumo',
        colunas: [
            { label: 'Métrica', key: 'metrica' },
            { label: 'Valor', key: 'valor' }
        ],
        dados: [
            { metrica: 'Total de Provedores', valor: d.resumo.total_provedores || 0 },
            { metrica: 'Total de Chamados', valor: d.resumo.total_chamados || 0 },
            { metrica: 'Chamados Pendentes', valor: d.resumo.pendentes || 0 },
            { metrica: 'Chamados Resolvidos', valor: d.resumo.resolvidos || 0 },
            { metrica: 'Total de Treinamentos', valor: d.resumo.total_treinamentos || 0 },
            { metrica: 'Projetos Ativos', valor: d.resumo.projetos_ativos || 0 }
        ]
    });

    // Aba 2: Provedores por Responsável
    if (d.porResponsavel && d.porResponsavel.length > 0) {
        abas.push({
            nome: 'Provedores por Responsavel',
            colunas: [
                { label: 'Responsável', key: 'responsavel' },
                { label: 'Total', key: 'total' }
            ],
            dados: d.porResponsavel
        });
    }

    // Aba 3: Provedores por Modelo
    if (d.porModelo && d.porModelo.length > 0) {
        abas.push({
            nome: 'Provedores por Modelo',
            colunas: [
                { label: 'Modelo', value: (r) => LABELS_MODELO[r.modelo] || r.modelo },
                { label: 'Total', key: 'total' }
            ],
            dados: d.porModelo
        });
    }

    // Aba 4: Provedores por ERP
    if (d.porERP && d.porERP.length > 0) {
        abas.push({
            nome: 'Provedores por ERP',
            colunas: [
                { label: 'ERP', value: (r) => LABELS_ERP[r.erp] || r.erp },
                { label: 'Total', key: 'total' }
            ],
            dados: d.porERP
        });
    }

    // Aba 5: Provedores por Plano
    if (d.porPlano && d.porPlano.length > 0) {
        abas.push({
            nome: 'Provedores por Plano',
            colunas: [
                { label: 'Plano', value: (r) => LABELS_PLANO[r.plano] || r.plano },
                { label: 'Total', key: 'total' }
            ],
            dados: d.porPlano
        });
    }

    // Aba 6: Chamados por Provedor
    if (d.porProvedor && d.porProvedor.length > 0) {
        abas.push({
            nome: 'Chamados por Provedor',
            colunas: [
                { label: 'Provedor', key: 'nome' },
                { label: 'Total de Chamados', key: 'total' }
            ],
            dados: d.porProvedor
        });
    }

    // Aba 7: Chamados por Categoria
    if (d.porCategoria && d.porCategoria.length > 0) {
        abas.push({
            nome: 'Chamados por Categoria',
            colunas: [
                { label: 'Categoria', value: (r) => labelCategoria(r.categoria) },
                { label: 'Total', key: 'total' }
            ],
            dados: d.porCategoria
        });
    }

    // Aba 8: Chamados por Mês
    if (d.porMes && d.porMes.length > 0) {
        abas.push({
            nome: 'Chamados por Mes',
            colunas: [
                {
                    label: 'Mês',
                    value: (r) => {
                        const [ano, mes] = r.mes.split('-');
                        return new Date(ano, mes - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                    }
                },
                { label: 'Total', key: 'total' }
            ],
            dados: d.porMes
        });
    }

    // Aba 9: Treinamentos por Status
    if (d.treinPorStatus && d.treinPorStatus.length > 0) {
        abas.push({
            nome: 'Treinamentos por Status',
            colunas: [
                { label: 'Status', value: (r) => LABELS_STATUS_TREIN[r.status] || r.status },
                { label: 'Total', key: 'total' }
            ],
            dados: d.treinPorStatus
        });
    }

    // Aba 10: Treinamentos por Mes
    if (d.treinPorMes && d.treinPorMes.length > 0) {
        abas.push({
            nome: 'Treinamentos por Mes',
            colunas: [
                {
                    label: 'Mês',
                    value: (r) => {
                        const [ano, mes] = r.mes.split('-');
                        return new Date(ano, mes - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                    }
                },
                { label: 'Total', key: 'total' }
            ],
            dados: d.treinPorMes
        });
    }

    // Aba 11: Projetos por Status
    if (d.projPorStatus && d.projPorStatus.length > 0) {
        abas.push({
            nome: 'Projetos por Status',
            colunas: [
                { label: 'Status', value: (r) => LABELS_STATUS_PROJ[r.status] || r.status },
                { label: 'Total', key: 'total' }
            ],
            dados: d.projPorStatus
        });
    }

    // Aba 12: Projetos por Prioridade
    if (d.projPorPrioridade && d.projPorPrioridade.length > 0) {
        abas.push({
            nome: 'Projetos por Prioridade',
            colunas: [
                {
                    label: 'Prioridade',
                    value: (r) => ({ baixa: 'Baixa', media: 'Media', alta: 'Alta' })[r.prioridade] || r.prioridade
                },
                { label: 'Total', key: 'total' }
            ],
            dados: d.projPorPrioridade
        });
    }

    // Aba 13: Chamados Abertos por Provedor
    if (d.abertosProvedor && d.abertosProvedor.length > 0) {
        abas.push({
            nome: 'Chamados Abertos',
            colunas: [
                { label: 'Provedor', key: 'nome' },
                { label: 'Categoria', value: (r) => labelCategoria(r.categoria) },
                { label: 'Qtd Abertos', key: 'total' }
            ],
            dados: d.abertosProvedor
        });
    }

    // Aba 14: Chamados Recentes
    if (d.recentes && d.recentes.length > 0) {
        abas.push({
            nome: 'Chamados Recentes',
            colunas: [
                { label: 'ID', key: 'id' },
                { label: 'Provedor', key: 'provedor_nome' },
                { label: 'Título', key: 'titulo' },
                { label: 'Categoria', value: (r) => labelCategoria(r.categoria) },
                { label: 'Status', value: (r) => LABELS_STATUS[r.status] || r.status },
                { label: 'Data', value: (r) => formatarData(r.data_abertura) }
            ],
            dados: d.recentes
        });
    }

    return abas;
}

function exportarDashboardCSV() {
    const abas = getDashboardAbas();
    if (abas.length === 0) {
        mostrarToast('Nenhum dado para exportar', 'warning');
        return;
    }
    const sep = ';';
    const bom = '\uFEFF';
    let csv = bom;
    abas.forEach((aba, idx) => {
        if (idx > 0) csv += '\n\n';
        csv += `=== ${aba.nome} ===\n`;
        csv += aba.colunas.map((c) => c.label).join(sep) + '\n';
        csv += aba.dados
            .map((row) =>
                aba.colunas
                    .map((c) => {
                        let val = typeof c.value === 'function' ? c.value(row) : row[c.key] || '';
                        val = String(val).replace(/"/g, '""');
                        if (String(val).includes(sep) || String(val).includes('"') || String(val).includes('\n')) {
                            val = `"${val}"`;
                        }
                        return val;
                    })
                    .join(sep)
            )
            .join('\n');
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    baixarArquivo(blob, 'relatorio-dashboard.csv');
    mostrarToast('CSV do Dashboard exportado!');
}

function exportarDashboardExcel() {
    const abas = getDashboardAbas();
    if (abas.length === 0) {
        mostrarToast('Nenhum dado para exportar', 'warning');
        return;
    }
    exportarExcel(abas, 'relatorio-dashboard');
    mostrarToast('Excel do Dashboard exportado!');
}

function exportarDashboardPDF() {
    if (typeof html2pdf === 'undefined') {
        mostrarToast('Biblioteca html2pdf nao carregada', 'error');
        return;
    }
    if (!dashData.resumo) {
        mostrarToast('Nenhum dado para exportar', 'warning');
        return;
    }
    mostrarToast('Gerando PDF...', 'info');

    const d = dashData;
    const now = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

    function pdfTable(headers, rows) {
        let t = '<table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:15px">';
        t +=
            '<thead><tr>' +
            headers
                .map(
                    (h) =>
                        `<th style="background:#f59e0b;color:#fff;padding:6px 8px;text-align:left;font-size:10px">${h}</th>`
                )
                .join('') +
            '</tr></thead>';
        t +=
            '<tbody>' +
            rows
                .map(
                    (row, i) =>
                        '<tr>' +
                        row
                            .map(
                                (cell) =>
                                    `<td style="padding:5px 8px;border-bottom:1px solid #e9ecef;background:${i % 2 ? '#f8f9fa' : '#fff'}">${cell}</td>`
                            )
                            .join('') +
                        '</tr>'
                )
                .join('') +
            '</tbody></table>';
        return t;
    }

    let html = '<div style="padding:20px;font-family:Segoe UI,Tahoma,sans-serif;color:#333">';

    // Header
    html += `<div style="text-align:center;margin-bottom:20px;padding-bottom:15px;border-bottom:2px solid #f59e0b">
        <h2 style="margin:0;color:#1a1a2e">Nexus - Dashboard</h2>
        <p style="margin:5px 0 0;color:#6c757d;font-size:12px">Relatorio gerado em ${now}</p>
    </div>`;

    // Summary cards
    html += '<div style="display:inline-block;width:100%;margin-bottom:20px">';
    const cards = [
        { label: 'Provedores', val: d.resumo.total_provedores, color: '#17a2b8' },
        { label: 'Chamados', val: d.resumo.total_chamados, color: '#f59e0b' },
        { label: 'Pendentes', val: d.resumo.pendentes, color: '#ff9f43' },
        { label: 'Resolvidos', val: d.resumo.resolvidos, color: '#2ec4b6' },
        { label: 'Treinamentos', val: d.resumo.total_treinamentos, color: '#7209b7' },
        { label: 'Projetos Ativos', val: d.resumo.projetos_ativos, color: '#f59e0b' }
    ];
    cards.forEach((c) => {
        html += `<div style="display:inline-block;width:15%;text-align:center;padding:10px;margin:0 0.5%;border-radius:8px;background:${c.color}15;border:1px solid ${c.color}30;vertical-align:top">
            <div style="font-size:22px;font-weight:700;color:${c.color}">${c.val || 0}</div>
            <div style="font-size:10px;color:#6c757d">${c.label}</div>
        </div>`;
    });
    html += '</div>';

    // Data sections
    if (d.porResponsavel?.length) {
        html += '<h5 style="color:#1a1a2e;margin:15px 0 8px">Provedores por Responsavel</h5>';
        html += pdfTable(
            ['Responsavel', 'Total'],
            d.porResponsavel.map((r) => [r.responsavel, r.total])
        );
    }
    if (d.porModelo?.length) {
        html += '<h5 style="color:#1a1a2e;margin:15px 0 8px">Provedores por Modelo</h5>';
        html += pdfTable(
            ['Modelo', 'Total'],
            d.porModelo.map((r) => [LABELS_MODELO[r.modelo] || r.modelo, r.total])
        );
    }
    if (d.porERP?.length) {
        html += '<h5 style="color:#1a1a2e;margin:15px 0 8px">Provedores por ERP</h5>';
        html += pdfTable(
            ['ERP', 'Total'],
            d.porERP.map((r) => [LABELS_ERP[r.erp] || r.erp, r.total])
        );
    }
    if (d.porPlano?.length) {
        html += '<h5 style="color:#1a1a2e;margin:15px 0 8px">Provedores por Plano</h5>';
        html += pdfTable(
            ['Plano', 'Total'],
            d.porPlano.map((r) => [LABELS_PLANO[r.plano] || r.plano, r.total])
        );
    }
    if (d.porProvedor?.length) {
        html += '<h5 style="color:#1a1a2e;margin:15px 0 8px">Chamados por Provedor</h5>';
        html += pdfTable(
            ['Provedor', 'Total'],
            d.porProvedor.map((r) => [r.nome, r.total])
        );
    }
    if (d.porCategoria?.length) {
        html += '<h5 style="color:#1a1a2e;margin:15px 0 8px">Chamados por Categoria</h5>';
        html += pdfTable(
            ['Categoria', 'Total'],
            d.porCategoria.map((r) => [labelCategoria(r.categoria), r.total])
        );
    }
    if (d.porMes?.length) {
        html += '<h5 style="color:#1a1a2e;margin:15px 0 8px">Chamados por Mes</h5>';
        html += pdfTable(
            ['Mes', 'Total'],
            d.porMes.map((r) => {
                const [ano, mes] = r.mes.split('-');
                return [
                    new Date(ano, mes - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
                    r.total
                ];
            })
        );
    }
    if (d.treinPorStatus?.length) {
        html += '<h5 style="color:#1a1a2e;margin:15px 0 8px">Treinamentos por Status</h5>';
        html += pdfTable(
            ['Status', 'Total'],
            d.treinPorStatus.map((r) => [LABELS_STATUS_TREIN[r.status] || r.status, r.total])
        );
    }
    if (d.treinPorMes?.length) {
        html += '<h5 style="color:#1a1a2e;margin:15px 0 8px">Treinamentos por Mes</h5>';
        html += pdfTable(
            ['Mes', 'Total'],
            d.treinPorMes.map((r) => {
                const [ano, mes] = r.mes.split('-');
                return [
                    new Date(ano, mes - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
                    r.total
                ];
            })
        );
    }
    if (d.projPorStatus?.length) {
        html += '<h5 style="color:#1a1a2e;margin:15px 0 8px">Projetos por Status</h5>';
        html += pdfTable(
            ['Status', 'Total'],
            d.projPorStatus.map((r) => [LABELS_STATUS_PROJ[r.status] || r.status, r.total])
        );
    }
    if (d.projPorPrioridade?.length) {
        html += '<h5 style="color:#1a1a2e;margin:15px 0 8px">Projetos por Prioridade</h5>';
        html += pdfTable(
            ['Prioridade', 'Total'],
            d.projPorPrioridade.map((r) => [
                { baixa: 'Baixa', media: 'Media', alta: 'Alta' }[r.prioridade] || r.prioridade,
                r.total
            ])
        );
    }
    if (d.recentes?.length) {
        html += '<h5 style="color:#1a1a2e;margin:15px 0 8px">Chamados Recentes</h5>';
        html += pdfTable(
            ['ID', 'Provedor', 'Titulo', 'Categoria', 'Status', 'Data'],
            d.recentes.map((r) => [
                r.id,
                r.provedor_nome,
                r.titulo,
                labelCategoria(r.categoria),
                LABELS_STATUS[r.status] || r.status,
                formatarData(r.data_abertura)
            ])
        );
    }

    html += '</div>';

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);

    html2pdf()
        .set({
            margin: [10, 10, 10, 10],
            filename: 'relatorio-dashboard.pdf',
            image: { type: 'jpeg', quality: 0.95 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        })
        .from(container)
        .save()
        .then(() => {
            document.body.removeChild(container);
            mostrarToast('PDF do Dashboard exportado!');
        });
}

// ==================== ANALYTICS & TENDENCIAS ====================

async function carregarAnalytics() {
    try {
        const [tendencia, resolucao, conversao, desempenho] = await Promise.all([
            api('/api/dashboard/analytics/chamados-tendencia'),
            api('/api/dashboard/analytics/tempo-resolucao'),
            api('/api/dashboard/analytics/taxa-conversao'),
            api('/api/dashboard/analytics/desempenho-vendedores')
        ]);
        renderChamadosTendencia(tendencia);
        renderTempoResolucao(resolucao);
        renderTaxaConversao(conversao);
        renderDesempenho(desempenho);
    } catch (err) {
        console.error('Analytics error:', err);
    }
}

function renderChamadosTendencia(dados) {
    const meses = [...new Set(dados.map((d) => d.mes))].sort();
    const statuses = ['pendente', 'em_andamento', 'resolvido', 'fechado'];
    const cores = { pendente: '#ffc107', em_andamento: '#0d6efd', resolvido: '#198754', fechado: '#6c757d' };
    const datasets = statuses.map((s) => ({
        label: s.replace('_', ' '),
        data: meses.map((m) => {
            const d = dados.find((x) => x.mes === m && x.status === s);
            return d ? d.total : 0;
        }),
        borderColor: cores[s],
        backgroundColor: cores[s] + '33',
        tension: 0.3,
        fill: true
    }));
    new Chart(document.getElementById('chartChamadosTendencia'), {
        type: 'line',
        data: { labels: meses, datasets },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
    });
}

function renderTempoResolucao(dados) {
    new Chart(document.getElementById('chartTempoResolucao'), {
        type: 'bar',
        data: {
            labels: dados.map((d) => d.mes),
            datasets: [
                {
                    label: 'Media (dias)',
                    data: dados.map((d) => d.media_dias),
                    backgroundColor: '#0d6efd88',
                    borderColor: '#0d6efd',
                    borderWidth: 1
                }
            ]
        },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
}

function renderTaxaConversao(dados) {
    new Chart(document.getElementById('chartTaxaConversao'), {
        type: 'line',
        data: {
            labels: dados.map((d) => d.mes),
            datasets: [
                { label: 'Total', data: dados.map((d) => d.total), borderColor: '#6c757d', tension: 0.3 },
                {
                    label: 'Ativados',
                    data: dados.map((d) => d.ativados),
                    borderColor: '#198754',
                    tension: 0.3,
                    fill: true,
                    backgroundColor: '#19875433'
                }
            ]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
    });
}

function renderDesempenho(dados) {
    new Chart(document.getElementById('chartDesempenho'), {
        type: 'bar',
        data: {
            labels: dados.map((d) => d.vendedor),
            datasets: [
                { label: 'Negocios', data: dados.map((d) => d.total_negocios), backgroundColor: '#0d6efd88' },
                { label: 'Ativados', data: dados.map((d) => d.ativados), backgroundColor: '#19875488' }
            ]
        },
        options: { responsive: true, indexAxis: 'y', plugins: { legend: { position: 'bottom' } } }
    });
}

// ==================== DASHBOARD PERSONALIZAVEL ====================

let _dashWidgets = [];
let _dashEditMode = false;
let _dashBackup = null;
let _dragWidget = null;

const COL_MAP = { 3: 'col-lg-3', 4: 'col-lg-4', 5: 'col-lg-5', 6: 'col-md-6', 7: 'col-lg-7', 12: 'col-12' };

async function carregarWidgetLayout() {
    try {
        _dashWidgets = await api('/api/dashboard/widgets');
        aplicarWidgetLayout();
    } catch (e) {
        console.error('Erro ao carregar widgets:', e);
    }
}

function aplicarWidgetLayout() {
    const container = document.getElementById('dashboardWidgets');
    if (!container || !_dashWidgets.length) return;

    const sorted = [..._dashWidgets].sort((a, b) => a.posicao - b.posicao);
    sorted.forEach((w) => {
        const el = container.querySelector(`[data-widget="${w.widget_tipo}"]`);
        if (!el) return;
        // Update visibility
        el.style.display = w.visivel ? '' : 'none';
        // Update col class based on largura
        el.className = el.className.replace(/col-\S+/g, '');
        const colClass = w.widget_tipo === 'cards_resumo' ? 'col-12' : COL_MAP[w.largura] || `col-lg-${w.largura}`;
        el.classList.add('dash-widget', colClass);
        // Store widget db id
        el.dataset.widgetId = w.id;
        el.dataset.largura = w.largura;
        // Reorder in DOM
        container.appendChild(el);
    });
}

function toggleEditDashboard() {
    _dashEditMode = !_dashEditMode;
    const container = document.getElementById('dashboardWidgets');
    const btn = document.getElementById('btnEditarDash');
    const actions = document.getElementById('editDashActions');

    if (_dashEditMode) {
        _dashBackup = _dashWidgets.map((w) => ({ ...w }));
        btn.style.display = 'none';
        actions.style.display = 'flex';
        container.classList.add('dash-edit-mode');

        // Show handles and controls
        container.querySelectorAll('.dash-widget').forEach((el) => {
            el.setAttribute('draggable', 'true');
            const handle = el.querySelector('.dash-widget-handle');
            if (handle) handle.style.display = '';
            // Add edit overlay if not exists
            if (!el.querySelector('.dash-widget-controls')) {
                const tipo = el.dataset.widget;
                const wData = _dashWidgets.find((w) => w.widget_tipo === tipo);
                const visivel = wData ? wData.visivel : 1;
                const largura = parseInt(el.dataset.largura) || 6;
                const ctrl = document.createElement('div');
                ctrl.className = 'dash-widget-controls';
                ctrl.innerHTML = `
                    <label class="form-check form-switch form-check-sm mb-0">
                        <input type="checkbox" class="form-check-input" ${visivel ? 'checked' : ''} onchange="toggleWidgetVisivel('${tipo}', this.checked)">
                        <span class="form-check-label small">${el.dataset.label || tipo}</span>
                    </label>
                    <select class="form-select form-select-sm" style="width:80px" onchange="mudarLarguraWidget('${tipo}', this.value)">
                        <option value="3" ${largura === 3 ? 'selected' : ''}>3 col</option>
                        <option value="4" ${largura === 4 ? 'selected' : ''}>4 col</option>
                        <option value="5" ${largura === 5 ? 'selected' : ''}>5 col</option>
                        <option value="6" ${largura === 6 ? 'selected' : ''}>6 col</option>
                        <option value="7" ${largura === 7 ? 'selected' : ''}>7 col</option>
                        <option value="12" ${largura === 12 ? 'selected' : ''}>12 col</option>
                    </select>
                `;
                el.querySelector('.dash-widget-inner').prepend(ctrl);
            }
            // Attach drag events
            el.ondragstart = (e) => {
                _dragWidget = el;
                el.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            };
            el.ondragend = () => {
                el.classList.remove('dragging');
                _dragWidget = null;
            };
            el.ondragover = (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            };
            el.ondrop = (e) => {
                e.preventDefault();
                if (!_dragWidget || _dragWidget === el) return;
                const rect = el.getBoundingClientRect();
                const mid = rect.top + rect.height / 2;
                if (e.clientY < mid) {
                    container.insertBefore(_dragWidget, el);
                } else {
                    container.insertBefore(_dragWidget, el.nextSibling);
                }
            };
        });
        // Hidden widgets should be shown faded in edit mode
        container.querySelectorAll('.dash-widget').forEach((el) => {
            if (el.style.display === 'none') {
                el.style.display = '';
                el.classList.add('dash-widget-hidden');
            }
        });
    } else {
        exitEditMode();
    }
}

function exitEditMode() {
    _dashEditMode = false;
    const container = document.getElementById('dashboardWidgets');
    const btn = document.getElementById('btnEditarDash');
    const actions = document.getElementById('editDashActions');
    btn.style.display = '';
    actions.style.display = 'none';
    container.classList.remove('dash-edit-mode');
    container.querySelectorAll('.dash-widget').forEach((el) => {
        el.removeAttribute('draggable');
        const handle = el.querySelector('.dash-widget-handle');
        if (handle) handle.style.display = 'none';
        const ctrl = el.querySelector('.dash-widget-controls');
        if (ctrl) ctrl.remove();
        el.classList.remove('dash-widget-hidden', 'dragging');
        el.ondragstart = el.ondragend = el.ondragover = el.ondrop = null;
    });
    aplicarWidgetLayout();
}

function toggleWidgetVisivel(tipo, visivel) {
    const w = _dashWidgets.find((w) => w.widget_tipo === tipo);
    if (w) w.visivel = visivel ? 1 : 0;
    const el = document.querySelector(`[data-widget="${tipo}"]`);
    if (el) {
        if (visivel) el.classList.remove('dash-widget-hidden');
        else el.classList.add('dash-widget-hidden');
    }
}

function mudarLarguraWidget(tipo, largura) {
    const w = _dashWidgets.find((w) => w.widget_tipo === tipo);
    if (w) w.largura = parseInt(largura);
    const el = document.querySelector(`[data-widget="${tipo}"]`);
    if (el) {
        el.className = el.className.replace(/col-\S+/g, '');
        const colClass = tipo === 'cards_resumo' ? 'col-12' : COL_MAP[parseInt(largura)] || `col-lg-${largura}`;
        el.classList.add('dash-widget', colClass);
        if (!_dashWidgets.find((w) => w.widget_tipo === tipo)?.visivel) el.classList.add('dash-widget-hidden');
        el.dataset.largura = largura;
    }
}

async function salvarLayoutDash() {
    const container = document.getElementById('dashboardWidgets');
    const widgets = [];
    container.querySelectorAll('.dash-widget').forEach((el, i) => {
        const tipo = el.dataset.widget;
        const w = _dashWidgets.find((w) => w.widget_tipo === tipo);
        if (w) {
            w.posicao = i;
            widgets.push({ id: w.id, posicao: i, largura: w.largura, visivel: w.visivel });
        }
    });
    try {
        await api('/api/dashboard/widgets', { method: 'PUT', body: JSON.stringify({ widgets }) });
        mostrarToast('Layout do dashboard salvo!');
        exitEditMode();
    } catch (e) {
        mostrarToast('Erro ao salvar layout', 'error');
    }
}

function cancelarEditDash() {
    if (_dashBackup) _dashWidgets = _dashBackup;
    _dashBackup = null;
    exitEditMode();
}

async function resetarLayoutDash() {
    if (!confirm('Resetar layout para o padrao?')) return;
    try {
        await api('/api/dashboard/widgets/reset', { method: 'POST' });
        _dashWidgets = await api('/api/dashboard/widgets');
        mostrarToast('Layout resetado!');
        exitEditMode();
    } catch (e) {
        mostrarToast('Erro ao resetar', 'error');
    }
}
