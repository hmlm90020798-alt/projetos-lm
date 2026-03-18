// ════════════════════════════════════════════════
// modo-apresentacao.js — Modo Apresentação · Projetos LM
// Fullscreen limpo + bloco de notas flutuante por secção
// ════════════════════════════════════════════════

import { getState, setState } from './state.js';
import { guardar }            from './firebase.js';
import { mostrarToast }       from './ui.js';

// Secções disponíveis para notas
const SECCOES = [
  { id: 'galeria',    icon: '🖼️',  label: 'Imagens 3D' },
  { id: 'elementos',  icon: '📋',  label: 'Elementos' },
  { id: 'orcamento',  icon: '💰',  label: 'Orçamento' },
  { id: 'notas',      icon: '📌',  label: 'Notas do Projeto' },
  { id: 'timeline',   icon: '📅',  label: 'Acompanhamento' },
  { id: 'docs',       icon: '📎',  label: 'Documentos' },
  { id: 'geral',      icon: '💬',  label: 'Observações Gerais' },
];

let _secaoAberta = null;
let _notasTemp   = {}; // notas em edição nesta sessão

// ── Ativar modo apresentação ──────────────────────

export function ativarModoApresentacao(projetoId) {
  const proj = getState('projetos')?.find(p => p.id === projetoId);
  if (!proj) return;

  // Guardar projeto atual
  setState({ projAtualId: projetoId });

  // Entrar em fullscreen
  const el = document.documentElement;
  if (el.requestFullscreen) el.requestFullscreen().catch(() => {});

  // Adicionar classe ao body
  document.body.classList.add('modo-apresentacao');

  // Esconder elementos do painel
  document.getElementById('view-painel')?.classList.remove('active');

  // Mostrar a página do cliente (já existe no DOM)
  document.getElementById('view-cliente')?.classList.add('active');

  // Render da página do cliente
  window._clienteModule?.renderPaginaCliente(proj);

  // Injetar o bloco de notas
  _injetarBlocoNotas(proj);

  // Botão de saída
  _injetarBotaoSaida(projetoId);
}

// ── Sair do modo apresentação ─────────────────────

export function sairModoApresentacao() {
  document.body.classList.remove('modo-apresentacao');

  // Sair de fullscreen
  if (document.exitFullscreen && document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }

  // Remover elementos injetados
  document.getElementById('bloco-notas')?.remove();
  document.getElementById('btn-sair-apresentacao')?.remove();

  // Voltar ao painel
  document.getElementById('view-cliente')?.classList.remove('active');
  document.getElementById('view-painel')?.classList.add('active');

  _secaoAberta = null;
  _notasTemp   = {};
}

// ── Injetar botão de saída ────────────────────────

function _injetarBotaoSaida(projetoId) {
  document.getElementById('btn-sair-apresentacao')?.remove();
  const btn = document.createElement('button');
  btn.id        = 'btn-sair-apresentacao';
  btn.innerHTML = '✕ Sair';
  btn.onclick   = sairModoApresentacao;
  document.body.appendChild(btn);
}

// ── Injetar bloco de notas ────────────────────────

