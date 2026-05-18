// ════════════════════════════════════════════════
// tarefas.js — Sistema de Tarefas · Projetos LM
// ════════════════════════════════════════════════
// Tarefas são compromissos do HM por projecto.
// Guardadas em p.tarefas[] no documento Firestore.
// Estrutura: { id, texto, prazo, concluida, dataCriacao, dataConclusao }
// ════════════════════════════════════════════════

import { getProjects, getState }  from './state.js';
import { guardar }                 from './firebase.js';
import { mostrarToast }            from './ui.js';
import { esc }                     from './sanitize.js';

// ── Helpers ───────────────────────────────────────

export function tarefasDoProj(p) {
  return Array.isArray(p.tarefas) ? p.tarefas : [];
}

export function tarefasPendentes(p) {
  return tarefasDoProj(p).filter(t => !t.concluida);
}

export function tarefasEmAtraso(p) {
  const hoje = new Date(); hoje.setHours(23,59,59,0);
  return tarefasDoProj(p).filter(t => !t.concluida && t.prazo && new Date(t.prazo + 'T23:59:59') < hoje);
}

// Total de tarefas em atraso em todos os projectos
export function totalTarefasEmAtraso() {
  return getProjects().reduce((acc, p) => acc + tarefasEmAtraso(p).length, 0);
}

export function totalTarefasPendentes() {
  return getProjects().reduce((acc, p) => acc + tarefasPendentes(p).length, 0);
}

// ── CRUD de tarefas ───────────────────────────────

export async function adicionarTarefa(projId, texto, prazo) {
  const projetos = getProjects();
  const p = projetos.find(x => x.id === projId);
  if (!p || !texto.trim()) return;

  const nova = {
    id:          't-' + Date.now(),
    texto:       texto.trim(),
    prazo:       prazo || null,
    concluida:   false,
    dataCriacao: new Date().toISOString(),
  };

  p.tarefas = [...tarefasDoProj(p), nova];
  await guardar(p);
  return nova;
}

export async function concluirTarefa(projId, tarefaId) {
  const projetos = getProjects();
  const p = projetos.find(x => x.id === projId);
  if (!p) return;

  p.tarefas = tarefasDoProj(p).map(t =>
    t.id === tarefaId
      ? { ...t, concluida: true, dataConclusao: new Date().toISOString() }
      : t
  );
  await guardar(p);
}

export async function reabrirTarefa(projId, tarefaId) {
  const projetos = getProjects();
  const p = projetos.find(x => x.id === projId);
  if (!p) return;

  p.tarefas = tarefasDoProj(p).map(t =>
    t.id === tarefaId ? { ...t, concluida: false, dataConclusao: null } : t
  );
  await guardar(p);
}

export async function apagarTarefa(projId, tarefaId) {
  const projetos = getProjects();
  const p = projetos.find(x => x.id === projId);
  if (!p) return;

  p.tarefas = tarefasDoProj(p).filter(t => t.id !== tarefaId);
  await guardar(p);
}

// ── Render — lista consolidada de tarefas (tab Tarefas) ──

