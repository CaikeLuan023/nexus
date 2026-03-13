// ==================== DASHBOARD UTILS ====================
// Funcoes puras e constantes extraidas para testes unitarios
// Funciona como <script> no browser E como require() no Node.js

(function (root) {
    'use strict';

    var DashboardUtils = {};

    // ===== PALETA DE CORES =====

    DashboardUtils.CORES = [
        '#f59e0b', '#3a0ca3', '#7209b7', '#f72585', '#4cc9f0',
        '#2ec4b6', '#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3',
        '#6c5ce7', '#00b894', '#e17055', '#0984e3', '#fdcb6e'
    ];

    DashboardUtils.CORES_CATEGORIA = {
        usuario: '#f59e0b',
        app: '#f72585',
        integracao: '#feca57',
        canal: '#ff6b6b',
        troca_senha: '#7209b7',
        email_ativacao: '#3a0ca3',
        outro: '#a0a0a0'
    };

    DashboardUtils.CORES_STATUS_TREIN = {
        agendado: '#feca57',
        realizado: '#2ec4b6',
        cancelado: '#ff6b6b'
    };

    DashboardUtils.CORES_STATUS_PROJ = {
        em_andamento: '#f59e0b',
        pausado: '#feca57',
        concluido: '#2ec4b6',
        cancelado: '#ff6b6b'
    };

    // ===== LABELS DE MAPEAMENTO =====

    DashboardUtils.LABELS_MODELO = {
        bundle: 'Bundle',
        hardbundle: 'Hardbundle',
        reseller: 'Reseller',
        hospitality: 'Hospitality',
        empresas: 'Empresas',
        'Não definido': 'Não definido'
    };

    DashboardUtils.LABELS_ERP = {
        ixc: 'IXC',
        hubsoft: 'Hubsoft',
        sgp: 'SGP',
        atlaz: 'Atlaz',
        ispfy: 'ISPfy',
        mycore: 'Mycore',
        mk_auth: 'MK-Auth',
        radius_net: 'Radius Net',
        voalle: 'Voalle',
        proprio: 'Próprio',
        'Não definido': 'Não definido'
    };

    DashboardUtils.LABELS_PLANO = {
        zapping_lite_plus: 'Zapping Lite Plus',
        zapping_full: 'Zapping Full',
        liteplus_full: 'Lite Plus + Full',
        'Não definido': 'Não definido'
    };

    DashboardUtils.LABELS_STATUS_TREIN = {
        agendado: 'Agendado',
        realizado: 'Realizado',
        cancelado: 'Cancelado'
    };

    DashboardUtils.LABELS_STATUS_PROJ = {
        em_andamento: 'Em Andamento',
        pausado: 'Pausado',
        concluido: 'Concluído',
        cancelado: 'Cancelado'
    };

    DashboardUtils.LABELS_CATEGORIA = {
        usuario: 'Problemas com Usuario',
        app: 'Problemas com App',
        integracao: 'Problemas de Integracao',
        canal: 'Problemas com Canal',
        troca_senha: 'Troca de Senha / Email',
        email_ativacao: 'Email de Ativacao nao recebido',
        outro: 'Outros'
    };

    // ===== FUNCOES PURAS =====

    DashboardUtils.getColor = function (index) {
        return DashboardUtils.CORES[index % DashboardUtils.CORES.length];
    };

    DashboardUtils.getCategoriaColor = function (categoria) {
        return DashboardUtils.CORES_CATEGORIA[categoria] || '#a0a0a0';
    };

    DashboardUtils.labelCategoria = function (categoria) {
        return DashboardUtils.LABELS_CATEGORIA[categoria] || categoria;
    };

    DashboardUtils.mapLabel = function (map, key) {
        return map[key] || key;
    };

    DashboardUtils.parseMonthLabel = function (mesStr, options) {
        var parts = mesStr.split('-');
        var ano = parseInt(parts[0], 10);
        var mes = parseInt(parts[1], 10);
        var date = new Date(ano, mes - 1);
        var opts = options || { month: 'short', year: '2-digit' };
        return date.toLocaleDateString('pt-BR', opts);
    };

    DashboardUtils.prepareDoughnutData = function (data, labelFn, valueFn) {
        if (!data || data.length === 0) return null;
        return {
            labels: data.map(labelFn),
            values: data.map(valueFn),
            colors: data.map(function (_, i) { return DashboardUtils.getColor(i); })
        };
    };

    DashboardUtils.prepareBarData = function (data, labelFn, valueFn) {
        if (!data || data.length === 0) return null;
        return {
            labels: data.map(labelFn),
            values: data.map(valueFn),
            colors: data.map(function (_, i) { return DashboardUtils.getColor(i); })
        };
    };

    DashboardUtils.prepareTendenciaData = function (dados) {
        var seen = {};
        var meses = [];
        dados.forEach(function (d) {
            if (!seen[d.mes]) { meses.push(d.mes); seen[d.mes] = true; }
        });
        meses.sort();

        var statuses = ['pendente', 'em_andamento', 'resolvido', 'fechado'];
        var cores = { pendente: '#ffc107', em_andamento: '#0d6efd', resolvido: '#198754', fechado: '#6c757d' };

        var datasets = statuses.map(function (s) {
            return {
                label: s.replace('_', ' '),
                data: meses.map(function (m) {
                    var d = dados.find(function (x) { return x.mes === m && x.status === s; });
                    return d ? d.total : 0;
                }),
                borderColor: cores[s],
                backgroundColor: cores[s] + '33'
            };
        });

        return { labels: meses, datasets: datasets };
    };

    DashboardUtils.groupAbertosProvedor = function (dados) {
        var porProvedor = {};
        dados.forEach(function (d) {
            if (!porProvedor[d.nome]) porProvedor[d.nome] = [];
            porProvedor[d.nome].push(d);
        });
        var result = [];
        Object.keys(porProvedor).forEach(function (nome) {
            var categorias = porProvedor[nome];
            var total = categorias.reduce(function (sum, c) { return sum + c.total; }, 0);
            result.push({ nome: nome, categorias: categorias, total: total });
        });
        return result;
    };

    // ===== EXPORT =====
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = DashboardUtils;
    } else {
        root.DashboardUtils = DashboardUtils;
    }

})(typeof window !== 'undefined' ? window : global);
