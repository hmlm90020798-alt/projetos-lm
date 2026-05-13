// ════════════════════════════════════════════════
// painel.js — Painel de Gestão · Projetos LM
// ════════════════════════════════════════════════

import { getState, setState, getProjects, getEditId } from './state.js';
import { guardar, apagar, iniciarListenerAprovacoes, carregarVisitas,
         carregarMensagens, responderMensagem, iniciarListenerMensagens } from './firebase.js';
import { mostrarToast, setView, fmt, gerarId, dataHoje, formatarData } from './ui.js';
import { getAlertasReclamacoes } from './reclamacoes.js';
import { renderHistoricoReunioes } from './modo-apresentacao.js';
import { esc } from './sanitize.js';
import { getMsgVisto, setMsgVisto, atualizarBadgeMensagens, renderMensagensModal } from './painel-mensagens.js';
import { initAlertasModule, setTab, renderAlertas, renderOcorrenciasTab } from './painel-alertas.js';
import {
  addLinhaElem, addCatElemExtra, addLinhaElemExtra, addLinhaElemNoCat,
  addLinhaOrc, addCatOrcamento, atualizarTotalPreview,
  processarImagens, removerImagem, renderThumbs,
  addInteracao, addOcorrencia,
  addDoc, addNota, atualizarEstadoOcorrencia,
  renderInteracoes, renderDocsForm, renderNotasForm, renderOcorrenciasForm,
} from './painel-form-extras.js';

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