export function renderTarefasTab() {
  const container = document.getElementById('tarefas-content');
  if (!container) return;

  const hoje     = new Date(); hoje.setHours(23,59,59,0);
  const projetos = getProjects();

  // Recolher todas as tarefas pendentes com contexto do projecto
  const pendentes = [];
  projetos.forEach(p => {
    tarefasDoProj(p).forEach(t => {
      if (!t.concluida) pendentes.push({ ...t, projId: p.id, projNome: p.nome || '—' });
    });
  });

  // Separar em atraso / hoje / futuras / sem prazo
  const emAtraso  = pendentes.filter(t => t.prazo && new Date(t.prazo + 'T23:59:59') < hoje);
  const deHoje    = pendentes.filter(t => t.prazo && new Date(t.prazo + 'T23:59:59').toDateString() === hoje.toDateString() && !emAtraso.includes(t));

  // Ordenar futuras por prazo
  const futuras   = pendentes
    .filter(t => t.prazo && !emAtraso.includes(t) && !deHoje.includes(t))
    .sort((a, b) => a.prazo.localeCompare(b.prazo));
  const semPrazo  = pendentes.filter(t => !t.prazo);

  // Actualizar badge
  _actualizarBadgeTarefas();

  const renderGrupo = (titulo, lista, cls) => {
    if (!lista.length) return '';
    return `
      <div class="tarefas-grupo">
        <div class="tarefas-grupo-titulo ${cls}">${titulo} <span class="tarefas-grupo-count">${lista.length}</span></div>
        <div class="tarefas-lista">
          ${lista.map(t => _tarefaCardHtml(t)).join('')}
        </div>
      </div>`;
  };

  const html = [
    renderGrupo('⚠️ Em atraso', emAtraso, 'tg-atraso'),
    renderGrupo('📅 Para hoje', deHoje, 'tg-hoje'),
    renderGrupo('🗓 Próximas', futuras, 'tg-futuras'),
    renderGrupo('📌 Sem prazo', semPrazo, 'tg-semprazo'),
  ].join('');

  container.innerHTML = html || '<p class="tab-vazio">✓ Sem tarefas pendentes.</p>';
}

function _tarefaCardHtml(t) {
  const prazoFmt = t.prazo
    ? new Date(t.prazo + 'T12:00:00').toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })
    : '';
  const hoje  = new Date(); hoje.setHours(23,59,59,0);
  const atrasada = t.prazo && new Date(t.prazo + 'T23:59:59') < hoje;
  return `
    <div class="tarefa-card${atrasada ? ' tarefa-atrasada' : ''}">
      <button class="tarefa-check" onclick="window._concluirTarefa('${t.projId}','${t.id}')" title="Marcar como concluída">○</button>
      <div class="tarefa-body">
        <div class="tarefa-texto">${esc(t.texto)}</div>
        <div class="tarefa-meta">
          <span class="tarefa-proj">${esc(t.projNome)}</span>
          ${prazoFmt ? `<span class="tarefa-prazo${atrasada ? ' tarefa-prazo-atrasada' : ''}">${prazoFmt}</span>` : ''}
        </div>
      </div>
      <button class="tarefa-del" onclick="window._apagarTarefa('${t.projId}','${t.id}')" title="Apagar">×</button>
    </div>`;
}

// ── Render — tarefas no drawer de acompanhamento ──

export function renderTarefasDrawer(projId) {
  const el = document.getElementById('acomp-tarefas-lista');
  if (!el) return;

  const projetos = getProjects();
  const p = projetos.find(x => x.id === projId);
  if (!p) return;

  const tarefas = tarefasDoProj(p);
  if (!tarefas.length) {
    el.innerHTML = '<div class="acomp-vazio">Sem tarefas. Adiciona a primeira abaixo.</div>';
    return;
  }

  const hoje = new Date(); hoje.setHours(23,59,59,0);
  const pendentes  = tarefas.filter(t => !t.concluida);
  const concluidas = tarefas.filter(t => t.concluida);

  const renderItem = (t, isConcluida) => {
    const prazoFmt = t.prazo
      ? new Date(t.prazo + 'T12:00:00').toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' })
      : '';
    const atrasada = !isConcluida && t.prazo && new Date(t.prazo + 'T23:59:59') < hoje;
    return `
      <div class="tarefa-drawer-item${isConcluida ? ' concluida' : ''}${atrasada ? ' atrasada' : ''}">
        <button class="tarefa-check-drawer" onclick="window.${isConcluida ? '_reabrirTarefa' : '_concluirTarefa'}('${projId}','${t.id}')"
          title="${isConcluida ? 'Reabrir' : 'Concluir'}">
          ${isConcluida ? '✓' : '○'}
        </button>
        <div class="tarefa-drawer-body">
          <div class="tarefa-drawer-texto">${esc(t.texto)}</div>
          ${prazoFmt ? `<div class="tarefa-drawer-prazo${atrasada ? ' atrasada' : ''}">${atrasada ? '⚠️ ' : ''}${prazoFmt}</div>` : ''}
        </div>
        <button class="tarefa-del-drawer" onclick="window._apagarTarefa('${projId}','${t.id}')" title="Apagar">×</button>
      </div>`;
  };

  el.innerHTML = pendentes.map(t => renderItem(t, false)).join('')
    + (concluidas.length
      ? `<div class="tarefa-concluidas-sep">Concluídas (${concluidas.length})</div>`
        + concluidas.slice(0, 5).map(t => renderItem(t, true)).join('')
      : '');
}

