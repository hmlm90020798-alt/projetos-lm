// ════════════════════════════════════════════════
// ocorrencias.js — Módulo de Ocorrências · Projetos LM
// Disparo rápido de comunicações por tipo de ocorrência
// ════════════════════════════════════════════════

import { getState, setState } from './state.js';
import { mostrarToast }       from './ui.js';
import { guardarContactos, carregarContactos,
         guardarTemplates, carregarTemplates } from './firebase.js';

// ── Tipos de ocorrência pré-definidos ────────────

export const TIPOS_OCORRENCIA = [
  { id: 'danificado',   icon: '💥', label: 'Material danificado',    cor: '#E24B4A' },
  { id: 'falta',        icon: '📦', label: 'Material em falta',      cor: '#BA7517' },
  { id: 'troca',        icon: '🔄', label: 'Troca de material',      cor: '#378ADD' },
  { id: 'atraso',       icon: '⏱️', label: 'Atraso na entrega',      cor: '#BA7517' },
  { id: 'instalacao',   icon: '🔧', label: 'Problema na instalação', cor: '#E24B4A' },
  { id: 'conformidade', icon: '⚠️', label: 'Não conformidade',       cor: '#854F0B' },
];

// ── Templates pré-definidos ───────────────────────

export const TEMPLATES_DEFAULT = [
  {
    id: 'danificado',
    tipo: 'danificado',
    assunto: 'Artigo danificado — Projeto {{refPc}} · {{cliente}}',
    corpo: `Bom dia,

Venho por este meio informar que, no âmbito do projeto {{refPc}} (cliente: {{cliente}}, localidade: {{localidade}}), foi recebido um artigo danificado.

Referência do artigo: {{refArtigo}}
Data da ocorrência: {{data}}

Solicito a análise e envio de substituição com a maior brevidade possível, uma vez que a instalação está prevista para {{dataInstalacao}}.

Agradeço a vossa atenção.
Hélder Melo | VPR · Leroy Merlin`,
  },
  {
    id: 'falta',
    tipo: 'falta',
    assunto: 'Material em falta — Projeto {{refPc}} · {{cliente}}',
    corpo: `Bom dia,

Relativamente ao projeto {{refPc}} (cliente: {{cliente}}, localidade: {{localidade}}), verificou-se que a entrega está incompleta — falta o seguinte artigo:

Referência em falta: {{refArtigo}}
Data da entrega: {{data}}

Solicito o envio urgente do material em falta. Instalação prevista: {{dataInstalacao}}.

Hélder Melo | VPR · Leroy Merlin`,
  },
  {
    id: 'troca',
    tipo: 'troca',
    assunto: 'Pedido de troca de material — Projeto {{refPc}} · {{cliente}}',
    corpo: `Bom dia,

No âmbito do projeto {{refPc}} (cliente: {{cliente}}, localidade: {{localidade}}), é necessário proceder à troca do seguinte artigo:

Artigo a trocar: {{refArtigo}}
Motivo: {{descricao}}
Data: {{data}}

Solicito indicação do procedimento e prazo para substituição.

Hélder Melo | VPR · Leroy Merlin`,
  },
  {
    id: 'atraso',
    tipo: 'atraso',
    assunto: 'Atraso na entrega — Projeto {{refPc}} · {{cliente}}',
    corpo: `Bom dia,

A entrega referente ao projeto {{refPc}} (cliente: {{cliente}}, localidade: {{localidade}}) não foi efectuada na data acordada ({{data}}).

A instalação está prevista para {{dataInstalacao}} e o atraso compromete o cronograma.

Solicito informação sobre nova data de entrega com urgência.

Hélder Melo | VPR · Leroy Merlin`,
  },
  {
    id: 'instalacao',
    tipo: 'instalacao',
    assunto: 'Problema na instalação — Projeto {{refPc}} · {{cliente}}',
    corpo: `Bom dia,

Durante a instalação do projeto {{refPc}} (cliente: {{cliente}}, localidade: {{localidade}}), surgiu o seguinte problema:

Descrição: {{descricao}}
Data: {{data}}

Solicito apoio técnico para resolução. Disponível para contacto no 917 880 364.

Hélder Melo | VPR · Leroy Merlin`,
  },
  {
    id: 'conformidade',
    tipo: 'conformidade',
    assunto: 'Não conformidade — Projeto {{refPc}} · {{cliente}}',
    corpo: `Bom dia,

Identificou-se uma não conformidade no projeto {{refPc}} (cliente: {{cliente}}, localidade: {{localidade}}):

Descrição: {{descricao}}
Artigo em causa: {{refArtigo}}
Data: {{data}}

Solicito análise e resposta com indicação de resolução.

Hélder Melo | VPR · Leroy Merlin`,
  },
];

