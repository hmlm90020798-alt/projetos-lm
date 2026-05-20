// ════════════════════════════════════════════════
// tarefas.js — Sistema de Tarefas · Projetos LM
// ════════════════════════════════════════════════
// Estrutura: { id, texto, tipo, urgencia, prazo,
//              concluida, notificar, dataCriacao, dataConclusao }
// ════════════════════════════════════════════════

import { getProjects }  from './state.js';
import { guardar }      from './firebase.js';
import { mostrarToast } from './ui.js';
import { esc }          from './sanitize.js';

// ── Configuração ──────────────────────────────────

const EMAILJS_SERVICE   = 'service_fx8mriy';
const TEMPLATE_HM       = 'template_5lihxq4';  // só HM
const TEMPLATE_ALL      = 'template_8j2gn0e';  // HM + Serviços

export const TIPOS_TAREFA = [
  { value: 'entrega',    label: '🚚 Entrega',          template: TEMPLATE_ALL },
  { value: 'material',   label: '⚠️ Material danificado', template: TEMPLATE_ALL },
  { value: 'instalacao', label: '🔧 Instalação',        template: TEMPLATE_ALL },
  { value: 'cliente',    label: '👤 Cliente',           template: TEMPLATE_HM  },
  { value: 'geral',      label: '📌 Geral',             template: TEMPLATE_HM  },
];

export const URGENCIAS = [
  { value: 'urgente', label: '🔴 Urgente', ordem: 0 },
  { value: 'normal',  label: '🟡 Normal',  ordem: 1 },
  { value: 'baixa',   label: '🟢 Baixa',   ordem: 2 },
];

// ── Helpers ───────────────────────────────────────

export function tarefasDoProj(p) {
  return Array.isArray(p.tarefas) ? p.tarefas : [];
}

export function tarefasPendentes(p) {
  return tarefasDoProj(p).filter(t => !t.concluida);
}

export function tarefasEmAtraso(p) {
  const hoje = new Date(); hoje.setHours(23,59,59,0);
  return tarefasDoProj(p).filter(t =>
    !t.concluida && t.prazo && new Date(t.prazo + 'T23:59:59') < hoje
  );
}

export function totalTarefasEmAtraso() {
  return getProjects().reduce((acc, p) => acc + tarefasEmAtraso(p).length, 0);
}

export function totalTarefasPendentes() {
  return getProjects().reduce((acc, p) => acc + tarefasPendentes(p).length, 0);
}

function _tipoInfo(value) {
  return TIPOS_TAREFA.find(t => t.value === value) || TIPOS_TAREFA[4];
}

function _urgenciaInfo(value) {
  return URGENCIAS.find(u => u.value === value) || URGENCIAS[1];
}

// ── CRUD ──────────────────────────────────────────

export async function adicionarTarefa(projId, texto, prazo, tipo, urgencia, notificar) {
  const projetos = getProjects();
  const p = projetos.find(x => x.id === projId);
  if (!p || !texto.trim()) return;

  const nova = {
    id:          't-' + Date.now(),
    texto:       texto.trim(),
    tipo:        tipo    || 'geral',
    urgencia:    urgencia|| 'normal',
    prazo:       prazo   || null,
    concluida:   false,
    dataCriacao: new Date().toISOString(),
  };

  p.tarefas = [...tarefasDoProj(p), nova];
  await guardar(p);

  if (notificar) await _enviarNotificacao(nova, p);

  return nova;
}

export async function concluirTarefa(projId, tarefaId) {
  const p = getProjects().find(x => x.id === projId);
  if (!p) return;
  p.tarefas = tarefasDoProj(p).map(t =>
    t.id === tarefaId ? { ...t, concluida: true, dataConclusao: new Date().toISOString() } : t
  );
  await guardar(p);
}

export async function reabrirTarefa(projId, tarefaId) {
  const p = getProjects().find(x => x.id === projId);
  if (!p) return;
  p.tarefas = tarefasDoProj(p).map(t =>
    t.id === tarefaId ? { ...t, concluida: false, dataConclusao: null } : t
  );
  await guardar(p);
}

