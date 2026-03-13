// ==================== UTILITARIOS COMPARTILHADOS ====================

// CSRF Token Management
let _csrfToken = null;
async function getCsrfToken() {
    if (_csrfToken) return _csrfToken;
    try {
        const res = await fetch('/api/csrf-token');
        if (res.ok) {
            const data = await res.json();
            _csrfToken = data.token;
            return _csrfToken;
        }
    } catch (e) {
        /* noop */
    }
    return null;
}

async function api(url, options = {}) {
    if (options.body && !(options.body instanceof FormData)) {
        options.headers = { 'Content-Type': 'application/json', ...options.headers };
    }
    // Add CSRF token for state-changing methods
    const method = (options.method || 'GET').toUpperCase();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        const token = await getCsrfToken();
        if (token) {
            options.headers = { ...options.headers, 'X-CSRF-Token': token };
        }
    }
    if (
        options.body &&
        typeof options.body === 'object' &&
        !(options.body instanceof FormData) &&
        typeof options.body !== 'string'
    ) {
        options.body = JSON.stringify(options.body);
    }
    const res = await fetch(url, options);
    if (res.status === 401) {
        _csrfToken = null;
        window.location.href = '/login';
        throw new Error('Sessao expirada');
    }
    if (res.status === 403) {
        const data = await res.json();
        if (data.erro && data.erro.includes('CSRF')) {
            _csrfToken = null;
            const token = await getCsrfToken();
            if (token) {
                options.headers = { ...options.headers, 'X-CSRF-Token': token };
                const retry = await fetch(url, options);
                if (retry.status === 401) {
                    window.location.href = '/login';
                    throw new Error('Sessao expirada');
                }
                const retryData = await retry.json();
                if (!retry.ok) throw new Error(retryData.erro || 'Erro desconhecido');
                return retryData;
            }
        }
        throw new Error(data.erro || 'Acesso negado');
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.erro || 'Erro desconhecido');
    return data;
}

function formatarData(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr.replace(' ', 'T'));
    return d.toLocaleDateString('pt-BR');
}

function formatarDataHora(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr.replace(' ', 'T'));
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function mostrarToast(mensagem, tipo = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const cores = {
        success: 'bg-success',
        error: 'bg-danger',
        warning: 'bg-warning text-dark',
        info: 'bg-info text-dark'
    };

    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-white ${cores[tipo] || cores.success} border-0`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">${escapeHtmlGlobal(mensagem)}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
    `;
    container.appendChild(toast);
    const bsToast = new bootstrap.Toast(toast, { delay: 3000 });
    bsToast.show();
    toast.addEventListener('hidden.bs.toast', () => toast.remove());
}

function badgeStatus(status) {
    const cores = {
        pendente: 'warning',
        em_andamento: 'primary',
        resolvido: 'success',
        fechado: 'secondary',
        concluido: 'success',
        pausado: 'info',
        cancelado: 'danger'
    };
    const labels = {
        pendente: 'Pendente',
        em_andamento: 'Em Andamento',
        resolvido: 'Resolvido',
        fechado: 'Fechado',
        concluido: 'Concluido',
        pausado: 'Pausado',
        cancelado: 'Cancelado'
    };
    return `<span class="badge bg-${cores[status] || 'secondary'}">${labels[status] || status}</span>`;
}

function badgePrioridade(prioridade) {
    const cores = { baixa: 'success', media: 'warning', alta: 'danger' };
    const labels = { baixa: 'Baixa', media: 'Media', alta: 'Alta' };
    return `<span class="badge bg-${cores[prioridade] || 'secondary'}">${labels[prioridade] || prioridade}</span>`;
}

function badgeCategoria(categoria) {
    const cores = {
        usuario: 'info',
        app: 'primary',
        integracao: 'warning',
        canal: 'danger',
        troca_senha: 'purple',
        email_ativacao: 'dark',
        outro: 'secondary'
    };
    const labels = {
        usuario: 'Usuario',
        app: 'App',
        integracao: 'Integracao',
        canal: 'Canal',
        troca_senha: 'Troca de Senha/Email',
        email_ativacao: 'Email Ativacao',
        outro: 'Outro'
    };
    const cor = cores[categoria] || 'secondary';
    const style = cor === 'purple' ? 'style="background-color:#7209b7"' : '';
    return `<span class="badge bg-${cor}" ${style}>${labels[categoria] || categoria}</span>`;
}

function labelCategoria(categoria) {
    const labels = {
        usuario: 'Problemas com Usuario',
        app: 'Problemas com App',
        integracao: 'Problemas de Integracao',
        canal: 'Problemas com Canal',
        troca_senha: 'Troca de Senha / Email',
        email_ativacao: 'Email de Ativacao nao recebido',
        outro: 'Outros'
    };
    return labels[categoria] || categoria;
}

async function carregarProvedores(selectEl, selecionado) {
    const provedores = await api('/api/provedores');
    selectEl.innerHTML = '<option value="">Selecione...</option>';
    provedores.forEach((p) => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.nome;
        if (selecionado && p.id == selecionado) opt.selected = true;
        selectEl.appendChild(opt);
    });
}

// ==================== THEME TOGGLE ====================

(function () {
    const saved = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
})();

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeButton(next);
    applyChartTheme(next);
}

function updateThemeButton(theme) {
    const icon = document.getElementById('themeIcon');
    const label = document.getElementById('themeLabel');
    if (icon && label) {
        icon.className = theme === 'dark' ? 'bi bi-sun-fill me-1' : 'bi bi-moon-fill me-1';
        label.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
    }
}

function applyChartTheme(theme) {
    if (typeof Chart === 'undefined') return;
    const isDark = theme === 'dark';
    const textColor = isDark ? '#e8eaf0' : '#1a1a2e';
    const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
    Chart.defaults.color = textColor;
    Chart.defaults.borderColor = gridColor;
    Chart.defaults.plugins.legend.labels.color = textColor;
    Chart.defaults.plugins.title.color = textColor;
    Chart.defaults.scale.ticks.color = textColor;
    Chart.defaults.scale.grid.color = gridColor;
}

// Aplicar tema do Chart.js na carga inicial
document.addEventListener('DOMContentLoaded', () => {
    applyChartTheme(localStorage.getItem('theme') || 'light');
});

// ==================== SIDEBAR DINAMICA ====================

