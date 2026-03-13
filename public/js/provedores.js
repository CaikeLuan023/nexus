// ==================== PROVEDORES ====================

const LABELS_PLANO = {
    zapping_lite_plus: 'Zapping Lite Plus',
    zapping_full: 'Zapping Full',
    liteplus_full: 'Lite Plus + Full'
};
const LABELS_MODELO = {
    bundle: 'Bundle',
    hardbundle: 'Hardbundle',
    reseller: 'Reseller',
    hospitality: 'Hospitality',
    empresas: 'Empresas'
};
const LABELS_ERP = {
    ixc: 'IXC',
    hubsoft: 'Hubsoft',
    radius_net: 'Radius NET',
    sgp: 'SGP',
    atlaz: 'Atlaz',
    ispfy: 'ISPFY',
    mycore: 'MYCORE',
    mk_auth: 'Mk-auth',
    proprio: 'Próprio',
    voalle: 'Voalle'
};
const LABELS_ADICIONAIS = {
    telecine: 'Telecine',
    combate: 'Combate',
    canais_adultos: 'Canais Adultos',
    premiere: 'Premiere',
    sportv_plus: 'Sportv+'
};

const ITENS_POR_PAGINA = 10;
let todosProvedores = [];
let paginaAtual = 1;
let vinculosWhatsApp = {};

document.addEventListener('DOMContentLoaded', () => {
    carregarProvedoresPagina();
    carregarVinculosWhatsApp();
});

