// ════════════════════════════════════════════════
// painel-dashboard.js — Render do painel, cards,
// dashboard, ordenação e filtros visuais
// Projetos LM
// ════════════════════════════════════════════════

import { getState, setState, getProjects } from './state.js';
import { mostrarToast, fmt, formatarData }  from './ui.js';
import { carregarVisitas }                  from './firebase.js';

// ── Ordenação ─────────────────────────────────────
// 'data' = mais recente primeiro (default) | 'az' = A→Z | 'za' = Z→A
let _ordemAtual = 'data';
let _valorCardModo = 'medio'; // 'medio' | 'global'
let _valorMedioAtual = 0;
let _valorGlobalAtual = 0;

export function toggleOrdem() {
  if (_ordemAtual === 'data') {
    _ordemAtual = 'az';
  } else if (_ordemAtual === 'az') {
    _ordemAtual = 'za';
  } else {
    _ordemAtual = 'data';
  }
  const labels   = { data: 'Data', az: 'A → Z', za: 'Z → A' };
  const icons    = { data: '↕', az: '↑', za: '↓' };
  const elLabel  = document.getElementById('btn-ordenar-label');
  const elIcon   = document.getElementById('btn-ordenar-icon');
  const elBtn    = document.getElementById('btn-ordenar');
  if (elLabel) elLabel.textContent = labels[_ordemAtual];
  if (elIcon)  elIcon.textContent  = icons[_ordemAtual];
  if (elBtn)   elBtn.classList.toggle('ativo', _ordemAtual !== 'data');
  renderPainel();
}

export function toggleValorCard() {
  _valorCardModo = _valorCardModo === 'medio' ? 'global' : 'medio';
  const display = document.getElementById('stat-valor-display');
  const label   = document.getElementById('dash-valor-label');
  const card    = document.getElementById('dash-card-valor');
  if (_valorCardModo === 'global') {
    if (display) display.textContent = _valorGlobalAtual > 0 ? fmt(_valorGlobalAtual) : '—';
    if (label)   label.textContent   = 'Valor Global';
    if (card)    card.classList.add('modo-global');
  } else {
    if (display) display.textContent = _valorMedioAtual > 0 ? fmt(_valorMedioAtual) : '—';
    if (label)   label.textContent   = 'Valor Médio';
    if (card)    card.classList.remove('modo-global');
  }
}

function ordenarLista(lista) {
  const copia = [...lista];
  if (_ordemAtual === 'az') {
    copia.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt'));
  } else if (_ordemAtual === 'za') {
    copia.sort((a, b) => (b.nome || '').localeCompare(a.nome || '', 'pt'));
  }
  // 'data' já vem ordenada por dataCriacao do Firebase
  return copia;
}

// ── Tipos de projecto ─────────────────────────────
export const TIPOS_PROJETO = [
  { value: 'cozinha',            label: '🍳 Cozinha' },
  { value: 'casa-de-banho',      label: '🚿 Casa de Banho' },
  { value: 'roupeiro',           label: '🚪 Roupeiro' },
  { value: 'renovacao-parcial',  label: '🔨 Renovação Parcial' },
  { value: 'aquecimento',        label: '🔥 Aquecimento' },
  { value: 'outro',              label: '✦ Outro' },
];

// ── Fases ─────────────────────────────────────────
const FASE_LABEL = {
  proposta:    'Em Análise',
  retificacao: 'Retificação',
  aprovado:    'Aprovado',
  encomenda:   'Encomendado',
  entrega:     'Entrega',
  montagem:    'Em Obra',
  concluido:   'Concluído',
};
const FASE_CLASSE = {
  proposta:    'badge-proposta',
  retificacao: 'badge-retif',
  aprovado:    'badge-aprovado',
  encomenda:   'badge-obra',
  entrega:     'badge-obra',
  montagem:    'badge-obra',
  concluido:   'badge-concluido',
};

export function faseOrdem(f) {
  return ['proposta','retificacao','aprovado','encomenda','entrega','montagem','concluido'].indexOf(f);
}

// ── Dashboard ──────────────────────────────────────

function calcTotalProjeto(p) {
  const n = v => parseFloat(String(v || '0').replace(',', '.')) || 0;
  let t = 0;
  t += n(p.orc_moveis);
  t += n(p.orc_tampos);
  t += n(p.orc_eletros);
  t += n(p.orc_acessorios);
  (p.orcamento||[]).forEach(c => { t += n(c.valor); });
  return Math.max(0, t);
}

