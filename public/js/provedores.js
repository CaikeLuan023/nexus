// ==================== CLIENTES ====================

const LABELS_ERP_CLI = {
    ixc: 'IXC',
    hubsoft: 'Hubsoft',
    radius_net: 'Radius NET',
    sgp: 'SGP',
    atlaz: 'Atlaz',
    ispfy: 'ISPFY',
    mycore: 'MYCORE',
    mk_auth: 'Mk-auth',
    proprio: 'Proprio',
    voalle: 'Voalle'
};

const ITENS_POR_PAGINA = 10;
let todosClientes = [];
let paginaAtual = 1;
let vinculosWhatsApp = {};

document.addEventListener('DOMContentLoaded', () => {
    carregarClientesPagina();
    carregarVinculosWhatsApp();
});

async function carregarClientesPagina() {
    try {
        todosClientes = await api('/api/provedores');
        paginaAtual = 1;
        filtrarClientes();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

function getFiltrados() {
    const termo = document.getElementById('campoPesquisa').value.toLowerCase().trim();
    const erpFiltro = document.getElementById('filtroErp').value;
    let filtrados = todosClientes;

    if (termo) {
        filtrados = filtrados.filter((c) => {
            const erpLabel = LABELS_ERP_CLI[c.erp] || c.erp || '';
            const texto = [c.nome, c.cnpj, c.email, c.telefone, c.endereco, erpLabel, c.contato, c.observacoes]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            return texto.includes(termo);
        });
    }

    if (erpFiltro) {
        filtrados = filtrados.filter((c) => c.erp === erpFiltro);
    }

    return filtrados;
}

function filtrarClientes() {
    paginaAtual = 1;
    renderPaginado(getFiltrados());
}

function limparFiltros() {
    document.getElementById('campoPesquisa').value = '';
    document.getElementById('filtroErp').value = '';
    filtrarClientes();
}

function renderPaginado(clientes) {
    const totalPaginas = Math.ceil(clientes.length / ITENS_POR_PAGINA) || 1;
    if (paginaAtual > totalPaginas) paginaAtual = totalPaginas;

    const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
    const paginados = clientes.slice(inicio, inicio + ITENS_POR_PAGINA);

    document.getElementById('totalResultados').textContent = `${clientes.length} cliente(s) encontrado(s)`;
    renderTabela(paginados);
    renderPaginacao(totalPaginas, clientes);
}

function renderTabela(clientes) {
    const tbody = document.getElementById('tabelaClientes');
    if (clientes.length === 0) {
        tbody.innerHTML =
            '<tr><td colspan="7" class="text-center text-muted py-4">Nenhum cliente encontrado</td></tr>';
        return;
    }

    tbody.innerHTML = clientes
        .map((c) => {
            const whatsLink = c.contato
                ? `<a href="https://wa.me/${c.contato}" target="_blank" class="text-decoration-none text-success ms-1" title="WhatsApp"><i class="bi bi-whatsapp"></i></a>`
                : '';

            return `
            <tr>
                <td class="fw-bold">${c.nome || '-'}</td>
                <td>${c.cnpj || '<span class="text-muted">-</span>'}</td>
                <td>${c.email || '<span class="text-muted">-</span>'}</td>
                <td>${c.telefone || c.contato || '<span class="text-muted">-</span>'}${whatsLink}</td>
                <td><small>${c.endereco || '<span class="text-muted">-</span>'}</small></td>
                <td>${c.erp ? `<span class="badge bg-secondary">${LABELS_ERP_CLI[c.erp] || c.erp}</span>` : '<span class="text-muted">Manual</span>'}</td>
                <td>
                    <div class="d-flex gap-1">
                        ${vinculosWhatsApp[c.id] ? `<button class="btn btn-sm btn-success btn-action" onclick="abrirChatCliente('${vinculosWhatsApp[c.id]}')" title="Chat WhatsApp"><i class="bi bi-whatsapp"></i></button>` : ''}
                        <button class="btn btn-sm btn-outline-primary btn-action" onclick="editarCliente(${c.id})" title="Editar"><i class="bi bi-pencil"></i></button>
                        <button class="btn btn-sm btn-outline-danger btn-action" onclick="excluirCliente(${c.id})" title="Excluir"><i class="bi bi-trash"></i></button>
                    </div>
                </td>
            </tr>
        `;
        })
        .join('');
}

function renderPaginacao(totalPaginas, clientesFiltrados) {
    const nav = document.getElementById('paginacao');
    if (totalPaginas <= 1) {
        nav.innerHTML = '';
        return;
    }

    const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA + 1;
    const fim = Math.min(paginaAtual * ITENS_POR_PAGINA, clientesFiltrados.length);

    let html = `<small class="text-muted">Mostrando ${inicio}-${fim} de ${clientesFiltrados.length}</small>`;
    html += '<ul class="pagination pagination-sm mb-0">';

    html += `<li class="page-item ${paginaAtual === 1 ? 'disabled' : ''}">
        <a class="page-link" href="#" onclick="irParaPagina(${paginaAtual - 1}, event)"><i class="bi bi-chevron-left"></i></a>
    </li>`;

    const maxBotoes = 5;
    let pInicio = Math.max(1, paginaAtual - Math.floor(maxBotoes / 2));
    let pFim = Math.min(totalPaginas, pInicio + maxBotoes - 1);
    if (pFim - pInicio < maxBotoes - 1) pInicio = Math.max(1, pFim - maxBotoes + 1);

    if (pInicio > 1) {
        html += `<li class="page-item"><a class="page-link" href="#" onclick="irParaPagina(1, event)">1</a></li>`;
        if (pInicio > 2) html += '<li class="page-item disabled"><span class="page-link">...</span></li>';
    }

    for (let i = pInicio; i <= pFim; i++) {
        html += `<li class="page-item ${i === paginaAtual ? 'active' : ''}">
            <a class="page-link" href="#" onclick="irParaPagina(${i}, event)">${i}</a>
        </li>`;
    }

    if (pFim < totalPaginas) {
        if (pFim < totalPaginas - 1) html += '<li class="page-item disabled"><span class="page-link">...</span></li>';
        html += `<li class="page-item"><a class="page-link" href="#" onclick="irParaPagina(${totalPaginas}, event)">${totalPaginas}</a></li>`;
    }

    html += `<li class="page-item ${paginaAtual === totalPaginas ? 'disabled' : ''}">
        <a class="page-link" href="#" onclick="irParaPagina(${paginaAtual + 1}, event)"><i class="bi bi-chevron-right"></i></a>
    </li>`;
    html += '</ul>';

    nav.innerHTML = html;
}

function irParaPagina(pagina, event) {
    if (event) event.preventDefault();
    paginaAtual = pagina;
    renderPaginado(getFiltrados());
}

// ==================== MODAL CLIENTE ====================

function abrirModalCliente(cli) {
    document.getElementById('clienteId').value = cli ? cli.id : '';
    document.getElementById('clienteNome').value = cli ? cli.nome : '';
    document.getElementById('clienteDocumento').value = cli ? cli.cnpj || '' : '';
    document.getElementById('clienteEmail').value = cli ? cli.email || '' : '';
    document.getElementById('clienteTelefone').value = cli ? cli.telefone || '' : '';
    document.getElementById('clienteEndereco').value = cli ? cli.endereco || '' : '';
    document.getElementById('clienteERP').value = cli ? cli.erp || '' : '';
    document.getElementById('clienteContato').value = cli ? cli.contato || '' : '';
    document.getElementById('clienteObservacoes').value = cli ? cli.observacoes || '' : '';
    document.getElementById('modalClienteTitulo').textContent = cli ? 'Editar Cliente' : 'Novo Cliente';
    new bootstrap.Modal(document.getElementById('modalCliente')).show();
}

async function editarCliente(id) {
    try {
        const cli = await api(`/api/provedores/${id}`);
        abrirModalCliente(cli);
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function salvarCliente() {
    const id = document.getElementById('clienteId').value;
    const data = {
        nome: document.getElementById('clienteNome').value.trim(),
        cnpj: document.getElementById('clienteDocumento').value.trim(),
        email: document.getElementById('clienteEmail').value.trim(),
        telefone: document.getElementById('clienteTelefone').value.trim(),
        endereco: document.getElementById('clienteEndereco').value.trim(),
        erp: document.getElementById('clienteERP').value,
        contato: document.getElementById('clienteContato').value.trim(),
        observacoes: document.getElementById('clienteObservacoes').value.trim()
    };

    if (!data.nome) {
        mostrarToast('Nome e obrigatorio', 'warning');
        return;
    }

    try {
        if (id) {
            await api(`/api/provedores/${id}`, { method: 'PUT', body: data });
            mostrarToast('Cliente atualizado!');
        } else {
            await api('/api/provedores', { method: 'POST', body: data });
            mostrarToast('Cliente cadastrado!');
        }

        bootstrap.Modal.getInstance(document.getElementById('modalCliente')).hide();
        carregarClientesPagina();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function excluirCliente(id) {
    if (!(await confirmar('Tem certeza que deseja excluir este cliente?'))) return;
    try {
        await api(`/api/provedores/${id}`, { method: 'DELETE' });
        mostrarToast('Cliente excluido!');
        carregarClientesPagina();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

// ==================== VINCULOS WHATSAPP ====================

async function carregarVinculosWhatsApp() {
    try {
        const vinculos = await api('/api/whatsapp/provedores-vinculados');
        vinculosWhatsApp = {};
        vinculos.forEach((v) => {
            vinculosWhatsApp[v.provedor_id] = v.chat_id;
        });
    } catch {}
}

function abrirChatCliente(chatId) {
    window.location.href = `/whatsapp#chat=${encodeURIComponent(chatId)}`;
}

// ==================== EXPORTACAO ====================

const COLUNAS_CLIENTES = [
    { label: 'Nome', key: 'nome' },
    { label: 'Documento', key: 'cnpj' },
    { label: 'Email', key: 'email' },
    { label: 'Telefone', value: (c) => c.telefone || c.contato || '' },
    { label: 'Endereco', key: 'endereco' },
    { label: 'ERP', value: (c) => LABELS_ERP_CLI[c.erp] || c.erp || 'Manual' },
    { label: 'Observacoes', key: 'observacoes' }
];

function exportarClientesCSV() {
    if (todosClientes.length === 0) {
        mostrarToast('Nenhum cliente para exportar', 'warning');
        return;
    }
    exportarCSV(todosClientes, COLUNAS_CLIENTES, 'clientes');
    mostrarToast('CSV exportado com sucesso!');
}

function exportarClientesExcel() {
    if (todosClientes.length === 0) {
        mostrarToast('Nenhum cliente para exportar', 'warning');
        return;
    }
    exportarExcel([{ nome: 'Clientes', dados: todosClientes, colunas: COLUNAS_CLIENTES }], 'clientes');
    mostrarToast('Excel exportado com sucesso!');
}

function exportarClientesPDF() {
    if (typeof html2pdf === 'undefined') {
        mostrarToast('Biblioteca html2pdf nao carregada', 'error');
        return;
    }
    if (todosClientes.length === 0) {
        mostrarToast('Nenhum cliente para exportar', 'warning');
        return;
    }
    mostrarToast('Gerando PDF...', 'info');

    const now = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    let html = `<div style="padding:20px;font-family:Segoe UI,Tahoma,sans-serif;color:#333">`;
    html += `<div style="text-align:center;margin-bottom:20px;padding-bottom:15px;border-bottom:2px solid #007bff">
        <h2 style="margin:0;color:#1a1a2e">Nexus</h2>
        <p style="margin:5px 0 0;color:#6c757d;font-size:12px">Relatorio gerado em ${now}</p>
    </div>`;
    html += `<h3 style="color:#1a1a2e;margin:0 0 15px">Relatorio de Clientes (${todosClientes.length})</h3>`;

    html += '<table style="width:100%;border-collapse:collapse;font-size:11px">';
    html += '<thead><tr>';
    ['Nome', 'Documento', 'Email', 'Telefone', 'Endereco', 'ERP'].forEach((h) => {
        html += `<th style="background:#007bff;color:#fff;padding:6px 8px;text-align:left;font-size:10px">${h}</th>`;
    });
    html += '</tr></thead><tbody>';

    todosClientes.forEach((c, i) => {
        const bg = i % 2 ? '#f8f9fa' : '#fff';
        html += `<tr>
            <td style="padding:5px 8px;border-bottom:1px solid #e9ecef;background:${bg}">${c.nome || '-'}</td>
            <td style="padding:5px 8px;border-bottom:1px solid #e9ecef;background:${bg}">${c.cnpj || '-'}</td>
            <td style="padding:5px 8px;border-bottom:1px solid #e9ecef;background:${bg}">${c.email || '-'}</td>
            <td style="padding:5px 8px;border-bottom:1px solid #e9ecef;background:${bg}">${c.telefone || c.contato || '-'}</td>
            <td style="padding:5px 8px;border-bottom:1px solid #e9ecef;background:${bg}">${c.endereco || '-'}</td>
            <td style="padding:5px 8px;border-bottom:1px solid #e9ecef;background:${bg}">${LABELS_ERP_CLI[c.erp] || c.erp || 'Manual'}</td>
        </tr>`;
    });

    html += '</tbody></table></div>';

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);

    html2pdf()
        .set({
            margin: [10, 10, 10, 10],
            filename: 'relatorio-clientes.pdf',
            image: { type: 'jpeg', quality: 0.95 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
        })
        .from(container)
        .save()
        .then(() => {
            document.body.removeChild(container);
            mostrarToast('PDF de clientes exportado!');
        });
}