export async function apagarTarefa(projId, tarefaId) {
  const p = getProjects().find(x => x.id === projId);
  if (!p) return;
  p.tarefas = tarefasDoProj(p).filter(t => t.id !== tarefaId);
  await guardar(p);
}

// ── Notificação por email ─────────────────────────

async function _enviarNotificacao(tarefa, proj) {
  try {
    const tipoInfo    = _tipoInfo(tarefa.tipo);
    const urgInfo     = _urgenciaInfo(tarefa.urgencia);
    const dataHora    = new Date().toLocaleString('pt-PT');
    const prazoFmt    = tarefa.prazo
      ? new Date(tarefa.prazo + 'T12:00:00').toLocaleDateString('pt-PT')
      : 'Sem prazo';

    await emailjs.send(EMAILJS_SERVICE, tipoInfo.template, {
      tarefa_tipo:      tipoInfo.label,
      tarefa_urgencia:  urgInfo.label,
      tarefa_texto:     tarefa.texto,
      tarefa_prazo:     prazoFmt,
      proj_nome:        proj.nome        || '—',
      proj_refPc:       proj.refPc       || '—',
      proj_refOs:       proj.refOs       || '—',
      proj_localidade:  proj.localidade  || '—',
      proj_fase:        proj.fase        || '—',
      proj_link:        proj.id ? `https://hmlm90020798-alt.github.io/projetos-lm/?p=${proj.id}` : '—',
      data_hora:        dataHora,
    });
    mostrarToast('📧 Notificação enviada', tipoInfo.label);
  } catch (e) {
    console.error('EmailJS tarefa:', e);
    mostrarToast('✗ Erro ao enviar notificação', '');
  }
}

// ── Render — Tab Tarefas ──────────────────────────

export function renderTarefasTab() {
  const container = document.getElementById('tarefas-content');
  if (!container) return;

  const hoje     = new Date(); hoje.setHours(23,59,59,0);
  const projetos = getProjects();

  const pendentes = [];
  projetos.forEach(p => {
    tarefasDoProj(p).forEach(t => {
      if (!t.concluida) pendentes.push({ ...t, projId: p.id, projNome: p.nome || '—' });
    });
  });

  // Ordenar por urgência dentro de cada grupo
  const _ordenar = lista => lista.sort((a, b) => {
    const ua = _urgenciaInfo(a.urgencia).ordem;
    const ub = _urgenciaInfo(b.urgencia).ordem;
    return ua !== ub ? ua - ub : (a.prazo || '').localeCompare(b.prazo || '');
  });

  const emAtraso = _ordenar(pendentes.filter(t => t.prazo && new Date(t.prazo + 'T23:59:59') < hoje));
  const deHoje   = _ordenar(pendentes.filter(t => {
    if (!t.prazo) return false;
    const d = new Date(t.prazo + 'T23:59:59');
    return d >= hoje && d.toDateString() === hoje.toDateString();
  }));
  const futuras  = _ordenar(pendentes.filter(t => {
    if (!t.prazo) return false;
    const d = new Date(t.prazo + 'T23:59:59');
    return d > hoje && d.toDateString() !== hoje.toDateString();
  }));
  const semPrazo = _ordenar(pendentes.filter(t => !t.prazo));

  _actualizarBadgeTarefas();

  const renderGrupo = (titulo, lista, cls) => {
    if (!lista.length) return '';
    return '<div class="tarefas-grupo">'
      + '<div class="tarefas-grupo-titulo ' + cls + '">' + titulo
      + ' <span class="tarefas-grupo-count">' + lista.length + '</span></div>'
      + '<div class="tarefas-lista">' + lista.map(t => _tarefaCardHtml(t)).join('') + '</div>'
      + '</div>';
  };

  const html = [
    renderGrupo('⚠️ Em atraso',  emAtraso, 'tg-atraso'),
    renderGrupo('📅 Para hoje',  deHoje,   'tg-hoje'),
    renderGrupo('🗓 Próximas',   futuras,  'tg-futuras'),
    renderGrupo('📌 Sem prazo',  semPrazo, 'tg-semprazo'),
  ].join('');

  container.innerHTML = html || '<p class="tab-vazio">✓ Sem tarefas pendentes.</p>';
}

