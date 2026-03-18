// ════════════════════════════════════════════════
// reclamacoes.js — Diagnóstico Conversacional de Reclamações
// Projetos LM · Hélder Melo
// Registo em linguagem natural · Prazo 3 dias · Alertas integrados
// ════════════════════════════════════════════════

import { getState } from './state.js';
import { mostrarToast, gerarId, dataHoje } from './ui.js';

// ── Storage ───────────────────────────────────────

const LS_KEY_GROQ = 'projetos_lm_groq_key';
const LS_KEY_REC  = 'projetos_lm_reclamacoes';
const LS_KEY_MEM  = 'projetos_lm_rec_memoria';

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
  localStorage.setItem(LS_KEY_MEM, JSON.stringify(lista.slice(-30)));
}

// Calcular data de prazo (hoje + N dias, formato YYYY-MM-DD)
function calcPrazo(dias = 3) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().split('T')[0];
}

// Dias restantes até prazo (negativo = atrasado)
function diasParaPrazo(prazoISO) {
  if (!prazoISO) return null;
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const alvo = new Date(prazoISO + 'T00:00:00');
  return Math.round((alvo - hoje) / 86400000);
}

// ── Estado da conversa ────────────────────────────

let _conversa   = [];
let _dadosRec   = {};
let _recId      = null;
let _aguardando = false;

// ── Render página principal ───────────────────────

export function renderReclamacoes() {
  const secao = document.getElementById('reclamacoes-content');
  if (!secao) return;

  const lista      = carregarReclamacoes();
  const pendentes  = lista.filter(r => r.estado === 'pendente').length;
  const emCurso    = lista.filter(r => r.estado === 'em_curso').length;
  const resolvidas = lista.filter(r => r.estado === 'resolvido').length;

  // Alertas urgentes (prazo <= 1 dia ou atrasado)
  const urgentes = lista.filter(r => {
    if (r.estado === 'resolvido') return false;
    const d = diasParaPrazo(r.prazoAcompanhamento);
    return d !== null && d <= 1;
  }).length;

  // Atualizar badge no menu
  const badge = document.getElementById('tab-badge-reclamacoes');
  if (badge) { badge.textContent = urgentes || ''; badge.style.display = urgentes ? '' : 'none'; }

  secao.innerHTML = `
    <div class="rec-page">
      <div class="rec-header">
        <div>
          <h2 class="rec-titulo">🚨 Reclamações Pós-Venda</h2>
          <p class="rec-sub">Diagnóstico em linguagem natural · Acompanhamento automático</p>
        </div>
        <button class="btn-novo rec-btn-nova" onclick="window._abrirDiagnostico()">+ Nova Reclamação</button>
      </div>

      <div class="rec-stats">
        <div class="rec-stat"><span class="rec-stat-num" style="color:#f59e0b">${pendentes}</span><span class="rec-stat-label">Pendentes</span></div>
        <div class="rec-stat"><span class="rec-stat-num" style="color:#3b82f6">${emCurso}</span><span class="rec-stat-label">Em Curso</span></div>
        <div class="rec-stat"><span class="rec-stat-num" style="color:#10b981">${resolvidas}</span><span class="rec-stat-label">Resolvidas</span></div>
        ${urgentes ? `<div class="rec-stat"><span class="rec-stat-num" style="color:#ef4444">${urgentes}</span><span class="rec-stat-label">⚠️ Urgentes</span></div>` : ''}
      </div>

      <div class="rec-lista">
        ${lista.length === 0
          ? `<div class="empty-state">
               <div class="empty-icon">✅</div>
               <div class="empty-titulo">Sem reclamações registadas</div>
               <div class="empty-sub">Clica em "+ Nova Reclamação" e descreve o problema em linguagem natural — a IA trata do resto.</div>
             </div>`
          : lista.slice().reverse().map(r => _renderCard(r)).join('')
        }
      </div>
    </div>
  `;
}

