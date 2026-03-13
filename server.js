const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const session = require('express-session');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const { authenticator } = require('otplib');
const { initDB, getDB } = require('./database');

const app = express();

// ==================== SECURITY: Helper de erro seguro ====================
function handleError(res, err, contexto = 'Erro interno') {
    console.error(`[${contexto}]`, err.message || err);
    if (err.message && err.message.includes('UNIQUE')) {
        return res.status(400).json({ erro: 'Registro duplicado' });
    }
    res.status(500).json({ erro: 'Erro interno do servidor' });
}

// ==================== SECURITY: Server-side HTML escaping ====================
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ==================== SECURITY: Validar secrets obrigatorios ====================
if (!process.env.SESSION_SECRET) {
    console.error('FATAL: SESSION_SECRET nao definido em .env');
    console.error("Gere um com: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
    process.exit(1);
}

// ==================== SECURITY: Headers (Helmet + CSP) ====================
const helmet = require('helmet');
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
                scriptSrcAttr: ["'unsafe-inline'"],
                styleSrc: ["'self'", 'https://cdn.jsdelivr.net', "'unsafe-inline'"],
                fontSrc: ["'self'", 'https://cdn.jsdelivr.net', 'data:'],
                imgSrc: ["'self'", 'data:', 'blob:'],
                connectSrc: ["'self'"],
                frameSrc: ["'none'"],
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
                formAction: ["'self'"],
                upgradeInsecureRequests: []
            }
        },
        crossOriginEmbedderPolicy: true
    })
);

// ==================== SECURITY: CORS ====================
app.use((req, res, next) => {
    const allowedOrigins = [process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`];
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// ==================== SECURITY: Rate Limiting ====================
const rateLimit = require('express-rate-limit');
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { erro: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false
});
const massSendLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 3,
    message: { erro: 'Limite de envios em massa atingido. Aguarde 1 minuto.' }
});
const formPublicLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { erro: 'Muitas submissoes. Tente novamente em 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false
});

app.use(express.json({ limit: '1mb' }));
// Evitar cache de Service Worker e JS pelo navegador
app.use('/sw.js', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});
app.use('/js', express.static(path.join(__dirname, 'public', 'js'), { maxAge: 0, etag: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ==================== SESSION CONFIG ====================

const isProduction = process.env.NODE_ENV === 'production';
app.set('trust proxy', 1);

app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        name: '__gt_sid',
        cookie: {
            secure: isProduction,
            httpOnly: true,
            sameSite: 'strict',
            maxAge: 8 * 60 * 60 * 1000 // 8 horas
        }
    })
);

// ==================== SECURITY: CSRF Protection ====================

function gerarCsrfToken(req) {
    if (!req.session._csrfToken) {
        req.session._csrfToken = crypto.randomBytes(32).toString('hex');
    }
    return req.session._csrfToken;
}

app.get('/api/csrf-token', (req, res) => {
    if (!req.session || !req.session.usuario) return res.status(401).json({ erro: 'Nao autenticado' });
    res.json({ token: gerarCsrfToken(req) });
});

// CSRF Verification middleware - applied to state-changing methods
function csrfProtection(req, res, next) {
    // Skip CSRF for non-state-changing methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    // Skip for API v1 (uses Bearer token auth, not session)
    if (req.path.startsWith('/api/v1/')) return next();
    // Skip for WAHA webhook (external service, uses its own token)
    if (req.path === '/api/whatsapp/webhook') return next();
    // Skip for login/logout (session not yet established or being destroyed)
    if (req.path === '/api/login' || req.path === '/api/login/2fa' || req.path === '/api/logout') return next();
    // Skip for public form/NPS endpoints (token-based auth)
    if (req.path.match(/^\/api\/(formulario|nps\/responder|contrato-aceite)\//)) return next();
    // Skip for heartbeat (frequent, low-risk)
    if (req.path === '/api/heartbeat') return next();

    const token = req.headers['x-csrf-token'];
    if (!token || !req.session._csrfToken || token !== req.session._csrfToken) {
        return res.status(403).json({ erro: 'Token CSRF invalido. Recarregue a pagina.' });
    }
    next();
}

app.use(csrfProtection);

// ==================== SECURITY: Rate Limiting Global (API) ====================
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    message: { erro: 'Muitas requisicoes. Aguarde um momento.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method)
});
app.use('/api/', apiLimiter);

// ==================== SECURITY: Input Validation ====================

function validarString(valor, nome, min = 1, max = 500) {
    if (!valor || typeof valor !== 'string') return `${nome} e obrigatorio`;
    const trimmed = valor.trim();
    if (trimmed.length < min) return `${nome} deve ter pelo menos ${min} caracteres`;
    if (trimmed.length > max) return `${nome} nao pode exceder ${max} caracteres`;
    return null;
}

function validarEmail(email) {
    if (!email) return 'Email e obrigatorio';
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!re.test(email)) return 'Email invalido';
    if (email.length > 254) return 'Email muito longo';
    return null;
}

function validarSenha(senha) {
    if (!senha || typeof senha !== 'string') return 'Senha e obrigatoria';
    if (senha.length < 8) return 'Senha deve ter pelo menos 8 caracteres';
    if (senha.length > 128) return 'Senha muito longa';
    if (!/[A-Z]/.test(senha)) return 'Senha deve conter pelo menos uma letra maiuscula';
    if (!/[a-z]/.test(senha)) return 'Senha deve conter pelo menos uma letra minuscula';
    if (!/[0-9]/.test(senha)) return 'Senha deve conter pelo menos um numero';
    if (!/[^A-Za-z0-9]/.test(senha)) return 'Senha deve conter pelo menos um caractere especial (@, #, $, etc.)';
    return null;
}

function validarInteiro(valor, nome, min = 0, max = Number.MAX_SAFE_INTEGER) {
    const num = Number(valor);
    if (isNaN(num) || !Number.isInteger(num)) return `${nome} deve ser um numero inteiro`;
    if (num < min || num > max) return `${nome} deve estar entre ${min} e ${max}`;
    return null;
}

function sanitizarTexto(texto) {
    if (!texto || typeof texto !== 'string') return '';
    return texto.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

// Garantir que pasta uploads existe
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// ==================== MULTER CONFIG ====================

const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
        cb(null, name);
    }
});

const ALLOWED_MIMES = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    'application/pdf',
    'video/mp4',
    'audio/mpeg',
    'audio/ogg',
    'audio/opus',
    'audio/wav',
    'audio/mp3',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/zip',
    'application/x-rar-compressed',
    'application/vnd.rar',
    'application/octet-stream'
]);
const ALLOWED_EXTS =
    /\.(jpg|jpeg|png|gif|webp|pdf|bmp|mp4|mp3|ogg|oga|opus|wav|doc|docx|xls|xlsx|ppt|pptx|txt|csv|zip|rar)$/i;

const upload = multer({
    storage,
    limits: { fileSize: 16 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const extOk = ALLOWED_EXTS.test(path.extname(file.originalname));
        const mimeOk = ALLOWED_MIMES.has(file.mimetype);
        if (extOk && mimeOk) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de arquivo não permitido'));
        }
    }
});

// ==================== WAHA CONFIG ====================

const WAHA_URL = process.env.WAHA_API_URL || 'http://localhost:3001';
const WAHA_SESSION = process.env.WAHA_SESSION_NAME || 'default';
const WAHA_KEY = process.env.WAHA_API_KEY || crypto.randomBytes(16).toString('hex');
const sseClients = new Set();
const onlineUsers = new Map(); // userId -> { id, nome, perfil, lastSeen, page }

function getOnlineList() {
    return [...onlineUsers.values()].map((u) => ({
        id: u.id,
        nome: u.nome,
        perfil: u.perfil,
        page: u.page,
        foto_url: u.foto_url || null
    }));
}

async function wahaFetch(endpoint, options = {}) {
    const url = `${WAHA_URL}${endpoint}`;
    const headers = { 'Content-Type': 'application/json', 'X-Api-Key': WAHA_KEY, ...options.headers };
    const res = await fetch(url, { ...options, headers });
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('image') || ct.includes('octet-stream') || ct.includes('audio') || ct.includes('video')) {
        return { status: res.status, buffer: Buffer.from(await res.arrayBuffer()), contentType: ct };
    }
    try {
        return { status: res.status, data: await res.json() };
    } catch {
        return { status: res.status, data: { message: await res.text() } };
    }
}

async function enviarMensagemWhatsApp(chatId, text) {
    return wahaFetch('/api/sendText', {
        method: 'POST',
        body: JSON.stringify({ session: WAHA_SESSION, chatId, text })
    });
}

function broadcastSSE(event) {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of sseClients) client.write(data);
}

async function processarAutoResposta(msg) {
    const db = getDB();
    const texto = (msg.body || '').toLowerCase().trim();
    if (!texto) return;
    const respostas = db.queryAll('SELECT * FROM whatsapp_auto_respostas WHERE ativo = 1');
    for (const r of respostas) {
        const palavras = r.palavra_chave
            .toLowerCase()
            .split(',')
            .map((p) => p.trim());
        if (palavras.some((p) => texto.includes(p))) {
            const chatId = msg.from || msg.chatId;
            try {
                await enviarMensagemWhatsApp(chatId, r.resposta);
            } catch (e) {
                console.error('Auto-resp erro:', e.message);
            }
            break;
        }
    }
}

// ==================== FLOW ENGINE ====================

function getNextNode(node, outputKey) {
    const connections = node.outputs?.[outputKey]?.connections;
    if (connections && connections.length > 0) return String(connections[0].node);
    return null;
}

function substituirVariaveis(texto, variaveis) {
    return texto.replace(/\{(\w+)\}/g, (match, key) => (variaveis[key] !== undefined ? variaveis[key] : match));
}

function atualizarSessao(db, sessaoId, nodeAtual, variaveis) {
    db.queryRun(
        "UPDATE whatsapp_flow_sessoes SET node_atual = ?, variaveis = ?, atualizado_em = datetime('now','localtime') WHERE id = ?",
        [nodeAtual, JSON.stringify(variaveis), sessaoId]
    );
}

function finalizarSessao(db, sessaoId) {
    db.queryRun(
        "UPDATE whatsapp_flow_sessoes SET status = 'finalizado', atualizado_em = datetime('now','localtime') WHERE id = ?",
        [sessaoId]
    );
}

async function processarFluxo(msg) {
    const db = getDB();
    const chatId = msg.from;
    const textoUsuario = (msg.body || '').trim();

    // 1. Buscar sessao ativa
    let sessao = db.queryGet(
        "SELECT * FROM whatsapp_flow_sessoes WHERE chat_id = ? AND status = 'ativo' ORDER BY id DESC LIMIT 1",
        [chatId]
    );

    // 2. Se nao existe, checar fluxo ativo e criar sessao
    if (!sessao) {
        const flow = db.queryGet('SELECT * FROM whatsapp_flows WHERE ativo = 1 ORDER BY id DESC LIMIT 1');
        if (!flow) return false;

        let flowData;
        try {
            flowData = JSON.parse(flow.dados_flow);
        } catch {
            return false;
        }
        const nodes = flowData?.drawflow?.Home?.data;
        if (!nodes) return false;

        const inicioNode = Object.values(nodes).find((n) => n.name === 'inicio');
        if (!inicioNode) return false;

        const r = db.queryRun(
            'INSERT INTO whatsapp_flow_sessoes (flow_id, chat_id, chat_nome, node_atual, variaveis) VALUES (?, ?, ?, ?, ?)',
            [flow.id, chatId, msg.senderName || '', String(inicioNode.id), '{}']
        );
        sessao = db.queryGet('SELECT * FROM whatsapp_flow_sessoes WHERE id = ?', [r.lastInsertRowid]);
    }

    // 3. Carregar fluxo
    const flow = db.queryGet('SELECT * FROM whatsapp_flows WHERE id = ?', [sessao.flow_id]);
    if (!flow) return false;

    let flowData;
    try {
        flowData = JSON.parse(flow.dados_flow);
    } catch {
        return false;
    }
    const nodes = flowData?.drawflow?.Home?.data;
    if (!nodes) return false;

    let variaveis;
    try {
        variaveis = JSON.parse(sessao.variaveis || '{}');
    } catch {
        variaveis = {};
    }

    // Detectar se estamos retornando a um no que espera input
    let currentNodeId = sessao.node_atual;
    const startNode = nodes[currentNodeId];
    let aguardandoInput = false;
    if (startNode && (startNode.name === 'menu' || startNode.name === 'entrada')) {
        // Se a sessao ja estava neste no, o usuario esta respondendo
        aguardandoInput = true;
    }

    // 4. Loop de processamento (max 50 passos anti-loop)
    let steps = 0;
    let shouldContinue = true;
    let needsInput = false;

    while (shouldContinue && !needsInput && steps < 50) {
        steps++;
        const node = nodes[currentNodeId];
        if (!node) {
            finalizarSessao(db, sessao.id);
            return true;
        }

        switch (node.name) {
            case 'inicio': {
                currentNodeId = getNextNode(node, 'output_1');
                break;
            }
            case 'mensagem': {
                const texto = substituirVariaveis(node.data.texto || '', variaveis);
                if (texto) await enviarMensagemWhatsApp(chatId, texto);
                currentNodeId = getNextNode(node, 'output_1');
                break;
            }
            case 'menu': {
                if (!aguardandoInput) {
                    // Primeira visita: enviar menu
                    const opcoes = node.data.opcoes || [];
                    let menuText = substituirVariaveis(node.data.titulo || 'Selecione:', variaveis);
                    opcoes.forEach((op, i) => {
                        menuText += `\n${i + 1}. ${op.texto}`;
                    });
                    await enviarMensagemWhatsApp(chatId, menuText);
                    atualizarSessao(db, sessao.id, currentNodeId, variaveis);
                    needsInput = true;
                } else {
                    // Usuario respondeu
                    const opcoes = node.data.opcoes || [];
                    const escolha = parseInt(textoUsuario);
                    let outputIdx = -1;
                    if (escolha >= 1 && escolha <= opcoes.length) {
                        outputIdx = escolha - 1;
                    } else {
                        outputIdx = opcoes.findIndex((op) =>
                            textoUsuario.toLowerCase().includes(op.texto.toLowerCase())
                        );
                    }
                    if (outputIdx >= 0) {
                        variaveis['_menu_escolha'] = opcoes[outputIdx].texto;
                        currentNodeId = getNextNode(node, `output_${outputIdx + 1}`);
                        aguardandoInput = false;
                    } else {
                        const tentativas = parseInt(variaveis['_menu_tentativas'] || '0') + 1;
                        const maxTentativas = node.data.tentativas || 3;
                        if (tentativas >= maxTentativas) {
                            finalizarSessao(db, sessao.id);
                            await enviarMensagemWhatsApp(
                                chatId,
                                'Numero maximo de tentativas atingido. Atendimento encerrado.'
                            );
                            return true;
                        }
                        variaveis['_menu_tentativas'] = String(tentativas);
                        await enviarMensagemWhatsApp(chatId, node.data.msg_erro || 'Opcao invalida. Tente novamente.');
                        atualizarSessao(db, sessao.id, currentNodeId, variaveis);
                        needsInput = true;
                    }
                }
                break;
            }
            case 'condicao': {
                const campo = node.data.campo || '';
                const operador = node.data.operador || '==';
                const valor = node.data.valor || '';
                const varValor = String(variaveis[campo] || '');
                let resultado = false;
                switch (operador) {
                    case '==':
                        resultado = varValor === valor;
                        break;
                    case '!=':
                        resultado = varValor !== valor;
                        break;
                    case 'contem':
                        resultado = varValor.toLowerCase().includes(valor.toLowerCase());
                        break;
                    case 'nao_contem':
                        resultado = !varValor.toLowerCase().includes(valor.toLowerCase());
                        break;
                    case 'existe':
                        resultado = !!varValor;
                        break;
                    case 'vazio':
                        resultado = !varValor;
                        break;
                }
                currentNodeId = getNextNode(node, resultado ? 'output_1' : 'output_2');
                break;
            }
            case 'entrada': {
                if (!aguardandoInput) {
                    const prompt = substituirVariaveis(node.data.prompt || 'Digite:', variaveis);
                    await enviarMensagemWhatsApp(chatId, prompt);
                    atualizarSessao(db, sessao.id, currentNodeId, variaveis);
                    needsInput = true;
                } else {
                    const nomeVar = node.data.variavel || 'entrada';
                    variaveis[nomeVar] = textoUsuario;
                    currentNodeId = getNextNode(node, 'output_1');
                    aguardandoInput = false;
                }
                break;
            }
            case 'integracao': {
                try {
                    const url = substituirVariaveis(node.data.url || '', variaveis);
                    const metodo = (node.data.metodo || 'GET').toUpperCase();
                    const headers = { 'Content-Type': 'application/json' };
                    const opts = { method: metodo, headers };
                    if (metodo !== 'GET' && node.data.body) {
                        opts.body = substituirVariaveis(node.data.body, variaveis);
                    }
                    const resp = await fetch(url, opts);
                    const respData = await resp.json();
                    variaveis['_integracao_status'] = String(resp.status);
                    if (node.data.variavel_resultado) {
                        variaveis[node.data.variavel_resultado] =
                            typeof respData === 'object' ? JSON.stringify(respData) : String(respData);
                    }
                    currentNodeId = getNextNode(node, resp.ok ? 'output_1' : 'output_2');
                } catch (e) {
                    variaveis['_integracao_erro'] = e.message;
                    currentNodeId = getNextNode(node, 'output_2');
                }
                break;
            }
            case 'transferir': {
                const mensagem = substituirVariaveis(
                    node.data.mensagem || 'Voce sera transferido para um atendente.',
                    variaveis
                );
                await enviarMensagemWhatsApp(chatId, mensagem);
                db.queryRun(
                    "UPDATE whatsapp_flow_sessoes SET status = 'transferido', atualizado_em = datetime('now','localtime') WHERE id = ?",
                    [sessao.id]
                );
                shouldContinue = false;
                break;
            }
            case 'fim': {
                if (node.data.mensagem) {
                    await enviarMensagemWhatsApp(chatId, substituirVariaveis(node.data.mensagem, variaveis));
                }
                finalizarSessao(db, sessao.id);
                shouldContinue = false;
                break;
            }
            default: {
                currentNodeId = getNextNode(node, 'output_1');
                break;
            }
        }

        // Reset tentativas do menu ao sair
        if (node.name === 'menu' && !needsInput) {
            delete variaveis['_menu_tentativas'];
        }

        if (!currentNodeId && shouldContinue && !needsInput) {
            finalizarSessao(db, sessao.id);
            shouldContinue = false;
        }
    }

    if (steps >= 50) {
        console.error('Flow engine: loop infinito detectado, sessao finalizada. Flow:', flow.id);
        finalizarSessao(db, sessao.id);
    } else if (shouldContinue && !needsInput && currentNodeId) {
        atualizarSessao(db, sessao.id, currentNodeId, variaveis);
    }

    return true;
}

// Limpeza periodica de sessoes abandonadas (>30min)
setInterval(
    () => {
        try {
            const db = getDB();
            const limite = new Date(Date.now() - 30 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
            db.queryRun(
                "UPDATE whatsapp_flow_sessoes SET status = 'finalizado' WHERE status = 'ativo' AND atualizado_em < ?",
                [limite]
            );
        } catch {}
    },
    5 * 60 * 1000
); // A cada 5 minutos

async function dispararNotificacao(tipo, dados) {
    const db = getDB();
    const config = db.queryGet('SELECT * FROM whatsapp_notificacoes WHERE tipo = ? AND ativo = 1', [tipo]);
    if (!config || !config.chat_id) return;
    let texto = config.mensagem_template || '';
    for (const [key, val] of Object.entries(dados)) {
        const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        texto = texto.replace(new RegExp(`\\{${safeKey}\\}`, 'g'), val || '');
    }
    try {
        await enviarMensagemWhatsApp(config.chat_id, texto);
    } catch (e) {
        console.error(`Notif ${tipo}:`, e.message);
    }
}

// ==================== AUTH MIDDLEWARE ====================

function requireAuth(req, res, next) {
    if (req.session && req.session.usuario) return next();
    if (req.path.startsWith('/api/')) return res.status(401).json({ erro: 'Não autenticado' });
    return res.redirect('/login');
}

function requireAdmin(req, res, next) {
    if (req.session && req.session.usuario && req.session.usuario.perfil === 'admin') return next();
    if (req.path.startsWith('/api/')) return res.status(403).json({ erro: 'Acesso restrito a administradores' });
    return res.redirect('/');
}

function requireVendedorOuAdmin(req, res, next) {
    const perfil = req.session && req.session.usuario && req.session.usuario.perfil;
    if (['admin', 'vendedor'].includes(perfil)) return next();
    if (req.path.startsWith('/api/')) return res.status(403).json({ erro: 'Acesso restrito a vendedores/admin' });
    return res.redirect('/');
}

function requireModuleAccess(moduleName) {
    return (req, res, next) => {
        if (req.session.usuario.perfil === 'admin') return next();
        const db = getDB();
        const perm = db.queryGet('SELECT ativo FROM permissoes_modulos WHERE perfil = ? AND modulo = ?', [
            req.session.usuario.perfil,
            moduleName
        ]);
        if (perm && perm.ativo) return next();
        if (req.path.startsWith('/api/')) return res.status(403).json({ erro: 'Acesso não permitido a este módulo' });
        return res.redirect('/');
    };
}

function requireGerenciaOuAdmin(req, res, next) {
    const perfil = req.session && req.session.usuario && req.session.usuario.perfil;
    if (['admin', 'gestor_atendimento', 'gerente_noc'].includes(perfil)) return next();
    if (req.path.startsWith('/api/')) return res.status(403).json({ erro: 'Acesso restrito a gerência' });
    return res.redirect('/');
}

function filtrarPorVendedor(req) {
    if (req.session.usuario.perfil === 'vendedor') return req.session.usuario.nome;
    return req.query.vendedor || null;
}

// ==================== ROTAS PUBLICAS (SEM AUTH) ====================

app.get('/login', (req, res) => {
    if (req.session && req.session.usuario) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.post('/api/login', loginLimiter, (req, res) => {
    const db = getDB();
    let { usuario, senha } = req.body;
    if (!usuario || !senha) return res.status(400).json({ erro: 'Usuario e senha sao obrigatorios' });
    if (typeof usuario !== 'string' || typeof senha !== 'string')
        return res.status(400).json({ erro: 'Dados invalidos' });
    usuario = usuario.trim().replace(/\s+/g, '');
    if (!usuario || usuario.length > 100) return res.status(400).json({ erro: 'Usuario invalido' });
    if (senha.length > 128) return res.status(400).json({ erro: 'Senha invalida' });

    const user = db.queryGet('SELECT * FROM usuarios WHERE usuario = ? AND ativo = 1', [usuario]);
    if (!user || !bcrypt.compareSync(senha, user.senha)) {
        return res.status(401).json({ erro: 'Usuário ou senha inválidos' });
    }

    // Se 2FA ativo, exigir codigo
    if (user.totp_ativo === 1) {
        req.session._2fa_pendente = { id: user.id, nome: user.nome, usuario: user.usuario, perfil: user.perfil };
        return res.json({ requer_2fa: true });
    }

    req.session.usuario = { id: user.id, nome: user.nome, usuario: user.usuario, perfil: user.perfil };
    registrarAtividade(req, 'login', 'auth', user.id, `Login: ${user.nome}`);
    res.json({ id: user.id, nome: user.nome, usuario: user.usuario, perfil: user.perfil });
});

app.post('/api/login/2fa', loginLimiter, (req, res) => {
    const { codigo } = req.body;
    const pendente = req.session._2fa_pendente;
    if (!pendente) return res.status(400).json({ erro: 'Sessao 2FA expirada. Faca login novamente.' });

    const db = getDB();
    const user = db.queryGet('SELECT totp_secret FROM usuarios WHERE id = ? AND ativo = 1', [pendente.id]);
    if (!user || !user.totp_secret) return res.status(400).json({ erro: 'Erro de configuracao 2FA' });

    const valido = authenticator.check(codigo, user.totp_secret);
    if (!valido) return res.status(401).json({ erro: 'Codigo 2FA invalido' });

    delete req.session._2fa_pendente;
    req.session.usuario = pendente;
    registrarAtividade(req, 'login', 'auth', pendente.id, `Login 2FA: ${pendente.nome}`);
    res.json(pendente);
});

app.post('/api/logout', (req, res) => {
    const userId = req.session?.usuario?.id;
    const userName = req.session?.usuario?.nome;
    registrarAtividade(req, 'logout', 'auth', userId, `Logout: ${userName}`);
    if (userId && onlineUsers.has(userId)) {
        onlineUsers.delete(userId);
        broadcastSSE({ event: 'user.offline', payload: { id: userId, nome: userName } });
    }
    req.session.destroy(() => res.json({ sucesso: true }));
});

// Webhook do WAHA (chamado pelo Docker container local)
// Helper: salvar mensagem no banco local (para busca e exportacao)
function salvarMensagemLocal(msgData) {
    try {
        const db = getDB();
        db.queryRun(
            `INSERT OR IGNORE INTO whatsapp_mensagens
            (message_id, chat_id, chat_name, from_me, body, type, sender_name, media_url, filename, timestamp, quoted_msg_id, quoted_msg_body)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                msgData.messageId,
                msgData.chatId,
                msgData.chatName || '',
                msgData.fromMe ? 1 : 0,
                msgData.body || '',
                msgData.type || 'chat',
                msgData.senderName || '',
                msgData.mediaUrl || null,
                msgData.filename || null,
                msgData.timestamp || Math.floor(Date.now() / 1000),
                msgData.quotedMsgId || null,
                msgData.quotedMsgBody || null
            ]
        );
    } catch (e) {
        console.error('[db] erro ao salvar msg:', e.message);
    }
}

const WAHA_WEBHOOK_TOKEN = process.env.WAHA_WEBHOOK_TOKEN || '';

app.post('/api/whatsapp/webhook', async (req, res) => {
    // Token validation desabilitado - WAHA CORE nao suporta headers extras
    // Seguro pois roda em rede local (Docker -> localhost)

    const data = req.body;
    const event = data.event;
    console.log(`[webhook] event=${event} session=${data.session}`);

    // message.ack = delivery/read receipts
    if (event === 'message.ack' && data.payload) {
        broadcastSSE({ event: 'message.status', payload: data.payload });
        return res.json({ ok: true });
    }

    // Mensagem real
    if (event === 'message' && data.payload) {
        const p = data.payload;
        const msgId = typeof p.id === 'object' ? p.id._serialized : p.id || '';
        const chatId = p.from || p.chatId || '';
        const msgBody = p.body || '';
        const msgType = p.type || 'chat';
        const senderName = p._data?.notifyName || p.notifyName || '';
        const hasMedia = p.hasMedia || false;
        const mediaUrl = p.media?.url || null;

        const normalized = {
            event: 'message',
            payload: {
                from: chatId,
                to: p.to || '',
                fromMe: p.fromMe || false,
                body: msgBody,
                senderName,
                type: msgType,
                timestamp: p.timestamp || Math.floor(Date.now() / 1000),
                id: msgId,
                chatName: senderName,
                isGroup: chatId.includes('@g.us'),
                hasMedia,
                _mediaUrl: mediaUrl,
                filename: p.media?.filename || null
            }
        };
        broadcastSSE(normalized);
        cachedChatsTime = 0; // Invalidar cache de chats

        // Salvar no banco local (para busca e exportacao)
        salvarMensagemLocal({
            messageId: msgId,
            chatId,
            chatName: senderName,
            fromMe: p.fromMe || false,
            body: msgBody,
            type: msgType,
            senderName,
            mediaUrl,
            filename: p.media?.filename || null,
            timestamp: p.timestamp || Math.floor(Date.now() / 1000),
            quotedMsgId: p.quotedMsg?.id
                ? typeof p.quotedMsg.id === 'object'
                    ? p.quotedMsg.id._serialized
                    : p.quotedMsg.id
                : null,
            quotedMsgBody: p.quotedMsg?.body || null
        });

        // Metricas
        try {
            const db = getDB();
            db.queryRun('INSERT INTO whatsapp_metricas (tipo, chat_id, chat_nome) VALUES (?, ?, ?)', [
                p.fromMe ? 'enviada' : 'recebida',
                chatId,
                senderName
            ]);
        } catch {}
        if (!p.fromMe) {
            // Fila de atendimento: criar entrada se nao existe (ignora grupos)
            if (!chatId.includes('@g.us')) {
                try {
                    const db2 = getDB();
                    const atendExistente = db2.queryGet(
                        "SELECT id, agente_id, status FROM whatsapp_atendimentos WHERE chat_id = ? AND status IN ('fila','em_atendimento')",
                        [chatId]
                    );
                    if (!atendExistente) {
                        const result = db2.queryRun(
                            "INSERT INTO whatsapp_atendimentos (chat_id, chat_nome, status) VALUES (?, ?, 'fila')",
                            [chatId, senderName || chatId.split('@')[0]]
                        );
                        db2.queryRun(
                            "INSERT INTO whatsapp_atendimentos_log (atendimento_id, acao, detalhes) VALUES (?, 'criado', 'Mensagem recebida')",
                            [result.lastInsertRowid]
                        );
                        broadcastSSE({
                            event: 'atendimento.novo',
                            payload: {
                                id: result.lastInsertRowid,
                                chat_id: chatId,
                                chat_nome: senderName || chatId.split('@')[0],
                                status: 'fila'
                            }
                        });
                    }
                    // Anexar info de atendimento ao payload para filtragem client-side
                    const atendInfo =
                        atendExistente ||
                        db2.queryGet(
                            "SELECT id, agente_id, status FROM whatsapp_atendimentos WHERE chat_id = ? AND status IN ('fila','em_atendimento')",
                            [chatId]
                        );
                    if (atendInfo) {
                        normalized.payload._atendimento = {
                            id: atendInfo.id,
                            agente_id: atendInfo.agente_id,
                            status: atendInfo.status
                        };
                    }
                } catch (e) {
                    console.error('Erro fila atendimento:', e.message);
                }
            }

            // Executar fluxo/auto-resposta em background (nao bloqueia o webhook)
            (async () => {
                try {
                    const handledByFlow = await processarFluxo({ body: msgBody || '', from: chatId, senderName });
                    if (!handledByFlow && msgBody) processarAutoResposta({ body: msgBody, from: chatId });
                } catch (e) {
                    console.error('Erro ao processar fluxo/auto-resposta:', e);
                }
            })();
        }
    }

    if (event === 'session.status') broadcastSSE({ event: 'session.status', payload: data.payload });
    if (event === 'presence.update') broadcastSSE({ event: 'presence.update', payload: data.payload });

    res.json({ ok: true });
});

// --- Formulario publico (SEM AUTH) ---

app.get('/formulario/:token', (req, res) => {
    const db = getDB();
    const form = db.queryGet('SELECT * FROM formularios_cadastro WHERE token = ?', [req.params.token]);
    if (!form) return res.status(404).send('Formulario nao encontrado ou expirado.');
    res.sendFile(path.join(__dirname, 'views', 'formulario-cadastro.html'));
});

app.get('/api/formulario/:token', (req, res) => {
    const db = getDB();
    const form = db.queryGet('SELECT * FROM formularios_cadastro WHERE token = ?', [req.params.token]);
    if (!form) return res.status(404).json({ erro: 'Formulario nao encontrado' });
    res.json({ provedor_nome: form.provedor_nome, status: form.status });
});

app.post('/api/formulario/:token', formPublicLimiter, express.json(), (req, res) => {
    const db = getDB();
    const form = db.queryGet('SELECT * FROM formularios_cadastro WHERE token = ?', [req.params.token]);
    if (!form) return res.status(404).json({ erro: 'Formulario nao encontrado' });
    if (form.status === 'preenchido') return res.status(400).json({ erro: 'Formulario ja foi preenchido' });

    db.queryRun(
        "UPDATE formularios_cadastro SET dados = ?, status = 'preenchido', preenchido_em = datetime('now','localtime') WHERE id = ?",
        [JSON.stringify(req.body), form.id]
    );
    res.json({ ok: true, mensagem: 'Cadastro enviado com sucesso!' });
});

// --- Download publico de proposta PDF via token (com rastreamento) ---
app.get('/proposta-pdf/:token', (req, res) => {
    const db = getDB();
    const proposta = db.queryGet('SELECT * FROM vendas_propostas WHERE pdf_token = ?', [req.params.token]);
    if (!proposta || !proposta.pdf_caminho || !fs.existsSync(proposta.pdf_caminho)) {
        return res.status(404).send('PDF nao encontrado.');
    }
    // Rastreamento: registrar visualizacao
    try {
        db.queryRun('INSERT INTO vendas_propostas_views (proposta_id, ip, user_agent) VALUES (?, ?, ?)', [
            proposta.id,
            req.ip || req.connection?.remoteAddress || '',
            (req.headers['user-agent'] || '').substring(0, 255)
        ]);
        db.queryRun('UPDATE vendas_propostas SET visualizacoes = COALESCE(visualizacoes, 0) + 1 WHERE id = ?', [
            proposta.id
        ]);
        broadcastSSE({
            event: 'proposta.visualizada',
            payload: { proposta_id: proposta.id, provedor_nome: proposta.provedor_nome }
        });
    } catch {}
    res.download(proposta.pdf_caminho, `Proposta_${proposta.provedor_nome.replace(/\s+/g, '_')}.pdf`);
});

// Pagina publica de aceite digital do contrato
app.get('/contrato-aceite/:token', (req, res) => {
    const db = getDB();
    const contrato = db.queryGet('SELECT * FROM vendas_contratos WHERE assinatura_token = ?', [req.params.token]);
    if (!contrato) return res.status(404).send('<h2>Contrato nao encontrado</h2>');
    if (contrato.status === 'assinado') {
        return res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Contrato Assinado</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
        </head><body class="bg-light"><div class="container py-5"><div class="card mx-auto" style="max-width:600px">
        <div class="card-body text-center py-5"><i class="bi bi-check-circle-fill text-success" style="font-size:4rem"></i>
        <h3 class="mt-3">Contrato ja assinado!</h3><p class="text-muted">Assinado por <strong>${escapeHtml(contrato.assinatura_nome)}</strong> em ${escapeHtml(new Date(contrato.assinado_em).toLocaleString('pt-BR'))}</p>
        </div></div></div></body></html>`);
    }
    res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Aceite Digital - ${escapeHtml(contrato.titulo)}</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">
    <style>body{background:#f0f2f5;font-family:'Segoe UI',sans-serif}.header-bar{background:linear-gradient(135deg,#1a1a2e,#16213e);color:#fff;padding:1.5rem;text-align:center;border-radius:0 0 16px 16px}.header-bar h4{margin:0;font-weight:700}.contrato-card{max-width:700px;margin:2rem auto;border-radius:14px;box-shadow:0 4px 20px rgba(0,0,0,.1);overflow:hidden;background:#fff}.contrato-body{padding:2rem}.info-row{display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:1.5rem}.info-box{flex:1;min-width:200px;background:#f8f9fa;border-radius:8px;padding:.75rem 1rem}.info-label{font-size:.75rem;color:#999;text-transform:uppercase;font-weight:600}.info-value{font-weight:700;color:#1a1a2e}.valor-destaque{background:linear-gradient(135deg,#198754,#20c997);color:#fff;border-radius:10px;padding:1rem 1.5rem;text-align:center;margin:1rem 0}.valor-destaque .valor{font-size:1.8rem;font-weight:700}.conteudo-termos{background:#f8f9fa;border-radius:8px;padding:1.25rem;margin:1.5rem 0;max-height:400px;overflow-y:auto;border:1px solid #e9ecef;white-space:pre-wrap;font-size:.9rem;line-height:1.6;color:#444}.aceite-section{border-top:2px solid #e9ecef;padding-top:1.5rem;margin-top:1.5rem}.aceite-section h5{font-weight:700;margin-bottom:1rem}.btn-assinar{background:linear-gradient(135deg,#198754,#20c997);border:none;color:#fff;font-weight:700;padding:.75rem 2rem;border-radius:10px;font-size:1rem;transition:all .2s}.btn-assinar:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(25,135,84,.4);color:#fff}.btn-assinar:disabled{opacity:.5;transform:none;cursor:not-allowed}</style>
    </head><body>
    <div class="header-bar"><h4><i class="bi bi-file-earmark-text me-2"></i>Aceite Digital de Contrato</h4></div>
    <div class="contrato-card">
        <div class="contrato-body">
            <h4 class="fw-bold mb-3">${escapeHtml(contrato.titulo)}</h4>
            <div class="info-row">
                <div class="info-box"><div class="info-label">Contratante</div><div class="info-value">${escapeHtml(contrato.provedor_nome)}</div></div>
                <div class="info-box"><div class="info-label">Contrato</div><div class="info-value">#${contrato.id}${contrato.numero_contrato ? ' - ' + escapeHtml(contrato.numero_contrato) : ''}</div></div>
            </div>
            <div class="info-row">
                ${contrato.data_inicio ? `<div class="info-box"><div class="info-label">Inicio</div><div class="info-value">${new Date(contrato.data_inicio).toLocaleDateString('pt-BR')}</div></div>` : ''}
                ${contrato.data_fim ? `<div class="info-box"><div class="info-label">Fim</div><div class="info-value">${new Date(contrato.data_fim).toLocaleDateString('pt-BR')}</div></div>` : ''}
            </div>
            ${
                contrato.valor_mensal || contrato.valor_total
                    ? `<div class="valor-destaque">
                ${contrato.valor_mensal ? `<div><small>Valor Mensal</small><div class="valor">R$ ${Number(contrato.valor_mensal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div></div>` : ''}
                ${contrato.valor_total ? `<div class="mt-1"><small>Valor Total: R$ ${Number(contrato.valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</small></div>` : ''}
            </div>`
                    : ''
            }
            ${contrato.conteudo ? `<h6 class="fw-bold mt-3"><i class="bi bi-file-text me-1"></i>Termos e Condicoes</h6><div class="conteudo-termos">${escapeHtml(contrato.conteudo)}</div>` : ''}
            <div class="aceite-section">
                <h5><i class="bi bi-pen me-2"></i>Assinatura Digital</h5>
                <div class="mb-3"><label class="form-label fw-semibold">Nome completo *</label><input type="text" class="form-control form-control-lg" id="nomeAceite" placeholder="Digite seu nome completo"></div>
                <div class="form-check mb-3"><input type="checkbox" class="form-check-input" id="checkAceite"><label class="form-check-label" for="checkAceite">Li e aceito todos os termos e condicoes deste contrato</label></div>
                <button class="btn btn-assinar w-100" id="btnAssinar" disabled onclick="assinarContrato()"><i class="bi bi-check2-circle me-2"></i>Assinar Contrato</button>
                <div id="msgResult" class="mt-3"></div>
            </div>
        </div>
    </div>
    <script>
    const checkAceite = document.getElementById('checkAceite');
    const nomeInput = document.getElementById('nomeAceite');
    const btnAssinar = document.getElementById('btnAssinar');
    function validar() { btnAssinar.disabled = !(checkAceite.checked && nomeInput.value.trim().length >= 3); }
    checkAceite.addEventListener('change', validar);
    nomeInput.addEventListener('input', validar);
    async function assinarContrato() {
        btnAssinar.disabled = true;
        btnAssinar.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Processando...';
        try {
            const r = await fetch('/api/contrato-aceite/${req.params.token}', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: nomeInput.value.trim() }) });
            const data = await r.json();
            if (data.ok) {
                document.getElementById('msgResult').innerHTML = '<div class="alert alert-success"><i class="bi bi-check-circle-fill me-2"></i><strong>Contrato assinado com sucesso!</strong></div>';
                document.querySelector('.aceite-section').querySelectorAll('input,button').forEach(el => el.disabled = true);
            } else {
                document.getElementById('msgResult').innerHTML = '<div class="alert alert-danger">' + (data.erro || 'Erro') + '</div>';
                btnAssinar.disabled = false;
                btnAssinar.innerHTML = '<i class="bi bi-check2-circle me-2"></i>Assinar Contrato';
            }
        } catch { document.getElementById('msgResult').innerHTML = '<div class="alert alert-danger">Erro de conexao</div>'; btnAssinar.disabled = false; btnAssinar.innerHTML = '<i class="bi bi-check2-circle me-2"></i>Assinar Contrato'; }
    }
    </script></body></html>`);
});

app.post('/api/contrato-aceite/:token', (req, res) => {
    const db = getDB();
    const contrato = db.queryGet('SELECT * FROM vendas_contratos WHERE assinatura_token = ?', [req.params.token]);
    if (!contrato) return res.status(404).json({ erro: 'Contrato nao encontrado' });
    if (contrato.status === 'assinado') return res.status(400).json({ erro: 'Contrato ja assinado' });
    const { nome } = req.body;
    if (!nome || nome.trim().length < 3) return res.status(400).json({ erro: 'Nome obrigatorio (min 3 caracteres)' });
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || '';
    db.queryRun(
        "UPDATE vendas_contratos SET status = ?, assinado_em = datetime('now','localtime'), assinatura_ip = ?, assinatura_nome = ? WHERE id = ?",
        ['assinado', ip, nome.trim(), contrato.id]
    );
    broadcastSSE({
        event: 'contrato.assinado',
        payload: { id: contrato.id, provedor_nome: contrato.provedor_nome, assinatura_nome: nome.trim() }
    });
    res.json({ ok: true });
});

// ==================== BARREIRA DE AUTENTICACAO ====================

app.use(requireAuth);

// ==================== ROTAS HTML (PROTEGIDAS) ====================

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'index.html')));
app.get('/chamados', requireModuleAccess('chamados'), (req, res) =>
    res.sendFile(path.join(__dirname, 'views', 'chamados.html'))
);
app.get('/treinamentos', requireModuleAccess('treinamentos'), (req, res) =>
    res.sendFile(path.join(__dirname, 'views', 'treinamentos.html'))
);
app.get('/projetos', requireModuleAccess('projetos'), (req, res) =>
    res.sendFile(path.join(__dirname, 'views', 'projetos.html'))
);
app.get('/historico', requireModuleAccess('historico'), (req, res) =>
    res.sendFile(path.join(__dirname, 'views', 'historico.html'))
);
app.get('/provedores', requireModuleAccess('provedores'), (req, res) =>
    res.sendFile(path.join(__dirname, 'views', 'provedores.html'))
);
app.get('/whatsapp', requireModuleAccess('whatsapp'), (req, res) =>
    res.sendFile(path.join(__dirname, 'views', 'whatsapp.html'))
);
app.get('/atendimento', requireModuleAccess('whatsapp'), (req, res) =>
    res.sendFile(path.join(__dirname, 'views', 'atendimento.html'))
);
app.get('/flow', requireModuleAccess('whatsapp'), (req, res) =>
    res.sendFile(path.join(__dirname, 'views', 'flow.html'))
);
app.get('/vendas', requireModuleAccess('vendas'), (req, res) =>
    res.sendFile(path.join(__dirname, 'views', 'vendas.html'))
);
app.get('/dashboard-vendedor', requireModuleAccess('dashboard_vendedor'), (req, res) =>
    res.sendFile(path.join(__dirname, 'views', 'dashboard-vendedor.html'))
);
app.get('/usuarios', requireAdmin, (req, res) => res.sendFile(path.join(__dirname, 'views', 'usuarios.html')));
app.get('/configuracoes', requireAdmin, (req, res) =>
    res.sendFile(path.join(__dirname, 'views', 'configuracoes.html'))
);
app.get('/relatorios', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'views', 'relatorios.html')));
app.get('/conhecimento', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'views', 'conhecimento.html')));
app.get('/agenda', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'views', 'agenda.html')));
app.get('/financeiro', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'views', 'financeiro.html')));
app.get('/fila-atendimento', requireModuleAccess('chamados'), (req, res) =>
    res.sendFile(path.join(__dirname, 'views', 'fila-atendimento.html'))
);
app.get('/nps', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'views', 'nps.html')));
app.get('/ponto', requireAuth, requireModuleAccess('ponto'), (req, res) =>
    res.sendFile(path.join(__dirname, 'views', 'ponto.html'))
);
app.get('/logs', requireAdmin, (req, res) => res.sendFile(path.join(__dirname, 'views', 'logs.html')));

// ==================== API: USUARIOS ONLINE ====================

app.post('/api/heartbeat', (req, res) => {
    const u = req.session.usuario;
    const db = getDB();
    const userDb = db.queryGet('SELECT foto_url FROM usuarios WHERE id = ?', [u.id]);
    const fotoUrl = userDb?.foto_url || null;
    const antes = onlineUsers.has(u.id);
    onlineUsers.set(u.id, {
        id: u.id,
        nome: u.nome,
        perfil: u.perfil,
        foto_url: fotoUrl,
        lastSeen: Date.now(),
        page: req.body.page || ''
    });
    if (!antes) broadcastSSE({ event: 'user.online', payload: { id: u.id, nome: u.nome, perfil: u.perfil } });
    res.json({ ok: true, online: getOnlineList() });
});

app.get('/api/online', (req, res) => {
    res.json(getOnlineList());
});

// ==================== API: CHAT INTERNO ====================

app.get('/api/chat/nao-lidas', (req, res) => {
    const db = getDB();
    const rows = db.queryAll(
        'SELECT remetente_id, COUNT(*) as total FROM chat_mensagens WHERE destinatario_id = ? AND lido = 0 GROUP BY remetente_id',
        [req.session.usuario.id]
    );
    const porUsuario = {};
    let total = 0;
    rows.forEach((r) => {
        porUsuario[r.remetente_id] = r.total;
        total += r.total;
    });
    res.json({ total, porUsuario });
});

app.get('/api/chat/conversas', (req, res) => {
    const db = getDB();
    const meuId = req.session.usuario.id;
    const conversas = db.queryAll(
        `
        SELECT u.id, u.nome, u.foto_url,
            (SELECT texto FROM chat_mensagens WHERE
                (remetente_id = u.id AND destinatario_id = ?) OR
                (remetente_id = ? AND destinatario_id = u.id)
                ORDER BY criado_em DESC LIMIT 1) as ultima_msg,
            (SELECT criado_em FROM chat_mensagens WHERE
                (remetente_id = u.id AND destinatario_id = ?) OR
                (remetente_id = ? AND destinatario_id = u.id)
                ORDER BY criado_em DESC LIMIT 1) as ultima_data,
            (SELECT COUNT(*) FROM chat_mensagens WHERE
                remetente_id = u.id AND destinatario_id = ? AND lido = 0) as nao_lidas
        FROM usuarios u
        WHERE u.id != ? AND u.ativo = 1
            AND EXISTS (SELECT 1 FROM chat_mensagens WHERE
                (remetente_id = u.id AND destinatario_id = ?) OR
                (remetente_id = ? AND destinatario_id = u.id))
        ORDER BY ultima_data DESC
    `,
        [meuId, meuId, meuId, meuId, meuId, meuId, meuId, meuId]
    );
    res.json(conversas);
});

app.get('/api/chat/:userId', (req, res) => {
    const db = getDB();
    const meuId = req.session.usuario.id;
    const outroId = parseInt(req.params.userId);
    if (isNaN(outroId)) return res.status(400).json({ erro: 'ID invalido' });
    const msgs = db.queryAll(
        `
        SELECT m.id, m.remetente_id, m.texto, m.criado_em, u.nome as remetente_nome
        FROM chat_mensagens m JOIN usuarios u ON m.remetente_id = u.id
        WHERE (m.remetente_id = ? AND m.destinatario_id = ?)
           OR (m.remetente_id = ? AND m.destinatario_id = ?)
        ORDER BY m.criado_em DESC LIMIT 100
    `,
        [meuId, outroId, outroId, meuId]
    );
    db.queryRun('UPDATE chat_mensagens SET lido = 1 WHERE remetente_id = ? AND destinatario_id = ? AND lido = 0', [
        outroId,
        meuId
    ]);
    res.json(msgs.reverse());
});

app.post('/api/chat/enviar', (req, res) => {
    const db = getDB();
    const { destinatario_id, texto } = req.body;
    if (!texto?.trim() || !destinatario_id) return res.status(400).json({ erro: 'Dados obrigatorios' });
    const dest = db.queryGet('SELECT id, nome FROM usuarios WHERE id = ? AND ativo = 1', [destinatario_id]);
    if (!dest) return res.status(404).json({ erro: 'Usuario nao encontrado' });
    const result = db.queryRun('INSERT INTO chat_mensagens (remetente_id, destinatario_id, texto) VALUES (?, ?, ?)', [
        req.session.usuario.id,
        destinatario_id,
        texto.trim()
    ]);
    const msg = {
        id: result.lastInsertRowid,
        remetente_id: req.session.usuario.id,
        remetente_nome: req.session.usuario.nome,
        destinatario_id,
        texto: texto.trim(),
        criado_em: new Date().toISOString().replace('T', ' ').substring(0, 19)
    };
    broadcastSSE({ event: 'chat.message', payload: msg });
    res.json(msg);
});

// ==================== API: AUTH INFO ====================

app.get('/api/me', (req, res) => {
    const db = getDB();
    const perms = db.queryAll('SELECT modulo, ativo FROM permissoes_modulos WHERE perfil = ?', [
        req.session.usuario.perfil
    ]);
    const permissoes = {};
    perms.forEach((p) => {
        permissoes[p.modulo] = !!p.ativo;
    });
    // Admin sempre tem acesso a tudo + usuarios
    if (req.session.usuario.perfil === 'admin') {
        [
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
            'configuracoes'
        ].forEach((m) => {
            permissoes[m] = true;
        });
    }
    const userDb = db.queryGet('SELECT foto_url FROM usuarios WHERE id = ?', [req.session.usuario.id]);
    res.json({ ...req.session.usuario, foto_url: userDb?.foto_url || null, permissoes });
});

// ==================== API: PERFIL DO USUARIO ====================

app.post('/api/me/foto', upload.single('foto'), (req, res) => {
    if (!req.file) return res.status(400).json({ erro: 'Arquivo obrigatorio' });
    const db = getDB();
    const fotoUrl = '/uploads/' + req.file.filename;
    db.queryRun('UPDATE usuarios SET foto_url = ? WHERE id = ?', [fotoUrl, req.session.usuario.id]);
    res.json({ ok: true, foto_url: fotoUrl });
});

app.delete('/api/me/foto', (req, res) => {
    const db = getDB();
    db.queryRun('UPDATE usuarios SET foto_url = NULL WHERE id = ?', [req.session.usuario.id]);
    res.json({ ok: true });
});

// ==================== API: ALTERAR SENHA ====================

app.post('/api/me/alterar-senha', (req, res) => {
    const db = getDB();
    const { senha_atual, nova_senha } = req.body;
    if (!senha_atual || !nova_senha) return res.status(400).json({ erro: 'Senha atual e nova senha sao obrigatorias' });
    const erroSenha = validarSenha(nova_senha);
    if (erroSenha) return res.status(400).json({ erro: erroSenha });

    const user = db.queryGet('SELECT * FROM usuarios WHERE id = ?', [req.session.usuario.id]);
    if (!bcrypt.compareSync(senha_atual, user.senha)) {
        return res.status(400).json({ erro: 'Senha atual incorreta' });
    }

    const senhaHash = bcrypt.hashSync(nova_senha, 12);
    db.queryRun('UPDATE usuarios SET senha = ? WHERE id = ?', [senhaHash, req.session.usuario.id]);
    registrarAtividade(req, 'editar', 'auth', req.session.usuario.id, 'Senha alterada');
    res.json({ ok: true, mensagem: 'Senha alterada com sucesso' });
});

// ==================== API: 2FA ====================

app.post('/api/me/2fa/gerar', (req, res) => {
    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(req.session.usuario.usuario, 'GestaoTrabalho', secret);
    res.json({ secret, otpauthUrl });
});

app.post('/api/me/2fa/ativar', (req, res) => {
    const { secret, codigo } = req.body;
    if (!secret || !codigo) return res.status(400).json({ erro: 'Secret e codigo sao obrigatorios' });

    const valido = authenticator.check(codigo, secret);
    if (!valido) return res.status(400).json({ erro: 'Codigo invalido. Tente novamente.' });

    const db = getDB();
    db.queryRun('UPDATE usuarios SET totp_secret = ?, totp_ativo = 1 WHERE id = ?', [secret, req.session.usuario.id]);
    registrarAtividade(req, 'editar', 'auth', req.session.usuario.id, '2FA ativado');
    res.json({ ok: true, mensagem: '2FA ativado com sucesso' });
});

app.post('/api/me/2fa/desativar', (req, res) => {
    const { senha } = req.body;
    if (!senha) return res.status(400).json({ erro: 'Senha obrigatoria para desativar 2FA' });

    const db = getDB();
    const user = db.queryGet('SELECT * FROM usuarios WHERE id = ?', [req.session.usuario.id]);
    if (!bcrypt.compareSync(senha, user.senha)) {
        return res.status(400).json({ erro: 'Senha incorreta' });
    }

    db.queryRun('UPDATE usuarios SET totp_secret = NULL, totp_ativo = 0 WHERE id = ?', [req.session.usuario.id]);
    registrarAtividade(req, 'editar', 'auth', req.session.usuario.id, '2FA desativado');
    res.json({ ok: true, mensagem: '2FA desativado' });
});

app.get('/api/me/2fa/status', (req, res) => {
    const db = getDB();
    const user = db.queryGet('SELECT totp_ativo FROM usuarios WHERE id = ?', [req.session.usuario.id]);
    res.json({ ativo: !!user.totp_ativo });
});

// ==================== API: REGRAS AUTOMATICAS ====================

app.get('/api/regras-automaticas', requireAdmin, (req, res) => {
    const db = getDB();
    res.json(db.queryAll('SELECT * FROM regras_automaticas ORDER BY criado_em DESC'));
});

app.post('/api/regras-automaticas', requireAdmin, (req, res) => {
    const db = getDB();
    const { nome, tipo_gatilho, condicao_valor, acao, acao_config } = req.body;
    if (!nome || !tipo_gatilho || !acao) return res.status(400).json({ erro: 'Nome, gatilho e acao obrigatorios' });

    const result = db.queryRun(
        'INSERT INTO regras_automaticas (nome, tipo_gatilho, condicao_valor, acao, acao_config, criado_por) VALUES (?, ?, ?, ?, ?, ?)',
        [
            nome,
            tipo_gatilho,
            condicao_valor ? JSON.stringify(condicao_valor) : null,
            acao,
            acao_config ? JSON.stringify(acao_config) : null,
            req.session.usuario.nome
        ]
    );
    registrarAtividade(req, 'criar', 'configuracoes', result.lastInsertRowid, `Regra automatica: ${nome}`);
    res.status(201).json(db.queryGet('SELECT * FROM regras_automaticas WHERE id = ?', [result.lastInsertRowid]));
});

app.put('/api/regras-automaticas/:id', requireAdmin, (req, res) => {
    const db = getDB();
    const { nome, tipo_gatilho, condicao_valor, acao, acao_config, ativo } = req.body;
    db.queryRun(
        'UPDATE regras_automaticas SET nome = ?, tipo_gatilho = ?, condicao_valor = ?, acao = ?, acao_config = ?, ativo = ? WHERE id = ?',
        [
            nome,
            tipo_gatilho,
            condicao_valor ? JSON.stringify(condicao_valor) : null,
            acao,
            acao_config ? JSON.stringify(acao_config) : null,
            ativo ? 1 : 0,
            Number(req.params.id)
        ]
    );
    res.json(db.queryGet('SELECT * FROM regras_automaticas WHERE id = ?', [Number(req.params.id)]));
});

app.delete('/api/regras-automaticas/:id', requireAdmin, (req, res) => {
    const db = getDB();
    db.queryRun('DELETE FROM regras_automaticas WHERE id = ?', [Number(req.params.id)]);
    registrarAtividade(req, 'excluir', 'configuracoes', Number(req.params.id), 'Regra automatica excluida');
    res.json({ ok: true });
});

// Engine de regras automaticas
function processarRegrasAutomaticas() {
    try {
        const db = getDB();
        const regras = db.queryAll('SELECT * FROM regras_automaticas WHERE ativo = 1');

        for (const regra of regras) {
            try {
                const condicao = regra.condicao_valor ? JSON.parse(regra.condicao_valor) : {};
                const acaoConfig = regra.acao_config ? JSON.parse(regra.acao_config) : {};

                if (regra.tipo_gatilho === 'chamado_pendente_dias') {
                    const dias = parseInt(condicao.dias, 10) || 3;
                    const chamados = db.queryAll(
                        `SELECT * FROM chamados WHERE status = 'pendente' AND data_abertura <= datetime('now','localtime','-' || ? || ' days')`,
                        [dias]
                    );
                    for (const c of chamados) {
                        if (regra.acao === 'notificar') {
                            criarNotificacaoParaPerfil(
                                'admin',
                                'sistema',
                                `Chamado pendente ha ${dias} dias`,
                                `#${c.id} - ${c.titulo}`,
                                '/chamados'
                            );
                        } else if (regra.acao === 'alterar_status') {
                            db.queryRun('UPDATE chamados SET status = ? WHERE id = ?', [
                                acaoConfig.novo_status || 'em_andamento',
                                c.id
                            ]);
                        }
                    }
                } else if (regra.tipo_gatilho === 'projeto_atrasado') {
                    const projetos = db.queryAll(
                        `SELECT * FROM projetos WHERE status = 'em_andamento' AND data_previsao IS NOT NULL AND data_previsao < date('now','localtime')`
                    );
                    for (const p of projetos) {
                        if (regra.acao === 'notificar') {
                            criarNotificacaoParaPerfil(
                                'admin',
                                'sistema',
                                'Projeto atrasado',
                                `${p.titulo} - Previsao: ${p.data_previsao}`,
                                '/projetos'
                            );
                        }
                    }
                }

                db.queryRun(
                    "UPDATE regras_automaticas SET ultima_execucao = datetime('now','localtime') WHERE id = ?",
                    [regra.id]
                );
            } catch (e) {
                console.error(`Regra ${regra.id} erro:`, e.message);
            }
        }
    } catch (e) {
        console.error('Regras automaticas erro:', e.message);
    }
}

// Executar regras a cada 5 minutos
setInterval(processarRegrasAutomaticas, 5 * 60 * 1000);

// Cleanup usuarios offline (sem heartbeat ha 60s)
setInterval(() => {
    const agora = Date.now();
    for (const [id, u] of onlineUsers) {
        if (agora - u.lastSeen > 60000) {
            onlineUsers.delete(id);
            broadcastSSE({ event: 'user.offline', payload: { id, nome: u.nome } });
        }
    }
}, 30000);

// ==================== API: TAREFAS RECORRENTES ====================

app.get('/api/tarefas-recorrentes', requireAdmin, (req, res) => {
    const db = getDB();
    res.json(db.queryAll('SELECT * FROM tarefas_recorrentes ORDER BY criado_em DESC'));
});

app.post('/api/tarefas-recorrentes', requireAdmin, (req, res) => {
    const db = getDB();
    const { titulo, descricao, modulo, frequencia, dia_semana, dia_mes, hora, config } = req.body;
    if (!titulo || !modulo || !frequencia)
        return res.status(400).json({ erro: 'Titulo, modulo e frequencia obrigatorios' });

    // Calcular proxima execucao
    const proxima = calcularProximaExecucao(frequencia, dia_semana, dia_mes, hora);

    const result = db.queryRun(
        'INSERT INTO tarefas_recorrentes (titulo, descricao, modulo, frequencia, dia_semana, dia_mes, hora, config, proxima_execucao, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
            titulo,
            descricao || null,
            modulo,
            frequencia,
            dia_semana || null,
            dia_mes || null,
            hora || '09:00',
            config ? JSON.stringify(config) : null,
            proxima,
            req.session.usuario.nome
        ]
    );
    registrarAtividade(req, 'criar', 'configuracoes', result.lastInsertRowid, `Tarefa recorrente: ${titulo}`);
    res.status(201).json(db.queryGet('SELECT * FROM tarefas_recorrentes WHERE id = ?', [result.lastInsertRowid]));
});

app.put('/api/tarefas-recorrentes/:id', requireAdmin, (req, res) => {
    const db = getDB();
    const { titulo, descricao, modulo, frequencia, dia_semana, dia_mes, hora, config, ativo } = req.body;
    const proxima = calcularProximaExecucao(frequencia, dia_semana, dia_mes, hora);
    db.queryRun(
        'UPDATE tarefas_recorrentes SET titulo = ?, descricao = ?, modulo = ?, frequencia = ?, dia_semana = ?, dia_mes = ?, hora = ?, config = ?, ativo = ?, proxima_execucao = ? WHERE id = ?',
        [
            titulo,
            descricao || null,
            modulo,
            frequencia,
            dia_semana || null,
            dia_mes || null,
            hora || '09:00',
            config ? JSON.stringify(config) : null,
            ativo ? 1 : 0,
            proxima,
            Number(req.params.id)
        ]
    );
    res.json(db.queryGet('SELECT * FROM tarefas_recorrentes WHERE id = ?', [Number(req.params.id)]));
});

app.delete('/api/tarefas-recorrentes/:id', requireAdmin, (req, res) => {
    const db = getDB();
    db.queryRun('DELETE FROM tarefas_recorrentes WHERE id = ?', [Number(req.params.id)]);
    registrarAtividade(req, 'excluir', 'configuracoes', Number(req.params.id), 'Tarefa recorrente excluida');
    res.json({ ok: true });
});

function calcularProximaExecucao(frequencia, dia_semana, dia_mes, hora) {
    const now = new Date();
    const h = (hora || '09:00').split(':');
    const next = new Date(now);
    next.setHours(parseInt(h[0]) || 9, parseInt(h[1]) || 0, 0, 0);

    if (frequencia === 'diario') {
        if (next <= now) next.setDate(next.getDate() + 1);
    } else if (frequencia === 'semanal') {
        const targetDay = parseInt(dia_semana) || 1;
        next.setDate(next.getDate() + ((targetDay - next.getDay() + 7) % 7 || 7));
    } else if (frequencia === 'quinzenal') {
        if (next <= now) next.setDate(next.getDate() + 15);
    } else if (frequencia === 'mensal') {
        const targetDia = parseInt(dia_mes) || 1;
        next.setMonth(next.getMonth() + (now.getDate() >= targetDia ? 1 : 0));
        next.setDate(Math.min(targetDia, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
    }

    return next.toISOString().replace('T', ' ').substring(0, 19);
}

function processarTarefasRecorrentes() {
    try {
        const db = getDB();
        const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
        const tarefas = db.queryAll('SELECT * FROM tarefas_recorrentes WHERE ativo = 1 AND proxima_execucao <= ?', [
            now
        ]);

        for (const tarefa of tarefas) {
            try {
                criarNotificacaoParaPerfil(
                    'admin',
                    'sistema',
                    `Tarefa recorrente: ${tarefa.titulo}`,
                    tarefa.descricao || 'Executar tarefa programada',
                    '/configuracoes'
                );

                const proxima = calcularProximaExecucao(
                    tarefa.frequencia,
                    tarefa.dia_semana,
                    tarefa.dia_mes,
                    tarefa.hora
                );
                db.queryRun(
                    "UPDATE tarefas_recorrentes SET ultima_execucao = datetime('now','localtime'), proxima_execucao = ? WHERE id = ?",
                    [proxima, tarefa.id]
                );
            } catch (e) {
                console.error(`Tarefa recorrente ${tarefa.id} erro:`, e.message);
            }
        }
    } catch (e) {
        console.error('Tarefas recorrentes erro:', e.message);
    }
}

// Executar tarefas recorrentes a cada 60s
setInterval(processarTarefasRecorrentes, 60 * 1000);

// ==================== MIDDLEWARE: LOG API REQUESTS ====================

function logApiRequest(req, res, next) {
    const inicio = Date.now();
    const originalEnd = res.end;
    res.end = function (...args) {
        const tempo = Date.now() - inicio;
        try {
            const db = getDB();
            db.queryRun(
                'INSERT INTO api_request_log (metodo, endpoint, status_code, tempo_resposta_ms, ip, user_agent, api_token_nome, erro) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    req.method,
                    req.originalUrl,
                    res.statusCode,
                    tempo,
                    req.ip || '',
                    (req.headers['user-agent'] || '').substring(0, 200),
                    req.apiToken?.nome || null,
                    res.statusCode >= 400 ? res._logErro || null : null
                ]
            );
        } catch (e) {
            console.error('Log API request erro:', e.message);
        }
        originalEnd.apply(res, args);
    };
    next();
}

// ==================== FUNCAO: DISPARAR WEBHOOKS ====================

async function dispararWebhooks(evento, dados) {
    try {
        const db = getDB();
        const webhooks = db.queryAll('SELECT * FROM webhooks_saida WHERE ativo = 1');
        for (const wh of webhooks) {
            const eventos = (wh.eventos || '').split(',').map((e) => e.trim());
            if (!eventos.includes(evento) && !eventos.includes('*')) continue;
            const payload = JSON.stringify({ evento, dados, timestamp: new Date().toISOString() });
            const inicio = Date.now();
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 10000);
                const resp = await fetch(wh.url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(wh.headers_json ? JSON.parse(wh.headers_json) : {})
                    },
                    body: payload,
                    signal: controller.signal
                });
                clearTimeout(timeout);
                const tempo = Date.now() - inicio;
                const respText = await resp.text().catch(() => '');
                db.queryRun(
                    'INSERT INTO webhook_dispatch_log (webhook_id, url, evento, payload, status_code, resposta, tempo_resposta_ms, sucesso) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [wh.id, wh.url, evento, payload, resp.status, respText.substring(0, 500), tempo, resp.ok ? 1 : 0]
                );
            } catch (e) {
                const tempo = Date.now() - inicio;
                db.queryRun(
                    'INSERT INTO webhook_dispatch_log (webhook_id, url, evento, payload, tempo_resposta_ms, sucesso, erro) VALUES (?, ?, ?, ?, ?, 0, ?)',
                    [wh.id, wh.url, evento, payload, tempo, e.message]
                );
            }
        }
    } catch (e) {
        console.error('dispararWebhooks erro:', e.message);
    }
}

// ==================== API: INTEGRACOES / API PUBLICA ====================

function requireApiToken(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ erro: 'Token obrigatorio' });
    const token = auth.substring(7);
    if (token.length > 100) return res.status(401).json({ erro: 'Token invalido' });
    const db = getDB();
    const apiToken = db.queryGet('SELECT * FROM api_tokens WHERE token = ? AND ativo = 1', [token]);
    if (!apiToken) return res.status(401).json({ erro: 'Token invalido ou inativo' });
    const tokenOwner = db.queryGet('SELECT id FROM usuarios WHERE nome = ? AND ativo = 1', [apiToken.criado_por]);
    if (!tokenOwner) return res.status(401).json({ erro: 'Token invalido: usuario criador inativo ou removido' });
    db.queryRun("UPDATE api_tokens SET ultimo_uso = datetime('now','localtime') WHERE id = ?", [apiToken.id]);
    req.apiToken = apiToken;
    next();
}

// Enforce API token permissions: 'leitura' = GET only, 'escrita' = all methods
function requireApiPermission(permissao) {
    return (req, res, next) => {
        if (!req.apiToken) return res.status(401).json({ erro: 'Token nao encontrado' });
        const perms = (req.apiToken.permissoes || 'leitura').split(',').map((p) => p.trim());
        if (perms.includes('total') || perms.includes(permissao)) return next();
        if (permissao === 'leitura' && perms.includes('escrita')) return next();
        return res.status(403).json({ erro: `Token sem permissao: ${permissao}` });
    };
}

// Middleware de log para API publica v1
app.use('/api/v1', logApiRequest);

// API publica v1
app.get('/api/v1/chamados', requireApiToken, requireApiPermission('leitura'), (req, res) => {
    const db = getDB();
    res.json(
        db.queryAll(
            'SELECT c.*, p.nome as provedor_nome FROM chamados c JOIN provedores p ON c.provedor_id = p.id ORDER BY c.data_abertura DESC LIMIT 100'
        )
    );
});

app.get('/api/v1/provedores', requireApiToken, requireApiPermission('leitura'), (req, res) => {
    const db = getDB();
    res.json(db.queryAll('SELECT * FROM provedores ORDER BY nome'));
});

app.get('/api/v1/projetos', requireApiToken, requireApiPermission('leitura'), (req, res) => {
    const db = getDB();
    res.json(
        db.queryAll(
            'SELECT pr.*, p.nome as provedor_nome FROM projetos pr LEFT JOIN provedores p ON pr.provedor_id = p.id ORDER BY pr.data_inicio DESC LIMIT 100'
        )
    );
});

// Gerenciamento de tokens
app.get('/api/config/api-tokens', requireAdmin, (req, res) => {
    const db = getDB();
    const tokens = db.queryAll(
        'SELECT id, nome, token, ativo, permissoes, ultimo_uso, criado_por, criado_em FROM api_tokens ORDER BY criado_em DESC'
    );
    // Mask tokens: show only first 6 and last 4 chars
    tokens.forEach((t) => {
        t.token = t.token.substring(0, 6) + '****' + t.token.slice(-4);
    });
    res.json(tokens);
});

app.post('/api/config/api-tokens', requireAdmin, (req, res) => {
    const db = getDB();
    const { nome, permissoes } = req.body;
    if (!nome) return res.status(400).json({ erro: 'Nome obrigatorio' });

    const token = 'gt_' + crypto.randomBytes(32).toString('hex');
    const result = db.queryRun('INSERT INTO api_tokens (nome, token, permissoes, criado_por) VALUES (?, ?, ?, ?)', [
        nome,
        token,
        permissoes || 'leitura',
        req.session.usuario.nome
    ]);
    registrarAtividade(req, 'criar', 'configuracoes', result.lastInsertRowid, `API token criado: ${nome}`);
    res.status(201).json(db.queryGet('SELECT * FROM api_tokens WHERE id = ?', [result.lastInsertRowid]));
});

app.delete('/api/config/api-tokens/:id', requireAdmin, (req, res) => {
    const db = getDB();
    db.queryRun('DELETE FROM api_tokens WHERE id = ?', [Number(req.params.id)]);
    registrarAtividade(req, 'excluir', 'configuracoes', Number(req.params.id), 'API token excluido');
    res.json({ ok: true });
});

app.patch('/api/config/api-tokens/:id/toggle', requireAdmin, (req, res) => {
    const db = getDB();
    const token = db.queryGet('SELECT * FROM api_tokens WHERE id = ?', [Number(req.params.id)]);
    if (!token) return res.status(404).json({ erro: 'Token nao encontrado' });
    db.queryRun('UPDATE api_tokens SET ativo = ? WHERE id = ?', [token.ativo ? 0 : 1, Number(req.params.id)]);
    res.json(db.queryGet('SELECT * FROM api_tokens WHERE id = ?', [Number(req.params.id)]));
});

// Webhooks
app.get('/api/config/webhooks', requireAdmin, (req, res) => {
    const db = getDB();
    res.json(db.queryAll('SELECT * FROM webhooks_saida ORDER BY criado_em DESC'));
});

app.post('/api/config/webhooks', requireAdmin, (req, res) => {
    const db = getDB();
    const { nome, url, eventos } = req.body;
    if (!nome || !url || !eventos) return res.status(400).json({ erro: 'Nome, URL e eventos obrigatorios' });

    const secret = crypto.randomBytes(16).toString('hex');
    const result = db.queryRun(
        'INSERT INTO webhooks_saida (nome, url, eventos, secret, criado_por) VALUES (?, ?, ?, ?, ?)',
        [nome, url, JSON.stringify(eventos), secret, req.session.usuario.nome]
    );
    registrarAtividade(req, 'criar', 'configuracoes', result.lastInsertRowid, `Webhook criado: ${nome}`);
    res.status(201).json(db.queryGet('SELECT * FROM webhooks_saida WHERE id = ?', [result.lastInsertRowid]));
});

app.delete('/api/config/webhooks/:id', requireAdmin, (req, res) => {
    const db = getDB();
    db.queryRun('DELETE FROM webhooks_saida WHERE id = ?', [Number(req.params.id)]);
    registrarAtividade(req, 'excluir', 'configuracoes', Number(req.params.id), 'Webhook excluido');
    res.json({ ok: true });
});

// ==================== AUDIT TRAIL ====================

function registrarAtividade(req, acao, modulo, entidade_id, detalhes) {
    try {
        const db = getDB();
        const usuario_id = req.session?.usuario?.id || null;
        const usuario_nome = req.session?.usuario?.nome || 'Sistema';
        const ip = req.ip || req.connection?.remoteAddress || '';
        db.queryRun(
            'INSERT INTO atividades_log (usuario_id, usuario_nome, acao, modulo, entidade_id, detalhes, ip) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
                usuario_id,
                usuario_nome,
                acao,
                modulo,
                entidade_id,
                typeof detalhes === 'object' ? JSON.stringify(detalhes) : detalhes || '',
                ip
            ]
        );
    } catch (e) {
        console.error('Erro ao registrar atividade:', e.message);
    }
}

app.get('/api/atividades', requireAdmin, (req, res) => {
    const db = getDB();
    const { modulo, usuario_id, data_inicio, data_fim, limit: lim, offset: off } = req.query;
    let sql = 'SELECT * FROM atividades_log WHERE 1=1';
    const params = [];

    if (modulo) {
        sql += ' AND modulo = ?';
        params.push(modulo);
    }
    if (usuario_id) {
        sql += ' AND usuario_id = ?';
        params.push(Number(usuario_id));
    }
    if (data_inicio) {
        sql += ' AND criado_em >= ?';
        params.push(data_inicio);
    }
    if (data_fim) {
        sql += ' AND criado_em <= ?';
        params.push(data_fim + ' 23:59:59');
    }

    sql += ' ORDER BY criado_em DESC';
    sql += ` LIMIT ${Math.min(Math.max(parseInt(lim, 10) || 100, 1), 500)} OFFSET ${Math.max(parseInt(off, 10) || 0, 0)}`;
    res.json(db.queryAll(sql, params));
});

// ==================== API: LOGS & MONITORAMENTO ====================

app.get('/api/logs/resumo', requireAdmin, (req, res) => {
    const db = getDB();
    const hoje = new Date().toISOString().split('T')[0];
    const requestsHoje = db.queryGet('SELECT COUNT(*) as total FROM api_request_log WHERE criado_em >= ?', [hoje]) || {
        total: 0
    };
    const errosHoje = db.queryGet(
        'SELECT COUNT(*) as total FROM api_request_log WHERE criado_em >= ? AND status_code >= 400',
        [hoje]
    ) || { total: 0 };
    const syncsHoje = db.queryGet('SELECT COUNT(*) as total FROM erp_sync_log WHERE criado_em >= ?', [hoje]) || {
        total: 0
    };
    const webhooksHoje = db.queryGet('SELECT COUNT(*) as total FROM webhook_dispatch_log WHERE criado_em >= ?', [
        hoje
    ]) || { total: 0 };
    const webhooksErroHoje = db.queryGet(
        'SELECT COUNT(*) as total FROM webhook_dispatch_log WHERE criado_em >= ? AND sucesso = 0',
        [hoje]
    ) || { total: 0 };
    const tempoMedio = db.queryGet('SELECT AVG(tempo_resposta_ms) as avg FROM api_request_log WHERE criado_em >= ?', [
        hoje
    ]) || { avg: 0 };
    const erpCommHoje = db.queryGet('SELECT COUNT(*) as total FROM erp_communication_log WHERE criado_em >= ?', [
        hoje
    ]) || { total: 0 };
    const erpCommErroHoje = db.queryGet(
        'SELECT COUNT(*) as total FROM erp_communication_log WHERE criado_em >= ? AND sucesso = 0',
        [hoje]
    ) || { total: 0 };
    res.json({
        requests_hoje: requestsHoje.total,
        erros_hoje: errosHoje.total,
        syncs_erp_hoje: syncsHoje.total,
        webhooks_hoje: webhooksHoje.total,
        webhooks_erro_hoje: webhooksErroHoje.total,
        tempo_medio_ms: Math.round(tempoMedio.avg || 0),
        erp_comm_hoje: erpCommHoje.total,
        erp_comm_erro_hoje: erpCommErroHoje.total
    });
});

app.get('/api/logs/api-requests', requireAdmin, (req, res) => {
    const db = getDB();
    const { endpoint, status, data_inicio, data_fim, limit: lim, offset: off } = req.query;
    let sql = 'SELECT * FROM api_request_log WHERE 1=1';
    const params = [];
    if (endpoint) {
        sql += ' AND endpoint LIKE ?';
        params.push('%' + endpoint + '%');
    }
    if (status === 'erro') {
        sql += ' AND status_code >= 400';
    } else if (status === 'ok') {
        sql += ' AND status_code < 400';
    } else if (status) {
        sql += ' AND status_code = ?';
        params.push(Number(status));
    }
    if (data_inicio) {
        sql += ' AND criado_em >= ?';
        params.push(data_inicio);
    }
    if (data_fim) {
        sql += ' AND criado_em <= ?';
        params.push(data_fim + ' 23:59:59');
    }
    sql += ' ORDER BY criado_em DESC';
    sql += ` LIMIT ${Math.min(Math.max(parseInt(lim, 10) || 100, 1), 500)} OFFSET ${Math.max(parseInt(off, 10) || 0, 0)}`;
    res.json(db.queryAll(sql, params));
});

app.get('/api/logs/webhooks', requireAdmin, (req, res) => {
    const db = getDB();
    const { evento, sucesso, data_inicio, data_fim, limit: lim, offset: off } = req.query;
    let sql = 'SELECT * FROM webhook_dispatch_log WHERE 1=1';
    const params = [];
    if (evento) {
        sql += ' AND evento = ?';
        params.push(evento);
    }
    if (sucesso === '1') {
        sql += ' AND sucesso = 1';
    } else if (sucesso === '0') {
        sql += ' AND sucesso = 0';
    }
    if (data_inicio) {
        sql += ' AND criado_em >= ?';
        params.push(data_inicio);
    }
    if (data_fim) {
        sql += ' AND criado_em <= ?';
        params.push(data_fim + ' 23:59:59');
    }
    sql += ' ORDER BY criado_em DESC';
    sql += ` LIMIT ${Math.min(Math.max(parseInt(lim, 10) || 100, 1), 500)} OFFSET ${Math.max(parseInt(off, 10) || 0, 0)}`;
    res.json(db.queryAll(sql, params));
});

app.get('/api/logs/erp-sync', requireAdmin, (req, res) => {
    const db = getDB();
    const { tipo, data_inicio, data_fim, limit: lim, offset: off } = req.query;
    let sql = 'SELECT * FROM erp_sync_log WHERE 1=1';
    const params = [];
    if (tipo) {
        sql += ' AND tipo = ?';
        params.push(tipo);
    }
    if (data_inicio) {
        sql += ' AND criado_em >= ?';
        params.push(data_inicio);
    }
    if (data_fim) {
        sql += ' AND criado_em <= ?';
        params.push(data_fim + ' 23:59:59');
    }
    sql += ' ORDER BY criado_em DESC';
    sql += ` LIMIT ${Math.min(Math.max(parseInt(lim, 10) || 100, 1), 500)} OFFSET ${Math.max(parseInt(off, 10) || 0, 0)}`;
    res.json(db.queryAll(sql, params));
});

app.get('/api/logs/integracoes', requireAdmin, (req, res) => {
    const db = getDB();
    const { modulo, data_inicio, data_fim, limit: lim, offset: off } = req.query;
    let sql =
        "SELECT * FROM atividades_log WHERE modulo IN ('integracoes', 'configuracoes', 'erp', 'api', 'webhook', 'whatsapp')";
    const params = [];
    if (modulo) {
        sql += ' AND modulo = ?';
        params.push(modulo);
    }
    if (data_inicio) {
        sql += ' AND criado_em >= ?';
        params.push(data_inicio);
    }
    if (data_fim) {
        sql += ' AND criado_em <= ?';
        params.push(data_fim + ' 23:59:59');
    }
    sql += ' ORDER BY criado_em DESC';
    sql += ` LIMIT ${Math.min(Math.max(parseInt(lim, 10) || 100, 1), 500)} OFFSET ${Math.max(parseInt(off, 10) || 0, 0)}`;
    res.json(db.queryAll(sql, params));
});

app.get('/api/logs/whatsapp-ia', requireAdmin, (req, res) => {
    const db = getDB();
    const { data_inicio, data_fim, limit: lim, offset: off } = req.query;
    let sql = 'SELECT * FROM whatsapp_ia_historico WHERE 1=1';
    const params = [];
    if (data_inicio) {
        sql += ' AND criado_em >= ?';
        params.push(data_inicio);
    }
    if (data_fim) {
        sql += ' AND criado_em <= ?';
        params.push(data_fim + ' 23:59:59');
    }
    sql += ' ORDER BY criado_em DESC';
    sql += ` LIMIT ${Math.min(Math.max(parseInt(lim, 10) || 100, 1), 500)} OFFSET ${Math.max(parseInt(off, 10) || 0, 0)}`;
    res.json(db.queryAll(sql, params));
});

app.get('/api/logs/erp-comunicacao', requireAdmin, (req, res) => {
    const db = getDB();
    const { erp_tipo, sucesso, contexto, data_inicio, data_fim, limit: lim, offset: off } = req.query;
    let sql =
        'SELECT id, erp_tipo, erp_label, direcao, metodo, url, response_status, tempo_resposta_ms, sucesso, erro, contexto, criado_em FROM erp_communication_log WHERE 1=1';
    const params = [];
    if (erp_tipo) {
        sql += ' AND erp_tipo = ?';
        params.push(erp_tipo);
    }
    if (sucesso !== undefined && sucesso !== '') {
        sql += ' AND sucesso = ?';
        params.push(Number(sucesso));
    }
    if (contexto) {
        sql += ' AND contexto LIKE ?';
        params.push(`%${contexto}%`);
    }
    if (data_inicio) {
        sql += ' AND criado_em >= ?';
        params.push(data_inicio);
    }
    if (data_fim) {
        sql += ' AND criado_em <= ?';
        params.push(data_fim + ' 23:59:59');
    }
    sql += ' ORDER BY criado_em DESC';
    sql += ` LIMIT ${Math.min(Math.max(parseInt(lim, 10) || 100, 1), 500)} OFFSET ${Math.max(parseInt(off, 10) || 0, 0)}`;
    res.json(db.queryAll(sql, params));
});

app.get('/api/logs/erp-comunicacao/:id', requireAdmin, (req, res) => {
    const db = getDB();
    const log = db.queryGet('SELECT * FROM erp_communication_log WHERE id = ?', [req.params.id]);
    if (!log) return res.status(404).json({ erro: 'Log nao encontrado' });
    // Parse JSON fields para facilitar visualizacao
    try {
        log.request_headers = JSON.parse(log.request_headers);
    } catch {}
    try {
        log.response_headers = JSON.parse(log.response_headers);
    } catch {}
    try {
        log.response_body_parsed = JSON.parse(log.response_body);
    } catch {}
    res.json(log);
});

// ==================== API: CONFIGURACOES GERAIS ====================

app.get('/api/config/geral', requireAdmin, (req, res) => {
    const db = getDB();
    const rows = db.queryAll('SELECT chave, valor FROM config_geral');
    const config = {};
    rows.forEach((r) => {
        config[r.chave] = r.valor;
    });
    res.json(config);
});

app.put('/api/config/geral', requireAdmin, (req, res) => {
    const db = getDB();
    const dados = req.body;
    for (const [chave, valor] of Object.entries(dados)) {
        db.queryRun(
            "INSERT INTO config_geral (chave, valor, atualizado_em) VALUES (?, ?, datetime('now','localtime')) ON CONFLICT(chave) DO UPDATE SET valor = ?, atualizado_em = datetime('now','localtime')",
            [chave, valor, valor]
        );
    }
    registrarAtividade(req, 'editar', 'configuracoes', null, dados);
    res.json({ ok: true });
});

app.post('/api/config/geral/logo', upload.single('logo'), (req, res) => {
    if (req.session?.usuario?.perfil !== 'admin') return res.status(403).json({ erro: 'Acesso restrito' });
    if (!req.file) return res.status(400).json({ erro: 'Arquivo obrigatorio' });
    const db = getDB();
    const logo_url = '/uploads/' + req.file.filename;
    db.queryRun(
        "INSERT INTO config_geral (chave, valor) VALUES ('logo_url', ?) ON CONFLICT(chave) DO UPDATE SET valor = ?",
        [logo_url, logo_url]
    );
    res.json({ logo_url });
});

// ==================== API: NOTIFICACOES ====================

function criarNotificacao(usuario_id, tipo, titulo, mensagem, link) {
    try {
        const db = getDB();
        db.queryRun('INSERT INTO notificacoes (usuario_id, tipo, titulo, mensagem, link) VALUES (?, ?, ?, ?, ?)', [
            usuario_id,
            tipo,
            titulo,
            mensagem || '',
            link || ''
        ]);
    } catch (e) {
        console.error('Erro ao criar notificacao:', e.message);
    }
}

function criarNotificacaoParaPerfil(perfil, tipo, titulo, mensagem, link) {
    try {
        const db = getDB();
        const users = db.queryAll('SELECT id FROM usuarios WHERE perfil = ? AND ativo = 1', [perfil]);
        for (const u of users) {
            db.queryRun('INSERT INTO notificacoes (usuario_id, tipo, titulo, mensagem, link) VALUES (?, ?, ?, ?, ?)', [
                u.id,
                tipo,
                titulo,
                mensagem || '',
                link || ''
            ]);
        }
    } catch (e) {
        console.error('Erro notificacao perfil:', e.message);
    }
}

function criarNotificacaoParaTodos(tipo, titulo, mensagem, link) {
    try {
        const db = getDB();
        const users = db.queryAll('SELECT id FROM usuarios WHERE ativo = 1');
        for (const u of users) {
            db.queryRun('INSERT INTO notificacoes (usuario_id, tipo, titulo, mensagem, link) VALUES (?, ?, ?, ?, ?)', [
                u.id,
                tipo,
                titulo,
                mensagem || '',
                link || ''
            ]);
        }
    } catch (e) {
        console.error('Erro notificacao todos:', e.message);
    }
}

app.get('/api/notificacoes', (req, res) => {
    const db = getDB();
    const limit = Number(req.query.limit) || 50;
    const nao_lidas = req.query.nao_lidas === '1';
    let sql = 'SELECT * FROM notificacoes WHERE usuario_id = ?';
    const params = [req.session.usuario.id];
    if (nao_lidas) {
        sql += ' AND lida = 0';
    }
    sql += ' ORDER BY criado_em DESC LIMIT ?';
    params.push(limit);
    res.json(db.queryAll(sql, params));
});

app.get('/api/notificacoes/contagem', (req, res) => {
    const db = getDB();
    const total = db.queryGet('SELECT COUNT(*) as c FROM notificacoes WHERE usuario_id = ?', [req.session.usuario.id]);
    const nao_lidas = db.queryGet('SELECT COUNT(*) as c FROM notificacoes WHERE usuario_id = ? AND lida = 0', [
        req.session.usuario.id
    ]);
    res.json({ total: total.c, nao_lidas: nao_lidas.c });
});

app.patch('/api/notificacoes/:id/lida', (req, res) => {
    const db = getDB();
    db.queryRun('UPDATE notificacoes SET lida = 1 WHERE id = ? AND usuario_id = ?', [
        Number(req.params.id),
        req.session.usuario.id
    ]);
    res.json({ ok: true });
});

app.post('/api/notificacoes/marcar-todas-lidas', (req, res) => {
    const db = getDB();
    db.queryRun('UPDATE notificacoes SET lida = 1 WHERE usuario_id = ? AND lida = 0', [req.session.usuario.id]);
    res.json({ ok: true });
});

app.delete('/api/notificacoes/limpar', (req, res) => {
    const db = getDB();
    db.queryRun('DELETE FROM notificacoes WHERE usuario_id = ?', [req.session.usuario.id]);
    res.json({ ok: true });
});

// ==================== API: COMENTARIOS ====================

app.get('/api/comentarios/:tipo/:id', (req, res) => {
    const db = getDB();
    const { tipo, id } = req.params;
    if (!['chamado', 'projeto'].includes(tipo)) return res.status(400).json({ erro: 'Tipo invalido' });
    res.json(
        db.queryAll('SELECT * FROM comentarios WHERE entidade_tipo = ? AND entidade_id = ? ORDER BY criado_em ASC', [
            tipo,
            Number(id)
        ])
    );
});

app.post('/api/comentarios/:tipo/:id', (req, res) => {
    const db = getDB();
    const { tipo, id } = req.params;
    const { texto } = req.body;
    if (!['chamado', 'projeto'].includes(tipo)) return res.status(400).json({ erro: 'Tipo invalido' });
    if (!texto || !texto.trim()) return res.status(400).json({ erro: 'Texto obrigatorio' });

    const result = db.queryRun(
        'INSERT INTO comentarios (entidade_tipo, entidade_id, usuario_id, usuario_nome, texto) VALUES (?, ?, ?, ?, ?)',
        [tipo, Number(id), req.session.usuario.id, req.session.usuario.nome, texto.trim()]
    );
    const comentario = db.queryGet('SELECT * FROM comentarios WHERE id = ?', [result.lastInsertRowid]);
    registrarAtividade(
        req,
        'criar',
        tipo === 'chamado' ? 'chamados' : 'projetos',
        Number(id),
        `Comentario: ${texto.substring(0, 100)}`
    );
    res.status(201).json(comentario);
});

app.delete('/api/comentarios/:id', (req, res) => {
    const db = getDB();
    const comentario = db.queryGet('SELECT * FROM comentarios WHERE id = ?', [Number(req.params.id)]);
    if (!comentario) return res.status(404).json({ erro: 'Comentario nao encontrado' });
    if (comentario.usuario_id !== req.session.usuario.id && req.session.usuario.perfil !== 'admin') {
        return res.status(403).json({ erro: 'Sem permissao para excluir este comentario' });
    }
    db.queryRun('DELETE FROM comentarios WHERE id = ?', [Number(req.params.id)]);
    res.json({ ok: true });
});

// ==================== API: USUARIOS LISTA (TODOS AUTENTICADOS) ====================

app.get('/api/usuarios/lista', (req, res) => {
    const db = getDB();
    res.json(db.queryAll('SELECT id, nome FROM usuarios WHERE ativo = 1 ORDER BY nome'));
});

// ==================== API: BUSCA GLOBAL ====================

app.get('/api/busca', (req, res) => {
    const db = getDB();
    const q = req.query.q;
    if (!q || q.length < 2)
        return res.json({ chamados: [], provedores: [], projetos: [], treinamentos: [], vendas: [] });
    if (q.length > 100) return res.status(400).json({ erro: 'Termo de busca muito longo' });

    const termo = `%${q}%`;
    const chamados = db.queryAll(
        "SELECT id, titulo, 'chamado' as tipo, status, data_abertura as data FROM chamados WHERE titulo LIKE ? OR descricao LIKE ? ORDER BY data_abertura DESC LIMIT 10",
        [termo, termo]
    );
    const provedores = db.queryAll(
        "SELECT id, nome as titulo, 'provedor' as tipo, NULL as status, criado_em as data FROM provedores WHERE nome LIKE ? OR contato LIKE ? ORDER BY nome LIMIT 10",
        [termo, termo]
    );
    const projetos = db.queryAll(
        "SELECT id, titulo, 'projeto' as tipo, status, data_inicio as data FROM projetos WHERE titulo LIKE ? OR descricao LIKE ? ORDER BY data_inicio DESC LIMIT 10",
        [termo, termo]
    );
    const treinamentos = db.queryAll(
        "SELECT id, titulo, 'treinamento' as tipo, status, data_treinamento as data FROM treinamentos WHERE titulo LIKE ? OR descricao LIKE ? ORDER BY data_treinamento DESC LIMIT 10",
        [termo, termo]
    );
    const vendas = db.queryAll(
        "SELECT id, provedor_nome_lead as titulo, 'venda' as tipo, estagio as status, criado_em as data FROM vendas_negocios WHERE provedor_nome_lead LIKE ? OR contato_lead LIKE ? ORDER BY criado_em DESC LIMIT 10",
        [termo, termo]
    );

    res.json({ chamados, provedores, projetos, treinamentos, vendas });
});

// ==================== API: BACKUPS ====================

const backupsDir = path.join(__dirname, 'backups');
if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir);

app.post('/api/config/backup', requireAdmin, (req, res) => {
    try {
        const db = getDB();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const nomeArquivo = `data_${timestamp}.db`;
        const destPath = path.join(backupsDir, nomeArquivo);

        // Copiar arquivo do banco
        const dbPath = path.join(__dirname, 'data.db');
        if (fs.existsSync(dbPath)) {
            fs.copyFileSync(dbPath, destPath);
        } else {
            // Se usa banco em memoria, exportar
            const data = db.db.export();
            fs.writeFileSync(destPath, Buffer.from(data));
        }

        const stats = fs.statSync(destPath);
        db.queryRun('INSERT INTO backups_log (nome_arquivo, tamanho, tipo, criado_por) VALUES (?, ?, ?, ?)', [
            nomeArquivo,
            stats.size,
            'manual',
            req.session.usuario.nome
        ]);
        registrarAtividade(req, 'criar', 'configuracoes', null, `Backup manual: ${nomeArquivo}`);
        res.json({ ok: true, nome_arquivo: nomeArquivo, tamanho: stats.size });
    } catch (err) {
        handleError(res, err, 'operacao');
    }
});

app.get('/api/config/backups', requireAdmin, (req, res) => {
    const db = getDB();
    res.json(db.queryAll('SELECT * FROM backups_log ORDER BY criado_em DESC'));
});

app.get('/api/config/backup/:id/download', requireAdmin, (req, res) => {
    const db = getDB();
    const backup = db.queryGet('SELECT * FROM backups_log WHERE id = ?', [Number(req.params.id)]);
    if (!backup) return res.status(404).json({ erro: 'Backup nao encontrado' });
    const filePath = path.join(backupsDir, backup.nome_arquivo);
    if (!fs.existsSync(filePath)) return res.status(404).json({ erro: 'Arquivo nao encontrado' });
    res.download(filePath, backup.nome_arquivo);
});

app.delete('/api/config/backup/:id', requireAdmin, (req, res) => {
    const db = getDB();
    const backup = db.queryGet('SELECT * FROM backups_log WHERE id = ?', [Number(req.params.id)]);
    if (!backup) return res.status(404).json({ erro: 'Backup nao encontrado' });
    const filePath = path.join(backupsDir, backup.nome_arquivo);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    db.queryRun('DELETE FROM backups_log WHERE id = ?', [Number(req.params.id)]);
    registrarAtividade(req, 'excluir', 'configuracoes', null, `Backup excluido: ${backup.nome_arquivo}`);
    res.json({ ok: true });
});

// ==================== API: ANEXOS PROJETOS/TREINAMENTOS ====================

app.post('/api/projetos/:id/anexos', upload.array('arquivos', 10), (req, res) => {
    const db = getDB();
    const projeto_id = Number(req.params.id);
    if (!req.files || !req.files.length) return res.status(400).json({ erro: 'Nenhum arquivo enviado' });
    const anexos = req.files.map((f) => {
        const result = db.queryRun(
            'INSERT INTO anexos_projetos (projeto_id, nome_arquivo, caminho, tipo_mime, tamanho) VALUES (?, ?, ?, ?, ?)',
            [projeto_id, f.originalname, `/uploads/${f.filename}`, f.mimetype, f.size]
        );
        return {
            id: result.lastInsertRowid,
            nome_arquivo: f.originalname,
            caminho: `/uploads/${f.filename}`,
            tipo_mime: f.mimetype,
            tamanho: f.size
        };
    });
    registrarAtividade(req, 'criar', 'projetos', projeto_id, `${anexos.length} anexo(s) adicionado(s)`);
    res.status(201).json(anexos);
});

app.delete('/api/anexos-projetos/:id', (req, res) => {
    const db = getDB();
    const anexo = db.queryGet('SELECT * FROM anexos_projetos WHERE id = ?', [Number(req.params.id)]);
    if (!anexo) return res.status(404).json({ erro: 'Anexo nao encontrado' });
    const filePath = path.join(__dirname, 'public', anexo.caminho);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    db.queryRun('DELETE FROM anexos_projetos WHERE id = ?', [Number(req.params.id)]);
    res.json({ ok: true });
});

app.post('/api/treinamentos/:id/anexos', upload.array('arquivos', 10), (req, res) => {
    const db = getDB();
    const treinamento_id = Number(req.params.id);
    if (!req.files || !req.files.length) return res.status(400).json({ erro: 'Nenhum arquivo enviado' });
    const anexos = req.files.map((f) => {
        const result = db.queryRun(
            'INSERT INTO anexos_treinamentos (treinamento_id, nome_arquivo, caminho, tipo_mime, tamanho) VALUES (?, ?, ?, ?, ?)',
            [treinamento_id, f.originalname, `/uploads/${f.filename}`, f.mimetype, f.size]
        );
        return {
            id: result.lastInsertRowid,
            nome_arquivo: f.originalname,
            caminho: `/uploads/${f.filename}`,
            tipo_mime: f.mimetype,
            tamanho: f.size
        };
    });
    registrarAtividade(req, 'criar', 'treinamentos', treinamento_id, `${anexos.length} anexo(s) adicionado(s)`);
    res.status(201).json(anexos);
});

app.delete('/api/anexos-treinamentos/:id', (req, res) => {
    const db = getDB();
    const anexo = db.queryGet('SELECT * FROM anexos_treinamentos WHERE id = ?', [Number(req.params.id)]);
    if (!anexo) return res.status(404).json({ erro: 'Anexo nao encontrado' });
    const filePath = path.join(__dirname, 'public', anexo.caminho);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    db.queryRun('DELETE FROM anexos_treinamentos WHERE id = ?', [Number(req.params.id)]);
    res.json({ ok: true });
});

// ==================== API: CHAMADOS - KANBAN PATCH ====================

app.patch('/api/chamados/:id/status', (req, res) => {
    const db = getDB();
    const { status } = req.body;
    if (!['pendente', 'em_andamento', 'resolvido', 'fechado'].includes(status)) {
        return res.status(400).json({ erro: 'Status invalido' });
    }
    const id = Number(req.params.id);
    const chamado = db.queryGet('SELECT * FROM chamados WHERE id = ?', [id]);
    if (!chamado) return res.status(404).json({ erro: 'Chamado nao encontrado' });

    const updates =
        status === 'resolvido' || status === 'fechado'
            ? 'status = ?, data_resolucao = datetime("now","localtime")'
            : 'status = ?, data_resolucao = NULL';
    db.queryRun(`UPDATE chamados SET ${updates} WHERE id = ?`, [status, id]);
    registrarAtividade(req, 'status', 'chamados', id, `${chamado.status} -> ${status}`);
    res.json(db.queryGet('SELECT * FROM chamados WHERE id = ?', [id]));
});

// ==================== API: DASHBOARD ANALYTICS ====================

app.get('/api/dashboard/analytics/chamados-tendencia', (req, res) => {
    const db = getDB();
    const dados = db.queryAll(`
        SELECT strftime('%Y-%m', data_abertura) as mes, status, COUNT(*) as total
        FROM chamados
        WHERE data_abertura >= date('now','localtime','-12 months')
        GROUP BY mes, status
        ORDER BY mes
    `);
    res.json(dados);
});

app.get('/api/dashboard/analytics/tempo-resolucao', (req, res) => {
    const db = getDB();
    const dados = db.queryAll(`
        SELECT strftime('%Y-%m', data_abertura) as mes,
               ROUND(AVG(julianday(data_resolucao) - julianday(data_abertura)), 1) as media_dias,
               COUNT(*) as total
        FROM chamados
        WHERE data_resolucao IS NOT NULL AND data_abertura >= date('now','localtime','-12 months')
        GROUP BY mes ORDER BY mes
    `);
    res.json(dados);
});

app.get('/api/dashboard/analytics/taxa-conversao', (req, res) => {
    const db = getDB();
    const dados = db.queryAll(`
        SELECT strftime('%Y-%m', criado_em) as mes,
               COUNT(*) as total,
               SUM(CASE WHEN estagio = 'ativado' THEN 1 ELSE 0 END) as ativados
        FROM vendas_negocios
        WHERE criado_em >= date('now','localtime','-12 months')
        GROUP BY mes ORDER BY mes
    `);
    res.json(dados);
});

app.get('/api/dashboard/analytics/desempenho-vendedores', (req, res) => {
    const db = getDB();
    const dados = db.queryAll(`
        SELECT responsavel_vendedor as vendedor,
               COUNT(*) as total_negocios,
               SUM(CASE WHEN estagio = 'ativado' THEN 1 ELSE 0 END) as ativados,
               SUM(CASE WHEN estagio = 'ativado' THEN valor_estimado ELSE 0 END) as valor_total
        FROM vendas_negocios
        WHERE responsavel_vendedor IS NOT NULL
        GROUP BY responsavel_vendedor
        ORDER BY valor_total DESC
        LIMIT 10
    `);
    res.json(dados);
});

// ==================== API: DASHBOARD WIDGETS ====================

const WIDGETS_PADRAO = [
    { widget_tipo: 'cards_resumo', posicao: 0, largura: 12 },
    { widget_tipo: 'provedores_responsavel', posicao: 1, largura: 4 },
    { widget_tipo: 'provedores_modelo', posicao: 2, largura: 4 },
    { widget_tipo: 'provedores_erp', posicao: 3, largura: 4 },
    { widget_tipo: 'provedores_plano', posicao: 4, largura: 4 },
    { widget_tipo: 'treinamentos_status', posicao: 5, largura: 4 },
    { widget_tipo: 'treinamentos_mes', posicao: 6, largura: 4 },
    { widget_tipo: 'chamados_provedor', posicao: 7, largura: 7 },
    { widget_tipo: 'chamados_categoria', posicao: 8, largura: 5 },
    { widget_tipo: 'chamados_mes', posicao: 9, largura: 5 },
    { widget_tipo: 'projetos_status', posicao: 10, largura: 3 },
    { widget_tipo: 'chamados_abertos_provedor', posicao: 11, largura: 4 },
    { widget_tipo: 'chamados_recentes', posicao: 12, largura: 12 },
    { widget_tipo: 'analytics_tendencia', posicao: 13, largura: 6 },
    { widget_tipo: 'analytics_resolucao', posicao: 14, largura: 6 },
    { widget_tipo: 'analytics_conversao', posicao: 15, largura: 6 },
    { widget_tipo: 'analytics_desempenho', posicao: 16, largura: 6 }
];

app.get('/api/dashboard/widgets', requireAuth, (req, res) => {
    const db = getDB();
    const userId = req.session.usuario.id;
    let widgets = db.queryAll(
        'SELECT id, widget_tipo, posicao, largura, visivel, config FROM dashboard_widgets WHERE usuario_id = ? ORDER BY posicao',
        [userId]
    );
    if (widgets.length === 0) {
        // Seed defaults
        WIDGETS_PADRAO.forEach((w) => {
            db.queryRun(
                'INSERT INTO dashboard_widgets (usuario_id, widget_tipo, posicao, largura, visivel) VALUES (?, ?, ?, ?, 1)',
                [userId, w.widget_tipo, w.posicao, w.largura]
            );
        });
        widgets = db.queryAll(
            'SELECT id, widget_tipo, posicao, largura, visivel, config FROM dashboard_widgets WHERE usuario_id = ? ORDER BY posicao',
            [userId]
        );
    }
    res.json(widgets);
});

app.put('/api/dashboard/widgets', requireAuth, (req, res) => {
    const db = getDB();
    const userId = req.session.usuario.id;
    const { widgets } = req.body;
    if (!Array.isArray(widgets)) return res.status(400).json({ erro: 'widgets deve ser um array' });
    widgets.forEach((w, i) => {
        db.queryRun(
            'UPDATE dashboard_widgets SET posicao = ?, largura = ?, visivel = ? WHERE id = ? AND usuario_id = ?',
            [
                w.posicao !== undefined ? w.posicao : i,
                w.largura || 6,
                w.visivel !== undefined ? w.visivel : 1,
                w.id,
                userId
            ]
        );
    });
    res.json({ ok: true });
});

app.post('/api/dashboard/widgets/reset', requireAuth, (req, res) => {
    const db = getDB();
    const userId = req.session.usuario.id;
    db.queryRun('DELETE FROM dashboard_widgets WHERE usuario_id = ?', [userId]);
    WIDGETS_PADRAO.forEach((w) => {
        db.queryRun(
            'INSERT INTO dashboard_widgets (usuario_id, widget_tipo, posicao, largura, visivel) VALUES (?, ?, ?, ?, 1)',
            [userId, w.widget_tipo, w.posicao, w.largura]
        );
    });
    res.json({ ok: true });
});

// ==================== API: RELATORIOS PDF ====================

function pdfHeader(doc, titulo) {
    doc.fontSize(18).font('Helvetica-Bold').text(titulo, { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(9)
        .font('Helvetica')
        .fillColor('#666')
        .text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, { align: 'center' });
    doc.fillColor('#000').moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ccc');
    doc.moveDown(0.5);
}

function pdfTableRow(doc, cols, widths, isHeader) {
    const y = doc.y;
    if (isHeader) doc.font('Helvetica-Bold').fontSize(8);
    else doc.font('Helvetica').fontSize(8);
    let x = 50;
    cols.forEach((col, i) => {
        doc.text(String(col || '-'), x, y, { width: widths[i], ellipsis: true });
        x += widths[i];
    });
    doc.y = y + 14;
    if (isHeader) {
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ddd');
        doc.moveDown(0.2);
    }
}

app.get('/api/relatorios/chamados/pdf', (req, res) => {
    const db = getDB();
    const { status, provedor_id, data_inicio, data_fim } = req.query;
    let sql = 'SELECT c.*, p.nome as provedor_nome FROM chamados c JOIN provedores p ON c.provedor_id = p.id WHERE 1=1';
    const params = [];
    if (status) {
        sql += ' AND c.status = ?';
        params.push(status);
    }
    if (provedor_id) {
        sql += ' AND c.provedor_id = ?';
        params.push(Number(provedor_id));
    }
    if (data_inicio) {
        sql += ' AND c.data_abertura >= ?';
        params.push(data_inicio);
    }
    if (data_fim) {
        sql += ' AND c.data_abertura <= ?';
        params.push(data_fim + ' 23:59:59');
    }
    sql += ' ORDER BY c.data_abertura DESC';
    const chamados = db.queryAll(sql, params);

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=relatorio-chamados.pdf');
    doc.pipe(res);
    pdfHeader(doc, 'Relatorio de Chamados');
    doc.fontSize(10).text(`Total: ${chamados.length} chamados`, { align: 'left' });
    doc.moveDown(0.5);
    const widths = [30, 120, 140, 70, 70, 65];
    pdfTableRow(doc, ['#', 'Provedor', 'Titulo', 'Categoria', 'Status', 'Abertura'], widths, true);
    chamados.forEach((c) => {
        if (doc.y > 750) doc.addPage();
        pdfTableRow(
            doc,
            [c.id, c.provedor_nome, c.titulo, c.categoria, c.status, (c.data_abertura || '').substring(0, 10)],
            widths
        );
    });
    doc.end();
});

app.get('/api/relatorios/vendas/pdf', (req, res) => {
    const db = getDB();
    const negocios = db.queryAll(
        'SELECT n.*, p.nome as provedor_nome FROM vendas_negocios n LEFT JOIN provedores p ON n.provedor_id = p.id ORDER BY n.atualizado_em DESC'
    );

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=relatorio-vendas.pdf');
    doc.pipe(res);
    pdfHeader(doc, 'Relatorio de Vendas');
    doc.fontSize(10).text(`Total: ${negocios.length} negocios`, { align: 'left' });
    doc.moveDown(0.5);
    const widths = [100, 80, 70, 80, 80, 85];
    pdfTableRow(doc, ['Lead', 'Vendedor', 'Estagio', 'Valor', 'Origem', 'Atualizado'], widths, true);
    negocios.forEach((n) => {
        if (doc.y > 750) doc.addPage();
        pdfTableRow(
            doc,
            [
                n.provedor_nome_lead || n.provedor_nome || '-',
                n.responsavel_vendedor || '-',
                n.estagio,
                'R$ ' + (n.valor_estimado || 0),
                n.origem || '-',
                (n.atualizado_em || '').substring(0, 10)
            ],
            widths
        );
    });
    doc.end();
});

app.get('/api/relatorios/treinamentos/pdf', (req, res) => {
    const db = getDB();
    const treinamentos = db.queryAll(
        "SELECT t.*, COALESCE(t.status, 'agendado') as status, p.nome as provedor_nome FROM treinamentos t JOIN provedores p ON t.provedor_id = p.id ORDER BY t.data_treinamento DESC"
    );

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=relatorio-treinamentos.pdf');
    doc.pipe(res);
    pdfHeader(doc, 'Relatorio de Treinamentos');
    doc.fontSize(10).text(`Total: ${treinamentos.length} treinamentos`, { align: 'left' });
    doc.moveDown(0.5);
    const widths = [30, 130, 140, 80, 80, 35];
    pdfTableRow(doc, ['#', 'Provedor', 'Titulo', 'Status', 'Data', 'Hora'], widths, true);
    treinamentos.forEach((t) => {
        if (doc.y > 750) doc.addPage();
        pdfTableRow(
            doc,
            [
                t.id,
                t.provedor_nome,
                t.titulo,
                t.status,
                (t.data_treinamento || '').substring(0, 10),
                t.hora_treinamento || '-'
            ],
            widths
        );
    });
    doc.end();
});

// ==================== API: USUARIOS (ADMIN ONLY) ====================

app.get('/api/usuarios', requireAdmin, (req, res) => {
    const db = getDB();
    res.json(db.queryAll('SELECT id, nome, usuario, perfil, ativo, criado_em FROM usuarios ORDER BY nome'));
});

app.post('/api/usuarios', requireAdmin, (req, res) => {
    const db = getDB();
    const { nome, usuario, senha, perfil } = req.body;
    let erro = validarString(nome, 'Nome', 2, 100) || validarString(usuario, 'Usuario', 3, 50);
    if (erro) return res.status(400).json({ erro });
    if (!/^[a-zA-Z0-9._-]+$/.test(usuario))
        return res
            .status(400)
            .json({ erro: 'Usuario deve conter apenas letras, numeros, pontos, hifens e underscores' });
    erro = validarSenha(senha);
    if (erro) return res.status(400).json({ erro });
    if (
        !['admin', 'analista', 'vendedor', 'gestor_atendimento', 'gerente_noc', 'financeiro', 'atendente'].includes(
            perfil
        )
    )
        return res.status(400).json({ erro: 'Perfil inválido' });

    try {
        const senhaHash = bcrypt.hashSync(senha, 12);
        const result = db.queryRun('INSERT INTO usuarios (nome, usuario, senha, perfil) VALUES (?, ?, ?, ?)', [
            sanitizarTexto(nome),
            sanitizarTexto(usuario),
            senhaHash,
            perfil || 'analista'
        ]);
        const novo = db.queryGet('SELECT id, nome, usuario, perfil, ativo, criado_em FROM usuarios WHERE id = ?', [
            result.lastInsertRowid
        ]);
        registrarAtividade(req, 'criar', 'usuarios', novo.id, `Usuario criado: ${nome} (${perfil})`);
        res.status(201).json(novo);
    } catch (err) {
        if (err.message && err.message.includes('UNIQUE'))
            return res.status(400).json({ erro: 'Já existe um usuário com esse login' });
        handleError(res, err, 'operacao');
    }
});

app.put('/api/usuarios/:id', requireAdmin, (req, res) => {
    const db = getDB();
    const { nome, usuario, senha, perfil } = req.body;
    const id = Number(req.params.id);

    try {
        if (senha) {
            const senhaHash = bcrypt.hashSync(senha, 12);
            db.queryRun('UPDATE usuarios SET nome = ?, usuario = ?, senha = ?, perfil = ? WHERE id = ?', [
                nome,
                usuario,
                senhaHash,
                perfil,
                id
            ]);
        } else {
            db.queryRun('UPDATE usuarios SET nome = ?, usuario = ?, perfil = ? WHERE id = ?', [
                nome,
                usuario,
                perfil,
                id
            ]);
        }
        const updated = db.queryGet('SELECT id, nome, usuario, perfil, ativo, criado_em FROM usuarios WHERE id = ?', [
            id
        ]);
        registrarAtividade(req, 'editar', 'usuarios', id, `Usuario editado: ${nome} (${perfil})`);
        res.json(updated);
    } catch (err) {
        if (err.message && err.message.includes('UNIQUE'))
            return res.status(400).json({ erro: 'Já existe um usuário com esse login' });
        handleError(res, err, 'operacao');
    }
});

app.patch('/api/usuarios/:id/ativo', requireAdmin, (req, res) => {
    const db = getDB();
    const id = Number(req.params.id);
    const { ativo } = req.body;

    if (req.session.usuario.id === id)
        return res.status(400).json({ erro: 'Você não pode desativar sua própria conta' });

    db.queryRun('UPDATE usuarios SET ativo = ? WHERE id = ?', [ativo ? 1 : 0, id]);
    const updated = db.queryGet('SELECT id, nome, usuario, perfil, ativo, criado_em FROM usuarios WHERE id = ?', [id]);
    registrarAtividade(req, 'editar', 'usuarios', id, `Usuario ${ativo ? 'ativado' : 'desativado'}: ${updated.nome}`);
    res.json(updated);
});

// ==================== API: PERMISSOES (ADMIN ONLY) ====================

app.get('/api/permissoes', requireAdmin, (req, res) => {
    const db = getDB();
    const perms = db.queryAll('SELECT * FROM permissoes_modulos ORDER BY perfil, modulo');
    res.json(perms);
});

app.put('/api/permissoes/:perfil', requireAdmin, (req, res) => {
    const { perfil } = req.params;
    if (perfil === 'admin') return res.status(400).json({ erro: 'Não é possível alterar permissões do administrador' });
    if (!['analista', 'vendedor'].includes(perfil)) return res.status(400).json({ erro: 'Perfil inválido' });

    const { modulos } = req.body;
    if (!modulos || typeof modulos !== 'object') return res.status(400).json({ erro: 'Dados inválidos' });

    const db = getDB();
    for (const [modulo, ativo] of Object.entries(modulos)) {
        db.queryRun(
            "INSERT INTO permissoes_modulos (perfil, modulo, ativo, atualizado_em) VALUES (?, ?, ?, datetime('now','localtime')) ON CONFLICT(perfil, modulo) DO UPDATE SET ativo = ?, atualizado_em = datetime('now','localtime')",
            [perfil, modulo, ativo ? 1 : 0, ativo ? 1 : 0]
        );
    }
    registrarAtividade(req, 'editar', 'usuarios', null, `Permissoes alteradas: perfil ${perfil}`);
    res.json({ ok: true });
});

// ==================== PROTECAO DE MODULOS NAS APIs ====================

// Chamados API - requer acesso ao modulo chamados
app.use('/api/chamados', requireModuleAccess('chamados'));

// Treinamentos API - requer acesso ao modulo treinamentos
app.use('/api/treinamentos', requireModuleAccess('treinamentos'));

// Projetos API - requer acesso ao modulo projetos
app.use('/api/projetos', requireModuleAccess('projetos'));

// Vendas API - requer acesso ao modulo vendas (substitui requireVendedorOuAdmin em rotas individuais)
app.use('/api/vendas', requireModuleAccess('vendas'));

// WhatsApp API - requer acesso ao modulo whatsapp (exceto webhook que e publico)
app.use('/api/whatsapp', (req, res, next) => {
    // Webhook e events sao excecoes - webhook ja e publico, events precisa funcionar para notificacoes
    if (req.path === '/webhook' || req.path === '/events') return next();
    return requireModuleAccess('whatsapp')(req, res, next);
});

// Provedores API - GET e livre (dependencia compartilhada), mutacao requer acesso ao modulo

// ==================== API: PROVEDORES ====================

app.get('/api/provedores', (req, res) => {
    const db = getDB();
    const { busca } = req.query;
    const baseSQL = `SELECT p.*,
        (SELECT COUNT(*) FROM chamados WHERE provedor_id = p.id) as totalChamados,
        (SELECT COUNT(*) FROM treinamentos WHERE provedor_id = p.id) as totalTreinamentos,
        (SELECT COUNT(*) FROM projetos WHERE provedor_id = p.id) as totalProjetos
        FROM provedores p`;
    let rows;
    if (busca) {
        rows = db.queryAll(baseSQL + ' WHERE p.nome LIKE ? ORDER BY p.nome', [`%${busca}%`]);
    } else {
        rows = db.queryAll(baseSQL + ' ORDER BY p.nome');
    }
    res.json(rows);
});

app.get('/api/provedores/:id', (req, res) => {
    const db = getDB();
    const provedor = db.queryGet('SELECT * FROM provedores WHERE id = ?', [Number(req.params.id)]);
    if (!provedor) return res.status(404).json({ erro: 'Provedor não encontrado' });

    const totalChamados = db.queryGet('SELECT COUNT(*) as total FROM chamados WHERE provedor_id = ?', [
        Number(req.params.id)
    ]).total;
    const totalTreinamentos = db.queryGet('SELECT COUNT(*) as total FROM treinamentos WHERE provedor_id = ?', [
        Number(req.params.id)
    ]).total;

    res.json({ ...provedor, totalChamados, totalTreinamentos });
});

app.post('/api/provedores', requireModuleAccess('provedores'), (req, res) => {
    const db = getDB();
    const {
        nome,
        contato,
        observacoes,
        plano,
        adicionais,
        modelo_integracao,
        erp,
        responsavel,
        logo_url,
        token_integracao
    } = req.body;
    if (!nome) return res.status(400).json({ erro: 'Nome é obrigatório' });

    try {
        const result = db.queryRun(
            'INSERT INTO provedores (nome, contato, observacoes, plano, adicionais, modelo_integracao, erp, responsavel, logo_url, token_integracao) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                nome,
                contato || null,
                observacoes || null,
                plano || null,
                adicionais || null,
                modelo_integracao || null,
                erp || null,
                responsavel || null,
                logo_url || null,
                token_integracao || null
            ]
        );
        const provedor = db.queryGet('SELECT * FROM provedores WHERE id = ?', [result.lastInsertRowid]);
        registrarAtividade(req, 'criar', 'provedores', provedor.id, `Provedor criado: ${nome}`);
        res.status(201).json(provedor);
    } catch (err) {
        if (err.message && err.message.includes('UNIQUE'))
            return res.status(400).json({ erro: 'Já existe um provedor com esse nome' });
        handleError(res, err, 'operacao');
    }
});

app.put('/api/provedores/:id', requireModuleAccess('provedores'), (req, res) => {
    const db = getDB();
    const {
        nome,
        contato,
        observacoes,
        plano,
        adicionais,
        modelo_integracao,
        erp,
        responsavel,
        logo_url,
        token_integracao
    } = req.body;
    try {
        db.queryRun(
            'UPDATE provedores SET nome = ?, contato = ?, observacoes = ?, plano = ?, adicionais = ?, modelo_integracao = ?, erp = ?, responsavel = ?, logo_url = ?, token_integracao = ? WHERE id = ?',
            [
                nome,
                contato || null,
                observacoes || null,
                plano || null,
                adicionais || null,
                modelo_integracao || null,
                erp || null,
                responsavel || null,
                logo_url || null,
                token_integracao || null,
                Number(req.params.id)
            ]
        );
        const provedor = db.queryGet('SELECT * FROM provedores WHERE id = ?', [Number(req.params.id)]);
        registrarAtividade(req, 'editar', 'provedores', Number(req.params.id), `Provedor editado: ${nome}`);
        res.json(provedor);
    } catch (err) {
        if (err.message && err.message.includes('UNIQUE'))
            return res.status(400).json({ erro: 'Já existe um provedor com esse nome' });
        handleError(res, err, 'operacao');
    }
});

app.post('/api/provedores/:id/logo', requireModuleAccess('provedores'), upload.single('logo'), (req, res) => {
    try {
        const db = getDB();
        const id = Number(req.params.id);
        const provedor = db.queryGet('SELECT * FROM provedores WHERE id = ?', [id]);
        if (!provedor) return res.status(404).json({ erro: 'Provedor nao encontrado' });
        if (!req.file) return res.status(400).json({ erro: 'Arquivo de logo obrigatorio' });
        const logo_url = '/uploads/' + req.file.filename;
        db.queryRun('UPDATE provedores SET logo_url = ? WHERE id = ?', [logo_url, id]);
        res.json({ logo_url });
    } catch (err) {
        handleError(res, err, 'operacao');
    }
});

app.delete('/api/provedores/:id', requireModuleAccess('provedores'), (req, res) => {
    const db = getDB();
    const chamados = db.queryGet('SELECT COUNT(*) as total FROM chamados WHERE provedor_id = ?', [
        Number(req.params.id)
    ]).total;
    if (chamados > 0)
        return res.status(400).json({ erro: 'Não é possível excluir: existem chamados vinculados a este provedor' });
    db.queryRun('DELETE FROM treinamentos WHERE provedor_id = ?', [Number(req.params.id)]);
    db.queryRun('DELETE FROM provedores WHERE id = ?', [Number(req.params.id)]);
    registrarAtividade(req, 'excluir', 'provedores', Number(req.params.id), 'Provedor excluido');
    res.json({ sucesso: true });
});

// ==================== API: CHAMADOS ====================

app.get('/api/chamados', (req, res) => {
    const db = getDB();
    const { status, provedor_id, categoria, prioridade, data_inicio, data_fim } = req.query;
    let sql =
        'SELECT c.*, p.nome as provedor_nome, u.nome as responsavel_nome FROM chamados c JOIN provedores p ON c.provedor_id = p.id LEFT JOIN usuarios u ON c.responsavel_id = u.id WHERE 1=1';
    const params = [];

    if (status) {
        sql += ' AND c.status = ?';
        params.push(status);
    }
    if (provedor_id) {
        sql += ' AND c.provedor_id = ?';
        params.push(Number(provedor_id));
    }
    if (categoria) {
        sql += ' AND c.categoria = ?';
        params.push(categoria);
    }
    if (prioridade) {
        sql += ' AND c.prioridade = ?';
        params.push(prioridade);
    }
    if (data_inicio) {
        sql += ' AND c.data_abertura >= ?';
        params.push(data_inicio);
    }
    if (data_fim) {
        sql += ' AND c.data_abertura <= ?';
        params.push(data_fim + ' 23:59:59');
    }

    sql += ' ORDER BY c.data_abertura DESC';
    res.json(db.queryAll(sql, params));
});

// Fila priorizada (DEVE ficar antes de /api/chamados/:id)
app.get('/api/chamados/fila', requireAuth, (req, res) => {
    try {
        const db = getDB();
        const config = db.queryGet('SELECT * FROM fila_atendimento_config WHERE ativo = 1 ORDER BY id LIMIT 1');
        const pesoPrioridade = config?.peso_prioridade || 3.0;
        const pesoSLA = config?.peso_sla || 5.0;
        const pesoTempo = config?.peso_tempo_espera || 2.0;
        const pesoReaberturas = config?.peso_reaberturas || 1.0;

        const chamados = db.queryAll(`
            SELECT c.*, p.nome as provedor_nome, u.nome as responsavel_nome,
                julianday('now','localtime') - julianday(c.data_abertura) as dias_aberto,
                CASE WHEN c.sla_resolucao_limite IS NOT NULL AND c.sla_resolucao_limite < datetime('now','localtime') THEN 1 ELSE 0 END as sla_vencido,
                CASE WHEN c.sla_resolucao_limite IS NOT NULL THEN
                    MAX(0, (julianday(c.sla_resolucao_limite) - julianday('now','localtime')) * 24)
                ELSE 999 END as horas_restantes_sla
            FROM chamados c
            JOIN provedores p ON c.provedor_id = p.id
            LEFT JOIN usuarios u ON c.responsavel_id = u.id
            WHERE c.status NOT IN ('resolvido','fechado')
            ORDER BY c.data_abertura ASC
        `);

        const PRIORIDADE_SCORE = { critica: 4, alta: 3, normal: 2, baixa: 1 };
        chamados.forEach((ch) => {
            const scorePrio = (PRIORIDADE_SCORE[ch.prioridade] || 2) * pesoPrioridade;
            const scoreSLA = ch.sla_vencido
                ? pesoSLA * 5
                : ch.horas_restantes_sla < 4
                  ? pesoSLA * 3
                  : ch.horas_restantes_sla < 12
                    ? pesoSLA * 1.5
                    : 0;
            const scoreTempo = Math.min(ch.dias_aberto || 0, 30) * pesoTempo * 0.5;
            const scoreReab = (ch.reaberturas || 0) * pesoReaberturas * 2;
            ch.score_prioridade = Math.round((scorePrio + scoreSLA + scoreTempo + scoreReab) * 100) / 100;
        });

        chamados.sort((a, b) => b.score_prioridade - a.score_prioridade);

        const resumo = {
            total: chamados.length,
            criticos: chamados.filter((c) => c.prioridade === 'critica').length,
            sla_vencido: chamados.filter((c) => c.sla_vencido).length,
            sem_responsavel: chamados.filter((c) => !c.responsavel_id).length,
            tempo_medio_espera:
                chamados.length > 0
                    ? Math.round((chamados.reduce((s, c) => s + (c.dias_aberto || 0), 0) / chamados.length) * 10) / 10
                    : 0
        };

        res.json({
            chamados,
            resumo,
            config: {
                peso_prioridade: pesoPrioridade,
                peso_sla: pesoSLA,
                peso_tempo_espera: pesoTempo,
                peso_reaberturas: pesoReaberturas
            }
        });
    } catch (err) {
        handleError(res, err, 'Fila atendimento');
    }
});

app.get('/api/chamados/:id', (req, res) => {
    const db = getDB();
    const chamado = db.queryGet(
        'SELECT c.*, p.nome as provedor_nome, u.nome as responsavel_nome FROM chamados c JOIN provedores p ON c.provedor_id = p.id LEFT JOIN usuarios u ON c.responsavel_id = u.id WHERE c.id = ?',
        [Number(req.params.id)]
    );
    if (!chamado) return res.status(404).json({ erro: 'Chamado não encontrado' });

    const anexos = db.queryAll('SELECT * FROM anexos WHERE chamado_id = ?', [Number(req.params.id)]);
    res.json({ ...chamado, anexos });
});

app.post('/api/chamados', (req, res) => {
    const db = getDB();
    const { provedor_id, titulo, descricao, categoria, responsavel_id, prioridade } = req.body;
    let erro =
        validarInteiro(provedor_id, 'Provedor', 1) ||
        validarString(titulo, 'Titulo', 3, 200) ||
        validarString(categoria, 'Categoria', 1, 100);
    if (erro) return res.status(400).json({ erro });
    if (prioridade && !['baixa', 'normal', 'alta', 'critica'].includes(prioridade))
        return res.status(400).json({ erro: 'Prioridade invalida' });
    if (descricao && descricao.length > 5000)
        return res.status(400).json({ erro: 'Descricao muito longa (max 5000 caracteres)' });

    // Calcular SLA deadlines
    const prio = prioridade || 'normal';
    const slaRegra = calcularSLA(categoria, prio);
    const sla_resposta_limite = slaRegra ? calcularDeadline(slaRegra.tempo_resposta_horas) : null;
    const sla_resolucao_limite = slaRegra ? calcularDeadline(slaRegra.tempo_resolucao_horas) : null;

    const result = db.queryRun(
        'INSERT INTO chamados (provedor_id, titulo, descricao, categoria, responsavel_id, prioridade, sla_resposta_limite, sla_resolucao_limite) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
            Number(provedor_id),
            titulo,
            descricao || null,
            categoria,
            responsavel_id ? Number(responsavel_id) : null,
            prio,
            sla_resposta_limite,
            sla_resolucao_limite
        ]
    );
    const chamado = db.queryGet(
        'SELECT c.*, p.nome as provedor_nome FROM chamados c JOIN provedores p ON c.provedor_id = p.id WHERE c.id = ?',
        [result.lastInsertRowid]
    );
    dispararNotificacao('chamado_aberto', { id: chamado.id, titulo, categoria, provedor: chamado.provedor_nome });
    dispararWebhooks('chamado.criado', {
        id: chamado.id,
        titulo,
        categoria,
        prioridade: prio,
        provedor: chamado.provedor_nome
    });
    registrarAtividade(req, 'criar', 'chamados', chamado.id, `Chamado criado: ${titulo} (${prio})`);
    criarNotificacaoParaPerfil(
        'admin',
        'chamado',
        'Novo chamado aberto',
        `${titulo} - ${chamado.provedor_nome} [${prio.toUpperCase()}]`,
        '/chamados'
    );
    res.status(201).json(chamado);
});

app.put('/api/chamados/:id', (req, res) => {
    const db = getDB();
    const { provedor_id, titulo, descricao, categoria, status, resolucao, responsavel_id, prioridade } = req.body;

    const atual = db.queryGet('SELECT * FROM chamados WHERE id = ?', [Number(req.params.id)]);
    if (!atual) return res.status(404).json({ erro: 'Chamado nao encontrado' });
    // Per-resource auth: non-admin can only edit chamados assigned to them
    if (
        req.session.usuario.perfil !== 'admin' &&
        atual.responsavel_id &&
        atual.responsavel_id !== req.session.usuario.id
    ) {
        return res.status(403).json({ erro: 'Voce so pode editar chamados atribuidos a voce' });
    }
    if (status && !['pendente', 'aberto', 'em_andamento', 'resolvido', 'fechado'].includes(status)) {
        return res.status(400).json({ erro: 'Status invalido' });
    }

    let data_resolucao = null;
    if (status === 'resolvido' || status === 'fechado') {
        data_resolucao = atual.data_resolucao || new Date().toISOString().replace('T', ' ').substring(0, 19);
    }

    // Marcar SLA respondido quando muda de pendente para outro status
    let sla_respondido_em = atual.sla_respondido_em;
    if (atual.status === 'pendente' && status && status !== 'pendente' && !sla_respondido_em) {
        sla_respondido_em = new Date().toISOString().replace('T', ' ').substring(0, 19);
    }

    // Recalcular SLA se prioridade mudou
    const prio = prioridade || atual.prioridade || 'normal';
    let sla_resposta_limite = atual.sla_resposta_limite;
    let sla_resolucao_limite = atual.sla_resolucao_limite;
    if (prioridade && prioridade !== atual.prioridade) {
        const slaRegra = calcularSLA(categoria || atual.categoria, prio);
        if (slaRegra) {
            const abertura = new Date(atual.data_abertura);
            sla_resposta_limite = new Date(abertura.getTime() + slaRegra.tempo_resposta_horas * 3600000)
                .toISOString()
                .replace('T', ' ')
                .substring(0, 19);
            sla_resolucao_limite = new Date(abertura.getTime() + slaRegra.tempo_resolucao_horas * 3600000)
                .toISOString()
                .replace('T', ' ')
                .substring(0, 19);
        }
    }

    // Verificar se SLA estourou
    const agora = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const sla_estourado =
        sla_resolucao_limite && agora > sla_resolucao_limite && status !== 'resolvido' && status !== 'fechado' ? 1 : 0;

    db.queryRun(
        `UPDATE chamados SET provedor_id = ?, titulo = ?, descricao = ?, categoria = ?, status = ?, resolucao = ?, data_resolucao = ?,
         responsavel_id = ?, prioridade = ?, sla_resposta_limite = ?, sla_resolucao_limite = ?, sla_respondido_em = ?, sla_estourado = ? WHERE id = ?`,
        [
            Number(provedor_id),
            titulo,
            descricao || null,
            categoria,
            status,
            resolucao || null,
            data_resolucao,
            responsavel_id ? Number(responsavel_id) : null,
            prio,
            sla_resposta_limite,
            sla_resolucao_limite,
            sla_respondido_em,
            sla_estourado,
            Number(req.params.id)
        ]
    );

    const chamado = db.queryGet(
        'SELECT c.*, p.nome as provedor_nome FROM chamados c JOIN provedores p ON c.provedor_id = p.id WHERE c.id = ?',
        [Number(req.params.id)]
    );
    if (status === 'resolvido' || status === 'fechado') {
        dispararNotificacao('chamado_resolvido', { id: chamado.id, titulo, resolucao: resolucao || 'Sem detalhes' });
        dispararWebhooks('chamado.resolvido', { id: chamado.id, titulo, status, resolucao });
    }
    dispararWebhooks('chamado.atualizado', { id: chamado.id, titulo, status });
    registrarAtividade(req, 'editar', 'chamados', Number(req.params.id), `Chamado editado: ${titulo} (${status})`);
    res.json(chamado);
});

app.delete('/api/chamados/:id', (req, res) => {
    const db = getDB();
    const anexos = db.queryAll('SELECT caminho FROM anexos WHERE chamado_id = ?', [Number(req.params.id)]);
    for (const anexo of anexos) {
        const filePath = path.join(__dirname, anexo.caminho);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    db.queryRun('DELETE FROM anexos WHERE chamado_id = ?', [Number(req.params.id)]);
    db.queryRun('DELETE FROM chamados WHERE id = ?', [Number(req.params.id)]);
    registrarAtividade(req, 'excluir', 'chamados', Number(req.params.id), 'Chamado excluido');
    res.json({ sucesso: true });
});

// ==================== API: ANEXOS ====================

app.post('/api/chamados/:id/anexos', upload.array('arquivos', 10), (req, res) => {
    const db = getDB();
    const chamado = db.queryGet('SELECT id FROM chamados WHERE id = ?', [Number(req.params.id)]);
    if (!chamado) return res.status(404).json({ erro: 'Chamado não encontrado' });

    const anexos = [];
    for (const file of req.files) {
        const caminho = 'uploads/' + file.filename;
        db.queryRun(
            'INSERT INTO anexos (chamado_id, nome_arquivo, caminho, tipo_mime, tamanho) VALUES (?, ?, ?, ?, ?)',
            [Number(req.params.id), file.originalname, caminho, file.mimetype, file.size]
        );
        anexos.push({ nome_arquivo: file.originalname, caminho, tipo_mime: file.mimetype, tamanho: file.size });
    }

    res.status(201).json(anexos);
});

app.delete('/api/anexos/:id', (req, res) => {
    const db = getDB();
    const anexo = db.queryGet('SELECT * FROM anexos WHERE id = ?', [Number(req.params.id)]);
    if (!anexo) return res.status(404).json({ erro: 'Anexo não encontrado' });

    const filePath = path.join(__dirname, anexo.caminho);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    db.queryRun('DELETE FROM anexos WHERE id = ?', [Number(req.params.id)]);
    res.json({ sucesso: true });
});

// ==================== API: TREINAMENTOS ====================

app.get('/api/treinamentos', (req, res) => {
    const db = getDB();
    const { provedor_id } = req.query;
    let sql =
        "SELECT t.*, COALESCE(t.status, 'agendado') as status, p.nome as provedor_nome FROM treinamentos t JOIN provedores p ON t.provedor_id = p.id";
    const params = [];
    if (provedor_id) {
        sql += ' WHERE t.provedor_id = ?';
        params.push(Number(provedor_id));
    }
    sql += ' ORDER BY t.data_treinamento DESC';
    res.json(db.queryAll(sql, params));
});

app.post('/api/treinamentos', (req, res) => {
    const db = getDB();
    const { provedor_id, titulo, descricao, data_treinamento, status, hora_treinamento } = req.body;
    if (!provedor_id || !titulo || !data_treinamento)
        return res.status(400).json({ erro: 'Provedor, título e data são obrigatórios' });

    const result = db.queryRun(
        'INSERT INTO treinamentos (provedor_id, titulo, descricao, data_treinamento, status, hora_treinamento) VALUES (?, ?, ?, ?, ?, ?)',
        [
            Number(provedor_id),
            titulo,
            descricao || null,
            data_treinamento,
            status || 'agendado',
            hora_treinamento || null
        ]
    );
    const treinamento = db.queryGet(
        'SELECT t.*, p.nome as provedor_nome FROM treinamentos t JOIN provedores p ON t.provedor_id = p.id WHERE t.id = ?',
        [result.lastInsertRowid]
    );
    dispararNotificacao('treinamento_agendado', {
        titulo,
        provedor: treinamento.provedor_nome,
        data: data_treinamento,
        hora: hora_treinamento || ''
    });
    dispararWebhooks('treinamento.criado', {
        id: treinamento.id,
        titulo,
        provedor: treinamento.provedor_nome,
        data: data_treinamento
    });
    registrarAtividade(req, 'criar', 'treinamentos', treinamento.id, `Treinamento criado: ${titulo}`);
    res.status(201).json(treinamento);
});

app.put('/api/treinamentos/:id', (req, res) => {
    const db = getDB();
    const { provedor_id, titulo, descricao, data_treinamento, status, hora_treinamento } = req.body;
    db.queryRun(
        'UPDATE treinamentos SET provedor_id = ?, titulo = ?, descricao = ?, data_treinamento = ?, status = ?, hora_treinamento = ? WHERE id = ?',
        [
            Number(provedor_id),
            titulo,
            descricao || null,
            data_treinamento,
            status || 'agendado',
            hora_treinamento || null,
            Number(req.params.id)
        ]
    );
    const treinamento = db.queryGet(
        'SELECT t.*, p.nome as provedor_nome FROM treinamentos t JOIN provedores p ON t.provedor_id = p.id WHERE t.id = ?',
        [Number(req.params.id)]
    );
    registrarAtividade(req, 'editar', 'treinamentos', Number(req.params.id), `Treinamento editado: ${titulo}`);
    res.json(treinamento);
});

app.patch('/api/treinamentos/:id/status', (req, res) => {
    const db = getDB();
    const { status } = req.body;
    if (!status) return res.status(400).json({ erro: 'Status é obrigatório' });
    db.queryRun('UPDATE treinamentos SET status = ? WHERE id = ?', [status, Number(req.params.id)]);
    const treinamento = db.queryGet(
        'SELECT t.*, p.nome as provedor_nome FROM treinamentos t JOIN provedores p ON t.provedor_id = p.id WHERE t.id = ?',
        [Number(req.params.id)]
    );
    registrarAtividade(req, 'status', 'treinamentos', Number(req.params.id), `Status: ${status}`);
    res.json(treinamento);
});

app.delete('/api/treinamentos/:id', (req, res) => {
    const db = getDB();
    db.queryRun('DELETE FROM treinamentos WHERE id = ?', [Number(req.params.id)]);
    registrarAtividade(req, 'excluir', 'treinamentos', Number(req.params.id), 'Treinamento excluido');
    res.json({ sucesso: true });
});

// ==================== API: PROJETOS ====================

app.get('/api/projetos', (req, res) => {
    const db = getDB();
    const { status } = req.query;
    let sql =
        'SELECT pr.*, p.nome as provedor_nome, u.nome as responsavel_nome FROM projetos pr LEFT JOIN provedores p ON pr.provedor_id = p.id LEFT JOIN usuarios u ON pr.responsavel_id = u.id';
    const params = [];
    if (status) {
        sql += ' WHERE pr.status = ?';
        params.push(status);
    }
    sql += ' ORDER BY pr.data_inicio DESC';
    res.json(db.queryAll(sql, params));
});

app.post('/api/projetos', (req, res) => {
    const db = getDB();
    const {
        titulo,
        descricao,
        provedor_id,
        provedor_manual,
        status,
        prioridade,
        data_inicio,
        data_previsao,
        responsavel_id
    } = req.body;
    if (!titulo || !data_inicio) return res.status(400).json({ erro: 'Título e data de início são obrigatórios' });

    const result = db.queryRun(
        'INSERT INTO projetos (titulo, descricao, provedor_id, provedor_manual, status, prioridade, data_inicio, data_previsao, responsavel_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
            titulo,
            descricao || null,
            provedor_id ? Number(provedor_id) : null,
            provedor_manual || null,
            status || 'em_andamento',
            prioridade || 'media',
            data_inicio,
            data_previsao || null,
            responsavel_id ? Number(responsavel_id) : null
        ]
    );
    const projeto = db.queryGet(
        'SELECT pr.*, p.nome as provedor_nome FROM projetos pr LEFT JOIN provedores p ON pr.provedor_id = p.id WHERE pr.id = ?',
        [result.lastInsertRowid]
    );
    registrarAtividade(req, 'criar', 'projetos', projeto.id, `Projeto criado: ${titulo}`);
    res.status(201).json(projeto);
});

app.put('/api/projetos/:id', (req, res) => {
    const db = getDB();
    const {
        titulo,
        descricao,
        provedor_id,
        provedor_manual,
        status,
        prioridade,
        data_inicio,
        data_previsao,
        responsavel_id,
        percentual_conclusao
    } = req.body;
    db.queryRun(
        'UPDATE projetos SET titulo = ?, descricao = ?, provedor_id = ?, provedor_manual = ?, status = ?, prioridade = ?, data_inicio = ?, data_previsao = ?, responsavel_id = ?, percentual_conclusao = ? WHERE id = ?',
        [
            titulo,
            descricao || null,
            provedor_id ? Number(provedor_id) : null,
            provedor_manual || null,
            status,
            prioridade,
            data_inicio,
            data_previsao || null,
            responsavel_id ? Number(responsavel_id) : null,
            percentual_conclusao !== undefined ? Number(percentual_conclusao) : 0,
            Number(req.params.id)
        ]
    );
    const projeto = db.queryGet(
        'SELECT pr.*, p.nome as provedor_nome FROM projetos pr LEFT JOIN provedores p ON pr.provedor_id = p.id WHERE pr.id = ?',
        [Number(req.params.id)]
    );
    const statusLabels = {
        em_andamento: 'Em andamento',
        pausado: 'Pausado',
        concluido: 'Concluído',
        cancelado: 'Cancelado'
    };
    dispararNotificacao('projeto_atualizado', { titulo, status: statusLabels[status] || status });
    dispararWebhooks('projeto.atualizado', { id: Number(req.params.id), titulo, status });
    registrarAtividade(req, 'editar', 'projetos', Number(req.params.id), `Projeto editado: ${titulo} (${status})`);
    res.json(projeto);
});

app.delete('/api/projetos/:id', (req, res) => {
    const db = getDB();
    db.queryRun('DELETE FROM projetos WHERE id = ?', [Number(req.params.id)]);
    registrarAtividade(req, 'excluir', 'projetos', Number(req.params.id), 'Projeto excluido');
    res.json({ sucesso: true });
});

app.patch('/api/projetos/:id/status', (req, res) => {
    const db = getDB();
    const { status, percentual_conclusao } = req.body;
    const validStatus = ['em_andamento', 'pausado', 'concluido', 'cancelado', 'planejado', 'em_revisao'];
    if (status && !validStatus.includes(status)) {
        return res.status(400).json({ erro: 'Status invalido' });
    }
    const id = Number(req.params.id);
    const projeto = db.queryGet('SELECT * FROM projetos WHERE id = ?', [id]);
    if (!projeto) return res.status(404).json({ erro: 'Projeto nao encontrado' });

    if (status) db.queryRun('UPDATE projetos SET status = ? WHERE id = ?', [status, id]);
    if (percentual_conclusao !== undefined)
        db.queryRun('UPDATE projetos SET percentual_conclusao = ? WHERE id = ?', [Number(percentual_conclusao), id]);

    const atualizado = db.queryGet(
        'SELECT pr.*, p.nome as provedor_nome FROM projetos pr LEFT JOIN provedores p ON pr.provedor_id = p.id WHERE pr.id = ?',
        [id]
    );
    registrarAtividade(req, 'status', 'projetos', id, `${projeto.status} -> ${status || projeto.status}`);
    res.json(atualizado);
});

// ==================== API: DASHBOARD ====================

app.get('/api/dashboard/resumo', (req, res) => {
    const db = getDB();
    const chamados = db.queryGet(`
        SELECT
            COUNT(*) as total_chamados,
            SUM(CASE WHEN status = 'pendente' THEN 1 ELSE 0 END) as pendentes,
            SUM(CASE WHEN status = 'em_andamento' THEN 1 ELSE 0 END) as em_andamento,
            SUM(CASE WHEN status IN ('resolvido', 'fechado') THEN 1 ELSE 0 END) as resolvidos
        FROM chamados
    `);
    const projetos = db.queryGet("SELECT COUNT(*) as total FROM projetos WHERE status = 'em_andamento'");
    const totalProvedores = db.queryGet('SELECT COUNT(*) as total FROM provedores').total;
    const totalTreinamentos = db.queryGet('SELECT COUNT(*) as total FROM treinamentos').total;
    res.json({
        ...chamados,
        projetos_ativos: projetos.total,
        total_provedores: totalProvedores,
        total_treinamentos: totalTreinamentos
    });
});

app.get('/api/dashboard/chamados-por-provedor', (req, res) => {
    const db = getDB();
    res.json(
        db.queryAll(
            'SELECT p.nome, COUNT(c.id) as total FROM chamados c JOIN provedores p ON c.provedor_id = p.id GROUP BY p.id ORDER BY total DESC'
        )
    );
});

app.get('/api/dashboard/chamados-por-categoria', (req, res) => {
    const db = getDB();
    res.json(db.queryAll('SELECT categoria, COUNT(*) as total FROM chamados GROUP BY categoria'));
});

app.get('/api/dashboard/chamados-por-mes', (req, res) => {
    const db = getDB();
    res.json(
        db.queryAll(
            "SELECT strftime('%Y-%m', data_abertura) as mes, COUNT(*) as total FROM chamados WHERE data_abertura >= date('now', '-12 months') GROUP BY mes ORDER BY mes"
        )
    );
});

app.get('/api/dashboard/chamados-recentes', (req, res) => {
    const db = getDB();
    res.json(
        db.queryAll(
            'SELECT c.id, c.titulo, c.categoria, c.status, c.data_abertura, p.nome as provedor_nome FROM chamados c JOIN provedores p ON c.provedor_id = p.id ORDER BY c.data_abertura DESC LIMIT 10'
        )
    );
});

app.get('/api/dashboard/chamados-abertos-por-provedor', (req, res) => {
    const db = getDB();
    res.json(
        db.queryAll(
            "SELECT p.nome, c.categoria, COUNT(*) as total FROM chamados c JOIN provedores p ON c.provedor_id = p.id WHERE c.status IN ('pendente', 'em_andamento') GROUP BY p.id, c.categoria ORDER BY p.nome, c.categoria"
        )
    );
});

// --- Métricas de Provedores ---
app.get('/api/dashboard/provedores-por-responsavel', (req, res) => {
    const db = getDB();
    res.json(
        db.queryAll(
            "SELECT COALESCE(responsavel, 'Sem responsável') as responsavel, COUNT(*) as total FROM provedores GROUP BY responsavel ORDER BY total DESC"
        )
    );
});

app.get('/api/dashboard/provedores-por-modelo', (req, res) => {
    const db = getDB();
    res.json(
        db.queryAll(
            "SELECT COALESCE(modelo_integracao, 'Não definido') as modelo, COUNT(*) as total FROM provedores GROUP BY modelo_integracao ORDER BY total DESC"
        )
    );
});

app.get('/api/dashboard/provedores-por-erp', (req, res) => {
    const db = getDB();
    res.json(
        db.queryAll(
            "SELECT COALESCE(erp, 'Não definido') as erp, COUNT(*) as total FROM provedores GROUP BY erp ORDER BY total DESC"
        )
    );
});

app.get('/api/dashboard/provedores-por-plano', (req, res) => {
    const db = getDB();
    res.json(
        db.queryAll(
            "SELECT COALESCE(plano, 'Não definido') as plano, COUNT(*) as total FROM provedores GROUP BY plano ORDER BY total DESC"
        )
    );
});

// --- Métricas de Treinamentos ---
app.get('/api/dashboard/treinamentos-por-status', (req, res) => {
    const db = getDB();
    res.json(
        db.queryAll(
            "SELECT COALESCE(status, 'agendado') as status, COUNT(*) as total FROM treinamentos GROUP BY status ORDER BY total DESC"
        )
    );
});

app.get('/api/dashboard/treinamentos-por-mes', (req, res) => {
    const db = getDB();
    res.json(
        db.queryAll(
            "SELECT strftime('%Y-%m', data_treinamento) as mes, COUNT(*) as total FROM treinamentos GROUP BY mes ORDER BY mes"
        )
    );
});

// --- Métricas de Projetos ---
app.get('/api/dashboard/projetos-por-status', (req, res) => {
    const db = getDB();
    res.json(db.queryAll('SELECT status, COUNT(*) as total FROM projetos GROUP BY status ORDER BY total DESC'));
});

app.get('/api/dashboard/projetos-por-prioridade', (req, res) => {
    const db = getDB();
    res.json(db.queryAll('SELECT prioridade, COUNT(*) as total FROM projetos GROUP BY prioridade ORDER BY total DESC'));
});

// ==================== API: METRICAS POR PROVEDOR (PDF) ====================

app.get('/api/dashboard/provedor/:id/metricas', (req, res) => {
    try {
        const db = getDB();
        const id = Number(req.params.id);
        const provedor = db.queryGet('SELECT * FROM provedores WHERE id = ?', [id]);
        if (!provedor) return res.status(404).json({ erro: 'Provedor nao encontrado' });

        const chamados = db.queryAll(
            'SELECT id, titulo, categoria, status, data_abertura, data_resolucao FROM chamados WHERE provedor_id = ? ORDER BY data_abertura DESC',
            [id]
        );
        const treinamentos = db.queryAll(
            'SELECT id, titulo, status, data_treinamento FROM treinamentos WHERE provedor_id = ? ORDER BY data_treinamento DESC',
            [id]
        );
        const projetos = db.queryAll(
            'SELECT id, titulo, status, prioridade, data_inicio, data_previsao FROM projetos WHERE provedor_id = ? ORDER BY data_inicio DESC',
            [id]
        );

        const resumo = {
            total_chamados: chamados.length,
            chamados_pendentes: chamados.filter((c) => c.status === 'pendente').length,
            chamados_resolvidos: chamados.filter((c) => c.status === 'resolvido').length,
            total_treinamentos: treinamentos.length,
            treinamentos_realizados: treinamentos.filter((t) => t.status === 'realizado').length,
            total_projetos: projetos.length,
            projetos_ativos: projetos.filter((p) => p.status === 'em_andamento').length
        };

        res.json({
            provedor,
            resumo,
            chamados: chamados.slice(0, 20),
            treinamentos: treinamentos.slice(0, 10),
            projetos
        });
    } catch (err) {
        console.error('Metricas error:', err);
        handleError(res, err, 'operacao');
    }
});

// ==================== API: HISTORICO ====================

app.get('/api/historico/:provedor_id', (req, res) => {
    const db = getDB();
    const provedor = db.queryGet('SELECT * FROM provedores WHERE id = ?', [Number(req.params.provedor_id)]);
    if (!provedor) return res.status(404).json({ erro: 'Provedor não encontrado' });

    const chamados = db.queryAll(
        "SELECT id, titulo, categoria, status, data_abertura as data, 'chamado' as tipo FROM chamados WHERE provedor_id = ?",
        [Number(req.params.provedor_id)]
    );
    const treinamentos = db.queryAll(
        "SELECT id, titulo, data_treinamento as data, 'treinamento' as tipo FROM treinamentos WHERE provedor_id = ?",
        [Number(req.params.provedor_id)]
    );
    const projetos = db.queryAll(
        "SELECT id, titulo, status, prioridade, data_inicio as data, 'projeto' as tipo FROM projetos WHERE provedor_id = ?",
        [Number(req.params.provedor_id)]
    );

    const eventos = [...chamados, ...treinamentos, ...projetos].sort((a, b) =>
        (b.data || '').localeCompare(a.data || '')
    );
    res.json({ provedor, eventos });
});

// ==================== API: VENDAS ====================

// --- Pipeline: Negocios ---
app.get('/api/vendas/negocios', (req, res) => {
    const db = getDB();
    const vendedor = filtrarPorVendedor(req);
    const { estagio } = req.query;
    let sql = `SELECT n.*, p.nome as provedor_nome FROM vendas_negocios n LEFT JOIN provedores p ON n.provedor_id = p.id`;
    const params = [];
    const conditions = [];
    if (vendedor) {
        conditions.push('n.responsavel_vendedor = ?');
        params.push(vendedor);
    }
    if (estagio) {
        conditions.push('n.estagio = ?');
        params.push(estagio);
    }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY n.atualizado_em DESC';
    res.json(db.queryAll(sql, params));
});

app.get('/api/vendas/negocios/:id', (req, res) => {
    const db = getDB();
    const negocio = db.queryGet(
        `SELECT n.*, p.nome as provedor_nome FROM vendas_negocios n LEFT JOIN provedores p ON n.provedor_id = p.id WHERE n.id = ?`,
        [Number(req.params.id)]
    );
    if (!negocio) return res.status(404).json({ erro: 'Negócio não encontrado' });
    const interacoes = db.queryAll('SELECT * FROM vendas_interacoes WHERE negocio_id = ? ORDER BY criado_em DESC', [
        Number(req.params.id)
    ]);
    res.json({ ...negocio, interacoes });
});

app.post('/api/vendas/negocios', (req, res) => {
    const db = getDB();
    const {
        provedor_id,
        provedor_nome_lead,
        contato_lead,
        estagio,
        plano_interesse,
        valor_estimado,
        responsavel_vendedor,
        origem,
        observacoes
    } = req.body;
    const vendedor = responsavel_vendedor || req.session.usuario.nome;
    if (!provedor_nome_lead && !provedor_id)
        return res.status(400).json({ erro: 'Nome do lead ou provedor é obrigatório' });
    try {
        const result = db.queryRun(
            'INSERT INTO vendas_negocios (provedor_id, provedor_nome_lead, contato_lead, estagio, plano_interesse, valor_estimado, responsavel_vendedor, origem, observacoes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                provedor_id ? Number(provedor_id) : null,
                provedor_nome_lead || null,
                contato_lead || null,
                estagio || 'lead',
                plano_interesse || null,
                valor_estimado || 0,
                vendedor,
                origem || null,
                observacoes || null
            ]
        );
        const negocio = db.queryGet(
            'SELECT n.*, p.nome as provedor_nome FROM vendas_negocios n LEFT JOIN provedores p ON n.provedor_id = p.id WHERE n.id = ?',
            [result.lastInsertRowid]
        );
        registrarAtividade(req, 'criar', 'vendas', negocio.id, `Negocio criado: ${provedor_nome_lead || ''}`);
        res.status(201).json(negocio);
    } catch (err) {
        handleError(res, err, 'operacao');
    }
});

app.put('/api/vendas/negocios/:id', (req, res) => {
    const db = getDB();
    const {
        provedor_id,
        provedor_nome_lead,
        contato_lead,
        estagio,
        plano_interesse,
        valor_estimado,
        responsavel_vendedor,
        origem,
        observacoes,
        motivo_perda
    } = req.body;
    try {
        db.queryRun(
            `UPDATE vendas_negocios SET provedor_id = ?, provedor_nome_lead = ?, contato_lead = ?, estagio = ?, plano_interesse = ?, valor_estimado = ?, responsavel_vendedor = ?, origem = ?, observacoes = ?, motivo_perda = ?, atualizado_em = datetime('now','localtime') WHERE id = ?`,
            [
                provedor_id ? Number(provedor_id) : null,
                provedor_nome_lead || null,
                contato_lead || null,
                estagio || 'lead',
                plano_interesse || null,
                valor_estimado || 0,
                responsavel_vendedor || req.session.usuario.nome,
                origem || null,
                observacoes || null,
                motivo_perda || null,
                Number(req.params.id)
            ]
        );
        const negocio = db.queryGet(
            'SELECT n.*, p.nome as provedor_nome FROM vendas_negocios n LEFT JOIN provedores p ON n.provedor_id = p.id WHERE n.id = ?',
            [Number(req.params.id)]
        );
        registrarAtividade(
            req,
            'editar',
            'vendas',
            Number(req.params.id),
            `Negocio editado: ${provedor_nome_lead || ''}`
        );
        res.json(negocio);
    } catch (err) {
        handleError(res, err, 'operacao');
    }
});

app.patch('/api/vendas/negocios/:id/estagio', (req, res) => {
    const db = getDB();
    const { estagio, motivo_perda } = req.body;
    if (!estagio) return res.status(400).json({ erro: 'Estágio é obrigatório' });
    db.queryRun(
        `UPDATE vendas_negocios SET estagio = ?, motivo_perda = ?, atualizado_em = datetime('now','localtime') WHERE id = ?`,
        [estagio, motivo_perda || null, Number(req.params.id)]
    );
    const negocio = db.queryGet(
        'SELECT n.*, p.nome as provedor_nome FROM vendas_negocios n LEFT JOIN provedores p ON n.provedor_id = p.id WHERE n.id = ?',
        [Number(req.params.id)]
    );
    registrarAtividade(req, 'status', 'vendas', Number(req.params.id), `Estagio: ${estagio}`);
    res.json(negocio);
});

app.delete('/api/vendas/negocios/:id', (req, res) => {
    const db = getDB();
    db.queryRun('DELETE FROM vendas_negocios WHERE id = ?', [Number(req.params.id)]);
    registrarAtividade(req, 'excluir', 'vendas', Number(req.params.id), 'Negocio excluido');
    res.json({ sucesso: true });
});

app.post('/api/vendas/negocios/:id/interacoes', (req, res) => {
    const db = getDB();
    const { tipo, descricao } = req.body;
    if (!descricao) return res.status(400).json({ erro: 'Descrição é obrigatória' });
    const result = db.queryRun(
        'INSERT INTO vendas_interacoes (negocio_id, tipo, descricao, criado_por) VALUES (?, ?, ?, ?)',
        [Number(req.params.id), tipo || 'nota', descricao, req.session.usuario.nome]
    );
    db.queryRun(`UPDATE vendas_negocios SET atualizado_em = datetime('now','localtime') WHERE id = ?`, [
        Number(req.params.id)
    ]);
    const interacao = db.queryGet('SELECT * FROM vendas_interacoes WHERE id = ?', [result.lastInsertRowid]);
    res.status(201).json(interacao);
});

// --- Metas ---
app.get('/api/vendas/metas', (req, res) => {
    const db = getDB();
    const vendedor = filtrarPorVendedor(req);
    const { periodo } = req.query;
    let sql = 'SELECT * FROM vendas_metas';
    const params = [];
    const conditions = [];
    if (vendedor) {
        conditions.push('vendedor = ?');
        params.push(vendedor);
    }
    if (periodo) {
        conditions.push('periodo_referencia = ?');
        params.push(periodo);
    }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY periodo_referencia DESC, vendedor';
    res.json(db.queryAll(sql, params));
});

app.get('/api/vendas/metas/progresso', (req, res) => {
    const db = getDB();
    const vendedor = filtrarPorVendedor(req);
    const periodo = req.query.periodo || new Date().toISOString().substring(0, 7);
    let sql = 'SELECT * FROM vendas_metas WHERE periodo_referencia = ?';
    const params = [periodo];
    if (vendedor) {
        sql += ' AND vendedor = ?';
        params.push(vendedor);
    }
    const metas = db.queryAll(sql, params);

    const resultado = metas.map((meta) => {
        let valorAtual = 0;
        const mesInicio = periodo + '-01';
        const mesFim = periodo + '-31';
        if (meta.tipo_meta === 'quantidade_ativacoes') {
            valorAtual = db.queryGet(
                `SELECT COUNT(*) as total FROM vendas_negocios WHERE responsavel_vendedor = ? AND estagio = 'ativado' AND atualizado_em >= ? AND atualizado_em <= ?`,
                [meta.vendedor, mesInicio, mesFim + ' 23:59:59']
            ).total;
        } else if (meta.tipo_meta === 'quantidade_upsells') {
            valorAtual = db.queryGet(
                `SELECT COUNT(*) as total FROM vendas_negocios WHERE responsavel_vendedor = ? AND estagio = 'ativado' AND plano_interesse LIKE '%full%' AND atualizado_em >= ? AND atualizado_em <= ?`,
                [meta.vendedor, mesInicio, mesFim + ' 23:59:59']
            ).total;
        } else if (meta.tipo_meta === 'valor_contratos') {
            valorAtual = db.queryGet(
                `SELECT COALESCE(SUM(valor_estimado), 0) as total FROM vendas_negocios WHERE responsavel_vendedor = ? AND estagio = 'ativado' AND atualizado_em >= ? AND atualizado_em <= ?`,
                [meta.vendedor, mesInicio, mesFim + ' 23:59:59']
            ).total;
        }
        const percentual = meta.valor_alvo > 0 ? (valorAtual / meta.valor_alvo) * 100 : 0;
        const comissao =
            percentual >= 100 && meta.percentual_comissao > 0 ? (valorAtual * meta.percentual_comissao) / 100 : 0;
        return { ...meta, valor_atual: valorAtual, percentual_atingido: percentual, comissao_calculada: comissao };
    });
    res.json(resultado);
});

app.post('/api/vendas/metas', requireAdmin, (req, res) => {
    const db = getDB();
    const { vendedor, tipo_meta, valor_alvo, percentual_comissao, periodo_referencia } = req.body;
    if (!vendedor || !tipo_meta || !valor_alvo || !periodo_referencia)
        return res
            .status(400)
            .json({ erro: 'Campos obrigatórios: vendedor, tipo_meta, valor_alvo, periodo_referencia' });
    const result = db.queryRun(
        'INSERT INTO vendas_metas (vendedor, tipo_meta, valor_alvo, percentual_comissao, periodo_referencia) VALUES (?, ?, ?, ?, ?)',
        [vendedor, tipo_meta, Number(valor_alvo), Number(percentual_comissao) || 0, periodo_referencia]
    );
    res.status(201).json(db.queryGet('SELECT * FROM vendas_metas WHERE id = ?', [result.lastInsertRowid]));
});

app.put('/api/vendas/metas/:id', requireAdmin, (req, res) => {
    const db = getDB();
    const { vendedor, tipo_meta, valor_alvo, percentual_comissao, periodo_referencia } = req.body;
    db.queryRun(
        'UPDATE vendas_metas SET vendedor = ?, tipo_meta = ?, valor_alvo = ?, percentual_comissao = ?, periodo_referencia = ? WHERE id = ?',
        [
            vendedor,
            tipo_meta,
            Number(valor_alvo),
            Number(percentual_comissao) || 0,
            periodo_referencia,
            Number(req.params.id)
        ]
    );
    res.json(db.queryGet('SELECT * FROM vendas_metas WHERE id = ?', [Number(req.params.id)]));
});

app.delete('/api/vendas/metas/:id', requireAdmin, (req, res) => {
    const db = getDB();
    db.queryRun('DELETE FROM vendas_metas WHERE id = ?', [Number(req.params.id)]);
    res.json({ sucesso: true });
});

// --- Tarefas/Agenda ---
app.get('/api/vendas/tarefas', (req, res) => {
    const db = getDB();
    const vendedor = filtrarPorVendedor(req);
    const { status } = req.query;
    let sql = `SELECT t.*, p.nome as provedor_nome, n.provedor_nome_lead as negocio_lead FROM vendas_tarefas t LEFT JOIN provedores p ON t.provedor_id = p.id LEFT JOIN vendas_negocios n ON t.negocio_id = n.id`;
    const params = [];
    const conditions = [];
    if (vendedor) {
        conditions.push('t.responsavel = ?');
        params.push(vendedor);
    }
    if (status) {
        conditions.push('t.status = ?');
        params.push(status);
    }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY t.data_hora ASC';
    res.json(db.queryAll(sql, params));
});

app.post('/api/vendas/tarefas', (req, res) => {
    const db = getDB();
    const { titulo, descricao, provedor_id, negocio_id, tipo, data_hora, responsavel } = req.body;
    if (!titulo || !data_hora) return res.status(400).json({ erro: 'Título e data/hora são obrigatórios' });
    const resp = responsavel || req.session.usuario.nome;
    const result = db.queryRun(
        'INSERT INTO vendas_tarefas (titulo, descricao, provedor_id, negocio_id, tipo, data_hora, responsavel) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
            titulo,
            descricao || null,
            provedor_id ? Number(provedor_id) : null,
            negocio_id ? Number(negocio_id) : null,
            tipo || 'follow_up',
            data_hora,
            resp
        ]
    );
    const tarefa = db.queryGet(
        `SELECT t.*, p.nome as provedor_nome FROM vendas_tarefas t LEFT JOIN provedores p ON t.provedor_id = p.id WHERE t.id = ?`,
        [result.lastInsertRowid]
    );
    res.status(201).json(tarefa);
});

app.put('/api/vendas/tarefas/:id', (req, res) => {
    const db = getDB();
    const { titulo, descricao, provedor_id, negocio_id, tipo, data_hora, status, responsavel } = req.body;
    db.queryRun(
        'UPDATE vendas_tarefas SET titulo = ?, descricao = ?, provedor_id = ?, negocio_id = ?, tipo = ?, data_hora = ?, status = ?, responsavel = ? WHERE id = ?',
        [
            titulo,
            descricao || null,
            provedor_id ? Number(provedor_id) : null,
            negocio_id ? Number(negocio_id) : null,
            tipo || 'follow_up',
            data_hora,
            status || 'pendente',
            responsavel || req.session.usuario.nome,
            Number(req.params.id)
        ]
    );
    const tarefa = db.queryGet(
        `SELECT t.*, p.nome as provedor_nome FROM vendas_tarefas t LEFT JOIN provedores p ON t.provedor_id = p.id WHERE t.id = ?`,
        [Number(req.params.id)]
    );
    res.json(tarefa);
});

app.patch('/api/vendas/tarefas/:id/status', (req, res) => {
    const db = getDB();
    const { status } = req.body;
    if (!status) return res.status(400).json({ erro: 'Status é obrigatório' });
    db.queryRun('UPDATE vendas_tarefas SET status = ? WHERE id = ?', [status, Number(req.params.id)]);
    res.json(db.queryGet('SELECT * FROM vendas_tarefas WHERE id = ?', [Number(req.params.id)]));
});

app.delete('/api/vendas/tarefas/:id', (req, res) => {
    const db = getDB();
    db.queryRun('DELETE FROM vendas_tarefas WHERE id = ?', [Number(req.params.id)]);
    res.json({ sucesso: true });
});

// --- Visitas ---
app.get('/api/vendas/visitas', (req, res) => {
    const db = getDB();
    const vendedor = filtrarPorVendedor(req);
    const { provedor_id, status } = req.query;
    let sql = `SELECT v.*, p.nome as provedor_nome FROM vendas_visitas v JOIN provedores p ON v.provedor_id = p.id`;
    const params = [];
    const conditions = [];
    if (vendedor) {
        conditions.push('v.responsavel = ?');
        params.push(vendedor);
    }
    if (provedor_id) {
        conditions.push('v.provedor_id = ?');
        params.push(Number(provedor_id));
    }
    if (status) {
        conditions.push('v.status = ?');
        params.push(status);
    }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY v.data_visita DESC';
    res.json(db.queryAll(sql, params));
});

app.post('/api/vendas/visitas', (req, res) => {
    const db = getDB();
    const {
        provedor_id,
        negocio_id,
        data_visita,
        hora_visita,
        tipo_visita,
        status,
        endereco,
        observacoes,
        resultado,
        responsavel
    } = req.body;
    if (!provedor_id || !data_visita) return res.status(400).json({ erro: 'Provedor e data são obrigatórios' });
    const resp = responsavel || req.session.usuario.nome;
    const result = db.queryRun(
        'INSERT INTO vendas_visitas (provedor_id, negocio_id, data_visita, hora_visita, tipo_visita, status, endereco, observacoes, resultado, responsavel) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
            Number(provedor_id),
            negocio_id ? Number(negocio_id) : null,
            data_visita,
            hora_visita || null,
            tipo_visita || 'presencial',
            status || 'agendada',
            endereco || null,
            observacoes || null,
            resultado || null,
            resp
        ]
    );
    const visita = db.queryGet(
        `SELECT v.*, p.nome as provedor_nome FROM vendas_visitas v JOIN provedores p ON v.provedor_id = p.id WHERE v.id = ?`,
        [result.lastInsertRowid]
    );
    res.status(201).json(visita);
});

app.put('/api/vendas/visitas/:id', (req, res) => {
    const db = getDB();
    const {
        provedor_id,
        negocio_id,
        data_visita,
        hora_visita,
        tipo_visita,
        status,
        endereco,
        observacoes,
        resultado,
        responsavel
    } = req.body;
    db.queryRun(
        'UPDATE vendas_visitas SET provedor_id = ?, negocio_id = ?, data_visita = ?, hora_visita = ?, tipo_visita = ?, status = ?, endereco = ?, observacoes = ?, resultado = ?, responsavel = ? WHERE id = ?',
        [
            Number(provedor_id),
            negocio_id ? Number(negocio_id) : null,
            data_visita,
            hora_visita || null,
            tipo_visita || 'presencial',
            status || 'agendada',
            endereco || null,
            observacoes || null,
            resultado || null,
            responsavel || req.session.usuario.nome,
            Number(req.params.id)
        ]
    );
    const visita = db.queryGet(
        `SELECT v.*, p.nome as provedor_nome FROM vendas_visitas v JOIN provedores p ON v.provedor_id = p.id WHERE v.id = ?`,
        [Number(req.params.id)]
    );
    res.json(visita);
});

app.delete('/api/vendas/visitas/:id', (req, res) => {
    const db = getDB();
    db.queryRun('DELETE FROM vendas_visitas WHERE id = ?', [Number(req.params.id)]);
    res.json({ sucesso: true });
});

// --- Dashboard Vendedor ---
app.get('/api/vendas/dashboard-vendedor', (req, res) => {
    const db = getDB();
    const vendedor =
        req.session.usuario.perfil === 'vendedor'
            ? req.session.usuario.nome
            : req.query.vendedor || req.session.usuario.nome;
    const mesAtual = new Date().toISOString().substring(0, 7);
    const mesInicio = mesAtual + '-01';
    const mesFim = mesAtual + '-31 23:59:59';

    const stats = {
        negocios_ativos: db.queryGet(
            "SELECT COUNT(*) as total FROM vendas_negocios WHERE responsavel_vendedor = ? AND estagio NOT IN ('ativado','perdido')",
            [vendedor]
        ).total,
        ativacoes_mes: db.queryGet(
            "SELECT COUNT(*) as total FROM vendas_negocios WHERE responsavel_vendedor = ? AND estagio = 'ativado' AND atualizado_em >= ? AND atualizado_em <= ?",
            [vendedor, mesInicio, mesFim]
        ).total,
        tarefas_pendentes: db.queryGet(
            "SELECT COUNT(*) as total FROM vendas_tarefas WHERE responsavel = ? AND status = 'pendente'",
            [vendedor]
        ).total,
        visitas_mes: db.queryGet(
            'SELECT COUNT(*) as total FROM vendas_visitas WHERE responsavel = ? AND data_visita >= ? AND data_visita <= ?',
            [vendedor, mesInicio, mesAtual + '-31']
        ).total
    };

    const valorPipeline = db.queryGet(
        "SELECT COALESCE(SUM(valor_estimado),0) as total FROM vendas_negocios WHERE responsavel_vendedor = ? AND estagio NOT IN ('ativado','perdido')",
        [vendedor]
    ).total;
    const totalNegocios = db.queryGet('SELECT COUNT(*) as total FROM vendas_negocios WHERE responsavel_vendedor = ?', [
        vendedor
    ]).total;
    const totalAtivados = db.queryGet(
        "SELECT COUNT(*) as total FROM vendas_negocios WHERE responsavel_vendedor = ? AND estagio = 'ativado'",
        [vendedor]
    ).total;
    const taxaConversao = totalNegocios > 0 ? ((totalAtivados / totalNegocios) * 100).toFixed(1) : 0;

    const negociosPorEstagio = db.queryAll(
        'SELECT estagio, COUNT(*) as total FROM vendas_negocios WHERE responsavel_vendedor = ? GROUP BY estagio',
        [vendedor]
    );
    const ativacoesPorMes = db.queryAll(
        `SELECT strftime('%Y-%m', atualizado_em) as mes, COUNT(*) as total FROM vendas_negocios WHERE responsavel_vendedor = ? AND estagio = 'ativado' AND atualizado_em >= date('now','-6 months') GROUP BY mes ORDER BY mes`,
        [vendedor]
    );
    const proximasTarefas = db.queryAll(
        `SELECT t.*, p.nome as provedor_nome FROM vendas_tarefas t LEFT JOIN provedores p ON t.provedor_id = p.id WHERE t.responsavel = ? AND t.status = 'pendente' ORDER BY t.data_hora ASC LIMIT 5`,
        [vendedor]
    );

    // Metas do mes com progresso
    const metas = db.queryAll('SELECT * FROM vendas_metas WHERE vendedor = ? AND periodo_referencia = ?', [
        vendedor,
        mesAtual
    ]);
    metas.forEach((meta) => {
        let valorAtual = 0;
        if (meta.tipo_meta === 'quantidade_ativacoes') {
            valorAtual = db.queryGet(
                "SELECT COUNT(*) as total FROM vendas_negocios WHERE responsavel_vendedor = ? AND estagio = 'ativado' AND atualizado_em >= ? AND atualizado_em <= ?",
                [meta.vendedor, mesInicio, mesFim]
            ).total;
        } else if (meta.tipo_meta === 'quantidade_upsells') {
            valorAtual = db.queryGet(
                "SELECT COUNT(*) as total FROM vendas_negocios WHERE responsavel_vendedor = ? AND estagio = 'ativado' AND plano_interesse LIKE '%full%' AND atualizado_em >= ? AND atualizado_em <= ?",
                [meta.vendedor, mesInicio, mesFim]
            ).total;
        } else if (meta.tipo_meta === 'valor_contratos') {
            valorAtual = db.queryGet(
                "SELECT COALESCE(SUM(valor_estimado),0) as total FROM vendas_negocios WHERE responsavel_vendedor = ? AND estagio = 'ativado' AND atualizado_em >= ? AND atualizado_em <= ?",
                [meta.vendedor, mesInicio, mesFim]
            ).total;
        }
        meta.valor_atual = valorAtual;
        meta.percentual_atingido = meta.valor_alvo > 0 ? (valorAtual / meta.valor_alvo) * 100 : 0;
        meta.comissao_calculada =
            meta.percentual_atingido >= 100 && meta.percentual_comissao > 0
                ? (valorAtual * meta.percentual_comissao) / 100
                : 0;
    });

    // Performance comparativo: media da equipe
    const mediaEquipe = db.queryGet(
        `
        SELECT
            AVG(sub.ativacoes) as media_ativacoes,
            AVG(sub.conversao) as media_conversao,
            AVG(sub.pipeline) as media_pipeline
        FROM (
            SELECT responsavel_vendedor,
                SUM(CASE WHEN estagio = 'ativado' AND atualizado_em >= ? AND atualizado_em <= ? THEN 1 ELSE 0 END) as ativacoes,
                CASE WHEN COUNT(*) > 0 THEN (SUM(CASE WHEN estagio = 'ativado' THEN 1 ELSE 0 END) * 100.0 / COUNT(*)) ELSE 0 END as conversao,
                SUM(CASE WHEN estagio NOT IN ('ativado','perdido') THEN valor_estimado ELSE 0 END) as pipeline
            FROM vendas_negocios GROUP BY responsavel_vendedor
        ) sub
    `,
        [mesInicio, mesFim]
    );

    // Tempo medio de fechamento (dias entre criado_em e atualizado_em para ativados)
    const tempoMedio = db.queryGet(
        `
        SELECT AVG(julianday(atualizado_em) - julianday(criado_em)) as dias
        FROM vendas_negocios WHERE responsavel_vendedor = ? AND estagio = 'ativado'
    `,
        [vendedor]
    );

    // Negocios perdidos no mes
    const perdidosMes = db.queryGet(
        "SELECT COUNT(*) as total FROM vendas_negocios WHERE responsavel_vendedor = ? AND estagio = 'perdido' AND atualizado_em >= ? AND atualizado_em <= ?",
        [vendedor, mesInicio, mesFim]
    ).total;

    // Follow-ups pendentes (negocios parados)
    const negociosParados = db.queryAll(
        `
        SELECT n.*, p.nome as provedor_nome,
            CAST(julianday('now','localtime') - julianday(n.atualizado_em) AS INTEGER) as dias_parado
        FROM vendas_negocios n LEFT JOIN provedores p ON n.provedor_id = p.id
        WHERE n.responsavel_vendedor = ? AND n.estagio NOT IN ('ativado','perdido')
        AND julianday('now','localtime') - julianday(n.atualizado_em) >= 7
        ORDER BY dias_parado DESC LIMIT 10
    `,
        [vendedor]
    );

    const performance = {
        media_equipe_ativacoes: Math.round((mediaEquipe?.media_ativacoes || 0) * 10) / 10,
        media_equipe_conversao: Math.round((mediaEquipe?.media_conversao || 0) * 10) / 10,
        media_equipe_pipeline: Math.round((mediaEquipe?.media_pipeline || 0) * 100) / 100,
        tempo_medio_fechamento: Math.round((tempoMedio?.dias || 0) * 10) / 10,
        perdidos_mes: perdidosMes,
        negocios_parados: negociosParados
    };

    res.json({
        stats,
        valor_pipeline: valorPipeline,
        taxa_conversao: taxaConversao,
        negocios_por_estagio: negociosPorEstagio,
        ativacoes_por_mes: ativacoesPorMes,
        proximas_tarefas: proximasTarefas,
        metas,
        performance
    });
});

app.get('/api/vendas/ranking', (req, res) => {
    const db = getDB();
    const periodo = req.query.periodo || new Date().toISOString().substring(0, 7);
    const vendedores = db.queryAll(
        `
        SELECT responsavel_vendedor as nome,
            COUNT(*) as total_negocios,
            SUM(CASE WHEN estagio = 'ativado' AND strftime('%Y-%m', atualizado_em) = ? THEN 1 ELSE 0 END) as ativacoes_mes,
            SUM(CASE WHEN estagio NOT IN ('ativado','perdido') THEN valor_estimado ELSE 0 END) as valor_pipeline
        FROM vendas_negocios
        GROUP BY responsavel_vendedor
        ORDER BY ativacoes_mes DESC, valor_pipeline DESC
    `,
        [periodo]
    );

    // Add foto_url for each vendedor
    vendedores.forEach((v) => {
        const user = db.queryGet('SELECT foto_url FROM usuarios WHERE nome = ?', [v.nome]);
        v.foto_url = user?.foto_url || null;
    });

    // Add meta progress
    vendedores.forEach((v) => {
        const meta = db.queryGet(
            'SELECT valor_alvo FROM vendas_metas WHERE vendedor = ? AND tipo_meta = ? AND periodo_referencia = ?',
            [v.nome, 'quantidade_ativacoes', periodo]
        );
        v.meta_ativacoes = meta?.valor_alvo || 0;
        v.percentual_meta = v.meta_ativacoes > 0 ? Math.round((v.ativacoes_mes / v.meta_ativacoes) * 100) : 0;
    });

    res.json(vendedores);
});

// ==================== API: PROPOSTAS + FORMULARIOS ====================

// Helper: desenhar logo "zapping" com gradiente simulado no PDF
function desenharLogoZapping(doc, x, y, fontSize, opts = {}) {
    const spacing = opts.spacing || Math.round(fontSize * 0.12);
    const letras = [
        { char: 'z', cor: '#D93B63' },
        { char: 'a', cor: '#DE5555' },
        { char: 'p', cor: '#E26E47' },
        { char: 'p', cor: '#E6883A' },
        { char: 'i', cor: '#EAA02E' },
        { char: 'n', cor: '#EEB824' },
        { char: 'g', cor: '#F2CC1A' }
    ];
    doc.font('Helvetica-Bold').fontSize(fontSize);
    let cx = x;
    letras.forEach((l) => {
        const w = doc.widthOfString(l.char);
        doc.fillColor(l.cor).text(l.char, cx, y, { lineBreak: false });
        cx += w + spacing;
    });
    return cx - x - spacing;
}

// Helper: calcular largura total da logo para centralizar
function larguraLogoZapping(doc, fontSize, spacing) {
    const sp = spacing || Math.round(fontSize * 0.12);
    doc.font('Helvetica-Bold').fontSize(fontSize);
    const chars = ['z', 'a', 'p', 'p', 'i', 'n', 'g'];
    let total = 0;
    chars.forEach((c, i) => {
        total += doc.widthOfString(c);
        if (i < chars.length - 1) total += sp;
    });
    return total;
}

// Helper: desenhar retangulo arredondado
function drawRoundedRect(doc, x, y, w, h, r) {
    doc.moveTo(x + r, y)
        .lineTo(x + w - r, y)
        .quadraticCurveTo(x + w, y, x + w, y + r)
        .lineTo(x + w, y + h - r)
        .quadraticCurveTo(x + w, y + h, x + w - r, y + h)
        .lineTo(x + r, y + h)
        .quadraticCurveTo(x, y + h, x, y + h - r)
        .lineTo(x, y + r)
        .quadraticCurveTo(x, y, x + r, y);
}

// Helper: linha gradiente simulada (segmentos de cores)
function desenharLinhaGradiente(doc, x, y, width, height) {
    const cores = ['#D93B63', '#DE5555', '#E26E47', '#E6883A', '#EAA02E', '#EEB824', '#F2CC1A'];
    const segW = width / cores.length;
    cores.forEach((cor, i) => {
        doc.rect(x + i * segW, y, segW + 1, height).fill(cor);
    });
}

// Helper: gerar PDF da proposta
async function gerarPropostaPDF(proposta) {
    const dir = path.join(__dirname, 'uploads', 'propostas');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `proposta_${proposta.id}.pdf`);

    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        const pageW = doc.page.width;
        const marginL = 50;
        const marginR = 50;
        const contentW = pageW - marginL - marginR;
        const dataFormatada = proposta.criado_em
            ? new Date(proposta.criado_em).toLocaleDateString('pt-BR')
            : new Date().toLocaleDateString('pt-BR');

        // ========== HEADER ESCURO ==========
        doc.rect(0, 0, pageW, 130).fill('#1E2028');

        // Logo "zapping" centralizada
        const logoFontSize = 38;
        const logoW = larguraLogoZapping(doc, logoFontSize);
        const logoX = (pageW - logoW) / 2;
        desenharLogoZapping(doc, logoX, 28, logoFontSize);

        // Subtitulo
        doc.font('Helvetica').fontSize(11).fillColor('#888888');
        doc.text('PROPOSTA COMERCIAL', marginL, 75, { width: contentW, align: 'center' });

        // Linha gradiente abaixo do header
        desenharLinhaGradiente(doc, 0, 126, pageW, 4);

        // ========== DADOS DA PROPOSTA ==========
        doc.y = 150;

        // Box cinza claro com info da proposta
        const infoBoxY = 150;
        doc.save();
        drawRoundedRect(doc, marginL, infoBoxY, contentW, 80, 8);
        doc.fill('#f8f9fa');
        doc.restore();

        // Coluna esquerda - Provedor
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#999999');
        doc.text('PARA:', marginL + 15, infoBoxY + 12, { lineBreak: false });
        doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a1a2e');
        doc.text(proposta.provedor_nome || 'N/A', marginL + 15, infoBoxY + 25);

        if (proposta.email_destino) {
            doc.font('Helvetica').fontSize(9).fillColor('#666');
            doc.text(proposta.email_destino, marginL + 15, infoBoxY + 44);
        }
        if (proposta.whatsapp_destino) {
            doc.font('Helvetica').fontSize(9).fillColor('#666');
            doc.text(proposta.whatsapp_destino, marginL + 15, infoBoxY + 56);
        }

        // Coluna direita - Proposta info
        const rightCol = pageW - marginR - 160;
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#999999');
        doc.text('PROPOSTA:', rightCol, infoBoxY + 12, { lineBreak: false });
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#FF2D78');
        doc.text(`#${proposta.id}`, rightCol, infoBoxY + 25);
        doc.font('Helvetica').fontSize(9).fillColor('#666');
        doc.text(`Data: ${dataFormatada}`, rightCol, infoBoxY + 42);
        doc.text(`Validade: ${proposta.validade_dias || 30} dias`, rightCol, infoBoxY + 54);

        // Titulo da proposta
        doc.y = infoBoxY + 100;
        doc.font('Helvetica-Bold').fontSize(16).fillColor('#1a1a2e');
        doc.text(proposta.titulo || 'Proposta Comercial', marginL, doc.y, { width: contentW, align: 'center' });
        doc.moveDown(1.2);

        // ========== PLANOS E SERVICOS ==========
        let planos = [];
        try {
            planos = JSON.parse(proposta.planos || '[]');
        } catch {}

        if (planos.length > 0) {
            // Titulo da secao com icone
            const secY = doc.y;
            desenharLinhaGradiente(doc, marginL, secY, 4, 20);
            doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a1a2e');
            doc.text('  Planos e Servicos', marginL + 8, secY + 3);
            doc.moveDown(0.8);

            // Cabecalho da tabela
            const tblX = marginL;
            const tblW = contentW;
            let tblY = doc.y;

            doc.rect(tblX, tblY, tblW, 28).fill('#1a1a2e');
            doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff');
            doc.text('PLANO / SERVICO', tblX + 15, tblY + 9, { lineBreak: false });
            doc.text('VALOR', tblX + tblW - 120, tblY + 9, { width: 105, align: 'right' });
            tblY += 28;

            // Linhas dos planos
            planos.forEach((p, i) => {
                const rowH = 32;
                const bgColor = i % 2 === 0 ? '#ffffff' : '#f8f9fa';
                doc.rect(tblX, tblY, tblW, rowH).fill(bgColor);

                // Bolinha colorida
                const dotColors = ['#D93B63', '#E26E47', '#F2CC1A', '#22c55e', '#38bdf8', '#a855f7'];
                doc.circle(tblX + 15, tblY + rowH / 2, 4).fill(dotColors[i % dotColors.length]);

                // Nome do plano
                doc.font('Helvetica-Bold').fontSize(10).fillColor('#333333');
                doc.text(p.nome, tblX + 28, tblY + 6, { lineBreak: false });
                if (p.descricao) {
                    doc.font('Helvetica').fontSize(8).fillColor('#999');
                    doc.text(p.descricao, tblX + 28, tblY + 19, { lineBreak: false });
                }

                // Preco
                const precoText = `R$ ${Number(p.preco || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                doc.font('Helvetica-Bold').fontSize(11).fillColor('#198754');
                doc.text(precoText, tblX + tblW - 120, tblY + 9, { width: 105, align: 'right' });

                tblY += rowH;
            });

            // Borda inferior da tabela
            doc.rect(tblX, tblY, tblW, 1).fill('#e0e0e0');
            tblY += 8;

            // Valor total - box destacado
            doc.save();
            drawRoundedRect(doc, tblX + tblW - 220, tblY, 220, 38, 6);
            doc.fill('#1a1a2e');
            doc.restore();

            doc.font('Helvetica').fontSize(10).fillColor('#cccccc');
            doc.text('VALOR TOTAL', tblX + tblW - 210, tblY + 7, { lineBreak: false });

            const totalText = `R$ ${Number(proposta.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            doc.font('Helvetica-Bold').fontSize(16).fillColor('#F2CC1A');
            doc.text(totalText, tblX + tblW - 210, tblY + 7, { width: 195, align: 'right' });

            doc.y = tblY + 55;
        }

        // ========== CONDICOES COMERCIAIS ==========
        if (proposta.condicoes) {
            const secY2 = doc.y;
            desenharLinhaGradiente(doc, marginL, secY2, 4, 20);
            doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a1a2e');
            doc.text('  Condicoes Comerciais', marginL + 8, secY2 + 3);
            doc.moveDown(0.6);

            // Box de condicoes
            const condY = doc.y;
            const condLines = proposta.condicoes.split('\n');
            const condH = Math.max(50, condLines.length * 16 + 24);
            doc.save();
            drawRoundedRect(doc, marginL, condY, contentW, condH, 6);
            doc.fillAndStroke('#fefefe', '#e9ecef');
            doc.restore();

            doc.font('Helvetica').fontSize(10).fillColor('#444444');
            doc.text(proposta.condicoes, marginL + 15, condY + 12, {
                width: contentW - 30,
                lineGap: 4
            });
            doc.y = condY + condH + 15;
        }

        // ========== RODAPE ==========
        const bottomY = doc.page.height - 65;

        // Linha gradiente no rodape
        desenharLinhaGradiente(doc, 0, bottomY, pageW, 3);

        // Rodape escuro
        doc.rect(0, bottomY + 3, pageW, 62).fill('#1E2028');

        // Logo zapping pequena no rodape
        const footLogoSize = 14;
        const footLogoW = larguraLogoZapping(doc, footLogoSize);
        desenharLogoZapping(doc, (pageW - footLogoW) / 2, bottomY + 12, footLogoSize);

        // Info gerada por
        doc.font('Helvetica').fontSize(8).fillColor('#666666');
        doc.text(
            `Proposta gerada em ${new Date().toLocaleDateString('pt-BR')} as ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} por ${proposta.criado_por || 'Sistema'}`,
            marginL,
            bottomY + 32,
            { width: contentW, align: 'center' }
        );

        doc.end();
        stream.on('finish', () => resolve(filePath));
        stream.on('error', reject);
    });
}

async function gerarContratoPDF(contrato) {
    const dir = path.join(__dirname, 'uploads', 'contratos');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `contrato_${contrato.id}.pdf`);

    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        const pageW = doc.page.width;
        const marginL = 50;
        const marginR = 50;
        const contentW = pageW - marginL - marginR;
        const dataFormatada = contrato.criado_em
            ? new Date(contrato.criado_em).toLocaleDateString('pt-BR')
            : new Date().toLocaleDateString('pt-BR');

        // Header
        doc.rect(0, 0, pageW, 120).fill('#1E2028');
        const logoFontSize = 36;
        const logoW = larguraLogoZapping(doc, logoFontSize);
        desenharLogoZapping(doc, (pageW - logoW) / 2, 25, logoFontSize);
        doc.font('Helvetica').fontSize(11).fillColor('#888888');
        doc.text('CONTRATO DE PRESTACAO DE SERVICOS', marginL, 70, { width: contentW, align: 'center' });
        desenharLinhaGradiente(doc, 0, 116, pageW, 4);

        // Info box
        doc.y = 140;
        drawRoundedRect(doc, marginL, 140, contentW, 70, 8);
        doc.fill('#f8f9fa');
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#999');
        doc.text('CONTRATANTE:', marginL + 15, 152);
        doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a1a2e');
        doc.text(contrato.provedor_nome || 'N/A', marginL + 15, 165);
        if (contrato.numero_contrato) {
            doc.font('Helvetica').fontSize(9).fillColor('#666');
            doc.text(`Contrato: ${contrato.numero_contrato}`, marginL + 15, 182);
        }

        const rightCol = pageW - marginR - 160;
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#999');
        doc.text('CONTRATO:', rightCol, 152);
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#FF2D78');
        doc.text(`#${contrato.id}`, rightCol, 165);
        doc.font('Helvetica').fontSize(9).fillColor('#666');
        doc.text(`Data: ${dataFormatada}`, rightCol, 182);

        // Titulo
        doc.y = 230;
        doc.font('Helvetica-Bold').fontSize(15).fillColor('#1a1a2e');
        doc.text(contrato.titulo, marginL, doc.y, { width: contentW, align: 'center' });
        doc.moveDown(1);

        // Valores
        if (contrato.valor_mensal || contrato.valor_total) {
            const valY = doc.y;
            drawRoundedRect(doc, marginL, valY, contentW, 45, 6);
            doc.fillAndStroke('#f0fdf4', '#bbf7d0');
            doc.font('Helvetica').fontSize(9).fillColor('#666');
            if (contrato.valor_mensal) {
                doc.text('Valor Mensal:', marginL + 15, valY + 10);
                doc.font('Helvetica-Bold').fontSize(14).fillColor('#198754');
                doc.text(
                    `R$ ${Number(contrato.valor_mensal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                    marginL + 15,
                    valY + 23
                );
            }
            if (contrato.valor_total) {
                doc.font('Helvetica').fontSize(9).fillColor('#666');
                doc.text('Valor Total:', rightCol, valY + 10);
                doc.font('Helvetica-Bold').fontSize(14).fillColor('#198754');
                doc.text(
                    `R$ ${Number(contrato.valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                    rightCol,
                    valY + 23
                );
            }
            doc.y = valY + 60;
        }

        // Vigencia
        if (contrato.data_inicio || contrato.data_fim) {
            doc.font('Helvetica').fontSize(9).fillColor('#999');
            const vigencia = [];
            if (contrato.data_inicio)
                vigencia.push(`Inicio: ${new Date(contrato.data_inicio).toLocaleDateString('pt-BR')}`);
            if (contrato.data_fim) vigencia.push(`Fim: ${new Date(contrato.data_fim).toLocaleDateString('pt-BR')}`);
            doc.text(vigencia.join('  |  '), marginL, doc.y, { width: contentW, align: 'center' });
            doc.moveDown(1);
        }

        // Conteudo do contrato
        if (contrato.conteudo) {
            const secY = doc.y;
            desenharLinhaGradiente(doc, marginL, secY, 4, 20);
            doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a1a2e');
            doc.text('  Termos e Condicoes', marginL + 8, secY + 3);
            doc.moveDown(0.6);
            doc.font('Helvetica').fontSize(10).fillColor('#444');
            doc.text(contrato.conteudo, marginL + 10, doc.y, { width: contentW - 20, lineGap: 4 });
            doc.moveDown(1.5);
        }

        // Assinatura
        if (contrato.assinatura_nome) {
            const sigY = doc.y;
            doc.font('Helvetica-Bold').fontSize(11).fillColor('#1a1a2e');
            doc.text('ACEITE DIGITAL', marginL, sigY, { width: contentW, align: 'center' });
            doc.moveDown(0.5);
            drawRoundedRect(doc, marginL + 80, doc.y, contentW - 160, 50, 6);
            doc.fillAndStroke('#f8f9fa', '#dee2e6');
            doc.font('Helvetica-Bold').fontSize(12).fillColor('#1a1a2e');
            doc.text(contrato.assinatura_nome, marginL + 80, doc.y + 10, { width: contentW - 160, align: 'center' });
            doc.font('Helvetica').fontSize(8).fillColor('#999');
            const assData = contrato.assinado_em ? new Date(contrato.assinado_em).toLocaleString('pt-BR') : '';
            doc.text(`Assinado em: ${assData} | IP: ${contrato.assinatura_ip || 'N/A'}`, marginL + 80, doc.y + 30, {
                width: contentW - 160,
                align: 'center'
            });
        }

        // Rodape
        const bottomY = doc.page.height - 55;
        desenharLinhaGradiente(doc, 0, bottomY, pageW, 3);
        doc.rect(0, bottomY + 3, pageW, 52).fill('#1E2028');
        doc.font('Helvetica').fontSize(7).fillColor('#666');
        doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')} | Contrato #${contrato.id}`, marginL, bottomY + 18, {
            width: contentW,
            align: 'center'
        });

        doc.end();
        stream.on('finish', () => resolve(`uploads/contratos/contrato_${contrato.id}.pdf`));
        stream.on('error', reject);
    });
}

// Helper: enviar email
async function enviarEmailProposta(
    proposta,
    emailDestino,
    mensagemExtra,
    incluirFormulario,
    formularioUrl,
    incluirPDF = true
) {
    const db = getDB();
    const config = db.queryGet('SELECT * FROM config_email WHERE ativo = 1');
    if (!config || !config.smtp_user)
        throw new Error('Email nao configurado. Configure em Vendas > Propostas > Config Email.');

    const smtpPort = config.smtp_port || 587;
    const transporter = nodemailer.createTransport({
        host: config.smtp_host || 'smtp.gmail.com',
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: config.smtp_user, pass: config.smtp_pass },
        tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' }
    });

    let planos = [];
    try {
        planos = JSON.parse(proposta.planos || '[]');
    } catch {}

    let htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
            <div style="text-align:center;padding:20px 0;border-bottom:3px solid #FF2D78">
                <h1 style="color:#FF2D78;margin:0">Proposta Comercial</h1>
                <p style="color:#666;margin:5px 0">Zapping TV</p>
            </div>
            <div style="padding:20px 0">
                <h2 style="color:#1a1a2e">${proposta.titulo}</h2>
                <p>Olá <strong>${proposta.provedor_nome}</strong>,</p>
                ${mensagemExtra ? `<p>${mensagemExtra}</p>` : '<p>Segue nossa proposta comercial em anexo.</p>'}
            </div>`;

    if (planos.length > 0) {
        htmlBody += `<table style="width:100%;border-collapse:collapse;margin:15px 0">
            <tr style="background:#FF2D78;color:#fff"><th style="padding:10px;text-align:left">Plano</th><th style="padding:10px;text-align:right">Valor</th></tr>`;
        planos.forEach((p) => {
            htmlBody += `<tr style="border-bottom:1px solid #eee"><td style="padding:8px">${p.nome}</td><td style="padding:8px;text-align:right;color:#198754">R$ ${Number(p.preco || 0).toFixed(2)}</td></tr>`;
        });
        htmlBody += `<tr style="background:#f8f9fa;font-weight:bold"><td style="padding:10px">Total</td><td style="padding:10px;text-align:right;color:#198754">R$ ${Number(proposta.valor_total || 0).toFixed(2)}</td></tr></table>`;
    }

    if (incluirFormulario && formularioUrl) {
        htmlBody += `<div style="text-align:center;padding:20px;margin:15px 0;background:#f0f8ff;border-radius:8px">
            <p style="margin:0 0 10px">Para prosseguir, preencha o formulario de cadastro:</p>
            <a href="${formularioUrl}" style="display:inline-block;background:#FF2D78;color:#fff;padding:12px 30px;border-radius:6px;text-decoration:none;font-weight:bold">Preencher Cadastro</a>
        </div>`;
    }

    htmlBody += `<div style="text-align:center;padding:15px 0;border-top:1px solid #eee;color:#999;font-size:12px">
            <p>Validade: ${proposta.validade_dias || 30} dias | Vendedor: ${proposta.criado_por}</p>
        </div></div>`;

    const attachments = [];
    if (incluirPDF && proposta.pdf_caminho && fs.existsSync(proposta.pdf_caminho)) {
        attachments.push({
            filename: `Proposta_${proposta.provedor_nome.replace(/\s+/g, '_')}.pdf`,
            path: proposta.pdf_caminho
        });
    }

    await transporter.sendMail({
        from: `"${config.nome_remetente || 'Nexus'}" <${config.smtp_user}>`,
        to: emailDestino,
        subject: `Proposta Comercial - ${proposta.titulo}`,
        html: htmlBody,
        attachments
    });
}

// --- CRUD Propostas ---

app.get('/api/vendas/propostas', (req, res) => {
    const db = getDB();
    const vendedor = filtrarPorVendedor(req);
    let sql = 'SELECT * FROM vendas_propostas';
    const params = [];
    const conditions = [];
    if (vendedor) {
        conditions.push('criado_por = ?');
        params.push(vendedor);
    }
    if (req.query.status) {
        conditions.push('status = ?');
        params.push(req.query.status);
    }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY criado_em DESC';
    res.json(db.queryAll(sql, params));
});

app.get('/api/vendas/propostas/:id', (req, res) => {
    const db = getDB();
    const p = db.queryGet('SELECT * FROM vendas_propostas WHERE id = ?', [req.params.id]);
    if (!p) return res.status(404).json({ erro: 'Proposta nao encontrada' });
    // Buscar formulario vinculado
    p.formulario = db.queryGet('SELECT * FROM formularios_cadastro WHERE proposta_id = ?', [p.id]);
    res.json(p);
});

app.post('/api/vendas/propostas', (req, res) => {
    const db = getDB();
    const {
        negocio_id,
        provedor_id,
        provedor_nome,
        titulo,
        planos,
        valor_total,
        condicoes,
        validade_dias,
        email_destino,
        whatsapp_destino
    } = req.body;
    if (!provedor_nome || !titulo) return res.status(400).json({ erro: 'Provedor e titulo obrigatorios' });
    const result = db.queryRun(
        `INSERT INTO vendas_propostas (negocio_id, provedor_id, provedor_nome, titulo, planos, valor_total, condicoes, validade_dias, email_destino, whatsapp_destino, criado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            negocio_id || null,
            provedor_id || null,
            provedor_nome,
            titulo,
            typeof planos === 'string' ? planos : JSON.stringify(planos || []),
            valor_total || 0,
            condicoes || '',
            validade_dias || 30,
            email_destino || '',
            whatsapp_destino || '',
            req.session.usuario.nome
        ]
    );
    const proposta = db.queryGet('SELECT * FROM vendas_propostas WHERE id = ?', [result.lastInsertRowid]);
    res.json(proposta);
});

app.put('/api/vendas/propostas/:id', (req, res) => {
    const db = getDB();
    const {
        provedor_nome,
        titulo,
        planos,
        valor_total,
        condicoes,
        validade_dias,
        email_destino,
        whatsapp_destino,
        status
    } = req.body;
    db.queryRun(
        `UPDATE vendas_propostas SET provedor_nome=?, titulo=?, planos=?, valor_total=?, condicoes=?, validade_dias=?, email_destino=?, whatsapp_destino=?, status=?, atualizado_em=datetime('now','localtime') WHERE id=?`,
        [
            provedor_nome,
            titulo,
            typeof planos === 'string' ? planos : JSON.stringify(planos || []),
            valor_total || 0,
            condicoes || '',
            validade_dias || 30,
            email_destino || '',
            whatsapp_destino || '',
            status || 'rascunho',
            req.params.id
        ]
    );
    res.json(db.queryGet('SELECT * FROM vendas_propostas WHERE id = ?', [req.params.id]));
});

app.delete('/api/vendas/propostas/:id', (req, res) => {
    const db = getDB();
    const p = db.queryGet('SELECT * FROM vendas_propostas WHERE id = ?', [req.params.id]);
    if (p && p.pdf_caminho && fs.existsSync(p.pdf_caminho)) {
        try {
            fs.unlinkSync(p.pdf_caminho);
        } catch {}
    }
    db.queryRun('DELETE FROM vendas_propostas WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
});

// --- Gerar PDF ---

app.post('/api/vendas/propostas/:id/gerar-pdf', async (req, res) => {
    try {
        const db = getDB();
        const proposta = db.queryGet('SELECT * FROM vendas_propostas WHERE id = ?', [req.params.id]);
        if (!proposta) return res.status(404).json({ erro: 'Proposta nao encontrada' });

        const filePath = await gerarPropostaPDF(proposta);
        const pdfToken = proposta.pdf_token || crypto.randomUUID();
        db.queryRun('UPDATE vendas_propostas SET pdf_caminho = ?, pdf_token = ? WHERE id = ?', [
            filePath,
            pdfToken,
            proposta.id
        ]);
        res.json({ ok: true, caminho: filePath, pdf_token: pdfToken });
    } catch (err) {
        handleError(res, err, 'gerar-pdf');
    }
});

app.get('/api/vendas/propostas/:id/download', (req, res) => {
    const db = getDB();
    const p = db.queryGet('SELECT * FROM vendas_propostas WHERE id = ?', [req.params.id]);
    if (!p || !p.pdf_caminho || !fs.existsSync(p.pdf_caminho))
        return res.status(404).json({ erro: 'PDF nao encontrado' });
    res.download(p.pdf_caminho, `Proposta_${p.provedor_nome.replace(/\s+/g, '_')}.pdf`);
});

// --- Enviar WhatsApp ---

app.post('/api/vendas/propostas/:id/enviar-whatsapp', async (req, res) => {
    try {
        const db = getDB();
        const proposta = db.queryGet('SELECT * FROM vendas_propostas WHERE id = ?', [req.params.id]);
        if (!proposta) return res.status(404).json({ erro: 'Proposta nao encontrada' });

        const chatId = req.body.numero || req.body.whatsapp || proposta.whatsapp_destino;
        if (!chatId) return res.status(400).json({ erro: 'Numero WhatsApp nao informado' });
        const whatsappId = chatId.replace(/\D/g, '');

        // Enviar mensagem de texto primeiro
        const mensagem =
            req.body.mensagem || `Olá ${proposta.provedor_nome}! Segue nossa proposta comercial: *${proposta.titulo}*`;
        const rText = await enviarMensagemWhatsApp(whatsappId, mensagem);
        if (rText.status >= 400) {
            console.error('Erro ao enviar texto WhatsApp:', rText.data);
            return res
                .status(500)
                .json({ erro: 'Falha ao enviar mensagem: ' + (rText.data?.message || JSON.stringify(rText.data)) });
        }

        // Enviar link do PDF (se marcado)
        if (req.body.incluir_pdf !== false) {
            let pdfPath = proposta.pdf_caminho;
            if (!pdfPath || !fs.existsSync(pdfPath)) {
                pdfPath = await gerarPropostaPDF(proposta);
                db.queryRun('UPDATE vendas_propostas SET pdf_caminho = ? WHERE id = ?', [pdfPath, proposta.id]);
            }
            // Garantir token publico para download
            let pdfToken = proposta.pdf_token;
            if (!pdfToken) {
                pdfToken = crypto.randomUUID();
                db.queryRun('UPDATE vendas_propostas SET pdf_token = ? WHERE id = ?', [pdfToken, proposta.id]);
            }
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            const pdfUrl = `${baseUrl}/proposta-pdf/${pdfToken}`;
            const rPdf = await enviarMensagemWhatsApp(
                whatsappId,
                `📄 *Proposta Comercial em PDF*\nBaixe aqui: ${pdfUrl}`
            );
            if (rPdf.status >= 400) {
                console.error('Erro ao enviar link PDF WhatsApp:', rPdf.data);
                return res.status(500).json({ erro: 'Falha ao enviar link do PDF' });
            }
        }

        // Enviar link do formulario se solicitado
        if (req.body.incluir_formulario) {
            let form = db.queryGet('SELECT * FROM formularios_cadastro WHERE proposta_id = ?', [proposta.id]);
            if (!form) {
                const token = crypto.randomUUID();
                db.queryRun('INSERT INTO formularios_cadastro (proposta_id, provedor_nome, token) VALUES (?, ?, ?)', [
                    proposta.id,
                    proposta.provedor_nome,
                    token
                ]);
                form = db.queryGet('SELECT * FROM formularios_cadastro WHERE proposta_id = ?', [proposta.id]);
            }
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            const rForm = await enviarMensagemWhatsApp(
                whatsappId,
                `Para prosseguir com a ativacao, preencha o formulario de cadastro:\n${baseUrl}/formulario/${form.token}`
            );
            console.log('[Proposta WhatsApp] Resposta formulario:', rForm.status);
            if (rForm.status >= 400) {
                console.error('Erro ao enviar link formulario:', rForm.data);
            }
        }

        db.queryRun(
            "UPDATE vendas_propostas SET status = 'enviada', enviada_via = CASE WHEN enviada_via IS NULL OR enviada_via = '' THEN 'whatsapp' WHEN enviada_via = 'email' THEN 'ambos' ELSE enviada_via END, whatsapp_destino = ?, atualizado_em = datetime('now','localtime') WHERE id = ?",
            [chatId, proposta.id]
        );
        res.json({ ok: true });
    } catch (err) {
        handleError(res, err, 'enviar-whatsapp');
    }
});

// --- Enviar Email ---

app.post('/api/vendas/propostas/:id/enviar-email', async (req, res) => {
    try {
        const db = getDB();
        const proposta = db.queryGet('SELECT * FROM vendas_propostas WHERE id = ?', [req.params.id]);
        if (!proposta) return res.status(404).json({ erro: 'Proposta nao encontrada' });

        const emailDestino = req.body.email || proposta.email_destino;
        if (!emailDestino) return res.status(400).json({ erro: 'Email destino nao informado' });

        const incluirPDF = req.body.incluir_pdf !== false;

        // Gerar PDF se incluir_pdf
        if (incluirPDF && (!proposta.pdf_caminho || !fs.existsSync(proposta.pdf_caminho))) {
            proposta.pdf_caminho = await gerarPropostaPDF(proposta);
            db.queryRun('UPDATE vendas_propostas SET pdf_caminho = ? WHERE id = ?', [
                proposta.pdf_caminho,
                proposta.id
            ]);
        }

        let formularioUrl = null;
        if (req.body.incluir_formulario) {
            let form = db.queryGet('SELECT * FROM formularios_cadastro WHERE proposta_id = ?', [proposta.id]);
            if (!form) {
                const token = crypto.randomUUID();
                db.queryRun('INSERT INTO formularios_cadastro (proposta_id, provedor_nome, token) VALUES (?, ?, ?)', [
                    proposta.id,
                    proposta.provedor_nome,
                    token
                ]);
                form = db.queryGet('SELECT * FROM formularios_cadastro WHERE proposta_id = ?', [proposta.id]);
            }
            formularioUrl = `${req.protocol}://${req.get('host')}/formulario/${form.token}`;
        }

        await enviarEmailProposta(
            proposta,
            emailDestino,
            req.body.mensagem,
            req.body.incluir_formulario,
            formularioUrl,
            incluirPDF
        );

        db.queryRun(
            "UPDATE vendas_propostas SET status = 'enviada', enviada_via = CASE WHEN enviada_via IS NULL OR enviada_via = '' THEN 'email' WHEN enviada_via = 'whatsapp' THEN 'ambos' ELSE enviada_via END, email_destino = ?, atualizado_em = datetime('now','localtime') WHERE id = ?",
            [emailDestino, proposta.id]
        );
        res.json({ ok: true });
    } catch (err) {
        handleError(res, err, 'enviar-email');
    }
});

// --- Gerar formulario standalone ---

app.post('/api/vendas/propostas/:id/gerar-formulario', (req, res) => {
    const db = getDB();
    const proposta = db.queryGet('SELECT * FROM vendas_propostas WHERE id = ?', [req.params.id]);
    if (!proposta) return res.status(404).json({ erro: 'Proposta nao encontrada' });

    let form = db.queryGet('SELECT * FROM formularios_cadastro WHERE proposta_id = ?', [proposta.id]);
    if (!form) {
        const token = require('crypto').randomUUID();
        db.queryRun('INSERT INTO formularios_cadastro (proposta_id, provedor_nome, token) VALUES (?, ?, ?)', [
            proposta.id,
            proposta.provedor_nome,
            token
        ]);
        form = db.queryGet('SELECT * FROM formularios_cadastro WHERE proposta_id = ?', [proposta.id]);
    }
    res.json({ token: form.token, url: `/formulario/${form.token}` });
});

// (Rotas publicas do formulario movidas para antes da barreira de autenticacao)

app.get('/api/vendas/formularios', (req, res) => {
    const db = getDB();
    const vendedor = filtrarPorVendedor(req);
    let sql = `SELECT f.*, p.titulo as proposta_titulo, p.criado_por FROM formularios_cadastro f
               LEFT JOIN vendas_propostas p ON f.proposta_id = p.id`;
    const params = [];
    if (vendedor) {
        sql += ' WHERE p.criado_por = ?';
        params.push(vendedor);
    }
    sql += ' ORDER BY f.criado_em DESC';
    res.json(db.queryAll(sql, params));
});

app.get('/api/vendas/formularios/:id', (req, res) => {
    const db = getDB();
    const form = db.queryGet('SELECT * FROM formularios_cadastro WHERE id = ?', [Number(req.params.id)]);
    if (!form) return res.status(404).json({ erro: 'Formulario nao encontrado' });
    res.json(form);
});

// --- Config Email ---

app.get('/api/config/email', requireAdmin, (req, res) => {
    const db = getDB();
    const config = db.queryGet('SELECT * FROM config_email LIMIT 1');
    if (config) config.smtp_pass = config.smtp_pass ? '********' : '';
    res.json(config || {});
});

app.put('/api/config/email', requireAdmin, (req, res) => {
    const db = getDB();
    const { smtp_host, smtp_port, smtp_user, smtp_pass, nome_remetente, ativo } = req.body;
    const existing = db.queryGet('SELECT * FROM config_email LIMIT 1');
    if (existing) {
        const passToSave = smtp_pass && smtp_pass !== '********' ? smtp_pass : existing.smtp_pass;
        db.queryRun(
            'UPDATE config_email SET smtp_host=?, smtp_port=?, smtp_user=?, smtp_pass=?, nome_remetente=?, ativo=? WHERE id=?',
            [
                smtp_host || 'smtp.gmail.com',
                smtp_port || 587,
                smtp_user || '',
                passToSave || '',
                nome_remetente || 'Nexus',
                ativo ? 1 : 0,
                existing.id
            ]
        );
    } else {
        db.queryRun(
            'INSERT INTO config_email (smtp_host, smtp_port, smtp_user, smtp_pass, nome_remetente, ativo) VALUES (?,?,?,?,?,?)',
            [
                smtp_host || 'smtp.gmail.com',
                smtp_port || 587,
                smtp_user || '',
                smtp_pass || '',
                nome_remetente || 'Nexus',
                ativo ? 1 : 0
            ]
        );
    }
    res.json({ ok: true });
});

app.post('/api/config/email/testar', requireAdmin, async (req, res) => {
    try {
        const db = getDB();
        const config = db.queryGet('SELECT * FROM config_email LIMIT 1');
        if (!config || !config.smtp_user || !config.smtp_pass)
            return res.status(400).json({ erro: 'Configure email e senha primeiro' });

        const smtpPort2 = config.smtp_port || 587;
        const transporter = nodemailer.createTransport({
            host: config.smtp_host || 'smtp.gmail.com',
            port: smtpPort2,
            secure: smtpPort2 === 465,
            auth: { user: config.smtp_user, pass: config.smtp_pass },
            tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' }
        });
        await transporter.sendMail({
            from: `"${config.nome_remetente}" <${config.smtp_user}>`,
            to: config.smtp_user,
            subject: 'Teste - Nexus',
            html: '<h2>Email configurado com sucesso!</h2><p>Este e um email de teste do sistema Nexus.</p>'
        });
        res.json({ ok: true, mensagem: 'Email de teste enviado para ' + config.smtp_user });
    } catch (err) {
        handleError(res, err, 'enviar-formulario');
    }
});

// ==================== API: DASHBOARD DE VENDAS (RELATORIOS) ====================

app.get('/api/vendas/dashboard', (req, res) => {
    const db = getDB();
    const vendedor = filtrarPorVendedor(req);
    const mesAtual = new Date().toISOString().substring(0, 7);
    const mesInicio = mesAtual + '-01';
    const mesFim = mesAtual + '-31 23:59:59';

    const vFilter = vendedor ? ' AND responsavel_vendedor = ?' : '';
    const vParams = vendedor ? [vendedor] : [];
    const pFilter = vendedor ? ' AND criado_por = ?' : '';

    // KPIs gerais
    const totalNegocios = db.queryGet(
        `SELECT COUNT(*) as total FROM vendas_negocios WHERE 1=1${vFilter}`,
        vParams
    ).total;
    const totalAtivados = db.queryGet(
        `SELECT COUNT(*) as total FROM vendas_negocios WHERE estagio = 'ativado'${vFilter}`,
        vParams
    ).total;
    const totalPerdidos = db.queryGet(
        `SELECT COUNT(*) as total FROM vendas_negocios WHERE estagio = 'perdido'${vFilter}`,
        vParams
    ).total;
    const taxaConversao = totalNegocios > 0 ? ((totalAtivados / totalNegocios) * 100).toFixed(1) : 0;
    const valorPipeline = db.queryGet(
        `SELECT COALESCE(SUM(valor_estimado),0) as total FROM vendas_negocios WHERE estagio NOT IN ('ativado','perdido')${vFilter}`,
        vParams
    ).total;

    // Ativacoes e perdas do mes
    const ativacoesMes = db.queryGet(
        `SELECT COUNT(*) as total FROM vendas_negocios WHERE estagio = 'ativado' AND atualizado_em >= ? AND atualizado_em <= ?${vFilter}`,
        [mesInicio, mesFim, ...vParams]
    ).total;
    const perdasMes = db.queryGet(
        `SELECT COUNT(*) as total FROM vendas_negocios WHERE estagio = 'perdido' AND atualizado_em >= ? AND atualizado_em <= ?${vFilter}`,
        [mesInicio, mesFim, ...vParams]
    ).total;

    // Propostas stats
    const totalPropostas = db.queryGet(
        `SELECT COUNT(*) as total FROM vendas_propostas WHERE 1=1${pFilter}`,
        vParams
    ).total;
    const propostasEnviadas = db.queryGet(
        `SELECT COUNT(*) as total FROM vendas_propostas WHERE status = 'enviada'${pFilter}`,
        vParams
    ).total;
    const propostasAceitas = db.queryGet(
        `SELECT COUNT(*) as total FROM vendas_propostas WHERE status = 'aceita'${pFilter}`,
        vParams
    ).total;
    const propostasRecusadas = db.queryGet(
        `SELECT COUNT(*) as total FROM vendas_propostas WHERE status = 'recusada'${pFilter}`,
        vParams
    ).total;

    // Funil de conversao (negocios por estagio)
    const funil = db.queryAll(
        `SELECT estagio, COUNT(*) as total, COALESCE(SUM(valor_estimado),0) as valor FROM vendas_negocios WHERE 1=1${vFilter} GROUP BY estagio`,
        vParams
    );

    // Ativacoes por mes (ultimos 6 meses)
    const ativacoesPorMes = db.queryAll(
        `SELECT strftime('%Y-%m', atualizado_em) as mes, COUNT(*) as total FROM vendas_negocios WHERE estagio = 'ativado' AND atualizado_em >= date('now','-6 months')${vFilter} GROUP BY mes ORDER BY mes`,
        vParams
    );

    // Ranking vendedores (top 10)
    const rankingVendedores = db.queryAll(
        `SELECT responsavel_vendedor as vendedor, COUNT(*) as total_negocios, SUM(CASE WHEN estagio = 'ativado' THEN 1 ELSE 0 END) as ativacoes, COALESCE(SUM(CASE WHEN estagio = 'ativado' THEN valor_estimado ELSE 0 END),0) as valor_ativado FROM vendas_negocios GROUP BY responsavel_vendedor ORDER BY ativacoes DESC LIMIT 10`
    );

    // Negocios por origem
    const porOrigem = db.queryAll(
        `SELECT COALESCE(origem, 'Sem origem') as origem, COUNT(*) as total FROM vendas_negocios WHERE 1=1${vFilter} GROUP BY origem ORDER BY total DESC`,
        vParams
    );

    // Visitas do mes
    const visitasMes = db.queryGet(
        `SELECT COUNT(*) as total FROM vendas_visitas WHERE data_visita >= ? AND data_visita <= ?${vendedor ? ' AND responsavel = ?' : ''}`,
        [mesInicio, mesAtual + '-31', ...vParams]
    ).total;

    res.json({
        kpis: {
            totalNegocios,
            totalAtivados,
            totalPerdidos,
            taxaConversao,
            valorPipeline,
            ativacoesMes,
            perdasMes,
            visitasMes
        },
        propostas: {
            total: totalPropostas,
            enviadas: propostasEnviadas,
            aceitas: propostasAceitas,
            recusadas: propostasRecusadas
        },
        funil,
        ativacoesPorMes,
        rankingVendedores,
        porOrigem
    });
});

// ==================== API: HISTORICO DE INTERACOES POR PROVEDOR ====================

app.get('/api/vendas/historico-provedor/:provedor_id', (req, res) => {
    const db = getDB();
    const pid = Number(req.params.provedor_id);
    const provedor = db.queryGet('SELECT * FROM provedores WHERE id = ?', [pid]);
    if (!provedor) return res.status(404).json({ erro: 'Provedor nao encontrado' });

    const eventos = [];

    // Negocios
    const negocios = db.queryAll('SELECT * FROM vendas_negocios WHERE provedor_id = ? ORDER BY criado_em DESC', [pid]);
    negocios.forEach((n) => {
        eventos.push({
            tipo: 'negocio',
            icone: 'bi-funnel',
            cor: '#0d6efd',
            titulo: `Negocio: ${n.provedor_nome_lead || 'Pipeline'}`,
            descricao: `Estagio: ${n.estagio} | Valor: R$ ${(n.valor_estimado || 0).toFixed(2)}`,
            data: n.criado_em,
            responsavel: n.responsavel_vendedor,
            id: n.id
        });
    });

    // Interacoes dos negocios
    const negocioIds = negocios.map((n) => n.id);
    if (negocioIds.length > 0) {
        const interacoes = db.queryAll(
            `SELECT i.*, n.provedor_nome_lead FROM vendas_interacoes i JOIN vendas_negocios n ON i.negocio_id = n.id WHERE n.provedor_id = ? ORDER BY i.criado_em DESC`,
            [pid]
        );
        interacoes.forEach((i) => {
            eventos.push({
                tipo: 'interacao',
                icone: 'bi-chat-dots',
                cor: '#6c757d',
                titulo: `${i.tipo}: ${i.descricao.substring(0, 80)}`,
                descricao: `Negocio: ${i.provedor_nome_lead || '#' + i.negocio_id}`,
                data: i.criado_em,
                responsavel: i.criado_por,
                id: i.id
            });
        });
    }

    // Propostas
    const propostas = db.queryAll(
        'SELECT * FROM vendas_propostas WHERE provedor_id = ? OR provedor_nome = ? ORDER BY criado_em DESC',
        [pid, provedor.nome]
    );
    propostas.forEach((p) => {
        eventos.push({
            tipo: 'proposta',
            icone: 'bi-file-earmark-pdf',
            cor: '#D93B63',
            titulo: `Proposta: ${p.titulo}`,
            descricao: `Status: ${p.status} | Valor: R$ ${(p.valor_total || 0).toFixed(2)}${p.enviada_via ? ' | Via: ' + p.enviada_via : ''}`,
            data: p.criado_em,
            responsavel: p.criado_por,
            id: p.id
        });
    });

    // Visitas
    const visitas = db.queryAll('SELECT * FROM vendas_visitas WHERE provedor_id = ? ORDER BY data_visita DESC', [pid]);
    visitas.forEach((v) => {
        eventos.push({
            tipo: 'visita',
            icone: 'bi-geo-alt',
            cor: '#198754',
            titulo: `Visita ${v.tipo_visita}: ${v.status}`,
            descricao: `${v.endereco || ''} ${v.resultado ? '| Resultado: ' + v.resultado : ''}`.trim(),
            data: v.data_visita + (v.hora_visita ? ' ' + v.hora_visita : ''),
            responsavel: v.responsavel,
            id: v.id
        });
    });

    // Tarefas
    const tarefas = db.queryAll('SELECT * FROM vendas_tarefas WHERE provedor_id = ? ORDER BY data_hora DESC', [pid]);
    tarefas.forEach((t) => {
        eventos.push({
            tipo: 'tarefa',
            icone: 'bi-check2-square',
            cor: '#ffc107',
            titulo: `Tarefa: ${t.titulo}`,
            descricao: `Tipo: ${t.tipo} | Status: ${t.status}`,
            data: t.data_hora,
            responsavel: t.responsavel,
            id: t.id
        });
    });

    // Formularios
    const formularios = db.queryAll(
        'SELECT f.* FROM formularios_cadastro f JOIN vendas_propostas p ON f.proposta_id = p.id WHERE p.provedor_id = ? OR p.provedor_nome = ? ORDER BY f.criado_em DESC',
        [pid, provedor.nome]
    );
    formularios.forEach((f) => {
        eventos.push({
            tipo: 'formulario',
            icone: 'bi-file-text',
            cor: '#0dcaf0',
            titulo: `Formulario: ${f.status}`,
            descricao: f.status === 'preenchido' ? 'Preenchido em ' + (f.preenchido_em || '') : 'Pendente',
            data: f.criado_em,
            responsavel: null,
            id: f.id
        });
    });

    // Ordenar por data desc
    eventos.sort((a, b) => (b.data || '').localeCompare(a.data || ''));

    res.json({ provedor, eventos });
});

// ==================== API: TEMPLATES DE PROPOSTA ====================

app.get('/api/vendas/templates', (req, res) => {
    const db = getDB();
    res.json(db.queryAll('SELECT * FROM vendas_templates_proposta ORDER BY nome'));
});

app.post('/api/vendas/templates', (req, res) => {
    const db = getDB();
    const { nome, planos, condicoes, validade_dias } = req.body;
    if (!nome) return res.status(400).json({ erro: 'Nome do template obrigatorio' });
    const result = db.queryRun(
        'INSERT INTO vendas_templates_proposta (nome, planos, condicoes, validade_dias, criado_por) VALUES (?, ?, ?, ?, ?)',
        [
            nome,
            typeof planos === 'string' ? planos : JSON.stringify(planos || []),
            condicoes || '',
            validade_dias || 30,
            req.session.usuario.nome
        ]
    );
    res.json(db.queryGet('SELECT * FROM vendas_templates_proposta WHERE id = ?', [result.lastInsertRowid]));
});

app.put('/api/vendas/templates/:id', (req, res) => {
    const db = getDB();
    const { nome, planos, condicoes, validade_dias } = req.body;
    db.queryRun('UPDATE vendas_templates_proposta SET nome=?, planos=?, condicoes=?, validade_dias=? WHERE id=?', [
        nome,
        typeof planos === 'string' ? planos : JSON.stringify(planos || []),
        condicoes || '',
        validade_dias || 30,
        Number(req.params.id)
    ]);
    res.json(db.queryGet('SELECT * FROM vendas_templates_proposta WHERE id = ?', [Number(req.params.id)]));
});

app.delete('/api/vendas/templates/:id', (req, res) => {
    const db = getDB();
    db.queryRun('DELETE FROM vendas_templates_proposta WHERE id = ?', [Number(req.params.id)]);
    res.json({ ok: true });
});

// ==================== API: RASTREAMENTO DE PROPOSTA ====================

app.get('/api/vendas/propostas/:id/rastreamento', (req, res) => {
    const db = getDB();
    const proposta = db.queryGet('SELECT id, visualizacoes FROM vendas_propostas WHERE id = ?', [req.params.id]);
    if (!proposta) return res.status(404).json({ erro: 'Proposta nao encontrada' });
    const views = db.queryAll(
        'SELECT * FROM vendas_propostas_views WHERE proposta_id = ? ORDER BY visualizado_em DESC LIMIT 50',
        [req.params.id]
    );
    res.json({ visualizacoes: proposta.visualizacoes || 0, detalhes: views });
});

// ==================== API: CONTRATOS ====================

app.get('/api/vendas/contratos', (req, res) => {
    const db = getDB();
    let sql = `SELECT c.*,
        (SELECT nome FROM provedores WHERE id = c.provedor_id) as provedor_nome_ref
        FROM vendas_contratos c`;
    const params = [];
    if (req.session.usuario.perfil === 'vendedor') {
        sql += ' WHERE c.responsavel = ?';
        params.push(req.session.usuario.nome);
    }
    sql += ' ORDER BY c.criado_em DESC';
    res.json(db.queryAll(sql, params));
});

app.post('/api/vendas/contratos', (req, res) => {
    const db = getDB();
    const {
        negocio_id,
        proposta_id,
        provedor_id,
        provedor_nome,
        numero_contrato,
        titulo,
        conteudo,
        valor_mensal,
        valor_total,
        data_inicio,
        data_fim
    } = req.body;
    if (!titulo || !provedor_nome) return res.status(400).json({ erro: 'Titulo e provedor obrigatorios' });
    const result = db.queryRun(
        `INSERT INTO vendas_contratos (negocio_id, proposta_id, provedor_id, provedor_nome, numero_contrato, titulo, conteudo, valor_mensal, valor_total, data_inicio, data_fim, responsavel)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            negocio_id || null,
            proposta_id || null,
            provedor_id || null,
            provedor_nome,
            numero_contrato || null,
            titulo,
            conteudo || '',
            valor_mensal || 0,
            valor_total || 0,
            data_inicio || null,
            data_fim || null,
            req.session.usuario.nome
        ]
    );
    res.json({ id: result.lastInsertRowid, ok: true });
});

app.put('/api/vendas/contratos/:id', (req, res) => {
    const db = getDB();
    const {
        provedor_nome,
        numero_contrato,
        titulo,
        conteudo,
        valor_mensal,
        valor_total,
        data_inicio,
        data_fim,
        status
    } = req.body;
    db.queryRun(
        `UPDATE vendas_contratos SET provedor_nome=?, numero_contrato=?, titulo=?, conteudo=?, valor_mensal=?, valor_total=?, data_inicio=?, data_fim=?, status=? WHERE id=?`,
        [
            provedor_nome,
            numero_contrato,
            titulo,
            conteudo,
            valor_mensal,
            valor_total,
            data_inicio,
            data_fim,
            status,
            req.params.id
        ]
    );
    res.json({ ok: true });
});

app.delete('/api/vendas/contratos/:id', (req, res) => {
    const db = getDB();
    db.queryRun('DELETE FROM vendas_contratos WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
});

app.post('/api/vendas/contratos/:id/gerar-pdf', async (req, res) => {
    try {
        const db = getDB();
        const contrato = db.queryGet('SELECT * FROM vendas_contratos WHERE id = ?', [req.params.id]);
        if (!contrato) return res.status(404).json({ erro: 'Contrato nao encontrado' });
        const pdfPath = await gerarContratoPDF(contrato);
        db.queryRun('UPDATE vendas_contratos SET pdf_caminho = ? WHERE id = ?', [pdfPath, contrato.id]);
        res.json({ ok: true, pdf: pdfPath });
    } catch (err) {
        handleError(res, err, 'Gerar PDF contrato');
    }
});

app.get('/api/vendas/contratos/:id/download', (req, res) => {
    const db = getDB();
    const contrato = db.queryGet('SELECT pdf_caminho FROM vendas_contratos WHERE id = ?', [req.params.id]);
    if (!contrato || !contrato.pdf_caminho) return res.status(404).json({ erro: 'PDF nao encontrado' });
    const fullPath = path.join(__dirname, contrato.pdf_caminho);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ erro: 'Arquivo nao encontrado' });
    res.download(fullPath);
});

app.post('/api/vendas/contratos/:id/enviar', (req, res) => {
    const db = getDB();
    const contrato = db.queryGet('SELECT * FROM vendas_contratos WHERE id = ?', [req.params.id]);
    if (!contrato) return res.status(404).json({ erro: 'Contrato nao encontrado' });
    const token = crypto.randomBytes(24).toString('hex');
    db.queryRun('UPDATE vendas_contratos SET assinatura_token = ?, status = ? WHERE id = ?', [
        token,
        'enviado',
        contrato.id
    ]);
    const aceiteUrl = `/contrato-aceite/${token}`;
    res.json({ ok: true, url: aceiteUrl, token });
});

// ==================== API: COMISSOES ====================

// Regras de comissao
app.get('/api/vendas/comissoes/regras', requireAdmin, (req, res) => {
    const db = getDB();
    res.json(db.queryAll('SELECT * FROM vendas_comissoes_regras ORDER BY vendedor, tipo'));
});

app.post('/api/vendas/comissoes/regras', requireAdmin, (req, res) => {
    const db = getDB();
    const { vendedor, tipo, percentual, valor_fixo, plano_filtro } = req.body;
    if (!vendedor || !tipo) return res.status(400).json({ erro: 'Vendedor e tipo obrigatorios' });
    const result = db.queryRun(
        'INSERT INTO vendas_comissoes_regras (vendedor, tipo, percentual, valor_fixo, plano_filtro) VALUES (?, ?, ?, ?, ?)',
        [vendedor, tipo, Number(percentual) || 0, Number(valor_fixo) || 0, plano_filtro || null]
    );
    res.json(db.queryGet('SELECT * FROM vendas_comissoes_regras WHERE id = ?', [result.lastInsertRowid]));
});

app.put('/api/vendas/comissoes/regras/:id', requireAdmin, (req, res) => {
    const db = getDB();
    const existing = db.queryGet('SELECT * FROM vendas_comissoes_regras WHERE id = ?', [Number(req.params.id)]);
    if (!existing) return res.status(404).json({ erro: 'Regra nao encontrada' });
    const vendedor = req.body.vendedor !== undefined ? req.body.vendedor : existing.vendedor;
    const tipo = req.body.tipo !== undefined ? req.body.tipo : existing.tipo;
    const percentual = req.body.percentual !== undefined ? Number(req.body.percentual) : existing.percentual;
    const valor_fixo = req.body.valor_fixo !== undefined ? Number(req.body.valor_fixo) : existing.valor_fixo;
    const plano_filtro = req.body.plano_filtro !== undefined ? req.body.plano_filtro : existing.plano_filtro;
    const ativo = req.body.ativo !== undefined ? (req.body.ativo ? 1 : 0) : existing.ativo;
    db.queryRun(
        'UPDATE vendas_comissoes_regras SET vendedor=?, tipo=?, percentual=?, valor_fixo=?, plano_filtro=?, ativo=? WHERE id=?',
        [vendedor, tipo, percentual || 0, valor_fixo || 0, plano_filtro || null, ativo, Number(req.params.id)]
    );
    res.json(db.queryGet('SELECT * FROM vendas_comissoes_regras WHERE id = ?', [Number(req.params.id)]));
});

app.delete('/api/vendas/comissoes/regras/:id', requireAdmin, (req, res) => {
    const db = getDB();
    db.queryRun('DELETE FROM vendas_comissoes_regras WHERE id = ?', [Number(req.params.id)]);
    res.json({ ok: true });
});

// Comissoes calculadas / registradas
app.get('/api/vendas/comissoes', (req, res) => {
    const db = getDB();
    const vendedor = filtrarPorVendedor(req);
    const { periodo } = req.query;
    let sql = 'SELECT * FROM vendas_comissoes';
    const params = [];
    const conditions = [];
    if (vendedor) {
        conditions.push('vendedor = ?');
        params.push(vendedor);
    }
    if (periodo) {
        conditions.push('periodo = ?');
        params.push(periodo);
    }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY criado_em DESC';
    res.json(db.queryAll(sql, params));
});

// Relatorio mensal de comissoes
app.get('/api/vendas/comissoes/relatorio', (req, res) => {
    const db = getDB();
    const periodo = req.query.periodo || new Date().toISOString().substring(0, 7);
    const vendedor = filtrarPorVendedor(req);

    let sql = `SELECT vendedor, COUNT(*) as total_comissoes, COALESCE(SUM(valor_comissao),0) as total_valor, COALESCE(SUM(valor_base),0) as total_base FROM vendas_comissoes WHERE periodo = ?`;
    const params = [periodo];
    if (vendedor) {
        sql += ' AND vendedor = ?';
        params.push(vendedor);
    }
    sql += ' GROUP BY vendedor ORDER BY total_valor DESC';

    const resumo = db.queryAll(sql, params);

    // Totais
    const totalGeral = resumo.reduce((sum, r) => sum + r.total_valor, 0);

    res.json({ periodo, resumo, total_geral: totalGeral });
});

// Calcular comissoes para um periodo (admin gera as comissoes)
app.post('/api/vendas/comissoes/calcular', requireAdmin, (req, res) => {
    const db = getDB();
    const periodo = req.body.periodo || new Date().toISOString().substring(0, 7);
    const mesInicio = periodo + '-01';
    const mesFim = periodo + '-31 23:59:59';

    // Buscar negocios ativados no periodo
    const ativados = db.queryAll(
        `SELECT * FROM vendas_negocios WHERE estagio = 'ativado' AND atualizado_em >= ? AND atualizado_em <= ?`,
        [mesInicio, mesFim]
    );

    let comissoesGeradas = 0;

    for (const negocio of ativados) {
        // Verificar se ja existe comissao para este negocio neste periodo
        const existe = db.queryGet('SELECT id FROM vendas_comissoes WHERE negocio_id = ? AND periodo = ?', [
            negocio.id,
            periodo
        ]);
        if (existe) continue;

        // Buscar regras do vendedor
        const regras = db.queryAll('SELECT * FROM vendas_comissoes_regras WHERE vendedor = ? AND ativo = 1', [
            negocio.responsavel_vendedor
        ]);

        for (const regra of regras) {
            let aplicar = false;
            if (regra.tipo === 'por_ativacao') aplicar = true;
            if (regra.tipo === 'por_valor') aplicar = true;
            if (regra.tipo === 'por_plano' && regra.plano_filtro) {
                aplicar = (negocio.plano_interesse || '').toLowerCase().includes(regra.plano_filtro.toLowerCase());
            }

            if (aplicar) {
                const valorBase = negocio.valor_estimado || 0;
                const valorComissao =
                    regra.tipo === 'por_valor'
                        ? valorBase * (regra.percentual / 100) + (regra.valor_fixo || 0)
                        : regra.valor_fixo || valorBase * (regra.percentual / 100);

                db.queryRun(
                    `INSERT INTO vendas_comissoes (vendedor, negocio_id, descricao, valor_base, percentual, valor_comissao, periodo) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        negocio.responsavel_vendedor,
                        negocio.id,
                        `Ativacao: ${negocio.provedor_nome || negocio.provedor_nome_lead || 'Negocio #' + negocio.id}`,
                        valorBase,
                        regra.percentual,
                        valorComissao,
                        periodo
                    ]
                );
                comissoesGeradas++;
            }
        }
    }

    res.json({ ok: true, periodo, comissoes_geradas: comissoesGeradas });
});

app.patch('/api/vendas/comissoes/:id/status', requireAdmin, (req, res) => {
    const db = getDB();
    db.queryRun('UPDATE vendas_comissoes SET status = ? WHERE id = ?', [
        req.body.status || 'pendente',
        Number(req.params.id)
    ]);
    res.json(db.queryGet('SELECT * FROM vendas_comissoes WHERE id = ?', [Number(req.params.id)]));
});

app.delete('/api/vendas/comissoes/:id', requireAdmin, (req, res) => {
    const db = getDB();
    db.queryRun('DELETE FROM vendas_comissoes WHERE id = ?', [Number(req.params.id)]);
    res.json({ ok: true });
});

// ==================== API: DUPLICAR PROPOSTA ====================

app.post('/api/vendas/propostas/:id/duplicar', (req, res) => {
    const db = getDB();
    const original = db.queryGet('SELECT * FROM vendas_propostas WHERE id = ?', [req.params.id]);
    if (!original) return res.status(404).json({ erro: 'Proposta nao encontrada' });

    const result = db.queryRun(
        `INSERT INTO vendas_propostas (negocio_id, provedor_id, provedor_nome, titulo, planos, valor_total, condicoes, validade_dias, status, email_destino, whatsapp_destino, criado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'rascunho', ?, ?, ?)`,
        [
            original.negocio_id,
            original.provedor_id,
            original.provedor_nome,
            original.titulo + ' (copia)',
            original.planos,
            original.valor_total,
            original.condicoes,
            original.validade_dias,
            original.email_destino,
            original.whatsapp_destino,
            req.session.usuario.nome
        ]
    );
    const nova = db.queryGet('SELECT * FROM vendas_propostas WHERE id = ?', [result.lastInsertRowid]);
    res.json(nova);
});

// ==================== API: FOLLOW-UP AUTOMATICO ====================

app.get('/api/vendas/followup/config', requireAdmin, (req, res) => {
    const db = getDB();
    res.json(db.queryAll('SELECT * FROM vendas_followup_config ORDER BY tipo'));
});

app.put('/api/vendas/followup/config/:id', requireAdmin, (req, res) => {
    const db = getDB();
    const { dias_apos, ativo, mensagem } = req.body;
    db.queryRun('UPDATE vendas_followup_config SET dias_apos = ?, ativo = ?, mensagem = ? WHERE id = ?', [
        dias_apos || 3,
        ativo ? 1 : 0,
        mensagem || '',
        Number(req.params.id)
    ]);
    res.json(db.queryGet('SELECT * FROM vendas_followup_config WHERE id = ?', [Number(req.params.id)]));
});

// Alertas pendentes de follow-up
app.get('/api/vendas/followup/alertas', (req, res) => {
    const db = getDB();
    const vendedor = filtrarPorVendedor(req);
    const alertas = [];

    // 1. Propostas enviadas sem resposta
    const cfgSemResposta = db.queryGet(
        "SELECT * FROM vendas_followup_config WHERE tipo = 'proposta_sem_resposta' AND ativo = 1"
    );
    if (cfgSemResposta) {
        const dias = parseInt(cfgSemResposta.dias_apos, 10) || 3;
        let sql = `SELECT * FROM vendas_propostas WHERE status = 'enviada' AND atualizado_em <= datetime('now','localtime','-' || ? || ' days')`;
        const params = [dias];
        if (vendedor) {
            sql += ' AND criado_por = ?';
            params.push(vendedor);
        }
        const propostas = db.queryAll(sql, params);
        propostas.forEach((p) => {
            alertas.push({
                tipo: 'proposta_sem_resposta',
                icone: 'bi-hourglass-split',
                cor: 'warning',
                titulo: `Proposta sem resposta: ${p.titulo}`,
                descricao: `Enviada para ${p.provedor_nome} ha mais de ${dias} dias`,
                proposta_id: p.id,
                data: p.atualizado_em
            });
        });
    }

    // 2. Propostas expirando
    const cfgExpirando = db.queryGet(
        "SELECT * FROM vendas_followup_config WHERE tipo = 'proposta_expirando' AND ativo = 1"
    );
    if (cfgExpirando) {
        const diasAlerta = parseInt(cfgExpirando.dias_apos, 10) || 5;
        let sql = `SELECT * FROM vendas_propostas WHERE status IN ('enviada','rascunho') AND date(criado_em, '+' || validade_dias || ' days') <= date('now','localtime','+' || ? || ' days') AND date(criado_em, '+' || validade_dias || ' days') >= date('now','localtime')`;
        const params = [diasAlerta];
        if (vendedor) {
            sql += ' AND criado_por = ?';
            params.push(vendedor);
        }
        const propostas = db.queryAll(sql, params);
        propostas.forEach((p) => {
            alertas.push({
                tipo: 'proposta_expirando',
                icone: 'bi-clock-history',
                cor: 'danger',
                titulo: `Proposta expirando: ${p.titulo}`,
                descricao: `Validade: ${p.validade_dias} dias - Provedor: ${p.provedor_nome}`,
                proposta_id: p.id,
                data: p.criado_em
            });
        });
    }

    // 3. Formularios recentemente preenchidos
    const cfgForm = db.queryGet(
        "SELECT * FROM vendas_followup_config WHERE tipo = 'formulario_preenchido' AND ativo = 1"
    );
    if (cfgForm) {
        let sql = `SELECT f.*, p.criado_por FROM formularios_cadastro f LEFT JOIN vendas_propostas p ON f.proposta_id = p.id WHERE f.status = 'preenchido' AND f.preenchido_em >= datetime('now','localtime','-7 days')`;
        const params = [];
        if (vendedor) {
            sql += ' AND p.criado_por = ?';
            params.push(vendedor);
        }
        const forms = db.queryAll(sql, params);
        forms.forEach((f) => {
            alertas.push({
                tipo: 'formulario_preenchido',
                icone: 'bi-file-check',
                cor: 'success',
                titulo: `Formulario preenchido: ${f.provedor_nome}`,
                descricao: `Preenchido em ${f.preenchido_em || ''}`,
                formulario_id: f.id,
                data: f.preenchido_em
            });
        });
    }

    // 4. Negocios parados (sem atualizacao)
    const cfgParado = db.queryGet("SELECT * FROM vendas_followup_config WHERE tipo = 'negocio_parado' AND ativo = 1");
    if (cfgParado) {
        const dias = parseInt(cfgParado.dias_apos, 10) || 7;
        let sql = `SELECT n.*, p.nome as provedor_nome,
            CAST(julianday('now','localtime') - julianday(n.atualizado_em) AS INTEGER) as dias_parado
            FROM vendas_negocios n LEFT JOIN provedores p ON n.provedor_id = p.id
            WHERE n.estagio NOT IN ('ativado','perdido')
            AND julianday('now','localtime') - julianday(n.atualizado_em) >= ?`;
        const params = [dias];
        if (vendedor) {
            sql += ' AND n.responsavel_vendedor = ?';
            params.push(vendedor);
        }
        sql += ' ORDER BY dias_parado DESC';
        const negocios = db.queryAll(sql, params);
        negocios.forEach((n) => {
            alertas.push({
                tipo: 'negocio_parado',
                icone: 'bi-pause-circle',
                cor: 'danger',
                titulo: `Negocio parado: ${n.provedor_nome_lead || n.provedor_nome || 'Lead #' + n.id}`,
                descricao: `Estagio "${n.estagio}" sem movimentacao ha ${n.dias_parado} dias`,
                negocio_id: n.id,
                data: n.atualizado_em
            });
        });
    }

    // 5. Negocios sem nenhuma interacao
    const cfgSemAtiv = db.queryGet(
        "SELECT * FROM vendas_followup_config WHERE tipo = 'negocio_sem_atividade' AND ativo = 1"
    );
    if (cfgSemAtiv) {
        const dias = parseInt(cfgSemAtiv.dias_apos, 10) || 14;
        let sql = `SELECT n.*, p.nome as provedor_nome,
            (SELECT MAX(i.criado_em) FROM vendas_interacoes i WHERE i.negocio_id = n.id) as ultima_interacao
            FROM vendas_negocios n LEFT JOIN provedores p ON n.provedor_id = p.id
            WHERE n.estagio NOT IN ('ativado','perdido')`;
        const params = [];
        if (vendedor) {
            sql += ' AND n.responsavel_vendedor = ?';
            params.push(vendedor);
        }
        const negocios = db.queryAll(sql, params);
        negocios.forEach((n) => {
            const ultimaData = n.ultima_interacao || n.criado_em;
            if (!ultimaData) return;
            const diasSem = Math.floor((Date.now() - new Date(ultimaData.replace(' ', 'T')).getTime()) / 86400000);
            if (diasSem >= dias) {
                alertas.push({
                    tipo: 'negocio_sem_atividade',
                    icone: 'bi-exclamation-diamond',
                    cor: 'warning',
                    titulo: `Sem interacao: ${n.provedor_nome_lead || n.provedor_nome || 'Lead #' + n.id}`,
                    descricao: `Nenhuma interacao ha ${diasSem} dias (estagio: ${n.estagio})`,
                    negocio_id: n.id,
                    data: ultimaData
                });
            }
        });
    }

    alertas.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    res.json(alertas);
});

// ==================== API: FILA DE ATENDIMENTO (config + assumir) ====================

// Config fila de atendimento
app.get('/api/fila-atendimento/config', requireAdmin, (req, res) => {
    const db = getDB();
    res.json(db.queryGet('SELECT * FROM fila_atendimento_config WHERE ativo = 1 ORDER BY id LIMIT 1') || {});
});

app.put('/api/fila-atendimento/config', requireAdmin, (req, res) => {
    const db = getDB();
    const { peso_prioridade, peso_sla, peso_tempo_espera, peso_reaberturas } = req.body;
    const existe = db.queryGet('SELECT id FROM fila_atendimento_config WHERE ativo = 1 ORDER BY id LIMIT 1');
    if (existe) {
        db.queryRun(
            'UPDATE fila_atendimento_config SET peso_prioridade = ?, peso_sla = ?, peso_tempo_espera = ?, peso_reaberturas = ? WHERE id = ?',
            [peso_prioridade || 3, peso_sla || 5, peso_tempo_espera || 2, peso_reaberturas || 1, existe.id]
        );
    } else {
        db.queryRun(
            'INSERT INTO fila_atendimento_config (peso_prioridade, peso_sla, peso_tempo_espera, peso_reaberturas) VALUES (?, ?, ?, ?)',
            [peso_prioridade || 3, peso_sla || 5, peso_tempo_espera || 2, peso_reaberturas || 1]
        );
    }
    res.json(db.queryGet('SELECT * FROM fila_atendimento_config WHERE ativo = 1 ORDER BY id LIMIT 1'));
});

// Assumir chamado da fila
app.post('/api/chamados/:id/assumir', requireAuth, (req, res) => {
    const db = getDB();
    const chamado = db.queryGet('SELECT * FROM chamados WHERE id = ?', [Number(req.params.id)]);
    if (!chamado) return res.status(404).json({ erro: 'Chamado nao encontrado' });
    db.queryRun('UPDATE chamados SET responsavel_id = ?, status = ? WHERE id = ?', [
        req.session.usuario.id,
        chamado.status === 'pendente' ? 'em_andamento' : chamado.status,
        Number(req.params.id)
    ]);
    registrarAtividade(
        req,
        'assumir',
        'chamados',
        Number(req.params.id),
        `Chamado assumido por ${req.session.usuario.nome}`
    );
    res.json(
        db.queryGet(
            'SELECT c.*, p.nome as provedor_nome FROM chamados c JOIN provedores p ON c.provedor_id = p.id WHERE c.id = ?',
            [Number(req.params.id)]
        )
    );
});

// ==================== API: NPS / PESQUISA DE SATISFACAO ====================

// Criar pesquisa NPS ao resolver chamado (chamada internamente ou via API)
app.post('/api/nps/criar', requireAuth, (req, res) => {
    try {
        const db = getDB();
        const { chamado_id } = req.body;
        if (!chamado_id) return res.status(400).json({ erro: 'chamado_id obrigatorio' });
        const chamado = db.queryGet('SELECT * FROM chamados WHERE id = ?', [Number(chamado_id)]);
        if (!chamado) return res.status(404).json({ erro: 'Chamado nao encontrado' });

        // Verificar se ja existe pesquisa
        const existe = db.queryGet('SELECT id FROM nps_pesquisas WHERE chamado_id = ?', [Number(chamado_id)]);
        if (existe) return res.json({ ja_existe: true, id: existe.id });

        const token = crypto.randomBytes(16).toString('hex');
        const result = db.queryRun('INSERT INTO nps_pesquisas (chamado_id, provedor_id, token) VALUES (?, ?, ?)', [
            Number(chamado_id),
            chamado.provedor_id,
            token
        ]);
        registrarAtividade(
            req,
            'criar',
            'nps',
            result.lastInsertRowid,
            `Pesquisa NPS criada para chamado #${chamado_id}`
        );
        res.json({ id: result.lastInsertRowid, token, link: `/api/nps/responder/${token}` });
    } catch (err) {
        handleError(res, err, 'NPS criar');
    }
});

// Pagina publica para responder NPS (sem auth)
app.get('/api/nps/responder/:token', (req, res) => {
    const db = getDB();
    const tokenParam = req.params.token;
    if (!/^[a-f0-9]{32,64}$/.test(tokenParam)) return res.status(400).send('<h2>Token invalido</h2>');
    const pesquisa = db.queryGet(
        `
        SELECT n.*, c.titulo as chamado_titulo, p.nome as provedor_nome
        FROM nps_pesquisas n
        JOIN chamados c ON n.chamado_id = c.id
        JOIN provedores p ON n.provedor_id = p.id
        WHERE n.token = ?
    `,
        [tokenParam]
    );
    if (!pesquisa) return res.status(404).send('<h2>Pesquisa nao encontrada</h2>');
    // Generate nonce for inline script
    const nonce = crypto.randomBytes(16).toString('base64');
    res.setHeader(
        'Content-Security-Policy',
        `default-src 'self'; script-src 'nonce-${nonce}'; style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; font-src 'self' https://cdn.jsdelivr.net data:; img-src 'self' data:;`
    );
    if (pesquisa.respondido)
        return res.send(`
        <!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Obrigado!</title><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet"></head>
        <body class="bg-light"><div class="container py-5"><div class="card mx-auto" style="max-width:500px"><div class="card-body text-center py-5">
        <i class="bi bi-check-circle text-success" style="font-size:4rem"></i>
        <h3 class="mt-3">Obrigado!</h3><p class="text-muted">Sua avaliacao ja foi registrada.</p>
        </div></div></div></body></html>
    `);
    res.send(`
        <!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Avaliacao de Atendimento</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
        <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">
        <style>
            .nps-btn{width:48px;height:48px;border-radius:50%;border:2px solid #dee2e6;display:flex;align-items:center;justify-content:center;cursor:pointer;font-weight:bold;transition:all .2s}
            .nps-btn:hover,.nps-btn.active{transform:scale(1.15);color:#fff}
            .nps-btn[data-v="0"],.nps-btn[data-v="1"],.nps-btn[data-v="2"],.nps-btn[data-v="3"],.nps-btn[data-v="4"],.nps-btn[data-v="5"],.nps-btn[data-v="6"]{border-color:#dc3545}
            .nps-btn[data-v="0"]:hover,.nps-btn[data-v="0"].active,.nps-btn[data-v="1"]:hover,.nps-btn[data-v="1"].active,.nps-btn[data-v="2"]:hover,.nps-btn[data-v="2"].active,.nps-btn[data-v="3"]:hover,.nps-btn[data-v="3"].active,.nps-btn[data-v="4"]:hover,.nps-btn[data-v="4"].active,.nps-btn[data-v="5"]:hover,.nps-btn[data-v="5"].active,.nps-btn[data-v="6"]:hover,.nps-btn[data-v="6"].active{background:#dc3545}
            .nps-btn[data-v="7"],.nps-btn[data-v="8"]{border-color:#ffc107}
            .nps-btn[data-v="7"]:hover,.nps-btn[data-v="7"].active,.nps-btn[data-v="8"]:hover,.nps-btn[data-v="8"].active{background:#ffc107;color:#333}
            .nps-btn[data-v="9"],.nps-btn[data-v="10"]{border-color:#198754}
            .nps-btn[data-v="9"]:hover,.nps-btn[data-v="9"].active,.nps-btn[data-v="10"]:hover,.nps-btn[data-v="10"].active{background:#198754}
        </style></head>
        <body class="bg-light">
        <div class="container py-5"><div class="card mx-auto" style="max-width:600px"><div class="card-body py-4 px-4">
            <div class="text-center mb-4">
                <i class="bi bi-star text-warning" style="font-size:3rem"></i>
                <h4 class="mt-2">Como foi seu atendimento?</h4>
                <p class="text-muted">Chamado: <strong>${escapeHtml(pesquisa.chamado_titulo)}</strong></p>
            </div>
            <form id="npsForm">
                <p class="text-center mb-2">De 0 a 10, qual a probabilidade de voce recomendar nosso servico?</p>
                <div class="d-flex justify-content-center gap-1 flex-wrap mb-2" id="npsButtons">
                    ${Array.from({ length: 11 }, (_, i) => `<div class="nps-btn" data-v="${i}" onclick="selectNPS(${i})">${i}</div>`).join('')}
                </div>
                <div class="d-flex justify-content-between mb-3"><small class="text-danger">Nada provavel</small><small class="text-success">Muito provavel</small></div>
                <div class="mb-3">
                    <label class="form-label">Comentario (opcional)</label>
                    <textarea class="form-control" id="npsComentario" rows="3" placeholder="Conte-nos mais sobre sua experiencia..."></textarea>
                </div>
                <button type="submit" class="btn btn-primary w-100" id="npsSubmit" disabled>Enviar Avaliacao</button>
            </form>
        </div></div></div>
        <script nonce="${nonce}">
            let notaSel = null;
            function selectNPS(v) { notaSel = v; document.querySelectorAll('.nps-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.v) === v)); document.getElementById('npsSubmit').disabled = false; }
            document.getElementById('npsForm').onsubmit = async (e) => {
                e.preventDefault();
                if (notaSel === null) return;
                const btn = document.getElementById('npsSubmit');
                btn.disabled = true; btn.textContent = 'Enviando...';
                try {
                    const r = await fetch('/api/nps/responder/${pesquisa.token}', {
                        method: 'POST', headers: {'Content-Type':'application/json'},
                        body: JSON.stringify({ nota: notaSel, comentario: document.getElementById('npsComentario').value })
                    });
                    if (r.ok) { document.querySelector('.card-body').innerHTML = '<div class="text-center py-5"><i class="bi bi-check-circle text-success" style="font-size:4rem"></i><h3 class="mt-3">Obrigado pela sua avaliacao!</h3><p class="text-muted">Sua opiniao e muito importante para nos.</p></div>'; }
                    else { btn.disabled = false; btn.textContent = 'Enviar Avaliacao'; alert('Erro ao enviar. Tente novamente.'); }
                } catch { btn.disabled = false; btn.textContent = 'Enviar Avaliacao'; alert('Erro de conexao.'); }
            };
        </script></body></html>
    `);
});

// Receber resposta NPS (sem auth)
app.post('/api/nps/responder/:token', (req, res) => {
    try {
        const db = getDB();
        const { nota, comentario } = req.body;
        if (nota === undefined || nota === null || nota < 0 || nota > 10)
            return res.status(400).json({ erro: 'Nota invalida (0-10)' });
        const pesquisa = db.queryGet('SELECT * FROM nps_pesquisas WHERE token = ?', [req.params.token]);
        if (!pesquisa) return res.status(404).json({ erro: 'Pesquisa nao encontrada' });
        if (pesquisa.respondido) return res.status(400).json({ erro: 'Ja respondido' });
        db.queryRun(
            "UPDATE nps_pesquisas SET nota = ?, comentario = ?, respondido = 1, respondido_em = datetime('now','localtime') WHERE token = ?",
            [Number(nota), comentario || null, req.params.token]
        );
        res.json({ sucesso: true });
    } catch (err) {
        handleError(res, err, 'NPS responder');
    }
});

// Dashboard NPS (autenticado)
app.get('/api/nps/dashboard', requireAuth, (req, res) => {
    try {
        const db = getDB();
        const { periodo, provedor_id } = req.query;
        let filtro = ' WHERE n.respondido = 1';
        const params = [];
        if (periodo) {
            filtro += " AND strftime('%Y-%m', n.respondido_em) = ?";
            params.push(periodo);
        }
        if (provedor_id) {
            filtro += ' AND n.provedor_id = ?';
            params.push(Number(provedor_id));
        }

        const respostas = db.queryAll(
            `
            SELECT n.*, c.titulo as chamado_titulo, c.categoria, p.nome as provedor_nome
            FROM nps_pesquisas n
            JOIN chamados c ON n.chamado_id = c.id
            JOIN provedores p ON n.provedor_id = p.id
            ${filtro} ORDER BY n.respondido_em DESC
        `,
            params
        );

        const total = respostas.length;
        if (total === 0)
            return res.json({
                score: null,
                total: 0,
                promotores: 0,
                neutros: 0,
                detratores: 0,
                respostas: [],
                distribuicao: []
            });

        const promotores = respostas.filter((r) => r.nota >= 9).length;
        const neutros = respostas.filter((r) => r.nota >= 7 && r.nota <= 8).length;
        const detratores = respostas.filter((r) => r.nota <= 6).length;
        const score = Math.round(((promotores - detratores) / total) * 100);
        const media = Math.round((respostas.reduce((s, r) => s + r.nota, 0) / total) * 10) / 10;

        // Distribuicao por nota
        const distribuicao = Array.from({ length: 11 }, (_, i) => ({
            nota: i,
            quantidade: respostas.filter((r) => r.nota === i).length
        }));

        // NPS por provedor
        const porProvedor = {};
        respostas.forEach((r) => {
            if (!porProvedor[r.provedor_nome])
                porProvedor[r.provedor_nome] = { total: 0, soma: 0, promotores: 0, detratores: 0 };
            porProvedor[r.provedor_nome].total++;
            porProvedor[r.provedor_nome].soma += r.nota;
            if (r.nota >= 9) porProvedor[r.provedor_nome].promotores++;
            if (r.nota <= 6) porProvedor[r.provedor_nome].detratores++;
        });
        const npsProvedor = Object.entries(porProvedor)
            .map(([nome, d]) => ({
                provedor: nome,
                total: d.total,
                media: Math.round((d.soma / d.total) * 10) / 10,
                score: Math.round(((d.promotores - d.detratores) / d.total) * 100)
            }))
            .sort((a, b) => b.score - a.score);

        // Evolucao mensal
        const porMes = {};
        respostas.forEach((r) => {
            const mes = (r.respondido_em || '').substring(0, 7);
            if (!mes) return;
            if (!porMes[mes]) porMes[mes] = { total: 0, soma: 0, promotores: 0, detratores: 0 };
            porMes[mes].total++;
            porMes[mes].soma += r.nota;
            if (r.nota >= 9) porMes[mes].promotores++;
            if (r.nota <= 6) porMes[mes].detratores++;
        });
        const evolucao = Object.entries(porMes)
            .sort()
            .map(([mes, d]) => ({
                mes,
                score: Math.round(((d.promotores - d.detratores) / d.total) * 100),
                media: Math.round((d.soma / d.total) * 10) / 10,
                total: d.total
            }));

        // Pesquisas pendentes (nao respondidas)
        const pendentes = db.queryGet('SELECT COUNT(*) as total FROM nps_pesquisas WHERE respondido = 0').total;

        res.json({
            score,
            media,
            total,
            promotores,
            neutros,
            detratores,
            distribuicao,
            nps_provedor: npsProvedor,
            evolucao,
            pendentes,
            respostas: respostas.slice(0, 50)
        });
    } catch (err) {
        handleError(res, err, 'NPS dashboard');
    }
});

// Listar pesquisas NPS
app.get('/api/nps', requireAuth, (req, res) => {
    try {
        const db = getDB();
        const respostas = db.queryAll(`
            SELECT n.*, c.titulo as chamado_titulo, p.nome as provedor_nome
            FROM nps_pesquisas n
            JOIN chamados c ON n.chamado_id = c.id
            JOIN provedores p ON n.provedor_id = p.id
            ORDER BY n.criado_em DESC LIMIT 100
        `);
        res.json(respostas);
    } catch (err) {
        handleError(res, err, 'NPS listar');
    }
});

// Enviar pesquisa NPS em massa para chamados resolvidos sem pesquisa
app.post('/api/nps/enviar-massa', requireAdmin, (req, res) => {
    try {
        const db = getDB();
        const chamadosSemNPS = db.queryAll(`
            SELECT c.id, c.provedor_id FROM chamados c
            WHERE c.status IN ('resolvido','fechado')
            AND c.id NOT IN (SELECT chamado_id FROM nps_pesquisas)
            ORDER BY c.data_resolucao DESC LIMIT 50
        `);
        let criadas = 0;
        for (const ch of chamadosSemNPS) {
            const token = crypto.randomBytes(16).toString('hex');
            db.queryRun('INSERT INTO nps_pesquisas (chamado_id, provedor_id, token) VALUES (?, ?, ?)', [
                ch.id,
                ch.provedor_id,
                token
            ]);
            criadas++;
        }
        res.json({ criadas, total_chamados: chamadosSemNPS.length });
    } catch (err) {
        handleError(res, err, 'NPS massa');
    }
});

// ==================== API: WHATSAPP (WAHA ROUTES) ====================

// --- SSE: real-time events ---
app.get('/api/whatsapp/events', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('data: {"type":"connected"}\n\n');
    // Identificar usuario para filtragem futura
    res._userId = req.session?.usuario?.id || null;
    res._userPerfil = req.session?.usuario?.perfil || null;
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
});

// --- Session / Status ---
app.get('/api/whatsapp/status', async (req, res) => {
    try {
        const r = await wahaFetch(`/api/sessions/${WAHA_SESSION}`);
        const status = r.data?.status || 'STOPPED';
        res.json({ status, connected: status === 'WORKING' });
    } catch {
        res.status(503).json({ erro: 'WAHA nao disponivel', status: 'STOPPED' });
    }
});

app.get('/api/whatsapp/qr', async (req, res) => {
    try {
        const r = await wahaFetch(`/api/${WAHA_SESSION}/auth/qr`);
        if (r.buffer) {
            // WAHA retorna imagem direto
            res.set('Content-Type', r.contentType || 'image/png');
            return res.send(r.buffer);
        }
        res.json(r.data || {});
    } catch {
        res.status(503).json({ erro: 'WAHA nao disponivel' });
    }
});

app.post('/api/whatsapp/start', async (req, res) => {
    try {
        let r = await wahaFetch(`/api/sessions/${WAHA_SESSION}/start`, {
            method: 'POST',
            body: JSON.stringify({ name: WAHA_SESSION })
        });
        // Se sessao ja existe (FAILED/etc), parar e reiniciar
        if (r.status === 422) {
            await wahaFetch(`/api/sessions/${WAHA_SESSION}/stop`, { method: 'POST' });
            await new Promise((ok) => setTimeout(ok, 1000));
            r = await wahaFetch(`/api/sessions/${WAHA_SESSION}/start`, {
                method: 'POST',
                body: JSON.stringify({ name: WAHA_SESSION })
            });
        }
        res.json(r.data || { status: 'STARTING' });
    } catch {
        res.status(503).json({ erro: 'WAHA nao disponivel', status: 'STOPPED' });
    }
});

app.post('/api/whatsapp/stop', async (req, res) => {
    try {
        const r = await wahaFetch(`/api/sessions/${WAHA_SESSION}/stop`, { method: 'POST' });
        res.json(r.data || { ok: true });
    } catch {
        res.status(503).json({ erro: 'Erro ao desconectar' });
    }
});

// --- Chats & Messages (com cache server-side) ---
let cachedChats = null;
let cachedChatsTime = 0;

app.get('/api/whatsapp/chats', async (req, res) => {
    try {
        const user = req.session.usuario;
        const isAdmin = user.perfil === 'admin';
        const limit = parseInt(req.query.limit) || 80;
        const now = Date.now();

        // Cache apenas dos dados brutos do WAHA
        let rawChats;
        if (cachedChats && now - cachedChatsTime < 15000) {
            rawChats = cachedChats;
        } else {
            const r = await wahaFetch(
                `/api/${WAHA_SESSION}/chats?limit=${limit}&sortBy=conversationTimestamp&sortOrder=desc`
            );
            const raw = Array.isArray(r.data) ? r.data : [];
            rawChats = raw.map((c) => {
                const chatId = c.id && typeof c.id === 'object' ? c.id._serialized : c.id || '';
                return {
                    id: chatId,
                    name: c.name || c.contact?.name || chatId.split('@')[0],
                    timestamp: c.lastMessage?.timestamp || c.timestamp || 0,
                    unreadCount: c.unreadCount || 0,
                    isGroup: chatId.includes('@g.us'),
                    profileThumbnail: null,
                    lastMessage: c.lastMessage || null
                };
            });
            cachedChats = rawChats;
            cachedChatsTime = now;
        }

        // Anotar cada chat com info de atendimento
        const db = getDB();
        const atendimentos = db.queryAll(
            "SELECT chat_id, id, agente_id, agente_nome, status, criado_em, atribuido_em FROM whatsapp_atendimentos WHERE status IN ('fila','em_atendimento')"
        );
        const atendMap = {};
        atendimentos.forEach((a) => {
            atendMap[a.chat_id] = a;
        });

        let chats = rawChats.map((c) => {
            const atend = atendMap[c.id] || null;
            return {
                ...c,
                atendimento: atend
                    ? {
                          id: atend.id,
                          agente_id: atend.agente_id,
                          agente_nome: atend.agente_nome,
                          status: atend.status,
                          criado_em: atend.criado_em
                      }
                    : null
            };
        });

        // Filtrar para nao-admin: fila + seus atendimentos + grupos
        if (!isAdmin) {
            chats = chats.filter((c) => {
                if (c.isGroup) return true;
                if (!c.atendimento) return false;
                if (c.atendimento.status === 'fila') return true;
                if (c.atendimento.agente_id === user.id) return true;
                return false;
            });
        }

        res.json(chats.slice(0, limit));
    } catch (e) {
        console.error('[chats] erro:', e.message);
        res.status(503).json({ erro: 'WAHA nao disponivel' });
    }
});

app.get('/api/whatsapp/messages/:chatId', async (req, res) => {
    try {
        const chatId = req.params.chatId;
        const limit = parseInt(req.query.limit) || 50;
        const r = await wahaFetch(`/api/${WAHA_SESSION}/chats/${encodeURIComponent(chatId)}/messages?limit=${limit}`);
        const raw = Array.isArray(r.data) ? r.data : [];
        const msgs = raw.map((m) => {
            const msgId = typeof m.id === 'object' ? m.id._serialized : m.id || '';
            return {
                id: msgId,
                from: m.from || chatId,
                fromMe: m.fromMe || false,
                body: m.body || '',
                type: m.type || 'chat',
                timestamp: m.timestamp || 0,
                senderName: m._data?.notifyName || m.notifyName || '',
                hasMedia: m.hasMedia || false,
                _mediaUrl: m.media?.url ? `${WAHA_URL}${m.media.url}` : null,
                filename: m.media?.filename || null,
                hasQuotedMsg: !!m.quotedMsg,
                quotedMsg: m.quotedMsg
                    ? { body: m.quotedMsg.body || '', participant: m.quotedMsg._data?.notifyName || '' }
                    : null,
                reactions: m.reactions || []
            };
        });
        res.json(msgs);
    } catch (e) {
        console.error('[messages] erro:', e.message);
        res.json([]);
    }
});

// --- Send text (com reply) ---
app.post('/api/whatsapp/send', async (req, res) => {
    try {
        const { chatId, text, quotedMessageId } = req.body;
        if (!chatId || !text) return res.status(400).json({ erro: 'chatId e text sao obrigatorios' });
        // Verificar atribuicao (nao-admin so pode enviar para seus chats ou grupos)
        if (req.session.usuario.perfil !== 'admin' && !chatId.includes('@g.us')) {
            const db = getDB();
            const atend = db.queryGet(
                "SELECT id FROM whatsapp_atendimentos WHERE chat_id = ? AND status = 'em_atendimento' AND agente_id = ?",
                [chatId, req.session.usuario.id]
            );
            if (!atend) return res.status(403).json({ erro: 'Voce nao esta atribuido a esta conversa' });
        }
        const payload = { session: WAHA_SESSION, chatId, text };
        if (quotedMessageId) payload.reply_to = quotedMessageId;
        const r = await wahaFetch('/api/sendText', { method: 'POST', body: JSON.stringify(payload) });
        // Salvar no banco local
        const msgId = r.data?.id ? (typeof r.data.id === 'object' ? r.data.id._serialized : r.data.id) : null;
        if (r.status < 400 && msgId) {
            salvarMensagemLocal({
                messageId: msgId,
                chatId,
                chatName: '',
                fromMe: true,
                body: text,
                type: 'chat',
                senderName: '',
                timestamp: Math.floor(Date.now() / 1000),
                quotedMsgId: quotedMessageId || null
            });
        }
        res.status(r.status).json(r.data);
    } catch {
        res.status(503).json({ erro: 'WAHA nao disponivel' });
    }
});

// --- Send file/image ---
app.post('/api/whatsapp/send-file', upload.single('file'), async (req, res) => {
    try {
        const { chatId, caption } = req.body;
        if (!chatId || !req.file) return res.status(400).json({ erro: 'chatId e arquivo sao obrigatorios' });
        // Verificar atribuicao
        if (req.session.usuario.perfil !== 'admin' && !chatId.includes('@g.us')) {
            const db = getDB();
            const atend = db.queryGet(
                "SELECT id FROM whatsapp_atendimentos WHERE chat_id = ? AND status = 'em_atendimento' AND agente_id = ?",
                [chatId, req.session.usuario.id]
            );
            if (!atend) return res.status(403).json({ erro: 'Voce nao esta atribuido a esta conversa' });
        }
        const filePath = path.join(__dirname, 'uploads', req.file.filename);
        const base64 = fs.readFileSync(filePath).toString('base64');
        const mime = req.file.mimetype;
        const base64Data = `data:${mime};base64,${base64}`;
        const isImage = mime.startsWith('image/');
        const endpoint = isImage ? '/api/sendImage' : '/api/sendFile';
        const r = await wahaFetch(endpoint, {
            method: 'POST',
            body: JSON.stringify({
                session: WAHA_SESSION,
                chatId,
                file: { data: base64Data },
                caption: caption || '',
                fileName: req.file.originalname
            })
        });
        fs.unlinkSync(filePath);
        // Salvar no banco local
        const msgId = r.data?.id ? (typeof r.data.id === 'object' ? r.data.id._serialized : r.data.id) : null;
        if (r.status < 400 && msgId) {
            salvarMensagemLocal({
                messageId: msgId,
                chatId,
                chatName: '',
                fromMe: true,
                body: caption || '',
                type: isImage ? 'image' : 'document',
                senderName: '',
                filename: req.file.originalname,
                timestamp: Math.floor(Date.now() / 1000)
            });
        }
        res.status(r.status).json(r.data);
    } catch {
        res.status(503).json({ erro: 'Erro ao enviar arquivo' });
    }
});

// --- Download media (proxy WAHA) ---
app.get('/api/whatsapp/media/:messageId', async (req, res) => {
    try {
        const mediaUrl = req.query.url;
        if (!mediaUrl) return res.status(400).json({ erro: 'URL da media obrigatorio (query param url)' });
        // Se URL relativa do WAHA, prefixar com WAHA_URL
        const fullUrl = mediaUrl.startsWith('http') ? mediaUrl : `${WAHA_URL}${mediaUrl}`;
        const r = await fetch(fullUrl, { headers: { 'X-Api-Key': WAHA_KEY } });
        if (!r.ok) return res.status(r.status).json({ erro: 'Erro ao baixar media' });
        const buffer = Buffer.from(await r.arrayBuffer());
        res.set('Content-Type', r.headers.get('content-type') || 'application/octet-stream');
        res.send(buffer);
    } catch {
        res.status(503).json({ erro: 'Erro ao baixar midia' });
    }
});

// --- Reactions ---
app.post('/api/whatsapp/react', async (req, res) => {
    try {
        const { messageId, reaction, chatId } = req.body;
        if (!messageId) return res.status(400).json({ erro: 'messageId e obrigatorio' });
        const r = await wahaFetch('/api/reaction', {
            method: 'POST',
            body: JSON.stringify({ session: WAHA_SESSION, chatId, messageId, reaction: reaction || '' })
        });
        res.status(r.status).json(r.data);
    } catch {
        res.status(503).json({ erro: 'Erro ao reagir' });
    }
});

// --- Profile picture (com cache de 1h) ---
const profilePicCache = new Map();
const PROFILE_PIC_TTL = 60 * 60 * 1000;

app.get('/api/whatsapp/profile-pic/:contactId', async (req, res) => {
    try {
        const contactId = req.params.contactId;
        const cached = profilePicCache.get(contactId);
        if (cached && Date.now() - cached.time < PROFILE_PIC_TTL) {
            return res.json({ profilePictureUrl: cached.url || null });
        }
        const r = await wahaFetch(`/api/${WAHA_SESSION}/contacts/${encodeURIComponent(contactId)}/profile-picture`);
        const url = r.data?.profilePictureUrl || r.data?.url || null;
        profilePicCache.set(contactId, { url, time: Date.now() });
        res.json({ profilePictureUrl: url });
    } catch {
        profilePicCache.set(req.params.contactId, { url: null, time: Date.now() });
        res.json({ profilePictureUrl: null });
    }
});

// --- Mark as read ---
app.post('/api/whatsapp/seen', async (req, res) => {
    try {
        const { chatId } = req.body;
        if (!chatId) return res.status(400).json({ erro: 'chatId e obrigatorio' });
        const r = await wahaFetch('/api/sendSeen', {
            method: 'POST',
            body: JSON.stringify({ session: WAHA_SESSION, chatId })
        });
        if (cachedChats) {
            const chat = cachedChats.find((c) => c.id === chatId);
            if (chat) chat.unreadCount = 0;
        }
        res.json(r.data || { ok: true });
    } catch {
        res.status(503).json({ erro: 'Erro ao marcar como lida' });
    }
});

// --- Typing indicator ---
app.post('/api/whatsapp/typing', async (req, res) => {
    try {
        const { chatId } = req.body;
        if (!chatId) return res.json({ ok: true });
        await wahaFetch(`/api/${WAHA_SESSION}/presence`, {
            method: 'POST',
            body: JSON.stringify({ chatId, presence: 'typing' })
        });
        res.json({ ok: true });
    } catch {
        res.json({ ok: true });
    }
});

// --- Mass send ---
app.post('/api/whatsapp/send-mass', massSendLimiter, async (req, res) => {
    try {
        const { chatIds, text, delayMs } = req.body;
        if (!chatIds || !Array.isArray(chatIds) || !text)
            return res.status(400).json({ erro: 'chatIds e text obrigatorios' });
        const delay = Math.max(delayMs || 3000, 2000);
        const results = [];
        for (let i = 0; i < chatIds.length; i++) {
            try {
                await enviarMensagemWhatsApp(chatIds[i], text);
                results.push({ chatId: chatIds[i], status: 'sent' });
            } catch (e) {
                results.push({ chatId: chatIds[i], status: 'error', erro: e.message });
            }
            if (i < chatIds.length - 1) await new Promise((r) => setTimeout(r, delay));
        }
        res.json({ total: chatIds.length, results });
    } catch {
        res.status(503).json({ erro: 'Erro envio em massa' });
    }
});

// --- Templates CRUD ---
app.get('/api/whatsapp/templates', (req, res) => {
    res.json(getDB().queryAll('SELECT * FROM whatsapp_templates ORDER BY categoria, nome'));
});
app.post('/api/whatsapp/templates', (req, res) => {
    const db = getDB();
    const { nome, texto, categoria } = req.body;
    if (!nome || !texto) return res.status(400).json({ erro: 'Nome e texto obrigatórios' });
    const r = db.queryRun('INSERT INTO whatsapp_templates (nome, texto, categoria) VALUES (?, ?, ?)', [
        nome,
        texto,
        categoria || 'geral'
    ]);
    res.status(201).json(db.queryGet('SELECT * FROM whatsapp_templates WHERE id = ?', [r.lastInsertRowid]));
});
app.put('/api/whatsapp/templates/:id', (req, res) => {
    const db = getDB();
    const { nome, texto, categoria } = req.body;
    db.queryRun('UPDATE whatsapp_templates SET nome = ?, texto = ?, categoria = ? WHERE id = ?', [
        nome,
        texto,
        categoria || 'geral',
        Number(req.params.id)
    ]);
    res.json(db.queryGet('SELECT * FROM whatsapp_templates WHERE id = ?', [Number(req.params.id)]));
});
app.delete('/api/whatsapp/templates/:id', (req, res) => {
    getDB().queryRun('DELETE FROM whatsapp_templates WHERE id = ?', [Number(req.params.id)]);
    res.json({ sucesso: true });
});

// --- Auto-respostas CRUD ---
app.get('/api/whatsapp/auto-respostas', (req, res) => {
    res.json(getDB().queryAll('SELECT * FROM whatsapp_auto_respostas ORDER BY palavra_chave'));
});
app.post('/api/whatsapp/auto-respostas', (req, res) => {
    const db = getDB();
    const { palavra_chave, resposta } = req.body;
    if (!palavra_chave || !resposta) return res.status(400).json({ erro: 'Palavra-chave e resposta obrigatórias' });
    const r = db.queryRun('INSERT INTO whatsapp_auto_respostas (palavra_chave, resposta) VALUES (?, ?)', [
        palavra_chave,
        resposta
    ]);
    res.status(201).json(db.queryGet('SELECT * FROM whatsapp_auto_respostas WHERE id = ?', [r.lastInsertRowid]));
});
app.put('/api/whatsapp/auto-respostas/:id', (req, res) => {
    const db = getDB();
    const { palavra_chave, resposta, ativo } = req.body;
    db.queryRun('UPDATE whatsapp_auto_respostas SET palavra_chave = ?, resposta = ?, ativo = ? WHERE id = ?', [
        palavra_chave,
        resposta,
        ativo ? 1 : 0,
        Number(req.params.id)
    ]);
    res.json(db.queryGet('SELECT * FROM whatsapp_auto_respostas WHERE id = ?', [Number(req.params.id)]));
});
app.delete('/api/whatsapp/auto-respostas/:id', (req, res) => {
    getDB().queryRun('DELETE FROM whatsapp_auto_respostas WHERE id = ?', [Number(req.params.id)]);
    res.json({ sucesso: true });
});

// --- Flow Builder CRUD ---
app.get('/api/whatsapp/flows', (req, res) => {
    const db = getDB();
    const flows = db.queryAll(
        'SELECT id, nome, descricao, ativo, versao, criado_por, criado_em, atualizado_em FROM whatsapp_flows ORDER BY atualizado_em DESC'
    );
    for (const f of flows) {
        const c = db.queryGet('SELECT COUNT(*) as total FROM whatsapp_flow_sessoes WHERE flow_id = ? AND status = ?', [
            f.id,
            'ativo'
        ]);
        f.sessoes_ativas = c ? c.total : 0;
    }
    res.json(flows);
});

app.get('/api/whatsapp/flows/:id', (req, res) => {
    const flow = getDB().queryGet('SELECT * FROM whatsapp_flows WHERE id = ?', [Number(req.params.id)]);
    if (!flow) return res.status(404).json({ erro: 'Fluxo nao encontrado' });
    res.json(flow);
});

app.post('/api/whatsapp/flows', (req, res) => {
    const db = getDB();
    const { nome, descricao, dados_flow } = req.body;
    if (!nome) return res.status(400).json({ erro: 'Nome obrigatorio' });
    const r = db.queryRun('INSERT INTO whatsapp_flows (nome, descricao, dados_flow, criado_por) VALUES (?, ?, ?, ?)', [
        nome,
        descricao || '',
        dados_flow || '{}',
        req.session.usuario.nome
    ]);
    registrarAtividade(req, 'criar', 'whatsapp', r.lastInsertRowid, `Fluxo criado: ${nome}`);
    res.status(201).json(db.queryGet('SELECT * FROM whatsapp_flows WHERE id = ?', [r.lastInsertRowid]));
});

app.put('/api/whatsapp/flows/:id', (req, res) => {
    const db = getDB();
    const id = Number(req.params.id);
    const { nome, descricao, dados_flow } = req.body;
    const existing = db.queryGet('SELECT versao FROM whatsapp_flows WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ erro: 'Fluxo nao encontrado' });
    db.queryRun(
        "UPDATE whatsapp_flows SET nome = ?, descricao = ?, dados_flow = ?, versao = ?, atualizado_em = datetime('now','localtime') WHERE id = ?",
        [nome, descricao || '', dados_flow || '{}', existing.versao + 1, id]
    );
    registrarAtividade(req, 'editar', 'whatsapp', id, `Fluxo atualizado: ${nome}`);
    res.json(db.queryGet('SELECT * FROM whatsapp_flows WHERE id = ?', [id]));
});

app.delete('/api/whatsapp/flows/:id', (req, res) => {
    const db = getDB();
    const id = Number(req.params.id);
    db.queryRun("UPDATE whatsapp_flow_sessoes SET status = 'finalizado' WHERE flow_id = ? AND status = 'ativo'", [id]);
    db.queryRun('DELETE FROM whatsapp_flows WHERE id = ?', [id]);
    registrarAtividade(req, 'excluir', 'whatsapp', id, 'Fluxo excluido');
    res.json({ sucesso: true });
});

app.put('/api/whatsapp/flows/:id/ativar', (req, res) => {
    const db = getDB();
    const id = Number(req.params.id);
    const { ativo } = req.body;
    if (ativo) db.queryRun('UPDATE whatsapp_flows SET ativo = 0 WHERE ativo = 1');
    db.queryRun("UPDATE whatsapp_flows SET ativo = ?, atualizado_em = datetime('now','localtime') WHERE id = ?", [
        ativo ? 1 : 0,
        id
    ]);
    if (!ativo)
        db.queryRun("UPDATE whatsapp_flow_sessoes SET status = 'finalizado' WHERE flow_id = ? AND status = 'ativo'", [
            id
        ]);
    registrarAtividade(req, 'editar', 'whatsapp', id, ativo ? 'Fluxo ativado' : 'Fluxo desativado');
    res.json(db.queryGet('SELECT * FROM whatsapp_flows WHERE id = ?', [id]));
});

app.get('/api/whatsapp/flows/:id/sessoes', (req, res) => {
    res.json(
        getDB().queryAll(
            'SELECT * FROM whatsapp_flow_sessoes WHERE flow_id = ? ORDER BY atualizado_em DESC LIMIT 100',
            [Number(req.params.id)]
        )
    );
});

// --- Notificações config ---
app.get('/api/whatsapp/notificacoes', (req, res) => {
    res.json(getDB().queryAll('SELECT * FROM whatsapp_notificacoes ORDER BY tipo'));
});
app.put('/api/whatsapp/notificacoes/:id', (req, res) => {
    const db = getDB();
    const { ativo, chat_id, mensagem_template } = req.body;
    db.queryRun('UPDATE whatsapp_notificacoes SET ativo = ?, chat_id = ?, mensagem_template = ? WHERE id = ?', [
        ativo ? 1 : 0,
        chat_id || null,
        mensagem_template || null,
        Number(req.params.id)
    ]);
    res.json(db.queryGet('SELECT * FROM whatsapp_notificacoes WHERE id = ?', [Number(req.params.id)]));
});

// --- Vinculação WhatsApp ↔ Provedores ---
app.get('/api/whatsapp/provedores-vinculados', (req, res) => {
    const db = getDB();
    res.json(
        db.queryAll(
            'SELECT wp.*, p.nome as provedor_nome FROM whatsapp_provedores wp JOIN provedores p ON wp.provedor_id = p.id ORDER BY p.nome'
        )
    );
});

app.post('/api/whatsapp/vincular-provedor', (req, res) => {
    const db = getDB();
    const { provedor_id, chat_id } = req.body;
    if (!provedor_id || !chat_id) return res.status(400).json({ erro: 'provedor_id e chat_id obrigatórios' });
    try {
        const existing = db.queryGet('SELECT id FROM whatsapp_provedores WHERE provedor_id = ?', [Number(provedor_id)]);
        if (existing) {
            db.queryRun('UPDATE whatsapp_provedores SET chat_id = ? WHERE provedor_id = ?', [
                chat_id,
                Number(provedor_id)
            ]);
        } else {
            db.queryRun('INSERT INTO whatsapp_provedores (provedor_id, chat_id) VALUES (?, ?)', [
                Number(provedor_id),
                chat_id
            ]);
        }
        res.json({ sucesso: true });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

app.delete('/api/whatsapp/desvincular-provedor/:provedor_id', (req, res) => {
    getDB().queryRun('DELETE FROM whatsapp_provedores WHERE provedor_id = ?', [Number(req.params.provedor_id)]);
    res.json({ sucesso: true });
});

app.get('/api/whatsapp/provedor-por-chat/:chatId', (req, res) => {
    const db = getDB();
    const chatId = req.params.chatId;
    const v = db.queryGet(
        'SELECT wp.*, p.nome as provedor_nome, p.id as provedor_id FROM whatsapp_provedores wp JOIN provedores p ON wp.provedor_id = p.id WHERE wp.chat_id = ?',
        [chatId]
    );
    res.json(v || null);
});

// --- Agendamento de mensagens ---
app.get('/api/whatsapp/agendamentos', (req, res) => {
    res.json(getDB().queryAll('SELECT * FROM whatsapp_agendamentos ORDER BY data_envio ASC'));
});

app.post('/api/whatsapp/agendamentos', (req, res) => {
    const db = getDB();
    const { chat_id, chat_nome, texto, data_envio } = req.body;
    if (!chat_id || !texto || !data_envio)
        return res.status(400).json({ erro: 'chat_id, texto e data_envio obrigatórios' });
    const r = db.queryRun(
        'INSERT INTO whatsapp_agendamentos (chat_id, chat_nome, texto, data_envio) VALUES (?, ?, ?, ?)',
        [chat_id, chat_nome || null, texto, data_envio]
    );
    res.status(201).json(db.queryGet('SELECT * FROM whatsapp_agendamentos WHERE id = ?', [r.lastInsertRowid]));
});

app.delete('/api/whatsapp/agendamentos/:id', (req, res) => {
    getDB().queryRun('DELETE FROM whatsapp_agendamentos WHERE id = ?', [Number(req.params.id)]);
    res.json({ sucesso: true });
});

// --- Busca global de mensagens (banco local) ---
app.get('/api/whatsapp/search', async (req, res) => {
    try {
        const { q, chatId } = req.query;
        if (!q) return res.status(400).json({ erro: 'Parametro q obrigatorio' });
        const db = getDB();
        let rows;
        if (chatId) {
            rows = db.queryAll(
                'SELECT *, chat_id as _chatId, chat_name as _chatName FROM whatsapp_mensagens WHERE chat_id = ? AND body LIKE ? ORDER BY timestamp DESC LIMIT 50',
                [chatId, `%${q}%`]
            );
        } else {
            rows = db.queryAll(
                'SELECT *, chat_id as _chatId, chat_name as _chatName FROM whatsapp_mensagens WHERE body LIKE ? ORDER BY timestamp DESC LIMIT 50',
                [`%${q}%`]
            );
        }
        const results = rows.map((r) => ({
            id: r.message_id,
            from: r.chat_id,
            fromMe: r.from_me === 1,
            body: r.body || '',
            type: r.type || 'chat',
            timestamp: r.timestamp || 0,
            senderName: r.sender_name || '',
            _chatId: r._chatId,
            _chatName: r._chatName || r._chatId
        }));
        res.json(results);
    } catch {
        res.status(503).json({ erro: 'Erro na busca' });
    }
});

// --- Encaminhar mensagem ---
app.post('/api/whatsapp/forward', async (req, res) => {
    try {
        const { messageId, chatId } = req.body;
        if (!messageId || !chatId) return res.status(400).json({ erro: 'messageId e chatId obrigatorios' });
        const r = await wahaFetch('/api/forwardMessage', {
            method: 'POST',
            body: JSON.stringify({ session: WAHA_SESSION, chatId, messageId })
        });
        res.status(r.status).json(r.data);
    } catch {
        res.status(503).json({ erro: 'Erro ao encaminhar' });
    }
});

// --- Contagem de nao-lidas ---
app.get('/api/whatsapp/unread-count', async (req, res) => {
    try {
        if (cachedChats) {
            const total = cachedChats.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
            return res.json({ total });
        }
        res.json({ total: 0 });
    } catch {
        res.json({ total: 0 });
    }
});

// --- Mensagens com offset (scroll infinito) ---
app.get('/api/whatsapp/messages-page/:chatId', async (req, res) => {
    try {
        const chatId = req.params.chatId;
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const db = getDB();
        const rows = db.queryAll(
            'SELECT * FROM whatsapp_mensagens WHERE chat_id = ? ORDER BY timestamp ASC LIMIT ? OFFSET ?',
            [chatId, limit, offset]
        );
        const total =
            db.queryGet('SELECT COUNT(*) as cnt FROM whatsapp_mensagens WHERE chat_id = ?', [chatId])?.cnt || 0;
        const msgs = rows.map((r) => ({
            id: r.message_id,
            from: r.chat_id,
            fromMe: r.from_me === 1,
            body: r.body || '',
            type: r.type || 'chat',
            timestamp: r.timestamp || 0,
            senderName: r.sender_name || '',
            hasMedia: !!r.media_url,
            _mediaUrl: r.media_url || null,
            filename: r.filename || null,
            hasQuotedMsg: !!r.quoted_msg_id,
            quotedMsg: r.quoted_msg_id ? { body: r.quoted_msg_body || '', participant: '' } : null
        }));
        res.json({ messages: msgs, total, hasMore: total > offset + limit });
    } catch {
        res.status(503).json({ erro: 'Erro ao carregar mensagens' });
    }
});

// --- Exportar conversa ---
app.get('/api/whatsapp/export/:chatId', async (req, res) => {
    try {
        const format = req.query.format || 'txt';
        const chatId = req.params.chatId;
        const db = getDB();
        const rows = db.queryAll('SELECT * FROM whatsapp_mensagens WHERE chat_id = ? ORDER BY timestamp ASC', [chatId]);
        if (!rows.length) return res.status(404).json({ erro: 'Sem mensagens' });
        const msgs = rows.map((r) => ({
            fromMe: r.from_me === 1,
            body: r.body || '',
            type: r.type || 'chat',
            timestamp: r.timestamp || 0,
            senderName: r.sender_name || ''
        }));

        if (format === 'csv') {
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="chat-export.csv"`);
            res.write('\uFEFF');
            res.write('Data,Hora,Remetente,Mensagem,Tipo\n');
            for (const m of msgs) {
                const dt = m.timestamp ? new Date(m.timestamp * 1000) : new Date();
                const data = dt.toLocaleDateString('pt-BR');
                const hora = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                const remetente = m.fromMe ? 'Eu' : m.senderName || 'Contato';
                const texto = (m.body || m.type || '').replace(/"/g, '""');
                res.write(`"${data}","${hora}","${remetente}","${texto}","${m.type || 'text'}"\n`);
            }
            return res.end();
        }

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="chat-export.txt"`);
        for (const m of msgs) {
            const dt = m.timestamp ? new Date(m.timestamp * 1000) : new Date();
            const data = dt.toLocaleDateString('pt-BR');
            const hora = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const remetente = m.fromMe ? 'Eu' : m.senderName || 'Contato';
            const texto = m.body || `[${m.type || 'media'}]`;
            res.write(`[${data} ${hora}] ${remetente}: ${texto}\n`);
        }
        res.end();
    } catch {
        res.status(503).json({ erro: 'Erro ao exportar' });
    }
});

// --- Métricas WhatsApp ---
app.get('/api/whatsapp/metricas', (req, res) => {
    const db = getDB();
    const enviadas = db.queryGet("SELECT COUNT(*) as total FROM whatsapp_metricas WHERE tipo = 'enviada'") || {
        total: 0
    };
    const recebidas = db.queryGet("SELECT COUNT(*) as total FROM whatsapp_metricas WHERE tipo = 'recebida'") || {
        total: 0
    };
    const porDia = db.queryAll(
        "SELECT date(timestamp) as dia, tipo, COUNT(*) as total FROM whatsapp_metricas WHERE timestamp >= date('now', '-30 days') GROUP BY dia, tipo ORDER BY dia"
    );
    const topContatos = db.queryAll(
        'SELECT chat_nome, COUNT(*) as total FROM whatsapp_metricas WHERE chat_nome IS NOT NULL GROUP BY chat_id ORDER BY total DESC LIMIT 10'
    );
    res.json({ enviadas: enviadas.total, recebidas: recebidas.total, porDia, topContatos });
});

// ==================== FILA DE ATENDIMENTO WHATSAPP ====================

// Listar atendimentos (fila + ativos)
app.get('/api/whatsapp/atendimentos', (req, res) => {
    const db = getDB();
    const user = req.session.usuario;
    const isAdmin = user.perfil === 'admin';
    const status = req.query.status || 'ativos';

    let where = 'WHERE 1=1';
    const params = [];

    if (status === 'fila') {
        where += " AND a.status = 'fila'";
    } else if (status === 'em_atendimento') {
        where += " AND a.status = 'em_atendimento'";
    } else if (status === 'finalizado') {
        where += " AND a.status = 'finalizado'";
    } else {
        where += " AND a.status IN ('fila','em_atendimento')";
    }

    if (!isAdmin) {
        where += " AND (a.status = 'fila' OR a.agente_id = ?)";
        params.push(user.id);
    }

    const rows = db.queryAll(
        `
        SELECT a.*,
            (SELECT body FROM whatsapp_mensagens WHERE chat_id = a.chat_id ORDER BY timestamp DESC LIMIT 1) as ultima_msg,
            (SELECT COUNT(*) FROM whatsapp_mensagens WHERE chat_id = a.chat_id) as total_msgs
        FROM whatsapp_atendimentos a ${where}
        ORDER BY CASE a.status WHEN 'fila' THEN 0 WHEN 'em_atendimento' THEN 1 ELSE 2 END, a.criado_em ASC
    `,
        params
    );
    res.json(rows);
});

// Atribuir chat da fila para si
app.post('/api/whatsapp/atendimentos/atribuir', (req, res) => {
    const db = getDB();
    const user = req.session.usuario;
    const { chat_id } = req.body;
    if (!chat_id) return res.status(400).json({ erro: 'chat_id obrigatorio' });

    const atend = db.queryGet(
        "SELECT * FROM whatsapp_atendimentos WHERE chat_id = ? AND status IN ('fila','em_atendimento')",
        [chat_id]
    );
    if (!atend) return res.status(404).json({ erro: 'Chat nao esta na fila' });
    if (atend.status === 'em_atendimento')
        return res.status(409).json({ erro: `Chat ja esta sendo atendido por ${atend.agente_nome || 'outro agente'}` });

    db.queryRun(
        `UPDATE whatsapp_atendimentos SET agente_id = ?, agente_nome = ?, status = 'em_atendimento',
        atribuido_em = datetime('now','localtime'),
        tempo_espera_seg = CAST((julianday('now','localtime') - julianday(criado_em)) * 86400 AS INTEGER)
        WHERE id = ?`,
        [user.id, user.nome, atend.id]
    );

    db.queryRun(
        "INSERT INTO whatsapp_atendimentos_log (atendimento_id, acao, para_agente_id, usuario_nome) VALUES (?, 'atribuido', ?, ?)",
        [atend.id, user.id, user.nome]
    );

    const updated = db.queryGet('SELECT * FROM whatsapp_atendimentos WHERE id = ?', [atend.id]);
    broadcastSSE({
        event: 'atendimento.atribuido',
        payload: { chat_id, agente_id: user.id, agente_nome: user.nome, status: 'em_atendimento', id: atend.id }
    });
    cachedChatsTime = 0;
    res.json({ ok: true, atendimento: updated });
});

// Transferir chat para outro agente
app.post('/api/whatsapp/atendimentos/transferir', (req, res) => {
    const db = getDB();
    const user = req.session.usuario;
    const { chat_id, para_agente_id } = req.body;
    if (!chat_id || !para_agente_id) return res.status(400).json({ erro: 'chat_id e para_agente_id obrigatorios' });

    const atend = db.queryGet("SELECT * FROM whatsapp_atendimentos WHERE chat_id = ? AND status = 'em_atendimento'", [
        chat_id
    ]);
    if (!atend) return res.status(404).json({ erro: 'Atendimento nao encontrado' });
    if (user.perfil !== 'admin' && atend.agente_id !== user.id)
        return res.status(403).json({ erro: 'Voce nao esta atribuido a esta conversa' });

    const destino = db.queryGet('SELECT id, nome FROM usuarios WHERE id = ? AND ativo = 1', [para_agente_id]);
    if (!destino) return res.status(404).json({ erro: 'Agente destino nao encontrado' });

    const deAgenteId = atend.agente_id;
    db.queryRun(
        "UPDATE whatsapp_atendimentos SET agente_id = ?, agente_nome = ?, atribuido_em = datetime('now','localtime') WHERE id = ?",
        [destino.id, destino.nome, atend.id]
    );

    db.queryRun(
        "INSERT INTO whatsapp_atendimentos_log (atendimento_id, acao, de_agente_id, para_agente_id, usuario_nome) VALUES (?, 'transferido', ?, ?, ?)",
        [atend.id, deAgenteId, destino.id, user.nome]
    );

    broadcastSSE({
        event: 'atendimento.transferido',
        payload: { chat_id, de_agente_id: deAgenteId, agente_id: destino.id, agente_nome: destino.nome, id: atend.id }
    });
    cachedChatsTime = 0;
    res.json({ ok: true });
});

// Finalizar atendimento
app.post('/api/whatsapp/atendimentos/finalizar', (req, res) => {
    const db = getDB();
    const user = req.session.usuario;
    const { chat_id, notas } = req.body;
    if (!chat_id) return res.status(400).json({ erro: 'chat_id obrigatorio' });

    const atend = db.queryGet("SELECT * FROM whatsapp_atendimentos WHERE chat_id = ? AND status = 'em_atendimento'", [
        chat_id
    ]);
    if (!atend) return res.status(404).json({ erro: 'Atendimento nao encontrado' });
    if (user.perfil !== 'admin' && atend.agente_id !== user.id)
        return res.status(403).json({ erro: 'Voce nao esta atribuido a esta conversa' });

    db.queryRun(
        "UPDATE whatsapp_atendimentos SET status = 'finalizado', finalizado_em = datetime('now','localtime'), notas = ? WHERE id = ?",
        [notas || null, atend.id]
    );

    db.queryRun(
        "INSERT INTO whatsapp_atendimentos_log (atendimento_id, acao, usuario_nome, detalhes) VALUES (?, 'finalizado', ?, ?)",
        [atend.id, user.nome, notas || null]
    );

    broadcastSSE({ event: 'atendimento.finalizado', payload: { chat_id, agente_id: atend.agente_id, id: atend.id } });
    cachedChatsTime = 0;
    res.json({ ok: true });
});

// Metricas de atendimento
app.get('/api/whatsapp/atendimentos/metricas', (req, res) => {
    const db = getDB();
    const naFila = db.queryGet("SELECT COUNT(*) as total FROM whatsapp_atendimentos WHERE status = 'fila'") || {
        total: 0
    };
    const emAtendimento = db.queryGet(
        "SELECT COUNT(*) as total FROM whatsapp_atendimentos WHERE status = 'em_atendimento'"
    ) || { total: 0 };
    const finalizadosHoje = db.queryGet(
        "SELECT COUNT(*) as total FROM whatsapp_atendimentos WHERE status = 'finalizado' AND date(finalizado_em) = date('now','localtime')"
    ) || { total: 0 };
    const tempoMedio = db.queryGet(
        "SELECT AVG(tempo_espera_seg) as media FROM whatsapp_atendimentos WHERE status != 'fila' AND tempo_espera_seg > 0"
    ) || { media: 0 };
    const porAgente = db.queryAll(`
        SELECT agente_id, agente_nome,
            SUM(CASE WHEN status = 'em_atendimento' THEN 1 ELSE 0 END) as em_atendimento,
            SUM(CASE WHEN status = 'finalizado' AND date(finalizado_em) = date('now','localtime') THEN 1 ELSE 0 END) as finalizados_hoje
        FROM whatsapp_atendimentos WHERE agente_id IS NOT NULL GROUP BY agente_id
    `);
    res.json({
        na_fila: naFila.total,
        em_atendimento: emAtendimento.total,
        finalizados_hoje: finalizadosHoje.total,
        tempo_medio_espera_seg: Math.round(tempoMedio.media || 0),
        por_agente: porAgente
    });
});

// Listar agentes disponiveis para transferencia
app.get('/api/whatsapp/atendimentos/agentes', (req, res) => {
    const db = getDB();
    const agentes = db.queryAll(
        "SELECT id, nome, perfil FROM usuarios WHERE ativo = 1 AND perfil IN ('admin','analista','gestor_atendimento','gerente_noc','atendente') ORDER BY nome"
    );
    res.json(agentes);
});

// ==================== API: MARCADOR DE PONTO ====================

// Status atual do usuario (entrada, pausa, etc.)
app.get('/api/ponto/status', (req, res) => {
    const db = getDB();
    const userId = req.session.usuario.id;
    const hoje = new Date().toISOString().slice(0, 10);

    const registros = db.queryAll(
        'SELECT * FROM ponto_registros WHERE usuario_id = ? AND date(data_hora) = ? ORDER BY data_hora ASC',
        [userId, hoje]
    );

    const pausaAtiva = db.queryGet(
        'SELECT * FROM ponto_pausas WHERE usuario_id = ? AND fim IS NULL ORDER BY inicio DESC LIMIT 1',
        [userId]
    );

    const config = db.queryGet('SELECT * FROM ponto_config WHERE usuario_id = ?', [userId]);

    // Determinar estado atual
    let estado = 'offline'; // offline | trabalhando | pausa | almoco
    const ultimaEntrada = registros.filter((r) => r.tipo === 'entrada').pop();
    const ultimaSaida = registros.filter((r) => r.tipo === 'saida').pop();
    const entradaAlmoco = registros.filter((r) => r.tipo === 'entrada_almoco').pop();
    const saidaAlmoco = registros.filter((r) => r.tipo === 'saida_almoco').pop();

    if (ultimaEntrada) {
        estado = 'trabalhando';
        if (ultimaSaida && ultimaSaida.data_hora > ultimaEntrada.data_hora) {
            estado = 'offline';
        } else if (entradaAlmoco && (!saidaAlmoco || saidaAlmoco.data_hora < entradaAlmoco.data_hora)) {
            estado = 'almoco';
        } else if (pausaAtiva) {
            estado = 'pausa';
        }
    }

    // Calcular tempo trabalhado
    let tempoTrabalhadoMin = 0;
    let entradaAtual = null;
    for (const r of registros) {
        if (r.tipo === 'entrada') entradaAtual = new Date(r.data_hora);
        if (r.tipo === 'saida' && entradaAtual) {
            tempoTrabalhadoMin += (new Date(r.data_hora) - entradaAtual) / 60000;
            entradaAtual = null;
        }
    }
    if (entradaAtual && estado !== 'offline') {
        tempoTrabalhadoMin += (new Date() - entradaAtual) / 60000;
    }

    // Subtrair tempo de almoco
    const almocoRegistros = registros.filter((r) => r.tipo === 'entrada_almoco' || r.tipo === 'saida_almoco');
    for (let i = 0; i < almocoRegistros.length; i += 2) {
        const ini = almocoRegistros[i];
        const fim = almocoRegistros[i + 1];
        if (ini && fim) {
            tempoTrabalhadoMin -= (new Date(fim.data_hora) - new Date(ini.data_hora)) / 60000;
        } else if (ini && estado === 'almoco') {
            tempoTrabalhadoMin -= (new Date() - new Date(ini.data_hora)) / 60000;
        }
    }

    // Subtrair tempo de pausas
    const pausasHoje = db.queryAll(
        'SELECT * FROM ponto_pausas WHERE usuario_id = ? AND date(inicio) = ? ORDER BY inicio',
        [userId, hoje]
    );
    for (const p of pausasHoje) {
        if (p.fim) {
            tempoTrabalhadoMin -= (new Date(p.fim) - new Date(p.inicio)) / 60000;
        } else {
            tempoTrabalhadoMin -= (new Date() - new Date(p.inicio)) / 60000;
        }
    }

    res.json({
        estado,
        registros,
        pausaAtiva,
        pausasHoje,
        config: config || {
            horario_entrada: '08:00',
            horario_saida: '18:00',
            almoco_inicio: '12:00',
            almoco_duracao_min: 60,
            home_office: 0,
            carga_horaria_min: 480
        },
        tempoTrabalhadoMin: Math.max(0, Math.round(tempoTrabalhadoMin))
    });
});

// Registrar entrada/saida/almoco
app.post('/api/ponto/registrar', (req, res) => {
    const db = getDB();
    const user = req.session.usuario;
    const { tipo } = req.body;
    const hoje = new Date().toISOString().slice(0, 10);

    if (!['entrada', 'saida', 'entrada_almoco', 'saida_almoco'].includes(tipo)) {
        return res.status(400).json({ erro: 'Tipo inválido' });
    }

    // Validacoes
    const registrosHoje = db.queryAll(
        'SELECT * FROM ponto_registros WHERE usuario_id = ? AND date(data_hora) = ? ORDER BY data_hora',
        [user.id, hoje]
    );

    const temEntrada = registrosHoje.some((r) => r.tipo === 'entrada');
    const ultimaSaida = registrosHoje.filter((r) => r.tipo === 'saida').pop();
    const ultimaEntrada = registrosHoje.filter((r) => r.tipo === 'entrada').pop();
    const estaNoAlmoco =
        registrosHoje.some((r) => r.tipo === 'entrada_almoco') &&
        !registrosHoje.some(
            (r) =>
                r.tipo === 'saida_almoco' &&
                r.data_hora > registrosHoje.filter((r2) => r2.tipo === 'entrada_almoco').pop().data_hora
        );

    if (tipo === 'entrada' && temEntrada && (!ultimaSaida || ultimaSaida.data_hora < ultimaEntrada.data_hora)) {
        return res.status(400).json({ erro: 'Já registrou entrada hoje' });
    }
    if (
        tipo === 'saida' &&
        (!temEntrada || (ultimaSaida && ultimaEntrada && ultimaSaida.data_hora > ultimaEntrada.data_hora))
    ) {
        return res.status(400).json({ erro: 'Registre a entrada primeiro' });
    }
    if (tipo === 'entrada_almoco' && estaNoAlmoco) {
        return res.status(400).json({ erro: 'Já está no almoço' });
    }
    if (tipo === 'saida_almoco' && !estaNoAlmoco) {
        return res.status(400).json({ erro: 'Não está no almoço' });
    }

    // Encerrar pausa ativa se houver antes de saida/almoco
    if (tipo === 'saida' || tipo === 'entrada_almoco') {
        const pausaAtiva = db.queryGet('SELECT id FROM ponto_pausas WHERE usuario_id = ? AND fim IS NULL', [user.id]);
        if (pausaAtiva) {
            const agora = new Date().toISOString().replace('T', ' ').slice(0, 19);
            const p = db.queryGet('SELECT inicio FROM ponto_pausas WHERE id = ?', [pausaAtiva.id]);
            const duracao = Math.round((new Date() - new Date(p.inicio)) / 60000);
            db.queryRun('UPDATE ponto_pausas SET fim = ?, duracao_min = ? WHERE id = ?', [
                agora,
                duracao,
                pausaAtiva.id
            ]);
        }
    }

    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || '';
    const result = db.queryRun('INSERT INTO ponto_registros (usuario_id, usuario_nome, tipo, ip) VALUES (?, ?, ?, ?)', [
        user.id,
        user.nome,
        tipo,
        ip
    ]);

    broadcastSSE({ event: `ponto.${tipo}`, payload: { usuario_id: user.id, usuario_nome: user.nome, tipo } });
    registrarAtividade(req, tipo, 'ponto', result.lastInsertRowid, `Ponto: ${tipo}`);
    res.json({ ok: true, id: result.lastInsertRowid });
});

// Iniciar pausa
app.post('/api/ponto/pausar', (req, res) => {
    const db = getDB();
    const user = req.session.usuario;
    const { motivo } = req.body;

    if (!motivo) return res.status(400).json({ erro: 'Motivo é obrigatório' });

    // Verificar se tem entrada hoje e não saiu
    const hoje = new Date().toISOString().slice(0, 10);
    const entrada = db.queryGet(
        "SELECT id FROM ponto_registros WHERE usuario_id = ? AND date(data_hora) = ? AND tipo = 'entrada' ORDER BY data_hora DESC LIMIT 1",
        [user.id, hoje]
    );
    if (!entrada) return res.status(400).json({ erro: 'Registre a entrada primeiro' });

    // Verificar se já tem pausa ativa
    const pausaAtiva = db.queryGet('SELECT id FROM ponto_pausas WHERE usuario_id = ? AND fim IS NULL', [user.id]);
    if (pausaAtiva) return res.status(400).json({ erro: 'Já está em pausa' });

    const result = db.queryRun('INSERT INTO ponto_pausas (usuario_id, usuario_nome, motivo) VALUES (?, ?, ?)', [
        user.id,
        user.nome,
        motivo
    ]);

    broadcastSSE({ event: 'ponto.pausa', payload: { usuario_id: user.id, usuario_nome: user.nome, motivo } });
    res.json({ ok: true, id: result.lastInsertRowid });
});

// Retomar (encerrar pausa)
app.post('/api/ponto/retomar', (req, res) => {
    const db = getDB();
    const user = req.session.usuario;

    const pausaAtiva = db.queryGet(
        'SELECT * FROM ponto_pausas WHERE usuario_id = ? AND fim IS NULL ORDER BY inicio DESC LIMIT 1',
        [user.id]
    );
    if (!pausaAtiva) return res.status(400).json({ erro: 'Não está em pausa' });

    const agora = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const duracao = Math.round((new Date() - new Date(pausaAtiva.inicio)) / 60000);
    db.queryRun('UPDATE ponto_pausas SET fim = ?, duracao_min = ? WHERE id = ?', [agora, duracao, pausaAtiva.id]);

    broadcastSSE({ event: 'ponto.retomar', payload: { usuario_id: user.id, usuario_nome: user.nome } });
    res.json({ ok: true, duracao_min: duracao });
});

// Historico do proprio usuario
app.get('/api/ponto/historico', (req, res) => {
    const db = getDB();
    const userId = req.session.usuario.id;
    const dias = parseInt(req.query.dias) || 30;
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - dias);
    const limiteStr = dataLimite.toISOString().slice(0, 10);

    const registros = db.queryAll(
        'SELECT * FROM ponto_registros WHERE usuario_id = ? AND date(data_hora) >= ? ORDER BY data_hora DESC',
        [userId, limiteStr]
    );
    const pausas = db.queryAll(
        'SELECT * FROM ponto_pausas WHERE usuario_id = ? AND date(inicio) >= ? ORDER BY inicio DESC',
        [userId, limiteStr]
    );

    res.json({ registros, pausas });
});

// Visao da equipe (gerencia/admin)
app.get('/api/ponto/equipe', requireGerenciaOuAdmin, (req, res) => {
    const db = getDB();
    const hoje = new Date().toISOString().slice(0, 10);

    const usuarios = db.queryAll('SELECT id, nome, perfil, foto_url FROM usuarios WHERE ativo = 1 ORDER BY nome');
    const equipe = usuarios.map((u) => {
        const registros = db.queryAll(
            'SELECT tipo, data_hora FROM ponto_registros WHERE usuario_id = ? AND date(data_hora) = ? ORDER BY data_hora',
            [u.id, hoje]
        );
        const pausaAtiva = db.queryGet('SELECT motivo, inicio FROM ponto_pausas WHERE usuario_id = ? AND fim IS NULL', [
            u.id
        ]);
        const pausasHoje = db.queryAll(
            'SELECT motivo, duracao_min FROM ponto_pausas WHERE usuario_id = ? AND date(inicio) = ? AND fim IS NOT NULL',
            [u.id, hoje]
        );
        const config = db.queryGet('SELECT * FROM ponto_config WHERE usuario_id = ?', [u.id]);

        // Calcular estado
        let estado = 'offline';
        const ultimaEntrada = registros.filter((r) => r.tipo === 'entrada').pop();
        const ultimaSaida = registros.filter((r) => r.tipo === 'saida').pop();
        const entradaAlmoco = registros.filter((r) => r.tipo === 'entrada_almoco').pop();
        const saidaAlmoco = registros.filter((r) => r.tipo === 'saida_almoco').pop();

        if (ultimaEntrada) {
            estado = 'trabalhando';
            if (ultimaSaida && ultimaSaida.data_hora > ultimaEntrada.data_hora) estado = 'offline';
            else if (entradaAlmoco && (!saidaAlmoco || saidaAlmoco.data_hora < entradaAlmoco.data_hora))
                estado = 'almoco';
            else if (pausaAtiva) estado = 'pausa';
        }

        const totalPausasMin = pausasHoje.reduce((s, p) => s + (p.duracao_min || 0), 0);

        return {
            id: u.id,
            nome: u.nome,
            perfil: u.perfil,
            foto_url: u.foto_url,
            estado,
            registros,
            pausaAtiva,
            totalPausasMin,
            config
        };
    });

    res.json(equipe);
});

// Historico de um colaborador (gerencia)
app.get('/api/ponto/equipe/:id/historico', requireGerenciaOuAdmin, (req, res) => {
    const db = getDB();
    const userId = Number(req.params.id);
    const dias = parseInt(req.query.dias) || 30;
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - dias);
    const limiteStr = dataLimite.toISOString().slice(0, 10);

    const usuario = db.queryGet('SELECT id, nome, perfil FROM usuarios WHERE id = ?', [userId]);
    if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado' });

    const registros = db.queryAll(
        'SELECT * FROM ponto_registros WHERE usuario_id = ? AND date(data_hora) >= ? ORDER BY data_hora DESC',
        [userId, limiteStr]
    );
    const pausas = db.queryAll(
        'SELECT * FROM ponto_pausas WHERE usuario_id = ? AND date(inicio) >= ? ORDER BY inicio DESC',
        [userId, limiteStr]
    );
    const config = db.queryGet('SELECT * FROM ponto_config WHERE usuario_id = ?', [userId]);

    res.json({ usuario, registros, pausas, config });
});

// Configurar horarios de um usuario (gerencia)
app.put('/api/ponto/config/:usuario_id', requireGerenciaOuAdmin, (req, res) => {
    const db = getDB();
    const userId = Number(req.params.usuario_id);
    const { horario_entrada, horario_saida, almoco_inicio, almoco_duracao_min, home_office, carga_horaria_min } =
        req.body;

    const existe = db.queryGet('SELECT id FROM ponto_config WHERE usuario_id = ?', [userId]);
    if (existe) {
        db.queryRun(
            'UPDATE ponto_config SET horario_entrada = ?, horario_saida = ?, almoco_inicio = ?, almoco_duracao_min = ?, home_office = ?, carga_horaria_min = ? WHERE usuario_id = ?',
            [
                horario_entrada || '08:00',
                horario_saida || '18:00',
                almoco_inicio || '12:00',
                almoco_duracao_min || 60,
                home_office ? 1 : 0,
                carga_horaria_min || 480,
                userId
            ]
        );
    } else {
        db.queryRun(
            'INSERT INTO ponto_config (usuario_id, horario_entrada, horario_saida, almoco_inicio, almoco_duracao_min, home_office, carga_horaria_min) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
                userId,
                horario_entrada || '08:00',
                horario_saida || '18:00',
                almoco_inicio || '12:00',
                almoco_duracao_min || 60,
                home_office ? 1 : 0,
                carga_horaria_min || 480
            ]
        );
    }

    registrarAtividade(req, 'editar', 'ponto', userId, `Config ponto atualizada para usuario ${userId}`);
    res.json({ ok: true });
});

// Obter config de um usuario (gerencia)
app.get('/api/ponto/config/:usuario_id', requireGerenciaOuAdmin, (req, res) => {
    const db = getDB();
    const userId = Number(req.params.usuario_id);
    const config = db.queryGet('SELECT * FROM ponto_config WHERE usuario_id = ?', [userId]);
    res.json(
        config || {
            horario_entrada: '08:00',
            horario_saida: '18:00',
            almoco_inicio: '12:00',
            almoco_duracao_min: 60,
            home_office: 0,
            carga_horaria_min: 480
        }
    );
});

// Relatorio de horas (gerencia)
app.get('/api/ponto/relatorio', requireGerenciaOuAdmin, (req, res) => {
    const db = getDB();
    const de = req.query.de || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const ate = req.query.ate || new Date().toISOString().slice(0, 10);

    const usuarios = db.queryAll('SELECT id, nome, perfil FROM usuarios WHERE ativo = 1 ORDER BY nome');
    const relatorio = usuarios.map((u) => {
        const registros = db.queryAll(
            'SELECT tipo, data_hora FROM ponto_registros WHERE usuario_id = ? AND date(data_hora) BETWEEN ? AND ? ORDER BY data_hora',
            [u.id, de, ate]
        );
        const pausas = db.queryAll(
            'SELECT duracao_min FROM ponto_pausas WHERE usuario_id = ? AND date(inicio) BETWEEN ? AND ? AND fim IS NOT NULL',
            [u.id, de, ate]
        );

        // Calcular dias trabalhados e horas
        const diasMap = {};
        for (const r of registros) {
            const dia = r.data_hora.slice(0, 10);
            if (!diasMap[dia]) diasMap[dia] = [];
            diasMap[dia].push(r);
        }

        let totalMin = 0;
        for (const [, regs] of Object.entries(diasMap)) {
            let entradaAtual = null;
            for (const r of regs) {
                if (r.tipo === 'entrada') entradaAtual = new Date(r.data_hora);
                if (r.tipo === 'saida' && entradaAtual) {
                    totalMin += (new Date(r.data_hora) - entradaAtual) / 60000;
                    entradaAtual = null;
                }
            }
        }

        const totalPausasMin = pausas.reduce((s, p) => s + (p.duracao_min || 0), 0);

        return {
            id: u.id,
            nome: u.nome,
            perfil: u.perfil,
            dias_trabalhados: Object.keys(diasMap).length,
            horas_totais: Math.round(((totalMin - totalPausasMin) / 60) * 10) / 10,
            pausas_min: totalPausasMin
        };
    });

    res.json(relatorio);
});

// API externa para maquina de ponto
app.post('/api/v1/ponto/registrar', (req, res) => {
    const db = getDB();
    const apiKey = req.headers['x-api-key'];
    const cfgKey = db.queryGet("SELECT valor FROM config_geral WHERE chave = 'ponto_api_key'");

    if (!cfgKey || !cfgKey.valor || cfgKey.valor !== apiKey) {
        return res.status(401).json({ erro: 'API key inválida' });
    }

    const { usuario_id, tipo, timestamp } = req.body;
    if (!usuario_id || !tipo) return res.status(400).json({ erro: 'usuario_id e tipo são obrigatórios' });
    if (!['entrada', 'saida', 'entrada_almoco', 'saida_almoco'].includes(tipo)) {
        return res.status(400).json({ erro: 'Tipo inválido' });
    }

    const usuario = db.queryGet('SELECT id, nome FROM usuarios WHERE id = ? AND ativo = 1', [usuario_id]);
    if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado' });

    const dataHora = timestamp || new Date().toISOString().replace('T', ' ').slice(0, 19);
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || '';

    const result = db.queryRun(
        "INSERT INTO ponto_registros (usuario_id, usuario_nome, tipo, data_hora, ip, origem) VALUES (?, ?, ?, ?, ?, 'maquina_ponto')",
        [usuario.id, usuario.nome, tipo, dataHora, ip]
    );

    broadcastSSE({
        event: `ponto.${tipo}`,
        payload: { usuario_id: usuario.id, usuario_nome: usuario.nome, tipo, origem: 'maquina_ponto' }
    });
    res.json({ ok: true, id: result.lastInsertRowid });
});

// ==================== START SERVER ====================

// Cron: verificar agendamentos a cada 30s
function processarAgendamentos() {
    try {
        const db = getDB();
        const agora = new Date().toISOString().replace('T', ' ').substring(0, 16);
        const pendentes = db.queryAll(
            "SELECT * FROM whatsapp_agendamentos WHERE status = 'pendente' AND data_envio <= ?",
            [agora]
        );
        for (const ag of pendentes) {
            enviarMensagemWhatsApp(ag.chat_id, ag.texto)
                .then(() => db.queryRun("UPDATE whatsapp_agendamentos SET status = 'enviado' WHERE id = ?", [ag.id]))
                .catch(() => db.queryRun("UPDATE whatsapp_agendamentos SET status = 'erro' WHERE id = ?", [ag.id]));
        }
    } catch {}
}

// ==================== ERP ADAPTER REGISTRY ====================

const VALID_ERP_TYPES = ['ixc', 'ispfy', 'hubsoft', 'sgp', 'atlaz'];

const ERP_ADAPTERS = {
    ixc: {
        label: 'IXC Provedor',
        authFields: ['token'],
        extraFields: [],
        httpMethod: 'POST',
        testEndpoint: '/cliente',
        buildHeaders(config) {
            const tokenB64 = Buffer.from(config.token).toString('base64');
            return { Authorization: `Basic ${tokenB64}`, 'Content-Type': 'application/json', ixctoken: config.token };
        },
        buildBody(config) {
            return { qtype: 'cliente.id', query: '', sortname: 'cliente.id', sortorder: 'asc', page: '1', rp: '20' };
        },
        endpoints: { clientes: '/cliente', contratos: '/cliente_contrato', planos: '/vd_servico' },
        normalizeResponse(data) {
            return Array.isArray(data) ? data : data.registros || data.data || [];
        },
        normalizeClientes(items) {
            return items.map((c) => ({
                id_externo: c.id,
                nome: c.razao || c.fantasia || c.nome || '',
                documento: c.cnpj_cpf || c.cpf || c.cnpj || '',
                email: c.email || '',
                telefone: c.telefone_celular || c.fone || '',
                endereco: c.endereco || '',
                status: c.ativo || '',
                _raw: c
            }));
        },
        normalizeContratos(items) {
            return items.map((c) => ({
                id_externo: c.id,
                cliente_id_externo: c.id_cliente,
                plano: c.contrato || c.id_vd_servico || '',
                status: c.status || c.status_internet || '',
                valor: c.valor || 0,
                _raw: c
            }));
        },
        normalizePlanos(items) {
            return items.map((p) => ({
                id_externo: p.id,
                nome: p.nome || p.descricao || '',
                valor: p.valor || 0,
                _raw: p
            }));
        }
    },
    ispfy: {
        label: 'ISPFY',
        authFields: ['token'],
        extraFields: [],
        testEndpoint: '/object/cliente',
        buildHeaders(config) {
            return { token: config.token, 'Content-Type': 'application/json' };
        },
        endpoints: { clientes: '/object/cliente', contratos: '/object/cliente/contrato', planos: '/object/carteira' },
        normalizeResponse(data) {
            return Array.isArray(data) ? data : data.rows || data.data || data.result || [];
        },
        normalizeClientes(items) {
            return items.map((c) => ({
                id_externo: c.id || c.codigo,
                nome: c.nome_razao || c.nome || '',
                documento: c.cpf_cnpj || c.documento || '',
                email: c.email || '',
                telefone: c.telefone || c.celular || '',
                endereco: c.endereco || '',
                status: c.status || '',
                _raw: c
            }));
        },
        normalizeContratos(items) {
            return items.map((c) => ({
                id_externo: c.id || c.codigo,
                cliente_id_externo: c.id_cliente || c.cliente_id,
                plano: c.plano || c.nome_plano || '',
                status: c.status || '',
                valor: c.valor || 0,
                _raw: c
            }));
        },
        normalizePlanos(items) {
            return items.map((p) => ({
                id_externo: p.id || p.codigo,
                nome: p.nome || p.descricao || '',
                valor: p.valor || 0,
                _raw: p
            }));
        }
    },
    hubsoft: {
        label: 'Hubsoft',
        authFields: [],
        extraFields: ['client_id', 'client_secret', 'username', 'password'],
        testEndpoint: '/api/v1/integracao/cliente?busca=codigo_cliente&termo_busca=1&limit=1',
        async getAccessToken(config) {
            const extras = JSON.parse(config.extras || '{}');
            if (extras.access_token && extras.token_expires && new Date(extras.token_expires) > new Date()) {
                return extras.access_token;
            }
            const tokenRes = await fetch(`${config.url_base}/oauth/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    grant_type: 'password',
                    client_id: extras.client_id,
                    client_secret: extras.client_secret,
                    username: extras.username,
                    password: extras.password
                })
            });
            const tokenData = await tokenRes.json();
            if (!tokenData.access_token) throw new Error('Falha na autenticacao OAuth Hubsoft');
            extras.access_token = tokenData.access_token;
            extras.token_expires = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();
            config._updatedExtras = JSON.stringify(extras);
            return tokenData.access_token;
        },
        async buildHeaders(config) {
            const accessToken = await this.getAccessToken(config);
            return { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };
        },
        endpoints: {
            clientes: '/api/v1/integracao/cliente/all',
            contratos: '/api/v1/integracao/cliente/all?incluir_contrato=sim',
            planos: '/api/v1/integracao/cliente/all?cancelado=nao&limit=5'
        },
        normalizeResponse(data) {
            return data.clientes || (Array.isArray(data) ? data : data.data || []);
        },
        normalizeClientes(items) {
            return items.map((c) => ({
                id_externo: c.id_cliente || c.codigo_cliente,
                nome: c.nome_razaosocial || '',
                documento: c.cpf_cnpj || '',
                email: c.email_principal || '',
                telefone: c.telefone_primario || '',
                endereco: c.endereco || '',
                status: c.status || '',
                _raw: c
            }));
        },
        normalizeContratos(items) {
            const contratos = [];
            items.forEach((c) => {
                if (c.servicos && Array.isArray(c.servicos)) {
                    c.servicos.forEach((s) =>
                        contratos.push({
                            id_externo: s.id_cliente_servico,
                            cliente_id_externo: c.id_cliente || c.codigo_cliente,
                            plano: s.nome || s.numero_plano || '',
                            status: s.status || '',
                            valor: s.valor || 0,
                            _raw: s
                        })
                    );
                }
            });
            return contratos;
        },
        normalizePlanos(items) {
            const planos = new Map();
            items.forEach((c) => {
                if (c.servicos && Array.isArray(c.servicos)) {
                    c.servicos.forEach((s) => {
                        if (s.nome && !planos.has(s.nome)) {
                            planos.set(s.nome, {
                                id_externo: s.id_cliente_servico,
                                nome: s.nome || '',
                                valor: s.valor || 0,
                                _raw: s
                            });
                        }
                    });
                }
            });
            return Array.from(planos.values());
        }
    },
    sgp: {
        label: 'SGP',
        authFields: ['token'],
        extraFields: ['app', 'auth_mode', 'basic_user', 'basic_pass'],
        testEndpoint: '/api/ura/empresa/',
        buildHeaders(config) {
            const extras = JSON.parse(config.extras || '{}');
            if (extras.auth_mode === 'basic') {
                return {
                    Authorization: `Basic ${Buffer.from(`${extras.basic_user}:${extras.basic_pass}`).toString('base64')}`,
                    'Content-Type': 'application/json'
                };
            }
            return { 'Content-Type': 'application/json' };
        },
        buildBody(config) {
            const extras = JSON.parse(config.extras || '{}');
            if (extras.auth_mode === 'basic') return null;
            return { token: config.token, app: extras.app || '' };
        },
        endpoints: {
            clientes: '/api/ura/consultacliente/',
            contratos: '/api/ura/consultacliente/',
            planos: '/api/ura/empresa/'
        },
        normalizeResponse(data) {
            return Array.isArray(data) ? data : data.dados || data.data || data.registros || [];
        },
        normalizeClientes(items) {
            return items.map((c) => ({
                id_externo: c.id || c.codigo,
                nome: c.nome || c.razao_social || '',
                documento: c.cpf_cnpj || c.documento || '',
                email: c.email || '',
                telefone: c.telefone || c.celular || '',
                endereco: c.endereco || '',
                status: c.status || '',
                _raw: c
            }));
        },
        normalizeContratos(items) {
            return items.map((c) => ({
                id_externo: c.id || c.codigo,
                cliente_id_externo: c.cliente_id || c.id_cliente,
                plano: c.plano || c.nome_plano || '',
                status: c.status || '',
                valor: c.valor || 0,
                _raw: c
            }));
        },
        normalizePlanos(items) {
            return items.map((p) => ({
                id_externo: p.id || p.codigo,
                nome: p.nome || p.descricao || '',
                valor: p.valor || 0,
                _raw: p
            }));
        }
    },
    // NOTA: Endpoints Atlaz baseados em convencao REST padrao. Docs oficiais (atlaz.docs.apiary.io) nao puderam ser validados.
    atlaz: {
        label: 'Atlaz',
        authFields: ['token'],
        extraFields: [],
        testEndpoint: '/api/clients',
        buildHeaders(config) {
            return { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' };
        },
        endpoints: { clientes: '/api/clients', contratos: '/api/contracts', planos: '/api/plans' },
        normalizeResponse(data) {
            return Array.isArray(data) ? data : data.data || data.results || data.items || [];
        },
        normalizeClientes(items) {
            return items.map((c) => ({
                id_externo: c.id,
                nome: c.name || c.razao_social || c.nome || '',
                documento: c.document || c.cpf_cnpj || '',
                email: c.email || '',
                telefone: c.phone || c.telefone || '',
                endereco: c.address || c.endereco || '',
                status: c.status || '',
                _raw: c
            }));
        },
        normalizeContratos(items) {
            return items.map((c) => ({
                id_externo: c.id,
                cliente_id_externo: c.client_id || c.cliente_id,
                plano: c.plan || c.plano || '',
                status: c.status || '',
                valor: c.value || c.valor || 0,
                _raw: c
            }));
        },
        normalizePlanos(items) {
            return items.map((p) => ({
                id_externo: p.id,
                nome: p.name || p.nome || p.description || '',
                valor: p.value || p.valor || 0,
                _raw: p
            }));
        }
    }
};

// ==================== ERP HELPERS ====================

function getErpConfig(tipo) {
    const db = getDB();
    return db.queryGet('SELECT * FROM config_erp WHERE tipo = ? AND ativo = 1 ORDER BY id DESC LIMIT 1', [tipo]);
}

// Mascara headers sensiveis (tokens, senhas) para salvar no log
function _maskSensitiveHeaders(headers) {
    if (!headers) return null;
    const masked = { ...headers };
    const sensitiveKeys = ['authorization', 'ixctoken', 'token', 'cookie', 'x-api-key'];
    for (const key of Object.keys(masked)) {
        if (sensitiveKeys.includes(key.toLowerCase())) {
            const val = String(masked[key]);
            masked[key] = val.length > 12 ? val.substring(0, 8) + '****' + val.substring(val.length - 4) : '****';
        }
    }
    return masked;
}

// Trunca body grande para nao estourar o banco
function _truncBody(body, maxLen) {
    if (!body) return null;
    const str = typeof body === 'string' ? body : JSON.stringify(body);
    if (str.length <= (maxLen || 5000)) return str;
    return str.substring(0, maxLen || 5000) + `... [truncado, total: ${str.length} chars]`;
}

async function erpFetch(config, endpoint, adapter, contexto) {
    const url = `${config.url_base}${endpoint}`;
    const opts = { method: adapter.httpMethod || 'GET' };
    if (adapter.buildHeaders.constructor.name === 'AsyncFunction') {
        opts.headers = await adapter.buildHeaders(config);
    } else {
        opts.headers = adapter.buildHeaders(config);
    }
    if (adapter.buildBody) {
        const body = adapter.buildBody(config);
        if (body) {
            opts.method = opts.method === 'GET' ? 'POST' : opts.method;
            opts.body = JSON.stringify(body);
        }
    }

    const startTime = Date.now();
    let responseBody = null;
    let responseStatus = null;
    let responseHeaders = null;
    let sucesso = 1;
    let erro = null;

    try {
        const response = await fetch(url, opts);
        responseStatus = response.status;
        responseHeaders = Object.fromEntries(response.headers.entries());
        sucesso = response.ok ? 1 : 0;

        if (config._updatedExtras) {
            const db = getDB();
            db.queryRun('UPDATE config_erp SET extras = ? WHERE id = ?', [config._updatedExtras, config.id]);
        }

        // Clonar response para ler body sem consumir o stream original
        const cloned = response.clone();
        try {
            responseBody = await cloned.text();
        } catch {}

        const duracao = Date.now() - startTime;

        // Logar comunicacao (async, nao bloqueia)
        try {
            const db = getDB();
            db.queryRun(
                `INSERT INTO erp_communication_log (erp_tipo, erp_label, direcao, metodo, url, request_headers, request_body, response_status, response_headers, response_body, tempo_resposta_ms, sucesso, erro, contexto)
                 VALUES (?, ?, 'outbound', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    config.tipo,
                    adapter.label,
                    opts.method,
                    url,
                    JSON.stringify(_maskSensitiveHeaders(opts.headers)),
                    _truncBody(opts.body, 3000),
                    responseStatus,
                    _truncBody(responseHeaders, 2000),
                    _truncBody(responseBody, 5000),
                    duracao,
                    sucesso,
                    erro,
                    contexto || null
                ]
            );
        } catch {}

        return response;
    } catch (err) {
        const duracao = Date.now() - startTime;
        erro = err.message;
        sucesso = 0;

        // Logar erro de comunicacao
        try {
            const db = getDB();
            db.queryRun(
                `INSERT INTO erp_communication_log (erp_tipo, erp_label, direcao, metodo, url, request_headers, request_body, response_status, response_headers, response_body, tempo_resposta_ms, sucesso, erro, contexto)
                 VALUES (?, ?, 'outbound', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    config.tipo,
                    adapter.label,
                    opts.method,
                    url,
                    JSON.stringify(_maskSensitiveHeaders(opts.headers)),
                    _truncBody(opts.body, 3000),
                    null,
                    null,
                    null,
                    duracao,
                    0,
                    erro,
                    contexto || null
                ]
            );
        } catch {}

        throw err;
    }
}

// ==================== API: INTEGRACOES ERP (UNIFICADO) ====================

app.get('/api/erp/todos', requireAdmin, (req, res) => {
    const db = getDB();
    const configs = db.queryAll('SELECT tipo, url_base, ativo, ultimo_sync, criado_em FROM config_erp');
    const result = VALID_ERP_TYPES.map((tipo) => {
        const adapter = ERP_ADAPTERS[tipo];
        const cfg = configs.find((c) => c.tipo === tipo);
        return {
            tipo,
            label: adapter.label,
            configurado: !!cfg,
            ativo: cfg ? cfg.ativo : 0,
            url_base: cfg ? cfg.url_base : null,
            ultimo_sync: cfg ? cfg.ultimo_sync : null
        };
    });
    res.json(result);
});

app.get('/api/erp/:tipo/config', requireAdmin, (req, res) => {
    const { tipo } = req.params;
    if (!VALID_ERP_TYPES.includes(tipo)) return res.status(400).json({ erro: 'Tipo de ERP invalido' });
    const db = getDB();
    const adapter = ERP_ADAPTERS[tipo];
    const config = db.queryGet(
        'SELECT id, tipo, url_base, extras, ativo, ultimo_sync, criado_em FROM config_erp WHERE tipo = ? ORDER BY id DESC LIMIT 1',
        [tipo]
    );
    if (!config) {
        return res.json({
            tipo,
            url_base: '',
            extras: '{}',
            ativo: 0,
            label: adapter.label,
            authFields: adapter.authFields,
            extraFields: adapter.extraFields
        });
    }
    let extrasParsed = {};
    try {
        extrasParsed = JSON.parse(config.extras || '{}');
    } catch {}
    delete extrasParsed.access_token;
    delete extrasParsed.token_expires;
    if (extrasParsed.password) extrasParsed.password = '********';
    if (extrasParsed.client_secret) extrasParsed.client_secret = '********';
    if (extrasParsed.basic_pass) extrasParsed.basic_pass = '********';
    res.json({
        ...config,
        extras_parsed: extrasParsed,
        label: adapter.label,
        authFields: adapter.authFields,
        extraFields: adapter.extraFields
    });
});

app.post('/api/erp/:tipo/config', requireAdmin, (req, res) => {
    const { tipo } = req.params;
    if (!VALID_ERP_TYPES.includes(tipo)) return res.status(400).json({ erro: 'Tipo de ERP invalido' });
    const db = getDB();
    const adapter = ERP_ADAPTERS[tipo];
    const { url_base, token, extras } = req.body;
    if (!url_base) return res.status(400).json({ erro: 'URL base obrigatoria' });
    if (adapter.authFields.includes('token') && !token)
        return res.status(400).json({ erro: 'Token obrigatorio para ' + adapter.label });

    const existing = db.queryGet('SELECT id, extras FROM config_erp WHERE tipo = ? LIMIT 1', [tipo]);
    let finalExtras = extras || '{}';
    if (existing && existing.extras) {
        try {
            const newExtras = JSON.parse(extras || '{}');
            const oldExtras = JSON.parse(existing.extras || '{}');
            if (newExtras.password === '********') newExtras.password = oldExtras.password;
            if (newExtras.client_secret === '********') newExtras.client_secret = oldExtras.client_secret;
            if (newExtras.basic_pass === '********') newExtras.basic_pass = oldExtras.basic_pass;
            finalExtras = JSON.stringify(newExtras);
        } catch {}
    }
    if (existing) {
        db.queryRun('UPDATE config_erp SET url_base = ?, token = ?, extras = ?, ativo = 1 WHERE id = ?', [
            url_base,
            token || null,
            finalExtras,
            existing.id
        ]);
    } else {
        db.queryRun('INSERT INTO config_erp (tipo, url_base, token, extras) VALUES (?, ?, ?, ?)', [
            tipo,
            url_base,
            token || null,
            finalExtras
        ]);
    }
    res.json({ ok: true });
});

app.get('/api/erp/:tipo/testar', requireAdmin, async (req, res) => {
    const { tipo } = req.params;
    if (!VALID_ERP_TYPES.includes(tipo)) return res.status(400).json({ erro: 'Tipo de ERP invalido' });
    const adapter = ERP_ADAPTERS[tipo];
    const config = getErpConfig(tipo);
    if (!config) return res.status(400).json({ erro: `${adapter.label} nao configurado` });
    try {
        const r = await erpFetch(config, adapter.testEndpoint, adapter, 'teste_conexao');
        if (r.ok) {
            const db = getDB();
            db.queryRun("UPDATE config_erp SET ultimo_sync = datetime('now','localtime') WHERE id = ?", [config.id]);
            res.json({ ok: true, status: r.status });
        } else {
            const body = await r.text().catch(() => '');
            res.json({
                ok: false,
                status: r.status,
                erro: `HTTP ${r.status}${body ? ': ' + body.substring(0, 200) : ''}`
            });
        }
    } catch (err) {
        res.json({ ok: false, erro: err.message });
    }
});

app.get('/api/erp/:tipo/clientes', requireAdmin, async (req, res) => {
    const { tipo } = req.params;
    const adapter = ERP_ADAPTERS[tipo];
    if (!adapter) return res.status(400).json({ erro: 'ERP invalido' });
    const config = getErpConfig(tipo);
    if (!config) return res.status(400).json({ erro: `${adapter.label} nao configurado` });
    try {
        const r = await erpFetch(config, adapter.endpoints.clientes, adapter, 'consulta_clientes');
        const data = await r.json();
        const raw = adapter.normalizeResponse(data);
        res.json({ raw, normalized: adapter.normalizeClientes(raw) });
    } catch (err) {
        handleError(res, err, `${tipo} clientes`);
    }
});

app.get('/api/erp/:tipo/contratos', requireAdmin, async (req, res) => {
    const { tipo } = req.params;
    const adapter = ERP_ADAPTERS[tipo];
    if (!adapter) return res.status(400).json({ erro: 'ERP invalido' });
    const config = getErpConfig(tipo);
    if (!config) return res.status(400).json({ erro: `${adapter.label} nao configurado` });
    try {
        const r = await erpFetch(config, adapter.endpoints.contratos, adapter, 'consulta_contratos');
        const data = await r.json();
        const raw = adapter.normalizeResponse(data);
        res.json({ raw, normalized: adapter.normalizeContratos(raw) });
    } catch (err) {
        handleError(res, err, `${tipo} contratos`);
    }
});

app.get('/api/erp/:tipo/planos', requireAdmin, async (req, res) => {
    const { tipo } = req.params;
    const adapter = ERP_ADAPTERS[tipo];
    if (!adapter) return res.status(400).json({ erro: 'ERP invalido' });
    const config = getErpConfig(tipo);
    if (!config) return res.status(400).json({ erro: `${adapter.label} nao configurado` });
    try {
        const r = await erpFetch(config, adapter.endpoints.planos, adapter, 'consulta_planos');
        const data = await r.json();
        const raw = adapter.normalizeResponse(data);
        res.json({ raw, normalized: adapter.normalizePlanos(raw) });
    } catch (err) {
        handleError(res, err, `${tipo} planos`);
    }
});

// ==================== API: ERP SYNC AUTOMATICO ====================

app.post('/api/erp/:tipo/sync', requireAdmin, async (req, res) => {
    const { tipo } = req.params;
    const adapter = ERP_ADAPTERS[tipo];
    if (!adapter) return res.status(400).json({ erro: 'ERP invalido' });
    const config = getErpConfig(tipo);
    if (!config) return res.status(400).json({ erro: `${adapter.label} nao configurado` });

    const startTime = Date.now();
    const db = getDB();
    let novos = 0,
        atualizados = 0,
        erros = 0,
        totalRegistros = 0;

    try {
        const r = await erpFetch(config, adapter.endpoints.clientes, adapter, 'sync_clientes');
        const data = await r.json();
        const raw = adapter.normalizeResponse(data);
        const clientes = adapter.normalizeClientes(raw);
        totalRegistros = clientes.length;

        for (const cli of clientes) {
            try {
                const existe = db.queryGet('SELECT id FROM provedores WHERE nome = ?', [cli.nome]);
                if (existe) {
                    // Atualizar dados do ERP (cnpj, email, telefone, endereco)
                    db.queryRun(
                        'UPDATE provedores SET cnpj = COALESCE(?, cnpj), email = COALESCE(?, email), telefone = COALESCE(?, telefone), endereco = COALESCE(?, endereco), erp = ? WHERE id = ?',
                        [
                            cli.documento || null,
                            cli.email || null,
                            cli.telefone || null,
                            cli.endereco || null,
                            tipo,
                            existe.id
                        ]
                    );
                    atualizados++;
                } else if (cli.nome) {
                    db.queryRun(
                        'INSERT INTO provedores (nome, contato, erp, cnpj, email, telefone, endereco) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [
                            cli.nome,
                            cli.telefone || cli.email || '',
                            tipo,
                            cli.documento || null,
                            cli.email || null,
                            cli.telefone || null,
                            cli.endereco || null
                        ]
                    );
                    novos++;
                }
            } catch {
                erros++;
            }
        }

        // Atualizar ultimo_sync
        db.queryRun("UPDATE config_erp SET ultimo_sync = datetime('now','localtime') WHERE tipo = ?", [tipo]);

        const duracao = Date.now() - startTime;
        db.queryRun(
            'INSERT INTO erp_sync_log (tipo, entidade, total_registros, novos, atualizados, erros, duracao_ms, detalhes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
                tipo,
                'clientes',
                totalRegistros,
                novos,
                atualizados,
                erros,
                duracao,
                `Sync manual por ${req.session?.usuario?.nome || 'admin'}`
            ]
        );

        registrarAtividade(
            req,
            'sync',
            'erp',
            null,
            `Sync ${tipo}: ${totalRegistros} registros, ${novos} novos, ${atualizados} existentes`
        );
        res.json({ sucesso: true, total: totalRegistros, novos, atualizados, erros, duracao_ms: duracao });
    } catch (err) {
        const duracao = Date.now() - startTime;
        db.queryRun(
            'INSERT INTO erp_sync_log (tipo, entidade, total_registros, novos, atualizados, erros, duracao_ms, detalhes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [tipo, 'clientes', 0, 0, 0, 1, duracao, `Erro: ${err.message}`]
        );
        handleError(res, err, `Sync ${tipo}`);
    }
});

app.get('/api/erp/:tipo/sync-log', requireAdmin, (req, res) => {
    const db = getDB();
    const { tipo } = req.params;
    res.json(db.queryAll('SELECT * FROM erp_sync_log WHERE tipo = ? ORDER BY criado_em DESC LIMIT 50', [tipo]));
});

app.get('/api/erp/sync-log', requireAdmin, (req, res) => {
    const db = getDB();
    res.json(db.queryAll('SELECT * FROM erp_sync_log ORDER BY criado_em DESC LIMIT 100'));
});

// ==================== API: INTEGRACAO IXC (LEGADO - compatibilidade) ====================

app.get('/api/ixc/config', requireAdmin, (req, res) => {
    const db = getDB();
    let config = db.queryGet(
        'SELECT id, url_base, ativo, ultimo_sync, criado_em FROM config_erp WHERE tipo = ? ORDER BY id DESC LIMIT 1',
        ['ixc']
    );
    if (!config)
        config = db.queryGet(
            'SELECT id, url_base, ativo, ultimo_sync, criado_em FROM config_ixc ORDER BY id DESC LIMIT 1'
        );
    res.json(config || { url_base: '', ativo: 0 });
});

app.post('/api/ixc/config', requireAdmin, (req, res) => {
    const db = getDB();
    const { url_base, token } = req.body;
    if (!url_base || !token) return res.status(400).json({ erro: 'URL e token obrigatorios' });
    const existing = db.queryGet("SELECT id FROM config_erp WHERE tipo = 'ixc' LIMIT 1");
    if (existing) {
        db.queryRun('UPDATE config_erp SET url_base = ?, token = ?, ativo = 1 WHERE id = ?', [
            url_base,
            token,
            existing.id
        ]);
    } else {
        db.queryRun("INSERT INTO config_erp (tipo, url_base, token) VALUES ('ixc', ?, ?)", [url_base, token]);
    }
    const existingOld = db.queryGet('SELECT id FROM config_ixc LIMIT 1');
    if (existingOld)
        db.queryRun('UPDATE config_ixc SET url_base = ?, token = ?, ativo = 1 WHERE id = ?', [
            url_base,
            token,
            existingOld.id
        ]);
    else db.queryRun('INSERT INTO config_ixc (url_base, token) VALUES (?, ?)', [url_base, token]);
    res.json({ ok: true });
});

app.get('/api/ixc/testar', requireAdmin, async (req, res) => {
    const config = getErpConfig('ixc');
    if (!config) return res.status(400).json({ erro: 'IXC nao configurado' });
    try {
        const r = await erpFetch(config, '/cliente', ERP_ADAPTERS.ixc);
        if (r.ok) {
            const db = getDB();
            db.queryRun("UPDATE config_erp SET ultimo_sync = datetime('now','localtime') WHERE id = ?", [config.id]);
            res.json({ ok: true, status: r.status });
        } else {
            res.json({ ok: false, status: r.status, erro: `HTTP ${r.status}` });
        }
    } catch (err) {
        res.json({ ok: false, erro: err.message });
    }
});

app.get('/api/ixc/clientes', requireAdmin, async (req, res) => {
    const config = getErpConfig('ixc');
    if (!config) return res.status(400).json({ erro: 'IXC nao configurado' });
    try {
        const r = await erpFetch(config, '/cliente', ERP_ADAPTERS.ixc);
        const data = await r.json();
        res.json(ERP_ADAPTERS.ixc.normalizeResponse(data));
    } catch (err) {
        handleError(res, err, 'IXC clientes');
    }
});

app.get('/api/ixc/contratos', requireAdmin, async (req, res) => {
    const config = getErpConfig('ixc');
    if (!config) return res.status(400).json({ erro: 'IXC nao configurado' });
    try {
        const r = await erpFetch(config, '/cliente_contrato', ERP_ADAPTERS.ixc);
        const data = await r.json();
        res.json(ERP_ADAPTERS.ixc.normalizeResponse(data));
    } catch (err) {
        handleError(res, err, 'IXC contratos');
    }
});

app.get('/api/ixc/planos', requireAdmin, async (req, res) => {
    const config = getErpConfig('ixc');
    if (!config) return res.status(400).json({ erro: 'IXC nao configurado' });
    try {
        const r = await erpFetch(config, '/vd_servico', ERP_ADAPTERS.ixc);
        const data = await r.json();
        res.json(ERP_ADAPTERS.ixc.normalizeResponse(data));
    } catch (err) {
        handleError(res, err, 'IXC planos');
    }
});

// ==================== API: BASE DE CONHECIMENTO ====================

app.get('/api/kb/categorias', requireAuth, (req, res) => {
    const db = getDB();
    res.json(db.queryAll('SELECT * FROM kb_categorias ORDER BY ordem, nome'));
});

app.post('/api/kb/categorias', requireAuth, (req, res) => {
    const db = getDB();
    const { nome, icone, cor } = req.body;
    if (!nome) return res.status(400).json({ erro: 'Nome obrigatorio' });
    const result = db.queryRun('INSERT INTO kb_categorias (nome, icone, cor) VALUES (?, ?, ?)', [
        nome,
        icone || 'bi-folder',
        cor || '#007bff'
    ]);
    res.status(201).json(db.queryGet('SELECT * FROM kb_categorias WHERE id = ?', [result.lastInsertRowid]));
});

app.delete('/api/kb/categorias/:id', requireAuth, (req, res) => {
    const db = getDB();
    db.queryRun('UPDATE kb_artigos SET categoria_id = NULL WHERE categoria_id = ?', [Number(req.params.id)]);
    db.queryRun('DELETE FROM kb_categorias WHERE id = ?', [Number(req.params.id)]);
    res.json({ sucesso: true });
});

app.get('/api/kb/artigos', requireAuth, (req, res) => {
    const db = getDB();
    const { categoria_id, busca } = req.query;
    let sql = `SELECT a.*, c.nome as categoria_nome, u.nome as autor_nome FROM kb_artigos a LEFT JOIN kb_categorias c ON a.categoria_id = c.id LEFT JOIN usuarios u ON a.autor_id = u.id WHERE a.publicado = 1`;
    const params = [];
    if (categoria_id) {
        sql += ' AND a.categoria_id = ?';
        params.push(Number(categoria_id));
    }
    if (busca) {
        sql += ' AND (a.titulo LIKE ? OR a.tags LIKE ? OR a.conteudo LIKE ?)';
        params.push(`%${busca}%`, `%${busca}%`, `%${busca}%`);
    }
    sql += ' ORDER BY a.atualizado_em DESC';
    res.json(db.queryAll(sql, params));
});

app.get('/api/kb/artigos/:id', requireAuth, (req, res) => {
    const db = getDB();
    const artigo = db.queryGet(
        `SELECT a.*, c.nome as categoria_nome, u.nome as autor_nome FROM kb_artigos a LEFT JOIN kb_categorias c ON a.categoria_id = c.id LEFT JOIN usuarios u ON a.autor_id = u.id WHERE a.id = ?`,
        [Number(req.params.id)]
    );
    if (!artigo) return res.status(404).json({ erro: 'Artigo nao encontrado' });
    db.queryRun('UPDATE kb_artigos SET visualizacoes = visualizacoes + 1 WHERE id = ?', [Number(req.params.id)]);
    artigo.visualizacoes++;
    res.json(artigo);
});

app.post('/api/kb/artigos', requireAuth, (req, res) => {
    const db = getDB();
    const { titulo, conteudo, tags, categoria_id, publicado } = req.body;
    if (!titulo || !conteudo) return res.status(400).json({ erro: 'Titulo e conteudo obrigatorios' });
    const autor_id = req.session?.usuario?.id || null;
    const result = db.queryRun(
        'INSERT INTO kb_artigos (titulo, conteudo, tags, categoria_id, autor_id, publicado) VALUES (?, ?, ?, ?, ?, ?)',
        [
            titulo,
            conteudo,
            tags || null,
            categoria_id ? Number(categoria_id) : null,
            autor_id,
            publicado !== undefined ? Number(publicado) : 1
        ]
    );
    registrarAtividade(req, 'criar', 'conhecimento', result.lastInsertRowid, `Artigo: ${titulo}`);
    res.status(201).json(db.queryGet('SELECT * FROM kb_artigos WHERE id = ?', [result.lastInsertRowid]));
});

app.put('/api/kb/artigos/:id', requireAuth, (req, res) => {
    const db = getDB();
    const { titulo, conteudo, tags, categoria_id, publicado } = req.body;
    db.queryRun(
        `UPDATE kb_artigos SET titulo = ?, conteudo = ?, tags = ?, categoria_id = ?, publicado = ?, atualizado_em = datetime('now','localtime') WHERE id = ?`,
        [
            titulo,
            conteudo,
            tags || null,
            categoria_id ? Number(categoria_id) : null,
            publicado !== undefined ? Number(publicado) : 1,
            Number(req.params.id)
        ]
    );
    registrarAtividade(req, 'editar', 'conhecimento', Number(req.params.id), `Artigo editado: ${titulo}`);
    res.json(db.queryGet('SELECT * FROM kb_artigos WHERE id = ?', [Number(req.params.id)]));
});

app.delete('/api/kb/artigos/:id', requireAuth, (req, res) => {
    const db = getDB();
    db.queryRun('DELETE FROM kb_artigos WHERE id = ?', [Number(req.params.id)]);
    registrarAtividade(req, 'excluir', 'conhecimento', Number(req.params.id), 'Artigo excluido');
    res.json({ sucesso: true });
});

// ==================== API: AGENDA/CALENDARIO ====================

app.get('/api/agenda/eventos', requireAuth, (req, res) => {
    const db = getDB();
    const { mes, ano } = req.query;
    let sql = 'SELECT * FROM agenda_eventos WHERE 1=1';
    const params = [];
    if (mes && ano) {
        sql += ` AND data_inicio LIKE ?`;
        params.push(`${ano}-${String(mes).padStart(2, '0')}%`);
    }
    sql += ' ORDER BY data_inicio';
    res.json(db.queryAll(sql, params));
});

app.get('/api/agenda/eventos/:id', requireAuth, (req, res) => {
    const db = getDB();
    const evento = db.queryGet('SELECT * FROM agenda_eventos WHERE id = ?', [Number(req.params.id)]);
    if (!evento) return res.status(404).json({ erro: 'Evento nao encontrado' });
    res.json(evento);
});

app.post('/api/agenda/eventos', requireAuth, (req, res) => {
    const db = getDB();
    const { titulo, descricao, tipo, data_inicio, data_fim, cor, lembrete_minutos } = req.body;
    if (!titulo || !data_inicio) return res.status(400).json({ erro: 'Titulo e data inicio obrigatorios' });
    const usuario_id = req.session?.usuario?.id || null;
    const result = db.queryRun(
        'INSERT INTO agenda_eventos (titulo, descricao, tipo, data_inicio, data_fim, cor, lembrete_minutos, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
            titulo,
            descricao || null,
            tipo || 'evento',
            data_inicio,
            data_fim || null,
            cor || '#007bff',
            lembrete_minutos || null,
            usuario_id
        ]
    );
    registrarAtividade(req, 'criar', 'agenda', result.lastInsertRowid, `Evento: ${titulo}`);
    res.status(201).json(db.queryGet('SELECT * FROM agenda_eventos WHERE id = ?', [result.lastInsertRowid]));
});

app.put('/api/agenda/eventos/:id', requireAuth, (req, res) => {
    const db = getDB();
    const { titulo, descricao, tipo, data_inicio, data_fim, cor, lembrete_minutos } = req.body;
    db.queryRun(
        'UPDATE agenda_eventos SET titulo = ?, descricao = ?, tipo = ?, data_inicio = ?, data_fim = ?, cor = ?, lembrete_minutos = ? WHERE id = ?',
        [
            titulo,
            descricao || null,
            tipo || 'evento',
            data_inicio,
            data_fim || null,
            cor || '#007bff',
            lembrete_minutos || null,
            Number(req.params.id)
        ]
    );
    registrarAtividade(req, 'editar', 'agenda', Number(req.params.id), `Evento editado: ${titulo}`);
    res.json(db.queryGet('SELECT * FROM agenda_eventos WHERE id = ?', [Number(req.params.id)]));
});

app.delete('/api/agenda/eventos/:id', requireAuth, (req, res) => {
    const db = getDB();
    db.queryRun('DELETE FROM agenda_eventos WHERE id = ?', [Number(req.params.id)]);
    registrarAtividade(req, 'excluir', 'agenda', Number(req.params.id), 'Evento excluido');
    res.json({ sucesso: true });
});

// ==================== API: FINANCEIRO ====================

app.get('/api/financeiro/faturas', requireAuth, (req, res) => {
    const db = getDB();
    const { tipo, status, provedor_id, mes } = req.query;
    let sql =
        'SELECT f.*, p.nome as provedor_nome FROM financeiro_faturas f JOIN provedores p ON f.provedor_id = p.id WHERE 1=1';
    const params = [];
    if (tipo) {
        sql += ' AND f.tipo = ?';
        params.push(tipo);
    }
    if (status) {
        sql += ' AND f.status = ?';
        params.push(status);
    }
    if (provedor_id) {
        sql += ' AND f.provedor_id = ?';
        params.push(Number(provedor_id));
    }
    if (mes) {
        sql += ' AND f.data_vencimento LIKE ?';
        params.push(mes + '%');
    }
    sql += ' ORDER BY f.data_vencimento DESC';
    res.json(db.queryAll(sql, params));
});

app.get('/api/financeiro/faturas/:id', requireAuth, (req, res) => {
    const db = getDB();
    const f = db.queryGet(
        'SELECT f.*, p.nome as provedor_nome FROM financeiro_faturas f JOIN provedores p ON f.provedor_id = p.id WHERE f.id = ?',
        [Number(req.params.id)]
    );
    if (!f) return res.status(404).json({ erro: 'Fatura nao encontrada' });
    res.json(f);
});

app.post('/api/financeiro/faturas', requireAuth, (req, res) => {
    const db = getDB();
    const { provedor_id, descricao, valor, tipo, status, data_vencimento, forma_pagamento, observacoes } = req.body;
    if (!provedor_id || !valor || !data_vencimento)
        return res.status(400).json({ erro: 'Provedor, valor e vencimento obrigatorios' });
    const result = db.queryRun(
        'INSERT INTO financeiro_faturas (provedor_id, descricao, valor, tipo, status, data_vencimento, forma_pagamento, observacoes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
            Number(provedor_id),
            descricao || null,
            Number(valor),
            tipo || 'receita',
            status || 'pendente',
            data_vencimento,
            forma_pagamento || null,
            observacoes || null
        ]
    );
    registrarAtividade(req, 'criar', 'financeiro', result.lastInsertRowid, `Fatura R$${valor} (${tipo})`);
    res.status(201).json(
        db.queryGet(
            'SELECT f.*, p.nome as provedor_nome FROM financeiro_faturas f JOIN provedores p ON f.provedor_id = p.id WHERE f.id = ?',
            [result.lastInsertRowid]
        )
    );
});

app.put('/api/financeiro/faturas/:id', requireAuth, (req, res) => {
    const db = getDB();
    const { provedor_id, descricao, valor, tipo, status, data_vencimento, forma_pagamento, observacoes } = req.body;
    let data_pagamento = null;
    if (status === 'pago') {
        const atual = db.queryGet('SELECT data_pagamento FROM financeiro_faturas WHERE id = ?', [
            Number(req.params.id)
        ]);
        data_pagamento = atual?.data_pagamento || new Date().toISOString().split('T')[0];
    }
    db.queryRun(
        'UPDATE financeiro_faturas SET provedor_id = ?, descricao = ?, valor = ?, tipo = ?, status = ?, data_vencimento = ?, data_pagamento = ?, forma_pagamento = ?, observacoes = ? WHERE id = ?',
        [
            Number(provedor_id),
            descricao || null,
            Number(valor),
            tipo,
            status,
            data_vencimento,
            data_pagamento,
            forma_pagamento || null,
            observacoes || null,
            Number(req.params.id)
        ]
    );
    registrarAtividade(req, 'editar', 'financeiro', Number(req.params.id), `Fatura editada: R$${valor}`);
    res.json(
        db.queryGet(
            'SELECT f.*, p.nome as provedor_nome FROM financeiro_faturas f JOIN provedores p ON f.provedor_id = p.id WHERE f.id = ?',
            [Number(req.params.id)]
        )
    );
});

app.patch('/api/financeiro/faturas/:id/pagar', requireAuth, (req, res) => {
    const db = getDB();
    const hoje = new Date().toISOString().split('T')[0];
    db.queryRun("UPDATE financeiro_faturas SET status = 'pago', data_pagamento = ? WHERE id = ?", [
        hoje,
        Number(req.params.id)
    ]);
    registrarAtividade(req, 'pagar', 'financeiro', Number(req.params.id), 'Fatura marcada como paga');
    res.json(db.queryGet('SELECT * FROM financeiro_faturas WHERE id = ?', [Number(req.params.id)]));
});

app.delete('/api/financeiro/faturas/:id', requireAuth, (req, res) => {
    const db = getDB();
    db.queryRun('DELETE FROM financeiro_faturas WHERE id = ?', [Number(req.params.id)]);
    registrarAtividade(req, 'excluir', 'financeiro', Number(req.params.id), 'Fatura excluida');
    res.json({ sucesso: true });
});

app.get('/api/financeiro/resumo', requireAuth, (req, res) => {
    const db = getDB();
    const mesAtual = new Date().toISOString().substring(0, 7);
    const receitas = db.queryGet(
        "SELECT COALESCE(SUM(valor), 0) as total FROM financeiro_faturas WHERE tipo = 'receita' AND status = 'pago' AND data_vencimento LIKE ?",
        [mesAtual + '%']
    );
    const despesas = db.queryGet(
        "SELECT COALESCE(SUM(valor), 0) as total FROM financeiro_faturas WHERE tipo = 'despesa' AND status = 'pago' AND data_vencimento LIKE ?",
        [mesAtual + '%']
    );
    const inadimplencia = db.queryGet(
        "SELECT COALESCE(SUM(valor), 0) as total FROM financeiro_faturas WHERE status IN ('pendente','vencido') AND data_vencimento < date('now','localtime')"
    );
    res.json({
        receitas: receitas.total,
        despesas: despesas.total,
        saldo: receitas.total - despesas.total,
        inadimplencia: inadimplencia.total
    });
});

// ==================== API: RELATORIOS AVANCADOS ====================

app.get('/api/relatorios/chamados', requireAuth, (req, res) => {
    const db = getDB();
    const { data_inicio, data_fim, provedor_id, categoria } = req.query;
    let sql = `SELECT c.*, p.nome as provedor_nome FROM chamados c JOIN provedores p ON c.provedor_id = p.id WHERE 1=1`;
    const params = [];
    if (data_inicio) {
        sql += ' AND c.data_abertura >= ?';
        params.push(data_inicio);
    }
    if (data_fim) {
        sql += ' AND c.data_abertura <= ?';
        params.push(data_fim + ' 23:59:59');
    }
    if (provedor_id) {
        sql += ' AND c.provedor_id = ?';
        params.push(Number(provedor_id));
    }
    if (categoria) {
        sql += ' AND c.categoria = ?';
        params.push(categoria);
    }
    sql += ' ORDER BY c.data_abertura DESC';
    const chamados = db.queryAll(sql, params);

    const total = chamados.length;
    const resolvidos = chamados.filter((c) => c.status === 'resolvido' || c.status === 'fechado').length;
    const pendentes = chamados.filter((c) => c.status === 'pendente').length;
    const comResolucao = chamados.filter((c) => c.data_resolucao && c.data_abertura);
    const tempoMedio =
        comResolucao.length > 0
            ? (
                  comResolucao.reduce(
                      (acc, c) => acc + (new Date(c.data_resolucao) - new Date(c.data_abertura)) / 86400000,
                      0
                  ) / comResolucao.length
              ).toFixed(1)
            : 0;

    const porCategoria = {};
    const porMes = {};
    chamados.forEach((c) => {
        porCategoria[c.categoria] = (porCategoria[c.categoria] || 0) + 1;
        const mes = (c.data_abertura || '').substring(0, 7);
        if (mes) porMes[mes] = (porMes[mes] || 0) + 1;
    });

    res.json({
        chamados,
        total,
        resolvidos,
        pendentes,
        tempo_medio_dias: tempoMedio,
        por_categoria: porCategoria,
        por_mes: porMes
    });
});

app.get('/api/relatorios/vendas', requireAuth, (req, res) => {
    const db = getDB();
    const { data_inicio, data_fim } = req.query;
    let sql = 'SELECT * FROM vendas_negocios WHERE 1=1';
    const params = [];
    if (data_inicio) {
        sql += ' AND criado_em >= ?';
        params.push(data_inicio);
    }
    if (data_fim) {
        sql += ' AND criado_em <= ?';
        params.push(data_fim + ' 23:59:59');
    }
    sql += ' ORDER BY criado_em DESC';
    const negocios = db.queryAll(sql, params);

    const total = negocios.length;
    const ativados = negocios.filter((n) => n.estagio === 'ativado').length;
    const pipeline = negocios.filter((n) => !['ativado', 'perdido'].includes(n.estagio)).length;
    const valorTotal = negocios.reduce((acc, n) => acc + (n.valor_estimado || 0), 0);

    const porEstagio = {};
    negocios.forEach((n) => {
        porEstagio[n.estagio] = (porEstagio[n.estagio] || 0) + 1;
    });

    res.json({ negocios, total, ativados, pipeline, valor_total: valorTotal, por_estagio: porEstagio });
});

app.get('/api/relatorios/treinamentos', requireAuth, (req, res) => {
    const db = getDB();
    const { data_inicio, data_fim, provedor_id } = req.query;
    let sql = `SELECT t.*, p.nome as provedor_nome FROM treinamentos t JOIN provedores p ON t.provedor_id = p.id WHERE 1=1`;
    const params = [];
    if (data_inicio) {
        sql += ' AND t.data_treinamento >= ?';
        params.push(data_inicio);
    }
    if (data_fim) {
        sql += ' AND t.data_treinamento <= ?';
        params.push(data_fim);
    }
    if (provedor_id) {
        sql += ' AND t.provedor_id = ?';
        params.push(Number(provedor_id));
    }
    sql += ' ORDER BY t.data_treinamento DESC';
    const treinamentos = db.queryAll(sql, params);

    const total = treinamentos.length;
    const realizados = treinamentos.filter((t) => t.status === 'realizado').length;
    const agendados = treinamentos.filter((t) => t.status === 'agendado').length;

    res.json({ treinamentos, total, realizados, agendados });
});

app.get('/api/relatorios/provedores', requireAuth, (req, res) => {
    const db = getDB();
    const provedores = db.queryAll(`
        SELECT p.*,
            (SELECT COUNT(*) FROM chamados c WHERE c.provedor_id = p.id) as total_chamados,
            (SELECT COUNT(*) FROM treinamentos t WHERE t.provedor_id = p.id) as total_treinamentos
        FROM provedores p ORDER BY p.nome
    `);

    const porERP = {};
    const porPlano = {};
    provedores.forEach((p) => {
        const erp = p.erp || 'Sem ERP';
        porERP[erp] = (porERP[erp] || 0) + 1;
        const plano = p.plano || 'Sem Plano';
        porPlano[plano] = (porPlano[plano] || 0) + 1;
    });

    res.json({ provedores, total: provedores.length, por_erp: porERP, por_plano: porPlano });
});

app.get('/api/relatorios/:tipo/csv', requireAuth, (req, res) => {
    const db = getDB();
    const { tipo } = req.params;
    let rows = [],
        headers = [];

    if (tipo === 'chamados') {
        headers = ['ID', 'Provedor', 'Titulo', 'Categoria', 'Prioridade', 'Status', 'Abertura', 'Resolucao'];
        rows = db.queryAll(
            'SELECT c.id, p.nome as provedor, c.titulo, c.categoria, c.prioridade, c.status, c.data_abertura, c.data_resolucao FROM chamados c JOIN provedores p ON c.provedor_id = p.id ORDER BY c.data_abertura DESC'
        );
    } else if (tipo === 'vendas') {
        headers = ['ID', 'Lead', 'Estagio', 'Vendedor', 'Valor', 'Criado'];
        rows = db.queryAll(
            'SELECT id, provedor_nome_lead, estagio, responsavel_vendedor, valor_estimado, criado_em FROM vendas_negocios ORDER BY criado_em DESC'
        );
    } else if (tipo === 'treinamentos') {
        headers = ['ID', 'Provedor', 'Titulo', 'Data', 'Status'];
        rows = db.queryAll(
            'SELECT t.id, p.nome as provedor, t.titulo, t.data_treinamento, t.status FROM treinamentos t JOIN provedores p ON t.provedor_id = p.id ORDER BY t.data_treinamento DESC'
        );
    } else if (tipo === 'provedores') {
        headers = ['ID', 'Nome', 'ERP', 'Plano', 'Contato'];
        rows = db.queryAll('SELECT id, nome, erp, plano, contato FROM provedores ORDER BY nome');
    } else {
        return res.status(400).json({ erro: 'Tipo invalido' });
    }

    const csvLines = [headers.join(';')];
    rows.forEach((r) => {
        csvLines.push(
            Object.values(r)
                .map((v) => `"${(v || '').toString().replace(/"/g, '""')}"`)
                .join(';')
        );
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
        'Content-Disposition',
        `attachment; filename=relatorio_${tipo}_${new Date().toISOString().split('T')[0]}.csv`
    );
    res.send('\uFEFF' + csvLines.join('\n'));
});

// ==================== API: WHATSAPP IA ====================

app.get('/api/whatsapp-ia/config', requireAdmin, (req, res) => {
    const db = getDB();
    let config = db.queryGet('SELECT * FROM whatsapp_ia_config ORDER BY id DESC LIMIT 1');
    if (!config) {
        db.queryRun('INSERT INTO whatsapp_ia_config (ativo) VALUES (0)');
        config = db.queryGet('SELECT * FROM whatsapp_ia_config ORDER BY id DESC LIMIT 1');
    }
    // Nunca retornar api_key completa
    if (config.api_key) config.api_key_preview = config.api_key.substring(0, 8) + '...';
    delete config.api_key;
    res.json(config);
});

app.put('/api/whatsapp-ia/config', requireAdmin, (req, res) => {
    const db = getDB();
    const {
        ativo,
        provedor_ia,
        modelo,
        api_key,
        prompt_sistema,
        max_tokens,
        temperatura,
        contexto_kb,
        auto_responder
    } = req.body;
    const existing = db.queryGet('SELECT id FROM whatsapp_ia_config ORDER BY id DESC LIMIT 1');
    if (existing) {
        let sql =
            'UPDATE whatsapp_ia_config SET ativo = ?, provedor_ia = ?, modelo = ?, prompt_sistema = ?, max_tokens = ?, temperatura = ?, contexto_kb = ?, auto_responder = ?';
        const params = [
            ativo ? 1 : 0,
            provedor_ia || 'openai',
            modelo || 'gpt-3.5-turbo',
            prompt_sistema || '',
            Number(max_tokens) || 500,
            Number(temperatura) || 0.7,
            contexto_kb ? 1 : 0,
            auto_responder ? 1 : 0
        ];
        if (api_key && !api_key.includes('...')) {
            sql += ', api_key = ?';
            params.push(api_key);
        }
        sql += ' WHERE id = ?';
        params.push(existing.id);
        db.queryRun(sql, params);
    }
    registrarAtividade(req, 'editar', 'whatsapp_ia', null, 'Config IA atualizada');
    res.json({ sucesso: true });
});

app.get('/api/whatsapp-ia/historico', requireAdmin, (req, res) => {
    const db = getDB();
    const { limit: lim } = req.query;
    res.json(db.queryAll('SELECT * FROM whatsapp_ia_historico ORDER BY criado_em DESC LIMIT ?', [Number(lim) || 50]));
});

// ==================== API: LGPD / AUDITORIA ====================

// Helper: buscar todos os dados locais de um titular
function buscarDadosTitularLocal(db, { documento, nome }) {
    const resultado = {
        provedores: [],
        chamados: [],
        negocios: [],
        formularios: [],
        consentimentos: [],
        atividades: []
    };
    const docLimpo = documento ? documento.replace(/\D/g, '') : '';

    // Buscar provedores por documento OU nome
    if (docLimpo) {
        resultado.provedores = db.queryAll(
            "SELECT * FROM provedores WHERE REPLACE(REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', ''), ' ', '') LIKE ? OR contato LIKE ?",
            [`%${docLimpo}%`, `%${documento}%`]
        );
    }
    if (nome) {
        const porNome = db.queryAll('SELECT * FROM provedores WHERE nome LIKE ? OR responsavel LIKE ?', [
            `%${nome}%`,
            `%${nome}%`
        ]);
        for (const p of porNome) {
            if (!resultado.provedores.find((x) => x.id === p.id)) resultado.provedores.push(p);
        }
    }

    // Buscar chamados dos provedores encontrados
    for (const p of resultado.provedores) {
        const chamados = db.queryAll(
            'SELECT id, titulo, descricao, categoria, status, prioridade, criado_em, data_resolucao FROM chamados WHERE provedor_id = ?',
            [p.id]
        );
        resultado.chamados.push(...chamados);
    }

    // Buscar negocios/vendas
    if (nome) {
        resultado.negocios = db.queryAll(
            'SELECT id, provedor_nome_lead, contato_lead, estagio, plano_interesse, valor_estimado, criado_em FROM vendas_negocios WHERE provedor_nome_lead LIKE ? OR contato_lead LIKE ?',
            [`%${nome}%`, `%${nome}%`]
        );
    }
    for (const p of resultado.provedores) {
        const neg = db.queryAll(
            'SELECT id, provedor_nome_lead, contato_lead, estagio, plano_interesse, valor_estimado, criado_em FROM vendas_negocios WHERE provedor_id = ?',
            [p.id]
        );
        for (const n of neg) {
            if (!resultado.negocios.find((x) => x.id === n.id)) resultado.negocios.push(n);
        }
    }

    // Buscar formularios de cadastro
    for (const p of resultado.provedores) {
        const forms = db.queryAll(
            'SELECT f.id, f.provedor_nome, f.dados, f.status, f.criado_em, f.preenchido_em FROM formularios_cadastro f JOIN vendas_propostas vp ON f.proposta_id = vp.id WHERE vp.provedor_id = ? OR vp.provedor_nome = ?',
            [p.id, p.nome]
        );
        resultado.formularios.push(...forms);
    }

    // Buscar consentimentos
    for (const p of resultado.provedores) {
        const cons = db.queryAll(
            "SELECT * FROM lgpd_consentimentos WHERE entidade_tipo = 'provedor' AND entidade_id = ?",
            [p.id]
        );
        resultado.consentimentos.push(...cons);
    }

    // Buscar atividades relacionadas
    for (const p of resultado.provedores) {
        const ativ = db.queryAll(
            'SELECT acao, modulo, detalhes, criado_em FROM atividades_log WHERE detalhes LIKE ? ORDER BY criado_em DESC LIMIT 50',
            [`%${p.nome}%`]
        );
        resultado.atividades.push(...ativ);
    }

    return resultado;
}

app.get('/api/lgpd/dados-titular', requireAdmin, (req, res) => {
    const db = getDB();
    const { documento, nome } = req.query;
    if (!documento && !nome) return res.status(400).json({ erro: 'Informe documento ou nome' });
    res.json(buscarDadosTitularLocal(db, { documento, nome }));
});

// Consulta direta ao ERP em tempo real
app.get('/api/lgpd/consulta-erp', requireAdmin, async (req, res) => {
    const db = getDB();
    const { documento, nome } = req.query;
    if (!documento && !nome) return res.status(400).json({ erro: 'Informe documento ou nome' });

    const erpsAtivos = db.queryAll('SELECT * FROM config_erp WHERE ativo = 1');
    if (!erpsAtivos.length) return res.json({ erps: [], mensagem: 'Nenhum ERP configurado' });

    const resultados = [];

    for (const config of erpsAtivos) {
        const adapter = ERP_ADAPTERS[config.tipo];
        if (!adapter) continue;

        try {
            const r = await erpFetch(config, adapter.endpoints.clientes, adapter, 'lgpd_consulta_erp');
            const data = await r.json();
            const raw = adapter.normalizeResponse(data);
            const clientes = adapter.normalizeClientes(raw);

            const docLimpo = documento ? documento.replace(/\D/g, '') : '';
            const nomeLower = nome ? nome.toLowerCase() : '';

            const encontrados = clientes.filter((c) => {
                if (docLimpo && c.documento) {
                    const cDocLimpo = c.documento.replace(/\D/g, '');
                    if (cDocLimpo.includes(docLimpo) || docLimpo.includes(cDocLimpo)) return true;
                }
                if (nomeLower && c.nome && c.nome.toLowerCase().includes(nomeLower)) return true;
                return false;
            });

            if (encontrados.length) {
                // Buscar contratos para cada cliente encontrado
                let contratos = [];
                try {
                    const rc = await erpFetch(config, adapter.endpoints.contratos, adapter, 'lgpd_consulta_contratos');
                    const dc = await rc.json();
                    const rawc = adapter.normalizeResponse(dc);
                    contratos = adapter.normalizeContratos ? adapter.normalizeContratos(rawc) : [];
                } catch {}

                resultados.push({
                    erp: config.tipo,
                    erp_label: adapter.label,
                    clientes: encontrados.map((c) => {
                        const contratosCliente = contratos.filter(
                            (ct) => String(ct.cliente_id_externo) === String(c.id_externo)
                        );
                        return {
                            nome: c.nome,
                            documento: c.documento,
                            email: c.email,
                            telefone: c.telefone,
                            endereco: c.endereco,
                            status: c.status,
                            contratos: contratosCliente.map((ct) => ({
                                plano: ct.plano,
                                status: ct.status,
                                valor: ct.valor
                            }))
                        };
                    })
                });
            }
        } catch (err) {
            resultados.push({ erp: config.tipo, erp_label: adapter?.label || config.tipo, erro: err.message });
        }
    }

    res.json({ erps: resultados });
});

// Exportar todos os dados do titular (portabilidade - Art. 18 LGPD)
app.get('/api/lgpd/exportar-dados', requireAdmin, async (req, res) => {
    const db = getDB();
    const { documento, nome } = req.query;
    if (!documento && !nome) return res.status(400).json({ erro: 'Informe documento ou nome' });

    const dadosLocais = buscarDadosTitularLocal(db, { documento, nome });

    // Tambem buscar dados do ERP se disponivel
    let dadosERP = [];
    const erpsAtivos = db.queryAll('SELECT * FROM config_erp WHERE ativo = 1');
    for (const config of erpsAtivos) {
        const adapter = ERP_ADAPTERS[config.tipo];
        if (!adapter) continue;
        try {
            const r = await erpFetch(config, adapter.endpoints.clientes, adapter, 'lgpd_exportar_dados');
            const data = await r.json();
            const raw = adapter.normalizeResponse(data);
            const clientes = adapter.normalizeClientes(raw);
            const docLimpo = documento ? documento.replace(/\D/g, '') : '';
            const nomeLower = nome ? nome.toLowerCase() : '';
            const encontrados = clientes.filter((c) => {
                if (docLimpo && c.documento && c.documento.replace(/\D/g, '').includes(docLimpo)) return true;
                if (nomeLower && c.nome && c.nome.toLowerCase().includes(nomeLower)) return true;
                return false;
            });
            if (encontrados.length) {
                dadosERP.push({
                    erp: config.tipo,
                    label: adapter.label,
                    clientes: encontrados.map((c) => ({
                        nome: c.nome,
                        documento: c.documento,
                        email: c.email,
                        telefone: c.telefone,
                        endereco: c.endereco,
                        status: c.status
                    }))
                });
            }
        } catch {}
    }

    const exportacao = {
        meta: {
            gerado_em: new Date().toISOString(),
            base_legal: 'Art. 18 LGPD - Direito de acesso e portabilidade',
            consulta: { documento: documento || null, nome: nome || null }
        },
        dados_locais: {
            provedores: dadosLocais.provedores.map((p) => ({
                nome: p.nome,
                cnpj: p.cnpj,
                email: p.email,
                telefone: p.telefone,
                endereco: p.endereco,
                responsavel: p.responsavel,
                plano: p.plano,
                criado_em: p.criado_em
            })),
            chamados: dadosLocais.chamados,
            negocios: dadosLocais.negocios,
            formularios: dadosLocais.formularios.map((f) => {
                try {
                    return { ...f, dados: JSON.parse(f.dados || '{}') };
                } catch {
                    return f;
                }
            }),
            consentimentos: dadosLocais.consentimentos
        },
        dados_erp: dadosERP,
        atividades_recentes: dadosLocais.atividades
    };

    res.setHeader('Content-Disposition', `attachment; filename="lgpd-dados-titular-${Date.now()}.json"`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(exportacao);
});

// Anonimizar dados do titular (direito ao esquecimento - Art. 18 LGPD)
app.post('/api/lgpd/anonimizar', requireAdmin, (req, res) => {
    const db = getDB();
    const { provedor_id, escopo } = req.body;
    if (!provedor_id) return res.status(400).json({ erro: 'Informe o provedor_id' });

    const provedor = db.queryGet('SELECT * FROM provedores WHERE id = ?', [provedor_id]);
    if (!provedor) return res.status(404).json({ erro: 'Provedor nao encontrado' });

    const nomeOriginal = provedor.nome;
    const anonimo = `ANONIMIZADO_${provedor_id}`;
    let registrosAfetados = 0;

    // Anonimizar dados pessoais do provedor
    db.queryRun(
        "UPDATE provedores SET nome = ?, cnpj = '[REMOVIDO]', email = '[REMOVIDO]', telefone = '[REMOVIDO]', endereco = '[REMOVIDO]', contato = '[REMOVIDO]', responsavel = '[REMOVIDO]', observacoes = '[REMOVIDO]', whatsapp = '[REMOVIDO]' WHERE id = ?",
        [anonimo, provedor_id]
    );
    registrosAfetados++;

    if (!escopo || escopo === 'completo') {
        // Anonimizar chamados
        const chamadosCount = db.queryGet('SELECT COUNT(*) as total FROM chamados WHERE provedor_id = ?', [
            provedor_id
        ]);
        if (chamadosCount?.total > 0) {
            db.queryRun("UPDATE chamados SET descricao = '[ANONIMIZADO]' WHERE provedor_id = ?", [provedor_id]);
            registrosAfetados += chamadosCount.total;
        }

        // Anonimizar negocios
        db.queryRun(
            "UPDATE vendas_negocios SET contato_lead = '[REMOVIDO]', observacoes = '[REMOVIDO]' WHERE provedor_id = ?",
            [provedor_id]
        );

        // Anonimizar formularios
        db.queryRun(
            "UPDATE formularios_cadastro SET dados = '[ANONIMIZADO]' WHERE proposta_id IN (SELECT id FROM vendas_propostas WHERE provedor_id = ?)",
            [provedor_id]
        );

        // WhatsApp mensagens usa chat_id, nao provedor_id - limpar pelo nome do provedor se possivel
        try {
            db.queryRun('DELETE FROM whatsapp_mensagens WHERE chat_name LIKE ?', [`%${nomeOriginal}%`]);
        } catch {}
    }

    // Registrar consentimento de exclusao
    db.queryRun(
        "INSERT INTO lgpd_consentimentos (entidade_tipo, entidade_id, tipo_consentimento, consentido, ip, data_consentimento) VALUES ('provedor', ?, 'exclusao_dados', 1, ?, datetime('now','localtime'))",
        [provedor_id, req.ip || '']
    );

    registrarAtividade(
        req,
        'anonimizacao',
        'lgpd',
        provedor_id,
        `Dados anonimizados: ${nomeOriginal} (escopo: ${escopo || 'completo'})`
    );
    res.json({
        sucesso: true,
        registros_afetados: registrosAfetados,
        mensagem: `Dados de "${nomeOriginal}" foram anonimizados`
    });
});

app.post('/api/lgpd/consentimento', requireAdmin, (req, res) => {
    const db = getDB();
    const { entidade_tipo, entidade_id, tipo_consentimento, consentido } = req.body;
    const ip = req.ip || '';
    const result = db.queryRun(
        "INSERT INTO lgpd_consentimentos (entidade_tipo, entidade_id, tipo_consentimento, consentido, ip, data_consentimento) VALUES (?, ?, ?, ?, ?, datetime('now','localtime'))",
        [entidade_tipo, Number(entidade_id), tipo_consentimento, consentido ? 1 : 0, ip]
    );
    registrarAtividade(
        req,
        'consentimento',
        'lgpd',
        result.lastInsertRowid,
        `${tipo_consentimento}: ${consentido ? 'concedido' : 'revogado'}`
    );
    res.status(201).json({ sucesso: true });
});

app.get('/api/lgpd/retencao', requireAdmin, (req, res) => {
    const db = getDB();
    res.json(db.queryAll('SELECT * FROM lgpd_retencao ORDER BY tabela'));
});

app.post('/api/lgpd/retencao', requireAdmin, (req, res) => {
    const db = getDB();
    const { tabela, campo, tempo_retencao_dias, acao } = req.body;
    const result = db.queryRun(
        'INSERT INTO lgpd_retencao (tabela, campo, tempo_retencao_dias, acao) VALUES (?, ?, ?, ?)',
        [tabela, campo || null, Number(tempo_retencao_dias) || 365, acao || 'anonimizar']
    );
    res.status(201).json(db.queryGet('SELECT * FROM lgpd_retencao WHERE id = ?', [result.lastInsertRowid]));
});

app.get('/api/lgpd/relatorio', requireAdmin, (req, res) => {
    const db = getDB();
    const tabelas = ['provedores', 'chamados', 'vendas_negocios', 'whatsapp_mensagens', 'atividades_log'];
    const relatorio = tabelas.map((t) => {
        try {
            const count = db.queryGet(`SELECT COUNT(*) as total FROM ${t}`);
            const retencao = db.queryGet('SELECT * FROM lgpd_retencao WHERE tabela = ? AND ativo = 1', [t]);
            return { tabela: t, registros: count?.total || 0, retencao: retencao || null };
        } catch {
            return { tabela: t, registros: 0, retencao: null };
        }
    });
    const consentimentos = db.queryGet('SELECT COUNT(*) as total FROM lgpd_consentimentos');
    const anonimizados = db.queryGet("SELECT COUNT(*) as total FROM provedores WHERE nome LIKE 'ANONIMIZADO_%'");
    res.json({
        tabelas: relatorio,
        total_consentimentos: consentimentos?.total || 0,
        total_anonimizados: anonimizados?.total || 0
    });
});

// ==================== API: INTEGRACOES EXTERNAS ====================

app.get('/api/integracoes-externas', requireAdmin, (req, res) => {
    const db = getDB();
    const integracoes = db.queryAll('SELECT * FROM integracoes_externas ORDER BY tipo');
    // Mascarar configs sensiveis
    integracoes.forEach((i) => {
        if (i.config) {
            try {
                const cfg = JSON.parse(i.config);
                if (cfg.webhook_url) cfg.webhook_url = cfg.webhook_url.substring(0, 30) + '...';
                if (cfg.api_key) cfg.api_key = cfg.api_key.substring(0, 8) + '...';
                i.config_preview = cfg;
            } catch {
                i.config_preview = {};
            }
        }
    });
    res.json(integracoes);
});

app.post('/api/integracoes-externas', requireAdmin, (req, res) => {
    const db = getDB();
    const { tipo, nome, config, ativo } = req.body;
    if (!tipo) return res.status(400).json({ erro: 'Tipo obrigatorio' });
    const result = db.queryRun('INSERT INTO integracoes_externas (tipo, nome, config, ativo) VALUES (?, ?, ?, ?)', [
        tipo,
        nome || tipo,
        typeof config === 'object' ? JSON.stringify(config) : config || '{}',
        ativo !== undefined ? Number(ativo) : 1
    ]);
    registrarAtividade(req, 'criar', 'integracoes', result.lastInsertRowid, `Integracao: ${tipo}`);
    res.status(201).json(db.queryGet('SELECT * FROM integracoes_externas WHERE id = ?', [result.lastInsertRowid]));
});

app.put('/api/integracoes-externas/:id', requireAdmin, (req, res) => {
    const db = getDB();
    const { tipo, nome, config, ativo } = req.body;
    db.queryRun('UPDATE integracoes_externas SET tipo = ?, nome = ?, config = ?, ativo = ? WHERE id = ?', [
        tipo,
        nome,
        typeof config === 'object' ? JSON.stringify(config) : config || '{}',
        ativo !== undefined ? Number(ativo) : 1,
        Number(req.params.id)
    ]);
    registrarAtividade(req, 'editar', 'integracoes', Number(req.params.id), `Integracao editada: ${tipo}`);
    res.json(db.queryGet('SELECT * FROM integracoes_externas WHERE id = ?', [Number(req.params.id)]));
});

app.delete('/api/integracoes-externas/:id', requireAdmin, (req, res) => {
    const db = getDB();
    db.queryRun('DELETE FROM integracoes_externas WHERE id = ?', [Number(req.params.id)]);
    registrarAtividade(req, 'excluir', 'integracoes', Number(req.params.id), 'Integracao excluida');
    res.json({ sucesso: true });
});

// ==================== API: SLA CONFIG ====================

app.get('/api/sla/config', requireAdmin, (req, res) => {
    const db = getDB();
    res.json(db.queryAll('SELECT * FROM sla_config ORDER BY categoria, prioridade'));
});

app.post('/api/sla/config', requireAdmin, (req, res) => {
    const db = getDB();
    const { categoria, prioridade, tempo_resposta_horas, tempo_resolucao_horas } = req.body;
    if (!categoria || !tempo_resposta_horas || !tempo_resolucao_horas) {
        return res.status(400).json({ erro: 'Categoria e tempos sao obrigatorios' });
    }
    const result = db.queryRun(
        'INSERT INTO sla_config (categoria, prioridade, tempo_resposta_horas, tempo_resolucao_horas) VALUES (?, ?, ?, ?)',
        [categoria, prioridade || 'normal', Number(tempo_resposta_horas), Number(tempo_resolucao_horas)]
    );
    registrarAtividade(req, 'criar', 'sla', result.lastInsertRowid, `SLA: ${categoria}/${prioridade}`);
    res.status(201).json(db.queryGet('SELECT * FROM sla_config WHERE id = ?', [result.lastInsertRowid]));
});

app.put('/api/sla/config/:id', requireAdmin, (req, res) => {
    const db = getDB();
    const { categoria, prioridade, tempo_resposta_horas, tempo_resolucao_horas, ativo } = req.body;
    db.queryRun(
        'UPDATE sla_config SET categoria = ?, prioridade = ?, tempo_resposta_horas = ?, tempo_resolucao_horas = ?, ativo = ? WHERE id = ?',
        [
            categoria,
            prioridade || 'normal',
            Number(tempo_resposta_horas),
            Number(tempo_resolucao_horas),
            ativo !== undefined ? Number(ativo) : 1,
            Number(req.params.id)
        ]
    );
    registrarAtividade(req, 'editar', 'sla', Number(req.params.id), `SLA editado: ${categoria}/${prioridade}`);
    res.json(db.queryGet('SELECT * FROM sla_config WHERE id = ?', [Number(req.params.id)]));
});

app.delete('/api/sla/config/:id', requireAdmin, (req, res) => {
    const db = getDB();
    db.queryRun('DELETE FROM sla_config WHERE id = ?', [Number(req.params.id)]);
    registrarAtividade(req, 'excluir', 'sla', Number(req.params.id), 'Regra SLA excluida');
    res.json({ sucesso: true });
});

app.get('/api/sla/dashboard', requireAuth, (req, res) => {
    const db = getDB();
    const agora = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const total = db.queryGet("SELECT COUNT(*) as total FROM chamados WHERE status NOT IN ('fechado')") || { total: 0 };
    const estourados = db.queryGet(
        "SELECT COUNT(*) as total FROM chamados WHERE sla_estourado = 1 AND status NOT IN ('resolvido','fechado')"
    ) || { total: 0 };
    const dentro = db.queryGet(
        `SELECT COUNT(*) as total FROM chamados WHERE sla_resolucao_limite IS NOT NULL AND sla_resolucao_limite > ? AND sla_estourado = 0 AND status NOT IN ('resolvido','fechado')`,
        [agora]
    ) || { total: 0 };
    const criticos = db.queryGet(
        `SELECT COUNT(*) as total FROM chamados WHERE sla_resolucao_limite IS NOT NULL AND sla_resolucao_limite <= datetime(?, '+2 hours') AND sla_estourado = 0 AND status NOT IN ('resolvido','fechado')`,
        [agora]
    ) || { total: 0 };

    const tempoMedio = db.queryGet(`
        SELECT ROUND(AVG(
            (julianday(COALESCE(sla_respondido_em, data_resolucao)) - julianday(data_abertura)) * 24
        ), 1) as media_horas
        FROM chamados
        WHERE (sla_respondido_em IS NOT NULL OR data_resolucao IS NOT NULL)
        AND data_abertura >= date('now','localtime','-30 days')
    `) || { media_horas: 0 };

    const porPrioridade = db.queryAll(`
        SELECT COALESCE(prioridade, 'normal') as prioridade, COUNT(*) as total,
               SUM(CASE WHEN sla_estourado = 1 THEN 1 ELSE 0 END) as estourados
        FROM chamados WHERE status NOT IN ('fechado')
        GROUP BY prioridade
    `);

    res.json({
        total_abertos: total.total,
        sla_estourados: estourados.total,
        sla_dentro: dentro.total,
        sla_criticos: criticos.total,
        tempo_medio_resposta_horas: tempoMedio.media_horas || 0,
        por_prioridade: porPrioridade
    });
});

// Helper: calcular deadlines SLA ao criar/atualizar chamado
function calcularSLA(categoria, prioridade) {
    const db = getDB();
    const regra = db.queryGet('SELECT * FROM sla_config WHERE categoria = ? AND prioridade = ? AND ativo = 1', [
        categoria,
        prioridade || 'normal'
    ]);
    if (!regra) {
        // Fallback: buscar regra 'normal' da categoria
        const fallback = db.queryGet('SELECT * FROM sla_config WHERE categoria = ? AND prioridade = ? AND ativo = 1', [
            categoria,
            'normal'
        ]);
        return fallback;
    }
    return regra;
}

function calcularDeadline(horasApartirDeAgora) {
    const d = new Date();
    d.setHours(d.getHours() + horasApartirDeAgora);
    return d.toISOString().replace('T', ' ').substring(0, 19);
}

// Processar SLA estourados (roda periodicamente)
function processarSLAEstourados() {
    try {
        const db = getDB();
        const agora = new Date().toISOString().replace('T', ' ').substring(0, 19);
        const estourados = db.queryAll(
            `SELECT c.id, c.titulo, p.nome as provedor_nome FROM chamados c
             JOIN provedores p ON c.provedor_id = p.id
             WHERE c.sla_resolucao_limite IS NOT NULL
             AND c.sla_resolucao_limite < ?
             AND c.sla_estourado = 0
             AND c.status NOT IN ('resolvido','fechado')`,
            [agora]
        );
        for (const ch of estourados) {
            db.queryRun('UPDATE chamados SET sla_estourado = 1 WHERE id = ?', [ch.id]);
            criarNotificacaoParaPerfil(
                'admin',
                'sla',
                'SLA Estourado',
                `Chamado #${ch.id} "${ch.titulo}" (${ch.provedor_nome}) estourou o SLA`,
                '/chamados'
            );
        }
    } catch (e) {
        console.error('SLA check error:', e.message);
    }
}

async function start() {
    await initDB();
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Servidor rodando em http://localhost:${PORT}`);
    });
    setInterval(processarAgendamentos, 30000);
    // Verificar follow-ups a cada 5 minutos
    setInterval(processarFollowUps, 5 * 60 * 1000);
    // Verificar SLA estourados a cada 2 minutos
    setInterval(processarSLAEstourados, 2 * 60 * 1000);
}

// Follow-up automatico: criar tarefas automaticamente
function processarFollowUps() {
    try {
        const db = getDB();

        // 1. Propostas sem resposta: criar tarefa de follow-up
        const cfg = db.queryGet(
            "SELECT * FROM vendas_followup_config WHERE tipo = 'proposta_sem_resposta' AND ativo = 1"
        );
        if (cfg) {
            const dias = parseInt(cfg.dias_apos, 10) || 3;
            const propostas = db.queryAll(
                `SELECT * FROM vendas_propostas WHERE status = 'enviada' AND atualizado_em <= datetime('now','localtime','-' || ? || ' days')`,
                [dias]
            );
            for (const p of propostas) {
                const existe = db.queryGet(
                    "SELECT id FROM vendas_tarefas WHERE titulo LIKE ? AND status = 'pendente'",
                    [`%Follow-up proposta #${p.id}%`]
                );
                if (!existe) {
                    db.queryRun(
                        "INSERT INTO vendas_tarefas (titulo, descricao, tipo, data_hora, responsavel) VALUES (?, ?, 'follow_up', datetime('now','localtime'), ?)",
                        [
                            `Follow-up proposta #${p.id} - ${p.provedor_nome}`,
                            (cfg.mensagem || '').replace('{dias}', dias).replace('{provedor}', p.provedor_nome),
                            p.criado_por || 'Sistema'
                        ]
                    );
                }
            }
        }

        // 2. Negocios parados: criar tarefa de follow-up
        const cfgParado = db.queryGet(
            "SELECT * FROM vendas_followup_config WHERE tipo = 'negocio_parado' AND ativo = 1"
        );
        if (cfgParado) {
            const dias = parseInt(cfgParado.dias_apos, 10) || 7;
            const negocios = db.queryAll(
                `
                SELECT n.*, p.nome as provedor_nome
                FROM vendas_negocios n LEFT JOIN provedores p ON n.provedor_id = p.id
                WHERE n.estagio NOT IN ('ativado','perdido')
                AND julianday('now','localtime') - julianday(n.atualizado_em) >= ?
            `,
                [dias]
            );
            for (const n of negocios) {
                const nomeNegocio = n.provedor_nome_lead || n.provedor_nome || `Lead #${n.id}`;
                const existe = db.queryGet(
                    "SELECT id FROM vendas_tarefas WHERE titulo LIKE ? AND status = 'pendente'",
                    [`%Follow-up negocio #${n.id}%`]
                );
                if (!existe) {
                    const msg = (cfgParado.mensagem || '').replace('{negocio}', nomeNegocio).replace('{dias}', dias);
                    db.queryRun(
                        "INSERT INTO vendas_tarefas (titulo, descricao, negocio_id, tipo, data_hora, responsavel) VALUES (?, ?, ?, 'follow_up', datetime('now','localtime'), ?)",
                        [`Follow-up negocio #${n.id} - ${nomeNegocio}`, msg, n.id, n.responsavel_vendedor || 'Sistema']
                    );
                    // Notificar vendedor
                    const user = db.queryGet('SELECT id FROM usuarios WHERE nome = ?', [n.responsavel_vendedor]);
                    if (user) {
                        db.queryRun(
                            "INSERT INTO notificacoes (usuario_id, tipo, titulo, mensagem, link) VALUES (?, 'follow_up', ?, ?, '/vendas')",
                            [user.id, `Negocio parado: ${nomeNegocio}`, msg]
                        );
                    }
                }
            }
        }

        // 3. Negocios sem interacao
        const cfgSemAtiv = db.queryGet(
            "SELECT * FROM vendas_followup_config WHERE tipo = 'negocio_sem_atividade' AND ativo = 1"
        );
        if (cfgSemAtiv) {
            const dias = parseInt(cfgSemAtiv.dias_apos, 10) || 14;
            const negocios = db.queryAll(`
                SELECT n.*, p.nome as provedor_nome,
                    (SELECT MAX(i.criado_em) FROM vendas_interacoes i WHERE i.negocio_id = n.id) as ultima_interacao
                FROM vendas_negocios n LEFT JOIN provedores p ON n.provedor_id = p.id
                WHERE n.estagio NOT IN ('ativado','perdido')
            `);
            for (const n of negocios) {
                const ultimaData = n.ultima_interacao || n.criado_em;
                if (!ultimaData) continue;
                const diasSem = Math.floor((Date.now() - new Date(ultimaData.replace(' ', 'T')).getTime()) / 86400000);
                if (diasSem < dias) continue;
                const nomeNegocio = n.provedor_nome_lead || n.provedor_nome || `Lead #${n.id}`;
                const existe = db.queryGet(
                    "SELECT id FROM vendas_tarefas WHERE titulo LIKE ? AND status = 'pendente'",
                    [`%Sem interacao #${n.id}%`]
                );
                if (!existe) {
                    const msg = (cfgSemAtiv.mensagem || '')
                        .replace('{negocio}', nomeNegocio)
                        .replace('{dias}', diasSem);
                    db.queryRun(
                        "INSERT INTO vendas_tarefas (titulo, descricao, negocio_id, tipo, data_hora, responsavel) VALUES (?, ?, ?, 'follow_up', datetime('now','localtime'), ?)",
                        [`Sem interacao #${n.id} - ${nomeNegocio}`, msg, n.id, n.responsavel_vendedor || 'Sistema']
                    );
                }
            }
        }

        // 4. NPS automatico: criar pesquisa para chamados resolvidos ha mais de 1 dia
        try {
            const chamadosParaNPS = db.queryAll(`
                SELECT c.id, c.provedor_id FROM chamados c
                WHERE c.status IN ('resolvido','fechado')
                AND c.data_resolucao IS NOT NULL
                AND julianday('now','localtime') - julianday(c.data_resolucao) >= 1
                AND julianday('now','localtime') - julianday(c.data_resolucao) <= 7
                AND c.id NOT IN (SELECT chamado_id FROM nps_pesquisas)
                LIMIT 10
            `);
            for (const ch of chamadosParaNPS) {
                const token = crypto.randomBytes(16).toString('hex');
                db.queryRun('INSERT INTO nps_pesquisas (chamado_id, provedor_id, token) VALUES (?, ?, ?)', [
                    ch.id,
                    ch.provedor_id,
                    token
                ]);
            }
        } catch (e) {
            /* NPS auto-create silently */
        }
    } catch (e) {
        console.error('Follow-up error:', e.message);
    }
}

start().catch((err) => {
    console.error('Erro ao iniciar o servidor:', err);
    process.exit(1);
});