async function carregarProvedoresPagina() {
    try {
        todosProvedores = await api('/api/provedores');
        paginaAtual = 1;
        filtrarProvedores();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

function filtrarProvedores() {
    const termo = document.getElementById('campoPesquisa').value.toLowerCase().trim();
    let filtrados = todosProvedores;

    if (termo) {
        filtrados = todosProvedores.filter((p) => {
            const planoLabel = LABELS_PLANO[p.plano] || p.plano || '';
            const modeloLabel = LABELS_MODELO[p.modelo_integracao] || p.modelo_integracao || '';
            const erpLabel = LABELS_ERP[p.erp] || p.erp || '';
            const texto = [p.nome, planoLabel, modeloLabel, erpLabel, p.responsavel, p.contato, p.observacoes]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            return texto.includes(termo);
        });
    }

    paginaAtual = 1;
    renderPaginado(filtrados);
}

function renderPaginado(provedores) {
    const totalPaginas = Math.ceil(provedores.length / ITENS_POR_PAGINA) || 1;
    if (paginaAtual > totalPaginas) paginaAtual = totalPaginas;

    const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
    const paginados = provedores.slice(inicio, inicio + ITENS_POR_PAGINA);

    document.getElementById('totalResultados').textContent = `${provedores.length} provedor(es) encontrado(s)`;
    renderTabela(paginados);
    renderPaginacao(totalPaginas, provedores);
}

function renderTabela(provedores) {
    const tbody = document.getElementById('tabelaProvedores');
    if (provedores.length === 0) {
        tbody.innerHTML =
            '<tr><td colspan="9" class="text-center text-muted py-4">Nenhum provedor encontrado</td></tr>';
        return;
    }

    tbody.innerHTML = provedores
        .map((p) => {
            const adicionaisBadges = p.adicionais
                ? p.adicionais
                      .split(',')
                      .map(
                          (a) =>
                              `<span class="badge bg-light text-dark me-1">${LABELS_ADICIONAIS[a.trim()] || a.trim()}</span>`
                      )
                      .join('')
                : '<span class="text-muted">-</span>';

            const logoHtml = p.logo_url
                ? `<img src="${p.logo_url}" alt="${p.nome}" class="logo-provedor" style="cursor:pointer" onclick="ampliarLogo('${p.logo_url.replace(/'/g, "\\'")}', '${p.nome.replace(/'/g, "\\'")}')" onerror="this.outerHTML='<div class=\\'logo-placeholder\\'><i class=\\'bi bi-building\\'></i></div>'">`
                : '<div class="logo-placeholder"><i class="bi bi-building"></i></div>';

            return `
            <tr>
                <td>${logoHtml}</td>
                <td class="fw-bold">${p.nome}</td>
                <td>${p.plano ? `<span class="badge bg-primary">${LABELS_PLANO[p.plano] || p.plano}</span>` : '<span class="text-muted">-</span>'}</td>
                <td>${adicionaisBadges}</td>
                <td>${p.modelo_integracao ? `<span class="badge bg-info text-dark">${LABELS_MODELO[p.modelo_integracao] || p.modelo_integracao}</span>` : '<span class="text-muted">-</span>'}</td>
                <td>${p.erp ? `<span class="badge bg-secondary">${LABELS_ERP[p.erp] || p.erp}</span>` : '<span class="text-muted">-</span>'}</td>
                <td>${p.responsavel || '<span class="text-muted">-</span>'}</td>
                <td>${p.contato ? `<a href="https://wa.me/${p.contato}" target="_blank" class="text-decoration-none"><i class="bi bi-whatsapp text-success me-1"></i>${p.contato}</a>` : '<span class="text-muted">-</span>'}</td>
                <td>
                    <div class="d-flex gap-1">
                        ${vinculosWhatsApp[p.id] ? `<button class="btn btn-sm btn-success btn-action" onclick="abrirChatProvedor('${vinculosWhatsApp[p.id]}')" title="Abrir Chat WhatsApp"><i class="bi bi-whatsapp me-1"></i>Chat</button>` : ''}
                        <button class="btn btn-sm btn-outline-danger btn-action" onclick="exportarProvedorPDF(${p.id})" title="Exportar PDF"><i class="bi bi-file-earmark-pdf"></i></button>
                        <button class="btn btn-sm btn-outline-primary btn-action" onclick="editarProvedor(${p.id})" title="Editar"><i class="bi bi-pencil"></i></button>
                        <button class="btn btn-sm btn-outline-danger btn-action" onclick="excluirProvedor(${p.id})" title="Excluir"><i class="bi bi-trash"></i></button>
                    </div>
                </td>
            </tr>
        `;
        })
        .join('');
}

function renderPaginacao(totalPaginas, provedoresFiltrados) {
    const nav = document.getElementById('paginacao');
    if (totalPaginas <= 1) {
        nav.innerHTML = '';
        return;
    }

    const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA + 1;
    const fim = Math.min(paginaAtual * ITENS_POR_PAGINA, provedoresFiltrados.length);

    let html = `<small class="text-muted">Mostrando ${inicio}-${fim} de ${provedoresFiltrados.length}</small>`;
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
    const termo = document.getElementById('campoPesquisa').value.toLowerCase().trim();
    let filtrados = todosProvedores;

    if (termo) {
        filtrados = todosProvedores.filter((p) => {
            const planoLabel = LABELS_PLANO[p.plano] || p.plano || '';
            const modeloLabel = LABELS_MODELO[p.modelo_integracao] || p.modelo_integracao || '';
            const erpLabel = LABELS_ERP[p.erp] || p.erp || '';
            const texto = [p.nome, planoLabel, modeloLabel, erpLabel, p.responsavel, p.contato, p.observacoes]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            return texto.includes(termo);
        });
    }

    paginaAtual = pagina;
    renderPaginado(filtrados);
}

function getAdicionaisSelecionados() {
    const checkboxes = document.querySelectorAll('#modalProvedor .form-check-input:checked');
    return Array.from(checkboxes)
        .map((cb) => cb.value)
        .join(',');
}

function setAdicionais(adicionaisStr) {
    document.querySelectorAll('#modalProvedor .form-check-input').forEach((cb) => (cb.checked = false));
    if (!adicionaisStr) return;
    adicionaisStr.split(',').forEach((a) => {
        const cb = document.querySelector(`#modalProvedor .form-check-input[value="${a.trim()}"]`);
        if (cb) cb.checked = true;
    });
}

function previewLogo(url) {
    const preview = document.getElementById('logoPreview');
    const img = document.getElementById('logoPreviewImg');
    if (url && (url.startsWith('http') || url.startsWith('/'))) {
        img.src = url;
        img.onerror = () => {
            preview.style.display = 'none';
        };
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }
}

function previewLogoFile(input) {
    const preview = document.getElementById('logoPreview');
    const img = document.getElementById('logoPreviewImg');
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            img.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(input.files[0]);
    } else {
        preview.style.display = 'none';
    }
}

function ampliarLogo(url, nome) {
    document.getElementById('logoAmpliadaImg').src = url;
    document.getElementById('logoAmpliadaNome').textContent = nome;
    new bootstrap.Modal(document.getElementById('modalLogoAmpliada')).show();
}

function toggleTokenVisibility() {
    const input = document.getElementById('provedorToken');
    const icon = document.getElementById('tokenEyeIcon');
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'bi bi-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'bi bi-eye';
    }
}

