// ==================== FINANCEIRO ====================

document.addEventListener('DOMContentLoaded', () => {
    carregarProvedores(document.getElementById('faturaProvedor'));
    carregarProvedores(document.getElementById('finFiltroProvedor'));
    document.getElementById('finFiltroMes').value = new Date().toISOString().substring(0, 7);
    carregarFaturas();
    carregarResumoFinanceiro();
});

async function carregarResumoFinanceiro() {
    try {
        const d = await api('/api/financeiro/resumo');
        document.getElementById('finReceitas').textContent =
            'R$ ' + (d.receitas || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        document.getElementById('finDespesas').textContent =
            'R$ ' + (d.despesas || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        document.getElementById('finSaldo').textContent =
            'R$ ' + (d.saldo || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        document.getElementById('finInadimplencia').textContent =
            'R$ ' + (d.inadimplencia || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    } catch {}
}

async function carregarFaturas() {
    const params = new URLSearchParams();
    const tipo = document.getElementById('finFiltroTipo').value;
    const status = document.getElementById('finFiltroStatus').value;
    const provedor = document.getElementById('finFiltroProvedor').value;
    const mes = document.getElementById('finFiltroMes').value;
    if (tipo) params.set('tipo', tipo);
    if (status) params.set('status', status);
    if (provedor) params.set('provedor_id', provedor);
    if (mes) params.set('mes', mes);

    try {
        const faturas = await api(`/api/financeiro/faturas?${params}`);
        const tbody = document.getElementById('tabelaFaturas');
        if (!faturas.length) {
            tbody.innerHTML =
                '<tr><td colspan="8" class="text-center text-muted py-4">Nenhuma fatura encontrada</td></tr>';
            return;
        }
        tbody.innerHTML = faturas
            .map((f) => {
                const tipoClass = f.tipo === 'receita' ? 'success' : 'danger';
                const statusMap = { pendente: 'warning', pago: 'success', vencido: 'danger', cancelado: 'secondary' };
                return `<tr>
                <td>${f.id}</td>
                <td>${f.provedor_nome}</td>
                <td>${f.descricao || '-'}</td>
                <td><span class="badge bg-${tipoClass}">${f.tipo}</span></td>
                <td class="fw-bold text-${tipoClass}">R$ ${(f.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td><small>${f.data_vencimento}</small></td>
                <td><span class="badge bg-${statusMap[f.status] || 'secondary'}">${f.status}</span></td>
                <td>
                    <div class="d-flex gap-1">
                        ${f.status === 'pendente' ? `<button class="btn btn-sm btn-outline-success" onclick="marcarPago(${f.id})" title="Marcar pago"><i class="bi bi-check-lg"></i></button>` : ''}
                        <button class="btn btn-sm btn-outline-primary" onclick="editarFatura(${f.id})" title="Editar"><i class="bi bi-pencil"></i></button>
                        <button class="btn btn-sm btn-outline-danger" onclick="excluirFatura(${f.id})" title="Excluir"><i class="bi bi-trash"></i></button>
                    </div>
                </td>
            </tr>`;
            })
            .join('');
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

function abrirModalFatura() {
    document.getElementById('faturaId').value = '';
    document.getElementById('faturaProvedor').value = '';
    document.getElementById('faturaTipo').value = 'receita';
    document.getElementById('faturaDescricao').value = '';
    document.getElementById('faturaValor').value = '';
    document.getElementById('faturaVencimento').value = '';
    document.getElementById('faturaStatus').value = 'pendente';
    document.getElementById('faturaFormaPagamento').value = '';
    document.getElementById('faturaObs').value = '';
    document.getElementById('modalFaturaTitulo').textContent = 'Nova Fatura';
    new bootstrap.Modal(document.getElementById('modalFatura')).show();
}

async function editarFatura(id) {
    try {
        const f = await api(`/api/financeiro/faturas/${id}`);
        document.getElementById('faturaId').value = f.id;
        document.getElementById('faturaProvedor').value = f.provedor_id;
        document.getElementById('faturaTipo').value = f.tipo;
        document.getElementById('faturaDescricao').value = f.descricao || '';
        document.getElementById('faturaValor').value = f.valor;
        document.getElementById('faturaVencimento').value = f.data_vencimento;
        document.getElementById('faturaStatus').value = f.status;
        document.getElementById('faturaFormaPagamento').value = f.forma_pagamento || '';
        document.getElementById('faturaObs').value = f.observacoes || '';
        document.getElementById('modalFaturaTitulo').textContent = 'Editar Fatura';
        new bootstrap.Modal(document.getElementById('modalFatura')).show();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function salvarFatura() {
    const id = document.getElementById('faturaId').value;
    const data = {
        provedor_id: document.getElementById('faturaProvedor').value,
        tipo: document.getElementById('faturaTipo').value,
        descricao: document.getElementById('faturaDescricao').value.trim(),
        valor: parseFloat(document.getElementById('faturaValor').value),
        data_vencimento: document.getElementById('faturaVencimento').value,
        status: document.getElementById('faturaStatus').value,
        forma_pagamento: document.getElementById('faturaFormaPagamento').value || null,
        observacoes: document.getElementById('faturaObs').value.trim()
    };
    if (!data.provedor_id || !data.valor || !data.data_vencimento) {
        mostrarToast('Provedor, valor e vencimento obrigatorios', 'warning');
        return;
    }

    try {
        if (id) {
            await api(`/api/financeiro/faturas/${id}`, { method: 'PUT', body: data });
            mostrarToast('Fatura atualizada!');
        } else {
            await api('/api/financeiro/faturas', { method: 'POST', body: data });
            mostrarToast('Fatura criada!');
        }
        bootstrap.Modal.getInstance(document.getElementById('modalFatura')).hide();
        carregarFaturas();
        carregarResumoFinanceiro();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function marcarPago(id) {
    try {
        await api(`/api/financeiro/faturas/${id}/pagar`, { method: 'PATCH' });
        mostrarToast('Fatura marcada como paga!');
        carregarFaturas();
        carregarResumoFinanceiro();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function excluirFatura(id) {
    if (!confirm('Excluir esta fatura?')) return;
    try {
        await api(`/api/financeiro/faturas/${id}`, { method: 'DELETE' });
        mostrarToast('Fatura excluida!');
        carregarFaturas();
        carregarResumoFinanceiro();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}
