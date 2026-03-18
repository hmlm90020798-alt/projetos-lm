// ════════════════════════════════════════════════
// reclamacoes.js — Diagnóstico Conversacional de Reclamações
// Projetos LM · Hélder Melo
// A IA conduz o diagnóstico como um colega experiente
// ════════════════════════════════════════════════

import { getState } from './state.js';
import { mostrarToast, gerarId, dataHoje } from './ui.js';

// ── Storage ───────────────────────────────────────

const LS_KEY_GROQ = 'projetos_lm_groq_key';
const LS_KEY_REC  = 'projetos_lm_reclamacoes';
const LS_KEY_MEM  = 'projetos_lm_rec_memoria'; // memória de padrões aprendidos

function carregarReclamacoes() {
  try { return JSON.parse(localStorage.getItem(LS_KEY_REC) || '[]'); } catch { return []; }
}
function guardarReclamacoes(lista) {
  localStorage.setItem(LS_KEY_REC, JSON.stringify(lista));
}
function obterGroqKey() {
  return localStorage.getItem(LS_KEY_GROQ) || '';
}
function carregarMemoria() {
  try { return JSON.parse(localStorage.getItem(LS_KEY_MEM) || '[]'); } catch { return []; }
}
function guardarMemoria(lista) {
  localStorage.setItem(LS_KEY_MEM, JSON.stringify(lista.slice(-20))); // guardar últimos 20 padrões
}

// ── Estado da conversa ────────────────────────────

let _conversa    = [];   // histórico de mensagens { role, content }
let _dadosRec    = {};   // dados estruturados recolhidos
let _recId       = null; // id da reclamação em curso
let _aguardando  = false;

// ── Render página principal ───────────────────────

export function renderReclamacoes() {
  const secao = document.getElementById('reclamacoes-content');
  if (!secao) return;

  const lista = carregarReclamacoes();
  const pendentes  = lista.filter(r => r.estado === 'pendente').length;
  const emCurso    = lista.filter(r => r.estado === 'em_curso').length;
  const resolvidas = lista.filter(r => r.estado === 'resolvido').length;

  secao.innerHTML = `
    <div class="rec-page">
      <div class="rec-header">
        <div>
          <h2 class="rec-titulo">🚨 Reclamações Pós-Venda</h2>
          <p class="rec-sub">Diagnóstico guiado por IA · Regista, acompanha e resolve</p>
        </div>
        <button class="btn-novo rec-btn-nova" onclick="window._abrirDiagnostico()">
          + Nova Reclamação
        </button>
      </div>

      <div class="rec-stats">
        <div class="rec-stat"><span class="rec-stat-num" style="color:#f59e0b">${pendentes}</span><span class="rec-stat-label">Pendentes</span></div>
        <div class="rec-stat"><span class="rec-stat-num" style="color:#3b82f6">${emCurso}</span><span class="rec-stat-label">Em Curso</span></div>
        <div class="rec-stat"><span class="rec-stat-num" style="color:#10b981">${resolvidas}</span><span class="rec-stat-label">Resolvidas</span></div>
      </div>

      <div class="rec-lista">
        ${lista.length === 0
          ? `<div class="empty-state">
               <div class="empty-icon">✅</div>
               <div class="empty-titulo">Sem reclamações registadas</div>
               <div class="empty-sub">Clica em "+ Nova Reclamação" para iniciar um diagnóstico guiado.</div>
             </div>`
          : lista.slice().reverse().map(r => _renderCard(r)).join('')
        }
      </div>
    </div>
  `;
}

