// Base de Conhecimento - Dados de Seed (v2)
module.exports = {
    categorias: [
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
        { nome: 'Agenda', icone: 'bi-calendar-event', ordem: 12 },
        { nome: 'Integracoes ERP', icone: 'bi-plug', ordem: 13 },
        { nome: 'Automacao e Fluxos', icone: 'bi-diagram-3', ordem: 14 }
    ],
    artigos: [
        // ===== PRIMEIROS PASSOS =====
        {
            cat: 'Primeiros Passos',
            titulo: 'Visao Geral do Sistema',
            tags: 'inicio,introducao,sistema,visao geral',
            conteudo: `## Bem-vindo ao Nexus

O Nexus e um sistema completo de gestao empresarial desenvolvido para provedores de internet (ISPs) e empresas de telecomunicacoes. Ele centraliza todas as operacoes do dia a dia em uma unica plataforma web.

## Modulos Disponveis

1. **Dashboard** - Painel principal com metricas em tempo real, graficos de desempenho e resumo de atividades
2. **Chamados** - Sistema de tickets para suporte tecnico e atendimento ao cliente
3. **Atendimento WhatsApp** - Central de atendimento integrada com WhatsApp via WAHA
4. **Vendas e Pipeline** - Kanban visual para gerenciar o funil de vendas com provedores, planos e propostas
5. **Projetos** - Quadro Kanban para gerenciar projetos internos com tarefas e prazos
6. **Financeiro** - Painel financeiro com receitas, despesas e fluxo de caixa
7. **Marcador de Ponto** - Controle de jornada com entrada, saida, pausas, almoco e relatorios
8. **Treinamentos** - Gerenciamento de capacitacoes da equipe
9. **Agenda** - Calendario compartilhado para eventos e compromissos
10. **Base de Conhecimento** - Biblioteca de artigos e tutoriais (voce esta aqui!)
11. **Configuracoes** - Painel administrativo para usuarios, permissoes e integracoes

## Perfis de Acesso

- **Administrador** - Acesso total a todos os modulos
- **Analista** - Chamados, projetos, relatorios e atendimento
- **Vendedor** - Vendas, dashboard vendedor e provedores
- **Gestor de Atendimento** - Gestao de equipe de atendimento
- **Gerente de NOC** - Gestao de equipe tecnica e projetos
- **Financeiro** - Modulo financeiro e vendas
- **Atendente** - Acesso basico a chamados e atendimento

## Tecnologias

- **Frontend** - Bootstrap 5 + JavaScript vanilla
- **Backend** - Node.js + Express
- **Banco de dados** - SQLite (sql.js)
- **WhatsApp** - WAHA (WhatsApp HTTP API) via Docker
- **PWA** - Funciona como aplicativo no celular

> O sistema funciona como PWA e pode ser instalado no celular como um aplicativo nativo.`
        },
        {
            cat: 'Primeiros Passos',
            titulo: 'Como Navegar pelo Sistema',
            tags: 'navegacao,sidebar,menu,busca',
            conteudo: `## Sidebar (Menu Lateral)

A sidebar e o menu principal do sistema, localizado no lado esquerdo da tela.

### O que voce encontra na sidebar

- Logo e nome do sistema no topo
- Links para cada modulo (Dashboard, Chamados, Atendimento, etc.)
- O modulo ativo fica destacado com cor rosa
- Usuarios online na parte inferior
- Seu nome, perfil e botao de logout no rodape

> Apenas os modulos que voce tem permissao aparecem na sidebar. Se um modulo nao aparece, fale com o administrador.

### Sidebar no Celular

Em telas pequenas, a sidebar fica escondida. Clique no botao de menu (tres linhas) no canto superior esquerdo para abri-la.

## Busca Global (Ctrl+K)

Pressione **Ctrl+K** em qualquer pagina para abrir a busca global. Voce pode buscar paginas do sistema e funcoes rapidas.

## Notificacoes

O icone de sino na sidebar abre o painel de notificacoes:
- Chamados atribuidos a voce
- Mensagens do chat interno
- Atualizacoes de projetos
- Mensagens do WhatsApp (se tiver permissao)

## Chat Interno

O botao rosa flutuante no canto inferior direito abre o chat interno para conversa em tempo real com outros usuarios do sistema.

## Usuarios Online

Na parte inferior da sidebar, voce ve quem esta online em tempo real. Clique em um usuario para abrir o chat com ele.`
        },
        {
            cat: 'Primeiros Passos',
            titulo: 'Tema Claro e Escuro',
            tags: 'tema,dark mode,escuro,claro,aparencia',
            conteudo: `## Temas Disponiveis

O sistema suporta dois temas visuais:

### Tema Claro (padrao)
- Fundo branco/cinza claro
- Textos em tons escuros
- Ideal para ambientes bem iluminados

### Tema Escuro (Dark Mode)
- Fundo escuro (preto/azul escuro)
- Textos em tons claros
- Reduz cansaco visual em ambientes escuros
- Economiza bateria em telas OLED

## Como Alternar

1. Na sidebar, localize a area do seu usuario (parte inferior)
2. Clique no icone de sol/lua para alternar
3. A mudanca e instantanea e afeta todas as paginas

> Sua preferencia de tema e salva automaticamente no navegador. Quando voce voltar ao sistema, o tema escolhido sera mantido.`
        },

        // ===== DASHBOARD =====
        {
            cat: 'Dashboard',
            titulo: 'Dashboard Principal - Metricas e Graficos',
            tags: 'dashboard,metricas,graficos,kpi,resumo',
            conteudo: `## Visao Geral

O Dashboard e a pagina inicial do sistema, oferecendo uma visao geral de todas as operacoes.

## Cards de Metricas

No topo da pagina voce encontra:
- **Total de Chamados** - Quantidade de chamados abertos
- **Chamados Pendentes** - Aguardando atendimento
- **Vendas do Mes** - Total de vendas no periodo
- **Projetos Ativos** - Projetos em andamento
- **Treinamentos** - Proximos treinamentos agendados

## Graficos

1. **Chamados por Status** - Grafico de pizza com distribuicao
2. **Chamados por Periodo** - Grafico de linha com evolucao temporal
3. **Vendas por Estagio** - Funil de vendas visual
4. **Atividade Recente** - Timeline com ultimas acoes

## Atividades Recentes

Lista cronologica com as ultimas acoes no sistema: chamados criados, vendas movimentadas, projetos alterados e registros de ponto.

> Os dados sao atualizados em tempo real via SSE (Server-Sent Events). Voce nao precisa recarregar a pagina.`
        },
        {
            cat: 'Dashboard',
            titulo: 'Chat Interno entre Usuarios',
            tags: 'chat,interno,mensagens,comunicacao,equipe',
            conteudo: `## Como Acessar

1. Clique no botao rosa flutuante no canto inferior direito da tela
2. Ou clique em um usuario online na sidebar

## Lista de Contatos

- Mostra todos os usuarios do sistema
- Indicador verde = usuario online
- Preview da ultima mensagem trocada
- Badge com contagem de mensagens nao lidas

## Conversa

- Mensagens em tempo real (sem necessidade de recarregar)
- Hora de envio exibida em cada mensagem
- Mensagens enviadas aparecem na direita (rosa)
- Mensagens recebidas aparecem na esquerda

## Notificacoes do Chat

- Notificacao visual quando recebe mensagem fora do chat
- Badge com contagem no botao flutuante
- Som de notificacao (se permitido pelo navegador)

> O chat funciona em qualquer pagina do sistema. Minimize clicando no X para voltar ao trabalho. As mensagens sao salvas e podem ser visualizadas depois.`
        },

        // ===== CHAMADOS =====
        {
            cat: 'Chamados',
            titulo: 'Como Criar e Gerenciar Chamados',
            tags: 'chamados,tickets,suporte,criar,gerenciar',
            conteudo: `## Criar um Chamado

1. Acesse **Chamados** na sidebar
2. Clique em **Novo Chamado**
3. Preencha os campos:
- **Titulo** - Descricao curta do problema
- **Descricao** - Detalhes completos
- **Prioridade** - Baixa, Media, Alta ou Critica
- **Categoria** - Tipo do problema (Suporte, Instalacao, etc.)
- **Responsavel** - Quem ira atender (opcional)
- **Provedor** - Se relacionado a um provedor especifico
4. Adicione anexos se necessario (imagens, documentos)
5. Clique em **Salvar**

## Gerenciar Chamados

- Filtrar por status (Aberto, Em Andamento, Resolvido, Fechado)
- Filtrar por prioridade
- Buscar por titulo ou descricao
- Ordenar por data, prioridade ou responsavel

## Acoes em um Chamado

- **Editar** - Alterar informacoes do chamado
- **Comentar** - Adicionar observacoes e atualizacoes
- **Alterar Status** - Mover entre as etapas
- **Atribuir** - Designar para outro usuario
- **Anexar** - Adicionar arquivos e imagens

## Fluxo de Status

Aberto > Em Andamento > Resolvido > Fechado

## Timeline

Cada chamado possui uma timeline com todo o historico de alteracoes, comentarios e mudancas de status.

## Anexos

- Suporta imagens (JPG, PNG, GIF) e documentos (PDF, DOC, DOCX)
- Imagens podem ser visualizadas em modal ampliado
- Download direto de qualquer anexo`
        },

        // ===== ATENDIMENTO WHATSAPP =====
        {
            cat: 'Atendimento WhatsApp',
            titulo: 'Central de Atendimento WhatsApp',
            tags: 'whatsapp,atendimento,central,waha,mensagens',
            conteudo: `## Como Funciona

1. O WAHA roda em um container Docker na porta 3001
2. Voce conecta seu WhatsApp escaneando o QR Code
3. Todas as mensagens chegam no sistema em tempo real
4. Voce responde diretamente pelo sistema

## Interface

A tela e dividida em duas partes:
- **Painel esquerdo** - Lista de conversas com preview
- **Painel direito** - Area de mensagens da conversa selecionada

### Painel de Conversas
- Busca por nome/numero
- Filtros de fila (Todos, Fila, Meus, Em Atendimento)
- Badge com contagem de mensagens nao lidas
- Foto do perfil do contato
- Status da conversa (Fila, Atendendo, nome do agente)

### Area de Mensagens
- Mensagens com bolhas (enviadas e recebidas)
- Suporte a imagens, audios, videos e documentos
- Indicador de digitacao
- Responder mensagem especifica (reply/quote)
- Reacoes com emojis

## Botoes de Acao

- **Assumir** - Pegar um chat da fila
- **Transferir** - Enviar para outro agente
- **Finalizar** - Encerrar o atendimento
- **Buscar** - Pesquisar mensagens na conversa

## Status da Conexao

- **Verde** (Conectado) - WhatsApp funcionando
- **Amarelo** (Conectando) - Aguardando conexao
- **Vermelho** (Desconectado) - Sem conexao

> Requisitos: Docker com container WAHA na porta 3001, numero de WhatsApp valido e permissao do modulo ativa.`
        },
        {
            cat: 'Atendimento WhatsApp',
            titulo: 'Fila de Atendimento e Distribuicao',
            tags: 'fila,atendimento,distribuicao,agente,transferir',
            conteudo: `## Como Funciona a Fila

1. Nova mensagem chega > chat entra na **Fila** automaticamente
2. Agente clica no chat > chat e **atribuido** a ele (auto-claim)
3. Agente atende o cliente normalmente
4. Ao finalizar > chat volta para Fila se receber nova mensagem

## Filtros Disponiveis

### Para Agentes (nao-admin)
- **Fila** - Chats aguardando atendimento (pode pegar qualquer um)
- **Meus** - Apenas chats atribuidos a voce

### Para Admin
- **Todos** - Ve todos os chats
- **Fila** - Chats na fila
- **Em Atendimento** - Chats sendo atendidos por qualquer agente

## Transferir Chat

1. Clique no icone de transferencia no header do chat
2. Selecione o agente de destino
3. Opcionalmente adicione uma observacao
4. Clique em **Transferir**

## Finalizar Atendimento

1. Clique no icone de finalizar (check)
2. Confirme a finalizacao
3. O chat fica sem agente atribuido
4. Se o cliente enviar nova mensagem, volta para a fila

> Um agente nao pode abrir chat atribuido a outro agente (exceto admin). Admins veem e gerenciam todos os chats.`
        },
        {
            cat: 'Atendimento WhatsApp',
            titulo: 'Templates e Respostas Rapidas',
            tags: 'templates,respostas,rapidas,atalhos,mensagens',
            conteudo: `## Templates

Templates sao mensagens pre-formatadas que podem ser enviadas com poucos cliques.

### Como Usar
1. Na area de mensagens, clique no icone de documento
2. Selecione o template desejado
3. O texto sera inserido no campo de mensagem
4. Edite se necessario e envie

### Como Criar Templates
1. Acesse **Configuracoes > Templates**
2. Clique em **Novo Template**
3. Preencha nome, texto e categoria
4. Salve

## Respostas Rapidas (barra /)

Digite **/** no campo de mensagem para abrir o menu de respostas rapidas:
- Lista os templates disponiveis como sugestoes
- Selecione com click ou setas + Enter
- O texto e inserido automaticamente

## Formatacao de Texto

- \`*negrito*\` = texto em **negrito**
- \`_italico_\` = texto em italico
- \`~tachado~\` = texto riscado
- Backtick = texto monospacado

## Envio de Arquivos

1. Clique no icone de clip (anexo)
2. Selecione o arquivo (imagem, documento, video)
3. O arquivo sera enviado como mensagem

> Templates bem organizados economizam tempo e padronizam a comunicacao com o cliente.`
        },

        // ===== VENDAS =====
        {
            cat: 'Vendas e Pipeline',
            titulo: 'Pipeline de Vendas (Kanban)',
            tags: 'vendas,pipeline,kanban,funil,negocios',
            conteudo: `## Estagios do Funil

1. **Lead** - Contato inicial, prospecto identificado
2. **Contato** - Primeiro contato realizado
3. **Proposta** - Proposta comercial enviada
4. **Negociacao** - Em negociacao ativa
5. **Ativado** - Venda concluida, cliente ativo
6. **Perdido** - Negocio perdido

## Como Usar

### Criar Negocio
1. Clique em **Novo Negocio**
2. Preencha: cliente, provedor, plano, valor, vendedor
3. O negocio aparece na coluna "Lead"

### Mover entre Estagios
- Arraste o card de uma coluna para outra (drag and drop)
- Ou clique no card e altere o estagio no formulario

## Cards do Kanban

Cada card mostra:
- Nome do cliente/empresa
- Plano contratado e valor estimado
- Data da criacao e vendedor responsavel
- Indicador de temperatura (esfriando/frio)

## Indicadores de Temperatura

- **Normal** - Negocio ativo e recente
- **Esfriando** (laranja) - Sem atualizacao ha alguns dias
- **Frio** (vermelho) - Sem atualizacao ha muito tempo

## Contatos Rapidos

Em cada card, botoes de acao rapida:
- **WhatsApp** - Abre chat com o contato
- **Telefone** - Inicia ligacao
- **Email** - Abre cliente de email

> Na aba Dashboard voce ve o total de negocios por estagio, valor do funil, taxa de conversao e ranking de vendedores.`
        },
        {
            cat: 'Vendas e Pipeline',
            titulo: 'Provedores, Planos e Propostas',
            tags: 'provedores,planos,propostas,contratos,cadastro',
            conteudo: `## Provedores

Cadastro de provedores de internet parceiros.

### Como Cadastrar
1. Acesse **Vendas > aba Provedores**
2. Clique em **Novo Provedor**
3. Preencha: nome, CNPJ, logo, dados de contato
4. Salve

Cada provedor tem dados cadastrais completos, logo para identificacao visual, planos associados e historico de vendas.

## Planos

Planos de internet vinculados a cada provedor.

### Como Cadastrar
1. Na pagina do provedor, clique em **Novo Plano**
2. Preencha: nome, velocidade, preco, descricao
3. Marque se e plano ativo

## Propostas

Propostas comerciais geradas para clientes.

### Como Criar
1. Ao mover um negocio para "Proposta", crie a proposta
2. Selecione os planos desejados
3. Adicione servicos adicionais se necessario
4. A proposta e gerada com calculo automatico de valores

## Contratos

Quando um negocio e ativado, um contrato pode ser gerado com dados do cliente/provedor, planos contratados, valor total, prazo e status.`
        },

        // ===== PROJETOS =====
        {
            cat: 'Projetos',
            titulo: 'Quadro Kanban de Projetos',
            tags: 'projetos,kanban,tarefas,status,equipe',
            conteudo: `## Colunas (Status)

1. **Em Andamento** - Projetos sendo executados
2. **Pausado** - Projetos temporariamente pausados
3. **Concluido** - Projetos finalizados
4. **Cancelado** - Projetos cancelados

## Criar Projeto

1. Acesse **Projetos** na sidebar
2. Clique em **Novo Projeto**
3. Preencha:
- Nome do projeto
- Descricao detalhada
- Status inicial e responsavel
- Data de inicio e previsao de conclusao
- Prioridade
4. Salve

## Gerenciar Projetos

- Arraste cards entre colunas para alterar status
- Clique em um card para ver detalhes e editar
- Adicione comentarios para registrar progresso
- Acompanhe a timeline de alteracoes

## Cards do Kanban

Cada card exibe: nome do projeto, responsavel, data de criacao, prioridade (badge colorido) e status atual.

## Filtros

- Por status, responsavel e prioridade
- Busca por nome

> Mantenha o quadro atualizado para que toda a equipe tenha visibilidade do andamento dos projetos.`
        },

        // ===== FINANCEIRO =====
        {
            cat: 'Financeiro',
            titulo: 'Painel Financeiro',
            tags: 'financeiro,receitas,despesas,fluxo,caixa',
            conteudo: `## Cards de Resumo

- **Receitas do mes** - Total de entradas
- **Despesas do mes** - Total de saidas
- **Saldo** - Receitas menos despesas
- **Comparativo** - Com mes anterior

## Lancamentos

- Cadastrar receitas e despesas
- Categorizar por tipo
- Definir data de vencimento
- Marcar como pago/pendente
- Adicionar observacoes

## Como Registrar um Lancamento

1. Clique em **Novo Lancamento**
2. Selecione o tipo: Receita ou Despesa
3. Preencha: descricao, valor, data, categoria
4. Marque como pago se ja foi quitado
5. Salve

## Filtros

- Por periodo (mes/trimestre/ano)
- Por tipo (receita/despesa)
- Por categoria e status (pago/pendente)

## Categorias de Exemplo

- **Receitas** - Vendas, Servicos, Mensalidades, Outros
- **Despesas** - Pessoal, Infraestrutura, Marketing, Software, Impostos

> Mantenha os lancamentos em dia para ter uma visao precisa da saude financeira da empresa.`
        },

        // ===== MARCADOR DE PONTO =====
        {
            cat: 'Marcador de Ponto',
            titulo: 'Como Registrar Entrada e Saida',
            tags: 'ponto,entrada,saida,registro,jornada',
            conteudo: `## Como Acessar

Clique em **Ponto** na sidebar.

## Registrar Entrada

1. Ao iniciar o expediente, clique no botao verde **Registrar Entrada**
2. O horario e registrado automaticamente
3. O relogio digital mostra a hora atual
4. O status muda para "Trabalhando"

## Registrar Saida

1. Ao finalizar o expediente, clique no botao vermelho **Registrar Saida**
2. O horario e registrado e o tempo total trabalhado e calculado
3. O status muda para "Offline"

## Registrar Almoco

1. Ao sair para almoco, clique em **Almoco**
2. Ao retornar, clique em **Voltar do Almoco**
3. O tempo de almoco e registrado separadamente

## Card "Sua Jornada Hoje"

- **Tempo Trabalhado** - Total de horas (descontando pausas e almoco)
- **Carga Horaria** - Meta diaria configurada (padrao 8h)
- **Pausas** - Quantidade de pausas realizadas
- **Tempo Pausas** - Total de minutos em pausa
- **Barra de progresso** - Percentual da carga horaria cumprida

## Botoes Mudam Conforme o Estado

- Sem entrada: **Registrar Entrada** (verde)
- Trabalhando: **Pausa** (amarelo) + **Almoco** (laranja) + **Saida** (vermelho)
- Em pausa: **Retomar** (verde) + timer da pausa
- Em almoco: **Voltar do Almoco** (verde)`
        },
        {
            cat: 'Marcador de Ponto',
            titulo: 'Sistema de Pausas',
            tags: 'ponto,pausas,banheiro,cafe,intervalo',
            conteudo: `## Iniciar uma Pausa

1. Clique no botao amarelo **Pausa**
2. Um modal abre pedindo o motivo da pausa
3. Selecione o motivo:
- Banheiro
- Cafe / Lanche
- Pessoal
- Reuniao
- Outro
4. Clique em **Pausar**

## Durante a Pausa

- Um timer aparece mostrando quanto tempo voce esta em pausa
- O status muda para "Em Pausa" (amarelo)
- O botao muda para **Retomar** (verde)

## Retomar Trabalho

1. Clique no botao verde **Retomar**
2. A pausa e encerrada e a duracao e registrada
3. O timer desaparece e os botoes normais voltam

## Informacoes Importantes

- O tempo de pausa e **descontado** do tempo trabalhado
- Todas as pausas ficam registradas no historico
- Gestores podem ver as pausas de todos na aba "Equipe"
- O relatorio de ponto mostra o total de pausas por dia

> Use as pausas honestamente para manter um registro preciso da sua jornada.`
        },
        {
            cat: 'Marcador de Ponto',
            titulo: 'Relatorios de Ponto (Gestores)',
            tags: 'ponto,relatorios,gestores,exportar,csv,pdf',
            conteudo: `## Quem Pode Acessar

Apenas **Administradores**, **Gestores de Atendimento** e **Gerentes de NOC**.

## Como Gerar Relatorio

1. Va ate a pagina de **Ponto**
2. Clique na aba **Relatorios**
3. Selecione o periodo (De - Ate)
4. Opcionalmente filtre por colaborador
5. Clique em **Buscar**

## Cards de Resumo

- Colaboradores ativos no periodo
- Total de horas trabalhadas
- Total de minutos em pausas
- Media de horas por dia

## Tabela Detalhada

Para cada colaborador mostra: nome e perfil, dias trabalhados, horas totais, tempo de pausas, media por dia e botao **Ver detalhes**.

## Exportar

- **CSV** - Arquivo compativel com Excel (separado por ponto e virgula, UTF-8 BOM)
- **PDF** - Abre janela de impressao com tabela formatada

## Aba Equipe (Tempo Real)

Gestores veem em tempo real:
- **Verde** - Quem esta trabalhando
- **Amarelo** - Quem esta em pausa
- **Laranja** - Quem esta em almoco
- **Cinza** - Quem esta offline

## Aba Configuracoes

Para cada usuario, defina: horario de entrada/saida padrao, horario de almoco, duracao do almoco, carga horaria diaria e se trabalha em home office.`
        },

        // ===== USUARIOS E PERFIS =====
        {
            cat: 'Usuarios e Perfis',
            titulo: 'Perfis de Acesso e Permissoes',
            tags: 'perfis,permissoes,acesso,modulos,admin',
            conteudo: `## Perfis Disponiveis

### 1. Administrador
- Acesso **total** a todos os modulos
- Gerencia usuarios e permissoes
- Acessa configuracoes do sistema
- Badge vermelho

### 2. Analista
- Chamados, Projetos, Relatorios, WhatsApp, Historico, Conhecimento, Agenda, Ponto
- **Nao acessa:** Vendas, Dashboard Vendedor, Configuracoes
- Badge azul

### 3. Vendedor
- Dashboard, Provedores, Vendas, Dashboard Vendedor
- **Nao acessa:** Chamados, Projetos, WhatsApp, Configuracoes
- Badge rosa

### 4. Gestor de Atendimento
- Dashboard, Chamados, WhatsApp, Relatorios, Conhecimento, Agenda, Historico, Usuarios, Ponto
- Pode gerenciar equipe de atendimento e ver dados de equipe no Ponto
- Badge verde

### 5. Gerente de NOC
- Dashboard, Chamados, Projetos, Relatorios, Conhecimento, Agenda, Historico, Ponto
- Pode gerenciar equipe tecnica
- Badge amarelo

### 6. Financeiro
- Dashboard, Vendas, Relatorios, Financeiro, Ponto
- Focado em dados financeiros e comerciais
- Badge cinza

### 7. Atendente
- Dashboard, Chamados, WhatsApp, Conhecimento, Ponto
- Acesso basico para atendimento ao cliente
- Badge azul

> Se um modulo esta desativado para seu perfil, ele nao aparecera na sidebar. Administradores podem ajustar permissoes em Configuracoes > Permissoes.`
        },
        {
            cat: 'Usuarios e Perfis',
            titulo: 'Gerenciamento de Usuarios',
            tags: 'usuarios,criar,editar,excluir,gerenciar',
            conteudo: `## Quem Pode Gerenciar

Apenas **Administradores** e **Gestores de Atendimento**.

## Criar Usuario

1. Acesse **Usuarios** na sidebar
2. Clique em **Novo Usuario**
3. Preencha:
- **Nome completo**
- **Email** (sera usado para login)
- **Senha** (minimo 4 caracteres)
- **Perfil** de acesso (Analista, Vendedor, Atendente, etc.)
- **Foto** (opcional)
4. Clique em **Salvar**

## Editar Usuario

1. Na tabela de usuarios, clique no icone de lapis
2. Altere os campos necessarios
3. Deixe a senha em branco para manter a atual
4. Clique em **Salvar**

## Excluir Usuario

1. Clique no icone de lixeira na tabela
2. Confirme a exclusao

## Informacoes na Tabela

Foto/avatar, nome, email, perfil (badge colorido), data de criacao e acoes (editar/excluir).

## Foto de Perfil

- Aparece na sidebar, no chat e na lista de usuarios
- Se nao tiver foto, exibe as iniciais do nome

> Use emails validos para facilitar a recuperacao de acesso. Revise periodicamente os usuarios ativos.`
        },

        // ===== CONFIGURACOES =====
        {
            cat: 'Configuracoes',
            titulo: 'Configuracoes Gerais do Sistema',
            tags: 'configuracoes,geral,empresa,sistema,abas',
            conteudo: `## Acesso

O painel de Configuracoes e acessivel apenas para **Administradores**.

## Abas Disponiveis

### 1. Geral
Configuracoes basicas: nome da empresa, logo, informacoes de contato, fuso horario e formato de data.

### 2. WhatsApp / WAHA
Integracao com WhatsApp: URL do servidor WAHA (padrao \`http://localhost:3001\`), nome da sessao, webhook URL e status da conexao.

### 3. ERP
Configuracao das integracoes com sistemas ERP: IXC, ISPFY, Hubsoft, SGP e Atlaz. URL da API e token de autenticacao para cada um.

### 4. Templates
Gerenciamento de templates de mensagem do WhatsApp: criar, editar, excluir e organizar por categoria.

### 5. Permissoes
Matriz de permissoes por perfil e modulo. Checkbox verde = ativo, sem check = inativo. Mudancas aplicadas imediatamente.

### 6. Webhooks
Configuracao de webhooks de saida: enviar eventos do sistema para URLs externas, configurar quais eventos disparar e visualizar logs.

### 7. Notificacoes
Configuracoes de sons, notificacoes do navegador e tipos de notificacao ativas.

### 8. Marcador de Ponto
Toggle para habilitar o marcador, configuracao de API Key para maquina de ponto, tempo maximo de pausa e horarios padrao.

> As abas de configuracoes usam estilo pill/chip moderno. A aba ativa fica destacada em rosa.`
        },
        {
            cat: 'Configuracoes',
            titulo: 'Permissoes por Modulo',
            tags: 'permissoes,modulos,perfis,configurar,acesso',
            conteudo: `## Como Acessar

1. Va em **Configuracoes > Permissoes**
2. Uma matriz mostra todos os perfis (linhas) x modulos (colunas)

## Como Funciona

- Checkbox marcado (verde) = perfil **tem** acesso ao modulo
- Checkbox desmarcado = perfil **nao** tem acesso
- Mudancas sao salvas automaticamente ao clicar

## Modulos Disponiveis

- \`dashboard\` - Painel principal
- \`provedores\` - Cadastro de provedores
- \`vendas\` - Pipeline de vendas
- \`dashboard_vendedor\` - Dashboard especifico do vendedor
- \`chamados\` - Sistema de tickets
- \`treinamentos\` - Gerenciamento de treinamentos
- \`projetos\` - Quadro de projetos
- \`historico\` - Historico de atividades
- \`whatsapp\` - Central de atendimento WhatsApp
- \`relatorios\` - Relatorios gerais
- \`conhecimento\` - Base de conhecimento
- \`agenda\` - Calendario/agenda
- \`financeiro\` - Painel financeiro
- \`usuarios\` - Gerenciamento de usuarios
- \`configuracoes\` - Painel de configuracoes
- \`ponto\` - Marcador de ponto

## Efeito das Permissoes

- Modulo desativado: **nao aparece** na sidebar
- Acesso direto via URL e **bloqueado** (redirect)
- APIs do modulo retornam erro **403**

> Nao desative modulos essenciais do perfil admin. Sempre mantenha pelo menos um admin com acesso total.`
        },

        // ===== TREINAMENTOS =====
        {
            cat: 'Treinamentos',
            titulo: 'Gerenciamento de Treinamentos',
            tags: 'treinamentos,capacitacao,equipe,agendamento',
            conteudo: `## Cards de Resumo

- Treinamentos pendentes
- Treinamentos agendados
- Treinamentos realizados
- Taxa de conclusao

## Criar Treinamento

1. Clique em **Novo Treinamento**
2. Preencha:
- Titulo do treinamento
- Descricao/conteudo
- Instrutor/responsavel
- Data e horario
- Duracao estimada
- Participantes
3. Salve

## Status do Treinamento

- **Pendente** (laranja) - Aguardando agendamento
- **Agendado** (rosa) - Data e hora definidos
- **Realizado** (verde) - Treinamento concluido

## Gerenciar

- Visualizar detalhes de cada treinamento
- Alterar status conforme progresso
- Adicionar materiais e anotacoes
- Registrar presencas

> Mantenha um calendario regular de treinamentos para manter a equipe atualizada e capacitada.`
        },

        // ===== AGENDA =====
        {
            cat: 'Agenda',
            titulo: 'Calendario e Eventos',
            tags: 'agenda,calendario,eventos,compromissos',
            conteudo: `## Visualizacoes

- **Mes** - Visao mensal com todos os eventos
- **Semana** - Visao semanal detalhada
- **Dia** - Visao diaria com horarios

## Criar Evento

1. Clique em um dia no calendario ou em **Novo Evento**
2. Preencha:
- Titulo do evento
- Data e hora de inicio/fim
- Descricao
- Cor do evento (para diferenciar tipos)
- Se e o dia todo
3. Salve

## Tipos de Eventos por Cor

- **Azul** - Reunioes
- **Verde** - Treinamentos
- **Vermelho** - Prazos importantes
- **Amarelo** - Lembretes
- **Rosa** - Eventos sociais

## Interacao

- Clique em um evento para ver detalhes
- Edite ou exclua eventos existentes
- Arraste eventos para mudar de data

> O calendario e compartilhado entre todos os usuarios com permissao ao modulo Agenda.`
        },

        // ===== INTEGRACOES ERP =====
        {
            cat: 'Integracoes ERP',
            titulo: 'Visao Geral das Integracoes ERP',
            tags: 'erp,integracao,provedor,sincronizar,api',
            conteudo: `## O que sao as Integracoes ERP

O sistema se integra com os principais ERPs utilizados por provedores de internet no Brasil. Essas integracoes permitem sincronizar dados de clientes, contratos e servicos diretamente com o seu ERP.

## ERPs Suportados

1. **IXC Provedor** - Um dos ERPs mais utilizados por ISPs no Brasil
2. **ISPFY** - Plataforma de gestao para provedores
3. **Hubsoft** - Sistema de gestao para telecomunicacoes
4. **SGP** - Sistema de Gestao para Provedores
5. **Atlaz** - Plataforma de gestao para ISPs

## Arquitetura Unificada

Todas as integracoes seguem um **padrao de adapter unificado**, o que significa que:
- A mesma interface funciona para qualquer ERP
- Trocar de ERP nao exige mudar o restante do sistema
- Cada adapter implementa as mesmas funcoes

## Funcoes Disponveis em Todos os ERPs

- **Sincronizar Clientes** - Importa dados de clientes do ERP para o sistema
- **Buscar Cliente** - Busca um cliente especifico por ID ou documento
- **Sincronizar Contratos** - Importa contratos e planos ativos

## Como Configurar

1. Acesse **Configuracoes > ERP**
2. Selecione o ERP que voce utiliza
3. Preencha a **URL da API** e o **Token de autenticacao**
4. Clique em **Testar Conexao** para verificar
5. Salve as configuracoes

## Logs e Auditoria

Todas as chamadas a API dos ERPs sao registradas:
- URL chamada e metodo HTTP
- Status da resposta e tempo de resposta
- Registros de sincronizacao com quantidade importada

> Voce pode configurar multiplos ERPs simultaneamente se trabalhar com diferentes provedores.`
        },
        {
            cat: 'Integracoes ERP',
            titulo: 'Integracao IXC Provedor - Guia Completo',
            tags: 'ixc,provedor,integracao,api,clientes,contratos',
            conteudo: `## Sobre o IXC Provedor

O IXC Provedor e um dos ERPs mais utilizados por ISPs no Brasil. A integracao permite sincronizar dados de clientes e contratos automaticamente.

## Como Configurar

1. Acesse **Configuracoes > ERP**
2. Na secao IXC, preencha:
- **URL da API** - Endereco do servidor IXC (ex: \`https://seuixc.com.br/webservice/v1\`)
- **Token** - Token de autenticacao da API IXC
3. Clique em **Testar Conexao**
4. Salve

## Dados Sincronizados

### Clientes
- Nome completo e razao social
- CPF/CNPJ
- Endereco completo
- Telefone e email
- Status do cliente (ativo, inativo, bloqueado)

### Contratos
- Plano contratado e velocidade
- Valor mensal
- Data de ativacao
- Status do contrato

## Como Funciona a Sincronizacao

1. O sistema faz chamadas a **API REST** do IXC
2. Autenticacao via **token Base64** no header Authorization
3. Os dados sao importados sob demanda
4. Cada sincronizacao registra um log com data, quantidade importada e status

## Log de Comunicacao

Todas as chamadas sao registradas para auditoria:
- URL chamada e metodo HTTP
- Status code da resposta
- Tempo de resposta em milissegundos
- Preview do conteudo retornado

> Mantenha o token do IXC seguro e atualize-o regularmente conforme a politica de seguranca do seu provedor.`
        },
        {
            cat: 'Integracoes ERP',
            titulo: 'Integracao ISPFY',
            tags: 'ispfy,integracao,erp,provedor,api',
            conteudo: `## Sobre o ISPFY

O ISPFY e uma plataforma de gestao completa para provedores de internet. A integracao segue o mesmo padrao unificado do sistema.

## Como Configurar

1. Acesse **Configuracoes > ERP**
2. Na secao ISPFY, preencha:
- **URL da API** - Endereco do servidor ISPFY
- **Token de autenticacao** - Obtido no painel do ISPFY
3. Clique em **Testar Conexao**
4. Salve

## Funcionalidades

- **Sincronizar Clientes** - Importa base de clientes do ISPFY
- **Buscar Cliente** - Busca por ID ou documento (CPF/CNPJ)
- **Sincronizar Contratos** - Importa contratos ativos com planos e valores

## Formato da API

- Comunicacao via API REST (HTTP/HTTPS)
- Autenticacao por token no header
- Respostas em formato JSON
- Suporte a paginacao para grandes volumes

## Logs

Todas as operacoes sao registradas com data, status e detalhes da requisicao.

> A integracao ISPFY usa o mesmo adapter unificado, garantindo compatibilidade total com todas as funcionalidades do sistema.`
        },
        {
            cat: 'Integracoes ERP',
            titulo: 'Integracao Hubsoft',
            tags: 'hubsoft,integracao,erp,provedor,api',
            conteudo: `## Sobre o Hubsoft

O Hubsoft e um sistema de gestao voltado para empresas de telecomunicacoes. A integracao permite sincronizar dados entre os dois sistemas.

## Como Configurar

1. Acesse **Configuracoes > ERP**
2. Na secao Hubsoft, preencha:
- **URL da API** - Endereco do servidor Hubsoft
- **Token de autenticacao** - Obtido no painel administrativo do Hubsoft
3. Clique em **Testar Conexao**
4. Salve

## Funcionalidades

- **Sincronizar Clientes** - Importa dados cadastrais dos clientes
- **Buscar Cliente** - Pesquisa por ID ou documento
- **Sincronizar Contratos** - Importa contratos e servicos contratados

## Dados Disponveis

### Clientes
- Dados pessoais e de contato
- Endereco de instalacao
- Status cadastral

### Contratos
- Plano e velocidade contratada
- Valor e data de vencimento
- Status do servico

> Configure o Hubsoft seguindo o mesmo processo padrao de todos os ERPs. Todas as operacoes sao registradas em log.`
        },
        {
            cat: 'Integracoes ERP',
            titulo: 'Integracao SGP',
            tags: 'sgp,integracao,erp,provedor,api',
            conteudo: `## Sobre o SGP

O SGP (Sistema de Gestao para Provedores) e utilizado por diversos ISPs no Brasil. A integracao permite importar e sincronizar dados.

## Como Configurar

1. Acesse **Configuracoes > ERP**
2. Na secao SGP, preencha:
- **URL da API** - Endereco do servidor SGP
- **Token de autenticacao** - Gerado no painel do SGP
3. Clique em **Testar Conexao**
4. Salve

## Funcionalidades

- **Sincronizar Clientes** - Importa base de clientes completa
- **Buscar Cliente** - Pesquisa individual por ID ou CPF/CNPJ
- **Sincronizar Contratos** - Importa contratos com detalhes de planos

## Processo de Sincronizacao

1. O adapter SGP conecta a API REST do sistema
2. Autenticacao por token no header da requisicao
3. Os dados sao convertidos para o formato padrao do sistema
4. Logs de sincronizacao registram cada operacao

> O SGP utiliza o mesmo padrao de adapter que os demais ERPs, facilitando a migracao entre sistemas.`
        },
        {
            cat: 'Integracoes ERP',
            titulo: 'Integracao Atlaz',
            tags: 'atlaz,integracao,erp,provedor,api',
            conteudo: `## Sobre o Atlaz

O Atlaz e uma plataforma de gestao para provedores de internet com foco em automacao e eficiencia operacional.

## Como Configurar

1. Acesse **Configuracoes > ERP**
2. Na secao Atlaz, preencha:
- **URL da API** - Endereco do servidor Atlaz
- **Token de autenticacao** - Obtido no painel do Atlaz
3. Clique em **Testar Conexao**
4. Salve

## Funcionalidades

- **Sincronizar Clientes** - Importa dados de clientes do Atlaz
- **Buscar Cliente** - Pesquisa por ID ou documento
- **Sincronizar Contratos** - Importa contratos e servicos

## Beneficios da Integracao

- Dados sempre atualizados entre os dois sistemas
- Evita cadastro duplicado de clientes
- Historico de sincronizacoes para auditoria
- Mesma interface padrao dos demais ERPs

> O Atlaz completa o conjunto de 5 ERPs suportados pelo sistema, todos com a mesma interface unificada.`
        },

        // ===== AUTOMACAO E FLUXOS =====
        {
            cat: 'Automacao e Fluxos',
            titulo: 'Flow Builder - Automacao de Atendimento',
            tags: 'flow,fluxo,automacao,whatsapp,chatbot,drawflow',
            conteudo: `## O que e o Flow Builder

O Flow Builder e um editor visual de fluxos de automacao para atendimento no WhatsApp. Com ele voce cria chatbots e fluxos automatizados usando arrastar e soltar, sem precisar programar.

## Como Acessar

1. Acesse **Atendimento WhatsApp**
2. Clique na aba **Fluxos** ou **Flow Builder**
3. O editor visual sera aberto

## Editor Visual

O editor usa a biblioteca **Drawflow** para criar fluxos visuais:
- Arraste nos da paleta para a area de trabalho
- Conecte os nos clicando e arrastando entre as portas
- Configure cada no clicando duas vezes nele
- Salve o fluxo quando estiver pronto

## Tipos de Nos Disponiveis

### 1. Inicio
Ponto de partida do fluxo. Define o gatilho que ativa o fluxo.

### 2. Mensagem
Envia uma mensagem de texto para o cliente. Voce define o conteudo da mensagem.

### 3. Menu
Apresenta opcoes numeradas para o cliente escolher. Cada opcao leva a um caminho diferente no fluxo.

### 4. Condicao
Verifica uma condicao (ex: horario, dia da semana, palavra-chave) e direciona o fluxo para caminhos diferentes.

### 5. Entrada
Aguarda uma resposta do cliente e armazena o valor em uma variavel para uso posterior.

### 6. Integracao
Faz uma chamada a uma API externa ou ao ERP para buscar/enviar dados.

### 7. Transferir
Transfere o atendimento para um agente humano ou para uma fila especifica.

### 8. Fim
Encerra o fluxo e finaliza o atendimento automatizado.

## Gatilhos (Triggers)

- **Mensagem Recebida** - Ativa quando qualquer mensagem e recebida
- **Palavra-Chave** - Ativa quando uma palavra especifica e detectada
- **Webhook** - Ativa por chamada externa via API
- **Agendado** - Ativa em horarios programados

## Sessoes de Fluxo

Quando um fluxo e ativado para um contato, uma **sessao** e criada:
- A sessao rastreia em qual no o contato esta
- Variaveis coletadas ficam salvas na sessao
- A sessao expira apos um tempo sem interacao

## Como Criar um Fluxo

1. Clique em **Novo Fluxo**
2. De um nome e descricao
3. Arraste o no **Inicio** para a area
4. Configure o gatilho (ex: palavra-chave "oi")
5. Adicione nos de **Mensagem** com saudacao
6. Adicione um **Menu** com opcoes
7. Conecte cada opcao ao destino adequado
8. Adicione um no **Transferir** para agente humano quando necessario
9. Finalize com no **Fim**
10. Salve e ative o fluxo

> O Flow Builder permite criar desde saudacoes simples ate fluxos complexos com integracoes, condicoes e coleta de dados.`
        },

        // ===== PONTO - GUIA COMPLETO =====
        {
            cat: 'Marcador de Ponto',
            titulo: 'Marcador de Ponto - Guia Completo',
            tags: 'ponto,guia,completo,entrada,saida,pausa,almoco,relatorio,equipe',
            conteudo: `## Visao Geral

O Marcador de Ponto e o modulo de controle de jornada de trabalho. Permite registrar entrada, saida, almoco, pausas e gerar relatorios completos.

## Para Colaboradores

### Registro Diario
1. **Registrar Entrada** - Botao verde ao iniciar o expediente
2. **Almoco** - Botao laranja ao sair para almoco
3. **Voltar do Almoco** - Botao verde ao retornar
4. **Pausa** - Botao amarelo para intervalos (banheiro, cafe, pessoal, reuniao)
5. **Retomar** - Botao verde para voltar da pausa
6. **Registrar Saida** - Botao vermelho ao final do dia

### Relogio Digital
No topo da pagina, um relogio digital mostra a hora atual em tempo real.

### Card de Jornada
Acompanhe em tempo real:
- Tempo trabalhado (descontando pausas e almoco)
- Carga horaria diaria (meta)
- Barra de progresso visual
- Quantidade e tempo total de pausas

### Historico
Na aba **Meu Historico**, veja seus registros dos ultimos 30 dias com detalhes de cada dia.

## Para Gestores e Administradores

### Aba Equipe
Visao em tempo real de todos os colaboradores:
- **Verde** - Trabalhando
- **Amarelo** - Em pausa (mostra motivo)
- **Laranja** - Em almoco
- **Cinza** - Offline / nao registrou entrada

### Aba Relatorios
1. Selecione periodo e colaborador
2. Veja cards de resumo (horas totais, pausas, media)
3. Tabela detalhada por colaborador
4. Exporte em **CSV** ou **PDF**
5. Clique em **Ver detalhes** para historico dia a dia

### Aba Configuracoes (Ponto)
Configure para cada usuario:
- Horario padrao de entrada e saida
- Horario e duracao do almoco
- Carga horaria diaria
- Flag de home office

## Integracao com Maquina de Ponto

O sistema suporta integracao com maquinas de ponto via API:
- Endpoint: \`POST /api/v1/ponto/registrar\`
- Autenticacao via header \`X-API-Key\`
- Envie \`usuario_id\`, \`tipo\` e \`timestamp\`
- Configure a API Key em **Configuracoes > Marcador de Ponto**

## SSE (Tempo Real)

O status do ponto e atualizado em tempo real via SSE:
- Eventos: \`ponto.entrada\`, \`ponto.saida\`, \`ponto.pausa\`, \`ponto.retomar\`
- A aba Equipe reflete mudancas instantaneamente

> O Marcador de Ponto funciona melhor quando todos os colaboradores registram seus horarios consistentemente.`
        }
    ]
};
