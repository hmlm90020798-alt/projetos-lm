// ════════════════════════════════════════════════
// reclamacoes.js — Gestão de Reclamações Pós-Venda
// Projetos LM · Hélder Melo
// ════════════════════════════════════════════════

import { getState, setState } from './state.js';
import { mostrarToast, gerarId, dataHoje } from './ui.js';

// ── Constantes ────────────────────────────────────

const LS_KEY_GROQ   = 'projetos_lm_groq_key';
const LS_KEY_REC    = 'projetos_lm_reclamacoes';

const TIPOS_PROBLEMA = [
  'Artigo danificado',
  'Artigo em falta',
  'Instalação por concluir',
  'Defeito de funcionamento',
  'Problema estético',
  'Atraso na entrega',
  'Outro',
];

const ESTADO_LABEL = {
  pendente:   { txt: 'Pendente',    cor: '#f59e0b' },
  em_curso:   { txt: 'Em curso',    cor: '#3b82f6' },
  resolvido:  { txt: 'Resolvido',   cor: '#10b981' },
};

// ── Storage de reclamações (localStorage) ─────────

function carregarReclamacoes() {
  try { return JSON.parse(localStorage.getItem(LS_KEY_REC) || '[]'); }
  catch { return []; }
}

function guardarReclamacoes(lista) {
  localStorage.setItem(LS_KEY_REC, JSON.stringify(lista));
}

function obterGroqKey() {
  return localStorage.getItem(LS_KEY_GROQ) || '';
}

// ── Página principal de reclamações ──────────────

export function renderReclamacoes() {
  const lista = carregarReclamacoes();

  const secao = document.getElementById('reclamacoes-content');
  if (!secao) return;

  secao.innerHTML = `
    <div class="rec-header">
      <div class="rec-header-left">
        <h2 class="rec-titulo">⚠️ Reclamações Pós-Venda</h2>
        <p class="rec-sub">Regista, acompanha e resolve problemas com apoio da IA</p>
      </div>
      <button class="btn-primary" onclick="window._abrirNovaReclamacao()">+ Nova Reclamação</button>
    </div>

    <div class="rec-stats">
      <div class="rec-stat">
        <span class="rec-stat-num" style="color:#f59e0b">${lista.filter(r => r.estado === 'pendente').length}</span>
        <span class="rec-stat-label">Pendentes</span>
      </div>
      <div class="rec-stat">
        <span class="rec-stat-num" style="color:#3b82f6">${lista.filter(r => r.estado === 'em_curso').length}</span>
        <span class="rec-stat-label">Em Curso</span>
      </div>
      <div class="rec-stat">
        <span class="rec-stat-num" style="color:#10b981">${lista.filter(r => r.estado === 'resolvido').length}</span>
        <span class="rec-stat-label">Resolvidas</span>
      </div>
    </div>

    <div class="rec-lista" id="rec-lista">
      ${lista.length === 0
        ? `<div class="empty-state">
             <div class="empty-icon">✅</div>
             <div class="empty-titulo">Sem reclamações registadas</div>
             <div class="empty-sub">Quando surgir uma situação pós-venda, regista aqui para acompanhar e resolver com o apoio da IA.</div>
           </div>`
        : lista.slice().reverse().map(r => renderCardReclamacao(r)).join('')
      }
    </div>
  `;
}

