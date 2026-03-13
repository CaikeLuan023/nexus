// ==================== AGENDA / CALENDARIO ====================

let _agendaAno,
    _agendaMes,
    _agendaEventos = [];

document.addEventListener('DOMContentLoaded', () => {
    const hoje = new Date();
    _agendaAno = hoje.getFullYear();
    _agendaMes = hoje.getMonth();
    renderCalendario();
});

function mudarMes(delta) {
    _agendaMes += delta;
    if (_agendaMes < 0) {
        _agendaMes = 11;
        _agendaAno--;
    }
    if (_agendaMes > 11) {
        _agendaMes = 0;
        _agendaAno++;
    }
    renderCalendario();
}

async function renderCalendario() {
    const meses = [
        'Janeiro',
        'Fevereiro',
        'Marco',
        'Abril',
        'Maio',
        'Junho',
        'Julho',
        'Agosto',
        'Setembro',
        'Outubro',
        'Novembro',
        'Dezembro'
    ];
    document.getElementById('agendaMesAno').textContent = `${meses[_agendaMes]} ${_agendaAno}`;

    // Carregar eventos do mes
    try {
        _agendaEventos = await api(`/api/agenda/eventos?mes=${_agendaMes + 1}&ano=${_agendaAno}`);
    } catch {
        _agendaEventos = [];
    }

    const grid = document.getElementById('calendarGrid');
    const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
    let html = dias.map((d) => `<div class="calendar-header">${d}</div>`).join('');

    const primeiroDia = new Date(_agendaAno, _agendaMes, 1);
    const ultimoDia = new Date(_agendaAno, _agendaMes + 1, 0);
    const inicioSemana = primeiroDia.getDay();
    const hoje = new Date();
    const hojeStr = hoje.toISOString().split('T')[0];

    // Dias do mes anterior
    const diasMesAnterior = new Date(_agendaAno, _agendaMes, 0).getDate();
    for (let i = inicioSemana - 1; i >= 0; i--) {
        const d = diasMesAnterior - i;
        html += `<div class="calendar-day other-month"><div class="day-number text-muted">${d}</div></div>`;
    }

    // Dias do mes atual
    for (let d = 1; d <= ultimoDia.getDate(); d++) {
        const dateStr = `${_agendaAno}-${String(_agendaMes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isToday = dateStr === hojeStr;
        const eventosHoje = _agendaEventos.filter((e) => (e.data_inicio || '').startsWith(dateStr));

        html += `<div class="calendar-day${isToday ? ' today' : ''}" onclick="selecionarDia('${dateStr}')">
            <div class="day-number">${d}</div>
            ${eventosHoje
                .slice(0, 3)
                .map(
                    (e) =>
                        `<span class="event-dot" style="background:${e.cor || '#007bff'}" onclick="event.stopPropagation();editarEvento(${e.id})">${e.titulo}</span>`
                )
                .join('')}
            ${eventosHoje.length > 3 ? `<small class="text-muted">+${eventosHoje.length - 3} mais</small>` : ''}
        </div>`;
    }

    // Dias do proximo mes
    const totalCells = inicioSemana + ultimoDia.getDate();
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let d = 1; d <= remaining; d++) {
        html += `<div class="calendar-day other-month"><div class="day-number text-muted">${d}</div></div>`;
    }

    grid.innerHTML = html;
}

function selecionarDia(dateStr) {
    const eventos = _agendaEventos.filter((e) => (e.data_inicio || '').startsWith(dateStr));
    const container = document.getElementById('eventosDia');
    const titulo = document.getElementById('eventosDiaTitulo');
    const lista = document.getElementById('eventosDiaLista');

    titulo.textContent = `Eventos de ${dateStr}`;
    if (!eventos.length) {
        lista.innerHTML = '<div class="text-muted">Nenhum evento neste dia</div>';
    } else {
        lista.innerHTML = eventos
            .map(
                (e) => `
            <div class="d-flex align-items-center gap-2 py-2 border-bottom">
                <span style="width:12px;height:12px;border-radius:50%;background:${e.cor || '#007bff'}"></span>
                <div class="flex-grow-1">
                    <strong>${e.titulo}</strong>
                    <small class="text-muted d-block">${e.tipo} | ${(e.data_inicio || '').substring(11, 16) || 'Dia inteiro'}</small>
                </div>
                <button class="btn btn-sm btn-outline-primary" onclick="editarEvento(${e.id})"><i class="bi bi-pencil"></i></button>
            </div>
        `
            )
            .join('');
    }
    container.style.display = '';
}

function abrirModalEvento(dateStr) {
    document.getElementById('eventoId').value = '';
    document.getElementById('eventoTitulo').value = '';
    document.getElementById('eventoTipo').value = 'evento';
    document.getElementById('eventoCor').value = '#007bff';
    document.getElementById('eventoInicio').value = dateStr ? dateStr + 'T09:00' : '';
    document.getElementById('eventoFim').value = '';
    document.getElementById('eventoDescricao').value = '';
    document.getElementById('btnExcluirEvento').style.display = 'none';
    document.getElementById('modalEventoTitulo').textContent = 'Novo Evento';
    new bootstrap.Modal(document.getElementById('modalEvento')).show();
}

async function editarEvento(id) {
    try {
        const e = await api(`/api/agenda/eventos/${id}`);
        document.getElementById('eventoId').value = e.id;
        document.getElementById('eventoTitulo').value = e.titulo;
        document.getElementById('eventoTipo').value = e.tipo;
        document.getElementById('eventoCor').value = e.cor || '#007bff';
        document.getElementById('eventoInicio').value = (e.data_inicio || '').replace(' ', 'T').substring(0, 16);
        document.getElementById('eventoFim').value = e.data_fim ? e.data_fim.replace(' ', 'T').substring(0, 16) : '';
        document.getElementById('eventoDescricao').value = e.descricao || '';
        document.getElementById('btnExcluirEvento').style.display = '';
        document.getElementById('modalEventoTitulo').textContent = 'Editar Evento';
        new bootstrap.Modal(document.getElementById('modalEvento')).show();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function salvarEvento() {
    const id = document.getElementById('eventoId').value;
    const data = {
        titulo: document.getElementById('eventoTitulo').value.trim(),
        tipo: document.getElementById('eventoTipo').value,
        cor: document.getElementById('eventoCor').value,
        data_inicio: document.getElementById('eventoInicio').value.replace('T', ' '),
        data_fim: document.getElementById('eventoFim').value
            ? document.getElementById('eventoFim').value.replace('T', ' ')
            : null,
        descricao: document.getElementById('eventoDescricao').value.trim()
    };
    if (!data.titulo || !data.data_inicio) {
        mostrarToast('Titulo e data inicio obrigatorios', 'warning');
        return;
    }

    try {
        if (id) {
            await api(`/api/agenda/eventos/${id}`, { method: 'PUT', body: data });
            mostrarToast('Evento atualizado!');
        } else {
            await api('/api/agenda/eventos', { method: 'POST', body: data });
            mostrarToast('Evento criado!');
        }
        bootstrap.Modal.getInstance(document.getElementById('modalEvento')).hide();
        renderCalendario();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function excluirEvento() {
    const id = document.getElementById('eventoId').value;
    if (!id || !confirm('Excluir este evento?')) return;
    try {
        await api(`/api/agenda/eventos/${id}`, { method: 'DELETE' });
        mostrarToast('Evento excluido!');
        bootstrap.Modal.getInstance(document.getElementById('modalEvento')).hide();
        renderCalendario();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}
