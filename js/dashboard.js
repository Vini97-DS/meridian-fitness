// ═══════════════════════════════════════════════════════
//  dashboard.js — Dados mock + gráficos + interações
//  Quando Supabase estiver pronto: substituir os blocos
//  de DATA MOCK por chamadas à API (marcados com ── API ──)
// ═══════════════════════════════════════════════════════

// ── CHART DEFAULTS ──────────────────────────────────────
const C = {
  gold:   '#C9A84C', silver: '#A8B5C4', dim: '#3D5068',
  green:  '#47D98A', red:   '#F4706A', amber: '#F5BE45',
  blue:   '#5BAAF5', navy:  '#07111D', navy2: '#0C1C2E',
};
const gridLine  = { color: 'rgba(168,181,196,0.06)', drawBorder: false };
const tooltip   = {
  backgroundColor: 'rgba(7,17,29,0.95)',
  borderColor: 'rgba(201,168,76,0.2)', borderWidth: 1,
  titleColor: C.silver, bodyColor: C.gold, padding: 10,
  titleFont: { family: 'DM Mono, monospace', size: 9 },
  bodyFont:  { family: 'DM Mono, monospace', size: 11 },
};
Chart.defaults.color = C.silver;
Chart.defaults.font.family = 'DM Mono, monospace';
Chart.defaults.maintainAspectRatio = false;

// ═══════════════════════════════════════════════════════
//  DATA MOCK — substituir por fetch Supabase depois
// ═══════════════════════════════════════════════════════

// ── API: SELECT * FROM mrr_monthly ORDER BY month ──
const DATA_MRR = {
  labels: ['Jan25','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez','Jan26','Fev','Mar','Abr','Mai'],
  values: [56600,58200,61400,63800,67200,69400,71800,73200,75400,78800,81200,83600,85000,86400,87200,86000,89400],
};

// ── API: SELECT * FROM student_counts ORDER BY month ──
const DATA_STUDENTS = {
  labels: ['Jan25','Mar','Mai','Jul','Set','Nov','Jan26','Mar','Mai'],
  new_:   [38,44,48,52,47,43,51,49,48],
  churn:  [-24,-28,-30,-33,-31,-29,-34,-32,-33],
};

// ── API: SELECT channel, count, avg_ltv FROM students GROUP BY channel ──
const DATA_CHANNEL = {
  labels: ['Instagram','Indicação','YouTube','TikTok','Google','Outros'],
  alunos: [180,92,68,44,18,8],
  ltv:    [1340,2180,1680,1120,980,820],
};

// ── API: SELECT plan_type, renewal_rate FROM plans ──
const DATA_RENEWAL = {
  labels: ['Plano 1m','Plano 3m','Plano 6m','Plano 12m'],
  values: [52,68,82,91],
};

// ── API: SELECT channel, investment, revenue FROM roi_monthly WHERE month = current ──
const DATA_ROI = {
  labels: ['Jan/26','Fev','Mar','Abr','Mai'],
  invest: [14200,14800,15100,15600,15400],
  receita:[85000,86400,87200,86000,89400],
  roi:    [499,484,477,451,482],
};

// ── API: SELECT * FROM churn_risk ORDER BY risk_score DESC LIMIT 6 ──
const DATA_CHURN = [
  { initials:'FM', name:'Felipe Martins',   detail:'Sem check-in há 28 dias · Plano 3m vence em 4 dias', level:'high' },
  { initials:'AC', name:'Amanda Costa',     detail:'Sem check-in há 22 dias · Plano 1m renovado só 2×',  level:'high' },
  { initials:'RS', name:'Rodrigo Santana',  detail:'Frequência caiu 5×→1×/semana · 14 dias sem login',   level:'high' },
  { initials:'LF', name:'Larissa Ferreira', detail:'Plano vence em 12 dias · frequência irregular',       level:'med'  },
  { initials:'TN', name:'Thiago Novaes',    detail:'Acesso caiu 80% · plano 6m vence em 18 dias',        level:'med'  },
  { initials:'MS', name:'Marina Souza',     detail:'Nota última avaliação: 3/5 · mencionou dificuldades', level:'med'  },
];

