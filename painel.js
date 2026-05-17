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
import { toggleOrdem, toggleValorCard, renderPainel, TIPOS_PROJETO, faseOrdem } from './painel-dashboard.js';
import {
  addLinhaElem, addCatElemExtra, addLinhaElemExtra, addLinhaElemNoCat,
  addLinhaOrc, addCatOrcamento, atualizarTotalPreview,
  processarImagens, removerImagem, renderThumbs,
  addInteracao, addOcorrencia,
  addDoc, addNota, atualizarEstadoOcorrencia, adicionarActualizacaoOcorr,
  renderInteracoes, renderDocsForm, renderNotasForm, renderOcorrenciasForm,
} from './painel-form-extras.js';

// Expor globalmente para onclicks inline
window.adicionarActualizacaoOcorr = adicionarActualizacaoOcorr;
window.atualizarEstadoOcorrencia  = atualizarEstadoOcorrencia;


// ── Inicialização do módulo de alertas ───────────────
// Chamado uma vez após todos os módulos estarem carregados
export function inicializarPainel() {
  initAlertasModule(TIPOS_PROJETO, faseOrdem);
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
   'f-orc-moveis','f-orc-moveis-desc',
   'f-orc-tampos','f-orc-tampos-desc',
   'f-orc-eletros','f-orc-eletros-desc',
   'f-orc-acessorios','f-orc-acessorios-desc'].forEach(id => {
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
    (p[campo]||[]).forEach(i => addLinhaElem(secId, i.nome, i.url, i.preco||''));
  });
  (p.elem_extras||[]).forEach(cat => {
    addCatElemExtra(cat.categoria);
    const grupos = document.getElementById('sec-elem-extras').querySelectorAll('[data-elem-grupo]');
    const ult = grupos[grupos.length - 1];
    if (ult) (cat.itens||[]).forEach(i => addLinhaElemNoCat(ult.querySelector('[data-elem-itens]'), i.nome, i.url, i.preco||''));
  });

  // Orçamento — valor único por categoria
  const sv2 = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val || ''; };
  sv2('f-orc-moveis',         p.orc_moveis);
  sv2('f-orc-moveis-desc',    p.orc_moveis_desc);
  sv2('f-orc-tampos',         p.orc_tampos);
  sv2('f-orc-tampos-desc',    p.orc_tampos_desc);
  sv2('f-orc-eletros',        p.orc_eletros);
  sv2('f-orc-eletros-desc',   p.orc_eletros_desc);
  sv2('f-orc-acessorios',     p.orc_acessorios);
  sv2('f-orc-acessorios-desc',p.orc_acessorios_desc);
  (p.orcamento||[]).forEach(cat => {
    addCatOrcamento(cat.categoria, cat.valor, cat.desc || '');
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
      nome:  r.querySelector('.elem-line-nome')?.value?.trim()  || '',
      url:   r.querySelector('.elem-line-url')?.value?.trim()   || '',
      preco: r.querySelector('.elem-line-preco')?.value?.trim() || '',
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
      valor:     g.querySelector('[data-cat-valor]')?.value?.trim() || '0',
      desc:      g.querySelector('[data-cat-desc]')?.value?.trim()  || '',
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
      nome:    el.querySelector('.doc-form-nome')?.value?.trim()    || '',
      url:     el.querySelector('.doc-form-url')?.value?.trim()     || '',
      seccao:  el.querySelector('.doc-form-seccao')?.value?.trim()  || 'galeria',
    }))
    .filter(d => d.nome && d.url);

  const interacoes = Array.from(document.querySelectorAll('#f-interacoes-lista .interacao-item'))
    .map(el => ({ tipo: el.dataset.tipo||'nota', texto: el.dataset.texto||'', data: el.dataset.data||'', hora: el.dataset.hora||'' }));

  const ocorrencias = Array.from(document.querySelectorAll('#f-ocorrencias-lista .ocorr-item'))
    .map(el => {
      const acts = Array.from(el.querySelectorAll('.ocorr-act-item')).map(a => ({
        data:    a.dataset.data    || '',
        dataISO: a.dataset.dataiso || '',
        estado:  a.dataset.estado  || 'detectada',
        nota:    a.dataset.nota    || '',
        autor:   a.dataset.autor   || 'hm',
      }));
      return {
        id:            el.dataset.id      || ('oc-' + Date.now()),
        tipo:          el.dataset.tipo    || 'outro',
        descricao:     el.dataset.desc    || '',
        estado:        el.dataset.estado  || 'detectada',
        data:          el.dataset.data    || '',
        dataISO:       el.dataset.dataiso || '',
        urgencia:      el.dataset.urgencia|| 'normal',
        actualizacoes: acts,
      };
    });

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
    orc_moveis:         gv('f-orc-moveis')         || '0',
    orc_moveis_desc:    gv('f-orc-moveis-desc')    || '',
    orc_tampos:         gv('f-orc-tampos')         || '0',
    orc_tampos_desc:    gv('f-orc-tampos-desc')    || '',
    orc_eletros:        gv('f-orc-eletros')        || '0',
    orc_eletros_desc:   gv('f-orc-eletros-desc')   || '',
    orc_acessorios:     gv('f-orc-acessorios')     || '0',
    orc_acessorios_desc:gv('f-orc-acessorios-desc')|| '',
    orcamento:          recolherCatsOrc(document.getElementById('sec-orcamento-cats')),
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


