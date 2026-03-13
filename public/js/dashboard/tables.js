// ==================== DASHBOARD TABLES ====================

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
