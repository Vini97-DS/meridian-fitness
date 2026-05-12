// ═══════════════════════════════════════════════════════
//  dashboard.js — Performance Hub · Meridian Labs
//  Dados mock + gráficos + interações
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

// ── CHART REGISTRY ──────────────────────────────────────
const charts = {};
function mkChart(id, config) {
  const el = document.getElementById(id);
  if (!el) return;
  if (charts[id]) { charts[id].destroy(); }
  charts[id] = new Chart(el, config);
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

// ── BI CHARTS ────────────────────────────────────────────
function initBICharts() {
  mkChart('mrrChart', {
    type:'line',
    data:{
      labels:['Jan25','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez','Jan26','Fev','Mar','Abr','Mai'],
      datasets:[{label:'MRR (R$)', data:[56600,58200,61400,63800,67200,69400,71800,73200,75400,78800,81200,83600,85000,86400,87200,86000,89400],
        borderColor:GOLD, backgroundColor:'rgba(201,168,76,0.08)', fill:true, tension:0.4, borderWidth:2.5, pointRadius:3, pointBackgroundColor:GOLD}]
    },
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{...tt,callbacks:{label:ctx=>`R$ ${ctx.parsed.y.toLocaleString()}`}}},
      scales:{x:{grid:{display:false},ticks:{color:SILV,font:{size:8}}},y:{grid,ticks:{color:SILV,callback:v=>'R$'+(v/1000).toFixed(0)+'K'}}}}
  });
  mkChart('studentsChart', {
    type:'bar',
    data:{
      labels:['Jan25','Mar','Mai','Jul','Set','Nov','Jan26','Mar','Mai'],
      datasets:[
        {label:'Novos',data:[38,44,48,52,47,43,51,49,48],backgroundColor:'rgba(74,222,128,0.4)',borderColor:GREEN,borderWidth:1.5,borderRadius:3,stack:'s'},
        {label:'Churn',data:[-24,-28,-30,-33,-31,-29,-34,-32,-33],backgroundColor:'rgba(248,113,113,0.35)',borderColor:RED,borderWidth:1.5,borderRadius:3,stack:'s'},
      ]
    },
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{labels:{color:SILV,usePointStyle:true,font:{size:9}}},tooltip:{...tt}},
      scales:{x:{grid:{display:false},ticks:{color:SILV,font:{size:8}},stacked:true},y:{grid,stacked:true,ticks:{color:SILV}}}}
  });
  mkChart('channelChart', {
    type:'bar',
    data:{
      labels:['Instagram','Indicação','YouTube','TikTok','Google','Outros'],
      datasets:[
        {label:'Alunos',data:[180,92,68,44,18,8],backgroundColor:GOLD+'66',borderColor:GOLD,borderWidth:1.5,borderRadius:3,yAxisID:'y'},
        {label:'LTV Médio (R$)',data:[1340,2180,1680,1120,980,820],backgroundColor:BLUE+'44',borderColor:BLUE,borderWidth:1.5,borderRadius:3,yAxisID:'y2'},
      ]
    },
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{labels:{color:SILV,usePointStyle:true,font:{size:9}}},tooltip:{...tt}},
      scales:{x:{grid:{display:false},ticks:{color:SILV,font:{size:9}}},
        y:{grid,ticks:{color:GOLD,font:{size:9}},title:{display:true,text:'Alunos',color:GOLD,font:{size:9}}},
        y2:{position:'right',grid:{display:false},ticks:{color:BLUE,font:{size:9},callback:v=>'R$'+v},title:{display:true,text:'LTV',color:BLUE,font:{size:9}}}}}
  });
  mkChart('renewalChart', {
    type:'bar',
    data:{
      labels:['Plano 1m','Plano 3m','Plano 6m','Plano 12m'],
      datasets:[{label:'Renovação %',data:[52,68,82,91],
        backgroundColor:[RED+'55',AMBER+'55',GOLD+'55',GREEN+'55'],borderColor:[RED,AMBER,GOLD,GREEN],borderWidth:1.5,borderRadius:4}]
    },
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{...tt,callbacks:{label:ctx=>`${ctx.parsed.y}% renovação`}}},
      scales:{x:{grid:{display:false},ticks:{color:SILV,font:{size:9}}},y:{grid,ticks:{color:SILV,callback:v=>v+'%'},suggestedMin:40,suggestedMax:100}}}
  });
  mkChart('seasonChart', {
    type:'line',
    data:{
      labels:['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'],
      datasets:[{label:'Novos Alunos',data:[72,58,68,52,47,31,28,44,56,48,38,24],
        borderColor:GOLD,backgroundColor:'rgba(201,168,76,0.08)',fill:true,tension:0.4,borderWidth:2.5,pointRadius:4,pointBackgroundColor:GOLD}]
    },
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{...tt}},
      scales:{x:{grid:{display:false},ticks:{color:SILV,font:{size:9}}},y:{grid,ticks:{color:SILV}}}}
  });
  mkChart('metaChart', {
    type:'bar',
    data:{
      labels:['Jan26','Fev','Mar','Abr','Mai'],
      datasets:[
        {label:'Meta',data:[82000,84000,86000,88000,90000],backgroundColor:'rgba(168,178,189,0.1)',borderColor:SILV+'88',borderWidth:1.5,borderRadius:3},
        {label:'Realizado',data:[85000,86400,87200,86000,89400],backgroundColor:GOLD+'55',borderColor:GOLD,borderWidth:1.5,borderRadius:3},
      ]
    },
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{labels:{color:SILV,usePointStyle:true,font:{size:9}}},tooltip:{...tt,callbacks:{label:ctx=>`R$ ${ctx.parsed.y.toLocaleString()}`}}},
      scales:{x:{grid:{display:false},ticks:{color:SILV,font:{size:9}}},y:{grid,ticks:{color:SILV,callback:v=>'R$'+(v/1000).toFixed(0)+'K'},suggestedMin:78000}}}
  });
  mkChart('rpsChart', {
    type:'doughnut',
    data:{
      labels:['Plano 1m · R$147','Plano 3m · R$197','Plano 6m · R$237','Plano 12m · R$267'],
      datasets:[{data:[72,156,122,60],backgroundColor:[RED+'55',AMBER+'55',GOLD+'66',GREEN+'55'],borderColor:'#081321',borderWidth:3}]
    },
    options:{responsive:true,maintainAspectRatio:false,cutout:'58%',
      plugins:{legend:{position:'right',labels:{color:SILV,usePointStyle:true,font:{size:9},padding:12}},tooltip:{...tt}}}
  });
  mkChart('socialChart', {
    type:'radar',
    data:{
      labels:['Volume Alunos','LTV Médio','Taxa Renov.','Engajamento','CAC Eficiência'],
      datasets:[
        {label:'Instagram',data:[90,62,65,75,70],borderColor:GOLD,backgroundColor:'rgba(201,168,76,0.08)',pointBackgroundColor:GOLD,borderWidth:2},
        {label:'Indicação', data:[45,100,91,88,100],borderColor:GREEN,backgroundColor:'rgba(74,222,128,0.06)',pointBackgroundColor:GREEN,borderWidth:2},
        {label:'YouTube',   data:[34,78,80,82,65], borderColor:BLUE, backgroundColor:'rgba(96,165,250,0.06)', pointBackgroundColor:BLUE, borderWidth:2},
      ]
    },
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{labels:{color:SILV,usePointStyle:true,font:{size:9}}},tooltip:{...tt}},
      scales:{r:{grid:{color:'rgba(168,178,189,0.08)'},ticks:{display:false},pointLabels:{color:SILV,font:{size:9}},angleLines:{color:'rgba(168,178,189,0.06)'}}}}
  });
  mkChart('roiChart', {
    type:'bar',
    data:{
      labels:['Jan/26','Fev','Mar','Abr','Mai'],
      datasets:[
        {label:'Investimento (R$)',data:[14200,14800,15100,15600,15400],backgroundColor:RED+'44',borderColor:RED,borderWidth:1.5,borderRadius:3,yAxisID:'y'},
        {label:'Receita (R$)',     data:[85000,86400,87200,86000,89400],backgroundColor:GREEN+'44',borderColor:GREEN,borderWidth:1.5,borderRadius:3,yAxisID:'y'},
        {label:'ROI %',           data:[499,484,477,451,482],type:'line',borderColor:GOLD,backgroundColor:'transparent',borderWidth:2.5,pointRadius:4,pointBackgroundColor:GOLD,yAxisID:'y2'},
      ]
    },
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{labels:{color:SILV,usePointStyle:true,font:{size:9}}},tooltip:{...tt}},
      scales:{x:{grid:{display:false},ticks:{color:SILV,font:{size:9}}},
        y:{grid,ticks:{color:SILV,callback:v=>'R$'+(v/1000).toFixed(0)+'K'}},
        y2:{position:'right',grid:{display:false},ticks:{color:GOLD,callback:v=>v+'%'},suggestedMin:400}}}
  });
}

// ── VENDAS CHARTS ────────────────────────────────────────
function initVendasCharts() {
  mkChart('vMixChart', {
    type:'doughnut',
    data:{
      labels:['Plano 1m · R$147','Plano 3m · R$197','Plano 6m · R$237','Plano 12m · R$267'],
      datasets:[{data:[6,16,12,14],backgroundColor:[RED+'55',AMBER+'55',GOLD+'66',GREEN+'55'],borderColor:'#081321',borderWidth:3,hoverOffset:6}]
    },
    options:{responsive:true,maintainAspectRatio:false,cutout:'56%',
      plugins:{legend:{position:'right',labels:{color:SILV,usePointStyle:true,font:{size:9},padding:10}},tooltip:{...tt}}}
  });
}

// ── ACOMP CHARTS ─────────────────────────────────────────
function initAcompCharts() {
  // Pega dados do aluno selecionado
  const sel = document.getElementById('studentSelect');
  const s   = sel ? students[sel.value] : students['beatriz'];
  const wd  = s?.weight || students['beatriz'].weight;
  const fd  = s?.freq   || students['beatriz'].freq;
  const md  = s?.mood   || students['beatriz'].mood;

  mkChart('weightChart', {
    type:'line',
    data:{
      labels: wd.labels,
      datasets:[
        {label:'Peso (kg)',data:wd.kg,
          borderColor:GOLD,backgroundColor:'rgba(201,168,76,0.06)',fill:true,tension:0.4,borderWidth:2.5,pointRadius:4,pointBackgroundColor:GOLD,yAxisID:'y'},
        {label:'BF %',data:wd.bf,
          borderColor:GREEN,backgroundColor:'rgba(74,222,128,0.04)',fill:true,tension:0.4,borderWidth:1.5,pointRadius:3,pointBackgroundColor:GREEN,borderDash:[4,3],yAxisID:'y2'},
      ]
    },
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{labels:{color:SILV,usePointStyle:true,font:{size:9}}},tooltip:{...tt}},
      scales:{x:{grid:{display:false},ticks:{color:SILV,font:{size:8},maxRotation:45}},
        y:{grid,ticks:{color:GOLD,font:{size:9},callback:v=>v+'kg'},suggestedMin:58},
        y2:{position:'right',grid:{display:false},ticks:{color:GREEN,font:{size:9},callback:v=>v+'%'},suggestedMin:14}}}
  });
  mkChart('freqChart', {
    type:'bar',
    data:{
      labels:fd.map((_,i)=>`Sem ${i+1}`),
      datasets:[
        {label:'Treinos',data:fd,backgroundColor:fd.map(v=>v===5?GREEN+'66':v>=4?GOLD+'66':AMBER+'55'),borderColor:fd.map(v=>v===5?GREEN:v>=4?GOLD:AMBER),borderWidth:1.5,borderRadius:3},
        {label:'Meta',data:Array(fd.length).fill(5),type:'line',borderColor:SILV+'44',borderDash:[4,3],pointRadius:0,borderWidth:1.5}
      ]
    },
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{labels:{color:SILV,usePointStyle:true,font:{size:9}}},tooltip:{...tt}},
      scales:{x:{grid:{display:false},ticks:{color:SILV,font:{size:8},maxTicksLimit:10}},y:{grid,ticks:{color:SILV},suggestedMin:0,suggestedMax:6}}}
  });
  mkChart('moodChart', {
    type:'line',
    data:{
      labels:md.labels,
      datasets:[{label:'Disposição',data:md.data,borderColor:PURPLE,backgroundColor:'rgba(167,139,250,0.1)',fill:true,tension:0.4,borderWidth:2,pointRadius:5,pointBackgroundColor:PURPLE}]
    },
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{...tt}},
      scales:{x:{grid:{display:false},ticks:{color:SILV,font:{size:9}}},y:{grid,ticks:{color:SILV},suggestedMin:1,suggestedMax:5}}}
  });
}