function _tarefaCardHtml(t) {
  const prazoFmt = t.prazo
    ? new Date(t.prazo + 'T12:00:00').toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })
    : '';
  const hoje     = new Date(); hoje.setHours(23,59,59,0);
  const atrasada = t.prazo && new Date(t.prazo + 'T23:59:59') < hoje;
  const tipoInfo = _tipoInfo(t.tipo);
  const urgInfo  = _urgenciaInfo(t.urgencia);

  return '<div class="tarefa-card' + (atrasada ? ' tarefa-atrasada' : '') + ' tarefa-urg-' + urgInfo.value + '">'
    + '<button class="tarefa-check" onclick="window._concluirTarefa(\'' + t.projId + '\',\'' + t.id + '\')" title="Concluir">○</button>'
    + '<div class="tarefa-body">'
    + '<div class="tarefa-texto">' + esc(t.texto) + '</div>'
    + '<div class="tarefa-meta">'
    + '<span class="tarefa-proj">' + esc(t.projNome) + '</span>'
    + '<span class="tarefa-tipo-badge tarefa-tipo-' + (t.tipo || 'geral') + '">' + tipoInfo.label + '</span>'
    + '<span class="tarefa-urg-badge tarefa-urg-badge-' + urgInfo.value + '">' + urgInfo.label + '</span>'
    + (prazoFmt ? '<span class="tarefa-prazo' + (atrasada ? ' tarefa-prazo-atrasada' : '') + '">' + prazoFmt + '</span>' : '')
    + '<div class="tarefa-acoes"><button class="tarefa-notificar" onclick="window._notificarTarefa(\'' + t.projId + '\',\'' + t.id + '\')" title="Notificar equipa por email">📧 Notificar</button></div>'
    + '</div></div>'
    + '<button class="tarefa-del" onclick="window._apagarTarefa(\'' + t.projId + '\',\'' + t.id + '\')" title="Apagar">×</button>'
    + '</div>';
}

// ── Render — Drawer ───────────────────────────────

export function renderTarefasDrawer(projId) {
  const el = document.getElementById('acomp-tarefas-lista');
  if (!el) return;
  const p = getProjects().find(x => x.id === projId);
  if (!p) return;

  const tarefas    = tarefasDoProj(p);
  const pendentes  = tarefas.filter(t => !t.concluida);
  const concluidas = tarefas.filter(t => t.concluida);

  if (!tarefas.length) {
    el.innerHTML = '<div class="acomp-vazio">Sem tarefas. Adiciona a primeira abaixo.</div>';
    return;
  }

  const hoje = new Date(); hoje.setHours(23,59,59,0);

  const renderItem = (t, isConcluida) => {
    const prazoFmt  = t.prazo
      ? new Date(t.prazo + 'T12:00:00').toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' })
      : '';
    const atrasada  = !isConcluida && t.prazo && new Date(t.prazo + 'T23:59:59') < hoje;
    const tipoInfo  = _tipoInfo(t.tipo);
    const urgInfo   = _urgenciaInfo(t.urgencia);

    return '<div class="tarefa-drawer-item' + (isConcluida ? ' concluida' : '') + (atrasada ? ' atrasada' : '') + '">'
      + '<button class="tarefa-check-drawer" onclick="window.' + (isConcluida ? '_reabrirTarefa' : '_concluirTarefa') + '(\'' + projId + '\',\'' + t.id + '\')">'
      + (isConcluida ? '✓' : '○') + '</button>'
      + '<div class="tarefa-drawer-body">'
      + '<div class="tarefa-drawer-texto">' + esc(t.texto) + '</div>'
      + '<div class="tarefa-drawer-meta">'
      + '<span class="tarefa-tipo-badge tarefa-tipo-' + (t.tipo || 'geral') + '">' + tipoInfo.label + '</span>'
      + '<span class="tarefa-urg-badge tarefa-urg-badge-' + urgInfo.value + '">' + urgInfo.label + '</span>'
      + (prazoFmt ? '<span class="tarefa-drawer-prazo' + (atrasada ? ' atrasada' : '') + '">' + (atrasada ? '⚠️ ' : '') + prazoFmt + '</span>' : '')
      + '</div></div>'
      + (!isConcluida ? '<button class="tarefa-notificar-drawer" onclick="window._notificarTarefa(\'' + projId + '\',\'' + t.id + '\')" title="Notificar equipa">📧</button>' : '')
      + '<button class="tarefa-del-drawer" onclick="window._apagarTarefa(\'' + projId + '\',\'' + t.id + '\')" title="Apagar">×</button>'
      + '</div>';
  };

  el.innerHTML = pendentes.map(t => renderItem(t, false)).join('')
    + (concluidas.length
      ? '<div class="tarefa-concluidas-sep">Concluídas (' + concluidas.length + ')</div>'
        + concluidas.slice(0, 5).map(t => renderItem(t, true)).join('')
      : '');
}

