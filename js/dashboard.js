// ═══════════════════════════════════════════════════════
//  dashboard.js — Performance Hub · Meridian Labs
//  100% dados do banco Neon — zero mock
// ═══════════════════════════════════════════════════════

// ── CORES MERIDIAN ──────────────────────────────────────
const GOLD='#C9A84C', SILV='#A8B2BD', GREEN='#4ade80', RED='#f87171', AMBER='#fbbf24', BLUE='#60a5fa', PURPLE='#a78bfa';
const grid = { color:'rgba(168,178,189,0.06)', drawBorder:false };
const tt = {
  backgroundColor:'rgba(8,19,33,0.95)',
  borderColor:'rgba(201,168,76,0.2)', borderWidth:1,
  titleColor:SILV, bodyColor:GOLD, padding:10,
  titleFont:{family:'DM Mono, monospace', size:9},
  bodyFont: {family:'DM Mono, monospace', size:11},
};
Chart.defaults.color = SILV;
Chart.defaults.font.family = 'DM Mono, monospace';
Chart.defaults.maintainAspectRatio = false;

// ── CHART REGISTRY ──────────────────────────────────────
const charts = {};
function mkChart(id, config) {
  const el = document.getElementById(id);
  if (!el) return;
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  el.style.opacity = '1';
  const wrap = el.parentElement;
  const old = wrap.querySelector('.chart-empty-msg');
  if (old) old.remove();
  charts[id] = new Chart(el, config);
}
function mkEmptyChart(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  el.style.opacity = '0';
  const wrap = el.parentElement;
  let ov = wrap.querySelector('.chart-empty-msg');
  if (!ov) {
    ov = document.createElement('div');
    ov.className = 'chart-empty-msg';
    ov.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:DM Mono,monospace;font-size:9px;color:var(--dim);text-align:center;padding:20px;pointer-events:none';
    wrap.style.position = 'relative';
    wrap.appendChild(ov);
  }
  ov.textContent = msg || 'Sem dados';
}

// ── THEME ────────────────────────────────────────────────
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('ph_theme', t);
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = t === 'dark' ? '🌙' : '☀️';
  setTimeout(syncChartColors, 50);
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
}
function syncChartColors() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const textCol = isLight ? '#2C4A68' : '#A8B2BD';
  const gridCol = isLight ? 'rgba(28,58,92,0.08)' : 'rgba(168,178,189,0.06)';
  Chart.defaults.color = textCol;
  try {
    Object.values(charts).forEach(ch => {
      if (!ch) return;
      Object.values(ch.options.scales || {}).forEach(sc => {
        if (sc.grid)  sc.grid.color  = gridCol;
        if (sc.ticks) sc.ticks.color = textCol;
      });
      const leg = ch.options.plugins?.legend?.labels;
      if (leg) leg.color = textCol;
      ch.update('none');
    });
  } catch {}
}
(function(){
  const saved = localStorage.getItem('ph_theme');
  const dark  = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (dark ? 'dark' : 'light'));
})();

// ── LOGOUT ───────────────────────────────────────────────
function doLogout() {
  localStorage.removeItem('mf_token');
  localStorage.removeItem('mf_user');
  window.location.href = '/';
}

// ── TAB SWITCH ──────────────────────────────────────────
let acompChartsDone = false;
function switchTab(tab, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  const target = document.getElementById('tab-' + tab);
  if (target) target.classList.add('active');
  if (btn) btn.classList.add('active');
  if (tab === 'acompanhamento') {
    if (!acompChartsDone) {
      acompChartsDone = true;
      setTimeout(() => { initAcompCharts(); updateStudent(); }, 100);
    } else {
      setTimeout(updateStudent, 60);
    }
  }
  if (tab === 'config' && !window._configInited) {
    window._configInited = true;
    initConfig();
  }
  setTimeout(() => {
    try { Object.values(charts).forEach(ch => ch && ch.resize()); } catch {}
  }, 150);
}

