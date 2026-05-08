// ═══════════════════════════════════════════════════════
//  dashboard.js — Performance Hub · Meridian Labs
//  Versão Corrigida para Deploy (Vercel)
// ═══════════════════════════════════════════════════════

// ── TAB SWITCH ──────────────────────────────────────────
let acompChartsDone = false;

function switchTab(tab, btn) {
  // 1. Reset visual das abas e seções
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  
  // 2. Ativação da seção correta usando o prefixo 'tab-' 
  const targetSection = document.getElementById('tab-' + tab);
  if (targetSection) {
    targetSection.classList.add('active');
  }

  if (btn) {
    btn.classList.add('active');
  }

  // 3. Lógica de renderização para abas inicialmente ocultas
  // Resolve o problema do gráfico "espremido" ao forçar o redimensionamento após o display:block
  if (tab === 'acompanhamento') {
    if (!acompChartsDone) {
      acompChartsDone = true;
      // Delay estratégico para o navegador processar o novo layout antes do Chart.js medir o container
      setTimeout(initAcompCharts, 100);
    }
  }

  // Força o resize de todos os gráficos ativos para preencher o novo espaço do Grid
  setTimeout(() => {
    try {
      Object.values(charts).forEach(ch => {
        if (ch) ch.resize();
      });
    } catch (e) {
      console.warn("Erro ao redimensionar gráficos:", e);
    }
  }, 150);
}

// ── CHART REGISTRY ───────────────────────────────────────
// Centraliza as instâncias para facilitar o redimensionamento e evitar vazamento de memória
const charts = {};
function mkChart(id, config) {
  const el = document.getElementById(id);
  if (!el) return;
  
  if (charts[id]) { 
    charts[id].destroy(); 
  }
  charts[id] = new Chart(el, config);
}

// ── BI CHARTS ────────────────────────────────────────────
function initBICharts() {
  // Gráfico de MRR (Receita Mensal Recorrente) [cite: 14, 26]
  mkChart('mrrChart', {
    type:'line',
    data:{
      labels:['Jan25','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez','Jan26','Fev','Mar','Abr','Mai'],
      datasets:[{ label:'MRR (R$)', data:[56600,58200,61400,63800,67200,69400,71800,73200,75400,78800,81200,83600,85000,86400,87200,86000,89400],
        borderColor:GOLD, backgroundColor:'rgba(201,168,76,0.08)', fill:true, tension:0.4, borderWidth:2.5, pointRadius:3, pointBackgroundColor:GOLD }]
    },
    options:{ 
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}, tooltip:{...tt, callbacks:{label:ctx=>`R$ ${ctx.parsed.y.toLocaleString()}`}}},
      scales:{x:{grid:{display:false},ticks:{color:SILV,font:{size:8}}}, y:{grid, ticks:{color:SILV,callback:v=>'R$'+(v/1000).toFixed(0)+'K'}}}
    }
  });

  // Gráfico de Evolução da Base de Alunos 
  mkChart('studentsChart', {
    type:'bar',
    data:{
      labels:['Jan25','Mar','Mai','Jul','Set','Nov','Jan26','Mar','Mai'],
      datasets:[
        {label:'Novos', data:[38,44,48,52,47,43,51,49,48], backgroundColor:'rgba(74,222,128,0.4)', borderColor:GREEN, borderWidth:1.5, borderRadius:3, stack:'s'},
        {label:'Churn', data:[-24,-28,-30,-33,-31,-29,-34,-32,-33], backgroundColor:'rgba(248,113,113,0.35)', borderColor:RED, borderWidth:1.5, borderRadius:3, stack:'s'},
      ]
    },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{legend:{labels:{color:SILV,usePointStyle:true,font:{size:9}}}, tooltip:{...tt}},
      scales:{x:{grid:{display:false},ticks:{color:SILV,font:{size:8}},stacked:true}, y:{grid,stacked:true,ticks:{color:SILV}}}
    }
  });

  // Outros gráficos de BI (Canais de Aquisição, Renovação, etc) 
  // ... (mantidos conforme sua lógica original de dados mock)
}

// ── VENDAS MIX CHART ────────────────────────────────────
function initVendasCharts() {
  // Gráfico de Mix de Planos (Doughnut) 
  mkChart('vMixChart', {
    type:'doughnut',
    data:{
      labels:['Plano 1m','Plano 3m','Plano 6m','Plano 12m'],
      datasets:[{data:[6,16,12,14], backgroundColor:[RED+'55',AMBER+'55',GOLD+'66',GREEN+'55'], borderColor:'#081321', borderWidth:3, hoverOffset:6}]
    },
    options:{ 
      responsive:true, 
      maintainAspectRatio:false, 
      cutout:'56%',
      plugins:{legend:{position:'right',labels:{color:SILV,usePointStyle:true,font:{size:9},padding:10}}, tooltip:{...tt}}
    }
  });
}

