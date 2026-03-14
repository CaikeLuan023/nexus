let _aguardando2fa = false;

function toggleSenha() {
    var input = document.getElementById('inputSenha');
    var icon = document.getElementById('eyeIcon');
    if (input.type === 'password') { input.type = 'text'; icon.className = 'bi bi-eye-slash'; }
    else { input.type = 'password'; icon.className = 'bi bi-eye'; }
}

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('loginForm').addEventListener('submit', fazerLogin);
});

async function fazerLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('btnLogin');
    const erro = document.getElementById('loginErro');
    erro.style.display = 'none';
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Entrando...';

    try {
        if (_aguardando2fa) {
            // Enviar codigo 2FA
            const res = await fetch('/api/login/2fa', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ codigo: document.getElementById('input2fa').value.trim() })
            });
            const data = await res.json();
            if (!res.ok) {
                erro.textContent = data.erro || 'Codigo invalido';
                erro.style.display = 'block';
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-box-arrow-in-right me-2"></i>Verificar';
                return;
            }
            window.location.href = '/';
            return;
        }

        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                usuario: document.getElementById('inputUsuario').value.trim().replace(/\s+/g, ''),
                senha: document.getElementById('inputSenha').value
            })
        });
        const data = await res.json();
        if (!res.ok) {
            erro.textContent = data.erro || 'Erro ao fazer login';
            erro.style.display = 'block';
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-box-arrow-in-right me-2"></i>Entrar';
            return;
        }

        if (data.requer_2fa) {
            _aguardando2fa = true;
            document.getElementById('loginFields').style.display = 'none';
            document.getElementById('twoFaFields').style.display = 'block';
            document.getElementById('input2fa').focus();
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-shield-lock me-2"></i>Verificar';
            return;
        }

        window.location.href = '/';
    } catch (err) {
        erro.textContent = 'Erro de conexao com o servidor';
        erro.style.display = 'block';
        btn.disabled = false;
        btn.innerHTML = _aguardando2fa
            ? '<i class="bi bi-shield-lock me-2"></i>Verificar'
            : '<i class="bi bi-box-arrow-in-right me-2"></i>Entrar';
    }
}