// ── State local ───────────────────────────────────

let _contactos = [];
let _templates  = [];
let _tiposSel   = [];
let _projSel    = null;

// ── Init ──────────────────────────────────────────

export async function initOcorrencias() {
  try {
    const c = await carregarContactos();
    _contactos = c || [];
    const t = await carregarTemplates();
    _templates  = (t && t.length) ? t : [...TEMPLATES_DEFAULT];
  } catch (_) {
    _contactos = [];
    _templates  = [...TEMPLATES_DEFAULT];
  }
}

// ── Render separador principal ─────────────────────

export function renderOcorrenciasModulo() {
  const projetos = getState('projetos');
  const el = document.getElementById('ocorrencias-modulo');
  if (!el) return;

  el.innerHTML = `
    <div class="oc-modulo">

      <!-- Disparo rápido -->
      <div class="oc-painel-grid">

        <div class="oc-card-bloco">
          <div class="oc-bloco-titulo">📨 Disparo Rápido</div>

          <div class="oc-campo">
            <label class="oc-label">Projeto</label>
            <select id="oc-proj-sel" class="f-select" onchange="window.ocSelecionarProjeto(this.value)">
              <option value="">— Seleccionar projeto —</option>
              ${projetos.map(p => `<option value="${p.id}">${p.nome || p.id}${p.localidade ? ' · ' + p.localidade : ''}</option>`).join('')}
            </select>
          </div>

          <div class="oc-campo">
            <label class="oc-label">Tipo(s) de ocorrência</label>
            <div class="oc-tipos-grid">
              ${TIPOS_OCORRENCIA.map(t => `
                <button class="oc-tipo-btn" data-id="${t.id}"
                        onclick="window.ocToggleTipo('${t.id}', this)"
                        style="--oc-cor:${t.cor}">
                  <span class="oc-tipo-icon">${t.icon}</span>
                  <span class="oc-tipo-label">${t.label}</span>
                </button>`).join('')}
            </div>
          </div>

          <div class="oc-campo" id="oc-campos-extra" style="display:none">
            <div class="oc-grid-2">
              <div>
                <label class="oc-label">Ref. artigo / descrição</label>
                <input type="text" id="oc-ref-artigo" class="f-input" placeholder="Ex: Tampo Dekton 301">
              </div>
              <div>
                <label class="oc-label">Descrição adicional</label>
                <input type="text" id="oc-descricao" class="f-input" placeholder="Detalhe relevante…">
              </div>
            </div>
          </div>

          <div class="oc-campo" id="oc-contactos-wrap" style="display:none">
            <label class="oc-label">Destinatários</label>
            <div class="oc-contactos-lista" id="oc-contactos-lista"></div>
          </div>

          <button class="btn-oc-gerar" id="btn-oc-gerar" onclick="window.ocGerarEmail()" style="display:none">
            ✉️ Gerar email e copiar
          </button>

          <div class="oc-preview" id="oc-preview" style="display:none">
            <div class="oc-preview-header">
              <div class="oc-preview-titulo">Pré-visualização</div>
              <button class="oc-preview-copiar" onclick="window.ocCopiarEmail()">📋 Copiar</button>
            </div>
            <div class="oc-preview-assunto" id="oc-preview-assunto"></div>
            <div class="oc-preview-corpo" id="oc-preview-corpo"></div>
          </div>
        </div>

        <!-- Painel lateral: contactos + templates -->
        <div class="oc-lateral">

          <div class="oc-bloco-titulo">
            👥 Contactos
            <button class="oc-btn-add-sm" onclick="window.ocNovoContacto()">+ Novo</button>
          </div>
          <div id="oc-lista-contactos" class="oc-lista-contactos"></div>

          <div class="oc-bloco-titulo" style="margin-top:24px">
            📝 Templates
            <button class="oc-btn-add-sm" onclick="window.ocEditarTemplate(null)">Editar</button>
          </div>
          <div id="oc-lista-templates" class="oc-lista-templates"></div>

        </div>
      </div>

    </div>

    <!-- Modal contacto -->
    <div class="oc-modal-overlay" id="oc-modal-contacto">
      <div class="oc-modal">
        <div class="oc-modal-header">
          <div class="oc-modal-titulo" id="oc-contacto-titulo">Novo Contacto</div>
          <button class="modal-close" onclick="window.ocFecharModalContacto()">×</button>
        </div>
        <div class="oc-modal-body">
          <input type="hidden" id="oc-contacto-id">
          <div class="form-campo">
            <label class="form-label">Nome</label>
            <input type="text" id="oc-c-nome" class="f-input" placeholder="Ex: Serviço Pós-Venda LM">
          </div>
          <div class="form-campo" style="margin-top:10px">
            <label class="form-label">Departamento / Função</label>
            <input type="text" id="oc-c-dept" class="f-input" placeholder="Ex: Logística · Leroy Merlin">
          </div>
          <div class="form-campo" style="margin-top:10px">
            <label class="form-label">Email</label>
            <input type="email" id="oc-c-email" class="f-input" placeholder="email@leroymerlin.pt">
          </div>
          <div class="form-campo" style="margin-top:10px">
            <label class="form-label">Tipos de ocorrência associados</label>
            <div class="oc-tipos-check">
              ${TIPOS_OCORRENCIA.map(t => `
                <label class="oc-check-item">
                  <input type="checkbox" class="oc-c-tipo" value="${t.id}">
                  <span>${t.icon} ${t.label}</span>
                </label>`).join('')}
            </div>
          </div>
        </div>
        <div class="oc-modal-footer">
          <button class="btn-cancelar" onclick="window.ocFecharModalContacto()">Cancelar</button>
          <button class="btn-guardar"  onclick="window.ocGuardarContacto()">Guardar</button>
        </div>
      </div>
    </div>

    <!-- Modal template -->
    <div class="oc-modal-overlay" id="oc-modal-template">
      <div class="oc-modal oc-modal-lg">
        <div class="oc-modal-header">
          <div class="oc-modal-titulo">Editar Template</div>
          <button class="modal-close" onclick="window.ocFecharModalTemplate()">×</button>
        </div>
        <div class="oc-modal-body">
          <div class="form-campo">
            <label class="form-label">Tipo de ocorrência</label>
            <select id="oc-t-tipo" class="f-select" onchange="window.ocCarregarTemplate(this.value)">
              ${TIPOS_OCORRENCIA.map(t => `<option value="${t.id}">${t.icon} ${t.label}</option>`).join('')}
            </select>
          </div>
          <div class="form-campo" style="margin-top:10px">
            <label class="form-label">Assunto</label>
            <input type="text" id="oc-t-assunto" class="f-input">
          </div>
          <div class="form-campo" style="margin-top:10px">
            <label class="form-label">Corpo do email</label>
            <div class="oc-variaveis">Variáveis: <code>{{cliente}}</code> <code>{{refPc}}</code> <code>{{localidade}}</code> <code>{{data}}</code> <code>{{dataInstalacao}}</code> <code>{{refArtigo}}</code> <code>{{descricao}}</code></div>
            <textarea id="oc-t-corpo" class="f-textarea" rows="12"></textarea>
          </div>
        </div>
        <div class="oc-modal-footer">
          <button class="btn-cancelar" onclick="window.ocFecharModalTemplate()">Cancelar</button>
          <button class="btn-guardar"  onclick="window.ocGuardarTemplate()">Guardar template</button>
        </div>
      </div>
    </div>`;

  renderContactosLista();
  renderTemplatesLista();
}

