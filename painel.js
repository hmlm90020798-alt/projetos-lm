// ════════════════════════════════════════════════
// painel.js — Painel de Gestão · Projetos LM
// ════════════════════════════════════════════════

import { getState, setState, getProjects, getEditId } from './state.js';
import { guardar, apagar, verificarAprovacoes, carregarVisitas } from './firebase.js';
import { mostrarToast, setView, fmt, gerarId, dataHoje, formatarData } from './ui.js';

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
  let t = 0;
  t += parseFloat(p.orc_moveis)    || 0;
  t += parseFloat(p.orc_tampos)    || 0;
  t += parseFloat(p.orc_eletros)   || 0;
  t += parseFloat(p.orc_acessorios)|| 0;
  (p.orcamento||[]).forEach(c => { t += parseFloat(c.valor)||0; });
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

  return { total, aprovados, concluidos, taxa, valorMedio, tempoMedio, expira, ocorrAbertas };
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
  if (el('stat-valor'))      el('stat-valor').textContent      = db.valorMedio > 0 ? fmt(db.valorMedio) : '—';
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
  grid.innerHTML = filtrados.map(p => renderCard(p)).join('');

  // Carregar visitas assincronamente e actualizar os cards
  const ids = filtrados.map(p => p.id);
  carregarVisitas(ids).then(visitas => {
    ids.forEach(id => {
      const el = document.getElementById('visitas-' + id);
      if (el) {
        const v = visitas[id]?.total || 0;
        el.textContent = `👁 ${v}`;
        el.title = `${v} visita${v !== 1 ? 's' : ''} do cliente`;
      }
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

  return `
    <div class="proj-card${temOcorr ? ' card-ocorrencia' : ''}" onclick="window.editarProjeto('${p.id}')">
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
        <button class="btn-card" onclick="event.stopPropagation();window.editarProjeto('${p.id}')">✏️ Editar</button>
        <button class="btn-card primary" onclick="event.stopPropagation();window.verCliente('${p.id}')">👁 Ver</button>
        <button class="btn-card pdf" onclick="event.stopPropagation();window.gerarPDF('${p.id}')" title="Gerar PDF da proposta">📄 PDF</button>
        <button class="btn-card partilhar" onclick="event.stopPropagation();window.partilharCliente('${p.id}')" title="Copiar link para partilhar com o cliente">
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
}

export function fecharModal() {
  document.getElementById('modal-projeto').classList.remove('open');
  setState({ editId: null, editImgs: [] });
}

function limparForm() {
  ['f-nome','f-contacto','f-localidade','f-prazo','f-entrega',
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
  sv('f-nome', p.nome);           sv('f-contacto', p.contacto);
  sv('f-localidade', p.localidade); sv('f-fase', p.fase);
  sv('f-prazo', p.prazo);         sv('f-entrega', p.entrega);
  sv('f-data-entrega-mat', p.dataEntregaMat);
  sv('f-data-instalacao',  p.dataInstalacao);
  sv('f-data-conclusao',   p.dataConclusao);
  sv('f-notas', p.notas);
  sv('f-ref-pc', p.refPc);
  sv('f-ref-os', p.refOs);

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
  colapsarBlocos();
  document.getElementById('modal-projeto').classList.add('open');
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

// ── Linhas de elementos (com URL) ─────────────────

export function addLinhaElem(secId, nome = '', url = '') {
  const sec = document.getElementById(`sec-elem-${secId}`);
  if (!sec) return;
  const d = document.createElement('div');
  d.className = 'elem-line';
  d.innerHTML = `
    <input type="text" class="elem-line-nome" placeholder="Nome do artigo" value="${nome}">
    <input type="url"  class="elem-line-url"  placeholder="https://leroymerlin.pt/..." value="${url}">
    <button class="prod-line-del" onclick="this.closest('.elem-line').remove()">×</button>`;
  sec.appendChild(d);
}

export function addCatElemExtra(nome = '') {
  const sec = document.getElementById('sec-elem-extras');
  const d   = document.createElement('div');
  d.className = 'elem-cat-grupo'; d.dataset.elemGrupo = '1';
  d.innerHTML = `
    <div class="cat-header">
      <input type="text" class="f-input cat-nome" data-elem-cat-nome placeholder="Categoria" value="${nome}">
      <button class="prod-line-del" onclick="this.closest('[data-elem-grupo]').remove()">×</button>
    </div>
    <div class="elem-cat-itens" data-elem-itens></div>
    <button class="btn-add" onclick="window.addLinhaElemExtra(this)">+ Artigo</button>`;
  sec.appendChild(d);
}

export function addLinhaElemExtra(btnEl) {
  const c = btnEl.previousElementSibling;
  if (c) addLinhaElemNoCat(c, '', '');
}

function addLinhaElemNoCat(c, nome = '', url = '') {
  const d = document.createElement('div');
  d.className = 'elem-line';
  d.innerHTML = `
    <input type="text" class="elem-line-nome" placeholder="Nome do artigo" value="${nome}">
    <input type="url"  class="elem-line-url"  placeholder="https://leroymerlin.pt/..." value="${url}">
    <button class="prod-line-del" onclick="this.closest('.elem-line').remove()">×</button>`;
  c.appendChild(d);
}

// ── Linhas de orçamento (com preço) ───────────────

export function addLinhaOrc(tipo, nome = '', preco = '') {
  const sec = document.getElementById(`sec-${tipo}`);
  if (!sec) return;
  const d = document.createElement('div');
  d.className = 'prod-line';
  d.innerHTML = `
    <input type="text"   class="prod-line-nome"  placeholder="Descrição" value="${nome}" oninput="window.atualizarTotalPreview()">
    <input type="number" class="prod-line-preco" placeholder="0.00" value="${preco}" oninput="window.atualizarTotalPreview()">
    <button class="prod-line-del" onclick="this.closest('.prod-line').remove();window.atualizarTotalPreview()">×</button>`;
  sec.appendChild(d);
}

// Categoria livre no orçamento — valor único
export function addCatOrcamento(nome = '', valor = '') {
  const sec = document.getElementById('sec-orcamento-cats');
  const d   = document.createElement('div');
  d.className = 'orc-cat-grupo'; d.dataset.catGrupo = '1';
  d.innerHTML = `
    <div class="cat-header">
      <input type="text"   class="f-input cat-nome"  data-cat-nome  placeholder="Nome da categoria" value="${nome}" style="flex:1">
      <input type="number" class="f-input cat-valor" data-cat-valor placeholder="0,00" value="${valor}" style="width:120px" oninput="window.atualizarTotalPreview()">
      <button class="prod-line-del" onclick="this.closest('[data-cat-grupo]').remove();window.atualizarTotalPreview()">×</button>
    </div>`;
  sec.appendChild(d);
  atualizarTotalPreview();
}

export function atualizarTotalPreview() {
  let t = 0;
  // Campos fixos
  ['f-orc-moveis','f-orc-tampos','f-orc-eletros','f-orc-acessorios'].forEach(id => {
    t += parseFloat(document.getElementById(id)?.value) || 0;
  });
  // Categorias livres
  document.querySelectorAll('[data-cat-valor]').forEach(el => { t += parseFloat(el.value) || 0; });
  const el = document.getElementById('modal-total-preview');
  if (el) el.textContent = fmt(Math.max(0, t));
}

// ── Imagens ────────────────────────────────────────

export async function processarImagens(files) {
  const imgs = [...getState('editImgs')];
  for (const f of Array.from(files)) {
    if (imgs.length >= 5) { mostrarToast('Máximo de 5 imagens', ''); break; }
    if (f.size > 4 * 1024 * 1024) { mostrarToast('Imagem demasiado grande', 'Máx 4MB'); continue; }
    const b64 = await new Promise(res => { const r = new FileReader(); r.onload = e => res(e.target.result); r.readAsDataURL(f); });
    imgs.push(b64);
  }
  setState({ editImgs: imgs });
  renderThumbs();
}

export function removerImagem(idx) {
  setState({ editImgs: getState('editImgs').filter((_, i) => i !== idx) });
  renderThumbs();
}

export function renderThumbs() {
  const c = document.getElementById('img-thumbs-preview');
  if (!c) return;
  c.innerHTML = getState('editImgs').map((src, i) => `
    <div class="img-thumb">
      <img src="${src}" alt="">
      <button class="img-thumb-del" onclick="window.removerImagem(${i})">×</button>
    </div>`).join('');
}

// ── Interacções ────────────────────────────────────

export function addInteracao(tipo, texto) {
  if (!texto?.trim()) return;
  const agora = new Date();
  const data  = agora.toLocaleDateString('pt-PT');
  const hora  = String(agora.getHours()).padStart(2,'0') + ':' + String(agora.getMinutes()).padStart(2,'0');
  const lista = document.getElementById('f-interacoes-lista');
  if (!lista) return;
  const d = document.createElement('div');
  d.className = 'interacao-item';
  d.dataset.tipo = tipo; d.dataset.texto = texto; d.dataset.data = data; d.dataset.hora = hora;
  d.innerHTML = `
    <span class="int-tipo tipo-${tipo}">${tipo}</span>
    <span class="int-texto">${texto}</span>
    <span class="int-data">${data} ${hora}</span>
    <button class="prod-line-del" onclick="this.closest('.interacao-item').remove()">×</button>`;
  lista.prepend(d);
}

function renderInteracoes(list) {
  const el = document.getElementById('f-interacoes-lista');
  if (!el) return;
  el.innerHTML = list.map(i => `
    <div class="interacao-item" data-tipo="${i.tipo}" data-texto="${i.texto}" data-data="${i.data}" data-hora="${i.hora||''}">
      <span class="int-tipo tipo-${i.tipo}">${i.tipo}</span>
      <span class="int-texto">${i.texto}</span>
      <span class="int-data">${i.data} ${i.hora||''}</span>
      <button class="prod-line-del" onclick="this.closest('.interacao-item').remove()">×</button>
    </div>`).join('');
}

// ── Ocorrências ────────────────────────────────────

export function addOcorrencia(tipo, descricao, estado) {
  if (!descricao?.trim()) return;
  const agora = new Date();
  const data  = agora.toLocaleDateString('pt-PT');
  const lista = document.getElementById('f-ocorrencias-lista');
  if (!lista) return;
  const d = document.createElement('div');
  d.className = 'ocorr-item';
  d.dataset.tipo = tipo; d.dataset.desc = descricao; d.dataset.estado = estado || 'detectada'; d.dataset.data = data;

  const tipoLabels = {
    atraso: 'Atraso entrega', defeito: 'Defeito material',
    instalacao: 'Instalação', falta: 'Material em falta', outro: 'Outro',
  };
  const estadoLabels = { detectada: 'Detectada', resolucao: 'Em resolução', resolvida: 'Resolvida' };

  d.innerHTML = `
    <div class="ocorr-item-header">
      <span class="ocorr-tipo">${tipoLabels[tipo] || tipo}</span>
      <span class="ocorr-estado ocorr-estado-${estado||'detectada'}">${estadoLabels[estado||'detectada']}</span>
      <span class="int-data">${data}</span>
      <button class="prod-line-del" onclick="this.closest('.ocorr-item').remove()">×</button>
    </div>
    <div class="ocorr-desc">${descricao}</div>`;
  lista.prepend(d);
}

// ── Notas múltiplas ───────────────────────────────

export function addDoc(nome = '', url = '') {
  const lista = document.getElementById('f-docs-lista');
  if (!lista) return;
  const d = document.createElement('div');
  d.className = 'doc-form-item';
  d.innerHTML = `
    <div class="doc-form-fields">
      <input type="text" class="f-input doc-form-nome" placeholder="Nome do documento (ex: Planta Cozinha)" value="${nome}">
      <input type="url"  class="f-input doc-form-url"  placeholder="https://drive.google.com/..." value="${url}">
    </div>
    <button class="prod-line-del" onclick="this.closest('.doc-form-item').remove()">×</button>`;
  lista.appendChild(d);
}

function renderDocsForm(docs) {
  const lista = document.getElementById('f-docs-lista');
  if (!lista) return;
  lista.innerHTML = '';
  (docs || []).forEach(d => addDoc(d.nome || '', d.url || ''));
}

export function addNota(titulo = '', texto = '') {
  const lista = document.getElementById('f-notas-lista');
  if (!lista) return;
  const d = document.createElement('div');
  d.className = 'nota-form-item';
  d.innerHTML = `
    <div class="nota-form-fields">
      <input type="text" class="f-input nota-form-titulo" placeholder="Título da nota (ex: Condições de Pagamento)" value="${titulo}">
      <textarea class="f-textarea nota-form-input" placeholder="Descrição detalhada…" rows="2">${texto}</textarea>
    </div>
    <button class="prod-line-del nota-del" onclick="this.closest('.nota-form-item').remove()">×</button>`;
  lista.appendChild(d);
}

function renderNotasForm(notas) {
  const lista = document.getElementById('f-notas-lista');
  if (!lista) return;
  lista.innerHTML = '';
  const arr = Array.isArray(notas) ? notas : (notas ? [{ titulo: 'Nota', texto: notas }] : []);
  arr.forEach(n => {
    if (typeof n === 'string') addNota('', n);
    else addNota(n.titulo || '', n.texto || '');
  });
}

export function atualizarEstadoOcorrencia(btnEl, novoEstado) {
  const item = btnEl.closest('.ocorr-item');
  if (!item) return;
  item.dataset.estado = novoEstado;
  const estadoLabels = { detectada: 'Detectada', resolucao: 'Em resolução', resolvida: 'Resolvida' };
  const badge = item.querySelector('.ocorr-estado');
  if (badge) {
    badge.textContent = estadoLabels[novoEstado];
    badge.className   = `ocorr-estado ocorr-estado-${novoEstado}`;
  }
}

function renderOcorrenciasForm(list) {
  const el = document.getElementById('f-ocorrencias-lista');
  if (!el) return;
  const tipoLabels   = { atraso: 'Atraso entrega', defeito: 'Defeito material', instalacao: 'Instalação', falta: 'Material em falta', outro: 'Outro' };
  const estadoLabels = { detectada: 'Detectada', resolucao: 'Em resolução', resolvida: 'Resolvida' };
  el.innerHTML = list.map(o => `
    <div class="ocorr-item" data-tipo="${o.tipo}" data-desc="${o.descricao||''}" data-estado="${o.estado||'detectada'}" data-data="${o.data||''}">
      <div class="ocorr-item-header">
        <span class="ocorr-tipo">${tipoLabels[o.tipo]||o.tipo}</span>
        <span class="ocorr-estado ocorr-estado-${o.estado||'detectada'}">${estadoLabels[o.estado||'detectada']}</span>
        <span class="int-data">${o.data||''}</span>
        <button class="prod-line-del" onclick="this.closest('.ocorr-item').remove()">×</button>
      </div>
      <div class="ocorr-desc">${o.descricao||''}</div>
      <div class="ocorr-estados-btns">
        <button class="btn-ocorr-estado" onclick="window.atualizarEstadoOcorrencia(this,'detectada')">Detectada</button>
        <button class="btn-ocorr-estado" onclick="window.atualizarEstadoOcorrencia(this,'resolucao')">Em resolução</button>
        <button class="btn-ocorr-estado" onclick="window.atualizarEstadoOcorrencia(this,'resolvida')">Resolvida</button>
      </div>
    </div>`).join('');
}

// ── Links e partilha ──────────────────────────────

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
  verificarAprovacoes(handler);
  setInterval(() => verificarAprovacoes(handler), 120000);
}

// ── Separadores (tabs) ────────────────────────────

export function setTab(btnEl, tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  btnEl.classList.add('active');
  document.getElementById('tab-' + tab)?.classList.add('active');

  const btnNovo = document.getElementById('btn-novo-proj');
  if (btnNovo) btnNovo.style.display = tab === 'projetos' ? '' : 'none';

  if (tab === 'alertas')      renderAlertas();
  if (tab === 'ocorrencias')  renderOcorrenciasTab();
  if (tab === 'comunicacoes') {
    if (typeof window.renderOcorrenciasModulo === 'function') {
      window.renderOcorrenciasModulo();
    }
  }
}

// ── Alertas & Agenda ──────────────────────────────

export function renderAlertas() {
  const lista  = getProjects();
  const hoje   = new Date();
  hoje.setHours(0,0,0,0);
  const em14   = new Date(hoje.getTime() + 14 * 86400000);

  const alertas = [];
  const agenda  = [];

  const parseData = iso => {
    if (!iso) return null;
    const d = new Date(iso + 'T12:00:00');
    return isNaN(d) ? null : d;
  };

  const diasAte = d => Math.round((d - hoje) / 86400000);

  lista.forEach(p => {
    const nome = p.nome || '—';
    const tipo = TIPOS_PROJETO.find(t => t.value === p.tipo)?.label || p.tipo || '';

    // Proposta a expirar
    if (p.prazo && faseOrdem(p.fase) < faseOrdem('aprovado')) {
      const d = parseData(p.prazo);
      if (d) {
        const dias = diasAte(d);
        if (dias <= 0)
          alertas.push({ cor: 'urgente', tipo: 'Proposta expirada', nome, sub: 'Necessita renovação', data: d.toLocaleDateString('pt-PT'), ordem: -1 });
        else if (dias <= 2)
          alertas.push({ cor: 'urgente', tipo: `Proposta expira ${dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : 'em ' + dias + ' dias'}`, nome, sub: tipo, data: d.toLocaleDateString('pt-PT'), ordem: dias });
        else if (dias <= 7)
          alertas.push({ cor: 'aviso', tipo: `Proposta expira em ${dias} dias`, nome, sub: tipo, data: d.toLocaleDateString('pt-PT'), ordem: dias });

        if (d >= hoje && d <= em14)
          agenda.push({ data: d, label: d.toLocaleDateString('pt-PT', {day:'numeric',month:'short'}), nome, evento: 'Proposta expira', cor: dias <= 2 ? '#E24B4A' : '#BA7517' });
      }
    }

    // Entrega de materiais
    const dEnt = parseData(p.dataEntregaMat);
    if (dEnt) {
      const dias = diasAte(dEnt);
      if (dias >= 0 && dias <= 3)
        alertas.push({ cor: dias <= 1 ? 'urgente' : 'aviso', tipo: `Entrega ${dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : 'em ' + dias + ' dias'}`, nome, sub: 'Materiais — ' + tipo, data: dEnt.toLocaleDateString('pt-PT'), ordem: dias });
      if (dEnt >= hoje && dEnt <= em14)
        agenda.push({ data: dEnt, label: dEnt.toLocaleDateString('pt-PT', {day:'numeric',month:'short'}), nome, evento: 'Entrega de materiais', cor: '#BA7517' });
    }

    // Instalação a iniciar
    const dInst = parseData(p.dataInstalacao);
    if (dInst) {
      const dias = diasAte(dInst);
      if (dias >= 0 && dias <= 5)
        alertas.push({ cor: dias <= 1 ? 'urgente' : 'aviso', tipo: `Instalação ${dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : 'em ' + dias + ' dias'}`, nome, sub: tipo, data: dInst.toLocaleDateString('pt-PT'), ordem: dias });
      if (dInst >= hoje && dInst <= em14)
        agenda.push({ data: dInst, label: dInst.toLocaleDateString('pt-PT', {day:'numeric',month:'short'}), nome, evento: 'Início da instalação', cor: '#378ADD' });
    }

    // Em montagem
    if (p.fase === 'montagem')
      alertas.push({ cor: 'ok', tipo: 'Em montagem', nome, sub: tipo + (p.dataInstalacao ? ' · desde ' + new Date(p.dataInstalacao+'T12:00:00').toLocaleDateString('pt-PT') : ''), data: '', ordem: 99 });

    // Conclusão prevista
    const dConc = parseData(p.dataConclusao);
    if (dConc && dConc >= hoje && dConc <= em14)
      agenda.push({ data: dConc, label: dConc.toLocaleDateString('pt-PT', {day:'numeric',month:'short'}), nome, evento: 'Conclusão prevista', cor: '#639922' });

    // Aprovação pendente há mais de 5 dias
    if (p.fase === 'proposta' && p.dataCriacao) {
      const criacao = parseData(p.dataCriacao);
      if (criacao) {
        const diasCriado = Math.round((hoje - criacao) / 86400000);
        if (diasCriado >= 5)
          alertas.push({ cor: 'info', tipo: `Sem resposta há ${diasCriado} dias`, nome, sub: 'Proposta enviada, aguarda aprovação', data: criacao.toLocaleDateString('pt-PT'), ordem: 50 + diasCriado });
      }
    }
  });

  alertas.sort((a, b) => a.ordem - b.ordem);
  agenda.sort((a, b) => a.data - b.data);

  const corLabel = { urgente: 'Urgente', aviso: 'Atenção', info: 'Info', ok: 'Em curso' };

  const alertasHtml = alertas.length ? alertas.map(a => `
    <div class="alerta-card alerta-${a.cor}" onclick="window.setFiltro(document.querySelector('.filtro-btn'),a.nome);window.setTab(document.querySelector('[onclick*=projetos]'),'projetos')">
      <div class="alerta-tipo alerta-tipo-${a.cor}">${a.tipo}</div>
      <div class="alerta-nome">${a.nome}</div>
      <div class="alerta-detalhe">${a.sub}</div>
      ${a.data ? `<div class="alerta-data">${a.data}</div>` : ''}
    </div>`).join('')
  : `<p class="tab-vazio">✓ Sem alertas activos — tudo em ordem.</p>`;

  const hoje2 = new Date(); hoje2.setHours(0,0,0,0);
  const agendaHtml = agenda.length ? agenda.map(a => {
    const dias = Math.round((a.data - hoje2) / 86400000);
    const diaLabel = dias === 0 ? 'Hoje' : dias === 1 ? 'Amanhã' : a.label;
    return `
      <div class="agenda-item">
        <div class="agenda-dia">${diaLabel}</div>
        <div class="agenda-dot" style="background:${a.cor}"></div>
        <div class="agenda-info">
          <div class="agenda-proj">${a.nome}</div>
          <div class="agenda-evento">${a.evento}</div>
        </div>
      </div>`;
  }).join('')
  : `<p class="tab-vazio">Sem eventos nos próximos 14 dias.</p>`;

  // Atualizar badge
  const badge = document.getElementById('tab-badge-alertas');
  if (badge) { badge.textContent = alertas.length || ''; badge.style.display = alertas.length ? '' : 'none'; }

  document.getElementById('alertas-content').innerHTML = `
    <div class="tab-sec-titulo">Alertas activos</div>
    <div class="alerta-grid">${alertasHtml}</div>
    <div class="tab-sec-titulo" style="margin-top:28px">Agenda — próximos 14 dias</div>
    <div class="agenda-lista">${agendaHtml}</div>`;
}

// ── Ocorrências (tab dedicado) ────────────────────

export function renderOcorrenciasTab() {
  const lista  = getProjects();
  const tipoLabels   = { atraso: 'Atraso na entrega', defeito: 'Defeito de material', instalacao: 'Problema na instalação', falta: 'Material em falta', outro: 'Outro' };
  const estadoLabels = { detectada: 'Detectada', resolucao: 'Em resolução', resolvida: 'Resolvida' };

  const activas   = [];
  const resolvidas = [];

  lista.forEach(p => {
    (p.ocorrencias||[]).forEach(o => {
      const item = { ...o, projNome: p.nome||'—', projTipo: TIPOS_PROJETO.find(t=>t.value===p.tipo)?.label||p.tipo||'', projId: p.id };
      if (o.estado === 'resolvida') resolvidas.push(item);
      else activas.push(item);
    });
  });

  // Ordenar activas: detectadas primeiro, depois em resolução
  activas.sort((a,b) => (a.estado === 'detectada' ? 0 : 1) - (b.estado === 'detectada' ? 0 : 1));
  resolvidas.sort((a,b) => (b.data||'').localeCompare(a.data||''));

  // Badge
  const badge = document.getElementById('tab-badge-ocorr');
  if (badge) { badge.textContent = activas.length || ''; badge.style.display = activas.length ? '' : 'none'; }

  const nDetect = activas.filter(o => o.estado === 'detectada').length;
  const nResol  = activas.filter(o => o.estado === 'resolucao').length;

  const resumoHtml = activas.length ? `
    <div class="ocorr-resumo">
      ${nDetect ? `<span class="oc-pill oc-pill-verm">${nDetect} detectada${nDetect>1?'s':''}</span>` : ''}
      ${nResol  ? `<span class="oc-pill oc-pill-amb">${nResol} em resolução</span>` : ''}
    </div>` : '';

  const activasHtml = activas.length ? activas.map(o => {
    const diasReg = o.data ? Math.round((new Date() - new Date(o.data.split('/').reverse().join('-')+'T12:00:00')) / 86400000) : null;
    const estadoCls = o.estado === 'detectada' ? 'badge-detect' : 'badge-resol';
    return `
      <div class="oc-card" onclick="window.editarProjeto('${o.projId}')">
        <div class="oc-card-header">
          <div class="oc-card-proj">${o.projNome} · ${o.projTipo}</div>
          ${diasReg !== null ? `<div class="oc-card-dias">Há ${diasReg} dia${diasReg!==1?'s':''}</div>` : ''}
          <span class="oc-estado-badge ${estadoCls}">${estadoLabels[o.estado]||o.estado}</span>
        </div>
        <div class="oc-items">
          <div class="oc-item">
            <div class="oc-item-tipo oc-tipo-${o.estado==='detectada'?'d':'r'}">${tipoLabels[o.tipo]||o.tipo}</div>
            <div class="oc-item-desc">${o.descricao||''}</div>
            <div class="oc-item-data">${o.data||''}</div>
          </div>
        </div>
      </div>`;
  }).join('')
  : `<p class="tab-vazio">✓ Sem ocorrências activas.</p>`;

  const resolvidasHtml = resolvidas.slice(0,10).map(o => `
    <div class="hist-item" onclick="window.editarProjeto('${o.projId}')">
      <div class="hist-check">✓</div>
      <div class="hist-proj">${o.projNome}</div>
      <div class="hist-tipo">${tipoLabels[o.tipo]||o.tipo}</div>
      <div class="hist-data">Resolvida ${o.data||''}</div>
    </div>`).join('');

  document.getElementById('ocorrencias-content').innerHTML = `
    <div class="tab-sec-topo">
      <div class="tab-sec-titulo">Ocorrências activas</div>
      ${resumoHtml}
    </div>
    <div class="oc-lista">${activasHtml}</div>
    ${resolvidas.length ? `
      <div class="tab-sec-titulo" style="margin-top:28px;padding-top:20px;border-top:0.5px solid var(--border)">Resolvidas recentemente</div>
      <div class="hist-lista">${resolvidasHtml}</div>` : ''}`;
}