// ── API: SELECT * FROM students ORDER BY ltv_total DESC LIMIT 10 ──
const DATA_TOP = [
  { rank:1, name:'Beatriz Tavares',   plan:'12m', time:'38 meses', channel:'Indicação', ltv:'R$10.146', ticket:'R$267', renov:'3×' },
  { rank:2, name:'Eduardo Campos',    plan:'12m', time:'34 meses', channel:'Instagram', ltv:'R$9.078',  ticket:'R$267', renov:'2×' },
  { rank:3, name:'Fernanda Leal',     plan:'6m',  time:'29 meses', channel:'YouTube',   ltv:'R$6.873',  ticket:'R$237', renov:'4×' },
  { rank:4, name:'Guilherme Braga',   plan:'6m',  time:'27 meses', channel:'Indicação', ltv:'R$6.399',  ticket:'R$237', renov:'3×' },
  { rank:5, name:'Isabela Nunes',     plan:'3m',  time:'24 meses', channel:'Instagram', ltv:'R$4.728',  ticket:'R$197', renov:'7×' },
  { rank:6, name:'Juliana Rocha',     plan:'12m', time:'22 meses', channel:'TikTok',    ltv:'R$4.674',  ticket:'R$267', renov:'1×' },
  { rank:7, name:'Lucas Mendes',      plan:'6m',  time:'20 meses', channel:'Indicação', ltv:'R$4.740',  ticket:'R$237', renov:'2×' },
  { rank:8, name:'Natália Oliveira',  plan:'3m',  time:'18 meses', channel:'Instagram', ltv:'R$3.546',  ticket:'R$197', renov:'5×' },
  { rank:9, name:'Pedro Viana',       plan:'6m',  time:'16 meses', channel:'YouTube',   ltv:'R$3.792',  ticket:'R$237', renov:'1×' },
  { rank:10,name:'Renata Castro',     plan:'12m', time:'14 meses', channel:'Indicação', ltv:'R$3.738',  ticket:'R$267', renov:'1×' },
];

// ── API: SELECT * FROM pipeline_leads ORDER BY updated_at DESC ──
const DATA_PIPELINE = {
  novo:     [
    { name:'Camila Torres',    detail:'Instagram · Emagrecimento', val:'—',             days:'Hoje' },
    { name:'Pedro Araújo',     detail:'Indicação · Hipertrofia',   val:'—',             days:'Hoje' },
    { name:'Letícia Maia',     detail:'TikTok · Saúde geral',      val:'—',             days:'1d'   },
  ],
  contato:  [
    { name:'Ana Beatriz S.',   detail:'YouTube · Condicionamento',  val:'Plano 3m · R$591',   days:'2d' },
    { name:'Diego Lima',       detail:'Instagram · Emagrecimento',  val:'Plano 6m · R$1.422', days:'3d' },
  ],
  proposta: [
    { name:'Mariana Fonseca',  detail:'Indicação · Hipertrofia',    val:'Plano 12m · R$3.204',days:'1d', hot:true },
    { name:'Vinícius Prado',   detail:'Instagram · Emagrecimento',  val:'Plano 6m · R$1.422', days:'2d', hot:true },
  ],
  fechado:  [
    { name:'Roberta Coelho',   detail:'Indicação · Emagrecimento',  val:'Plano 6m · R$1.422 ✓', days:'Hoje', ok:true },
    { name:'Carlos Henrique',  detail:'YouTube · Condicionamento',  val:'Plano 12m · R$3.204 ✓',days:'1d',  ok:true },
  ],
  perdido:  [
    { name:'Fernanda C.',      detail:'Preço acima do budget',      val:'Plano 6m · perdido', days:'3d', lost:true },
    { name:'Tiago Ramos',      detail:'Sem resposta após 5d',       val:'Plano 1m · perdido', days:'5d', lost:true },
  ],
};

// ── API: SELECT * FROM sales ORDER BY date DESC LIMIT 10 ──
const DATA_SALES = [
  { date:'03/05', name:'Roberta Coelho',   plan:'6m',  channel:'Indicação', value:'R$1.422', status:'pago'      },
  { date:'02/05', name:'Carlos Henrique',  plan:'12m', channel:'YouTube',   value:'R$3.204', status:'pago'      },
  { date:'02/05', name:'Alessandra Kim',   plan:'3m',  channel:'Instagram', value:'R$591',   status:'pago'      },
  { date:'01/05', name:'Bruno Castilho',   plan:'6m',  channel:'Indicação', value:'R$1.422', status:'pendente'  },
  { date:'30/04', name:'Priscila Neves',   plan:'1m',  channel:'TikTok',    value:'R$147',   status:'pago'      },
  { date:'29/04', name:'Marcos Vieira',    plan:'12m', channel:'Instagram', value:'R$3.204', status:'pago'      },
  { date:'28/04', name:'Simone Alves',     plan:'6m',  channel:'Indicação', value:'R$1.422', status:'pago'      },
  { date:'27/04', name:'Renato Costa',     plan:'3m',  channel:'Google',    value:'R$591',   status:'cancelado' },
  { date:'26/04', name:'Tatiana Moura',    plan:'12m', channel:'Instagram', value:'R$3.204', status:'pago'      },
  { date:'25/04', name:'Henrique Lins',    plan:'6m',  channel:'YouTube',   value:'R$1.422', status:'pago'      },
];

