// ==================== DASHBOARD MAIN ====================

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

        // Armazenar para exportacao
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

        // === Graficos ===
        renderDoughnut(
            'chartResponsavel',
            porResponsavel,
            (r) => r.responsavel,
            (r) => r.total
        );
        renderDoughnut(
            'chartModelo',
            porModelo,
            (r) => LABELS_MODELO[r.modelo] || r.modelo,
            (r) => r.total
        );
        renderBar(
            'chartERP',
            porERP,
            (r) => LABELS_ERP[r.erp] || r.erp,
            (r) => r.total,
            'Provedores'
        );
        renderDoughnut(
            'chartPlano',
            porPlano,
            (r) => LABELS_PLANO[r.plano] || r.plano,
            (r) => r.total
        );
        renderChartTreinStatus(treinPorStatus);
        renderChartTreinMes(treinPorMes);
        renderChartProvedor(porProvedor);
        renderChartCategoria(porCategoria);
        renderChartMes(porMes);
        renderChartProjStatus(projPorStatus);

        // === Tabelas ===
        renderRecentes(recentes);
        renderAbertosProvedor(abertosProvedor);

        // === Analytics ===
        carregarAnalytics();
    } catch (err) {
        mostrarToast('Erro ao carregar dashboard: ' + err.message, 'error');
    }
}
