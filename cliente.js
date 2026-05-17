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
        <div class="orc-artigos-inner">
        ${c.artigos.map(a => `
          <div class="orc-artigo-item">
            <span class="orc-artigo-nome">${esc(a.nome)}</span>
            <div class="orc-artigo-direita">
              ${a.preco && parseFloat(a.preco) > 0 ? `<span class="orc-artigo-preco">${fmt(a.preco)}</span>` : ''}
              ${a.url ? `<a href="${safeUrl(a.url)}" target="_blank" rel="noopener noreferrer" class="elem-link">${lang==='en'?'View':'VER ARTIGO'}</a>` : ''}
            </div>
          </div>`).join('')}
        </div>
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

  // Percentagem de progresso por fase
  const fasePct = {
    proposta:    14,
    retificacao: 14,
    aprovado:    28,
    encomenda:   42,
    entrega:     57,
    montagem:    80,
    concluido:   100,
  };
  const pct = fasePct[fase] ?? 0;

  // Frases marcantes por fase
  const frasesPT = {
    proposta:    'A sua cozinha começa a <em>tomar forma.</em>',
    retificacao: 'Cada detalhe <em>afinado</em> à sua medida.',
    aprovado:    'Decisão tomada. <em>Avançamos juntos.</em>',
    encomenda:   'Cada peça no lugar certo, <em>antes do tempo.</em>',
    entrega:     'Os materiais chegaram. <em>Estamos prontos.</em>',
    montagem:    'As mãos na obra. O resultado <em>aproxima-se.</em>',
    concluido:   'Feito com rigor. <em>Pensado para durar.</em>',
  };
  const frasesEN = {
    proposta:    'Your kitchen is starting to <em>take shape.</em>',
    retificacao: 'Every detail <em>refined</em> to your measure.',
    aprovado:    'Decision made. <em>Moving forward together.</em>',
    encomenda:   'Every piece in the right place, <em>ahead of schedule.</em>',
    entrega:     'Materials have arrived. <em>We are ready.</em>',
    montagem:    'Work in progress. The result <em>is close.</em>',
    concluido:   'Done with precision. <em>Built to last.</em>',
  };
  const frase = (lang === 'en' ? frasesEN : frasesPT)[fase] || '';

  // Barra de progresso global
  const progHtml = `
    <div class="tl-prog-wrap" id="tl-prog-wrap">
      <div class="tl-prog-header">
        <span class="tl-prog-label">${lang === 'en' ? 'Global Progress' : 'Progresso Global'}</span>
        <span class="tl-prog-pct" id="tl-prog-pct">0%</span>
      </div>
      <div class="tl-prog-track">
        <div class="tl-prog-fill" id="tl-prog-fill" data-pct="${pct}"></div>
      </div>
    </div>`;

  const fraseHtml = frase ? `<div class="tl-frase">${frase}</div>` : '';

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
    const btnFalar = `<button class="tl-btn tl-btn-ghost" onclick="window._abrirMensagens()">💬 Falar Comigo</button>`;
    const btnReclamar = `<button class="tl-btn tl-btn-rec" onclick="window._abrirReclamacao('reclamacao')">⚠ Reclamação</button>`;

    if (marcFase === 'analise' && !jaAprov) {
      return `
        <div class="tl-acoes">
          <button class="tl-btn tl-btn-primary" onclick="window.aprovarProposta()">✓ Aprovar Proposta</button>
          ${btnFalar}
        </div>`;
    }
    if (marcFase === 'entrega' && fase === 'entrega') {
      return `
        <div class="tl-acoes">
          <button class="tl-btn tl-btn-primary" onclick="window._confirmarEntrega()">✓ Confirmar Entrega</button>
          ${btnFalar}
          ${btnReclamar}
        </div>`;
    }
    if (marcFase === 'instalacao' && fase === 'montagem') {
      return `
        <div class="tl-acoes">
          <button class="tl-btn tl-btn-primary" onclick="window._confirmarInstalacao()">✓ Confirmar Instalação</button>
          ${btnFalar}
          ${btnReclamar}
        </div>`;
    }
    if (marcFase === 'conclusao' && fase === 'concluido') {
      return `
        <div class="tl-acoes">
          ${btnFalar}
          ${btnReclamar}
        </div>`;
    }
    // Fases pós-aprovação sem acção primária (encomenda)
    if (jaAprov && marcFase === null) return '';
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

    const innerContent = `
      <div class="tl-dot"></div>
      <div class="tl-content">
        <div class="tl-label">${m.label}</div>
        ${m.data  ? `<div class="tl-data">${m.data}</div>` : ''}
        ${m.apelo ? `<span class="tl-apelo${m.retif?' tl-apelo-retif':''}">${m.apelo}</span>` : ''}
        ${acoes}
      </div>`;

    if (m.ativo) {
      return `
      <div class="tl-item${m.done?' done':''} ativo${m.retif?' retif':''}">
        <div class="tl-fase-ativa-box">
          <div class="tl-fase-ativa-label">${lang==='en'?'Current phase':'Fase atual'}</div>
          ${innerContent}
        </div>
      </div>`;
    }

    return `
    <div class="tl-item${m.done?' done':''}${m.retif?' retif':''}">
      ${innerContent}
    </div>`;
  }).join('');

  return progHtml + fraseHtml + marcosHtml + ocorrHtml;
}