// ── Render listas ─────────────────────────────────

function renderContactosLista() {
  const el = document.getElementById('oc-lista-contactos');
  if (!el) return;
  if (!_contactos.length) {
    el.innerHTML = `<p class="tab-vazio">Nenhum contacto. Clica "+ Novo" para adicionar.</p>`;
    return;
  }
  el.innerHTML = _contactos.map(c => `
    <div class="oc-contacto-item">
      <div class="oc-contacto-info">
        <div class="oc-contacto-nome">${c.nome}</div>
        <div class="oc-contacto-dept">${c.dept || ''}</div>
        <div class="oc-contacto-email">${c.email}</div>
        <div class="oc-contacto-tipos">
          ${(c.tipos || []).map(t => {
            const tipo = TIPOS_OCORRENCIA.find(x => x.id === t);
            return tipo ? `<span class="oc-tag">${tipo.icon}</span>` : '';
          }).join('')}
        </div>
      </div>
      <div class="oc-contacto-acoes">
        <button class="oc-btn-sm" onclick="window.ocEditarContacto('${c.id}')">✏️</button>
        <button class="oc-btn-sm danger" onclick="window.ocApagarContacto('${c.id}')">🗑</button>
      </div>
    </div>`).join('');
}

function renderTemplatesLista() {
  const el = document.getElementById('oc-lista-templates');
  if (!el) return;
  el.innerHTML = TIPOS_OCORRENCIA.map(t => {
    const tmpl = _templates.find(x => x.tipo === t.id);
    return `
      <div class="oc-template-item" onclick="window.ocEditarTemplate('${t.id}')">
        <span class="oc-tipo-icon">${t.icon}</span>
        <span class="oc-template-nome">${t.label}</span>
        <span class="oc-template-estado ${tmpl ? 'ok' : 'vazio'}">${tmpl ? '✓' : '!'}</span>
      </div>`;
  }).join('');
}

