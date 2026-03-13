// ==================== CHART HELPERS ====================

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

// === Graficos especificos ===

function renderChartTreinStatus(treinPorStatus) {
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
}

function renderChartTreinMes(treinPorMes) {
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
}

function renderChartProvedor(porProvedor) {
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
}

function renderChartCategoria(porCategoria) {
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
}

function renderChartMes(porMes) {
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
}

function renderChartProjStatus(projPorStatus) {
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
}
