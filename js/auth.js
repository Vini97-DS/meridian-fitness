// ═══════════════════════════════════════════════════════
//  auth.js — Autenticacao JWT propria (sem dependencias)
// ═══════════════════════════════════════════════════════

// ── Session via localStorage ─────────────────────────────────
function saveSession(token, user) {
  localStorage.setItem('mf_token', token);
  localStorage.setItem('mf_user',  JSON.stringify(user));
}
function getToken() {
  return localStorage.getItem('mf_token') || null;
}
function getUser() {
  try { return JSON.parse(localStorage.getItem('mf_user')); } catch { return null; }
}
function clearSession() {
  localStorage.removeItem('mf_token');
  localStorage.removeItem('mf_user');
}

// ── Chamadas autenticadas a API ──────────────────────────────
async function apiCall(path, options = {}) {
  const token = getToken();
  const res   = await fetch('/api' + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erro ' + res.status);
  }
  return res.json();
}

// ── Helpers de UI ────────────────────────────────────────────
function showError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
}
function hideError(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}
function setLoading(btnId, loading, label) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  if (loading) { btn.dataset.orig = btn.textContent; btn.textContent = label || 'Carregando...'; }
  else { btn.textContent = btn.dataset.orig || btn.textContent; }
}
function toggleEye(inputId, iconId) {
  const inp  = document.getElementById(inputId);
  const icon = document.getElementById(iconId);
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  if (icon) icon.textContent = inp.type === 'password' ? '👁' : '🙈';
}

// ── Forca de senha ───────────────────────────────────────────
function checkStrength(val) {
  const c = {
    len:     val.length >= 8,
    upper:   /[A-Z]/.test(val),
    num:     /[0-9]/.test(val),
    special: /[!@#$%^&*]/.test(val),
  };
  const met = Object.values(c).filter(Boolean).length;
  const cfgs = [
    {pct:'0%',   color:'transparent', txt:'—'    },
    {pct:'25%',  color:'var(--red)',   txt:'Fraca'},
    {pct:'50%',  color:'var(--amber)', txt:'Media'},
    {pct:'75%',  color:'var(--blue)',  txt:'Boa'  },
    {pct:'100%', color:'var(--green)', txt:'Forte'},
  ];
  const cfg   = cfgs[met];
  const fill  = document.getElementById('str-fill');
  const label = document.getElementById('str-label');
  if (fill)  { fill.style.width = cfg.pct; fill.style.background = cfg.color; }
  if (label) { label.textContent = cfg.txt; label.style.color = cfg.color; }
  ['req-len','req-upper','req-num','req-special'].forEach((id, i) => {
    document.getElementById(id)?.classList.toggle('met', Object.values(c)[i]);
  });
  return c;
}

// ════════════════════════════════════════════════════════
//  PAGINA: index.html (login)
// ════════════════════════════════════════════════════════
function initLogin() {
  // Se ja tem sessao, vai pro dashboard
  if (getToken()) { window.location.href = '/dashboard'; return; }

  document.getElementById('toggle-pass')
    ?.addEventListener('click', () => toggleEye('password', 'toggle-pass'));

  ['email','password'].forEach(id =>
    document.getElementById(id)
      ?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); })
  );

  document.getElementById('login-btn')?.addEventListener('click', doLogin);

  document.getElementById('forgot-link')?.addEventListener('click', e => {
    e.preventDefault();
    alert('Para redefinir sua senha, entre em contato:\nsuporte@meridian.com');
  });
}

async function doLogin() {
  const email = document.getElementById('email')?.value.trim().toLowerCase() || '';
  const pass  = document.getElementById('password')?.value || '';
  hideError('login-error');

  if (!email || !pass) { showError('login-error', 'Preencha e-mail e senha.'); return; }

  setLoading('login-btn', true, 'Entrando...');

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass }),
    });
    const data = await res.json();

    if (!res.ok) {
      showError('login-error', data.detail || 'E-mail ou senha incorretos.');
      document.getElementById('password').value = '';
      document.getElementById('password').focus();
    } else {
      saveSession(data.token, data.user);
      window.location.href = '/dashboard';
    }
  } catch {
    showError('login-error', 'Erro de conexao. Tente novamente.');
  }

  setLoading('login-btn', false);
}

