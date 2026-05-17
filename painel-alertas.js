// ════════════════════════════════════════════════
// painel-alertas.js — Alertas, Agenda e Ocorrências
// Projetos LM
// ════════════════════════════════════════════════

import { getProjects }               from './state.js';
import { getAlertasReclamacoes }     from './reclamacoes.js';
import { esc }                       from './sanitize.js';
// TIPOS_PROJETO e faseOrdem são injectados via initAlertasModule()
let TIPOS_PROJETO = [];
let faseOrdem = () => 0;

export function initAlertasModule(tiposProjeto, faseOrdemFn) {
  TIPOS_PROJETO = tiposProjeto;
  faseOrdem     = faseOrdemFn;
}

// ── Separadores (tabs) ────────────────────────────

export function setTab(btnEl, tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  btnEl.classList.add('active');
  document.getElementById('tab-' + tab)?.classList.add('active');

  const btnNovo = document.getElementById('btn-novo-proj');
  if (btnNovo) btnNovo.style.display = tab === 'projetos' ? '' : 'none';

  if (tab === 'alertas')      renderAlertas();
  if (tab === 'ocorrencias')  renderOcorrenciasTab();
  if (tab === 'reclamacoes') {
    if (typeof window.renderReclamacoes === 'function') {
      window.renderReclamacoes();
    }
  }
}

// ── Alertas & Agenda ──────────────────────────────

const LS_ALERTAS_DISPENSADOS = 'projetos_lm_alertas_dispensados';

function alertasDispensados() {
  try { return JSON.parse(localStorage.getItem(LS_ALERTAS_DISPENSADOS) || '{}'); }
  catch { return {}; }
}

function dispensarAlerta(chave) {
  const d = alertasDispensados();
  d[chave] = new Date().toISOString().split('T')[0];
  localStorage.setItem(LS_ALERTAS_DISPENSADOS, JSON.stringify(d));
  renderAlertas();
}

// Limpar automaticamente dispensados com mais de 30 dias
function limparDispensadosAntigos() {
  const d     = alertasDispensados();
  const limite = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  let alterado = false;
  for (const k in d) { if (d[k] < limite) { delete d[k]; alterado = true; } }
  if (alterado) localStorage.setItem(LS_ALERTAS_DISPENSADOS, JSON.stringify(d));
}

window.dispensarAlerta = dispensarAlerta;