function renderCardReclamacao(r) {
  const est  = ESTADO_LABEL[r.estado] || ESTADO_LABEL.pendente;
  const proj = getState('projetos')?.find(p => p.id === r.projetoId);
  const nomeProj = proj ? `${proj.nome} · ${proj.localidade || ''}` : (r.nomeCliente || '—');
  const pendentes = (r.problemas || []).filter(p => p.estado !== 'resolvido').length;

  return `
    <div class="rec-card" id="rec-card-${r.id}">
      <div class="rec-card-header">
        <div class="rec-card-info">
          <div class="rec-card-nome">${nomeProj}</div>
          <div class="rec-card-meta">
            ${r.refPc ? `<span>PC: ${r.refPc}</span>` : ''}
            ${r.refOs ? `<span>OS: ${r.refOs}</span>` : ''}
            <span>${r.dataCriacao || ''}</span>
          </div>
        </div>
        <div class="rec-card-badges">
          <span class="rec-badge" style="background:${est.cor}20;color:${est.cor};border:1px solid ${est.cor}40">${est.txt}</span>
          ${pendentes > 0 ? `<span class="rec-badge" style="background:#fee2e2;color:#ef4444;border:1px solid #fca5a5">${pendentes} por resolver</span>` : ''}
        </div>
      </div>

      <div class="rec-problemas">
        ${(r.problemas || []).map((p, i) => `
          <div class="rec-problema ${p.estado === 'resolvido' ? 'resolvido' : ''}">
            <div class="rec-problema-check">
              <input type="checkbox" ${p.estado === 'resolvido' ? 'checked' : ''}
                onchange="window._toggleProblema('${r.id}', ${i}, this.checked)"
              />
            </div>
            <div class="rec-problema-body">
              <div class="rec-problema-tipo">${p.tipo}</div>
              <div class="rec-problema-desc">${p.descricao || '—'}</div>
              ${p.refLm ? `<div class="rec-problema-ref">Ref. LM: <code>${p.refLm}</code></div>` : ''}
              ${p.temFoto ? `<div class="rec-problema-foto">📎 Foto anexa</div>` : ''}
            </div>
          </div>
        `).join('')}
      </div>

      <div class="rec-card-acoes">
        <button class="rec-btn rec-btn-ia" onclick="window._abrirAnaliseIA('${r.id}')">✦ Analisar com IA</button>
        <button class="rec-btn rec-btn-email" onclick="window._abrirEmail('${r.id}')">✉️ Gerar Email</button>
        <button class="rec-btn rec-btn-edit" onclick="window._editarReclamacao('${r.id}')">✏️ Editar</button>
        <button class="rec-btn rec-btn-del" onclick="window._apagarReclamacao('${r.id}')">🗑</button>
      </div>
    </div>
  `;
}

// ── Modal Nova / Editar Reclamação ────────────────

window._abrirNovaReclamacao = function () {
  _abrirModalReclamacao(null);
};

window._editarReclamacao = function (id) {
  _abrirModalReclamacao(id);
};