// ── API: SELECT * FROM students WHERE id = :id ──
const DATA_STUDENTS_DETAIL = [
  {
    id:'beatriz', initials:'BT', name:'Beatriz Tavares',
    time:'38 meses', plan:'12m · R$267/mês', channel:'Indicação', ltv:'R$10.146',
    freq:'94%', engagement:'8.9/10', satisfaction:'4.7/5', referrals:'3 indicações',
    weightStart:74.2, weightMid:68.5, weightNow:62.1,
    bfStart:28, bfNow:18, goalPct:76, engagementNum:89,
    weightHistory:{ labels:['Jun23','Set','Dez','Mar24','Jun','Set','Dez','Mar25','Jun','Set','Dez','Mar26','Mai26'], weight:[74.2,71.8,68.5,66.2,64.8,63.7,63,62.8,62.4,62.2,62,62.1,62.1], bf:[28,25.5,23,21.2,20.1,19.4,18.8,18.5,18.3,18.1,18,18,18] },
    freqHistory:[5,4,5,5,3,5,4,5,5,4,5,5,3,5,5,4,5,5,5,4],
    timeline:[
      { dot:'green', date:'Abr 2026', title:'🏆 PR histórico: agachamento 52kg', desc:'Evolução de 34kg no início para 52kg.' },
      { dot:'green', date:'Mar 2026', title:'📸 Avaliação Q1 — meta 76% atingida', desc:'Peso: 62.1kg · BF: 18% · fase 3 iniciada.' },
      { dot:'blue',  date:'Jan 2026', title:'🔄 3ª renovação · upgrade plano 12m', desc:'Upgrade espontâneo do plano 6m para 12m.' },
      { dot:'',      date:'Set 2025', title:'👥 Indicou 3 amigas — todas ativas', desc:'Natália, Camila e Fernanda. Todas ativas hoje.' },
      { dot:'amber', date:'Jun 2025', title:'⚠ Período difícil — frequência caiu', desc:'Intervenção via mensagem recuperou engajamento.' },
      { dot:'green', date:'Jun 2023', title:'🚀 Início — 74.2kg · BF 28%', desc:'Entrou via indicação. Objetivo: emagrecer.' },
    ],
    responses:[
      { date:'28/04/26', stars:5, summary:'Treinos ótimos, energia alta', tag:'ÓTIMO', fields:[
        { label:'Como foi a semana?', val:'Semana incrível! Completei todos os 5 treinos.' },
        { label:'Dores ou desconfortos?', val:'Nenhuma dor. Leve fadiga pós-leg, sumiu em 24h.' },
        { label:'Alimentação', val:'Seguindo o plano. Um jantar fora na sexta, compensei no sábado.' },
        { label:'Humor (1–5)', val:'5/5 — Muito disposta e motivada!' },
      ]},
      { date:'21/04/26', stars:4, summary:'Boa semana, perdi 1 treino', tag:'BOM', fields:[
        { label:'Como foi a semana?', val:'Fiz 4 de 5 treinos. Reunião atrapalhou na quarta.' },
        { label:'Dores ou desconfortos?', val:'Leve tranco no joelho. Passou no dia seguinte.' },
        { label:'Humor (1–5)', val:'4/5' },
      ]},
      { date:'14/04/26', stars:3, summary:'Semana difícil, trabalho pesado', tag:'REGULAR', fields:[
        { label:'Como foi a semana?', val:'Só 3 treinos. Semana de entrega no trabalho.' },
        { label:'Dores ou desconfortos?', val:'Dor nas costas por ficar sentada. Nada muscular.' },
        { label:'Humor (1–5)', val:'3/5 — Estressada mas tentando.' },
      ]},
    ],
  },
  {
    id:'felipe', initials:'FM', name:'Felipe Martins ⚠',
    time:'7 meses', plan:'3m · R$197/mês', channel:'Instagram', ltv:'R$1.379',
    freq:'18%', engagement:'1.9/10', satisfaction:'2.1/5', referrals:'0',
    weightStart:92, weightMid:89, weightNow:88,
    bfStart:32, bfNow:31, goalPct:8, engagementNum:19,
    weightHistory:{ labels:['Out25','Nov','Dez','Jan26','Fev','Mar','Abr','Mai'], weight:[92,91,89.5,89,88.8,88.5,88.2,88], bf:[32,31.8,31.5,31.4,31.2,31.1,31,31] },
    freqHistory:[4,3,2,2,1,1,1,0,1,0,1,1,0,1,0,1,0,0,1,0],
    timeline:[
      { dot:'amber', date:'Mai 2026', title:'⚠ Risco de churn crítico', desc:'Sem check-in há 28 dias. Plano vence em 4 dias.' },
      { dot:'amber', date:'Mar 2026', title:'📉 Frequência em queda', desc:'Caiu de 4 treinos para 1 treino por semana.' },
      { dot:'green', date:'Out 2025', title:'🚀 Início — 92kg · BF 32%', desc:'Entrou via Instagram. Objetivo: emagrecer.' },
    ],
    responses:[
      { date:'07/04/26', stars:2, summary:'Semana horrível, não consegui treinar', tag:'RUIM', fields:[
        { label:'Como foi a semana?', val:'Não consegui treinar. Muito trabalho.' },
        { label:'Humor (1–5)', val:'2/5 — Desmotivado.' },
      ]},
    ],
  },
];