export function renderAlertas() {
  const lista  = getProjects();
  const hoje   = new Date();
  hoje.setHours(0,0,0,0);
  const em14   = new Date(hoje.getTime() + 14 * 86400000);

  const alertas = [];
  const agenda  = [];

  const parseData = iso => {
    if (!iso) return null;
    const d = new Date(iso + 'T12:00:00');
    return isNaN(d) ? null : d;
  };

  const diasAte = d => Math.round((d - hoje) / 86400000);

  lista.forEach(p => {
    const nome = p.nome || '—';
    const tipo = TIPOS_PROJETO.find(t => t.value === p.tipo)?.label || p.tipo || '';

    // Proposta a expirar
    if (p.prazo && faseOrdem(p.fase) < faseOrdem('aprovado')) {
      const d = parseData(p.prazo);
      if (d) {
        const dias = diasAte(d);
        if (dias <= 0)
          alertas.push({ id: p.id, cor: 'urgente', tipo: 'Proposta expirada', nome, sub: 'Necessita renovação', data: d.toLocaleDateString('pt-PT'), ordem: -1 });
        else if (dias <= 2)
          alertas.push({ id: p.id, cor: 'urgente', tipo: `Proposta expira ${dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : 'em ' + dias + ' dias'}`, nome, sub: tipo, data: d.toLocaleDateString('pt-PT'), ordem: dias });
        else if (dias <= 7)
          alertas.push({ id: p.id, cor: 'aviso', tipo: `Proposta expira em ${dias} dias`, nome, sub: tipo, data: d.toLocaleDateString('pt-PT'), ordem: dias });

        if (d >= hoje && d <= em14)
          agenda.push({ data: d, label: d.toLocaleDateString('pt-PT', {day:'numeric',month:'short'}), nome, evento: 'Proposta expira', cor: dias <= 2 ? '#E24B4A' : '#BA7517' });
      }
    }

    // Entrega de materiais
    const dEnt = parseData(p.dataEntregaMat);
    if (dEnt) {
      const dias = diasAte(dEnt);
      if (dias >= 0 && dias <= 3)
        alertas.push({ id: p.id, cor: dias <= 1 ? 'urgente' : 'aviso', tipo: `Entrega ${dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : 'em ' + dias + ' dias'}`, nome, sub: 'Materiais — ' + tipo, data: dEnt.toLocaleDateString('pt-PT'), ordem: dias });
      if (dEnt >= hoje && dEnt <= em14)
        agenda.push({ data: dEnt, label: dEnt.toLocaleDateString('pt-PT', {day:'numeric',month:'short'}), nome, evento: 'Entrega de materiais', cor: '#BA7517' });
    }

    // Instalação a iniciar
    const dInst = parseData(p.dataInstalacao);
    if (dInst) {
      const dias = diasAte(dInst);
      if (dias >= 0 && dias <= 5)
        alertas.push({ id: p.id, cor: dias <= 1 ? 'urgente' : 'aviso', tipo: `Instalação ${dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : 'em ' + dias + ' dias'}`, nome, sub: tipo, data: dInst.toLocaleDateString('pt-PT'), ordem: dias });
      if (dInst >= hoje && dInst <= em14)
        agenda.push({ data: dInst, label: dInst.toLocaleDateString('pt-PT', {day:'numeric',month:'short'}), nome, evento: 'Início da instalação', cor: '#378ADD' });
    }

    // Em montagem
    if (p.fase === 'montagem')
      alertas.push({ id: p.id, cor: 'ok', tipo: 'Em montagem', nome, sub: tipo + (p.dataInstalacao ? ' · desde ' + new Date(p.dataInstalacao+'T12:00:00').toLocaleDateString('pt-PT') : ''), data: '', ordem: 99 });

    // Conclusão prevista
    const dConc = parseData(p.dataConclusao);
    if (dConc && dConc >= hoje && dConc <= em14)
      agenda.push({ data: dConc, label: dConc.toLocaleDateString('pt-PT', {day:'numeric',month:'short'}), nome, evento: 'Conclusão prevista', cor: '#639922' });

    // Aprovação pendente há mais de 5 dias
    if (p.fase === 'proposta' && p.dataCriacao) {
      const criacao = parseData(p.dataCriacao);
      if (criacao) {
        const diasCriado = Math.round((hoje - criacao) / 86400000);
        if (diasCriado >= 5)
          alertas.push({ id: p.id, cor: 'info', tipo: `Sem resposta há ${diasCriado} dias`, nome, sub: 'Proposta enviada, aguarda aprovação', data: criacao.toLocaleDateString('pt-PT'), ordem: 50 + diasCriado });
      }
    }
  });

  alertas.sort((a, b) => a.ordem - b.ordem);
  agenda.sort((a, b) => a.data - b.data);

  // Filtrar alertas dispensados
  limparDispensadosAntigos();
  const dispensados = alertasDispensados();
  const alertasFiltrados = alertas.filter(a => {
    const chave = `${a.id}_${a.tipo}`;
    return !dispensados[chave];
  });

  const corLabel = { urgente: 'Urgente', aviso: 'Atenção', info: 'Info', ok: 'Em curso' };

  const alertasHtml = alertasFiltrados.length ? alertasFiltrados.map(a => {
    const chave = `${a.id}_${a.tipo}`;
    return `
    <div class="alerta-card alerta-${a.cor}">
      <div class="alerta-card-inner" onclick="window.abrirProjetoDoAlerta('${a.id}')" style="cursor:pointer;flex:1">
        <div class="alerta-tipo alerta-tipo-${a.cor}">${a.tipo}</div>
        <div class="alerta-nome">${a.nome}</div>
        <div class="alerta-detalhe">${a.sub}</div>
        ${a.data ? `<div class="alerta-data">${a.data}</div>` : ''}
      </div>
      <button class="alerta-dispensar" onclick="event.stopPropagation();window.dispensarAlerta('${chave}')" title="Dispensar alerta">×</button>
    </div>`;
  }).join('')
  : `<p class="tab-vazio">✓ Sem alertas activos — tudo em ordem.</p>`;

  const hoje2 = new Date(); hoje2.setHours(0,0,0,0);
  const agendaHtml = agenda.length ? agenda.map(a => {
    const dias = Math.round((a.data - hoje2) / 86400000);
    const diaLabel = dias === 0 ? 'Hoje' : dias === 1 ? 'Amanhã' : a.label;
    return `
      <div class="agenda-item">
        <div class="agenda-dia">${diaLabel}</div>
        <div class="agenda-dot" style="background:${a.cor}"></div>
        <div class="agenda-info">
          <div class="agenda-proj">${a.nome}</div>
          <div class="agenda-evento">${a.evento}</div>
        </div>
      </div>`;
  }).join('')
  : `<p class="tab-vazio">Sem eventos nos próximos 14 dias.</p>`;

  // Atualizar badge — só alertas não dispensados
  const badge = document.getElementById('tab-badge-alertas');
  if (badge) { badge.textContent = alertasFiltrados.length || ''; badge.style.display = alertasFiltrados.length ? '' : 'none'; }

  // Alertas de reclamações
  let reclamacoesHtml = '';
  try {
    const recsUrgentes = getAlertasReclamacoes();
    if (recsUrgentes.length) {
      reclamacoesHtml = `
        <div class="tab-sec-titulo" style="margin-top:28px">🚨 Reclamações a acompanhar</div>
        <div class="alerta-grid">
          ${recsUrgentes.map(r => {
            const dias = r.diasRestantes;
            const cor  = dias < 0 ? '#ef4444' : dias === 0 ? '#ef4444' : '#f59e0b';
            const txt  = dias < 0 ? `Atrasado ${Math.abs(dias)}d` : dias === 0 ? 'Hoje' : `${dias}d`;
            const probs = (r.problemas||[]).filter(p=>p.estado!=='resolvido').map(p=>p.tipo).join(', ');
            return `
              <div class="alerta-card" onclick="window.setTab(document.querySelector('[onclick*=reclamacoes]'),'reclamacoes')" style="cursor:pointer;border-left:3px solid ${cor}">
                <div class="alerta-header">
                  <span class="alerta-titulo">🚨 ${r.nomeDisplay}</span>
                  <span class="alerta-badge" style="background:${cor}20;color:${cor};border:1px solid ${cor}40">${txt}</span>
                </div>
                <div class="alerta-desc">${probs || 'Reclamação pendente'}</div>
              </div>`;
          }).join('')}
        </div>`;
    }
  } catch {}

  document.getElementById('alertas-content').innerHTML = `
    <div class="tab-sec-titulo">Alertas activos</div>
    <div class="alerta-grid">${alertasHtml}</div>
    ${reclamacoesHtml}
    <div class="tab-sec-titulo" style="margin-top:28px">Agenda — próximos 14 dias</div>
    <div class="agenda-lista">${agendaHtml}</div>`;
}

