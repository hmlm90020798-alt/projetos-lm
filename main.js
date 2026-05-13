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
import { carregar, doLogin, doLogout, onAuth, registarVisita, carregarGroqKey, guardarGroqKey,
         carregarMensagens, enviarMensagemCliente, responderMensagem, marcarMensagensLidas } from './firebase.js';
import { setView, mostrarToast } from './ui.js';
import {
  abrirModalNovo, fecharModal, guardarProjeto,
  editarProjeto, apagarProjeto, verCliente, partilharCliente, gerarPDF,
  setFiltro, abrirProjetoDoAlerta,
  reiniciarPrazoForm, atualizarTipoProjeto,
  iniciarPollingAprovacoes, copiarEmail, copiarRef,
  inicializarPainel,
} from './painel.js';
import { setTab, renderAlertas, renderOcorrenciasTab } from './painel-alertas.js';
import { renderPainel, toggleOrdem, toggleValorCard, TIPOS_PROJETO } from './painel-dashboard.js';
import {
  addLinhaElem, addCatElemExtra, addLinhaElemExtra,
  addCatOrcamento, addNota, addDoc, processarImagens, removerImagem, renderThumbs,
  atualizarTotalPreview, addInteracao, addOcorrencia, atualizarEstadoOcorrencia,
} from './painel-form-extras.js';
import {
  renderPaginaCliente, renderEstadoAprovacao, aprovarProposta,
  abrirLightbox, fecharLightbox, lightboxNav, setLang,
  enviarReclamacao,
} from './cliente.js';
import {
  abrirResumoIA, fecharResumoIA, regenerarResumoIA, copiarResumoIA,
} from './resumo-ia.js';
import {
  renderReclamacoes, carregarReclamacoesFirebase,
} from './reclamacoes.js';
import {
  ativarModoApresentacao, sairModoApresentacao,
} from './modo-apresentacao.js';

window._clienteModule            = { renderPaginaCliente };

// ── Exposição global ──────────────────────────────
window.doLogin                  = () => loginHandler();
window.doLogout                 = async () => { await doLogout(); setView('login'); };
window.abrirResumoIA            = abrirResumoIA;
window.fecharResumoIA           = fecharResumoIA;
window.regenerarResumoIA        = regenerarResumoIA;
window.copiarResumoIA           = copiarResumoIA;
window.abrirProjetoDoAlerta     = abrirProjetoDoAlerta;
window.setFiltro                = setFiltro;
window.setTab                   = setTab;
window.renderAlertas            = renderAlertas;
window.renderOcorrenciasTab     = renderOcorrenciasTab;
window.abrirModalNovo           = abrirModalNovo;
window.fecharModal              = fecharModal;
window.guardarProjeto           = guardarProjeto;
window.editarProjeto            = editarProjeto;
window.apagarProjeto            = apagarProjeto;
window.verCliente               = verCliente;
window.partilharCliente         = partilharCliente;
window.gerarPDF                 = gerarPDF;
window.setView                  = setView;
window.renderPainel             = renderPainel;
window.toggleOrdem              = toggleOrdem;
window.toggleValorCard          = toggleValorCard;
window.addLinhaElem             = addLinhaElem;
window.addCatElemExtra          = addCatElemExtra;
window.addLinhaElemExtra        = addLinhaElemExtra;
window.addCatOrcamento          = addCatOrcamento;
window.addNota                  = addNota;
window.addDoc                   = addDoc;
window.processarImagens         = processarImagens;
window.removerImagem            = removerImagem;
window.renderThumbs             = renderThumbs;
window.atualizarTotalPreview    = atualizarTotalPreview;
window.aprovarProposta          = aprovarProposta;
window.atualizarTipoProjeto     = atualizarTipoProjeto;
window.reiniciarPrazoForm       = reiniciarPrazoForm;
window.setLang                  = setLang;
window.enviarReclamacao         = enviarReclamacao;
window.abrirLightbox            = abrirLightbox;
window.fecharLightbox           = fecharLightbox;
window.lightboxNav              = lightboxNav;
window.addInteracao             = addInteracao;
window.addOcorrencia            = addOcorrencia;
window.atualizarEstadoOcorrencia= atualizarEstadoOcorrencia;
window.copiarEmail              = copiarEmail;
window.copiarRef                = copiarRef;
window.mostrarToast             = mostrarToast;
window.renderReclamacoes        = renderReclamacoes;
window.guardarGroqKey           = guardarGroqKey;
window.enviarMensagemCliente    = enviarMensagemCliente;
window.enviarMensagem           = async () => {
  const { enviarMensagem: _env } = await import('./cliente.js');
  return _env();
};
window.responderMensagem        = responderMensagem;
window.marcarMensagensLidas     = marcarMensagensLidas;
window.carregarMensagens        = carregarMensagens;
window.ativarModoApresentacao   = ativarModoApresentacao;
window.sairModoApresentacao     = sairModoApresentacao;

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
  const params  = new URLSearchParams(window.location.search);
  const id      = params.get('p');
  const isPrint = params.get('print') === '1';
  if (!id) return false;
  setState({ isClienteMode: true, projAtualId: id });
  window._LANG = 'pt';
  try {
    const { carregarUm } = await import('./firebase.js');
    const p = await carregarUm(id);

    if (!p) {
      // Projeto não existe — link inválido
      setView('expirada');
      return true;
    }

    // ── Verificação 1: link revogado manualmente
    if (p.linkAtivo === false) {
      setView('expirada');
      return true;
    }

    // ── Verificação 2: expiração automática
    // Só aplica se a proposta ainda não avançou para aprovado ou além
    const fasesAprovadas = ['aprovado', 'encomenda', 'entrega', 'montagem', 'concluido'];
    const jaAprovado = fasesAprovadas.includes(p.fase) || !!p.aprovacao?.data;

    if (p.prazo && !jaAprovado) {
      const prazoDate    = new Date(p.prazo + 'T23:59:59');
      const agora        = new Date();
      // diasPassados > 0 significa que o prazo já terminou
      const diasPassados = Math.floor((agora - prazoDate) / (1000 * 60 * 60 * 24));

      if (diasPassados > 5) {
        // Mais de 5 dias após expiração — link completamente inativo
        setView('expirada');
        return true;
      }

      if (diasPassados > 0) {
        // Expirado 1-5 dias — mostrar página de contacto com countdown
        mostrarExpiradaContacto(p, diasPassados);
        return true;
      }
      // diasPassados <= 0 significa prazo futuro ou hoje — continua normalmente
    }

    // ── Projeto válido — renderizar normalmente
    renderPaginaCliente(p);
    setView('cliente');
    const btn = document.getElementById('btn-voltar-painel');
    if (btn) btn.style.display = 'none';
    if (!isPrint) registarVisita(id);
    if (isPrint) { setTimeout(() => { window.print(); }, 800); }

  } catch (err) {
    // Erro de rede ou Firestore indisponível
    const isOffline = !navigator.onLine || err?.code === 'unavailable';
    mostrarErroRede(id, isOffline);
  }
  return true;
}