// ═══════════════════════════════════════════════════════
//  CHARTS
// ═══════════════════════════════════════════════════════

let charts = {};

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

function initBICharts() {
  // MRR
  destroyChart('mrr');
  charts.mrr = new Chart(document.getElementById('chart-mrr'), {
    type: 'line',
    data: {
      labels: DATA_MRR.labels,
      datasets: [{ label:'MRR (R$)', data: DATA_MRR.values,
        borderColor: C.gold, backgroundColor: 'rgba(201,168,76,0.08)',
        fill: true, tension: 0.4, borderWidth: 2.5,
        pointRadius: 3, pointBackgroundColor: C.gold }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend:{display:false}, tooltip:{...tooltip, callbacks:{ label: ctx=>`R$ ${ctx.parsed.y.toLocaleString()}` }} },
      scales: {
        x: { grid:{display:false}, ticks:{color:C.dim, font:{size:8}} },
        y: { grid:gridLine, ticks:{color:C.silver, callback:v=>'R$'+(v/1000).toFixed(0)+'K'} }
      }
    }
  });

  // Alunos
  destroyChart('students');
  charts.students = new Chart(document.getElementById('chart-students'), {
    type: 'bar',
    data: {
      labels: DATA_STUDENTS.labels,
      datasets: [
        { label:'Novos', data:DATA_STUDENTS.new_, backgroundColor:'rgba(71,217,138,0.4)', borderColor:C.green, borderWidth:1.5, borderRadius:3, stack:'s' },
        { label:'Churn', data:DATA_STUDENTS.churn, backgroundColor:'rgba(244,112,106,0.35)', borderColor:C.red, borderWidth:1.5, borderRadius:3, stack:'s' },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend:{labels:{color:C.silver, usePointStyle:true, font:{size:9}}}, tooltip:{...tooltip} },
      scales: {
        x: { grid:{display:false}, ticks:{color:C.dim, font:{size:8}}, stacked:true },
        y: { grid:gridLine, stacked:true, ticks:{color:C.silver} }
      }
    }
  });

  // Canal
  destroyChart('channel');
  charts.channel = new Chart(document.getElementById('chart-channel'), {
    type: 'bar',
    data: {
      labels: DATA_CHANNEL.labels,
      datasets: [
        { label:'Alunos', data:DATA_CHANNEL.alunos, backgroundColor:C.gold+'66', borderColor:C.gold, borderWidth:1.5, borderRadius:3, yAxisID:'y' },
        { label:'LTV Médio (R$)', data:DATA_CHANNEL.ltv, backgroundColor:C.blue+'44', borderColor:C.blue, borderWidth:1.5, borderRadius:3, yAxisID:'y2' },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend:{labels:{color:C.silver, usePointStyle:true, font:{size:9}}}, tooltip:{...tooltip} },
      scales: {
        x: { grid:{display:false}, ticks:{color:C.dim, font:{size:9}} },
        y:  { grid:gridLine, ticks:{color:C.gold, font:{size:9}}, title:{display:true, text:'Alunos', color:C.gold, font:{size:9}} },
        y2: { position:'right', grid:{display:false}, ticks:{color:C.blue, font:{size:9}, callback:v=>'R$'+v}, title:{display:true, text:'LTV', color:C.blue, font:{size:9}} }
      }
    }
  });

  // Renovação
  destroyChart('renewal');
  charts.renewal = new Chart(document.getElementById('chart-renewal'), {
    type: 'bar',
    data: {
      labels: DATA_RENEWAL.labels,
      datasets: [{ label:'Renovação %', data:DATA_RENEWAL.values,
        backgroundColor:[C.red+'55',C.amber+'55',C.gold+'55',C.green+'55'],
        borderColor:[C.red,C.amber,C.gold,C.green], borderWidth:1.5, borderRadius:4 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend:{display:false}, tooltip:{...tooltip, callbacks:{label:ctx=>`${ctx.parsed.y}% renovação`}} },
      scales: {
        x: { grid:{display:false}, ticks:{color:C.dim, font:{size:9}} },
        y: { grid:gridLine, ticks:{color:C.silver, callback:v=>v+'%'}, suggestedMin:40, suggestedMax:100 }
      }
    }
  });

  // ROI
  destroyChart('roi');
  charts.roi = new Chart(document.getElementById('chart-roi'), {
    type: 'bar',
    data: {
      labels: DATA_ROI.labels,
      datasets: [
        { label:'Investimento (R$)', data:DATA_ROI.invest, backgroundColor:C.red+'44', borderColor:C.red, borderWidth:1.5, borderRadius:3, yAxisID:'y' },
        { label:'Receita (R$)',      data:DATA_ROI.receita, backgroundColor:C.green+'44', borderColor:C.green, borderWidth:1.5, borderRadius:3, yAxisID:'y' },
        { label:'ROI %',             data:DATA_ROI.roi, type:'line', borderColor:C.gold, backgroundColor:'transparent', borderWidth:2.5, pointRadius:4, pointBackgroundColor:C.gold, yAxisID:'y2' },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode:'index', intersect:false },
      plugins: { legend:{labels:{color:C.silver, usePointStyle:true, font:{size:9}}}, tooltip:{...tooltip} },
      scales: {
        x:  { grid:{display:false}, ticks:{color:C.dim, font:{size:9}} },
        y:  { grid:gridLine, ticks:{color:C.silver, callback:v=>'R$'+(v/1000).toFixed(0)+'K'} },
        y2: { position:'right', grid:{display:false}, ticks:{color:C.gold, callback:v=>v+'%'}, suggestedMin:400 }
      }
    }
  });
}

// ═══════════════════════════════════════════════════════
//  RENDERIZAÇÃO DE COMPONENTES
// ═══════════════════════════════════════════════════════

function renderChurnList() {
  const el = document.getElementById('churn-list');
  if (!el) return;
  el.innerHTML = DATA_CHURN.map(c => `
    <div class="churn-item">
      <div class="churn-avatar">${c.initials}</div>
      <div>
        <div class="churn-name">${c.name}</div>
        <div class="churn-detail">${c.detail}</div>
      </div>
      <div class="churn-badge ${c.level}">${c.level === 'high' ? 'CRÍTICO' : 'MÉDIO'}</div>
    </div>
  `).join('');
}

function renderTopTable() {
  const el = document.getElementById('table-top-students');
  if (!el) return;
  el.innerHTML = `
    <thead>
      <tr>
        <th>#</th><th>Nome</th><th>Plano</th><th>Tempo</th>
        <th>Canal</th><th style="text-align:right">LTV</th>
        <th style="text-align:right">Ticket</th><th style="text-align:right">Renovações</th>
      </tr>
    </thead>
    <tbody>
      ${DATA_TOP.map(r=>`
        <tr>
          <td class="num">${r.rank}</td>
          <td>${r.name}</td><td>${r.plan}</td><td>${r.time}</td>
          <td>${r.channel}</td><td class="num">${r.ltv}</td>
          <td class="num">${r.ticket}</td><td class="num">${r.renov}</td>
        </tr>
      `).join('')}
    </tbody>
  `;
}

function renderKanban() {
  const board = document.getElementById('kanban-board');
  if (!board) return;
  const cols = [
    { key:'novo',     label:'Novo',     color:C.blue,   count: DATA_PIPELINE.novo.length },
    { key:'contato',  label:'Contato',  color:'#9B7EF4', count: DATA_PIPELINE.contato.length },
    { key:'proposta', label:'Proposta', color:C.amber,  count: DATA_PIPELINE.proposta.length },
    { key:'fechado',  label:'Fechado',  color:C.green,  count: DATA_PIPELINE.fechado.length },
    { key:'perdido',  label:'Perdido',  color:C.red,    count: DATA_PIPELINE.perdido.length },
  ];
  board.innerHTML = cols.map(col => `
    <div class="kanban-col">
      <div class="kanban-col-head">
        <span class="kanban-col-title">${col.label}</span>
        <span class="kanban-count" style="background:${col.color}22;color:${col.color}">${col.count}</span>
      </div>
      ${DATA_PIPELINE[col.key].map(c=>`
        <div class="kanban-card" style="${c.hot?'border-color:rgba(245,190,69,0.25)':''} ${c.ok?'border-color:rgba(71,217,138,0.2)':''} ${c.lost?'opacity:0.6':''}" >
          <div class="kanban-card-name">${c.name}</div>
          <div class="kanban-card-detail">${c.detail}</div>
          ${c.val !== '—' ? `<div class="kanban-card-val" style="${c.ok?'color:var(--green)':''} ${c.lost?'color:var(--red)':''}">${c.val}</div>` : ''}
          <div class="kanban-card-days">${c.days}</div>
        </div>
      `).join('')}
    </div>
  `).join('');
}

function renderSalesTable() {
  const el = document.getElementById('table-sales');
  if (!el) return;
  el.innerHTML = `
    <thead>
      <tr><th>Data</th><th>Aluno</th><th>Plano</th><th>Canal</th><th style="text-align:right">Valor</th><th>Status</th></tr>
    </thead>
    <tbody>
      ${DATA_SALES.map(s=>`
        <tr>
          <td>${s.date}</td><td>${s.name}</td><td>${s.plan}</td>
          <td>${s.channel}</td><td class="num">${s.value}</td>
          <td><span class="status ${s.status}">${s.status.toUpperCase()}</span></td>
        </tr>
      `).join('')}
    </tbody>
  `;
}

function renderStudentSelect() {
  const sel = document.getElementById('student-select');
  if (!sel) return;
  sel.innerHTML = DATA_STUDENTS_DETAIL.map(s=>
    `<option value="${s.id}">${s.name} · ${s.plan}</option>`
  ).join('');
}

function loadStudent() {
  const id = document.getElementById('student-select')?.value;
  const s  = DATA_STUDENTS_DETAIL.find(x=>x.id===id);
  if (!s) return;

  // header
  document.getElementById('st-avatar').textContent = s.initials;
  document.getElementById('st-name').textContent   = s.name;
  document.getElementById('st-meta').innerHTML = `
    <span>Aluno há <strong style="color:var(--gold)">${s.time}</strong></span>
    <span>Plano <strong style="color:var(--gold)">${s.plan}</strong></span>
    <span>Canal <strong style="color:var(--gold)">${s.channel}</strong></span>
    <span>LTV <strong style="color:var(--gold)">${s.ltv}</strong></span>
  `;
  document.getElementById('st-kpis').innerHTML = [
    { val:s.freq,         label:'Freq. Treino' },
    { val:s.engagement,   label:'Engajamento'  },
    { val:s.satisfaction, label:'Satisfação'   },
    { val:s.referrals,    label:'Indicações'   },
  ].map(k=>`
    <div style="text-align:center">
      <div style="font-family:var(--font-display);font-size:1.35rem;font-weight:300;color:var(--gold)">${k.val}</div>
      <div style="font-family:var(--font-mono);font-size:8px;text-transform:uppercase;letter-spacing:.1em;color:var(--dim);margin-top:2px">${k.label}</div>
    </div>
  `).join('');

  // fotos
  const photos = document.getElementById('photo-compare');
  if (photos) photos.innerHTML = [
    { date:'Início', weight:s.weightStart, color:'var(--silver)' },
    { date:'6 Meses', weight:s.weightMid,   color:'var(--amber)' },
    { date:'Atual',   weight:s.weightNow,   color:'var(--green)' },
  ].map((p,i)=>`
    <div class="photo-card">
      <div class="photo-placeholder">
        <div class="photo-icon">📷</div>
        <div class="photo-date">${p.date.toUpperCase()}</div>
        <div style="font-family:var(--font-mono);font-size:9px;color:var(--dim);z-index:1">${p.weight} kg</div>
      </div>
      <div class="photo-footer">
        <span class="photo-footer-label">${p.date}</span>
        <span class="photo-footer-val" style="color:${p.color}">${p.weight} kg</span>
      </div>
    </div>
  `).join('');

  // progress bars
  const wLost = (s.weightStart - s.weightNow).toFixed(1);
  const bfLost = s.bfStart - s.bfNow;
  document.getElementById('st-weight-lost').textContent = `−${wLost} kg`;
  document.getElementById('st-bf-lost').textContent     = `−${bfLost} pp`;
  document.getElementById('st-goal-pct').textContent    = `${s.goalPct}%`;
  document.getElementById('st-engagement').textContent  = `${(s.engagementNum/10).toFixed(1)}/10`;
  const wPct  = Math.min(100, (wLost / 15 * 100)).toFixed(0);
  const bfPct = Math.min(100, (bfLost / 15 * 100)).toFixed(0);
  setTimeout(()=>{
    document.getElementById('pb-weight').style.width     = wPct+'%';
    document.getElementById('pb-bf').style.width         = bfPct+'%';
    document.getElementById('pb-goal').style.width       = s.goalPct+'%';
    document.getElementById('pb-engagement').style.width = s.engagementNum+'%';
  }, 100);

  // weight chart
  destroyChart('weight');
  charts.weight = new Chart(document.getElementById('chart-weight'), {
    type:'line',
    data:{ labels:s.weightHistory.labels, datasets:[
      { label:'Peso (kg)', data:s.weightHistory.weight, borderColor:C.gold, backgroundColor:'rgba(201,168,76,0.06)', fill:true, tension:0.4, borderWidth:2.5, pointRadius:4, pointBackgroundColor:C.gold, yAxisID:'y' },
      { label:'BF %',      data:s.weightHistory.bf,     borderColor:C.green, backgroundColor:'rgba(71,217,138,0.04)', fill:true, tension:0.4, borderWidth:1.5, pointRadius:3, pointBackgroundColor:C.green, borderDash:[4,3], yAxisID:'y2' },
    ]},
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{legend:{labels:{color:C.silver,usePointStyle:true,font:{size:9}}}, tooltip:{...tooltip}},
      scales:{
        x:  {grid:{display:false},ticks:{color:C.dim,font:{size:8},maxRotation:45}},
        y:  {grid:gridLine,ticks:{color:C.gold,font:{size:9},callback:v=>v+'kg'},suggestedMin:55},
        y2: {position:'right',grid:{display:false},ticks:{color:C.green,font:{size:9},callback:v=>v+'%'},suggestedMin:10}
      }
    }
  });

  // freq chart
  const fWeeks = s.freqHistory.map((_,i)=>`Sem ${i+1}`);
  destroyChart('freq');
  charts.freq = new Chart(document.getElementById('chart-freq'), {
    type:'bar',
    data:{ labels:fWeeks, datasets:[
      { label:'Treinos', data:s.freqHistory, backgroundColor:s.freqHistory.map(v=>v>=5?C.green+'66':v>=4?C.gold+'66':C.amber+'55'), borderColor:s.freqHistory.map(v=>v>=5?C.green:v>=4?C.gold:C.amber), borderWidth:1.5, borderRadius:3 },
      { label:'Meta',    data:Array(s.freqHistory.length).fill(5), type:'line', borderColor:C.silver+'44', borderDash:[4,3], pointRadius:0, borderWidth:1.5 }
    ]},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{labels:{color:C.silver,usePointStyle:true,font:{size:9}}}, tooltip:{...tooltip}},
      scales:{
        x:{grid:{display:false},ticks:{color:C.dim,font:{size:8},maxTicksLimit:10}},
        y:{grid:gridLine,ticks:{color:C.silver},suggestedMin:0,suggestedMax:6}
      }
    }
  });

  // timeline
  const tl = document.getElementById('student-timeline');
  if (tl) tl.innerHTML = s.timeline.map(t=>`
    <div class="tl-item">
      <div class="tl-dot ${t.dot}"></div>
      <div class="tl-date">${t.date}</div>
      <div class="tl-title">${t.title}</div>
      <div class="tl-desc">${t.desc}</div>
    </div>
  `).join('');

  // responses
  const tagColor = { 'ÓTIMO':'var(--green)', 'BOM':'var(--gold)', 'REGULAR':'var(--amber)', 'RUIM':'var(--red)' };
  const respEl = document.getElementById('responses-list');
  if (respEl) respEl.innerHTML = s.responses.map((r,i)=>`
    <div class="response-item" onclick="toggleResponse(this)">
      <div class="response-head">
        <span class="response-date">${r.date}</span>
        <div class="response-stars">${'★'.repeat(r.stars)}${'★'.repeat(5-r.stars).split('').map(()=>'<span class="star">★</span>').join('')}</div>
        <span class="response-text">${r.summary} <span style="font-size:8px;padding:2px 7px;border-radius:2px;background:${tagColor[r.tag]}22;color:${tagColor[r.tag]};font-family:var(--font-mono)">${r.tag}</span></span>
      </div>
      <div class="response-body">
        ${r.fields.map(f=>`
          <div class="response-field-label">${f.label}</div>
          <div class="response-field-val">${f.val}</div>
        `).join('')}
      </div>
    </div>
  `).join('');

  // fix stars markup
  respEl.querySelectorAll('.response-stars').forEach((el, i) => {
    const stars = s.responses[i]?.stars || 0;
    el.innerHTML = Array.from({length:5}, (_,j)=>
      `<span class="star ${j<stars?'on':''}" style="font-size:10px">★</span>`
    ).join('');
  });
}