function faseOrdem(f) {
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
  // Inicializar módulo de alertas com TIPOS_PROJETO e faseOrdem (definidos acima)
  initAlertasModule(TIPOS_PROJETO, faseOrdem);
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
    <div class="proj-card ${faseClasse}${temOcorr ? ' card-ocorrencia' : ''}" onclick="window.editarProjeto('${p.id}')">
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
        <button class="btn-card ver" onclick="event.stopPropagation();window.verCliente('${p.id}')">👁 Ver</button>
        <button class="btn-card apresentar" onclick="event.stopPropagation();window.ativarModoApresentacao('${p.id}')" title="Abrir Modo Apresentação numa nova janela">⛶ Apresentar</button>
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

// ── Modal ──────────────────────────────────────────

// Colapsar todos os blocos do accordion excepto o primeiro
function colapsarBlocos() {
  // requestAnimationFrame garante que corre após o browser renderizar o modal
  requestAnimationFrame(() => {
    const blocos = document.querySelectorAll('#modal-projeto .modal-body .form-bloco');
    blocos.forEach((bloco, i) => {
      if (i === 0) {
        bloco.classList.remove('collapsed');
      } else {
        bloco.classList.add('collapsed');
      }
    });
  });
}

export function abrirModalNovo() {
  setState({ editId: null, editImgs: [] });
  document.getElementById('modal-proj-titulo').textContent = 'Novo Projeto';
  limparForm();
  colapsarBlocos();
  document.getElementById('modal-projeto').classList.add('open');

  // Carregar mensagens do cliente para este projeto
  renderMensagensModal(id);
}

export function fecharModal() {
  document.getElementById('modal-projeto').classList.remove('open');
  setState({ editId: null, editImgs: [] });
}

function limparForm() {
  ['f-nome','f-contacto','f-email','f-localidade','f-prazo','f-entrega',
   'f-data-entrega-mat','f-data-instalacao','f-data-conclusao',
   'f-tipo-outro','f-ref-pc','f-ref-os',
   'f-orc-moveis','f-orc-tampos','f-orc-eletros','f-orc-acessorios'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  // Reset checkboxes "incluído"
  ['inc-iva23','inc-entrega','inc-instalacao'].forEach(id => {
    const el = document.getElementById(id); if (el) el.checked = true;
  });
  ['inc-loja','inc-inst-cliente','inc-iva6','inc-pack'].forEach(id => {
    const el = document.getElementById(id); if (el) el.checked = false;
  });
  document.getElementById('f-tipo').value = 'cozinha';
  document.getElementById('f-fase').value = 'proposta';
  document.getElementById('f-tipo-outro-wrap').style.display = 'none';
  const elTema = document.getElementById('f-tema'); if (elTema) elTema.value = 'escuro';
  document.getElementById('img-thumbs-preview').innerHTML = '';

  ['sec-elem-tampos','sec-elem-eletros','sec-elem-acessorios','sec-elem-extras',
   'sec-orcamento-cats','f-interacoes-lista','f-ocorrencias-lista','f-notas-lista','f-docs-lista'].forEach(id => {
    const el = document.getElementById(id); if (el) el.innerHTML = '';
  });
  atualizarTotalPreview();
}

export function editarProjeto(id) {
  const p = getProjects().find(x => x.id === id);
  if (!p) return;
  setState({ editId: id, editImgs: [...(p.imagens || [])] });
  document.getElementById('modal-proj-titulo').textContent = 'Editar Projeto';
  limparForm();

  const sv = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val || ''; };
  sv('f-nome', p.nome);           sv('f-contacto', p.contacto);  sv('f-email', p.email || '');
  sv('f-localidade', p.localidade); sv('f-fase', p.fase);
  sv('f-prazo', p.prazo);         sv('f-entrega', p.entrega);
  sv('f-data-entrega-mat', p.dataEntregaMat);
  sv('f-data-instalacao',  p.dataInstalacao);
  sv('f-data-conclusao',   p.dataConclusao);
  sv('f-notas', p.notas);
  sv('f-ref-pc', p.refPc);
  sv('f-ref-os', p.refOs);
  sv('f-tema', p.tema || 'escuro');

  // Pack Projeto
  const elPack = document.getElementById('inc-pack');
  if (elPack) elPack.checked = !!p.incluido?.pack;

  if (p.tipo) {
    document.getElementById('f-tipo').value = p.tipo;
    if (p.tipo === 'outro') {
      document.getElementById('f-tipo-outro-wrap').style.display = '';
      sv('f-tipo-outro', p.tipoOutro);
    }
  }

  // Elementos do projecto (com URL) — só três categorias fixas + extras
  const elemCats = [
    ['tampos','elem_tampos'], ['eletros','elem_eletros'], ['acessorios','elem_acessorios'],
  ];
  elemCats.forEach(([secId, campo]) => {
    (p[campo]||[]).forEach(i => addLinhaElem(secId, i.nome, i.url));
  });
  (p.elem_extras||[]).forEach(cat => {
    addCatElemExtra(cat.categoria);
    const grupos = document.getElementById('sec-elem-extras').querySelectorAll('[data-elem-grupo]');
    const ult = grupos[grupos.length - 1];
    if (ult) (cat.itens||[]).forEach(i => addLinhaElemNoCat(ult.querySelector('[data-elem-itens]'), i.nome, i.url));
  });

  // Orçamento — valor único por categoria
  const sv2 = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val || ''; };
  sv2('f-orc-moveis',    p.orc_moveis);
  sv2('f-orc-tampos',    p.orc_tampos);
  sv2('f-orc-eletros',   p.orc_eletros);
  sv2('f-orc-acessorios',p.orc_acessorios);
  (p.orcamento||[]).forEach(cat => {
    addCatOrcamento(cat.categoria, cat.valor);
  });

  // O que está incluído
  const incIds = ['inc-iva23','inc-entrega','inc-loja','inc-instalacao','inc-inst-cliente','inc-iva6'];
  incIds.forEach(id => {
    const el = document.getElementById(id);
    if (el && p.incluido) el.checked = !!p.incluido[id.replace('inc-','')];
  });

  renderInteracoes(p.interacoes || []);
  renderOcorrenciasForm(p.ocorrencias || []);
  renderNotasForm(p.notas || []);
  renderDocsForm(p.docs || []);
  renderThumbs();
  atualizarTotalPreview();

  // Histórico de reuniões — mostrar bloco só se houver reuniões guardadas
  const blocoReunioes = document.getElementById('bloco-reunioes');
  const listaReunioes = document.getElementById('reunioes-historico-lista');
  if (blocoReunioes && listaReunioes) {
    let reunioesGuardadas = [];
    try { reunioesGuardadas = JSON.parse(localStorage.getItem(`lm_reunioes_${id}`) || '[]'); } catch(_) {}
    if (reunioesGuardadas.length) {
      blocoReunioes.style.display = '';
      renderHistoricoReunioes(id, listaReunioes);
    } else {
      blocoReunioes.style.display = 'none';
      listaReunioes.innerHTML = '';
    }
  }

  colapsarBlocos();
  document.getElementById('modal-projeto').classList.add('open');

  // Carregar mensagens do cliente para este projeto
  renderMensagensModal(id);
}