function abrirModalProvedor(prov) {
    document.getElementById('provedorId').value = prov ? prov.id : '';
    document.getElementById('provedorNome').value = prov ? prov.nome : '';
    document.getElementById('provedorContato').value = prov ? prov.contato || '' : '';
    document.getElementById('provedorLogoUrl').value = prov ? prov.logo_url || '' : '';
    document.getElementById('provedorPlano').value = prov ? prov.plano || '' : '';
    document.getElementById('provedorModelo').value = prov ? prov.modelo_integracao || '' : '';
    document.getElementById('provedorERP').value = prov ? prov.erp || '' : '';
    document.getElementById('provedorObservacoes').value = prov ? prov.observacoes || '' : '';
    document.getElementById('provedorResponsavel').value = prov ? prov.responsavel || '' : '';
    document.getElementById('provedorToken').value = prov ? prov.token_integracao || '' : '';
    document.getElementById('provedorToken').type = 'password';
    document.getElementById('tokenEyeIcon').className = 'bi bi-eye';
    setAdicionais(prov ? prov.adicionais : '');
    previewLogo(prov ? prov.logo_url || '' : '');
    const logoFile = document.getElementById('provedorLogoFile');
    if (logoFile) logoFile.value = '';
    document.getElementById('modalProvedorTitulo').textContent = prov ? 'Editar Provedor' : 'Novo Provedor';
    new bootstrap.Modal(document.getElementById('modalProvedor')).show();
}