// ── Render — Form de edição ───────────────────────

export function renderTarefasForm(tarefas) {
  const lista = document.getElementById('f-tarefas-lista');
  if (!lista) return;
  lista.innerHTML = '';
  (tarefas || []).forEach(t => _addTarefaFormItem(t));
}

export function addTarefaForm(texto, prazo, tipo, urgencia, concluida, id) {
  _addTarefaFormItem({
    id:       id       || ('t-' + Date.now()),
    texto:    texto    || '',
    tipo:     tipo     || 'geral',
    urgencia: urgencia || 'normal',
    prazo:    prazo    || '',
    concluida: concluida || false,
  });
}

function _addTarefaFormItem(t) {
  const lista = document.getElementById('f-tarefas-lista');
  if (!lista) return;
  const d = document.createElement('div');
  d.className = 'tarefa-form-item';
  d.dataset.id          = t.id || ('t-' + Date.now());
  d.dataset.concluida   = t.concluida ? '1' : '0';
  d.dataset.dataCriacao = t.dataCriacao || new Date().toISOString();

  const tiposOpts  = TIPOS_TAREFA.map(tp =>
    '<option value="' + tp.value + '"' + (t.tipo === tp.value ? ' selected' : '') + '>' + tp.label + '</option>'
  ).join('');
  const urgOpts = URGENCIAS.map(u =>
    '<option value="' + u.value + '"' + (t.urgencia === u.value ? ' selected' : '') + '>' + u.label + '</option>'
  ).join('');

  d.innerHTML = '<input type="checkbox" class="tarefa-form-check"' + (t.concluida ? ' checked' : '')
    + ' onchange="this.closest(\'.tarefa-form-item\').dataset.concluida=this.checked?\'1\':\'0\'">'
    + '<input type="text" class="f-input tarefa-form-texto" placeholder="Descrição…" value="' + esc(t.texto || '') + '" style="flex:1">'
    + '<select class="f-select tarefa-form-tipo" style="width:160px">' + tiposOpts + '</select>'
    + '<select class="f-select tarefa-form-urgencia" style="width:120px">' + urgOpts + '</select>'
    + '<input type="date" class="f-input tarefa-form-prazo" value="' + (t.prazo || '') + '" style="width:130px" title="Prazo">'
    + '<button class="prod-line-del" onclick="this.closest(\'.tarefa-form-item\').remove()">×</button>';
  lista.appendChild(d);
}

// ── Badge ─────────────────────────────────────────

export function _actualizarBadgeTarefas() {
  const total = totalTarefasEmAtraso();
  const badge = document.getElementById('tab-badge-tarefas');
  if (badge) { badge.textContent = total || ''; badge.style.display = total ? '' : 'none'; }
  return total;
}

// ── Handlers globais ──────────────────────────────