// ── Expirada com contacto (0-5 dias após prazo) ───
function mostrarExpiradaContacto(p, diasPassados) {
  const el = document.getElementById('exp-contacto-wrap');
  if (!el) { setView('expirada'); return; }

  const diasRestantes = 5 - diasPassados;
  const nome = p.nome ? p.nome.split('·')[0].trim() : '';

  document.getElementById('exp-icon').textContent        = diasPassados === 0 ? '⌛' : '📋';
  document.getElementById('exp-titulo').textContent      = 'Proposta Expirada';
  document.getElementById('exp-nome').textContent        = nome ? `Proposta de ${nome}` : 'Proposta';
  document.getElementById('exp-msg').textContent         = diasRestantes > 1
    ? `O prazo desta proposta terminou. Este link estará disponível por mais ${diasRestantes} dias.`
    : `O prazo desta proposta terminou. Este link expira amanhã.`;
  document.getElementById('exp-dias-restantes').textContent = diasRestantes > 1
    ? `${diasRestantes} dias restantes`
    : '1 dia restante';

  setView('expirada');
}

// ── Erro de rede na vista do cliente ──────────────
function mostrarErroRede(id, isOffline) {
  const el = document.getElementById('erro-rede-icon');
  const titulo = document.getElementById('erro-rede-titulo');
  const sub    = document.getElementById('erro-rede-sub');
  if (el)    el.textContent    = isOffline ? '📡' : '⚠️';
  if (titulo) titulo.textContent = isOffline ? 'Sem ligação à internet' : 'Erro temporário';
  if (sub)    sub.textContent    = isOffline
    ? 'Verifica a tua ligação e tenta novamente.'
    : 'Não foi possível carregar a proposta. Por favor tenta novamente.';
  const btn = document.getElementById('erro-rede-retry');
  if (btn) btn.onclick = () => { setView('loading-overlay'); checkUrlParam(); };
  setView('erro-rede');
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
      // Forçar refresh do token para garantir que o Firestore o reconhece
      await user.getIdToken(true);
      await carregar();
      await carregarReclamacoesFirebase(); // pré-carrega reclamações do Firebase
      await carregarGroqKey(); // carrega chave Groq do Firebase para localStorage
      window._LANG = 'pt';
      inicializarPainel();
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
