// ── TAB SWITCH ──────────────────────────────────────────────────
let acompChartsDone = false;
function switchTab(tab, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  if(btn) btn.classList.add('active');
  else if(event && event.target) event.target.classList.add('active');
  // Lazy-init acompanhamento charts on first visit
  if (tab === 'acompanhamento') {
    if (!acompChartsDone) {
      acompChartsDone = true;
      setTimeout(() => { initAcompCharts(); updateStudent(); }, 80);
    } else {
      setTimeout(() => {
        updateStudent();
        try { Object.values(Chart.instances||{}).forEach(ch=>ch&&ch.resize()); } catch {}
      }, 80);
    }
  }
  // Resize all charts when switching tabs (fixes 0-height issue)
  setTimeout(() => {
    try { Object.values(Chart.instances || {}).forEach(ch => { if(ch) ch.resize(); }); } catch {}
  }, 100);
}

// ── FORM SCALE BUTTONS ──────────────────────────────────────────
document.querySelectorAll('.form-scale').forEach(scale => {
  scale.querySelectorAll('.scale-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      scale.querySelectorAll('.scale-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
});

// ── RESPONSE TOGGLE ─────────────────────────────────────────────
function toggleResponse(el) {
  el.classList.toggle('open');
  const body = el.querySelector('.response-body');
  body.classList.toggle('open');
}

// ── STUDENT SELECT ──────────────────────────────────────────────
const students = {
  beatriz: { avatar:'BT', name:'Beatriz Tavares', time:'38 meses', plan:'12 meses — R$267/mês', channel:'Indicação', ltv:'R$10.146', sk1:'94%', sk2:'8.9', sk3:'4.7/5', sk4:'3 indic.' },
  eduardo: { avatar:'EC', name:'Eduardo Campos', time:'34 meses', plan:'12 meses — R$267/mês', channel:'Instagram', ltv:'R$9.078', sk1:'88%', sk2:'8.1', sk3:'4.4/5', sk4:'1 indic.' },
  fernanda: { avatar:'FL', name:'Fernanda Leal', time:'29 meses', plan:'6 meses — R$237/mês', channel:'YouTube', ltv:'R$6.873', sk1:'79%', sk2:'7.6', sk3:'4.2/5', sk4:'0 indic.' },
  guilherme: { avatar:'GB', name:'Guilherme Braga', time:'27 meses', plan:'6 meses — R$237/mês', channel:'Indicação', ltv:'R$6.399', sk1:'85%', sk2:'7.9', sk3:'4.5/5', sk4:'2 indic.' },
  isabela: { avatar:'IN', name:'Isabela Nunes', time:'24 meses', plan:'3 meses — R$197/mês', channel:'Instagram', ltv:'R$4.728', sk1:'72%', sk2:'6.8', sk3:'3.9/5', sk4:'0 indic.' },
  felipe: { avatar:'FM', name:'Felipe Martins ⚠', time:'7 meses', plan:'3 meses — R$197/mês', channel:'Instagram', ltv:'R$1.379', sk1:'18%', sk2:'1.9', sk3:'2.1/5', sk4:'0 indic.' },
  amanda: { avatar:'AC', name:'Amanda Costa ⚠', time:'3 meses', plan:'1 mês — R$147/mês', channel:'Instagram', ltv:'R$441', sk1:'22%', sk2:'2.1', sk3:'2.4/5', sk4:'0 indic.' },
};
function updateStudent() {
  const s = students[document.getElementById('studentSelect').value];
  document.getElementById('studentAvatar').textContent = s.avatar;
  document.getElementById('studentName').textContent = s.name;
  document.getElementById('studentTime').textContent = s.time;
  document.getElementById('studentPlan').textContent = s.plan;
  document.getElementById('studentChannel').textContent = s.channel;
  document.getElementById('studentLTV').textContent = s.ltv;
  document.getElementById('sk1').textContent = s.sk1;
  document.getElementById('sk2').textContent = s.sk2;
  document.getElementById('sk3').textContent = s.sk3;
  document.getElementById('sk4').textContent = s.sk4;
}

// ── CHART DEFAULTS ──────────────────────────────────────────────
const GOLD='#C9A84C', SILV='#A8B2BD', GREEN='#4ade80', RED='#f87171', AMBER='#fbbf24', BLUE='#60a5fa', PURPLE='#a78bfa';
const grid = { color:'rgba(168,178,189,0.06)', drawBorder:false };
const tt = {
  backgroundColor:'rgba(8,19,33,0.95)',
  borderColor:'rgba(201,168,76,0.2)', borderWidth:1,
  titleColor:SILV, bodyColor:GOLD, padding:10,
  titleFont:{family:'DM Mono, monospace', size:9},
  bodyFont:{family:'DM Mono, monospace', size:11},
};

// ── GLOBAL CHART DEFAULTS: transparent bg, no white canvas ──
Chart.defaults.backgroundColor = 'transparent';
Chart.defaults.borderColor = 'rgba(168,178,189,0.06)';
Chart.defaults.color = SILV;
Chart.defaults.font.family = 'DM Mono, monospace';
Chart.defaults.plugins.legend.labels.color = SILV;
Chart.defaults.scale.grid.color = 'rgba(168,178,189,0.06)';
Chart.defaults.scale.ticks.color = SILV;
// Force all canvases to be transparent
if (Chart.overrides) {
  ['line','bar','doughnut','radar','pie'].forEach(t => {
    if (Chart.overrides[t]) Chart.overrides[t].plugins = Chart.overrides[t].plugins || {};
  });
}

// ── MRR CHART ──────────────────────────────────────────────────
const mrrMonths = ['Jan25','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez','Jan26','Fev','Mar','Abr','Mai'];
const mrrData =   [56600, 58200, 61400, 63800, 67200, 69400, 71800, 73200, 75400, 78800, 81200, 83600, 85000, 86400, 87200, 86000, 89400];
new Chart(document.getElementById('mrrChart'), {
  type:'line',
  data:{ labels:mrrMonths, datasets:[{
    label:'MRR (R$)', data:mrrData,
    borderColor:GOLD, backgroundColor:'rgba(201,168,76,0.08)', fill:true, tension:0.4,
    borderWidth:2.5, pointRadius:3, pointBackgroundColor:GOLD
  }]},
  options:{ responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{display:false}, tooltip:{...tt, callbacks:{label:ctx=>`R$ ${ctx.parsed.y.toLocaleString()}`}} },
    scales:{ x:{grid:{display:false}, ticks:{color:SILV, font:{size:9}}},
             y:{grid, ticks:{color:SILV, callback:v=>'R$'+(v/1000).toFixed(0)+'K'}} }
  }
});

