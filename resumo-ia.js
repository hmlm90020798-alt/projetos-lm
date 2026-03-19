// ════════════════════════════════════════════════
// resumo-ia.js — Resumo IA por projecto · Projetos LM
// Usa a API Groq (llama-3.3-70b-versatile) — gratuito
// API key guardada em localStorage (nunca vai para o GitHub)
// Output estruturado em 4 blocos: Resumo · Próximo Passo · Mensagem · Conselho
// ════════════════════════════════════════════════

import { getState } from './state.js';
import { mostrarToast } from './ui.js';
import { carregarGroqKey } from './firebase.js';

// ── Gestão segura da API Key (localStorage + Firebase) ──

const LS_KEY = 'projetos_lm_groq_key';

function obterApiKey() {
  return localStorage.getItem(LS_KEY) || '';
}

function guardarApiKey(key) {
  localStorage.setItem(LS_KEY, key.trim());
  if (window.guardarGroqKey) window.guardarGroqKey(key.trim());
}

// Tenta obter a chave do Firebase se não estiver no localStorage
async function obterApiKeyComFallback() {
  const local = obterApiKey();
  if (local) return local;
  // Navegador privado ou novo dispositivo — buscar directamente do Firebase
  try {
    const key = await carregarGroqKey(); // também guarda no localStorage se encontrar
    return key || '';
  } catch (_) {
    return '';
  }
}

