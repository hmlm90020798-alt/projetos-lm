// ════════════════════════════════════════════════
// cliente.js — Página Pública do Cliente · Projetos LM
// ════════════════════════════════════════════════

import { T }                                    from './i18n.js';
import { getState, setState, getLang }          from './state.js';
import { _db, registarVisita, aprovarClienteFirebase, carregarUm,
         enviarMensagemCliente, carregarMensagens } from './firebase.js';
import { mostrarToast }                         from './ui.js';
import { doc, getDoc }                          from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { esc, safeUrl, nl2br }                  from './sanitize.js';

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
        ${[[d,'dias'],[h,'h'],[m,'m'],[s,'s']].map(([n,l],i) =>
          `${i > 0 ? '<span class="cd-sep">:</span>' : ''}` +
          `<div class="cd-unit">` +
            `<div class="cd-num">${String(n).padStart(2,'0')}</div>` +
            `<div class="cd-lbl">${l}</div>` +
          `</div>`
        ).join('')}
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

// renderElementos mantida internamente mas não chamada directamente
function renderElementos(p) { return ''; }

// ── Orçamento + Elementos — secção unificada ────────

function renderOrcamento(p) {
  const tO   = T[getLang()].orcamento;
  const tE   = T[getLang()].elementos;
  const lang = getLang();

  const cores = ['#27500A','#3B6D11','#639922','#97C459','#C0DD97','#D8EABC'];
  const somaArray = arr => (arr||[]).reduce((a, i) => a + (parseFloat(i.preco)||0), 0);
  const n = v => parseFloat(String(v||'0').replace(',','.')) || 0;

  // ── Construir categorias unificadas ──
  const cats = [];

  const addCat = (label, val, desc, artigos) => {
    const v = parseFloat(val) || 0;
    if (v > 0) cats.push({ label, val: v, desc: desc || '', artigos: artigos || [] });
  };

  // Elementos fixos — juntar artigos com valor
  const elemTampos    = (p.elem_tampos    || []).filter(i => i.nome);
  const elemEletros   = (p.elem_eletros   || []).filter(i => i.nome);
  const elemAcessorios= (p.elem_acessorios|| []).filter(i => i.nome);

  const vMoveis    = n(p.orc_moveis)    || somaArray(p.moveis);
  const vTampos    = n(p.orc_tampos)    || somaArray(p.tampos);
  const vEletros   = n(p.orc_eletros)   || somaArray(p.eletros);
  const vAcessorios= n(p.orc_acessorios)|| somaArray(p.acessorios);

  if (vMoveis)     addCat(lang==='en'?'Fitted Furniture':'Móveis',           vMoveis,     p.orc_moveis_desc    || '', []);
  if (vTampos)     addCat(lang==='en'?'Worktops'        :'Tampos',           vTampos,     p.orc_tampos_desc    || '', elemTampos);
  if (vEletros)    addCat(lang==='en'?'Appliances'      :'Eletrodomésticos', vEletros,    p.orc_eletros_desc   || '', elemEletros);
  if (vAcessorios) addCat(lang==='en'?'Accessories'     :'Acessórios',       vAcessorios, p.orc_acessorios_desc|| '', elemAcessorios);

  // Categorias livres — cruzar orcamento[] com elem_extras[]
  (p.orcamento||[]).forEach(c => {
    const v = n(c.valor) || somaArray(c.itens);
    // Procurar artigos correspondentes em elem_extras
    const elemExtra = (p.elem_extras||[]).find(e => e.categoria === c.categoria);
    const artigos = elemExtra
      ? (elemExtra.itens||[]).filter(i=>i.nome)
      : (c.itens||[]).filter(i=>i.nome);
    cats.push({ label: c.categoria, val: v, desc: c.desc || '', artigos });
  });
  (p.extras||[]).forEach(c => {
    const v = somaArray(c.itens);
    if (v > 0) cats.push({ label: c.categoria, val: v, desc: '', artigos: (c.itens||[]).filter(i=>i.nome) });
  });

  // elem_extras sem entrada no orcamento — mostrar só artigos
  (p.elem_extras||[]).forEach(c => {
    const validos = (c.itens||[]).filter(i=>i.nome);
    if (validos.length && !cats.find(cat=>cat.label===c.categoria)) {
      cats.push({ label: c.categoria, val: 0, desc: '', artigos: validos });
    }
  });

  if (!cats.length) return `<p class="sec-vazio">${tO.semItens}</p>`;

  const total  = cats.reduce((a, c) => a + c.val, 0);
  const maxVal = Math.max(...cats.map(c => c.val), 1);

  const rows = cats.map((c, i) => {
    const pct    = total > 0 ? Math.round((c.val / total) * 100) : 0;
    const barPct = Math.round((c.val / maxVal) * 100);
    const cor    = cores[Math.min(i, cores.length - 1)];

    const temArtigos = c.artigos.length > 0;
    const artigosId  = `orc-artigos-${i}`;

    const artigosHtml = temArtigos ? `
      <div class="orc-artigos" id="${artigosId}">
        ${c.artigos.map(a => `
          <div class="orc-artigo-item">
            <span class="orc-artigo-nome">${esc(a.nome)}</span>
            <div class="orc-artigo-direita">
              ${a.preco && parseFloat(a.preco) > 0 ? `<span class="orc-artigo-preco">${fmt(a.preco)}</span>` : ''}
              ${a.url ? `<a href="${safeUrl(a.url)}" target="_blank" rel="noopener noreferrer" class="elem-link">${lang==='en'?'View':'VER ARTIGO'}</a>` : ''}
            </div>
          </div>`).join('')}
      </div>` : '';

    return `
      <div class="orc-row${temArtigos ? ' orc-row-toggle' : ''}" ${temArtigos ? `onclick="window._orcToggle(this,'${artigosId}')"` : ''}>
        <div class="orc-cor" style="background:${cor}"></div>
        <div class="orc-body">
          <div class="orc-top">
            <div class="orc-nome-wrap">
              <span class="orc-nome">${esc(c.label)}</span>
              ${c.desc ? `<span class="orc-desc">${esc(c.desc)}</span>` : ''}
            </div>
            <div class="orc-direita">
              ${c.val > 0 ? `<span class="orc-pct">${pct}% ${tO.doTotal}</span>
              <span class="orc-val">${fmt(c.val)}</span>` : ''}
              ${temArtigos ? `<span class="orc-toggle-ic">›</span>` : ''}
            </div>
          </div>
          ${c.val > 0 ? `<div class="orc-barra-bg"><div class="orc-barra" style="width:0%;background:${cor}" data-pct="${barPct}"></div></div>` : ''}
          ${artigosHtml}
        </div>
      </div>`;
  }).join('');

  // Bloco incluído
  const inc = p.incluido || {};
  const opcoes = [
    { key:'iva23',       pt:'IVA à taxa legal em vigor (23%)',                en:'VAT at legal rate (23%)' },
    { key:'entrega',     pt:'Entrega na morada do cliente',                   en:'Delivery to client\'s address' },
    { key:'loja',        pt:'Levantamento em loja (pelo cliente)',             en:'In-store collection (by client)' },
    { key:'instalacao',  pt:'Instalação incluída',                            en:'Installation included' },
    { key:'inst-cliente',pt:'Instalação a cargo do cliente',                  en:'Installation by client' },
    { key:'iva6',        pt:'IVA taxa reduzida 6% (mão de obra — renovação)', en:'Reduced VAT 6% (labour — renovation)' },
  ];
  const packActivo = !!inc.pack;
  const ativas = opcoes.filter(o => inc[o.key]);

  const packHtml = packActivo ? `
    <div class="orc-pack-bloco">
      <div class="orc-pack-badge"><span class="orc-pack-icon">✦</span>
        ${lang==='en'?'Pack Projeto discount (10%) already applied':'Desconto Pack Projeto (10%) já aplicado'}
      </div>
    </div>` : '';

  const incluidoHtml = (ativas.length || packActivo) ? `
    <div class="orc-incluido">
      ${packHtml}
      ${ativas.length ? `
        <div class="orc-incluido-titulo">${lang==='en'?'What\'s included':'O que está incluído'}</div>
        <div class="orc-incluido-lista">
          ${ativas.map(o=>`
            <div class="orc-incluido-item">
              <span class="orc-incluido-check">✓</span>
              <span>${lang==='en'?o.en:o.pt}</span>
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
  const fase   = p.fase || 'proposta';
  const lang   = getLang();
  const tOc    = T[lang].ocorrencias;
  const jaAprov= faseOrdem(fase) >= faseOrdem('aprovado');

  // Ocorrências activas
  const ocorrAtivas = (p.ocorrencias||[]).filter(o => o.estado !== 'resolvida');
  const ocorrHtml = ocorrAtivas.map(o => `
    <div class="tl-ocorrencia">
      <div class="tl-ocorrencia-tipo">⚠️ ${esc(tOc.tipos[o.tipo] || o.tipo)}</div>
      <div class="tl-ocorrencia-desc">${esc(o.descricao)}</div>
      <div class="tl-ocorrencia-estado">${tOc.emResolucao}</div>
    </div>`).join('');

  // Botões de acção por fase
  function botoesAcao(marcFase) {
    if (marcFase === 'analise' && !jaAprov) {
      return `
        <div class="tl-acoes">
          <button class="tl-btn tl-btn-primary" onclick="window.aprovarProposta()">
            ✓ Aprovar Proposta
          </button>
          <a href="#reclamacao" class="tl-btn tl-btn-secondary">
            ↩ Solicitar Ajustes
          </a>
        </div>`;
    }
    if (marcFase === 'entrega' && fase === 'entrega') {
      return `
        <div class="tl-acoes">
          <button class="tl-btn tl-btn-primary" onclick="window._confirmarEntrega()">
            ✓ Confirmar Entrega
          </button>
          <a href="#reclamacao" class="tl-btn tl-btn-secondary">
            ⚠ Reclamar
          </a>
        </div>`;
    }
    if (marcFase === 'instalacao' && fase === 'montagem') {
      return `
        <div class="tl-acoes">
          <button class="tl-btn tl-btn-primary" onclick="window._confirmarInstalacao()">
            ✓ Confirmar Instalação
          </button>
          <a href="#reclamacao" class="tl-btn tl-btn-secondary">
            ⚠ Reclamar
          </a>
        </div>`;
    }
    if (marcFase === 'conclusao' && fase === 'concluido') {
      return `
        <div class="tl-acoes">
          <a href="#reclamacao" class="tl-btn tl-btn-secondary">
            ⚠ Reclamar
          </a>
        </div>`;
    }
    return '';
  }

  const marcosHtml = gerarMarcos(p).map(m => {
    // Determinar a "chave" da fase para os botões
    const faseKey = m.label === T[lang].timeline.marcos.analise   ? 'analise'
                  : m.label === T[lang].timeline.marcos.retificacao? 'analise'
                  : m.label === T[lang].timeline.marcos.entrega    ? 'entrega'
                  : m.label === T[lang].timeline.marcos.instalacao ? 'instalacao'
                  : m.label === T[lang].timeline.marcos.conclusao  ? 'conclusao'
                  : null;

    const acoes = faseKey ? botoesAcao(faseKey) : '';

    return `
    <div class="tl-item${m.done?' done':''}${m.ativo?' ativo':''}${m.retif?' retif':''}">
      <div class="tl-dot"></div>
      <div class="tl-content">
        <div class="tl-label">${m.label}</div>
        ${m.data  ? `<div class="tl-data">${m.data}</div>` : ''}
        ${m.apelo ? `<span class="tl-apelo${m.retif?' tl-apelo-retif':''}">${m.apelo}</span>` : ''}
        ${acoes}
      </div>
    </div>`;
  }).join('');

  return marcosHtml + ocorrHtml;
}

// Confirmações de entrega e instalação
window._confirmarEntrega = async function() {
  const id = getState('projAtualId');
  if (!id) return;
  if (!confirm('Confirma a recepção da mercadoria?')) return;
  try {
    const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    await updateDoc(doc(_db,'projetos',id), { fase: 'montagem', dataConfirmacaoEntrega: new Date().toLocaleDateString('pt-PT') });
    mostrarToast('✓ Entrega confirmada!', 'Aguarde contacto para agendamento da instalação.');
    const pAtual = await carregarUm(id);
    if (pAtual) { setState({ projCache: pAtual }); renderPaginaCliente(pAtual); }
  } catch(e) { alert('Erro ao confirmar. Tente novamente.'); }
};

window._confirmarInstalacao = async function() {
  const id = getState('projAtualId');
  if (!id) return;
  if (!confirm('Confirma a conclusão da instalação?')) return;
  try {
    const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    await updateDoc(doc(_db,'projetos',id), { fase: 'concluido', dataConclusao: new Date().toLocaleDateString('pt-PT') });
    mostrarToast('✓ Instalação confirmada!', 'Obrigado pela confiança. O projeto está concluído.');
    const pAtual = await carregarUm(id);
    if (pAtual) { setState({ projCache: pAtual }); renderPaginaCliente(pAtual); }
  } catch(e) { alert('Erro ao confirmar. Tente novamente.'); }
};

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

  // Secção de aprovação separada removida — botão integrado na timeline
  sec.style.display = 'none';
  sec.closest('section')?.style && (sec.closest('section').style.display = 'none');
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
      <p class="nota-card-texto">${nl2br(texto)}</p>
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
          <p class="nota-card-texto">${nl2br(c.texto)}</p>
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
        <a href="${safeUrl(d.url)}" target="_blank" rel="noopener noreferrer" class="doc-card">
          <div class="doc-card-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <div class="doc-card-info">
            <div class="doc-card-nome">${esc(d.nome)}</div>
            <div class="doc-card-hint">${lang === 'en' ? '↗ Open document' : '↗ Abrir documento'}</div>
          </div>
        </a>`).join('')}
    </div>`;
}

// ── Render principal ──────────────────────────────


// ── Mensagens do Cliente ─────────────────────────
// Sistema de comunicação direto entre cliente e Hélder Melo

const MSG_POR_PAGINA = 10;

// Cache de mensagens em memória para paginação sem re-fetch
let _msgsCache = [];

function _renderMsgItem(m, lang) {
  const isHM   = m.origem === 'hm';
  const tsDate = m.ts?.toDate ? m.ts.toDate().toLocaleDateString('pt-PT') : '';
  const tsTime = m.ts?.toDate ? m.ts.toDate().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : '';
  return `
    <div class="msg-item ${isHM ? 'msg-item-hm' : 'msg-item-cliente'}">
      <div class="msg-avatar">${isHM ? 'HM' : '👤'}</div>
      <div class="msg-balao">
        <div class="msg-origem">${isHM ? 'Hélder Melo' : (lang === 'en' ? 'You' : 'Você')}</div>
        <div class="msg-texto">${nl2br(m.texto)}</div>
        ${tsDate ? `<div class="msg-ts">${tsDate} · ${tsTime}</div>` : ''}
      </div>
    </div>`;
}

function _renderListaMsgs(wrap, msgsVisiveis, totalMsgs, lang) {
  const anteriorCount = totalMsgs - msgsVisiveis.length;
  const verMaisHtml = anteriorCount > 0
    ? `<div class="msg-ver-mais-wrap">
         <button class="btn-msg-ver-mais" onclick="window._verMaisMsgs()">
           ↑ ${lang === 'en' ? `See ${anteriorCount} earlier message${anteriorCount > 1 ? 's' : ''}` : `Ver ${anteriorCount} mensagem${anteriorCount > 1 ? 's' : ''} anterior${anteriorCount > 1 ? 'es' : ''}`}
         </button>
       </div>`
    : '';
  wrap.innerHTML = verMaisHtml + msgsVisiveis.map(m => _renderMsgItem(m, lang)).join('');
  // Scroll para o fim apenas se não há "ver mais" (primeira carga mostra últimas)
  if (!verMaisHtml) wrap.scrollTop = wrap.scrollHeight;
}

// Quantas mensagens estão actualmente visíveis
let _msgsVisiveis = MSG_POR_PAGINA;

// Expor globalmente para o onclick inline
window._verMaisMsgs = function() {
  const wrap = document.getElementById('sec-mensagens');
  if (!wrap || !_msgsCache.length) return;
  _msgsVisiveis = Math.min(_msgsVisiveis + MSG_POR_PAGINA, _msgsCache.length);
  const lang = getLang();
  const slice = _msgsCache.slice(_msgsCache.length - _msgsVisiveis);
  _renderListaMsgs(wrap, slice, _msgsCache.length, lang);
  // Scroll para o topo do bloco carregado (primeira mensagem nova)
  const primeiraNova = wrap.querySelector('.msg-ver-mais-wrap + .msg-item');
  if (primeiraNova) primeiraNova.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

export async function renderMensagens(projId, forcarScroll = false) {
  const wrap = document.getElementById('sec-mensagens');
  if (!wrap) return;

  wrap.innerHTML = '<div class="msg-loading">A carregar mensagens…</div>';

  const msgs = await carregarMensagens(projId);
  const lang = getLang();

  // Guardar cache e reiniciar contagem visível
  _msgsCache     = msgs;
  _msgsVisiveis  = MSG_POR_PAGINA;

  if (!msgs.length) {
    wrap.innerHTML = `
      <div class="msg-vazio">
        <div class="msg-vazio-icon">💬</div>
        <p>${lang === 'en' ? 'No messages yet. Send us a question or comment below.' : 'Ainda sem mensagens. Envie-nos uma dúvida ou comentário.'}</p>
      </div>`;
    return;
  }

  // Mostrar as últimas MSG_POR_PAGINA mensagens
  const slice = msgs.slice(msgs.length - _msgsVisiveis);
  _renderListaMsgs(wrap, slice, msgs.length, lang);

  // Scroll para o fim após envio de mensagem nova
  if (forcarScroll) wrap.scrollTop = wrap.scrollHeight;
}

export async function enviarMensagem() {
  const projId = getState('projAtualId');
  const input  = document.getElementById('msg-input');
  if (!projId || !input) return;

  const texto = input.value.trim();
  if (!texto) return;

  const btn = document.getElementById('btn-enviar-msg');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  input.disabled = true;

  try {
    await enviarMensagemCliente(projId, texto);
    input.value = '';
    await renderMensagens(projId, true); // forcarScroll após envio
    mostrarToast('✓ Mensagem enviada', 'Hélder Melo responderá em breve.');
  } catch (e) {
    mostrarToast('⚠️ Erro ao enviar', 'Tente novamente.');
    console.error(e);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = getLang() === 'en' ? 'Send' : 'Enviar'; }
    input.disabled = false;
    input.focus();
  }
}


// ── Notificações do cliente ───────────────────────
// Compara estado atual com o que o cliente viu na última visita.
// Guarda timestamps no localStorage — funciona no mesmo browser/dispositivo.

const LS_VISTO_MSGS   = id => `lm_visto_msgs_${id}`;
const LS_VISTO_PROJ   = id => `lm_visto_proj_${id}`;

async function verificarNotificacoesCliente(projId, p) {
  try {
    // ── 1. Mensagens novas do Hélder Melo
    const msgs      = await carregarMensagens(projId);
    const msgsHM    = msgs.filter(m => m.origem === 'hm');
    const ultimaMsg = msgsHM.length ? msgsHM[msgsHM.length - 1] : null;
    const ultimaMsgTs = ultimaMsg?.ts?.toMillis?.() || 0;
    const vistoMsgsTs = parseInt(localStorage.getItem(LS_VISTO_MSGS(projId)) || '0', 10);

    if (ultimaMsgTs > vistoMsgsTs) {
      // Marcar como visto IMEDIATAMENTE — não esperar pelo clique
      // Assim na próxima abertura não volta a notificar
      localStorage.setItem(LS_VISTO_MSGS(projId), ultimaMsgTs.toString());

      // Mostrar notificação clicável
      setTimeout(() => mostrarNotifCliente(
        '💬 Tem uma resposta',
        'Hélder Melo respondeu à sua mensagem.',
        () => document.getElementById('mensagens')?.scrollIntoView({ behavior: 'smooth' })
      ), 1200);
      return; // uma notificação de cada vez
    }

    // ── 2. Proposta atualizada
    const projTs    = p.dataModificacao ? new Date(p.dataModificacao).getTime() : 0;
    const vistoProj = parseInt(localStorage.getItem(LS_VISTO_PROJ(projId)) || '0', 10);

    // Só notifica se já visitou antes (vistoProj > 0) e há atualização nova
    if (projTs > 0 && vistoProj > 0 && projTs > vistoProj) {
      setTimeout(() => mostrarNotifCliente(
        '📋 Proposta atualizada',
        'A sua proposta foi revista. Consulte as novidades.',
        () => document.getElementById('hero')?.scrollIntoView({ behavior: 'smooth' })
      ), 1200);
    }

    // Registar SEMPRE o timestamp desta visita — mesmo que não haja notificação
    // Assim na próxima abertura compara corretamente
    const tsParaGuardar = projTs > 0 ? projTs : Date.now();
    localStorage.setItem(LS_VISTO_PROJ(projId), tsParaGuardar.toString());

  } catch (_) {}
}

function mostrarNotifCliente(titulo, sub, onClicar) {
  const toast = document.getElementById('toast-notif');
  if (!toast) return;

  const tTitulo = document.getElementById('toast-titulo');
  const tSub    = document.getElementById('toast-sub');
  const tIco    = document.getElementById('toast-ico');

  if (tTitulo) tTitulo.textContent = titulo;
  if (tSub)    tSub.textContent    = sub;
  if (tIco)    tIco.textContent    = titulo.split(' ')[0]; // emoji

  toast.classList.add('show');
  toast.style.cursor = 'pointer';

  // Remover listener anterior se existir
  if (toast._notifHandler) toast.removeEventListener('click', toast._notifHandler);

  toast._notifHandler = () => {
    toast.classList.remove('show');
    if (onClicar) onClicar();
    // Marcar msgs como vistas ao clicar
    const projId = getState('projAtualId');
    if (projId) {
      const msgs = document.querySelectorAll('.msg-item-hm');
      if (msgs.length) {
        // Aproximação: usar timestamp atual como "visto"
        // Já marcado como visto quando a notificação foi detectada
      }
    }
  };
  toast.addEventListener('click', toast._notifHandler);

  // Auto-fechar após 6 segundos
  setTimeout(() => toast.classList.remove('show'), 6000);
}

export function renderPaginaCliente(p) {
  setState({ projCache: p });

  // Aplicar tema visual — 'escuro' (default) | 'studio' | 'classic'
  const viewCliente = document.getElementById('view-cliente');
  if (viewCliente) viewCliente.setAttribute('data-tema', p.tema || 'escuro');

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
    <a href="#orcamento"      class="nav-link">${t.nav.orcamento}</a>
    <a href="#wrap-notas"     class="nav-link">${t.nav.notas}</a>
    <a href="#timeline"       class="nav-link">${t.nav.timeline}</a>
    <a href="#wrap-docs"      class="nav-link">${lang==='pt'?'Documentos':'Documents'}</a>
    <a href="#mensagens"      class="nav-link">💬 ${lang==='pt'?'Mensagens':'Messages'}</a>
    <a href="#reclamacao"     class="nav-link">⚠️ ${lang==='pt'?'Reclamação':'Complaint'}</a>
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

  // Tipos de projeto para os pills
  const TODOS_TIPOS_HERO = [
    { key: 'cozinha',            label: 'Cozinha' },
    { key: 'casa-de-banho',      label: 'Casa de Banho' },
    { key: 'roupeiro',           label: 'Roupeiro' },
    { key: 'renovacao-parcial',  label: 'Renovação Parcial' },
    { key: 'aquecimento',        label: 'Aquecimento' },
  ];
  const tipoAtivo = TODOS_TIPOS_HERO.find(t => t.key === p.tipo) || { key: p.tipo, label: p.tipoOutro || p.tipo || '' };
  const outrosTipos = TODOS_TIPOS_HERO.filter(t => t.key !== p.tipo).slice(0, 2);
  const tiposHtml = [tipoAtivo, ...outrosTipos].map((tp, i) =>
    `${i > 0 ? '<span class="hero-tipo-dot">·</span>' : ''}` +
    `<span class="hero-tipo-item${i === 0 ? ' ativo' : ''}">${tp.label.toUpperCase()}</span>`
  ).join('');

  const cdHtml = prazoPassou
    ? `<div class="hero-expirada">${tH.expirada}</div>`
    : jaAprovado ? '' : `<div id="countdown-wrap" class="countdown-wrap"></div>`;

  document.getElementById('cli-hero-content').innerHTML = `
    <div class="hero-3d-block">
      <div class="hero-eyebrow">${tH.eyebrow}</div>
      <h1 class="hero-titulo">
        Um espaço<br>
        pensado<br>
        para viver<span class="hero-titulo-ponto">.</span>
      </h1>
      <div class="hero-div"></div>
      <div class="hero-tipos">${tiposHtml}</div>
      <div class="hero-cliente">
        <div class="hero-cliente-icon">⌂</div>
        <div>
          <div class="hero-cliente-label">${lang === 'en' ? 'DEVELOPED EXCLUSIVELY FOR' : 'DESENVOLVIDO EXCLUSIVAMENTE PARA'}</div>
          <div class="hero-para">${esc(nome)}</div>
        </div>
      </div>
      ${cdHtml}
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

  // ── 07 Mensagens — carregar e renderizar
  const projId = getState('projAtualId');
  if (projId) renderMensagens(projId);

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

  // ── Animação em cascata do orçamento ──
  _iniciarCascataOrcamento();
  _iniciarSecaoActiva();

  // ── Verificar notificações para o cliente (mensagens novas + proposta atualizada)
  const _projId = getState('projAtualId');
  if (_projId) verificarNotificacoesCliente(_projId, p);

  // ── Iniciar formulário de reclamação — mostrar secção e pré-preencher
  iniciarFormReclamacao(p);
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


// ── Formulário de Reclamação ──────────────────────
// EmailJS — envio sem backend, emails internos nunca expostos ao cliente

// IDs do EmailJS — configurar após criar conta em emailjs.com
const EMAILJS_SERVICE_ID  = 'service_ijgsl8w';
const EMAILJS_TEMPLATE_HM = 'template_xr3958i';       // só para Hélder Melo
const EMAILJS_TEMPLATE_ALL = 'template_5j5erdi';      // Hélder + Serviços

const TIPOS_REC = {
  revisao:    { label: 'Revisão ou alteração ao projeto', soHM: true  },
  entrega:    { label: 'Problema na entrega',             soHM: false },
  instalacao: { label: 'Problema na instalação',          soHM: false },
  posvenda:   { label: 'Pós-venda',                       soHM: false },
};

const SUBTIPOS_REC = {
  revisao: [
    'Atraso ou demora na retificação do projeto',
    'Erro no projeto',
    'Outros',
  ],
  entrega: [
    'Material danificado',
    'Material em falta',
    'Entrega não efetuada',
    'Artigo trocado',
    'Outros',
  ],
  instalacao: [
    'Material em falta no momento da instalação',
    'Material danificado na instalação',
    'Problema com o técnico',
    'Qualidade do trabalho',
    'Prazo de instalação não cumprido',
    'Outros',
  ],
  posvenda: [
    'Avaria de equipamento',
    'Desafinação de porta/gaveta',
    'Defeito estético',
    'Outros',
  ],
};

const URGENCIA_LABEL = {
  normal:      'Normal',
  urgente:     'Urgente',
  obra_parada: '⚠️ OBRA PARADA',
};

export function iniciarFormReclamacao(p) {
  // Mostrar secção
  const sec = document.getElementById('reclamacao');
  if (sec) sec.style.display = '';

  if (!p) return;

  // Pré-preencher campos com dados do projeto
  const nomeCliente = p.nome ? p.nome.split('·')[0].trim() : '';
  const inputNome  = document.getElementById('rec-nome');
  const inputEmail = document.getElementById('rec-email');
  const inputTel   = document.getElementById('rec-telefone');

  if (inputNome  && nomeCliente) { inputNome.value  = nomeCliente; }
  if (inputEmail && p.email)     { inputEmail.value = p.email; }
  if (inputTel   && p.contacto)  { inputTel.value   = p.contacto; }

  // Guardar refs do projeto para incluir no email
  window._recProjRef = {
    nome:       p.nome       || '—',
    refPc:      p.refPc      || '—',
    refOs:      p.refOs      || '—',
    localidade: p.localidade || '—',
    fase:       p.fase       || '—',
    id:         p.id         || '',
  };
}

// Chamado pelo onchange do select de tipo
window._recTipoChange = function() {
  const tipo   = document.getElementById('rec-tipo')?.value;
  const info   = TIPOS_REC[tipo];
  const subWrap = document.getElementById('rec-subtipo-wrap');
  const subSel  = document.getElementById('rec-subtipo');
  const estado  = document.getElementById('rec-form-estado');

  if (!info) {
    if (subWrap) subWrap.style.display = 'none';
    if (estado)  estado.style.display  = 'none';
    return;
  }

  // Popular subtipos
  const subs = SUBTIPOS_REC[tipo] || [];
  if (subSel && subs.length) {
    subSel.innerHTML = subs.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
    if (subWrap) subWrap.style.display = '';
  }

  // Indicação de quem recebe
  if (estado) {
    estado.style.display = '';
    estado.className = 'rec-form-estado rec-estado-info';
    estado.textContent = info.soHM
      ? 'ℹ️ Esta reclamação será tratada diretamente por Hélder Melo.'
      : 'ℹ️ Esta reclamação será encaminhada para os serviços competentes.';
  }
};

export async function enviarReclamacao() {
  const btn = document.getElementById('btn-rec-enviar');
  const estado = document.getElementById('rec-form-estado');

  // Recolher campos
  const nome     = document.getElementById('rec-nome')?.value.trim();
  const email    = document.getElementById('rec-email')?.value.trim();
  const telefone = document.getElementById('rec-telefone')?.value.trim() || '—';
  const prefCtc  = document.getElementById('rec-contacto-pref')?.value || 'email';
  const tipo     = document.getElementById('rec-tipo')?.value;
  const subtipo  = document.getElementById('rec-subtipo')?.value || '—';
  const urgencia = document.querySelector('input[name="rec-urgencia"]:checked')?.value || 'normal';
  const descricao = document.getElementById('rec-descricao')?.value.trim();

  // Validação — só tipo e descrição são obrigatórios (resto vem do projeto)
  if (!tipo || !descricao) {
    if (estado) {
      estado.style.display = '';
      estado.className = 'rec-form-estado rec-estado-erro';
      estado.textContent = '⚠️ Por favor selecione o tipo de reclamação e descreva o problema.';
    }
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'A enviar…'; }
  if (estado) { estado.style.display = 'none'; }

  const proj = window._recProjRef || {};
  const tipoInfo = TIPOS_REC[tipo] || { label: tipo, soHM: true };
  const urgLabel = URGENCIA_LABEL[urgencia] || urgencia;
  const dataHora = new Date().toLocaleString('pt-PT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  const templateParams = {
    // Cliente
    cliente_nome:     nome,
    cliente_email:    email,
    cliente_telefone: telefone,
    cliente_pref_ctc: prefCtc === 'email' ? 'Email' : prefCtc === 'telefone' ? 'Telefone' : 'Qualquer',
    // Reclamação
    tipo_reclamacao:  tipoInfo.label,
    subtipo:          subtipo,
    urgencia:         urgLabel,
    descricao:        descricao,
    // Projeto
    proj_nome:        proj.nome,
    proj_refPc:       proj.refPc,
    proj_refOs:       proj.refOs,
    proj_localidade:  proj.localidade,
    proj_fase:        proj.fase,
    proj_link:        proj.id ? `https://hmlm90020798-alt.github.io/projetos-lm/?p=${proj.id}` : '—',
    // Meta
    data_hora:        dataHora,
  };

  try {
    // Escolher template conforme tipo — soHM = só Hélder, senão vai para ambos
    const templateId = tipoInfo.soHM ? EMAILJS_TEMPLATE_HM : EMAILJS_TEMPLATE_ALL;
    await emailjs.send(EMAILJS_SERVICE_ID, templateId, templateParams);

    // Sucesso
    if (estado) {
      estado.style.display = '';
      estado.className = 'rec-form-estado rec-estado-ok';
      estado.textContent = '✓ Reclamação enviada com sucesso. Receberá uma resposta em breve.';
    }
    // Limpar formulário
    document.getElementById('form-reclamacao')?.reset();
    window._recTipoChange(); // reset estado info

    if (btn) { btn.disabled = false; btn.textContent = 'Enviar Reclamação'; }

  } catch (err) {
    console.error('EmailJS error:', err);
    if (estado) {
      estado.style.display = '';
      estado.className = 'rec-form-estado rec-estado-erro';
      estado.textContent = '✗ Erro ao enviar. Por favor tente novamente ou contacte directamente por telefone.';
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Enviar Reclamação'; }
  }
}

// ── Língua ─────────────────────────────────────────

export function setLang(lang) {
  setState({ lang });
  window._LANG = lang;
  const cache = getState('projCache');
  if (cache) renderPaginaCliente(cache);
}


// ── Cascata de animação do orçamento ──
function _iniciarCascataOrcamento() {
  const secOrc = document.getElementById('orcamento');
  if (!secOrc) return;

  const rows      = Array.from(secOrc.querySelectorAll('.orc-row'));
  const totalCard = secOrc.querySelector('.orc-total-card');
  const totalValEl= secOrc.querySelector('.orc-total-val');

  // Guardar o valor final do total para animar depois
  const totalFmt  = totalValEl ? totalValEl.textContent.trim() : '';
  const totalNum  = parseFloat(totalFmt.replace(/[^\d,.]/g,'').replace(',','.')) || 0;

  // Esconder tudo inicialmente
  rows.forEach(row => {
    row.style.opacity  = '0';
    row.style.transform= 'translateY(20px)';
  });
  if (totalCard) {
    totalCard.style.opacity  = '0';
    totalCard.style.transform= 'translateY(14px)';
  }

  // Utilitário: animar número de 0 até target em duration ms
  function animarNumero(el, target, duration, isCurrency) {
    const start    = performance.now();
    const fmt2     = v => isCurrency
      ? v.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
      : Math.round(v) + '%';
    const suffix   = isCurrency ? '' : el.textContent.replace(/^[\d]+/, '');
    function step(now) {
      const elapsed = now - start;
      const progress= Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased   = 1 - Math.pow(1 - progress, 3);
      const current = target * eased;
      el.textContent = isCurrency
        ? current.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
        : Math.round(current) + suffix;
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = isCurrency
        ? target.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
        : Math.round(target) + suffix;
    }
    requestAnimationFrame(step);
  }

  const disparar = () => {
    let acumulado  = 0;
    const DELAY_BASE    = 150;
    const DELAY_ENTRE   = 220;
    const DUR_NUMERO    = 800;
    const DUR_TOTAL     = 600;

    // Primeiro o total card aparece mas com 0,00 €
    if (totalCard && totalValEl) {
      totalValEl.textContent = '0,00 €';
      setTimeout(() => {
        totalCard.style.transition = 'opacity .5s ease, transform .5s cubic-bezier(.16,1,.3,1)';
        totalCard.style.opacity    = '1';
        totalCard.style.transform  = 'translateY(0)';
      }, DELAY_BASE);
    }

    // Categorias em cascata
    rows.forEach((row, i) => {
      const delay = DELAY_BASE + 200 + (i * DELAY_ENTRE);

      setTimeout(() => {
        // Row entra
        row.style.transition = 'opacity .45s ease, transform .45s cubic-bezier(.16,1,.3,1)';
        row.style.opacity    = '1';
        row.style.transform  = 'translateY(0)';

        // Barra cresce
        setTimeout(() => {
          const barra = row.querySelector('.orc-barra[data-pct]');
          if (barra) barra.style.width = barra.dataset.pct + '%';
        }, 200);

        // Valor da categoria conta de 0 até ao target
        const valEl = row.querySelector('.orc-val');
        if (valEl) {
          const rawTxt = valEl.textContent.trim();
          const target = parseFloat(rawTxt.replace(/[^\d,.]/g,'').replace(',','.')) || 0;
          valEl.textContent = '0,00 €';
          setTimeout(() => {
            animarNumero(valEl, target, DUR_NUMERO, true);
            // Acumular no total
            acumulado += target;
            const snapTotal = acumulado;
            if (totalValEl) {
              animarNumero(totalValEl, snapTotal, DUR_TOTAL, true);
            }
          }, 150);
        }

        // Percentagem conta de 0 até ao valor
        const pctEl = row.querySelector('.orc-pct');
        if (pctEl) {
          const rawPct = parseInt(pctEl.textContent) || 0;
          const suffix = pctEl.textContent.replace(/^[\d]+/, '');
          pctEl.textContent = '0' + suffix;
          setTimeout(() => animarNumero(pctEl, rawPct, DUR_NUMERO, false), 150);
        }

      }, delay);
    });
  };

  // Disparar quando a secção ficar visível
  const io = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) {
      disparar();
      io.disconnect();
    }
  }, { threshold: 0.1 });
  io.observe(secOrc);
}