function _renderCard(r) {
  const cores  = { pendente: '#f59e0b', em_curso: '#3b82f6', resolvido: '#10b981' };
  const textos = { pendente: 'Pendente', em_curso: 'Em Curso', resolvido: 'Resolvido' };
  const cor    = cores[r.estado]  || '#f59e0b';
  const txt    = textos[r.estado] || 'Pendente';
  const proj   = getState('projetos')?.find(p => p.id === r.projetoId);
  const nome   = proj?.nome || r.cliente || '—';
  const pendProb = (r.problemas || []).filter(p => p.estado !== 'resolvido').length;

  // Badge de prazo
  const dias = diasParaPrazo(r.prazoAcompanhamento);
  let prazoBadge = '';
  if (r.estado !== 'resolvido' && dias !== null) {
    if (dias < 0)       prazoBadge = `<span class="rec-badge" style="background:#fee2e2;color:#ef4444;border:1px solid #fca5a5">⚠️ Atrasado ${Math.abs(dias)}d</span>`;
    else if (dias === 0) prazoBadge = `<span class="rec-badge" style="background:#fee2e2;color:#ef4444;border:1px solid #fca5a5">⚠️ Hoje</span>`;
    else if (dias <= 2)  prazoBadge = `<span class="rec-badge" style="background:#fef3c7;color:#d97706;border:1px solid #fcd34d">⏰ ${dias}d</span>`;
    else                 prazoBadge = `<span class="rec-badge" style="background:#f0fdf4;color:#16a34a;border:1px solid #86efac">${dias}d</span>`;
  }

  return `
    <div class="rec-card ${dias !== null && dias <= 1 && r.estado !== 'resolvido' ? 'rec-card-urgente' : ''}">
      <div class="rec-card-header">
        <div class="rec-card-info">
          <div class="rec-card-nome">${nome}</div>
          <div class="rec-card-meta">
            ${r.refPc ? `<span>PC: ${r.refPc}</span>` : ''}
            ${r.refOs ? `<span>OS: ${r.refOs}</span>` : ''}
            <span>${r.dataCriacao || ''}</span>
          </div>
        </div>
        <div class="rec-card-badges">
          <span class="rec-badge" style="background:${cor}20;color:${cor};border:1px solid ${cor}40">${txt}</span>
          ${pendProb > 0 ? `<span class="rec-badge" style="background:#fee2e2;color:#ef4444;border:1px solid #fca5a5">${pendProb} por resolver</span>` : ''}
          ${prazoBadge}
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
                <div class="rec-problema-tipo">${p.tipo||''}</div>
                <div class="rec-problema-desc">${p.descricao||''}</div>
                ${p.refLm?`<div class="rec-problema-ref">Ref. LM: <code>${p.refLm}</code></div>`:''}
              </div>
            </div>`).join('')}
        </div>` : ''}

      <div class="rec-card-acoes">
        <button class="rec-btn rec-btn-ia"    onclick="window._abrirAnaliseIA('${r.id}')">✦ Análise IA</button>
        <button class="rec-btn rec-btn-email" onclick="window._gerarEmail('${r.id}')">✉️ Email</button>
        <button class="rec-btn rec-btn-edit"  onclick="window._continuarDiagnostico('${r.id}')">💬 Continuar</button>
        <button class="rec-btn rec-btn-del"   onclick="window._apagarReclamacao('${r.id}')">🗑</button>
      </div>
    </div>
  `;
}

// ── Alertas para tab Alertas & Agenda ─────────────

export function getAlertasReclamacoes() {
  const lista = carregarReclamacoes();
  return lista
    .filter(r => r.estado !== 'resolvido')
    .map(r => {
      const proj = getState('projetos')?.find(p => p.id === r.projetoId);
      const nome = proj?.nome || r.cliente || '—';
      const dias = diasParaPrazo(r.prazoAcompanhamento);
      return { ...r, nomeDisplay: nome, diasRestantes: dias };
    })
    .filter(r => r.diasRestantes !== null && r.diasRestantes <= 3)
    .sort((a, b) => a.diasRestantes - b.diasRestantes);
}

// ── Modal de diagnóstico conversacional ───────────