// ════════════════════════════════════════════════════════
//  PAGINA: primeiro-acesso.html
// ════════════════════════════════════════════════════════
let faStep = 1;

function initFirstAccess() {
  if (getToken()) { window.location.href = '/dashboard'; return; }

  document.getElementById('s1-btn')?.addEventListener('click', step1Next);
  document.getElementById('s1-email')
    ?.addEventListener('keydown', e => { if (e.key === 'Enter') step1Next(); });

  document.getElementById('toggle-s2')
    ?.addEventListener('click', () => toggleEye('s2-pass', 'toggle-s2'));
  document.getElementById('toggle-s2b')
    ?.addEventListener('click', () => toggleEye('s2-pass2', 'toggle-s2b'));
  document.getElementById('s2-pass')
    ?.addEventListener('input', e => checkStrength(e.target.value));
  document.getElementById('s2-btn')?.addEventListener('click', step2Next);
  ['s2-name','s2-pass','s2-pass2'].forEach(id =>
    document.getElementById(id)
      ?.addEventListener('keydown', e => { if (e.key === 'Enter') step2Next(); })
  );

  document.getElementById('s3-btn')
    ?.addEventListener('click', () => { window.location.href = '/dashboard'; });
}

async function step1Next() {
  const email = document.getElementById('s1-email')?.value.trim().toLowerCase() || '';
  hideError('s1-error');
  if (!email || !email.includes('@')) { showError('s1-error', 'Informe um e-mail válido.'); return; }

  setLoading('s1-btn', true, 'Verificando...');
  try {
    await apiCall('/auth/check-invite?email=' + encodeURIComponent(email));
    window._faEmail = email;
    goToStep(2);
  } catch(err) {
    showError('s1-error', err.message);
  }
  setLoading('s1-btn', false);
}

async function step2Next() {
  const name  = document.getElementById('s2-name')?.value.trim() || '';
  const pass  = document.getElementById('s2-pass')?.value  || '';
  const pass2 = document.getElementById('s2-pass2')?.value || '';
  hideError('s2-error');

  if (!name) { showError('s2-error', 'Informe seu nome completo.'); return; }
  const c = checkStrength(pass);
  if (!c.len || !c.upper || !c.num || !c.special) {
    showError('s2-error', 'A senha nao atende todos os requisitos.'); return;
  }
  if (pass !== pass2) { showError('s2-error', 'As senhas nao coincidem.'); return; }

  setLoading('s2-btn', true, 'Criando conta...');

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email: window._faEmail, password: pass }),
    });
    const data = await res.json();

    if (!res.ok) {
      showError('s2-error', data.detail || 'Erro ao criar conta.');
    } else {
      saveSession(data.token, data.user);
      goToStep(3);
    }
  } catch {
    showError('s2-error', 'Erro de conexao. Tente novamente.');
  }

  setLoading('s2-btn', false);
}

function goToStep(num) {
  faStep = num;
  [1,2,3].forEach(n => {
    const el = document.getElementById('step-' + n);
    if (el) el.style.display = n === num ? 'block' : 'none';
  });
  [1,2,3].forEach(n => {
    const dot = document.getElementById('dot-' + n);
    if (!dot) return;
    dot.classList.remove('active','done');
    if (n < num)        dot.classList.add('done');
    else if (n === num) dot.classList.add('active');
  });
}

// ════════════════════════════════════════════════════════
//  PAGINA: dashboard.html
// ════════════════════════════════════════════════════════
function initDashboard() {
  const user = getUser();
  if (!getToken() || !user) { window.location.href = '/'; return; }

  const name     = user.name || 'Personal';
  const initials = name.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase();

  const nameEl   = document.getElementById('dash-user-name');
  const avatarEl = document.getElementById('dash-user-avatar');
  if (nameEl)   nameEl.textContent   = name;
  if (avatarEl) avatarEl.textContent = initials;

  document.getElementById('btn-logout')?.addEventListener('click', () => {
    clearSession();
    window.location.href = '/';
  });
}

// ════════════════════════════════════════════════════════
//  INIT — detecta pagina
// ════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  const page = window.location.pathname.replace(/\/$/, '') || '/';
  if (page === '/' || page === '/login') initLogin();
  if (page === '/primeiro-acesso')       initFirstAccess();
  if (page === '/dashboard')             initDashboard();
});