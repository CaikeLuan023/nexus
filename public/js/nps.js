// ==================== NPS / PESQUISA DE SATISFACAO ====================

let chartDistribuicao = null;
let chartEvolucao = null;

document.addEventListener('DOMContentLoaded', () => {
    carregarProvedoresFiltro();
    carregarNPS();
});

async function carregarProvedoresFiltro() {
    try {
        const provedores = await api('/api/provedores');
        const select = document.getElementById('npsFiltroProvedor');
        provedores.forEach((p) => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.nome;
            select.appendChild(opt);
        });
    } catch (err) {
        console.error('Erro provedores:', err);
    }
}

async function carregarNPS() {
    try {
        const periodo = document.getElementById('npsFiltroMes')?.value || '';
        const provedor_id = document.getElementById('npsFiltroProvedor')?.value || '';
        let url = '/api/nps/dashboard?';
        if (periodo) url += `periodo=${periodo}&`;
        if (provedor_id) url += `provedor_id=${provedor_id}&`;

        const data = await api(url);
        renderScore(data);
        renderDistribuicao(data.distribuicao);
        renderEvolucao(data.evolucao);
        renderProvedores(data.nps_provedor);
        renderRespostas(data.respostas);
    } catch (err) {
        console.error('Erro NPS:', err);
        mostrarToast('Erro ao carregar NPS: ' + err.message, 'error');
    }
}

function renderScore(data) {
    const scoreEl = document.getElementById('npsScoreValor');
    const labelEl = document.getElementById('npsScoreLabel');

    if (data.score === null || data.total === 0) {
        scoreEl.textContent = '--';
        scoreEl.className = 'display-3 fw-bold text-muted';
        labelEl.textContent = 'Sem dados suficientes';
    } else {
        scoreEl.textContent = data.score;
        const cor =
            data.score >= 75
                ? 'text-success'
                : data.score >= 50
                  ? 'text-primary'
                  : data.score >= 0
                    ? 'text-warning'
                    : 'text-danger';
        const label =
            data.score >= 75 ? 'Excelente' : data.score >= 50 ? 'Muito Bom' : data.score >= 0 ? 'Razoavel' : 'Critico';
        scoreEl.className = 'display-3 fw-bold ' + cor;
        labelEl.textContent = `${label} (media: ${data.media || 0} | ${data.total} respostas)`;
    }

    document.getElementById('npsPromotores').textContent = data.promotores || 0;
    document.getElementById('npsNeutros').textContent = data.neutros || 0;
    document.getElementById('npsDetratores').textContent = data.detratores || 0;
    document.getElementById('npsPendentes').textContent = data.pendentes || 0;
}

function renderDistribuicao(dist) {
    const ctx = document.getElementById('chartNPSDistribuicao');
    if (!ctx) return;
    if (!dist || !dist.length) return;

    const colors = dist.map((d) => (d.nota <= 6 ? '#dc3545' : d.nota <= 8 ? '#ffc107' : '#198754'));

    if (chartDistribuicao) chartDistribuicao.destroy();
    chartDistribuicao = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dist.map((d) => d.nota),
            datasets: [
                {
                    label: 'Respostas',
                    data: dist.map((d) => d.quantidade),
                    backgroundColor: colors,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        color:
                            getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() ||
                            '#666'
                    }
                },
                x: {
                    ticks: {
                        color:
                            getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() ||
                            '#666'
                    }
                }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function renderEvolucao(evolucao) {
    const ctx = document.getElementById('chartNPSEvolucao');
    if (!ctx) return;
    if (!evolucao || !evolucao.length) return;

    const labels = evolucao.map((e) => {
        const [ano, mes] = e.mes.split('-');
        return new Date(ano, mes - 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
    });

    if (chartEvolucao) chartEvolucao.destroy();
    chartEvolucao = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'NPS Score',
                    data: evolucao.map((e) => e.score),
                    borderColor: '#0d6efd',
                    backgroundColor: 'rgba(13, 110, 253, 0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 5,
                    pointBackgroundColor: '#0d6efd',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    min: -100,
                    max: 100,
                    ticks: {
                        color:
                            getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() ||
                            '#666'
                    },
                    grid: {
                        color:
                            getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim() ||
                            '#e9ecef'
                    }
                },
                x: {
                    ticks: {
                        color:
                            getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() ||
                            '#666'
                    },
                    grid: { display: false }
                }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function renderProvedores(provedores) {
    const container = document.getElementById('npsProvedorContainer');
    if (!provedores || !provedores.length) {
        container.innerHTML = '<div class="text-center text-muted py-3">Sem dados</div>';
        return;
    }

    container.innerHTML = `
        <div class="list-group list-group-flush">
            ${provedores
                .map((p) => {
                    const cor =
                        p.score >= 75 ? 'success' : p.score >= 50 ? 'primary' : p.score >= 0 ? 'warning' : 'danger';
                    return `
                    <div class="list-group-item d-flex justify-content-between align-items-center px-0">
                        <div>
                            <strong>${escapeHtml(p.provedor)}</strong>
                            <small class="text-muted d-block">${p.total} respostas | media: ${p.media}</small>
                        </div>
                        <span class="badge bg-${cor} fs-6">${p.score}</span>
                    </div>
                `;
                })
                .join('')}
        </div>
    `;
}

function renderRespostas(respostas) {
    const container = document.getElementById('npsRespostasContainer');
    if (!respostas || !respostas.length) {
        container.innerHTML = '<div class="text-center text-muted py-3">Nenhuma resposta ainda</div>';
        return;
    }

    container.innerHTML = `
        <div class="list-group list-group-flush" style="max-height:400px;overflow-y:auto">
            ${respostas
                .slice(0, 20)
                .map((r) => {
                    const cor = r.nota >= 9 ? 'success' : r.nota >= 7 ? 'warning' : 'danger';
                    const tipo = r.nota >= 9 ? 'Promotor' : r.nota >= 7 ? 'Neutro' : 'Detrator';
                    return `
                    <div class="list-group-item px-0">
                        <div class="d-flex justify-content-between align-items-start mb-1">
                            <div>
                                <span class="badge bg-${cor} me-1">${r.nota}</span>
                                <small class="badge bg-light text-dark">${tipo}</small>
                                <strong class="ms-1">${escapeHtml(r.provedor_nome)}</strong>
                            </div>
                            <small class="text-muted">${formatarData(r.respondido_em)}</small>
                        </div>
                        <small class="text-muted">Chamado: ${escapeHtml(r.chamado_titulo)}</small>
                        ${r.comentario ? `<p class="mb-0 mt-1 small fst-italic">"${escapeHtml(r.comentario)}"</p>` : ''}
                    </div>
                `;
                })
                .join('')}
        </div>
    `;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatarData(dt) {
    if (!dt) return '-';
    try {
        return new Date(dt.replace(' ', 'T')).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    } catch {
        return dt;
    }
}

async function enviarNPSMassa() {
    if (!confirm('Gerar pesquisas NPS para chamados resolvidos que ainda nao possuem?')) return;
    try {
        const result = await api('/api/nps/enviar-massa', { method: 'POST' });
        mostrarToast(`${result.criadas} pesquisas criadas!`, 'success');
        carregarNPS();
    } catch (err) {
        mostrarToast('Erro: ' + err.message, 'error');
    }
}
