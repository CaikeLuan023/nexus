# Nexus - Documentacao Completa

Sistema web para gestao de provedores de internet, chamados, treinamentos, projetos e comunicacao via WhatsApp.

---

## Indice

1. [Visao Geral](#visao-geral)
2. [Requisitos](#requisitos)
3. [Instalacao e Configuracao](#instalacao-e-configuracao)
4. [Estrutura do Projeto](#estrutura-do-projeto)
5. [Banco de Dados](#banco-de-dados)
6. [Autenticacao e Usuarios](#autenticacao-e-usuarios)
7. [Modulos do Sistema](#modulos-do-sistema)
   - [Dashboard](#dashboard)
   - [Provedores](#provedores)
   - [Chamados](#chamados)
   - [Treinamentos](#treinamentos)
   - [Projetos](#projetos)
   - [Historico](#historico)
   - [WhatsApp](#whatsapp)
   - [Usuarios](#usuarios)
8. [WhatsApp - Funcionalidades Detalhadas](#whatsapp---funcionalidades-detalhadas)
9. [API - Rotas Completas](#api---rotas-completas)
10. [Docker e WAHA](#docker-e-waha)

---

## Visao Geral

| Item | Detalhe |
|---|---|
| **Nome** | Nexus |
| **Tipo** | Aplicacao Web (SPA-like com server-side rendering) |
| **Backend** | Node.js v24+ com Express.js |
| **Banco** | SQLite via sql.js (arquivo `data.db`) |
| **Frontend** | HTML5, Bootstrap 5.3, Chart.js, JavaScript puro |
| **WhatsApp** | WAHA (WhatsApp HTTP API) via Docker |
| **Porta** | 3000 (app) / 3001 (WAHA) |

### Funcionalidades Principais

- Gestao de **184+ provedores** de internet com dados completos
- Sistema de **chamados** com categorias, status e resolucao
- Controle de **treinamentos** com agendamento e status
- Gestao de **projetos** com prioridade e acompanhamento
- **Dashboard** com graficos e metricas em tempo real
- **WhatsApp integrado** com chat, bot, templates, agendamento, metricas e mais
- **Autenticacao** com perfis Admin e Analista
- **Historico** unificado por provedor (timeline)
- **Exportacao** de dados em CSV e Excel

---

## Requisitos

- **Node.js** v18+ (recomendado v24 para fetch nativo)
- **Docker Desktop** (para WAHA/WhatsApp)
- **Windows 10/11** (testado)
- **Navegador moderno** (Chrome, Edge, Firefox)

### Dependencias npm

| Pacote | Versao | Funcao |
|---|---|---|
| express | ^4.21.0 | Framework web |
| sql.js | ^1.11.0 | SQLite em JavaScript puro |
| bcryptjs | ^3.0.3 | Hash de senhas |
| express-session | ^1.19.0 | Gerenciamento de sessoes |
| dotenv | ^16.4.0 | Variaveis de ambiente |
| multer | ^1.4.5 | Upload de arquivos |
| xlsx | ^0.18.5 | Importacao de planilhas |

---

## Instalacao e Configuracao

### 1. Clonar/Copiar o projeto

```bash
cd C:\Users\gaiam\gestao-trabalho
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variaveis de ambiente

O arquivo `.env` na raiz do projeto:

```env
PORT=3000
SESSION_SECRET=gestao-trabalho-session-secret-2024
WAHA_API_URL=http://localhost:3001
WAHA_SESSION_NAME=default
WAHA_API_KEY=gestao-trabalho-waha-key
```

### 4. Iniciar o WAHA (WhatsApp)

```bash
docker compose up -d
```

### 5. Iniciar o servidor

```bash
npm start
# ou para desenvolvimento com auto-reload:
npm run dev
```

### 6. Acessar o sistema

- **Sistema:** http://localhost:3000
- **WAHA Dashboard:** http://localhost:3001/dashboard

### 7. Login padrao

| Campo | Valor |
|---|---|
| Usuario | `caike.luan` |
| Senha | `admin123` |

---

## Estrutura do Projeto

```
gestao-trabalho/
├── .env                    # Variaveis de ambiente
├── .gitignore              # Arquivos ignorados pelo Git
├── database.js             # Configuracao do banco SQLite (sql.js)
├── docker-compose.yml      # Container WAHA (WhatsApp)
├── importar-planilha.js    # Script de importacao de provedores via Excel
├── package.json            # Dependencias e scripts npm
├── server.js               # Servidor Express (~890 linhas) - todas as rotas
│
├── public/                 # Arquivos estaticos (CSS, JS)
│   ├── css/
│   │   └── style.css       # Estilos globais (~1050 linhas)
│   └── js/
│       ├── app.js          # Utilitarios compartilhados (api, toast, sidebar, export)
│       ├── chamados.js     # Logica da pagina de chamados
│       ├── dashboard.js    # Graficos e metricas do dashboard
│       ├── historico.js    # Timeline por provedor
│       ├── projetos.js     # CRUD de projetos
│       ├── provedores.js   # CRUD de provedores
│       ├── treinamentos.js # CRUD de treinamentos
│       ├── usuarios.js     # Gerenciamento de usuarios (admin)
│       └── whatsapp.js     # WhatsApp completo (~580 linhas)
│
├── views/                  # Paginas HTML
│   ├── chamados.html
│   ├── historico.html
│   ├── index.html          # Dashboard
│   ├── login.html          # Pagina de login
│   ├── projetos.html
│   ├── provedores.html
│   ├── treinamentos.html
│   ├── usuarios.html       # Admin only
│   └── whatsapp.html       # Interface WhatsApp completa
│
├── uploads/                # Anexos de chamados (criado automaticamente)
└── data.db                 # Banco SQLite (criado automaticamente)
```

---

## Banco de Dados

O banco e um arquivo SQLite (`data.db`) gerenciado pelo **sql.js**. Todas as tabelas sao criadas automaticamente na primeira execucao.

### Tabelas

#### `provedores`
| Coluna | Tipo | Descricao |
|---|---|---|
| id | INTEGER PK | ID auto-incremento |
| nome | TEXT UNIQUE | Nome fantasia do provedor |
| contato | TEXT | Informacoes de contato |
| observacoes | TEXT | Observacoes gerais |
| plano | TEXT | Plano contratado |
| adicionais | TEXT | Servicos adicionais |
| modelo_integracao | TEXT | Modelo de integracao (IXC, SGP, etc.) |
| erp | TEXT | Sistema ERP utilizado |
| responsavel | TEXT | Analista responsavel |
| logo_url | TEXT | URL da logo |
| whatsapp | TEXT | Numero de WhatsApp |
| criado_em | TEXT | Data de criacao |

#### `chamados`
| Coluna | Tipo | Descricao |
|---|---|---|
| id | INTEGER PK | ID auto-incremento |
| provedor_id | INTEGER FK | Referencia ao provedor |
| titulo | TEXT | Titulo do chamado |
| descricao | TEXT | Descricao detalhada |
| categoria | TEXT | usuario, app, integracao, canal, troca_senha, email_ativacao, outro |
| status | TEXT | pendente, em_andamento, resolvido, fechado |
| data_abertura | TEXT | Data de abertura |
| data_resolucao | TEXT | Data de resolucao |
| resolucao | TEXT | Descricao da resolucao |
| criado_em | TEXT | Data de criacao |

#### `anexos`
| Coluna | Tipo | Descricao |
|---|---|---|
| id | INTEGER PK | ID auto-incremento |
| chamado_id | INTEGER FK | Referencia ao chamado (CASCADE) |
| nome_arquivo | TEXT | Nome original do arquivo |
| caminho | TEXT | Caminho no servidor |
| tipo_mime | TEXT | Tipo MIME |
| tamanho | INTEGER | Tamanho em bytes |

#### `treinamentos`
| Coluna | Tipo | Descricao |
|---|---|---|
| id | INTEGER PK | ID auto-incremento |
| provedor_id | INTEGER FK | Referencia ao provedor |
| titulo | TEXT | Titulo do treinamento |
| descricao | TEXT | Descricao |
| data_treinamento | TEXT | Data agendada |
| hora_treinamento | TEXT | Hora agendada |
| status | TEXT | agendado, pendente, realizado |
| criado_em | TEXT | Data de criacao |

#### `projetos`
| Coluna | Tipo | Descricao |
|---|---|---|
| id | INTEGER PK | ID auto-incremento |
| titulo | TEXT | Titulo do projeto |
| descricao | TEXT | Descricao |
| provedor_id | INTEGER FK | Provedor vinculado (opcional) |
| provedor_manual | TEXT | Nome manual do provedor |
| status | TEXT | em_andamento, pausado, concluido, cancelado |
| prioridade | TEXT | baixa, media, alta |
| data_inicio | TEXT | Data de inicio |
| data_previsao | TEXT | Data de previsao |

#### `usuarios`
| Coluna | Tipo | Descricao |
|---|---|---|
| id | INTEGER PK | ID auto-incremento |
| nome | TEXT | Nome completo |
| usuario | TEXT UNIQUE | Login |
| senha | TEXT | Hash bcrypt da senha |
| perfil | TEXT | admin ou analista |
| ativo | INTEGER | 1 = ativo, 0 = inativo |

#### `whatsapp_templates`
| Coluna | Tipo | Descricao |
|---|---|---|
| id | INTEGER PK | ID auto-incremento |
| nome | TEXT | Nome do template |
| texto | TEXT | Texto com variaveis ({provedor}, {titulo}, etc.) |
| categoria | TEXT | geral, chamados, treinamentos, projetos |

#### `whatsapp_auto_respostas`
| Coluna | Tipo | Descricao |
|---|---|---|
| id | INTEGER PK | ID auto-incremento |
| palavra_chave | TEXT | Palavras-chave separadas por virgula |
| resposta | TEXT | Texto da resposta automatica |
| ativo | INTEGER | 1 = ativo, 0 = inativo |

#### `whatsapp_notificacoes`
| Coluna | Tipo | Descricao |
|---|---|---|
| id | INTEGER PK | ID auto-incremento |
| tipo | TEXT | chamado_aberto, chamado_resolvido, treinamento_agendado, projeto_atualizado |
| ativo | INTEGER | 1 = ativo, 0 = inativo |
| chat_id | TEXT | Chat ID destino (ex: 5511999999999@c.us) |
| mensagem_template | TEXT | Template da mensagem |

#### `whatsapp_provedores`
| Coluna | Tipo | Descricao |
|---|---|---|
| id | INTEGER PK | ID auto-incremento |
| provedor_id | INTEGER FK UNIQUE | Referencia ao provedor (CASCADE) |
| chat_id | TEXT | Chat ID do WhatsApp vinculado |

#### `whatsapp_agendamentos`
| Coluna | Tipo | Descricao |
|---|---|---|
| id | INTEGER PK | ID auto-incremento |
| chat_id | TEXT | Chat ID destino |
| chat_nome | TEXT | Nome do contato |
| texto | TEXT | Mensagem a enviar |
| data_envio | TEXT | Data/hora programada |
| status | TEXT | pendente, enviado, erro |

#### `whatsapp_metricas`
| Coluna | Tipo | Descricao |
|---|---|---|
| id | INTEGER PK | ID auto-incremento |
| tipo | TEXT | enviada ou recebida |
| chat_id | TEXT | Chat ID |
| chat_nome | TEXT | Nome do contato |
| timestamp | TEXT | Data/hora da mensagem |

### Indices

- `idx_chamados_provedor` - chamados.provedor_id
- `idx_chamados_categoria` - chamados.categoria
- `idx_chamados_status` - chamados.status
- `idx_anexos_chamado` - anexos.chamado_id
- `idx_whatsapp_provedores` - whatsapp_provedores.chat_id
- `idx_whatsapp_agendamentos_status` - whatsapp_agendamentos.status
- `idx_whatsapp_metricas_tipo` - whatsapp_metricas.tipo

### Dados Iniciais (Seed)

- **Admin:** caike.luan / admin123 (perfil admin)
- **7 templates** padrao de mensagem WhatsApp
- **4 notificacoes** padrao (chamado aberto/resolvido, treinamento agendado, projeto atualizado)

---

## Autenticacao e Usuarios

### Fluxo de Autenticacao

1. Usuario acessa qualquer pagina
2. Middleware `requireAuth` verifica sessao
3. Se nao autenticado: redireciona para `/login`
4. Login via `POST /api/login` com usuario + senha
5. Sessao criada com cookie de **8 horas**
6. Logout via `POST /api/logout` destroi a sessao

### Perfis

| Perfil | Acesso |
|---|---|
| **Admin** | Acesso total + gerenciamento de usuarios |
| **Analista** | Acesso total exceto gerenciar usuarios |

### Rotas Publicas (sem autenticacao)

- `GET /login` - Pagina de login
- `POST /api/login` - Endpoint de autenticacao
- `POST /api/logout` - Endpoint de logout
- `POST /api/whatsapp/webhook` - Webhook do WAHA (Docker)

### Protecao

- `requireAuth` - Todas as rotas apos a barreira
- `requireAdmin` - Apenas rotas de `/usuarios` e `/api/usuarios`

---

## Modulos do Sistema

### Dashboard

**Rota:** `GET /`

Pagina principal com visao geral do sistema:

- **6 cards de resumo:** Provedores, Chamados, Pendentes, Resolvidos, Treinamentos, Projetos Ativos
- **Graficos de provedores:** Por responsavel, modelo de integracao, ERP, plano
- **Graficos de treinamentos:** Por status, por mes
- **Graficos de chamados:** Por provedor, por categoria, por mes
- **Graficos de projetos:** Por status
- **Exportacao:** CSV e Excel com todas as metricas

### Provedores

**Rota:** `GET /provedores`

Gerenciamento completo de provedores de internet:

- Listagem com busca e filtros
- CRUD completo (criar, editar, excluir)
- Campos: nome, contato, plano, adicionais, modelo de integracao, ERP, responsavel, logo, WhatsApp
- Importacao em massa via planilha Excel (`importar-planilha.js`)
- **184 provedores** importados da planilha "Acompanhamento de Clientes.xlsx"

### Chamados

**Rota:** `GET /chamados`

Sistema de tickets de suporte:

- Filtros: status, provedor, categoria, periodo
- Categorias: Usuario, App, Integracao, Canal, Troca de Senha, Email Ativacao, Outro
- Status: Pendente, Em Andamento, Resolvido, Fechado
- Anexos (upload de ate 10 arquivos por chamado)
- Resolucao com data automatica
- Notificacao WhatsApp automatica ao abrir/resolver

### Treinamentos

**Rota:** `GET /treinamentos`

Controle de treinamentos por provedor:

- Agendamento com data e hora
- Status: Agendado, Pendente, Realizado
- Vinculado a provedor
- Notificacao WhatsApp ao agendar

### Projetos

**Rota:** `GET /projetos`

Gestao de projetos:

- Status: Em Andamento, Pausado, Concluido, Cancelado
- Prioridade: Baixa, Media, Alta
- Vinculado a provedor (opcional)
- Data de inicio e previsao
- Notificacao WhatsApp ao atualizar

### Historico

**Rota:** `GET /historico`

Timeline unificada por provedor:

- Mostra chamados, treinamentos e projetos em ordem cronologica
- Visual de timeline com dots coloridos por tipo
- Busca por provedor

### Usuarios

**Rota:** `GET /usuarios` (Admin only)

Gerenciamento de usuarios do sistema:

- Criar usuario (nome, login, senha, perfil)
- Editar usuario (senha opcional)
- Ativar/Desativar (sem excluir)
- Perfis: Admin ou Analista

---

## WhatsApp - Funcionalidades Detalhadas

O modulo WhatsApp e o mais completo do sistema, com **8 abas** de funcionalidades:

### Aba 1: Chat

Interface de conversas estilo WhatsApp:

- **Lista de contatos** com busca, avatar (pessoa/grupo), preview da ultima mensagem, badge de nao-lidas
- **Area de mensagens** com bolhas enviadas (verde) e recebidas (branco)
- **Formatacao WhatsApp** renderizada: `*negrito*`, `_italico_`, `~riscado~`, `` ```mono``` ``
- **Responder mensagem** (reply) com preview
- **Reagir com emoji** (👍 ❤️ 😂 😮 😢 🙏)
- **Encaminhar mensagem** para outro contato
- **Envio de arquivos** (imagens, videos, audios, documentos)
- **Download de midia** recebida
- **Indicador de digitando** em tempo real
- **Marcacao de lido** automatica ao abrir conversa
- **Scroll infinito** - carregar mensagens anteriores (50 em 50)
- **Busca no chat** - pesquisar mensagens dentro da conversa com highlight
- **Busca global** - pesquisar em todas as conversas
- **Exportar conversa** em .txt ou .csv (ate 500 mensagens)
- **Vincular a provedor** diretamente do chat
- **Badge de provedor** no header quando chat vinculado
- **Respostas rapidas (/)** - digitar `/` abre popup de templates
- **Barra de formatacao** com botoes: Negrito, Italico, Riscado, Mono
- **Som de notificacao** para mensagens recebidas
- **SSE (Server-Sent Events)** para atualizacoes em tempo real

### Aba 2: Templates

Mensagens predefinidas reutilizaveis:

- CRUD completo (criar, editar, excluir)
- Categorias: Geral, Chamados, Treinamentos, Projetos
- Variaveis dinamicas: `{id}`, `{titulo}`, `{provedor}`, `{categoria}`, `{status}`, `{resolucao}`, `{data}`, `{hora}`
- Acesso rapido via botao no chat ou digitando `/`
- 7 templates padrao incluidos

### Aba 3: Bot (Respostas Automaticas)

Respostas automaticas baseadas em palavras-chave:

- CRUD de regras (palavra-chave + resposta)
- Palavras-chave separadas por virgula
- Ativar/desativar regras individualmente
- Processamento no webhook (resposta instantanea)

### Aba 4: Notificacoes

Notificacoes automaticas do sistema via WhatsApp:

- **Chamado aberto** - quando um novo chamado e criado
- **Chamado resolvido** - quando um chamado e resolvido
- **Treinamento agendado** - quando um treinamento e agendado
- **Projeto atualizado** - quando o status de um projeto muda
- Configuravel: ativar/desativar, chat destino, template de mensagem

### Aba 5: Envio em Massa

Envio de mensagens para multiplos contatos:

- Selecao individual ou "selecionar todos"
- Filtra apenas contatos (exclui grupos)
- Usar template predefinido
- Intervalo configuravel entre mensagens (minimo 2s)
- Barra de progresso em tempo real
- Alerta de moderacao para evitar bloqueio

### Aba 6: Agendamentos

Mensagens programadas para envio futuro:

- Selecionar contato, escrever mensagem, definir data/hora
- Tabela com status: Pendente, Enviado, Erro
- Cancelar agendamentos pendentes
- **Cron automatico** a cada 30 segundos verifica e envia

### Aba 7: Vinculos (WhatsApp ↔ Provedores)

Associar conversas do WhatsApp a provedores:

- Vincular contato a provedor cadastrado
- Badge no chat mostrando provedor vinculado
- Link direto para abrir pagina do provedor
- Abrir chat direto da lista de vinculos
- Opcao de vincular diretamente pelo menu do chat

### Aba 8: Metricas

Dashboard de uso do WhatsApp:

- **3 cards:** Mensagens enviadas, recebidas, total
- **Grafico de barras:** Mensagens por dia (ultimos 30 dias) - enviadas vs recebidas
- **Top 10 contatos** mais ativos
- Dados coletados automaticamente via webhook

### Sidebar: Badge de Nao-Lidas

- Badge verde no link "WhatsApp" da sidebar
- Mostra total de mensagens nao lidas
- Atualiza a cada 30 segundos e via SSE em tempo real

### Infraestrutura Tecnica do WhatsApp

#### WAHA (WhatsApp HTTP API)
- Container Docker `devlikeapro/waha`
- Engine: WEBJS
- Porta: 3001
- Autenticacao: API Key (`gestao-trabalho-waha-key`)
- Webhook: `http://host.docker.internal:3000/api/whatsapp/webhook`
- Eventos: message, message.reaction, session.status, presence.update

#### Cache de Chats
- Cache server-side de **15 segundos** para a lista de conversas
- Evita chamadas repetidas ao WAHA (~854KB de dados por request)
- Timeout de 90 segundos para o primeiro carregamento
- Ordenacao e limitacao feitas no servidor

#### SSE (Server-Sent Events)
- Conexao persistente `/api/whatsapp/events`
- Recebe mensagens, reacoes, status de sessao, presenca em tempo real
- Reconexao automatica em caso de erro (5s delay)

---

## API - Rotas Completas

### Autenticacao

| Metodo | Rota | Descricao | Auth |
|---|---|---|---|
| GET | `/login` | Pagina de login | Publica |
| POST | `/api/login` | Login (usuario + senha) | Publica |
| POST | `/api/logout` | Logout | Publica |
| GET | `/api/me` | Info do usuario logado | Auth |

### Provedores

| Metodo | Rota | Descricao |
|---|---|---|
| GET | `/api/provedores` | Listar todos (com busca ?busca=) |
| GET | `/api/provedores/:id` | Detalhes + contagem chamados/treinamentos |
| POST | `/api/provedores` | Criar provedor |
| PUT | `/api/provedores/:id` | Editar provedor |
| DELETE | `/api/provedores/:id` | Excluir (se nao tem chamados) |

### Chamados

| Metodo | Rota | Descricao |
|---|---|---|
| GET | `/api/chamados` | Listar (filtros: status, provedor_id, categoria, data_inicio, data_fim) |
| GET | `/api/chamados/:id` | Detalhes + anexos |
| POST | `/api/chamados` | Criar chamado (dispara notificacao) |
| PUT | `/api/chamados/:id` | Editar chamado |
| DELETE | `/api/chamados/:id` | Excluir (remove anexos) |

### Anexos

| Metodo | Rota | Descricao |
|---|---|---|
| POST | `/api/chamados/:id/anexos` | Upload de ate 10 arquivos |
| DELETE | `/api/anexos/:id` | Excluir anexo |

### Treinamentos

| Metodo | Rota | Descricao |
|---|---|---|
| GET | `/api/treinamentos` | Listar (filtro: provedor_id) |
| POST | `/api/treinamentos` | Criar (dispara notificacao) |
| PUT | `/api/treinamentos/:id` | Editar |
| PATCH | `/api/treinamentos/:id/status` | Atualizar status |
| DELETE | `/api/treinamentos/:id` | Excluir |

### Projetos

| Metodo | Rota | Descricao |
|---|---|---|
| GET | `/api/projetos` | Listar (filtro: status) |
| POST | `/api/projetos` | Criar |
| PUT | `/api/projetos/:id` | Editar (dispara notificacao) |
| DELETE | `/api/projetos/:id` | Excluir |

### Dashboard

| Metodo | Rota | Descricao |
|---|---|---|
| GET | `/api/dashboard/resumo` | Cards de resumo |
| GET | `/api/dashboard/chamados-por-provedor` | Grafico: chamados por provedor |
| GET | `/api/dashboard/chamados-por-categoria` | Grafico: chamados por categoria |
| GET | `/api/dashboard/chamados-por-mes` | Grafico: chamados por mes |
| GET | `/api/dashboard/chamados-recentes` | Ultimos 10 chamados |
| GET | `/api/dashboard/chamados-abertos-por-provedor` | Chamados abertos agrupados |
| GET | `/api/dashboard/provedores-por-responsavel` | Grafico: provedores por responsavel |
| GET | `/api/dashboard/provedores-por-modelo` | Grafico: por modelo integracao |
| GET | `/api/dashboard/provedores-por-erp` | Grafico: por ERP |
| GET | `/api/dashboard/provedores-por-plano` | Grafico: por plano |
| GET | `/api/dashboard/treinamentos-por-status` | Grafico: treinamentos por status |
| GET | `/api/dashboard/treinamentos-por-mes` | Grafico: treinamentos por mes |
| GET | `/api/dashboard/projetos-por-status` | Grafico: projetos por status |
| GET | `/api/dashboard/projetos-por-prioridade` | Grafico: projetos por prioridade |

### Historico

| Metodo | Rota | Descricao |
|---|---|---|
| GET | `/api/historico/:provedor_id` | Timeline completa do provedor |

### Usuarios (Admin only)

| Metodo | Rota | Descricao |
|---|---|---|
| GET | `/api/usuarios` | Listar todos |
| POST | `/api/usuarios` | Criar usuario |
| PUT | `/api/usuarios/:id` | Editar usuario |
| PATCH | `/api/usuarios/:id/ativo` | Ativar/desativar |

### WhatsApp - Sessao e Status

| Metodo | Rota | Descricao |
|---|---|---|
| GET | `/api/whatsapp/events` | SSE: eventos em tempo real |
| GET | `/api/whatsapp/status` | Status da sessao WAHA |
| GET | `/api/whatsapp/qr` | QR Code para parear |
| POST | `/api/whatsapp/start` | Iniciar sessao |
| POST | `/api/whatsapp/stop` | Parar sessao |
| POST | `/api/whatsapp/webhook` | Webhook do WAHA (publica) |

### WhatsApp - Chat e Mensagens

| Metodo | Rota | Descricao |
|---|---|---|
| GET | `/api/whatsapp/chats` | Listar conversas (?limit=) |
| GET | `/api/whatsapp/messages/:chatId` | Mensagens de um chat (?limit=) |
| GET | `/api/whatsapp/messages-page/:chatId` | Mensagens paginadas (?limit=&offset=) |
| POST | `/api/whatsapp/send` | Enviar mensagem de texto (com reply) |
| POST | `/api/whatsapp/send-file` | Enviar arquivo (multipart) |
| GET | `/api/whatsapp/media/:messageId` | Download de midia |
| POST | `/api/whatsapp/react` | Reagir a mensagem |
| POST | `/api/whatsapp/seen` | Marcar chat como lido |
| POST | `/api/whatsapp/typing` | Enviar indicador de digitando |
| POST | `/api/whatsapp/forward` | Encaminhar mensagem |
| POST | `/api/whatsapp/send-mass` | Envio em massa |
| GET | `/api/whatsapp/unread-count` | Total de nao-lidas |

### WhatsApp - Busca e Exportacao

| Metodo | Rota | Descricao |
|---|---|---|
| GET | `/api/whatsapp/search` | Busca de mensagens (?q=&chatId=) |
| GET | `/api/whatsapp/export/:chatId` | Exportar conversa (?format=txt ou csv) |

### WhatsApp - Templates e Bot

| Metodo | Rota | Descricao |
|---|---|---|
| GET | `/api/whatsapp/templates` | Listar templates |
| POST | `/api/whatsapp/templates` | Criar template |
| PUT | `/api/whatsapp/templates/:id` | Editar template |
| DELETE | `/api/whatsapp/templates/:id` | Excluir template |
| GET | `/api/whatsapp/auto-respostas` | Listar regras do bot |
| POST | `/api/whatsapp/auto-respostas` | Criar regra |
| PUT | `/api/whatsapp/auto-respostas/:id` | Editar regra |
| DELETE | `/api/whatsapp/auto-respostas/:id` | Excluir regra |

### WhatsApp - Notificacoes e Agendamentos

| Metodo | Rota | Descricao |
|---|---|---|
| GET | `/api/whatsapp/notificacoes` | Listar configuracoes |
| PUT | `/api/whatsapp/notificacoes/:id` | Atualizar notificacao |
| GET | `/api/whatsapp/agendamentos` | Listar agendamentos |
| POST | `/api/whatsapp/agendamentos` | Criar agendamento |
| DELETE | `/api/whatsapp/agendamentos/:id` | Cancelar agendamento |

### WhatsApp - Vinculos e Metricas

| Metodo | Rota | Descricao |
|---|---|---|
| GET | `/api/whatsapp/provedores-vinculados` | Listar vinculos |
| POST | `/api/whatsapp/vincular-provedor` | Criar/atualizar vinculo |
| DELETE | `/api/whatsapp/desvincular-provedor/:id` | Remover vinculo |
| GET | `/api/whatsapp/provedor-por-chat/:chatId` | Buscar provedor por chat |
| GET | `/api/whatsapp/metricas` | Dashboard de metricas |

---

## Docker e WAHA

### docker-compose.yml

```yaml
services:
  waha:
    image: devlikeapro/waha
    container_name: waha
    restart: unless-stopped
    ports:
      - "3001:3001"
    environment:
      - WHATSAPP_DEFAULT_ENGINE=WEBJS
      - WAHA_DASHBOARD_ENABLED=true
      - WHATSAPP_API_PORT=3001
      - WHATSAPP_API_KEY=gestao-trabalho-waha-key
      - WHATSAPP_HOOK_URL=http://host.docker.internal:3000/api/whatsapp/webhook
      - WHATSAPP_HOOK_EVENTS=message,message.reaction,session.status,presence.update
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

### Comandos uteis

```bash
# Iniciar WAHA
docker compose up -d

# Parar WAHA
docker compose down

# Ver logs
docker logs waha -f

# Reiniciar
docker restart waha
```

### Fluxo de Conexao WhatsApp

1. Acessar `/whatsapp` no sistema
2. Clicar "Iniciar Sessao"
3. Escanear QR Code com o celular
4. Status muda para "Conectado"
5. Conversas carregam automaticamente

---

## Importacao de Planilha

Script `importar-planilha.js` para importar provedores de uma planilha Excel:

```bash
node importar-planilha.js
```

- Le o arquivo: `C:\Users\gaiam\Downloads\Acompanhamento de Clientes.xlsx`
- Aba: "Provedores"
- Colunas mapeadas: Fantasia → nome, Modelo → modelo_integracao, Plano → plano, ERP → erp, Responsavel → responsavel
- Pula duplicatas e linhas vazias

---

## Funcionalidades Compartilhadas (app.js)

Arquivo `public/js/app.js` com utilitarios usados em todas as paginas:

- **`api(url, options)`** - Wrapper do fetch com tratamento de auth (401 redireciona para login)
- **`mostrarToast(msg, tipo)`** - Notificacoes toast (success, error, warning, info)
- **`formatarData()` / `formatarDataHora()`** - Formatacao de datas pt-BR
- **`badgeStatus()` / `badgePrioridade()` / `badgeCategoria()`** - Badges Bootstrap coloridos
- **`carregarProvedores(select, selecionado)`** - Popular select de provedores
- **`carregarUsuarioLogado()`** - Sidebar com nome, iniciais, perfil e botao de logout
- **`exportarCSV()` / `exportarExcel()`** - Exportacao de dados
- **`confirmar(mensagem)`** - Modal de confirmacao com Promise

---

## Seguranca

- Senhas armazenadas com **bcrypt** (salt factor 10)
- Sessoes com cookie **httpOnly** (8h de duracao)
- Middleware de autenticacao em todas as rotas protegidas
- Validacao de perfil para rotas administrativas
- Upload de arquivos com filtro de extensoes permitidas
- Limite de 16MB por arquivo
- XSS prevention com `escapeHtml()` no frontend
- WAHA protegida por API Key

---

*Documentacao gerada em Março 2026*
*Sistema desenvolvido para Caike Luan - Nexus*
