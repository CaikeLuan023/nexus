# Nexus

Sistema de gestao completo para provedores de internet (ISPs). Aplicacao monolitica Node.js/Express com frontend vanilla JS, sem frameworks SPA ou bundlers.

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-sql.js-003B57?logo=sqlite&logoColor=white)
![Bootstrap](https://img.shields.io/badge/Bootstrap-5.3-7952B3?logo=bootstrap&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)

---

## Funcionalidades

- **Dashboard** — Metricas em tempo real com 14 graficos (Chart.js), widgets customizaveis, exportacao CSV/Excel/PDF
- **CRM de Vendas** — Pipeline de oportunidades, propostas com geracao PDF, comissoes e metas
- **Chamados** — Sistema de tickets com SLA, Kanban, anexos e categorias
- **WhatsApp** — Integracao WAHA (Docker) para mensagens automatizadas, bot flows visuais (Drawflow) e fila de atendimento
- **Ponto** — Registro de entrada/saida, pausas, relatorios de presenca
- **Atendimento** — Central unificada com atualizacoes em tempo real via SSE
- **Base de Conhecimento** — Artigos organizados por categoria com busca
- **Projetos** — Gestao de projetos com status e prioridade
- **Treinamentos** — Controle de treinamentos por status e periodo
- **Financeiro** — Faturas e controle financeiro
- **Configuracoes** — Integracoes ERP (IXC, ISPfy, Hubsoft, SGP, Atlaz), email, API tokens, webhooks

## Seguranca

- Helmet.js + Content Security Policy
- CSRF token em todas as requisicoes POST/PUT/DELETE
- Autenticacao por sessao com cookies httpOnly + sameSite strict
- 2FA via TOTP (compativel com Google Authenticator)
- Rate limiting (login: 5 tentativas/15min)
- Senhas com bcryptjs
- Controle de acesso por perfil (admin, vendedor, analista, etc.)
- Escape de HTML server-side contra XSS

## Requisitos

- **Node.js** 18 ou superior
- **Docker** (opcional, para integracao WhatsApp via WAHA)

## Instalacao

```bash
# Clonar o repositorio
git clone https://github.com/CaikeLuan023/nexus.git
cd nexus

# Instalar dependencias
npm install

# Criar arquivo de ambiente
cp .env.example .env
# Editar .env com suas configuracoes
```

### Variaveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
PORT=3000
SESSION_SECRET=<gerar-com-comando-abaixo>
WAHA_API_URL=http://localhost:3001
WAHA_SESSION_NAME=default
WAHA_API_KEY=sua-chave-api
WAHA_WEBHOOK_TOKEN=seu-token-webhook
```

Gerar `SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Uso

```bash
# Producao
npm start

# Desenvolvimento (hot reload)
npm run dev

# Testes
npm test

# Lint
npm run lint

# Formatar codigo
npm run format
```

Acesse `http://localhost:3000` no navegador.

## Estrutura do Projeto

```
nexus/
├── server.js                # Servidor Express (API + rotas de pagina)
├── database.js              # Schema SQLite, inicializacao, seeds
├── kb-seed.js               # Seed da base de conhecimento
├── importar-planilha.js     # Utilitario de importacao de dados
├── package.json
├── docker-compose.yml       # Container WAHA (WhatsApp)
├── .env                     # Variaveis de ambiente
├── ARCHITECTURE.md          # Documentacao de arquitetura
│
├── public/                  # Assets frontend (servidos estaticamente)
│   ├── css/style.css        # Estilos globais + dark mode
│   ├── js/
│   │   ├── app.js           # Utilitarios compartilhados (API, CSRF, toasts)
│   │   ├── dashboard-utils.js  # Constantes e funcoes puras do dashboard
│   │   ├── dashboard/       # Modulos do dashboard (7 arquivos)
│   │   ├── vendas.js        # Pipeline de vendas
│   │   ├── chamados.js      # Sistema de tickets
│   │   ├── whatsapp.js      # Gestao WhatsApp
│   │   ├── ponto.js         # Marcador de ponto
│   │   └── ...              # 1 arquivo por modulo
│   ├── icons/               # Icones SVG (PWA)
│   ├── sw.js                # Service Worker (cache offline)
│   └── manifest.json        # Manifesto PWA
│
├── views/                   # 23 templates HTML
│   ├── index.html           # Dashboard
│   ├── login.html           # Login
│   └── ...                  # 1 pagina por modulo
│
├── tests/                   # Testes unitarios (Jest)
│   └── dashboard-utils.test.js
│
├── uploads/                 # Arquivos enviados por usuarios
└── data.db                  # Banco SQLite (gerado automaticamente)
```

## Stack Tecnica

| Camada | Tecnologia |
|--------|------------|
| Runtime | Node.js 18+ |
| Backend | Express 4.x |
| Banco de Dados | SQLite via sql.js (in-memory + disco) |
| Frontend | Vanilla JS (ES2021) |
| UI | Bootstrap 5.3.3 |
| Graficos | Chart.js 4.4.0 |
| Mensageria | WAHA (WhatsApp HTTP API) |
| Email | Nodemailer |
| PDF | PDFKit + html2pdf.js |
| Planilhas | SheetJS (xlsx) |
| 2FA | otplib (TOTP) |
| Testes | Jest |
| Lint/Format | ESLint + Prettier |

## Banco de Dados

SQLite in-memory com persistencia automatica em disco a cada 30 segundos e apos escritas criticas. Backup automatico antes de cada salvamento.

**66 tabelas** cobrindo: usuarios, provedores, chamados, projetos, treinamentos, pipeline de vendas, WhatsApp, ponto, configuracoes, base de conhecimento, financeiro, auditoria e LGPD.

## API

- **100+ endpoints** REST sob `/api/*`
- Autenticacao via middleware de sessao
- CSRF obrigatorio para mutacoes
- Respostas de sucesso: JSON direto
- Respostas de erro: `{ "erro": "mensagem" }`
- Comunicacao em tempo real via **Server-Sent Events (SSE)**

## Licenca

MIT
