// ════════════════════════════════════════════════
// painel.js — Painel de Gestão · Projetos LM
// ════════════════════════════════════════════════

import { getState, setState, getProjects, getEditId } from './state.js';
import { calcTotal } from './utils.js';
import { guardar, apagar, arquivarProjeto, restaurarProjeto, carregarArquivados,
         iniciarListenerAprovacoes, carregarVisitas,
         carregarMensagens, responderMensagem, iniciarListenerMensagens } from './firebase.js';
import { mostrarToast, setView, fmt, gerarId, dataHoje, formatarData } from './ui.js';
import { getAlertasReclamacoes } from './reclamacoes.js';
import { renderHistoricoReunioes } from './modo-apresentacao.js';
import { esc } from './sanitize.js';
import { getMsgVisto, setMsgVisto, atualizarBadgeMensagens, renderMensagensModal } from './painel-mensagens.js';
import { renderTarefasDrawer, renderTarefasForm, tarefasPendentes, tarefasEmAtraso } from './tarefas.js';
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
  // Projeto novo — sem ID ainda, sem mensagens para carregar
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

  ['sec-elem-moveis','sec-elem-tampos','sec-elem-eletros','sec-elem-acessorios','sec-elem-extras',
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

  // Elementos do projecto (com URL) — categorias fixas + extras
  const elemCats = [
    ['moveis','elem_moveis'], ['tampos','elem_tampos'], ['eletros','elem_eletros'], ['acessorios','elem_acessorios'],
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
  // Tarefas — importar e renderizar
  renderTarefasForm(p.tarefas || []);
  renderOcorrenciasForm(p.ocorrencias || []);
  renderNotasForm(p.notas || []);
  renderDocsForm(p.docs || []);
  renderThumbs();
  atualizarTotalPreview();

  // Histórico de reuniões — carregar do Firestore
  const blocoReunioes = document.getElementById('bloco-reunioes');
  const listaReunioes = document.getElementById('reunioes-historico-lista');
  if (blocoReunioes && listaReunioes) {
    blocoReunioes.style.display = 'none';
    listaReunioes.innerHTML = '';
    renderHistoricoReunioes(id, listaReunioes).then(() => {
      // renderHistoricoReunioes é async — mostrar bloco se houver conteúdo
      if (listaReunioes.children.length) blocoReunioes.style.display = '';
    });
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
  const tarefas = Array.from(document.querySelectorAll('#f-tarefas-lista .tarefa-form-item'))
    .map(el => ({
      id:          el.dataset.id || ('t-' + Date.now()),
      texto:       el.querySelector('.tarefa-form-texto')?.value?.trim()   || '',
      tipo:        el.querySelector('.tarefa-form-tipo')?.value             || 'geral',
      urgencia:    el.querySelector('.tarefa-form-urgencia')?.value         || 'normal',
      prazo:       el.querySelector('.tarefa-form-prazo')?.value            || null,
      concluida:   el.dataset.concluida === '1',
      dataCriacao: el.dataset.dataCriacao || new Date().toISOString(),
    }))
    .filter(t => t.texto);

  const notas = Array.from(document.querySelectorAll('#f-notas-lista .nota-form-item'))
    .map(el => ({
      titulo:  el.querySelector('.nota-form-titulo')?.value?.trim() || '',
      texto:   el.querySelector('.nota-form-input')?.value?.trim()  || '',
      seccao:  el.querySelector('.nota-form-seccao')?.value         || 'compromisso',
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
    elem_moveis:        recolherLinhasElem(document.getElementById('sec-elem-moveis')),
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
    interacoes, ocorrencias, tarefas,
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

  // ── Registo de versão — detectar alterações relevantes ──
  if (editId && idx >= 0) {
    const anterior = lista[idx];
    const alteracoes = [];
    // Calcular totais
    // calcTotal importado de utils.js
    const totalAnterior = calcTotal(anterior);
    const totalNovo     = calcTotal(proj);

    if (totalAnterior !== totalNovo) {
      const diff = totalNovo - totalAnterior;
      const sinal = diff > 0 ? '+' : '';
      alteracoes.push({
        tipo: 'orcamento',
        desc: `Orçamento actualizado: ${totalAnterior.toLocaleString('pt-PT',{minimumFractionDigits:2})} € → ${totalNovo.toLocaleString('pt-PT',{minimumFractionDigits:2})} € (${sinal}${diff.toLocaleString('pt-PT',{minimumFractionDigits:2})} €)`,
      });
    }

    if ((anterior.fase || 'proposta') !== (proj.fase || 'proposta')) {
      const faseLabels = { proposta:'Proposta', retificacao:'Retificação', aprovado:'Aprovado', encomenda:'Encomenda', entrega:'Entrega', montagem:'Montagem', concluido:'Concluído' };
      alteracoes.push({
        tipo: 'fase',
        desc: `Fase actualizada: ${faseLabels[anterior.fase]||anterior.fase} → ${faseLabels[proj.fase]||proj.fase}`,
      });
    }

    // Alterações em elementos (móveis, tampos, eletros, acessórios)
    const camposElem = [
      ['elem_moveis','Móveis'], ['elem_tampos','Tampos'],
      ['elem_eletros','Eletrodomésticos'], ['elem_acessorios','Acessórios'],
    ];
    camposElem.forEach(([campo, label]) => {
      const ant = JSON.stringify((anterior[campo]||[]).map(i=>i.nome).sort());
      const nov = JSON.stringify((proj[campo]||[]).map(i=>i.nome).sort());
      if (ant !== nov) {
        alteracoes.push({ tipo: 'elementos', desc: `Elementos actualizados: ${label}` });
      }
    });

    if (alteracoes.length) {
      const agora = new Date();
      const novaVersao = {
        data:       agora.toLocaleDateString('pt-PT'),
        dataISO:    agora.toISOString(),
        hora:       String(agora.getHours()).padStart(2,'0') + ':' + String(agora.getMinutes()).padStart(2,'0'),
        alteracoes,
        totalAnterior,
        totalNovo,
      };
      proj.versoes = [...(anterior.versoes || []), novaVersao];
    } else {
      proj.versoes = anterior.versoes || [];
    }
  }

  if (idx >= 0) lista[idx] = proj; else lista.unshift(proj);

  fecharModal();
  await guardar(proj);
  renderPainel();
}

export async function apagarProjeto(id) {
  const p = getProjects().find(x => x.id === id);
  if (!confirm(`Arquivar "${p?.nome || id}"?\nO projeto ficará guardado no Arquivo e pode ser restaurado.`)) return;
  try {
    await arquivarProjeto(id);
    mostrarToast('📦 Arquivado', `"${p?.nome || id}" movido para o Arquivo.`);
    renderPainel();
  } catch(e) { mostrarToast('✗ Erro ao arquivar', ''); }
}

export async function apagarDefinitivamente(id, nome) {
  if (!confirm(`Apagar permanentemente "${nome || id}"?\nEsta acção é irreversível.`)) return;
  try {
    await apagar(id);
    mostrarToast('🗑 Apagado', `"${nome || id}" eliminado permanentemente.`);
    renderArquivo();
  } catch(e) { mostrarToast('✗ Erro ao apagar', ''); }
}

export async function restaurar(id, nome) {
  try {
    await restaurarProjeto(id);
    mostrarToast('↩ Restaurado', `"${nome || id}" devolvido ao painel.`);
    renderArquivo();
  } catch(e) { mostrarToast('✗ Erro ao restaurar', ''); }
}

export async function renderArquivo() {
  const grid  = document.getElementById('arquivo-grid');
  const empty = document.getElementById('arquivo-empty');
  if (!grid) return;

  grid.innerHTML = '<div style="padding:24px;color:rgba(255,255,255,.3);font-size:12px">A carregar…</div>';
  const lista = await carregarArquivados();

  const pesquisa = (document.getElementById('arquivo-pesquisa')?.value || '').toLowerCase().trim();
  const filtrados = pesquisa
    ? lista.filter(p =>
        (p.nome||'').toLowerCase().includes(pesquisa) ||
        (p.localidade||'').toLowerCase().includes(pesquisa) ||
        (p.refPc||'').toLowerCase().includes(pesquisa) ||
        (p.refOs||'').toLowerCase().includes(pesquisa))
    : lista;

  if (empty) empty.style.display = filtrados.length ? 'none' : '';

  if (!filtrados.length) { grid.innerHTML = ''; return; }

  const { calcTotal } = await import('./utils.js');
  const { fmt } = await import('./ui.js');

  grid.innerHTML = filtrados.map(p => {
    const total   = calcTotal(p);
    const dataArq = p.dataArquivado
      ? new Date(p.dataArquivado).toLocaleDateString('pt-PT') : '—';
    const nomeEsc = (p.nome || '').replace(/'/g, "\'");
    const refPcHtml = p.refPc ? '<span class="card-ref-badge">PC: ' + p.refPc + '</span>' : '';
    const refOsHtml = p.refOs ? '<span class="card-ref-badge">OS: ' + p.refOs + '</span>' : '';
    const id = p.id;
    const btnRest   = '<button class="btn-card acomp" onclick="window.restaurar(\'' + id + '\',\'' + nomeEsc + '\')">↩ Restaurar</button>';
    const btnApagar = '<button class="btn-card danger" onclick="window.apagarDefinitivamente(\'' + id + '\',\'' + nomeEsc + '\')">🗑 Apagar</button>';
    return '<div class="proj-card fase-concluido arquivo-card">'
      + '<div class="card-top">'
      +   '<div class="card-tipo-badge">' + (p.tipo || '—') + '</div>'
      +   '<span class="proj-badge badge-arquivo">Arquivado</span>'
      + '</div>'
      + '<div class="card-nome">' + (p.nome || '—') + '</div>'
      + '<div class="card-local">' + (p.localidade || '') + refPcHtml + refOsHtml + '</div>'
      + '<div class="card-financeiro">'
      +   '<div class="card-total">' + (total > 0 ? fmt(total) : '—') + '</div>'
      +   '<div class="card-meta-right">'
      +     '<div class="card-aprovado" style="color:rgba(255,255,255,.35)">📦 ' + dataArq + '</div>'
      +   '</div>'
      + '</div>'
      + '<div class="card-actions">' + btnRest + btnApagar + '</div>'
      + '</div>';
  }).join('');
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

export async function verCliente(id) {
  setState({ projAtualId: id });
  let p = getProjects().find(x => x.id === id);
  // Projecto não está no estado activo (ex: arquivado) — carregar do Firestore
  if (!p) {
    const { carregarUm } = await import('./firebase.js');
    p = await carregarUm(id);
  }
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
  const p = getProjects().find(x => x.id === id);
  if (!p) return;

  const fmt = v => {
    const n = parseFloat(String(v || '0').replace(',', '.')) || 0;
    return n.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  };
  const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // Total
  const n = v => parseFloat(String(v || '0').replace(',', '.')) || 0;
  let total = 0;
  total += n(p.orc_moveis); total += n(p.orc_tampos);
  total += n(p.orc_eletros); total += n(p.orc_acessorios);
  (p.orcamento||[]).forEach(c => { total += n(c.valor); });

  // Categorias do orçamento
  const cats = [];
  const addCat = (label, val, desc, artigos) => {
    if (n(val) > 0) cats.push({ label, val: n(val), desc, artigos: artigos || [] });
  };
  addCat('Móveis',           p.orc_moveis,    p.orc_moveis_desc,    p.elem_moveis    || []);
  addCat('Tampos',           p.orc_tampos,    p.orc_tampos_desc,    p.elem_tampos    || []);
  addCat('Eletrodomésticos', p.orc_eletros,   p.orc_eletros_desc,   p.elem_eletros   || []);
  addCat('Acessórios',       p.orc_acessorios,p.orc_acessorios_desc,p.elem_acessorios|| []);
  (p.orcamento||[]).forEach(c => {
    if (n(c.valor) > 0) cats.push({ label: c.categoria, val: n(c.valor), desc: c.desc, artigos: [] });
  });

  // Incluídos
  const inc = p.incluido || {};
  const opcoes = [
    { key:'iva23',        label:'IVA à taxa legal em vigor (23%)' },
    { key:'entrega',      label:'Entrega na morada do cliente' },
    { key:'loja',         label:'Levantamento em loja (pelo cliente)' },
    { key:'instalacao',   label:'Instalação incluída' },
    { key:'inst-cliente', label:'Instalação a cargo do cliente' },
    { key:'iva6',         label:'IVA taxa reduzida 6% (mão de obra — renovação)' },
  ];
  const incluidos = opcoes.filter(o => inc[o.key]);

  // Notas
  const notas = Array.isArray(p.notas)
    ? p.notas.filter(n => n && (n.texto || typeof n === 'string'))
    : (p.notas ? [{ titulo: '', texto: p.notas }] : []);

  const dataHoje = new Date().toLocaleDateString('pt-PT');
  const prazoFmt = p.prazo
    ? new Date(p.prazo + 'T12:00:00').toLocaleDateString('pt-PT') : null;

  const html = `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Proposta — ${esc(p.nome)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'DM Sans', sans-serif; background: #fff; color: #1A1814; font-size: 11pt; line-height: 1.6; }
  @page { margin: 14mm 16mm; size: A4; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }

  /* Header */
  .pdf-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 12pt; border-bottom: 1.5pt solid #1A1814; margin-bottom: 14pt; }
  .pdf-marca { font-family: 'DM Serif Display', serif; font-size: 20pt; color: #1A1814; }
  .pdf-marca span { color: #C4A96A; font-style: italic; }
  .pdf-meta { text-align: right; font-family: 'DM Mono', monospace; font-size: 8pt; color: #706A62; line-height: 1.7; }
  .pdf-meta strong { color: #1A1814; font-size: 9pt; }

  /* Hero + Imagens — grelha 2 colunas */
  .pdf-hero {
    margin-bottom: 14pt;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    background: #F7F5F0;
    border-radius: 6pt;
    border-left: 3pt solid #C4A96A;
    overflow: hidden;
    height: 175pt;
  }
  .pdf-hero-sem-imgs {
    grid-template-columns: 1fr;
    height: auto;
  }
  .pdf-hero-left {
    padding: 16pt 16pt;
    display: flex;
    flex-direction: column;
    justify-content: center;
    overflow: hidden;
  }
  .pdf-eyebrow { font-family: 'DM Mono', monospace; font-size: 7pt; letter-spacing: .2em; text-transform: uppercase; color: #9C968E; margin-bottom: 4pt; }
  .pdf-titulo { font-family: 'DM Serif Display', serif; font-size: 15pt; color: #1A1814; line-height: 1.15; margin-bottom: 8pt; }
  .pdf-titulo span { color: #C4A96A; }
  .pdf-cliente-label { font-family: 'DM Mono', monospace; font-size: 7pt; letter-spacing: .2em; text-transform: uppercase; color: #9C968E; }
  .pdf-cliente-nome { font-family: 'DM Serif Display', serif; font-size: 13pt; color: #1A1814; margin-top: 1pt; }
  .pdf-tags { display: flex; gap: 5pt; margin-top: 8pt; flex-wrap: wrap; }
  .pdf-tag { font-family: 'DM Mono', monospace; font-size: 7pt; padding: 1.5pt 6pt; border: .5pt solid #C8C0B4; border-radius: 99pt; color: #706A62; }

  /* Coluna das imagens */
  .pdf-imgs-col {
    display: grid;
    grid-template-rows: 1fr 1fr 1fr;
    gap: 2pt;
    overflow: hidden;
    height: 175pt;
  }
  .pdf-imgs-col.rows-1 { grid-template-rows: 1fr; }
  .pdf-imgs-col.rows-2 { grid-template-rows: 1fr 1fr; }
  .pdf-img-col { width: 100%; height: 100%; object-fit: cover; display: block; }

  /* Secção */
  .pdf-sec { margin-bottom: 14pt; margin-top: 14pt; page-break-inside: avoid; }
  .pdf-sec-titulo { font-family: 'DM Mono', monospace; font-size: 7.5pt; letter-spacing: .2em; text-transform: uppercase; color: #9C968E; border-bottom: .5pt solid #E4DED4; padding-bottom: 4pt; margin-bottom: 10pt; }

  /* Orçamento */
  .pdf-total { display: flex; justify-content: space-between; align-items: center; padding: 11pt 14pt; background: #1A1814; border-radius: 6pt; margin-bottom: 10pt; }
  .pdf-total-label { font-family: 'DM Mono', monospace; font-size: 7.5pt; letter-spacing: .2em; text-transform: uppercase; color: #C4A96A; }
  .pdf-total-val { font-family: 'DM Serif Display', serif; font-size: 20pt; color: #F5F2EC; }
  .pdf-cat { display: flex; justify-content: space-between; align-items: baseline; padding: 5pt 0; border-bottom: .5pt solid #F0ECE4; }
  .pdf-cat:last-child { border-bottom: none; }
  .pdf-cat-nome { font-size: 10.5pt; color: #1A1814; font-weight: 500; }
  .pdf-cat-desc { font-size: 8.5pt; color: #9C968E; margin-top: 1pt; }
  .pdf-cat-val { font-family: 'DM Mono', monospace; font-size: 10.5pt; color: #1A1814; font-weight: 600; }
  .pdf-cat-pct { font-family: 'DM Mono', monospace; font-size: 7.5pt; color: #9C968E; margin-left: 6pt; }
  .pdf-artigos { margin-top: 3pt; padding-left: 8pt; }
  .pdf-artigo { font-size: 8.5pt; color: #706A62; padding: 1.5pt 0; border-bottom: .5pt dotted #F0ECE4; display: flex; justify-content: space-between; }
  .pdf-artigo:last-child { border-bottom: none; }

  /* Incluído */
  .pdf-inc-lista { display: flex; flex-direction: column; gap: 3pt; }
  .pdf-inc-item { display: flex; align-items: center; gap: 6pt; font-size: 9.5pt; color: #3D3930; }
  .pdf-inc-check { width: 9pt; height: 9pt; border-radius: 2pt; background: #C4A96A; display: inline-flex; align-items: center; justify-content: center; color: #fff; font-size: 6.5pt; flex-shrink: 0; }

  /* Notas */
  .pdf-nota { padding: 8pt 10pt; background: #F7F5F0; border-radius: 4pt; border-left: 2pt solid #C4A96A; margin-bottom: 6pt; page-break-inside: avoid; }
  .pdf-nota-titulo { font-weight: 600; font-size: 9.5pt; color: #1A1814; margin-bottom: 3pt; }
  .pdf-nota-texto { font-size: 9.5pt; color: #706A62; line-height: 1.55; }

  /* Footer */
  .pdf-footer { margin-top: 18pt; padding-top: 10pt; border-top: .5pt solid #E4DED4; display: flex; justify-content: space-between; align-items: flex-end; }
  .pdf-footer-hm { font-family: 'DM Serif Display', serif; font-size: 12pt; color: #1A1814; }
  .pdf-footer-cargo { font-family: 'DM Mono', monospace; font-size: 7.5pt; color: #9C968E; margin-top: 2pt; }
  .pdf-footer-contacto { font-family: 'DM Mono', monospace; font-size: 8.5pt; color: #706A62; text-align: right; line-height: 1.8; }
  .pdf-validade { font-family: 'DM Mono', monospace; font-size: 7.5pt; color: #9C968E; margin-top: 8pt; padding-top: 6pt; border-top: .5pt dotted #E4DED4; }
</style>
</head>
<body>

<!-- HEADER -->
<div class="pdf-header">
  <div class="pdf-marca">Projetos <span>LM</span></div>
  <div class="pdf-meta">
    <strong>${esc(p.nome)}</strong><br>
    ${esc(p.localidade || '')}<br>
    ${p.refPc ? `PC: ${esc(p.refPc)}` : ''}${p.refPc && p.refOs ? ' · ' : ''}${p.refOs ? `OS: ${esc(p.refOs)}` : ''}<br>
    Emitido em ${dataHoje}
  </div>
</div>

<!-- HERO + IMAGENS -->
${(() => {
  const imgs = (p.imagens||[]).slice(0,1);
  const temImgs = imgs.length > 0;
  const rowsClass = imgs.length === 1 ? 'rows-1' : imgs.length === 2 ? 'rows-2' : 'rows-3';
  const imgsCol = temImgs ? `
    <div class="pdf-imgs-col ${rowsClass}">
      ${imgs.map(src => `<img class="pdf-img-col" src="${src}" alt="">`).join('')}
    </div>` : '';
  return `
  <div class="pdf-hero${temImgs ? '' : ' pdf-hero-sem-imgs'}">
    <div class="pdf-hero-left">
      <div class="pdf-eyebrow">Proposta Personalizada</div>
      <div class="pdf-titulo">Um espaço pensado para <span>viver.</span></div>
      <div class="pdf-cliente-label">Desenvolvido exclusivamente para</div>
      <div class="pdf-cliente-nome">${esc(p.nome)}</div>
      <div class="pdf-tags">
        ${p.tipo ? `<span class="pdf-tag">${esc(p.tipo === 'outro' ? (p.tipoOutro || 'Outro') : p.tipo)}</span>` : ''}
        ${p.localidade ? `<span class="pdf-tag">${esc(p.localidade)}</span>` : ''}
        ${prazoFmt ? `<span class="pdf-tag">Válido até ${prazoFmt}</span>` : ''}
      </div>
    </div>
    ${imgsCol}
  </div>`;
})()}
<div class="pdf-sec">
  <div class="pdf-sec-titulo">Proposta Financeira — O seu Orçamento</div>
  <div class="pdf-total">
    <div class="pdf-total-label">Total do Projeto</div>
    <div class="pdf-total-val">${fmt(total)}</div>
  </div>
  ${cats.map(c => `
    <div class="pdf-cat">
      <div>
        <div class="pdf-cat-nome">${esc(c.label)}</div>
        ${c.desc ? `<div class="pdf-cat-desc">${esc(c.desc)}</div>` : ''}
        ${c.artigos.length ? `<div class="pdf-artigos">${c.artigos.map(a => `
          <div class="pdf-artigo">
            <span>${esc(a.nome)}</span>
            ${a.preco && parseFloat(a.preco) > 0 ? `<span>${fmt(a.preco)}</span>` : ''}
          </div>`).join('')}</div>` : ''}
      </div>
      <div style="text-align:right;flex-shrink:0;padding-left:14pt">
        <span class="pdf-cat-val">${fmt(c.val)}</span>
        ${total > 0 ? `<span class="pdf-cat-pct">${Math.round((c.val/total)*100)}%</span>` : ''}
      </div>
    </div>`).join('')}
</div>

${incluidos.length ? `
<!-- INCLUÍDO -->
<div class="pdf-sec">
  <div class="pdf-sec-titulo">O que está incluído</div>
  <div class="pdf-inc-lista">
    ${incluidos.map(o => `
      <div class="pdf-inc-item">
        <span class="pdf-inc-check">✓</span>
        ${esc(o.label)}
      </div>`).join('')}
  </div>
</div>` : ''}

${notas.length ? `
<!-- NOTAS -->
<div class="pdf-sec">
  <div class="pdf-sec-titulo">Notas Importantes</div>
  ${notas.map(nota => {
    const titulo = typeof nota === 'string' ? '' : (nota.titulo || '');
    const texto  = typeof nota === 'string' ? nota : (nota.texto || '');
    return `<div class="pdf-nota">
      ${titulo ? `<div class="pdf-nota-titulo">${esc(titulo)}</div>` : ''}
      <div class="pdf-nota-texto">${esc(texto)}</div>
    </div>`;
  }).join('')}
</div>` : ''}

<!-- FOOTER -->
<div class="pdf-footer">
  <div>
    <div class="pdf-footer-hm">Hélder Melo</div>
    <div class="pdf-footer-cargo">Assessor Projeto (AP) · Leroy Merlin Portugal</div>
    ${prazoFmt ? `<div class="pdf-validade">Proposta válida até ${prazoFmt}</div>` : ''}
  </div>
  <div class="pdf-footer-contacto">
    917 880 364<br>
    helder.melo@leroymerlin.pt
  </div>
</div>

<script>
  window.onload = () => {
    const imgs = Array.from(document.images);
    if (!imgs.length) { window.print(); return; }
    let loaded = 0;
    const tryPrint = () => { if (++loaded >= imgs.length) window.print(); };
    imgs.forEach(img => {
      if (img.complete) tryPrint();
      else { img.onload = tryPrint; img.onerror = tryPrint; }
    });
  };
</script>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
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



// ══════════════════════════════════════════════════
// DRAWER DE ACOMPANHAMENTO
// ══════════════════════════════════════════════════

let _acompProjId = null;

export function abrirDrawerAcompanhamento(id) {
  _acompProjId = id;
  window._acompProjId = id; // expor para os onclick do HTML
  setState({ editId: id }); // necessário para renderMensagensModal usar getEditId()
  const p = getProjects().find(x => x.id === id);
  if (!p) return;

  // Cabeçalho
  document.getElementById('acomp-nome').textContent = p.nome || '—';
  const faseLabels = {
    proposta: 'Proposta', retificacao: 'Retificação', aprovado: 'Aprovado',
    encomenda: 'Encomenda', entrega: 'Entrega', montagem: 'Montagem', concluido: 'Concluído'
  };
  const faseEl = document.getElementById('acomp-fase');
  if (faseEl) {
    faseEl.textContent = faseLabels[p.fase] || p.fase || '';
    faseEl.className = `acomp-fase acomp-fase-${p.fase || 'proposta'}`;
  }

  // Activar tab interacções por defeito
  setAcompTab('interacoes', document.querySelector('.acomp-tab'));

  // Render interacções
  _renderAcompInteracoes(p.interacoes || []);

  // Render ocorrências
  renderOcorrenciasForm(p.ocorrencias || []);
  // Mover lista para o drawer
  const ocorrLista = document.getElementById('f-ocorrencias-lista');
  const acompOcorrLista = document.getElementById('acomp-ocorr-lista');
  if (ocorrLista && acompOcorrLista) acompOcorrLista.innerHTML = ocorrLista.innerHTML;

  // Render mensagens
  renderMensagensModal(id);
  // Copiar para o drawer
  setTimeout(() => {
    const modalLista = document.getElementById('modal-msgs-lista');
    const acompLista = document.getElementById('acomp-msgs-lista');
    if (modalLista && acompLista) acompLista.innerHTML = modalLista.innerHTML;
  }, 300);

  // Reuniões
  _renderAcompReunioes(id);

  // Tarefas
  renderTarefasDrawer(id);

  // Abrir
  const drawer = document.getElementById('acomp-drawer');
  const overlay = document.getElementById('acomp-overlay');
  drawer.style.display = 'block';
  overlay.style.display = 'block';
  setTimeout(() => {
    drawer.classList.add('acomp-drawer-open');
    overlay.classList.add('acomp-overlay-show');
    document.body.style.overflow = 'hidden';
  }, 10);
}

export function fecharDrawerAcompanhamento() {
  const drawer = document.getElementById('acomp-drawer');
  const overlay = document.getElementById('acomp-overlay');
  if (!drawer) return;
  drawer.classList.remove('acomp-drawer-open');
  overlay?.classList.remove('acomp-overlay-show');
  document.body.style.overflow = '';
  setTimeout(() => {
    drawer.style.display = 'none';
    overlay.style.display = 'none';
  }, 400);
}

export function setAcompTab(tab, btnEl) {
  // Desactivar todas as tabs
  document.querySelectorAll('.acomp-tab').forEach(b => b.classList.remove('acomp-tab-ativa'));
  document.querySelectorAll('.acomp-tab-content').forEach(c => c.style.display = 'none');
  // Activar tab seleccionada
  if (btnEl) btnEl.classList.add('acomp-tab-ativa');
  const content = document.getElementById(`acomp-tab-${tab}`);
  if (content) content.style.display = 'block';
}

function _renderAcompInteracoes(list) {
  const el = document.getElementById('acomp-int-lista');
  if (!el) return;
  const tipoIcons = { nota:'📝', chamada:'📞', email:'✉️', visita:'🏠', whatsapp:'💬' };
  if (!list.length) {
    el.innerHTML = '<div class="acomp-vazio">Sem interacções registadas.</div>';
    return;
  }
  el.innerHTML = list.slice().reverse().map(i => `
    <div class="interacao-item">
      <span class="int-tipo tipo-${i.tipo}">${tipoIcons[i.tipo] || ''} ${i.tipo}</span>
      <span class="int-texto">${esc(i.texto)}</span>
      <span class="int-data">${i.data || ''} ${i.hora || ''}</span>
    </div>`).join('');
}

async function _renderAcompReunioes(id) {
  const el = document.getElementById('acomp-reunioes-lista');
  if (!el) return;
  el.innerHTML = '<div class="acomp-vazio">A carregar…</div>';
  const { carregarReunioesFirebase } = await import('./firebase.js');
  const reunioes = await carregarReunioesFirebase(id);
  if (!reunioes.length) {
    el.innerHTML = '<div class="acomp-vazio">Sem reuniões registadas.</div>';
    return;
  }
  el.innerHTML = reunioes.map(r => `
    <div class="hist-reuniao-item">
      <div class="hist-reuniao-data">${r.data || ''} ${r.hora || ''}</div>
      <div class="hist-reuniao-texto">${esc(r.texto || r.nota || '')}</div>
    </div>`).join('');
}

// Adicionar interacção a partir do drawer
window._acompAddInteracao = function() {
  if (!_acompProjId) return;
  const tipo  = document.getElementById('acomp-int-tipo')?.value;
  const texto = document.getElementById('acomp-int-texto')?.value?.trim();
  if (!texto) return;

  const agora = new Date();
  const data  = agora.toLocaleDateString('pt-PT');
  const hora  = String(agora.getHours()).padStart(2,'0') + ':' + String(agora.getMinutes()).padStart(2,'0');

  // Guardar no projecto
  const projetos = getProjects();
  const p = projetos.find(x => x.id === _acompProjId);
  if (!p) return;
  const novaInt = { tipo, texto, data, hora };
  p.interacoes = [novaInt, ...(p.interacoes || [])];

  // Guardar no Firestore
  import('./firebase.js').then(({ guardar }) => {
    guardar(p).catch(console.warn);
  });

  _renderAcompInteracoes(p.interacoes);
  document.getElementById('acomp-int-texto').value = '';
};

// Adicionar ocorrência a partir do drawer
window._acompAddOcorrencia = function() {
  if (!_acompProjId) return;
  const tipo   = document.getElementById('acomp-ocorr-tipo')?.value;
  const estado = document.getElementById('acomp-ocorr-estado')?.value || 'detectada';
  const desc   = document.getElementById('acomp-ocorr-desc')?.value?.trim();
  if (!desc) return;

  const data = new Date().toLocaleDateString('pt-PT');
  const projetos = getProjects();
  const p = projetos.find(x => x.id === _acompProjId);
  if (!p) return;

  const novaOcorr = {
    id: 'oc-' + Date.now(), tipo, descricao: desc, estado, data,
    actualizacoes: [{ data, dataISO: new Date().toISOString(), estado, nota: 'Registada por HM.', autor: 'hm' }]
  };
  p.ocorrencias = [...(p.ocorrencias || []), novaOcorr];

  import('./firebase.js').then(({ guardar }) => {
    guardar(p).catch(console.warn);
  });

  renderOcorrenciasForm(p.ocorrencias);
  const ocorrLista = document.getElementById('f-ocorrencias-lista');
  const acompOcorrLista = document.getElementById('acomp-ocorr-lista');
  if (ocorrLista && acompOcorrLista) acompOcorrLista.innerHTML = ocorrLista.innerHTML;
  document.getElementById('acomp-ocorr-desc').value = '';
};

// Responder mensagem a partir do drawer
window._acompResponderMsg = async function() {
  await window._responderMensagemModal?.();
};

window.abrirDrawerAcompanhamento  = abrirDrawerAcompanhamento;
window.fecharDrawerAcompanhamento = fecharDrawerAcompanhamento;
window.setAcompTab                = setAcompTab;
window.renderArquivo              = renderArquivo;
window.restaurar                  = restaurar;
window.apagarDefinitivamente      = apagarDefinitivamente;

// Guardar ocorrências actualizadas no drawer → Firestore
window._guardarOcorrenciasDrawer = function() {
  if (!_acompProjId) return;
  const projetos = getProjects();
  const p = projetos.find(x => x.id === _acompProjId);
  if (!p) return;

  // Reler estado completo dos itens no drawer
  const itens = document.querySelectorAll('#acomp-ocorr-lista .ocorr-item');
  if (!itens.length) return;

  p.ocorrencias = Array.from(itens).map(el => {
    const acts = Array.from(el.querySelectorAll('.ocorr-act-item')).map(a => ({
      data:    a.dataset.data    || '',
      dataISO: a.dataset.dataiso || '',
      estado:  a.dataset.estado  || 'detectada',
      nota:    a.dataset.nota    || '',
      autor:   a.dataset.autor   || 'hm',
    }));
    return {
      id:            el.dataset.id       || ('oc-' + Date.now()),
      tipo:          el.dataset.tipo     || 'outro',
      descricao:     el.dataset.desc     || '',
      estado:        el.dataset.estado   || 'detectada',
      data:          el.dataset.data     || '',
      dataISO:       el.dataset.dataiso  || '',
      urgencia:      el.dataset.urgencia || 'normal',
      actualizacoes: acts,
    };
  });

  import('./firebase.js').then(({ guardar }) => {
    guardar(p)
      .then(() => mostrarToast('✓ Actualização guardada', ''))
      .catch(e => { console.warn('Erro ao guardar:', e); mostrarToast('⚠️ Erro ao guardar', ''); });
  });
};