// ── SCALE BUTTONS ────────────────────────────────────────
function selectScale(btn, scaleId) {
  document.getElementById(scaleId)?.querySelectorAll('.scale-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}
function getScaleValue(scaleId) {
  const active = document.getElementById(scaleId)?.querySelector('.scale-btn.active');
  return active ? active.textContent.trim().split('\n')[0] : null;
}
function toggleResponse(el) {
  el.classList.toggle('open');
  el.querySelector('.response-body')?.classList.toggle('open');
}

// ── API CALL HELPER ──────────────────────────────────────
async function api(path, options = {}) {
  const token = localStorage.getItem('mf_token');
  const res = await fetch('/api' + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) { window.location.href = '/'; return null; }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Erro ' + res.status);
  }
  return res.json();
}

// ── FORMAT HELPERS ───────────────────────────────────────
function fmtBRL(n) {
  if (!n || n === 0) return 'R$0';
  if (n >= 1000) return 'R$' + (n/1000).toFixed(1) + 'K';
  return 'R$' + Math.round(n).toLocaleString('pt-BR');
}
function calcTime(since) {
  if (!since) return '—';
  const months = Math.floor((new Date() - new Date(since)) / (1000*60*60*24*30));
  if (months < 1) return 'Este mês';
  return months + ' meses';
}
function calcDays(dateStr) {
  if (!dateStr) return '—';
  const d = Math.floor((new Date() - new Date(dateStr)) / (1000*60*60*24));
  return d === 0 ? 'Hoje' : d === 1 ? '1d' : d + 'd';
}
function daysSince(dateStr) {
  if (!dateStr) return 0;
  return Math.floor((new Date() - new Date(dateStr)) / (1000*60*60*24));
}
function capitalize(str) {
  if (!str) return '—';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ── LOAD DASHBOARD ───────────────────────────────────────
async function loadDashboard() {
  const token   = localStorage.getItem('mf_token');
  const session = JSON.parse(localStorage.getItem('mf_user') || 'null');
  if (!token || !session) { window.location.href = '/'; return; }

  // Resolve personal_id
  let personalId = session.personal_id || session.id;
  if (!session.personal_id) {
    const me = await api('/auth/me').catch(() => null);
    if (me?.personal_id) {
      personalId = me.personal_id;
      session.personal_id = personalId;
      localStorage.setItem('mf_user', JSON.stringify(session));
    }
  }

  // Header
  const name     = session.name || 'Personal';
  const initials = name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
  const h1 = document.getElementById('dash-user-h1');
  if (h1) h1.innerHTML = name + ' — <em>Personal Trainer</em>';
  const nameEl   = document.getElementById('dash-user-name');
  const avatarEl = document.getElementById('dash-user-avatar');
  if (nameEl)   nameEl.textContent = name;
  if (avatarEl) avatarEl.textContent = initials;

  // Init gráficos vazios enquanto carrega
  initBICharts(null);
  initVendasCharts(null);

  // Load tudo em paralelo
  const [metrics, studentsData, leadsData, plansData] = await Promise.all([
    api('/metrics/' + personalId).catch(() => null),
    api('/students/' + personalId).catch(() => null),
    api('/leads/'    + personalId).catch(() => null),
    api('/plans/'    + personalId).catch(() => null),
  ]);

  // KPIs e alertas
  updateKPICards(metrics);
  updateAlertBar(metrics);

  // Gráficos com dados reais
  initBICharts(metrics);

  // Alunos
  if (studentsData?.length) {
    loadStudentsFromAPI(studentsData);
  } else {
    renderEmptyChurnList();
    renderEmptyTopTable();
    updateStudent();
  }

  // Leads/Kanban
  if (leadsData) {
    loadLeadsFromAPI(leadsData);
  } else {
    renderKanban();
  }

  // Planos na aba vendas
  if (plansData?.length) {
    loadPlansFromAPI(plansData);
  } else {
    initVendasCharts(null);
  }

  renderSalesTable([]);
  if (typeof updateFormStudentName === 'function') updateFormStudentName();
}

// ── KPI CARDS ────────────────────────────────────────────
function updateKPICards(m) {
  const mrr    = m?.mrr            || 0;
  const alunos = m?.active_students || 0;
  const ticket = m?.avg_ticket      || 0;

  const set = (id, v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  set('kpi-mrr-val',    fmtBRL(mrr));
  set('kpi-alunos-val', alunos || '0');
  set('kpi-ticket-val', fmtBRL(ticket));
  set('kpi-alunos-sub', alunos > 0 ? alunos + ' alunos ativos' : 'Nenhum aluno ainda');
  set('kpi-ticket-sub', ticket > 0 ? 'Ticket médio atual' : 'Sem assinaturas ativas');

  // Header pills
  const pills = document.querySelectorAll('.meta-pill span');
  if (pills[0]) pills[0].textContent = alunos;
  if (pills[1]) pills[1].textContent = fmtBRL(mrr);

  // Outros KPIs — zerados até ter dados
  set('kpi-renovacao-val', m?.renewal_rate ? m.renewal_rate + '%' : '—');
  set('kpi-churn-val',     m?.churn_rate   ? m.churn_rate   + '%' : '—');
  set('kpi-ltv-val',       m?.avg_ltv      ? fmtBRL(m.avg_ltv)   : '—');
}

// ── ALERT BAR ────────────────────────────────────────────
function updateAlertBar(m) {
  const e7    = m?.expiring_7d?.count || 0;
  const e7v   = m?.expiring_7d?.value || 0;
  const bar   = document.getElementById('alert-bar');
  const expEl = document.getElementById('alert-expiring');
  const expTx = document.getElementById('alert-expiring-text');
  let   show  = false;
  if (e7 > 0) {
    if (expEl) expEl.style.display = 'flex';
    if (expTx) expTx.textContent   = e7 + ' alunos — R$ ' + Math.round(e7v).toLocaleString('pt-BR') + ' em risco';
    show = true;
  } else if (expEl) expEl.style.display = 'none';
  if (bar) bar.style.display = show ? 'flex' : 'none';
}

// ── BI CHARTS — dados do banco ou vazio ──────────────────
function initBICharts(m) {
  const empty = 'Sem dados · cadastre alunos para ver';

  // MRR
  if (m?.mrr_history?.length) {
    mkChart('mrrChart', {
      type:'line',
      data:{
        labels: m.mrr_history.map(r => r.month),
        datasets:[{label:'MRR (R$)',data:m.mrr_history.map(r=>parseFloat(r.mrr)||0),
          borderColor:GOLD,backgroundColor:'rgba(201,168,76,0.08)',fill:true,tension:0.4,borderWidth:2.5,pointRadius:3,pointBackgroundColor:GOLD}]
      },
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{...tt,callbacks:{label:ctx=>'R$ '+ctx.parsed.y.toLocaleString()}}},
        scales:{x:{grid:{display:false},ticks:{color:SILV,font:{size:8}}},y:{grid,ticks:{color:SILV,callback:v=>'R$'+(v/1000).toFixed(0)+'K'}}}}
    });
  } else { mkEmptyChart('mrrChart', empty); }

  // Alunos
  if (m?.student_flow?.length) {
    mkChart('studentsChart', {
      type:'bar',
      data:{
        labels: m.student_flow.map(r => r.month),
        datasets:[{label:'Novos',data:m.student_flow.map(r=>parseInt(r.new_students)||0),
          backgroundColor:'rgba(74,222,128,0.4)',borderColor:GREEN,borderWidth:1.5,borderRadius:3}]
      },
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{labels:{color:SILV,usePointStyle:true,font:{size:9}}},tooltip:{...tt}},
        scales:{x:{grid:{display:false},ticks:{color:SILV,font:{size:8}}},y:{grid,ticks:{color:SILV}}}}
    });
  } else { mkEmptyChart('studentsChart', empty); }

  // Canais — vem de /metrics quando implementado
  if (m?.channels?.length) {
    mkChart('channelChart', {
      type:'bar',
      data:{
        labels: m.channels.map(r => capitalize(r.channel)),
        datasets:[{label:'Alunos',data:m.channels.map(r=>parseInt(r.count)||0),
          backgroundColor:GOLD+'66',borderColor:GOLD,borderWidth:1.5,borderRadius:3}]
      },
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{...tt}},
        scales:{x:{grid:{display:false},ticks:{color:SILV,font:{size:9}}},y:{grid,ticks:{color:SILV}}}}
    });
  } else { mkEmptyChart('channelChart', empty); }

  // Renovação por plano
  if (m?.renewal_by_plan?.length) {
    mkChart('renewalChart', {
      type:'bar',
      data:{
        labels: m.renewal_by_plan.map(r => r.plan_name || r.duration_months+'m'),
        datasets:[{label:'Renovações',data:m.renewal_by_plan.map(r=>parseInt(r.renewals)||0),
          backgroundColor:GOLD+'55',borderColor:GOLD,borderWidth:1.5,borderRadius:4}]
      },
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{...tt}},
        scales:{x:{grid:{display:false},ticks:{color:SILV,font:{size:9}}},y:{grid,ticks:{color:SILV}}}}
    });
  } else { mkEmptyChart('renewalChart', empty); }

  // Demais gráficos — vazios até ter dados suficientes
  ['seasonChart','metaChart','rpsChart','socialChart','roiChart'].forEach(id => mkEmptyChart(id, empty));
}

// ── VENDAS CHARTS ────────────────────────────────────────
function initVendasCharts(planos) {
  if (planos?.length) {
    mkChart('vMixChart', {
      type:'doughnut',
      data:{
        labels: planos.map(p => p.name),
        datasets:[{data:planos.map(()=>0), // será atualizado com vendas reais
          backgroundColor:[RED+'55',AMBER+'55',GOLD+'66',GREEN+'55'],borderColor:'#081321',borderWidth:3,hoverOffset:6}]
      },
      options:{responsive:true,maintainAspectRatio:false,cutout:'56%',
        plugins:{legend:{position:'right',labels:{color:SILV,usePointStyle:true,font:{size:9},padding:10}},tooltip:{...tt}}}
    });
  } else {
    mkEmptyChart('vMixChart', 'Sem vendas ainda');
  }
}

// ── ACOMP CHARTS — dados do aluno selecionado ────────────
function initAcompCharts() {
  const sel = document.getElementById('studentSelect');
  const s   = sel ? students[sel.value] : null;

  if (!s?.weight?.labels?.length) {
    mkEmptyChart('weightChart', 'Sem dados de peso ainda');
    mkEmptyChart('freqChart',   'Sem dados de frequência ainda');
    mkEmptyChart('moodChart',   'Sem dados de humor ainda');
    return;
  }

  mkChart('weightChart', {
    type:'line',
    data:{
      labels: s.weight.labels,
      datasets:[
        {label:'Peso (kg)',data:s.weight.kg,borderColor:GOLD,backgroundColor:'rgba(201,168,76,0.06)',fill:true,tension:0.4,borderWidth:2.5,pointRadius:4,pointBackgroundColor:GOLD,yAxisID:'y'},
        {label:'BF %',     data:s.weight.bf,borderColor:GREEN,backgroundColor:'rgba(74,222,128,0.04)',fill:true,tension:0.4,borderWidth:1.5,pointRadius:3,pointBackgroundColor:GREEN,borderDash:[4,3],yAxisID:'y2'},
      ]
    },
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{labels:{color:SILV,usePointStyle:true,font:{size:9}}},tooltip:{...tt}},
      scales:{x:{grid:{display:false},ticks:{color:SILV,font:{size:8},maxRotation:45}},
        y:{grid,ticks:{color:GOLD,font:{size:9},callback:v=>v+'kg'},suggestedMin:0},
        y2:{position:'right',grid:{display:false},ticks:{color:GREEN,font:{size:9},callback:v=>v+'%'},suggestedMin:0}}}
  });

  const fd = s.freq || [];
  if (fd.length) {
    mkChart('freqChart', {
      type:'bar',
      data:{
        labels:fd.map((_,i)=>'Sem '+(i+1)),
        datasets:[
          {label:'Treinos',data:fd,backgroundColor:fd.map(v=>v>=5?GREEN+'66':v>=4?GOLD+'66':AMBER+'55'),borderColor:fd.map(v=>v>=5?GREEN:v>=4?GOLD:AMBER),borderWidth:1.5,borderRadius:3},
          {label:'Meta',data:Array(fd.length).fill(5),type:'line',borderColor:SILV+'44',borderDash:[4,3],pointRadius:0,borderWidth:1.5}
        ]
      },
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{labels:{color:SILV,usePointStyle:true,font:{size:9}}},tooltip:{...tt}},
        scales:{x:{grid:{display:false},ticks:{color:SILV,font:{size:8},maxTicksLimit:10}},y:{grid,ticks:{color:SILV},suggestedMin:0,suggestedMax:6}}}
    });
  } else { mkEmptyChart('freqChart', 'Sem dados de frequência'); }

  const md = s.mood;
  if (md?.data?.length) {
    mkChart('moodChart', {
      type:'line',
      data:{labels:md.labels,datasets:[{label:'Disposição',data:md.data,borderColor:PURPLE,backgroundColor:'rgba(167,139,250,0.1)',fill:true,tension:0.4,borderWidth:2,pointRadius:5,pointBackgroundColor:PURPLE}]},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{...tt}},
        scales:{x:{grid:{display:false},ticks:{color:SILV,font:{size:9}}},y:{grid,ticks:{color:SILV},suggestedMin:1,suggestedMax:5}}}
    });
  } else { mkEmptyChart('moodChart', 'Sem dados de humor'); }
}