function filterChurn() {
  const sel = document.getElementById('student-select');
  if (!sel) return;
  // find first churn risk student
  const churnId = DATA_STUDENTS_DETAIL.find(s=>s.id==='felipe')?.id;
  if (churnId) { sel.value = churnId; loadStudent(); }
}

// ═══════════════════════════════════════════════════════
//  VENDAS: INTERAÇÕES
// ═══════════════════════════════════════════════════════
let selectedPlan = { dur:'3m', price:'197' };

function selectPlan(el) {
  document.querySelectorAll('.plan-card').forEach(c=>c.classList.remove('selected'));
  el.classList.add('selected');
  selectedPlan = { dur: el.dataset.dur, price: el.dataset.price };
  document.getElementById('link-result').style.display = 'none';
}

function saveLead() {
  const name = document.getElementById('lead-name')?.value.trim();
  if (!name) { document.getElementById('lead-name').focus(); return; }
  const btn = document.getElementById('btn-save-lead');
  const orig = btn.textContent;
  btn.textContent = '✓ Lead cadastrado!';
  btn.disabled = true;
  setTimeout(()=>{ btn.textContent = orig; btn.disabled = false; }, 2200);
  // ── API: INSERT INTO leads (name, phone, email, channel, plan, status) ──
}

function gerarLink() {
  const name = (document.getElementById('lead-name')?.value.trim() || 'prospect');
  const slug = name.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
  const ref  = Math.random().toString(36).substr(2,8).toUpperCase();
  const url  = `https://pay.rafaelmoura.com.br/plano-${selectedPlan.dur}?ref=${ref}&lead=${slug}`;
  document.getElementById('generated-link').textContent = url;
  document.getElementById('link-result').style.display = 'block';
  document.getElementById('btn-copy').textContent = 'Copiar';
  document.getElementById('btn-copy').classList.remove('copied');
  // ── API: INSERT INTO payment_links (lead_slug, plan, url, ref, expires_at) ──
}

