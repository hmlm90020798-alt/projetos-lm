// ════════════════════════════════════════════════
// painel.js — Painel de Gestão · Projetos LM
// ════════════════════════════════════════════════

import { getState, setState, getProjects, getEditId } from './state.js';
import { guardar, apagar, verificarAprovacoes }        from './firebase.js';
import { mostrarToast, setView, fmt, gerarId, dataHoje, formatarData } from './ui.js';

// ── Tipos de projecto disponíveis ────────────────
export const TIPOS_PROJETO = [
  { value: 'cozinha',        label: '🍳 Cozinha' },
  { value: 'casa-de-banho',  label: '🚿 Casa de Banho' },
  { value: 'quarto',         label: '🛏 Quarto' },
  { value: 'sala',           label: '🛋 Sala' },
  { value: 'jardim',         label: '🌿 Jardim' },
  { value: 'pavimento',      label: '🪵 Pavimento' },
  { value: 'iluminacao',     label: '💡 Iluminação' },
  { value: 'exterior',       label: '🏡 Exterior' },
  { value: 'outro',          label: '✦ Outro' },
];

const FASE_LABEL = {
  proposta:  'Em Análise',
  aprovado:  'Aprovado',
  encomenda: 'Encomendado',
  entrega:   'Entrega',
  montagem:  'Em Obra',
  concluido: 'Concluído',
};
const FASE_CLASSE = {
  proposta:  'badge-proposta',
  aprovado:  'badge-aprovado',
  encomenda: 'badge-obra',
  entrega:   'badge-obra',
  montagem:  'badge-obra',
  concluido: 'badge-concluido',
};

// ── Dashboard ─────────────────────────────────────

function calcDashboard(list) {
  const total      = list.length;
  const aprovados  = list.filter(p=>p.fase!=='proposta').length;
  const concluidos = list.filter(p=>p.fase==='concluido').length;
  const taxa       = total>0 ? Math.round((aprovados/total)*100) : 0;

  let somaV=0, cntV=0;
  list.forEach(p=>{ const v=calcTotalProjeto(p); if(v>0){somaV+=v;cntV++;} });
  const valorMedio = cntV>0 ? somaV/cntV : 0;

  let somaT=0, cntT=0;
  list.forEach(p=>{
    if(p.aprovacao?.data && p.dataCriacao){
      const c = new Date(p.dataCriacao+'T12:00:00');
      const a = parsePT(p.aprovacao.data);
      if(a && !isNaN(a)){
        const d = Math.round((a-c)/86400000);
        if(d>=0&&d<365){somaT+=d;cntT++;}
      }
    }
  });
  const tempoMedio = cntT>0 ? Math.round(somaT/cntT) : null;

  const hoje  = new Date();
  const em7   = new Date(hoje.getTime()+7*86400000);
  const expira = list.filter(p=>{
    if(!p.prazo||p.fase!=='proposta') return false;
    const d=new Date(p.prazo+'T23:59:59');
    return d>=hoje&&d<=em7;
  }).length;

  return { total, aprovados, concluidos, taxa, valorMedio, tempoMedio, expira };
}

function parsePT(s) {
  if(!s) return null;
  const [d,m,y]=s.split('/');
  return new Date(`${y}-${m}-${d}T12:00:00`);
}

function calcTotalProjeto(p) {
  let t=0;
  const s=a=>(a||[]).forEach(i=>{t+=parseFloat(i.preco)||0;});
  s(p.tampos);s(p.eletros);s(p.acessorios);
  (p.extras   ||[]).forEach(c=>s(c.itens));
  (p.orcamento||[]).forEach(c=>s(c.itens));
  return Math.max(0,t-(parseFloat(p.desconto)||0));
}

// ── Render painel ────────────────────────────────