// ── Render — tarefas no form de edição ───────────

export function renderTarefasForm(tarefas) {
  const lista = document.getElementById('f-tarefas-lista');
  if (!lista) return;
  lista.innerHTML = '';
  (tarefas || []).forEach(t => _addTarefaFormItem(t));
}

export function addTarefaForm(texto = '', prazo = '', concluida = false, id = null) {
  const lista = document.getElementById('f-tarefas-lista');
  if (!lista) return;
  _addTarefaFormItem({ id: id || ('t-' + Date.now()), texto, prazo, concluida });
}

function _addTarefaFormItem(t) {
  const lista = document.getElementById('f-tarefas-lista');
  if (!lista) return;
  const d = document.createElement('div');
  d.className = 'tarefa-form-item';
  d.dataset.id = t.id || ('t-' + Date.now());
  d.dataset.concluida = t.concluida ? '1' : '0';
  d.dataset.dataCriacao = t.dataCriacao || new Date().toISOString();
  d.innerHTML = `
    <input type="checkbox" class="tarefa-form-check" ${t.concluida ? 'checked' : ''}
      onchange="this.closest('.tarefa-form-item').dataset.concluida=this.checked?'1':'0'">
    <input type="text"  class="f-input tarefa-form-texto" placeholder="Descrição da tarefa" value="${esc(t.texto || '')}" style="flex:1">
    <input type="date"  class="f-input tarefa-form-prazo" value="${t.prazo || ''}" style="width:140px" title="Prazo">
    <button class="prod-line-del" onclick="this.closest('.tarefa-form-item').remove()">×</button>`;
  lista.appendChild(d);
}

// ── Actualizar badge ──────────────────────────────

export function _actualizarBadgeTarefas() {
  const total   = totalTarefasEmAtraso();
  const badge   = document.getElementById('tab-badge-tarefas');
  if (badge) {
    badge.textContent    = total || '';
    badge.style.display  = total ? '' : 'none';
  }
  // Badge no painel — card visual por projecto (chamado pelo renderCard)
  return total;
}

// ── Handlers globais ──────────────────────────────

window._concluirTarefa = async function(projId, tarefaId) {
  await concluirTarefa(projId, tarefaId);
  mostrarToast('✓ Tarefa concluída', '');
  renderTarefasTab();
  renderTarefasDrawer(projId);
  _actualizarBadgeTarefas();
  // Re-render do painel para actualizar badge no card
  if (typeof window.renderPainel === 'function') window.renderPainel();
};

window._reabrirTarefa = async function(projId, tarefaId) {
  await reabrirTarefa(projId, tarefaId);
  mostrarToast('↩ Tarefa reaberta', '');
  renderTarefasTab();
  renderTarefasDrawer(projId);
  _actualizarBadgeTarefas();
  if (typeof window.renderPainel === 'function') window.renderPainel();
};

window._apagarTarefa = async function(projId, tarefaId) {
  await apagarTarefa(projId, tarefaId);
  renderTarefasTab();
  renderTarefasDrawer(projId);
  _actualizarBadgeTarefas();
  if (typeof window.renderPainel === 'function') window.renderPainel();
};