const _sidebarItems = [
    { id: 'navDashboard', modulo: 'dashboard', icon: 'bi-speedometer2', label: 'Dashboard', href: '/' },
    { id: 'navProvedores', modulo: 'provedores', icon: 'bi-building', label: 'Provedores', href: '/provedores' },
    { id: 'navVendas', modulo: 'vendas', icon: 'bi-cash-coin', label: 'Vendas', href: '/vendas' },
    {
        id: 'navDashboardVendedor',
        modulo: 'dashboard_vendedor',
        icon: 'bi-graph-up-arrow',
        label: 'Meu Dashboard',
        href: '/dashboard-vendedor'
    },
    { id: 'navChamados', modulo: 'chamados', icon: 'bi-ticket-detailed', label: 'Chamados', href: '/chamados' },
    {
        id: 'navFilaAtendimento',
        modulo: 'chamados',
        icon: 'bi-sort-down',
        label: 'Fila Atendimento',
        href: '/fila-atendimento'
    },
    {
        id: 'navTreinamentos',
        modulo: 'treinamentos',
        icon: 'bi-mortarboard',
        label: 'Treinamentos',
        href: '/treinamentos'
    },
    { id: 'navProjetos', modulo: 'projetos', icon: 'bi-kanban', label: 'Projetos', href: '/projetos' },
    { id: 'navHistorico', modulo: 'historico', icon: 'bi-clock-history', label: 'Historico', href: '/historico' },
    { id: 'navAtendimento', modulo: 'whatsapp', icon: 'bi-headset', label: 'Atendimento', href: '/atendimento' },
    { id: 'navPonto', modulo: 'ponto', icon: 'bi-clock-history', label: 'Ponto', href: '/ponto' },
    { id: 'navFlow', modulo: 'whatsapp', icon: 'bi-diagram-3', label: 'Fluxos', href: '/flow' },
    {
        id: 'navRelatorios',
        modulo: 'relatorios',
        icon: 'bi-file-earmark-bar-graph',
        label: 'Relatorios',
        href: '/relatorios'
    },
    { id: 'navConhecimento', modulo: 'conhecimento', icon: 'bi-book', label: 'Conhecimento', href: '/conhecimento' },
    { id: 'navAgenda', modulo: 'agenda', icon: 'bi-calendar3', label: 'Agenda', href: '/agenda' },
    { id: 'navNPS', modulo: 'chamados', icon: 'bi-star', label: 'NPS', href: '/nps' },
    { id: 'navFinanceiro', modulo: 'financeiro', icon: 'bi-currency-dollar', label: 'Financeiro', href: '/financeiro' },
    { id: 'navUsuarios', modulo: 'usuarios', icon: 'bi-people-fill', label: 'Usuarios', href: '/usuarios' },
    { id: 'navLogs', modulo: 'configuracoes', icon: 'bi-journal-code', label: 'Logs API', href: '/logs' },
    { id: 'navConfiguracoes', modulo: 'configuracoes', icon: 'bi-gear', label: 'Configuracoes', href: '/configuracoes' }
];

function gerarSidebar(permissoes) {
    const sidebar = document.getElementById('mainSidebar');
    if (!sidebar) return;

    const currentPath = window.location.pathname;

    const navItems = _sidebarItems
        .map((item) => {
            const isActive =
                (item.href === '/' && currentPath === '/') || (item.href !== '/' && currentPath.startsWith(item.href));
            const display = permissoes[item.modulo] ? '' : 'none';
            const activeClass = isActive ? ' active' : '';
            let extra = '';
            if (item.id === 'navWhatsApp' && currentPath === '/whatsapp') {
                extra =
                    ' <span class="badge bg-success rounded-pill ms-1" id="sidebarUnreadBadge" style="display:none">0</span>';
            }
            return `<li class="nav-item" id="${item.id}" style="display:${display}"><a class="nav-link${activeClass}" href="${item.href}"><i class="bi ${item.icon}"></i> ${item.label}${extra}</a></li>`;
        })
        .join('\n            ');

    sidebar.innerHTML = `
        <div class="sidebar-brand">
            <i class="bi bi-clipboard-data"></i>
            <h5>Nexus</h5>
        </div>
        <ul class="nav flex-column mt-2">
            ${navItems}
        </ul>
        <div class="sidebar-theme-toggle" id="themeToggle">
            <button class="btn btn-sm btn-outline-light w-100" onclick="toggleTheme()">
                <i class="bi bi-moon-fill me-1" id="themeIcon"></i>
                <span id="themeLabel">Dark Mode</span>
            </button>
            <button class="btn btn-sm btn-outline-light w-100 mt-1 position-relative" onclick="toggleNotificacoes()" id="btnNotificacoes">
                <i class="bi bi-bell me-1"></i> Notificacoes
                <span class="badge bg-danger rounded-pill ms-1" id="badgeNotificacoes" style="display:none">0</span>
            </button>
            <button class="btn btn-sm btn-outline-light w-100 mt-1" onclick="abrirBuscaGlobal()">
                <i class="bi bi-search me-1"></i> Busca <kbd class="ms-1" style="font-size:.65em;opacity:.7">Ctrl+K</kbd>
            </button>
        </div>
        <div id="onlineUsersPanel"></div>
        <div class="sidebar-user" id="sidebarUser"></div>
    `;
    updateThemeButton(localStorage.getItem('theme') || 'light');
}

// ==================== SIDEBAR: USUARIO LOGADO ====================

document.addEventListener('DOMContentLoaded', () => {
    updateThemeButton(localStorage.getItem('theme') || 'light');
    carregarUsuarioLogado();
    getCsrfToken(); // Pre-load CSRF token
});

async function carregarUsuarioLogado() {
    try {
        const user = await api('/api/me');

        const permissoes = user.permissoes || {};
        window._userPermissions = permissoes;
        window._userPerfil = user.perfil;

        // Gerar sidebar dinamica
        gerarSidebar(permissoes);

        // Preencher info do usuario
        window._currentUser = user;
        const sidebarUser = document.getElementById('sidebarUser');
        if (sidebarUser) {
            const iniciais = user.nome
                .split(' ')
                .map((n) => n[0])
                .join('')
                .substring(0, 2)
                .toUpperCase();
            const perfilLabels = {
                admin: 'Administrador',
                analista: 'Analista',
                vendedor: 'Vendedor',
                gestor_atendimento: 'Gestor Atendimento',
                gerente_noc: 'Gerente NOC',
                financeiro: 'Financeiro',
                atendente: 'Atendente'
            };
            const perfilLabel = perfilLabels[user.perfil] || user.perfil;
            const avatarHtml = user.foto_url
                ? `<img src="${escapeHtmlGlobal(user.foto_url)}" class="sidebar-user-avatar-img">`
                : `<div class="sidebar-user-avatar">${iniciais}</div>`;
            sidebarUser.innerHTML = `
                <div class="d-flex align-items-center gap-2 flex-grow-1 min-width-0" style="cursor:pointer" onclick="abrirModalPerfil()" title="Editar Perfil">
                    ${avatarHtml}
                    <div class="sidebar-user-info">
                        <div class="sidebar-user-name">${escapeHtmlGlobal(user.nome)}</div>
                        <div class="sidebar-user-role"><i class="bi bi-shield-check me-1"></i>${perfilLabel}</div>
                    </div>
                </div>
                <div class="d-flex gap-1">
                    <button class="btn btn-sm btn-outline-light sidebar-logout-btn" onclick="abrirModalPerfil()" title="Meu Perfil">
                        <i class="bi bi-person-gear"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-light sidebar-logout-btn" onclick="logout()" title="Sair">
                        <i class="bi bi-box-arrow-right"></i>
                    </button>
                </div>
            `;
        }
    } catch (err) {
        // Se nao autenticado, redireciona para login
    }
}