// ── STUDENTS CHART ──────────────────────────────────────────────
const stMonths = ['Jan25','Mar','Mai','Jul','Set','Nov','Jan26','Mar','Mai'];
new Chart(document.getElementById('studentsChart'), {
  type:'bar',
  data:{ labels:stMonths, datasets:[
    { label:'Novos Alunos', data:[38,44,48,52,47,43,51,49,48], backgroundColor:'rgba(74,222,128,0.4)', borderColor:GREEN, borderWidth:1.5, borderRadius:3, stack:'s' },
    { label:'Churn', data:[-24,-28,-30,-33,-31,-29,-34,-32,-33], backgroundColor:'rgba(248,113,113,0.35)', borderColor:RED, borderWidth:1.5, borderRadius:3, stack:'s' },
  ]},
  options:{ responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{labels:{color:SILV, usePointStyle:true, font:{size:9}}}, tooltip:{...tt} },
    scales:{ x:{grid:{display:false}, ticks:{color:SILV, font:{size:9}}},
             y:{grid, stacked:true, ticks:{color:SILV}} }
  }
});

// ── CHANNEL CHART ──────────────────────────────────────────────
new Chart(document.getElementById('channelChart'), {
  type:'bar',
  data:{
    labels:['Instagram','Indicação','YouTube','TikTok','Google','Outros'],
    datasets:[
      { label:'Alunos Ativos', data:[180,92,68,44,18,8], backgroundColor:GOLD+'66', borderColor:GOLD, borderWidth:1.5, borderRadius:3, yAxisID:'y' },
      { label:'LTV Médio (R$)', data:[1340,2180,1680,1120,980,820], backgroundColor:BLUE+'44', borderColor:BLUE, borderWidth:1.5, borderRadius:3, yAxisID:'y2' },
    ]
  },
  options:{ responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{labels:{color:SILV, usePointStyle:true, font:{size:9}}}, tooltip:{...tt} },
    scales:{
      x:{grid:{display:false}, ticks:{color:SILV, font:{size:9}}},
      y:{grid, ticks:{color:GOLD, font:{size:9}}, title:{display:true, text:'Alunos', color:GOLD, font:{size:9}}},
      y2:{position:'right', grid:{display:false}, ticks:{color:BLUE, font:{size:9}, callback:v=>'R$'+v}, title:{display:true, text:'LTV Médio', color:BLUE, font:{size:9}}}
    }
  }
});