// ── STUDENTS — do banco ──────────────────────────────────
const students = {};

function loadStudentsFromAPI(data) {
  Object.keys(students).forEach(k => delete students[k]);
  const sel = document.getElementById('studentSelect');
  if (sel) sel.innerHTML = '';

  data.forEach(s => {
    const key = s.id;
    students[key] = {
      avatar:   s.name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase(),
      name:     s.name,
      time:     calcTime(s.student_since),
      plan:     (s.plan_name || '—') + (s.price_paid ? ' — R$'+Math.round(s.price_paid)+'/mês' : ''),
      channel:  capitalize(s.channel),
      ltv:      fmtBRL(s.ltv_total || 0),
      sk1: '—', sk2: '—', sk3: '—', sk4: '—',
      weight:   { labels:[], kg:[], bf:[] },
      freq:     [],
      mood:     { labels:[], data:[] },
      photos:   [
        { date:'INÍCIO', desc:(s.weight_initial||'—')+' kg · BF '+(s.bf_initial||'—')+'%', label:'Peso Inicial', val:(s.weight_initial||'—')+' kg' },
        { date:'ATUAL',  desc:(s.weight_current||'—')+' kg · BF '+(s.bf_current||'—')+'%',  label:'Atual',        val:(s.weight_current||'—')+' kg', highlight:true },
      ],
      timeline:  [],
      responses: [],
      stats:     buildStats(s),
      engagement:buildEngagement(s),
    };

    if (sel) {
      const opt = document.createElement('option');
      opt.value = key;
      const churn = s.days_to_expire !== null && s.days_to_expire <= 7 ? ' · ⚠ CHURN' : '';
      opt.textContent = s.name + ' — ' + (s.plan_name||'Plano') + ' · ' + calcTime(s.student_since) + churn;
      sel.appendChild(opt);
    }
  });

  // Carrega checkins do primeiro aluno
  if (data.length > 0) loadStudentCheckins(data[0].id);

  renderChurnListFromAPI(data);
  renderTopTableFromAPI(data);
  updateStudent();
}

function buildStats(s) {
  const lost    = s.weight_initial && s.weight_current ? (s.weight_current - s.weight_initial).toFixed(1) : null;
  const bfLost  = s.bf_initial     && s.bf_current     ? (s.bf_current     - s.bf_initial).toFixed(1)     : null;
  const lostPct = s.weight_initial && lost ? Math.abs(lost / s.weight_initial * 100) : 0;
  return {
    pesoLabel: lost !== null ? (parseFloat(lost)<0?'− ':'+ ')+Math.abs(lost)+' kg' : '—',
    pesoBar:   Math.min(100, Math.round(lostPct * 3)),
    bfLabel:   bfLost !== null ? (parseFloat(bfLost)<0?'− ':'+ ')+Math.abs(bfLost)+' pp' : '—',
    bfBar:     bfLost !== null ? Math.min(100, Math.abs(bfLost)*5) : 0,
    metaLabel: '—', metaBar: 0,
    engLabel:  '—', engBar:  0, engColor:'var(--dim)',
  };
}

function buildEngagement(s) {
  const days = s.days_to_expire;
  const renovPct = days === null ? 50 : days <= 0 ? 0 : days <= 7 ? 20 : days <= 30 ? 60 : 85;
  const renovColor = days === null ? 'var(--dim)' : days <= 7 ? 'var(--red)' : days <= 30 ? 'var(--amber)' : 'var(--green)';
  return {
    score: '—', scoreColor: 'green',
    bars: [
      { label:'Frequência de Treino',         val:'Aguardando check-ins', pct:0,       color:'var(--dim)'  },
      { label:'Responsividade ao Formulário', val:'Aguardando respostas',  pct:0,       color:'var(--dim)'  },
      { label:'Probabilidade de Renovação',   val: days !== null ? 'Vence em '+days+'d' : '—', pct:renovPct, color:renovColor },
    ],
    mood: { labels:[], data:[] },
  };
}

async function loadStudentCheckins(studentId) {
  const data = await api('/checkins/' + studentId).catch(() => null);
  const s    = students[studentId];
  if (!data?.length || !s) return;

  // Respostas
  s.responses = data.map(c => {
    const date    = new Date(c.responded_at || c.created_at);
    const dateStr = date.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'});
    const mood    = c.mood_score || 3;
    const emojis  = ['😞','😐','🙂','😊','🔥'];
    const moodStr = Array(mood).fill(emojis[mood-1]).join('');
    const treinos = c.trainings_done || 0;
    const tag     = treinos>=5?'Ótima semana':treinos>=4?'Boa semana':treinos>=3?'Semana ok':'Semana difícil';
    return {
      week:'Check-in', date:dateStr, mood:moodStr, tag,
      summary: c.training_feedback || 'Sem observações.',
      fields:[
        {l:'Treinos realizados', v:treinos+' de 5'},
        ...(c.had_pain?[{l:'Dor',v:c.pain_description||'Sim'}]:[]),
        ...(c.weight_reported?[{l:'Peso',v:c.weight_reported+' kg'}]:[]),
        ...(c.mood_score?[{l:'Disposição',v:c.mood_score+'/5'}]:[]),
      ]
    };
  });

  // Peso e frequência dos check-ins
  const withWeight = data.filter(c=>c.weight_reported).reverse();
  if (withWeight.length >= 2) {
    s.weight.labels = withWeight.map(c=>new Date(c.created_at).toLocaleDateString('pt-BR',{month:'short',year:'2-digit'}));
    s.weight.kg     = withWeight.map(c=>parseFloat(c.weight_reported));
    s.weight.bf     = withWeight.map(c=>parseFloat(c.bf_measured)||0);
  }
  const freqData = data.reverse().map(c=>c.trainings_done||0);
  if (freqData.length) s.freq = freqData;

  const moodData = data.filter(c=>c.mood_score).map(c=>c.mood_score);
  if (moodData.length) {
    s.mood.labels = moodData.map((_,i)=>'Sem '+(i+1));
    s.mood.data   = moodData;
  }

  updateStudent();
}