window._adicionarTarefaDrawer = async function(projId) {
  const inputTexto = document.getElementById('acomp-tarefa-texto');
  const inputPrazo = document.getElementById('acomp-tarefa-prazo');
  const texto = inputTexto?.value?.trim();
  if (!texto) return;
  await adicionarTarefa(projId, texto, inputPrazo?.value || null);
  if (inputTexto) inputTexto.value = '';
  if (inputPrazo) inputPrazo.value = '';
  renderTarefasDrawer(projId);
  _actualizarBadgeTarefas();
  if (typeof window.renderPainel === 'function') window.renderPainel();
  mostrarToast('+ Tarefa adicionada', '');
};

// ── Email diário de resumo ────────────────────────
// Chamado manualmente ou via botão nas definições.
// EmailJS envia para o HM com lista de tarefas em atraso
// e projectos sem actividade há mais de 7 dias.

export async function enviarEmailResumo() {
  const projetos = getProjects();
  const hoje     = new Date();

  // Tarefas em atraso
  const tarefasAtrasadas = [];
  projetos.forEach(p => {
    tarefasEmAtraso(p).forEach(t => {
      const dias = Math.round((hoje - new Date(t.prazo + 'T23:59:59')) / 86400000);
      tarefasAtrasadas.push(`• [${p.nome}] ${t.texto} — atrasada ${dias} dia${dias !== 1 ? 's' : ''}`);
    });
  });

  // Projectos activos sem actividade há mais de 7 dias
  const semActividade = projetos.filter(p => {
    const faseActiva = ['proposta', 'retificacao', 'aprovado', 'encomenda', 'entrega', 'montagem'];
    if (!faseActiva.includes(p.fase)) return false;
    const ultimaInt = (p.interacoes || []).slice(-1)[0];
    if (!ultimaInt) {
      const criacao = p.dataCriacao ? new Date(p.dataCriacao + 'T12:00:00') : null;
      return criacao && Math.round((hoje - criacao) / 86400000) > 7;
    }
    const [d, m, y] = (ultimaInt.data || '').split('/');
    const dataInt = y ? new Date(`${y}-${m}-${d}T12:00:00`) : null;
    return dataInt && Math.round((hoje - dataInt) / 86400000) > 7;
  }).map(p => {
    const ultimaInt = (p.interacoes || []).slice(-1)[0];
    const dias = ultimaInt
      ? (() => { const [d,m,y] = (ultimaInt.data||'').split('/'); return y ? Math.round((hoje - new Date(`${y}-${m}-${d}T12:00:00`)) / 86400000) : '?'; })()
      : '?';
    return `• [${p.nome}] ${p.fase} — sem actividade há ${dias} dia${dias !== 1 ? 's' : ''}`;
  });

  if (!tarefasAtrasadas.length && !semActividade.length) {
    mostrarToast('✓ Sem pendentes', 'Nada a reportar hoje.');
    return;
  }

  const dataHoje = hoje.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
  const corpo = [
    tarefasAtrasadas.length ? `TAREFAS EM ATRASO (${tarefasAtrasadas.length}):\n${tarefasAtrasadas.join('\n')}` : '',
    semActividade.length    ? `PROJECTOS SEM ACTIVIDADE (${semActividade.length}):\n${semActividade.join('\n')}` : '',
  ].filter(Boolean).join('\n\n');

  try {
    await emailjs.send('service_ijgsl8w', 'template_resumo_diario', {
      data_hoje:    dataHoje,
      corpo:        corpo,
      total_tarefas: tarefasAtrasadas.length,
      total_projs:   semActividade.length,
    });
    mostrarToast('📧 Resumo enviado', `${tarefasAtrasadas.length} tarefa(s) em atraso`);
  } catch (e) {
    console.error('EmailJS resumo:', e);
    mostrarToast('✗ Erro ao enviar email', '');
  }
}