// ── RENEWAL CHART ──────────────────────────────────────────────
new Chart(document.getElementById('renewalChart'), {
  type:'bar',
  data:{
    labels:['Plano 1m','Plano 3m','Plano 6m','Plano 12m'],
    datasets:[
      { label:'Taxa Renovação %', data:[52,68,82,91], backgroundColor:[RED+'55',AMBER+'55',GOLD+'55',GREEN+'55'], borderColor:[RED,AMBER,GOLD,GREEN], borderWidth:1.5, borderRadius:4 }
    ]
  },
  options:{ responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{display:false}, tooltip:{...tt, callbacks:{label:ctx=>`${ctx.parsed.y}% renovação`}} },
    scales:{
      x:{grid:{display:false}, ticks:{color:SILV, font:{size:9}}},
      y:{grid, ticks:{color:SILV, callback:v=>v+'%'}, suggestedMin:40, suggestedMax:100}
    }
  }
});

// ── SAZONALIDADE ──────────────────────────────────────────────
new Chart(document.getElementById('seasonChart'), {
  type:'line',
  data:{
    labels:['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'],
    datasets:[{
      label:'Novos Alunos', data:[72,58,68,52,47,31,28,44,56,48,38,24],
      borderColor:GOLD, backgroundColor:'rgba(201,168,76,0.08)', fill:true, tension:0.4,
      borderWidth:2.5, pointRadius:4, pointBackgroundColor:GOLD
    }]
  },
  options:{ responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{display:false}, tooltip:{...tt} },
    scales:{ x:{grid:{display:false}, ticks:{color:SILV, font:{size:9}}},
             y:{grid, ticks:{color:SILV}} }
  }
});

// ── META vs REALIZADO ──────────────────────────────────────────
new Chart(document.getElementById('metaChart'), {
  type:'bar',
  data:{
    labels:['Jan26','Fev','Mar','Abr','Mai'],
    datasets:[
      { label:'Meta', data:[82000,84000,86000,88000,90000], backgroundColor:'rgba(168,178,189,0.1)', borderColor:SILV+'88', borderWidth:1.5, borderRadius:3 },
      { label:'Realizado', data:[85000,86400,87200,86000,89400], backgroundColor:GOLD+'55', borderColor:GOLD, borderWidth:1.5, borderRadius:3 },
    ]
  },
  options:{ responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{labels:{color:SILV, usePointStyle:true, font:{size:9}}}, tooltip:{...tt, callbacks:{label:ctx=>`R$ ${ctx.parsed.y.toLocaleString()}`}} },
    scales:{ x:{grid:{display:false}, ticks:{color:SILV, font:{size:9}}},
             y:{grid, ticks:{color:SILV, callback:v=>'R$'+(v/1000).toFixed(0)+'K'}, suggestedMin:78000} }
  }
});

// ── RPS CHART ──────────────────────────────────────────────────
new Chart(document.getElementById('rpsChart'), {
  type:'doughnut',
  data:{
    labels:['Plano 1m · R$147','Plano 3m · R$197','Plano 6m · R$237','Plano 12m · R$267'],
    datasets:[{ data:[72, 156, 122, 60], backgroundColor:[RED+'55',AMBER+'55',GOLD+'66',GREEN+'55'], borderColor:'#081321', borderWidth:3 }]
  },
  options:{ responsive:true, maintainAspectRatio:false, cutout:'58%',
    plugins:{ legend:{position:'right', labels:{color:SILV, usePointStyle:true, font:{size:9}, padding:12}},
              tooltip:{...tt} }
  }
});