function updateStudent() {
  const sel = document.getElementById('studentSelect');
  if (!sel?.value) return;
  const s = students[sel.value];
  if (!s) return;

  const set = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  set('studentAvatar',  s.avatar);
  set('studentName',    s.name);
  set('studentTime',    s.time);
  set('studentPlan',    s.plan);
  set('studentChannel', s.channel);
  set('studentLTV',     s.ltv);
  set('sk1',s.sk1); set('sk2',s.sk2); set('sk3',s.sk3); set('sk4',s.sk4);

  // Fotos
  const photoEl = document.getElementById('photo-compare');
  if (photoEl && s.photos) {
    photoEl.innerHTML = s.photos.map(p=>`
      <div class="photo-card">
        <div class="photo-placeholder" style="${p.highlight?'border:1px solid rgba(74,222,128,0.2)':''}">
          <div class="photo-icon">📷</div>
          <div class="photo-date">${p.date}</div>
          <div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--dim);text-align:center;z-index:1;padding:0 20px">${p.desc}</div>
        </div>
        <div class="photo-footer">
          <span class="photo-footer-label">${p.label}</span>
          <span class="photo-footer-val">${p.val}</span>
        </div>
      </div>`).join('');
  }

  // Timeline
  const tlEl = document.getElementById('student-timeline');
  if (tlEl) {
    if (s.timeline?.length) {
      tlEl.innerHTML = s.timeline.map(t=>`
        <div class="tl-item">
          <div class="tl-dot ${t.dot||''}"></div>
          <div class="tl-date">${t.date}</div>
          <div class="tl-title">${t.title}</div>
          <div class="tl-desc">${t.desc}</div>
        </div>`).join('');
    } else {
      tlEl.innerHTML = '<div style="font-family:\'DM Mono\',monospace;font-size:10px;color:var(--dim);padding:16px 0">Nenhum marco registrado ainda</div>';
    }
  }

  // Respostas
  const respEl    = document.getElementById('student-responses');
  const respBadge = document.getElementById('responses-badge');
  if (respBadge) respBadge.textContent = (s.responses?.length||0) + ' RESPOSTAS';
  if (respEl) {
    if (s.responses?.length) {
      respEl.innerHTML = s.responses.map(r=>`
        <div class="response-item" onclick="toggleResponse(this)">
          <div class="response-header">
            <span class="response-date">${r.date}</span>
            <span class="response-week">${r.week}</span>
            <span class="response-tag">${r.tag}</span>
            <div class="response-stars">${r.mood}</div>
          </div>
          <div class="response-body">
            <div class="response-summary">${r.summary}</div>
            ${r.fields.map(f=>`<div class="response-field"><span class="response-field-label">${f.l}</span><span class="response-field-val">${f.v}</span></div>`).join('')}
          </div>
        </div>`).join('');
    } else {
      respEl.innerHTML = '<div style="font-family:\'DM Mono\',monospace;font-size:10px;color:var(--dim);padding:16px 0">Nenhuma resposta ainda · Envie o formulário ao aluno</div>';
    }
  }

  // Stats
  const statsEl = document.getElementById('student-stats');
  if (statsEl && s.stats) {
    const st = s.stats;
    statsEl.innerHTML = [
      {label:'Peso Total Perdido', val:st.pesoLabel, pct:st.pesoBar, color:'var(--green)'},
      {label:'Redução BF',         val:st.bfLabel,   pct:st.bfBar,   color:'var(--green)'},
      {label:'Meta Atingida',      val:st.metaLabel, pct:st.metaBar, color:'var(--gold)' },
      {label:'Engajamento Score',  val:st.engLabel,  pct:st.engBar,  color:st.engColor   },
    ].map(item=>`
      <div>
        <div style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.1em;text-transform:uppercase;color:var(--silver);margin-bottom:6px">${item.label}</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:1.6rem;color:${item.color}">${item.val}</div>
        <div class="engagement-bar"><div class="engagement-fill" style="width:${item.pct}%;background:linear-gradient(90deg,${item.color},${item.color}66)"></div></div>
      </div>`).join('');
  }

  // Engagement panel
  const engPanel = document.getElementById('engagement-panel');
  if (engPanel && s.engagement) {
    const eng   = s.engagement;
    const badge = document.getElementById('engagement-score-badge');
    if (badge) { badge.textContent = 'SCORE ' + eng.score; badge.className = 'panel-badge ' + (eng.scoreColor==='fail'?'fail':'green'); }
    const barsHtml = eng.bars.map(bar=>`
      <div style="margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.1em;text-transform:uppercase;color:var(--silver)">${bar.label}</span>
          <span style="font-family:'DM Mono',monospace;font-size:10px;color:${bar.color}">${bar.val}</span>
        </div>
        <div class="engagement-bar"><div class="engagement-fill" style="width:${bar.pct}%;background:linear-gradient(90deg,${bar.color},${bar.color}44)"></div></div>
      </div>`).join('');
    const panelHeader = engPanel.querySelector('.panel-header');
    Array.from(engPanel.children).forEach(child => { if(!child.classList.contains('panel-header')) child.remove(); });
    engPanel.insertAdjacentHTML('beforeend', barsHtml);
  }

  if (typeof updateFormStudentName === 'function') updateFormStudentName();
  if (acompChartsDone) setTimeout(initAcompCharts, 50);
}

// ── CHURN LIST — do banco ────────────────────────────────
function renderChurnListFromAPI(data) {
  const el = document.getElementById('churn-list');
  if (!el) return;
  const atRisk = data.filter(s => s.days_to_expire !== null && s.days_to_expire <= 21);
  if (!atRisk.length) {
    el.innerHTML = '<div style="font-family:\'DM Mono\',monospace;font-size:10px;color:var(--dim);padding:16px 0">Nenhum aluno em risco de churn ✓</div>';
    return;
  }
  el.innerHTML = atRisk.slice(0,6).map(s => {
    const level  = s.days_to_expire <= 7 ? 'high' : 'med';
    const detail = 'Plano vence em ' + s.days_to_expire + ' dias · R$' + Math.round(s.price_paid||0);
    const init   = s.name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
    return '<div class="churn-item"><div class="churn-avatar">'+init+'</div><div><div class="churn-name">'+s.name+'</div><div class="churn-detail">'+detail+'</div></div><div class="churn-badge '+level+'">'+(level==='high'?'CRÍTICO':'MÉDIO')+'</div></div>';
  }).join('');
}

function renderEmptyChurnList() {
  const el = document.getElementById('churn-list');
  if (el) el.innerHTML = '<div style="font-family:\'DM Mono\',monospace;font-size:10px;color:var(--dim);padding:16px 0">Nenhum aluno cadastrado ainda · Use a aba Configurações</div>';
}

// ── TOP TABLE — do banco ──────────────────────────────────
function renderTopTableFromAPI(data) {
  const el = document.getElementById('table-top-students');
  if (!el) return;
  const sorted = [...data].sort((a,b)=>(b.ltv_total||0)-(a.ltv_total||0)).slice(0,10);
  el.innerHTML = '<thead><tr><th>#</th><th>Nome</th><th>Plano</th><th>Tempo</th><th>Canal</th><th style="text-align:right">LTV</th><th style="text-align:right">Renovações</th></tr></thead><tbody>'
    + sorted.map((s,i)=>'<tr><td class="num">'+(i+1)+'</td><td>'+s.name+'</td><td>'+(s.plan_name||'—')+'</td><td>'+calcTime(s.student_since)+'</td><td>'+capitalize(s.channel)+'</td><td class="num">'+fmtBRL(s.ltv_total||0)+'</td><td class="num">'+((s.renewals_count||0)+'×')+'</td></tr>').join('')
    + '</tbody>';
}

function renderEmptyTopTable() {
  const el = document.getElementById('table-top-students');
  if (el) el.innerHTML = '<thead><tr><th>#</th><th>Nome</th><th>Plano</th><th>Tempo</th><th>Canal</th><th>LTV</th><th>Renovações</th></tr></thead><tbody><tr><td colspan="7" style="text-align:center;color:var(--dim);padding:20px;font-size:10px">Nenhum aluno cadastrado</td></tr></tbody>';
}

// ── KANBAN — do banco ────────────────────────────────────
const KDATA = { novo:[], contato:[], proposta:[], fechado:[], perdido:[] };
const KCOLS = [
  {key:'novo',    label:'Novo',    color:'#60a5fa'},
  {key:'contato', label:'Contato', color:'#a78bfa'},
  {key:'proposta',label:'Proposta',color:'#fbbf24'},
  {key:'fechado', label:'Fechado', color:'#4ade80'},
  {key:'perdido', label:'Perdido', color:'#f87171'},
];
const kStatus = {};
const kNotes  = {};

function loadLeadsFromAPI(pipeline) {
  Object.keys(KDATA).forEach(k => KDATA[k] = []);
  Object.keys(kStatus).forEach(k => delete kStatus[k]);
  Object.entries(pipeline).forEach(([status, leads]) => {
    leads.forEach(l => {
      const card = {
        id:    l.id,
        name:  l.name,
        sub:   capitalize(l.channel||'instagram') + ' · ' + capitalize(l.goal||'emagrecimento'),
        val:   l.plan_name ? l.plan_name + ' · R$'+Math.round(l.price_brl||0) : '',
        days:  calcDays(l.created_at),
        phone: l.phone || '',
        email: l.email || '',
        canal: capitalize(l.channel||'instagram'),
        dp:    daysSince(l.created_at),
        ok:    status==='fechado',
        lost:  status==='perdido',
        hot:   status==='proposta',
      };
      KDATA[status] = KDATA[status] || [];
      KDATA[status].push(card);
      kStatus[l.id] = status;
    });
  });
  renderKanban();
}

