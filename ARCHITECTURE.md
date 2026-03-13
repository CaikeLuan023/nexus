# Nexus - Arquitetura do Sistema

## Visao Geral

Nexus e uma aplicacao monolitica Node.js/Express para gestao de provedores de internet (ISPs). Serve tanto a API REST quanto o frontend estatico, sem frameworks SPA, bundlers ou transpiladores.

```
┌─────────────────────────────────────────────────────┐
│                    Browser                          │
│  HTML (views/) + CSS (public/css/) + JS (public/js/)│
│  Bootstrap 5.3 + Chart.js 4.x + Vanilla JS         │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP/SSE
┌──────────────────────▼──────────────────────────────┐
│               Express.js (server.js)                │
│  Middleware: Helmet, CSRF, Rate Limit, Session      │
│  100+ rotas API REST + 23 rotas de pagina           │
├─────────────────────────────────────────────────────┤
│             sql.js (database.js)                    │
│  SQLite in-memory com persistencia em disco         │
│  66 tabelas, seeds automaticos                      │
└──────────────────────┬──────────────────────────────┘
                       │
              ┌────────▼────────┐
              │    data.db      │
              │  (SQLite file)  │
              └─────────────────┘
                       │
         ┌─────────────▼──────────────┐
         │   WAHA (Docker container)  │
         │   WhatsApp HTTP API        │
         └────────────────────────────┘
```

## Stack Tecnologico

| Camada | Tecnologia | Versao |
|--------|-----------|--------|
| Runtime | Node.js | 18+ |
| Framework | Express.js | 4.x |
| Banco de Dados | SQLite via sql.js | 1.11 |
| Frontend | Vanilla JavaScript | ES2021 |
| UI Framework | Bootstrap | 5.3.3 |
| Graficos | Chart.js | 4.4.0 |
| WhatsApp | WAHA (Docker) | - |
| Seguranca | Helmet, bcryptjs | - |
| Email | Nodemailer | 8.x |
| PDF | PDFKit | 0.17 |
| Excel | xlsx (SheetJS) | 0.18 |
| 2FA | otplib (TOTP) | 13.x |

## Estrutura de Diretorios

```
gestao-trabalho/
├── server.js              # Servidor Express: rotas, middleware, APIs (~7200 linhas)
├── database.js            # Schema SQLite, inicializacao, seeds (~2500 linhas)
├── kb-seed.js             # Dados de seed da base de conhecimento
├── importar-planilha.js   # Utilitario de importacao de dados
├── package.json           # Dependencias (somente producao)
├── docker-compose.yml     # WAHA (WhatsApp API container)
├── .env                   # Variaveis de ambiente
├── .gitignore
│
├── public/
│   ├── js/                # 24 scripts frontend (carregados via <script>)
│   │   ├── app.js         # Utilidades compartilhadas (api(), sidebar, CSRF, toasts)
│   │   ├── dashboard.js   # Dashboard principal (graficos, exportacao, widgets)
│   │   ├── vendas.js      # Pipeline de vendas, propostas, comissoes
│   │   ├── whatsapp.js    # Gestao de WhatsApp
│   │   ├── atendimento.js # Central de atendimento
│   │   ├── chamados.js    # Sistema de tickets
│   │   ├── configuracoes.js # Configuracoes do sistema
│   │   ├── ponto.js       # Marcador de ponto
│   │   └── [modulo].js    # Um arquivo por modulo
│   ├── css/
│   │   └── style.css      # Estilos globais (~4300 linhas, dark mode incluso)
│   ├── icons/             # Icones SVG para PWA
│   ├── sw.js              # Service Worker (cache offline)
│   └── manifest.json      # Manifesto PWA
│
├── views/                 # 23 templates HTML (sem template engine)
│   ├── index.html         # Dashboard
│   ├── login.html         # Login (pagina publica)
│   └── [modulo].html      # Uma pagina por modulo
│
├── uploads/               # Arquivos enviados (gitignored)
├── backups/               # Backups automaticos do banco
└── data.db                # Banco SQLite (gitignored)
```

## Fluxo de Dados

### Autenticacao