// ── SOCIAL CHART ──────────────────────────────────────────────
new Chart(document.getElementById('socialChart'), {
  type:'radar',
  data:{
    labels:['Volume Alunos','LTV Médio','Taxa Renov.','Engajamento','CAC Eficiência'],
    datasets:[
      { label:'Instagram', data:[90,62,65,75,70], borderColor:GOLD, backgroundColor:'rgba(201,168,76,0.08)', pointBackgroundColor:GOLD, borderWidth:2 },
      { label:'Indicação', data:[45,100,91,88,100], borderColor:GREEN, backgroundColor:'rgba(74,222,128,0.06)', pointBackgroundColor:GREEN, borderWidth:2 },
      { label:'YouTube', data:[34,78,80,82,65], borderColor:BLUE, backgroundColor:'rgba(96,165,250,0.06)', pointBackgroundColor:BLUE, borderWidth:2 },
    ]
  },
  options:{ responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{labels:{color:SILV, usePointStyle:true, font:{size:9}}}, tooltip:{...tt} },
    scales:{ r:{grid:{color:'rgba(168,178,189,0.08)'}, ticks:{display:false}, pointLabels:{color:SILV, font:{size:9}}, angleLines:{color:'rgba(168,178,189,0.06)'}} }
  }
});


function initAcompCharts() {
// ── WEIGHT CHART ──────────────────────────────────────────────
const wMonths = ['Jun23','Set','Dez','Mar24','Jun','Set','Dez','Mar25','Jun','Set','Dez','Mar26','Mai26'];
new Chart(document.getElementById('weightChart'), {
  type:'line',
  data:{ labels:wMonths, datasets:[
    { label:'Peso (kg)', data:[74.2,71.8,68.5,66.2,64.8,63.7,63.0,62.8,62.4,62.2,62.0,62.1,62.1], borderColor:GOLD, backgroundColor:'rgba(201,168,76,0.06)', fill:true, tension:0.4, borderWidth:2.5, pointRadius:4, pointBackgroundColor:GOLD, yAxisID:'y' },
    { label:'BF %', data:[28,25.5,23,21.2,20.1,19.4,18.8,18.5,18.3,18.1,18.0,18.0,18.0], borderColor:GREEN, backgroundColor:'rgba(74,222,128,0.04)', fill:true, tension:0.4, borderWidth:1.5, pointRadius:3, pointBackgroundColor:GREEN, borderDash:[4,3], yAxisID:'y2' },
  ]},
  options:{ responsive:true, maintainAspectRatio:false,
    interaction:{mode:'index', intersect:false},
    plugins:{ legend:{labels:{color:SILV, usePointStyle:true, font:{size:9}}}, tooltip:{...tt} },
    scales:{
      x:{grid:{display:false}, ticks:{color:SILV, font:{size:8}, maxRotation:45}},
      y:{grid, ticks:{color:GOLD, font:{size:9}, callback:v=>v+'kg'}, suggestedMin:58},
      y2:{position:'right', grid:{display:false}, ticks:{color:GREEN, font:{size:9}, callback:v=>v+'%'}, suggestedMin:14}
    }
  }
});

// ── FREQ CHART ──────────────────────────────────────────────
const fWeeks = Array.from({length:20}, (_,i)=>`Sem ${i+1}`);
const fReal  = [5,4,5,5,3,5,4,5,5,4,5,5,3,5,5,4,5,5,5,4];
const fMeta  = Array(20).fill(5);
new Chart(document.getElementById('freqChart'), {
  type:'bar',
  data:{ labels:fWeeks, datasets:[
    { label:'Treinos realizados', data:fReal, backgroundColor:fReal.map(v=>v===5?GREEN+'66':v>=4?GOLD+'66':AMBER+'55'), borderColor:fReal.map(v=>v===5?GREEN:v>=4?GOLD:AMBER), borderWidth:1.5, borderRadius:3 },
    { label:'Meta', data:fMeta, type:'line', borderColor:SILV+'44', borderDash:[4,3], pointRadius:0, borderWidth:1.5 }
  ]},
  options:{ responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{labels:{color:SILV, usePointStyle:true, font:{size:9}}}, tooltip:{...tt} },
    scales:{ x:{grid:{display:false}, ticks:{color:SILV, font:{size:8}, maxTicksLimit:10}},
             y:{grid, ticks:{color:SILV}, suggestedMin:0, suggestedMax:6} }
  }
});

// ── MOOD CHART ──────────────────────────────────────────────
new Chart(document.getElementById('moodChart'), {
  type:'line',
  data:{ labels:['Sem33','Sem34','Sem35','Sem36','Sem37','Sem38'],
    datasets:[{ label:'Disposição', data:[4,4,5,3,4,5], borderColor:PURPLE, backgroundColor:'rgba(167,139,250,0.1)', fill:true, tension:0.4, borderWidth:2, pointRadius:5, pointBackgroundColor:PURPLE }]
  },
  options:{ responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{display:false}, tooltip:{...tt} },
    scales:{ x:{grid:{display:false}, ticks:{color:SILV, font:{size:9}}},
             y:{grid, ticks:{color:SILV}, suggestedMin:1, suggestedMax:5} }
  }
});

}

