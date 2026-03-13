// ==================== DASHBOARD PERSONALIZAVEL ====================

let _dashWidgets = [];
let _dashEditMode = false;
let _dashBackup = null;
let _dragWidget = null;

const COL_MAP = { 3: 'col-lg-3', 4: 'col-lg-4', 5: 'col-lg-5', 6: 'col-md-6', 7: 'col-lg-7', 12: 'col-12' };

async function carregarWidgetLayout() {
    try {
        _dashWidgets = await api('/api/dashboard/widgets');
        aplicarWidgetLayout();
    } catch (e) {
        console.error('Erro ao carregar widgets:', e);
    }
}

function aplicarWidgetLayout() {
    const container = document.getElementById('dashboardWidgets');
    if (!container || !_dashWidgets.length) return;

    const sorted = [..._dashWidgets].sort((a, b) => a.posicao - b.posicao);
    sorted.forEach((w) => {
        const el = container.querySelector(`[data-widget="${w.widget_tipo}"]`);
        if (!el) return;
        // Update visibility
        el.style.display = w.visivel ? '' : 'none';
        // Update col class based on largura
        el.className = el.className.replace(/col-\S+/g, '');
        const colClass = w.widget_tipo === 'cards_resumo' ? 'col-12' : COL_MAP[w.largura] || `col-lg-${w.largura}`;
        el.classList.add('dash-widget', colClass);
        // Store widget db id
        el.dataset.widgetId = w.id;
        el.dataset.largura = w.largura;
        // Reorder in DOM
        container.appendChild(el);
    });
}

function toggleEditDashboard() {
    _dashEditMode = !_dashEditMode;
    const container = document.getElementById('dashboardWidgets');
    const btn = document.getElementById('btnEditarDash');
    const actions = document.getElementById('editDashActions');

    if (_dashEditMode) {
        _dashBackup = _dashWidgets.map((w) => ({ ...w }));
        btn.style.display = 'none';
        actions.style.display = 'flex';
        container.classList.add('dash-edit-mode');

        // Show handles and controls
        container.querySelectorAll('.dash-widget').forEach((el) => {
            el.setAttribute('draggable', 'true');
            const handle = el.querySelector('.dash-widget-handle');
            if (handle) handle.style.display = '';
            // Add edit overlay if not exists
            if (!el.querySelector('.dash-widget-controls')) {
                const tipo = el.dataset.widget;
                const wData = _dashWidgets.find((w) => w.widget_tipo === tipo);
                const visivel = wData ? wData.visivel : 1;
                const largura = parseInt(el.dataset.largura) || 6;
                const ctrl = document.createElement('div');
                ctrl.className = 'dash-widget-controls';
                ctrl.innerHTML = `
                    <label class="form-check form-switch form-check-sm mb-0">
                        <input type="checkbox" class="form-check-input" ${visivel ? 'checked' : ''} onchange="toggleWidgetVisivel('${tipo}', this.checked)">
                        <span class="form-check-label small">${el.dataset.label || tipo}</span>
                    </label>
                    <select class="form-select form-select-sm" style="width:80px" onchange="mudarLarguraWidget('${tipo}', this.value)">
                        <option value="3" ${largura === 3 ? 'selected' : ''}>3 col</option>
                        <option value="4" ${largura === 4 ? 'selected' : ''}>4 col</option>
                        <option value="5" ${largura === 5 ? 'selected' : ''}>5 col</option>
                        <option value="6" ${largura === 6 ? 'selected' : ''}>6 col</option>
                        <option value="7" ${largura === 7 ? 'selected' : ''}>7 col</option>
                        <option value="12" ${largura === 12 ? 'selected' : ''}>12 col</option>
                    </select>
                `;
                el.querySelector('.dash-widget-inner').prepend(ctrl);
            }
            // Attach drag events
            el.ondragstart = (e) => {
                _dragWidget = el;
                el.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            };
            el.ondragend = () => {
                el.classList.remove('dragging');
                _dragWidget = null;
            };
            el.ondragover = (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            };
            el.ondrop = (e) => {
                e.preventDefault();
                if (!_dragWidget || _dragWidget === el) return;
                const rect = el.getBoundingClientRect();
                const mid = rect.top + rect.height / 2;
                if (e.clientY < mid) {
                    container.insertBefore(_dragWidget, el);
                } else {
                    container.insertBefore(_dragWidget, el.nextSibling);
                }
            };
        });
        // Hidden widgets should be shown faded in edit mode
        container.querySelectorAll('.dash-widget').forEach((el) => {
            if (el.style.display === 'none') {
                el.style.display = '';
                el.classList.add('dash-widget-hidden');
            }
        });
    } else {
        exitEditMode();
    }
}