function _injetarBlocoNotas(proj) {
  document.getElementById('bloco-notas')?.remove();

  const bloco = document.createElement('div');
  bloco.id    = 'bloco-notas';
  bloco.innerHTML = `
    <div id="bloco-notas-toggle" onclick="window._toggleBlocoNotas()">
      <span class="bloco-notas-icon">📝</span>
      <span class="bloco-notas-label">Notas</span>
      <span class="bloco-notas-count" id="bloco-notas-count"></span>
      <span class="bloco-notas-arrow" id="bloco-notas-arrow">▲</span>
    </div>
    <div id="bloco-notas-body" class="bloco-notas-body">
      <div class="bloco-seccoes" id="bloco-seccoes">
        ${SECCOES.map(s => `
          <button class="bloco-seccao-btn" id="btn-sec-${s.id}"
            onclick="window._abrirSecaoNota('${s.id}')">
            <span class="bloco-seccao-icon">${s.icon}</span>
            <span class="bloco-seccao-label">${s.label}</span>
            <span class="bloco-seccao-badge" id="badge-sec-${s.id}" style="display:none">●</span>
          </button>`).join('')}
      </div>
      <div id="bloco-editor" class="bloco-editor" style="display:none">
        <div class="bloco-editor-header">
          <button class="bloco-editor-voltar" onclick="window._voltarSeccoes()">← Voltar</button>
          <span class="bloco-editor-titulo" id="bloco-editor-titulo"></span>
        </div>
        <textarea
          id="bloco-nota-input"
          class="bloco-nota-textarea"
          placeholder="Escreve aqui a nota desta secção…"
          oninput="window._autoGuardarNota()"
        ></textarea>
        <div class="bloco-editor-footer">
          <span class="bloco-editor-hint">Guardado automaticamente</span>
          <button class="bloco-guardar-btn" onclick="window._guardarTodasNotas()">
            💾 Guardar no projeto
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(bloco);

  // Inicializar notas com o que já existe no projeto
  _notasTemp = {};
  (proj.notasApresentacao || []).forEach(n => {
    _notasTemp[n.secao] = n.texto;
  });
  _atualizarBadges();

  // Começar fechado
  bloco.classList.add('fechado');
  document.getElementById('bloco-notas-arrow').textContent = '▲';
}

// ── Toggle abrir/fechar ───────────────────────────

window._toggleBlocoNotas = function () {
  const bloco  = document.getElementById('bloco-notas');
  const arrow  = document.getElementById('bloco-notas-arrow');
  const fechado = bloco.classList.toggle('fechado');
  arrow.textContent = fechado ? '▲' : '▼';
  if (!fechado && _secaoAberta) _abrirSecaoNota(_secaoAberta);
};

// ── Abrir editor de uma secção ────────────────────

window._abrirSecaoNota = function (secaoId) {
  _secaoAberta = secaoId;
  const sec    = SECCOES.find(s => s.id === secaoId);

  // Abrir o bloco se estiver fechado
  const bloco = document.getElementById('bloco-notas');
  if (bloco.classList.contains('fechado')) {
    bloco.classList.remove('fechado');
    document.getElementById('bloco-notas-arrow').textContent = '▼';
  }

  // Mostrar editor, esconder lista
  document.getElementById('bloco-seccoes').style.display = 'none';
  document.getElementById('bloco-editor').style.display  = 'flex';

  // Preencher título e texto
  document.getElementById('bloco-editor-titulo').textContent = `${sec.icon} ${sec.label}`;
  document.getElementById('bloco-nota-input').value = _notasTemp[secaoId] || '';

  // Destacar botão ativo
  document.querySelectorAll('.bloco-seccao-btn').forEach(b => b.classList.remove('ativo'));
  document.getElementById(`btn-sec-${secaoId}`)?.classList.add('ativo');

  // Foco no textarea
  setTimeout(() => document.getElementById('bloco-nota-input')?.focus(), 100);
};

// ── Voltar à lista de secções ─────────────────────

window._voltarSeccoes = function () {
  _secaoAberta = null;
  document.getElementById('bloco-seccoes').style.display = 'grid';
  document.getElementById('bloco-editor').style.display  = 'none';
  document.querySelectorAll('.bloco-seccao-btn').forEach(b => b.classList.remove('ativo'));
};

// ── Auto-guardar nota no estado temporário ─────────

window._autoGuardarNota = function () {
  if (!_secaoAberta) return;
  const texto = document.getElementById('bloco-nota-input')?.value || '';
  _notasTemp[_secaoAberta] = texto;
  _atualizarBadges();
};

// ── Atualizar badges de secções com notas ─────────

function _atualizarBadges() {
  let total = 0;
  SECCOES.forEach(s => {
    const badge = document.getElementById(`badge-sec-${s.id}`);
    const temNota = !!_notasTemp[s.id]?.trim();
    if (badge) badge.style.display = temNota ? '' : 'none';
    if (temNota) total++;
  });
  const count = document.getElementById('bloco-notas-count');
  if (count) count.textContent = total > 0 ? total : '';
}

// ── Guardar todas as notas no Firebase ────────────

window._guardarTodasNotas = async function () {
  const projId = getState('projAtualId');
  if (!projId) return;

  const projetos = getState('projetos');
  const proj     = projetos.find(p => p.id === projId);
  if (!proj) return;

  // Converter notas para array
  const notasApresentacao = Object.entries(_notasTemp)
    .filter(([, txt]) => txt?.trim())
    .map(([secao, texto]) => {
      const sec = SECCOES.find(s => s.id === secao);
      return {
        secao,
        label: sec?.label || secao,
        texto: texto.trim(),
        data:  new Date().toLocaleDateString('pt-PT'),
      };
    });

  proj.notasApresentacao = notasApresentacao;

  try {
    await guardar(proj);
    mostrarToast('✓ Notas guardadas', `${notasApresentacao.length} secção(ões) com notas`);
  } catch (e) {
    mostrarToast('Erro ao guardar', e.message);
  }
};
