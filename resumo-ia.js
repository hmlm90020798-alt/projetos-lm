// ════════════════════════════════════════════════
// resumo-ia.js — Resumo IA por projecto · Projetos LM
// Usa a API Anthropic para gerar análise narrativa
// ════════════════════════════════════════════════

import { getState } from './state.js';
import { mostrarToast } from './ui.js';

// ── Construir contexto completo do projecto ───────

function construirContexto(p) {
  const faseLabels = {
    proposta: 'Em proposta',
    retificacao: 'Em rectificação',
    aprovado: 'Aprovado',
    encomenda: 'Materiais encomendados',
    entrega: 'Entrega agendada',
    montagem: 'Instalação em curso',
    concluido: 'Concluído',
  };
  const tipoLabels = {
    cozinha: 'Cozinha',
    'casa-de-banho': 'Casa de Banho',
    roupeiro: 'Roupeiro',
    'renovacao-parcial': 'Renovação Parcial',
    aquecimento: 'Aquecimento',
  };

  const hoje = new Date();
  const fmt  = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-PT') : null;

  // Calcular dias desde criação
  let diasCriado = null;
  if (p.dataCriacao) {
    const [d, m, y] = p.dataCriacao.split('/');
    const dc = new Date(y, m - 1, d);
    diasCriado = Math.round((hoje - dc) / 86400000);
  }

  // Total orçamento
  const cats = [
    { nome: 'Móveis',           val: parseFloat(p.orc_moveis)    || 0 },
    { nome: 'Tampos',           val: parseFloat(p.orc_tampos)    || 0 },
    { nome: 'Eletrodomésticos', val: parseFloat(p.orc_eletros)   || 0 },
    { nome: 'Acessórios',       val: parseFloat(p.orc_acessorios)|| 0 },
    ...((p.orcamento || []).map(c => ({ nome: c.categoria, val: parseFloat(c.valor) || 0 }))),
  ].filter(c => c.val > 0);
  const total = cats.reduce((s, c) => s + c.val, 0);

  // Ocorrências activas
  const ocorAtivas = (p.ocorrencias || []).filter(o => o.estado !== 'resolvida');
  const ocorResolvidas = (p.ocorrencias || []).filter(o => o.estado === 'resolvida');

  // Interacções recentes
  const interacoes = (p.interacoes || []).slice(-5);

  // Visitas
  const visitas = getState('visitasCache')?.[p.id];

  // Documentos
  const docs = (p.docs || []);

  // Notas
  const notas = Array.isArray(p.notas) ? p.notas : (p.notas ? [{ texto: p.notas }] : []);

  // Incluído
  const inc = p.incluido || {};
  const incluidos = [
    inc.iva23        && 'IVA 23%',
    inc.iva6         && 'IVA 6% mão de obra',
    inc.entrega      && 'Entrega incluída',
    inc.loja         && 'Levantamento em loja',
    inc.instalacao   && 'Instalação incluída',
    inc['inst-cliente'] && 'Instalação a cargo do cliente',
    inc.pack         && 'Desconto Pack Projeto 10%',
  ].filter(Boolean);

  return {
    // Identificação
    nome:            p.nome || '—',
    tipo:            tipoLabels[p.tipo] || p.tipoOutro || p.tipo || '—',
    localidade:      p.localidade || '—',
    refPc:           p.refPc || null,
    refOs:           p.refOs || null,

    // Estado
    fase:            faseLabels[p.fase] || p.fase || '—',
    diasCriado,
    aprovacao:       p.aprovacao || null,
    prazo:           fmt(p.prazo),
    dataInstalacao:  fmt(p.dataInstalacao),

    // Financeiro
    total,
    cats,
    incluidos,

    // Ocorrências
    ocorAtivas,
    ocorResolvidas,

    // Interacções
    interacoes,

    // Visitas
    visitas,

    // Docs e notas
    docs,
    notas,
  };
}