export function renderPainel() {
  const lista    = getProjects();
  const filtro   = getState('filtroAtivo');
  const pesquisa = (document.getElementById('painel-pesquisa')?.value||'').toLowerCase().trim();

  // Dashboard
  const db = calcDashboard(lista);
  const el = id=>document.getElementById(id);
  if(el('stat-total'))     el('stat-total').textContent      = db.total;
  if(el('stat-taxa'))      el('stat-taxa').textContent       = db.taxa+'%';
  if(el('stat-valor'))     el('stat-valor').textContent      = db.valorMedio>0?fmt(db.valorMedio):'—';
  if(el('stat-tempo'))     el('stat-tempo').textContent      = db.tempoMedio!==null?db.tempoMedio+'d':'—';
  if(el('stat-concluidos'))el('stat-concluidos').textContent = db.concluidos;
  if(el('stat-expira'))    el('stat-expira').textContent     = db.expira;

  const hoje = new Date();
  const filtrados = lista.filter(p=>{
    const pd  = p.prazo?new Date(p.prazo+'T23:59:59'):null;
    const exp = pd&&pd<hoje&&p.fase==='proposta';
    let ok = filtro==='todos'     ? true
           : filtro==='proposta'  ? p.fase==='proposta'&&!exp
           : filtro==='aprovado'  ? p.fase==='aprovado'
           : filtro==='obra'      ? ['encomenda','entrega','montagem'].includes(p.fase)
           : filtro==='concluido' ? p.fase==='concluido'
           : filtro==='expirado'  ? exp
           : true;
    if(pesquisa&&ok)
      ok=(p.nome||'').toLowerCase().includes(pesquisa)||(p.localidade||'').toLowerCase().includes(pesquisa);
    return ok;
  });

  const grid=document.getElementById('proj-grid');
  if(!grid) return;
  if(!filtrados.length){
    grid.innerHTML=`<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">📭</div>
      <div class="empty-titulo">Nenhum projeto encontrado</div>
      <div class="empty-sub">Tenta outro filtro ou cria um novo projeto.</div>
    </div>`;
    return;
  }
  grid.innerHTML=filtrados.map(p=>renderCard(p)).join('');
}