// ── Ocorrências (tab dedicado) ────────────────────

export function renderOcorrenciasTab() {
  const lista  = getProjects();
  const tipoLabels   = { atraso: 'Atraso na entrega', defeito: 'Defeito de material', instalacao: 'Problema na instalação', falta: 'Material em falta', outro: 'Outro' };
  const estadoLabels = { detectada: 'Detectada', resolucao: 'Em resolução', resolvida: 'Resolvida' };

  const activas   = [];
  const resolvidas = [];

  lista.forEach(p => {
    (p.ocorrencias||[]).forEach(o => {
      const item = { ...o, projNome: p.nome||'—', projTipo: TIPOS_PROJETO.find(t=>t.value===p.tipo)?.label||p.tipo||'', projId: p.id };
      if (o.estado === 'resolvida') resolvidas.push(item);
      else activas.push(item);
    });
  });

  // Ordenar activas: detectadas primeiro, depois em resolução
  activas.sort((a,b) => (a.estado === 'detectada' ? 0 : 1) - (b.estado === 'detectada' ? 0 : 1));
  resolvidas.sort((a,b) => (b.data||'').localeCompare(a.data||''));

  // Badge
  const badge = document.getElementById('tab-badge-ocorr');
  if (badge) { badge.textContent = activas.length || ''; badge.style.display = activas.length ? '' : 'none'; }

  const nDetect = activas.filter(o => o.estado === 'detectada').length;
  const nResol  = activas.filter(o => o.estado === 'resolucao').length;

  const resumoHtml = activas.length ? `
    <div class="ocorr-resumo">
      ${nDetect ? `<span class="oc-pill oc-pill-verm">${nDetect} detectada${nDetect>1?'s':''}</span>` : ''}
      ${nResol  ? `<span class="oc-pill oc-pill-amb">${nResol} em resolução</span>` : ''}
    </div>` : '';

  const activasHtml = activas.length ? activas.map(o => {
    const diasReg = o.data ? Math.round((new Date() - new Date(o.data.split('/').reverse().join('-')+'T12:00:00')) / 86400000) : null;
    const estadoCls = o.estado === 'detectada' ? 'badge-detect' : 'badge-resol';
    return `
      <div class="oc-card" onclick="window.abrirDrawerAcompanhamento('${o.projId}');setTimeout(()=>window.setAcompTab('ocorrencias',document.querySelectorAll('.acomp-tab')[1]),150)">>
        <div class="oc-card-header">
          <div class="oc-card-proj">${o.projNome} · ${o.projTipo}</div>
          ${diasReg !== null ? `<div class="oc-card-dias">Há ${diasReg} dia${diasReg!==1?'s':''}</div>` : ''}
          <span class="oc-estado-badge ${estadoCls}">${estadoLabels[o.estado]||o.estado}</span>
        </div>
        <div class="oc-items">
          <div class="oc-item">
            <div class="oc-item-tipo oc-tipo-${o.estado==='detectada'?'d':'r'}">${tipoLabels[o.tipo]||o.tipo}</div>
            <div class="oc-item-desc">${o.descricao||''}</div>
            <div class="oc-item-data">${o.data||''}</div>
          </div>
        </div>
      </div>`;
  }).join('')
  : `<p class="tab-vazio">✓ Sem ocorrências activas.</p>`;

  const resolvidasHtml = resolvidas.slice(0,10).map(o => `
    <div class="hist-item" onclick="window.abrirDrawerAcompanhamento('${o.projId}');setTimeout(()=>window.setAcompTab('ocorrencias',document.querySelectorAll('.acomp-tab')[1]),150)">>
      <div class="hist-check">✓</div>
      <div class="hist-proj">${o.projNome}</div>
      <div class="hist-tipo">${tipoLabels[o.tipo]||o.tipo}</div>
      <div class="hist-data">Resolvida ${o.data||''}</div>
    </div>`).join('');

  document.getElementById('ocorrencias-content').innerHTML = `
    <div class="tab-sec-topo">
      <div class="tab-sec-titulo">Ocorrências activas</div>
      ${resumoHtml}
    </div>
    <div class="oc-lista">${activasHtml}</div>
    ${resolvidas.length ? `
      <div class="tab-sec-titulo" style="margin-top:28px;padding-top:20px;border-top:0.5px solid var(--border)">Resolvidas recentemente</div>
      <div class="hist-lista">${resolvidasHtml}</div>` : ''}`;
}
