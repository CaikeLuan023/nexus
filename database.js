const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'data.db');

let db;

async function initDB() {
    const SQL = await initSqlJs();

    // Carregar banco existente ou criar novo
    if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
    } else {
        db = new SQL.Database();
    }

    db.run('PRAGMA foreign_keys = ON');

    db.run(`
        CREATE TABLE IF NOT EXISTS provedores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL UNIQUE,
            contato TEXT,
            observacoes TEXT,
            criado_em TEXT DEFAULT (datetime('now', 'localtime'))
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS treinamentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provedor_id INTEGER NOT NULL,
            titulo TEXT NOT NULL,
            descricao TEXT,
            data_treinamento TEXT NOT NULL,
            criado_em TEXT DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (provedor_id) REFERENCES provedores(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS projetos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            titulo TEXT NOT NULL,
            descricao TEXT,
            provedor_id INTEGER,
            status TEXT DEFAULT 'em_andamento',
            prioridade TEXT DEFAULT 'media',
            data_inicio TEXT NOT NULL,
            data_previsao TEXT,
            criado_em TEXT DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (provedor_id) REFERENCES provedores(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS chamados (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provedor_id INTEGER NOT NULL,
            titulo TEXT NOT NULL,
            descricao TEXT,
            categoria TEXT NOT NULL,
            status TEXT DEFAULT 'pendente',
            data_abertura TEXT DEFAULT (datetime('now', 'localtime')),
            data_resolucao TEXT,
            resolucao TEXT,
            criado_em TEXT DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (provedor_id) REFERENCES provedores(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS anexos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chamado_id INTEGER NOT NULL,
            nome_arquivo TEXT NOT NULL,
            caminho TEXT NOT NULL,
            tipo_mime TEXT,
            tamanho INTEGER,
            criado_em TEXT DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (chamado_id) REFERENCES chamados(id) ON DELETE CASCADE
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            usuario TEXT NOT NULL UNIQUE,
            senha TEXT NOT NULL,
            perfil TEXT NOT NULL DEFAULT 'analista',
            ativo INTEGER NOT NULL DEFAULT 1,
            criado_em TEXT DEFAULT (datetime('now', 'localtime'))
        )
    `);

    // Tabela: templates de mensagem WhatsApp
    db.run(`
        CREATE TABLE IF NOT EXISTS whatsapp_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            texto TEXT NOT NULL,
            categoria TEXT DEFAULT 'geral',
            criado_em TEXT DEFAULT (datetime('now', 'localtime'))
        )
    `);

    // Tabela: respostas automaticas (bot)
    db.run(`
        CREATE TABLE IF NOT EXISTS whatsapp_auto_respostas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            palavra_chave TEXT NOT NULL,
            resposta TEXT NOT NULL,
            ativo INTEGER NOT NULL DEFAULT 1,
            criado_em TEXT DEFAULT (datetime('now', 'localtime'))
        )
    `);

    // Tabela: configuracoes de notificacoes automaticas
    db.run(`
        CREATE TABLE IF NOT EXISTS whatsapp_notificacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT NOT NULL,
            ativo INTEGER NOT NULL DEFAULT 1,
            chat_id TEXT,
            mensagem_template TEXT,
            criado_em TEXT DEFAULT (datetime('now', 'localtime'))
        )
    `);

    // Tabela: vinculacao WhatsApp ↔ Provedores
    db.run(`
        CREATE TABLE IF NOT EXISTS whatsapp_provedores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provedor_id INTEGER NOT NULL UNIQUE,
            chat_id TEXT NOT NULL,
            criado_em TEXT DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (provedor_id) REFERENCES provedores(id) ON DELETE CASCADE
        )
    `);

    // Tabela: mensagens agendadas
    db.run(`
        CREATE TABLE IF NOT EXISTS whatsapp_agendamentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id TEXT NOT NULL,
            chat_nome TEXT,
            texto TEXT NOT NULL,
            data_envio TEXT NOT NULL,
            status TEXT DEFAULT 'pendente',
            criado_em TEXT DEFAULT (datetime('now', 'localtime'))
        )
    `);

    // Tabela: metricas WhatsApp
    db.run(`
        CREATE TABLE IF NOT EXISTS whatsapp_metricas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT NOT NULL,
            chat_id TEXT,
            chat_nome TEXT,
            timestamp TEXT DEFAULT (datetime('now', 'localtime'))
        )
    `);

    db.run('CREATE INDEX IF NOT EXISTS idx_whatsapp_provedores ON whatsapp_provedores(chat_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_whatsapp_agendamentos_status ON whatsapp_agendamentos(status)');
    db.run('CREATE INDEX IF NOT EXISTS idx_whatsapp_metricas_tipo ON whatsapp_metricas(tipo)');

    db.run('CREATE INDEX IF NOT EXISTS idx_chamados_provedor ON chamados(provedor_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_chamados_categoria ON chamados(categoria)');
    db.run('CREATE INDEX IF NOT EXISTS idx_chamados_status ON chamados(status)');
    db.run('CREATE INDEX IF NOT EXISTS idx_anexos_chamado ON anexos(chamado_id)');

    // Seed: criar admin se nao existir
    const adminExists = db.exec("SELECT COUNT(*) FROM usuarios WHERE usuario = 'caike.luan'");
    const adminCount = adminExists.length > 0 ? adminExists[0].values[0][0] : 0;
    if (adminCount === 0) {
        const tempPassword = require('crypto').randomBytes(8).toString('hex');
        const senhaHash = bcrypt.hashSync(tempPassword, 10);
        db.run('INSERT INTO usuarios (nome, usuario, senha, perfil, ativo) VALUES (?, ?, ?, ?, ?)', [
            'Caike Luan',
            'caike.luan',
            senhaHash,
            'admin',
            1
        ]);
        console.log('==============================================');
        console.log('  Admin criado: caike.luan');
        console.log(`  Senha temporaria: ${tempPassword}`);
        console.log('  TROQUE ESTA SENHA IMEDIATAMENTE!');
        console.log('==============================================');
    }

    // Migração: novas colunas na tabela provedores
    const colunas = db.exec('PRAGMA table_info(provedores)');
    const nomesColunas = colunas.length > 0 ? colunas[0].values.map((c) => c[1]) : [];

    if (!nomesColunas.includes('plano')) {
        db.run('ALTER TABLE provedores ADD COLUMN plano TEXT');
    }
    if (!nomesColunas.includes('adicionais')) {
        db.run('ALTER TABLE provedores ADD COLUMN adicionais TEXT');
    }
    if (!nomesColunas.includes('modelo_integracao')) {
        db.run('ALTER TABLE provedores ADD COLUMN modelo_integracao TEXT');
    }
    if (!nomesColunas.includes('erp')) {
        db.run('ALTER TABLE provedores ADD COLUMN erp TEXT');
    }
    if (!nomesColunas.includes('responsavel')) {
        db.run('ALTER TABLE provedores ADD COLUMN responsavel TEXT');
    }
    if (!nomesColunas.includes('logo_url')) {
        db.run('ALTER TABLE provedores ADD COLUMN logo_url TEXT');
    }

    // Migração: colunas status e hora na tabela treinamentos
    const colTreinamentos = db.exec('PRAGMA table_info(treinamentos)');
    const nomeColTreinamentos = colTreinamentos.length > 0 ? colTreinamentos[0].values.map((c) => c[1]) : [];
    if (!nomeColTreinamentos.includes('status')) {
        db.run("ALTER TABLE treinamentos ADD COLUMN status TEXT DEFAULT 'agendado'");
    }
    if (!nomeColTreinamentos.includes('hora_treinamento')) {
        db.run('ALTER TABLE treinamentos ADD COLUMN hora_treinamento TEXT');
    }
    // Corrigir registros existentes com status NULL
    db.run("UPDATE treinamentos SET status = 'agendado' WHERE status IS NULL");

    // Migração: coluna provedor_manual na tabela projetos
    const colProjetos = db.exec('PRAGMA table_info(projetos)');
    const nomeColProjetos = colProjetos.length > 0 ? colProjetos[0].values.map((c) => c[1]) : [];
    if (!nomeColProjetos.includes('provedor_manual')) {
        db.run('ALTER TABLE projetos ADD COLUMN provedor_manual TEXT');
    }

    // Migração: coluna whatsapp na tabela provedores (numero de telefone)
    if (!nomesColunas.includes('whatsapp')) {
        db.run('ALTER TABLE provedores ADD COLUMN whatsapp TEXT');
    }

    // Migração: coluna token_integracao na tabela provedores
    if (!nomesColunas.includes('token_integracao')) {
        db.run('ALTER TABLE provedores ADD COLUMN token_integracao TEXT');
    }

    // Migração: colunas LGPD na tabela provedores (cnpj, email, telefone, endereco)
    if (!nomesColunas.includes('cnpj')) {
        db.run('ALTER TABLE provedores ADD COLUMN cnpj TEXT');
    }
    if (!nomesColunas.includes('email')) {
        db.run('ALTER TABLE provedores ADD COLUMN email TEXT');
    }
    if (!nomesColunas.includes('telefone')) {
        db.run('ALTER TABLE provedores ADD COLUMN telefone TEXT');
    }
    if (!nomesColunas.includes('endereco')) {
        db.run('ALTER TABLE provedores ADD COLUMN endereco TEXT');
    }

    // Migração: coluna id_externo na tabela provedores (ID do cliente no ERP)
    if (!nomesColunas.includes('id_externo')) {
        db.run('ALTER TABLE provedores ADD COLUMN id_externo TEXT');
    }

    // ==================== VENDAS: TABELAS ====================

    // Pipeline CRM - Negocios/Oportunidades
    db.run(`
        CREATE TABLE IF NOT EXISTS vendas_negocios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provedor_id INTEGER,
            provedor_nome_lead TEXT,
            contato_lead TEXT,
            estagio TEXT DEFAULT 'lead',
            plano_interesse TEXT,
            valor_estimado REAL DEFAULT 0,
            responsavel_vendedor TEXT NOT NULL,
            origem TEXT,
            observacoes TEXT,
            motivo_perda TEXT,
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            atualizado_em TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (provedor_id) REFERENCES provedores(id)
        )
    `);

    // Interacoes/Notas por negocio
    db.run(`
        CREATE TABLE IF NOT EXISTS vendas_interacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            negocio_id INTEGER NOT NULL,
            tipo TEXT DEFAULT 'nota',
            descricao TEXT NOT NULL,
            criado_por TEXT,
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (negocio_id) REFERENCES vendas_negocios(id) ON DELETE CASCADE
        )
    `);

    // Metas de vendas por vendedor/periodo
    db.run(`
        CREATE TABLE IF NOT EXISTS vendas_metas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vendedor TEXT NOT NULL,
            tipo_meta TEXT NOT NULL,
            valor_alvo REAL NOT NULL,
            percentual_comissao REAL DEFAULT 0,
            periodo_referencia TEXT NOT NULL,
            criado_em TEXT DEFAULT (datetime('now','localtime'))
        )
    `);

    // Tarefas/Agenda de follow-up
    db.run(`
        CREATE TABLE IF NOT EXISTS vendas_tarefas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            titulo TEXT NOT NULL,
            descricao TEXT,
            provedor_id INTEGER,
            negocio_id INTEGER,
            tipo TEXT DEFAULT 'follow_up',
            data_hora TEXT NOT NULL,
            status TEXT DEFAULT 'pendente',
            responsavel TEXT NOT NULL,
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (provedor_id) REFERENCES provedores(id),
            FOREIGN KEY (negocio_id) REFERENCES vendas_negocios(id)
        )
    `);

    // Controle de visitas
    db.run(`
        CREATE TABLE IF NOT EXISTS vendas_visitas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provedor_id INTEGER NOT NULL,
            negocio_id INTEGER,
            data_visita TEXT NOT NULL,
            hora_visita TEXT,
            tipo_visita TEXT DEFAULT 'presencial',
            status TEXT DEFAULT 'agendada',
            endereco TEXT,
            observacoes TEXT,
            resultado TEXT,
            responsavel TEXT NOT NULL,
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (provedor_id) REFERENCES provedores(id),
            FOREIGN KEY (negocio_id) REFERENCES vendas_negocios(id)
        )
    `);

    db.run('CREATE INDEX IF NOT EXISTS idx_vendas_negocios_estagio ON vendas_negocios(estagio)');
    db.run('CREATE INDEX IF NOT EXISTS idx_vendas_negocios_responsavel ON vendas_negocios(responsavel_vendedor)');
    db.run('CREATE INDEX IF NOT EXISTS idx_vendas_tarefas_responsavel ON vendas_tarefas(responsavel)');
    db.run('CREATE INDEX IF NOT EXISTS idx_vendas_tarefas_status ON vendas_tarefas(status)');
    db.run('CREATE INDEX IF NOT EXISTS idx_vendas_visitas_responsavel ON vendas_visitas(responsavel)');
    db.run('CREATE INDEX IF NOT EXISTS idx_vendas_metas_vendedor ON vendas_metas(vendedor)');

    // ==================== PROPOSTAS + FORMULARIOS ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS vendas_propostas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            negocio_id INTEGER,
            provedor_id INTEGER,
            provedor_nome TEXT NOT NULL,
            titulo TEXT NOT NULL,
            planos TEXT,
            valor_total REAL DEFAULT 0,
            condicoes TEXT,
            validade_dias INTEGER DEFAULT 30,
            status TEXT DEFAULT 'rascunho',
            enviada_via TEXT,
            email_destino TEXT,
            whatsapp_destino TEXT,
            pdf_caminho TEXT,
            pdf_token TEXT,
            criado_por TEXT NOT NULL,
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            atualizado_em TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (negocio_id) REFERENCES vendas_negocios(id),
            FOREIGN KEY (provedor_id) REFERENCES provedores(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS formularios_cadastro (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            proposta_id INTEGER,
            provedor_nome TEXT NOT NULL,
            token TEXT NOT NULL UNIQUE,
            dados TEXT,
            status TEXT DEFAULT 'pendente',
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            preenchido_em TEXT,
            FOREIGN KEY (proposta_id) REFERENCES vendas_propostas(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS config_email (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            smtp_host TEXT DEFAULT 'smtp.gmail.com',
            smtp_port INTEGER DEFAULT 587,
            smtp_user TEXT,
            smtp_pass TEXT,
            nome_remetente TEXT DEFAULT 'Nexus',
            ativo INTEGER DEFAULT 0
        )
    `);

    db.run('CREATE INDEX IF NOT EXISTS idx_propostas_negocio ON vendas_propostas(negocio_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_propostas_status ON vendas_propostas(status)');
    db.run('CREATE INDEX IF NOT EXISTS idx_formularios_token ON formularios_cadastro(token)');

    // Migracao: pdf_token em vendas_propostas
    try {
        db.run('ALTER TABLE vendas_propostas ADD COLUMN pdf_token TEXT');
    } catch {}
    db.run('CREATE INDEX IF NOT EXISTS idx_propostas_pdf_token ON vendas_propostas(pdf_token)');

    // ==================== TEMPLATES DE PROPOSTA ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS vendas_templates_proposta (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            planos TEXT,
            condicoes TEXT,
            validade_dias INTEGER DEFAULT 30,
            criado_por TEXT NOT NULL,
            criado_em TEXT DEFAULT (datetime('now','localtime'))
        )
    `);

    // ==================== RASTREAMENTO DE PROPOSTA ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS vendas_propostas_views (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            proposta_id INTEGER NOT NULL,
            ip TEXT,
            user_agent TEXT,
            visualizado_em TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (proposta_id) REFERENCES vendas_propostas(id) ON DELETE CASCADE
        )
    `);

    db.run('CREATE INDEX IF NOT EXISTS idx_propostas_views ON vendas_propostas_views(proposta_id)');

    // ==================== COMISSOES ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS vendas_comissoes_regras (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vendedor TEXT NOT NULL,
            tipo TEXT NOT NULL,
            percentual REAL NOT NULL DEFAULT 0,
            valor_fixo REAL DEFAULT 0,
            plano_filtro TEXT,
            ativo INTEGER DEFAULT 1,
            criado_em TEXT DEFAULT (datetime('now','localtime'))
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS vendas_comissoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vendedor TEXT NOT NULL,
            negocio_id INTEGER,
            proposta_id INTEGER,
            descricao TEXT,
            valor_base REAL DEFAULT 0,
            percentual REAL DEFAULT 0,
            valor_comissao REAL DEFAULT 0,
            periodo TEXT,
            status TEXT DEFAULT 'pendente',
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (negocio_id) REFERENCES vendas_negocios(id),
            FOREIGN KEY (proposta_id) REFERENCES vendas_propostas(id)
        )
    `);

    db.run('CREATE INDEX IF NOT EXISTS idx_comissoes_vendedor ON vendas_comissoes(vendedor)');
    db.run('CREATE INDEX IF NOT EXISTS idx_comissoes_periodo ON vendas_comissoes(periodo)');
    db.run('CREATE INDEX IF NOT EXISTS idx_comissoes_regras_vendedor ON vendas_comissoes_regras(vendedor)');

    // ==================== FOLLOW-UP AUTOMATICO ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS vendas_followup_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT NOT NULL UNIQUE,
            dias_apos INTEGER DEFAULT 3,
            ativo INTEGER DEFAULT 1,
            mensagem TEXT,
            criado_em TEXT DEFAULT (datetime('now','localtime'))
        )
    `);

    // Seed follow-up configs
    const fupCount = db.exec('SELECT COUNT(*) FROM vendas_followup_config');
    if (fupCount.length > 0 && fupCount[0].values[0][0] === 0) {
        db.run(
            "INSERT INTO vendas_followup_config (tipo, dias_apos, ativo, mensagem) VALUES ('proposta_sem_resposta', 3, 1, 'Follow-up: proposta enviada há {dias} dias sem resposta')"
        );
        db.run(
            "INSERT INTO vendas_followup_config (tipo, dias_apos, ativo, mensagem) VALUES ('proposta_expirando', 5, 1, 'Alerta: proposta expira em {dias} dias')"
        );
        db.run(
            "INSERT INTO vendas_followup_config (tipo, dias_apos, ativo, mensagem) VALUES ('formulario_preenchido', 0, 1, 'Formulário preenchido por {provedor}')"
        );
    }

    // Migracao: visualizacoes em vendas_propostas
    try {
        db.run('ALTER TABLE vendas_propostas ADD COLUMN visualizacoes INTEGER DEFAULT 0');
    } catch {}

    // ==================== PERMISSOES POR PERFIL ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS permissoes_modulos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            perfil TEXT NOT NULL,
            modulo TEXT NOT NULL,
            ativo INTEGER NOT NULL DEFAULT 1,
            atualizado_em TEXT DEFAULT (datetime('now','localtime')),
            UNIQUE(perfil, modulo)
        )
    `);

    // Seed: permissoes padrao por perfil
    const modulos = [
        'dashboard',
        'provedores',
        'vendas',
        'dashboard_vendedor',
        'chamados',
        'treinamentos',
        'projetos',
        'historico',
        'whatsapp',
        'relatorios',
        'conhecimento',
        'agenda',
        'financeiro',
        'usuarios',
        'configuracoes',
        'ponto',
        'sherlock',
        'ordens_servico'
    ];
    const perfilDefaults = {
        admin: modulos.reduce((acc, m) => ({ ...acc, [m]: 1 }), {}),
        analista: modulos.reduce(
            (acc, m) => ({ ...acc, [m]: ['vendas', 'dashboard_vendedor', 'configuracoes'].includes(m) ? 0 : 1 }),
            {}
        ),
        vendedor: {
            dashboard: 1,
            provedores: 1,
            vendas: 1,
            dashboard_vendedor: 1,
            chamados: 0,
            treinamentos: 0,
            projetos: 0,
            historico: 0,
            whatsapp: 0,
            relatorios: 0,
            conhecimento: 0,
            agenda: 0,
            financeiro: 0,
            usuarios: 0,
            configuracoes: 0,
            ponto: 0,
            sherlock: 0,
            ordens_servico: 0
        },
        gestor_atendimento: {
            dashboard: 1,
            provedores: 0,
            vendas: 0,
            dashboard_vendedor: 0,
            chamados: 1,
            treinamentos: 0,
            projetos: 0,
            historico: 1,
            whatsapp: 1,
            relatorios: 1,
            conhecimento: 1,
            agenda: 1,
            financeiro: 0,
            usuarios: 1,
            configuracoes: 0,
            ponto: 1,
            sherlock: 1,
            ordens_servico: 1
        },
        gerente_noc: {
            dashboard: 1,
            provedores: 0,
            vendas: 0,
            dashboard_vendedor: 0,
            chamados: 1,
            treinamentos: 0,
            projetos: 1,
            historico: 1,
            whatsapp: 0,
            relatorios: 1,
            conhecimento: 1,
            agenda: 1,
            financeiro: 0,
            usuarios: 0,
            configuracoes: 0,
            ponto: 1,
            sherlock: 1,
            ordens_servico: 0
        },
        financeiro: {
            dashboard: 1,
            provedores: 0,
            vendas: 1,
            dashboard_vendedor: 0,
            chamados: 0,
            treinamentos: 0,
            projetos: 0,
            historico: 0,
            whatsapp: 0,
            relatorios: 1,
            conhecimento: 0,
            agenda: 0,
            financeiro: 1,
            usuarios: 0,
            configuracoes: 0,
            ponto: 1,
            sherlock: 1,
            ordens_servico: 0
        },
        atendente: {
            dashboard: 1,
            provedores: 0,
            vendas: 0,
            dashboard_vendedor: 0,
            chamados: 1,
            treinamentos: 0,
            projetos: 0,
            historico: 0,
            whatsapp: 1,
            relatorios: 0,
            conhecimento: 1,
            agenda: 0,
            financeiro: 0,
            usuarios: 0,
            configuracoes: 0,
            ponto: 1,
            sherlock: 0,
            ordens_servico: 1
        },
        tecnico_campo: {
            dashboard: 1,
            provedores: 0,
            vendas: 0,
            dashboard_vendedor: 0,
            chamados: 0,
            treinamentos: 0,
            projetos: 0,
            historico: 0,
            whatsapp: 0,
            relatorios: 0,
            conhecimento: 0,
            agenda: 0,
            financeiro: 0,
            usuarios: 0,
            configuracoes: 0,
            ponto: 1,
            sherlock: 0,
            ordens_servico: 1
        }
    };
    const permCount = db.exec('SELECT COUNT(*) FROM permissoes_modulos');
    if (permCount.length > 0 && permCount[0].values[0][0] === 0) {
        for (const [perfil, mods] of Object.entries(perfilDefaults)) {
            for (const [modulo, ativo] of Object.entries(mods)) {
                db.run('INSERT INTO permissoes_modulos (perfil, modulo, ativo) VALUES (?, ?, ?)', [
                    perfil,
                    modulo,
                    ativo
                ]);
            }
        }
    }

    // Migração: garantir que modulos novos existam para todos os perfis
    const perfis = ['admin', 'analista', 'vendedor', 'gestor_atendimento', 'gerente_noc', 'financeiro', 'atendente', 'tecnico_campo'];
    for (const perfil of perfis) {
        const defaults = perfilDefaults[perfil] || {};
        for (const modulo of modulos) {
            const exists = db.exec(
                `SELECT COUNT(*) FROM permissoes_modulos WHERE perfil = '${perfil}' AND modulo = '${modulo}'`
            );
            if (exists.length > 0 && exists[0].values[0][0] === 0) {
                const ativo = defaults[modulo] !== undefined ? defaults[modulo] : perfil === 'admin' ? 1 : 0;
                db.run('INSERT INTO permissoes_modulos (perfil, modulo, ativo) VALUES (?, ?, ?)', [
                    perfil,
                    modulo,
                    ativo
                ]);
            }
        }
    }

    // ==================== LOG DE ATIVIDADES (AUDIT TRAIL) ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS atividades_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER,
            usuario_nome TEXT,
            acao TEXT NOT NULL,
            modulo TEXT NOT NULL,
            entidade_id INTEGER,
            detalhes TEXT,
            ip TEXT,
            criado_em TEXT DEFAULT (datetime('now','localtime'))
        )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_atividades_modulo ON atividades_log(modulo)');
    db.run('CREATE INDEX IF NOT EXISTS idx_atividades_usuario ON atividades_log(usuario_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_atividades_data ON atividades_log(criado_em)');

    // ==================== CONFIGURACOES GERAIS ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS config_geral (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chave TEXT NOT NULL UNIQUE,
            valor TEXT,
            atualizado_em TEXT DEFAULT (datetime('now','localtime'))
        )
    `);

    // Seed config_geral
    const cfgCount = db.exec('SELECT COUNT(*) FROM config_geral');
    if (cfgCount.length > 0 && cfgCount[0].values[0][0] === 0) {
        db.run("INSERT INTO config_geral (chave, valor) VALUES ('nome_sistema', 'Nexus')");
        db.run("INSERT INTO config_geral (chave, valor) VALUES ('logo_url', '')");
        db.run("INSERT INTO config_geral (chave, valor) VALUES ('timezone', 'America/Sao_Paulo')");
        db.run("INSERT INTO config_geral (chave, valor) VALUES ('itens_por_pagina', '20')");
        db.run("INSERT INTO config_geral (chave, valor) VALUES ('backup_automatico', '0')");
    }

    // ==================== NOTIFICACOES INTERNAS ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS notificacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER NOT NULL,
            tipo TEXT NOT NULL,
            titulo TEXT NOT NULL,
            mensagem TEXT,
            link TEXT,
            lida INTEGER DEFAULT 0,
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
        )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_notificacoes_usuario ON notificacoes(usuario_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_notificacoes_lida ON notificacoes(usuario_id, lida)');

    // ==================== COMENTARIOS ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS comentarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entidade_tipo TEXT NOT NULL,
            entidade_id INTEGER NOT NULL,
            usuario_id INTEGER NOT NULL,
            usuario_nome TEXT NOT NULL,
            texto TEXT NOT NULL,
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_comentarios_entidade ON comentarios(entidade_tipo, entidade_id)');

    // ==================== ANEXOS PROJETOS E TREINAMENTOS ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS anexos_projetos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            projeto_id INTEGER NOT NULL,
            nome_arquivo TEXT NOT NULL,
            caminho TEXT NOT NULL,
            tipo_mime TEXT,
            tamanho INTEGER,
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (projeto_id) REFERENCES projetos(id) ON DELETE CASCADE
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS anexos_treinamentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            treinamento_id INTEGER NOT NULL,
            nome_arquivo TEXT NOT NULL,
            caminho TEXT NOT NULL,
            tipo_mime TEXT,
            tamanho INTEGER,
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (treinamento_id) REFERENCES treinamentos(id) ON DELETE CASCADE
        )
    `);

    // ==================== MIGRACOES LOTE 1 ====================

    // Atribuicao de responsavel
    try {
        db.run('ALTER TABLE chamados ADD COLUMN responsavel_id INTEGER');
    } catch {}
    try {
        db.run('ALTER TABLE projetos ADD COLUMN responsavel_id INTEGER');
    } catch {}

    // ==================== BACKUPS LOG ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS backups_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome_arquivo TEXT NOT NULL,
            tamanho INTEGER,
            tipo TEXT DEFAULT 'manual',
            criado_por TEXT,
            criado_em TEXT DEFAULT (datetime('now','localtime'))
        )
    `);

    // ==================== 2FA ====================

    try {
        db.run('ALTER TABLE usuarios ADD COLUMN totp_secret TEXT');
    } catch {}
    try {
        db.run('ALTER TABLE usuarios ADD COLUMN totp_ativo INTEGER DEFAULT 0');
    } catch {}
    try {
        db.run('ALTER TABLE usuarios ADD COLUMN foto_url TEXT');
    } catch {}
    try {
        db.run('ALTER TABLE usuarios ADD COLUMN session_token TEXT');
    } catch {}

    // ==================== CHAT INTERNO ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS chat_mensagens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            remetente_id INTEGER NOT NULL,
            destinatario_id INTEGER NOT NULL,
            texto TEXT NOT NULL,
            lido INTEGER DEFAULT 0,
            criado_em TEXT DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (remetente_id) REFERENCES usuarios(id),
            FOREIGN KEY (destinatario_id) REFERENCES usuarios(id)
        )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_chat_dest ON chat_mensagens(destinatario_id, lido)');
    db.run('CREATE INDEX IF NOT EXISTS idx_chat_conv ON chat_mensagens(remetente_id, destinatario_id)');

    // ==================== CONTRATOS ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS vendas_contratos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            negocio_id INTEGER,
            proposta_id INTEGER,
            provedor_id INTEGER,
            provedor_nome TEXT NOT NULL,
            numero_contrato TEXT,
            titulo TEXT NOT NULL,
            conteudo TEXT,
            valor_mensal REAL,
            valor_total REAL,
            data_inicio TEXT,
            data_fim TEXT,
            status TEXT DEFAULT 'pendente',
            assinado_em TEXT,
            assinatura_ip TEXT,
            assinatura_nome TEXT,
            assinatura_token TEXT UNIQUE,
            pdf_caminho TEXT,
            responsavel TEXT NOT NULL,
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (negocio_id) REFERENCES vendas_negocios(id),
            FOREIGN KEY (proposta_id) REFERENCES vendas_propostas(id),
            FOREIGN KEY (provedor_id) REFERENCES provedores(id)
        )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_contratos_status ON vendas_contratos(status)');
    db.run('CREATE INDEX IF NOT EXISTS idx_contratos_token ON vendas_contratos(assinatura_token)');

    // ==================== CONFIG IXC (legado) ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS config_ixc (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url_base TEXT NOT NULL,
            token TEXT NOT NULL,
            ativo INTEGER DEFAULT 1,
            ultimo_sync TEXT,
            criado_em TEXT DEFAULT (datetime('now','localtime'))
        )
    `);

    // ==================== CONFIG ERP (unificado) ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS config_erp (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT NOT NULL,
            url_base TEXT NOT NULL,
            token TEXT,
            extras TEXT,
            ativo INTEGER DEFAULT 1,
            ultimo_sync TEXT,
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            UNIQUE(tipo)
        )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_config_erp_tipo ON config_erp(tipo)');

    // Migracao: copiar config_ixc existente para config_erp
    try {
        const ixcExiste = db.exec(
            'SELECT id, url_base, token, ativo, ultimo_sync FROM config_ixc ORDER BY id DESC LIMIT 1'
        );
        if (ixcExiste.length > 0 && ixcExiste[0].values.length > 0) {
            const jaTemIxc = db.exec("SELECT id FROM config_erp WHERE tipo = 'ixc'");
            if (jaTemIxc.length === 0 || jaTemIxc[0].values.length === 0) {
                const row = ixcExiste[0].values[0];
                db.run(
                    "INSERT OR IGNORE INTO config_erp (tipo, url_base, token, ativo, ultimo_sync) VALUES ('ixc', ?, ?, ?, ?)",
                    [row[1], row[2], row[3], row[4]]
                );
            }
        }
    } catch (e) {
        /* config_ixc pode nao existir ainda */
    }

    // ==================== REGRAS AUTOMATICAS ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS regras_automaticas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            ativo INTEGER DEFAULT 1,
            tipo_gatilho TEXT NOT NULL,
            condicao_valor TEXT,
            acao TEXT NOT NULL,
            acao_config TEXT,
            ultima_execucao TEXT,
            criado_por TEXT,
            criado_em TEXT DEFAULT (datetime('now','localtime'))
        )
    `);

    // ==================== TAREFAS RECORRENTES ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS tarefas_recorrentes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            titulo TEXT NOT NULL,
            descricao TEXT,
            modulo TEXT NOT NULL,
            frequencia TEXT NOT NULL,
            dia_semana INTEGER,
            dia_mes INTEGER,
            hora TEXT,
            config TEXT,
            ativo INTEGER DEFAULT 1,
            proxima_execucao TEXT,
            ultima_execucao TEXT,
            criado_por TEXT,
            criado_em TEXT DEFAULT (datetime('now','localtime'))
        )
    `);

    // ==================== API TOKENS E WEBHOOKS ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS api_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            token TEXT NOT NULL UNIQUE,
            ativo INTEGER DEFAULT 1,
            permissoes TEXT,
            ultimo_uso TEXT,
            criado_por TEXT,
            criado_em TEXT DEFAULT (datetime('now','localtime'))
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS webhooks_saida (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            url TEXT NOT NULL,
            eventos TEXT NOT NULL,
            secret TEXT,
            ativo INTEGER DEFAULT 1,
            ultimo_disparo TEXT,
            criado_por TEXT,
            criado_em TEXT DEFAULT (datetime('now','localtime'))
        )
    `);

    // ==================== DASHBOARD WIDGETS ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS dashboard_widgets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER NOT NULL,
            widget_tipo TEXT NOT NULL,
            posicao INTEGER DEFAULT 0,
            largura INTEGER DEFAULT 6,
            visivel INTEGER DEFAULT 1,
            config TEXT,
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
        )
    `);

    // Seed: config email desativado
    const emailCfg = db.exec('SELECT COUNT(*) FROM config_email');
    if (emailCfg.length > 0 && emailCfg[0].values[0][0] === 0) {
        db.run(
            "INSERT INTO config_email (smtp_host, smtp_port, nome_remetente, ativo) VALUES ('smtp.gmail.com', 587, 'Nexus', 0)"
        );
    }

    // Seed: templates padrao
    const tplCount = db.exec('SELECT COUNT(*) FROM whatsapp_templates');
    if (tplCount.length > 0 && tplCount[0].values[0][0] === 0) {
        const templates = [
            [
                'Chamado aberto',
                'Olá! Informamos que o chamado #{id} - "{titulo}" foi aberto para {provedor}. Categoria: {categoria}.',
                'chamados'
            ],
            [
                'Chamado resolvido',
                'Olá! O chamado #{id} - "{titulo}" foi resolvido. Resolução: {resolucao}',
                'chamados'
            ],
            [
                'Treinamento agendado',
                'Olá! Um treinamento foi agendado: "{titulo}" para {provedor} em {data} às {hora}.',
                'treinamentos'
            ],
            [
                'Lembrete de treinamento',
                'Lembrete: O treinamento "{titulo}" para {provedor} acontece amanhã às {hora}. Não esqueça!',
                'treinamentos'
            ],
            ['Projeto atualizado', 'Olá! O projeto "{titulo}" teve seu status alterado para: {status}.', 'projetos'],
            ['Saudação', 'Olá! Obrigado por entrar em contato com a Nexus. Como posso ajudar?', 'geral'],
            ['Encerramento', 'Obrigado pelo contato! Caso precise de algo mais, estamos à disposição.', 'geral']
        ];
        for (const [nome, texto, cat] of templates) {
            db.run('INSERT INTO whatsapp_templates (nome, texto, categoria) VALUES (?, ?, ?)', [nome, texto, cat]);
        }
    }

    // Seed: notificacoes padrao
    const notifCount = db.exec('SELECT COUNT(*) FROM whatsapp_notificacoes');
    if (notifCount.length > 0 && notifCount[0].values[0][0] === 0) {
        db.run('INSERT INTO whatsapp_notificacoes (tipo, ativo, mensagem_template) VALUES (?, ?, ?)', [
            'chamado_aberto',
            0,
            'Chamado #{id} aberto: {titulo} ({categoria}) - {provedor}'
        ]);
        db.run('INSERT INTO whatsapp_notificacoes (tipo, ativo, mensagem_template) VALUES (?, ?, ?)', [
            'chamado_resolvido',
            0,
            'Chamado #{id} resolvido: {titulo} - {resolucao}'
        ]);
        db.run('INSERT INTO whatsapp_notificacoes (tipo, ativo, mensagem_template) VALUES (?, ?, ?)', [
            'treinamento_agendado',
            0,
            'Treinamento agendado: {titulo} para {provedor} em {data} às {hora}'
        ]);
        db.run('INSERT INTO whatsapp_notificacoes (tipo, ativo, mensagem_template) VALUES (?, ?, ?)', [
            'projeto_atualizado',
            0,
            'Projeto atualizado: {titulo} - Novo status: {status}'
        ]);
    }

    // Tabela de mensagens WhatsApp (armazenamento local para busca e exportacao)
    db.run(`
        CREATE TABLE IF NOT EXISTS whatsapp_mensagens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id TEXT UNIQUE,
            chat_id TEXT NOT NULL,
            chat_name TEXT,
            from_me INTEGER DEFAULT 0,
            body TEXT,
            type TEXT DEFAULT 'chat',
            sender_name TEXT,
            media_url TEXT,
            filename TEXT,
            timestamp INTEGER,
            quoted_msg_id TEXT,
            quoted_msg_body TEXT,
            criado_em TEXT DEFAULT (datetime('now','localtime'))
        )
    `);
    // Index para busca rapida por chat_id
    try {
        db.run('CREATE INDEX IF NOT EXISTS idx_wa_msgs_chat ON whatsapp_mensagens(chat_id, timestamp)');
    } catch {}

    // ==================== SLA CONFIG ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS sla_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            categoria TEXT NOT NULL,
            prioridade TEXT DEFAULT 'normal',
            tempo_resposta_horas INTEGER NOT NULL DEFAULT 24,
            tempo_resolucao_horas INTEGER NOT NULL DEFAULT 72,
            ativo INTEGER DEFAULT 1,
            criado_em TEXT DEFAULT (datetime('now','localtime'))
        )
    `);

    // Migracao: adicionar campos SLA na tabela chamados
    try {
        db.run("ALTER TABLE chamados ADD COLUMN prioridade TEXT DEFAULT 'normal'");
    } catch {}
    try {
        db.run('ALTER TABLE chamados ADD COLUMN sla_resposta_limite TEXT');
    } catch {}
    try {
        db.run('ALTER TABLE chamados ADD COLUMN sla_resolucao_limite TEXT');
    } catch {}
    try {
        db.run('ALTER TABLE chamados ADD COLUMN sla_respondido_em TEXT');
    } catch {}
    try {
        db.run('ALTER TABLE chamados ADD COLUMN sla_estourado INTEGER DEFAULT 0');
    } catch {}
    try {
        db.run('ALTER TABLE chamados ADD COLUMN responsavel_id INTEGER');
    } catch {}

    // Seed: SLA padrao
    const slaCount = db.exec('SELECT COUNT(*) FROM sla_config');
    if (slaCount.length > 0 && slaCount[0].values[0][0] === 0) {
        db.run(
            "INSERT INTO sla_config (categoria, prioridade, tempo_resposta_horas, tempo_resolucao_horas) VALUES ('usuario', 'normal', 24, 72)"
        );
        db.run(
            "INSERT INTO sla_config (categoria, prioridade, tempo_resposta_horas, tempo_resolucao_horas) VALUES ('usuario', 'alta', 8, 24)"
        );
        db.run(
            "INSERT INTO sla_config (categoria, prioridade, tempo_resposta_horas, tempo_resolucao_horas) VALUES ('usuario', 'critica', 2, 8)"
        );
        db.run(
            "INSERT INTO sla_config (categoria, prioridade, tempo_resposta_horas, tempo_resolucao_horas) VALUES ('integracao', 'normal', 12, 48)"
        );
        db.run(
            "INSERT INTO sla_config (categoria, prioridade, tempo_resposta_horas, tempo_resolucao_horas) VALUES ('integracao', 'alta', 4, 12)"
        );
        db.run(
            "INSERT INTO sla_config (categoria, prioridade, tempo_resposta_horas, tempo_resolucao_horas) VALUES ('integracao', 'critica', 1, 4)"
        );
    }

    // ==================== ERP CONTRATOS (sincronizados do ERP) ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS erp_contratos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            erp_tipo TEXT NOT NULL,
            id_externo TEXT NOT NULL,
            cliente_id_externo TEXT,
            provedor_id INTEGER,
            plano TEXT,
            status TEXT,
            valor REAL DEFAULT 0,
            dados_raw TEXT,
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            atualizado_em TEXT DEFAULT (datetime('now','localtime')),
            UNIQUE(erp_tipo, id_externo)
        )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_erp_contratos_tipo ON erp_contratos(erp_tipo)');
    db.run('CREATE INDEX IF NOT EXISTS idx_erp_contratos_cliente ON erp_contratos(cliente_id_externo)');

    // ==================== ERP PLANOS (sincronizados do ERP) ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS erp_planos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            erp_tipo TEXT NOT NULL,
            id_externo TEXT NOT NULL,
            nome TEXT,
            valor REAL DEFAULT 0,
            dados_raw TEXT,
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            atualizado_em TEXT DEFAULT (datetime('now','localtime')),
            UNIQUE(erp_tipo, id_externo)
        )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_erp_planos_tipo ON erp_planos(erp_tipo)');

    // ==================== ERP SYNC LOG ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS erp_sync_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT NOT NULL,
            entidade TEXT NOT NULL,
            total_registros INTEGER DEFAULT 0,
            novos INTEGER DEFAULT 0,
            atualizados INTEGER DEFAULT 0,
            erros INTEGER DEFAULT 0,
            detalhes TEXT,
            duracao_ms INTEGER DEFAULT 0,
            criado_em TEXT DEFAULT (datetime('now','localtime'))
        )
    `);

    // Log detalhado de comunicacao ERP (request/response completos)
    db.run(`
        CREATE TABLE IF NOT EXISTS erp_communication_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            erp_tipo TEXT NOT NULL,
            erp_label TEXT,
            direcao TEXT NOT NULL DEFAULT 'outbound',
            metodo TEXT NOT NULL,
            url TEXT NOT NULL,
            request_headers TEXT,
            request_body TEXT,
            response_status INTEGER,
            response_headers TEXT,
            response_body TEXT,
            tempo_resposta_ms INTEGER DEFAULT 0,
            sucesso INTEGER DEFAULT 1,
            erro TEXT,
            contexto TEXT,
            criado_em TEXT DEFAULT (datetime('now','localtime'))
        )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_erp_comm_tipo ON erp_communication_log(erp_tipo)');
    db.run('CREATE INDEX IF NOT EXISTS idx_erp_comm_data ON erp_communication_log(criado_em)');
    db.run('CREATE INDEX IF NOT EXISTS idx_erp_comm_sucesso ON erp_communication_log(sucesso)');

    // ==================== BASE DE CONHECIMENTO ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS kb_categorias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            icone TEXT DEFAULT 'bi-folder',
            cor TEXT DEFAULT '#007bff',
            ordem INTEGER DEFAULT 0,
            criado_em TEXT DEFAULT (datetime('now','localtime'))
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS kb_artigos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            categoria_id INTEGER,
            titulo TEXT NOT NULL,
            conteudo TEXT NOT NULL,
            tags TEXT,
            visualizacoes INTEGER DEFAULT 0,
            autor_id INTEGER,
            publicado INTEGER DEFAULT 1,
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            atualizado_em TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (categoria_id) REFERENCES kb_categorias(id),
            FOREIGN KEY (autor_id) REFERENCES usuarios(id)
        )
    `);

    // ==================== AGENDA/CALENDARIO ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS agenda_eventos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            titulo TEXT NOT NULL,
            descricao TEXT,
            tipo TEXT NOT NULL DEFAULT 'evento',
            entidade_tipo TEXT,
            entidade_id INTEGER,
            data_inicio TEXT NOT NULL,
            data_fim TEXT,
            dia_inteiro INTEGER DEFAULT 0,
            cor TEXT DEFAULT '#007bff',
            lembrete_minutos INTEGER,
            usuario_id INTEGER,
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    `);

    // ==================== MODULO FINANCEIRO ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS financeiro_faturas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provedor_id INTEGER NOT NULL,
            descricao TEXT,
            valor REAL NOT NULL,
            tipo TEXT NOT NULL DEFAULT 'receita',
            status TEXT DEFAULT 'pendente',
            data_vencimento TEXT NOT NULL,
            data_pagamento TEXT,
            forma_pagamento TEXT,
            observacoes TEXT,
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (provedor_id) REFERENCES provedores(id)
        )
    `);
    try {
        db.run('CREATE INDEX IF NOT EXISTS idx_faturas_vencimento ON financeiro_faturas(data_vencimento)');
    } catch {}
    try {
        db.run('CREATE INDEX IF NOT EXISTS idx_faturas_status ON financeiro_faturas(status)');
    } catch {}

    // ==================== WHATSAPP IA ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS whatsapp_ia_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ativo INTEGER DEFAULT 0,
            provedor_ia TEXT DEFAULT 'openai',
            modelo TEXT DEFAULT 'gpt-3.5-turbo',
            api_key TEXT,
            prompt_sistema TEXT DEFAULT 'Voce e um assistente de suporte tecnico para provedores de internet. Responda de forma clara e objetiva.',
            max_tokens INTEGER DEFAULT 500,
            temperatura REAL DEFAULT 0.7,
            contexto_kb INTEGER DEFAULT 1,
            auto_responder INTEGER DEFAULT 0,
            criado_em TEXT DEFAULT (datetime('now','localtime'))
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS whatsapp_ia_historico (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id TEXT,
            chat_nome TEXT,
            mensagem_entrada TEXT,
            resposta_ia TEXT,
            classificacao TEXT,
            tokens_usados INTEGER DEFAULT 0,
            aprovado INTEGER DEFAULT 0,
            enviado INTEGER DEFAULT 0,
            criado_em TEXT DEFAULT (datetime('now','localtime'))
        )
    `);

    // ==================== WHATSAPP FLOW BUILDER ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS whatsapp_flows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            descricao TEXT,
            ativo INTEGER NOT NULL DEFAULT 0,
            dados_flow TEXT DEFAULT '{}',
            versao INTEGER DEFAULT 1,
            criado_por TEXT,
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            atualizado_em TEXT DEFAULT (datetime('now','localtime'))
        )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_flows_ativo ON whatsapp_flows(ativo)');

    db.run(`
        CREATE TABLE IF NOT EXISTS whatsapp_flow_sessoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            flow_id INTEGER NOT NULL,
            chat_id TEXT NOT NULL,
            chat_nome TEXT,
            node_atual TEXT,
            variaveis TEXT DEFAULT '{}',
            status TEXT DEFAULT 'ativo',
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            atualizado_em TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (flow_id) REFERENCES whatsapp_flows(id) ON DELETE CASCADE
        )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_flow_sessoes_chat ON whatsapp_flow_sessoes(chat_id, status)');
    db.run('CREATE INDEX IF NOT EXISTS idx_flow_sessoes_flow ON whatsapp_flow_sessoes(flow_id)');

    // ==================== FILA DE ATENDIMENTO WHATSAPP ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS whatsapp_atendimentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id TEXT NOT NULL,
            chat_nome TEXT,
            agente_id INTEGER,
            agente_nome TEXT,
            status TEXT NOT NULL DEFAULT 'fila',
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            atribuido_em TEXT,
            finalizado_em TEXT,
            tempo_espera_seg INTEGER DEFAULT 0,
            notas TEXT,
            FOREIGN KEY (agente_id) REFERENCES usuarios(id)
        )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_wa_atend_chat ON whatsapp_atendimentos(chat_id, status)');
    db.run('CREATE INDEX IF NOT EXISTS idx_wa_atend_agente ON whatsapp_atendimentos(agente_id, status)');
    db.run('CREATE INDEX IF NOT EXISTS idx_wa_atend_status ON whatsapp_atendimentos(status)');

    db.run(`
        CREATE TABLE IF NOT EXISTS whatsapp_atendimentos_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            atendimento_id INTEGER NOT NULL,
            acao TEXT NOT NULL,
            de_agente_id INTEGER,
            para_agente_id INTEGER,
            usuario_nome TEXT,
            detalhes TEXT,
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (atendimento_id) REFERENCES whatsapp_atendimentos(id)
        )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_wa_atend_log ON whatsapp_atendimentos_log(atendimento_id)');

    // Migracao: chats existentes sem atendimento entram na fila
    try {
        const existentes = db.exec(
            "SELECT DISTINCT chat_id, chat_name FROM whatsapp_mensagens WHERE chat_id NOT LIKE '%@g.us' AND chat_id NOT IN (SELECT chat_id FROM whatsapp_atendimentos WHERE status IN ('fila','em_atendimento'))"
        );
        if (existentes.length > 0 && existentes[0].values.length > 0) {
            const stmt = db.prepare(
                "INSERT OR IGNORE INTO whatsapp_atendimentos (chat_id, chat_nome, status) VALUES (?, ?, 'fila')"
            );
            for (const row of existentes[0].values) {
                stmt.run([row[0], row[1] || row[0].split('@')[0]]);
            }
            stmt.free();
        }
    } catch {}

    // ==================== MARCADOR DE PONTO ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS ponto_registros (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER NOT NULL,
            usuario_nome TEXT NOT NULL,
            tipo TEXT NOT NULL,
            data_hora TEXT DEFAULT (datetime('now','localtime')),
            ip TEXT,
            origem TEXT DEFAULT 'sistema',
            observacao TEXT,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_ponto_registros_usuario ON ponto_registros(usuario_id, data_hora)');

    db.run(`
        CREATE TABLE IF NOT EXISTS ponto_pausas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER NOT NULL,
            usuario_nome TEXT NOT NULL,
            motivo TEXT NOT NULL,
            inicio TEXT DEFAULT (datetime('now','localtime')),
            fim TEXT,
            duracao_min INTEGER DEFAULT 0,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_ponto_pausas_usuario ON ponto_pausas(usuario_id, inicio)');

    db.run(`
        CREATE TABLE IF NOT EXISTS ponto_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER UNIQUE NOT NULL,
            horario_entrada TEXT DEFAULT '08:00',
            horario_saida TEXT DEFAULT '18:00',
            almoco_inicio TEXT DEFAULT '12:00',
            almoco_duracao_min INTEGER DEFAULT 60,
            home_office INTEGER DEFAULT 0,
            carga_horaria_min INTEGER DEFAULT 480,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    `);

    // ==================== LGPD / AUDITORIA ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS lgpd_consentimentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entidade_tipo TEXT NOT NULL,
            entidade_id INTEGER NOT NULL,
            tipo_consentimento TEXT NOT NULL,
            consentido INTEGER DEFAULT 0,
            ip TEXT,
            data_consentimento TEXT,
            data_revogacao TEXT,
            criado_em TEXT DEFAULT (datetime('now','localtime'))
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS lgpd_retencao (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tabela TEXT NOT NULL,
            campo TEXT,
            tempo_retencao_dias INTEGER NOT NULL DEFAULT 365,
            acao TEXT DEFAULT 'anonimizar',
            ativo INTEGER DEFAULT 1,
            criado_em TEXT DEFAULT (datetime('now','localtime'))
        )
    `);

    // ==================== INTEGRACOES EXTERNAS ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS integracoes_externas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT NOT NULL,
            nome TEXT,
            config TEXT,
            ativo INTEGER DEFAULT 1,
            ultimo_uso TEXT,
            criado_em TEXT DEFAULT (datetime('now','localtime'))
        )
    `);

    // Migracao: adicionar campo prioridade nos projetos
    try {
        db.run("ALTER TABLE projetos ADD COLUMN prioridade TEXT DEFAULT 'normal'");
    } catch {}
    try {
        db.run('ALTER TABLE projetos ADD COLUMN percentual_conclusao INTEGER DEFAULT 0');
    } catch {}

    // ==================== NPS / PESQUISA DE SATISFACAO ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS nps_pesquisas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chamado_id INTEGER NOT NULL,
            provedor_id INTEGER NOT NULL,
            token TEXT NOT NULL UNIQUE,
            nota INTEGER,
            comentario TEXT,
            respondido INTEGER DEFAULT 0,
            respondido_em TEXT,
            enviado_via TEXT DEFAULT 'link',
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (chamado_id) REFERENCES chamados(id),
            FOREIGN KEY (provedor_id) REFERENCES provedores(id)
        )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_nps_chamado ON nps_pesquisas(chamado_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_nps_token ON nps_pesquisas(token)');
    db.run('CREATE INDEX IF NOT EXISTS idx_nps_provedor ON nps_pesquisas(provedor_id)');

    // ==================== FILA DE ATENDIMENTO CONFIG ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS fila_atendimento_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL DEFAULT 'Padrao',
            peso_prioridade REAL DEFAULT 3.0,
            peso_sla REAL DEFAULT 5.0,
            peso_tempo_espera REAL DEFAULT 2.0,
            peso_reaberturas REAL DEFAULT 1.0,
            ativo INTEGER DEFAULT 1,
            criado_em TEXT DEFAULT (datetime('now','localtime'))
        )
    `);

    // Seed: config padrao fila
    const filaCount = db.exec('SELECT COUNT(*) FROM fila_atendimento_config');
    if (filaCount.length > 0 && filaCount[0].values[0][0] === 0) {
        db.run(
            "INSERT INTO fila_atendimento_config (nome, peso_prioridade, peso_sla, peso_tempo_espera, peso_reaberturas) VALUES ('Padrao', 3.0, 5.0, 2.0, 1.0)"
        );
    }

    // Migracao: coluna reaberturas em chamados
    try {
        db.run('ALTER TABLE chamados ADD COLUMN reaberturas INTEGER DEFAULT 0');
    } catch {}

    // Seed: follow-up negocio_parado
    const fupNegocio = db.exec("SELECT COUNT(*) FROM vendas_followup_config WHERE tipo = 'negocio_parado'");
    if (fupNegocio.length > 0 && fupNegocio[0].values[0][0] === 0) {
        db.run(
            "INSERT INTO vendas_followup_config (tipo, dias_apos, ativo, mensagem) VALUES ('negocio_parado', 7, 1, 'Alerta: negocio \"{negocio}\" esta parado ha {dias} dias')"
        );
    }

    // Seed: follow-up negocio_sem_atividade
    const fupSemAtiv = db.exec("SELECT COUNT(*) FROM vendas_followup_config WHERE tipo = 'negocio_sem_atividade'");
    if (fupSemAtiv.length > 0 && fupSemAtiv[0].values[0][0] === 0) {
        db.run(
            "INSERT INTO vendas_followup_config (tipo, dias_apos, ativo, mensagem) VALUES ('negocio_sem_atividade', 14, 1, 'Negocio \"{negocio}\" sem nenhuma interacao ha {dias} dias')"
        );
    }

    // ==================== API REQUEST LOG ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS api_request_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            metodo TEXT NOT NULL,
            endpoint TEXT NOT NULL,
            status_code INTEGER,
            tempo_resposta_ms INTEGER,
            ip TEXT,
            user_agent TEXT,
            api_token_nome TEXT,
            erro TEXT,
            criado_em TEXT DEFAULT (datetime('now','localtime'))
        )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_api_log_endpoint ON api_request_log(endpoint)');
    db.run('CREATE INDEX IF NOT EXISTS idx_api_log_data ON api_request_log(criado_em)');
    db.run('CREATE INDEX IF NOT EXISTS idx_api_log_status ON api_request_log(status_code)');

    // ==================== WEBHOOK DISPATCH LOG ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS webhook_dispatch_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            webhook_id INTEGER,
            url TEXT NOT NULL,
            evento TEXT NOT NULL,
            payload TEXT,
            status_code INTEGER,
            resposta TEXT,
            tempo_resposta_ms INTEGER,
            sucesso INTEGER DEFAULT 0,
            erro TEXT,
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (webhook_id) REFERENCES webhooks_saida(id)
        )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_webhook_log_id ON webhook_dispatch_log(webhook_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_webhook_log_data ON webhook_dispatch_log(criado_em)');

    // ==================== SHERLOCK (IA ANALISE DE DADOS) ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS sherlock_conversas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER NOT NULL,
            titulo TEXT DEFAULT 'Nova conversa',
            ativo INTEGER DEFAULT 1,
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            atualizado_em TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
        )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_sherlock_conversas_usuario ON sherlock_conversas(usuario_id)');

    db.run(`
        CREATE TABLE IF NOT EXISTS sherlock_mensagens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversa_id INTEGER NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            conteudo TEXT NOT NULL,
            tokens_usados INTEGER DEFAULT 0,
            sql_executado TEXT,
            tempo_resposta_ms INTEGER DEFAULT 0,
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (conversa_id) REFERENCES sherlock_conversas(id) ON DELETE CASCADE
        )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_sherlock_mensagens_conversa ON sherlock_mensagens(conversa_id)');

    db.run(`
        CREATE TABLE IF NOT EXISTS sherlock_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ativo INTEGER DEFAULT 1,
            provedor TEXT DEFAULT 'gemini',
            api_key TEXT DEFAULT '',
            modelo TEXT DEFAULT 'gemini-2.5-flash',
            max_tokens INTEGER DEFAULT 4000,
            temperatura REAL DEFAULT 0.3,
            max_linhas_sql INTEGER DEFAULT 100,
            prompt_sistema_extra TEXT DEFAULT '',
            criado_em TEXT DEFAULT (datetime('now','localtime'))
        )
    `);
    // Migration: add provedor and api_key columns if missing
    try { db.run("ALTER TABLE sherlock_config ADD COLUMN provedor TEXT DEFAULT 'gemini'"); } catch(e) {}
    try { db.run("ALTER TABLE sherlock_config ADD COLUMN api_key TEXT DEFAULT ''"); } catch(e) {}
    // Seed config if empty
    const sherlockCfgCount = db.exec('SELECT COUNT(*) FROM sherlock_config');
    if (sherlockCfgCount.length > 0 && sherlockCfgCount[0].values[0][0] === 0) {
        db.run("INSERT INTO sherlock_config (ativo, provedor, modelo, max_tokens, temperatura, max_linhas_sql) VALUES (1, 'gemini', 'gemini-2.5-flash', 4000, 0.3, 100)");
    }

    // ==================== ORDENS DE SERVICO (tabelas) ====================

    db.run(`
        CREATE TABLE IF NOT EXISTS ordens_servico (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero TEXT NOT NULL UNIQUE,
            chamado_id INTEGER,
            criador_id INTEGER NOT NULL,
            tecnico_id INTEGER,
            cliente_nome TEXT NOT NULL,
            cliente_telefone TEXT,
            cliente_documento TEXT,
            endereco TEXT NOT NULL,
            endereco_complemento TEXT,
            latitude REAL,
            longitude REAL,
            tipo_servico TEXT NOT NULL,
            descricao TEXT,
            equipamentos TEXT,
            prioridade TEXT DEFAULT 'normal',
            status TEXT DEFAULT 'rascunho',
            observacoes_tecnico TEXT,
            data_agendamento TEXT,
            data_envio TEXT,
            data_aceite TEXT,
            data_inicio_deslocamento TEXT,
            data_inicio_execucao TEXT,
            data_conclusao TEXT,
            assinatura_base64 TEXT,
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            atualizado_em TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (chamado_id) REFERENCES chamados(id),
            FOREIGN KEY (criador_id) REFERENCES usuarios(id),
            FOREIGN KEY (tecnico_id) REFERENCES usuarios(id)
        )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_os_tecnico ON ordens_servico(tecnico_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_os_status ON ordens_servico(status)');
    db.run('CREATE INDEX IF NOT EXISTS idx_os_criador ON ordens_servico(criador_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_os_numero ON ordens_servico(numero)');

    db.run(`
        CREATE TABLE IF NOT EXISTS os_checklist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            os_id INTEGER NOT NULL,
            descricao TEXT NOT NULL,
            concluido INTEGER DEFAULT 0,
            concluido_em TEXT,
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (os_id) REFERENCES ordens_servico(id) ON DELETE CASCADE
        )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_os_checklist_os ON os_checklist(os_id)');

    db.run(`
        CREATE TABLE IF NOT EXISTS os_fotos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            os_id INTEGER NOT NULL,
            tipo TEXT NOT NULL,
            caminho TEXT NOT NULL,
            legenda TEXT,
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (os_id) REFERENCES ordens_servico(id) ON DELETE CASCADE
        )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_os_fotos_os ON os_fotos(os_id)');

    db.run(`
        CREATE TABLE IF NOT EXISTS os_mensagens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            os_id INTEGER NOT NULL,
            usuario_id INTEGER NOT NULL,
            texto TEXT NOT NULL,
            lido INTEGER DEFAULT 0,
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (os_id) REFERENCES ordens_servico(id) ON DELETE CASCADE,
            FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_os_mensagens_os ON os_mensagens(os_id)');

    db.run(`
        CREATE TABLE IF NOT EXISTS os_historico (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            os_id INTEGER NOT NULL,
            usuario_id INTEGER,
            usuario_nome TEXT,
            acao TEXT NOT NULL,
            de_status TEXT,
            para_status TEXT,
            detalhes TEXT,
            criado_em TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (os_id) REFERENCES ordens_servico(id) ON DELETE CASCADE
        )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_os_historico_os ON os_historico(os_id)');

    // ==================== SEED: BASE DE CONHECIMENTO ====================
    seedBaseConhecimento();

    saveDB();
    return db;
}

function seedBaseConhecimento() {
    const hasV2 = db.exec("SELECT COUNT(*) FROM kb_categorias WHERE nome = 'Integracoes ERP'");
    if (hasV2.length > 0 && hasV2[0].values[0][0] > 0) return;
    db.run('DELETE FROM kb_artigos');
    db.run('DELETE FROM kb_categorias');
    const kbSeed = require('./kb-seed');

    const categorias = [
        { nome: 'Primeiros Passos', icone: 'bi-rocket-takeoff', ordem: 1 },
        { nome: 'Dashboard', icone: 'bi-speedometer2', ordem: 2 },
        { nome: 'Chamados', icone: 'bi-headset', ordem: 3 },
        { nome: 'Atendimento WhatsApp', icone: 'bi-whatsapp', ordem: 4 },
        { nome: 'Vendas e Pipeline', icone: 'bi-cart', ordem: 5 },
        { nome: 'Projetos', icone: 'bi-kanban', ordem: 6 },
        { nome: 'Financeiro', icone: 'bi-currency-dollar', ordem: 7 },
        { nome: 'Marcador de Ponto', icone: 'bi-clock-history', ordem: 8 },
        { nome: 'Usuarios e Perfis', icone: 'bi-people', ordem: 9 },
        { nome: 'Configuracoes', icone: 'bi-gear', ordem: 10 },
        { nome: 'Treinamentos', icone: 'bi-mortarboard', ordem: 11 },
        { nome: 'Agenda', icone: 'bi-calendar-event', ordem: 12 }
    ];

    const catIds = {};
    for (const cat of kbSeed.categorias) {
        db.run('INSERT INTO kb_categorias (nome, icone, ordem) VALUES (?, ?, ?)', [cat.nome, cat.icone, cat.ordem]);
        const result = db.exec('SELECT last_insert_rowid()');
        catIds[cat.nome] = result[0].values[0][0];
    }

    const artigos = [
        // ===== PRIMEIROS PASSOS =====
        {
            cat: 'Primeiros Passos',
            titulo: 'Visao Geral do Sistema',
            tags: 'inicio,introducao,sistema,visao geral',
            conteudo: `NEXUS - VISAO GERAL
========================================

O Nexus e um sistema completo de gestao empresarial desenvolvido para provedores de internet (ISPs) e empresas de telecomunicacoes. Ele centraliza todas as operacoes do dia a dia em uma unica plataforma web.

PRINCIPAIS MODULOS:

1. DASHBOARD
   Painel principal com metricas em tempo real, graficos de desempenho, resumo de chamados, vendas e atividades recentes.

2. CHAMADOS
   Sistema completo de tickets para suporte tecnico e atendimento ao cliente. Permite criar, atribuir, acompanhar e resolver chamados.

3. ATENDIMENTO WHATSAPP
   Central de atendimento integrada com WhatsApp via WAHA. Permite responder mensagens, usar templates, enviar arquivos e gerenciar filas de atendimento.

4. VENDAS E PIPELINE
   Kanban visual para gerenciar o funil de vendas. Cadastro de provedores, planos, propostas e contratos.

5. PROJETOS
   Quadro Kanban para gerenciar projetos internos com tarefas, prazos e atribuicoes.

6. FINANCEIRO
   Painel financeiro com receitas, despesas e fluxo de caixa.

7. MARCADOR DE PONTO
   Controle de jornada de trabalho com registro de entrada/saida, pausas, almoco e relatorios.

8. TREINAMENTOS
   Gerenciamento de treinamentos da equipe com agendamento e acompanhamento.

9. AGENDA
   Calendario compartilhado para eventos e compromissos da equipe.

10. BASE DE CONHECIMENTO
    Biblioteca de artigos e tutoriais (voce esta aqui!).

11. CONFIGURACOES
    Painel administrativo para configurar usuarios, permissoes, integracoes e preferencias do sistema.

PERFIS DE ACESSO:
- Administrador: acesso total a todos os modulos
- Analista: acesso a chamados, projetos, relatorios e atendimento
- Vendedor: acesso a vendas, dashboard vendedor e provedores
- Gestor de Atendimento: gestao de equipe de atendimento
- Gerente de NOC: gestao de equipe tecnica e projetos
- Financeiro: acesso a modulo financeiro e vendas
- Atendente: acesso basico a chamados e atendimento

TECNOLOGIAS:
- Frontend: Bootstrap 5 + JavaScript vanilla
- Backend: Node.js + Express
- Banco de dados: SQLite (sql.js)
- WhatsApp: WAHA (WhatsApp HTTP API) via Docker
- PWA: funciona como aplicativo no celular`
        },
        {
            cat: 'Primeiros Passos',
            titulo: 'Como Navegar pelo Sistema',
            tags: 'navegacao,sidebar,menu,busca',
            conteudo: `NAVEGACAO PELO SISTEMA
========================================

SIDEBAR (MENU LATERAL)
A sidebar e o menu principal do sistema, localizado no lado esquerdo da tela. Ela contem:

- Logo e nome do sistema no topo
- Links para cada modulo (Dashboard, Chamados, Atendimento, etc.)
- O modulo ativo fica destacado com cor rosa
- Usuarios online aparecem na parte inferior
- Seu nome, perfil e botao de logout ficam no rodape

IMPORTANTE: Apenas os modulos que voce tem permissao aparecem na sidebar. Se um modulo nao aparece, fale com o administrador.

SIDEBAR NO CELULAR:
Em telas pequenas, a sidebar fica escondida. Clique no botao de menu (tres linhas) no canto superior esquerdo para abri-la.

BUSCA GLOBAL (Ctrl+K)
Pressione Ctrl+K em qualquer pagina para abrir a busca global. Voce pode buscar:
- Paginas do sistema (Dashboard, Chamados, etc.)
- Funcoes rapidas

NOTIFICACOES (sino)
O icone de sino na sidebar abre o painel de notificacoes. Voce recebe notificacoes de:
- Chamados atribuidos a voce
- Mensagens do chat interno
- Atualizacoes de projetos
- Mensagens do WhatsApp (se tiver permissao)

CHAT INTERNO
O botao rosa flutuante no canto inferior direito abre o chat interno. Voce pode conversar em tempo real com outros usuarios do sistema.

TEMAS (CLARO/ESCURO)
Na sidebar, abaixo do seu nome, ha um botao para alternar entre tema claro e escuro. A preferencia e salva automaticamente.

USUARIOS ONLINE
Na parte inferior da sidebar, voce ve quem esta online no sistema em tempo real. Clique em um usuario para abrir o chat com ele.`
        },
        {
            cat: 'Primeiros Passos',
            titulo: 'Tema Claro e Escuro',
            tags: 'tema,dark mode,escuro,claro,aparencia',
            conteudo: `TEMA CLARO E ESCURO
========================================

O sistema suporta dois temas visuais:

TEMA CLARO (padrao)
- Fundo branco/cinza claro
- Textos em tons escuros
- Ideal para ambientes bem iluminados

TEMA ESCURO (Dark Mode)
- Fundo escuro (preto/azul escuro)
- Textos em tons claros
- Reduz cansaco visual em ambientes escuros
- Economiza bateria em telas OLED

COMO ALTERNAR:
1. Na sidebar, localize a area do seu usuario (parte inferior)
2. Clique no icone de sol/lua para alternar
3. A mudanca e instantanea e afeta todas as paginas

SALVAMENTO AUTOMATICO:
Sua preferencia de tema e salva no navegador. Quando voce voltar ao sistema, o tema escolhido sera mantido.

DICA: O tema escuro e recomendado para uso noturno e pode reduzir a fadiga ocular durante longas jornadas de trabalho.`
        },

        // ===== DASHBOARD =====
        {
            cat: 'Dashboard',
            titulo: 'Dashboard Principal - Metricas e Graficos',
            tags: 'dashboard,metricas,graficos,kpi,resumo',
            conteudo: `DASHBOARD PRINCIPAL
========================================

O Dashboard e a pagina inicial do sistema, oferecendo uma visao geral de todas as operacoes.

CARDS DE METRICAS (topo):
- Total de Chamados: quantidade de chamados abertos
- Chamados Pendentes: aguardando atendimento
- Vendas do Mes: total de vendas no periodo
- Projetos Ativos: quantidade de projetos em andamento
- Treinamentos: proximos treinamentos agendados

GRAFICOS:
1. Chamados por Status - grafico de pizza mostrando distribuicao
2. Chamados por Periodo - grafico de linha com evolucao temporal
3. Vendas por Estagio - funil de vendas visual
4. Atividade Recente - timeline com ultimas acoes

ATIVIDADES RECENTES:
Lista cronologica com as ultimas acoes no sistema:
- Chamados criados/atualizados
- Vendas movimentadas
- Projetos alterados
- Registros de ponto

PERSONALIZACAO:
Os administradores podem configurar quais widgets aparecem no dashboard e reorganiza-los conforme a necessidade.

ATUALIZACAO:
Os dados sao atualizados em tempo real via SSE (Server-Sent Events). Voce nao precisa recarregar a pagina.

DICA: Use o Dashboard como ponto de partida para identificar rapidamente o que precisa de atencao.`
        },
        {
            cat: 'Dashboard',
            titulo: 'Chat Interno entre Usuarios',
            tags: 'chat,interno,mensagens,comunicacao,equipe',
            conteudo: `CHAT INTERNO
========================================

O chat interno permite comunicacao em tempo real entre todos os usuarios do sistema.

COMO ACESSAR:
1. Clique no botao rosa flutuante no canto inferior direito da tela
2. Ou clique em um usuario online na sidebar

FUNCIONALIDADES:

Lista de Contatos:
- Mostra todos os usuarios do sistema
- Indicador verde = usuario online
- Preview da ultima mensagem trocada
- Badge com contagem de mensagens nao lidas

Conversa:
- Mensagens em tempo real (sem necessidade de recarregar)
- Hora de envio exibida em cada mensagem
- Mensagens enviadas aparecem na direita (rosa)
- Mensagens recebidas aparecem na esquerda

Notificacoes:
- Notificacao visual quando recebe mensagem e nao esta no chat
- Badge com contagem no botao flutuante
- Som de notificacao (se permitido pelo navegador)

DICAS:
- O chat funciona em qualquer pagina do sistema
- Minimze o chat clicando no X para voltar ao trabalho
- As mensagens sao salvas e podem ser visualizadas depois
- O chat nao interfere nas demais funcionalidades do sistema`
        },

        // ===== CHAMADOS =====
        {
            cat: 'Chamados',
            titulo: 'Como Criar e Gerenciar Chamados',
            tags: 'chamados,tickets,suporte,criar,gerenciar',
            conteudo: `SISTEMA DE CHAMADOS
========================================

O modulo de Chamados e o sistema de tickets para suporte tecnico e atendimento.

CRIAR UM CHAMADO:
1. Acesse Chamados na sidebar
2. Clique em "Novo Chamado"
3. Preencha:
   - Titulo: descricao curta do problema
   - Descricao: detalhes completos
   - Prioridade: Baixa, Media, Alta ou Critica
   - Categoria: tipo do problema (Suporte, Instalacao, etc.)
   - Responsavel: quem ira atender (opcional)
   - Provedor: se relacionado a um provedor especifico
4. Adicione anexos se necessario (imagens, documentos)
5. Clique em "Salvar"

GERENCIAR CHAMADOS:
- Filtrar por status (Aberto, Em Andamento, Resolvido, Fechado)
- Filtrar por prioridade
- Buscar por titulo ou descricao
- Ordenar por data, prioridade ou responsavel

ACOES EM UM CHAMADO:
- Editar: alterar informacoes do chamado
- Comentar: adicionar observacoes e atualizacoes
- Alterar Status: mover entre as etapas
- Atribuir: designar para outro usuario
- Anexar: adicionar arquivos e imagens

FLUXO DE STATUS:
Aberto > Em Andamento > Resolvido > Fechado

TIMELINE:
Cada chamado possui uma timeline com todo o historico de alteracoes, comentarios e mudancas de status.

ANEXOS:
- Suporta imagens (JPG, PNG, GIF)
- Suporta documentos (PDF, DOC, DOCX)
- Imagens podem ser visualizadas em modal ampliado
- Download direto de qualquer anexo`
        },

        // ===== ATENDIMENTO WHATSAPP =====
        {
            cat: 'Atendimento WhatsApp',
            titulo: 'Central de Atendimento WhatsApp - Visao Geral',
            tags: 'whatsapp,atendimento,central,waha,mensagens',
            conteudo: `CENTRAL DE ATENDIMENTO WHATSAPP
========================================

A Central de Atendimento integra o WhatsApp ao sistema atraves do WAHA (WhatsApp HTTP API).

COMO FUNCIONA:
1. O WAHA roda em um container Docker na porta 3001
2. Voce conecta seu WhatsApp escaneando o QR Code
3. Todas as mensagens chegam no sistema em tempo real
4. Voce responde diretamente pelo sistema

INTERFACE:
A tela e dividida em duas partes:
- Painel esquerdo: lista de conversas com preview
- Painel direito: area de mensagens da conversa selecionada

PAINEL DE CONVERSAS:
- Busca por nome/numero
- Filtros de fila (Todos, Fila, Meus, Em Atendimento)
- Badge com contagem de mensagens nao lidas
- Foto do perfil do contato (carregada automaticamente)
- Status da conversa (Fila, Atendendo, nome do agente)

AREA DE MENSAGENS:
- Mensagens com bolhas (enviadas e recebidas)
- Suporte a imagens, audios, videos e documentos
- Horario de cada mensagem
- Indicador de digitacao
- Responder mensagem especifica (reply/quote)
- Reacoes com emojis

BOTOES DE ACAO (no header do chat):
- Assumir: pegar um chat da fila para si
- Transferir: enviar para outro agente
- Finalizar: encerrar o atendimento
- Buscar: pesquisar mensagens na conversa

STATUS DA CONEXAO:
- Verde (Conectado): WhatsApp funcionando
- Amarelo (Conectando): aguardando conexao
- Vermelho (Desconectado): sem conexao

REQUISITOS:
- Docker rodando com container WAHA na porta 3001
- Numero de WhatsApp valido para escanear QR Code
- Permissao do modulo "whatsapp" ativa para o usuario`
        },
        {
            cat: 'Atendimento WhatsApp',
            titulo: 'Fila de Atendimento e Distribuicao de Chats',
            tags: 'fila,atendimento,distribuicao,agente,atribuir,transferir',
            conteudo: `FILA DE ATENDIMENTO
========================================

O sistema possui um mecanismo de fila para organizar o atendimento dos chats do WhatsApp.

COMO FUNCIONA:
1. Nova mensagem chega > chat entra na FILA automaticamente
2. Agente clica no chat > chat e ATRIBUIDO a ele (auto-claim)
3. Agente atende o cliente normalmente
4. Ao finalizar, agente clica em Finalizar > chat volta para FILA se receber nova mensagem

FILTROS DISPONIVEIS:

Para AGENTES (nao-admin):
- Fila: chats aguardando atendimento (pode pegar qualquer um)
- Meus: apenas chats atribuidos a voce

Para ADMIN:
- Todos: vê todos os chats
- Fila: chats na fila
- Em Atendimento: chats sendo atendidos por qualquer agente

TRANSFERIR CHAT:
1. Clique no icone de transferencia no header do chat
2. Selecione o agente de destino
3. Opcionalmente adicione uma observacao
4. Clique em "Transferir"
O chat sera transferido e o outro agente recebera notificacao.

ASSUMIR CHAT (Admin):
Admins podem assumir qualquer chat da fila ou de outro agente clicando em "Assumir".

FINALIZAR ATENDIMENTO:
1. Clique no icone de finalizar (check) no header
2. Confirme a finalizacao
3. O chat fica sem agente atribuido
4. Se o cliente enviar nova mensagem, volta para a fila

REGRAS IMPORTANTES:
- Um agente NAO pode abrir chat atribuido a outro agente (exceto admin)
- Ao clicar em um chat na fila, ele e automaticamente atribuido a voce
- Admins veem e gerenciam todos os chats
- Badges mostram contagem de chats em cada filtro em tempo real`
        },
        {
            cat: 'Atendimento WhatsApp',
            titulo: 'Templates e Respostas Rapidas',
            tags: 'templates,respostas,rapidas,atalhos,mensagens',
            conteudo: `TEMPLATES E RESPOSTAS RAPIDAS
========================================

O sistema oferece formas de agilizar o envio de mensagens no WhatsApp.

TEMPLATES:
Templates sao mensagens pre-formatadas que podem ser enviadas com poucos cliques.

Como usar:
1. Na area de mensagens, clique no icone de documento (lista de templates)
2. Selecione o template desejado
3. O texto sera inserido no campo de mensagem
4. Edite se necessario e envie

Como criar templates:
1. Acesse Configuracoes > WhatsApp
2. Na aba Templates, clique em "Novo Template"
3. Preencha:
   - Nome: identificacao do template
   - Texto: conteudo da mensagem
   - Categoria: para organizar (Saudacao, Suporte, Vendas, etc.)
4. Salve

RESPOSTAS RAPIDAS (barra /):
Digite "/" no campo de mensagem para abrir o menu de respostas rapidas.
- Lista os templates disponiveis como sugestoes
- Selecione com click ou setas + Enter
- O texto e inserido automaticamente

FORMATACAO DE TEXTO:
Use os botoes na barra de formatacao:
- *negrito* = texto em negrito
- _italico_ = texto em italico
- ~tachado~ = texto riscado
- \`codigo\` = texto monospacado

ENVIO DE ARQUIVOS:
1. Clique no icone de clip (anexo)
2. Selecione o arquivo (imagem, documento, video)
3. O arquivo sera enviado como mensagem

DICA: Templates bem organizados economizam tempo e padronizam a comunicacao com o cliente.`
        },

        // ===== VENDAS E PIPELINE =====
        {
            cat: 'Vendas e Pipeline',
            titulo: 'Pipeline de Vendas (Kanban)',
            tags: 'vendas,pipeline,kanban,funil,negocios',
            conteudo: `PIPELINE DE VENDAS (KANBAN)
========================================

O Pipeline de Vendas usa um quadro Kanban visual para gerenciar o funil de vendas.

ESTAGIOS DO FUNIL:
1. LEAD - Contato inicial, prospecto identificado
2. CONTATO - Primeiro contato realizado
3. PROPOSTA - Proposta comercial enviada
4. NEGOCIACAO - Em negociacao ativa
5. ATIVADO - Venda concluida, cliente ativo
6. PERDIDO - Negocio perdido

COMO USAR:

Criar Negocio:
1. Clique em "Novo Negocio"
2. Preencha: cliente, provedor, plano, valor, vendedor
3. O negocio aparece na coluna "Lead"

Mover entre Estagios:
- Arraste o card de uma coluna para outra (drag & drop)
- Ou clique no card e altere o estagio no formulario

Cards do Kanban:
Cada card mostra:
- Nome do cliente/empresa
- Plano contratado
- Valor estimado
- Data da criacao
- Vendedor responsavel
- Indicador de temperatura (esfriando/frio)

INDICADORES DE TEMPERATURA:
- Normal: negocio ativo e recente
- Esfriando (laranja): sem atualizacao ha alguns dias
- Frio (vermelho): sem atualizacao ha muito tempo, precisa de atencao

CONTATOS RAPIDOS:
Em cada card voce tem botoes de acao rapida:
- WhatsApp: abre chat com o contato
- Telefone: inicia ligacao
- Email: abre cliente de email

DASHBOARD DE VENDAS:
Na aba Dashboard voce ve:
- Total de negocios por estagio
- Valor total do funil
- Taxa de conversao
- Ranking de vendedores
- Graficos de desempenho`
        },
        {
            cat: 'Vendas e Pipeline',
            titulo: 'Provedores, Planos e Propostas',
            tags: 'provedores,planos,propostas,contratos,cadastro',
            conteudo: `PROVEDORES, PLANOS E PROPOSTAS
========================================

PROVEDORES:
Cadastro de provedores de internet parceiros.

Como cadastrar:
1. Acesse Vendas > aba Provedores
2. Clique em "Novo Provedor"
3. Preencha: nome, CNPJ, logo, dados de contato
4. Salve

Cada provedor tem:
- Dados cadastrais completos
- Logo para identificacao visual
- Planos associados
- Historico de vendas

PLANOS:
Planos de internet vinculados a cada provedor.

Como cadastrar:
1. Na pagina do provedor, clique em "Novo Plano"
2. Preencha: nome, velocidade, preco, descricao
3. Marque se e plano ativo

PROPOSTAS:
Propostas comerciais geradas para clientes.

Como criar:
1. Ao mover um negocio para "Proposta", crie a proposta
2. Selecione os planos desejados
3. Adicione servicos adicionais se necessario
4. A proposta e gerada com calculo automatico de valores

CONTRATOS:
Quando um negocio e ativado, um contrato pode ser gerado.
- Dados do cliente e provedor
- Planos e servicos contratados
- Valor total e prazo
- Status do contrato (ativo, cancelado, etc.)`
        },

        // ===== PROJETOS =====
        {
            cat: 'Projetos',
            titulo: 'Quadro Kanban de Projetos',
            tags: 'projetos,kanban,tarefas,status,equipe',
            conteudo: `QUADRO KANBAN DE PROJETOS
========================================

O modulo de Projetos utiliza um quadro Kanban para gerenciar projetos internos da empresa.

COLUNAS (STATUS):
1. EM ANDAMENTO - Projetos sendo executados
2. PAUSADO - Projetos temporariamente pausados
3. CONCLUIDO - Projetos finalizados
4. CANCELADO - Projetos cancelados

CRIAR PROJETO:
1. Acesse Projetos na sidebar
2. Clique em "Novo Projeto"
3. Preencha:
   - Nome do projeto
   - Descricao detalhada
   - Status inicial
   - Responsavel
   - Data de inicio e previsao de conclusao
   - Prioridade
4. Salve

GERENCIAR PROJETOS:
- Arraste cards entre colunas para alterar status
- Clique em um card para ver detalhes e editar
- Adicione comentarios para registrar progresso
- Acompanhe a timeline de alteracoes

CARDS DO KANBAN:
Cada card exibe:
- Nome do projeto
- Responsavel
- Data de criacao
- Prioridade (badge colorido)
- Status atual

FILTROS:
- Por status
- Por responsavel
- Por prioridade
- Busca por nome

DICA: Mantenha o quadro atualizado para que toda a equipe tenha visibilidade do andamento dos projetos.`
        },

        // ===== FINANCEIRO =====
        {
            cat: 'Financeiro',
            titulo: 'Painel Financeiro',
            tags: 'financeiro,receitas,despesas,fluxo,caixa',
            conteudo: `PAINEL FINANCEIRO
========================================

O modulo Financeiro oferece uma visao geral das financas da empresa.

FUNCIONALIDADES:

Cards de Resumo:
- Receitas do mes
- Despesas do mes
- Saldo (receitas - despesas)
- Comparativo com mes anterior

Lancamentos:
- Cadastrar receitas e despesas
- Categorizar por tipo
- Definir data de vencimento
- Marcar como pago/pendente
- Adicionar observacoes

Filtros:
- Por periodo (mes/trimestre/ano)
- Por tipo (receita/despesa)
- Por categoria
- Por status (pago/pendente)

COMO REGISTRAR UM LANCAMENTO:
1. Clique em "Novo Lancamento"
2. Selecione o tipo: Receita ou Despesa
3. Preencha: descricao, valor, data, categoria
4. Marque como pago se ja foi quitado
5. Salve

CATEGORIAS DE EXEMPLO:
Receitas: Vendas, Servicos, Mensalidades, Outros
Despesas: Pessoal, Infraestrutura, Marketing, Software, Impostos

DICA: Mantenha os lancamentos em dia para ter uma visao precisa da saude financeira da empresa.`
        },

        // ===== MARCADOR DE PONTO =====
        {
            cat: 'Marcador de Ponto',
            titulo: 'Como Registrar Entrada e Saida',
            tags: 'ponto,entrada,saida,registro,jornada',
            conteudo: `MARCADOR DE PONTO - REGISTRO DE JORNADA
========================================

O Marcador de Ponto permite controlar sua jornada de trabalho diaria.

COMO ACESSAR:
Clique em "Ponto" na sidebar.

REGISTRAR ENTRADA:
1. Ao iniciar o expediente, clique no botao verde "Registrar Entrada"
2. O horario e registrado automaticamente
3. O relogio digital mostra a hora atual
4. O status muda para "Trabalhando"

REGISTRAR SAIDA:
1. Ao finalizar o expediente, clique no botao vermelho "Registrar Saida"
2. O horario e registrado e o tempo total trabalhado e calculado
3. O status muda para "Offline"

REGISTRAR ALMOCO:
1. Ao sair para almoco, clique em "Almoco"
2. Ao retornar, clique em "Voltar do Almoco"
3. O tempo de almoco e registrado separadamente

CARD "SUA JORNADA HOJE":
Mostra em tempo real:
- Tempo Trabalhado: total de horas trabalhadas (descontando pausas e almoco)
- Carga Horaria: meta diaria configurada (padrao 8h)
- Pausas: quantidade de pausas realizadas
- Tempo Pausas: total de minutos em pausa
- Barra de progresso: percentual da carga horaria cumprida

TIMELINE:
Abaixo do card de jornada, a timeline mostra todos os registros do dia:
- Entrada (verde)
- Saida Almoco (laranja)
- Retorno Almoco (laranja)
- Pausas (amarelo)
- Saida (vermelho)

BOTOES MUDAM CONFORME O ESTADO:
- Sem entrada: "Registrar Entrada" (verde)
- Trabalhando: "Pausa" (amarelo) + "Almoco" (laranja) + "Saida" (vermelho)
- Em pausa: "Retomar" (verde) + timer da pausa
- Em almoco: "Voltar do Almoco" (verde)`
        },
        {
            cat: 'Marcador de Ponto',
            titulo: 'Sistema de Pausas',
            tags: 'ponto,pausas,banheiro,cafe,intervalo',
            conteudo: `SISTEMA DE PAUSAS
========================================

O sistema de pausas permite registrar intervalos durante o expediente.

INICIAR UMA PAUSA:
1. Clique no botao amarelo "Pausa"
2. Um modal abre pedindo o motivo da pausa
3. Selecione o motivo:
   - Banheiro
   - Cafe / Lanche
   - Pessoal
   - Reuniao
   - Outro
4. Clique em "Pausar"

DURANTE A PAUSA:
- Um timer aparece mostrando quanto tempo voce esta em pausa
- O status muda para "Em Pausa" (amarelo)
- O botao muda para "Retomar" (verde)

RETOMAR TRABALHO:
1. Clique no botao verde "Retomar"
2. A pausa e encerrada e a duracao e registrada
3. O timer desaparece e os botoes normais voltam

IMPORTANTE:
- O tempo de pausa e DESCONTADO do tempo trabalhado
- Todas as pausas ficam registradas no historico
- Gestores podem ver as pausas de todos na aba "Equipe"
- O relatorio de ponto mostra o total de pausas por dia

DICA: Use as pausas honestamente para manter um registro preciso da sua jornada. Pausas frequentes ou muito longas podem ser verificadas pelo gestor.`
        },
        {
            cat: 'Marcador de Ponto',
            titulo: 'Relatorios de Ponto (para Gestores)',
            tags: 'ponto,relatorios,gestores,exportar,csv,pdf',
            conteudo: `RELATORIOS DE PONTO
========================================

Os relatorios de ponto sao acessiveis apenas para Administradores, Gestores de Atendimento e Gerentes de NOC.

COMO ACESSAR:
1. Va ate a pagina de Ponto
2. Clique na aba "Relatorios" (visivel apenas para gestores/admin)

GERAR RELATORIO:
1. Selecione o periodo (De - Ate)
2. Opcionalmente filtre por colaborador
3. Clique em "Buscar"

O RELATORIO MOSTRA:

Cards de Resumo:
- Colaboradores ativos no periodo
- Total de horas trabalhadas
- Total de minutos em pausas
- Media de horas por dia

Tabela Detalhada:
Para cada colaborador:
- Nome e perfil
- Dias trabalhados
- Horas totais
- Tempo de pausas (minutos)
- Media por dia
- Botao "Ver detalhes" para historico individual

EXPORTAR:
- CSV: gera arquivo compativel com Excel (separado por ponto e virgula, UTF-8 BOM)
- PDF: abre uma janela de impressao com tabela formatada

VER DETALHES:
Ao clicar em "Ver detalhes" de um colaborador, um modal abre com o historico dia a dia mostrando:
- Data
- Horario de entrada
- Horario de almoco
- Horario de saida
- Numero de pausas
- Total de horas trabalhadas

ABA EQUIPE:
Na aba "Equipe", gestores veem em tempo real:
- Quem esta trabalhando (verde)
- Quem esta em pausa (amarelo)
- Quem esta em almoco (laranja)
- Quem esta offline (cinza)
- Botoes para ver historico e configurar horarios

ABA CONFIGURACOES:
Na aba "Configuracoes", gestores podem definir para cada usuario:
- Horario de entrada padrao
- Horario de saida padrao
- Horario de inicio do almoco
- Duracao do almoco
- Carga horaria diaria
- Se o usuario trabalha em home office`
        },

        // ===== USUARIOS E PERFIS =====
        {
            cat: 'Usuarios e Perfis',
            titulo: 'Perfis de Acesso e Permissoes',
            tags: 'perfis,permissoes,acesso,modulos,admin',
            conteudo: `PERFIS DE ACESSO E PERMISSOES
========================================

O sistema possui 7 perfis de acesso, cada um com permissoes diferentes.

PERFIS DISPONIVEIS:

1. ADMINISTRADOR (admin)
   - Acesso TOTAL a todos os modulos
   - Pode gerenciar usuarios e permissoes
   - Pode acessar configuracoes do sistema
   - Ve todos os dados de todos os usuarios
   - Cor do badge: Vermelho

2. ANALISTA (analista)
   - Chamados, Projetos, Relatorios, WhatsApp
   - Historico, Conhecimento, Agenda, Ponto
   - NAO acessa: Vendas, Dashboard Vendedor, Configuracoes
   - Cor do badge: Azul

3. VENDEDOR (vendedor)
   - Dashboard, Provedores, Vendas, Dashboard Vendedor
   - NAO acessa: Chamados, Projetos, WhatsApp, Configuracoes
   - Cor do badge: Rosa

4. GESTOR DE ATENDIMENTO (gestor_atendimento)
   - Dashboard, Chamados, WhatsApp, Relatorios
   - Conhecimento, Agenda, Historico, Usuarios, Ponto
   - Pode gerenciar equipe de atendimento
   - Ve dados de equipe no Ponto
   - Cor do badge: Verde

5. GERENTE DE NOC (gerente_noc)
   - Dashboard, Chamados, Projetos, Relatorios
   - Conhecimento, Agenda, Historico, Ponto
   - Pode gerenciar equipe tecnica
   - Ve dados de equipe no Ponto
   - Cor do badge: Amarelo

6. FINANCEIRO (financeiro)
   - Dashboard, Vendas, Relatorios, Financeiro, Ponto
   - Focado em dados financeiros e comerciais
   - Cor do badge: Cinza

7. ATENDENTE (atendente)
   - Dashboard, Chamados, WhatsApp, Conhecimento, Ponto
   - Acesso basico para atendimento ao cliente
   - Cor do badge: Azul

PERMISSOES POR MODULO:
Cada perfil tem permissoes ativo/inativo para cada modulo.
Administradores podem ajustar permissoes em:
Configuracoes > Permissoes

IMPORTANTE: Se um modulo esta desativado para seu perfil, ele nao aparecera na sidebar.`
        },
        {
            cat: 'Usuarios e Perfis',
            titulo: 'Gerenciamento de Usuarios',
            tags: 'usuarios,criar,editar,excluir,gerenciar',
            conteudo: `GERENCIAMENTO DE USUARIOS
========================================

Apenas Administradores e Gestores de Atendimento podem gerenciar usuarios.

CRIAR USUARIO:
1. Acesse Usuarios na sidebar
2. Clique em "Novo Usuario"
3. Preencha:
   - Nome completo
   - Email (sera usado para login)
   - Senha (minimo 4 caracteres)
   - Perfil de acesso (Analista, Vendedor, Atendente, etc.)
   - Foto (opcional)
4. Clique em "Salvar"

EDITAR USUARIO:
1. Na tabela de usuarios, clique no icone de lapis
2. Altere os campos necessarios
3. Deixe a senha em branco para manter a atual
4. Clique em "Salvar"

EXCLUIR USUARIO:
1. Na tabela de usuarios, clique no icone de lixeira
2. Confirme a exclusao

INFORMACOES EXIBIDAS:
A tabela de usuarios mostra:
- Foto/avatar
- Nome
- Email
- Perfil (com badge colorido)
- Data de criacao
- Acoes (editar/excluir)

FOTO DE PERFIL:
- Cada usuario pode ter uma foto de perfil
- A foto aparece na sidebar, no chat e na lista de usuarios
- Se nao tiver foto, exibe as iniciais do nome

DICAS:
- Use emails validos para facilitar a recuperacao de acesso
- Escolha o perfil adequado para cada funcao
- Revise periodicamente os usuarios ativos
- Desative usuarios que sairam da empresa em vez de excluir`
        },

        // ===== CONFIGURACOES =====
        {
            cat: 'Configuracoes',
            titulo: 'Configuracoes Gerais do Sistema',
            tags: 'configuracoes,geral,empresa,sistema',
            conteudo: `CONFIGURACOES GERAIS
========================================

O painel de Configuracoes e acessivel apenas para Administradores.

ABAS DISPONIVEIS:

1. GERAL
   Configuracoes basicas do sistema:
   - Nome da empresa
   - Logo
   - Informacoes de contato
   - Fuso horario
   - Formato de data

2. WHATSAPP / WAHA
   Configuracoes da integracao com WhatsApp:
   - URL do servidor WAHA (padrao: http://localhost:3001)
   - Nome da sessao (padrao: default)
   - Webhook URL para receber eventos
   - Status da conexao

3. IXC
   Integracao com o sistema IXC Provedor:
   - URL da API IXC
   - Token de autenticacao
   - Configuracoes de sincronizacao

4. TEMPLATES
   Gerenciamento de templates de mensagem do WhatsApp:
   - Criar, editar e excluir templates
   - Organizar por categoria
   - Definir variaveis dinamicas

5. PERMISSOES
   Matriz de permissoes por perfil e modulo:
   - Ativar/desativar acesso a cada modulo para cada perfil
   - Mudancas sao aplicadas imediatamente
   - Checkbox verde = ativo, sem check = inativo

6. WEBHOOKS
   Configuracao de webhooks de saida:
   - Enviar eventos do sistema para URLs externas
   - Configurar quais eventos disparar
   - Visualizar log de despacho

7. NOTIFICACOES
   Configuracoes de notificacoes do sistema:
   - Sons de notificacao
   - Notificacoes do navegador
   - Tipos de notificacao ativas

DICA VISUAL: As abas de configuracoes usam estilo pill/chip moderno com cores da identidade visual do sistema (rosa). A aba ativa fica destacada em rosa.`
        },
        {
            cat: 'Configuracoes',
            titulo: 'Integracao IXC Provedor',
            tags: 'ixc,integracao,provedor,api,sincronizar',
            conteudo: `INTEGRACAO IXC PROVEDOR
========================================

O sistema pode ser integrado ao IXC Provedor para sincronizar dados de clientes e contratos.

COMO CONFIGURAR:

1. Acesse Configuracoes > IXC
2. Preencha:
   - URL da API: endereco do servidor IXC (ex: https://seuixc.com.br/webservice/v1)
   - Token: token de autenticacao da API IXC
3. Clique em "Testar Conexao" para verificar
4. Salve as configuracoes

O QUE E SINCRONIZADO:
- Dados de clientes (nome, CPF/CNPJ, endereco, contato)
- Contratos ativos
- Planos contratados
- Status de conexao

COMO FUNCIONA:
1. O sistema faz chamadas a API REST do IXC
2. Os dados sao buscados sob demanda (nao e sincronizacao continua)
3. Ao buscar um cliente no IXC, os dados podem ser importados para o sistema

LOG DE COMUNICACAO:
Todas as chamadas a API do IXC sao registradas em log para auditoria:
- URL chamada
- Metodo HTTP
- Status da resposta
- Tempo de resposta
- Conteudo da resposta (resumido)

DICA: Mantenha o token do IXC seguro e atualize-o regularmente conforme a politica de seguranca do seu provedor.`
        },
        {
            cat: 'Configuracoes',
            titulo: 'Permissoes por Modulo',
            tags: 'permissoes,modulos,perfis,configurar,acesso',
            conteudo: `PERMISSOES POR MODULO
========================================

O sistema permite configurar quais modulos cada perfil pode acessar.

COMO ACESSAR:
1. Va em Configuracoes > Permissoes
2. Uma matriz mostra todos os perfis (linhas) x modulos (colunas)

COMO FUNCIONA:
- Checkbox marcado (verde) = perfil TEM acesso ao modulo
- Checkbox desmarcado = perfil NAO tem acesso
- Mudancas sao salvas automaticamente ao clicar

MODULOS DISPONIVEIS:
- dashboard: Painel principal
- provedores: Cadastro de provedores
- vendas: Pipeline de vendas
- dashboard_vendedor: Dashboard especifico do vendedor
- chamados: Sistema de tickets
- treinamentos: Gerenciamento de treinamentos
- projetos: Quadro de projetos
- historico: Historico de atividades
- whatsapp: Central de atendimento WhatsApp
- relatorios: Relatorios gerais
- conhecimento: Base de conhecimento
- agenda: Calendario/agenda
- financeiro: Painel financeiro
- usuarios: Gerenciamento de usuarios
- configuracoes: Painel de configuracoes
- ponto: Marcador de ponto

EFEITO DAS PERMISSOES:
- Modulo desativado: nao aparece na sidebar
- Modulo desativado: acesso direto via URL e bloqueado (redirect)
- Modulo desativado: APIs do modulo retornam erro 403

CUIDADO:
- Nao desative modulos essenciais do perfil admin
- Sempre mantenha pelo menos um admin com acesso total
- Mudancas afetam todos os usuarios do perfil imediatamente`
        },

        // ===== TREINAMENTOS =====
        {
            cat: 'Treinamentos',
            titulo: 'Gerenciamento de Treinamentos',
            tags: 'treinamentos,capacitacao,equipe,agendamento',
            conteudo: `GERENCIAMENTO DE TREINAMENTOS
========================================

O modulo de Treinamentos permite gerenciar capacitacoes da equipe.

FUNCIONALIDADES:

Cards de Resumo:
- Treinamentos pendentes
- Treinamentos agendados
- Treinamentos realizados
- Taxa de conclusao

CRIAR TREINAMENTO:
1. Clique em "Novo Treinamento"
2. Preencha:
   - Titulo do treinamento
   - Descricao/conteudo
   - Instrutor/responsavel
   - Data e horario
   - Duracao estimada
   - Participantes
3. Salve

STATUS DO TREINAMENTO:
- Pendente (laranja): aguardando agendamento
- Agendado (rosa): data e hora definidos
- Realizado (verde): treinamento concluido

GERENCIAR:
- Visualizar detalhes de cada treinamento
- Alterar status conforme progresso
- Adicionar materiais e anotacoes
- Registrar presencas

DICA: Mantenha um calendario regular de treinamentos para manter a equipe atualizada e capacitada.`
        },

        // ===== AGENDA =====
        {
            cat: 'Agenda',
            titulo: 'Calendario e Eventos',
            tags: 'agenda,calendario,eventos,compromissos',
            conteudo: `AGENDA / CALENDARIO
========================================

O modulo Agenda oferece um calendario compartilhado para a equipe.

FUNCIONALIDADES:

Visualizacoes:
- Mes: visao mensal com todos os eventos
- Semana: visao semanal detalhada
- Dia: visao diaria com horarios

CRIAR EVENTO:
1. Clique em um dia no calendario ou no botao "Novo Evento"
2. Preencha:
   - Titulo do evento
   - Data e hora de inicio
   - Data e hora de fim (opcional)
   - Descricao
   - Cor do evento (para diferenciar tipos)
   - Se e o dia todo
3. Salve

TIPOS DE EVENTOS:
Use cores diferentes para categorizar:
- Azul: reunioes
- Verde: treinamentos
- Vermelho: prazos importantes
- Amarelo: lembretes
- Rosa: eventos sociais

INTERACAO:
- Clique em um evento para ver detalhes
- Edite ou exclua eventos existentes
- Arraste eventos para mudar de data (se suportado)

COMPARTILHAMENTO:
O calendario e compartilhado entre todos os usuarios que tem permissao ao modulo Agenda. Todos veem os mesmos eventos.

DICA: Use a agenda para coordenar reunioes, treinamentos e prazos importantes da equipe.`
        }
    ];

    const stmtArtigo = db.prepare(
        'INSERT INTO kb_artigos (categoria_id, titulo, conteudo, tags, publicado) VALUES (?, ?, ?, ?, 1)'
    );
    for (const artigo of kbSeed.artigos) {
        stmtArtigo.run([catIds[artigo.cat], artigo.titulo, artigo.conteudo, artigo.tags]);
    }
    stmtArtigo.free();
}