export async function guardarProjeto() {
  const editId = getEditId();
  const nome   = document.getElementById('f-nome').value.trim();
  if (!nome) { alert('Preenche o nome / referência do projeto.'); return; }

  const recolherLinhasElem = c => {
    if (!c) return [];
    return Array.from(c.querySelectorAll('.elem-line')).map(r => ({
      nome: r.querySelector('.elem-line-nome')?.value?.trim() || '',
      url:  r.querySelector('.elem-line-url')?.value?.trim()  || '',
    })).filter(i => i.nome);
  };

  const recolherCatsElem = c => {
    if (!c) return [];
    return Array.from(c.querySelectorAll('[data-elem-grupo]')).map(g => ({
      categoria: g.querySelector('[data-elem-cat-nome]')?.value?.trim() || 'Categoria',
      itens: recolherLinhasElem(g.querySelector('[data-elem-itens]')),
    })).filter(c => c.itens.length);
  };

  // Orçamento — categorias livres com valor único
  const recolherCatsOrc = c => {
    if (!c) return [];
    return Array.from(c.querySelectorAll('[data-cat-grupo]')).map(g => ({
      categoria: g.querySelector('[data-cat-nome]')?.value?.trim() || 'Categoria',
      valor: g.querySelector('[data-cat-valor]')?.value?.trim() || '0',
    })).filter(c => c.categoria);
  };

  // O que está incluído
  const incluido = {
    iva23:          !!document.getElementById('inc-iva23')?.checked,
    entrega:        !!document.getElementById('inc-entrega')?.checked,
    loja:           !!document.getElementById('inc-loja')?.checked,
    instalacao:     !!document.getElementById('inc-instalacao')?.checked,
    'inst-cliente': !!document.getElementById('inc-inst-cliente')?.checked,
    iva6:           !!document.getElementById('inc-iva6')?.checked,
    pack:           !!document.getElementById('inc-pack')?.checked,
  };

  // Notas múltiplas com título
  const notas = Array.from(document.querySelectorAll('#f-notas-lista .nota-form-item'))
    .map(el => ({
      titulo: el.querySelector('.nota-form-titulo')?.value?.trim() || '',
      texto:  el.querySelector('.nota-form-input')?.value?.trim()  || '',
    }))
    .filter(n => n.titulo || n.texto);

  // Documentos (links externos)
  const docs = Array.from(document.querySelectorAll('#f-docs-lista .doc-form-item'))
    .map(el => ({
      nome: el.querySelector('.doc-form-nome')?.value?.trim() || '',
      url:  el.querySelector('.doc-form-url')?.value?.trim()  || '',
    }))
    .filter(d => d.nome && d.url);

  const interacoes = Array.from(document.querySelectorAll('#f-interacoes-lista .interacao-item'))
    .map(el => ({ tipo: el.dataset.tipo||'nota', texto: el.dataset.texto||'', data: el.dataset.data||'', hora: el.dataset.hora||'' }));

  const ocorrencias = Array.from(document.querySelectorAll('#f-ocorrencias-lista .ocorr-item'))
    .map(el => ({ tipo: el.dataset.tipo||'outro', descricao: el.dataset.desc||'', estado: el.dataset.estado||'detectada', data: el.dataset.data||'' }));

  const tipo = document.getElementById('f-tipo').value;
  const gv   = id => document.getElementById(id)?.value || '';

  const proj = {
    id:          editId || gerarId(),
    nome, tipo,
    tipoOutro:   tipo === 'outro' ? (document.getElementById('f-tipo-outro')?.value?.trim()||'') : '',
    contacto:    gv('f-contacto').trim(),
    email:       gv('f-email').trim(),
    localidade:  gv('f-localidade').trim(),
    fase:        gv('f-fase'),
    prazo:       gv('f-prazo'),
    entrega:     gv('f-entrega').trim(),
    dataEntregaMat:  gv('f-data-entrega-mat'),
    dataInstalacao:  gv('f-data-instalacao'),
    dataConclusao:   gv('f-data-conclusao'),
    notas:       notas,
    refPc:       gv('f-ref-pc').trim(),
    refOs:       gv('f-ref-os').trim(),
    tema:        gv('f-tema') || 'escuro',
    docs,
    // Elementos (com URL)
    elem_tampos:        recolherLinhasElem(document.getElementById('sec-elem-tampos')),
    elem_eletros:       recolherLinhasElem(document.getElementById('sec-elem-eletros')),
    elem_acessorios:    recolherLinhasElem(document.getElementById('sec-elem-acessorios')),
    elem_extras:        recolherCatsElem(document.getElementById('sec-elem-extras')),
    // Orçamento — valor único por categoria
    orc_moveis:    gv('f-orc-moveis')    || '0',
    orc_tampos:    gv('f-orc-tampos')    || '0',
    orc_eletros:   gv('f-orc-eletros')   || '0',
    orc_acessorios:gv('f-orc-acessorios')|| '0',
    orcamento:     recolherCatsOrc(document.getElementById('sec-orcamento-cats')),
    incluido,
    interacoes, ocorrencias,
    imagens:     getState('editImgs'),
    data:        new Date().toLocaleDateString('pt-PT'),
    dataCriacao: editId ? (getProjects().find(p => p.id === editId)?.dataCriacao || dataHoje()) : dataHoje(),
  };

  // Se a fase for aprovado ou superior e não houver registo de aprovação, registar agora
  const faseActual = proj.fase;
  const aprovacaoExistente = editId ? (getProjects().find(p => p.id === editId)?.aprovacao || null) : null;
  if (faseOrdem(faseActual) >= faseOrdem('aprovado') && !aprovacaoExistente?.data) {
    const agora = new Date();
    proj.aprovacao = {
      data:   agora.toLocaleDateString('pt-PT'),
      hora:   String(agora.getHours()).padStart(2,'0') + ':' + String(agora.getMinutes()).padStart(2,'0'),
      origem: 'painel',
    };
  } else {
    proj.aprovacao = aprovacaoExistente;
  }

  const lista = getProjects();
  const idx = lista.findIndex(p => p.id === proj.id);
  if (idx >= 0) lista[idx] = proj; else lista.unshift(proj);

  fecharModal();
  await guardar(proj);
  renderPainel();
}