async function editarProvedor(id) {
    try {
        const prov = await api(`/api/provedores/${id}`);
        abrirModalProvedor(prov);
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function salvarProvedor() {
    const id = document.getElementById('provedorId').value;
    const data = {
        nome: document.getElementById('provedorNome').value.trim(),
        contato: document.getElementById('provedorContato').value.trim(),
        observacoes: document.getElementById('provedorObservacoes').value.trim(),
        plano: document.getElementById('provedorPlano').value,
        modelo_integracao: document.getElementById('provedorModelo').value,
        erp: document.getElementById('provedorERP').value,
        adicionais: getAdicionaisSelecionados(),
        responsavel: document.getElementById('provedorResponsavel').value.trim(),
        logo_url: document.getElementById('provedorLogoUrl').value.trim(),
        token_integracao: document.getElementById('provedorToken').value.trim()
    };

    if (!data.nome) {
        mostrarToast('Nome é obrigatório', 'warning');
        return;
    }

    try {
        let provedor;
        if (id) {
            provedor = await api(`/api/provedores/${id}`, { method: 'PUT', body: data });
            mostrarToast('Provedor atualizado!');
        } else {
            provedor = await api('/api/provedores', { method: 'POST', body: data });
            mostrarToast('Provedor cadastrado!');
        }

        // Upload logo file if selected
        const logoFile = document.getElementById('provedorLogoFile');
        if (logoFile && logoFile.files.length > 0) {
            const fd = new FormData();
            fd.append('logo', logoFile.files[0]);
            const provedorId = id || provedor.id;
            await fetch(`/api/provedores/${provedorId}/logo`, { method: 'POST', body: fd });
        }

        bootstrap.Modal.getInstance(document.getElementById('modalProvedor')).hide();
        carregarProvedoresPagina();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function excluirProvedor(id) {
    if (!(await confirmar('Tem certeza que deseja excluir este provedor?'))) return;
    try {
        await api(`/api/provedores/${id}`, { method: 'DELETE' });
        mostrarToast('Provedor excluído!');
        carregarProvedoresPagina();
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

function abrirChatProvedor(chatId) {
    window.location.href = `/whatsapp#chat=${encodeURIComponent(chatId)}`;
}

// ==================== EXPORTAÇÃO ====================

const COLUNAS_PROVEDORES = [
    { label: 'Nome', key: 'nome' },
    { label: 'Plano', value: (p) => LABELS_PLANO[p.plano] || p.plano || '' },
    {
        label: 'Adicionais',
        value: (p) =>
            p.adicionais
                ? p.adicionais
                      .split(',')
                      .map((a) => LABELS_ADICIONAIS[a.trim()] || a.trim())
                      .join(', ')
                : ''
    },
    { label: 'Modelo de Integração', value: (p) => LABELS_MODELO[p.modelo_integracao] || p.modelo_integracao || '' },
    { label: 'ERP', value: (p) => LABELS_ERP[p.erp] || p.erp || '' },
    { label: 'Responsável', key: 'responsavel' },
    { label: 'Contato WhatsApp', key: 'contato' },
    { label: 'Total Chamados', value: (p) => p.totalChamados || 0 },
    { label: 'Total Treinamentos', value: (p) => p.totalTreinamentos || 0 },
    { label: 'Total Projetos', value: (p) => p.totalProjetos || 0 },
    { label: 'Observações', key: 'observacoes' },
    { label: 'Logo URL', key: 'logo_url' }
];

function exportarProvedoresCSV() {
    if (todosProvedores.length === 0) {
        mostrarToast('Nenhum provedor para exportar', 'warning');
        return;
    }
    exportarCSV(todosProvedores, COLUNAS_PROVEDORES, 'provedores');
    mostrarToast('CSV exportado com sucesso!');
}

function exportarProvedoresExcel() {
    if (todosProvedores.length === 0) {
        mostrarToast('Nenhum provedor para exportar', 'warning');
        return;
    }
    exportarExcel([{ nome: 'Provedores', dados: todosProvedores, colunas: COLUNAS_PROVEDORES }], 'provedores');
    mostrarToast('Excel exportado com sucesso!');
}

// ==================== EXPORTAÇÃO PDF ====================

const LABELS_STATUS_PDF = {
    pendente: 'Pendente',
    em_andamento: 'Em Andamento',
    resolvido: 'Resolvido',
    fechado: 'Fechado',
    concluido: 'Concluido',
    pausado: 'Pausado',
    cancelado: 'Cancelado'
};

function gerarHeaderPDF() {
    const now = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    return `<div style="text-align:center;margin-bottom:20px;padding-bottom:15px;border-bottom:2px solid #f59e0b">
        <h2 style="margin:0;color:#1a1a2e;font-family:Segoe UI,sans-serif">Nexus</h2>
        <p style="margin:5px 0 0;color:#6c757d;font-size:12px">Relatorio gerado em ${now}</p>
    </div>`;
}

function gerarTabelaPDF(headers, rows) {
    let html = '<table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:15px">';
    html +=
        '<thead><tr>' +
        headers
            .map(
                (h) =>
                    `<th style="background:#f59e0b;color:#fff;padding:6px 8px;text-align:left;font-size:10px">${h}</th>`
            )
            .join('') +
        '</tr></thead>';
    html +=
        '<tbody>' +
        rows
            .map(
                (row, i) =>
                    '<tr>' +
                    row
                        .map(
                            (cell) =>
                                `<td style="padding:5px 8px;border-bottom:1px solid #e9ecef;background:${i % 2 ? '#f8f9fa' : '#fff'}">${cell}</td>`
                        )
                        .join('') +
                    '</tr>'
            )
            .join('') +
        '</tbody></table>';
    return html;
}

async function exportarProvedorPDF(id) {
    if (typeof html2pdf === 'undefined') {
        mostrarToast('Biblioteca html2pdf nao carregada', 'error');
        return;
    }
    mostrarToast('Gerando PDF...', 'info');
    try {
        const data = await api(`/api/dashboard/provedor/${id}/metricas`);
        const p = data.provedor;
        const r = data.resumo;

        let html = `<div style="padding:20px;font-family:Segoe UI,Tahoma,sans-serif;color:#333">`;
        html += gerarHeaderPDF();

        // Provedor info
        html += `<h3 style="color:#f59e0b;margin:0 0 10px;border-bottom:1px solid #e9ecef;padding-bottom:8px">${p.nome}</h3>`;
        html += '<div style="display:flex;flex-wrap:wrap;gap:15px;margin-bottom:20px;font-size:12px">';
        if (p.plano) html += `<div><strong>Plano:</strong> ${LABELS_PLANO[p.plano] || p.plano}</div>`;
        if (p.modelo_integracao)
            html += `<div><strong>Modelo:</strong> ${LABELS_MODELO[p.modelo_integracao] || p.modelo_integracao}</div>`;
        if (p.erp) html += `<div><strong>ERP:</strong> ${LABELS_ERP[p.erp] || p.erp}</div>`;
        if (p.responsavel) html += `<div><strong>Responsavel:</strong> ${p.responsavel}</div>`;
        if (p.contato) html += `<div><strong>Contato:</strong> ${p.contato}</div>`;
        html += '</div>';

        // Resumo metricas
        html += '<div style="display:flex;gap:10px;margin-bottom:20px">';
        const cards = [
            { label: 'Chamados', val: r.total_chamados, color: '#f59e0b' },
            { label: 'Pendentes', val: r.chamados_pendentes, color: '#ff9f43' },
            { label: 'Resolvidos', val: r.chamados_resolvidos, color: '#2ec4b6' },
            { label: 'Treinamentos', val: r.total_treinamentos, color: '#7209b7' },
            { label: 'Projetos', val: r.total_projetos, color: '#3a0ca3' }
        ];
        cards.forEach((c) => {
            html += `<div style="flex:1;text-align:center;padding:10px;border-radius:8px;background:${c.color}15;border:1px solid ${c.color}30">
                <div style="font-size:22px;font-weight:700;color:${c.color}">${c.val}</div>
                <div style="font-size:10px;color:#6c757d">${c.label}</div>
            </div>`;
        });
        html += '</div>';

        // Chamados
        if (data.chamados.length > 0) {
            html += '<h5 style="color:#1a1a2e;margin:15px 0 8px">Chamados</h5>';
            html += gerarTabelaPDF(
                ['ID', 'Titulo', 'Categoria', 'Status', 'Data'],
                data.chamados.map((c) => [
                    c.id,
                    c.titulo,
                    c.categoria,
                    LABELS_STATUS_PDF[c.status] || c.status,
                    c.data_abertura ? new Date(c.data_abertura.replace(' ', 'T')).toLocaleDateString('pt-BR') : '-'
                ])
            );
        }

        // Treinamentos
        if (data.treinamentos.length > 0) {
            html += '<h5 style="color:#1a1a2e;margin:15px 0 8px">Treinamentos</h5>';
            html += gerarTabelaPDF(
                ['ID', 'Titulo', 'Status', 'Data'],
                data.treinamentos.map((t) => [
                    t.id,
                    t.titulo,
                    LABELS_STATUS_PDF[t.status] || t.status,
                    t.data_treinamento
                        ? new Date(t.data_treinamento.replace(' ', 'T')).toLocaleDateString('pt-BR')
                        : '-'
                ])
            );
        }

        // Projetos
        if (data.projetos.length > 0) {
            html += '<h5 style="color:#1a1a2e;margin:15px 0 8px">Projetos</h5>';
            html += gerarTabelaPDF(
                ['ID', 'Titulo', 'Status', 'Prioridade'],
                data.projetos.map((pr) => [
                    pr.id,
                    pr.titulo,
                    LABELS_STATUS_PDF[pr.status] || pr.status,
                    pr.prioridade || '-'
                ])
            );
        }

        html += '</div>';

        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.appendChild(container);

        await html2pdf()
            .set({
                margin: [10, 10, 10, 10],
                filename: `provedor-${p.nome.replace(/\s+/g, '-').toLowerCase()}.pdf`,
                image: { type: 'jpeg', quality: 0.95 },
                html2canvas: { scale: 2 },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            })
            .from(container)
            .save();

        document.body.removeChild(container);
        mostrarToast(`PDF de ${p.nome} exportado!`);
    } catch (err) {
        mostrarToast('Erro ao gerar PDF: ' + err.message, 'error');
    }
}

async function exportarProvedoresPDF() {
    if (typeof html2pdf === 'undefined') {
        mostrarToast('Biblioteca html2pdf nao carregada', 'error');
        return;
    }
    if (todosProvedores.length === 0) {
        mostrarToast('Nenhum provedor para exportar', 'warning');
        return;
    }
    mostrarToast('Gerando PDF...', 'info');

    let html = `<div style="padding:20px;font-family:Segoe UI,Tahoma,sans-serif;color:#333">`;
    html += gerarHeaderPDF();
    html += `<h3 style="color:#1a1a2e;margin:0 0 15px">Relatorio de Provedores (${todosProvedores.length})</h3>`;

    html += gerarTabelaPDF(
        ['Nome', 'Plano', 'Modelo', 'ERP', 'Responsavel', 'Contato'],
        todosProvedores.map((p) => [
            p.nome,
            LABELS_PLANO[p.plano] || p.plano || '-',
            LABELS_MODELO[p.modelo_integracao] || p.modelo_integracao || '-',
            LABELS_ERP[p.erp] || p.erp || '-',
            p.responsavel || '-',
            p.contato || '-'
        ])
    );

    html += '</div>';

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);

    await html2pdf()
        .set({
            margin: [10, 10, 10, 10],
            filename: 'relatorio-provedores.pdf',
            image: { type: 'jpeg', quality: 0.95 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
        })
        .from(container)
        .save();

    document.body.removeChild(container);
    mostrarToast('PDF de provedores exportado!');
}
