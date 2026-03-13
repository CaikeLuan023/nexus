const DashboardUtils = require('../public/js/dashboard-utils');

describe('DashboardUtils', () => {

    // ===== Atribuicao de cores =====
    describe('getColor', () => {
        test('retorna primeira cor para indice 0', () => {
            expect(DashboardUtils.getColor(0)).toBe('#f59e0b');
        });

        test('retorna cor correta para indice intermediario', () => {
            expect(DashboardUtils.getColor(4)).toBe('#4cc9f0');
        });

        test('faz wrap-around quando indice excede tamanho da paleta', () => {
            const len = DashboardUtils.CORES.length;
            expect(DashboardUtils.getColor(len)).toBe(DashboardUtils.CORES[0]);
            expect(DashboardUtils.getColor(len + 1)).toBe(DashboardUtils.CORES[1]);
        });

        test('funciona com indice grande', () => {
            expect(DashboardUtils.getColor(100)).toBe(DashboardUtils.CORES[100 % 15]);
        });
    });

    describe('getCategoriaColor', () => {
        test('retorna cor mapeada para categoria conhecida', () => {
            expect(DashboardUtils.getCategoriaColor('usuario')).toBe('#f59e0b');
            expect(DashboardUtils.getCategoriaColor('app')).toBe('#f72585');
            expect(DashboardUtils.getCategoriaColor('integracao')).toBe('#feca57');
        });

        test('retorna cinza fallback para categoria desconhecida', () => {
            expect(DashboardUtils.getCategoriaColor('desconhecida')).toBe('#a0a0a0');
            expect(DashboardUtils.getCategoriaColor('')).toBe('#a0a0a0');
        });
    });

    // ===== Mapeamento de labels =====
    describe('labelCategoria', () => {
        test('mapeia chaves conhecidas para labels em portugues', () => {
            expect(DashboardUtils.labelCategoria('usuario')).toBe('Problemas com Usuario');
            expect(DashboardUtils.labelCategoria('troca_senha')).toBe('Troca de Senha / Email');
            expect(DashboardUtils.labelCategoria('email_ativacao')).toBe('Email de Ativacao nao recebido');
            expect(DashboardUtils.labelCategoria('outro')).toBe('Outros');
        });

        test('retorna chave bruta para categoria desconhecida', () => {
            expect(DashboardUtils.labelCategoria('custom_cat')).toBe('custom_cat');
        });
    });

    describe('mapLabel', () => {
        test('mapeia labels de ERP corretamente', () => {
            expect(DashboardUtils.mapLabel(DashboardUtils.LABELS_ERP, 'ixc')).toBe('IXC');
            expect(DashboardUtils.mapLabel(DashboardUtils.LABELS_ERP, 'voalle')).toBe('Voalle');
            expect(DashboardUtils.mapLabel(DashboardUtils.LABELS_ERP, 'mk_auth')).toBe('MK-Auth');
        });

        test('mapeia labels de modelo corretamente', () => {
            expect(DashboardUtils.mapLabel(DashboardUtils.LABELS_MODELO, 'bundle')).toBe('Bundle');
            expect(DashboardUtils.mapLabel(DashboardUtils.LABELS_MODELO, 'reseller')).toBe('Reseller');
        });

        test('mapeia labels de plano corretamente', () => {
            expect(DashboardUtils.mapLabel(DashboardUtils.LABELS_PLANO, 'zapping_full')).toBe('Zapping Full');
        });

        test('retorna chave bruta para valor nao mapeado', () => {
            expect(DashboardUtils.mapLabel(DashboardUtils.LABELS_ERP, 'erp_novo')).toBe('erp_novo');
        });
    });

    // ===== Parsing de datas =====
    describe('parseMonthLabel', () => {
        test('converte "2024-03" para formato curto', () => {
            const result = DashboardUtils.parseMonthLabel('2024-03');
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
        });

        test('converte "2024-12" corretamente', () => {
            const result = DashboardUtils.parseMonthLabel('2024-12');
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
        });

        test('converte "2024-01" corretamente', () => {
            const result = DashboardUtils.parseMonthLabel('2024-01');
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
        });

        test('aceita opcoes customizadas de formato', () => {
            const result = DashboardUtils.parseMonthLabel('2024-06', { month: 'long', year: 'numeric' });
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(3);
        });
    });

    // ===== Preparacao de dados de graficos =====
    describe('prepareDoughnutData', () => {
        test('retorna null para array vazio', () => {
            expect(DashboardUtils.prepareDoughnutData([], r => r.nome, r => r.total)).toBeNull();
        });

        test('retorna null para null', () => {
            expect(DashboardUtils.prepareDoughnutData(null, r => r.nome, r => r.total)).toBeNull();
        });

        test('estrutura dados validos corretamente', () => {
            const data = [
                { nome: 'Provedor A', total: 10 },
                { nome: 'Provedor B', total: 20 },
                { nome: 'Provedor C', total: 5 }
            ];
            const result = DashboardUtils.prepareDoughnutData(data, r => r.nome, r => r.total);
            expect(result.labels).toEqual(['Provedor A', 'Provedor B', 'Provedor C']);
            expect(result.values).toEqual([10, 20, 5]);
            expect(result.colors).toHaveLength(3);
            expect(result.colors[0]).toBe('#f59e0b');
            expect(result.colors[1]).toBe('#3a0ca3');
        });
    });

    describe('prepareBarData', () => {
        test('retorna null para array vazio', () => {
            expect(DashboardUtils.prepareBarData([], r => r.erp, r => r.total)).toBeNull();
        });

        test('mapeia labels e valores corretamente', () => {
            const data = [
                { erp: 'ixc', total: 15 },
                { erp: 'hubsoft', total: 8 }
            ];
            const result = DashboardUtils.prepareBarData(
                data,
                r => DashboardUtils.mapLabel(DashboardUtils.LABELS_ERP, r.erp),
                r => r.total
            );
            expect(result.labels).toEqual(['IXC', 'Hubsoft']);
            expect(result.values).toEqual([15, 8]);
            expect(result.colors).toHaveLength(2);
        });
    });

    // ===== Agregacao de tendencia =====
    describe('prepareTendenciaData', () => {
        test('retorna datasets vazios para array vazio', () => {
            const result = DashboardUtils.prepareTendenciaData([]);
            expect(result.labels).toEqual([]);
            expect(result.datasets).toHaveLength(4);
            result.datasets.forEach(ds => {
                expect(ds.data).toEqual([]);
            });
        });

        test('agrega por mes e status corretamente', () => {
            const dados = [
                { mes: '2024-01', status: 'pendente', total: 5 },
                { mes: '2024-01', status: 'resolvido', total: 3 },
                { mes: '2024-02', status: 'pendente', total: 2 },
                { mes: '2024-02', status: 'em_andamento', total: 7 },
                { mes: '2024-02', status: 'resolvido', total: 4 }
            ];
            const result = DashboardUtils.prepareTendenciaData(dados);
            expect(result.labels).toEqual(['2024-01', '2024-02']);

            const pendente = result.datasets.find(d => d.label === 'pendente');
            expect(pendente.data).toEqual([5, 2]);

            const emAndamento = result.datasets.find(d => d.label === 'em andamento');
            expect(emAndamento.data).toEqual([0, 7]);

            const resolvido = result.datasets.find(d => d.label === 'resolvido');
            expect(resolvido.data).toEqual([3, 4]);

            const fechado = result.datasets.find(d => d.label === 'fechado');
            expect(fechado.data).toEqual([0, 0]);
        });

        test('ordena meses cronologicamente', () => {
            const dados = [
                { mes: '2024-03', status: 'pendente', total: 1 },
                { mes: '2024-01', status: 'pendente', total: 2 },
                { mes: '2024-02', status: 'pendente', total: 3 }
            ];
            const result = DashboardUtils.prepareTendenciaData(dados);
            expect(result.labels).toEqual(['2024-01', '2024-02', '2024-03']);
        });

        test('usa 0 como default para status ausente em um mes', () => {
            const dados = [
                { mes: '2024-01', status: 'pendente', total: 10 }
            ];
            const result = DashboardUtils.prepareTendenciaData(dados);
            const emAndamento = result.datasets.find(d => d.label === 'em andamento');
            expect(emAndamento.data).toEqual([0]);
        });

        test('atribui cores corretas aos datasets', () => {
            const result = DashboardUtils.prepareTendenciaData([
                { mes: '2024-01', status: 'pendente', total: 1 }
            ]);
            const pendente = result.datasets.find(d => d.label === 'pendente');
            expect(pendente.borderColor).toBe('#ffc107');
            expect(pendente.backgroundColor).toBe('#ffc10733');
        });
    });

    // ===== Agrupamento de chamados abertos =====
    describe('groupAbertosProvedor', () => {
        test('agrupa por nome do provedor', () => {
            const dados = [
                { nome: 'ISP Alpha', categoria: 'usuario', total: 3 },
                { nome: 'ISP Alpha', categoria: 'app', total: 2 },
                { nome: 'ISP Beta', categoria: 'canal', total: 5 }
            ];
            const result = DashboardUtils.groupAbertosProvedor(dados);
            expect(result).toHaveLength(2);

            const alpha = result.find(r => r.nome === 'ISP Alpha');
            expect(alpha.total).toBe(5);
            expect(alpha.categorias).toHaveLength(2);

            const beta = result.find(r => r.nome === 'ISP Beta');
            expect(beta.total).toBe(5);
            expect(beta.categorias).toHaveLength(1);
        });

        test('retorna array vazio para dados vazios', () => {
            expect(DashboardUtils.groupAbertosProvedor([])).toEqual([]);
        });

        test('trata provedor unico com uma categoria', () => {
            const dados = [{ nome: 'ISP Unico', categoria: 'outro', total: 1 }];
            const result = DashboardUtils.groupAbertosProvedor(dados);
            expect(result).toHaveLength(1);
            expect(result[0].nome).toBe('ISP Unico');
            expect(result[0].total).toBe(1);
        });
    });

    // ===== Integridade das constantes =====
    describe('Constantes', () => {
        test('CORES tem 15 cores', () => {
            expect(DashboardUtils.CORES).toHaveLength(15);
        });

        test('todas as cores sao strings hex validas', () => {
            DashboardUtils.CORES.forEach(cor => {
                expect(cor).toMatch(/^#[0-9a-f]{6}$/i);
            });
        });

        test('CORES_CATEGORIA cobre todas as categorias com labelCategoria', () => {
            Object.keys(DashboardUtils.CORES_CATEGORIA).forEach(key => {
                const label = DashboardUtils.labelCategoria(key);
                expect(label).not.toBe(key);
            });
        });

        test('LABELS_STATUS_TREIN cobre todos os status de treinamento', () => {
            expect(DashboardUtils.LABELS_STATUS_TREIN).toHaveProperty('agendado');
            expect(DashboardUtils.LABELS_STATUS_TREIN).toHaveProperty('realizado');
            expect(DashboardUtils.LABELS_STATUS_TREIN).toHaveProperty('cancelado');
        });

        test('CORES_STATUS_PROJ tem mesmas chaves que LABELS_STATUS_PROJ', () => {
            const colorKeys = Object.keys(DashboardUtils.CORES_STATUS_PROJ).sort();
            const labelKeys = Object.keys(DashboardUtils.LABELS_STATUS_PROJ).sort();
            expect(colorKeys).toEqual(labelKeys);
        });

        test('LABELS_ERP cobre todos os ERPs suportados', () => {
            const expectedErps = ['ixc', 'hubsoft', 'sgp', 'atlaz', 'ispfy', 'mycore', 'mk_auth', 'radius_net', 'voalle', 'proprio'];
            expectedErps.forEach(erp => {
                expect(DashboardUtils.LABELS_ERP).toHaveProperty(erp);
            });
        });
    });
});