window._abrirDiagnostico = function () {
  if (!obterGroqKey()) { mostrarToast('⚠️ Chave IA não configurada', 'Configura a chave Groq no Resumo IA'); return; }
  _recId    = gerarId();
  _dadosRec = { id: _recId, dataCriacao: dataHoje(), estado: 'pendente', problemas: [], prazoAcompanhamento: calcPrazo(3) };
  _conversa = [];
  _criarModalChat();
  _enviarSistema();
};

window._continuarDiagnostico = function (id) {
  if (!obterGroqKey()) { mostrarToast('⚠️ Chave IA não configurada', 'Configura a chave Groq no Resumo IA'); return; }
  const rec = carregarReclamacoes().find(r => r.id === id);
  if (!rec) return;
  _recId    = id;
  _dadosRec = { ...rec };
  _conversa = [];
  _criarModalChat();
  _adicionarMensagemIA('A retomar esta reclamação. Há algo a acrescentar, atualizar ou já posso gerar a análise e o email?');
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
            <div class="resumo-titulo">Nova Reclamação</div>
            <div class="resumo-sub" id="rec-chat-sub">A preparar…</div>
          </div>
        </div>
        <button class="modal-close" onclick="window._fecharDiagnostico()">×</button>
      </div>
      <div class="rec-chat-body" id="rec-chat-body">
        <div class="resumo-loading"><div class="resumo-spinner"></div><span>A iniciar diagnóstico…</span></div>
      </div>
      <div class="rec-chat-footer">
        <div class="rec-chat-input-wrap">
          <textarea id="rec-chat-input" class="rec-chat-input"
            placeholder="Descreve o problema livremente…" rows="2"
            onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();window._enviarMensagem()}"></textarea>
          <button class="rec-chat-send" onclick="window._enviarMensagem()">→</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  setTimeout(() => document.getElementById('rec-chat-input')?.focus(), 150);
}

// ── Mensagens ─────────────────────────────────────

function _adicionarMensagemIA(texto, opcoes = []) {
  const body = document.getElementById('rec-chat-body');
  if (!body) return;
  body.querySelector('.resumo-loading')?.remove();
  const div = document.createElement('div');
  div.className = 'rec-msg rec-msg-ia';
  div.innerHTML = `
    <div class="rec-msg-avatar">✦</div>
    <div class="rec-msg-bubble">
      <p class="rec-msg-texto">${texto.replace(/\n/g,'<br>')}</p>
      ${opcoes.length ? `<div class="rec-msg-opcoes">${opcoes.map(op =>
        `<button class="rec-opcao-btn" onclick="window._escolherOpcao('${op.replace(/'/g,"\\'")}')">${op}</button>`
      ).join('')}</div>` : ''}
    </div>`;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
  _conversa.push({ role: 'assistant', content: texto });
}