function calcDashboard(lista) {
  const total      = lista.length;
  const aprovados  = lista.filter(p => faseOrdem(p.fase) >= faseOrdem('aprovado')).length;
  const concluidos = lista.filter(p => p.fase === 'concluido').length;
  const taxa       = total > 0 ? Math.round((aprovados / total) * 100) : 0;

  let somaV = 0, cntV = 0;
  lista.forEach(p => { const v = calcTotalProjeto(p); if (v > 0) { somaV += v; cntV++; } });
  const valorMedio = cntV > 0 ? somaV / cntV : 0;

  let somaT = 0, cntT = 0;
  lista.forEach(p => {
    if (p.aprovacao?.data && p.dataCriacao) {
      const c = new Date(p.dataCriacao + 'T12:00:00');
      const [d,m,y] = p.aprovacao.data.split('/');
      const a = new Date(`${y}-${m}-${d}T12:00:00`);
      if (!isNaN(a)) { const dias = Math.round((a - c) / 86400000); if (dias >= 0 && dias < 365) { somaT += dias; cntT++; } }
    }
  });
  const tempoMedio = cntT > 0 ? Math.round(somaT / cntT) : null;

  const hoje = new Date();
  const em7  = new Date(hoje.getTime() + 7 * 86400000);
  const expira = lista.filter(p => {
    if (!p.prazo || faseOrdem(p.fase) >= faseOrdem('aprovado')) return false;
    const d = new Date(p.prazo + 'T23:59:59');
    return d >= hoje && d <= em7;
  }).length;

  // Ocorrências abertas
  const ocorrAbertas = lista.filter(p =>
    (p.ocorrencias||[]).some(o => o.estado !== 'resolvida')
  ).length;

  const valorGlobal = somaV;
  return { total, aprovados, concluidos, taxa, valorMedio, valorGlobal, tempoMedio, expira, ocorrAbertas };
}

// ── Render painel ─────────────────────────────────

