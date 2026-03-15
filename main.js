// ════════════════════════════════════════════════
// main.js — Orquestrador · Projetos LM
//
// ── REGRA DE OURO (nunca alterar sem ler) ────────
// INIT
//   ├── MODO_STANDALONE? → embed → vista cliente → FIM
//   ├── ?p=ID no URL?    → checkUrlParam → vista cliente → FIM
//   └── sem ?p=          → aguardar Firebase Auth
//         ├── autenticado → carregar → vista painel
//         └── sem sessão  → 3s → vista login
// ════════════════════════════════════════════════

import { getState, setState }    from './state.js';
import { carregar, doLogin, doLogout, onAuth, registarVisita } from './firebase.js';
import { setView, mostrarToast } from './ui.js';
import {
  renderPainel, abrirModalNovo, fecharModal, guardarProjeto,
  editarProjeto, apagarProjeto, verCliente, partilharCliente,
  setFiltro, addLinhaElem, addCatElemExtra, addLinhaElemExtra,
  addLinhaOrc, addCatOrcamento, addCatExtra, addLinhaOrcamento,
  addLinhaTimeline, processarImagens, removerImagem, renderThumbs,
  atualizarTotalPreview, reiniciarPrazoForm, atualizarTipoProjeto,
  iniciarPollingAprovacoes, addInteracao, addOcorrencia,
  atualizarEstadoOcorrencia, copiarEmail, TIPOS_PROJETO,
} from './painel.js';
import {
  renderPaginaCliente, renderEstadoAprovacao, aprovarProposta,
  abrirLightbox, fecharLightbox, lightboxNav, setLang,
} from './cliente.js';

window._clienteModule = { renderPaginaCliente };

// ── Exposição global ──────────────────────────────
window.doLogin                  = () => loginHandler();
window.doLogout                 = async () => { await doLogout(); setView('login'); };
window.setFiltro                = setFiltro;
window.abrirModalNovo           = abrirModalNovo;
window.fecharModal              = fecharModal;
window.guardarProjeto           = guardarProjeto;
window.editarProjeto            = editarProjeto;
window.apagarProjeto            = apagarProjeto;
window.verCliente               = verCliente;
window.partilharCliente         = partilharCliente;
window.setView                  = setView;
window.renderPainel             = renderPainel;
window.addLinhaElem             = addLinhaElem;
window.addCatElemExtra          = addCatElemExtra;
window.addLinhaElemExtra        = addLinhaElemExtra;
window.addLinhaOrc              = addLinhaOrc;
window.addCatOrcamento          = addCatOrcamento;
window.addCatExtra              = addCatExtra;
window.addLinhaOrcamento        = addLinhaOrcamento;
window.addLinhaTimeline         = addLinhaTimeline;
window.processarImagens         = processarImagens;
window.removerImagem            = removerImagem;
window.renderThumbs             = renderThumbs;
window.atualizarTotalPreview    = atualizarTotalPreview;
window.aprovarProposta          = aprovarProposta;
window.atualizarTipoProjeto     = atualizarTipoProjeto;
window.reiniciarPrazoForm       = reiniciarPrazoForm;
window.setLang                  = setLang;
window.abrirLightbox            = abrirLightbox;
window.fecharLightbox           = fecharLightbox;
window.lightboxNav              = lightboxNav;
window.addInteracao             = addInteracao;
window.addOcorrencia            = addOcorrencia;
window.atualizarEstadoOcorrencia= atualizarEstadoOcorrencia;
window.copiarEmail              = copiarEmail;
window.mostrarToast             = mostrarToast;

// ── Login ─────────────────────────────────────────
async function loginHandler() {
  const email = document.getElementById('login-email')?.value?.trim();
  const pass  = document.getElementById('login-pass')?.value;
  const errEl = document.getElementById('login-error');
  const btn   = document.querySelector('.login-btn');
  if (!email || !pass) return;
  if (btn)   { btn.disabled = true; btn.textContent = 'A entrar…'; }
  if (errEl)   errEl.style.display = 'none';
  try {
    await doLogin(email, pass);
  } catch (_) {
    if (errEl) { errEl.textContent = 'Credenciais incorrectas.'; errEl.style.display = 'block'; }
    if (btn)   { btn.disabled = false; btn.textContent = 'Entrar'; }
  }
}

// ── checkUrlParam ─────────────────────────────────
async function checkUrlParam() {
  const id = new URLSearchParams(window.location.search).get('p');
  if (!id) return false;
  setState({ isClienteMode: true, projAtualId: id });
  window._LANG = 'pt';
  try {
    const { carregarUm } = await import('./firebase.js');
    const p = await carregarUm(id);
    if (p) {
      renderPaginaCliente(p);
      setView('cliente');
      const btn = document.getElementById('btn-voltar-painel');
      if (btn) btn.style.display = 'none';
      registarVisita(id);
    } else {
      setView('expirada');
    }
  } catch (_) {
    setView('expirada');
  }
  return true;
}

// ── Popular select de tipos ───────────────────────
function popularTiposSelect() {
  const sel = document.getElementById('f-tipo');
  if (!sel) return;
  sel.innerHTML = TIPOS_PROJETO.map(t =>
    `<option value="${t.value}">${t.label}</option>`
  ).join('');
}

// ── INIT ──────────────────────────────────────────
(async function init() {
  const ov = document.createElement('div');
  ov.id = 'loading-overlay';
  ov.style.cssText = 'position:fixed;inset:0;background:#0F1610;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;z-index:99999;';
  ov.innerHTML = `
    <div style="width:32px;height:32px;border:2px solid rgba(103,171,47,.15);border-top-color:#67AB2F;border-radius:50%;animation:spin .8s linear infinite;"></div>
    <div style="font-family:'DM Sans',sans-serif;font-size:11px;font-weight:500;color:rgba(255,255,255,.25);letter-spacing:2px;text-transform:uppercase;">Projetos LM</div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>`;
  document.body.appendChild(ov);

  popularTiposSelect();

  if (typeof MODO_STANDALONE !== 'undefined' && MODO_STANDALONE) {
    setState({ modoStandalone: true });
    await carregar();
    const ps = getState('projetos');
    if (ps.length) {
      setState({ projAtualId: ps[0].id });
      window._LANG = 'pt';
      renderPaginaCliente(ps[0]);
      setView('cliente');
      const btn = document.getElementById('btn-voltar-painel');
      if (btn) btn.style.display = 'none';
    }
    ov.remove();
    return;
  }

  const isCliente = await checkUrlParam();
  if (isCliente) { ov.remove(); return; }

  window._loginFallbackTimer = setTimeout(() => {
    const o = document.getElementById('loading-overlay');
    if (o) { o.remove(); setView('login'); }
  }, 3000);

  onAuth(async user => {
    clearTimeout(window._loginFallbackTimer);
    const o = document.getElementById('loading-overlay');
    if (user) {
      await carregar();
      window._LANG = 'pt';
      renderPainel();
      setView('painel');
      iniciarPollingAprovacoes();
      if (o) o.remove();
    } else {
      if (new URLSearchParams(window.location.search).get('p')) {
        await checkUrlParam();
        if (o) o.remove();
        return;
      }
      if (o) o.remove();
      setView('login');
    }
  });
})();