// ==================== MODAL: MEU PERFIL ====================

function abrirModalPerfil() {
    if (!document.getElementById('modalPerfil')) {
        document.body.insertAdjacentHTML(
            'beforeend',
            `
        <div class="modal fade" id="modalPerfil" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title"><i class="bi bi-person-circle me-2"></i>Meu Perfil</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="text-center mb-3">
                            <div class="perfil-foto-container" id="perfilFotoContainer"></div>
                            <div class="mt-2">
                                <label class="btn btn-sm btn-outline-primary">
                                    <i class="bi bi-camera me-1"></i>Alterar Foto
                                    <input type="file" accept="image/*" id="inputFotoPerfil" style="display:none" onchange="uploadFotoPerfil(this)">
                                </label>
                                <button class="btn btn-sm btn-outline-danger" id="btnRemoverFoto" style="display:none" onclick="removerFotoPerfil()">
                                    <i class="bi bi-trash"></i>
                                </button>
                            </div>
                        </div>
                        <div class="row g-3">
                            <div class="col-12">
                                <label class="form-label text-muted small">Nome</label>
                                <div class="fw-semibold" id="perfilNome"></div>
                            </div>
                            <div class="col-6">
                                <label class="form-label text-muted small">Usuario</label>
                                <div id="perfilUsuario"></div>
                            </div>
                            <div class="col-6">
                                <label class="form-label text-muted small">Perfil / Role</label>
                                <div><span class="badge bg-primary" id="perfilRole"></span></div>
                            </div>
                        </div>
                        <hr>
                        <div class="d-flex gap-2">
                            <button class="btn btn-outline-secondary btn-sm" onclick="bootstrap.Modal.getInstance(document.getElementById('modalPerfil')).hide(); abrirModalSenha()">
                                <i class="bi bi-key me-1"></i>Alterar Senha
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>`
        );
    }
    const u = window._currentUser;
    if (u) {
        const iniciais = u.nome
            .split(' ')
            .map((n) => n[0])
            .join('')
            .substring(0, 2)
            .toUpperCase();
        const container = document.getElementById('perfilFotoContainer');
        if (u.foto_url) {
            container.innerHTML = `<img src="${escapeHtmlGlobal(u.foto_url)}" class="perfil-foto-img">`;
            document.getElementById('btnRemoverFoto').style.display = '';
        } else {
            container.innerHTML = `<div class="perfil-foto-placeholder">${iniciais}</div>`;
            document.getElementById('btnRemoverFoto').style.display = 'none';
        }
        document.getElementById('perfilNome').textContent = u.nome;
        document.getElementById('perfilUsuario').textContent = u.usuario;
        const perfilLabels = {
            admin: 'Administrador',
            analista: 'Analista',
            vendedor: 'Vendedor',
            gestor_atendimento: 'Gestor Atendimento',
            gerente_noc: 'Gerente NOC',
            financeiro: 'Financeiro',
            atendente: 'Atendente'
        };
        document.getElementById('perfilRole').textContent = perfilLabels[u.perfil] || u.perfil;
    }
    new bootstrap.Modal(document.getElementById('modalPerfil')).show();
}

async function uploadFotoPerfil(input) {
    if (!input.files[0]) return;
    const form = new FormData();
    form.append('foto', input.files[0]);
    try {
        const r = await fetch('/api/me/foto', { method: 'POST', body: form });
        const data = await r.json();
        if (data.foto_url) {
            window._currentUser.foto_url = data.foto_url;
            mostrarToast('Foto atualizada!', 'success');
            abrirModalPerfil();
            carregarUsuarioLogado();
        } else {
            mostrarToast(data.erro || 'Erro ao enviar foto', 'danger');
        }
    } catch {
        mostrarToast('Erro ao enviar foto', 'danger');
    }
    input.value = '';
}

async function removerFotoPerfil() {
    try {
        await fetch('/api/me/foto', { method: 'DELETE' });
        window._currentUser.foto_url = null;
        mostrarToast('Foto removida', 'success');
        abrirModalPerfil();
        carregarUsuarioLogado();
    } catch {
        mostrarToast('Erro ao remover foto', 'danger');
    }
}

// ==================== TROCA DE SENHA ====================