// ── Lógica de disparo ─────────────────────────────

export function ocSelecionarProjeto(id) {
  _projSel = getState('projetos').find(p => p.id === id) || null;
  actualizarContactosSugeridos();
}

export function ocToggleTipo(id, btn) {
  if (_tiposSel.includes(id)) {
    _tiposSel = _tiposSel.filter(t => t !== id);
    btn.classList.remove('active');
  } else {
    _tiposSel.push(id);
    btn.classList.add('active');
  }
  // Mostrar campos extra e contactos se há tipos seleccionados
  const temTipos = _tiposSel.length > 0;
  document.getElementById('oc-campos-extra').style.display  = temTipos ? '' : 'none';
  document.getElementById('oc-contactos-wrap').style.display = temTipos ? '' : 'none';
  document.getElementById('btn-oc-gerar').style.display      = temTipos ? '' : 'none';
  document.getElementById('oc-preview').style.display        = 'none';
  actualizarContactosSugeridos();
}

function actualizarContactosSugeridos() {
  const el = document.getElementById('oc-contactos-lista');
  if (!el) return;
  // Filtrar contactos relevantes para os tipos seleccionados
  const relevantes = _contactos.filter(c =>
    !c.tipos?.length || c.tipos.some(t => _tiposSel.includes(t))
  );
  if (!relevantes.length) {
    el.innerHTML = `<p class="tab-vazio" style="font-size:12px">Sem contactos configurados para estes tipos.</p>`;
    return;
  }
  el.innerHTML = relevantes.map(c => `
    <label class="oc-dest-item">
      <input type="checkbox" class="oc-dest-check" value="${c.id}" checked>
      <div class="oc-dest-info">
        <span class="oc-dest-nome">${c.nome}</span>
        <span class="oc-dest-email">${c.email}</span>
      </div>
    </label>`).join('');
}

export function ocGerarEmail() {
  if (!_tiposSel.length) { mostrarToast('Selecciona pelo menos um tipo', ''); return; }

  const p = _projSel;
  const hoje = new Date().toLocaleDateString('pt-PT');
  const vars = {
    cliente:         p?.nome              || '—',
    refPc:           p?.refPc             || '—',
    localidade:      p?.localidade        || '—',
    data:            hoje,
    dataInstalacao:  p?.dataInstalacao ? new Date(p.dataInstalacao+'T12:00:00').toLocaleDateString('pt-PT') : '—',
    refArtigo:       document.getElementById('oc-ref-artigo')?.value?.trim() || '—',
    descricao:       document.getElementById('oc-descricao')?.value?.trim()  || '—',
  };

  const substituir = txt => txt.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] || `{{${k}}}`);

  // Gerar um email por tipo seleccionado (ou combinar)
  const partes = _tiposSel.map(tid => {
    const tmpl = _templates.find(t => t.tipo === tid) || TEMPLATES_DEFAULT.find(t => t.tipo === tid);
    if (!tmpl) return null;
    return { assunto: substituir(tmpl.assunto), corpo: substituir(tmpl.corpo) };
  }).filter(Boolean);

  if (!partes.length) { mostrarToast('Sem template para este tipo', ''); return; }

  // Destinatários seleccionados
  const destIds = Array.from(document.querySelectorAll('.oc-dest-check:checked')).map(el => el.value);
  const dests   = _contactos.filter(c => destIds.includes(c.id));
  const emails  = dests.map(c => c.email).join('; ');

  // Combinar assuntos e corpos
  const assunto = partes.map(p => p.assunto).join(' | ');
  const corpo   = partes.map(p => p.corpo).join('\n\n---\n\n');

  // Mostrar preview
  const prevAssunto = document.getElementById('oc-preview-assunto');
  const prevCorpo   = document.getElementById('oc-preview-corpo');
  if (prevAssunto) prevAssunto.textContent = `Para: ${emails || '(sem destinatários)'}\nAssunto: ${assunto}`;
  if (prevCorpo)   prevCorpo.textContent   = corpo;
  document.getElementById('oc-preview').style.display = '';

  // Guardar para copiar
  setState({ ocEmailGerado: { emails, assunto, corpo } });
}

