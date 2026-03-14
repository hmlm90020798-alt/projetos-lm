// ════════════════════════════════════════════════
// cliente.js — Página Pública do Cliente · Projetos LM
// ════════════════════════════════════════════════

import { T }                              from './i18n.js';
import { getState, setState, getLang }    from './state.js';
import { _db, registarVisita }            from './firebase.js';
import { mostrarToast }                   from './ui.js';
import { doc, getDoc, setDoc }            from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ── Helpers ──────────────────────────────────────

function fmt(v) {
  const n = parseFloat(v);
  return isNaN(n) ? '0,00 €'
    : n.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function faseOrdem(f) {
  return ['proposta','aprovado','encomenda','entrega','montagem','concluido'].indexOf(f);
}

export function calcTotal(p) {
  let t = 0;
  const s = a => (a||[]).forEach(i => { t += parseFloat(i.preco)||0; });
  s(p.tampos); s(p.eletros); s(p.acessorios);
  (p.extras   ||[]).forEach(c=>s(c.itens));
  (p.orcamento||[]).forEach(c=>s(c.itens));
  return Math.max(0, t - (parseFloat(p.desconto)||0));
}

// ── Countdown ────────────────────────────────────

function iniciarCountdown(prazo) {
  const wrap = document.getElementById('countdown-wrap');
  if (!wrap) return;
  const fim = new Date(prazo + 'T23:59:59');
  function tick() {
    const diff = fim - new Date();
    if (diff <= 0) { wrap.innerHTML = `<div class="cd-expirada">${T[getLang()].hero.expirada}</div>`; return; }
    const d  = Math.floor(diff/86400000);
    const h  = Math.floor((diff%86400000)/3600000);
    const m  = Math.floor((diff%3600000)/60000);
    const s  = Math.floor((diff%60000)/1000);
    const tH = T[getLang()].hero;
    wrap.innerHTML = `
      <div class="cd-label">${tH.countdown}</div>
      <div class="cd-grid">
        ${[[d,tH.dias],[h,tH.horas],[m,tH.minutos],[s,tH.segundos]].map(([n,l])=>`
          <div class="cd-unit">
            <div class="cd-num">${String(n).padStart(2,'0')}</div>
            <div class="cd-lbl">${l}</div>
          </div>`).join('')}
      </div>`;
  }
  const old = getState('cdInterval');
  if (old) clearInterval(old);
  tick();
  setState({ cdInterval: setInterval(tick, 1000) });
}

// ── Timeline ─────────────────────────────────────

function gerarMarcos(p) {
  const fase  = p.fase || 'proposta';
  const ord   = faseOrdem(fase);
  const tTL   = T[getLang()].timeline;
  const m     = tTL.marcos;
  const temInt = (p.interacoes||[]).length > 0;

  const ok = f => ord >= faseOrdem(f);

  return [
    { label: m.planificado, done: true,       ativo: false },
    { label: m.analise,     done: ok('aprovado'), ativo: fase==='proposta',
      apelo: fase==='proposta' ? (temInt ? tTL.apelo.comInteracoes : tTL.apelo.semInteracoes) : null },
    { label: m.confirmado,  done: ok('aprovado'), ativo: fase==='aprovado' },
    { label: m.preparacao,  done: ok('entrega'),  ativo: fase==='encomenda' },
    { label: m.entrega,     done: ok('montagem'), ativo: fase==='entrega',
      data: p.dataEntregaMat  ? `${tTL.dataEntrega}: ${new Date(p.dataEntregaMat+'T12:00:00').toLocaleDateString('pt-PT')}` : null },
    { label: m.instalacao,  done: ok('concluido'),ativo: fase==='montagem',
      data: p.dataInstalacao  ? `${tTL.dataInstalacao}: ${new Date(p.dataInstalacao+'T12:00:00').toLocaleDateString('pt-PT')}` : null },
    { label: m.conclusao,   done: fase==='concluido', ativo: false,
      data: p.dataConclusao   ? `${tTL.dataConclusao}: ${new Date(p.dataConclusao+'T12:00:00').toLocaleDateString('pt-PT')}` : null },
  ];
}

function renderTimeline(p) {
  return gerarMarcos(p).map(m => `
    <div class="tl-item${m.done?' done':''}${m.ativo?' ativo':''}">
      <div class="tl-dot"></div>
      <div class="tl-content">
        <div class="tl-label">${m.label}</div>
        ${m.data  ? `<div class="tl-data">${m.data}</div>` : ''}
        ${m.apelo ? `<span class="tl-apelo">${m.apelo}</span>` : ''}
      </div>
    </div>`).join('');
}

// ── Orçamento ─────────────────────────────────────

function renderOrcamento(p) {
  const tO    = T[getLang()].orcamento;
  const total = calcTotal(p);
  const desc  = parseFloat(p.desconto)||0;

  const secoes = [];
  if ((p.tampos   ||[]).length) secoes.push({ t: tO.tampos,    it: p.tampos });
  if ((p.eletros  ||[]).length) secoes.push({ t: tO.eletros,   it: p.eletros });
  if ((p.acessorios||[]).length)secoes.push({ t: tO.acessorios,it: p.acessorios });
  (p.orcamento||[]).forEach(c => { if ((c.itens||[]).length) secoes.push({ t: c.categoria, it: c.itens }); });
  (p.extras   ||[]).forEach(c => { if ((c.itens||[]).length) secoes.push({ t: c.categoria, it: c.itens }); });

  const subs = secoes.map(s => (s.it||[]).reduce((a,i)=>a+(parseFloat(i.preco)||0),0));
  const maxS = Math.max(...subs, 1);

  const secoesHtml = secoes.map((s,i) => {
    const sub = subs[i];
    const pct = Math.round((sub/maxS)*100);
    return `
      <div class="orc-grupo">
        <div class="orc-grupo-header">
          <span class="orc-grupo-nome">${s.t}</span>
          <span class="orc-grupo-sub">${fmt(sub)}</span>
        </div>
        <div class="orc-barra-bg"><div class="orc-barra" style="width:0%" data-pct="${pct}"></div></div>
        <div class="orc-itens">
          ${(s.it||[]).map(i=>`
            <div class="orc-item">
              <span class="orc-item-nome">${i.nome||''}</span>
              <span class="orc-item-preco">${fmt(i.preco)}</span>
            </div>`).join('')}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="orc-layout">
      <div class="orc-lista">${secoesHtml||`<p class="orc-vazio">${tO.semItens}</p>`}</div>
      <div class="orc-total-card">
        <div class="ot-eyebrow">${tO.total}</div>
        <div class="ot-valor">${fmt(total)}</div>
        ${desc>0?`<div class="ot-desc">${tO.desconto}: −${fmt(desc)}</div>`:''}
      </div>
    </div>`;
}

// ── Aprovação ─────────────────────────────────────

export async function renderEstadoAprovacao(projetoId, aprovacao) {
  const sec = document.getElementById('sec-aprovacao');
  if (!sec) return;

  let aprovado = aprovacao?.data;
  if (!aprovado) {
    const local = getState('projetos').find(x=>x.id===projetoId);
    aprovado = local?.fase && local.fase !== 'proposta';
  }
  if (!aprovado && projetoId) {
    try {
      const snap = await getDoc(doc(_db, 'projetos', projetoId));
      if (snap.exists() && snap.data().fase !== 'proposta') {
        aprovado = true;
        if (!aprovacao?.data) aprovacao = snap.data().aprovacao || null;
      }
    } catch (_) {}
  }

  const tA = T[getLang()].aprovacao;

  if (aprovado) {
    const dataTexto = aprovacao?.data
      ? `${tA.aprovadaEm}${aprovacao.data}${aprovacao.hora?' às '+aprovacao.hora:''}`
      : tA.aprovada;
    sec.innerHTML = `
      <div class="aprov-wrap">
        ${aprovacao?.origem==='cliente' ? `
          <div class="aprov-confirmada show">
            <div class="aprov-confirm-titulo">${tA.confirmTitulo}</div>
            <div class="aprov-confirm-texto">${tA.confirmTexto}</div>
          </div>` : ''}
        <div class="aprov-ja">${dataTexto}</div>
      </div>`;
  } else {
    sec.innerHTML = `
      <div class="aprov-wrap">
        <div class="aprov-titulo">${tA.titulo}</div>
        <div class="aprov-sub">${tA.sub}</div>
        <button class="btn-aprovar" id="btn-aprovar-proj" onclick="window.aprovarProposta()">${tA.btn}</button>
        <div class="aprov-confirmada" id="aprov-confirmada">
          <div class="aprov-confirm-titulo">${tA.confirmTitulo}</div>
          <div class="aprov-confirm-texto">${tA.confirmTexto}</div>
        </div>
      </div>`;
  }
}

export async function aprovarProposta() {
  const id  = getState('projAtualId');
  if (!id) return;
  const btn = document.getElementById('btn-aprovar-proj');
  if (btn) { btn.disabled = true; btn.textContent = 'A registar…'; }

  const agora = new Date();
  const data  = agora.toLocaleDateString('pt-PT');
  const hora  = String(agora.getHours()).padStart(2,'0')+':'+String(agora.getMinutes()).padStart(2,'0');

  try {
    const ref  = doc(_db, 'projetos', id);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const p = snap.data();
      p.aprovacao = { data, hora, origem: 'cliente' };
      p.fase      = 'aprovado';
      await setDoc(ref, p);
    }
    await renderEstadoAprovacao(id, { data, hora, origem: 'cliente' });
    setTimeout(async () => {
      try {
        const s = await getDoc(doc(_db,'projetos',id));
        if (s.exists()) renderPaginaCliente(s.data());
      } catch (_) {}
    }, 1200);
    mostrarToast('✓ Proposta aprovada!', `${data} · ${hora}`);
  } catch (e) {
    if (btn) { btn.disabled=false; btn.textContent=T[getLang()].aprovacao.btn; }
    alert('Erro ao registar. Tente novamente.');
  }
}

// ── Export PDF ────────────────────────────────────

export function exportarPDF() {
  const btn = document.getElementById('btn-pdf');
  const tP  = T[getLang()].pdf;
  if (btn) { btn.textContent = tP.preparar; btn.disabled = true; }

  // Esconder elementos que não devem aparecer no PDF
  document.body.classList.add('pdf-mode');

  setTimeout(() => {
    window.print();
    setTimeout(() => {
      document.body.classList.remove('pdf-mode');
      if (btn) { btn.textContent = tP.btn; btn.disabled = false; }
    }, 1000);
  }, 300);
}

// ── Render principal ──────────────────────────────

export function renderPaginaCliente(p) {
  setState({ projCache: p });
  const t   = T[getLang()];
  const tH  = t.hero;
  const tC  = t.contacto;
  const tP  = t.privacidade;

  const tipoLabel = {
    cozinha:       '🍳 Cozinha',
    'casa-de-banho':'🚿 Casa de Banho',
    jardim:        '🌿 Jardim',
    pavimento:     '🪵 Pavimento',
    quarto:        '🛏 Quarto',
    sala:          '🛋 Sala',
  }[p.tipo] || (p.tipoOutro || p.tipo || '');

  const nome          = (p.nome||'').split(' ')[0] || p.nome || '';
  const prazoDate     = p.prazo ? new Date(p.prazo+'T23:59:59') : null;
  const prazoPassou   = prazoDate && prazoDate < new Date() && p.fase === 'proposta';
  const lang          = getLang();

  // ── Nav
  document.getElementById('cli-nav-links').innerHTML = `
    <a href="#wrap-galeria" class="nav-link">🖼 ${t.galeria.titulo}</a>
    <a href="#timeline"     class="nav-link">${t.timeline.titulo}</a>
    <a href="#orcamento"    class="nav-link">${tH.ctaOrcamento}</a>
    <a href="#contacto"     class="nav-link">${tC.titulo.split('.')[0]}</a>
    <button class="nav-lang" onclick="window.setLang(window._LANG==='pt'?'en':'pt')">${lang==='pt'?'EN':'PT'}</button>
    <button class="nav-pdf" id="btn-pdf" onclick="window.exportarPDF()">${tH.ctaPdf}</button>`;

  // ── Hero
  document.getElementById('cli-hero-content').innerHTML = `
    <div class="hero-eyebrow">${tH.eyebrow}</div>
    <h1 class="hero-titulo">${p.titulo || (tipoLabel + (p.localidade ? ' · ' + p.localidade : ''))}</h1>
    <div class="hero-para">${tH.para} <em>${nome}</em></div>
    <div class="hero-meta">
      ${p.localidade ? `<div class="hero-meta-item"><span class="hero-meta-dot">·</span>${p.localidade}</div>` : ''}
      ${tipoLabel    ? `<div class="hero-meta-item"><span class="hero-meta-dot">·</span>${tipoLabel}</div>` : ''}
      ${p.prazo      ? `<div class="hero-meta-item"><span class="hero-meta-dot">·</span>${tH.validade} ${new Date(p.prazo+'T12:00:00').toLocaleDateString('pt-PT')}</div>` : ''}
    </div>
    ${prazoPassou
      ? `<div class="hero-expirada">${tH.expirada}</div>`
      : `<div id="countdown-wrap" class="countdown-wrap"></div>`}
    <div class="hero-cta">
      <a href="#wrap-galeria" class="btn-hero-primary">🖼 Ver Projeto</a>
      <a href="#timeline"     class="btn-hero-ghost">📍 ${tH.ctaProgresso}</a>
      ${p.fase==='proposta'&&!prazoPassou
        ? `<a href="#aprovacao" class="btn-hero-approve">✓ ${tH.ctaAprovar}</a>` : ''}
    </div>`;

  if (p.prazo && !prazoPassou) iniciarCountdown(p.prazo);

  // ── Orçamento
  document.getElementById('sec-orcamento').innerHTML = renderOrcamento(p);

  // ── Timeline
  document.getElementById('sec-timeline').innerHTML = renderTimeline(p);

  // ── Notas
  const wrapNotas = document.getElementById('wrap-notas');
  if (p.notas) {
    document.getElementById('sec-notas').innerHTML = `<div class="notas-texto">${p.notas.replace(/\n/g,'<br>')}</div>`;
    if (wrapNotas) wrapNotas.style.display = '';
  } else {
    if (wrapNotas) wrapNotas.style.display = 'none';
  }

  // ── Galeria
  const wrapGal = document.getElementById('wrap-galeria');
  const secGal  = document.getElementById('sec-galeria');
  if ((p.imagens||[]).length) {
    secGal.innerHTML = p.imagens.map((src,i)=>`
      <div class="gal-item" onclick="window.abrirLightbox(${i})">
        <img src="${src}" alt="Imagem ${i+1}" loading="lazy">
        <div class="gal-overlay"><span>🔍</span></div>
      </div>`).join('');
    setState({ lbImgs: p.imagens });
    if (wrapGal) wrapGal.style.display = '';
  } else {
    if (wrapGal) wrapGal.style.display = 'none';
  }

  // ── Aprovação
  renderEstadoAprovacao(getState('projAtualId'), p.aprovacao);

  // ── Privacidade
  const secPriv = document.getElementById('privacidade-texto');
  if (secPriv)
    secPriv.innerHTML = `${tP.texto} <a href="mailto:helder.melo@leroymerlin.pt">${tP.contacto} helder.melo@leroymerlin.pt</a>`;

  // ── Animar barras
  requestAnimationFrame(() => {
    document.querySelectorAll('.orc-barra[data-pct]').forEach(el => {
      el.style.width = el.dataset.pct + '%';
    });
  });
}

// ── Lightbox ──────────────────────────────────────

export function abrirLightbox(idx) {
  const imgs = getState('lbImgs');
  if (!imgs.length) return;
  setState({ lbIdx: idx });
  document.getElementById('lightbox-img').src = imgs[idx];
  document.getElementById('lightbox-counter').textContent = `${idx+1} / ${imgs.length}`;
  document.getElementById('lightbox').classList.add('open');
}

export function fecharLightbox(e) {
  if (e && !e.target.classList.contains('lightbox') && !e.target.classList.contains('lightbox-close')) return;
  document.getElementById('lightbox').classList.remove('open');
}

export function lightboxNav(dir) {
  const imgs = getState('lbImgs');
  const idx  = ((getState('lbIdx')+dir)+imgs.length) % imgs.length;
  abrirLightbox(idx);
}

// ── Língua ────────────────────────────────────────

export function setLang(lang) {
  setState({ lang });
  window._LANG = lang;
  const cache = getState('projCache');
  if (cache) renderPaginaCliente(cache);
}