// ── Iluminação de secção activa por scroll ──
function _iniciarSecaoActiva() {
  const secs = Array.from(document.querySelectorAll('.cli-sec[id]'));
  if (!secs.length) return;

  // Usar scroll para determinar qual secção ocupa mais espaço no viewport
  function actualizarSecAtiva() {
    const vpH    = window.innerHeight;
    const navH   = 48; // altura da navbar
    let melhor   = null;
    let melhorAlt = 0;

    secs.forEach(sec => {
      const rect = sec.getBoundingClientRect();
      // Área visível da secção no viewport (excluindo navbar)
      const top    = Math.max(rect.top, navH);
      const bottom = Math.min(rect.bottom, vpH);
      const visivel = Math.max(0, bottom - top);
      if (visivel > melhorAlt) {
        melhorAlt = visivel;
        melhor = sec;
      }
    });

    secs.forEach(sec => {
      sec.classList.toggle('sec-ativa', sec === melhor);
    });
  }

  // Correr no scroll e no resize
  window.addEventListener('scroll', actualizarSecAtiva, { passive: true });
  window.addEventListener('resize', actualizarSecAtiva, { passive: true });
  actualizarSecAtiva(); // estado inicial
}

// ── Toggle de artigos no orçamento ──
window._orcToggle = function(row, artigosId) {
  const artigos = document.getElementById(artigosId);
  if (!artigos) return;
  const isOpen = row.classList.toggle('orc-open');
  artigos.style.maxHeight = isOpen ? artigos.scrollHeight + 'px' : '0';
  artigos.style.opacity   = isOpen ? '1' : '0';
};