function renderKanban() {
  const board = document.getElementById('v-kanban-board');
  if (!board) return;
  board.innerHTML = KCOLS.map(col => {
    const cards = KDATA[col.key] || [];
    return '<div class="v-kcol"><div class="v-kcol-head"><span class="v-kcol-title">'+col.label+'</span><span class="v-kcount" style="background:'+col.color+'22;color:'+col.color+'">'+cards.length+'</span></div>'
      + cards.map(c=>'<div class="v-kcard" style="'+(c.hot?'border-color:rgba(251,191,36,0.25)':c.ok?'border-color:rgba(74,222,128,0.2)':c.lost?'opacity:0.6;border-color:rgba(248,113,113,0.18)':'')+'cursor:pointer" onclick="openCtxMenu(event,\''+c.id+'\',\''+col.key+'\')">'
        +'<div class="v-kcard-name">'+c.name+'</div>'
        +'<div class="v-kcard-detail">'+c.sub+'</div>'
        +(c.val?'<div class="v-kcard-val" style="'+(c.ok?'color:var(--green)':c.lost?'color:var(--red)':'')+'">'+c.val+'</div>':'')
        +(c.days?'<div class="v-kcard-days">'+c.days+'</div>':'')
        +'</div>').join('')
      + '</div>';
  }).join('');
}

// ── CONTEXT MENU ─────────────────────────────────────────
let ctxId = null;
function openCtxMenu(e, cardId, curStatus) {
  e.stopPropagation(); ctxId = cardId;
  const c = Object.values(KDATA).flat().find(x=>x.id===cardId);
  if (!c) return;
  const menu=document.getElementById('ctx-menu'), overlay=document.getElementById('ctx-overlay');
  if (!menu||!overlay) return;
  document.getElementById('ctx-lead-name').textContent = c.name;
  document.getElementById('ctx-lead-sub').textContent  = c.sub;
  document.getElementById('ctx-info-grid').innerHTML = [
    {l:'Plano',v:c.val||'—'},{l:'Canal',v:c.canal||'—'},
    {l:'WhatsApp',v:c.phone||'—'},{l:'E-mail',v:c.email||'—'},
    {l:'No pipeline',v:c.dp===0?'Hoje':c.dp+'d'},{l:'Status',v:curStatus},
  ].map(i=>'<div><div class="ctx-info-label">'+i.l+'</div><div class="ctx-info-val">'+i.v+'</div></div>').join('');
  document.querySelectorAll('.ctx-sbtn').forEach(b=>b.classList.toggle('cur',b.dataset.s===curStatus));
  document.getElementById('ctx-notes-input').value = kNotes[cardId]||'';
  menu.style.display='block'; overlay.classList.add('open');
  const x=Math.min(e.clientX+8,window.innerWidth-328);
  const y=Math.min(e.clientY+8,window.innerHeight-468);
  menu.style.left=Math.max(8,x)+'px'; menu.style.top=Math.max(8,y)+'px';
}
function closeCtxMenu() {
  const m=document.getElementById('ctx-menu'),o=document.getElementById('ctx-overlay');
  if(m) m.style.display='none'; if(o) o.classList.remove('open'); ctxId=null;
}
function ctxMove(newStatus) {
  if (!ctxId) return;
  kStatus[ctxId] = newStatus;
  document.querySelectorAll('.ctx-sbtn').forEach(b=>b.classList.toggle('cur',b.dataset.s===newStatus));
  renderKanban();
}
function ctxSave() {
  if (ctxId) {
    kNotes[ctxId] = document.getElementById('ctx-notes-input')?.value;
    const newStatus = document.querySelector('.ctx-sbtn.cur')?.dataset.s;
    if (newStatus) updateLeadInAPI(ctxId, newStatus, kNotes[ctxId]).catch(()=>{});
  }
  closeCtxMenu();
}

// ── LEADS API ────────────────────────────────────────────
async function saveLeadToAPI(leadData) {
  const session = JSON.parse(localStorage.getItem('mf_user')||'null');
  if (!session) return null;
  return api('/leads', { method:'POST', body:JSON.stringify({...leadData, personal_id:session.personal_id||session.id}) });
}
async function updateLeadInAPI(leadId, status, notes) {
  return api('/leads/'+leadId, { method:'PATCH', body:JSON.stringify({status, notes}) });
}

// ── VENDAS — form e link ──────────────────────────────────
let vSelectedPlan = {dur:'1m', price:'0', id:''};
function vSelectPlan(el) {
  document.querySelectorAll('.plan-card-v').forEach(c=>c.classList.remove('sel'));
  el.classList.add('sel');
  vSelectedPlan = {dur:el.dataset.dur, price:el.dataset.price, id:el.dataset.id||''};
  document.getElementById('v-link-result').style.display='none';
}

function loadPlansFromAPI(plans) {
  const grid = document.querySelector('.plans-grid-v');
  if (!grid||!plans.length) return;
  const colors = ['var(--red)','var(--amber)','var(--gold)','var(--green)'];
  grid.innerHTML = plans.map((p,i)=>`
    <div class="plan-card-v${i===0?' sel':''}" data-id="${p.id}" data-dur="${p.duration_months}m" data-price="${p.price_brl}" onclick="vSelectPlan(this)">
      <div style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.1em;color:${colors[Math.min(i,3)]};text-transform:uppercase;margin-bottom:6px">${p.name}</div>
      <div class="plan-price" style="font-family:'Cormorant Garamond',serif;font-size:1.3rem;color:var(--white)">R$${Math.round(p.price_brl)}</div>
      <div class="plan-dur" style="font-family:'DM Mono',monospace;font-size:9px;color:var(--dim)">${p.duration_months} meses</div>
    </div>`).join('');
  if (plans.length) vSelectedPlan = {dur:plans[0].duration_months+'m', price:plans[0].price_brl, id:plans[0].id};
}

async function vSaveLead() {
  const name    = document.getElementById('v-lead-name')?.value.trim();
  const phone   = document.getElementById('v-lead-phone')?.value.trim();
  const email   = document.getElementById('v-lead-email')?.value.trim();
  const channel = document.getElementById('v-lead-channel')?.value || 'Instagram';

  if (!name)  { document.getElementById('v-lead-name')?.focus();  return; }
  if (!phone) { document.getElementById('v-lead-phone')?.focus(); return; }

  const newId = 'tmp_' + Date.now();
  const newLead = {id:newId,name,sub:channel+' · Novo lead',val:'',days:'Agora',phone,email,canal:channel,dp:0};
  KDATA.novo.unshift(newLead);
  kStatus[newId] = 'novo';
  renderKanban();

  const btn = document.getElementById('v-save-btn');
  const orig = btn.textContent;
  btn.textContent='✓ Lead adicionado!'; btn.disabled=true;
  btn.style.cssText += ';background:rgba(74,222,128,0.15);border-color:var(--green);color:var(--green)';

  saveLeadToAPI({name, phone, email:email||null, channel:channel.toLowerCase(), goal:'emagrecimento'})
    .then(saved => {
      if (saved?.id) {
        const idx = KDATA.novo.findIndex(c=>c.id===newId);
        if (idx>=0) KDATA.novo[idx].id = saved.id;
        kStatus[saved.id]='novo'; delete kStatus[newId];
      }
    }).catch(()=>{});

  setTimeout(() => {
    ['v-lead-name','v-lead-phone','v-lead-email'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    btn.textContent=orig; btn.disabled=false;
    btn.style.background=''; btn.style.borderColor=''; btn.style.color='';
  }, 2500);
}

async function vGerarLink() {
  const name = document.getElementById('v-lead-name')?.value.trim()||'prospect';
  const slug = name.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
  const ref  = Math.random().toString(36).substr(2,8).toUpperCase();
  const url  = window.location.origin+'/plano-'+vSelectedPlan.dur+'?ref='+ref+'&lead='+slug;
  document.getElementById('v-generated-link').textContent = url;
  document.getElementById('v-link-result').style.display = 'block';
}
function vCopyLink() {
  const url = document.getElementById('v-generated-link')?.textContent;
  navigator.clipboard.writeText(url||'').catch(()=>{});
  const btn = document.getElementById('v-copy-btn');
  if (btn) { btn.textContent='✓ Copiado!'; setTimeout(()=>{btn.textContent='Copiar';},2000); }
}

// ── SALES TABLE — vazia até ter dados ───────────────────
function renderSalesTable(data) {
  const el = document.getElementById('v-sales-body');
  if (!el) return;
  if (!data?.length) {
    el.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--dim);padding:20px;font-family:\'DM Mono\',monospace;font-size:10px">Nenhuma venda registrada ainda</td></tr>';
    return;
  }
  const SC = {
    pago:     'background:rgba(74,222,128,0.1);color:var(--green);border:1px solid rgba(74,222,128,0.2)',
    pendente: 'background:rgba(251,191,36,0.1);color:var(--amber);border:1px solid rgba(251,191,36,0.2)',
    cancelled:'background:rgba(248,113,113,0.1);color:var(--red);border:1px solid rgba(248,113,113,0.2)',
  };
  el.innerHTML = data.map(s=>`<tr>
    <td style="font-family:'DM Mono',monospace;font-size:11px;color:var(--silver);padding:9px 10px;border-bottom:1px solid rgba(168,178,189,0.04)">${new Date(s.created_at).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</td>
    <td style="font-family:'DM Mono',monospace;font-size:11px;color:var(--silver);padding:9px 10px;border-bottom:1px solid rgba(168,178,189,0.04)">${s.name||'—'}</td>
    <td style="font-family:'DM Mono',monospace;font-size:11px;color:var(--silver);padding:9px 10px;border-bottom:1px solid rgba(168,178,189,0.04)">${s.plan_name||'—'}</td>
    <td style="font-family:'DM Mono',monospace;font-size:11px;color:var(--silver);padding:9px 10px;border-bottom:1px solid rgba(168,178,189,0.04)">${capitalize(s.channel||'—')}</td>
    <td style="font-family:'DM Mono',monospace;font-size:11px;color:var(--gold);text-align:right;padding:9px 10px;border-bottom:1px solid rgba(168,178,189,0.04)">R$${Math.round(s.price_paid||0)}</td>
    <td style="padding:9px 10px;border-bottom:1px solid rgba(168,178,189,0.04)"><span style="font-family:'DM Mono',monospace;font-size:8px;padding:3px 9px;${SC[s.status]||SC.pago}">${(s.status||'pago').toUpperCase()}</span></td>
  </tr>`).join('');
}

