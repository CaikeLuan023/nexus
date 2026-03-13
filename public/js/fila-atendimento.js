// ==================== FILA DE ATENDIMENTO ====================

document.addEventListener('DOMContentLoaded', () => {
    carregarFila();
    // Range sliders update
    ['Prioridade', 'SLA', 'Tempo', 'Reaberturas'].forEach(nome => {
        const input = document.getElementById('peso' + nome);
        const val = document.getElementById('peso' + nome + 'Val');
        if (input && val) {
            input.addEventListener('input', () => { val.textContent = parseFloat(input.value).toFixed(1); });
        }
    });
    // Auto-refresh a cada 30s
    setInterval(carregarFila, 30000);
});

async function carregarFila() {
    try {
        const data = await api('/api/chamados/fila');
        renderResumo(data.resumo);
        renderFila(data.chamados);
        if (data.config) {
            setSliderValue('pesoPrioridade', data.config.peso_prioridade);
            setSliderValue('pesoSLA', data.config.peso_sla);
            setSliderValue('pesoTempo', data.config.peso_tempo_espera);
            setSliderValue('pesoReaberturas', data.config.peso_reaberturas);
        }
    } catch (err) {
        console.error('Erro ao carregar fila:', err);
        mostrarToast('Erro ao carregar fila: ' + err.message, 'error');
    }
}

function setSliderValue(id, val) {
    const input = document.getElementById(id);
    const display = document.getElementById(id + 'Val');
    if (input) input.value = val;
    if (display) display.textContent = parseFloat(val).toFixed(1);
}

function renderResumo(resumo) {
    if (!resumo) return;
    document.getElementById('filaTotal').textContent = resumo.total || 0;
    document.getElementById('filaCriticos').textContent = resumo.criticos || 0;
    document.getElementById('filaSLAVencido').textContent = resumo.sla_vencido || 0;
    document.getElementById('filaSemResp').textContent = resumo.sem_responsavel || 0;
    document.getElementById('filaTempoMedio').textContent = (resumo.tempo_medio_espera || 0) + 'd';
}

function renderFila(chamados) {
    const tbody = document.getElementById('tabelaFila');
    if (!chamados || !chamados.length) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4"><i class="bi bi-check-circle fs-3 d-block mb-2 text-success"></i>Fila vazia! Todos os chamados estao em dia.</td></tr>';
        return;
    }

    const PRIO_BADGES = {
        critica: '<span class="badge bg-danger">Critica</span>',
        alta: '<span class="badge bg-warning text-dark">Alta</span>',
        normal: '<span class="badge bg-primary">Normal</span>',
        baixa: '<span class="badge bg-secondary">Baixa</span>'
    };

    tbody.innerHTML = chamados.map((ch, i) => {
        const scoreCor = ch.score_prioridade >= 20 ? 'text-danger fw-bold' :
                         ch.score_prioridade >= 10 ? 'text-warning fw-bold' : 'text-muted';

        const slaStatus = ch.sla_vencido ?
            '<span class="badge bg-danger"><i class="bi bi-exclamation-triangle"></i> Vencido</span>' :
            ch.horas_restantes_sla < 4 ?
                `<span class="badge bg-warning text-dark">${Math.round(ch.horas_restantes_sla)}h restantes</span>` :
            ch.horas_restantes_sla < 999 ?
                `<span class="badge bg-success">${Math.round(ch.horas_restantes_sla)}h</span>` :
                '<span class="badge bg-light text-dark">Sem SLA</span>';

        const diasAberto = Math.round((ch.dias_aberto || 0) * 10) / 10;
        const tempoCor = diasAberto > 7 ? 'text-danger' : diasAberto > 3 ? 'text-warning' : '';

        const responsavel = ch.responsavel_nome ?
            `<span class="badge bg-info text-dark">${escapeHtml(ch.responsavel_nome)}</span>` :
            '<span class="text-danger"><i class="bi bi-person-x"></i> Sem resp.</span>';

        const posIcon = i === 0 ? '<i class="bi bi-1-circle-fill text-danger"></i>' :
                        i === 1 ? '<i class="bi bi-2-circle-fill text-warning"></i>' :
                        i === 2 ? '<i class="bi bi-3-circle-fill text-primary"></i>' :
                        `<span class="text-muted">${i + 1}</span>`;

        const rowClass = ch.sla_vencido ? 'table-danger' : ch.prioridade === 'critica' ? 'table-warning' : '';

        return `
            <tr class="${rowClass}">
                <td class="text-center">${posIcon}</td>
                <td class="${scoreCor}">${ch.score_prioridade}</td>
                <td>${ch.id}</td>
                <td>
                    <strong>${escapeHtml(ch.titulo)}</strong>
                    <br><small class="text-muted">${escapeHtml(ch.categoria || '')}</small>
                    ${ch.reaberturas > 0 ? `<span class="badge bg-dark ms-1" title="Reaberto ${ch.reaberturas}x"><i class="bi bi-arrow-repeat"></i> ${ch.reaberturas}</span>` : ''}
                </td>
                <td>${escapeHtml(ch.provedor_nome)}</td>
                <td>${PRIO_BADGES[ch.prioridade] || PRIO_BADGES.normal}</td>
                <td>${slaStatus}</td>
                <td class="${tempoCor}">${diasAberto}d</td>
                <td>${responsavel}</td>
                <td>
                    <div class="btn-group btn-group-sm">
                        ${!ch.responsavel_id ? `<button class="btn btn-success" title="Assumir" onclick="assumirChamado(${ch.id})"><i class="bi bi-person-check"></i></button>` : ''}
                        <a href="/chamados" class="btn btn-outline-primary" title="Ver"><i class="bi bi-eye"></i></a>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toggleFilaConfig() {
    document.getElementById('filaConfigCard')?.classList.toggle('d-none');
}

async function salvarFilaConfig() {
    try {
        await api('/api/fila-atendimento/config', {
            method: 'PUT',
            body: JSON.stringify({
                peso_prioridade: parseFloat(document.getElementById('pesoPrioridade').value),
                peso_sla: parseFloat(document.getElementById('pesoSLA').value),
                peso_tempo_espera: parseFloat(document.getElementById('pesoTempo').value),
                peso_reaberturas: parseFloat(document.getElementById('pesoReaberturas').value)
            })
        });
        mostrarToast('Pesos salvos com sucesso!', 'success');
        carregarFila();
    } catch (err) {
        mostrarToast('Erro ao salvar pesos: ' + err.message, 'error');
    }
}

async function assumirChamado(id) {
    try {
        await api(`/api/chamados/${id}/assumir`, { method: 'POST' });
        mostrarToast('Chamado assumido!', 'success');
        carregarFila();
    } catch (err) {
        mostrarToast('Erro ao assumir: ' + err.message, 'error');
    }
}
