// ==================== MARCADOR DE PONTO ====================

let _pontoEstado = 'offline';
let _pontoRelogioInterval = null;
let _pontoPausaInterval = null;
let _pontoIsGerencia = false;

document.addEventListener('DOMContentLoaded', () => {
    pontoIniciarRelogio();
    pontoAguardarUser();
});

function pontoAguardarUser() {
    if (window._currentUser) {
        pontoInit();
    } else {
        setTimeout(pontoAguardarUser, 200);
    }
}

async function pontoInit() {
    const user = window._currentUser;
    _pontoIsGerencia = ['admin', 'gestor_atendimento', 'gerente_noc'].includes(user.perfil);

    if (_pontoIsGerencia) {
        document.getElementById('tabEquipeItem').style.display = '';
        document.getElementById('tabRelatorioItem').style.display = '';
        document.getElementById('tabConfigPontoItem').style.display = '';
        pontoInitRelatorio();
    }

    await pontoCarregarStatus();
    pontoCarregarHistorico();

    if (_pontoIsGerencia) {
        pontoCarregarEquipe();
        pontoCarregarConfigGrid();
    }

    // SSE events
    if (window._globalSSE) {
        const origHandler = window._globalSSE.onmessage;
        window._globalSSE.onmessage = function (e) {
            if (origHandler) origHandler.call(this, e);
            try {
                const data = JSON.parse(e.data);
                if (data.event && data.event.startsWith('ponto.')) {
                    pontoCarregarStatus();
                    if (_pontoIsGerencia) pontoCarregarEquipe();
                }
            } catch {}
        };
    }
}

// Relogio digital
function pontoIniciarRelogio() {
    function tick() {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        document.getElementById('pontoRelogio').textContent = `${h}:${m}:${s}`;

        const dias = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];
        const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        document.getElementById('pontoData').textContent =
            `${dias[now.getDay()]}, ${now.getDate()} ${meses[now.getMonth()]} ${now.getFullYear()}`;
    }
    tick();
    _pontoRelogioInterval = setInterval(tick, 1000);
}

// Carregar status atual
async function pontoCarregarStatus() {
    try {
        const data = await api('/api/ponto/status');
        _pontoEstado = data.estado;
        pontoRenderStatus(data);
    } catch (err) {
        console.error('Erro ao carregar status ponto:', err);
    }
}