export async function apagarProjeto(id) {
  const p = getProjects().find(x => x.id === id);
  if (!confirm(`Apagar "${p?.nome || id}"?\nEsta ação é irreversível.`)) return;
  await apagar(id);
  renderPainel();
}


// ── Links e partilha ──────────────────────────────

export function abrirProjetoDoAlerta(id) {
  const p = getProjects().find(x => x.id === id);
  if (!p) return;
  // Mudar para separador Projetos e abrir o editor
  const tabBtn = document.querySelector('[onclick*="projetos"]');
  if (tabBtn) setTab(tabBtn, 'projetos');
  setTimeout(() => editarProjeto(id), 80);
}

export function partilharCliente(id) {
  const base = window.location.origin + window.location.pathname;
  const url  = `${base}?p=${id}`;
  navigator.clipboard.writeText(url).then(() => {
    mostrarToast('🔗 Link copiado!', 'Cola no email para partilhar com o cliente.');
  }).catch(() => {
    // Fallback se clipboard não disponível
    prompt('Copia este link para partilhar com o cliente:', url);
  });
}

export function verCliente(id) {
  setState({ projAtualId: id });
  const p = getProjects().find(x => x.id === id);
  if (p) window._clienteModule.renderPaginaCliente(p);
  setView('cliente');
  const btn = document.getElementById('btn-voltar-painel');
  if (btn) btn.style.display = '';
}

export function copiarRef(el, valor) {
  navigator.clipboard.writeText(valor).then(() => {
    const orig = el.textContent;
    el.textContent = '✓ Copiado';
    el.classList.add('copiado');
    setTimeout(() => { el.textContent = orig; el.classList.remove('copiado'); }, 1800);
  });
}