1. `POST /api/login` com email + senha (rate limited: 5 tentativas/15min)
2. Senha verificada com `bcryptjs.compare()`
3. Sessao Express criada (`express-session`) com cookie `httpOnly`, `sameSite: strict`
4. Token CSRF gerado e retornado via `GET /api/csrf-token`
5. 2FA opcional via TOTP (`otplib`) - verificado em `POST /api/login/2fa`
6. Frontend armazena CSRF token e envia em todas as requisicoes POST/PUT/DELETE

### Carregamento de Paginas

```
1. GET /chamados ──► requireAuth() ──► requireModuleAccess('chamados')
                                            │
                                            ▼
                                     res.sendFile('views/chamados.html')
                                            │
                                            ▼
2. Browser carrega HTML ──► <script src="cdn/bootstrap.js">
                           ──► <script src="cdn/chart.js">
                           ──► <script src="/js/app.js">     (utilidades globais)
                           ──► <script src="/js/chamados.js"> (logica do modulo)
                                            │
                                            ▼
3. JS do modulo ──► api('/api/chamados') ──► Renderiza dados no DOM
```

### Padrao API

- Todas as rotas sob `/api/*`
- Autenticacao: `requireAuth`, `requireAdmin`, `requireModuleAccess(modulo)`
- Seguranca: CSRF token obrigatorio em POST/PUT/DELETE
- Resposta sucesso: dados JSON direto (array ou objeto)
- Resposta erro: `{ erro: "mensagem" }` com status HTTP adequado
- O helper `api()` no frontend (app.js) encapsula fetch + CSRF + tratamento de erros

## Banco de Dados

### Arquitetura de Persistencia

sql.js carrega o banco SQLite inteiro em memoria ao iniciar. Alteracoes sao persistidas em disco:
- `setInterval` periodico (a cada 30s)
- Apos cada operacao de escrita critica
- Backup automatico em `backups/` antes de salvar

### Tabelas Principais (66 total)

| Grupo | Tabelas | Descricao |
|-------|---------|-----------|
| **Core** | usuarios, provedores, chamados, projetos, treinamentos | Entidades principais |
| **Vendas** | vendas_negocios, vendas_tarefas, vendas_metas, vendas_propostas, vendas_contratos, vendas_comissoes (+6) | Pipeline completo de CRM |
| **WhatsApp** | whatsapp_mensagens, whatsapp_templates, whatsapp_flows, whatsapp_atendimentos (+8) | Integracao WAHA |
| **Ponto** | ponto_registros, ponto_pausas, ponto_config | Controle de jornada |
| **Config** | config_geral, config_email, config_ixc, config_erp, api_tokens, webhooks_saida | Configuracoes do sistema |
| **Conteudo** | kb_categorias, kb_artigos, agenda_eventos, financeiro_faturas | Base de conhecimento, agenda, financeiro |
| **Seguranca** | permissoes_modulos, lgpd_consentimentos, lgpd_retencao | Permissoes e LGPD |
| **Logs** | atividades_log, api_request_log, webhook_dispatch_log, erp_sync_log | Auditoria |
| **Auxiliares** | anexos, comentarios, notificacoes, chat_mensagens, nps_pesquisas, dashboard_widgets | Funcionalidades transversais |

## Seguranca

### Camadas de Protecao

| Mecanismo | Implementacao |
|-----------|--------------|
| **CSP** | Helmet com `scriptSrc: ['self', 'cdn.jsdelivr.net']` |
| **CSRF** | Token gerado por sessao, validado em POST/PUT/DELETE |
| **Rate Limiting** | Login: 5/15min, envio em massa: 3/min, formularios: 10/15min |
| **Senhas** | bcryptjs com salt rounds automatico |
| **Sessao** | Cookie httpOnly, sameSite strict, secure em producao |
| **XSS** | `escapeHtml()` server-side, sanitizacao client-side |
| **2FA** | TOTP via otplib (Google Authenticator compativel) |
| **Permissoes** | Por modulo (permissoes_modulos) + por perfil (admin, analista, vendedor, etc.) |

### Middleware de Autorizacao

```
requireAuth          ──► Verifica sessao ativa
requireAdmin         ──► Apenas perfil 'admin'
requireVendedorOuAdmin ──► Perfis 'admin' ou 'vendedor'
requireGerenciaOuAdmin ──► Perfis 'admin', 'gestor_atendimento', 'gerente_noc'
requireModuleAccess(m) ──► Verifica permissao do modulo na tabela permissoes_modulos
requireApiToken      ──► Valida token de API externa (header Authorization)
```