function abrirModalSenha() {
    // Injetar modal se nao existir
    if (!document.getElementById('modalAlterarSenha')) {
        const modalHtml = `
        <div class="modal fade" id="modalAlterarSenha" tabindex="-1">
            <div class="modal-dialog modal-sm">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title"><i class="bi bi-key me-2"></i>Alterar Senha</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-3">
                            <label class="form-label">Senha Atual *</label>
                            <input type="password" class="form-control" id="senhaAtual" required>
                        </div>
                        <div class="mb-3">
                            <label class="form-label">Nova Senha *</label>
                            <input type="password" class="form-control" id="novaSenha" required>
                            <small class="text-muted">Minimo 6 caracteres</small>
                        </div>
                        <div class="mb-3">
                            <label class="form-label">Confirmar Nova Senha *</label>
                            <input type="password" class="form-control" id="confirmarSenha" required>
                        </div>
                        <hr class="my-3">
                        <h6><i class="bi bi-shield-lock me-1"></i>Autenticacao em Dois Fatores (2FA)</h6>
                        <div id="2faStatus"></div>
                        <div id="2faSetup" style="display:none">
                            <p class="small text-muted">Escaneie o QR code com seu app autenticador (Google Authenticator, Authy, etc)</p>
                            <div class="text-center mb-2"><canvas id="qr2fa"></canvas></div>
                            <p class="small text-muted text-center">Ou copie o codigo: <code id="secret2fa"></code></p>
                            <div class="d-flex gap-2 mt-2">
                                <input type="text" class="form-control" id="codigo2fa" placeholder="Codigo de 6 digitos" maxlength="6">
                                <button class="btn btn-success text-nowrap" onclick="ativar2FA()">Ativar</button>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button type="button" class="btn btn-primary" onclick="salvarNovaSenha()">Alterar</button>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
    document.getElementById('senhaAtual').value = '';
    document.getElementById('novaSenha').value = '';
    document.getElementById('confirmarSenha').value = '';
    new bootstrap.Modal(document.getElementById('modalAlterarSenha')).show();
    carregar2FAStatus();
}

async function salvarNovaSenha() {
    const senha_atual = document.getElementById('senhaAtual').value;
    const nova_senha = document.getElementById('novaSenha').value;
    const confirmar = document.getElementById('confirmarSenha').value;

    if (!senha_atual || !nova_senha) {
        mostrarToast('Preencha todos os campos', 'warning');
        return;
    }
    if (nova_senha.length < 6) {
        mostrarToast('Nova senha deve ter pelo menos 6 caracteres', 'warning');
        return;
    }
    if (nova_senha !== confirmar) {
        mostrarToast('As senhas nao coincidem', 'warning');
        return;
    }

    try {
        await api('/api/me/alterar-senha', {
            method: 'POST',
            body: { senha_atual, nova_senha }
        });
        mostrarToast('Senha alterada com sucesso!');
        bootstrap.Modal.getInstance(document.getElementById('modalAlterarSenha')).hide();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

// ==================== 2FA ====================

async function carregar2FAStatus() {
    try {
        const data = await api('/api/me/2fa/status');
        const statusDiv = document.getElementById('2faStatus');
        if (data.ativo) {
            statusDiv.innerHTML =
                '<div class="d-flex justify-content-between align-items-center"><span class="badge bg-success"><i class="bi bi-shield-check me-1"></i>2FA Ativo</span><button class="btn btn-sm btn-outline-danger" onclick="desativar2FA()">Desativar</button></div>';
            document.getElementById('2faSetup').style.display = 'none';
        } else {
            statusDiv.innerHTML =
                '<div class="d-flex justify-content-between align-items-center"><span class="badge bg-secondary">2FA Inativo</span><button class="btn btn-sm btn-outline-primary" onclick="gerar2FA()">Configurar</button></div>';
        }
    } catch {}
}

let _2faSecret = null;

async function gerar2FA() {
    try {
        const data = await api('/api/me/2fa/gerar', { method: 'POST' });
        _2faSecret = data.secret;
        document.getElementById('secret2fa').textContent = data.secret;
        document.getElementById('2faSetup').style.display = 'block';
        // Gerar QR via canvas usando biblioteca simples
        const canvas = document.getElementById('qr2fa');
        if (typeof QRCode !== 'undefined') {
            QRCode.toCanvas(canvas, data.otpauthUrl, { width: 200 });
        } else {
            canvas.style.display = 'none';
        }
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function ativar2FA() {
    const codigo = document.getElementById('codigo2fa').value.trim();
    if (!codigo || codigo.length !== 6) {
        mostrarToast('Digite o codigo de 6 digitos', 'warning');
        return;
    }
    try {
        await api('/api/me/2fa/ativar', { method: 'POST', body: { secret: _2faSecret, codigo } });
        mostrarToast('2FA ativado com sucesso!');
        carregar2FAStatus();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function desativar2FA() {
    const senha = prompt('Digite sua senha para desativar 2FA:');
    if (!senha) return;
    try {
        await api('/api/me/2fa/desativar', { method: 'POST', body: { senha } });
        mostrarToast('2FA desativado');
        carregar2FAStatus();
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

async function logout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
    } catch (e) {}
    window.location.href = '/login';
}

// ==================== EXPORTACAO CSV / EXCEL ====================

function exportarCSV(dados, colunas, nomeArquivo) {
    const sep = ';';
    const header = colunas.map((c) => c.label).join(sep);
    const linhas = dados.map((row) =>
        colunas
            .map((c) => {
                let val = typeof c.value === 'function' ? c.value(row) : row[c.key] || '';
                val = String(val).replace(/"/g, '""');
                if (String(val).includes(sep) || String(val).includes('"') || String(val).includes('\n')) {
                    val = `"${val}"`;
                }
                return val;
            })
            .join(sep)
    );
    const bom = '\uFEFF';
    const csv = bom + [header, ...linhas].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    baixarArquivo(blob, `${nomeArquivo}.csv`);
}

function exportarExcel(abas, nomeArquivo) {
    if (typeof XLSX === 'undefined') {
        mostrarToast('Biblioteca XLSX nao carregada', 'error');
        return;
    }
    const wb = XLSX.utils.book_new();
    abas.forEach((aba) => {
        const header = aba.colunas.map((c) => c.label);
        const rows = aba.dados.map((row) =>
            aba.colunas.map((c) => (typeof c.value === 'function' ? c.value(row) : row[c.key] || ''))
        );
        const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
        // Auto-width
        ws['!cols'] = header.map((h, i) => {
            const maxLen = Math.max(h.length, ...rows.map((r) => String(r[i] || '').length));
            return { wch: Math.min(maxLen + 2, 40) };
        });
        XLSX.utils.book_append_sheet(wb, ws, aba.nome.substring(0, 31));
    });
    XLSX.writeFile(wb, `${nomeArquivo}.xlsx`);
}

function baixarArquivo(blob, nomeArquivo) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function confirmar(mensagem) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        if (!modal) {
            resolve(confirm(mensagem));
            return;
        }
        document.getElementById('confirmMessage').textContent = mensagem;
        const bsModal = new bootstrap.Modal(modal);
        const btnConfirm = document.getElementById('confirmBtn');
        const handler = () => {
            resolve(true);
            bsModal.hide();
            btnConfirm.removeEventListener('click', handler);
        };
        btnConfirm.addEventListener('click', handler);
        modal.addEventListener(
            'hidden.bs.modal',
            () => {
                resolve(false);
                btnConfirm.removeEventListener('click', handler);
            },
            { once: true }
        );
        bsModal.show();
    });
}

// ==================== WHATSAPP SSE -> PAINEL DE NOTIFICACOES ====================

let _whatsappNotifs = [];
let _globalSSE = null;
let _globalNotifSound = null;

function escapeHtmlGlobal(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function connectGlobalSSE() {
    if (_globalSSE) _globalSSE.close();
    _globalSSE = new EventSource('/api/whatsapp/events');
    _globalSSE.onmessage = (e) => {
        try {
            const event = JSON.parse(e.data);
            if (event.event === 'message' && event.payload && !event.payload.fromMe) {
                adicionarNotifWhatsApp(event.payload);
            }
            if (event.event === 'user.online') {
                fetch('/api/online')
                    .then((r) => r.json())
                    .then(renderOnlineUsers)
                    .catch(() => {});
                if (event.payload && event.payload.id !== window._currentUser?.id) {
                    mostrarOnlineToast(event.payload.nome);
                }
            }
            if (event.event === 'user.offline') {
                fetch('/api/online')
                    .then((r) => r.json())
                    .then(renderOnlineUsers)
                    .catch(() => {});
            }
            if (event.event === 'chat.message') {
                handleChatMessage(event.payload);
            }
            if (event.event === 'proposta.visualizada') {
                mostrarToast(`Proposta visualizada: ${event.payload.provedor_nome}`, 'info');
            }
            if (event.event === 'contrato.assinado') {
                mostrarToast(
                    `Contrato assinado por ${event.payload.assinatura_nome} (${event.payload.provedor_nome})`,
                    'success'
                );
            }
        } catch {}
    };
    _globalSSE.onerror = () => {
        if (_globalSSE) _globalSSE.close();
        _globalSSE = null;
        setTimeout(connectGlobalSSE, 2000);
    };
}

function adicionarNotifWhatsApp(msg) {
    const senderName = msg.senderName || msg.chatName || '';
    const text = msg.body || msg.text || '';
    const typeLabels = {
        ptt: 'Audio',
        audio: 'Audio',
        image: 'Imagem',
        sticker: 'Sticker',
        video: 'Video',
        document: 'Documento'
    };
    const preview = text ? text.substring(0, 80) : typeLabels[msg.type] || 'Nova mensagem';
    const chatId = typeof msg.from === 'object' ? msg.from._serialized : msg.from || '';

    // Adicionar ao array local
    _whatsappNotifs.unshift({
        id: Date.now(),
        titulo: senderName || 'WhatsApp',
        mensagem: preview,
        chatId: chatId,
        criado_em: new Date().toISOString().replace('T', ' ').substring(0, 19),
        lida: false
    });
    // Limitar a 100
    if (_whatsappNotifs.length > 100) _whatsappNotifs.length = 100;

    // Atualizar badge
    atualizarBadgeWhatsApp();

    // Se o painel esta aberto na aba whatsapp, re-renderizar
    if (_notifPanel && _notifPanel.classList.contains('show') && _notifActiveTab === 'whatsapp') {
        renderNotifWhatsApp();
    }

    // Tocar som
    playGlobalNotifSound();
}

function atualizarBadgeWhatsApp() {
    const naoLidas = _whatsappNotifs.filter((n) => !n.lida).length;
    const badge = document.getElementById('badgeNotifWA');
    if (badge) {
        if (naoLidas > 0) {
            badge.textContent = naoLidas > 99 ? '99+' : naoLidas;
            badge.style.display = 'inline';
        } else {
            badge.style.display = 'none';
        }
    }
    // Atualizar badge global tambem
    atualizarBadgeNotifGlobal();
}

function atualizarBadgeNotifGlobal() {
    const badge = document.getElementById('badgeNotificacoes');
    if (!badge) return;
    const waNaoLidas = _whatsappNotifs.filter((n) => !n.lida).length;
    // Combinar com contagem do sistema
    const sistBadge = document.getElementById('badgeNotifSistema');
    const sistCount = sistBadge ? parseInt(sistBadge.textContent) || 0 : 0;
    const total = waNaoLidas + sistCount;
    if (total > 0) {
        badge.textContent = total > 99 ? '99+' : total;
        badge.style.display = 'inline-block';
    } else {
        badge.style.display = 'none';
    }
}

// AudioContext persistente para notificacoes (resolve restricao de autoplay)
let _audioCtx = null;
let _audioResumed = false;

function _ensureAudioCtx() {
    if (!_audioCtx) {
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_audioCtx.state === 'suspended' && !_audioResumed) {
        _audioCtx
            .resume()
            .then(() => {
                _audioResumed = true;
            })
            .catch(() => {});
    }
    return _audioCtx;
}

// Resumir AudioContext na primeira interacao do usuario
['click', 'keydown', 'touchstart'].forEach((evt) => {
    document.addEventListener(
        evt,
        function _resumeAudio() {
            _ensureAudioCtx();
            document.removeEventListener(evt, _resumeAudio);
        },
        { once: true }
    );
});

function playGlobalNotifSound() {
    try {
        const ctx = _ensureAudioCtx();
        if (ctx.state === 'suspended') return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
    } catch {}
}

// Iniciar SSE global em TODAS as paginas
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(connectGlobalSSE, 2000);
    // Heartbeat: marcar usuario como online
    function sendHeartbeat() {
        fetch('/api/heartbeat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page: location.pathname })
        })
            .then((r) => r.json())
            .then((d) => {
                if (d.online) renderOnlineUsers(d.online);
            })
            .catch(() => {});
    }
    sendHeartbeat();
    setInterval(sendHeartbeat, 30000);
});

// ==================== USUARIOS ONLINE ====================

function renderOnlineUsers(users) {
    const el = document.getElementById('onlineUsersPanel');
    if (!el) return;
    const meuId = window._currentUser?.id;
    el.innerHTML = `
        <div class="sidebar-online-header"><i class="bi bi-circle-fill text-success" style="font-size:.5rem"></i> Online (${users.length})</div>
        ${users
            .map((u) => {
                if (u.id === meuId) return '';
                const fotoHtml = u.foto_url
                    ? `<img src="${escapeHtmlGlobal(u.foto_url)}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;flex-shrink:0">`
                    : `<span class="online-dot"></span>`;
                const naoLidas = _chatNaoLidas[u.id] || 0;
                const badge =
                    naoLidas > 0
                        ? `<span class="badge bg-danger rounded-pill ms-auto" style="font-size:.6rem">${naoLidas}</span>`
                        : '';
                return `<div class="sidebar-online-user sidebar-online-clickable" onclick="abrirChatCom(${u.id}, '${escapeHtmlGlobal(u.nome).replace(/'/g, "\\'")}')">
                ${fotoHtml}
                <span>${escapeHtmlGlobal(u.nome)}</span>
                ${badge}
            </div>`;
            })
            .join('')}
    `;
}

function mostrarOnlineToast(nome) {
    const existing = document.querySelector('.online-user-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'online-user-toast';
    toast.innerHTML = `
        <span class="online-user-toast-dot"></span>
        <span class="online-user-toast-text"><strong>${escapeHtmlGlobal(nome)}</strong> <small>ficou online</small></span>
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ==================== NOTIFICACOES (PAINEL LATERAL DIREITO) ====================

let _notifPanel = null;
let _notifActiveTab = 'sistema';
let _sistemaNotifCount = 0;

function _injectNotifPanel() {
    if (_notifPanel) return;
    const div = document.createElement('div');
    div.id = 'notifPanel';
    div.className = 'notif-panel';
    div.innerHTML = `
        <div class="notif-panel-header">
            <h6 class="mb-0"><i class="bi bi-bell me-1"></i>Notificacoes</h6>
            <button type="button" class="btn-close" onclick="toggleNotificacoes()"></button>
        </div>
        <div class="notif-panel-tabs">
            <button class="notif-panel-tab active" data-tab="sistema" onclick="trocarAbaNotif('sistema')">
                <i class="bi bi-bell me-1"></i>Sistema <span class="badge bg-danger rounded-pill" id="badgeNotifSistema" style="display:none">0</span>
            </button>
            <button class="notif-panel-tab" data-tab="whatsapp" onclick="trocarAbaNotif('whatsapp')">
                <i class="bi bi-whatsapp me-1"></i>WhatsApp <span class="badge bg-success rounded-pill" id="badgeNotifWA" style="display:none">0</span>
            </button>
        </div>
        <div class="notif-panel-actions px-3 py-2 border-bottom d-flex justify-content-between align-items-center">
            <button class="btn btn-sm btn-link text-decoration-none p-0 text-danger" onclick="limparNotificacoesAtual()" title="Limpar todas"><i class="bi bi-trash me-1"></i>Limpar</button>
            <button class="btn btn-sm btn-link text-decoration-none p-0" onclick="marcarTodasLidasAtual()"><i class="bi bi-check2-all me-1"></i>Marcar lidas</button>
        </div>
        <div class="notif-panel-body" id="notifList">
            <div class="text-center text-muted py-3">Carregando...</div>
        </div>
    `;
    document.body.appendChild(div);
    _notifPanel = div;

    // Fechar ao clicar fora
    document.addEventListener('click', (e) => {
        if (
            _notifPanel &&
            _notifPanel.classList.contains('show') &&
            !_notifPanel.contains(e.target) &&
            !e.target.closest('#btnNotificacoes')
        ) {
            _notifPanel.classList.remove('show');
        }
    });
}

function trocarAbaNotif(tab) {
    _notifActiveTab = tab;
    document.querySelectorAll('.notif-panel-tab').forEach((t) => {
        t.classList.toggle('active', t.dataset.tab === tab);
    });
    if (tab === 'sistema') {
        carregarNotificacoes();
    } else {
        renderNotifWhatsApp();
    }
}

function toggleNotificacoes() {
    _injectNotifPanel();
    if (_notifPanel.classList.contains('show')) {
        _notifPanel.classList.remove('show');
    } else {
        _notifPanel.classList.add('show');
        if (_notifActiveTab === 'sistema') carregarNotificacoes();
        else renderNotifWhatsApp();
    }
}

async function carregarNotificacoes() {
    try {
        const notifs = await api('/api/notificacoes?limit=30');
        const list = document.getElementById('notifList');
        if (!notifs.length) {
            list.innerHTML = '<div class="text-center text-muted py-3">Nenhuma notificacao</div>';
            return;
        }
        list.innerHTML = notifs
            .map((n) => {
                const iconClass = n.tipo === 'chamado' ? 'notif-icon-chamado' : 'notif-icon-sistema';
                const iconBi = n.tipo === 'chamado' ? 'bi-ticket-detailed' : 'bi-bell';
                return `
            <div class="notif-item ${n.lida ? '' : 'notif-unread'}" onclick="clicarNotificacao(${n.id}, '${escapeHtmlGlobal(n.link || '')}')">
                <div class="d-flex align-items-start">
                    <div class="notif-item-icon ${iconClass}"><i class="bi ${iconBi}"></i></div>
                    <div>
                        <div class="notif-item-title">${escapeHtmlGlobal(n.titulo)}</div>
                        <div class="notif-item-msg">${escapeHtmlGlobal(n.mensagem || '')}</div>
                        <div class="notif-item-time">${formatarDataHora(n.criado_em)}</div>
                    </div>
                </div>
            </div>`;
            })
            .join('');
    } catch (err) {}
}

function renderNotifWhatsApp() {
    const list = document.getElementById('notifList');
    if (!_whatsappNotifs.length) {
        list.innerHTML =
            '<div class="text-center text-muted py-3"><i class="bi bi-whatsapp" style="font-size:1.5rem"></i><br>Nenhuma mensagem WhatsApp</div>';
        return;
    }
    list.innerHTML = _whatsappNotifs
        .map(
            (n) => `
        <div class="notif-item notif-whatsapp ${n.lida ? '' : 'notif-unread'}" onclick="clicarNotifWhatsApp(${n.id}, '${escapeHtmlGlobal(n.chatId || '')}')">
            <div class="d-flex align-items-start">
                <div class="notif-item-icon notif-icon-whatsapp"><i class="bi bi-whatsapp"></i></div>
                <div>
                    <div class="notif-item-title">${escapeHtmlGlobal(n.titulo)}</div>
                    <div class="notif-item-msg">${escapeHtmlGlobal(n.mensagem)}</div>
                    <div class="notif-item-time">${formatarDataHora(n.criado_em)}</div>
                </div>
            </div>
        </div>
    `
        )
        .join('');
}

function clicarNotifWhatsApp(id, chatId) {
    const n = _whatsappNotifs.find((x) => x.id === id);
    if (n) n.lida = true;
    atualizarBadgeWhatsApp();
    if (chatId) window.location.href = '/whatsapp#chat=' + encodeURIComponent(chatId);
}

async function clicarNotificacao(id, link) {
    try {
        await api('/api/notificacoes/' + id + '/lida', { method: 'PATCH' });
    } catch {}
    if (link) window.location.href = link;
    else {
        atualizarContagemNotif();
        carregarNotificacoes();
    }
}

function marcarTodasLidasAtual() {
    if (_notifActiveTab === 'sistema') {
        marcarTodasLidas();
    } else {
        _whatsappNotifs.forEach((n) => (n.lida = true));
        atualizarBadgeWhatsApp();
        renderNotifWhatsApp();
    }
}

function limparNotificacoesAtual() {
    if (_notifActiveTab === 'sistema') {
        limparNotificacoesSistema();
    } else {
        _whatsappNotifs = [];
        atualizarBadgeWhatsApp();
        renderNotifWhatsApp();
    }
}

async function limparNotificacoesSistema() {
    try {
        await api('/api/notificacoes/limpar', { method: 'DELETE' });
        carregarNotificacoes();
        atualizarContagemNotif();
    } catch {}
}

async function marcarTodasLidas() {
    try {
        await api('/api/notificacoes/marcar-todas-lidas', { method: 'POST' });
        carregarNotificacoes();
        atualizarContagemNotif();
    } catch {}
}

async function atualizarContagemNotif() {
    try {
        const data = await api('/api/notificacoes/contagem');
        _sistemaNotifCount = data.nao_lidas || 0;
        const badge = document.getElementById('badgeNotifSistema');
        if (badge) {
            if (_sistemaNotifCount > 0) {
                badge.textContent = _sistemaNotifCount > 99 ? '99+' : _sistemaNotifCount;
                badge.style.display = 'inline';
            } else {
                badge.style.display = 'none';
            }
        }
        atualizarBadgeNotifGlobal();
    } catch {}
}

// Poll notificacoes a cada 30s
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        atualizarContagemNotif();
        setInterval(atualizarContagemNotif, 30000);
    }, 1500);
});

