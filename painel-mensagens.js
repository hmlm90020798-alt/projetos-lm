// ════════════════════════════════════════════════
// painel-mensagens.js — Mensagens do cliente no modal
// Projetos LM
// ════════════════════════════════════════════════

import { getEditId }                          from './state.js';
import { carregarMensagens, responderMensagem } from './firebase.js';
import { mostrarToast }                        from './ui.js';
import { esc }                                 from './sanitize.js';

// ── Cache de timestamps de mensagens vistas ──────
// Persistido em localStorage para sobreviver a recarregamentos de sessão
const _LS_MSG_KEY = projId => `lm_painel_msg_visto_${projId}`;
const _ultimaMsgVista = {};

export function getMsgVisto(projId) {
  if (_ultimaMsgVista[projId]) return _ultimaMsgVista[projId];
  const val = parseInt(localStorage.getItem(_LS_MSG_KEY(projId)) || '0', 10);
  _ultimaMsgVista[projId] = val;
  return val;
}

export function setMsgVisto(projId, ts) {
  _ultimaMsgVista[projId] = ts;
  try { localStorage.setItem(_LS_MSG_KEY(projId), ts.toString()); } catch(_) {}
}

export function atualizarBadgeMensagens(projId, total) {
  const badge = document.querySelector(`[data-proj-id="${projId}"] .card-msg-badge`);
  if (badge) {
    badge.textContent = total;
    badge.style.display = total > 0 ? 'flex' : 'none';
  }
}

// ── Mensagens do cliente no modal ────────────────

export async function renderMensagensModal(projId) {
  // Suporta tanto o modal antigo como o drawer de acompanhamento
  const wrap = document.getElementById('acomp-msgs-lista') || document.getElementById('modal-msgs-lista');
  const form = document.getElementById('modal-msgs-form');
  if (!wrap) return;

  wrap.innerHTML = '<div style="color:var(--ink4);font-size:12px;padding:12px 0">A carregar…</div>';

  const msgs = await carregarMensagens(projId);

  // Atualizar cache — elimina notificação para este projeto
  const clienteMsgs = msgs.filter(m => m.origem === 'cliente');
  if (clienteMsgs.length) {
    const ultimaTs = clienteMsgs[clienteMsgs.length - 1].ts?.toMillis?.() || 0;
    setMsgVisto(projId, ultimaTs);
  }
  atualizarBadgeMensagens(projId, 0);

  const MODAL_MSG_MAX = 10;

  const renderSlice = (visivel) => {
    const slice = msgs.slice(msgs.length - visivel);
    const anterior = msgs.length - slice.length;
    const verMaisHtml = anterior > 0
      ? `<div style="text-align:center;padding:8px 0 12px">
           <button style="background:none;border:1px solid rgba(255,255,255,.1);border-radius:99px;padding:5px 14px;font-size:11px;color:var(--ink4);cursor:pointer;font-family:var(--mono)" onclick="this.closest('.modal-msgs-lista')._verMais()">↑ Ver ${anterior} mensagem${anterior > 1 ? 's' : ''} anterior${anterior > 1 ? 'es' : ''}</button>
         </div>`
      : '';
    wrap.innerHTML = verMaisHtml + slice.map(m => {
      const isHM = m.origem === 'hm';
      const ts   = m.ts?.toDate ? m.ts.toDate().toLocaleString('pt-PT', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
      return `<div class="modal-msg-item ${isHM ? 'modal-msg-hm' : 'modal-msg-cliente'}">
        <div class="modal-msg-origem">${isHM ? '✦ Hélder Melo' : '👤 Cliente'}${ts ? ` · ${ts}` : ''}</div>
        <div class="modal-msg-texto">${esc(m.texto).replace(/\n/g,'<br>')}</div>
      </div>`;
    }).join('');
    wrap.scrollTop = wrap.scrollHeight;
  };

  if (!msgs.length) {
    wrap.innerHTML = '<div style="color:var(--ink4);font-size:13px;padding:16px 0;text-align:center">Sem mensagens ainda.</div>';
  } else {
    let visivelCount = Math.min(MODAL_MSG_MAX, msgs.length);
    renderSlice(visivelCount);
    wrap._verMais = () => {
      visivelCount = Math.min(visivelCount + MODAL_MSG_MAX, msgs.length);
      renderSlice(visivelCount);
    };
  }

  if (form) form.style.display = '';
}

// ── Responder mensagem (exposto globalmente) ──────
window._responderMensagemModal = async function() {
  const projId = getEditId();
  // Suporta input do drawer ou do modal antigo
  const input = document.getElementById('acomp-msg-input') || document.getElementById('modal-msg-input');
  if (!projId || !input) return;
  const texto = input.value.trim();
  if (!texto) return;

  const btn = document.getElementById('modal-msg-btn');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  input.disabled = true;

  try {
    await responderMensagem(projId, texto);
    input.value = '';
    await renderMensagensModal(projId);
    mostrarToast('✓ Resposta enviada', 'O cliente verá na próxima visita.');
  } catch (e) {
    mostrarToast('⚠️ Erro ao enviar', 'Tente novamente.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Responder'; }
    input.disabled = false;
    input.focus();
  }
};