function pontoRenderStatus(data) {
    // Status badge
    const badgeEl = document.getElementById('pontoStatusBadge');
    const estadoLabels = { offline: 'Offline', trabalhando: 'Trabalhando', pausa: 'Em Pausa', almoco: 'No Almoco' };
    const estadoClasses = { offline: 'offline', trabalhando: 'online', pausa: 'pausa', almoco: 'almoco' };
    badgeEl.innerHTML = `<span class="ponto-status-badge ${estadoClasses[data.estado]}"><span class="ponto-equipe-estado ${data.estado}"></span>${estadoLabels[data.estado]}</span>`;

    // Botoes de acao
    const acoesEl = document.getElementById('pontoAcoes');
    let btns = '';

    if (data.estado === 'offline') {
        btns = `<button class="ponto-btn-acao btn btn-success btn-lg w-100" onclick="pontoRegistrar('entrada')">
            <i class="bi bi-box-arrow-in-right me-2"></i>Registrar Entrada
        </button>`;
    } else if (data.estado === 'trabalhando') {
        btns = `
            <div class="d-flex gap-2 flex-wrap justify-content-center">
                <button class="ponto-btn-acao btn btn-warning" onclick="pontoAbrirPausa()">
                    <i class="bi bi-pause-circle me-1"></i>Pausa
                </button>
                <button class="ponto-btn-acao btn btn-orange" onclick="pontoRegistrar('entrada_almoco')" style="background:#fd7e14;color:#fff">
                    <i class="bi bi-cup-hot me-1"></i>Almoco
                </button>
                <button class="ponto-btn-acao btn btn-danger" onclick="pontoRegistrar('saida')">
                    <i class="bi bi-box-arrow-right me-1"></i>Saida
                </button>
            </div>`;
    } else if (data.estado === 'pausa') {
        btns = `<button class="ponto-btn-acao btn btn-success btn-lg w-100" onclick="pontoRetomar()">
            <i class="bi bi-play-circle me-2"></i>Retomar Trabalho
        </button>`;
    } else if (data.estado === 'almoco') {
        btns = `<button class="ponto-btn-acao btn btn-success btn-lg w-100" onclick="pontoRegistrar('saida_almoco')">
            <i class="bi bi-play-circle me-2"></i>Voltar do Almoco
        </button>`;
    }
    acoesEl.innerHTML = btns;

    // Pausa timer
    const pausaTimerEl = document.getElementById('pontoPausaTimer');
    if (data.estado === 'pausa' && data.pausaAtiva) {
        pausaTimerEl.style.display = '';
        pontoIniciarPausaTimer(data.pausaAtiva.inicio);
    } else {
        pausaTimerEl.style.display = 'none';
        if (_pontoPausaInterval) {
            clearInterval(_pontoPausaInterval);
            _pontoPausaInterval = null;
        }
    }

    // Jornada
    const horas = Math.floor(data.tempoTrabalhadoMin / 60);
    const mins = data.tempoTrabalhadoMin % 60;
    document.getElementById('pontoTempoTrab').textContent = `${horas}h ${mins}min`;

    const carga = data.config.carga_horaria_min || 480;
    document.getElementById('pontoCargaHoraria').textContent = `${Math.floor(carga / 60)}h`;

    const pausasHoje = data.pausasHoje || [];
    document.getElementById('pontoPausasTotal').textContent = pausasHoje.length;
    const totalPausasMin = pausasHoje.reduce((s, p) => s + (p.duracao_min || 0), 0);
    document.getElementById('pontoPausasMin').textContent = `${totalPausasMin}min`;

    // Progresso
    const pct = Math.min(100, Math.round((data.tempoTrabalhadoMin / carga) * 100));
    const bar = document.getElementById('pontoProgressBar');
    bar.style.width = pct + '%';
    bar.className =
        'progress-bar ' + (pct >= 100 ? 'bg-success' : pct >= 75 ? 'bg-primary' : pct >= 50 ? 'bg-info' : 'bg-warning');

    // Timeline
    pontoRenderTimeline(data.registros, data.pausasHoje);
}

function pontoRenderTimeline(registros, pausas) {
    const el = document.getElementById('pontoTimeline');
    if (!registros || registros.length === 0) {
        el.innerHTML = '<div class="text-muted small">Nenhum registro hoje</div>';
        return;
    }

    const tipoLabels = {
        entrada: 'Entrada',
        saida: 'Saida',
        entrada_almoco: 'Inicio Almoco',
        saida_almoco: 'Fim Almoco'
    };
    const tipoClasses = { entrada: 'entrada', saida: 'saida', entrada_almoco: 'almoco', saida_almoco: 'almoco' };

    let html = '';
    for (const r of registros) {
        const hora = r.data_hora.slice(11, 16);
        html += `<div class="ponto-timeline-item">
            <div class="ponto-timeline-dot ${tipoClasses[r.tipo] || 'entrada'}"></div>
            <div><strong>${hora}</strong> <span class="text-muted small">${tipoLabels[r.tipo] || r.tipo}</span></div>
        </div>`;
    }

    if (pausas && pausas.length > 0) {
        for (const p of pausas) {
            const hora = p.inicio ? p.inicio.slice(11, 16) : '';
            const motivoLabels = {
                banheiro: 'Banheiro',
                cafe: 'Cafe',
                pessoal: 'Pessoal',
                reuniao: 'Reuniao',
                outro: 'Outro'
            };
            html += `<div class="ponto-timeline-item">
                <div class="ponto-timeline-dot pausa"></div>
                <div><strong>${hora}</strong> <span class="text-muted small">Pausa: ${motivoLabels[p.motivo] || p.motivo} (${p.duracao_min || 0}min)</span></div>
            </div>`;
        }
    }

    el.innerHTML = html;
}

function pontoIniciarPausaTimer(inicio) {
    if (_pontoPausaInterval) clearInterval(_pontoPausaInterval);
    function tick() {
        const diff = Math.floor((Date.now() - new Date(inicio).getTime()) / 1000);
        const m = String(Math.floor(diff / 60)).padStart(2, '0');
        const s = String(diff % 60).padStart(2, '0');
        document.getElementById('pontoPausaTempo').textContent = `${m}:${s}`;
    }
    tick();
    _pontoPausaInterval = setInterval(tick, 1000);
}

