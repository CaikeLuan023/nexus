// ==================== USUARIOS (ADMIN) ====================

document.addEventListener('DOMContentLoaded', () => {
    carregarUsuarios();
    carregarPermissoes();
});

async function carregarUsuarios() {
    try {
        const usuarios = await api('/api/usuarios');
        renderTabela(usuarios);
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

function renderTabela(usuarios) {
    const tbody = document.getElementById('tabelaUsuarios');
    if (usuarios.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Nenhum usuario encontrado</td></tr>';
        return;
    }

    tbody.innerHTML = usuarios
        .map((u) => {
            const perfilBadges = {
                admin: '<span class="badge bg-danger">Administrador</span>',
                analista: '<span class="badge bg-primary">Analista</span>',
                vendedor: '<span class="badge bg-info">Vendedor</span>',
                gestor_atendimento: '<span class="badge bg-success">Gestor Atendimento</span>',
                gerente_noc: '<span class="badge bg-warning text-dark">Gerente NOC</span>',
                financeiro: '<span class="badge bg-secondary">Financeiro</span>',
                atendente: '<span class="badge bg-primary">Atendente</span>'
            };
            const perfilBadge = perfilBadges[u.perfil] || `<span class="badge bg-secondary">${u.perfil}</span>`;
            const statusBadge = u.ativo
                ? '<span class="badge bg-success">Ativo</span>'
                : '<span class="badge bg-secondary">Inativo</span>';

            return `
            <tr class="${!u.ativo ? 'table-secondary' : ''}">
                <td class="text-muted">${u.id}</td>
                <td class="fw-medium">${u.nome}</td>
                <td><code>${u.usuario}</code></td>
                <td>${perfilBadge}</td>
                <td>${statusBadge}</td>
                <td><small>${formatarData(u.criado_em)}</small></td>
                <td>
                    <div class="d-flex gap-1">
                        <button class="btn btn-sm btn-outline-primary btn-action" onclick="editarUsuario(${u.id})" title="Editar">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-${u.ativo ? 'warning' : 'success'} btn-action" onclick="toggleAtivo(${u.id}, ${u.ativo ? 0 : 1})" title="${u.ativo ? 'Desativar' : 'Ativar'}">
                            <i class="bi bi-${u.ativo ? 'pause-circle' : 'play-circle'}"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger btn-action" onclick="excluirUsuario(${u.id})" title="Excluir">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
        })
        .join('');
}

function abrirModalUsuario() {
    document.getElementById('usuarioId').value = '';
    document.getElementById('usuarioNome').value = '';
    document.getElementById('usuarioLogin').value = '';
    document.getElementById('usuarioSenha').value = '';
    document.getElementById('usuarioPerfil').value = 'analista';
    document.getElementById('modalUsuarioTitulo').textContent = 'Novo Usuario';
    document.getElementById('labelSenha').textContent = 'Senha *';
    document.getElementById('senhaHint').style.display = 'none';
    document.getElementById('usuarioSenha').required = true;
    new bootstrap.Modal(document.getElementById('modalUsuario')).show();
}

async function editarUsuario(id) {
    try {
        const usuarios = await api('/api/usuarios');
        const u = usuarios.find((usr) => usr.id === id);
        if (!u) return;

        document.getElementById('usuarioId').value = u.id;
        document.getElementById('usuarioNome').value = u.nome;
        document.getElementById('usuarioLogin').value = u.usuario;
        document.getElementById('usuarioSenha').value = '';
        document.getElementById('usuarioPerfil').value = u.perfil;
        document.getElementById('modalUsuarioTitulo').textContent = 'Editar Usuario';
        document.getElementById('labelSenha').textContent = 'Senha';
        document.getElementById('senhaHint').style.display = 'block';
        document.getElementById('usuarioSenha').required = false;
        new bootstrap.Modal(document.getElementById('modalUsuario')).show();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function salvarUsuario() {
    const id = document.getElementById('usuarioId').value;
    const data = {
        nome: document.getElementById('usuarioNome').value.trim(),
        usuario: document.getElementById('usuarioLogin').value.trim(),
        perfil: document.getElementById('usuarioPerfil').value
    };
    const senha = document.getElementById('usuarioSenha').value;

    if (!data.nome || !data.usuario) {
        mostrarToast('Preencha nome e usuario', 'warning');
        return;
    }

    if (!id && !senha) {
        mostrarToast('Senha e obrigatoria para novo usuario', 'warning');
        return;
    }

    if (senha) data.senha = senha;

    try {
        if (id) {
            await api(`/api/usuarios/${id}`, { method: 'PUT', body: data });
            mostrarToast('Usuario atualizado!');
        } else {
            await api('/api/usuarios', { method: 'POST', body: data });
            mostrarToast('Usuario criado!');
        }
        bootstrap.Modal.getInstance(document.getElementById('modalUsuario')).hide();
        carregarUsuarios();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function toggleAtivo(id, ativo) {
    const acao = ativo ? 'ativar' : 'desativar';
    if (!(await confirmar(`Tem certeza que deseja ${acao} este usuario?`))) return;

    try {
        await api(`/api/usuarios/${id}/ativo`, {
            method: 'PATCH',
            body: { ativo: ativo === 1 }
        });
        mostrarToast(`Usuario ${ativo ? 'ativado' : 'desativado'}!`);
        carregarUsuarios();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function excluirUsuario(id) {
    if (!(await confirmar('Tem certeza que deseja EXCLUIR este usuario? Esta acao nao pode ser desfeita.'))) return;
    try {
        await api(`/api/usuarios/${id}`, { method: 'DELETE' });
        mostrarToast('Usuario excluido com sucesso!');
        carregarUsuarios();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

// ==================== PERMISSOES POR PERFIL ====================

const moduloLabels = {
    dashboard: 'Dashboard',
    provedores: 'Provedores',
    vendas: 'Vendas',
    dashboard_vendedor: 'Meu Dashboard (Vendedor)',
    chamados: 'Chamados',
    treinamentos: 'Treinamentos',
    projetos: 'Projetos',
    historico: 'Historico',
    whatsapp: 'WhatsApp'
};

const moduloIcons = {
    dashboard: 'bi-speedometer2',
    provedores: 'bi-building',
    vendas: 'bi-cash-coin',
    dashboard_vendedor: 'bi-graph-up-arrow',
    chamados: 'bi-ticket-detailed',
    treinamentos: 'bi-mortarboard',
    projetos: 'bi-kanban',
    historico: 'bi-clock-history',
    whatsapp: 'bi-whatsapp'
};

async function carregarPermissoes() {
    try {
        const perms = await api('/api/permissoes');
        renderPermissoes(perms);
    } catch (err) {
        document.getElementById('tabelaPermissoes').innerHTML =
            '<tr><td colspan="4" class="text-center text-danger py-4">Erro ao carregar permissoes</td></tr>';
    }
}

function renderPermissoes(perms) {
    const tbody = document.getElementById('tabelaPermissoes');
    const modulos = Object.keys(moduloLabels);

    // Organizar dados: { modulo: { perfil: ativo } }
    const matrix = {};
    for (const p of perms) {
        if (!matrix[p.modulo]) matrix[p.modulo] = {};
        matrix[p.modulo][p.perfil] = !!p.ativo;
    }

    tbody.innerHTML = modulos
        .map((modulo) => {
            const icon = moduloIcons[modulo] || 'bi-circle';
            const label = moduloLabels[modulo] || modulo;
            const analistaChecked = matrix[modulo]?.analista ? 'checked' : '';
            const vendedorChecked = matrix[modulo]?.vendedor ? 'checked' : '';

            return `
            <tr>
                <td>
                    <i class="bi ${icon} me-2 text-primary"></i>
                    <strong>${label}</strong>
                </td>
                <td class="text-center">
                    <div class="form-check d-flex justify-content-center">
                        <input class="form-check-input perm-checkbox" type="checkbox"
                            data-perfil="analista" data-modulo="${modulo}" ${analistaChecked}>
                    </div>
                </td>
                <td class="text-center">
                    <div class="form-check d-flex justify-content-center">
                        <input class="form-check-input perm-checkbox" type="checkbox"
                            data-perfil="vendedor" data-modulo="${modulo}" ${vendedorChecked}>
                    </div>
                </td>
                <td class="text-center">
                    <div class="form-check d-flex justify-content-center">
                        <input class="form-check-input" type="checkbox" checked disabled
                            title="Admin sempre tem acesso total">
                    </div>
                </td>
            </tr>
        `;
        })
        .join('');
}

async function salvarPermissoes() {
    const checkboxes = document.querySelectorAll('.perm-checkbox');
    const perfis = { analista: {}, vendedor: {} };

    checkboxes.forEach((cb) => {
        const perfil = cb.dataset.perfil;
        const modulo = cb.dataset.modulo;
        perfis[perfil][modulo] = cb.checked;
    });

    try {
        for (const [perfil, modulos] of Object.entries(perfis)) {
            await api(`/api/permissoes/${perfil}`, {
                method: 'PUT',
                body: { modulos }
            });
        }
        mostrarToast('Permissoes salvas com sucesso!');
        carregarPermissoes();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}
