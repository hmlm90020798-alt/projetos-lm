// ════════════════════════════════════════════════
// modo-apresentacao.js — Modo Apresentação · Projetos LM
// ════════════════════════════════════════════════

import { getState, setState, getProjects } from './state.js';
import { mostrarToast } from './ui.js';

const LS_KEY = id => `lm_reunioes_${id}`;

function carregarReunioes(projId) {
  try { return JSON.parse(localStorage.getItem(LS_KEY(projId)) || '[]'); }
  catch { return []; }
}

// ── HTML da janela de apresentação ───────────────
function buildWindowHTML(projId, projNome, baseUrl) {
  // Serializar reuniões existentes para passar à janela filha
  let reunioesExistentes = '[]';
  try { reunioesExistentes = localStorage.getItem(LS_KEY(projId)) || '[]'; } catch(_) {}

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

/* ── Topbar ── */
.topbar{
  position:fixed;top:0;left:0;right:0;height:44px;z-index:1000;
  background:rgba(15,22,16,.97);border-bottom:1px solid rgba(103,171,47,.2);
  backdrop-filter:blur(12px);display:flex;align-items:center;gap:12px;padding:0 18px}
.topbar-marca{font-family:'DM Serif Display',serif;font-size:14px;color:#67AB2F;letter-spacing:.03em;flex-shrink:0}
.topbar-proj{font-size:12px;color:rgba(255,255,255,.4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
.topbar-btns{display:flex;gap:7px;flex-shrink:0}
.tbtn{
  padding:5px 12px;border-radius:6px;border:1px solid rgba(103,171,47,.3);
  background:rgba(103,171,47,.1);color:#A8D878;font-size:11px;font-weight:600;
  cursor:pointer;font-family:'DM Sans',sans-serif;transition:background .15s}
.tbtn:hover{background:rgba(103,171,47,.22)}
.tbtn.red{border-color:rgba(220,70,70,.35);background:rgba(220,70,70,.1);color:#f08080}
.tbtn.red:hover{background:rgba(220,70,70,.22)}

/* ── Frame ── */
#frame-wrap{margin-top:44px;width:100%;height:calc(100vh - 44px)}
iframe{width:100%;height:100%;border:none;background:#0F1610}

/* ── Painel de Notas ── */
#np{
  position:fixed;top:56px;right:16px;
  width:290px;
  background:rgba(14,22,14,.98);
  border:1px solid rgba(103,171,47,.25);
  border-radius:12px;
  box-shadow:0 8px 40px rgba(0,0,0,.7), 0 0 0 1px rgba(103,171,47,.06);
  display:flex;flex-direction:column;
  z-index:900;
  overflow:hidden;
}
#np.np-hidden{display:none}

/* Cabeçalho — área de drag */
.np-head{
  display:flex;align-items:center;gap:8px;
  padding:10px 12px;
  background:rgba(103,171,47,.08);
  border-bottom:1px solid rgba(103,171,47,.15);
  cursor:move;user-select:none;flex-shrink:0;
}
.np-ico{font-size:15px;flex-shrink:0;line-height:1}
.np-title{font-size:10px;font-weight:700;color:#A8D878;letter-spacing:.09em;text-transform:uppercase;flex:1}
.np-head-btn{
  width:22px;height:22px;border-radius:5px;border:none;
  background:rgba(255,255,255,.06);color:rgba(255,255,255,.4);
  cursor:pointer;font-size:14px;font-family:'DM Sans',sans-serif;
  display:flex;align-items:center;justify-content:center;
  transition:background .15s;flex-shrink:0;line-height:1}
.np-head-btn:hover{background:rgba(255,255,255,.14);color:#fff}

/* Corpo — textarea */
.np-body{padding:10px;flex-shrink:0}
#np-textarea{
  width:100%;height:180px;
  resize:none;
  background:rgba(255,255,255,.04);
  border:1px solid rgba(255,255,255,.09);
  border-radius:8px;
  padding:10px;
  color:#E8F0E0;
  font-family:'DM Sans',sans-serif;
  font-size:12.5px;line-height:1.6;
  outline:none;
  transition:border-color .15s, background .15s;
  display:block;
}
#np-textarea:focus{
  border-color:rgba(103,171,47,.45);
  background:rgba(103,171,47,.04);
}
#np-textarea::placeholder{color:rgba(255,255,255,.18);font-size:12px}

/* Rodapé */
.np-foot{
  padding:8px 10px 10px;
  display:flex;gap:7px;align-items:center;
  border-top:1px solid rgba(255,255,255,.06);
  flex-shrink:0;
}
.np-hora{flex:1;font-size:10px;color:rgba(255,255,255,.28)}
.np-hora em{color:rgba(103,171,47,.6);font-style:normal}
.btn-grv{
  padding:6px 14px;border-radius:7px;
  background:linear-gradient(135deg,#3a6b1a,#274f10);
  border:1px solid rgba(103,171,47,.35);
  color:#A8D878;font-size:11px;font-weight:700;
  cursor:pointer;font-family:'DM Sans',sans-serif;
  transition:background .15s;white-space:nowrap;
}
.btn-grv:hover{background:linear-gradient(135deg,#4a8b22,#3a6b18)}

/* ── Ícone minimizado (bolha flutuante) ── */
#np-bubble{
  position:fixed;top:56px;right:16px;
  width:44px;height:44px;border-radius:22px;
  background:rgba(14,22,14,.98);
  border:1px solid rgba(103,171,47,.3);
  box-shadow:0 4px 20px rgba(0,0,0,.6);
  display:none;align-items:center;justify-content:center;
  cursor:pointer;z-index:900;font-size:18px;
  transition:background .15s;
}
#np-bubble:hover{background:rgba(103,171,47,.15)}
#np-bubble.vis{display:flex}

/* ── Toast ── */
.toast{
  position:fixed;bottom:20px;left:50%;
  transform:translateX(-50%) translateY(14px);
  background:rgba(14,22,14,.98);border:1px solid rgba(103,171,47,.35);
  border-radius:9px;padding:9px 18px;
  font-size:12px;color:#A8D878;font-weight:600;
  opacity:0;transition:opacity .22s,transform .22s;
  z-index:9999;pointer-events:none;white-space:nowrap;
}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
</style>
</head>
<body>

<!-- Barra de topo -->
<div class="topbar">
  <div class="topbar-marca">⛶ Apresentação</div>
  <div class="topbar-proj" id="tp-nome"></div>
  <div class="topbar-btns">
    <button class="tbtn" id="btn-toggle-notas" onclick="toggleNotas()">📝 Notas</button>
    <button class="tbtn red" onclick="window.close()">✕ Fechar</button>
  </div>
</div>

<!-- Iframe da proposta -->
<div id="frame-wrap">
  <iframe id="fr" src="" title="Proposta"></iframe>
</div>

<!-- Painel de Notas -->
<div id="np">
  <div class="np-head" id="np-drag">
    <span class="np-ico">📝</span>
    <span class="np-title">Notas da Reunião</span>
    <button class="np-head-btn" onclick="miniNotas()" title="Minimizar">—</button>
  </div>
  <div class="np-body">
    <textarea id="np-textarea" placeholder="Escreve aqui as notas desta reunião — observações, decisões, próximos passos…"></textarea>
  </div>
  <div class="np-foot">
    <div class="np-hora">Início: <em id="np-inicio">—</em></div>
    <button class="btn-grv" onclick="guardarReuniao()">💾 Guardar</button>
  </div>
</div>

<!-- Bolha quando minimizado -->
<div id="np-bubble" onclick="expandirNotas()" title="Abrir notas">📝</div>

<!-- Toast -->
<div class="toast" id="tst"></div>

<script>
// ── Dados ──────────────────────────────────────
const PROJ_ID   = ${JSON.stringify(projId)};
const PROJ_NOME = ${JSON.stringify(projNome)};
const BASE_URL  = ${JSON.stringify(baseUrl)};
const LS_KEY    = 'lm_reunioes_' + PROJ_ID;

// Reuniões pré-carregadas da janela pai (injectadas no HTML)
let _reunioes = ${reunioesExistentes};

// ── Init ────────────────────────────────────────
const inicio  = new Date();
const hInicio = pad(inicio.getHours()) + ':' + pad(inicio.getMinutes());
document.getElementById('tp-nome').textContent   = PROJ_NOME;
document.getElementById('np-inicio').textContent = hInicio;
document.getElementById('fr').src = BASE_URL + '?p=' + PROJ_ID;

function pad(n) { return String(n).padStart(2, '0'); }

// ── Guardar no localStorage (com fallback ao opener) ──
function salvarReunioesLS(lista) {
  const json = JSON.stringify(lista);
  // 1º: tentar localStorage local (funciona se mesma origem)
  try { localStorage.setItem(LS_KEY, json); return; } catch(_) {}
  // 2º: fallback via opener
  try { if (window.opener && !window.opener.closed) window.opener.localStorage.setItem(LS_KEY, json); } catch(_) {}
}

// ── Guardar reunião ─────────────────────────────
function guardarReuniao() {
  const texto = document.getElementById('np-textarea').value.trim();
  if (!texto) { toast('Sem notas para guardar.'); return; }

  const agora = new Date();
  const data  = agora.toLocaleDateString('pt-PT');
  const hora  = pad(agora.getHours()) + ':' + pad(agora.getMinutes());

  const reuniao = {
    id: Date.now(),
    data, hora, horaInicio: hInicio,
    projId: PROJ_ID, projNome: PROJ_NOME,
    texto,
  };

  _reunioes.unshift(reuniao);
  salvarReunioesLS(_reunioes);
  toast('✓ Reunião guardada — ' + data + ' ' + hora);

  setTimeout(() => {
    if (confirm('Reunião guardada! Limpar notas para nova sessão?')) {
      document.getElementById('np-textarea').value = '';
    }
  }, 350);
}

// ── Visibilidade do painel ──────────────────────
function toggleNotas() {
  const np  = document.getElementById('np');
  const bbl = document.getElementById('np-bubble');
  if (np.classList.contains('np-hidden')) {
    // estava oculto → mostrar painel
    np.classList.remove('np-hidden');
    bbl.classList.remove('vis');
  } else {
    // estava visível → ocultar (sem bolha — botão na topbar serve)
    np.classList.add('np-hidden');
    bbl.classList.remove('vis');
  }
}

function miniNotas() {
  // Minimizar para bolha flutuante
  const np  = document.getElementById('np');
  const bbl = document.getElementById('np-bubble');
  // Sincronizar posição da bolha com a do painel
  bbl.style.top  = np.style.top  || '56px';
  bbl.style.left = np.style.left || 'auto';
  bbl.style.right= np.style.right || '16px';
  np.classList.add('np-hidden');
  bbl.classList.add('vis');
}

function expandirNotas() {
  // Expandir a partir da bolha
  const np  = document.getElementById('np');
  const bbl = document.getElementById('np-bubble');
  // Colocar painel na posição da bolha
  np.style.top   = bbl.style.top   || '56px';
  np.style.left  = bbl.style.left  || 'auto';
  np.style.right = bbl.style.right || '16px';
  np.classList.remove('np-hidden');
  bbl.classList.remove('vis');
  document.getElementById('np-textarea').focus();
}

// ── Drag do painel ──────────────────────────────
(function () {
  const panel  = document.getElementById('np');
  const handle = document.getElementById('np-drag');
  let sx = 0, sy = 0, drag = false;

  handle.addEventListener('mousedown', e => {
    if (e.target.tagName === 'BUTTON') return;
    drag = true;
    // Calcular posição actual (pode estar posicionado por right:)
    const rect = panel.getBoundingClientRect();
    panel.style.left  = rect.left + 'px';
    panel.style.top   = rect.top  + 'px';
    panel.style.right = 'auto';
    sx = e.clientX - rect.left;
    sy = e.clientY - rect.top;
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!drag) return;
    panel.style.left = (e.clientX - sx) + 'px';
    panel.style.top  = (e.clientY - sy) + 'px';
  });
  document.addEventListener('mouseup', () => { drag = false; });
})();

// ── Drag da bolha ───────────────────────────────
(function () {
  const bbl = document.getElementById('np-bubble');
  let sx = 0, sy = 0, drag = false, moved = false;

  bbl.addEventListener('mousedown', e => {
    drag = true; moved = false;
    const rect = bbl.getBoundingClientRect();
    bbl.style.left  = rect.left + 'px';
    bbl.style.top   = rect.top  + 'px';
    bbl.style.right = 'auto';
    sx = e.clientX - rect.left;
    sy = e.clientY - rect.top;
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!drag) return;
    moved = true;
    bbl.style.left = (e.clientX - sx) + 'px';
    bbl.style.top  = (e.clientY - sy) + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (drag && !moved) expandirNotas();
    drag = false;
  });
})();

// ── Toast ───────────────────────────────────────
function toast(msg) {
  const t = document.getElementById('tst');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}
<\/script>
</body>
</html>`;
}

// ── Ativar Modo Apresentação ──────────────────────
export function ativarModoApresentacao(id) {
  const p = getProjects().find(x => x.id === id);
  if (!p) return;

  const base = window.location.origin + window.location.pathname;
  const sw   = window.screen.width;
  const sh   = window.screen.height;
  const w    = Math.min(1280, sw);
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

export function sairModoApresentacao() {
  setState({ modoApresentacao: false, projApresentacaoId: null });
}

// ── Histórico de reuniões (painel de edição) ──────
export function renderHistoricoReunioes(projId, containerEl) {
  if (!containerEl) return;
  const lista = carregarReunioes(projId);

  if (!lista.length) {
    containerEl.innerHTML = `<p class="form-note" style="color:rgba(255,255,255,.3);font-style:italic;padding:4px 0">Sem reuniões registadas para este projeto.</p>`;
    return;
  }

  containerEl.innerHTML = lista.map(r => `
    <div style="margin-bottom:8px;border:1px solid rgba(103,171,47,.15);border-radius:8px;overflow:hidden">
      <div onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none'"
           style="display:flex;align-items:center;gap:8px;padding:8px 12px;
                  background:rgba(103,171,47,.07);cursor:pointer;user-select:none">
        <span>📅</span>
        <span style="font-size:12px;font-weight:600;color:#A8D878;flex:1">${r.data} — ${r.hora}</span>
        ${r.horaInicio ? `<span style="font-size:10px;color:rgba(255,255,255,.3)">Início: ${r.horaInicio}</span>` : ''}
        <button onclick="event.stopPropagation();window._apagarReuniaoLocal(${r.id},'${projId}')"
                style="background:none;border:none;color:rgba(220,80,80,.45);cursor:pointer;
                       font-size:17px;line-height:1;padding:0 2px;margin-left:6px"
                title="Apagar esta reunião">×</button>
      </div>
      <div style="padding:10px 12px">
        <div style="font-size:12px;color:rgba(255,255,255,.65);line-height:1.6;white-space:pre-wrap">${r.texto || ''}</div>
      </div>
    </div>`).join('');
}

// ── Apagar reunião individual ─────────────────────
window._apagarReuniaoLocal = function(reuniaoId, projId) {
  if (!confirm('Apagar esta reunião?')) return;
  try {
    const key  = LS_KEY(projId);
    const nova = (JSON.parse(localStorage.getItem(key) || '[]')).filter(r => r.id !== reuniaoId);
    localStorage.setItem(key, JSON.stringify(nova));
    const cont  = document.getElementById('reunioes-historico-lista');
    const bloco = document.getElementById('bloco-reunioes');
    if (cont) renderHistoricoReunioes(projId, cont);
    if (bloco) bloco.style.display = nova.length ? '' : 'none';
  } catch(_) {}
};