// ==================== BUSCA GLOBAL (Ctrl+K) ====================

let _buscaModal = null;
let _buscaTimeout = null;

function _injectBuscaModal() {
    if (_buscaModal) return;
    const div = document.createElement('div');
    div.id = 'buscaGlobalOverlay';
    div.className = 'busca-global-overlay';
    div.onclick = (e) => {
        if (e.target === div) fecharBuscaGlobal();
    };
    div.innerHTML = `
        <div class="busca-global-container">
            <div class="busca-global-input-wrapper">
                <i class="bi bi-search"></i>
                <input type="text" id="buscaGlobalInput" placeholder="Buscar chamados, provedores, projetos..." autocomplete="off" oninput="debounceBusca()">
                <kbd>ESC</kbd>
            </div>
            <div class="busca-global-results" id="buscaGlobalResults" style="display:none"></div>
        </div>
    `;
    document.body.appendChild(div);
    _buscaModal = div;
}

function abrirBuscaGlobal() {
    _injectBuscaModal();
    _buscaModal.classList.add('show');
    const input = document.getElementById('buscaGlobalInput');
    input.value = '';
    document.getElementById('buscaGlobalResults').style.display = 'none';
    setTimeout(() => input.focus(), 100);
}

function fecharBuscaGlobal() {
    if (_buscaModal) _buscaModal.classList.remove('show');
}