## Comunicacao em Tempo Real

### Server-Sent Events (SSE)

```
GET /api/whatsapp/events ──► Conexao persistente SSE
                              │
                              ├── nova_mensagem
                              ├── mensagem_lida
                              ├── status_atendimento
                              ├── ponto.entrada / ponto.saida
                              └── heartbeat (30s)
```

- Usado para: notificacoes WhatsApp, status do ponto, chat interno
- Heartbeat a cada 30s para manter conexao e rastrear usuarios online
- Escolhido SSE sobre WebSocket por ser unidirecional (server → client) e nao precisar de bibliotecas extras

## Modulos do Sistema

| Modulo | Frontend | Backend (server.js) | Descricao |
|--------|----------|---------------------|-----------|
| Dashboard | dashboard.js (966L) | /api/dashboard/* | Metricas, graficos, widgets customizaveis |
| Provedores | provedores.js (498L) | /api/provedores/* | CRUD de ISPs, metricas, historico |
| Chamados | chamados.js (591L) | /api/chamados/* | Tickets, kanban, SLA, anexos |
| Vendas | vendas.js (2289L) | /api/vendas/* | Pipeline CRM, propostas PDF, comissoes |
| WhatsApp | whatsapp.js + atendimento.js | /api/whatsapp/* | Templates, bot, fila, fluxos |
| Treinamentos | treinamentos.js (272L) | /api/treinamentos/* | Agendamento e controle |
| Projetos | projetos.js (429L) | /api/projetos/* | Kanban com prioridades |
| Financeiro | financeiro.js (140L) | /api/financeiro/* | Faturas, receitas, despesas |
| Ponto | ponto.js (720L) | /api/ponto/* | Entrada/saida, pausas, relatorios |
| Configuracoes | configuracoes.js (1129L) | /api/config/* | Geral, email, integracoes, ERP |

## Integracoes Externas

### WhatsApp (WAHA)

- Container Docker com WAHA (WhatsApp HTTP API)
- Webhook de entrada: `POST /api/whatsapp/webhook`
- Envio: HTTP para WAHA API
- Funcionalidades: envio individual/massa, templates, bot automatico, fluxos visuais (Drawflow)

### ERP

Adaptador unificado para 5 ERPs de ISP:
- IXC Provedor, ISPfy, Hubsoft, SGP, Atlaz
- Sincronizacao bidirecional via webhooks e polling
- Logs em `erp_sync_log` e `erp_communication_log`

### API Externa (v1)

- `POST /api/v1/chamados` - Criar chamados via integracao
- `POST /api/v1/ponto/registrar` - Registrar ponto de maquina externa
- Autenticacao via header `Authorization: Bearer {token}`
- Permissoes granulares por token

## Decisoes Arquiteturais

### Por que monolito sem build tools?

- Simplicidade de deploy: `node server.js`
- Sem necessidade de transpilacao ou bundling
- Facil de debugar (sem source maps, sem webpack)
- Adequado para equipe pequena e escopo controlado
- Qualquer desenvolvedor pode entender o fluxo lendo HTML → JS → API

### Por que sql.js em vez de SQLite nativo (better-sqlite3)?

- Nao requer compilacao nativa (node-gyp, Python, Visual Studio Build Tools)
- Instalacao identica em Windows/Linux/Mac
- Trade-off aceito: banco inteiro em memoria (~1MB para este volume de dados)

### Por que SSE em vez de WebSocket?

- Mais simples de implementar com Express puro
- Adequado para fluxo unidirecional (server → client)
- Nao requer biblioteca adicional (socket.io)
- Fallback natural: se SSE falha, polling via API funciona

### Por que vanilla JS em vez de React/Vue?

- Zero overhead de build/deploy
- Paginas sao relativamente independentes (cada modulo e uma pagina)
- Compartilhamento de utilidades via app.js (carregado em todas as paginas)
- Performance: sem virtual DOM, sem bundle JS de 200KB+
- Trade-off: mais codigo repetitivo em templates HTML