export function copiarEmail(btnEl) {
  const u = document.querySelector('.em-u')?.textContent || '';
  const d = document.querySelector('.em-d')?.textContent || '';
  const v = u + '@' + d;
  navigator.clipboard.writeText(v).then(() => {
    const o = btnEl.textContent; btnEl.textContent = '✓ Copiado';
    setTimeout(() => { btnEl.textContent = o; }, 2000);
  });
}

export function gerarPDF(id) {
  // Abre a página do cliente num novo separador com ?print=1
  // O cliente vê a proposta e pode imprimir/guardar como PDF
  const base = window.location.origin + window.location.pathname;
  const url  = `${base}?p=${id}&print=1`;
  window.open(url, '_blank');
}

export function exportarProjetos() {
  const lista = getProjects();
  if (!lista.length) { mostrarToast('Sem dados para exportar', ''); return; }
  const limpa = lista.map(p => {
    const { imagens, ...resto } = p;
    return { ...resto, imagens: (imagens || []).map((_, i) => `[imagem_${i+1}]`) };
  });
  const json  = JSON.stringify(limpa, null, 2);
  const blob  = new Blob([json], { type: 'application/json' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  const data  = new Date().toISOString().split('T')[0];
  a.href      = url;
  a.download  = `projetos-lm-backup-${data}.json`;
  a.click();
  URL.revokeObjectURL(url);
  mostrarToast('✓ Backup exportado', `${lista.length} projetos guardados`);
}

export function setFiltro(btnEl, filtro) {
  setState({ filtroAtivo: filtro });
  document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('active'));
  btnEl.classList.add('active');
  renderPainel();
}

export function reiniciarPrazoForm() {
  const inp = document.getElementById('f-prazo');
  if (!inp.value) { alert('Define primeiro uma data de validade.'); return; }
  let dias = 15;
  const editId = getEditId();
  if (editId) {
    const p = getProjects().find(x => x.id === editId);
    if (p?.dataCriacao && p?.prazo) {
      const c  = new Date(p.dataCriacao + 'T12:00:00');
      const pr = new Date(p.prazo + 'T12:00:00');
      const d  = Math.round((pr - c) / 86400000);
      if (!isNaN(d) && d > 0) dias = d;
    }
  }
  const novo = new Date(new Date().getTime() + dias * 86400000);
  if (!confirm(`Reiniciar validade?\nDias: ${dias}\nNovo prazo: ${novo.toLocaleDateString('pt-PT')}`)) return;
  inp.value = novo.toISOString().split('T')[0];
}

export function atualizarTipoProjeto() {
  const v = document.getElementById('f-tipo').value;
  document.getElementById('f-tipo-outro-wrap').style.display = v === 'outro' ? '' : 'none';
}

export function iniciarPollingAprovacoes() {
  const handler = (p, d) => {
    mostrarToast(`🎉 ${p.nome||'Cliente'} aprovou!`, `${d.aprovacao.data} às ${d.aprovacao.hora||'--:--'}`);
    renderPainel();
  };
  if (window._cancelarListeners) window._cancelarListeners();
  window._cancelarListeners = iniciarListenerAprovacoes(handler);

  // Listener realtime de mensagens — substitui polling, reage instantaneamente
  if (window._cancelarListenerMensagens) window._cancelarListenerMensagens();
  const projetos = getState('projetos') || [];
  window._cancelarListenerMensagens = iniciarListenerMensagens(
    projetos,
    (projId, projNome, clienteMsgs) => {
      const ultimaTs = clienteMsgs[clienteMsgs.length - 1].ts?.toMillis?.() || 0;
      const anterior = getMsgVisto(projId);
      if (ultimaTs > anterior) {
        setMsgVisto(projId, ultimaTs);
        const total = clienteMsgs.length;
        mostrarToast(
          `💬 ${esc(projNome || 'Cliente')}`,
          total === 1 ? '1 mensagem por responder' : `${total} mensagens por responder`
        );
        atualizarBadgeMensagens(projId, total);
      }
    }
  );
}

// ── Mensagens — ver painel-mensagens.js ────────────