function debounceBusca() {
    clearTimeout(_buscaTimeout);
    _buscaTimeout = setTimeout(executarBuscaGlobal, 300);
}

async function executarBuscaGlobal() {
    const q = document.getElementById('buscaGlobalInput').value.trim();
    const resultsDiv = document.getElementById('buscaGlobalResults');
    if (q.length < 2) {
        resultsDiv.style.display = 'none';
        return;
    }

    try {
        const data = await api('/api/busca?q=' + encodeURIComponent(q));
        const sections = [];
        const icons = {
            chamados: 'bi-ticket-detailed',
            provedores: 'bi-building',
            projetos: 'bi-kanban',
            treinamentos: 'bi-mortarboard',
            vendas: 'bi-cash-coin'
        };
        const labels = {
            chamados: 'Chamados',
            provedores: 'Provedores',
            projetos: 'Projetos',
            treinamentos: 'Treinamentos',
            vendas: 'Vendas'
        };
        const hrefs = {
            chamados: '/chamados',
            provedores: '/provedores',
            projetos: '/projetos',
            treinamentos: '/treinamentos',
            vendas: '/vendas'
        };

        for (const [tipo, items] of Object.entries(data)) {
            if (items.length) {
                sections.push(
                    `<div class="busca-section-title"><i class="bi ${icons[tipo]} me-1"></i>${labels[tipo]}</div>`
                );
                items.forEach((item) => {
                    sections.push(`<a class="busca-result-item" href="${hrefs[tipo]}">
                        <span class="busca-result-title">${item.titulo}</span>
                        ${item.status ? '<span class="badge bg-secondary ms-2">' + item.status + '</span>' : ''}
                    </a>`);
                });
            }
        }

        if (sections.length) {
            resultsDiv.innerHTML = sections.join('');
            resultsDiv.style.display = 'block';
        } else {
            resultsDiv.innerHTML = '<div class="text-center text-muted py-3">Nenhum resultado encontrado</div>';
            resultsDiv.style.display = 'block';
        }
    } catch (err) {
        resultsDiv.innerHTML = '<div class="text-center text-muted py-3">Erro na busca</div>';
        resultsDiv.style.display = 'block';
    }
}