function mostrarConfigKey() {
  const keyAtual = obterApiKey();

  let modal = document.getElementById('modal-groq-key');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-groq-key';
    modal.className = 'resumo-overlay';
    modal.innerHTML = `
      <div class="resumo-modal" style="max-width:460px">
        <div class="resumo-header">
          <div class="resumo-header-left">
            <span class="resumo-icon">🔑</span>
            <div>
              <div class="resumo-titulo">Configurar IA</div>
              <div class="resumo-sub">Groq API Key · Gratuito</div>
            </div>
          </div>
          <button class="modal-close" onclick="document.getElementById('modal-groq-key').classList.remove('open')">×</button>
        </div>
        <div class="resumo-body" style="padding:1.5rem">
          <p style="margin:0 0 1rem;font-size:.9rem;color:var(--text-secondary,#666);line-height:1.6">
            A chave é guardada apenas no teu browser e nunca é enviada para o GitHub.<br>
            Regista-te gratuitamente em <a href="https://console.groq.com" target="_blank" style="color:var(--accent,#4f8ef7);font-weight:600">console.groq.com</a> para obteres a tua chave.
          </p>
          <label style="display:block;font-size:.85rem;font-weight:600;margin-bottom:.5rem;color:var(--text,#222)">Groq API Key</label>
          <input
            id="groq-key-input"
            type="password"
            placeholder="gsk_..."
            autocomplete="off"
            style="width:100%;box-sizing:border-box;padding:.65rem .9rem;border:1.5px solid var(--border,#ddd);border-radius:8px;font-size:.9rem;font-family:monospace;outline:none;transition:border .2s"
            value="${keyAtual}"
            onfocus="this.style.borderColor='var(--accent,#4f8ef7)'"
            onblur="this.style.borderColor='var(--border,#ddd)'"
          />
          <p style="margin:.6rem 0 0;font-size:.8rem;color:var(--text-secondary,#999)">
            A chave começa sempre por <code style="background:var(--bg-alt,#f4f4f4);padding:1px 5px;border-radius:4px">gsk_</code>
          </p>
        </div>
        <div class="resumo-footer" style="justify-content:flex-end;gap:.6rem">
          <button class="resumo-btn-copiar" onclick="document.getElementById('modal-groq-key').classList.remove('open')">Cancelar</button>
          <button class="resumo-btn-regen" style="opacity:1" onclick="window._guardarGroqKey()">✓ Guardar e continuar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  } else {
    const input = document.getElementById('groq-key-input');
    if (input) input.value = keyAtual;
  }

  modal.classList.add('open');
  setTimeout(() => document.getElementById('groq-key-input')?.focus(), 100);
}

window._guardarGroqKey = function () {
  const input = document.getElementById('groq-key-input');
  const key = input?.value?.trim() || '';
  if (!key || !key.startsWith('gsk_')) {
    mostrarToast('⚠️ Chave inválida', 'A chave Groq deve começar por gsk_');
    input?.focus();
    return;
  }
  guardarApiKey(key);
  document.getElementById('modal-groq-key').classList.remove('open');
  mostrarToast('✓ Chave guardada', 'A IA está pronta a usar');

  const id = window._resumoIAProjId;
  if (id) {
    const p = getState('projetos').find(x => x.id === id);
    if (p) {
      let m = document.getElementById('modal-resumo-ia');
      if (m) m.classList.add('open');
      gerarResumo(p);
    }
  }
};

// ── Construir contexto completo do projecto ───────

function construirContexto(p) {
  const faseLabels = {
    proposta:    'Em proposta',
    retificacao: 'Em rectificação',
    aprovado:    'Aprovado',
    encomenda:   'Materiais encomendados',
    entrega:     'Entrega agendada',
    montagem:    'Instalação em curso',
    concluido:   'Concluído',
  };
  const tipoLabels = {
    cozinha:             'Cozinha',
    'casa-de-banho':     'Casa de Banho',
    roupeiro:            'Roupeiro',
    'renovacao-parcial': 'Renovação Parcial',
    aquecimento:         'Aquecimento',
  };

  const hoje = new Date();
  const fmt  = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-PT') : null;

  let diasCriado = null;
  if (p.dataCriacao) {
    const [d, m, y] = p.dataCriacao.split('/');
    const dc = new Date(y, m - 1, d);
    diasCriado = Math.round((hoje - dc) / 86400000);
  }

  // Dias sem interacção
  let diasSemContacto = null;
  if (p.interacoes?.length) {
    const ultima = p.interacoes[p.interacoes.length - 1];
    if (ultima.data) {
      const partes = ultima.data.split('/');
      if (partes.length === 3) {
        const di = new Date(partes[2], partes[1] - 1, partes[0]);
        diasSemContacto = Math.round((hoje - di) / 86400000);
      }
    }
  }

  // Dias até expirar proposta
  let diasAteExpirar = null;
  if (p.prazo) {
    const exp = new Date(p.prazo + 'T12:00:00');
    diasAteExpirar = Math.round((exp - hoje) / 86400000);
  }

  const cats = [
    { nome: 'Móveis',           val: parseFloat(p.orc_moveis)     || 0 },
    { nome: 'Tampos',           val: parseFloat(p.orc_tampos)     || 0 },
    { nome: 'Eletrodomésticos', val: parseFloat(p.orc_eletros)    || 0 },
    { nome: 'Acessórios',       val: parseFloat(p.orc_acessorios) || 0 },
    ...((p.orcamento || []).map(c => ({ nome: c.categoria, val: parseFloat(c.valor) || 0 }))),
  ].filter(c => c.val > 0);
  const total = cats.reduce((s, c) => s + c.val, 0);

  const ocorAtivas     = (p.ocorrencias || []).filter(o => o.estado !== 'resolvida');
  const ocorResolvidas = (p.ocorrencias || []).filter(o => o.estado === 'resolvida');
  const interacoes     = (p.interacoes  || []).slice(-5);
  const visitas        = getState('visitasCache')?.[p.id];
  const docs           = (p.docs || []);
  const notas          = Array.isArray(p.notas) ? p.notas : (p.notas ? [{ texto: p.notas }] : []);

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
    nome:              p.nome || '—',
    tipo:              tipoLabels[p.tipo] || p.tipoOutro || p.tipo || '—',
    localidade:        p.localidade || '—',
    refPc:             p.refPc || null,
    refOs:             p.refOs || null,
    fase:              faseLabels[p.fase] || p.fase || '—',
    diasCriado,
    diasSemContacto,
    diasAteExpirar,
    aprovacao:         p.aprovacao || null,
    prazo:             fmt(p.prazo),
    dataInstalacao:    fmt(p.dataInstalacao),
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
  if (ctx.diasSemContacto !== null) linhas.push(`Dias sem contacto com o cliente: ${ctx.diasSemContacto}`);
  if (ctx.diasAteExpirar !== null) {
    if (ctx.diasAteExpirar < 0) {
      linhas.push(`Proposta EXPIRADA há ${Math.abs(ctx.diasAteExpirar)} dias`);
    } else {
      linhas.push(`Proposta expira em ${ctx.diasAteExpirar} dias (${ctx.prazo})`);
    }
  }
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

// ── System Prompt especializado ───────────────────

const SYSTEM_PROMPT = `És um copiloto de vendas especializado em projetos de interiores para Hélder Melo, Vendedor de Projetos de Renovação (VPR) da Leroy Merlin Portugal, loja de Viseu.

O Hélder gere projetos de cozinhas, casas de banho, roupeiros e renovações. Os seus maiores desafios são: clientes que não respondem, propostas a expirar sem decisão, atrasos na entrega de materiais e problemas na instalação.

Recebes os dados completos de um projeto e deves responder SEMPRE em português europeu, com um tom próximo e humano — profissional mas sem ser frio ou distante. Como se fosses um colega experiente a dar conselhos práticos.

Responde OBRIGATORIAMENTE neste formato JSON, sem mais nada antes ou depois:

{
  "resumo": "Parágrafo narrativo com o estado atual do projeto. Máximo 4 frases. Texto corrido, sem bullets.",
  "proximoPasso": "Uma única ação concreta e urgente que o Hélder deve tomar HOJE ou nos próximos dias. Direta e específica.",
  "mensagem": "Mensagem pronta a enviar ao cliente (WhatsApp ou email), com o tom próximo e humano característico do Hélder. Deve ser natural, sem parecer gerada por IA. Máximo 5 linhas.",
  "conselho": "Análise estratégica ou padrão detetado. Pode ser um alerta (ex: cliente sem contacto há X dias é sinal de hesitação), uma oportunidade (ex: cliente visitou a proposta 3x — está quase a decidir) ou uma recomendação baseada na fase do projeto."
}

Regras importantes:
- Nunca uses bullets ou listas — sempre texto corrido
- Nunca inventes dados que não estejam nos dados fornecidos
- A mensagem ao cliente deve mencionar o nome do cliente de forma natural
- Se houver ocorrências activas, o próximo passo deve endereçá-las
- Se a proposta expira em menos de 5 dias, isso é URGENTE e deve ser o foco
- Se o cliente não tem contacto há mais de 7 dias, sugere uma mensagem de acompanhamento
- Se o cliente visitou a proposta recentemente, menciona isso como sinal positivo`;

// ── Chamar API Groq ───────────────────────────────

async function chamarAPI(prompt) {
  const apiKey = obterApiKey();
  if (!apiKey) throw new Error('SEM_KEY');

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1200,
      temperature: 0.65,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const msg = err.error?.message || `Erro ${response.status}`;
    if (response.status === 401) {
      localStorage.removeItem(LS_KEY);
      throw new Error('CHAVE_INVALIDA');
    }
    throw new Error(msg);
  }

  const data = await response.json();
  const texto = data.choices?.[0]?.message?.content || '{}';
  return JSON.parse(texto);
}

// ── Renderizar blocos ─────────────────────────────

function renderizarBlocos(resultado) {
  const blocos = [
    {
      icon: '✦',
      label: 'Estado atual',
      cor: 'var(--accent, #4f8ef7)',
      conteudo: resultado.resumo,
      copiar: false,
    },
    {
      icon: '⚡',
      label: 'Próximo passo',
      cor: '#f59e0b',
      conteudo: resultado.proximoPasso,
      copiar: false,
    },
    {
      icon: '💬',
      label: 'Mensagem sugerida',
      cor: '#10b981',
      conteudo: resultado.mensagem,
      copiar: true,
    },
    {
      icon: '💡',
      label: 'Conselho',
      cor: '#8b5cf6',
      conteudo: resultado.conselho,
      copiar: false,
    },
  ];

  return blocos.map((b, i) => `
    <div class="resumo-bloco" style="border-left: 3px solid ${b.cor}; padding: .9rem 1rem; margin-bottom: .9rem; background: var(--bg-alt, #f9f9f9); border-radius: 0 8px 8px 0;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.4rem">
        <div style="display:flex;align-items:center;gap:.4rem">
          <span style="font-size:1rem">${b.icon}</span>
          <span style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:${b.cor}">${b.label}</span>
        </div>
        ${b.copiar ? `<button onclick="window._copiarMensagemIA(${i})" style="font-size:.75rem;padding:.2rem .6rem;border:1px solid ${b.cor};color:${b.cor};background:transparent;border-radius:5px;cursor:pointer">📋 Copiar</button>` : ''}
      </div>
      <p style="margin:0;font-size:.88rem;line-height:1.65;color:var(--text,#222);white-space:pre-line" data-bloco="${i}">${b.conteudo}</p>
    </div>
  `).join('');
}

// Copiar mensagem específica
window._copiarMensagemIA = function(idx) {
  const el = document.querySelector(`[data-bloco="${idx}"]`);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent).then(() => {
    mostrarToast('✓ Mensagem copiada', '');
  });
};

// ── Modal de resumo ───────────────────────────────

export async function abrirResumoIA(projetoId) {
  const projetos = getState('projetos');
  const p = projetos.find(x => x.id === projetoId);
  if (!p) { mostrarToast('Projecto não encontrado', ''); return; }

  window._resumoIAProjId = projetoId;

  // Tentar obter chave: primeiro localStorage, depois Firebase (modo privado/novo device)
  const apiKey = await obterApiKeyComFallback();
  if (!apiKey) {
    mostrarConfigKey();
    return;
  }

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
              <div class="resumo-titulo">Copiloto IA</div>
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
          <button class="resumo-btn-copiar" onclick="window.copiarResumoIA()">📋 Copiar tudo</button>
          <span class="resumo-disclaimer">Gerado por IA — verificar sempre os dados</span>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }

  modal.classList.add('open');
  document.getElementById('resumo-sub').textContent = `${p.nome} · ${p.localidade || ''}`;
  gerarResumo(p);
}

window._abrirConfigKey = function () {
  fecharResumoIA();
  mostrarConfigKey();
};

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
    const ctx       = construirContexto(p);
    const prompt    = gerarPrompt(ctx);
    const resultado = await chamarAPI(prompt);

    // Guardar texto completo para "Copiar tudo"
    window._resumoIATexto = [
      `ESTADO ATUAL\n${resultado.resumo}`,
      `PRÓXIMO PASSO\n${resultado.proximoPasso}`,
      `MENSAGEM SUGERIDA\n${resultado.mensagem}`,
      `CONSELHO\n${resultado.conselho}`,
    ].join('\n\n');

    body.innerHTML = renderizarBlocos(resultado);

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
          <div>Não foi possível gerar a análise.</div>
          <div class="resumo-erro-detalhe">${e.message}</div>
        </div>`;
      mostrarToast('Erro ao gerar análise', e.message);
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
    mostrarToast('✓ Análise copiada', '');
  });
}