window._notificarTarefa = function(projId, tarefaId) {
  const p = getProjects().find(x => x.id === projId);
  if (!p) return;
  const t = (p.tarefas || []).find(x => x.id === tarefaId);
  if (!t) return;

  const tipoInfo = _tipoInfo(t.tipo);
  const urgInfo  = _urgenciaInfo(t.urgencia);
  const prazoFmt = t.prazo
    ? new Date(t.prazo + 'T12:00:00').toLocaleDateString('pt-PT') : 'Sem prazo';

  // Destinatários conforme tipo
  const destinatarios = tipoInfo.template === TEMPLATE_ALL
    ? 'Hélder Melo + Serviços Leroy Merlin Viseu'
    : 'Hélder Melo';

  // Assunto pré-preenchido
  const assunto = tipoInfo.label + ' — ' + (p.nome || '—') + (p.refPc ? ' · PC ' + p.refPc : '');

  // Mensagem pré-preenchida
  const linhas = [
    'Assunto: ' + tipoInfo.label + ' (' + urgInfo.label + ')',
    'Projecto: ' + (p.nome || '—'),
    p.refPc      ? 'Ref. PC: '      + p.refPc      : '',
    p.localidade ? 'Localidade: '   + p.localidade  : '',
    'Prazo: ' + prazoFmt,
    '',
    'Situação:',
    t.texto,
    '',
    'Por favor, confirma recepção e indica como pretendes proceder.',
  ].filter((l, i) => l !== '' || i > 3);
  const mensagem = linhas.join('\n');

  // Contexto (só leitura)
  const ctxEl = document.getElementById('notif-contexto');
  if (ctxEl) ctxEl.innerHTML = '<div class="notif-ctx-proj">' + esc(p.nome || '—') + '</div>'
    + '<div class="notif-ctx-meta">'
    + '<span class="tarefa-tipo-badge tarefa-tipo-' + (t.tipo||'geral') + '">' + tipoInfo.label + '</span>'
    + '<span class="tarefa-urg-badge tarefa-urg-badge-' + urgInfo.value + '">' + urgInfo.label + '</span>'
    + '</div>';

  // Preencher campos
  const paraEl = document.getElementById('notif-para');
  const assEl  = document.getElementById('notif-assunto');
  const msgEl  = document.getElementById('notif-mensagem');
  if (paraEl) paraEl.textContent = destinatarios;
  if (assEl)  assEl.value  = assunto;
  if (msgEl)  msgEl.value  = mensagem;

  // Guardar contexto para envio
  const modal = document.getElementById('modal-notif-tarefa');
  if (modal) {
    modal._projId   = projId;
    modal._tarefaId = tarefaId;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    setTimeout(() => msgEl?.focus(), 100);
  }
};

window._fecharModalNotif = function() {
  const modal = document.getElementById('modal-notif-tarefa');
  if (modal) { modal.style.display = 'none'; }
  document.body.style.overflow = '';
};

window._enviarNotifModal = async function() {
  const modal  = document.getElementById('modal-notif-tarefa');
  const assunto= document.getElementById('notif-assunto')?.value?.trim();
  const mensagem=document.getElementById('notif-mensagem')?.value?.trim();
  const btn    = document.getElementById('notif-btn-enviar');

  if (!assunto || !mensagem) {
    mostrarToast('⚠️ Preenche o assunto e a mensagem', ''); return;
  }

  const projId   = modal?._projId;
  const tarefaId = modal?._tarefaId;
  const p = getProjects().find(x => x.id === projId);
  const t = p ? (p.tarefas || []).find(x => x.id === tarefaId) : null;
  if (!p || !t) return;

  if (btn) { btn.disabled = true; btn.textContent = 'A enviar…'; }

  try {
    const tipoInfo = _tipoInfo(t.tipo);
    await emailjs.send(EMAILJS_SERVICE, tipoInfo.template, {
      tarefa_tipo:     tipoInfo.label,
      tarefa_urgencia: _urgenciaInfo(t.urgencia).label,
      tarefa_assunto:  assunto,
      tarefa_mensagem: mensagem,
      proj_nome:       p.nome       || '—',
      proj_refPc:      p.refPc      || '—',
      proj_refOs:      p.refOs      || '—',
      proj_localidade: p.localidade || '—',
      proj_link:       p.id ? 'https://hmlm90020798-alt.github.io/projetos-lm/?p=' + p.id : '—',
      data_hora:       new Date().toLocaleString('pt-PT'),
    });
    mostrarToast('📧 Email enviado', tipoInfo.label + ' — ' + (p.nome || '—'));
    window._fecharModalNotif();
  } catch (e) {
    console.error('EmailJS notif:', e);
    mostrarToast('✗ Erro ao enviar', '');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📧 Enviar'; }
  }
};