// Atalho Ctrl+K
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        abrirBuscaGlobal();
    }
    if (e.key === 'Escape' && _buscaModal && _buscaModal.classList.contains('show')) {
        fecharBuscaGlobal();
    }
});

// ==================== CHAT INTERNO ====================

let _chatNaoLidas = {};
let _chatAberto = null; // { id, nome }
let _chatWidgetEl = null;
let _chatRenderedIds = new Set();

function injetarChatWidget() {
    if (document.getElementById('chatWidget')) return;
    document.body.insertAdjacentHTML(
        'beforeend',
        `
        <div id="chatWidget" class="chat-widget" style="display:none">
            <div class="chat-widget-header" id="chatWidgetHeader">
                <div class="d-flex align-items-center gap-2 flex-grow-1 min-width-0">
                    <button class="chat-widget-back" id="chatBackBtn" style="display:none" onclick="voltarListaChat()"><i class="bi bi-arrow-left"></i></button>
                    <i class="bi bi-chat-dots" id="chatHeaderIcon"></i>
                    <span class="chat-widget-title" id="chatWidgetTitle">Chat</span>
                </div>
                <button class="chat-widget-close" onclick="toggleChatWidget()"><i class="bi bi-dash-lg"></i></button>
            </div>
            <div class="chat-widget-body" id="chatWidgetBody">
                <div id="chatListaContatos"></div>
                <div id="chatMensagensArea" style="display:none">
                    <div class="chat-msgs" id="chatMsgs"></div>
                    <div class="chat-input-bar">
                        <input type="text" id="chatInput" placeholder="Digite..." onkeydown="if(event.key==='Enter')enviarChatMsg()">
                        <button class="chat-send-btn" onclick="enviarChatMsg()"><i class="bi bi-send-fill"></i></button>
                    </div>
                </div>
            </div>
        </div>
        <button class="chat-fab" id="chatFab" onclick="toggleChatWidget()">
            <i class="bi bi-chat-dots-fill"></i>
            <span class="chat-fab-badge" id="chatFabBadge" style="display:none">0</span>
        </button>
    `
    );
    _chatWidgetEl = document.getElementById('chatWidget');
    carregarChatNaoLidas();
}

function toggleChatWidget() {
    const w = document.getElementById('chatWidget');
    if (!w) return;
    const aberto = w.style.display !== 'none';
    if (aberto) {
        w.style.display = 'none';
    } else {
        w.style.display = 'flex';
        if (!_chatAberto) {
            mostrarListaChat();
        }
    }
}

async function carregarChatNaoLidas() {
    try {
        const data = await api('/api/chat/nao-lidas');
        _chatNaoLidas = data.porUsuario || {};
        atualizarChatFabBadge(data.total || 0);
    } catch {}
}

function atualizarChatFabBadge(total) {
    const badge = document.getElementById('chatFabBadge');
    if (!badge) return;
    if (total > 0) {
        badge.textContent = total > 99 ? '99+' : total;
        badge.style.display = '';
    } else {
        badge.style.display = 'none';
    }
}

async function mostrarListaChat() {
    _chatAberto = null;
    const title = document.getElementById('chatWidgetTitle');
    const icon = document.getElementById('chatHeaderIcon');
    const backBtn = document.getElementById('chatBackBtn');
    const lista = document.getElementById('chatListaContatos');
    const msgArea = document.getElementById('chatMensagensArea');
    title.textContent = 'Chat';
    icon.style.display = '';
    backBtn.style.display = 'none';
    lista.style.display = '';
    msgArea.style.display = 'none';

    // Mostrar usuarios online + conversas recentes
    try {
        const [onlineRes, conversasRes] = await Promise.all([
            fetch('/api/online').then((r) => r.json()),
            api('/api/chat/conversas')
        ]);
        const meuId = window._currentUser?.id;
        const online = onlineRes.filter((u) => u.id !== meuId);
        const conversasIds = new Set(conversasRes.map((c) => c.id));

        let html = '';
        if (online.length > 0) {
            html += `<div class="chat-section-label">Online</div>`;
            html += online
                .map((u) => {
                    const naoLidas = _chatNaoLidas[u.id] || 0;
                    const badge = naoLidas > 0 ? `<span class="badge bg-danger rounded-pill">${naoLidas}</span>` : '';
                    const fotoHtml = u.foto_url
                        ? `<img src="${escapeHtmlGlobal(u.foto_url)}" class="chat-contact-avatar">`
                        : `<div class="chat-contact-avatar-placeholder">${escapeHtmlGlobal(u.nome).charAt(0).toUpperCase()}</div>`;
                    return `<div class="chat-contact-item" onclick="abrirChatCom(${u.id}, '${escapeHtmlGlobal(u.nome).replace(/'/g, "\\'")}')">
                    ${fotoHtml}
                    <div class="chat-contact-info">
                        <div class="chat-contact-name">${escapeHtmlGlobal(u.nome)}</div>
                        <div class="chat-contact-status"><span class="online-dot"></span> online</div>
                    </div>
                    ${badge}
                </div>`;
                })
                .join('');
        }

        const conversasOffline = conversasRes.filter((c) => !online.some((o) => o.id === c.id));
        if (conversasOffline.length > 0) {
            html += `<div class="chat-section-label">Conversas</div>`;
            html += conversasOffline
                .map((c) => {
                    const naoLidas = c.nao_lidas || 0;
                    const badge = naoLidas > 0 ? `<span class="badge bg-danger rounded-pill">${naoLidas}</span>` : '';
                    const fotoHtml = c.foto_url
                        ? `<img src="${escapeHtmlGlobal(c.foto_url)}" class="chat-contact-avatar">`
                        : `<div class="chat-contact-avatar-placeholder">${escapeHtmlGlobal(c.nome).charAt(0).toUpperCase()}</div>`;
                    const preview = c.ultima_msg
                        ? c.ultima_msg.substring(0, 30) + (c.ultima_msg.length > 30 ? '...' : '')
                        : '';
                    return `<div class="chat-contact-item" onclick="abrirChatCom(${c.id}, '${escapeHtmlGlobal(c.nome).replace(/'/g, "\\'")}')">
                    ${fotoHtml}
                    <div class="chat-contact-info">
                        <div class="chat-contact-name">${escapeHtmlGlobal(c.nome)}</div>
                        <div class="chat-contact-preview">${escapeHtmlGlobal(preview)}</div>
                    </div>
                    ${badge}
                </div>`;
                })
                .join('');
        }

        if (!html)
            html =
                '<div class="text-center text-muted py-4"><i class="bi bi-chat-dots" style="font-size:2rem;opacity:.3"></i><br><small>Nenhum usuario online</small></div>';
        lista.innerHTML = html;
    } catch {
        lista.innerHTML = '<div class="text-center text-muted py-3">Erro ao carregar</div>';
    }
}

