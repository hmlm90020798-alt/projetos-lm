// ════════════════════════════════════════════════
// painel-form-extras.js — Elementos, Orçamento,
// Imagens, Interações, Ocorrências, Notas, Docs
// Projetos LM
// ════════════════════════════════════════════════

import { getState, setState } from './state.js';
import { mostrarToast, fmt } from './ui.js';
import { esc }               from './sanitize.js';

// ── Linhas de elementos (com URL) ─────────────────

export function addLinhaElem(secId, nome = '', url = '', preco = '') {
  const sec = document.getElementById(`sec-elem-${secId}`);
  if (!sec) return;
  const d = document.createElement('div');
  d.className = 'elem-line';
  d.innerHTML = `
    <input type="text"   class="elem-line-nome"  placeholder="Nome do artigo" value="${nome}">
    <input type="url"    class="elem-line-url"   placeholder="https://leroymerlin.pt/..." value="${url}">
    <input type="number" class="elem-line-preco" placeholder="Preço (€)" value="${preco}" style="width:100px">
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

export function addLinhaElemNoCat(c, nome = '', url = '', preco = '') {
  const d = document.createElement('div');
  d.className = 'elem-line';
  d.innerHTML = `
    <input type="text"   class="elem-line-nome"  placeholder="Nome do artigo" value="${nome}">
    <input type="url"    class="elem-line-url"   placeholder="https://leroymerlin.pt/..." value="${url}">
    <input type="number" class="elem-line-preco" placeholder="Preço (€)" value="${preco}" style="width:100px">
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
export function addCatOrcamento(nome = '', valor = '', desc = '') {
  const sec = document.getElementById('sec-orcamento-cats');
  const d   = document.createElement('div');
  d.className = 'orc-cat-grupo'; d.dataset.catGrupo = '1';
  d.innerHTML = `
    <div class="cat-header">
      <input type="text"   class="f-input cat-nome"  data-cat-nome  placeholder="Nome da categoria" value="${nome}" style="flex:1">
      <input type="number" class="f-input cat-valor" data-cat-valor placeholder="0,00" value="${valor}" style="width:120px" oninput="window.atualizarTotalPreview()">
      <button class="prod-line-del" onclick="this.closest('[data-cat-grupo]').remove();window.atualizarTotalPreview()">×</button>
    </div>
    <input type="text" class="f-input cat-desc" data-cat-desc placeholder="Descrição / modelo (ex: Nolte Küchen — Premium Line)" value="${desc}" style="margin-top:4px;font-size:12px">`;
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

// Comprimir imagem para máx 900px e qualidade 75% antes de guardar no Firestore
function comprimirImagem(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const MAX = 900;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else       { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export async function processarImagens(files) {
  const imgs = [...getState('editImgs')];
  for (const f of Array.from(files)) {
    if (imgs.length >= 5) { mostrarToast('Máximo de 5 imagens', ''); break; }
    if (f.size > 4 * 1024 * 1024) { mostrarToast('Imagem demasiado grande', 'Máx 4MB'); continue; }
    const b64 = await comprimirImagem(f);
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

export function renderInteracoes(list) {
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

export function renderDocsForm(docs) {
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

export function renderNotasForm(notas) {
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

export function renderOcorrenciasForm(list) {
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