// ── STUDENT DATA ─────────────────────────────────────────
const students = {
  beatriz: {
    avatar:'BT', name:'Beatriz Tavares', time:'38 meses',
    plan:'12 meses — R$267/mês', channel:'Indicação', ltv:'R$10.146',
    sk1:'94%', sk2:'8.9', sk3:'4.7/5', sk4:'3 indic.',

    stats: { pesoLabel:'− 12.1 kg', pesoBar:83, bfLabel:'− 10 pp', bfBar:71, metaLabel:'76%', metaBar:76, engLabel:'8.9/10', engBar:89, engColor:'var(--green)' },
    engagement: { score:'8.9/10', scoreColor:'green', bars:[
      { label:'Frequência de Treino',           val:'94% · 4.7/5 treinos/semana',     pct:94, color:'var(--green)' },
      { label:'Responsividade ao Formulário',   val:'92% · responde em <6h',          pct:92, color:'var(--green)' },
      { label:'Satisfação Média (formulário)',  val:'4.7/5 — últimas 12 respostas',   pct:94, color:'var(--gold)'  },
      { label:'Acesso à Plataforma',           val:'4.2× · visita diária',            pct:84, color:'var(--green)' },
      { label:'Fotos de Evolução',             val:'87% das semanas com envio',       pct:87, color:'var(--green)' },
      { label:'Probabilidade de Renovação',    val:'96% · histórico de 3 renovações', pct:96, color:'var(--green)' },
    ], mood: { labels:['Sem33','Sem34','Sem35','Sem36','Sem37','Sem38'], data:[4,4,5,3,4,5] } },
    weight: { labels:['Jun23','Set','Dez','Mar24','Jun','Set','Dez','Mar25','Jun','Set','Dez','Mar26','Mai26'],
      kg:[74.2,71.8,68.5,66.2,64.8,63.7,63,62.8,62.4,62.2,62,62.1,62.1],
      bf:[28,25.5,23,21.2,20.1,19.4,18.8,18.5,18.3,18.1,18,18,18] },
    freq: [5,4,5,5,3,5,4,5,5,4,5,5,3,5,5,4,5,5,5,4],
    mood: { labels:['Sem33','Sem34','Sem35','Sem36','Sem37','Sem38'], data:[4,4,5,3,4,5] },
    photos: [
      { date:'JUN 2023 — INÍCIO',  desc:'Foto frontal · 74,2 kg · BF 28%', label:'Peso Inicial', val:'74.2 kg' },
      { date:'DEZ 2023 — 6 MESES', desc:'Foto frontal · 68,5 kg · BF 23%', label:'6 Meses',      val:'68.5 kg' },
      { date:'MAI 2026 — ATUAL',   desc:'Foto frontal · 62,1 kg · BF 18%', label:'Atual',         val:'62.1 kg', highlight:true },
    ],
    timeline: [
      { dot:'green', date:'Abr 2026', title:'🏆 PR Histórico: Agachamento 52kg', desc:'Novo recorde pessoal. Evolução de 34kg no início para 52kg.' },
      { dot:'',      date:'Mar 2026', title:'📸 Avaliação Física Q1 — Meta 76% atingida', desc:'Peso: 62.1kg · BF: 18% · Passou para protocolo fase 3.' },
      { dot:'blue',  date:'Jan 2026', title:'🔄 Renovação — 3ª vez · Upgrade Plano 12m', desc:'Fez upgrade do plano 6m para 12m por conta própria. Alta fidelidade.' },
      { dot:'',      date:'Set 2025', title:'👥 Indicou 3 amigas — todas convertidas', desc:'Beatriz indicou Natália, Camila e Fernanda. Todas ainda ativas.' },
      { dot:'amber', date:'Jun 2025', title:'⚠ Período difícil — frequência caiu', desc:'Estresse no trabalho. Intervenção proativa via mensagem recuperou engajamento.' },
      { dot:'',      date:'Dez 2024', title:'🎯 Marco: -10kg e BF 23%', desc:'Primeiro grande resultado visível. Engajamento disparou após este marco.' },
      { dot:'green', date:'Jun 2023', title:'🚀 Início da jornada — 74.2kg · BF 28%', desc:'Entrou via indicação. Objetivo: emagrecer e ganhar massa magra.' },
    ],
    responses: [
      { week:'Semana 38', date:'28/04/26', mood:'😊😊😊😊😊', tag:'Ótima semana', summary:'Bateu meta de 5 treinos, sem dores, disposição ótima.',
        fields: [{l:'Treinos realizados',v:'5 de 5'},{l:'Sentiu dor?',v:'Não'},{l:'Qualidade do sono',v:'8/10'},{l:'Peso reportado',v:'62.1 kg'}] },
      { week:'Semana 37', date:'21/04/26', mood:'😊😊😊😊', tag:'Boa semana', summary:'4 treinos, leve fadiga na quinta, sem lesões.',
        fields: [{l:'Treinos realizados',v:'4 de 5'},{l:'Sentiu dor?',v:'Leve fadiga'},{l:'Qualidade do sono',v:'7/10'},{l:'Peso reportado',v:'62.2 kg'}] },
      { week:'Semana 36', date:'14/04/26', mood:'😊😊😊', tag:'Semana ok', summary:'3 treinos, viagem de trabalho atrapalhou.',
        fields: [{l:'Treinos realizados',v:'3 de 5'},{l:'Sentiu dor?',v:'Não'},{l:'Qualidade do sono',v:'6/10'},{l:'Peso reportado',v:'62.4 kg'}] },
    ],
  },
  eduardo: {
    avatar:'EC', name:'Eduardo Campos', time:'34 meses',
    plan:'12 meses — R$267/mês', channel:'Instagram', ltv:'R$9.078',
    sk1:'88%', sk2:'8.1', sk3:'4.4/5', sk4:'1 indic.',

    stats: { pesoLabel:'− 20 kg', pesoBar:91, bfLabel:'− 12.8 pp', bfBar:83, metaLabel:'91%', metaBar:91, engLabel:'8.1/10', engBar:81, engColor:'var(--green)' },
    engagement: { score:'8.1/10', scoreColor:'green', bars:[
      { label:'Frequência de Treino',           val:'88% · 4.4/5 treinos/semana',     pct:88, color:'var(--green)' },
      { label:'Responsividade ao Formulário',   val:'85% · responde em <12h',         pct:85, color:'var(--green)' },
      { label:'Satisfação Média (formulário)',  val:'4.4/5 — últimas 12 respostas',   pct:88, color:'var(--gold)'  },
      { label:'Acesso à Plataforma',           val:'3.8× · visita quase diária',      pct:76, color:'var(--gold)'  },
      { label:'Fotos de Evolução',             val:'80% das semanas com envio',       pct:80, color:'var(--gold)'  },
      { label:'Probabilidade de Renovação',    val:'88% · 2 renovações',              pct:88, color:'var(--green)' },
    ], mood: { labels:['Sem33','Sem34','Sem35','Sem36','Sem37','Sem38'], data:[5,4,4,5,5,4] } },
    weight: { labels:['Ago23','Nov','Fev24','Mai','Ago','Nov','Fev25','Mai','Ago','Nov','Fev26','Mai26'],
      kg:[88,85.2,81.8,78.4,75.6,73.2,71.8,70.4,69.2,68.8,68.2,68],
      bf:[31,28.5,26.2,24.1,22.4,21,20.2,19.6,19.1,18.8,18.4,18.2] },
    freq: [5,5,4,5,5,3,5,5,4,5,5,4,5,5,5,3,4,5,5,5],
    mood: { labels:['Sem33','Sem34','Sem35','Sem36','Sem37','Sem38'], data:[5,4,4,5,5,4] },
    photos: [
      { date:'AGO 2023 — INÍCIO',  desc:'Foto frontal · 88 kg · BF 31%',  label:'Peso Inicial', val:'88 kg' },
      { date:'FEV 2024 — 6 MESES', desc:'Foto frontal · 81,8 kg · BF 26%', label:'6 Meses',     val:'81.8 kg' },
      { date:'MAI 2026 — ATUAL',   desc:'Foto frontal · 68 kg · BF 18,2%', label:'Atual',        val:'68 kg', highlight:true },
    ],
    timeline: [
      { dot:'green', date:'Abr 2026', title:'🏆 -20kg atingidos', desc:'Meta principal alcançada. Agora foco em hipertrofia.' },
      { dot:'blue',  date:'Jan 2026', title:'🔄 Renovação — 2ª vez', desc:'Renovou por mais 12 meses sem hesitar.' },
      { dot:'',      date:'Set 2025', title:'📸 Avaliação Semestral', desc:'BF 19% · Peso 69kg · Excelente progresso.' },
      { dot:'green', date:'Ago 2023', title:'🚀 Início — 88kg · BF 31%', desc:'Entrou pelo Instagram. Objetivo: emagrecer.' },
    ],
    responses: [
      { week:'Semana 38', date:'28/04/26', mood:'😊😊😊😊😊', tag:'Ótima semana', summary:'5 treinos, foco total, sem intercorrências.',
        fields: [{l:'Treinos realizados',v:'5 de 5'},{l:'Sentiu dor?',v:'Não'},{l:'Qualidade do sono',v:'9/10'},{l:'Peso reportado',v:'68 kg'}] },
      { week:'Semana 37', date:'21/04/26', mood:'😊😊😊😊', tag:'Boa semana', summary:'4 treinos, ótima disposição.',
        fields: [{l:'Treinos realizados',v:'4 de 5'},{l:'Sentiu dor?',v:'Não'},{l:'Qualidade do sono',v:'8/10'},{l:'Peso reportado',v:'68.1 kg'}] },
    ],
  },
  fernanda: {
    avatar:'FL', name:'Fernanda Leal', time:'29 meses',
    plan:'6 meses — R$237/mês', channel:'YouTube', ltv:'R$6.873',
    sk1:'79%', sk2:'7.6', sk3:'4.2/5', sk4:'0 indic.',

    stats: { pesoLabel:'− 11.2 kg', pesoBar:76, bfLabel:'− 8.2 pp', bfBar:63, metaLabel:'68%', metaBar:68, engLabel:'7.6/10', engBar:76, engColor:'var(--gold)' },
    engagement: { score:'7.6/10', scoreColor:'green', bars:[
      { label:'Frequência de Treino',           val:'79% · 3.9/5 treinos/semana',     pct:79, color:'var(--gold)'  },
      { label:'Responsividade ao Formulário',   val:'78% · responde em <24h',         pct:78, color:'var(--gold)'  },
      { label:'Satisfação Média (formulário)',  val:'4.2/5 — últimas 12 respostas',   pct:84, color:'var(--gold)'  },
      { label:'Acesso à Plataforma',           val:'3.1× · visita regular',           pct:62, color:'var(--gold)'  },
      { label:'Fotos de Evolução',             val:'71% das semanas com envio',       pct:71, color:'var(--gold)'  },
      { label:'Probabilidade de Renovação',    val:'82% · 4 renovações',              pct:82, color:'var(--green)' },
    ], mood: { labels:['Sem33','Sem34','Sem35','Sem36','Sem37','Sem38'], data:[4,3,4,4,5,4] } },
    weight: { labels:['Jan24','Abr','Jul','Out','Jan25','Abr','Jul','Out','Jan26','Mai26'],
      kg:[72,69.8,67.2,65.4,63.8,62.6,61.8,61.4,61,60.8],
      bf:[26,24.2,22.4,21,19.8,19.1,18.6,18.3,18,17.8] },
    freq: [4,5,4,4,3,5,4,5,4,4,5,4,4,3,5,4,4,5,4,4],
    mood: { labels:['Sem33','Sem34','Sem35','Sem36','Sem37','Sem38'], data:[4,3,4,4,5,4] },
    photos: [
      { date:'JAN 2024 — INÍCIO',  desc:'Foto frontal · 72 kg · BF 26%',  label:'Peso Inicial', val:'72 kg' },
      { date:'JUL 2024 — 6 MESES', desc:'Foto frontal · 67,2 kg · BF 22%', label:'6 Meses',     val:'67.2 kg' },
      { date:'MAI 2026 — ATUAL',   desc:'Foto frontal · 60,8 kg · BF 17,8%', label:'Atual',      val:'60.8 kg', highlight:true },
    ],
    timeline: [
      { dot:'green', date:'Mar 2026', title:'🎯 Meta -10kg atingida', desc:'Resultado consistente ao longo de 29 meses.' },
      { dot:'blue',  date:'Jan 2026', title:'🔄 Renovação — 4ª vez', desc:'Alta fidelidade, renova regularmente.' },
      { dot:'',      date:'Jan 2024', title:'🚀 Início — 72kg · BF 26%', desc:'Entrou pelo YouTube. Objetivo: emagrecimento saudável.' },
    ],
    responses: [
      { week:'Semana 38', date:'28/04/26', mood:'😊😊😊😊', tag:'Boa semana', summary:'4 treinos, levemente cansada mas consistente.',
        fields: [{l:'Treinos realizados',v:'4 de 5'},{l:'Sentiu dor?',v:'Não'},{l:'Qualidade do sono',v:'7/10'},{l:'Peso reportado',v:'60.8 kg'}] },
    ],
  },
  guilherme: {
    avatar:'GB', name:'Guilherme Braga', time:'27 meses',
    plan:'6 meses — R$237/mês', channel:'Indicação', ltv:'R$6.399',
    sk1:'85%', sk2:'7.9', sk3:'4.5/5', sk4:'2 indic.',

    stats: { pesoLabel:'+ 12 kg', pesoBar:80, bfLabel:'− 4.2 pp', bfBar:58, metaLabel:'85%', metaBar:85, engLabel:'7.9/10', engBar:79, engColor:'var(--green)' },
    engagement: { score:'7.9/10', scoreColor:'green', bars:[
      { label:'Frequência de Treino',           val:'85% · 4.3/5 treinos/semana',     pct:85, color:'var(--green)' },
      { label:'Responsividade ao Formulário',   val:'80% · responde em <18h',         pct:80, color:'var(--gold)'  },
      { label:'Satisfação Média (formulário)',  val:'4.5/5 — últimas 12 respostas',   pct:90, color:'var(--gold)'  },
      { label:'Acesso à Plataforma',           val:'3.4× · visita regular',           pct:68, color:'var(--gold)'  },
      { label:'Fotos de Evolução',             val:'76% das semanas com envio',       pct:76, color:'var(--gold)'  },
      { label:'Probabilidade de Renovação',    val:'79% · 3 renovações',              pct:79, color:'var(--gold)'  },
    ], mood: { labels:['Sem33','Sem34','Sem35','Sem36','Sem37','Sem38'], data:[5,5,4,5,5,5] } },
    weight: { labels:['Mar24','Jun','Set','Dez','Mar25','Jun','Set','Dez','Mar26','Mai26'],
      kg:[75,77.2,79.4,81.6,83.2,84.8,85.6,86.2,86.8,87],
      bf:[18,17.2,16.4,15.8,15.2,14.8,14.5,14.2,14,13.8] },
    freq: [4,5,5,4,5,5,4,5,5,4,5,5,4,5,5,5,4,5,5,4],
    mood: { labels:['Sem33','Sem34','Sem35','Sem36','Sem37','Sem38'], data:[5,5,4,5,5,5] },
    photos: [
      { date:'MAR 2024 — INÍCIO',  desc:'Foto frontal · 75 kg · BF 18%',  label:'Peso Inicial', val:'75 kg' },
      { date:'SET 2024 — 6 MESES', desc:'Foto frontal · 79,4 kg · BF 16%', label:'6 Meses',     val:'79.4 kg' },
      { date:'MAI 2026 — ATUAL',   desc:'Foto frontal · 87 kg · BF 13,8%', label:'Atual',        val:'87 kg', highlight:true },
    ],
    timeline: [
      { dot:'green', date:'Abr 2026', title:'💪 +12kg massa magra', desc:'Objetivo de hipertrofia bem encaminhado.' },
      { dot:'blue',  date:'Jan 2026', title:'🔄 Renovação — 3ª vez', desc:'Indicou 2 amigos que viraram alunos.' },
      { dot:'green', date:'Mar 2024', title:'🚀 Início — 75kg · BF 18%', desc:'Entrou por indicação. Objetivo: hipertrofia.' },
    ],
    responses: [
      { week:'Semana 38', date:'28/04/26', mood:'😊😊😊😊😊', tag:'Semana excelente', summary:'5 treinos, cargas aumentadas, ótima recuperação.',
        fields: [{l:'Treinos realizados',v:'5 de 5'},{l:'Sentiu dor?',v:'Não'},{l:'Qualidade do sono',v:'9/10'},{l:'Peso reportado',v:'87 kg'}] },
    ],
  },
  isabela: {
    avatar:'IN', name:'Isabela Nunes', time:'24 meses',
    plan:'3 meses — R$197/mês', channel:'Instagram', ltv:'R$4.728',
    sk1:'72%', sk2:'6.8', sk3:'3.9/5', sk4:'0 indic.',

    stats: { pesoLabel:'− 7.4 kg', pesoBar:62, bfLabel:'− 7 pp', bfBar:54, metaLabel:'62%', metaBar:62, engLabel:'6.8/10', engBar:68, engColor:'var(--gold)' },
    engagement: { score:'6.8/10', scoreColor:'green', bars:[
      { label:'Frequência de Treino',           val:'72% · 3.6/5 treinos/semana',     pct:72, color:'var(--gold)'  },
      { label:'Responsividade ao Formulário',   val:'68% · responde em <48h',         pct:68, color:'var(--gold)'  },
      { label:'Satisfação Média (formulário)',  val:'3.9/5 — últimas 12 respostas',   pct:78, color:'var(--gold)'  },
      { label:'Acesso à Plataforma',           val:'2.8× · irregular',                pct:56, color:'var(--amber)' },
      { label:'Fotos de Evolução',             val:'60% das semanas com envio',       pct:60, color:'var(--amber)' },
      { label:'Probabilidade de Renovação',    val:'71% · 7 renovações (3m)',         pct:71, color:'var(--gold)'  },
    ], mood: { labels:['Sem33','Sem34','Sem35','Sem36','Sem37','Sem38'], data:[3,4,3,4,3,4] } },
    weight: { labels:['Jun24','Set','Dez','Mar25','Jun','Set','Dez','Mar26','Mai26'],
      kg:[68,66.2,64.8,63.4,62.2,61.6,61.2,60.8,60.6],
      bf:[27,25.4,24,22.8,21.6,21,20.6,20.2,20] },
    freq: [4,3,4,4,3,4,3,4,4,3,4,4,3,3,4,4,3,4,4,3],
    mood: { labels:['Sem33','Sem34','Sem35','Sem36','Sem37','Sem38'], data:[3,4,3,4,3,4] },
    photos: [
      { date:'JUN 2024 — INÍCIO',  desc:'Foto frontal · 68 kg · BF 27%',  label:'Peso Inicial', val:'68 kg' },
      { date:'DEZ 2024 — 6 MESES', desc:'Foto frontal · 64,8 kg · BF 24%', label:'6 Meses',     val:'64.8 kg' },
      { date:'MAI 2026 — ATUAL',   desc:'Foto frontal · 60,6 kg · BF 20%', label:'Atual',        val:'60.6 kg', highlight:true },
    ],
    timeline: [
      { dot:'',      date:'Mar 2026', title:'📸 Avaliação — BF 20%', desc:'Progresso consistente, frequência irregular mas manteve resultado.' },
      { dot:'blue',  date:'Dez 2025', title:'🔄 Renovação — 7ª vez (3m)', desc:'Prefere planos trimestrais por flexibilidade.' },
      { dot:'green', date:'Jun 2024', title:'🚀 Início — 68kg · BF 27%', desc:'Entrou pelo Instagram. Objetivo: saúde geral.' },
    ],
    responses: [
      { week:'Semana 38', date:'28/04/26', mood:'😊😊😊', tag:'Semana regular', summary:'4 treinos, rotina corrida mas manteve o compromisso.',
        fields: [{l:'Treinos realizados',v:'4 de 5'},{l:'Sentiu dor?',v:'Não'},{l:'Qualidade do sono',v:'6/10'},{l:'Peso reportado',v:'60.6 kg'}] },
    ],
  },
  felipe: {
    avatar:'FM', name:'Felipe Martins ⚠', time:'7 meses',
    plan:'3 meses — R$197/mês', channel:'Instagram', ltv:'R$1.379',
    sk1:'18%', sk2:'1.9', sk3:'2.1/5', sk4:'0 indic.',

    stats: { pesoLabel:'+ 0.2 kg', pesoBar:4, bfLabel:'0 pp', bfBar:2, metaLabel:'8%', metaBar:8, engLabel:'1.9/10', engBar:19, engColor:'var(--red)' },
    engagement: { score:'1.9/10', scoreColor:'fail', bars:[
      { label:'Frequência de Treino',           val:'18% · 0.9/5 treinos/semana',     pct:18, color:'var(--red)'   },
      { label:'Responsividade ao Formulário',   val:'22% · demora >72h',              pct:22, color:'var(--red)'   },
      { label:'Satisfação Média (formulário)',  val:'2.1/5 — últimas 6 respostas',    pct:42, color:'var(--amber)' },
      { label:'Acesso à Plataforma',           val:'0.4× · raramente acessa',         pct:8,  color:'var(--red)'   },
      { label:'Fotos de Evolução',             val:'12% das semanas com envio',       pct:12, color:'var(--red)'   },
      { label:'Probabilidade de Renovação',    val:'14% · RISCO CRÍTICO',             pct:14, color:'var(--red)'   },
    ], mood: { labels:['Sem33','Sem34','Sem35','Sem36','Sem37','Sem38'], data:[2,2,1,2,3,2] } },
    weight: { labels:['Out25','Nov','Dez','Jan26','Fev','Mar','Abr','Mai26'],
      kg:[92,91.2,90.8,90.4,90.6,91,91.4,91.8],
      bf:[34,33.6,33.4,33.2,33.4,33.6,33.8,34] },
    freq: [2,1,3,2,1,1,2,1,1,2,1,1,0,1,2,1,1,0,1,1],
    mood: { labels:['Sem33','Sem34','Sem35','Sem36','Sem37','Sem38'], data:[2,2,1,2,3,2] },
    photos: [
      { date:'OUT 2025 — INÍCIO',  desc:'Foto frontal · 92 kg · BF 34%',  label:'Peso Inicial', val:'92 kg' },
      { date:'FEV 2026 — 4 MESES', desc:'Foto frontal · 90,6 kg · BF 33%', label:'4 Meses',     val:'90.6 kg' },
      { date:'MAI 2026 — ATUAL',   desc:'Foto frontal · 91,8 kg · BF 34%', label:'Atual',        val:'91.8 kg', highlight:true },
    ],
    timeline: [
      { dot:'amber', date:'Abr 2026', title:'⚠ Frequência caiu para 1x/semana', desc:'Necessita intervenção urgente. Risco alto de churn.' },
      { dot:'',      date:'Jan 2026', title:'🔄 Renovação — 1ª vez (3m)', desc:'Renovou mas frequência já estava caindo.' },
      { dot:'green', date:'Out 2025', title:'🚀 Início — 92kg · BF 34%', desc:'Entrou pelo Instagram. Objetivo: emagrecimento.' },
    ],
    responses: [
      { week:'Semana 38', date:'28/04/26', mood:'😊😊', tag:'Semana fraca', summary:'1 treino realizado. Relata falta de tempo e motivação.',
        fields: [{l:'Treinos realizados',v:'1 de 5'},{l:'Sentiu dor?',v:'Não'},{l:'Qualidade do sono',v:'5/10'},{l:'Peso reportado',v:'91.8 kg'}] },
    ],
  },
  amanda: {
    avatar:'AC', name:'Amanda Costa ⚠', time:'3 meses',
    plan:'1 mês — R$147/mês', channel:'Instagram', ltv:'R$441',
    sk1:'22%', sk2:'2.1', sk3:'2.4/5', sk4:'0 indic.',

    stats: { pesoLabel:'− 0.8 kg', pesoBar:6, bfLabel:'− 0.4 pp', bfBar:3, metaLabel:'5%', metaBar:5, engLabel:'2.1/10', engBar:21, engColor:'var(--red)' },
    engagement: { score:'2.1/10', scoreColor:'fail', bars:[
      { label:'Frequência de Treino',           val:'22% · 1.1/5 treinos/semana',     pct:22, color:'var(--red)'   },
      { label:'Responsividade ao Formulário',   val:'30% · demora >48h',              pct:30, color:'var(--red)'   },
      { label:'Satisfação Média (formulário)',  val:'2.4/5 — últimas 4 respostas',    pct:48, color:'var(--amber)' },
      { label:'Acesso à Plataforma',           val:'0.6× · raramente acessa',         pct:12, color:'var(--red)'   },
      { label:'Fotos de Evolução',             val:'10% das semanas com envio',       pct:10, color:'var(--red)'   },
      { label:'Probabilidade de Renovação',    val:'18% · RISCO CRÍTICO',             pct:18, color:'var(--red)'   },
    ], mood: { labels:['Sem33','Sem34','Sem35','Sem36','Sem37','Sem38'], data:[2,3,2,2,1,2] } },
    weight: { labels:['Mar26','Abr','Mai26'],
      kg:[78,77.6,77.2],
      bf:[30,29.8,29.6] },
    freq: [3,2,1,2,2,1,3,2,1,2,1,2,1,2,3,1,2,1,2,2],
    mood: { labels:['Sem33','Sem34','Sem35','Sem36','Sem37','Sem38'], data:[2,3,2,2,1,2] },
    photos: [
      { date:'MAR 2026 — INÍCIO',  desc:'Foto frontal · 78 kg · BF 30%',  label:'Peso Inicial', val:'78 kg' },
      { date:'ABR 2026 — 1 MÊS',   desc:'Foto frontal · 77,6 kg · BF 29,8%', label:'1 Mês',    val:'77.6 kg' },
      { date:'MAI 2026 — ATUAL',   desc:'Foto frontal · 77,2 kg · BF 29,6%', label:'Atual',     val:'77.2 kg', highlight:true },
    ],
    timeline: [
      { dot:'amber', date:'Mai 2026', title:'⚠ Frequência muito baixa', desc:'2 treinos/semana apenas. Engajamento crítico.' },
      { dot:'green', date:'Mar 2026', title:'🚀 Início — 78kg · BF 30%', desc:'Entrou pelo Instagram. Objetivo: emagrecimento.' },
    ],
    responses: [
      { week:'Semana 38', date:'28/04/26', mood:'😊😊', tag:'Semana difícil', summary:'2 treinos, relatou desmotivação.',
        fields: [{l:'Treinos realizados',v:'2 de 5'},{l:'Sentiu dor?',v:'Não'},{l:'Qualidade do sono',v:'5/10'},{l:'Peso reportado',v:'77.2 kg'}] },
    ],
  },
};