// ── ROI CHART ──────────────────────────────────────────────────
new Chart(document.getElementById('roiChart'), {
  type:'bar',
  data:{
    labels:['Jan/26','Fev','Mar','Abr','Mai'],
    datasets:[
      { label:'Investimento (R$)', data:[14200,14800,15100,15600,15400], backgroundColor:RED+'44', borderColor:RED, borderWidth:1.5, borderRadius:3, yAxisID:'y' },
      { label:'Receita (R$)',      data:[85000,86400,87200,86000,89400], backgroundColor:GREEN+'44', borderColor:GREEN, borderWidth:1.5, borderRadius:3, yAxisID:'y' },
      { label:'ROI %',             data:[499,484,477,451,482], type:'line', borderColor:GOLD, backgroundColor:'transparent', borderWidth:2.5, pointRadius:4, pointBackgroundColor:GOLD, yAxisID:'y2' },
    ]
  },
  options:{ responsive:true, maintainAspectRatio:false,
    interaction:{mode:'index', intersect:false},
    plugins:{ legend:{labels:{color:SILV, usePointStyle:true, font:{size:9}}}, tooltip:{...tt} },
    scales:{
      x:{ grid:{display:false}, ticks:{color:SILV, font:{size:9}} },
      y:{ grid, ticks:{color:SILV, font:{size:9}, callback:v=>'R$'+(v/1000).toFixed(0)+'K'} },
      y2:{ position:'right', grid:{display:false}, ticks:{color:GOLD, font:{size:9}, callback:v=>v+'%'}, suggestedMin:400 }
    }
  }
});

// ── VENDAS MIX CHART ──────────────────────────────────────────
new Chart(document.getElementById('vMixChart'), {
  type:'doughnut',
  data:{
    labels:['Plano 1m · R$147','Plano 3m · R$197','Plano 6m · R$237','Plano 12m · R$267'],
    datasets:[{ data:[6,16,12,14], backgroundColor:[RED+'55',AMBER+'55',GOLD+'66',GREEN+'55'], borderColor:'#081321', borderWidth:3, hoverOffset:6 }]
  },
  options:{ responsive:true, maintainAspectRatio:false, cutout:'56%',
    layout:{ padding:{ top:8, bottom:8 } },
    plugins:{
      legend:{
        position:'bottom',
        labels:{ color:SILV, usePointStyle:true, font:{size:9}, padding:14, boxWidth:8 }
      },
      tooltip:{...tt}
    }
  }
});