function _renderCard(r) {
  const cores = { pendente: '#f59e0b', em_curso: '#3b82f6', resolvido: '#10b981' };
  const textos = { pendente: 'Pendente', em_curso: 'Em Curso', resolvido: 'Resolvido' };
  const cor  = cores[r.estado]  || '#f59e0b';
  const txt  = textos[r.estado] || 'Pendente';
  const proj = getState('projetos')?.find(p => p.id === r.projetoId);
  const nome = proj?.nome || r.cliente || '—';
  const pendProb = (r.problemas || []).filter(p => p.estado !== 'resolvido').length;

  return `
    <div class="rec-card">
      <div class="rec-card-header">
        <div class="rec-card-info">
          <div class="rec-card-nome">${nome}</div>
          <div class="rec-card-meta">
            ${r.refPc ? `<span>PC: ${r.refPc}</span>` : ''}
            ${r.refOs ? `<span>OS: ${r.refOs}</span>` : ''}
            ${r.contacto ? `<span>📞 ${r.contacto}</span>` : ''}
            <span>${r.dataCriacao || ''}</span>
          </div>
        </div>
        <div class="rec-card-badges">
          <span class="rec-badge" style="background:${cor}20;color:${cor};border:1px solid ${cor}40">${txt}</span>
          ${pendProb > 0 ? `<span class="rec-badge" style="background:#fee2e2;color:#ef4444;border:1px solid #fca5a5">${pendProb} por resolver</span>` : ''}
        </div>
      </div>

      ${(r.problemas||[]).length > 0 ? `
        <div class="rec-problemas">
          ${r.problemas.map((p,i) => `
            <div class="rec-problema ${p.estado==='resolvido'?'resolvido':''}">
              <div class="rec-problema-check">
                <input type="checkbox" ${p.estado==='resolvido'?'checked':''}
                  onchange="window._toggleProblema('${r.id}',${i},this.checked)">
              </div>
              <div class="rec-problema-body">
                <div class="rec-problema-tipo">${p.tipo || ''}</div>
                <div class="rec-problema-desc">${p.descricao || ''}</div>
                ${p.refLm ? `<div class="rec-problema-ref">Ref. LM: <code>${p.refLm}</code></div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>` : ''
      }

      <div class="rec-card-acoes">
        <button class="rec-btn rec-btn-ia"    onclick="window._abrirAnaliseIA('${r.id}')">✦ Análise IA</button>
        <button class="rec-btn rec-btn-email" onclick="window._gerarEmail('${r.id}')">✉️ Email</button>
        <button class="rec-btn rec-btn-edit"  onclick="window._continuarDiagnostico('${r.id}')">💬 Continuar</button>
        <button class="rec-btn rec-btn-del"   onclick="window._apagarReclamacao('${r.id}')">🗑</button>
      </div>
    </div>
  `;
}

// ── Modal de diagnóstico conversacional ───────────

window._abrirDiagnostico = function () {
  if (!obterGroqKey()) {
    mostrarToast('⚠️ Chave IA não configurada', 'Configura a chave Groq no Resumo IA');
    return;
  }
  _recId   = gerarId();
  _dadosRec = { id: _recId, dataCriacao: dataHoje(), estado: 'pendente', problemas: [] };
  _conversa = [];
  _criarModalChat();
  _enviarSistema(); // IA faz a primeira pergunta
};

window._continuarDiagnostico = function (id) {
  if (!obterGroqKey()) {
    mostrarToast('⚠️ Chave IA não configurada', 'Configura a chave Groq no Resumo IA');
    return;
  }
  const lista = carregarReclamacoes();
  const rec   = lista.find(r => r.id === id);
  if (!rec) return;
  _recId    = id;
  _dadosRec = { ...rec };
  _conversa = [];
  _criarModalChat();
  // Resumir o que já existe e perguntar o que falta
  _adicionarMensagemIA('A retomar o diagnóstico desta reclamação. Diz-me se há algo a acrescentar, corrigir ou atualizar — ou se já podemos passar à análise e geração do email.');
};

function _criarModalChat() {
  document.getElementById('modal-rec-chat')?.remove();

  const modal = document.createElement('div');
  modal.id    = 'modal-rec-chat';
  modal.className = 'resumo-overlay open';
  modal.innerHTML = `
    <div class="resumo-modal rec-chat-modal">
      <div class="resumo-header">
        <div class="resumo-header-left">
          <span class="resumo-icon">🚨</span>
          <div>
            <div class="resumo-titulo">Diagnóstico de Reclamação</div>
            <div class="resumo-sub" id="rec-chat-sub">A iniciar diagnóstico…</div>
          </div>
        </div>
        <button class="modal-close" onclick="window._fecharDiagnostico()">×</button>
      </div>

      <div class="rec-chat-body" id="rec-chat-body">
        <div class="resumo-loading">
          <div class="resumo-spinner"></div>
          <span>A preparar o diagnóstico…</span>
        </div>
      </div>

      <div class="rec-chat-footer">
        <div class="rec-chat-input-wrap">
          <textarea
            id="rec-chat-input"
            class="rec-chat-input"
            placeholder="Escreve aqui a tua resposta…"
            rows="2"
            onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();window._enviarMensagem()}"
          ></textarea>
          <button class="rec-chat-send" onclick="window._enviarMensagem()">→</button>
        </div>
        <div class="rec-chat-actions" id="rec-chat-actions"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  setTimeout(() => document.getElementById('rec-chat-input')?.focus(), 100);
}

// ── Sistema de mensagens ──────────────────────────

function _adicionarMensagemIA(texto, opcoes = []) {
  const body = document.getElementById('rec-chat-body');
  if (!body) return;

  // Remover loading se existir
  body.querySelector('.resumo-loading')?.remove();

  const div = document.createElement('div');
  div.className = 'rec-msg rec-msg-ia';
  div.innerHTML = `
    <div class="rec-msg-avatar">✦</div>
    <div class="rec-msg-bubble">
      <p class="rec-msg-texto">${texto.replace(/\n/g,'<br>')}</p>
      ${opcoes.length ? `
        <div class="rec-msg-opcoes">
          ${opcoes.map(op => `
            <button class="rec-opcao-btn" onclick="window._escolherOpcao('${op.replace(/'/g,"\\'")}')">
              ${op}
            </button>`).join('')}
        </div>` : ''}
    </div>
  `;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;

  _conversa.push({ role: 'assistant', content: texto });
}

function _adicionarMensagemUser(texto) {
  const body = document.getElementById('rec-chat-body');
  if (!body) return;

  const div = document.createElement('div');
  div.className = 'rec-msg rec-msg-user';
  div.innerHTML = `
    <div class="rec-msg-bubble rec-msg-bubble-user">
      <p class="rec-msg-texto">${texto.replace(/\n/g,'<br>')}</p>
    </div>
  `;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;

  _conversa.push({ role: 'user', content: texto });
}

function _mostrarTyping() {
  const body = document.getElementById('rec-chat-body');
  if (!body) return;
  body.querySelector('.rec-typing')?.remove();
  const div = document.createElement('div');
  div.className = 'rec-msg rec-msg-ia rec-typing';
  div.innerHTML = `
    <div class="rec-msg-avatar">✦</div>
    <div class="rec-msg-bubble">
      <span class="rec-typing-dots"><span></span><span></span><span></span></span>
    </div>
  `;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

function _removerTyping() {
  document.querySelector('.rec-typing')?.remove();
}

// ── Enviar mensagem do utilizador ─────────────────

window._enviarMensagem = function () {
  const input = document.getElementById('rec-chat-input');
  const texto = input?.value?.trim();
  if (!texto || _aguardando) return;
  input.value = '';
  // Remover opções anteriores
  document.querySelectorAll('.rec-msg-opcoes').forEach(el => el.remove());
  _adicionarMensagemUser(texto);
  _chamarIA(texto);
};

window._escolherOpcao = function (opcao) {
  document.querySelectorAll('.rec-msg-opcoes').forEach(el => el.remove());
  _adicionarMensagemUser(opcao);
  _chamarIA(opcao);
};

// ── Primeira mensagem do sistema ──────────────────

async function _enviarSistema() {
  _aguardando = true;
  _mostrarTyping();

  const systemPrompt = _construirSystemPrompt();

  try {
    const resposta = await _chamarGroq(systemPrompt, [
      { role: 'user', content: 'Inicia o diagnóstico.' }
    ]);
    _removerTyping();
    _processarRespostaIA(resposta);
  } catch (e) {
    _removerTyping();
    _adicionarMensagemIA('Não foi possível iniciar o diagnóstico. Verifica a tua chave API.');
  } finally {
    _aguardando = false;
  }
}

// ── Chamar IA com histórico completo ──────────────

async function _chamarIA(mensagemUser) {
  if (_aguardando) return;
  _aguardando = true;
  _mostrarTyping();

  const systemPrompt = _construirSystemPrompt();

  try {
    const resposta = await _chamarGroq(systemPrompt, _conversa);
    _removerTyping();
    _processarRespostaIA(resposta);
  } catch (e) {
    _removerTyping();
    _adicionarMensagemIA('Ocorreu um erro. Tenta de novo.');
  } finally {
    _aguardando = false;
    document.getElementById('rec-chat-input')?.focus();
  }
}

// ── Processar resposta da IA (JSON estruturado) ───

function _processarRespostaIA(resposta) {
  try {
    const json = JSON.parse(resposta);

    // Atualizar dados recolhidos
    if (json.dados) {
      _dadosRec = { ..._dadosRec, ...json.dados };
      // Atualizar subtitle com nome do cliente
      const sub = document.getElementById('rec-chat-sub');
      if (sub && _dadosRec.cliente) sub.textContent = _dadosRec.cliente;
    }

    // Mostrar pergunta
    if (json.pergunta) {
      _adicionarMensagemIA(json.pergunta, json.opcoes || []);
    }

    // Se diagnóstico completo — mostrar resumo e ações
    if (json.completo) {
      _guardarRascunho();
      _mostrarResumoFinal(json.resumo, json.proximosPassos);
    }

    // Aprender com padrão se indicado
    if (json.padrao) {
      const mem = carregarMemoria();
      mem.push({ data: dataHoje(), padrao: json.padrao });
      guardarMemoria(mem);
    }

  } catch {
    // Fallback: mostrar como texto simples se não for JSON válido
    _adicionarMensagemIA(resposta);
  }
}

// ── System prompt dinâmico ────────────────────────

function _construirSystemPrompt() {
  const projetos = getState('projetos') || [];
  const memoria  = carregarMemoria();

  // Passar projetos como lista estruturada para a IA pesquisar
  const listaProj = projetos.map(p =>
    `{ "id": "${p.id}", "nome": "${p.nome||''}", "localidade": "${p.localidade||''}", "refPc": "${p.refPc||''}", "refOs": "${p.refOs||''}", "fase": "${p.fase||''}" }`
  ).join('\n');

  const memoriaTexto = memoria.length
    ? `\n\nPADRÕES APRENDIDOS DE CASOS ANTERIORES:\n${memoria.map(m => `- ${m.padrao}`).join('\n')}`
    : '';

  const dadosAtuais = Object.keys(_dadosRec).length > 2
    ? `\n\nDADOS JÁ RECOLHIDOS NESTE DIAGNÓSTICO:\n${JSON.stringify(_dadosRec, null, 2)}`
    : '';

  return `És um assistente especializado em diagnóstico de reclamações pós-venda para Hélder Melo, VPR da Leroy Merlin Portugal (Viseu).

CONTEXTO IMPORTANTE:
- Esta app é de uso exclusivo do Hélder — nunca perguntes o seu nome nem contacto
- O foco é exclusivamente registar e resolver problemas dos seus CLIENTES
- Sê direto, eficiente e vai ao assunto sem perguntas desnecessárias

PROJETOS NA APP:
${listaProj || 'nenhum ainda'}${dadosAtuais}${memoriaTexto}

FLUXO DE DIAGNÓSTICO:
1. Começa SEMPRE por perguntar pelo cliente — aceita nome, ref. PC ou ref. OS
   - Se o nome bater com um projeto da lista (parcial ou total), confirma e usa o projetoId
   - Se der PC ou OS, cruza com a lista e identifica o projeto automaticamente
   - Nunca apresentes a lista completa — filtra e sugere no máximo 3 correspondências
2. Identifica o tipo de reclamação com opções:
   - INSTALAÇÃO → pede nº OS e PC (se não tiver), descreve o problema (qualidade, algo por concluir, dano)
   - MATERIAL → pede nº PC e ref. LM do artigo, descreve o problema (danificado, em falta, não corresponde)
   - ENTREGA → pede nº PC, descreve a queixa (atraso, entrega errada, dano no transporte)
   - OUTRO → aprofunda livremente
3. Para cada problema: quando foi detetado? já foi comunicado anteriormente?
4. Pergunta se há mais problemas a registar
5. Quando tiver todos os dados essenciais, fecha o diagnóstico

REGRAS:
- UMA pergunta de cada vez — nunca várias em simultâneo
- Se o utilizador descrever vários problemas de uma vez, regista todos e aprofunda cada um
- Se a resposta for vaga, pede esclarecimento antes de avançar
- Nunca presents a lista completa de projetos — filtra sempre
- Aprende com situações incomuns e regista como padrão

RESPONDE SEMPRE EM JSON com esta estrutura exata:
{
  "pergunta": "próxima pergunta (obrigatório, vazio string se completo=true)",
  "opcoes": ["opção 1", "opção 2"],
  "dados": {
    "cliente": "",
    "projetoId": "",
    "refPc": "",
    "refOs": "",
    "problemas": [{ "tipo": "", "descricao": "", "refLm": "", "estado": "pendente" }]
  },
  "completo": false,
  "resumo": "",
  "proximosPassos": "",
  "padrao": ""
}

Responde APENAS com JSON válido, sem texto antes ou depois.`;
}

// ── Guardar rascunho durante a conversa ───────────

function _guardarRascunho() {
  const lista = carregarReclamacoes();
  const idx   = lista.findIndex(r => r.id === _recId);
  if (idx >= 0) {
    lista[idx] = { ...lista[idx], ..._dadosRec };
  } else {
    lista.push({ ..._dadosRec });
  }
  guardarReclamacoes(lista);
}

// ── Resumo final + ações ──────────────────────────

function _mostrarResumoFinal(resumo, proximosPassos) {
  const body = document.getElementById('rec-chat-body');
  if (!body) return;

  const div = document.createElement('div');
  div.className = 'rec-resumo-final';
  div.innerHTML = `
    <div class="rec-resumo-header">✦ Diagnóstico concluído</div>
    ${resumo ? `<p class="rec-resumo-texto">${resumo.replace(/\n/g,'<br>')}</p>` : ''}
    ${proximosPassos ? `<div class="rec-resumo-passos"><strong>Próximos passos:</strong><br>${proximosPassos.replace(/\n/g,'<br>')}</div>` : ''}
    <div class="rec-resumo-acoes">
      <button class="rec-btn rec-btn-ia"    onclick="window._abrirAnaliseIA('${_recId}')">✦ Análise IA completa</button>
      <button class="rec-btn rec-btn-email" onclick="window._gerarEmail('${_recId}')">✉️ Gerar email</button>
      <button class="rec-btn" style="background:var(--green-pale);color:var(--green)" onclick="window._fecharDiagnostico();window.renderReclamacoes()">✓ Guardar e fechar</button>
    </div>
  `;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;

  // Guardar definitivamente
  _guardarRascunho();
  renderReclamacoes();
}

window._fecharDiagnostico = function () {
  if (_dadosRec && Object.keys(_dadosRec).length > 2) _guardarRascunho();
  document.getElementById('modal-rec-chat')?.remove();
  renderReclamacoes();
};

// ── Toggle problema resolvido ─────────────────────

window._toggleProblema = function (recId, idx, checked) {
  const lista = carregarReclamacoes();
  const rec   = lista.find(r => r.id === recId);
  if (!rec?.problemas?.[idx]) return;
  rec.problemas[idx].estado = checked ? 'resolvido' : 'pendente';
  const total     = rec.problemas.length;
  const resolvidos = rec.problemas.filter(p => p.estado === 'resolvido').length;
  rec.estado = resolvidos === total ? 'resolvido' : resolvidos > 0 ? 'em_curso' : 'pendente';
  guardarReclamacoes(lista);
  renderReclamacoes();
};

window._apagarReclamacao = function (id) {
  if (!confirm('Tens a certeza que queres apagar esta reclamação?')) return;
  guardarReclamacoes(carregarReclamacoes().filter(r => r.id !== id));
  renderReclamacoes();
  mostrarToast('Reclamação apagada', '');
};

// ── Análise IA completa ───────────────────────────

window._abrirAnaliseIA = function (recId) {
  const rec  = carregarReclamacoes().find(r => r.id === recId);
  if (!rec) return;
  if (!obterGroqKey()) { mostrarToast('⚠️ Chave IA não configurada',''); return; }

  document.getElementById('modal-rec-ia')?.remove();
  const proj = getState('projetos')?.find(p => p.id === rec.projetoId);
  const nome = proj?.nome || rec.cliente || '—';

  const modal = document.createElement('div');
  modal.id    = 'modal-rec-ia';
  modal.className = 'resumo-overlay open';
  modal.innerHTML = `
    <div class="resumo-modal">
      <div class="resumo-header">
        <div class="resumo-header-left">
          <span class="resumo-icon">✦</span>
          <div>
            <div class="resumo-titulo">Análise IA · Reclamação</div>
            <div class="resumo-sub">${nome}${rec.refPc ? ' · PC ' + rec.refPc : ''}</div>
          </div>
        </div>
        <button class="modal-close" onclick="document.getElementById('modal-rec-ia').remove()">×</button>
      </div>
      <div class="resumo-body" id="rec-ia-body">
        <div class="resumo-loading"><div class="resumo-spinner"></div><span>A analisar…</span></div>
      </div>
      <div class="resumo-footer">
        <button class="resumo-btn-copiar" onclick="window._copiarAnaliseRec()">📋 Copiar tudo</button>
        <span class="resumo-disclaimer">Gerado por IA — verificar sempre os dados</span>
      </div>
    </div>`;
  document.body.appendChild(modal);
  _executarAnaliseIA(rec, proj);
};

async function _executarAnaliseIA(rec, proj) {
  const body   = document.getElementById('rec-ia-body');
  const apiKey = obterGroqKey();
  const mem    = carregarMemoria();

  const problemasTexto = (rec.problemas||[]).map((p,i) =>
    `${i+1}. [${p.estado}] ${p.tipo}: ${p.descricao}${p.refLm?' (Ref. LM: '+p.refLm+')':''}`
  ).join('\n');

  const memoriaTexto = mem.length
    ? `\nPADRÕES DE CASOS ANTERIORES:\n${mem.map(m=>`- ${m.padrao}`).join('\n')}`
    : '';

  const prompt = `RECLAMAÇÃO:
Cliente: ${proj?.nome || rec.cliente || '—'}
Contacto: ${rec.contacto || '—'}
Ref. PC: ${rec.refPc || '—'} | Ref. OS: ${rec.refOs || '—'}
Data: ${rec.dataCriacao || '—'}

PROBLEMAS:
${problemasTexto || '—'}
${memoriaTexto}`;

  const system = `És um mentor experiente em gestão de reclamações pós-venda para Hélder Melo, VPR da Leroy Merlin Portugal.
Responde em JSON:
{
  "diagnostico": "Análise da gravidade e responsabilidades. Máx 3 frases.",
  "defesa": "Argumentação interna — porque demorou, boa fé, quem assume cada custo. Máx 4 frases.",
  "respostaCliente": "Mensagem WhatsApp/email — tom próximo e humano, reconhece sem admitir culpa excessiva, dá prazo. Máx 5 linhas.",
  "proximosPassos": "3 a 5 ações concretas por ordem de prioridade, separadas por ' → '",
  "alertas": "Riscos críticos a não ignorar. Máx 2 frases."
}
Português europeu. Só JSON.`;

  try {
    const res  = await _chamarGroq(system, [{ role:'user', content: prompt }]);
    const json = JSON.parse(res);

    window._analiseRecTexto = ['DIAGNÓSTICO','DEFESA INTERNA','RESPOSTA AO CLIENTE','PRÓXIMOS PASSOS','ALERTAS']
      .map((t,i) => `${t}\n${Object.values(json)[i]||'—'}`).join('\n\n');

    const blocos = [
      { icon:'🔍', label:'Diagnóstico',        cor:'#6b7280', key:'diagnostico',     copiar:false },
      { icon:'🛡️', label:'Defesa interna',     cor:'#3b82f6', key:'defesa',          copiar:false },
      { icon:'💬', label:'Resposta ao cliente', cor:'#10b981', key:'respostaCliente', copiar:true  },
      { icon:'⚡', label:'Próximos passos',     cor:'#f59e0b', key:'proximosPassos',  copiar:false },
      { icon:'⚠️', label:'Alertas',             cor:'#ef4444', key:'alertas',         copiar:false },
    ];

    body.innerHTML = blocos.map((b,i) => `
      <div style="border-left:3px solid ${b.cor};padding:.9rem 1rem;margin-bottom:.9rem;background:var(--parchment,#f9f9f9);border-radius:0 8px 8px 0">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.4rem">
          <span style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:${b.cor}">${b.icon} ${b.label}</span>
          ${b.copiar ? `<button onclick="window._copiarBlocoRec(${i})" style="font-size:.75rem;padding:.2rem .6rem;border:1px solid ${b.cor};color:${b.cor};background:transparent;border-radius:5px;cursor:pointer">📋 Copiar</button>` : ''}
        </div>
        <p style="margin:0;font-size:.88rem;line-height:1.65;color:var(--ink2,#222);white-space:pre-line" data-rec-bloco="${i}">${json[b.key]||'—'}</p>
      </div>`).join('');
  } catch(e) {
    body.innerHTML = `<div class="resumo-erro"><div class="resumo-erro-icon">⚠️</div><div>${e.message}</div></div>`;
  }
}

window._copiarBlocoRec = i => {
  const el = document.querySelector(`[data-rec-bloco="${i}"]`);
  if (el) navigator.clipboard.writeText(el.textContent).then(() => mostrarToast('✓ Copiado',''));
};
window._copiarAnaliseRec = () => {
  if (window._analiseRecTexto) navigator.clipboard.writeText(window._analiseRecTexto).then(() => mostrarToast('✓ Copiado',''));
};

// ── Gerar email ───────────────────────────────────

window._gerarEmail = function (recId) {
  const rec  = carregarReclamacoes().find(r => r.id === recId);
  if (!rec) return;
  const proj = getState('projetos')?.find(p => p.id === rec.projetoId);
  const nome = proj?.nome || rec.cliente || 'Cliente';

  const assunto = `Reclamação Pós-Venda${rec.refPc?' · PC '+rec.refPc:''}${rec.refOs?' · OS '+rec.refOs:''} · ${nome}`;
  const probs   = (rec.problemas||[]).filter(p=>p.estado!=='resolvido')
    .map((p,i)=>`${i+1}. ${p.tipo}: ${p.descricao}${p.refLm?'\n   Ref. LM: '+p.refLm:''}`)
    .join('\n\n');

  const corpo = `Exmo(a) Sr(a),

Venho por este meio formalizar uma reclamação pós-venda referente ao projeto do cliente ${nome}${proj?.localidade?' ('+proj.localidade+')':''}.

IDENTIFICAÇÃO
${rec.refPc?'• Ref. PC: '+rec.refPc:''}
${rec.refOs?'• Ref. OS: '+rec.refOs:''}
${rec.contacto?'• Contacto cliente: '+rec.contacto:''}

PROBLEMAS REPORTADOS
${probs||'(ver diagnóstico em anexo)'}

Solicito análise e resposta com brevidade, para dar resposta atempada ao cliente.

Com os melhores cumprimentos,
Hélder Melo
VPR · Leroy Merlin Viseu · 917 880 364`;

  const mailto = `mailto:?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
  window.open(mailto, '_blank');
};

// ── Chamada à API Groq ────────────────────────────

async function _chamarGroq(system, mensagens) {
  const apiKey = obterGroqKey();
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1000,
      temperature: 0.5,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        ...mensagens,
      ],
    }),
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '{}';
}
