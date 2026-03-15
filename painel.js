// ════════════════════════════════════════════════
// painel.js — Painel de Gestão · Projetos LM
// ════════════════════════════════════════════════

import { getState, setState, getProjects, getEditId } from './state.js';
import { guardar, apagar, verificarAprovacoes }        from './firebase.js';
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
  const s = a => (a||[]).forEach(i => { t += parseFloat(i.preco)||0; });
  s(p.tampos); s(p.eletros); s(p.acessorios);
  (p.extras   ||[]).forEach(c => s(c.itens));
  (p.orcamento||[]).forEach(c => s(c.itens));
  return Math.max(0, t - (parseFloat(p.desconto)||0));
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
      ok = (p.nome||'').toLowerCase().includes(pesquisa) || (p.localidade||'').toLowerCase().includes(pesquisa);
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
      <div class="card-local">${p.localidade || ''}</div>
      <div class="card-financeiro">
        <div class="card-total">${total > 0 ? fmt(total) : '—'}</div>
        ${p.aprovacao?.data ? `<div class="card-aprovado">✓ ${p.aprovacao.data}</div>` : ''}
      </div>
      ${p.prazo ? `<div class="card-prazo${urg ? ' urgente' : ''}">
        ${urg ? '⚠️ ' : ''}Válido até ${formatarData(p.prazo)}</div>` : ''}
      <div class="card-actions">
        <button class="btn-card" onclick="event.stopPropagation();window.editarProjeto('${p.id}')">✏️ Editar</button>
        <button class="btn-card primary" onclick="event.stopPropagation();window.verCliente('${p.id}')">👁 Ver</button>
        <button class="btn-card whatsapp" onclick="event.stopPropagation();window.partilharCliente('${p.id}')">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:middle"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012 .99h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
          Partilhar
        </button>
        <button class="btn-card danger" onclick="event.stopPropagation();window.apagarProjeto('${p.id}')">🗑</button>
      </div>
    </div>`;
}

// ── Modal ──────────────────────────────────────────

export function abrirModalNovo() {
  setState({ editId: null, editImgs: [] });
  document.getElementById('modal-proj-titulo').textContent = 'Novo Projeto';
  limparForm();
  document.getElementById('modal-projeto').classList.add('open');
}

export function fecharModal() {
  document.getElementById('modal-projeto').classList.remove('open');
  setState({ editId: null, editImgs: [] });
}

function limparForm() {
  ['f-nome','f-contacto','f-localidade','f-prazo','f-entrega',
   'f-data-entrega-mat','f-data-instalacao','f-data-conclusao',
   'f-notas','f-desconto','f-tipo-outro'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('f-tipo').value = 'cozinha';
  document.getElementById('f-fase').value = 'proposta';
  document.getElementById('f-tipo-outro-wrap').style.display = 'none';
  document.getElementById('img-thumbs-preview').innerHTML = '';

  // Limpar secções dinâmicas
  ['sec-elem-moveis','sec-elem-tampos','sec-elem-eletros','sec-elem-acessorios',
   'sec-elem-pavimentos','sec-elem-revestimentos','sec-elem-sanitarios',
   'sec-elem-iluminacao','sec-elem-aquecimento','sec-elem-extras',
   'sec-tampos','sec-eletros','sec-acessorios',
   'sec-orcamento-cats','sec-extras-cats',
   'sec-timeline-custom','f-interacoes-lista','f-ocorrencias-lista'].forEach(id => {
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
  sv('f-notas', p.notas);         sv('f-desconto', p.desconto);

  if (p.tipo) {
    document.getElementById('f-tipo').value = p.tipo;
    if (p.tipo === 'outro') {
      document.getElementById('f-tipo-outro-wrap').style.display = '';
      sv('f-tipo-outro', p.tipoOutro);
    }
  }

  // Elementos do projecto (com URL)
  const elemCats = [
    ['moveis','elem_moveis'], ['tampos','elem_tampos'], ['eletros','elem_eletros'],
    ['acessorios','elem_acessorios'], ['pavimentos','elem_pavimentos'],
    ['revestimentos','elem_revestimentos'], ['sanitarios','elem_sanitarios'],
    ['iluminacao','elem_iluminacao'], ['aquecimento','elem_aquecimento'],
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

  // Orçamento
  (p.tampos    ||[]).forEach(i => addLinhaOrc('tampos',    i.nome, i.preco));
  (p.eletros   ||[]).forEach(i => addLinhaOrc('eletros',   i.nome, i.preco));
  (p.acessorios||[]).forEach(i => addLinhaOrc('acessorios',i.nome, i.preco));
  (p.orcamento||[]).forEach(cat => {
    addCatOrcamento(cat.categoria);
    const grupos = document.getElementById('sec-orcamento-cats').querySelectorAll('[data-cat-grupo]');
    const ult = grupos[grupos.length - 1];
    if (ult) (cat.itens||[]).forEach(i => addLinhaOrcNoCat(ult.querySelector('[data-cat-itens]'), i.nome, i.preco));
  });
  (p.extras||[]).forEach(cat => {
    addCatExtra(cat.categoria);
    const grupos = document.getElementById('sec-extras-cats').querySelectorAll('[data-cat-grupo]');
    const ult = grupos[grupos.length - 1];
    if (ult) (cat.itens||[]).forEach(i => addLinhaOrcNoCat(ult.querySelector('[data-cat-itens]'), i.nome, i.preco));
  });

  (p.timeline||[]).forEach(it => addLinhaTimeline(it.texto, it.data));
  renderInteracoes(p.interacoes || []);
  renderOcorrenciasForm(p.ocorrencias || []);
  renderThumbs();
  atualizarTotalPreview();
  document.getElementById('modal-projeto').classList.add('open');
}

// ── Guardar projecto ───────────────────────────────

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

  const recolherLinhasOrc = c => {
    if (!c) return [];
    return Array.from(c.querySelectorAll('.prod-line')).map(r => ({
      nome:  r.querySelector('.prod-line-nome')?.value?.trim()  || '',
      preco: r.querySelector('.prod-line-preco')?.value?.trim() || '0',
    })).filter(i => i.nome);
  };

  const recolherCatsElem = c => {
    if (!c) return [];
    return Array.from(c.querySelectorAll('[data-elem-grupo]')).map(g => ({
      categoria: g.querySelector('[data-elem-cat-nome]')?.value?.trim() || 'Categoria',
      itens: recolherLinhasElem(g.querySelector('[data-elem-itens]')),
    })).filter(c => c.itens.length);
  };

  const recolherCatsOrc = c => {
    if (!c) return [];
    return Array.from(c.querySelectorAll('[data-cat-grupo]')).map(g => ({
      categoria: g.querySelector('[data-cat-nome]')?.value?.trim() || 'Categoria',
      itens: recolherLinhasOrc(g.querySelector('[data-cat-itens]')),
    })).filter(c => c.itens.length);
  };

  const interacoes = Array.from(document.querySelectorAll('#f-interacoes-lista .interacao-item'))
    .map(el => ({ tipo: el.dataset.tipo||'nota', texto: el.dataset.texto||'', data: el.dataset.data||'', hora: el.dataset.hora||'' }));

  const ocorrencias = Array.from(document.querySelectorAll('#f-ocorrencias-lista .ocorr-item'))
    .map(el => ({ tipo: el.dataset.tipo||'outro', descricao: el.dataset.desc||'', estado: el.dataset.estado||'detectada', data: el.dataset.data||'' }));

  const timeline = Array.from(document.querySelectorAll('#sec-timeline-custom .timeline-row'))
    .map(r => ({ texto: r.querySelector('.tl-input-texto')?.value?.trim()||'', data: r.querySelector('.tl-input-data')?.value||'' }))
    .filter(t => t.texto);

  const tipo = document.getElementById('f-tipo').value;

  const proj = {
    id:          editId || gerarId(),
    nome, tipo,
    tipoOutro:   tipo === 'outro' ? (document.getElementById('f-tipo-outro')?.value?.trim()||'') : '',
    contacto:    document.getElementById('f-contacto').value.trim(),
    localidade:  document.getElementById('f-localidade').value.trim(),
    fase:        document.getElementById('f-fase').value,
    prazo:       document.getElementById('f-prazo').value,
    entrega:     document.getElementById('f-entrega').value.trim(),
    dataEntregaMat:  document.getElementById('f-data-entrega-mat').value,
    dataInstalacao:  document.getElementById('f-data-instalacao').value,
    dataConclusao:   document.getElementById('f-data-conclusao').value,
    notas:       document.getElementById('f-notas').value.trim(),
    desconto:    document.getElementById('f-desconto').value || '0',
    // Elementos (com URL)
    elem_moveis:        recolherLinhasElem(document.getElementById('sec-elem-moveis')),
    elem_tampos:        recolherLinhasElem(document.getElementById('sec-elem-tampos')),
    elem_eletros:       recolherLinhasElem(document.getElementById('sec-elem-eletros')),
    elem_acessorios:    recolherLinhasElem(document.getElementById('sec-elem-acessorios')),
    elem_pavimentos:    recolherLinhasElem(document.getElementById('sec-elem-pavimentos')),
    elem_revestimentos: recolherLinhasElem(document.getElementById('sec-elem-revestimentos')),
    elem_sanitarios:    recolherLinhasElem(document.getElementById('sec-elem-sanitarios')),
    elem_iluminacao:    recolherLinhasElem(document.getElementById('sec-elem-iluminacao')),
    elem_aquecimento:   recolherLinhasElem(document.getElementById('sec-elem-aquecimento')),
    elem_extras:        recolherCatsElem(document.getElementById('sec-elem-extras')),
    // Orçamento (com preço)
    tampos:      recolherLinhasOrc(document.getElementById('sec-tampos')),
    eletros:     recolherLinhasOrc(document.getElementById('sec-eletros')),
    acessorios:  recolherLinhasOrc(document.getElementById('sec-acessorios')),
    orcamento:   recolherCatsOrc(document.getElementById('sec-orcamento-cats')),
    extras:      recolherCatsOrc(document.getElementById('sec-extras-cats')),
    timeline, interacoes, ocorrencias,
    imagens:     getState('editImgs'),
    data:        new Date().toLocaleDateString('pt-PT'),
    dataCriacao: editId ? (getProjects().find(p => p.id === editId)?.dataCriacao || dataHoje()) : dataHoje(),
    aprovacao:   editId ? (getProjects().find(p => p.id === editId)?.aprovacao || null) : null,
  };

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

export function addCatOrcamento(nome = '') {
  const sec = document.getElementById('sec-orcamento-cats');
  const d   = document.createElement('div');
  d.className = 'orc-cat-grupo'; d.dataset.catGrupo = '1';
  d.innerHTML = `
    <div class="cat-header">
      <input type="text" class="f-input cat-nome" data-cat-nome placeholder="Categoria" value="${nome}">
      <button class="prod-line-del" onclick="this.closest('[data-cat-grupo]').remove();window.atualizarTotalPreview()">×</button>
    </div>
    <div class="cat-itens" data-cat-itens></div>
    <button class="btn-add" onclick="window.addLinhaOrcamento(this)">+ item</button>`;
  sec.appendChild(d);
}

export function addCatExtra(nome = '') {
  const sec = document.getElementById('sec-extras-cats');
  const d   = document.createElement('div');
  d.className = 'ext-cat-grupo'; d.dataset.catGrupo = '1';
  d.innerHTML = `
    <div class="cat-header">
      <input type="text" class="f-input cat-nome" data-cat-nome placeholder="Extra" value="${nome}">
      <button class="prod-line-del" onclick="this.closest('[data-cat-grupo]').remove();window.atualizarTotalPreview()">×</button>
    </div>
    <div class="cat-itens" data-cat-itens></div>
    <button class="btn-add" onclick="window.addLinhaOrcamento(this)">+ item</button>`;
  sec.appendChild(d);
}

export function addLinhaOrcamento(btnEl) {
  const c = btnEl.previousElementSibling;
  if (c) addLinhaOrcNoCat(c, '', '');
}

function addLinhaOrcNoCat(c, nome = '', preco = '') {
  const d = document.createElement('div');
  d.className = 'prod-line';
  d.innerHTML = `
    <input type="text"   class="prod-line-nome"  placeholder="Descrição" value="${nome}" oninput="window.atualizarTotalPreview()">
    <input type="number" class="prod-line-preco" placeholder="0.00" value="${preco}" oninput="window.atualizarTotalPreview()">
    <button class="prod-line-del" onclick="this.closest('.prod-line').remove();window.atualizarTotalPreview()">×</button>`;
  c.appendChild(d);
}

export function addLinhaTimeline(texto = '', data = '') {
  const sec = document.getElementById('sec-timeline-custom');
  const d   = document.createElement('div');
  d.className = 'timeline-row';
  d.innerHTML = `
    <input type="text" class="f-input tl-input-texto" placeholder="Marco personalizado" value="${texto}" style="flex:1">
    <input type="date" class="f-input tl-input-data"  value="${data}" style="width:160px">
    <button class="prod-line-del" onclick="this.closest('.timeline-row').remove()">×</button>`;
  sec.appendChild(d);
}

export function atualizarTotalPreview() {
  let t = 0;
  document.querySelectorAll('.prod-line-preco').forEach(el => { t += parseFloat(el.value) || 0; });
  const desc = parseFloat(document.getElementById('f-desconto')?.value) || 0;
  const el   = document.getElementById('modal-total-preview');
  if (el) el.textContent = fmt(Math.max(0, t - desc));
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
  const p    = getProjects().find(x => x.id === id);
  const msg  = `Olá${p?.nome ? ' ' + p.nome.split(' ')[0] : ''}! Aqui está a sua proposta:\n${url}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

export function verCliente(id) {
  setState({ projAtualId: id });
  const p = getProjects().find(x => x.id === id);
  if (p) window._clienteModule.renderPaginaCliente(p);
  setView('cliente');
  const btn = document.getElementById('btn-voltar-painel');
  if (btn) btn.style.display = '';
}

export function copiarEmail(btnEl) {
  const v = document.getElementById('cli-email-val')?.textContent?.replace(/\s/g, '') || '';
  navigator.clipboard.writeText(v).then(() => {
    const o = btnEl.textContent; btnEl.textContent = '✓ Copiado';
    setTimeout(() => { btnEl.textContent = o; }, 2000);
  });
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
