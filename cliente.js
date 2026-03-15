// ════════════════════════════════════════════════
// cliente.js — Página Pública do Cliente · Projetos LM
// ════════════════════════════════════════════════

import { T }                           from './i18n.js';
import { getState, setState, getLang } from './state.js';
import { _db, registarVisita }         from './firebase.js';
import { mostrarToast }                from './ui.js';
import { doc, getDoc, setDoc }         from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ── Helpers ──────────────────────────────────────

function fmt(v) {
  const n = parseFloat(v);
  return isNaN(n) ? '0,00 €'
    : n.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function faseOrdem(f) {
  return ['proposta','retificacao','aprovado','encomenda','entrega','montagem','concluido'].indexOf(f);
}

export function calcTotal(p) {
  let t = 0;
  const s = a => (a||[]).forEach(i => { t += parseFloat(i.preco)||0; });
  s(p.tampos); s(p.eletros); s(p.acessorios);
  (p.extras   ||[]).forEach(c => s(c.itens));
  (p.orcamento||[]).forEach(c => s(c.itens));
  return Math.max(0, t - (parseFloat(p.desconto)||0));
}

// Extrair nome completo: primeiro + último
function nomeCompleto(nome) {
  if (!nome) return '';
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 1) return partes[0] || '';
  return partes[0] + ' ' + partes[partes.length - 1];
}

// ── Countdown ─────────────────────────────────────

