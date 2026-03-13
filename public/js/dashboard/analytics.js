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