// ── FORMULÁRIO ────────────────────────────────────────────
function updateFormStudentName() {
  const sel  = document.getElementById('studentSelect');
  const name = sel?.value && students[sel.value] ? students[sel.value].name.replace(' ⚠','') : '—';
  ['form-student-name','form-mensal-student-name'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=name;});
  const pendingEl = document.getElementById('form-pending-names');
  if (pendingEl) {
    const atRisk = Object.values(students).filter(s=>s.churnRisk).map(s=>s.name.replace(' ⚠',''));
    pendingEl.textContent = atRisk.length ? atRisk.join(', ')+' — sem resposta esta semana' : 'Todos os alunos em dia ✓';
  }
}

async function enviarFormulario() {
  const sel    = document.getElementById('studentSelect');
  const s      = sel ? students[sel.value] : null;
  const treinos = document.getElementById('f-treinos')?.value.trim();
  const qtd     = getScaleValue('f-qtd-scale');
  if (!treinos) { document.getElementById('f-treinos').style.borderColor='var(--red)'; setTimeout(()=>document.getElementById('f-treinos').style.borderColor='',2000); return; }

  const session    = JSON.parse(localStorage.getItem('mf_user')||'null');
  const personalId = session?.personal_id||session?.id;
  const peso       = parseFloat(document.getElementById('f-peso')?.value)||null;
  const humor      = parseInt(getScaleValue('f-humor-scale'))||3;

  try {
    await api('/checkins', { method:'POST', body:JSON.stringify({
      student_id:   sel?.value,
      personal_id:  personalId,
      type:         'semanal',
      training_feedback: treinos,
      trainings_done:    parseInt(qtd)||0,
      had_pain:          false,
      pain_description:  document.getElementById('f-dor')?.value||null,
      nutrition_notes:   document.getElementById('f-alimentacao')?.value||null,
      mood_score:        humor,
      energy_score:      humor,
      weight_reported:   peso,
      general_notes:     document.getElementById('f-feedback')?.value||null,
    })});
    if (sel?.value) loadStudentCheckins(sel.value);
    const ok = document.getElementById('form-success');
    if (ok) { ok.style.display='block'; setTimeout(()=>ok.style.display='none',4000); }
    limparFormulario();
  } catch(err) { alert('Erro: '+err.message); }
}

