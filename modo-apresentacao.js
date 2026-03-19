// ════════════════════════════════════════════════
// modo-apresentacao.js — Modo Apresentação · Projetos LM
// ════════════════════════════════════════════════

import { getState, setState, getProjects } from './state.js';
import { mostrarToast } from './ui.js';

const LS_KEY = id => `lm_reunioes_${id}`;

// ── Helpers ───────────────────────────────────────
function carregarReunioes(projId) {
  try { return JSON.parse(localStorage.getItem(LS_KEY(projId)) || '[]'); }
  catch { return []; }
}

// ── HTML injectado na nova janela ─────────────────
function buildWindowHTML(projId, projNome, baseUrl) {
  return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>⛶ Apresentação · ${projNome}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:#0F1610;color:#E8F0E0;font-family:'DM Sans',sans-serif;overflow:hidden}

/* Topbar */
.topbar{position:fixed;top:0;left:0;right:0;height:44px;z-index:1000;
  background:rgba(15,22,16,.97);border-bottom:1px solid rgba(103,171,47,.2);
  backdrop-filter:blur(12px);display:flex;align-items:center;gap:12px;padding:0 18px}
.topbar-marca{font-family:'DM Serif Display',serif;font-size:14px;color:#67AB2F;letter-spacing:.03em;flex-shrink:0}
.topbar-proj{font-size:12px;color:rgba(255,255,255,.4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
.topbar-btns{display:flex;gap:7px;flex-shrink:0}
.tbtn{padding:5px 12px;border-radius:6px;border:1px solid rgba(103,171,47,.3);
  background:rgba(103,171,47,.1);color:#A8D878;font-size:11px;font-weight:600;
  cursor:pointer;font-family:'DM Sans',sans-serif;transition:background .15s}
.tbtn:hover{background:rgba(103,171,47,.22)}
.tbtn.red{border-color:rgba(220,70,70,.35);background:rgba(220,70,70,.1);color:#f08080}
.tbtn.red:hover{background:rgba(220,70,70,.22)}

/* Frame */
#frame-wrap{margin-top:44px;width:100%;height:calc(100vh - 44px)}
iframe{width:100%;height:100%;border:none;background:#0F1610}

/* ── Painel Notas ── */
#np{position:fixed;top:56px;right:16px;width:300px;max-height:calc(100vh - 72px);
  background:rgba(16,24,16,.98);border:1px solid rgba(103,171,47,.22);border-radius:14px;
  box-shadow:0 8px 40px rgba(0,0,0,.65);display:flex;flex-direction:column;
  z-index:900;backdrop-filter:blur(16px)}
#np.hidden{display:none}
#np.mini{width:44px;max-height:44px;border-radius:22px;overflow:hidden}
#np.mini .np-body,#np.mini .np-foot,#np.mini .np-title,#np.mini .np-actions{display:none}
#np.mini .np-head{border-radius:22px;justify-content:center;padding:0;height:44px;border-bottom:none}
#np.mini .np-ico{margin:0;font-size:18px}

.np-head{display:flex;align-items:center;gap:8px;padding:9px 12px;
  background:rgba(103,171,47,.07);border-bottom:1px solid rgba(103,171,47,.13);
  cursor:move;user-select:none;flex-shrink:0;border-radius:14px 14px 0 0}
.np-ico{font-size:14px;flex-shrink:0}
.np-title{font-size:10px;font-weight:700;color:#A8D878;letter-spacing:.08em;text-transform:uppercase;flex:1}
.np-actions{display:flex;gap:3px}
.np-btn{width:22px;height:22px;border-radius:5px;border:none;background:rgba(255,255,255,.05);
  color:rgba(255,255,255,.45);cursor:pointer;font-size:13px;display:flex;align-items:center;
  justify-content:center;transition:background .15s;font-family:'DM Sans',sans-serif}
.np-btn:hover{background:rgba(255,255,255,.12);color:#fff}

/* Body das notas — scroll suave */
.np-body{flex:1;overflow-y:auto;padding:10px 10px 6px;display:flex;flex-direction:column;gap:7px}
.np-body::-webkit-scrollbar{width:3px}
.np-body::-webkit-scrollbar-thumb{background:rgba(103,171,47,.2);border-radius:3px}

/* Secções — sempre visíveis, sem accordion */
.sec-label{
  display:flex;align-items:center;gap:5px;
  margin-bottom:3px}
.sec-em{font-size:11px}
.sec-nm{font-size:10px;font-weight:600;color:rgba(103,171,47,.7);
  letter-spacing:.05em;text-transform:uppercase}
textarea{
  width:100%;min-height:52px;max-height:120px;resize:vertical;
  background:rgba(255,255,255,.04);
  border:1px solid rgba(255,255,255,.08);border-radius:7px;
  padding:7px 8px;color:#E8F0E0;
  font-family:'DM Sans',sans-serif;font-size:12px;line-height:1.5;
  outline:none;transition:border-color .15s, background .15s;
  display:block}
textarea:focus{border-color:rgba(103,171,47,.4);background:rgba(103,171,47,.04)}
textarea::placeholder{color:rgba(255,255,255,.16);font-size:11px}

/* Footer */
.np-foot{padding:9px 11px;border-top:1px solid rgba(103,171,47,.13);
  display:flex;gap:6px;align-items:center;flex-shrink:0}
.np-info{flex:1;font-size:10px;color:rgba(255,255,255,.28);line-height:1.3}
.np-info em{color:rgba(103,171,47,.65);font-style:normal}
.btn-grv{padding:6px 13px;border-radius:7px;
  background:linear-gradient(135deg,#3a6b1a,#274f10);
  border:1px solid rgba(103,171,47,.32);color:#A8D878;
  font-size:11px;font-weight:700;cursor:pointer;
  font-family:'DM Sans',sans-serif;transition:background .15s;white-space:nowrap}
.btn-grv:hover{background:linear-gradient(135deg,#4a8b22,#3a6b18)}

/* Toast */
.toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%) translateY(16px);
  background:rgba(18,28,18,.98);border:1px solid rgba(103,171,47,.32);border-radius:9px;
  padding:9px 16px;font-size:12px;color:#A8D878;font-weight:600;
  opacity:0;transition:opacity .22s,transform .22s;z-index:9999;pointer-events:none}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
</style>
</head>
<body>

<div class="topbar">
  <div class="topbar-marca">⛶ Apresentação</div>
  <div class="topbar-proj" id="tp-nome"></div>
  <div class="topbar-btns">
    <button class="tbtn" onclick="toggleNP()">📝 Notas</button>
    <button class="tbtn red" onclick="window.close()">✕ Fechar</button>
  </div>
</div>

<div id="frame-wrap"><iframe id="fr" src="" title="Proposta"></iframe></div>

<div id="np">
  <div class="np-head" id="np-drag">
    <span class="np-ico">📝</span>
    <span class="np-title">Notas da Reunião</span>
    <div class="np-actions">
      <button class="np-btn" onclick="miniNP()" title="Minimizar">—</button>
    </div>
  </div>
  <div class="np-body" id="np-body"></div>
  <div class="np-foot">
    <div class="np-info">Início: <em id="np-inicio">—</em></div>
    <button class="btn-grv" onclick="saveReuniao()">💾 Guardar</button>
  </div>
</div>

<div class="toast" id="tst"></div>

<script>
const PROJ_ID   = '${projId}';
const PROJ_NOME = ${JSON.stringify(projNome)};
const BASE_URL  = '${baseUrl}';
const LS_KEY    = 'lm_reunioes_' + PROJ_ID;

// Init
const inicio  = new Date();
const hInicio = pad(inicio.getHours())+':'+pad(inicio.getMinutes());
document.getElementById('tp-nome').textContent   = PROJ_NOME;
document.getElementById('np-inicio').textContent = hInicio;
document.getElementById('fr').src = BASE_URL + '?p=' + PROJ_ID;

function pad(n){ return String(n).padStart(2,'0'); }

// ── Secções — sempre visíveis, compactas ─────────
const SECS = [
  {id:'geral',    em:'💬', nm:'Geral',           ph:'Observações gerais…'},
  {id:'cliente',  em:'👤', nm:'Cliente',         ph:'Preferências, dúvidas, reacções…'},
  {id:'proposta', em:'📋', nm:'Proposta',         ph:'Ajustes, valores discutidos…'},
  {id:'proximos', em:'🎯', nm:'Próximos Passos',  ph:'O que ficou acordado…'},
  {id:'decisoes', em:'✅', nm:'Decisões',         ph:'Decisões tomadas…'},
];

const body = document.getElementById('np-body');
body.innerHTML = SECS.map(s =>
  '<div>'+
    '<div class="sec-label">'+
      '<span class="sec-em">'+s.em+'</span>'+
      '<span class="sec-nm">'+s.nm+'</span>'+
    '</div>'+
    '<textarea id="ta-'+s.id+'" placeholder="'+s.ph+'"></textarea>'+
  '</div>'
).join('');

// ── Toggle / Mini ─────────────────────────────────
function toggleNP(){
  const p=document.getElementById('np');
  if(p.classList.contains('mini')) p.classList.remove('mini');
  p.classList.toggle('hidden');
}
function miniNP(){
  const p=document.getElementById('np');
  p.classList.remove('hidden');
  p.classList.toggle('mini');
}

// ── Drag ──────────────────────────────────────────
(function(){
  const p=document.getElementById('np'), h=document.getElementById('np-drag');
  let sx=0,sy=0,drag=false;
  h.addEventListener('mousedown',e=>{
    if(e.target.tagName==='BUTTON') return;
    drag=true; sx=e.clientX-p.offsetLeft; sy=e.clientY-p.offsetTop;
    p.style.right='auto'; e.preventDefault();
  });
  document.addEventListener('mousemove',e=>{if(!drag)return;p.style.left=(e.clientX-sx)+'px';p.style.top=(e.clientY-sy)+'px';});
  document.addEventListener('mouseup',()=>{drag=false;});
})();

// ── Guardar reunião — usa localStorage do opener ──
// A janela é aberta via document.write sobre about:blank,
// por isso o localStorage pertence à janela pai (mesma origem).
function getLS(){
  try{ return window.opener?.localStorage || window.localStorage; }
  catch{ return window.localStorage; }
}

function saveReuniao(){
  const agora=new Date();
  const data=agora.toLocaleDateString('pt-PT');
  const hora=pad(agora.getHours())+':'+pad(agora.getMinutes());
  const notas={};
  SECS.forEach(s=>{ const v=document.getElementById('ta-'+s.id)?.value?.trim(); if(v) notas[s.id]=v; });
  if(!Object.values(notas).some(v=>v)){ toast('Sem notas para guardar'); return; }
  const r={id:Date.now(),data,hora,horaInicio:hInicio,projId:PROJ_ID,projNome:PROJ_NOME,notas};
  try{
    const ls=getLS();
    const lista=JSON.parse(ls.getItem(LS_KEY)||'[]');
    lista.unshift(r);
    ls.setItem(LS_KEY,JSON.stringify(lista));
  }catch(e){ toast('Erro ao guardar: '+e.message); return; }
  toast('✓ Reunião guardada — '+data+' '+hora);
  setTimeout(()=>{
    if(confirm('Reunião guardada! Limpar notas para nova sessão?')){
      SECS.forEach(s=>{ const el=document.getElementById('ta-'+s.id); if(el) el.value=''; });
    }
  },350);
}

function toast(msg){
  const t=document.getElementById('tst');
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2800);
}
<\/script>
</body></html>`;
}

// ── Ativar Modo Apresentação ──────────────────────
export function ativarModoApresentacao(id) {
  const p = getProjects().find(x => x.id === id);
  if (!p) return;

  const base = window.location.origin + window.location.pathname;
  const sw = window.screen.width;
  const sh = window.screen.height;
  const w  = Math.min(1280, sw);
  const left = sw - w;

  const win = window.open(
    'about:blank',
    `apres_${id}`,
    `width=${w},height=${sh},left=${left},top=0,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes,resizable=yes`
  );

  if (!win) {
    mostrarToast('⚠️ Janela bloqueada', 'Permite janelas popup para usar o Modo Apresentação.');
    return;
  }

  win.document.open();
  win.document.write(buildWindowHTML(id, p.nome || '—', base));
  win.document.close();

  mostrarToast('⛶ Modo Apresentação', `A abrir "${p.nome || 'proposta'}" numa nova janela.`);
}

// ── Sair ──────────────────────────────────────────
export function sairModoApresentacao() {
  setState({ modoApresentacao: false, projApresentacaoId: null });
}

// ── Histórico de reuniões (para painel de edição) ─
export function renderHistoricoReunioes(projId, containerEl) {
  if (!containerEl) return;
  let lista = [];
  try { lista = JSON.parse(localStorage.getItem(LS_KEY(projId)) || '[]'); }
  catch { lista = []; }

  const LABELS = {
    geral:'💬 Geral', cliente:'👤 Cliente', proposta:'📋 Proposta',
    proximos:'🎯 Próximos Passos', decisoes:'✅ Decisões',
  };

  if (!lista.length) {
    containerEl.innerHTML = `<p class="form-note" style="color:rgba(255,255,255,.3);font-style:italic;padding:4px 0">Sem reuniões registadas para este projeto.</p>`;
    return;
  }

  containerEl.innerHTML = lista.map(r => `
    <div style="margin-bottom:8px;border:1px solid rgba(103,171,47,.15);border-radius:8px;overflow:hidden">
      <div onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none'"
           style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(103,171,47,.07);cursor:pointer;user-select:none">
        <span>📅</span>
        <span style="font-size:12px;font-weight:600;color:#A8D878;flex:1">${r.data} — ${r.hora}</span>
        ${r.horaInicio ? `<span style="font-size:10px;color:rgba(255,255,255,.3)">Início: ${r.horaInicio}</span>` : ''}
        <button onclick="event.stopPropagation();window._apagarReuniaoLocal(${r.id},'${projId}')"
                style="background:none;border:none;color:rgba(220,80,80,.5);cursor:pointer;font-size:16px;line-height:1;padding:0 2px;margin-left:4px"
                title="Apagar esta reunião">×</button>
      </div>
      <div style="padding:10px 12px;display:flex;flex-direction:column;gap:7px">
        ${Object.entries(r.notas || {}).map(([k,v]) => `
          <div style="font-size:11px">
            <div style="color:rgba(103,171,47,.7);font-weight:600;margin-bottom:2px">${LABELS[k]||k}</div>
            <div style="color:rgba(255,255,255,.6);line-height:1.5;white-space:pre-wrap">${v}</div>
          </div>`).join('')}
      </div>
    </div>`).join('');
}

// ── Apagar reunião individual ─────────────────────
window._apagarReuniaoLocal = function(reuniaoId, projId) {
  if (!confirm('Apagar esta reunião?')) return;
  try {
    const key  = LS_KEY(projId);
    const nova = (JSON.parse(localStorage.getItem(key)||'[]')).filter(r => r.id !== reuniaoId);
    localStorage.setItem(key, JSON.stringify(nova));
    const cont = document.getElementById('reunioes-historico-lista');
    const blocoReunioes = document.getElementById('bloco-reunioes');
    if (cont) {
      renderHistoricoReunioes(projId, cont);
      // Ocultar bloco se ficou vazio
      if (blocoReunioes) blocoReunioes.style.display = nova.length ? '' : 'none';
    }
  } catch(_) {}
};