// ── Gerar prompt ──────────────────────────────────

function gerarPrompt(ctx) {
  const linhas = [];

  linhas.push(`DADOS DO PROJECTO:`);
  linhas.push(`Cliente: ${ctx.nome}`);
  linhas.push(`Tipo: ${ctx.tipo}`);
  linhas.push(`Localidade: ${ctx.localidade}`);
  if (ctx.refPc) linhas.push(`Referência PC: ${ctx.refPc}`);
  if (ctx.refOs) linhas.push(`Ordem de Serviço: ${ctx.refOs}`);
  linhas.push(`Fase actual: ${ctx.fase}`);
  if (ctx.diasCriado !== null) linhas.push(`Projecto criado há ${ctx.diasCriado} dias`);
  if (ctx.prazo) linhas.push(`Prazo da proposta: ${ctx.prazo}`);
  if (ctx.aprovacao?.data) linhas.push(`Aprovado pelo cliente em: ${ctx.aprovacao.data} às ${ctx.aprovacao.hora || '--'} (via ${ctx.aprovacao.origem === 'cliente' ? 'página do cliente' : 'painel'})`);
  if (ctx.dataInstalacao) linhas.push(`Data de instalação prevista: ${ctx.dataInstalacao}`);

  if (ctx.total > 0) {
    linhas.push(`\nORÇAMENTO TOTAL: ${ctx.total.toLocaleString('pt-PT', { minimumFractionDigits: 2 })} €`);
    ctx.cats.forEach(c => linhas.push(`  - ${c.nome}: ${c.val.toLocaleString('pt-PT', { minimumFractionDigits: 2 })} €`));
    if (ctx.incluidos.length) linhas.push(`Incluído: ${ctx.incluidos.join(', ')}`);
  }

  if (ctx.ocorAtivas.length) {
    linhas.push(`\nOCORRÊNCIAS ACTIVAS (${ctx.ocorAtivas.length}):`);
    ctx.ocorAtivas.forEach(o => linhas.push(`  - [${o.estado}] ${o.tipo}: ${o.descricao || '—'}`));
  }
  if (ctx.ocorResolvidas.length) {
    linhas.push(`Ocorrências resolvidas: ${ctx.ocorResolvidas.length}`);
  }

  if (ctx.interacoes.length) {
    linhas.push(`\nÚLTIMAS INTERACÇÕES:`);
    ctx.interacoes.forEach(i => linhas.push(`  - [${i.tipo}] ${i.data || ''}: ${i.nota || '—'}`));
  }

  if (ctx.visitas?.total) {
    linhas.push(`\nVisitas do cliente à proposta: ${ctx.visitas.total}`);
    const ultima = ctx.visitas.visitas?.slice(-1)[0];
    if (ultima) linhas.push(`Última visita: ${ultima.data} às ${ultima.hora}`);
  }

  if (ctx.notas.length) {
    linhas.push(`\nNOTAS:`);
    ctx.notas.forEach(n => {
      const titulo = typeof n === 'string' ? '' : n.titulo;
      const texto  = typeof n === 'string' ? n  : n.texto;
      linhas.push(`  - ${titulo ? titulo + ': ' : ''}${texto}`);
    });
  }

  if (ctx.docs.length) {
    linhas.push(`\nDocumentos partilhados: ${ctx.docs.map(d => d.nome).join(', ')}`);
  }

  return linhas.join('\n');
}

// ── Chamar API Anthropic ──────────────────────────

async function chamarAPI(prompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: `És um assistente de gestão de projetos de interiores para Hélder Melo, VPR da Leroy Merlin Portugal.
Recebes os dados completos de um projeto e deves gerar um resumo narrativo profissional e directo em português europeu.
O resumo deve:
- Começar com uma frase de síntese do estado actual
- Descrever o que já aconteceu (aprovação, encomendas, interacções)
- Referir o que está em curso e eventuais alertas (ocorrências activas, prazos)
- Antecipar os próximos passos esperados
- Mencionar aspectos financeiros relevantes se pertinente
- Ser conciso (máximo 5 parágrafos), narrativo e orientado para acção
- Nunca usar listas com bullets — texto corrido e natural
Não inventes dados que não estejam nos dados fornecidos.`,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Erro ${response.status}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || '';
}