async function abrirChatCom(userId, nome) {
    _chatAberto = { id: userId, nome };
    const title = document.getElementById('chatWidgetTitle');
    const icon = document.getElementById('chatHeaderIcon');
    const backBtn = document.getElementById('chatBackBtn');
    const lista = document.getElementById('chatListaContatos');
    const msgArea = document.getElementById('chatMensagensArea');
    title.textContent = nome;
    icon.style.display = 'none';
    backBtn.style.display = '';
    lista.style.display = 'none';
    msgArea.style.display = 'flex';

    // Abrir widget se fechado
    const w = document.getElementById('chatWidget');
    if (w) w.style.display = 'flex';

    const msgsEl = document.getElementById('chatMsgs');
    _chatRenderedIds.clear();
    msgsEl.innerHTML =
        '<div class="text-center text-muted py-3"><div class="spinner-border spinner-border-sm"></div></div>';
    try {
        const msgs = await api(`/api/chat/${userId}`);
        renderChatMsgs(msgs);
        // Limpar nao lidas deste usuario
        delete _chatNaoLidas[userId];
        const total = Object.values(_chatNaoLidas).reduce((a, b) => a + b, 0);
        atualizarChatFabBadge(total);
    } catch {
        msgsEl.innerHTML = '<div class="text-center text-muted py-3">Erro ao carregar</div>';
    }
    document.getElementById('chatInput').focus();
}

function renderChatMsgs(msgs) {
    const msgsEl = document.getElementById('chatMsgs');
    if (!msgs.length) {
        msgsEl.innerHTML = '<div class="text-center text-muted py-4"><small>Envie a primeira mensagem!</small></div>';
        return;
    }
    const meuId = window._currentUser?.id;
    _chatRenderedIds.clear();
    msgs.forEach((m) => {
        if (m.id) _chatRenderedIds.add(m.id);
    });
    msgsEl.innerHTML = msgs
        .map((m) => {
            const ehMeu = m.remetente_id === meuId;
            const hora = m.criado_em ? m.criado_em.substring(11, 16) : '';
            return `<div class="chat-msg ${ehMeu ? 'chat-msg-sent' : 'chat-msg-received'}">
            <div class="chat-msg-text">${escapeHtmlGlobal(m.texto)}</div>
            <div class="chat-msg-time">${hora}</div>
        </div>`;
        })
        .join('');
    msgsEl.scrollTop = msgsEl.scrollHeight;
}

function voltarListaChat() {
    _chatAberto = null;
    mostrarListaChat();
}

async function enviarChatMsg() {
    const input = document.getElementById('chatInput');
    const texto = input.value.trim();
    if (!texto || !_chatAberto) return;
    input.value = '';
    try {
        const msg = await api('/api/chat/enviar', { method: 'POST', body: { destinatario_id: _chatAberto.id, texto } });
        // Adicionar mensagem localmente de imediato
        if (msg && msg.id) appendChatMsg(msg, true);
    } catch (err) {
        mostrarToast(err.message, 'error');
    }
}

function handleChatMessage(payload) {
    const meuId = window._currentUser?.id;
    if (!payload || !meuId) return;

    // Mensagem para mim
    if (payload.destinatario_id === meuId) {
        playGlobalNotifSound();
        if (_chatAberto && _chatAberto.id === payload.remetente_id) {
            // Chat aberto com esse usuario - renderizar
            appendChatMsg(payload, false);
            // Marcar como lida
            fetch(`/api/chat/${payload.remetente_id}`).catch(() => {});
        } else {
            // Chat nao aberto - incrementar badge
            _chatNaoLidas[payload.remetente_id] = (_chatNaoLidas[payload.remetente_id] || 0) + 1;
            const total = Object.values(_chatNaoLidas).reduce((a, b) => a + b, 0);
            atualizarChatFabBadge(total);
            mostrarToast(`${escapeHtmlGlobal(payload.remetente_nome)}: ${payload.texto.substring(0, 40)}`, 'info');
        }
    }

    // Mensagem que eu enviei (confirmacao)
    if (payload.remetente_id === meuId && _chatAberto && _chatAberto.id === payload.destinatario_id) {
        appendChatMsg(payload, true);
    }
}

function appendChatMsg(msg, ehMeu) {
    const msgsEl = document.getElementById('chatMsgs');
    if (!msgsEl) return;
    // Evitar duplicatas
    if (msg.id && _chatRenderedIds.has(msg.id)) return;
    if (msg.id) _chatRenderedIds.add(msg.id);
    // Remover placeholder se existir
    const placeholder = msgsEl.querySelector('.text-muted');
    if (placeholder && msgsEl.children.length === 1) msgsEl.innerHTML = '';
    const hora = msg.criado_em ? msg.criado_em.substring(11, 16) : '';
    msgsEl.insertAdjacentHTML(
        'beforeend',
        `
        <div class="chat-msg ${ehMeu ? 'chat-msg-sent' : 'chat-msg-received'}">
            <div class="chat-msg-text">${escapeHtmlGlobal(msg.texto)}</div>
            <div class="chat-msg-time">${hora}</div>
        </div>
    `
    );
    msgsEl.scrollTop = msgsEl.scrollHeight;
}

// Inicializar chat widget apos DOM ready
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(injetarChatWidget, 1000);
});

// ==================== PWA SERVICE WORKER ====================
if ('serviceWorker' in navigator) {
    navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
            reg.update();
        })
        .catch(() => {});
}