function iniciarCountdown(prazo) {
  const wrap = document.getElementById('countdown-wrap');
  if (!wrap) return;
  const fim = new Date(prazo + 'T23:59:59');
  function tick() {
    const diff = fim - new Date();
    if (diff <= 0) {
      wrap.innerHTML = `<div class="cd-expirada">${T[getLang()].hero.expirada}</div>`;
      return;
    }
    const d  = Math.floor(diff / 86400000);
    const h  = Math.floor((diff % 86400000) / 3600000);
    const m  = Math.floor((diff % 3600000)  / 60000);
    const s  = Math.floor((diff % 60000)    / 1000);
    const tH = T[getLang()].hero;
    wrap.innerHTML = `
      <div class="cd-label">${tH.countdown}</div>
      <div class="cd-grid">
        ${[[d,tH.dias],[h,tH.horas],[m,tH.minutos],[s,tH.segundos]].map(([n,l]) => `
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

// ── Galeria ───────────────────────────────────────

function renderGaleria(p) {
  const tG = T[getLang()].galeria;
  const imgs = p.imagens || [];
  if (!imgs.length) return `<p class="sec-vazio">${tG.semImagens}</p>`;
  return `<div class="gal-grid">
    ${imgs.map((src, i) => `
      <div class="gal-item" onclick="window.abrirLightbox(${i})">
        <img src="${src}" alt="Imagem ${i+1}" loading="lazy">
        <div class="gal-overlay"><span style="font-size:20px">🔍</span></div>
      </div>`).join('')}
  </div>`;
}

// ── Elementos do Projeto ──────────────────────────

function renderElementos(p) {
  const tE  = T[getLang()].elementos;
  const cat = tE.categorias;

  // Construir grupos de elementos com URL
  const grupos = [];

  const addGrupo = (label, itens) => {
    const validos = (itens||[]).filter(i => i.nome);
    if (validos.length) grupos.push({ label, itens: validos });
  };

  addGrupo(cat.moveis,        p.elem_moveis);
  addGrupo(cat.tampos,        p.elem_tampos);
  addGrupo(cat.eletros,       p.elem_eletros);
  addGrupo(cat.acessorios,    p.elem_acessorios);
  addGrupo(cat.pavimentos,    p.elem_pavimentos);
  addGrupo(cat.revestimentos, p.elem_revestimentos);
  addGrupo(cat.sanitarios,    p.elem_sanitarios);
  addGrupo(cat.iluminacao,    p.elem_iluminacao);
  addGrupo(cat.aquecimento,   p.elem_aquecimento);

  // Categorias livres de elementos
  (p.elem_extras||[]).forEach(cat => {
    const validos = (cat.itens||[]).filter(i => i.nome);
    if (validos.length) grupos.push({ label: cat.categoria, itens: validos });
  });

  if (!grupos.length) return `<p class="sec-vazio">${tE.semItens}</p>`;

  return grupos.map(g => `
    <div class="elem-grupo">
      <div class="elem-grupo-titulo">${g.label}</div>
      <div class="elem-lista">
        ${g.itens.map(i => `
          <div class="elem-item">
            <span class="elem-nome">${i.nome}</span>
            ${i.url
              ? `<a href="${i.url}" target="_blank" rel="noopener noreferrer" class="elem-link">${tE.verArtigo}</a>`
              : ''}
          </div>`).join('')}
      </div>
    </div>`).join('');
}

// ── Orçamento — layout gráfico ────────────────────

function renderOrcamento(p) {
  const tO    = T[getLang()].orcamento;
  const total = calcTotal(p);
  const desc  = parseFloat(p.desconto) || 0;

  // Cores do ramo verde — escala do mais escuro ao mais claro
  const cores = ['#27500A','#3B6D11','#639922','#97C459','#C0DD97','#D8EABC'];

  const secoes = [];
  const addSec = (label, itens) => {
    const sub = (itens||[]).reduce((a, i) => a + (parseFloat(i.preco)||0), 0);
    if (sub > 0) secoes.push({ label, sub });
  };

  addSec(tO.tampos    || 'Tampos',           p.tampos);
  addSec(tO.eletros   || 'Eletrodomésticos', p.eletros);
  addSec(tO.acessorios|| 'Acessórios',       p.acessorios);
  (p.orcamento||[]).forEach(c => addSec(c.categoria, c.itens));
  (p.extras   ||[]).forEach(c => addSec(c.categoria, c.itens));

  if (!secoes.length) return `<p class="sec-vazio">${tO.semItens}</p>`;

  const maxSub = Math.max(...secoes.map(s => s.sub), 1);
  const totalSec = secoes.reduce((a, s) => a + s.sub, 0);

  const rows = secoes.map((s, i) => {
    const pct    = Math.round((s.sub / totalSec) * 100);
    const barPct = Math.round((s.sub / maxSub)   * 100);
    const cor    = cores[Math.min(i, cores.length - 1)];
    return `
      <div class="orc-row">
        <div class="orc-cor" style="background:${cor}"></div>
        <div class="orc-body">
          <div class="orc-top">
            <span class="orc-nome">${s.label}</span>
            <div class="orc-direita">
              <span class="orc-pct">${pct}% ${tO.doTotal}</span>
              <span class="orc-val">${fmt(s.sub)}</span>
            </div>
          </div>
          <div class="orc-barra-bg">
            <div class="orc-barra" style="width:0%;background:${cor}" data-pct="${barPct}"></div>
          </div>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="orc-lista">${rows}</div>
    <div class="orc-total-card">
      <span class="orc-total-lbl">${tO.total}</span>
      <div class="orc-total-right">
        ${desc > 0 ? `<span class="orc-total-desc">${tO.desconto}: −${fmt(desc)}</span>` : ''}
        <span class="orc-total-val">${fmt(total)}</span>
      </div>
    </div>`;
}

// ── Timeline ──────────────────────────────────────

function gerarMarcos(p) {
  const fase   = p.fase || 'proposta';
  const ord    = faseOrdem(fase);
  const tTL    = T[getLang()].timeline;
  const m      = tTL.marcos;
  const temInt = (p.interacoes||[]).length > 0;

  const ok = f => ord >= faseOrdem(f);

  return [
    {
      label: m.planificado,
      done:  true,
      ativo: false,
    },
    {
      label: fase === 'retificacao' ? m.retificacao : m.analise,
      done:  ok('aprovado'),
      ativo: fase === 'proposta' || fase === 'retificacao',
      retif: fase === 'retificacao',
      apelo: (fase === 'proposta' || fase === 'retificacao')
        ? (fase === 'retificacao'
            ? tTL.apelo.retificacao
            : temInt ? tTL.apelo.comInteracoes : tTL.apelo.semInteracoes)
        : null,
    },
    {
      label: m.confirmado,
      done:  ok('aprovado'),
      ativo: fase === 'aprovado',
    },
    {
      label: m.preparacao,
      done:  ok('entrega'),
      ativo: fase === 'encomenda',
    },
    {
      label: m.entrega,
      done:  ok('montagem'),
      ativo: fase === 'entrega',
      data:  p.dataEntregaMat
        ? `${tTL.dataEntrega}: ${new Date(p.dataEntregaMat+'T12:00:00').toLocaleDateString('pt-PT')}`
        : null,
    },
    {
      label: m.instalacao,
      done:  ok('concluido'),
      ativo: fase === 'montagem',
      data:  p.dataInstalacao
        ? `${tTL.dataInstalacao}: ${new Date(p.dataInstalacao+'T12:00:00').toLocaleDateString('pt-PT')}`
        : null,
    },
    {
      label: m.conclusao,
      done:  fase === 'concluido',
      ativo: false,
      data:  p.dataConclusao
        ? `${tTL.dataConclusao}: ${new Date(p.dataConclusao+'T12:00:00').toLocaleDateString('pt-PT')}`
        : null,
    },
  ];
}

function renderTimeline(p) {
  // Ocorrências activas
  const ocorrAtivas = (p.ocorrencias||[]).filter(o => o.estado !== 'resolvida');
  const tOc = T[getLang()].ocorrencias;
  const ocorrHtml = ocorrAtivas.map(o => `
    <div class="tl-ocorrencia">
      <div class="tl-ocorrencia-tipo">⚠️ ${tOc.tipos[o.tipo] || o.tipo}</div>
      <div class="tl-ocorrencia-desc">${o.descricao || ''}</div>
      <div class="tl-ocorrencia-estado">${tOc.emResolucao}</div>
    </div>`).join('');

  const marcosHtml = gerarMarcos(p).map(m => `
    <div class="tl-item${m.done?' done':''}${m.ativo?' ativo':''}${m.retif?' retif':''}">
      <div class="tl-dot"></div>
      <div class="tl-content">
        <div class="tl-label">${m.label}</div>
        ${m.data  ? `<div class="tl-data">${m.data}</div>` : ''}
        ${m.apelo ? `<span class="tl-apelo${m.retif?' tl-apelo-retif':''}">${m.apelo}</span>` : ''}
      </div>
    </div>`).join('');

  return ocorrHtml + marcosHtml;
}

// ── Aprovação ──────────────────────────────────────

export async function renderEstadoAprovacao(projetoId, aprovacao) {
  const sec = document.getElementById('sec-aprovacao');
  if (!sec) return;

  let aprovado = aprovacao?.data;
  if (!aprovado) {
    const local = getState('projetos').find(x => x.id === projetoId);
    aprovado = local?.fase && faseOrdem(local.fase) >= faseOrdem('aprovado');
  }
  if (!aprovado && projetoId) {
    try {
      const snap = await getDoc(doc(_db, 'projetos', projetoId));
      if (snap.exists() && faseOrdem(snap.data().fase) >= faseOrdem('aprovado')) {
        aprovado = true;
        if (!aprovacao?.data) aprovacao = snap.data().aprovacao || null;
      }
    } catch (_) {}
  }

  const tA = T[getLang()].aprovacao;

  if (aprovado) {
    const dataTexto = aprovacao?.data
      ? `${tA.aprovadaEm}${aprovacao.data}${aprovacao.hora ? ' às ' + aprovacao.hora : ''}`
      : tA.aprovada;
    sec.innerHTML = `
      <div class="aprov-wrap">
        ${aprovacao?.origem === 'cliente' ? `
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
  const hora  = String(agora.getHours()).padStart(2,'0') + ':' + String(agora.getMinutes()).padStart(2,'0');

  try {
    const ref  = doc(_db, 'projetos', id);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const p     = snap.data();
      p.aprovacao = { data, hora, origem: 'cliente' };
      p.fase      = 'aprovado';
      await setDoc(ref, p);
    }
    await renderEstadoAprovacao(id, { data, hora, origem: 'cliente' });
    setTimeout(async () => {
      try {
        const s = await getDoc(doc(_db, 'projetos', id));
        if (s.exists()) renderPaginaCliente(s.data());
      } catch (_) {}
    }, 1200);
    mostrarToast('✓ Proposta aprovada!', `${data} · ${hora}`);
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = T[getLang()].aprovacao.btn; }
    alert('Erro ao registar. Tente novamente.');
  }
}

// ── Render principal ──────────────────────────────

export function renderPaginaCliente(p) {
  setState({ projCache: p });
  const t   = T[getLang()];
  const tH  = t.hero;
  const tC  = t.contacto;
  const tP  = t.privacidade;
  const lang = getLang();

  const nome = nomeCompleto(p.nome);

  const tipoLabel = {
    cozinha:           '🍳 Cozinha',
    'casa-de-banho':   '🚿 Casa de Banho',
    roupeiro:          '🚪 Roupeiro',
    'renovacao-parcial':'🔨 Renovação Parcial',
    aquecimento:       '🔥 Aquecimento',
  }[p.tipo] || (p.tipoOutro || p.tipo || '');

  const prazoDate   = p.prazo ? new Date(p.prazo + 'T23:59:59') : null;
  const prazoPassou = prazoDate && prazoDate < new Date() && faseOrdem(p.fase) < faseOrdem('aprovado');
  const jaAprovado  = faseOrdem(p.fase || 'proposta') >= faseOrdem('aprovado');

  // ── Nav
  document.getElementById('cli-nav-links').innerHTML = `
    <a href="#wrap-galeria"   class="nav-link">${t.nav.galeria}</a>
    <a href="#wrap-elementos" class="nav-link">${t.nav.elementos}</a>
    <a href="#orcamento"      class="nav-link">${t.nav.orcamento}</a>
    <a href="#wrap-notas"     class="nav-link">${t.nav.notas}</a>
    <a href="#timeline"       class="nav-link">${t.nav.timeline}</a>
    <a href="#contacto"       class="nav-link">${t.nav.contacto}</a>
    <button class="nav-lang" onclick="window.setLang(window._LANG==='pt'?'en':'pt')">${lang==='pt'?'EN':'PT'}</button>`;

  // ── Hero — validade vs aprovado
  const validadeHtml = jaAprovado && p.aprovacao?.data
    ? `<div class="hero-meta-item"><span class="hero-meta-dot">·</span>${tH.aprovadoEm} ${p.aprovacao.data}</div>`
    : p.prazo
      ? `<div class="hero-meta-item"><span class="hero-meta-dot">·</span>${tH.validadeAte} ${new Date(p.prazo+'T12:00:00').toLocaleDateString('pt-PT')}</div>`
      : '';

  document.getElementById('cli-hero-content').innerHTML = `
    <div class="hero-eyebrow">${tH.eyebrow}</div>
    <h1 class="hero-titulo">${tipoLabel}</h1>
    <div class="hero-para">${tH.para} <em>${nome}</em></div>
    <div class="hero-meta">
      ${tipoLabel ? `<div class="hero-meta-item"><span class="hero-meta-dot">·</span>${p.localidade || ''}</div>` : ''}
      ${validadeHtml}
    </div>
    ${prazoPassou
      ? `<div class="hero-expirada">${tH.expirada}</div>`
      : jaAprovado ? '' : `<div id="countdown-wrap" class="countdown-wrap"></div>`}
    <div class="hero-cta">
      <a href="#timeline" class="btn-hero-primary">📍 ${tH.ctaProgresso}</a>
      ${faseOrdem(p.fase||'proposta') < faseOrdem('aprovado') && !prazoPassou
        ? `<a href="#aprovacao" class="btn-hero-approve">✓ ${tH.ctaAprovar}</a>` : ''}
    </div>`;

  if (p.prazo && !prazoPassou && !jaAprovado) iniciarCountdown(p.prazo);

  // ── 01 Galeria
  const wrapGal = document.getElementById('wrap-galeria');
  if (wrapGal) {
    document.getElementById('sec-galeria').innerHTML = renderGaleria(p);
    setState({ lbImgs: p.imagens || [] });
  }

  // ── 02 Elementos
  const wrapElem = document.getElementById('wrap-elementos');
  if (wrapElem) {
    document.getElementById('sec-elementos').innerHTML = renderElementos(p);
  }

  // ── 03 Orçamento
  document.getElementById('sec-orcamento').innerHTML = renderOrcamento(p);

  // ── 04 Notas
  const wrapNotas = document.getElementById('wrap-notas');
  if (p.notas) {
    document.getElementById('sec-notas').innerHTML =
      `<div class="notas-texto">${p.notas.replace(/\n/g, '<br>')}</div>`;
    if (wrapNotas) wrapNotas.style.display = '';
  } else {
    if (wrapNotas) wrapNotas.style.display = 'none';
  }

  // ── 05 Timeline
  document.getElementById('sec-timeline').innerHTML = renderTimeline(p);

  // ── Aprovação
  renderEstadoAprovacao(getState('projAtualId'), p.aprovacao);

  // ── Privacidade
  const secPriv = document.getElementById('privacidade-texto');
  if (secPriv)
    secPriv.innerHTML = `${tP.texto} <a href="mailto:helder.melo@leroymerlin.pt">${tP.contacto} helder.melo@leroymerlin.pt</a>`;

  // ── Animar barras de orçamento
  requestAnimationFrame(() => {
    document.querySelectorAll('.orc-barra[data-pct]').forEach(el => {
      setTimeout(() => { el.style.width = el.dataset.pct + '%'; }, 100);
    });
  });
}

// ── Lightbox ──────────────────────────────────────

export function abrirLightbox(idx) {
  const imgs = getState('lbImgs');
  if (!imgs.length) return;
  setState({ lbIdx: idx });
  document.getElementById('lightbox-img').src = imgs[idx];
  document.getElementById('lightbox-counter').textContent = `${idx + 1} / ${imgs.length}`;
  document.getElementById('lightbox').classList.add('open');
}

export function fecharLightbox(e) {
  if (e && !e.target.classList.contains('lightbox') && !e.target.classList.contains('lb-close')) return;
  document.getElementById('lightbox').classList.remove('open');
}

export function lightboxNav(dir) {
  const imgs = getState('lbImgs');
  const idx  = ((getState('lbIdx') + dir) + imgs.length) % imgs.length;
  abrirLightbox(idx);
}

// ── Língua ─────────────────────────────────────────

export function setLang(lang) {
  setState({ lang });
  window._LANG = lang;
  const cache = getState('projCache');
  if (cache) renderPaginaCliente(cache);
}