function limparFormulario() {
  ['f-treinos','f-dor','f-alimentacao','f-feedback'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const p=document.getElementById('f-peso'); if(p) p.value='';
  ['f-qtd-scale','f-humor-scale'].forEach(id=>document.getElementById(id)?.querySelectorAll('.scale-btn').forEach(b=>b.classList.remove('active')));
}

async function enviarFormularioMensal() {
  const geral = document.getElementById('fm-geral')?.value.trim();
  if (!geral) { document.getElementById('fm-geral').style.borderColor='var(--red)'; setTimeout(()=>document.getElementById('fm-geral').style.borderColor='',2000); return; }
  const btn=document.getElementById('btn-enviar-mensal');
  if(btn){btn.disabled=true;btn.textContent='✓ Enviado!';}
  const ok=document.getElementById('form-mensal-success');
  if(ok){ok.style.display='block';setTimeout(()=>ok.style.display='none',4000);}
  limparFormularioMensal();
  if(btn){setTimeout(()=>{btn.disabled=false;btn.textContent='Enviar Avaliação';},3000);}
}

function limparFormularioMensal() {
  ['fm-geral','fm-resultados','fm-dificuldades','fm-cintura','fm-quadril','fm-peso'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  ['fm-satisfacao-scale','fm-nps-scale'].forEach(id=>document.getElementById(id)?.querySelectorAll('.scale-btn').forEach(b=>b.classList.remove('active')));
}

// ═══════════════════════════════════════════════════════
//  CONFIGURAÇÕES
// ═══════════════════════════════════════════════════════
let cfgPlanos = [];

async function initConfig() {
  const session    = JSON.parse(localStorage.getItem('mf_user')||'null');
  if (!session) return;
  const personalId = session.personal_id||session.id;
  const nomeEl     = document.getElementById('cfg-nome');
  if (nomeEl) nomeEl.value = session.name||'';
  const [planos, alunos] = await Promise.all([
    api('/plans/'+personalId+'?all=true').catch(()=>[]),
    api('/students/'+personalId).catch(()=>[]),
  ]);
  cfgPlanos = planos||[];
  renderPlanosList(cfgPlanos);
  renderAlunosList(alunos||[]);
  populatePlanoSelect(cfgPlanos);
  const inicioEl = document.getElementById('cfg-aluno-inicio');
  if (inicioEl) inicioEl.value = new Date().toISOString().split('T')[0];
}

function renderPlanosList(planos) {
  const el = document.getElementById('cfg-planos-lista');
  if (!el) return;
  if (!planos.length) {
    el.innerHTML = '<div style="font-size:10px;color:var(--dim);padding:20px 0;text-align:center">Nenhum plano cadastrado. Clique em + Novo Plano para começar.</div>';
    return;
  }
  const rows = planos.map(function(p) {
    const dur    = p.duration_months+(p.duration_months===1?' mês':' meses');
    const preco  = 'R$'+parseFloat(p.price_brl).toFixed(2);
    const status = p.is_active
      ? '<span style="font-size:8px;padding:3px 8px;background:rgba(74,222,128,0.1);color:var(--green);border:1px solid rgba(74,222,128,0.2)">ATIVO</span>'
      : '<span style="font-size:8px;padding:3px 8px;background:rgba(168,178,189,0.08);color:var(--dim);border:1px solid rgba(168,178,189,0.1)">INATIVO</span>';
    const editBtn   = '<button data-action="editar" data-id="'+p.id+'" style="font-size:8px;padding:4px 10px;background:transparent;border:1px solid rgba(201,168,76,0.25);color:var(--gold);cursor:pointer;margin-right:6px">Editar</button>';
    const toggleBtn = p.is_active
      ? '<button data-action="desativar" data-id="'+p.id+'" style="font-size:8px;padding:4px 10px;background:transparent;border:1px solid rgba(248,113,113,0.25);color:var(--red);cursor:pointer">Desativar</button>'
      : '<button data-action="ativar" data-id="'+p.id+'" style="font-size:8px;padding:4px 10px;background:transparent;border:1px solid rgba(74,222,128,0.25);color:var(--green);cursor:pointer">Ativar</button>';
    return '<tr><td>'+p.name+'</td><td>'+dur+'</td><td style="text-align:right;color:var(--gold)">'+preco+'</td><td style="text-align:right">'+status+'</td><td style="text-align:right">'+editBtn+toggleBtn+'</td></tr>';
  }).join('');
  el.innerHTML = '<table class="data-table" style="width:100%"><thead><tr><th>Nome</th><th>Duração</th><th style="text-align:right">Preço</th><th style="text-align:right">Status</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>';

  el.addEventListener('click', function(e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id     = btn.dataset.id;
    if (action === 'editar')    editarPlano(id);
    if (action === 'desativar') togglePlanoStatus(id, true);
    if (action === 'ativar')    togglePlanoStatus(id, false);
  }, { once: true });
}

function abrirModalPlano() {
  document.getElementById('cfg-plano-form-title').textContent='NOVO PLANO';
  document.getElementById('cfg-plano-nome').value='';
  document.getElementById('cfg-plano-preco').value='';
  document.getElementById('cfg-plano-duracao').value='6';
  document.getElementById('cfg-plano-id').value='';
  document.getElementById('cfg-plano-ok').style.display='none';
  document.getElementById('cfg-plano-erro').style.display='none';
  document.getElementById('cfg-plano-form').style.display='block';
  document.getElementById('cfg-plano-nome').focus();
}
function fecharModalPlano() {
  document.getElementById('cfg-plano-form').style.display='none';
}
function editarPlano(planId) {
  const p = cfgPlanos.find(p=>p.id===planId);
  if (!p) return;
  document.getElementById('cfg-plano-form-title').textContent='EDITAR PLANO';
  document.getElementById('cfg-plano-nome').value=p.name;
  document.getElementById('cfg-plano-preco').value=p.price_brl;
  document.getElementById('cfg-plano-duracao').value=p.duration_months;
  document.getElementById('cfg-plano-id').value=planId;
  document.getElementById('cfg-plano-ok').style.display='none';
  document.getElementById('cfg-plano-erro').style.display='none';
  document.getElementById('cfg-plano-form').style.display='block';
}
async function salvarPlano() {
  const nome=document.getElementById('cfg-plano-nome').value.trim();
  const dur =parseInt(document.getElementById('cfg-plano-duracao').value);
  const preco=parseFloat(document.getElementById('cfg-plano-preco').value);
  const planId=document.getElementById('cfg-plano-id').value;
  const erroEl=document.getElementById('cfg-plano-erro');
  const okEl  =document.getElementById('cfg-plano-ok');
  erroEl.style.display='none';
  if(!nome){erroEl.textContent='Informe o nome.';erroEl.style.display='block';return;}
  if(!preco||preco<=0){erroEl.textContent='Informe um preço válido.';erroEl.style.display='block';return;}
  const session=JSON.parse(localStorage.getItem('mf_user')||'null');
  const personalId=session&&(session.personal_id||session.id);
  const btn=document.getElementById('cfg-plano-save-btn');
  btn.disabled=true; btn.textContent='Salvando...';
  try {
    if(planId) { await api('/plans/'+planId,{method:'PATCH',body:JSON.stringify({name:nome,duration_months:dur,price_brl:preco})}); }
    else       { await api('/plans',{method:'POST',body:JSON.stringify({personal_id:personalId,name:nome,duration_months:dur,price_brl:preco})}); }
    const planos=await api('/plans/'+personalId+'?all=true').catch(()=>[]);
    cfgPlanos=planos||[];
    renderPlanosList(cfgPlanos);
    populatePlanoSelect(cfgPlanos);
    loadPlansFromAPI(planos.filter(p=>p.is_active));
    okEl.style.display='block';
    setTimeout(()=>{fecharModalPlano();okEl.style.display='none';},2000);
  } catch(err){erroEl.textContent=err.message||'Erro.';erroEl.style.display='block';}
  btn.disabled=false; btn.textContent='Salvar Plano';
}
async function togglePlanoStatus(planId,isActive) {
  try {
    await api('/plans/'+planId,{method:'PATCH',body:JSON.stringify({is_active:!isActive})});
    const session=JSON.parse(localStorage.getItem('mf_user')||'null');
    const planos=await api('/plans/'+(session.personal_id||session.id)+'?all=true').catch(()=>[]);
    cfgPlanos=planos||[]; renderPlanosList(cfgPlanos);
  } catch(err){alert('Erro: '+err.message);}
}
function populatePlanoSelect(planos) {
  const sel=document.getElementById('cfg-aluno-plano');
  if(!sel) return;
  sel.innerHTML='<option value="">Selecione o plano...</option>'
    +planos.filter(p=>p.is_active).map(p=>'<option value="'+p.id+'" data-price="'+p.price_brl+'">'+p.name+' — R$'+parseFloat(p.price_brl).toFixed(0)+'</option>').join('');
}
function toggleCadastroAluno() {
  const form=document.getElementById('cfg-aluno-form');
  form.style.display=form.style.display==='none'?'block':'none';
  if(form.style.display==='block') document.getElementById('cfg-aluno-nome').focus();
}
async function cadastrarAluno() {
  const nome=document.getElementById('cfg-aluno-nome').value.trim();
  const phone=document.getElementById('cfg-aluno-phone').value.trim();
  const email=document.getElementById('cfg-aluno-email').value.trim();
  const canal=document.getElementById('cfg-aluno-canal').value;
  const obj=document.getElementById('cfg-aluno-objetivo').value;
  const planId=document.getElementById('cfg-aluno-plano').value;
  const inicio=document.getElementById('cfg-aluno-inicio').value;
  const pgto=document.getElementById('cfg-aluno-pagamento').value;
  const peso=parseFloat(document.getElementById('cfg-aluno-peso').value)||null;
  const bf=parseFloat(document.getElementById('cfg-aluno-bf').value)||null;
  const obs=document.getElementById('cfg-aluno-obs').value.trim();
  const okEl=document.getElementById('cfg-aluno-ok');
  const erroEl=document.getElementById('cfg-aluno-erro');
  okEl.style.display=erroEl.style.display='none';
  if(!nome){erroEl.textContent='Informe o nome.';erroEl.style.display='block';return;}
  if(!phone){erroEl.textContent='Informe o WhatsApp.';erroEl.style.display='block';return;}
  if(!planId){erroEl.textContent='Selecione um plano.';erroEl.style.display='block';return;}
  if(!inicio){erroEl.textContent='Informe o início.';erroEl.style.display='block';return;}
  const session=JSON.parse(localStorage.getItem('mf_user')||'null');
  const personalId=session&&(session.personal_id||session.id);
  const plano=cfgPlanos.find(p=>p.id===planId);
  const fimDate=new Date(inicio); fimDate.setMonth(fimDate.getMonth()+(plano?.duration_months||1));
  const fim=fimDate.toISOString().split('T')[0];
  const btn=document.querySelector('#cfg-aluno-form button.vbtn-green');
  if(btn){btn.disabled=true;btn.textContent='Cadastrando...';}
  try {
    const aluno=await api('/students',{method:'POST',body:JSON.stringify({personal_id:personalId,name:nome,phone,email:email||null,goal:obj,channel:canal,weight_initial:peso,bf_initial:bf,notes:obs||null})});
    await api('/subscriptions',{method:'POST',body:JSON.stringify({student_id:aluno.id,personal_id:personalId,plan_id:planId,price_paid:plano?.price_brl||0,starts_at:inicio,expires_at:fim,payment_method:pgto,status:'active'})});
    okEl.textContent='✓ '+nome+' cadastrado! Ativo até '+new Date(fim).toLocaleDateString('pt-BR');
    okEl.style.display='block';
    ['cfg-aluno-nome','cfg-aluno-phone','cfg-aluno-email','cfg-aluno-peso','cfg-aluno-bf','cfg-aluno-obs'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    const alunos=await api('/students/'+personalId).catch(()=>[]);
    renderAlunosList(alunos);
    setTimeout(()=>loadDashboard(),1500);
  } catch(err){erroEl.textContent=err.message||'Erro.';erroEl.style.display='block';}
  if(btn){btn.disabled=false;btn.textContent='Cadastrar Aluno';}
}
function renderAlunosList(alunos) {
  const el=document.getElementById('cfg-alunos-lista');
  if(!el) return;
  if(!alunos.length){el.innerHTML='<div style="font-size:10px;color:var(--dim);padding:12px 0">Nenhum aluno cadastrado ainda.</div>';return;}
  const rows=alunos.map(function(a){
    const days=a.days_to_expire;
    const daysColor=days<=7?'var(--red)':days<=30?'var(--amber)':'var(--green)';
    const daysText=days===0?'Hoje':days<0?'Vencido':days+'d';
    const sid=a.id, sname=a.name.replace(/'/g,'\'');
    const renovBtn='<button data-action="renovar" data-id="'+sid+'" data-name="'+sname+'" style="font-size:8px;padding:4px 10px;background:transparent;border:1px solid rgba(201,168,76,0.25);color:var(--gold);cursor:pointer;margin-right:6px">Renovar</button>';
    const encBtn='<button data-action="encerrar" data-id="'+sid+'" data-name="'+sname+'" style="font-size:8px;padding:4px 10px;background:transparent;border:1px solid rgba(248,113,113,0.25);color:var(--red);cursor:pointer">Encerrar</button>';
    return '<tr><td>'+a.name+'</td><td>'+(a.plan_name||'—')+'</td><td style="color:'+daysColor+'">'+daysText+'</td><td style="text-transform:capitalize">'+(a.channel||'—')+'</td><td style="text-align:right;color:var(--gold)">'+fmtBRL(a.ltv_total||0)+'</td><td style="text-align:right;white-space:nowrap">'+renovBtn+encBtn+'</td></tr>';
  }).join('');
  el.innerHTML='<div style="font-size:9px;color:var(--dim);margin-bottom:10px">'+alunos.length+' aluno(s) ativo(s)</div>'
    +'<table class="data-table" style="width:100%"><thead><tr><th>Nome</th><th>Plano</th><th>Vence em</th><th>Canal</th><th style="text-align:right">LTV</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>'
    +'<div id="cfg-renov-form" style="display:none;margin-top:16px;padding:16px;background:rgba(201,168,76,0.04);border:1px solid rgba(201,168,76,0.15)">'
      +'<div style="font-family:\'DM Mono\',monospace;font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:var(--gold);margin-bottom:12px">RENOVAR CONTRATO — <span id="cfg-renov-name"></span></div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
        +'<div class="v-field"><label class="v-label">Novo plano *</label>'
          +'<select class="v-select" id="cfg-renov-plano"></select></div>'
        +'<div class="v-field"><label class="v-label">Data de início *</label>'
          +'<input class="v-input" id="cfg-renov-inicio" type="date" /></div>'
      +'</div>'
      +'<div style="display:flex;gap:10px;margin-top:12px">'
        +'<button class="vbtn vbtn-gold" onclick="confirmarRenovacao()">Confirmar Renovação</button>'
        +'<button class="vbtn" style="background:transparent;border:1px solid var(--dim);color:var(--dim)" onclick="fecharRenovacao()">Cancelar</button>'
      +'</div>'
      +'<div id="cfg-renov-ok" style="display:none;margin-top:10px;font-family:\'DM Mono\',monospace;font-size:10px;color:var(--green)"></div>'
      +'<div id="cfg-renov-erro" style="display:none;margin-top:10px;font-family:\'DM Mono\',monospace;font-size:10px;color:var(--red)"></div>'
      +'<input type="hidden" id="cfg-renov-student-id" />'
    +'</div>';

  // Event delegation — handles dynamically generated buttons
  el.addEventListener('click', function(e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id     = btn.dataset.id;
    const name   = btn.dataset.name;
    if (action === 'renovar')  abrirRenovacao(id, name);
    if (action === 'encerrar') encerrarContrato(id, name);
  }, { once: true });
}

function abrirRenovacao(studentId, name) {
  const form = document.getElementById('cfg-renov-form');
  if (!form) return;
  document.getElementById('cfg-renov-name').textContent = name;
  document.getElementById('cfg-renov-student-id').value = studentId;
  document.getElementById('cfg-renov-inicio').value = new Date().toISOString().split('T')[0];
  document.getElementById('cfg-renov-ok').style.display   = 'none';
  document.getElementById('cfg-renov-erro').style.display = 'none';
  // Populate plan select
  const sel = document.getElementById('cfg-renov-plano');
  sel.innerHTML = cfgPlanos.filter(p=>p.is_active).map(p =>
    '<option value="'+p.id+'" data-months="'+p.duration_months+'">'+p.name+' — R$'+parseFloat(p.price_brl).toFixed(0)+'</option>'
  ).join('');
  form.style.display = 'block';
  form.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function fecharRenovacao() {
  const form = document.getElementById('cfg-renov-form');
  if (form) form.style.display = 'none';
}

async function confirmarRenovacao() {
  const studentId = document.getElementById('cfg-renov-student-id').value;
  const planId    = document.getElementById('cfg-renov-plano').value;
  const inicio    = document.getElementById('cfg-renov-inicio').value;
  const okEl      = document.getElementById('cfg-renov-ok');
  const erroEl    = document.getElementById('cfg-renov-erro');
  okEl.style.display = erroEl.style.display = 'none';

  if (!planId) { erroEl.textContent='Selecione um plano.'; erroEl.style.display='block'; return; }
  if (!inicio) { erroEl.textContent='Informe a data de início.'; erroEl.style.display='block'; return; }

  const session    = JSON.parse(localStorage.getItem('mf_user')||'null');
  const personalId = session&&(session.personal_id||session.id);
  const plano      = cfgPlanos.find(p=>p.id===planId);
  const meses      = plano ? plano.duration_months : 1;
  const fimDate    = new Date(inicio);
  fimDate.setMonth(fimDate.getMonth() + meses);
  const fim = fimDate.toISOString().split('T')[0];

  try {
    await api('/subscriptions', { method:'POST', body:JSON.stringify({
      student_id:     studentId,
      personal_id:    personalId,
      plan_id:        planId,
      price_paid:     plano ? plano.price_brl : 0,
      starts_at:      inicio,
      expires_at:     fim,
      payment_method: 'pix',
      status:         'active',
    })});

    okEl.textContent = '✓ Renovado! Novo vencimento: ' + new Date(fim).toLocaleDateString('pt-BR');
    okEl.style.display = 'block';

    // Recarrega lista após 1.5s
    setTimeout(async () => {
      const alunos = await api('/students/'+personalId).catch(()=>[]);
      renderAlunosList(alunos);
      loadDashboard();
    }, 1500);

  } catch(err) {
    erroEl.textContent = err.message || 'Erro ao renovar.';
    erroEl.style.display = 'block';
  }
}

async function encerrarContrato(studentId,name){
  if(!confirm('Encerrar contrato de '+name+'?')) return;
  try {
    await api('/students/'+studentId+'/cancel',{method:'POST'});
    const session=JSON.parse(localStorage.getItem('mf_user')||'null');
    const alunos=await api('/students/'+(session.personal_id||session.id)).catch(()=>[]);
    renderAlunosList(alunos); loadDashboard();
  } catch(err){alert('Erro: '+err.message);}
}
function salvarPerfil(){
  const nome=document.getElementById('cfg-nome').value.trim();
  const okEl=document.getElementById('cfg-perfil-ok');
  if(!nome) return;
  const session=JSON.parse(localStorage.getItem('mf_user')||'null');
  if(session){session.name=nome;localStorage.setItem('mf_user',JSON.stringify(session));}
  const h1=document.getElementById('dash-user-h1');
  if(h1) h1.innerHTML=nome+' — <em>Personal Trainer</em>';
  const nameEl=document.getElementById('dash-user-name');
  if(nameEl) nameEl.textContent=nome;
  okEl.style.display='block';
  setTimeout(()=>okEl.style.display='none',2500);
}


// ── GERAR LINK DE FORMULÁRIO ─────────────────────────────
async function gerarLinkFormulario(tipo) {
  const sel        = document.getElementById('studentSelect');
  const studentId  = sel?.value;
  const session    = JSON.parse(localStorage.getItem('mf_user')||'null');
  const personalId = session?.personal_id || session?.id;
  if (!studentId) { alert('Selecione um aluno primeiro.'); return; }

  const btn = document.getElementById('btn-gerar-link-' + tipo);
  if (btn) { btn.disabled=true; btn.textContent='Gerando...'; }

  try {
    const res = await api('/form/generate', { method:'POST', body:JSON.stringify({
      student_id: studentId, personal_id: personalId, type: tipo
    })});
    const url = window.location.origin + '/form/' + res.token;
    navigator.clipboard.writeText(url).catch(()=>{});
    const resultEl = document.getElementById('form-link-result');
    const urlEl    = document.getElementById('form-link-url');
    if (urlEl)    urlEl.textContent = url;
    if (resultEl) resultEl.style.display = 'block';
  } catch(err) {
    alert('Erro ao gerar link: ' + err.message);
  }
  if (btn) { btn.disabled=false; btn.textContent='Gerar Link ' + tipo.charAt(0).toUpperCase() + tipo.slice(1); }
}

function copyFormLink() {
  const url = document.getElementById('form-link-url')?.textContent;
  navigator.clipboard.writeText(url||'').catch(()=>{});
  const btn = document.getElementById('btn-copy-form-link');
  if (btn) { btn.textContent='✓ Copiado!'; setTimeout(()=>btn.textContent='Copiar',2000); }
}

// ── INIT ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => { loadDashboard(); });