/**
 * Script de importação - Acompanhamento de Clientes.xlsx → banco de dados
 * Execução única: node importar-planilha.js
 */

const XLSX = require('xlsx');
const path = require('path');
const { initDB, getDB } = require('./database');

const ARQUIVO = path.join('C:', 'Users', 'gaiam', 'Downloads', 'Acompanhamento de Clientes.xlsx');

// Mapeamento de planos
function mapearPlano(valor) {
    if (!valor) return null;
    const v = valor.toString().trim().toLowerCase();
    if (v.includes('liteplus') && v.includes('full')) return 'liteplus_full';
    if (v.includes('lite') && v.includes('full')) return 'liteplus_full';
    if (v.includes('liteplus') || v.includes('lite plus')) return 'zapping_lite_plus';
    if (v.includes('full')) return 'zapping_full';
    return null;
}

// Mapeamento de modelo de integração
function mapearModelo(valor) {
    if (!valor) return null;
    const v = valor.toString().trim().toLowerCase();
    if (v === 'cancelado' || v === 'cancelado ') return null;
    if (v === 'bundle') return 'bundle';
    if (v === 'hardbundle') return 'hardbundle';
    if (v === 'reseller') return 'reseller';
    if (v === 'hospitality') return 'hospitality';
    if (v === 'empresas') return 'empresas';
    return null;
}

// Mapeamento de ERP
function mapearERP(valor) {
    if (!valor) return null;
    const v = valor.toString().trim().toLowerCase().replace(/^-/, '');
    if (!v || v === '-' || v === '') return null;
    if (v === 'ixc') return 'ixc';
    if (v === 'hubsoft') return 'hubsoft';
    if (v === 'sgp') return 'sgp';
    if (v === 'atlaz') return 'atlaz';
    if (v === 'ispfy') return 'ispfy';
    if (v === 'mycore') return 'mycore';
    if (v.includes('radius')) return 'radius_net';
    if (v.includes('mk-auth') || v === 'mk auth') return 'mk_auth';
    if (v.includes('mk-solutions') || v === 'mk solutions') return 'mk_auth';
    if (v.includes('próprio') || v === 'proprio' || v === 'pr\u00f3prio') return 'proprio';
    if (v.includes('voalle')) return 'voalle';
    return null;
}

// Mapeamento de responsável
function mapearResponsavel(valor) {
    if (!valor) return null;
    const v = valor.toString().trim();
    if (v === 'Cancelado' || v === '') return null;
    // Normalizar nomes (remover espaços extras)
    const nome = v.replace(/\s+/g, ' ').trim();
    if (nome === 'Aline') return 'Aline';
    if (nome === 'Carla') return 'Carla';
    if (nome === 'Vinicius') return 'Vinicius';
    return nome; // Caso tenha outro nome
}

async function importar() {
    console.log('Iniciando importação...\n');
    console.log('Lendo planilha:', ARQUIVO);

    const wb = XLSX.readFile(ARQUIVO);
    const ws = wb.Sheets['Provedores'];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

    console.log(`Total de linhas na planilha: ${data.length - 1}\n`);

    // Inicializar banco
    await initDB();
    const db = getDB();

    // Verificar provedores já existentes
    const existentes = db.queryAll('SELECT nome FROM provedores');
    const nomesExistentes = new Set(existentes.map((p) => p.nome.toLowerCase().trim()));

    let importados = 0;
    let duplicados = 0;
    let ignorados = 0;
    let erros = 0;
    const detalhes = [];

    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const nome = row[5] ? row[5].toString().trim() : null;

        // Pular linhas sem nome
        if (!nome) {
            ignorados++;
            continue;
        }

        // Verificar duplicado
        if (nomesExistentes.has(nome.toLowerCase())) {
            duplicados++;
            detalhes.push(`[DUPLICADO] ${nome}`);
            continue;
        }

        const responsavel = mapearResponsavel(row[0]);
        const modelo_integracao = mapearModelo(row[9]);
        const erp = mapearERP(row[13]);
        const plano = mapearPlano(row[14]);

        try {
            db.queryRun(
                'INSERT INTO provedores (nome, plano, modelo_integracao, erp, responsavel) VALUES (?, ?, ?, ?, ?)',
                [nome, plano, modelo_integracao, erp, responsavel]
            );
            nomesExistentes.add(nome.toLowerCase());
            importados++;
            detalhes.push(
                `[OK] ${nome} | Resp: ${responsavel || '-'} | Plano: ${plano || '-'} | Modelo: ${modelo_integracao || '-'} | ERP: ${erp || '-'}`
            );
        } catch (err) {
            erros++;
            detalhes.push(`[ERRO] ${nome}: ${err.message}`);
        }
    }

    console.log('='.repeat(60));
    console.log('RESULTADO DA IMPORTAÇÃO');
    console.log('='.repeat(60));
    console.log(`Importados com sucesso: ${importados}`);
    console.log(`Duplicados (já existiam): ${duplicados}`);
    console.log(`Ignorados (sem nome): ${ignorados}`);
    console.log(`Erros: ${erros}`);
    console.log(`Total processado: ${importados + duplicados + ignorados + erros}`);
    console.log('='.repeat(60));

    if (detalhes.length > 0) {
        console.log('\nDetalhes:');
        detalhes.forEach((d) => console.log('  ' + d));
    }

    console.log('\nImportação concluída!');
}

importar().catch((err) => {
    console.error('Erro fatal:', err);
    process.exit(1);
});
