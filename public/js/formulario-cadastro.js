const token = window.location.pathname.split('/').pop();

function escFormHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await fetch(`/api/formulario/${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok) {
            document.getElementById('formPanel').innerHTML =
                '<div class="text-center py-5" style="color:#D93B63"><i class="bi bi-x-circle fs-1 d-block mb-2"></i>Formulario nao encontrado ou expirado.</div>';
            return;
        }
        document.getElementById('provedorNomeHeader').innerHTML =
            `<span class="provedor-badge">${escFormHtml(data.provedor_nome)}</span>`;
        if (data.status === 'preenchido') {
            document.getElementById('formPanel').classList.add('d-none');
            document.getElementById('filledPanel').classList.remove('d-none');
        }
    } catch (err) {
        console.error(err);
    }
});

// Mascara CNPJ
document.getElementById('cnpj').addEventListener('input', function (e) {
    let v = e.target.value.replace(/\D/g, '');
    if (v.length > 14) v = v.substring(0, 14);
    v = v.replace(/^(\d{2})(\d)/, '$1.$2');
    v = v.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
    v = v.replace(/\.(\d{3})(\d)/, '.$1/$2');
    v = v.replace(/(\d{4})(\d)/, '$1-$2');
    e.target.value = v;
});

// Mascara telefone
document.getElementById('telefone').addEventListener('input', function (e) {
    let v = e.target.value.replace(/\D/g, '');
    if (v.length > 11) v = v.substring(0, 11);
    if (v.length > 6) v = v.replace(/^(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
    else if (v.length > 2) v = v.replace(/^(\d{2})(\d{0,5})/, '($1) $2');
    e.target.value = v;
});

document.getElementById('formCadastro').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSubmit');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Enviando...';

    const dados = {
        razao_social: document.getElementById('razaoSocial').value.trim(),
        cnpj: document.getElementById('cnpj').value.trim(),
        responsavel: document.getElementById('responsavel').value.trim(),
        email: document.getElementById('email').value.trim(),
        telefone: document.getElementById('telefone').value.trim(),
        endereco: document.getElementById('endereco').value.trim(),
        qtd_assinantes: document.getElementById('qtdAssinantes').value,
        erp: document.getElementById('erp').value,
        observacoes: document.getElementById('observacoes').value.trim()
    };

    try {
        const res = await fetch(`/api/formulario/${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.erro || 'Erro ao enviar');

        document.getElementById('formPanel').classList.add('d-none');
        document.getElementById('successPanel').classList.remove('d-none');
    } catch (err) {
        alert('Erro: ' + err.message);
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-send me-2"></i>Enviar Cadastro';
    }
});