window._concluirTarefa = async function(projId, tarefaId) {
  await concluirTarefa(projId, tarefaId);
  mostrarToast('✓ Tarefa concluída', '');
  renderTarefasTab();
  renderTarefasDrawer(projId);
  _actualizarBadgeTarefas();
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
  const inputTexto   = document.getElementById('acomp-tarefa-texto');
  const inputPrazo   = document.getElementById('acomp-tarefa-prazo');
  const selectTipo   = document.getElementById('acomp-tarefa-tipo');
  const selectUrg    = document.getElementById('acomp-tarefa-urgencia');
  const chkNotificar = document.getElementById('acomp-tarefa-notificar');

  const texto = inputTexto?.value?.trim();
  if (!texto) { inputTexto?.focus(); return; }

  const tipo     = selectTipo?.value    || 'geral';
  const urgencia = selectUrg?.value     || 'normal';
  const prazo    = inputPrazo?.value    || null;
  const notificar= chkNotificar?.checked || false;

  await adicionarTarefa(projId, texto, prazo, tipo, urgencia, notificar);

  // Limpar campos
  if (inputTexto)   inputTexto.value   = '';
  if (inputPrazo)   inputPrazo.value   = '';
  if (selectTipo)   selectTipo.value   = 'geral';
  if (selectUrg)    selectUrg.value    = 'normal';
  if (chkNotificar) chkNotificar.checked = false;

  renderTarefasDrawer(projId);
  _actualizarBadgeTarefas();
  if (typeof window.renderPainel === 'function') window.renderPainel();
  mostrarToast('+ Tarefa adicionada', notificar ? ' · Notificação enviada' : '');
};

// ── Email resumo diário ───────────────────────────

export async function enviarEmailResumo() {
  const projetos = getProjects();
  const hoje     = new Date();

  const atrasadas = [];
  projetos.forEach(p => {
    tarefasEmAtraso(p).forEach(t => {
      const dias = Math.round((hoje - new Date(t.prazo + 'T23:59:59')) / 86400000);
      const urg  = _urgenciaInfo(t.urgencia).label;
      atrasadas.push('• [' + (p.nome || '—') + '] ' + t.texto + ' (' + urg + ') — atrasada ' + dias + ' dia' + (dias !== 1 ? 's' : ''));
    });
  });

  const semActividade = projetos.filter(p => {
    const faseActiva = ['proposta','retificacao','aprovado','encomenda','entrega','montagem'];
    if (!faseActiva.includes(p.fase)) return false;
    const ult = (p.interacoes || []).slice(-1)[0];
    if (!ult) {
      const c = p.dataCriacao ? new Date(p.dataCriacao + 'T12:00:00') : null;
      return c && Math.round((hoje - c) / 86400000) > 7;
    }
    const [d,m,y] = (ult.data||'').split('/');
    const dt = y ? new Date(y+'-'+m+'-'+d+'T12:00:00') : null;
    return dt && Math.round((hoje - dt) / 86400000) > 7;
  }).map(p => '• [' + (p.nome||'—') + '] ' + p.fase + ' — sem actividade há mais de 7 dias');

  if (!atrasadas.length && !semActividade.length) {
    mostrarToast('✓ Sem pendentes', 'Nada a reportar hoje.'); return;
  }

  const dataHoje = hoje.toLocaleDateString('pt-PT', { weekday:'long', day:'numeric', month:'long' });
  const corpo = [
    atrasadas.length    ? 'TAREFAS EM ATRASO (' + atrasadas.length + '):\n' + atrasadas.join('\n') : '',
    semActividade.length? 'PROJECTOS SEM ACTIVIDADE (' + semActividade.length + '):\n' + semActividade.join('\n') : '',
  ].filter(Boolean).join('\n\n');

  try {
    await emailjs.send(EMAILJS_SERVICE, TEMPLATE_HM, {
      data_hoje:      dataHoje,
      corpo:          corpo,
      total_tarefas:  atrasadas.length,
      total_projs:    semActividade.length,
    });
    mostrarToast('📧 Resumo enviado', atrasadas.length + ' tarefa(s) em atraso');
  } catch (e) {
    console.error('EmailJS resumo:', e);
    mostrarToast('✗ Erro ao enviar email', '');
  }
}