function updateStudent() {
  const sel = document.getElementById('studentSelect');
  if (!sel) return;
  const s = students[sel.value];
  if (!s) return;

  const set = (id, v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  set('studentAvatar',  s.avatar);
  set('studentName',    s.name);
  set('studentTime',    s.time);
  set('studentPlan',    s.plan);
  set('studentChannel', s.channel);
  set('studentLTV',     s.ltv);
  set('sk1', s.sk1); set('sk2', s.sk2); set('sk3', s.sk3); set('sk4', s.sk4);

  // Fotos
  const photoEl = document.getElementById('photo-compare');
  if (photoEl && s.photos) {
    photoEl.innerHTML = s.photos.map(p => `
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
  if (tlEl && s.timeline) {
    tlEl.innerHTML = s.timeline.map(t => `
      <div class="tl-item">
        <div class="tl-dot ${t.dot}"></div>
        <div class="tl-date">${t.date}</div>
        <div class="tl-title">${t.title}</div>
        <div class="tl-desc">${t.desc}</div>
      </div>`).join('');
  }

  // Respostas
  const respEl = document.getElementById('student-responses');
  const respBadge = document.getElementById('responses-badge');
  if (respBadge && s.responses) {
    respBadge.textContent = s.responses.length + ' RESPOSTAS';
  }
  if (respEl && s.responses) {
    respEl.innerHTML = s.responses.map(r => `
      <div class="response-item" onclick="toggleResponse(this)">
        <div class="response-header">
          <span class="response-date">${r.date}</span>
          <span class="response-week">${r.week}</span>
          <span class="response-tag">${r.tag}</span>
          <div class="response-stars">${r.mood}</div>
        </div>
        <div class="response-body">
          <div class="response-summary">${r.summary}</div>
          ${r.fields.map(f=>`
            <div class="response-field">
              <span class="response-field-label">${f.l}</span>
              <span class="response-field-val">${f.v}</span>
            </div>`).join('')}
        </div>
      </div>`).join('');
  }

  // Stats grid (peso perdido, BF, meta, engajamento)
  const statsEl = document.getElementById('student-stats');
  if (statsEl && s.stats) {
    const st = s.stats;
    const statColor = (pct) => pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--gold)' : 'var(--red)';
    statsEl.innerHTML = [
      { label:'Peso Total Perdido', val:st.pesoLabel, pct:st.pesoBar, color:statColor(st.pesoBar), grad:'var(--green)' },
      { label:'Redução BF',         val:st.bfLabel,   pct:st.bfBar,   color:statColor(st.bfBar),   grad:'var(--green)' },
      { label:'Meta Atingida',      val:st.metaLabel, pct:st.metaBar, color:statColor(st.metaBar), grad:'var(--gold)'  },
      { label:'Engajamento Score',  val:st.engLabel,  pct:st.engBar,  color:st.engColor,            grad:st.engColor   },
    ].map(item => `
      <div>
        <div style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.1em;text-transform:uppercase;color:var(--silver);margin-bottom:6px">${item.label}</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:1.6rem;color:${item.color}">${item.val}</div>
        <div class="engagement-bar"><div class="engagement-fill" style="width:${item.pct}%;background:linear-gradient(90deg,${item.grad},${item.grad}66)"></div></div>
      </div>`).join('');
  }

  // Engagement panel — rebuild completamente
  const engPanel = document.getElementById('engagement-panel');
  if (engPanel && s.engagement) {
    const eng = s.engagement;
    const badge = document.getElementById('engagement-score-badge');
    if (badge) {
      badge.textContent = 'SCORE ' + eng.score;
      badge.className = 'panel-badge ' + (eng.scoreColor === 'fail' ? 'fail' : 'green');
    }
    // Rebuild bars container inteiro
    const barsHtml = eng.bars.map(bar => `
      <div style="margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.1em;text-transform:uppercase;color:var(--silver)">${bar.label}</span>
          <span style="font-family:'DM Mono',monospace;font-size:10px;color:${bar.color}">${bar.val}</span>
        </div>
        <div class="engagement-bar"><div class="engagement-fill" style="width:${bar.pct}%;background:linear-gradient(90deg,${bar.color},${bar.color}44)"></div></div>
      </div>`).join('');
    // Substitui o conteúdo após o panel-header
    const panelHeader = engPanel.querySelector('.panel-header');
    // Remove todos os filhos exceto o panel-header
    Array.from(engPanel.children).forEach(child => {
      if (!child.classList.contains('panel-header')) child.remove();
    });
    engPanel.insertAdjacentHTML('beforeend', barsHtml);
  }

  // Atualiza gráficos com dados do aluno
  if (acompChartsDone) setTimeout(initAcompCharts, 50);
}

// ── CHURN LIST ───────────────────────────────────────────
const DATA_CHURN = [
  {initials:'FM',name:'Felipe Martins',   detail:'Sem check-in há 28 dias · Plano 3m vence em 4 dias',level:'high'},
  {initials:'AC',name:'Amanda Costa',     detail:'Sem check-in há 22 dias · Plano 1m renovado só 2×', level:'high'},
  {initials:'RS',name:'Rodrigo Santana',  detail:'Frequência caiu 5×→1×/semana · 14 dias sem login',  level:'high'},
  {initials:'LF',name:'Larissa Ferreira', detail:'Plano vence em 12 dias · frequência irregular',      level:'med'},
  {initials:'TN',name:'Thiago Novaes',    detail:'Acesso caiu 80% · plano 6m vence em 18 dias',       level:'med'},
  {initials:'MS',name:'Marina Souza',     detail:'Nota última avaliação: 3/5 · mencionou dificuldades',level:'med'},
];
function renderChurnList() {
  const el = document.getElementById('churn-list');
  if (!el) return;
  el.innerHTML = DATA_CHURN.map(c=>`
    <div class="churn-item">
      <div class="churn-avatar">${c.initials}</div>
      <div><div class="churn-name">${c.name}</div><div class="churn-detail">${c.detail}</div></div>
      <div class="churn-badge ${c.level}">${c.level==='high'?'CRÍTICO':'MÉDIO'}</div>
    </div>`).join('');
}

// ── TOP TABLE ────────────────────────────────────────────
const DATA_TOP = [
  {rank:1, name:'Beatriz Tavares', plan:'12m',time:'38 meses',channel:'Indicação',ltv:'R$10.146',ticket:'R$267',renov:'3×'},
  {rank:2, name:'Eduardo Campos',  plan:'12m',time:'34 meses',channel:'Instagram',ltv:'R$9.078', ticket:'R$267',renov:'2×'},
  {rank:3, name:'Fernanda Leal',   plan:'6m', time:'29 meses',channel:'YouTube',  ltv:'R$6.873', ticket:'R$237',renov:'4×'},
  {rank:4, name:'Guilherme Braga', plan:'6m', time:'27 meses',channel:'Indicação',ltv:'R$6.399', ticket:'R$237',renov:'3×'},
  {rank:5, name:'Isabela Nunes',   plan:'3m', time:'24 meses',channel:'Instagram',ltv:'R$4.728', ticket:'R$197',renov:'7×'},
  {rank:6, name:'Juliana Rocha',   plan:'12m',time:'22 meses',channel:'TikTok',   ltv:'R$4.674', ticket:'R$267',renov:'1×'},
  {rank:7, name:'Lucas Mendes',    plan:'6m', time:'20 meses',channel:'Indicação',ltv:'R$4.740', ticket:'R$237',renov:'2×'},
  {rank:8, name:'Natália Oliveira',plan:'3m', time:'18 meses',channel:'Instagram',ltv:'R$3.546', ticket:'R$197',renov:'5×'},
  {rank:9, name:'Pedro Viana',     plan:'6m', time:'16 meses',channel:'YouTube',  ltv:'R$3.792', ticket:'R$237',renov:'1×'},
  {rank:10,name:'Renata Castro',   plan:'12m',time:'14 meses',channel:'Indicação',ltv:'R$3.738', ticket:'R$267',renov:'1×'},
];
function renderTopTable() {
  const el = document.getElementById('table-top-students');
  if (!el) return;
  el.innerHTML = `<thead><tr>
    <th>#</th><th>Nome</th><th>Plano</th><th>Tempo</th>
    <th>Canal</th><th style="text-align:right">LTV</th>
    <th style="text-align:right">Ticket</th><th style="text-align:right">Renovações</th>
  </tr></thead><tbody>${DATA_TOP.map(r=>`<tr>
    <td class="num">${r.rank}</td><td>${r.name}</td><td>${r.plan}</td><td>${r.time}</td>
    <td>${r.channel}</td><td class="num">${r.ltv}</td><td class="num">${r.ticket}</td><td class="num">${r.renov}</td>
  </tr>`).join('')}</tbody>`;
}

// ── KANBAN ───────────────────────────────────────────────
const KDATA = {
  novo:[
    {id:'k1',name:'Camila Torres',  sub:'Instagram · Emagrecimento',val:'',         days:'Hoje',phone:'(11) 98765-4321',email:'camila@email.com', canal:'Instagram',dp:0},
    {id:'k2',name:'Pedro Araújo',   sub:'Indicação · Hipertrofia',  val:'',         days:'Hoje',phone:'(11) 91234-5678',email:'pedro@email.com',  canal:'Indicação',dp:0},
    {id:'k3',name:'Letícia Maia',   sub:'TikTok · Saúde geral',     val:'',         days:'1d',  phone:'(21) 99887-6543',email:'leticia@email.com',canal:'TikTok',   dp:1},
    {id:'k4',name:'+ 5 outros',     sub:'Aguardando 1º contato',    val:'',days:'',phone:'',email:'',canal:'',dp:0,ghost:true},
  ],
  contato:[
    {id:'k5',name:'Ana Beatriz S.', sub:'YouTube · Condicionamento',val:'Plano 3m · R$591',  days:'2d',phone:'(11) 94567-8901',email:'ana@email.com', canal:'YouTube',  dp:2},
    {id:'k6',name:'Diego Lima',     sub:'Instagram · Emagrecimento',val:'Plano 6m · R$1.422',days:'3d',phone:'(11) 93456-7890',email:'diego@email.com',canal:'Instagram',dp:3},
    {id:'k7',name:'+ 7 outros',     sub:'Em conversa ativa',        val:'',days:'',phone:'',email:'',canal:'',dp:0,ghost:true},
  ],
  proposta:[
    {id:'k8', name:'Mariana Fonseca',sub:'Indicação · Hipertrofia',  val:'Plano 12m · R$3.204',days:'1d',phone:'(11) 92345-6789',email:'mari@email.com',canal:'Indicação',dp:1,hot:true},
    {id:'k9', name:'Vinícius Prado', sub:'Instagram · Emagrecimento',val:'Plano 6m · R$1.422', days:'2d',phone:'(21) 98901-2345',email:'vini@email.com', canal:'Instagram',dp:2,hot:true},
    {id:'k10',name:'+ 5 outros',     sub:'Link enviado',             val:'',days:'',phone:'',email:'',canal:'',dp:0,ghost:true},
  ],
  fechado:[
    {id:'k11',name:'Roberta Coelho', sub:'Indicação · Emagrecimento',val:'Plano 6m ✓',  days:'Hoje',phone:'(11) 97890-1234',email:'rob@email.com',canal:'Indicação',dp:0,ok:true},
    {id:'k12',name:'Carlos Henrique',sub:'YouTube · Condicionamento', val:'Plano 12m ✓', days:'1d',  phone:'(31) 96789-0123',email:'ch@email.com', canal:'YouTube',  dp:1,ok:true},
    {id:'k13',name:'+ 3 outros',     sub:'Esta semana',              val:'',days:'',phone:'',email:'',canal:'',dp:0,ghost:true},
  ],
  perdido:[
    {id:'k14',name:'Fernanda C.',sub:'Preço acima do budget',val:'Plano 6m · perdido',days:'3d',phone:'(11) 95678-9012',email:'fe@email.com',canal:'Google',   dp:3,lost:true},
    {id:'k15',name:'Tiago Ramos', sub:'Sem resposta após 5d', val:'Plano 1m · perdido',days:'5d',phone:'(11) 94567-8901',email:'tr@email.com',canal:'Instagram',dp:5,lost:true},
  ],
};
const KCOLS=[
  {key:'novo',    label:'Novo',    color:'#60a5fa'},
  {key:'contato', label:'Contato', color:'#a78bfa'},
  {key:'proposta',label:'Proposta',color:'#fbbf24'},
  {key:'fechado', label:'Fechado', color:'#4ade80'},
  {key:'perdido', label:'Perdido', color:'#f87171'},
];
const kStatus={}, kNotes={};
Object.entries(KDATA).forEach(([s,cards])=>cards.forEach(c=>{if(!c.ghost)kStatus[c.id]=s;}));

function renderKanban() {
  const board = document.getElementById('v-kanban-board');
  if (!board) return;
  const grouped={novo:[],contato:[],proposta:[],fechado:[],perdido:[]};
  Object.values(KDATA).flat().forEach(c=>{if(c.ghost)return; grouped[kStatus[c.id]||'novo'].push(c);});
  board.innerHTML = KCOLS.map(col=>{
    const cards=grouped[col.key]||[];
    return `<div class="v-kcol">
      <div class="v-kcol-head">
        <span class="v-kcol-title">${col.label}</span>
        <span class="v-kcount" style="background:${col.color}22;color:${col.color}">${cards.length}</span>
      </div>
      ${cards.map(c=>`<div class="v-kcard" style="${c.hot?'border-color:rgba(251,191,36,0.25)':''}${c.ok?'border-color:rgba(74,222,128,0.2)':''}${c.lost?'opacity:0.6;border-color:rgba(248,113,113,0.18)':''}"
           onclick="openCtxMenu(event,'${c.id}','${col.key}')">
        <div class="v-kcard-name">${c.name}</div>
        <div class="v-kcard-detail">${c.sub}</div>
        ${c.val?`<div class="v-kcard-val" style="${c.ok?'color:var(--green)':c.lost?'color:var(--red)':''}">${c.val}</div>`:''}
        ${c.days?`<div class="v-kcard-days">${c.days}</div>`:''}
      </div>`).join('')}
    </div>`;
  }).join('');
}

// ── CONTEXT MENU ─────────────────────────────────────────
let ctxId=null;
function openCtxMenu(e,cardId,curStatus) {
  e.stopPropagation(); ctxId=cardId;
  const c=Object.values(KDATA).flat().find(x=>x.id===cardId); if(!c) return;
  const menu=document.getElementById('ctx-menu'), overlay=document.getElementById('ctx-overlay');
  if(!menu||!overlay) return;
  document.getElementById('ctx-lead-name').textContent=c.name;
  document.getElementById('ctx-lead-sub').textContent=c.sub;
  document.getElementById('ctx-info-grid').innerHTML=[
    {l:'Plano',v:c.val||'—'},{l:'Canal',v:c.canal||'—'},
    {l:'WhatsApp',v:c.phone||'—'},{l:'E-mail',v:c.email||'—'},
    {l:'No pipeline',v:c.dp===0?'Hoje':c.dp+'d'},{l:'Status',v:curStatus},
  ].map(i=>`<div><div class="ctx-info-label">${i.l}</div><div class="ctx-info-val">${i.v}</div></div>`).join('');
  document.querySelectorAll('.ctx-sbtn').forEach(b=>b.classList.toggle('cur',b.dataset.s===curStatus));
  document.getElementById('ctx-notes-input').value=kNotes[cardId]||'';
  menu.style.display='block'; overlay.classList.add('open');
  const x=Math.min(e.clientX+8,window.innerWidth-328); const y=Math.min(e.clientY+8,window.innerHeight-468);
  menu.style.left=Math.max(8,x)+'px'; menu.style.top=Math.max(8,y)+'px';
}
function closeCtxMenu() {
  const m=document.getElementById('ctx-menu'),o=document.getElementById('ctx-overlay');
  if(m) m.style.display='none'; if(o) o.classList.remove('open'); ctxId=null;
}
function ctxMove(s) {
  if(!ctxId) return; kStatus[ctxId]=s;
  document.querySelectorAll('.ctx-sbtn').forEach(b=>b.classList.toggle('cur',b.dataset.s===s));
  renderKanban();
}
function ctxSave() {
  if(ctxId) kNotes[ctxId]=document.getElementById('ctx-notes-input')?.value;
  closeCtxMenu();
}

// ── VENDAS HELPERS ───────────────────────────────────────
let vSelectedPlan={dur:'1m',price:'147'};
function vSelectPlan(el) {
  document.querySelectorAll('.plan-card-v').forEach(c=>c.classList.remove('sel'));
  el.classList.add('sel');
  vSelectedPlan={dur:el.dataset.dur,price:el.dataset.price};
  document.getElementById('v-link-result').style.display='none';
}
function vSaveLead() {
  // Coleta campos
  const name    = document.getElementById('v-lead-name')?.value.trim()    || '';
  const phone   = document.getElementById('v-lead-phone')?.value.trim()   || '';
  const email   = document.getElementById('v-lead-email')?.value.trim()   || '';
  const channel = document.getElementById('v-lead-channel')?.value        || 'Instagram';

  // Plano selecionado
  const selPlan = document.querySelector('.plan-card-v.sel');
  const planName = selPlan ? selPlan.querySelector('.plan-dur')?.textContent || vSelectedPlan.dur : vSelectedPlan.dur;
  const planPrice = selPlan ? selPlan.querySelector('.plan-price')?.textContent || 'R$' + vSelectedPlan.price : 'R$' + vSelectedPlan.price;

  // Validação básica
  if (!name) {
    document.getElementById('v-lead-name')?.focus();
    document.getElementById('v-lead-name')?.classList.add('error');
    setTimeout(() => document.getElementById('v-lead-name')?.classList.remove('error'), 2000);
    return;
  }
  if (!phone) {
    document.getElementById('v-lead-phone')?.focus();
    return;
  }

  // Gera ID único para o novo lead
  const newId = 'k' + Date.now();

  // Cria o lead no objeto KDATA
  const newLead = {
    id:    newId,
    name:  name,
    sub:   channel + ' · ' + (selPlan ? planName : 'Plano a definir'),
    val:   '',
    days:  'Agora',
    phone: phone,
    email: email,
    canal: channel,
    dp:    0,
  };

  // Adiciona na coluna "novo" do KDATA e kStatus (otimista)
  KDATA.novo.unshift(newLead);
  kStatus[newId] = 'novo';
  renderKanban();

  // Salva no Neon em background
  saveLeadToAPI({
    name: name, phone: phone, email: email,
    channel: channel.toLowerCase(),
    goal: 'emagrecimento',
  }).then(saved => {
    if (saved?.id) {
      // Atualiza o ID local com o ID real do banco
      const idx = KDATA.novo.findIndex(c => c.id === newId);
      if (idx >= 0) KDATA.novo[idx].id = saved.id;
      kStatus[saved.id] = 'novo';
      delete kStatus[newId];
    }
  }).catch(() => {}); // Falha silenciosa — lead já está no kanban localmente

  // Atualiza KPI de vendas (Novos Leads)
  const leadsKpi = document.getElementById('v-kpi-leads');
  if (leadsKpi) {
    const cur = parseInt(leadsKpi.textContent) || 0;
    leadsKpi.textContent = cur + 1;
  }

  // Feedback visual no botão
  const btn = document.getElementById('v-save-btn');
  const orig = btn.textContent;
  btn.textContent = '✓ Lead adicionado ao Kanban!';
  btn.disabled = true;
  btn.style.background = 'rgba(74,222,128,0.15)';
  btn.style.borderColor = 'var(--green)';
  btn.style.color = 'var(--green)';

  // Limpa o formulário
  setTimeout(() => {
    document.getElementById('v-lead-name').value  = '';
    document.getElementById('v-lead-phone').value = '';
    document.getElementById('v-lead-email').value = '';
    document.getElementById('v-lead-channel').value = 'Instagram';
    btn.textContent = orig;
    btn.disabled = false;
    btn.style.background = '';
    btn.style.borderColor = '';
    btn.style.color = '';
  }, 2500);

  // Scroll suave para o kanban
  setTimeout(() => {
    document.getElementById('v-kanban-board')?.scrollIntoView({ behavior:'smooth', block:'nearest' });
  }, 300);
}
function vGerarLink() {
  const name=document.getElementById('v-lead-name')?.value.trim()||'prospect';
  const slug=name.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
  const ref=Math.random().toString(36).substr(2,8).toUpperCase();
  const url='https://pay.rafaelmoura.com.br/plano-'+vSelectedPlan.dur+'?ref='+ref+'&lead='+slug;
  document.getElementById('v-generated-link').textContent=url;
  document.getElementById('v-link-result').style.display='block';
}
function vCopyLink() {
  const url=document.getElementById('v-generated-link')?.textContent;
  navigator.clipboard.writeText(url||'').catch(()=>{});
  const btn=document.getElementById('v-copy-btn');
  if(btn){btn.textContent='✓ Copiado!';setTimeout(()=>{btn.textContent='Copiar';},2000);}
}

// ── SALES TABLE ──────────────────────────────────────────
const SALES=[
  {date:'03/05',name:'Roberta Coelho',  plan:'6m', channel:'Indicação',value:'R$1.422',status:'pago'},
  {date:'02/05',name:'Carlos Henrique', plan:'12m',channel:'YouTube',  value:'R$3.204',status:'pago'},
  {date:'02/05',name:'Alessandra Kim',  plan:'3m', channel:'Instagram',value:'R$591',  status:'pago'},
  {date:'01/05',name:'Bruno Castilho',  plan:'6m', channel:'Indicação',value:'R$1.422',status:'pendente'},
  {date:'30/04',name:'Priscila Neves',  plan:'1m', channel:'TikTok',   value:'R$147',  status:'pago'},
  {date:'29/04',name:'Marcos Vieira',   plan:'12m',channel:'Instagram',value:'R$3.204',status:'pago'},
  {date:'28/04',name:'Simone Alves',    plan:'6m', channel:'Indicação',value:'R$1.422',status:'pago'},
  {date:'27/04',name:'Renato Costa',    plan:'3m', channel:'Google',   value:'R$591',  status:'cancelado'},
  {date:'26/04',name:'Tatiana Moura',   plan:'12m',channel:'Instagram',value:'R$3.204',status:'pago'},
  {date:'25/04',name:'Henrique Lins',   plan:'6m', channel:'YouTube',  value:'R$1.422',status:'pago'},
];
const SC={
  pago:      'background:rgba(74,222,128,0.1);color:var(--green);border:1px solid rgba(74,222,128,0.2)',
  pendente:  'background:rgba(251,191,36,0.1);color:var(--amber);border:1px solid rgba(251,191,36,0.2)',
  cancelado: 'background:rgba(248,113,113,0.1);color:var(--red);border:1px solid rgba(248,113,113,0.2)',
};
function renderSalesTable() {
  const el=document.getElementById('v-sales-body'); if(!el) return;
  el.innerHTML=SALES.map(s=>`<tr>
    <td style="font-family:'DM Mono',monospace;font-size:11px;color:var(--silver);padding:9px 10px;border-bottom:1px solid rgba(168,178,189,0.04)">${s.date}</td>
    <td style="font-family:'DM Mono',monospace;font-size:11px;color:var(--silver);padding:9px 10px;border-bottom:1px solid rgba(168,178,189,0.04)">${s.name}</td>
    <td style="font-family:'DM Mono',monospace;font-size:11px;color:var(--silver);padding:9px 10px;border-bottom:1px solid rgba(168,178,189,0.04)">${s.plan}</td>
    <td style="font-family:'DM Mono',monospace;font-size:11px;color:var(--silver);padding:9px 10px;border-bottom:1px solid rgba(168,178,189,0.04)">${s.channel}</td>
    <td style="font-family:'DM Mono',monospace;font-size:11px;color:var(--gold);text-align:right;padding:9px 10px;border-bottom:1px solid rgba(168,178,189,0.04)">${s.value}</td>
    <td style="padding:9px 10px;border-bottom:1px solid rgba(168,178,189,0.04)"><span style="font-family:'DM Mono',monospace;font-size:8px;padding:3px 9px;${SC[s.status]}">${s.status.toUpperCase()}</span></td>
  </tr>`).join('');
}

// ── INIT ─────────────────────────────────────────────────
// ── API CALL HELPER ──────────────────────────────────────────
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

// ── LOAD DASHBOARD FROM NEON ─────────────────────────────────
async function loadDashboard() {
  const token   = localStorage.getItem('mf_token');
  const session = JSON.parse(localStorage.getItem('mf_user') || 'null');
  if (!token || !session) { window.location.href = '/'; return; }

  const personalId = session.id;

  // User info in header
  const name     = session.name || 'Personal';
  const initials = name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
  const h1 = document.getElementById('dash-user-h1');
  if (h1) h1.innerHTML = name + ' — <em>Personal Trainer</em>';
  const nameEl   = document.getElementById('dash-user-name');
  const avatarEl = document.getElementById('dash-user-avatar');
  if (nameEl)   nameEl.textContent   = name;
  if (avatarEl) avatarEl.textContent = initials;

  // ── Charts BI (inicializa com mock enquanto carrega) ──
  initBICharts();
  initVendasCharts();

  // ── Load em paralelo ──────────────────────────────────
  const [metrics, studentsData, leadsData, plansData] = await Promise.all([
    api('/metrics/' + personalId).catch(() => null),
    api('/students/' + personalId).catch(() => null),
    api('/leads/' + personalId).catch(() => null),
    api('/plans/' + personalId).catch(() => null),
  ]);

  // ── Atualiza KPIs do header ───────────────────────────
  if (metrics) {
    updateKPICards(metrics);
    updateAlertBar(metrics);
    if (metrics.mrr_history?.length) updateMRRChart(metrics);
  }

  // ── Atualiza select e lista de alunos ─────────────────
  if (studentsData?.length) {
    loadStudentsFromAPI(studentsData);
  } else {
    // sem alunos no banco ainda — mantém mock
    renderChurnList();
    renderTopTable();
    updateStudent();
  }

  // ── Atualiza kanban com leads reais ───────────────────
  if (leadsData) {
    loadLeadsFromAPI(leadsData);
  } else {
    renderKanban();
  }

  // ── Planos nos cards de venda ─────────────────────────
  if (plansData?.length) {
    loadPlansFromAPI(plansData);
  }

  renderSalesTable();
  if (typeof updateFormStudentName === "function") updateFormStudentName();
}

// ── UPDATE KPI CARDS ─────────────────────────────────────────
function updateKPICards(m) {
  const fmt = (n) => {
    if (n >= 1000) return 'R$' + (n/1000).toFixed(1) + 'K';
    return 'R$' + Math.round(n).toLocaleString('pt-BR');
  };
  // MRR
  const mrrEl = document.querySelector('.kpi-card:nth-child(1) .kpi-value');
  if (mrrEl) mrrEl.textContent = fmt(m.mrr || 0);
  // Alunos ativos
  const alunosEl = document.querySelector('.kpi-card:nth-child(2) .kpi-value');
  if (alunosEl) alunosEl.textContent = m.active_students || 0;
  // Ticket médio
  const ticketEl = document.querySelector('.kpi-card:nth-child(3) .kpi-value');
  if (ticketEl) ticketEl.textContent = fmt(m.avg_ticket || 0);
  // Meta pills no header
  const pills = document.querySelectorAll('.meta-pill span');
  if (pills[0]) pills[0].textContent = m.active_students || 0;
  if (pills[1]) pills[1].textContent = fmt(m.mrr || 0);
}

// ── UPDATE ALERT BAR ─────────────────────────────────────────
function updateAlertBar(m) {
  const e7 = m.expiring_7d?.count || 0;
  const e7v = m.expiring_7d?.value || 0;
  const e30 = m.expiring_30d?.count || 0;
  // Update alert items
  const alerts = document.querySelectorAll('.alert-item');
  if (alerts[0]) {
    const span = alerts[0].querySelector('strong') || alerts[0].querySelector('.alert-val');
    if (span) span.textContent = e7 + ' alunos — R$ ' + Math.round(e7v).toLocaleString('pt-BR') + ' em risco';
  }
}

// ── UPDATE MRR CHART ─────────────────────────────────────────
function updateMRRChart(m) {
  if (!charts['mrrChart'] || !m.mrr_history?.length) return;
  charts['mrrChart'].data.labels   = m.mrr_history.map(r => r.month);
  charts['mrrChart'].data.datasets[0].data = m.mrr_history.map(r => parseFloat(r.mrr) || 0);
  charts['mrrChart'].update();
}

// ── LOAD STUDENTS FROM API ───────────────────────────────────
function loadStudentsFromAPI(data) {
  // Rebuild students object from API data
  Object.keys(students).forEach(k => delete students[k]);

  const sel = document.getElementById('studentSelect');
  if (sel) sel.innerHTML = '';

  data.forEach(s => {
    const key = s.id; // UUID from DB
    const weightLost = s.weight_initial && s.weight_current
      ? (s.weight_current - s.weight_initial).toFixed(1)
      : '—';
    const weightLostLabel = parseFloat(weightLost) < 0
      ? weightLost + ' kg'
      : '+' + weightLost + ' kg';

    students[key] = {
      avatar:   s.name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase(),
      name:     s.name,
      time:     calcTime(s.student_since),
      plan:     (s.plan_name || 'Plano') + ' — R$' + Math.round(s.price_paid || 0) + '/mês',
      channel:  capitalize(s.channel || 'instagram'),
      ltv:      'R$' + Math.round(s.ltv_total || 0).toLocaleString('pt-BR'),
      sk1:      '—', sk2:'—', sk3:'—', sk4:'—',
      // Dados reais de peso
      weight:   buildWeightData(s),
      freq:     [5,4,5,5,4,5,4,5,5,4,5,5,4,5,5,4,5,5,5,4], // será substituído pelos checkins
      mood:     { labels:['Sem1','Sem2','Sem3','Sem4','Sem5','Sem6'], data:[4,4,4,4,4,4] },
      photos:   buildPhotos(s),
      timeline: [],
      responses: [],
      stats: buildStats(s),
      engagement: buildEngagement(s),
      // Flag de churn
      churnRisk: (s.days_to_expire !== null && s.days_to_expire <= 7),
    };

    // Populate select
    if (sel) {
      const opt = document.createElement('option');
      opt.value = key;
      const churn = s.days_to_expire <= 7 ? ' · ⚠ CHURN RISCO' : '';
      opt.textContent = s.name + ' — ' + (s.plan_name || 'Plano') + churn;
      sel.appendChild(opt);
    }
  });

  // Load checkins for first student
  if (data.length > 0) {
    loadStudentCheckins(data[0].id);
  }

  renderChurnListFromAPI(data);
  renderTopTableFromAPI(data);
  updateStudent();
}

function calcTime(since) {
  if (!since) return '—';
  const months = Math.floor((new Date() - new Date(since)) / (1000*60*60*24*30));
  return months + ' meses';
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function buildWeightData(s) {
  const kg = [s.weight_initial, s.weight_current].filter(Boolean);
  if (kg.length < 2) return students['beatriz']?.weight || { labels:['Início','Atual'], kg:[70,68], bf:[25,22] };
  return {
    labels: ['Início', 'Atual'],
    kg: [parseFloat(s.weight_initial), parseFloat(s.weight_current)],
    bf: [parseFloat(s.bf_initial) || 25, parseFloat(s.bf_current) || 22],
  };
}

function buildPhotos(s) {
  return [
    { date:'INÍCIO', desc:'Peso inicial · ' + (s.weight_initial || '—') + ' kg', label:'Peso Inicial', val:(s.weight_initial || '—') + ' kg' },
    { date:'ATUAL',  desc:'Peso atual · '   + (s.weight_current  || '—') + ' kg', label:'Atual',        val:(s.weight_current  || '—') + ' kg', highlight:true },
  ];
}

function buildStats(s) {
  const lost = s.weight_initial && s.weight_current
    ? (s.weight_current - s.weight_initial).toFixed(1)
    : 0;
  const lostPct = s.weight_initial ? Math.abs(lost / s.weight_initial * 100) : 0;
  return {
    pesoLabel: (lost < 0 ? '− ' : '+ ') + Math.abs(lost) + ' kg',
    pesoBar:   Math.min(100, Math.round(lostPct * 3)),
    bfLabel:   s.bf_initial && s.bf_current ? '− ' + (s.bf_initial - s.bf_current).toFixed(1) + ' pp' : '—',
    bfBar:     50,
    metaLabel: '—', metaBar: 50,
    engLabel:  '—', engBar:  50, engColor:'var(--gold)',
  };
}

function buildEngagement(s) {
  return {
    score: '—', scoreColor: 'green',
    bars: [
      { label:'Frequência de Treino',          val:'Carregando...', pct:0, color:'var(--dim)' },
      { label:'Responsividade ao Formulário',  val:'Carregando...', pct:0, color:'var(--dim)' },
      { label:'Probabilidade de Renovação',    val: s.days_to_expire <= 30 ? 'Vence em ' + s.days_to_expire + 'd' : 'Ativo', pct: s.days_to_expire <= 30 ? 40 : 80, color: s.days_to_expire <= 7 ? 'var(--red)' : 'var(--green)' },
    ],
    mood: { labels:['Sem1','Sem2','Sem3','Sem4','Sem5','Sem6'], data:[3,3,4,3,4,4] },
  };
}

// ── LOAD CHECKINS FOR STUDENT ────────────────────────────────
async function loadStudentCheckins(studentId) {
  const data = await api('/checkins/' + studentId).catch(() => null);
  if (!data?.length) return;
  const s = students[studentId];
  if (!s) return;

  // Map checkins to responses format
  s.responses = data.map(c => {
    const date = new Date(c.responded_at || c.created_at);
    const dateStr = date.toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit',year:'2-digit'});
    const mood = c.mood_score || 3;
    const moodEmoji = ['😞','😐','🙂','😊','🔥'][mood-1] || '😊';
    const moodStr = Array(mood).fill(moodEmoji).join('');
    const treinos = c.trainings_done || 0;
    const tag = treinos >= 5 ? 'Ótima semana' : treinos >= 4 ? 'Boa semana' : treinos >= 3 ? 'Semana ok' : 'Semana difícil';
    return {
      week: 'Check-in',
      date: dateStr,
      mood: moodStr,
      tag,
      summary: c.training_feedback || 'Sem observações.',
      fields: [
        { l:'Treinos realizados', v: treinos + ' de 5' },
        ...(c.had_pain ? [{ l:'Dor relatada', v: c.pain_description || 'Sim' }] : []),
        ...(c.weight_reported ? [{ l:'Peso reportado', v: c.weight_reported + ' kg' }] : []),
        ...(c.mood_score ? [{ l:'Disposição', v: c.mood_score + '/5' }] : []),
      ]
    };
  });

  // Update weight history from checkins
  if (data.length > 1) {
    const weights = data.filter(c => c.weight_reported).reverse();
    if (weights.length >= 2) {
      s.weight.labels = weights.map(c => new Date(c.created_at).toLocaleDateString('pt-BR',{month:'short',year:'2-digit'}));
      s.weight.kg     = weights.map(c => parseFloat(c.weight_reported));
      s.weight.bf     = weights.map(c => parseFloat(c.bf_measured) || s.weight.bf[0] || 22);
    }
  }

  updateStudent();
}

// ── CHURN LIST FROM API ──────────────────────────────────────
function renderChurnListFromAPI(data) {
  const el = document.getElementById('churn-list');
  if (!el) return;
  const atRisk = data.filter(s => s.days_to_expire <= 21 || s.days_to_expire === null);
  if (!atRisk.length) {
    el.innerHTML = '<div style="font-family:"DM Mono",monospace;font-size:10px;color:var(--dim);padding:16px 0">Nenhum aluno em risco crítico ✓</div>';
    return;
  }
  el.innerHTML = atRisk.slice(0, 6).map(s => {
    const level = s.days_to_expire <= 7 ? 'high' : 'med';
    const detail = s.days_to_expire <= 7
      ? 'Plano vence em ' + s.days_to_expire + ' dias · R$' + Math.round(s.price_paid) + ' em risco'
      : 'Plano vence em ' + s.days_to_expire + ' dias';
    const initials = s.name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
    return `<div class="churn-item">
      <div class="churn-avatar">${initials}</div>
      <div><div class="churn-name">${s.name}</div><div class="churn-detail">${detail}</div></div>
      <div class="churn-badge ${level}">${level==='high'?'CRÍTICO':'MÉDIO'}</div>
    </div>`;
  }).join('');
}

// ── TOP TABLE FROM API ────────────────────────────────────────
function renderTopTableFromAPI(data) {
  const el = document.getElementById('table-top-students');
  if (!el) return;
  const sorted = [...data].sort((a,b) => (b.ltv_total||0) - (a.ltv_total||0)).slice(0,10);
  el.innerHTML = '<thead><tr><th>#</th><th>Nome</th><th>Plano</th><th>Tempo</th><th>Canal</th><th style="text-align:right">LTV</th><th style="text-align:right">Renovações</th></tr></thead>'
    + '<tbody>' + sorted.map((s,i) => `<tr>
      <td class="num">${i+1}</td>
      <td>${s.name}</td>
      <td>${s.plan_name || '—'}</td>
      <td>${calcTime(s.student_since)}</td>
      <td>${capitalize(s.channel || '—')}</td>
      <td class="num">R$${Math.round(s.ltv_total||0).toLocaleString('pt-BR')}</td>
      <td class="num">${s.renewals_count || 0}×</td>
    </tr>`).join('') + '</tbody>';
}

// ── LOAD LEADS FROM API ──────────────────────────────────────
function loadLeadsFromAPI(pipeline) {
  // Clear KDATA and rebuild from API
  Object.keys(KDATA).forEach(k => KDATA[k] = []);
  Object.keys(kStatus).forEach(k => delete kStatus[k]);

  Object.entries(pipeline).forEach(([status, leads]) => {
    leads.forEach(l => {
      const card = {
        id:    l.id,
        name:  l.name,
        sub:   capitalize(l.channel || 'instagram') + ' · ' + capitalize(l.goal || 'emagrecimento'),
        val:   l.plan_name ? l.plan_name + ' · R$' + Math.round(l.price_brl||0) : '',
        days:  calcDays(l.created_at),
        phone: l.phone || '',
        email: l.email || '',
        canal: capitalize(l.channel || 'instagram'),
        dp:    daysSince(l.created_at),
        ok:    status === 'fechado',
        lost:  status === 'perdido',
        hot:   status === 'proposta',
      };
      KDATA[status] = KDATA[status] || [];
      KDATA[status].push(card);
      kStatus[l.id] = status;
    });
  });

  renderKanban();
}

function calcDays(dateStr) {
  if (!dateStr) return '—';
  const days = daysSince(dateStr);
  if (days === 0) return 'Hoje';
  if (days === 1) return '1d';
  return days + 'd';
}

function daysSince(dateStr) {
  if (!dateStr) return 0;
  return Math.floor((new Date() - new Date(dateStr)) / (1000*60*60*24));
}

// ── LOAD PLANS FROM API ──────────────────────────────────────
function loadPlansFromAPI(plans) {
  // Atualiza os cards de plano na aba vendas
  const grid = document.querySelector('.plans-grid-v');
  if (!grid || !plans.length) return;
  grid.innerHTML = plans.map((p, i) => {
    const cls = ['p1','p3','p6','p12'][Math.min(i,3)];
    const colors = ['var(--red)','var(--amber)','var(--gold)','var(--green)'];
    return `<div class="plan-card-v ${cls}${i===2?' sel':''}" data-id="${p.id}" data-dur="${p.duration_months}m" data-price="${p.price_brl}" onclick="vSelectPlan(this)" style="${i===2?'border-color:rgba(201,168,76,0.35);background:rgba(201,168,76,0.05)':''}">
      <div style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:0.1em;color:${colors[Math.min(i,3)]};text-transform:uppercase;margin-bottom:6px">${p.name}</div>
      <div class="plan-price" style="font-family:'Cormorant Garamond',serif;font-size:1.3rem;color:var(--white)">R$${Math.round(p.price_brl)}</div>
      <div class="plan-dur" style="font-family:'DM Mono',monospace;font-size:9px;color:var(--dim)">${p.duration_months} meses</div>
    </div>`;
  }).join('');
}

// ── SAVE LEAD TO API ─────────────────────────────────────────
async function saveLeadToAPI(leadData) {
  const session = JSON.parse(localStorage.getItem('mf_user') || 'null');
  if (!session) return null;
  return api('/leads', {
    method: 'POST',
    body: JSON.stringify({ ...leadData, personal_id: session.id }),
  });
}

// ── UPDATE LEAD STATUS IN API ────────────────────────────────
async function updateLeadInAPI(leadId, status, notes) {
  return api('/leads/' + leadId, {
    method: 'PATCH',
    body: JSON.stringify({ status, notes }),
  });
}

// ═══════════════════════════════════════════════════════
//  CONFIGURAÇÕES
// ═══════════════════════════════════════════════════════
let cfgPlanos = [];
let cfgEditingPlanId = null;

async function initConfig() {
  const session = JSON.parse(localStorage.getItem('mf_user') || 'null');
  if (!session) return;
  const personalId = session.personal_id || session.id;

  // Preenche perfil
  const nomeEl = document.getElementById('cfg-nome');
  if (nomeEl) nomeEl.value = session.name || '';

  // Carrega planos (todos, incluindo inativos) e alunos
  const [planos, alunos] = await Promise.all([
    api('/plans/' + personalId + '?all=true').catch(() => []),
    api('/students/' + personalId).catch(() => []),
  ]);

  cfgPlanos = planos || [];
  renderPlanosList(cfgPlanos);
  renderAlunosList(alunos || []);
  populatePlanoSelect(cfgPlanos);

  // Seta data de hoje como padrão
  const inicioEl = document.getElementById('cfg-aluno-inicio');
  if (inicioEl) inicioEl.value = new Date().toISOString().split('T')[0];
}

function renderPlanosList(planos) {
  const el = document.getElementById('cfg-planos-lista');
  if (!el) return;
  if (!planos.length) {
    el.innerHTML = '<div style="font-family:DM Mono,monospace;font-size:10px;color:var(--dim);padding:20px 0;text-align:center">Nenhum plano cadastrado. Clique em + Novo Plano para começar.</div>';
    return;
  }
  const rows = planos.map(function(p) {
    const dur    = p.duration_months + (p.duration_months === 1 ? ' mês' : ' meses');
    const preco  = 'R$' + parseFloat(p.price_brl).toFixed(2);
    const status = p.is_active
      ? '<span style="font-size:8px;padding:3px 8px;background:rgba(74,222,128,0.1);color:var(--green);border:1px solid rgba(74,222,128,0.2)">ATIVO</span>'
      : '<span style="font-size:8px;padding:3px 8px;background:rgba(168,178,189,0.08);color:var(--dim);border:1px solid rgba(168,178,189,0.1)">INATIVO</span>';
    const editBtn   = '<button onclick="editarPlano(' + JSON.stringify(p.id) + ')" style="font-size:8px;padding:4px 10px;background:transparent;border:1px solid rgba(201,168,76,0.25);color:var(--gold);cursor:pointer;margin-right:6px">Editar</button>';
    const toggleBtn = p.is_active
      ? '<button onclick="togglePlanoStatus(' + JSON.stringify(p.id) + ',true)" style="font-size:8px;padding:4px 10px;background:transparent;border:1px solid rgba(248,113,113,0.25);color:var(--red);cursor:pointer">Desativar</button>'
      : '<button onclick="togglePlanoStatus(' + JSON.stringify(p.id) + ',false)" style="font-size:8px;padding:4px 10px;background:transparent;border:1px solid rgba(74,222,128,0.25);color:var(--green);cursor:pointer">Ativar</button>';
    return '<tr><td>' + p.name + '</td><td>' + dur + '</td><td style="text-align:right;color:var(--gold)">' + preco + '</td><td style="text-align:right">' + status + '</td><td style="text-align:right">' + editBtn + toggleBtn + '</td></tr>';
  }).join('');
  el.innerHTML = '<table class="data-table" style="width:100%"><thead><tr><th>Nome</th><th>Duração</th><th style="text-align:right">Preço</th><th style="text-align:right">Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>';
}

function abrirModalPlano() {
  cfgEditingPlanId = null;
  document.getElementById('cfg-plano-form-title').textContent = 'NOVO PLANO';
  document.getElementById('cfg-plano-nome').value    = '';
  document.getElementById('cfg-plano-preco').value   = '';
  document.getElementById('cfg-plano-duracao').value = '6';
  document.getElementById('cfg-plano-id').value      = '';
  document.getElementById('cfg-plano-ok').style.display   = 'none';
  document.getElementById('cfg-plano-erro').style.display = 'none';
  document.getElementById('cfg-plano-form').style.display = 'block';
  document.getElementById('cfg-plano-nome').focus();
}

function fecharModalPlano() {
  document.getElementById('cfg-plano-form').style.display = 'none';
  cfgEditingPlanId = null;
}

function editarPlano(planId) {
  const plano = cfgPlanos.find(p => p.id === planId);
  if (!plano) return;
  cfgEditingPlanId = planId;
  document.getElementById('cfg-plano-form-title').textContent = 'EDITAR PLANO';
  document.getElementById('cfg-plano-nome').value    = plano.name;
  document.getElementById('cfg-plano-preco').value   = plano.price_brl;
  document.getElementById('cfg-plano-duracao').value = plano.duration_months;
  document.getElementById('cfg-plano-id').value      = planId;
  document.getElementById('cfg-plano-ok').style.display   = 'none';
  document.getElementById('cfg-plano-erro').style.display = 'none';
  document.getElementById('cfg-plano-form').style.display = 'block';
  document.getElementById('cfg-plano-nome').focus();
}

async function salvarPlano() {
  const nome    = document.getElementById('cfg-plano-nome').value.trim();
  const duracao = parseInt(document.getElementById('cfg-plano-duracao').value);
  const preco   = parseFloat(document.getElementById('cfg-plano-preco').value);
  const planId  = document.getElementById('cfg-plano-id').value;
  const erroEl  = document.getElementById('cfg-plano-erro');
  const okEl    = document.getElementById('cfg-plano-ok');
  erroEl.style.display = 'none';

  if (!nome)         { erroEl.textContent = 'Informe o nome do plano.'; erroEl.style.display = 'block'; return; }
  if (!preco || preco <= 0) { erroEl.textContent = 'Informe um preço válido.'; erroEl.style.display = 'block'; return; }

  const session    = JSON.parse(localStorage.getItem('mf_user') || 'null');
  const personalId = session && (session.personal_id || session.id);
  const btn        = document.getElementById('cfg-plano-save-btn');
  btn.disabled     = true; btn.textContent = 'Salvando...';

  try {
    if (planId) {
      await api('/plans/' + planId, { method:'PATCH', body:JSON.stringify({ name:nome, duration_months:duracao, price_brl:preco }) });
    } else {
      await api('/plans', { method:'POST', body:JSON.stringify({ personal_id:personalId, name:nome, duration_months:duracao, price_brl:preco }) });
    }
    const planos = await api('/plans/' + personalId + '?all=true').catch(() => []);
    cfgPlanos    = planos || [];
    renderPlanosList(cfgPlanos);
    populatePlanoSelect(cfgPlanos);
    if (planos.length) loadPlansFromAPI(planos.filter(p => p.is_active));
    okEl.style.display = 'block';
    setTimeout(() => { fecharModalPlano(); okEl.style.display = 'none'; }, 2000);
  } catch (err) {
    erroEl.textContent = err.message || 'Erro ao salvar plano.';
    erroEl.style.display = 'block';
  }
  btn.disabled = false; btn.textContent = 'Salvar Plano';
}

async function togglePlanoStatus(planId, isActive) {
  try {
    await api('/plans/' + planId, { method:'PATCH', body:JSON.stringify({ is_active:!isActive }) });
    const session    = JSON.parse(localStorage.getItem('mf_user') || 'null');
    const personalId = session && (session.personal_id || session.id);
    const planos     = await api('/plans/' + personalId + '?all=true').catch(() => []);
    cfgPlanos        = planos || [];
    renderPlanosList(cfgPlanos);
  } catch(err) { alert('Erro: ' + err.message); }
}

function populatePlanoSelect(planos) {
  const sel = document.getElementById('cfg-aluno-plano');
  if (!sel) return;
  sel.innerHTML = '<option value="">Selecione o plano...</option>'
    + planos.filter(p => p.is_active).map(p =>
        '<option value="' + p.id + '" data-price="' + p.price_brl + '">' + p.name + ' — R$' + parseFloat(p.price_brl).toFixed(0) + '</option>'
      ).join('');
}

function toggleCadastroAluno() {
  const form = document.getElementById('cfg-aluno-form');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
  if (form.style.display === 'block') document.getElementById('cfg-aluno-nome').focus();
}

async function cadastrarAluno() {
  const nome     = document.getElementById('cfg-aluno-nome').value.trim();
  const phone    = document.getElementById('cfg-aluno-phone').value.trim();
  const email    = document.getElementById('cfg-aluno-email').value.trim();
  const canal    = document.getElementById('cfg-aluno-canal').value;
  const objetivo = document.getElementById('cfg-aluno-objetivo').value;
  const planId   = document.getElementById('cfg-aluno-plano').value;
  const inicio   = document.getElementById('cfg-aluno-inicio').value;
  const pgto     = document.getElementById('cfg-aluno-pagamento').value;
  const peso     = parseFloat(document.getElementById('cfg-aluno-peso').value) || null;
  const bf       = parseFloat(document.getElementById('cfg-aluno-bf').value)   || null;
  const obs      = document.getElementById('cfg-aluno-obs').value.trim();
  const okEl     = document.getElementById('cfg-aluno-ok');
  const erroEl   = document.getElementById('cfg-aluno-erro');
  okEl.style.display = erroEl.style.display = 'none';

  if (!nome)   { erroEl.textContent = 'Informe o nome.';      erroEl.style.display='block'; return; }
  if (!phone)  { erroEl.textContent = 'Informe o WhatsApp.';  erroEl.style.display='block'; return; }
  if (!planId) { erroEl.textContent = 'Selecione um plano.';  erroEl.style.display='block'; return; }
  if (!inicio) { erroEl.textContent = 'Informe o início.';    erroEl.style.display='block'; return; }

  const session    = JSON.parse(localStorage.getItem('mf_user') || 'null');
  const personalId = session && (session.personal_id || session.id);
  const plano      = cfgPlanos.find(p => p.id === planId);
  const meses      = plano ? plano.duration_months : 1;
  const fimDate    = new Date(inicio);
  fimDate.setMonth(fimDate.getMonth() + meses);
  const fim = fimDate.toISOString().split('T')[0];

  const btn = document.querySelector('#cfg-aluno-form button.vbtn-green');
  if (btn) { btn.disabled=true; btn.textContent='Cadastrando...'; }

  try {
    const aluno = await api('/students', { method:'POST', body:JSON.stringify({
      personal_id:personalId, name:nome, phone, email:email||null,
      goal:objetivo, channel:canal, weight_initial:peso, bf_initial:bf, notes:obs||null,
    })});

    await api('/subscriptions', { method:'POST', body:JSON.stringify({
      student_id:aluno.id, personal_id:personalId, plan_id:planId,
      price_paid:plano ? plano.price_brl : 0,
      starts_at:inicio, expires_at:fim,
      payment_method:pgto, status:'active',
    })});

    okEl.textContent   = '✓ ' + nome + ' cadastrado! Assinatura ativa até ' + new Date(fim).toLocaleDateString('pt-BR');
    okEl.style.display = 'block';
    ['cfg-aluno-nome','cfg-aluno-phone','cfg-aluno-email','cfg-aluno-peso','cfg-aluno-bf','cfg-aluno-obs']
      .forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
    const alunos = await api('/students/' + personalId).catch(() => []);
    renderAlunosList(alunos);
    setTimeout(() => loadDashboard(), 1500);
  } catch(err) {
    erroEl.textContent = err.message || 'Erro ao cadastrar.';
    erroEl.style.display = 'block';
  }
  if (btn) { btn.disabled=false; btn.textContent='Cadastrar Aluno'; }
}

function renderAlunosList(alunos) {
  const el = document.getElementById('cfg-alunos-lista');
  if (!el) return;
  if (!alunos.length) {
    el.innerHTML = '<div style="font-size:10px;color:var(--dim);padding:12px 0">Nenhum aluno cadastrado ainda.</div>';
    return;
  }
  const rows = alunos.map(function(a) {
    const days      = a.days_to_expire;
    const daysColor = days <= 7 ? 'var(--red)' : days <= 30 ? 'var(--amber)' : 'var(--green)';
    const daysText  = days === 0 ? 'Hoje' : days < 0 ? 'Vencido' : days + 'd';
    const ltv       = 'R$' + Math.round(a.ltv_total || 0).toLocaleString('pt-BR');
    const encBtn    = '<button onclick="encerrarContrato(' + JSON.stringify(a.id) + ',' + JSON.stringify(a.name) + ')" style="font-size:8px;padding:4px 10px;background:transparent;border:1px solid rgba(248,113,113,0.25);color:var(--red);cursor:pointer">Encerrar</button>';
    return '<tr><td>' + a.name + '</td><td>' + (a.plan_name||'—') + '</td><td style="color:' + daysColor + '">' + daysText + '</td><td style="text-transform:capitalize">' + (a.channel||'—') + '</td><td style="text-align:right;color:var(--gold)">' + ltv + '</td><td style="text-align:right">' + encBtn + '</td></tr>';
  }).join('');
  el.innerHTML = '<div style="font-size:9px;color:var(--dim);margin-bottom:10px">' + alunos.length + ' aluno(s) ativo(s)</div>'
    + '<table class="data-table" style="width:100%"><thead><tr><th>Nome</th><th>Plano</th><th>Vence em</th><th>Canal</th><th style="text-align:right">LTV</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>';
}

async function encerrarContrato(studentId, name) {
  if (!confirm('Encerrar contrato de ' + name + '?')) return;
  try {
    await api('/students/' + studentId + '/cancel', { method:'POST' });
    const session    = JSON.parse(localStorage.getItem('mf_user') || 'null');
    const personalId = session && (session.personal_id || session.id);
    const alunos     = await api('/students/' + personalId).catch(() => []);
    renderAlunosList(alunos);
    loadDashboard();
  } catch(err) { alert('Erro: ' + err.message); }
}

function salvarPerfil() {
  const nome = document.getElementById('cfg-nome').value.trim();
  const okEl = document.getElementById('cfg-perfil-ok');
  if (!nome) return;
  const session = JSON.parse(localStorage.getItem('mf_user') || 'null');
  if (session) { session.name = nome; localStorage.setItem('mf_user', JSON.stringify(session)); }
  const h1 = document.getElementById('dash-user-h1');
  if (h1) h1.innerHTML = nome + ' — <em>Personal Trainer</em>';
  const nameEl = document.getElementById('dash-user-name');
  if (nameEl) nameEl.textContent = nome;
  okEl.style.display = 'block';
  setTimeout(() => { okEl.style.display = 'none'; }, 2500);
}

document.addEventListener('DOMContentLoaded', () => { loadDashboard(); });