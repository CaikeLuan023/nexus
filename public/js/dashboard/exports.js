// ==================== EXPORTACAO DASHBOARD ====================

const LABELS_STATUS = {
    pendente: 'Pendente',
    em_andamento: 'Em Andamento',
    resolvido: 'Resolvido',
    fechado: 'Fechado',
    concluido: 'Concluido',
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
            { label: 'Metrica', key: 'metrica' },
            { label: 'Valor', key: 'valor' }
        ],
        dados: [
            { metrica: 'Total de Clientes', valor: d.resumo.total_provedores || 0 },
            { metrica: 'Total de Chamados', valor: d.resumo.total_chamados || 0 },
            { metrica: 'Chamados Pendentes', valor: d.resumo.pendentes || 0 },
            { metrica: 'Chamados Resolvidos', valor: d.resumo.resolvidos || 0 },
            { metrica: 'Total de Treinamentos', valor: d.resumo.total_treinamentos || 0 },
            { metrica: 'Projetos Ativos', valor: d.resumo.projetos_ativos || 0 }
        ]
    });

    // Aba 2: Provedores por Responsavel
    if (d.porResponsavel && d.porResponsavel.length > 0) {
        abas.push({
            nome: 'Clientes por Responsavel',
            colunas: [
                { label: 'Responsavel', key: 'responsavel' },
                { label: 'Total', key: 'total' }
            ],
            dados: d.porResponsavel
        });
    }

    // Aba 3: Provedores por Modelo
    if (d.porModelo && d.porModelo.length > 0) {
        abas.push({
            nome: 'Clientes por Modelo',
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
            nome: 'Clientes por ERP',
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
            nome: 'Clientes por Plano',
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
            nome: 'Chamados por Cliente',
            colunas: [
                { label: 'Cliente', key: 'nome' },
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

    // Aba 8: Chamados por Mes
    if (d.porMes && d.porMes.length > 0) {
        abas.push({
            nome: 'Chamados por Mes',
            colunas: [
                {
                    label: 'Mes',
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
                    label: 'Mes',
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
                { label: 'Cliente', key: 'nome' },
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
                { label: 'Cliente', key: 'provedor_nome' },
                { label: 'Titulo', key: 'titulo' },
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
        { label: 'Clientes', val: d.resumo.total_provedores, color: '#17a2b8' },
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
        html += '<h5 style="color:#1a1a2e;margin:15px 0 8px">Clientes por Responsavel</h5>';
        html += pdfTable(
            ['Responsavel', 'Total'],
            d.porResponsavel.map((r) => [r.responsavel, r.total])
        );
    }
    if (d.porModelo?.length) {
        html += '<h5 style="color:#1a1a2e;margin:15px 0 8px">Clientes por Modelo</h5>';
        html += pdfTable(
            ['Modelo', 'Total'],
            d.porModelo.map((r) => [LABELS_MODELO[r.modelo] || r.modelo, r.total])
        );
    }
    if (d.porERP?.length) {
        html += '<h5 style="color:#1a1a2e;margin:15px 0 8px">Clientes por ERP</h5>';
        html += pdfTable(
            ['ERP', 'Total'],
            d.porERP.map((r) => [LABELS_ERP[r.erp] || r.erp, r.total])
        );
    }
    if (d.porPlano?.length) {
        html += '<h5 style="color:#1a1a2e;margin:15px 0 8px">Clientes por Plano</h5>';
        html += pdfTable(
            ['Plano', 'Total'],
            d.porPlano.map((r) => [LABELS_PLANO[r.plano] || r.plano, r.total])
        );
    }
    if (d.porProvedor?.length) {
        html += '<h5 style="color:#1a1a2e;margin:15px 0 8px">Chamados por Cliente</h5>';
        html += pdfTable(
            ['Cliente', 'Total'],
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
            ['ID', 'Cliente', 'Titulo', 'Categoria', 'Status', 'Data'],
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
