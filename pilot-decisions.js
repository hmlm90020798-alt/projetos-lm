// FASE 4P.41.1 — Decisões públicas do projeto.
// Âmbito fechado: apresentação no Portal Cliente de decisões já presentes
// na projeção pública controlada. Não lê dados internos nem publica conteúdo.

const clean = v => typeof v === 'string' ? v.trim() : '';

function esc(v) {
  return clean(v)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizarDecisoes(items) {
  return (Array.isArray(items) ? items : [])
    .map(item => ({
      titulo: clean(item?.titulo),
      estado: clean(item?.estado),
      data: clean(item?.data),
      texto: clean(item?.texto),
    }))
    .filter(item => item.titulo);
}

function formatarData(valor, lang) {
  if (!valor) return '';
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(valor);
  if (!iso) return esc(valor);
  const d = new Date(`${valor}T12:00:00`);
  if (Number.isNaN(d.getTime())) return esc(valor);
  return d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'pt-PT');
}

function removerSecaoExistente() {
  document.getElementById('wrap-decisoes-publicas')?.remove();
}

export function prepararDecisoesPublicas(items) {
  const decisoes = normalizarDecisoes(items);

  // A renderização da página cliente ocorre depois da adaptação da publicação.
  // Executar no ciclo seguinte mantém o adaptador sem dependência de cliente.js.
  queueMicrotask(() => {
    requestAnimationFrame(() => renderDecisoesPublicas(decisoes));
  });
}

export function renderDecisoesPublicas(items) {
  removerSecaoExistente();
  const decisoes = normalizarDecisoes(items);
  if (!decisoes.length) return;

  const docs = document.getElementById('wrap-docs');
  const approval = document.getElementById('aprovacao');
  const parent = docs?.parentNode || approval?.parentNode;
  if (!parent) return;

  const lang = globalThis._LANG === 'en' ? 'en' : 'pt';
  const eyebrow = lang === 'en' ? 'Project decisions' : 'Decisões do projeto';
  const titulo = lang === 'en' ? 'Decisions & confirmations' : 'Decisões e confirmações';
  const intro = lang === 'en'
    ? 'A clear record of the decisions shared for this project.'
    : 'Um registo claro das decisões partilhadas neste projeto.';

  const wrap = document.createElement('div');
  wrap.id = 'wrap-decisoes-publicas';
  wrap.innerHTML = `
    <section class="cli-sec cli-sec-soft" id="decisoes-publicas">
      <div class="cli-sec-inner">
        <div class="sec-header">
          <span class="sec-num">06</span>
          <div>
            <div class="sec-eyebrow">${eyebrow}</div>
            <h2 class="sec-titulo">${titulo}</h2>
            <p class="sec-desc">${intro}</p>
          </div>
        </div>
        <div style="display:grid;gap:12px">
          ${decisoes.map(item => `
            <article style="border:1px solid rgba(24,31,25,.12);border-radius:8px;padding:20px;background:rgba(255,255,255,.56)">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:18px;flex-wrap:wrap">
                <div style="min-width:0;flex:1">
                  <div style="font-weight:600;font-size:16px;line-height:1.35">${esc(item.titulo)}</div>
                  ${item.texto ? `<div style="margin-top:8px;opacity:.72;line-height:1.55">${esc(item.texto)}</div>` : ''}
                </div>
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12px;letter-spacing:.04em">
                  ${item.estado ? `<span style="border:1px solid rgba(24,31,25,.16);border-radius:999px;padding:6px 10px">${esc(item.estado)}</span>` : ''}
                  ${item.data ? `<time style="opacity:.62">${formatarData(item.data, lang)}</time>` : ''}
                </div>
              </div>
            </article>`).join('')}
        </div>
      </div>
    </section>`;

  // Documentos são a secção 05; decisões (06) entram imediatamente depois.
  if (docs?.parentNode === parent) {
    parent.insertBefore(wrap, docs.nextSibling);
  } else {
    parent.insertBefore(wrap, approval || null);
  }
}