// ── Modal de resumo ───────────────────────────────

export function abrirResumoIA(projetoId) {
  const projetos = getState('projetos');
  const p = projetos.find(x => x.id === projetoId);
  if (!p) { mostrarToast('Projecto não encontrado', ''); return; }

  // Criar modal se não existir
  let modal = document.getElementById('modal-resumo-ia');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-resumo-ia';
    modal.className = 'resumo-overlay';
    modal.innerHTML = `
      <div class="resumo-modal">
        <div class="resumo-header">
          <div class="resumo-header-left">
            <span class="resumo-icon">✦</span>
            <div>
              <div class="resumo-titulo">Resumo IA</div>
              <div class="resumo-sub" id="resumo-sub"></div>
            </div>
          </div>
          <div class="resumo-header-actions">
            <button class="resumo-btn-regen" id="resumo-btn-regen" onclick="window.regenerarResumoIA()">↺ Regenerar</button>
            <button class="modal-close" onclick="window.fecharResumoIA()">×</button>
          </div>
        </div>
        <div class="resumo-body" id="resumo-body">
          <div class="resumo-loading">
            <div class="resumo-spinner"></div>
            <span>A analisar o projecto…</span>
          </div>
        </div>
        <div class="resumo-footer">
          <button class="resumo-btn-copiar" onclick="window.copiarResumoIA()">📋 Copiar resumo</button>
          <span class="resumo-disclaimer">Gerado por IA — verificar sempre os dados</span>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }

  // Guardar projecto actual para regenerar
  window._resumoIAProjId = projetoId;

  // Abrir modal
  modal.classList.add('open');
  document.getElementById('resumo-sub').textContent = `${p.nome} · ${p.localidade || ''}`;
  gerarResumo(p);
}

async function gerarResumo(p) {
  const body   = document.getElementById('resumo-body');
  const btnReg = document.getElementById('resumo-btn-regen');
  if (!body) return;

  body.innerHTML = `
    <div class="resumo-loading">
      <div class="resumo-spinner"></div>
      <span>A analisar o projecto…</span>
    </div>`;
  if (btnReg) btnReg.disabled = true;

  try {
    const ctx    = construirContexto(p);
    const prompt = gerarPrompt(ctx);
    const texto  = await chamarAPI(prompt);

    // Guardar para copiar
    window._resumoIATexto = texto;

    // Renderizar em parágrafos
    const paragrafos = texto.split('\n').filter(l => l.trim());
    body.innerHTML = paragrafos.map(l =>
      `<p class="resumo-paragrafo">${l}</p>`
    ).join('');

  } catch (e) {
    body.innerHTML = `
      <div class="resumo-erro">
        <div class="resumo-erro-icon">⚠️</div>
        <div>Não foi possível gerar o resumo.</div>
        <div class="resumo-erro-detalhe">${e.message}</div>
      </div>`;
    mostrarToast('Erro ao gerar resumo', e.message);
  } finally {
    if (btnReg) btnReg.disabled = false;
  }
}

export function fecharResumoIA() {
  const modal = document.getElementById('modal-resumo-ia');
  if (modal) modal.classList.remove('open');
}

export function regenerarResumoIA() {
  const id = window._resumoIAProjId;
  if (!id) return;
  const p = getState('projetos').find(x => x.id === id);
  if (p) gerarResumo(p);
}

export function copiarResumoIA() {
  const texto = window._resumoIATexto;
  if (!texto) return;
  navigator.clipboard.writeText(texto).then(() => {
    mostrarToast('✓ Resumo copiado', '');
  });
}