function _adicionarMensagemUser(texto) {
  const body = document.getElementById('rec-chat-body');
  if (!body) return;
  const div = document.createElement('div');
  div.className = 'rec-msg rec-msg-user';
  div.innerHTML = `<div class="rec-msg-bubble rec-msg-bubble-user"><p class="rec-msg-texto">${texto.replace(/\n/g,'<br>')}</p></div>`;
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
  div.innerHTML = `<div class="rec-msg-avatar">✦</div><div class="rec-msg-bubble"><span class="rec-typing-dots"><span></span><span></span><span></span></span></div>`;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

function _removerTyping() { document.querySelector('.rec-typing')?.remove(); }

// ── Envio ─────────────────────────────────────────

window._enviarMensagem = function () {
  const input = document.getElementById('rec-chat-input');
  const texto = input?.value?.trim();
  if (!texto || _aguardando) return;
  input.value = '';
  document.querySelectorAll('.rec-msg-opcoes').forEach(el => el.remove());
  _adicionarMensagemUser(texto);
  _chamarIA();
};

window._escolherOpcao = function (op) {
  document.querySelectorAll('.rec-msg-opcoes').forEach(el => el.remove());
  _adicionarMensagemUser(op);
  _chamarIA();
};

async function _enviarSistema() {
  _aguardando = true;
  _mostrarTyping();
  try {
    const r = await _chamarGroq(_construirSystemPrompt(), [{ role: 'user', content: 'Inicia o diagnóstico.' }]);
    _removerTyping();
    _processarResposta(r);
  } catch { _removerTyping(); _adicionarMensagemIA('Erro ao iniciar. Verifica a chave API.'); }
  finally { _aguardando = false; }
}

async function _chamarIA() {
  if (_aguardando) return;
  _aguardando = true;
  _mostrarTyping();
  try {
    const r = await _chamarGroq(_construirSystemPrompt(), _conversa);
    _removerTyping();
    _processarResposta(r);
  } catch { _removerTyping(); _adicionarMensagemIA('Ocorreu um erro. Tenta de novo.'); }
  finally { _aguardando = false; document.getElementById('rec-chat-input')?.focus(); }
}

// ── Processar resposta ────────────────────────────

function _processarResposta(raw) {
  try {
    const json = JSON.parse(raw);

    if (json.dados) {
      // Merge inteligente — não sobrescrever arrays vazios
      if (json.dados.problemas?.length) _dadosRec.problemas = json.dados.problemas;
      const { problemas, ...resto } = json.dados;
      _dadosRec = { ..._dadosRec, ...resto };
      if (json.dados.prazoAcompanhamento) _dadosRec.prazoAcompanhamento = json.dados.prazoAcompanhamento;
      const sub = document.getElementById('rec-chat-sub');
      if (sub && _dadosRec.cliente) sub.textContent = _dadosRec.cliente;
    }

    if (json.pergunta) _adicionarMensagemIA(json.pergunta, json.opcoes || []);
    if (json.completo) { _guardarRascunho(); _mostrarResumoFinal(json.resumo, json.proximosPassos); }
    if (json.padrao)   { const m = carregarMemoria(); m.push({ data: dataHoje(), padrao: json.padrao }); guardarMemoria(m); }

  } catch { _adicionarMensagemIA(raw); }
}

// ── System prompt ─────────────────────────────────

function _construirSystemPrompt() {
  const projetos = getState('projetos') || [];
  const memoria  = carregarMemoria();

  const listaProj = projetos.map(p =>
    `{"id":"${p.id}","nome":"${p.nome||''}","localidade":"${p.localidade||''}","refPc":"${p.refPc||''}","refOs":"${p.refOs||''}","fase":"${p.fase||''}"}`
  ).join('\n');

  const memoriaTexto = memoria.length
    ? `\nPADRÕES APRENDIDOS:\n${memoria.map(m=>`- ${m.padrao}`).join('\n')}`
    : '';

  const dadosAtuais = Object.keys(_dadosRec).length > 3
    ? `\nDADOS JÁ RECOLHIDOS:\n${JSON.stringify(_dadosRec,null,2)}`
    : '';

  return `És um assistente de registo de reclamações pós-venda para Hélder Melo, VPR da Leroy Merlin Viseu.

FLUXO OBRIGATÓRIO — APENAS 3 PASSOS:

PASSO 1 — IDENTIFICAR O CLIENTE
Pergunta: "Qual o cliente, PC ou OS?"
- Se o nome/PC/OS bater com a lista de projetos, confirma com uma linha: "Encontrei — [Nome], [Localidade]. É este?"
- Se não encontrar na lista, aceita os dados que o Hélder der (PC e OS) e avança
- Nunca listes todos os projetos

PASSO 2 — QUAL O PROBLEMA?
Pergunta apenas: "Qual o problema?"
- O Hélder pode despejar tudo de uma vez em linguagem completamente livre
- Interpreta tudo e classifica automaticamente em:
  📦 ENTREGA — problemas com transportadora, danos no transporte, atrasos, má conduta
  🔧 MATERIAL — artigos danificados, em falta, não conformes (pede ref. LM se não tiver)
  🏗️ INSTALAÇÃO — trabalho por concluir, má qualidade, adiamentos, conduta do técnico
  😤 OUTRO — insatisfação geral, atendimento, outros
- Depois de interpretar, apresenta um resumo formatado e pergunta: "Está tudo correto ou falta algo?"

PASSO 3 — CONFIRMAR E FECHAR
- Se o Hélder confirmar → fecha imediatamente com completo=true
- Se faltar algo (ex: ref. LM num artigo danificado sem referência) → pergunta só isso antes de fechar
- Define prazoAcompanhamento: "${calcPrazo(3)}"

REGRAS ABSOLUTAS:
- MÁXIMO 3 interações — não arrastar o diagnóstico
- Nunca perguntes o nome ou contacto do Hélder — a app é dele
- Aceita linguagem 100% livre e informal
- Se o Hélder der muita informação de uma vez, processa tudo sem pedir que repita
- Só pergunta ref. LM se o problema for material danificado E a referência não foi mencionada
- Tom direto, sem floreados

PROJETOS NA APP:
${listaProj || 'nenhum'}${dadosAtuais}${memoriaTexto}

RESPONDE SEMPRE EM JSON:
{
  "pergunta": "texto da pergunta ou confirmação (vazio se completo=true)",
  "opcoes": [],
  "dados": {
    "cliente": "",
    "projetoId": "",
    "refPc": "",
    "refOs": "",
    "prazoAcompanhamento": "",
    "problemas": [{"tipo":"","descricao":"","refLm":"","estado":"pendente"}]
  },
  "completo": false,
  "resumo": "",
  "proximosPassos": "",
  "padrao": ""
}
Só JSON. Português europeu.`;
}

// ── Guardar rascunho ──────────────────────────────

function _guardarRascunho() {
  const lista = carregarReclamacoes();
  const idx   = lista.findIndex(r => r.id === _recId);
  if (idx >= 0) lista[idx] = { ...lista[idx], ..._dadosRec };
  else lista.push({ ..._dadosRec });
  guardarReclamacoes(lista);
}

// ── Resumo final ──────────────────────────────────

function _mostrarResumoFinal(resumo, proximosPassos) {
  const body = document.getElementById('rec-chat-body');
  if (!body) return;
  const dias = diasParaPrazo(_dadosRec.prazoAcompanhamento);
  const div  = document.createElement('div');
  div.className = 'rec-resumo-final';
  div.innerHTML = `
    <div class="rec-resumo-header">✦ Diagnóstico concluído</div>
    ${resumo ? `<p class="rec-resumo-texto">${resumo.replace(/\n/g,'<br>')}</p>` : ''}
    ${proximosPassos ? `<div class="rec-resumo-passos"><strong>Próximos passos:</strong><br>${proximosPassos.replace(/\n/g,'<br>')}</div>` : ''}
    <div class="rec-resumo-alerta">
      ⏰ Alerta de acompanhamento definido para <strong>${dias !== null ? (dias === 0 ? 'hoje' : `${dias} dia${dias!==1?'s':''}`) : '3 dias'}</strong>
    </div>
    <div class="rec-resumo-acoes">
      <button class="rec-btn rec-btn-ia"    onclick="window._abrirAnaliseIA('${_recId}')">✦ Análise IA completa</button>
      <button class="rec-btn rec-btn-email" onclick="window._gerarEmail('${_recId}')">✉️ Gerar email</button>
      <button class="rec-btn" style="background:var(--green-pale);color:var(--green);font-weight:600" onclick="window._fecharDiagnostico()">✓ Guardar e fechar</button>
    </div>`;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
  _guardarRascunho();
  renderReclamacoes();
}

window._fecharDiagnostico = function () {
  if (_dadosRec && Object.keys(_dadosRec).length > 3) _guardarRascunho();
  document.getElementById('modal-rec-chat')?.remove();
  renderReclamacoes();
};

// ── Toggle problema ───────────────────────────────

window._toggleProblema = function (recId, idx, checked) {
  const lista = carregarReclamacoes();
  const rec   = lista.find(r => r.id === recId);
  if (!rec?.problemas?.[idx]) return;
  rec.problemas[idx].estado = checked ? 'resolvido' : 'pendente';
  const total      = rec.problemas.length;
  const resolvidos = rec.problemas.filter(p => p.estado === 'resolvido').length;
  rec.estado = resolvidos === total ? 'resolvido' : resolvidos > 0 ? 'em_curso' : 'pendente';
  guardarReclamacoes(lista);
  renderReclamacoes();
};

window._apagarReclamacao = function (id) {
  if (!confirm('Apagar esta reclamação?')) return;
  guardarReclamacoes(carregarReclamacoes().filter(r => r.id !== id));
  renderReclamacoes();
  mostrarToast('Reclamação apagada', '');
};

// ── Análise IA ────────────────────────────────────

window._abrirAnaliseIA = function (recId) {
  const rec = carregarReclamacoes().find(r => r.id === recId);
  if (!rec || !obterGroqKey()) { mostrarToast('⚠️ Sem chave API',''); return; }

  document.getElementById('modal-rec-ia')?.remove();
  const proj = getState('projetos')?.find(p => p.id === rec.projetoId);
  const nome = proj?.nome || rec.cliente || '—';

  const modal = document.createElement('div');
  modal.id = 'modal-rec-ia';
  modal.className = 'resumo-overlay open';
  modal.innerHTML = `
    <div class="resumo-modal">
      <div class="resumo-header">
        <div class="resumo-header-left">
          <span class="resumo-icon">✦</span>
          <div>
            <div class="resumo-titulo">Análise IA · Reclamação</div>
            <div class="resumo-sub">${nome}${rec.refPc?' · PC '+rec.refPc:''}</div>
          </div>
        </div>
        <button class="modal-close" onclick="document.getElementById('modal-rec-ia').remove()">×</button>
      </div>
      <div class="resumo-body" id="rec-ia-body">
        <div class="resumo-loading"><div class="resumo-spinner"></div><span>A analisar…</span></div>
      </div>
      <div class="resumo-footer">
        <button class="resumo-btn-copiar" onclick="window._copiarAnaliseRec()">📋 Copiar tudo</button>
        <span class="resumo-disclaimer">Gerado por IA — verificar sempre</span>
      </div>
    </div>`;
  document.body.appendChild(modal);
  _executarAnaliseIA(rec, proj);
};

async function _executarAnaliseIA(rec, proj) {
  const body   = document.getElementById('rec-ia-body');
  const mem    = carregarMemoria();
  const probs  = (rec.problemas||[]).map((p,i)=>`${i+1}. [${p.estado}] ${p.tipo}: ${p.descricao}${p.refLm?' (Ref: '+p.refLm+')':''}`).join('\n');
  const memTxt = mem.length ? `\nPADRÕES ANTERIORES:\n${mem.map(m=>`- ${m.padrao}`).join('\n')}` : '';
  const dias   = diasParaPrazo(rec.prazoAcompanhamento);

  const prompt = `RECLAMAÇÃO:
Cliente: ${proj?.nome||rec.cliente||'—'}
Ref. PC: ${rec.refPc||'—'} | Ref. OS: ${rec.refOs||'—'}
Data: ${rec.dataCriacao||'—'}
Prazo acompanhamento: ${rec.prazoAcompanhamento||'—'} (${dias!==null?(dias<0?`atrasado ${Math.abs(dias)}d`:`${dias}d`):'—'})
PROBLEMAS:\n${probs||'—'}${memTxt}`;

  const system = `És um mentor de gestão de reclamações pós-venda para Hélder Melo, VPR Leroy Merlin Viseu.
Processos LM: material danificado → pedido interno a custo zero + CC serviços + chefe; entrega/instalação → comunicar serviços + CC chefe.
Responde em JSON:
{"diagnostico":"análise gravidade e responsabilidades (máx 3 frases)","defesa":"argumentação interna — boa fé, quem assume cada custo (máx 4 frases)","respostaCliente":"mensagem WhatsApp/email — tom próximo, reconhece sem admitir culpa, dá prazo (máx 5 linhas)","proximosPassos":"3-5 ações concretas separadas por ' → '","alertas":"riscos críticos (máx 2 frases)"}
Português europeu. Só JSON.`;

  try {
    const res  = await _chamarGroq(system, [{ role:'user', content: prompt }]);
    const json = JSON.parse(res);
    window._analiseRecTexto = ['DIAGNÓSTICO','DEFESA INTERNA','RESPOSTA AO CLIENTE','PRÓXIMOS PASSOS','ALERTAS']
      .map((t,i)=>`${t}\n${Object.values(json)[i]||'—'}`).join('\n\n');

    const blocos = [
      { icon:'🔍', label:'Diagnóstico',        cor:'#6b7280', key:'diagnostico',     copiar:false },
      { icon:'🛡️', label:'Defesa interna',     cor:'#3b82f6', key:'defesa',          copiar:false },
      { icon:'💬', label:'Resposta ao cliente', cor:'#10b981', key:'respostaCliente', copiar:true  },
      { icon:'⚡', label:'Próximos passos',     cor:'#f59e0b', key:'proximosPassos',  copiar:false },
      { icon:'⚠️', label:'Alertas',             cor:'#ef4444', key:'alertas',         copiar:false },
    ];
    body.innerHTML = blocos.map((b,i)=>`
      <div style="border-left:3px solid ${b.cor};padding:.9rem 1rem;margin-bottom:.9rem;background:var(--parchment,#f9f9f9);border-radius:0 8px 8px 0">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.4rem">
          <span style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:${b.cor}">${b.icon} ${b.label}</span>
          ${b.copiar?`<button onclick="window._copiarBlocoRec(${i})" style="font-size:.75rem;padding:.2rem .6rem;border:1px solid ${b.cor};color:${b.cor};background:transparent;border-radius:5px;cursor:pointer">📋 Copiar</button>`:''}
        </div>
        <p style="margin:0;font-size:.88rem;line-height:1.65;color:var(--ink2,#222);white-space:pre-line" data-rec-bloco="${i}">${json[b.key]||'—'}</p>
      </div>`).join('');
  } catch(e) {
    body.innerHTML = `<div class="resumo-erro"><div class="resumo-erro-icon">⚠️</div><div>${e.message}</div></div>`;
  }
}

window._copiarBlocoRec = i => {
  const el = document.querySelector(`[data-rec-bloco="${i}"]`);
  if (el) navigator.clipboard.writeText(el.textContent).then(()=>mostrarToast('✓ Copiado',''));
};
window._copiarAnaliseRec = () => {
  if (window._analiseRecTexto) navigator.clipboard.writeText(window._analiseRecTexto).then(()=>mostrarToast('✓ Análise copiada',''));
};

// ── Gerar email ───────────────────────────────────

window._gerarEmail = function (recId) {
  const rec  = carregarReclamacoes().find(r => r.id === recId);
  if (!rec) return;
  const proj = getState('projetos')?.find(p => p.id === rec.projetoId);
  const nome = proj?.nome || rec.cliente || 'Cliente';
  const probs = (rec.problemas||[]).filter(p=>p.estado!=='resolvido')
    .map((p,i)=>`${i+1}. ${p.tipo}: ${p.descricao}${p.refLm?'\n   Ref. LM: '+p.refLm:''}`).join('\n\n');

  const assunto = `Reclamação Pós-Venda${rec.refPc?' · PC '+rec.refPc:''}${rec.refOs?' · OS '+rec.refOs:''} · ${nome}`;
  const corpo   = `Bom dia,\n\nTenho uma situação pós-venda do cliente ${nome}${proj?.localidade?' ('+proj.localidade+')':''} que precisa de acompanhamento.\n${rec.refPc?'\nPC: '+rec.refPc:''}${rec.refOs?'\nOS: '+rec.refOs:''}\n\nPROBLEMAS REPORTADOS\n${probs||'(ver diagnóstico)'}\n\nPreciso de resposta com brevidade para dar retorno ao cliente. Obrigado!\n\nHélder Melo\n917 880 364`;
  window.open(`mailto:?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`,'_blank');
};

// ── Chamada Groq ──────────────────────────────────

async function _chamarGroq(system, msgs) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${obterGroqKey()}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1000,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [{ role:'system', content:system }, ...msgs],
    }),
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '{}';
}
