// ════════════════════════════════════════════════
// cliente.js — Página Pública do Cliente · Projetos LM
// ════════════════════════════════════════════════

import { T }                                    from './i18n.js';
import { getState, setState, getLang }          from './state.js';
import { _db, registarVisita, aprovarClienteFirebase, carregarUm } from './firebase.js';
import { mostrarToast }                         from './ui.js';
import { doc, getDoc }                          from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

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
  // Estrutura actual: orc_* são valores únicos por categoria
  const n = v => parseFloat(String(v || '0').replace(',', '.')) || 0;
  let t = 0;
  t += n(p.orc_moveis);
  t += n(p.orc_tampos);
  t += n(p.orc_eletros);
  t += n(p.orc_acessorios);
  // Categorias livres (estrutura actual: {categoria, valor})
  (p.orcamento||[]).forEach(c => { t += n(c.valor); });
  // Compatibilidade retroactiva: estrutura antiga com arrays de itens com preço
  if (t === 0) {
    const s = a => (a||[]).forEach(i => { t += parseFloat(i.preco)||0; });
    s(p.tampos); s(p.eletros); s(p.acessorios);
    (p.extras   ||[]).forEach(c => s(c.itens));
    (p.orcamento||[]).forEach(c => s(c.itens));
  }
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

  addGrupo(cat.tampos,        p.elem_tampos);
  addGrupo(cat.eletros,       p.elem_eletros);
  addGrupo(cat.acessorios,    p.elem_acessorios);

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
  const tO   = T[getLang()].orcamento;
  const lang = getLang();

  // Cores — escala de verde do mais escuro ao mais claro
  const cores = ['#27500A','#3B6D11','#639922','#97C459','#C0DD97','#D8EABC'];

  // Construir secções — compatível com estrutura nova (orc_*) e antiga (arrays)
  const secoes = [];

  const addSec = (label, val) => {
    if (!label) return;
    const v = parseFloat(val) || 0;
    if (v > 0) secoes.push({ label, sub: v });
  };

  // Estrutura nova: valor único por campo
  const somaArray = arr => (arr||[]).reduce((a, i) => a + (parseFloat(i.preco)||0), 0);

  const vMoveis    = parseFloat(p.orc_moveis)    || somaArray(p.moveis);
  const vTampos    = parseFloat(p.orc_tampos)    || somaArray(p.tampos);
  const vEletros   = parseFloat(p.orc_eletros)   || somaArray(p.eletros);
  const vAcessorios= parseFloat(p.orc_acessorios)|| somaArray(p.acessorios);

  if (vMoveis)     addSec(lang === 'en' ? 'Fitted Furniture' : 'Móveis',           vMoveis);
  if (vTampos)     addSec(lang === 'en' ? 'Worktops'         : 'Tampos',           vTampos);
  if (vEletros)    addSec(lang === 'en' ? 'Appliances'       : 'Eletrodomésticos', vEletros);
  if (vAcessorios) addSec(lang === 'en' ? 'Accessories'      : 'Acessórios',       vAcessorios);

  // Categorias livres — estrutura nova (valor) e antiga (itens com preço)
  (p.orcamento||[]).forEach(c => {
    const v = parseFloat(c.valor) || somaArray(c.itens);
    addSec(c.categoria, v);
  });
  // Extras da estrutura antiga
  (p.extras||[]).forEach(c => addSec(c.categoria, somaArray(c.itens)));

  if (!secoes.length) return `<p class="sec-vazio">${tO.semItens}</p>`;

  const total    = secoes.reduce((a, s) => a + s.sub, 0);
  const maxSub   = Math.max(...secoes.map(s => s.sub), 1);

  const rows = secoes.map((s, i) => {
    const pct    = Math.round((s.sub / total)  * 100);
    const barPct = Math.round((s.sub / maxSub) * 100);
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

  // Bloco "O que está incluído"
  const inc = p.incluido || {};
  const opcoes = [
    { key: 'iva23',        pt: 'IVA à taxa legal em vigor (23%)',                en: 'VAT at legal rate (23%)' },
    { key: 'entrega',      pt: 'Entrega na morada do cliente',                   en: 'Delivery to client\'s address' },
    { key: 'loja',         pt: 'Levantamento em loja (pelo cliente)',             en: 'In-store collection (by client)' },
    { key: 'instalacao',   pt: 'Instalação incluída',                            en: 'Installation included' },
    { key: 'inst-cliente', pt: 'Instalação a cargo do cliente',                  en: 'Installation by client' },
    { key: 'iva6',         pt: 'IVA taxa reduzida 6% (mão de obra — renovação)', en: 'Reduced VAT 6% (labour — renovation)' },
  ];
  const packActivo = !!inc.pack;
  const ativas = opcoes.filter(o => inc[o.key]);

  const packHtml = packActivo ? `
    <div class="orc-pack-bloco">
      <div class="orc-pack-badge">
        <span class="orc-pack-icon">✦</span>
        ${lang === 'en' ? 'Pack Projeto discount (10%) already applied' : 'Desconto Pack Projeto (10%) já aplicado'}
      </div>
    </div>` : '';

  const incluidoHtml = (ativas.length || packActivo) ? `
    <div class="orc-incluido">
      ${packHtml}
      ${ativas.length ? `
        <div class="orc-incluido-titulo">${lang === 'en' ? 'What\'s included' : 'O que está incluído'}</div>
        <div class="orc-incluido-lista">
          ${ativas.map(o => `
            <div class="orc-incluido-item">
              <span class="orc-incluido-check">✓</span>
              <span>${lang === 'en' ? o.en : o.pt}</span>
            </div>`).join('')}
        </div>` : ''}
    </div>` : '';

  return `
    <div class="orc-total-card">
      <div class="orc-total-left">
        <span class="orc-total-lbl">${tO.total}</span>
        <div class="orc-total-linha"></div>
      </div>
      <span class="orc-total-val">${fmt(total)}</span>
    </div>
    <div class="orc-lista">${rows}</div>
    ${incluidoHtml}`;
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

  return marcosHtml + ocorrHtml;
}

// ── Aprovação ──────────────────────────────────────

export async function renderEstadoAprovacao(projetoId, aprovacao) {
  const sec = document.getElementById('sec-aprovacao');
  if (!sec) return;

  // Aprovado se: tem aprovacao.data OU fase >= aprovado
  const local = getState('projetos').find(x => x.id === projetoId);
  let aprovado = !!(aprovacao?.data)
    || (local?.fase && faseOrdem(local.fase) >= faseOrdem('aprovado'));

  // Verificar no Firebase se necessário
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
  if (!id) { alert('Erro: ID do projeto não encontrado.'); return; }
  const btn = document.getElementById('btn-aprovar-proj');
  if (btn) { btn.disabled = true; btn.textContent = 'A registar…'; }

  const agora = new Date();
  const data  = agora.toLocaleDateString('pt-PT');
  const hora  = String(agora.getHours()).padStart(2,'0') + ':' + String(agora.getMinutes()).padStart(2,'0');
  const aprovacao = { data, hora, origem: 'cliente' };

  try {
    await aprovarClienteFirebase(id, aprovacao);
    mostrarToast('✓ Proposta aprovada!', `${data} · ${hora}`);
    // Recarregar projecto actualizado e re-renderizar
    const pAtual = await carregarUm(id);
    if (pAtual) {
      setState({ projCache: pAtual });
      renderPaginaCliente(pAtual);
    } else {
      await renderEstadoAprovacao(id, aprovacao);
    }
  } catch (e) {
    console.error('Erro ao aprovar:', e);
    if (btn) { btn.disabled = false; btn.textContent = T[getLang()].aprovacao.btn; }
    alert('Erro ao registar aprovação. Por favor tente novamente.');
  }
}

// ── Notas — cartões fixos com datas dinâmicas ────────

function renderNotasCartoes(p) {
  const tN  = T[getLang()].notas.cartoes;
  const lang = getLang();

  // Data de validade formatada
  const prazoFmt = p.prazo
    ? new Date(p.prazo + 'T12:00:00').toLocaleDateString(lang === 'en' ? 'en-GB' : 'pt-PT')
    : null;

  // Data de entrega formatada
  const entregaFmt = p.entrega || (p.dataEntregaMat
    ? new Date(p.dataEntregaMat + 'T12:00:00').toLocaleDateString(lang === 'en' ? 'en-GB' : 'pt-PT')
    : null);

  const cartoes = [
    { ...tN.base },
    prazoFmt   ? { ...tN.validade,  texto: tN.validade.prefixo  + prazoFmt   + '.' } : null,
    entregaFmt ? { ...tN.entrega,   texto: tN.entrega.prefixo   + entregaFmt + '.' } : null,
    { ...tN.flex },
    { ...tN.transp },
  ].filter(Boolean);

  // Notas manuais — array de {titulo, texto} ou strings legadas
  const notasArr = Array.isArray(p.notas)
    ? p.notas.filter(n => n && (n.texto || typeof n === 'string'))
    : (p.notas ? [{ titulo: '', texto: p.notas }] : []);

  const notasExtra = notasArr.map(n => {
    const titulo = typeof n === 'string' ? '' : (n.titulo || '');
    const texto  = typeof n === 'string' ? n  : (n.texto  || '');
    return `
    <div class="nota-card nota-card-manual">
      <div class="nota-card-titulo">
        <span class="nota-card-icon">📌</span>
        ${titulo || (lang === 'en' ? 'Important Note' : 'Nota Importante')}
      </div>
      <p class="nota-card-texto">${texto.replace(/\n/g, '<br>')}</p>
    </div>`;
  }).join('');

  return `
    <div class="notas-grid">
      ${cartoes.map(c => `
        <div class="nota-card">
          <div class="nota-card-titulo">
            <span class="nota-card-icon">${c.icon}</span>
            ${c.titulo}
          </div>
          <p class="nota-card-texto">${c.texto}</p>
        </div>`).join('')}
      ${notasExtra}
    </div>`;
}

// ── Documentos ────────────────────────────────────

function renderDocumentos(docs, lang) {
  if (!docs.length) return '';
  return `
    <div class="docs-grid">
      ${docs.map(d => `
        <a href="${d.url}" target="_blank" rel="noopener noreferrer" class="doc-card">
          <div class="doc-card-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <div class="doc-card-info">
            <div class="doc-card-nome">${d.nome}</div>
            <div class="doc-card-hint">${lang === 'en' ? '↗ Open document' : '↗ Abrir documento'}</div>
          </div>
        </a>`).join('')}
    </div>`;
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
    <a href="#hero"           class="nav-link nav-link-inicio">↑</a>
    <a href="#wrap-galeria"   class="nav-link">${t.nav.galeria}</a>
    <a href="#wrap-elementos" class="nav-link">${t.nav.elementos}</a>
    <a href="#orcamento"      class="nav-link">${t.nav.orcamento}</a>
    <a href="#wrap-notas"     class="nav-link">${t.nav.notas}</a>
    <a href="#timeline"       class="nav-link">${t.nav.timeline}</a>
    <a href="#wrap-docs"      class="nav-link">${lang==='pt'?'Documentos':'Documents'}</a>
    <a href="#contacto"       class="nav-link">${t.nav.contacto}</a>
    <button class="nav-lang" onclick="window.setLang(window._LANG==='pt'?'en':'pt')">${lang==='pt'?'EN':'PT'}</button>`;

  // ── Hero — validade vs aprovado + estado da obra
  const faseEstados = {
    proposta:    null,
    retificacao: null,
    aprovado:    { icon: '✓', label: lang==='en' ? 'Approved' : 'Aprovado', cls: 'hero-estado-ok' },
    encomenda:   { icon: '📦', label: lang==='en' ? 'Materials ordered' : 'Materiais encomendados', cls: 'hero-estado-info' },
    entrega:     { icon: '🚚', label: lang==='en' ? 'Delivery scheduled' : 'Entrega agendada', cls: 'hero-estado-info' },
    montagem:    { icon: '🔧', label: lang==='en' ? 'Installation in progress' : 'Instalação em curso', cls: 'hero-estado-ativo' },
    concluido:   { icon: '🏠', label: lang==='en' ? 'Completed' : 'Concluído', cls: 'hero-estado-ok' },
  };
  const estadoAtual = faseEstados[p.fase];
  const estadoHtml  = estadoAtual
    ? `<div class="hero-estado ${estadoAtual.cls}">${estadoAtual.icon} ${estadoAtual.label}</div>` : '';

  // Datas no hero após aprovação
  const dataAprovacao = p.aprovacao?.data || null;
  const dataInstalacaoFmt = p.dataInstalacao
    ? new Date(p.dataInstalacao + 'T12:00:00').toLocaleDateString(lang === 'en' ? 'en-GB' : 'pt-PT')
    : null;

  const validadeHtml = jaAprovado
    ? `<div class="hero-meta-item"><span class="hero-meta-dot">·</span>${tH.aprovadoEm} ${dataAprovacao || (p.prazo ? new Date(p.prazo+'T12:00:00').toLocaleDateString('pt-PT') : '—')}</div>
       ${dataInstalacaoFmt ? `<div class="hero-meta-item"><span class="hero-meta-dot">·</span>${lang==='en'?'Installation':'Instalação'}: ${dataInstalacaoFmt}</div>` : ''}`
    : p.prazo
      ? `<div class="hero-meta-item"><span class="hero-meta-dot">·</span>${tH.validadeAte} ${new Date(p.prazo+'T12:00:00').toLocaleDateString('pt-PT')}</div>`
      : '';

  // Extrair só o nome do tipo (sem emoji) para o título 3D
  const tipoNome = tipoLabel.replace(/^\S+\s+/, ''); // Remove emoji

  document.getElementById('cli-hero-content').innerHTML = `
    <div class="hero-3d-block">
      <div class="hero-eyebrow">${tH.eyebrow}</div>
      <h1 class="hero-titulo">${tipoNome}</h1>
      <div class="hero-para">${tH.para} <em>${nome}</em></div>
      <div class="hero-meta">
        ${p.localidade ? `<div class="hero-meta-item"><span class="hero-meta-dot">·</span>${p.localidade}</div>` : ''}
        ${validadeHtml}
      </div>
      ${prazoPassou
        ? `<div class="hero-expirada">${tH.expirada}</div>`
        : jaAprovado ? '' : `<div id="countdown-wrap" class="countdown-wrap"></div>`}
      <div class="hero-cta">
        <a href="#timeline" class="btn-hero-primary">📍 ${tH.ctaProgresso}</a>
        ${faseOrdem(p.fase||'proposta') < faseOrdem('aprovado') && !prazoPassou
          ? `<a href="#aprovacao" class="btn-hero-approve">✓ ${tH.ctaAprovar}</a>` : ''}
      </div>
    </div>`;

  if (p.prazo && !prazoPassou && !jaAprovado) iniciarCountdown(p.prazo);

  // ── Títulos das secções (todos renderizados via JS para suportar tradução)
  const secTitulos = {
    'sec-header-galeria':   { num: '01', eyebrow: t.galeria.eyebrow,   titulo: t.galeria.titulo,   light: false },
    'sec-header-elementos': { num: '02', eyebrow: t.elementos.eyebrow, titulo: t.elementos.titulo, light: false },
    'sec-header-orcamento': { num: '03', eyebrow: t.orcamento.eyebrow, titulo: t.orcamento.titulo, light: true  },
    'sec-header-notas':     { num: '04', eyebrow: t.notas.eyebrow,     titulo: t.notas.titulo,     light: false },
    'sec-header-timeline':  { num: '05', eyebrow: t.timeline.eyebrow,  titulo: t.timeline.titulo,  light: true  },
    'sec-header-docs':      { num: '06', eyebrow: lang==='pt'?'Documentos':'Documents', titulo: lang==='pt'?'Plantas & Documentos':'Plans & Documents', light: false },
  };
  Object.entries(secTitulos).forEach(([id, s]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `
      <span class="sec-num${s.light?' sec-num-light':''}">${s.num}</span>
      <div>
        <div class="sec-eyebrow${s.light?' sec-eyebrow-light':''}">${s.eyebrow}</div>
        <h2 class="sec-titulo${s.light?' sec-titulo-light':''}">${s.titulo}</h2>
      </div>`;
  });

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

  // ── 04 Notas — cartões fixos com datas dinâmicas
  const wrapNotas = document.getElementById('wrap-notas');
  if (wrapNotas) {
    wrapNotas.style.display = '';
    document.getElementById('sec-notas').innerHTML = renderNotasCartoes(p);
  }

  // ── 05 Timeline
  document.getElementById('sec-timeline').innerHTML = renderTimeline(p);

  // ── 06 Documentos
  const wrapDocs = document.getElementById('wrap-docs');
  if (wrapDocs) {
    const docs = p.docs || [];
    if (docs.length) {
      wrapDocs.style.display = '';
      document.getElementById('sec-docs').innerHTML = renderDocumentos(docs, lang);
    } else {
      wrapDocs.style.display = 'none';
    }
  }

  // ── Aprovação
  renderEstadoAprovacao(getState('projAtualId'), p.aprovacao);

  // ── Email — visível via spans no HTML (imune ao Cloudflare)
  // Não é necessário injectar via JS — os spans .em-u/.em-a/.em-d estão no HTML

  // ── Privacidade
  const emailPriv = 'helder' + '.melo' + '\u0040' + 'leroymerlin' + '.pt';
  const secPriv = document.getElementById('privacidade-texto');
  if (secPriv)
    secPriv.innerHTML = `${tP.texto} <a href="mailto:${emailPriv}">${tP.contacto} ${emailPriv}</a>`;

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