let _saveTimer = null;
const SAVE_DELAY_MS = 3000;

function saveDB() {
    if (!db) return;
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function saveDBDebounced() {
    if (_saveTimer) return;
    _saveTimer = setTimeout(() => {
        _saveTimer = null;
        saveDB();
    }, SAVE_DELAY_MS);
}

// Salvar ao encerrar o processo
process.on('exit', () => { if (_saveTimer) { clearTimeout(_saveTimer); saveDB(); } });
process.on('SIGINT', () => { if (_saveTimer) { clearTimeout(_saveTimer); saveDB(); } process.exit(0); });
process.on('SIGTERM', () => { if (_saveTimer) { clearTimeout(_saveTimer); saveDB(); } process.exit(0); });

// Helpers para manter compatibilidade com a API usada no server.js
function queryAll(sql, params = []) {
    const stmt = db.prepare(sql);
    if (params.length) stmt.bind(params);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

function queryGet(sql, params = []) {
    const stmt = db.prepare(sql);
    if (params.length) stmt.bind(params);
    let result = null;
    if (stmt.step()) {
        result = stmt.getAsObject();
    }
    stmt.free();
    return result;
}

function queryRun(sql, params = []) {
    db.run(sql, params);
    const changes = db.getRowsModified();
    const lastIdResult = db.exec('SELECT last_insert_rowid() as id');
    const lastId = lastIdResult.length > 0 ? lastIdResult[0].values[0][0] : null;
    saveDBDebounced();
    return { lastInsertRowid: lastId, changes };
}

function getDB() {
    return { queryAll, queryGet, queryRun };
}

module.exports = { initDB, getDB };