function exitEditMode() {
    _dashEditMode = false;
    const container = document.getElementById('dashboardWidgets');
    const btn = document.getElementById('btnEditarDash');
    const actions = document.getElementById('editDashActions');
    btn.style.display = '';
    actions.style.display = 'none';
    container.classList.remove('dash-edit-mode');
    container.querySelectorAll('.dash-widget').forEach((el) => {
        el.removeAttribute('draggable');
        const handle = el.querySelector('.dash-widget-handle');
        if (handle) handle.style.display = 'none';
        const ctrl = el.querySelector('.dash-widget-controls');
        if (ctrl) ctrl.remove();
        el.classList.remove('dash-widget-hidden', 'dragging');
        el.ondragstart = el.ondragend = el.ondragover = el.ondrop = null;
    });
    aplicarWidgetLayout();
}

function toggleWidgetVisivel(tipo, visivel) {
    const w = _dashWidgets.find((w) => w.widget_tipo === tipo);
    if (w) w.visivel = visivel ? 1 : 0;
    const el = document.querySelector(`[data-widget="${tipo}"]`);
    if (el) {
        if (visivel) el.classList.remove('dash-widget-hidden');
        else el.classList.add('dash-widget-hidden');
    }
}

function mudarLarguraWidget(tipo, largura) {
    const w = _dashWidgets.find((w) => w.widget_tipo === tipo);
    if (w) w.largura = parseInt(largura);
    const el = document.querySelector(`[data-widget="${tipo}"]`);
    if (el) {
        el.className = el.className.replace(/col-\S+/g, '');
        const colClass = tipo === 'cards_resumo' ? 'col-12' : COL_MAP[parseInt(largura)] || `col-lg-${largura}`;
        el.classList.add('dash-widget', colClass);
        if (!_dashWidgets.find((w) => w.widget_tipo === tipo)?.visivel) el.classList.add('dash-widget-hidden');
        el.dataset.largura = largura;
    }
}

async function salvarLayoutDash() {
    const container = document.getElementById('dashboardWidgets');
    const widgets = [];
    container.querySelectorAll('.dash-widget').forEach((el, i) => {
        const tipo = el.dataset.widget;
        const w = _dashWidgets.find((w) => w.widget_tipo === tipo);
        if (w) {
            w.posicao = i;
            widgets.push({ id: w.id, posicao: i, largura: w.largura, visivel: w.visivel });
        }
    });
    try {
        await api('/api/dashboard/widgets', { method: 'PUT', body: JSON.stringify({ widgets }) });
        mostrarToast('Layout do dashboard salvo!');
        exitEditMode();
    } catch (e) {
        mostrarToast('Erro ao salvar layout', 'error');
    }
}

function cancelarEditDash() {
    if (_dashBackup) _dashWidgets = _dashBackup;
    _dashBackup = null;
    exitEditMode();
}

async function resetarLayoutDash() {
    if (!confirm('Resetar layout para o padrao?')) return;
    try {
        await api('/api/dashboard/widgets/reset', { method: 'POST' });
        _dashWidgets = await api('/api/dashboard/widgets');
        mostrarToast('Layout resetado!');
        exitEditMode();
    } catch (e) {
        mostrarToast('Erro ao resetar', 'error');
    }
}