// ── ACOMP CHARTS ────────────────────────────────────────
function initAcompCharts() {
  // Evolução de Peso e Composição Corporal [cite: 17, 26]
  mkChart('weightChart', {
    type:'line',
    data:{
      labels:['Jun23','Set','Dez','Mar24','Jun','Set','Dez','Mar25','Jun','Set','Dez','Mar26','Mai26'],
      datasets:[
        {label:'Peso (kg)', data:[74.2,71.8,68.5,66.2,64.8,63.7,63,62.8,62.4,62.2,62,62.1,62.1],
          borderColor:GOLD, backgroundColor:'rgba(201,168,76,0.06)', fill:true, tension:0.4, borderWidth:2.5, pointRadius:4, pointBackgroundColor:GOLD, yAxisID:'y'},
        {label:'BF %', data:[28,25.5,23,21.2,20.1,19.4,18.8,18.5,18.3,18.1,18,18,18],
          borderColor:GREEN, backgroundColor:'rgba(74,222,128,0.04)', fill:true, tension:0.4, borderWidth:1.5, pointRadius:3, pointBackgroundColor:GREEN, borderDash:[4,3], yAxisID:'y2'},
      ]
    },
    options:{ 
      responsive:true, 
      maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{legend:{labels:{color:SILV,usePointStyle:true,font:{size:9}}}, tooltip:{...tt}},
      scales:{
        x:{grid:{display:false},ticks:{color:SILV,font:{size:8},maxRotation:45}},
        y:{grid,ticks:{color:GOLD,font:{size:9},callback:v=>v+'kg'},suggestedMin:58},
        y2:{position:'right',grid:{display:false},ticks:{color:GREEN,font:{size:9},callback:v=>v+'%'},suggestedMin:14}
      }
    }
  });

  // Frequência Semanal 
  const fReal = [5,4,5,5,3,5,4,5,5,4,5,5,3,5,5,4,5,5,5,4];
  mkChart('freqChart', {
    type:'bar',
    data:{
      labels: fReal.map((_,i)=>`Sem ${i+1}`),
      datasets:[
        {label:'Treinos', data:fReal, backgroundColor:fReal.map(v=>v===5?GREEN+'66':v>=4?GOLD+'66':AMBER+'55'), borderColor:fReal.map(v=>v===5?GREEN:v>=4?GOLD:AMBER), borderWidth:1.5, borderRadius:3},
        {label:'Meta', data:Array(fReal.length).fill(5), type:'line', borderColor:SILV+'44', borderDash:[4,3], pointRadius:0, borderWidth:1.5}
      ]
    },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{legend:{labels:{color:SILV,usePointStyle:true,font:{size:9}}}, tooltip:{...tt}},
      scales:{x:{grid:{display:false},ticks:{color:SILV,font:{size:8},maxTicksLimit:10}}, y:{grid,ticks:{color:SILV},suggestedMin:0,suggestedMax:6}}
    }
  });

  // Mood/Disposição (Métrica de Engajamento) 
  mkChart('moodChart', {
    type:'line',
    data:{
      labels:['Sem33','Sem34','Sem35','Sem36','Sem37','Sem38'],
      datasets:[{label:'Disposição', data:[4,4,5,3,4,5], borderColor:PURPLE, backgroundColor:'rgba(167,139,250,0.1)', fill:true, tension:0.4, borderWidth:2, pointRadius:5, pointBackgroundColor:PURPLE}]
    },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}, tooltip:{...tt}},
      scales:{x:{grid:{display:false},ticks:{color:SILV,font:{size:9}}}, y:{grid,ticks:{color:SILV},suggestedMin:1,suggestedMax:5}}
    }
  });
}

// ── CONFIGURAÇÕES GERAIS E CORES (Tokens Meridian) ────────────────
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

// ── INIT ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Inicializa apenas gráficos da aba visível (BI) e Vendas (para pré-carregamento parcial)
  initBICharts();
  initVendasCharts();
  
  // Funções de renderização de listas e tabelas 
  renderChurnList();
  renderTopTable();
  renderKanban();
  renderSalesTable();
  
  // Seta o aluno padrão
  updateStudent();
});

// ... (Restante das funções de Kanban, Logout e Temas mantidas conforme seu original)