// Animar barra de progresso global quando visível
function _animarBarraProgresso() {
  const fill = document.getElementById('tl-prog-fill');
  const pctEl = document.getElementById('tl-prog-pct');
  if (!fill || !pctEl) return;
  const targetPct = parseInt(fill.dataset.pct) || 0;

  const io = new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting) return;
    io.disconnect();
    // Animar a barra
    setTimeout(() => {
      fill.style.width = targetPct + '%';
    }, 150);
    // Animar o número
    const DUR = 1100;
    const start = performance.now();
    function step(now) {
      const progress = Math.min((now - start) / DUR, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      pctEl.textContent = Math.round(eased * targetPct) + '%';
      if (progress < 1) requestAnimationFrame(step);
    }
    setTimeout(() => requestAnimationFrame(step), 150);
  }, { threshold: 0.5 });

  const wrap = document.getElementById('tl-prog-wrap');
  if (wrap) io.observe(wrap);
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

  // ── 8 cards fixos ──
  const SVG = {
    scope:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    client:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    works:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
    delivery: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
    install:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
    changes:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
    validity: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    warranty: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    manual:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  };

  const fixos = lang === 'en' ? [
    { svg: SVG.scope,    titulo: 'Project Scope',            texto: 'This proposal includes exclusively the elements specified and detailed in the presented quote. Any supplies or services not expressly listed are outside the scope of this project.' },
    { svg: SVG.client,   titulo: 'Client Responsibility',    texto: 'The removal of existing equipment, furniture or finishes is the client\'s responsibility, unless expressly agreed otherwise and reflected in the proposal. The specific conditions of each project are always clarified and documented in advance.' },
    { svg: SVG.works,    titulo: 'Works & Infrastructure',   texto: 'Equipment installation assumes that the necessary infrastructure is properly prepared — namely electrical outlets positioned, isolation valves installed and other technical conditions completed. Prior verification of these conditions is the client\'s responsibility, unless expressly agreed otherwise.' },
    { svg: SVG.delivery, titulo: 'Delivery & Logistics',     texto: 'All materials are checked before dispatch and delivered in the best possible condition. Delays or anomalies may occur during transport beyond our control. In case of non-conformity on delivery, the client will always be contacted and the issue followed up until resolution.' },
    { svg: SVG.install,  titulo: 'Installation',             texto: 'The installation service covers the assembly and placement of the elements included in this proposal, with a 3-year guarantee on the work carried out. Timelines are defined together and met whenever conditions allow. Any rescheduling will always be communicated with as much notice as possible.' },
    { svg: SVG.changes,  titulo: 'Changes After Approval',   texto: 'Any change requested after proposal approval will be subject to new analysis and possible revision of the quote and timelines. We recommend that all decisions are consolidated before final project confirmation.' },
    { svg: SVG.validity, titulo: 'Proposal Validity',        texto: 'The values presented are valid until the date indicated in this proposal. After that date, prices are subject to update and a new proposal will need to be issued.' },
    { svg: SVG.warranty, titulo: 'Guarantees & After-Sales', texto: 'All products supplied benefit from applicable legal and commercial guarantees. The installation service has a 3-year guarantee. Any anomaly detected after project completion can be reported through Leroy Merlin\'s customer support channels — telephone, email or directly with your consultant.' },
  ] : [
    { svg: SVG.scope,    titulo: 'Âmbito do Projeto',           texto: 'Esta proposta inclui exclusivamente os elementos especificados e detalhados no orçamento apresentado. Quaisquer fornecimentos ou serviços não expressamente listados estão fora do âmbito deste projeto.' },
    { svg: SVG.client,   titulo: 'Responsabilidade do Cliente', texto: 'A remoção de equipamentos, móveis ou revestimentos existentes é da responsabilidade do cliente, salvo quando expressamente acordado em contrário e refletido na proposta. As condições específicas de cada projeto são sempre clarificadas e documentadas previamente.' },
    { svg: SVG.works,    titulo: 'Obras e Infraestruturas',     texto: 'A instalação dos equipamentos pressupõe que as infraestruturas necessárias estejam devidamente preparadas — nomeadamente tomadas elétricas posicionadas, torneiras de esquadria instaladas e demais condições técnicas concluídas. A verificação prévia destas condições é da responsabilidade do cliente, salvo acordo expresso em contrário.' },
    { svg: SVG.delivery, titulo: 'Entrega e Logística',         texto: 'Todos os materiais são verificados antes do envio e entregues nas melhores condições possíveis. Poderão ocorrer situações de atraso ou anomalia durante o transporte alheias ao nosso controlo. Em caso de não conformidade na entrega, o cliente será sempre contactado e o problema acompanhado até à sua resolução.' },
    { svg: SVG.install,  titulo: 'Instalação',                  texto: 'O serviço de instalação abrange a montagem e colocação dos elementos incluídos nesta proposta, com uma garantia de 3 anos sobre o trabalho executado. Os prazos são definidos em conjunto e cumpridos sempre que as condições o permitam. Qualquer reagendamento será sempre comunicado com a maior antecedência possível.' },
    { svg: SVG.changes,  titulo: 'Alterações Após Aprovação',   texto: 'Qualquer alteração solicitada após a aprovação da proposta será sujeita a nova análise e eventual revisão do orçamento e prazos. Recomendamos que todas as decisões sejam consolidadas antes da confirmação final do projeto.' },
    { svg: SVG.validity, titulo: 'Validade da Proposta',        texto: 'Os valores apresentados são válidos até à data indicada nesta proposta. Decorrido esse prazo, os preços ficam sujeitos a atualização, sendo necessária a emissão de uma nova proposta.' },
    { svg: SVG.warranty, titulo: 'Garantias e Pós-Venda',       texto: 'Todos os produtos fornecidos beneficiam das garantias legais e comerciais aplicáveis. O serviço de instalação tem uma garantia de 3 anos. Qualquer anomalia detetada após a conclusão do projeto pode ser reportada através dos canais de apoio ao cliente da Leroy Merlin — linha telefónica, email ou diretamente com o seu consultor.' },
  ];

  // ── Cards dinâmicos — só notas manuais do painel ──
  const notasArr = Array.isArray(p.notas)
    ? p.notas.filter(n => n && (n.texto || typeof n === 'string'))
    : (p.notas ? [{ titulo: '', texto: p.notas }] : []);

  const notasExtra = notasArr.map(n => {
    const titulo = typeof n === 'string' ? '' : (n.titulo || '');
    const texto  = typeof n === 'string' ? n  : (n.texto  || '');
    return _notaCardHtml(SVG.manual, titulo || (lang === 'en' ? 'Important Note' : 'Nota Importante'), nl2br(texto), true);
  }).join('');

  const todosCards = [
    ...fixos.map(c => _notaCardHtml(c.svg, c.titulo, c.texto, false)),
    notasExtra,
  ].join('');

  return `<div class="notas-grid">${todosCards}</div>`;
}