// Registrar ponto
async function pontoRegistrar(tipo) {
    const labels = {
        entrada: 'entrada',
        saida: 'saida',
        entrada_almoco: 'inicio do almoco',
        saida_almoco: 'volta do almoco'
    };
    if (tipo === 'saida' && !confirm('Deseja registrar sua saida?')) return;

    try {
        const token = typeof getCsrfToken === 'function' ? await getCsrfToken() : null;
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['X-CSRF-Token'] = token;

        const res = await fetch('/api/ponto/registrar', {
            method: 'POST',
            headers,
            body: JSON.stringify({ tipo })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.erro || 'Erro ao registrar');

        mostrarToast(`${labels[tipo] || tipo} registrado com sucesso!`, 'success');
        await pontoCarregarStatus();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

// Pausa
function pontoAbrirPausa() {
    new bootstrap.Modal(document.getElementById('modalPausa')).show();
}

async function pontoIniciarPausa() {
    const motivo = document.getElementById('pausaMotivo').value;
    try {
        const token = typeof getCsrfToken === 'function' ? await getCsrfToken() : null;
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['X-CSRF-Token'] = token;

        const res = await fetch('/api/ponto/pausar', {
            method: 'POST',
            headers,
            body: JSON.stringify({ motivo })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.erro || 'Erro ao pausar');

        bootstrap.Modal.getInstance(document.getElementById('modalPausa'))?.hide();
        mostrarToast('Pausa iniciada', 'success');
        await pontoCarregarStatus();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function pontoRetomar() {
    try {
        const token = typeof getCsrfToken === 'function' ? await getCsrfToken() : null;
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['X-CSRF-Token'] = token;

        const res = await fetch('/api/ponto/retomar', {
            method: 'POST',
            headers
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.erro || 'Erro ao retomar');

        mostrarToast(`Pausa encerrada (${data.duracao_min}min)`, 'success');
        await pontoCarregarStatus();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

// Historico
async function pontoCarregarHistorico() {
    const dias = document.getElementById('pontoHistDias').value || 30;
    try {
        const data = await api(`/api/ponto/historico?dias=${dias}`);
        pontoRenderHistorico(data, 'pontoHistTabela');
    } catch (err) {
        document.getElementById('pontoHistTabela').innerHTML =
            `<tr><td colspan="6" class="text-center text-danger">${err.message}</td></tr>`;
    }
}

function pontoRenderHistorico(data, tabelaId) {
    const tbody = document.getElementById(tabelaId);
    const { registros, pausas } = data;

    if (!registros || registros.length === 0) {
        tbody.innerHTML =
            '<tr><td colspan="6" class="text-center text-muted py-3">Nenhum registro encontrado</td></tr>';
        return;
    }

    // Agrupar por dia
    const diasMap = {};
    for (const r of registros) {
        const dia = r.data_hora.slice(0, 10);
        if (!diasMap[dia]) diasMap[dia] = [];
        diasMap[dia].push(r);
    }

    // Pausas por dia
    const pausasDiaMap = {};
    if (pausas) {
        for (const p of pausas) {
            const dia = p.inicio.slice(0, 10);
            if (!pausasDiaMap[dia]) pausasDiaMap[dia] = [];
            pausasDiaMap[dia].push(p);
        }
    }

    const diasOrdenados = Object.keys(diasMap).sort((a, b) => b.localeCompare(a));
    let html = '';

    for (const dia of diasOrdenados) {
        const regs = diasMap[dia];
        const entrada = regs.find((r) => r.tipo === 'entrada');
        const saida = regs.filter((r) => r.tipo === 'saida').pop();
        const almocoIni = regs.find((r) => r.tipo === 'entrada_almoco');
        const almocoFim = regs.find((r) => r.tipo === 'saida_almoco');
        const pausasDia = pausasDiaMap[dia] || [];
        const totalPausas = pausasDia.reduce((s, p) => s + (p.duracao_min || 0), 0);

        // Calcular total trabalhado
        let totalMin = 0;
        let entradaAtual = null;
        for (const r of regs) {
            if (r.tipo === 'entrada') entradaAtual = new Date(r.data_hora);
            if (r.tipo === 'saida' && entradaAtual) {
                totalMin += (new Date(r.data_hora) - entradaAtual) / 60000;
                entradaAtual = null;
            }
        }
        // Subtrair almoco
        if (almocoIni && almocoFim) {
            totalMin -= (new Date(almocoFim.data_hora) - new Date(almocoIni.data_hora)) / 60000;
        }
        totalMin -= totalPausas;
        totalMin = Math.max(0, Math.round(totalMin));

        const diaFormatado = new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR', {
            weekday: 'short',
            day: '2-digit',
            month: '2-digit'
        });

        html += `<tr>
            <td class="fw-medium">${diaFormatado}</td>
            <td>${entrada ? entrada.data_hora.slice(11, 16) : '-'}</td>
            <td>${almocoIni ? almocoIni.data_hora.slice(11, 16) + (almocoFim ? ' - ' + almocoFim.data_hora.slice(11, 16) : ' (em andamento)') : '-'}</td>
            <td>${saida ? saida.data_hora.slice(11, 16) : '-'}</td>
            <td>${pausasDia.length > 0 ? pausasDia.length + ' (' + totalPausas + 'min)' : '-'}</td>
            <td class="fw-bold">${Math.floor(totalMin / 60)}h ${totalMin % 60}min</td>
        </tr>`;
    }

    tbody.innerHTML = html;
}

// Equipe (gerencia)
async function pontoCarregarEquipe() {
    try {
        const equipe = await api('/api/ponto/equipe');
        pontoRenderEquipe(equipe);
    } catch (err) {
        document.getElementById('pontoEquipeGrid').innerHTML =
            `<div class="col-12 text-center text-danger">${err.message}</div>`;
    }
}

function pontoRenderEquipe(equipe) {
    const grid = document.getElementById('pontoEquipeGrid');
    if (!equipe || equipe.length === 0) {
        grid.innerHTML = '<div class="col-12 text-center text-muted py-3">Nenhum colaborador encontrado</div>';
        return;
    }

    const estadoLabels = { offline: 'Offline', trabalhando: 'Online', pausa: 'Em Pausa', almoco: 'Almoco' };
    const perfilLabels = {
        admin: 'Admin',
        analista: 'Analista',
        vendedor: 'Vendedor',
        gestor_atendimento: 'Gestor Atend.',
        gerente_noc: 'Gerente NOC',
        financeiro: 'Financeiro',
        atendente: 'Atendente'
    };

    grid.innerHTML = equipe
        .map((u) => {
            const iniciais = u.nome
                .split(' ')
                .map((n) => n[0])
                .join('')
                .substring(0, 2)
                .toUpperCase();
            const entrada = u.registros.find((r) => r.tipo === 'entrada');
            const avatarHtml = u.foto_url
                ? `<img src="${u.foto_url}" style="width:40px;height:40px;border-radius:50%;object-fit:cover">`
                : `<div class="ponto-equipe-avatar">${iniciais}</div>`;

            return `<div class="col-md-6 col-lg-4">
            <div class="ponto-equipe-card">
                ${avatarHtml}
                <div class="flex-grow-1 min-width-0">
                    <div class="fw-bold text-truncate">${u.nome}</div>
                    <div class="small text-muted">${perfilLabels[u.perfil] || u.perfil}</div>
                </div>
                <div class="text-end">
                    <div class="d-flex align-items-center gap-1 justify-content-end">
                        <span class="ponto-equipe-estado ${u.estado}"></span>
                        <span class="small fw-medium">${estadoLabels[u.estado]}</span>
                    </div>
                    ${entrada ? `<div class="small text-muted">Entrada: ${entrada.data_hora.slice(11, 16)}</div>` : ''}
                    ${u.pausaAtiva ? `<div class="small text-warning">Pausa: ${u.pausaAtiva.motivo}</div>` : ''}
                    ${u.totalPausasMin > 0 ? `<div class="small text-muted">Pausas: ${u.totalPausasMin}min</div>` : ''}
                </div>
                <div class="d-flex flex-column gap-1 ms-2">
                    <button class="btn btn-sm btn-outline-primary btn-action" onclick="pontoVerHistColaborador(${u.id}, '${u.nome.replace(/'/g, "\\'")}')" title="Historico">
                        <i class="bi bi-clock-history"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-secondary btn-action" onclick="pontoEditarConfig(${u.id}, '${u.nome.replace(/'/g, "\\'")}')" title="Configurar horario">
                        <i class="bi bi-gear"></i>
                    </button>
                </div>
            </div>
        </div>`;
        })
        .join('');
}

// Ver historico de colaborador
async function pontoVerHistColaborador(userId, nome) {
    document.getElementById('modalHistColabTitulo').textContent = `Historico - ${nome}`;
    document.getElementById('modalHistColabTabela').innerHTML =
        '<tr><td colspan="6" class="text-center"><div class="spinner-border spinner-border-sm"></div></td></tr>';
    new bootstrap.Modal(document.getElementById('modalHistColaborador')).show();

    try {
        const data = await api(`/api/ponto/equipe/${userId}/historico?dias=30`);
        pontoRenderHistorico(data, 'modalHistColabTabela');
    } catch (err) {
        document.getElementById('modalHistColabTabela').innerHTML =
            `<tr><td colspan="6" class="text-center text-danger">${err.message}</td></tr>`;
    }
}

// Editar config de horario
async function pontoEditarConfig(userId, nome) {
    document.getElementById('cfgPontoUserId').value = userId;
    document.getElementById('cfgPontoUserNome').textContent = nome;

    try {
        const config = await api(`/api/ponto/config/${userId}`);
        document.getElementById('cfgPontoEntrada').value = config.horario_entrada || '08:00';
        document.getElementById('cfgPontoSaida').value = config.horario_saida || '18:00';
        document.getElementById('cfgPontoAlmoco').value = config.almoco_inicio || '12:00';
        document.getElementById('cfgPontoAlmocoDur').value = config.almoco_duracao_min || 60;
        document.getElementById('cfgPontoCarga').value = config.carga_horaria_min || 480;
        document.getElementById('cfgPontoHomeOffice').checked = !!config.home_office;
    } catch {}

    new bootstrap.Modal(document.getElementById('modalConfigHorario')).show();
}

async function pontoSalvarConfig() {
    const userId = document.getElementById('cfgPontoUserId').value;
    const payload = {
        horario_entrada: document.getElementById('cfgPontoEntrada').value,
        horario_saida: document.getElementById('cfgPontoSaida').value,
        almoco_inicio: document.getElementById('cfgPontoAlmoco').value,
        almoco_duracao_min: parseInt(document.getElementById('cfgPontoAlmocoDur').value),
        carga_horaria_min: parseInt(document.getElementById('cfgPontoCarga').value),
        home_office: document.getElementById('cfgPontoHomeOffice').checked ? 1 : 0
    };

    try {
        const token = typeof getCsrfToken === 'function' ? await getCsrfToken() : null;
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['X-CSRF-Token'] = token;

        const res = await fetch(`/api/ponto/config/${userId}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.erro || 'Erro ao salvar');

        bootstrap.Modal.getInstance(document.getElementById('modalConfigHorario'))?.hide();
        mostrarToast('Configuracao salva com sucesso!', 'success');
        if (_pontoIsGerencia) pontoCarregarConfigGrid();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

// Config grid (tab configuracoes)
async function pontoCarregarConfigGrid() {
    try {
        const equipe = await api('/api/ponto/equipe');
        const grid = document.getElementById('pontoConfigGrid');

        grid.innerHTML = equipe
            .map((u) => {
                const config = u.config || {};
                const he = config.horario_entrada || '08:00';
                const hs = config.horario_saida || '18:00';
                const ai = config.almoco_inicio || '12:00';
                const ad = config.almoco_duracao_min || 60;
                const ch = config.carga_horaria_min || 480;
                const ho = config.home_office ? '<span class="badge bg-info">Home Office</span>' : '';

                return `<div class="col-md-6 col-lg-4">
                <div class="ponto-card p-3">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <div>
                            <div class="fw-bold">${u.nome}</div>
                            <div class="small text-muted">${u.perfil} ${ho}</div>
                        </div>
                        <button class="btn btn-sm btn-outline-primary btn-action" onclick="pontoEditarConfig(${u.id}, '${u.nome.replace(/'/g, "\\'")}')">
                            <i class="bi bi-pencil"></i>
                        </button>
                    </div>
                    <div class="row g-1 small">
                        <div class="col-6"><span class="text-muted">Entrada:</span> ${he}</div>
                        <div class="col-6"><span class="text-muted">Saida:</span> ${hs}</div>
                        <div class="col-6"><span class="text-muted">Almoco:</span> ${ai}</div>
                        <div class="col-6"><span class="text-muted">Dur. Almoco:</span> ${ad}min</div>
                        <div class="col-6"><span class="text-muted">Carga:</span> ${Math.floor(ch / 60)}h${ch % 60 > 0 ? (ch % 60) + 'min' : ''}</div>
                    </div>
                </div>
            </div>`;
            })
            .join('');
    } catch (err) {
        document.getElementById('pontoConfigGrid').innerHTML =
            `<div class="col-12 text-center text-danger">${err.message}</div>`;
    }
}

// ==================== RELATORIO DE PONTO ====================

let _pontoRelatorioData = [];

function pontoInitRelatorio() {
    // Defaults: ultimo mes
    const hoje = new Date();
    const mesPassado = new Date(hoje);
    mesPassado.setDate(1);
    document.getElementById('relPontoDe').value = mesPassado.toISOString().slice(0, 10);
    document.getElementById('relPontoAte').value = hoje.toISOString().slice(0, 10);

    // Popular select de usuarios
    pontoPopularSelectUsuarios();
}

async function pontoPopularSelectUsuarios() {
    try {
        const equipe = await api('/api/ponto/equipe');
        const select = document.getElementById('relPontoUsuario');
        select.innerHTML =
            '<option value="">Todos</option>' +
            equipe.map((u) => `<option value="${u.id}">${u.nome} (${u.perfil})</option>`).join('');
    } catch {}
}

async function pontoCarregarRelatorio() {
    const de = document.getElementById('relPontoDe').value;
    const ate = document.getElementById('relPontoAte').value;
    const usuarioId = document.getElementById('relPontoUsuario').value;

    if (!de || !ate) {
        mostrarToast('Selecione o periodo', 'error');
        return;
    }

    const tbody = document.getElementById('relPontoTabela');
    tbody.innerHTML =
        '<tr><td colspan="7" class="text-center"><div class="spinner-border spinner-border-sm"></div> Carregando...</td></tr>';

    try {
        const data = await api(`/api/ponto/relatorio?de=${de}&ate=${ate}`);
        let relatorio = data;

        // Filtrar por usuario se selecionado
        if (usuarioId) {
            relatorio = relatorio.filter((r) => r.id === parseInt(usuarioId));
        }

        _pontoRelatorioData = relatorio;
        pontoRenderRelatorio(relatorio, de, ate);
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">${err.message}</td></tr>`;
    }
}

function pontoRenderRelatorio(relatorio, de, ate) {
    const tbody = document.getElementById('relPontoTabela');
    const resumoDiv = document.getElementById('relPontoResumo');
    const perfilLabels = {
        admin: 'Admin',
        analista: 'Analista',
        vendedor: 'Vendedor',
        gestor_atendimento: 'Gestor Atend.',
        gerente_noc: 'Gerente NOC',
        financeiro: 'Financeiro',
        atendente: 'Atendente'
    };

    if (!relatorio || relatorio.length === 0) {
        tbody.innerHTML =
            '<tr><td colspan="7" class="text-center text-muted py-3">Nenhum registro encontrado</td></tr>';
        resumoDiv.innerHTML = '';
        return;
    }

    // Resumo
    const totalColab = relatorio.filter((r) => r.dias_trabalhados > 0).length;
    const totalHoras = relatorio.reduce((s, r) => s + r.horas_totais, 0);
    const totalPausas = relatorio.reduce((s, r) => s + r.pausas_min, 0);
    const mediaDia =
        totalColab > 0 ? (totalHoras / relatorio.reduce((s, r) => s + r.dias_trabalhados, 0) || 0).toFixed(1) : 0;

    resumoDiv.innerHTML = `
        <div class="col-6 col-md-3"><div class="ponto-card p-3 text-center"><div class="text-muted small">Colaboradores</div><div class="fs-4 fw-bold">${totalColab}</div></div></div>
        <div class="col-6 col-md-3"><div class="ponto-card p-3 text-center"><div class="text-muted small">Total Horas</div><div class="fs-4 fw-bold text-primary">${totalHoras.toFixed(1)}h</div></div></div>
        <div class="col-6 col-md-3"><div class="ponto-card p-3 text-center"><div class="text-muted small">Total Pausas</div><div class="fs-4 fw-bold text-warning">${totalPausas}min</div></div></div>
        <div class="col-6 col-md-3"><div class="ponto-card p-3 text-center"><div class="text-muted small">Media/Dia</div><div class="fs-4 fw-bold text-success">${mediaDia}h</div></div></div>
    `;

    // Tabela
    tbody.innerHTML = relatorio
        .map((r) => {
            const media = r.dias_trabalhados > 0 ? (r.horas_totais / r.dias_trabalhados).toFixed(1) : '0';
            return `<tr>
            <td class="fw-medium">${r.nome}</td>
            <td><span class="badge bg-secondary">${perfilLabels[r.perfil] || r.perfil}</span></td>
            <td>${r.dias_trabalhados}</td>
            <td class="fw-bold">${r.horas_totais}h</td>
            <td>${r.pausas_min}min</td>
            <td>${media}h</td>
            <td>
                <button class="btn btn-sm btn-outline-primary btn-action" onclick="pontoVerDetalhesRelatorio(${r.id}, '${r.nome.replace(/'/g, "\\'")}')" title="Ver detalhes">
                    <i class="bi bi-eye"></i>
                </button>
            </td>
        </tr>`;
        })
        .join('');
}

async function pontoVerDetalhesRelatorio(userId, nome) {
    const de = document.getElementById('relPontoDe').value;
    const ate = document.getElementById('relPontoAte').value;
    const dias = Math.ceil((new Date(ate) - new Date(de)) / 86400000) + 1;

    document.getElementById('modalHistColabTitulo').textContent =
        `Relatorio - ${nome} (${new Date(de).toLocaleDateString('pt-BR')} a ${new Date(ate).toLocaleDateString('pt-BR')})`;
    document.getElementById('modalHistColabTabela').innerHTML =
        '<tr><td colspan="6" class="text-center"><div class="spinner-border spinner-border-sm"></div></td></tr>';
    new bootstrap.Modal(document.getElementById('modalHistColaborador')).show();

    try {
        const data = await api(`/api/ponto/equipe/${userId}/historico?dias=${dias}`);
        pontoRenderHistorico(data, 'modalHistColabTabela');
    } catch (err) {
        document.getElementById('modalHistColabTabela').innerHTML =
            `<tr><td colspan="6" class="text-center text-danger">${err.message}</td></tr>`;
    }
}

function pontoExportarCSV() {
    if (!_pontoRelatorioData || _pontoRelatorioData.length === 0) {
        mostrarToast('Gere o relatorio primeiro', 'error');
        return;
    }

    const de = document.getElementById('relPontoDe').value;
    const ate = document.getElementById('relPontoAte').value;
    const perfilLabels = {
        admin: 'Administrador',
        analista: 'Analista',
        vendedor: 'Vendedor',
        gestor_atendimento: 'Gestor Atendimento',
        gerente_noc: 'Gerente NOC',
        financeiro: 'Financeiro',
        atendente: 'Atendente'
    };

    let csv = '\uFEFF'; // BOM for Excel UTF-8
    csv += 'Colaborador;Perfil;Dias Trabalhados;Horas Totais;Pausas (min);Media por Dia (h)\n';

    for (const r of _pontoRelatorioData) {
        const media = r.dias_trabalhados > 0 ? (r.horas_totais / r.dias_trabalhados).toFixed(1) : '0';
        csv += `${r.nome};${perfilLabels[r.perfil] || r.perfil};${r.dias_trabalhados};${r.horas_totais};${r.pausas_min};${media}\n`;
    }

    // Totais
    const totalHoras = _pontoRelatorioData.reduce((s, r) => s + r.horas_totais, 0);
    const totalPausas = _pontoRelatorioData.reduce((s, r) => s + r.pausas_min, 0);
    const totalDias = _pontoRelatorioData.reduce((s, r) => s + r.dias_trabalhados, 0);
    csv += `\nTOTAL;;${totalDias};${totalHoras.toFixed(1)};${totalPausas};${totalDias > 0 ? (totalHoras / totalDias).toFixed(1) : 0}\n`;
    csv += `\nPeriodo: ${de} a ${ate}\n`;
    csv += `Gerado em: ${new Date().toLocaleString('pt-BR')}\n`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-ponto-${de}-a-${ate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    mostrarToast('CSV exportado com sucesso!', 'success');
}

function pontoExportarPDF() {
    if (!_pontoRelatorioData || _pontoRelatorioData.length === 0) {
        mostrarToast('Gere o relatorio primeiro', 'error');
        return;
    }

    const de = document.getElementById('relPontoDe').value;
    const ate = document.getElementById('relPontoAte').value;
    const perfilLabels = {
        admin: 'Administrador',
        analista: 'Analista',
        vendedor: 'Vendedor',
        gestor_atendimento: 'Gestor Atendimento',
        gerente_noc: 'Gerente NOC',
        financeiro: 'Financeiro',
        atendente: 'Atendente'
    };

    const totalHoras = _pontoRelatorioData.reduce((s, r) => s + r.horas_totais, 0);
    const totalPausas = _pontoRelatorioData.reduce((s, r) => s + r.pausas_min, 0);
    const totalDias = _pontoRelatorioData.reduce((s, r) => s + r.dias_trabalhados, 0);

    const printWin = window.open('', '_blank');
    printWin.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Relatorio de Ponto</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 30px; color: #333; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        .subtitle { font-size: 13px; color: #666; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: left; font-size: 13px; }
        th { background: #f5f5f5; font-weight: 600; }
        .total-row { font-weight: 700; background: #f0f2f5; }
        .resumo { display: flex; gap: 20px; margin-bottom: 20px; }
        .resumo-item { border: 1px solid #ddd; border-radius: 6px; padding: 10px 16px; text-align: center; }
        .resumo-item .valor { font-size: 22px; font-weight: 700; color: #FF2D78; }
        .resumo-item .label { font-size: 11px; color: #999; }
        .footer { margin-top: 20px; font-size: 11px; color: #999; }
        @media print { body { padding: 10px; } }
    </style></head><body>
    <h1>Relatorio de Ponto</h1>
    <div class="subtitle">Periodo: ${new Date(de).toLocaleDateString('pt-BR')} a ${new Date(ate).toLocaleDateString('pt-BR')} | Gerado em: ${new Date().toLocaleString('pt-BR')}</div>
    <div class="resumo">
        <div class="resumo-item"><div class="valor">${_pontoRelatorioData.filter((r) => r.dias_trabalhados > 0).length}</div><div class="label">Colaboradores</div></div>
        <div class="resumo-item"><div class="valor">${totalHoras.toFixed(1)}h</div><div class="label">Total Horas</div></div>
        <div class="resumo-item"><div class="valor">${totalPausas}min</div><div class="label">Total Pausas</div></div>
        <div class="resumo-item"><div class="valor">${totalDias > 0 ? (totalHoras / totalDias).toFixed(1) : 0}h</div><div class="label">Media/Dia</div></div>
    </div>
    <table>
        <thead><tr><th>Colaborador</th><th>Perfil</th><th>Dias Trab.</th><th>Horas Totais</th><th>Pausas (min)</th><th>Media/Dia</th></tr></thead>
        <tbody>
        ${_pontoRelatorioData
            .map((r) => {
                const media = r.dias_trabalhados > 0 ? (r.horas_totais / r.dias_trabalhados).toFixed(1) : '0';
                return `<tr><td>${r.nome}</td><td>${perfilLabels[r.perfil] || r.perfil}</td><td>${r.dias_trabalhados}</td><td>${r.horas_totais}h</td><td>${r.pausas_min}min</td><td>${media}h</td></tr>`;
            })
            .join('')}
        <tr class="total-row"><td>TOTAL</td><td></td><td>${totalDias}</td><td>${totalHoras.toFixed(1)}h</td><td>${totalPausas}min</td><td>${totalDias > 0 ? (totalHoras / totalDias).toFixed(1) : 0}h</td></tr>
        </tbody>
    </table>
    <div class="footer">Nexus - Relatorio gerado automaticamente</div>
    </body></html>`);
    printWin.document.close();
    setTimeout(() => {
        printWin.print();
    }, 500);
}
