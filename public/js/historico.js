// ==================== HISTÓRICO ====================

document.addEventListener('DOMContentLoaded', () => {
    carregarProvedores(document.getElementById('seletorProvedor'));
    document.getElementById('seletorProvedor').addEventListener('change', carregarHistorico);
});

async function carregarHistorico() {
    const provedorId = document.getElementById('seletorProvedor').value;
    const container = document.getElementById('historicoConteudo');

    if (!provedorId) {
        container.innerHTML = `
            <div class="text-center text-muted py-5">
                <i class="bi bi-arrow-up-circle fs-1 d-block mb-3"></i>
                <p>Selecione um provedor acima para ver o histórico completo.</p>
            </div>
        `;
        return;
    }

    try {
        const { provedor, eventos } = await api(`/api/historico/${provedorId}`);

        if (eventos.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-5">
                    <i class="bi bi-inbox fs-1 d-block mb-3"></i>
                    <p>Nenhum registro encontrado para <strong>${provedor.nome}</strong>.</p>
                </div>
            `;
            return;
        }

        // Resumo
        const totalChamados = eventos.filter(e => e.tipo === 'chamado').length;
        const totalTreinamentos = eventos.filter(e => e.tipo === 'treinamento').length;
        const totalProjetos = eventos.filter(e => e.tipo === 'projeto').length;

        const resumoHtml = `
            <div class="row g-3 mb-4">
                <div class="col-md-4">
                    <div class="card stat-card">
                        <div class="card-body d-flex align-items-center gap-3">
                            <div class="stat-icon bg-primary bg-opacity-10 text-primary"><i class="bi bi-ticket-detailed"></i></div>
                            <div>
                                <div class="stat-number">${totalChamados}</div>
                                <div class="stat-label">Chamados</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card stat-card">
                        <div class="card-body d-flex align-items-center gap-3">
                            <div class="stat-icon bg-success bg-opacity-10 text-success"><i class="bi bi-mortarboard"></i></div>
                            <div>
                                <div class="stat-number">${totalTreinamentos}</div>
                                <div class="stat-label">Treinamentos</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card stat-card">
                        <div class="card-body d-flex align-items-center gap-3">
                            <div class="stat-icon bg-danger bg-opacity-10 text-danger"><i class="bi bi-kanban"></i></div>
                            <div>
                                <div class="stat-number">${totalProjetos}</div>
                                <div class="stat-label">Projetos</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Timeline
        const timelineHtml = eventos.map(e => {
            const icone = { chamado: 'bi-ticket-detailed', treinamento: 'bi-mortarboard', projeto: 'bi-kanban' };
            const tipoLabel = { chamado: 'Chamado', treinamento: 'Treinamento', projeto: 'Projeto' };

            let extra = '';
            if (e.tipo === 'chamado') {
                extra = `${badgeCategoria(e.categoria)} ${badgeStatus(e.status)}`;
            } else if (e.tipo === 'projeto') {
                extra = `${badgePrioridade(e.prioridade)} ${badgeStatus(e.status)}`;
            }

            return `
                <div class="timeline-item">
                    <div class="timeline-dot ${e.tipo}"></div>
                    <div class="timeline-content">
                        <div class="d-flex justify-content-between align-items-start mb-1">
                            <div>
                                <span class="badge bg-light text-dark me-1"><i class="bi ${icone[e.tipo]} me-1"></i>${tipoLabel[e.tipo]}</span>
                                ${extra}
                            </div>
                            <span class="timeline-date">${formatarData(e.data)}</span>
                        </div>
                        <p class="mb-0 fw-medium">${e.titulo}</p>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <h5 class="mb-3"><i class="bi bi-building me-2"></i>${provedor.nome}</h5>
            ${provedor.contato ? `<p class="text-muted mb-3"><i class="bi bi-whatsapp me-1"></i> ${provedor.contato}</p>` : ''}
            ${resumoHtml}
            <h6 class="mb-3"><i class="bi bi-clock-history me-2"></i>Linha do Tempo</h6>
            <div class="timeline">
                ${timelineHtml}
            </div>
        `;
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}