function _notaCardHtml(svgIcon, titulo, textoHtml, isManual) {
  return `
    <div class="nota-card${isManual ? ' nota-card-manual' : ''}" onclick="window._toggleNota(this)" role="button" tabindex="0" aria-expanded="false">
      <div class="nota-card-header">
        <span class="nota-card-icon">${svgIcon}</span>
        <span class="nota-card-titulo">${titulo}</span>
        <span class="nota-card-chevron">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </span>
      </div>
      <div class="nota-card-corpo">
        <p class="nota-card-texto">${textoHtml}</p>
      </div>
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
    'sec-header-orcamento': { num: '02', eyebrow: t.orcamento.eyebrow, titulo: t.orcamento.titulo, light: true  },
    'sec-header-notas':     { num: '03', eyebrow: t.notas.eyebrow, titulo: t.notas.titulo, desc: lang==='pt' ? 'Definimos claramente as responsabilidades de cada parte para que o projeto decorra sem surpresas. Toque em cada tema para saber mais.' : 'We clearly define the responsibilities of each party so the project runs without surprises. Tap each topic to learn more.', light: false },
    'sec-header-timeline':  { num: '04', eyebrow: t.timeline.eyebrow,  titulo: t.timeline.titulo, desc: lang==='pt' ? 'Cada fase é gerida com rigor e transparência, para que tudo aconteça como planeado.' : 'Every phase is managed with rigour and transparency, so everything happens as planned.', light: true  },
    'sec-header-docs':      { num: '05', eyebrow: lang==='pt'?'Documentos':'Documents', titulo: lang==='pt'?'Plantas & Documentos':'Plans & Documents', light: false },
  };
  Object.entries(secTitulos).forEach(([id, s]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `
      <span class="sec-num${s.light?' sec-num-light':''}">${s.num}</span>
      <div>
        <div class="sec-eyebrow${s.light?' sec-eyebrow-light':''}">${s.eyebrow}</div>
        <h2 class="sec-titulo${s.light?' sec-titulo-light':''}">${s.titulo}</h2>
        ${s.desc ? `<p class="sec-desc">${s.desc}</p>` : ''}
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
  _animarBarraProgresso();

  // ── 07 Mensagens — carregar e renderizar
  const projId = getState('projAtualId');
  if (projId) renderMensagens(projId);

  // ── Documentos por secção ──
  const docs = p.docs || [];
  _renderDocsPorSeccao(docs, lang);

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

  // ── FAB Falar Comigo ──
  _criarFAB();

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




// ── Drawer de Mensagens ──────────────────────────
window._abrirMensagens = function() {
  const drawer = document.getElementById('mensagens-drawer');
  if (!drawer) {
    // Criar drawer dinamicamente
    const d = document.createElement('div');
    d.id = 'mensagens-drawer';
    d.className = 'rec-drawer msg-drawer';
    d.style.display = 'none';
    d.innerHTML = `
      <div class="cli-sec-inner" style="padding-top:48px">
        <div class="sec-header" style="display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:40px">
          <div>
            <div class="sec-eyebrow">Comunicação Direta</div>
            <h2 class="sec-titulo">Fale Comigo</h2>
          </div>
          <button onclick="window._fecharMensagens()" style="background:transparent;border:.5px solid rgba(245,242,236,.15);border-radius:4px;padding:8px 14px;color:rgba(245,242,236,.5);font-family:var(--mono);font-size:10px;letter-spacing:.12em;cursor:pointer;flex-shrink:0">✕ Fechar</button>
        </div>
        <div class="msg-lista" id="sec-mensagens-drawer"></div>
        <div class="msg-form">
          <textarea id="msg-input-drawer" class="msg-textarea" placeholder="Escreva a sua dúvida, comentário ou pedido de alteração…" rows="4" onkeydown="if(event.key==='Enter'&&event.ctrlKey)window._enviarMsgDrawer()"></textarea>
          <div class="msg-form-footer">
            <span class="msg-hint">Ctrl+Enter para enviar</span>
            <button class="btn-msg-enviar" onclick="window._enviarMsgDrawer()">Enviar</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(d);
  }

  // Criar overlay se não existir
  if (!document.getElementById('msg-overlay')) {
    const ov = document.createElement('div');
    ov.id = 'msg-overlay';
    ov.className = 'rec-overlay';
    ov.onclick = () => window._fecharMensagens();
    document.body.appendChild(ov);
  }

  // Copiar mensagens existentes
  const msgSec = document.getElementById('sec-mensagens');
  const msgDrawer = document.getElementById('sec-mensagens-drawer');
  if (msgSec && msgDrawer) msgDrawer.innerHTML = msgSec.innerHTML;

  const d = document.getElementById('mensagens-drawer');
  d.style.display = 'block';
  setTimeout(() => {
    d.classList.add('rec-drawer-open');
    document.getElementById('msg-overlay')?.classList.add('rec-overlay-show');
    document.body.style.overflow = 'hidden';
  }, 10);
};

window._fecharMensagens = function() {
  const d = document.getElementById('mensagens-drawer');
  const ov = document.getElementById('msg-overlay');
  if (!d) return;
  d.classList.remove('rec-drawer-open');
  ov?.classList.remove('rec-overlay-show');
  document.body.style.overflow = '';
  setTimeout(() => { d.style.display = 'none'; }, 450);
};

window._enviarMsgDrawer = async function() {
  const input = document.getElementById('msg-input-drawer');
  const texto = input?.value?.trim();
  if (!texto) return;
  // Copiar para o input principal e enviar
  const mainInput = document.getElementById('msg-input');
  if (mainInput) mainInput.value = texto;
  await window.enviarMensagem();
  if (input) input.value = '';
  // Actualizar mensagens no drawer
  const msgSec = document.getElementById('sec-mensagens');
  const msgDrawer = document.getElementById('sec-mensagens-drawer');
  if (msgSec && msgDrawer) msgDrawer.innerHTML = msgSec.innerHTML;
};

// ── Drawer de Reclamação ──────────────────────────
window._abrirReclamacao = function(tipo) {
  const sec = document.getElementById('reclamacao');
  const overlay = document.getElementById('rec-overlay');
  if (!sec) return;

  // Criar overlay se não existir
  if (!overlay) {
    const ov = document.createElement('div');
    ov.id = 'rec-overlay';
    ov.className = 'rec-overlay';
    ov.onclick = () => window._fecharReclamacao();
    document.body.appendChild(ov);
  }

  // Pré-seleccionar tipo se pedido
  if (tipo === 'ajuste') {
    const sel = document.getElementById('rec-tipo');
    if (sel) { sel.value = 'revisao'; sel.dispatchEvent(new Event('change')); }
  }

  sec.style.display = 'block';
  sec.removeAttribute('aria-hidden');
  setTimeout(() => {
    sec.classList.add('rec-drawer-open');
    document.getElementById('rec-overlay')?.classList.add('rec-overlay-show');
    document.body.style.overflow = 'hidden';
  }, 10);
};

window._fecharReclamacao = function() {
  const sec = document.getElementById('reclamacao');
  const overlay = document.getElementById('rec-overlay');
  if (!sec) return;
  sec.classList.remove('rec-drawer-open');
  overlay?.classList.remove('rec-overlay-show');
  document.body.style.overflow = '';
  sec.setAttribute('aria-hidden', 'true');
  setTimeout(() => { sec.style.display = 'none'; }, 450);
};


// ── Documentos distribuídos por secção ──
function _renderDocsPorSeccao(docs, lang) {
  if (!docs.length) return;

  const hint = lang === 'en' ? '↗ Open document' : '↗ Abrir documento';

  function docsHtml(lista) {
    if (!lista.length) return '';
    return `
      <div class="docs-sec-wrap">
        <div class="docs-sec-titulo">${lang==='en'?'Documents':'Documentos'}</div>
        <div class="docs-grid-inline">
          ${lista.map(d => `
            <a href="${safeUrl(d.url)}" target="_blank" rel="noopener noreferrer" class="doc-card-inline">
              <div class="doc-card-inline-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
              <span class="doc-card-inline-nome">${esc(d.nome)}</span>
              <span class="doc-card-inline-hint">↗</span>
            </a>`).join('')}
        </div>
      </div>`;
  }

  // Distribuir por secção
  const porSec = { galeria: [], orcamento: [], notas: [] };
  docs.forEach(d => {
    const sec = d.seccao || 'galeria';
    if (porSec[sec]) porSec[sec].push(d);
    else porSec.notas.push(d); // fallback
  });

  // Injectar em cada secção
  const galEl  = document.getElementById('sec-galeria');
  const orcEl  = document.getElementById('sec-orcamento');
  const notEl  = document.getElementById('sec-notas');

  if (galEl  && porSec.galeria.length)   galEl.insertAdjacentHTML('afterend', docsHtml(porSec.galeria));
  if (orcEl  && porSec.orcamento.length) orcEl.insertAdjacentHTML('afterend', docsHtml(porSec.orcamento));
  if (notEl  && porSec.notas.length)     notEl.insertAdjacentHTML('afterend', docsHtml(porSec.notas));
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

  // Disparar apenas quando pelo menos 60% da secção está visível
  const io = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) {
      disparar();
      io.disconnect();
    }
  }, { threshold: 0.6 });
  io.observe(secOrc);
}

// ── Toggle cards de notas ──
window._toggleNota = function(card) {
  const corpo = card.querySelector('.nota-card-corpo');
  const isOpen = card.classList.toggle('nota-aberta');
  card.setAttribute('aria-expanded', isOpen);
  if (isOpen) {
    corpo.style.maxHeight = '';
    corpo.style.opacity   = '1';
  } else {
    corpo.style.maxHeight = '0';
    corpo.style.opacity   = '0';
  }
};

// ── FAB Falar Comigo ──
function _criarFAB() {
  if (document.getElementById('fab-falar-comigo')) return;
  const fab = document.createElement('button');
  fab.id = 'fab-falar-comigo';
  fab.className = 'fab-falar';
  fab.setAttribute('aria-label', 'Falar Comigo');
  fab.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
  fab.onclick = () => window._abrirMensagens();
  document.body.appendChild(fab);
}

// ── Neon de entrada/saída por secção ──
function _iniciarSecaoActiva() {
  setTimeout(() => {
    const secs = Array.from(document.querySelectorAll('.cli-sec')).filter(s => {
      let el = s;
      while (el) {
        if (window.getComputedStyle(el).display === 'none') return false;
        el = el.parentElement;
      }
      return s.offsetHeight > 0;
    });
    if (!secs.length) return;

    // Mapa secção-id → href do link na navbar
    // Cada secção pode ter um id próprio ou estar dentro de um wrap com id
    const navLinks = Array.from(document.querySelectorAll('.cli-nav-links .nav-link[href^="#"]'));

    function _actualizarNavActiva(secId) {
      navLinks.forEach(a => {
        const href = a.getAttribute('href').replace('#', '');
        // Link activo se o href corresponde ao id da secção ou ao id do seu pai wrap
        a.classList.toggle('nav-ativa', href === secId || secId.startsWith(href.replace('wrap-','')) || href.replace('wrap-','') === secId.replace('wrap-',''));
      });
    }

    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('sec-ativa');
          // Subir ao wrap pai para obter o id de navegação
          const wrap = e.target.closest('[id]');
          const secId = (wrap && wrap.id) ? wrap.id : e.target.id;
          if (secId) _actualizarNavActiva(secId);
        } else {
          e.target.classList.remove('sec-ativa');
        }
      });
    }, {
      threshold: 0.15,
      rootMargin: '-48px 0px -15% 0px'
    });

    secs.forEach(s => io.observe(s));
  }, 200);
}

// ── Toggle de artigos no orçamento ──
window._orcToggle = function(row, artigosId) {
  const artigos = document.getElementById(artigosId);
  if (!artigos) return;
  const isOpen = row.classList.toggle('orc-open');
  artigos.style.maxHeight = isOpen ? artigos.scrollHeight + 'px' : '0';
  artigos.style.opacity   = isOpen ? '1' : '0';
};