function copyLink() {
  const url = document.getElementById('generated-link')?.textContent;
  navigator.clipboard.writeText(url).catch(()=>{});
  const btn = document.getElementById('btn-copy');
  btn.textContent = '✓ Copiado!';
  btn.classList.add('copied');
  setTimeout(()=>{ btn.textContent = 'Copiar'; btn.classList.remove('copied'); }, 2000);
}

// ═══════════════════════════════════════════════════════
//  UTILITÁRIOS
// ═══════════════════════════════════════════════════════
function toggleResponse(el) {
  el.classList.toggle('open');
  el.querySelector('.response-body')?.classList.toggle('open');
}

// ═══════════════════════════════════════════════════════
//  NAV TABS
// ═══════════════════════════════════════════════════════
function initTabs() {
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.dash-section').forEach(s=>s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-'+btn.dataset.tab)?.classList.add('active');

      // Re-inicializa gráficos ao entrar nas abas (Fix 3: canvas pode ter tido size=0)
      if (btn.dataset.tab === 'bi') {
        // destroyChart garante que não duplique instâncias
        requestAnimationFrame(() => initBICharts());
      }
      if (btn.dataset.tab === 'acompanhamento') {
        requestAnimationFrame(() => {
          if (!charts.weight) loadStudent();
        });
      }
    });
  });
}

// ═══════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Pega sessão — usa as mesmas chaves do auth.js (mf_token / mf_user)
  const token   = localStorage.getItem('mf_token');
  const session = JSON.parse(localStorage.getItem('mf_user') || 'null');
  if (!token || !session) { window.location.href = '/'; return; }

  // Popula header com o nome real vindo da API
  const name     = session.name || 'Personal';
  const initials = name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();

  // Suporte aos dois possíveis IDs de elemento (dashboard.html usa dash-user-name / dash-user-avatar)
  ['user-name', 'dash-user-name'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = name;
  });
  ['user-avatar', 'dash-user-avatar'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = initials;
  });

  // Logout — limpa ambas as chaves e volta para a raiz
  document.getElementById('btn-logout')?.addEventListener('click', () => {
    localStorage.removeItem('mf_token');
    localStorage.removeItem('mf_user');
    window.location.href = '/';
  });

  // Renderiza tudo — charts e componentes rodam independente da aba inicial
  initTabs();
  initBICharts();       // Fix 3: sempre inicializa os gráficos no load
  renderChurnList();
  renderTopTable();
  renderKanban();
  renderSalesTable();
  renderStudentSelect();
  loadStudent();        // Fix 4: carrega aba de acompanhamento corretamente
});