function _abrirModalReclamacao(id) {
  const lista = carregarReclamacoes();
  const rec   = id ? lista.find(r => r.id === id) : null;
  const projetos = getState('projetos') || [];

  let modal = document.getElementById('modal-rec-form');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'modal-rec-form';
  modal.className = 'resumo-overlay open';

  const opcoesProj = projetos.map(p =>
    `<option value="${p.id}" ${rec?.projetoId === p.id ? 'selected' : ''}>${p.nome} · ${p.localidade || ''}</option>`
  ).join('');

  const problemasHtml = (rec?.problemas || [{ tipo: '', descricao: '', refLm: '', estado: 'pendente', temFoto: false }])
    .map((p, i) => renderFormProblema(p, i)).join('');

  modal.innerHTML = `
    <div class="resumo-modal" style="max-width:600px;max-height:90vh;overflow-y:auto">
      <div class="resumo-header">
        <div class="resumo-header-left">
          <span class="resumo-icon">⚠️</span>
          <div>
            <div class="resumo-titulo">${rec ? 'Editar Reclamação' : 'Nova Reclamação'}</div>
            <div class="resumo-sub">Regista os problemas reportados pelo cliente</div>
          </div>
        </div>
        <button class="modal-close" onclick="document.getElementById('modal-rec-form').remove()">×</button>
      </div>

      <div class="resumo-body" style="padding:1.25rem">

        <!-- Projeto -->
        <div class="form-group">
          <label class="form-label">Projeto associado</label>
          <select id="rec-projeto" class="form-control">
            <option value="">— Selecionar projeto —</option>
            ${opcoesProj}
          </select>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem">
          <div class="form-group">
            <label class="form-label">Ref. PC</label>
            <input id="rec-refPc" class="form-control" placeholder="PC-XXXXX" value="${rec?.refPc || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Ref. OS</label>
            <input id="rec-refOs" class="form-control" placeholder="OS-XXXXX" value="${rec?.refOs || ''}">
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem">
          <div class="form-group">
            <label class="form-label">Email equipa de serviços</label>
            <input id="rec-emailServicos" class="form-control" type="email" placeholder="servicos@leroymerlin.pt" value="${rec?.emailServicos || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">CC: Chefe direto</label>
            <input id="rec-emailChefe" class="form-control" type="email" placeholder="chefe@leroymerlin.pt" value="${rec?.emailChefe || ''}">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Estado geral</label>
          <select id="rec-estado" class="form-control">
            <option value="pendente"  ${(!rec || rec.estado === 'pendente')  ? 'selected' : ''}>🟡 Pendente</option>
            <option value="em_curso"  ${rec?.estado === 'em_curso'  ? 'selected' : ''}>🔵 Em curso</option>
            <option value="resolvido" ${rec?.estado === 'resolvido' ? 'selected' : ''}>🟢 Resolvido</option>
          </select>
        </div>

        <!-- Problemas -->
        <div style="margin-top:1rem">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.6rem">
            <label class="form-label" style="margin:0">Problemas reportados</label>
            <button class="rec-btn rec-btn-ia" style="font-size:.8rem;padding:.3rem .7rem" onclick="window._adicionarProblema()">+ Adicionar problema</button>
          </div>
          <div id="rec-problemas-lista">
            ${problemasHtml}
          </div>
        </div>

        <div class="form-group" style="margin-top:1rem">
          <label class="form-label">Notas internas</label>
          <textarea id="rec-notas" class="form-control" rows="3" placeholder="Contexto adicional, histórico relevante, acordos verbais...">${rec?.notas || ''}</textarea>
        </div>

      </div>

      <div class="resumo-footer" style="justify-content:flex-end;gap:.6rem">
        <button class="resumo-btn-copiar" onclick="document.getElementById('modal-rec-form').remove()">Cancelar</button>
        <button class="resumo-btn-regen" style="opacity:1" onclick="window._guardarReclamacao('${id || ''}')">✓ Guardar</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

function renderFormProblema(p, i) {
  return `
    <div class="rec-form-problema" id="rec-prob-${i}" style="border:1px solid var(--border,#e5e7eb);border-radius:8px;padding:.9rem;margin-bottom:.6rem;position:relative">
      <button onclick="window._removerProblema(${i})" style="position:absolute;top:.5rem;right:.5rem;background:none;border:none;cursor:pointer;font-size:1rem;color:#9ca3af">×</button>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;margin-bottom:.6rem">
        <div class="form-group" style="margin:0">
          <label class="form-label">Tipo de problema</label>
          <select class="form-control prob-tipo">
            ${TIPOS_PROBLEMA.map(t => `<option ${p.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Ref. LM (artigo)</label>
          <input class="form-control prob-refLm" placeholder="Ex: 3276006xxxxxx" value="${p.refLm || ''}">
        </div>
      </div>

      <div class="form-group" style="margin-bottom:.6rem">
        <label class="form-label">Descrição do problema</label>
        <textarea class="form-control prob-desc" rows="2" placeholder="Descreve o problema de forma clara e objetiva...">${p.descricao || ''}</textarea>
      </div>

      <div style="display:flex;align-items:center;gap:1rem">
        <label style="display:flex;align-items:center;gap:.4rem;font-size:.85rem;cursor:pointer">
          <input type="checkbox" class="prob-foto" ${p.temFoto ? 'checked' : ''}> Tem foto/evidência
        </label>
        <label style="display:flex;align-items:center;gap:.4rem;font-size:.85rem;cursor:pointer">
          <input type="checkbox" class="prob-resolvido" ${p.estado === 'resolvido' ? 'checked' : ''}> Já resolvido
        </label>
      </div>
    </div>
  `;
}

window._adicionarProblema = function () {
  const lista = document.getElementById('rec-problemas-lista');
  const i = lista.querySelectorAll('.rec-form-problema').length;
  lista.insertAdjacentHTML('beforeend', renderFormProblema({}, i));
};

window._removerProblema = function (i) {
  document.getElementById(`rec-prob-${i}`)?.remove();
};

function lerProblemasDoForm() {
  const probs = [];
  document.querySelectorAll('.rec-form-problema').forEach(el => {
    probs.push({
      tipo:      el.querySelector('.prob-tipo')?.value     || 'Outro',
      descricao: el.querySelector('.prob-desc')?.value     || '',
      refLm:     el.querySelector('.prob-refLm')?.value    || '',
      temFoto:   el.querySelector('.prob-foto')?.checked   || false,
      estado:    el.querySelector('.prob-resolvido')?.checked ? 'resolvido' : 'pendente',
    });
  });
  return probs;
}

window._guardarReclamacao = function (idExistente) {
  const projetoId      = document.getElementById('rec-projeto')?.value || '';
  const refPc          = document.getElementById('rec-refPc')?.value.trim() || '';
  const refOs          = document.getElementById('rec-refOs')?.value.trim() || '';
  const emailServicos  = document.getElementById('rec-emailServicos')?.value.trim() || '';
  const emailChefe     = document.getElementById('rec-emailChefe')?.value.trim() || '';
  const estado         = document.getElementById('rec-estado')?.value || 'pendente';
  const notas          = document.getElementById('rec-notas')?.value.trim() || '';
  const problemas      = lerProblemasDoForm();

  if (!problemas.length || !problemas[0].descricao) {
    mostrarToast('⚠️ Atenção', 'Regista pelo menos um problema com descrição');
    return;
  }

  const proj = getState('projetos')?.find(p => p.id === projetoId);

  const lista = carregarReclamacoes();

  if (idExistente) {
    const idx = lista.findIndex(r => r.id === idExistente);
    if (idx >= 0) {
      lista[idx] = { ...lista[idx], projetoId, nomeCliente: proj?.nome || '', refPc, refOs, emailServicos, emailChefe, estado, notas, problemas };
    }
  } else {
    lista.push({
      id: gerarId(),
      projetoId,
      nomeCliente: proj?.nome || '',
      refPc,
      refOs,
      emailServicos,
      emailChefe,
      estado,
      notas,
      problemas,
      dataCriacao: dataHoje(),
    });
  }

  guardarReclamacoes(lista);
  document.getElementById('modal-rec-form')?.remove();
  renderReclamacoes();
  mostrarToast('✓ Reclamação guardada', '');
};

// ── Toggle problema resolvido ─────────────────────

window._toggleProblema = function (recId, idx, checked) {
  const lista = carregarReclamacoes();
  const rec   = lista.find(r => r.id === recId);
  if (!rec || !rec.problemas[idx]) return;
  rec.problemas[idx].estado = checked ? 'resolvido' : 'pendente';

  // Auto-atualizar estado geral
  const todos     = rec.problemas.length;
  const resolvidos = rec.problemas.filter(p => p.estado === 'resolvido').length;
  if (resolvidos === todos) rec.estado = 'resolvido';
  else if (resolvidos > 0)  rec.estado = 'em_curso';
  else                      rec.estado = 'pendente';

  guardarReclamacoes(lista);
  renderReclamacoes();
};

// ── Apagar reclamação ─────────────────────────────

window._apagarReclamacao = function (id) {
  if (!confirm('Tens a certeza que queres apagar esta reclamação?')) return;
  const lista = carregarReclamacoes().filter(r => r.id !== id);
  guardarReclamacoes(lista);
  renderReclamacoes();
  mostrarToast('Reclamação apagada', '');
};

// ── Gerar Email ───────────────────────────────────

window._abrirEmail = function (recId) {
  const lista = carregarReclamacoes();
  const rec   = lista.find(r => r.id === recId);
  if (!rec) return;

  const proj = getState('projetos')?.find(p => p.id === rec.projetoId);
  const nome = proj?.nome || rec.nomeCliente || 'Cliente';
  const local = proj?.localidade || '';

  const assunto = `Reclamação Pós-Venda${rec.refPc ? ' · PC ' + rec.refPc : ''}${rec.refOs ? ' · OS ' + rec.refOs : ''} · ${nome}`;

  const problemasTexto = (rec.problemas || [])
    .filter(p => p.estado !== 'resolvido')
    .map((p, i) => {
      let linha = `${i + 1}. ${p.tipo}: ${p.descricao}`;
      if (p.refLm) linha += `\n   Ref. LM: ${p.refLm}`;
      if (p.temFoto) linha += `\n   (Foto em anexo)`;
      return linha;
    }).join('\n\n');

  const corpo = `Exmo(a) Sr(a),

Venho por este meio formalizar uma situação de reclamação pós-venda referente ao projeto abaixo identificado, reportada pelo cliente ${nome}${local ? ' (' + local + ')' : ''}.

IDENTIFICAÇÃO DO PROJETO
${rec.refPc ? '• Referência PC: ' + rec.refPc : ''}
${rec.refOs ? '• Ordem de Serviço: ' + rec.refOs : ''}
${local ? '• Localidade: ' + local : ''}

PROBLEMAS REPORTADOS
${problemasTexto || '(ver descrição em anexo)'}

${rec.notas ? 'NOTAS ADICIONAIS\n' + rec.notas + '\n' : ''}
Solicito a vossa análise e resposta com a maior brevidade possível, de forma a podermos dar uma resposta atempada ao cliente e proceder à resolução das situações identificadas.

Agradeço a colaboração.

Com os melhores cumprimentos,
Hélder Melo
Vendedor Projetos de Renovação · Leroy Merlin Viseu
917 880 364`;

  // Abrir cliente de email
  const mailto = `mailto:${rec.emailServicos || ''}?cc=${rec.emailChefe || ''}&subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
  window.open(mailto, '_blank');
};

// ── Análise IA ────────────────────────────────────

window._abrirAnaliseIA = function (recId) {
  const lista = carregarReclamacoes();
  const rec   = lista.find(r => r.id === recId);
  if (!rec) return;

  const apiKey = obterGroqKey();
  if (!apiKey) {
    mostrarToast('⚠️ Chave IA não configurada', 'Configura a chave Groq no Resumo IA');
    return;
  }

  // Criar modal de análise
  let modal = document.getElementById('modal-rec-ia');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'modal-rec-ia';
  modal.className = 'resumo-overlay open';

  const proj = getState('projetos')?.find(p => p.id === rec.projetoId);
  const nome = proj?.nome || rec.nomeCliente || 'Cliente';

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
        <div class="resumo-loading">
          <div class="resumo-spinner"></div>
          <span>A analisar a reclamação…</span>
        </div>
      </div>
      <div class="resumo-footer">
        <button class="resumo-btn-copiar" onclick="window._copiarAnaliseRec()">📋 Copiar tudo</button>
        <span class="resumo-disclaimer">Gerado por IA — verificar sempre os dados</span>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  _gerarAnaliseIA(rec, proj);
};

async function _gerarAnaliseIA(rec, proj) {
  const body = document.getElementById('rec-ia-body');
  if (!body) return;

  const apiKey = obterGroqKey();

  // Construir contexto
  const problemasTexto = (rec.problemas || []).map((p, i) =>
    `${i + 1}. [${p.estado}] ${p.tipo}: ${p.descricao}${p.refLm ? ' (Ref. LM: ' + p.refLm + ')' : ''}${p.temFoto ? ' — com foto' : ''}`
  ).join('\n');

  const prompt = `RECLAMAÇÃO PÓS-VENDA:
Cliente: ${proj?.nome || rec.nomeCliente || '—'}
Localidade: ${proj?.localidade || '—'}
Ref. PC: ${rec.refPc || '—'}
Ref. OS: ${rec.refOs || '—'}
Data da reclamação: ${rec.dataCriacao || '—'}
Fase do projeto: ${proj?.fase || '—'}

PROBLEMAS REPORTADOS:
${problemasTexto}

${rec.notas ? 'NOTAS INTERNAS:\n' + rec.notas : ''}`;

  const systemPrompt = `És um mentor experiente de vendas e gestão de reclamações para Hélder Melo, VPR da Leroy Merlin Portugal.
O Hélder recebeu uma reclamação pós-venda de um cliente e precisa de apoio imediato para três coisas:
1. Perceber a situação e como se defender internamente
2. Saber como responder ao cliente de forma assertiva e humana
3. Antecipar as questões difíceis (porque só agora, quem paga, como resolver)

Responde OBRIGATORIAMENTE em JSON com exatamente esta estrutura:
{
  "diagnostico": "Análise objetiva da situação: gravidade, urgência, responsabilidades prováveis. Máximo 3 frases.",
  "defesa": "Argumentação interna para o Hélder se defender perante o chefe ou equipa de serviços. Aborda: porque pode ter demorado a aparecer (instalação recente, uso progressivo), como demonstrar que agiu de boa fé, quem deve assumir cada custo (fornecedor/instalador/loja). Texto corrido, máximo 4 frases.",
  "respostaCliente": "Mensagem para enviar ao cliente (WhatsApp ou email). Tom próximo, humano e profissional. Reconhece o problema sem admitir culpa excessiva, transmite que está a tratar com prioridade e dá um prazo concreto de resposta. Máximo 5 linhas.",
  "proximosPassos": "Lista sequencial de 3 a 5 ações concretas que o Hélder deve tomar hoje ou nos próximos 2 dias, por ordem de prioridade. Texto corrido separado por ' → '.",
  "alertas": "Riscos ou pontos críticos a não ignorar nesta situação específica. Ex: prazo de garantia, risco de escalada, artigo com longa espera. Máximo 2 frases."
}

Responde APENAS com o JSON, sem texto antes ou depois. Usa português europeu.`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1400,
        temperature: 0.6,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: prompt },
        ],
      }),
    });

    if (!response.ok) throw new Error(`Erro ${response.status}`);

    const data = await response.json();
    const resultado = JSON.parse(data.choices?.[0]?.message?.content || '{}');

    window._analiseRecTexto = [
      `DIAGNÓSTICO\n${resultado.diagnostico}`,
      `DEFESA INTERNA\n${resultado.defesa}`,
      `RESPOSTA AO CLIENTE\n${resultado.respostaCliente}`,
      `PRÓXIMOS PASSOS\n${resultado.proximosPassos}`,
      `ALERTAS\n${resultado.alertas}`,
    ].join('\n\n');

    const blocos = [
      { icon: '🔍', label: 'Diagnóstico',        cor: '#6b7280', campo: 'diagnostico',      copiar: false },
      { icon: '🛡️', label: 'Defesa interna',     cor: '#3b82f6', campo: 'defesa',           copiar: false },
      { icon: '💬', label: 'Resposta ao cliente', cor: '#10b981', campo: 'respostaCliente',  copiar: true  },
      { icon: '⚡', label: 'Próximos passos',     cor: '#f59e0b', campo: 'proximosPassos',   copiar: false },
      { icon: '⚠️', label: 'Alertas',             cor: '#ef4444', campo: 'alertas',          copiar: false },
    ];

    body.innerHTML = blocos.map((b, i) => `
      <div style="border-left:3px solid ${b.cor};padding:.9rem 1rem;margin-bottom:.9rem;background:var(--bg-alt,#f9f9f9);border-radius:0 8px 8px 0">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.4rem">
          <div style="display:flex;align-items:center;gap:.4rem">
            <span>${b.icon}</span>
            <span style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:${b.cor}">${b.label}</span>
          </div>
          ${b.copiar ? `<button onclick="window._copiarBlocoRec(${i})" style="font-size:.75rem;padding:.2rem .6rem;border:1px solid ${b.cor};color:${b.cor};background:transparent;border-radius:5px;cursor:pointer">📋 Copiar</button>` : ''}
        </div>
        <p style="margin:0;font-size:.88rem;line-height:1.65;color:var(--text,#222);white-space:pre-line" data-rec-bloco="${i}">${resultado[b.campo] || '—'}</p>
      </div>
    `).join('');

  } catch (e) {
    body.innerHTML = `
      <div class="resumo-erro">
        <div class="resumo-erro-icon">⚠️</div>
        <div>Não foi possível gerar a análise.</div>
        <div class="resumo-erro-detalhe">${e.message}</div>
      </div>`;
  }
}

window._copiarBlocoRec = function (i) {
  const el = document.querySelector(`[data-rec-bloco="${i}"]`);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent).then(() => mostrarToast('✓ Copiado', ''));
};

window._copiarAnaliseRec = function () {
  const texto = window._analiseRecTexto;
  if (!texto) return;
  navigator.clipboard.writeText(texto).then(() => mostrarToast('✓ Análise copiada', ''));
};