// ── VENDAS SALES TABLE ────────────────────────────────────────
const SALES_DATA = [
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
const statusCfg = {
  pago:      'background:rgba(74,222,128,0.1);color:var(--green);border:1px solid rgba(74,222,128,0.2)',
  pendente:  'background:rgba(251,191,36,0.1);color:var(--amber);border:1px solid rgba(251,191,36,0.2)',
  cancelado: 'background:rgba(248,113,113,0.1);color:var(--red);border:1px solid rgba(248,113,113,0.2)',
};
const tbody = document.getElementById('v-sales-body');
if (tbody) {
  tbody.innerHTML = SALES_DATA.map(s=>`
    <tr>
      <td style="font-family:'DM Mono',monospace;font-size:11px;color:var(--silver);padding:9px 10px;border-bottom:1px solid rgba(168,178,189,0.04)">${s.date}</td>
      <td style="font-family:'DM Mono',monospace;font-size:11px;color:var(--silver);padding:9px 10px;border-bottom:1px solid rgba(168,178,189,0.04)">${s.name}</td>
      <td style="font-family:'DM Mono',monospace;font-size:11px;color:var(--silver);padding:9px 10px;border-bottom:1px solid rgba(168,178,189,0.04)">${s.plan}</td>
      <td style="font-family:'DM Mono',monospace;font-size:11px;color:var(--silver);padding:9px 10px;border-bottom:1px solid rgba(168,178,189,0.04)">${s.channel}</td>
      <td style="font-family:'DM Mono',monospace;font-size:11px;color:var(--gold);text-align:right;padding:9px 10px;border-bottom:1px solid rgba(168,178,189,0.04)">${s.value}</td>
      <td style="padding:9px 10px;border-bottom:1px solid rgba(168,178,189,0.04)"><span style="font-family:'DM Mono',monospace;font-size:8px;padding:3px 9px;border-radius:2px;${statusCfg[s.status]}">${s.status.toUpperCase()}</span></td>
    </tr>
  `).join('');
}

// ── VENDAS: PLAN SELECTOR ────────────────────────────────────
let vSelectedPlan = { dur:'1m', price:'147' };
function vSelectPlan(el) {
  document.querySelectorAll('.plan-card-v').forEach(c=>c.classList.remove('sel'));
  el.classList.add('sel');
  vSelectedPlan = { dur: el.dataset.dur, price: el.dataset.price };
  document.getElementById('v-link-result').style.display = 'none';
}
function vSaveLead() {
  const name = document.getElementById('v-lead-name')?.value.trim();
  if (!name) { document.getElementById('v-lead-name').focus(); return; }
  const btn = document.getElementById('v-save-btn');
  const orig = btn.textContent;
  btn.textContent = '✓ Lead cadastrado!';
  btn.disabled = true;
  setTimeout(()=>{ btn.textContent = orig; btn.disabled = false; }, 2200);
}
function vGerarLink() {
  const name = (document.getElementById('v-lead-name')?.value.trim() || 'prospect');
  const slug = name.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
  const ref  = Math.random().toString(36).substr(2,8).toUpperCase();
  const url  = `https://pay.rafaelmoura.com.br/plano-${vSelectedPlan.dur}?ref=${ref}&lead=${slug}`;
  document.getElementById('v-generated-link').textContent = url;
  document.getElementById('v-link-result').style.display = 'block';
  document.getElementById('v-copy-btn').textContent = 'Copiar';
  document.getElementById('v-copy-btn').classList.remove('copied');
}
function vCopyLink() {
  const url = document.getElementById('v-generated-link')?.textContent;
  navigator.clipboard.writeText(url).catch(()=>{});
  const btn = document.getElementById('v-copy-btn');
  btn.textContent = '✓ Copiado!';
  btn.classList.add('copied');
  setTimeout(()=>{ btn.textContent = 'Copiar'; btn.classList.remove('copied'); }, 2000);
}


// ── LOGOUT ──────────────────────────────────────────────────────
function doLogout() {
  localStorage.removeItem('mf_token');
  localStorage.removeItem('mf_user');
  window.location.href = '/';
}

// ── SESSION CHECK ────────────────────────────────────────────────
(function() {
  const token   = localStorage.getItem('mf_token');
  const session = JSON.parse(localStorage.getItem('mf_user') || 'null');
  if (!token || !session) { window.location.href = '/'; return; }
  if (session.name) {
    const name     = session.name;
    const initials = name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
    // Nome pequeno no canto direito
    const nameEl   = document.getElementById('dash-user-name');
    const avatarEl = document.getElementById('dash-user-avatar');
    if (nameEl)   nameEl.textContent   = name;
    if (avatarEl) avatarEl.textContent = initials;
    // H1 principal
    const h1 = document.getElementById('dash-user-h1');
    if (h1) h1.innerHTML = name + ' — <em>Personal Trainer</em>';
  }
})();


// ════════════════════════════════════════════════
// THEME TOGGLE
// ════════════════════════════════════════════════
function applyTheme(t){
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('ph_theme', t);
  const btn = document.getElementById('theme-btn');
  if(btn) btn.textContent = t==='dark' ? '🌙' : '☀️';
  // sync chart colors
  setTimeout(syncChartColors, 50);
}
function toggleTheme(){
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(cur==='dark' ? 'light' : 'dark');
}
function syncChartColors(){
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const textCol = isLight ? '#2C4A68' : '#A8B2BD';
  const gridCol = isLight ? 'rgba(28,58,92,0.08)' : 'rgba(168,178,189,0.06)';
  Chart.defaults.color = textCol;
  try {
    Object.values(Chart.instances||{}).forEach(ch => {
      if (!ch) return;
      Object.values(ch.options.scales||{}).forEach(sc => {
        if (sc.grid)  sc.grid.color  = gridCol;
        if (sc.ticks) sc.ticks.color = textCol;
      });
      const leg = ch.options.plugins?.legend?.labels;
      if (leg) leg.color = textCol;
      ch.update('none');
    });
  } catch(e) {}
}
// Init theme from localStorage or system preference
(function(){
  const saved = localStorage.getItem('ph_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (prefersDark ? 'dark' : 'light'));
})();

// ════════════════════════════════════════════════
// KANBAN — dynamic render + context menu
// ════════════════════════════════════════════════
const KDATA = {
  novo:[
    {id:'k1',name:'Camila Torres',  sub:'Instagram · Emagrecimento', val:'',                  days:'Hoje',phone:'(11) 98765-4321',email:'camila@email.com',canal:'Instagram',dp:0},
    {id:'k2',name:'Pedro Araújo',   sub:'Indicação · Hipertrofia',   val:'',                  days:'Hoje',phone:'(11) 91234-5678',email:'pedro@email.com', canal:'Indicação',dp:0},
    {id:'k3',name:'Letícia Maia',   sub:'TikTok · Saúde geral',      val:'',                  days:'1d',  phone:'(21) 99887-6543',email:'leticia@email.com',canal:'TikTok',  dp:1},
    {id:'k4',name:'+ 5 outros',     sub:'Aguardando 1º contato',     val:'',                  days:'',    phone:'',email:'',canal:'',dp:0,ghost:true},
  ],
  contato:[
    {id:'k5',name:'Ana Beatriz S.', sub:'YouTube · Condicionamento', val:'Plano 3m · R$591',  days:'2d',  phone:'(11) 94567-8901',email:'ana@email.com',  canal:'YouTube',  dp:2},
    {id:'k6',name:'Diego Lima',     sub:'Instagram · Emagrecimento', val:'Plano 6m · R$1.422',days:'3d',  phone:'(11) 93456-7890',email:'diego@email.com', canal:'Instagram',dp:3},
    {id:'k7',name:'+ 7 outros',     sub:'Em conversa ativa',         val:'',                  days:'',    phone:'',email:'',canal:'',dp:0,ghost:true},
  ],
  proposta:[
    {id:'k8',name:'Mariana Fonseca',sub:'Indicação · Hipertrofia',   val:'Plano 12m · R$3.204',days:'1d', phone:'(11) 92345-6789',email:'mari@email.com', canal:'Indicação',dp:1,hot:true},
    {id:'k9',name:'Vinícius Prado', sub:'Instagram · Emagrecimento', val:'Plano 6m · R$1.422', days:'2d', phone:'(21) 98901-2345',email:'vini@email.com',  canal:'Instagram',dp:2,hot:true},
    {id:'k10',name:'+ 5 outros',    sub:'Link enviado, aguardando',   val:'',                   days:'',   phone:'',email:'',canal:'',dp:0,ghost:true},
  ],
  fechado:[
    {id:'k11',name:'Roberta Coelho', sub:'Indicação · Emagrecimento',val:'Plano 6m ✓',  days:'Hoje',phone:'(11) 97890-1234',email:'rob@email.com',canal:'Indicação',dp:0,ok:true},
    {id:'k12',name:'Carlos Henrique',sub:'YouTube · Condicionamento', val:'Plano 12m ✓', days:'1d',  phone:'(31) 96789-0123',email:'ch@email.com', canal:'YouTube',  dp:1,ok:true},
    {id:'k13',name:'+ 3 outros',     sub:'Esta semana',               val:'',            days:'',    phone:'',email:'',canal:'',dp:0,ghost:true},
  ],
  perdido:[
    {id:'k14',name:'Fernanda C.',  sub:'Preço acima do budget',val:'Plano 6m · perdido',days:'3d',phone:'(11) 95678-9012',email:'fe@email.com',canal:'Google',   dp:3,lost:true},
    {id:'k15',name:'Tiago Ramos',  sub:'Sem resposta após 5d', val:'Plano 1m · perdido',days:'5d',phone:'(11) 94567-8901',email:'tr@email.com',canal:'Instagram',dp:5,lost:true},
  ],
};

const KCOLS = [
  {key:'novo',    label:'Novo',    color:'#60a5fa'},
  {key:'contato', label:'Contato', color:'#a78bfa'},
  {key:'proposta',label:'Proposta',color:'#fbbf24'},
  {key:'fechado', label:'Fechado', color:'#4ade80'},
  {key:'perdido', label:'Perdido', color:'#f87171'},
];

// track status per card
const kStatus = {};
Object.entries(KDATA).forEach(([s,cards])=>cards.forEach(c=>{ if(!c.ghost) kStatus[c.id]=s; }));
const kNotes = {};

function renderKanban(){
  const board = document.getElementById('v-kanban-board');
  if(!board) return;
  // group by current status
  const grouped = {novo:[],contato:[],proposta:[],fechado:[],perdido:[]};
  Object.values(KDATA).flat().forEach(c=>{
    if(c.ghost) return;
    grouped[kStatus[c.id]||'novo'].push(c);
  });
  board.innerHTML = KCOLS.map(col=>{
    const cards = grouped[col.key]||[];
    return `<div class="v-kcol">
      <div class="v-kcol-head">
        <span class="v-kcol-title">${col.label}</span>
        <span class="v-kcount" style="background:${col.color}22;color:${col.color}">${cards.length}</span>
      </div>
      ${cards.map(c=>`
        <div class="v-kcard" style="${c.hot?'border-color:rgba(251,191,36,0.25)':''} ${c.ok?'border-color:rgba(74,222,128,0.2)':''} ${c.lost?'opacity:0.6;border-color:rgba(248,113,113,0.18)':''};cursor:pointer"
             onclick="openCtxMenu(event,'${c.id}','${col.key}')">
          <div class="v-kcard-name">${c.name}</div>
          <div class="v-kcard-detail">${c.sub}</div>
          ${c.val?`<div class="v-kcard-val" style="${c.ok?'color:var(--green)':c.lost?'color:var(--red)':''}">${c.val}</div>`:''}
          ${c.days?`<div class="v-kcard-days">${c.days}</div>`:''}
        </div>
      `).join('')}
    </div>`;
  }).join('');
}

// context menu
let ctxId = null;
function openCtxMenu(e, cardId, curStatus){
  e.stopPropagation();
  ctxId = cardId;
  const c = Object.values(KDATA).flat().find(x=>x.id===cardId);
  if(!c) return;
  const menu = document.getElementById('ctx-menu');
  const overlay = document.getElementById('ctx-overlay');

  document.getElementById('ctx-lead-name').textContent = c.name;
  document.getElementById('ctx-lead-sub').textContent  = c.sub;
  document.getElementById('ctx-info-grid').innerHTML = [
    {l:'Plano', v:c.val||'—'}, {l:'Canal', v:c.canal||'—'},
    {l:'WhatsApp', v:c.phone||'—'}, {l:'E-mail', v:c.email||'—'},
    {l:'No pipeline', v:c.dp===0?'Hoje':c.dp+'d'}, {l:'Status', v:curStatus},
  ].map(i=>`<div><div class="ctx-info-label">${i.l}</div><div class="ctx-info-val">${i.v}</div></div>`).join('');

  document.querySelectorAll('.ctx-sbtn').forEach(btn=>{
    btn.classList.toggle('cur', btn.dataset.s===curStatus);
  });
  document.getElementById('ctx-notes-input').value = kNotes[cardId]||'';

  menu.style.display = 'block';
  overlay.classList.add('open');
  // position
  const mw=320, mh=460;
  const x = Math.min(e.clientX+8, window.innerWidth-mw-8);
  const y = Math.min(e.clientY+8, window.innerHeight-mh-8);
  menu.style.left = Math.max(8,x)+'px';
  menu.style.top  = Math.max(8,y)+'px';
}
function closeCtxMenu(){
  document.getElementById('ctx-menu').style.display='none';
  document.getElementById('ctx-overlay').classList.remove('open');
  ctxId=null;
}
function ctxMove(newStatus){
  if(!ctxId) return;
  kStatus[ctxId]=newStatus;
  document.querySelectorAll('.ctx-sbtn').forEach(b=>b.classList.toggle('cur',b.dataset.s===newStatus));
  renderKanban();
}
function ctxSave(){
  if(ctxId) kNotes[ctxId]=document.getElementById('ctx-notes-input').value;
  closeCtxMenu();
}

document.addEventListener('DOMContentLoaded', () => {
  renderKanban();

  // Sessão — atualiza nome do usuário no header
  try {
    const user = JSON.parse(localStorage.getItem('mf_user') || 'null');
    if (user && user.name) {
      const n = user.name;
      const av = n.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
      const nameEl   = document.getElementById('header-pt-name');
      const userEl   = document.getElementById('dash-user-name');
      const avatarEl = document.getElementById('dash-user-avatar');
      if (nameEl)   nameEl.innerHTML = n + ' — <em>Personal Trainer</em>';
      if (userEl)   userEl.textContent = n;
      if (avatarEl) avatarEl.textContent = av;
    }
  } catch(e) {}

  // Inicializa aba acompanhamento imediatamente
  setTimeout(() => {
    try { updateStudent(); } catch(e) { console.warn('updateStudent:', e); }
  }, 300);
});