function renderCard(p) {
  const hoje   = new Date();
  const pd     = p.prazo?new Date(p.prazo+'T23:59:59'):null;
  const exp    = pd&&pd<hoje&&p.fase==='proposta';
  const urg    = pd&&!exp&&p.fase==='proposta'&&(pd-hoje)<7*86400000;
  const label  = exp?'Expirado':(FASE_LABEL[p.fase]||p.fase);
  const classe = exp?'badge-expirado':(FASE_CLASSE[p.fase]||'');
  const total  = calcTotalProjeto(p);
  const tipo   = TIPOS_PROJETO.find(t=>t.value===p.tipo)?.label||p.tipoOutro||p.tipo||'';

  return `
    <div class="proj-card" onclick="window.editarProjeto('${p.id}')">
      <div class="card-top">
        <div class="card-tipo-badge">${tipo}</div>
        <span class="proj-badge ${classe}">${label}</span>
      </div>
      <div class="card-nome">${p.nome||'—'}</div>
      <div class="card-local">${p.localidade||''}</div>
      <div class="card-financeiro">
        <div class="card-total">${total>0?fmt(total):'—'}</div>
        ${p.aprovacao?.data?`<div class="card-aprovado">✓ ${p.aprovacao.data}</div>`:''}
      </div>
      ${p.prazo?`<div class="card-prazo${urg?' urgente':''}">
        ${urg?'⚠️ ':''}Válido até ${formatarData(p.prazo)}</div>`:''}
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

// ── Modal ─────────────────────────────────────────

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
   'f-notas','f-desconto','f-tipo-outro'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  document.getElementById('f-tipo').value  = 'cozinha';
  document.getElementById('f-fase').value  = 'proposta';
  document.getElementById('f-tipo-outro-wrap').style.display='none';
  document.getElementById('img-thumbs-preview').innerHTML='';
  ['sec-tampos','sec-eletros','sec-acessorios'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.innerHTML='';
  });
  document.getElementById('sec-orcamento-cats').innerHTML='';
  document.getElementById('sec-extras-cats').innerHTML='';
  document.getElementById('sec-timeline-custom').innerHTML='';
  document.getElementById('f-interacoes-lista').innerHTML='';
  atualizarTotalPreview();
}

export function editarProjeto(id) {
  const p=getProjects().find(x=>x.id===id);
  if(!p) return;
  setState({ editId: id, editImgs: [...(p.imagens||[])] });
  document.getElementById('modal-proj-titulo').textContent='Editar Projeto';
  limparForm();

  const sv=(elId,val)=>{ const el=document.getElementById(elId); if(el) el.value=val||''; };
  sv('f-nome',p.nome); sv('f-contacto',p.contacto);
  sv('f-localidade',p.localidade); sv('f-fase',p.fase);
  sv('f-prazo',p.prazo); sv('f-entrega',p.entrega);
  sv('f-data-entrega-mat',p.dataEntregaMat); sv('f-data-instalacao',p.dataInstalacao);
  sv('f-data-conclusao',p.dataConclusao); sv('f-notas',p.notas); sv('f-desconto',p.desconto);

  if(p.tipo){
    document.getElementById('f-tipo').value=p.tipo;
    if(p.tipo==='outro'){
      document.getElementById('f-tipo-outro-wrap').style.display='';
      sv('f-tipo-outro',p.tipoOutro);
    }
  }

  (p.tampos   ||[]).forEach(i=>addLinhaElem('tampos',   i.nome,i.preco));
  (p.eletros  ||[]).forEach(i=>addLinhaElem('eletros',  i.nome,i.preco));
  (p.acessorios||[]).forEach(i=>addLinhaElem('acessorios',i.nome,i.preco));
  (p.orcamento||[]).forEach(cat=>{
    addCatOrcamento(cat.categoria);
    const grupos=document.getElementById('sec-orcamento-cats').querySelectorAll('[data-cat-grupo]');
    const ult=grupos[grupos.length-1];
    if(ult)(cat.itens||[]).forEach(i=>addLinhaEmCat(ult.querySelector('[data-cat-itens]'),i.nome,i.preco));
  });
  (p.extras||[]).forEach(cat=>{
    addCatExtra(cat.categoria);
    const grupos=document.getElementById('sec-extras-cats').querySelectorAll('[data-cat-grupo]');
    const ult=grupos[grupos.length-1];
    if(ult)(cat.itens||[]).forEach(i=>addLinhaEmCat(ult.querySelector('[data-cat-itens]'),i.nome,i.preco));
  });
  (p.timeline||[]).forEach(it=>addLinhaTimeline(it.texto,it.data));
  renderInteracoes(p.interacoes||[]);
  renderThumbs();
  atualizarTotalPreview();
  document.getElementById('modal-projeto').classList.add('open');
}

// ── Guardar projecto ──────────────────────────────

export async function guardarProjeto() {
  const editId=getEditId();
  const nome  =document.getElementById('f-nome').value.trim();
  if(!nome){ alert('Preenche o nome / referência do projeto.'); return; }

  const recolherLinhas=c=>{
    if(!c) return [];
    return Array.from(c.querySelectorAll('.prod-line')).map(r=>({
      nome: r.querySelector('.prod-line-nome')?.value?.trim()||'',
      preco:r.querySelector('.prod-line-preco')?.value?.trim()||'0',
    })).filter(i=>i.nome);
  };
  const recolherCats=c=>{
    if(!c) return [];
    return Array.from(c.querySelectorAll('[data-cat-grupo]')).map(g=>({
      categoria:g.querySelector('[data-cat-nome]')?.value?.trim()||'Categoria',
      itens:recolherLinhas(g.querySelector('[data-cat-itens]')),
    })).filter(c=>c.itens.length);
  };

  const interacoes=Array.from(document.querySelectorAll('#f-interacoes-lista .interacao-item'))
    .map(el=>({ tipo:el.dataset.tipo||'nota', texto:el.dataset.texto||'', data:el.dataset.data||'', hora:el.dataset.hora||'' }));

  const timeline=Array.from(document.querySelectorAll('#sec-timeline-custom .timeline-row'))
    .map(r=>({ texto:r.querySelector('.tl-input-texto')?.value?.trim()||'', data:r.querySelector('.tl-input-data')?.value||'' }))
    .filter(t=>t.texto);

  const tipo=document.getElementById('f-tipo').value;
  const proj={
    id:          editId||gerarId(),
    nome, tipo,
    tipoOutro:   tipo==='outro'?(document.getElementById('f-tipo-outro')?.value?.trim()||''):'',
    contacto:    document.getElementById('f-contacto').value.trim(),
    localidade:  document.getElementById('f-localidade').value.trim(),
    fase:        document.getElementById('f-fase').value,
    prazo:       document.getElementById('f-prazo').value,
    entrega:     document.getElementById('f-entrega').value.trim(),
    dataEntregaMat: document.getElementById('f-data-entrega-mat').value,
    dataInstalacao: document.getElementById('f-data-instalacao').value,
    dataConclusao:  document.getElementById('f-data-conclusao').value,
    notas:       document.getElementById('f-notas').value.trim(),
    desconto:    document.getElementById('f-desconto').value||'0',
    tampos:      recolherLinhas(document.getElementById('sec-tampos')),
    eletros:     recolherLinhas(document.getElementById('sec-eletros')),
    acessorios:  recolherLinhas(document.getElementById('sec-acessorios')),
    orcamento:   recolherCats(document.getElementById('sec-orcamento-cats')),
    extras:      recolherCats(document.getElementById('sec-extras-cats')),
    timeline, interacoes,
    imagens:     getState('editImgs'),
    data:        new Date().toLocaleDateString('pt-PT'),
    dataCriacao: editId?(getProjects().find(p=>p.id===editId)?.dataCriacao||dataHoje()):dataHoje(),
    aprovacao:   editId?(getProjects().find(p=>p.id===editId)?.aprovacao||null):null,
  };

  const lista=getProjects();
  const idx=lista.findIndex(p=>p.id===proj.id);
  if(idx>=0) lista[idx]=proj; else lista.unshift(proj);

  fecharModal();
  await guardar(proj);
  renderPainel();
}

export async function apagarProjeto(id) {
  const p=getProjects().find(x=>x.id===id);
  if(!confirm(`Apagar "${p?.nome||id}"?\nEsta ação é irreversível.`)) return;
  await apagar(id);
  renderPainel();
}

// ── Linhas dinâmicas no formulário ───────────────

export function addLinhaElem(tipo,nome='',preco='') {
  const sec=document.getElementById(`sec-${tipo}`);
  if(!sec) return;
  const d=document.createElement('div');
  d.className='prod-line';
  d.innerHTML=`
    <input type="text"   class="prod-line-nome"  placeholder="Descrição" value="${nome}" oninput="window.atualizarTotalPreview()">
    <input type="number" class="prod-line-preco" placeholder="0.00" value="${preco}" oninput="window.atualizarTotalPreview()">
    <button class="prod-line-del" onclick="this.closest('.prod-line').remove();window.atualizarTotalPreview()">×</button>`;
  sec.appendChild(d);
}

function _addCat(secId, nome='', grupoClass='') {
  const sec=document.getElementById(secId);
  const d=document.createElement('div');
  d.className=grupoClass; d.dataset.catGrupo='1';
  d.innerHTML=`
    <div class="cat-header">
      <input type="text" class="form-input cat-nome" data-cat-nome placeholder="Nome da categoria" value="${nome}">
      <button class="prod-line-del" onclick="this.closest('[data-cat-grupo]').remove();window.atualizarTotalPreview()">×</button>
    </div>
    <div class="cat-itens" data-cat-itens></div>
    <button class="btn-add-linha" onclick="window.addLinhaOrcamento(this)">+ item</button>`;
  sec.appendChild(d);
}

export function addCatOrcamento(nome='') { _addCat('sec-orcamento-cats',nome,'orc-cat-grupo'); }
export function addCatExtra(nome='')     { _addCat('sec-extras-cats',   nome,'ext-cat-grupo'); }

export function addLinhaOrcamento(btnEl) {
  const c=btnEl.previousElementSibling;
  if(c) addLinhaEmCat(c,'','');
}

function addLinhaEmCat(c,nome='',preco='') {
  const d=document.createElement('div');
  d.className='prod-line';
  d.innerHTML=`
    <input type="text"   class="prod-line-nome"  placeholder="Descrição" value="${nome}" oninput="window.atualizarTotalPreview()">
    <input type="number" class="prod-line-preco" placeholder="0.00" value="${preco}" oninput="window.atualizarTotalPreview()">
    <button class="prod-line-del" onclick="this.closest('.prod-line').remove();window.atualizarTotalPreview()">×</button>`;
  c.appendChild(d);
}

export function addLinhaTimeline(texto='',data='') {
  const sec=document.getElementById('sec-timeline-custom');
  const d=document.createElement('div');
  d.className='timeline-row';
  d.innerHTML=`
    <input type="text" class="form-input tl-input-texto" placeholder="Marco personalizado" value="${texto}" style="flex:1">
    <input type="date" class="form-input tl-input-data"  value="${data}" style="width:160px">
    <button class="prod-line-del" onclick="this.closest('.timeline-row').remove()">×</button>`;
  sec.appendChild(d);
}

export function atualizarTotalPreview() {
  let t=0;
  document.querySelectorAll('.prod-line-preco').forEach(el=>{t+=parseFloat(el.value)||0;});
  const desc=parseFloat(document.getElementById('f-desconto')?.value)||0;
  const el=document.getElementById('modal-total-preview');
  if(el) el.textContent=fmt(Math.max(0,t-desc));
}

// ── Imagens ───────────────────────────────────────

export async function processarImagens(files) {
  const imgs=[...getState('editImgs')];
  for(const f of Array.from(files)){
    if(imgs.length>=5){mostrarToast('Máximo de 5 imagens','');break;}
    if(f.size>4*1024*1024){mostrarToast('Imagem demasiado grande','Máx 4MB');continue;}
    const b64=await new Promise(res=>{ const r=new FileReader(); r.onload=e=>res(e.target.result); r.readAsDataURL(f); });
    imgs.push(b64);
  }
  setState({editImgs:imgs});
  renderThumbs();
}

export function removerImagem(idx) {
  setState({editImgs:getState('editImgs').filter((_,i)=>i!==idx)});
  renderThumbs();
}

export function renderThumbs() {
  const c=document.getElementById('img-thumbs-preview');
  if(!c) return;
  c.innerHTML=getState('editImgs').map((src,i)=>`
    <div class="img-thumb">
      <img src="${src}" alt="">
      <button class="img-thumb-del" onclick="window.removerImagem(${i})">×</button>
    </div>`).join('');
}

// ── Interacções ───────────────────────────────────

export function addInteracao(tipo,texto) {
  if(!texto?.trim()) return;
  const agora=new Date();
  const data=agora.toLocaleDateString('pt-PT');
  const hora=String(agora.getHours()).padStart(2,'0')+':'+String(agora.getMinutes()).padStart(2,'0');
  const lista=document.getElementById('f-interacoes-lista');
  if(!lista) return;
  const d=document.createElement('div');
  d.className='interacao-item';
  d.dataset.tipo=tipo; d.dataset.texto=texto; d.dataset.data=data; d.dataset.hora=hora;
  d.innerHTML=`
    <span class="int-tipo tipo-${tipo}">${tipo}</span>
    <span class="int-texto">${texto}</span>
    <span class="int-data">${data} ${hora}</span>
    <button class="prod-line-del" onclick="this.closest('.interacao-item').remove()">×</button>`;
  lista.prepend(d);
}

function renderInteracoes(list) {
  const el=document.getElementById('f-interacoes-lista');
  if(!el) return;
  el.innerHTML=list.map(i=>`
    <div class="interacao-item" data-tipo="${i.tipo}" data-texto="${i.texto}" data-data="${i.data}" data-hora="${i.hora||''}">
      <span class="int-tipo tipo-${i.tipo}">${i.tipo}</span>
      <span class="int-texto">${i.texto}</span>
      <span class="int-data">${i.data} ${i.hora||''}</span>
      <button class="prod-line-del" onclick="this.closest('.interacao-item').remove()">×</button>
    </div>`).join('');
}

// ── Links e partilha ─────────────────────────────

export function partilharCliente(id) {
  const base=window.location.origin+window.location.pathname;
  const url =`${base}?p=${id}`;
  const p   =getProjects().find(x=>x.id===id);
  const msg =`Olá${p?.nome?' '+p.nome.split(' ')[0]:''}! Aqui está a sua proposta:\n${url}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`,'_blank');
}

export function verCliente(id) {
  setState({ projAtualId: id });
  const p=getProjects().find(x=>x.id===id);
  if(p) window._clienteModule.renderPaginaCliente(p);
  setView('cliente');
  const btn=document.getElementById('btn-voltar-painel');
  if(btn) btn.style.display='';
}

export function copiarEmail(btnEl) {
  const v=document.getElementById('cli-email-val')?.textContent?.replace(/\s/g,'')||'';
  navigator.clipboard.writeText(v).then(()=>{
    const o=btnEl.textContent; btnEl.textContent='✓ Copiado';
    setTimeout(()=>{btnEl.textContent=o;},2000);
  });
}

// ── Filtro e formulário ───────────────────────────

export function setFiltro(btnEl, filtro) {
  setState({ filtroAtivo: filtro });
  document.querySelectorAll('.filtro-btn').forEach(b=>b.classList.remove('active'));
  btnEl.classList.add('active');
  renderPainel();
}

export function reiniciarPrazoForm() {
  const inp=document.getElementById('f-prazo');
  if(!inp.value){alert('Define primeiro uma data de validade.');return;}
  let dias=15;
  const editId=getEditId();
  if(editId){
    const p=getProjects().find(x=>x.id===editId);
    if(p?.dataCriacao&&p?.prazo){
      const c=new Date(p.dataCriacao+'T12:00:00');
      const pr=new Date(p.prazo+'T12:00:00');
      const d=Math.round((pr-c)/86400000);
      if(!isNaN(d)&&d>0) dias=d;
    }
  }
  const novo=new Date(new Date().getTime()+dias*86400000);
  if(!confirm(`Reiniciar validade?\nDias: ${dias}\nNovo prazo: ${novo.toLocaleDateString('pt-PT')}`)) return;
  inp.value=novo.toISOString().split('T')[0];
}

export function atualizarTipoProjeto() {
  const v=document.getElementById('f-tipo').value;
  document.getElementById('f-tipo-outro-wrap').style.display=v==='outro'?'':'none';
}

export function iniciarPollingAprovacoes() {
  const handler=(p,d)=>{
    mostrarToast(`🎉 ${p.nome||'Cliente'} aprovou!`,`${d.aprovacao.data} às ${d.aprovacao.hora||'--:--'}`);
    renderPainel();
  };
  verificarAprovacoes(handler);
  setInterval(()=>verificarAprovacoes(handler),120000);
}
