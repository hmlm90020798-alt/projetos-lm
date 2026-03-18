// ════════════════════════════════════════════════
// resumo-ia.js — Resumo IA por projecto · Projetos LM
// Usa a API Google Gemini para gerar análise narrativa
// API key guardada em localStorage (nunca vai para o GitHub)
// ════════════════════════════════════════════════

import { getState } from './state.js';
import { mostrarToast } from './ui.js';

// ── Gestão segura da API Key (localStorage) ───────

const LS_KEY = 'projetos_lm_gemini_key';

function obterApiKey() {
  return localStorage.getItem(LS_KEY) || '';
}

function guardarApiKey(key) {
  localStorage.setItem(LS_KEY, key.trim());
}

function mostrarConfigKey() {
  const keyAtual = obterApiKey();

  let modal = document.getElementById('modal-gemini-key');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-gemini-key';
    modal.className = 'resumo-overlay';
    modal.innerHTML = `
      <div class="resumo-modal" style="max-width:440px">
        <div class="resumo-header">
          <div class="resumo-header-left">
            <span class="resumo-icon">🔑</span>
            <div>
              <div class="resumo-titulo">Configurar IA</div>
              <div class="resumo-sub">Google Gemini API Key</div>
            </div>
          </div>
          <button class="modal-close" onclick="document.getElementById('modal-gemini-key').classList.remove('open')">×</button>
        </div>
        <div class="resumo-body" style="padding:1.5rem">
          <p style="margin:0 0 1rem;font-size:.9rem;color:var(--text-secondary,#666);line-height:1.5">
            A chave API é guardada apenas no teu browser (localStorage) e nunca é enviada para o GitHub ou partilhada.
          </p>
          <label style="display:block;font-size:.85rem;font-weight:600;margin-bottom:.4rem">Google Gemini API Key</label>
          <input
            id="gemini-key-input"
            type="password"
            placeholder="AIza..."
            style="width:100%;box-sizing:border-box;padding:.6rem .8rem;border:1px solid var(--border,#ddd);border-radius:8px;font-size:.9rem;font-family:monospace"
            value="${keyAtual}"
          />
          <p style="margin:.6rem 0 0;font-size:.8rem;color:var(--text-secondary,#888)">
            Obtém a tua chave gratuita em <a href="https://aistudio.google.com" target="_blank" style="color:var(--accent,#4f8ef7)">aistudio.google.com</a>
          </p>
        </div>
        <div class="resumo-footer" style="justify-content:flex-end;gap:.5rem">
          <button class="resumo-btn-copiar" onclick="document.getElementById('modal-gemini-key').classList.remove('open')">Cancelar</button>
          <button class="resumo-btn-regen" style="opacity:1" onclick="window._guardarGeminiKey()">✓ Guardar e continuar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  } else {
    // Atualizar valor do input se o modal já existia
    const input = document.getElementById('gemini-key-input');
    if (input) input.value = keyAtual;
  }

  modal.classList.add('open');
}

window._guardarGeminiKey = function () {
  const input = document.getElementById('gemini-key-input');
  const key = input?.value?.trim() || '';
  if (!key || !key.startsWith('AIza')) {
    mostrarToast('⚠️ Chave inválida', 'A chave deve começar por AIza…');
    return;
  }
  guardarApiKey(key);
  document.getElementById('modal-gemini-key').classList.remove('open');
  mostrarToast('✓ Chave guardada', 'A IA está pronta a usar');

  // Se havia um projecto pendente, gerar resumo agora
  const id = window._resumoIAProjId;
  if (id) {
    const p = getState('projetos').find(x => x.id === id);
    if (p) gerarResumo(p);
  }
};

// ── Construir contexto completo do projecto ───────

function construirContexto(p) {
  const faseLabels = {
    proposta:   'Em proposta',
    retificacao:'Em rectificação',
    aprovado:   'Aprovado',
    encomenda:  'Materiais encomendados',
    entrega:    'Entrega agendada',
    montagem:   'Instalação em curso',
    concluido:  'Concluído',
  };
  const tipoLabels = {
    cozinha:           'Cozinha',
    'casa-de-banho':   'Casa de Banho',
    roupeiro:          'Roupeiro',
    'renovacao-parcial':'Renovação Parcial',
    aquecimento:       'Aquecimento',
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
    { nome: 'Móveis',           val: parseFloat(p.orc_moveis)     || 0 },
    { nome: 'Tampos',           val: parseFloat(p.orc_tampos)     || 0 },
    { nome: 'Eletrodomésticos', val: parseFloat(p.orc_eletros)    || 0 },
    { nome: 'Acessórios',       val: parseFloat(p.orc_acessorios) || 0 },
    ...((p.orcamento || []).map(c => ({ nome: c.categoria, val: parseFloat(c.valor) || 0 }))),
  ].filter(c => c.val > 0);
  const total = cats.reduce((s, c) => s + c.val, 0);

  // Ocorrências activas
  const ocorAtivas     = (p.ocorrencias || []).filter(o => o.estado !== 'resolvida');
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
    inc.iva23           && 'IVA 23%',
    inc.iva6            && 'IVA 6% mão de obra',
    inc.entrega         && 'Entrega incluída',
    inc.loja            && 'Levantamento em loja',
    inc.instalacao      && 'Instalação incluída',
    inc['inst-cliente'] && 'Instalação a cargo do cliente',
    inc.pack            && 'Desconto Pack Projeto 10%',
  ].filter(Boolean);

  return {
    nome:           p.nome || '—',
    tipo:           tipoLabels[p.tipo] || p.tipoOutro || p.tipo || '—',
    localidade:     p.localidade || '—',
    refPc:          p.refPc || null,
    refOs:          p.refOs || null,
    fase:           faseLabels[p.fase] || p.fase || '—',
    diasCriado,
    aprovacao:      p.aprovacao || null,
    prazo:          fmt(p.prazo),
    dataInstalacao: fmt(p.dataInstalacao),
    total,
    cats,
    incluidos,
    ocorAtivas,
    ocorResolvidas,
    interacoes,
    visitas,
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

// ── Chamar API Google Gemini ──────────────────────

const SYSTEM_PROMPT = `És um assistente de gestão de projetos de interiores para Hélder Melo, VPR da Leroy Merlin Portugal.
Recebes os dados completos de um projeto e deves gerar um resumo narrativo profissional e directo em português europeu.
O resumo deve:
- Começar com uma frase de síntese do estado actual
- Descrever o que já aconteceu (aprovação, encomendas, interacções)
- Referir o que está em curso e eventuais alertas (ocorrências activas, prazos)
- Antecipar os próximos passos esperados
- Mencionar aspectos financeiros relevantes se pertinente
- Ser conciso (máximo 5 parágrafos), narrativo e orientado para acção
- Nunca usar listas com bullets — texto corrido e natural
Não inventes dados que não estejam nos dados fornecidos.`;

async function chamarAPI(prompt) {
  const apiKey = obterApiKey();
  if (!apiKey) throw new Error('SEM_KEY');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 1000, temperature: 0.7 },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const msg = err.error?.message || `Erro ${response.status}`;
    // Chave inválida → limpar e pedir nova
    if (response.status === 400 || response.status === 403) {
      localStorage.removeItem(LS_KEY);
      throw new Error('CHAVE_INVALIDA');
    }
    throw new Error(msg);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ── Modal de resumo ───────────────────────────────

export function abrirResumoIA(projetoId) {
  const projetos = getState('projetos');
  const p = projetos.find(x => x.id === projetoId);
  if (!p) { mostrarToast('Projecto não encontrado', ''); return; }

  // Guardar projecto actual para regenerar / após config de key
  window._resumoIAProjId = projetoId;

  // Se não tem key, mostrar configuração primeiro
  if (!obterApiKey()) {
    mostrarConfigKey();
    return;
  }

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
            <button class="resumo-btn-config" title="Configurar API Key" onclick="window._abrirConfigKey()">🔑</button>
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
          <span class="resumo-disclaimer">Gerado por Gemini IA — verificar sempre os dados</span>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }

  // Abrir modal
  modal.classList.add('open');
  document.getElementById('resumo-sub').textContent = `${p.nome} · ${p.localidade || ''}`;
  gerarResumo(p);
}

// Expor função de config de key para o botão 🔑 no header do modal
window._abrirConfigKey = function () {
  fecharResumoIA();
  mostrarConfigKey();
};

async function gerarResumo(p) {
  const body   = document.getElementById('resumo-body');
  const btnReg = document.getElementById('resumo-btn-regen');
  if (!body) return;

  // Garantir que o modal está aberto
  const modal = document.getElementById('modal-resumo-ia');
  if (modal) modal.classList.add('open');

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
    if (e.message === 'SEM_KEY' || e.message === 'CHAVE_INVALIDA') {
      body.innerHTML = `
        <div class="resumo-erro">
          <div class="resumo-erro-icon">🔑</div>
          <div>${e.message === 'CHAVE_INVALIDA' ? 'Chave API inválida ou expirada.' : 'É necessário configurar a chave API.'}</div>
          <button class="resumo-btn-regen" style="margin-top:1rem;opacity:1" onclick="window._abrirConfigKey()">Configurar chave API</button>
        </div>`;
    } else {
      body.innerHTML = `
        <div class="resumo-erro">
          <div class="resumo-erro-icon">⚠️</div>
          <div>Não foi possível gerar o resumo.</div>
          <div class="resumo-erro-detalhe">${e.message}</div>
        </div>`;
      mostrarToast('Erro ao gerar resumo', e.message);
    }
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