export function renderPainel() {
  const lista    = getProjects();
  const filtro   = getState('filtroAtivo');
  const pesquisa = (document.getElementById('painel-pesquisa')?.value || '').toLowerCase().trim();

  const db = calcDashboard(lista);
  const el = id => document.getElementById(id);
  if (el('stat-total'))      el('stat-total').textContent      = db.total;
  if (el('stat-taxa'))       el('stat-taxa').textContent       = db.taxa + '%';
  // Card de valor toggle — calcular directamente para garantir robustez
  {
    let somaTotal = 0, cntTotal = 0;
    lista.forEach(p => { const v = calcTotalProjeto(p); if (v > 0) { somaTotal += v; cntTotal++; } });
    _valorGlobalAtual = somaTotal;
    _valorMedioAtual  = cntTotal > 0 ? somaTotal / cntTotal : 0;
  }
  // Suportar id novo (stat-valor-display) e id legado (stat-valor)
  const displayEl = el('stat-valor-display') || el('stat-valor');
  const labelEl   = el('dash-valor-label');
  const cardEl    = el('dash-card-valor');

  // Se há filtro activo (não "todos"), mostrar soma dos projetos filtrados
  const filtroAtivo = getState('filtroAtivo');
  const isFiltrado  = filtroAtivo && filtroAtivo !== 'todos';

  if (isFiltrado) {
    // Calcular soma dos projetos que passam no filtro actual
    const hoje = new Date();
    const listaFiltrada = lista.filter(p => {
      const pd  = p.prazo ? new Date(p.prazo + 'T23:59:59') : null;
      const exp = pd && pd < hoje && faseOrdem(p.fase) < faseOrdem('aprovado');
      return filtroAtivo === 'proposta'  ? (p.fase === 'proposta' || p.fase === 'retificacao') && !exp
           : filtroAtivo === 'aprovado'  ? p.fase === 'aprovado'
           : filtroAtivo === 'obra'      ? ['encomenda','entrega','montagem'].includes(p.fase)
           : filtroAtivo === 'concluido' ? p.fase === 'concluido'
           : filtroAtivo === 'expirado'  ? exp
           : true;
    });
    const somaFiltrada = listaFiltrada.reduce((acc, p) => acc + (calcTotalProjeto(p) || 0), 0);
    const FILTRO_LABEL = {
      proposta:  'Total Em Análise',
      aprovado:  'Total Aprovado',
      obra:      'Total Em Obra',
      concluido: 'Total Concluído',
      expirado:  'Total Expirado',
    };
    if (displayEl) displayEl.textContent = somaFiltrada > 0 ? fmt(somaFiltrada) : '—';
    if (labelEl)   labelEl.textContent   = FILTRO_LABEL[filtroAtivo] || 'Total Filtrado';
    if (cardEl)    cardEl.classList.add('modo-global');
  } else {
    // Sem filtro — comportamento normal (média ou global)
    if (displayEl) {
      const val = _valorCardModo === 'global' ? _valorGlobalAtual : _valorMedioAtual;
      displayEl.textContent = val > 0 ? fmt(val) : '—';
    }
    if (labelEl) labelEl.textContent = _valorCardModo === 'global' ? 'Valor Global' : 'Valor Médio';
    if (cardEl)  cardEl.classList.remove('modo-global');
  }
  if (el('stat-tempo'))      el('stat-tempo').textContent      = db.tempoMedio !== null ? db.tempoMedio + 'd' : '—';
  if (el('stat-concluidos')) el('stat-concluidos').textContent = db.concluidos;
  if (el('stat-expira'))     el('stat-expira').textContent     = db.expira;
  if (el('stat-ocorr'))      el('stat-ocorr').textContent      = db.ocorrAbertas;

  const hoje = new Date();
  const filtrados = lista.filter(p => {
    const pd  = p.prazo ? new Date(p.prazo + 'T23:59:59') : null;
    const exp = pd && pd < hoje && faseOrdem(p.fase) < faseOrdem('aprovado');
    let ok = filtro === 'todos'       ? true
           : filtro === 'proposta'    ? (p.fase === 'proposta' || p.fase === 'retificacao') && !exp
           : filtro === 'aprovado'    ? p.fase === 'aprovado'
           : filtro === 'obra'        ? ['encomenda','entrega','montagem'].includes(p.fase)
           : filtro === 'concluido'   ? p.fase === 'concluido'
           : filtro === 'expirado'    ? exp
           : true;
    if (pesquisa && ok)
      ok = (p.nome||'').toLowerCase().includes(pesquisa)
        || (p.localidade||'').toLowerCase().includes(pesquisa)
        || (p.refPc||'').toLowerCase().includes(pesquisa)
        || (p.refOs||'').toLowerCase().includes(pesquisa);
    return ok;
  });

  const grid = document.getElementById('proj-grid');
  if (!grid) return;

  if (!filtrados.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">📭</div>
      <div class="empty-titulo">Nenhum projeto encontrado</div>
      <div class="empty-sub">Tenta outro filtro ou cria um novo projeto.</div>
    </div>`;
    return;
  }
  const ordenados = ordenarLista(filtrados);
  grid.innerHTML = ordenados.map(p => renderCard(p)).join('');

  // Carregar visitas assincronamente e actualizar os cards
  const ids = ordenados.map(p => p.id);
  carregarVisitas(ids).then(visitas => {
    ids.forEach(id => {
      const el = document.getElementById('visitas-' + id);
      if (!el) return;

      const dados   = visitas[id];
      const total   = dados?.total || 0;
      const lista   = dados?.visitas || [];
      const ultima  = lista.length ? lista[lista.length - 1] : null;

      if (!total) {
        el.innerHTML = '<span class="vis-zero" title="Cliente ainda não abriu o link">👁 Nunca aberto</span>';
        return;
      }

      // Calcular há quantos dias foi a última visita
      const agora = Date.now();
      const tsUltima = ultima?.ts || 0;
      const diasDesde = tsUltima ? Math.floor((agora - tsUltima) / 86400000) : null;
      const labelTempo = diasDesde === null ? ''
        : diasDesde === 0 ? 'hoje'
        : diasDesde === 1 ? 'ontem'
        : `há ${diasDesde} dias`;

      // Indicador de engagement
      const engClass = total >= 5 ? 'vis-alto'
        : total >= 2 ? 'vis-medio'
        : 'vis-baixo';

      const tooltipLinha1 = `${total} visita${total !== 1 ? 's' : ''}`;
      const tooltipLinha2 = ultima ? `Última: ${ultima.data} às ${ultima.hora}` : '';
      const tooltipLinha3 = lista.length > 1 ? `Primeira: ${lista[0].data} às ${lista[0].hora}` : '';

      el.innerHTML = `
        <span class="vis-badge ${engClass}" title="${tooltipLinha1}&#10;${tooltipLinha2}&#10;${tooltipLinha3}">
          👁 ${total}${labelTempo ? ` · ${labelTempo}` : ''}
        </span>`;
    });
  }).catch(() => {});
}

function renderCard(p) {
  const hoje   = new Date();
  const pd     = p.prazo ? new Date(p.prazo + 'T23:59:59') : null;
  const exp    = pd && pd < hoje && faseOrdem(p.fase) < faseOrdem('aprovado');
  const urg    = pd && !exp && faseOrdem(p.fase) < faseOrdem('aprovado') && (pd - hoje) < 7 * 86400000;
  const label  = exp ? 'Expirado' : (FASE_LABEL[p.fase] || p.fase);
  const classe = exp ? 'badge-expirado' : (FASE_CLASSE[p.fase] || '');
  const total  = calcTotalProjeto(p);
  const tipo   = TIPOS_PROJETO.find(t => t.value === p.tipo)?.label || p.tipoOutro || p.tipo || '';
  const temOcorr = (p.ocorrencias||[]).some(o => o.estado !== 'resolvida');

  // Classe de fase para cor do card
  const faseClasse = exp ? 'fase-expirado'
    : p.fase === 'proposta'    ? 'fase-proposta'
    : p.fase === 'retificacao' ? 'fase-retificacao'
    : p.fase === 'aprovado'    ? 'fase-aprovado'
    : p.fase === 'encomenda'   ? 'fase-encomenda'
    : p.fase === 'entrega'     ? 'fase-entrega'
    : p.fase === 'montagem'    ? 'fase-montagem'
    : p.fase === 'concluido'   ? 'fase-concluido'
    : 'fase-proposta';

  return `
    <div class="proj-card ${faseClasse}${temOcorr ? ' card-ocorrencia' : ''}" onclick="window.ativarModoApresentacao('${p.id}')">
      <div class="card-top">
        <div class="card-tipo-badge">${tipo}</div>
        <div style="display:flex;gap:6px;align-items:center">
          ${temOcorr ? `<span class="badge-ocorr">⚠️ Ocorrência</span>` : ''}
          <span class="proj-badge ${classe}">${label}</span>
        </div>
      </div>
      <div class="card-nome">${p.nome || '—'}</div>
      <div class="card-local">${p.localidade || ''}${(p.refPc||p.refOs) ? `<span class="card-refs">
        ${p.refPc ? `<span class="card-ref-badge" onclick="event.stopPropagation();window.copiarRef(this,'${p.refPc}')" title="Clica para copiar">PC: ${p.refPc}</span>` : ''}
        ${p.refOs  ? `<span class="card-ref-badge" onclick="event.stopPropagation();window.copiarRef(this,'${p.refOs}')"  title="Clica para copiar">OS: ${p.refOs}</span>`  : ''}
      </span>` : ''}</div>
      <div class="card-financeiro">
        <div class="card-total">${total > 0 ? fmt(total) : '—'}</div>
        <div class="card-meta-right">
          ${p.aprovacao?.data ? `<div class="card-aprovado">✓ ${p.aprovacao.data}</div>` : ''}
          <div class="card-visitas" id="visitas-${p.id}">👁 —</div>
        </div>
      </div>
      ${p.prazo ? `<div class="card-prazo${urg ? ' urgente' : ''}">
        ${urg ? '⚠️ ' : ''}Válido até ${formatarData(p.prazo)}</div>` : ''}
      <div class="card-actions">
        <button class="btn-card apresentar" onclick="event.stopPropagation();window.editarProjeto('${p.id}')" title="Editar projeto">✏️ Editar</button>
        <button class="btn-card acomp" onclick="event.stopPropagation();window.abrirDrawerAcompanhamento('${p.id}')" title="Acompanhamento — Interacções, Ocorrências, Mensagens">📋 Acompanhar</button>
        <button class="btn-card ia" onclick="event.stopPropagation();window.abrirResumoIA('${p.id}')" title="Resumo gerado por IA">✦ IA</button>
        <button class="btn-card pdf" onclick="event.stopPropagation();window.gerarPDF('${p.id}')" title="Gerar PDF da proposta">📄 PDF</button>
        <button class="btn-card pdf" onclick="event.stopPropagation();window.partilharCliente('${p.id}')" title="Copiar link para partilhar com o cliente">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:middle"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
          Link
        </button>
        <button class="btn-card danger" onclick="event.stopPropagation();window.apagarProjeto('${p.id}')">🗑</button>
      </div>
    </div>`;
}