export function ocCopiarEmail() {
  const email = getState('ocEmailGerado');
  if (!email) return;
  const texto = `Para: ${email.emails}\nAssunto: ${email.assunto}\n\n${email.corpo}`;
  navigator.clipboard.writeText(texto).then(() => {
    mostrarToast('✓ Email copiado!', 'Cola directamente no Outlook ou Gmail.');
  });
}

// ── Gestão de contactos ───────────────────────────

export function ocNovoContacto() {
  document.getElementById('oc-contacto-id').value = '';
  document.getElementById('oc-contacto-titulo').textContent = 'Novo Contacto';
  document.getElementById('oc-c-nome').value  = '';
  document.getElementById('oc-c-dept').value  = '';
  document.getElementById('oc-c-email').value = '';
  document.querySelectorAll('.oc-c-tipo').forEach(el => el.checked = false);
  document.getElementById('oc-modal-contacto').classList.add('open');
}

export function ocEditarContacto(id) {
  const c = _contactos.find(x => x.id === id);
  if (!c) return;
  document.getElementById('oc-contacto-id').value = id;
  document.getElementById('oc-contacto-titulo').textContent = 'Editar Contacto';
  document.getElementById('oc-c-nome').value  = c.nome  || '';
  document.getElementById('oc-c-dept').value  = c.dept  || '';
  document.getElementById('oc-c-email').value = c.email || '';
  document.querySelectorAll('.oc-c-tipo').forEach(el => {
    el.checked = (c.tipos || []).includes(el.value);
  });
  document.getElementById('oc-modal-contacto').classList.add('open');
}

export async function ocGuardarContacto() {
  const id    = document.getElementById('oc-contacto-id').value || Date.now().toString(36);
  const nome  = document.getElementById('oc-c-nome').value.trim();
  const dept  = document.getElementById('oc-c-dept').value.trim();
  const email = document.getElementById('oc-c-email').value.trim();
  if (!nome || !email) { alert('Nome e email são obrigatórios.'); return; }
  const tipos = Array.from(document.querySelectorAll('.oc-c-tipo:checked')).map(el => el.value);
  const contacto = { id, nome, dept, email, tipos };
  const idx = _contactos.findIndex(c => c.id === id);
  if (idx >= 0) _contactos[idx] = contacto; else _contactos.push(contacto);
  await guardarContactos(_contactos);
  ocFecharModalContacto();
  renderContactosLista();
  mostrarToast('✓ Contacto guardado', '');
}

export function ocFecharModalContacto() {
  document.getElementById('oc-modal-contacto').classList.remove('open');
}

export async function ocApagarContacto(id) {
  if (!confirm('Apagar este contacto?')) return;
  _contactos = _contactos.filter(c => c.id !== id);
  await guardarContactos(_contactos);
  renderContactosLista();
}

// ── Gestão de templates ───────────────────────────

export function ocEditarTemplate(tipoId) {
  const tipo = tipoId || TIPOS_OCORRENCIA[0].id;
  document.getElementById('oc-t-tipo').value = tipo;
  ocCarregarTemplate(tipo);
  document.getElementById('oc-modal-template').classList.add('open');
}

export function ocCarregarTemplate(tipoId) {
  const tmpl = _templates.find(t => t.tipo === tipoId)
            || TEMPLATES_DEFAULT.find(t => t.tipo === tipoId);
  if (tmpl) {
    document.getElementById('oc-t-assunto').value = tmpl.assunto;
    document.getElementById('oc-t-corpo').value   = tmpl.corpo;
  }
}

export async function ocGuardarTemplate() {
  const tipo    = document.getElementById('oc-t-tipo').value;
  const assunto = document.getElementById('oc-t-assunto').value.trim();
  const corpo   = document.getElementById('oc-t-corpo').value.trim();
  if (!assunto || !corpo) { alert('Preenche o assunto e o corpo.'); return; }
  const tmpl = { id: tipo, tipo, assunto, corpo };
  const idx  = _templates.findIndex(t => t.tipo === tipo);
  if (idx >= 0) _templates[idx] = tmpl; else _templates.push(tmpl);
  await guardarTemplates(_templates);
  ocFecharModalTemplate();
  renderTemplatesLista();
  mostrarToast('✓ Template guardado', '');
}

export function ocFecharModalTemplate() {
  document.getElementById('oc-modal-template').classList.remove('open');
}
