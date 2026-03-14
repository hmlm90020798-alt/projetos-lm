// ════════════════════════════════════════════════
// ui.js — Utilitários partilhados · Projetos LM
// ════════════════════════════════════════════════

export function setView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const t = document.getElementById('view-' + id);
  if (t) t.classList.add('active');
}

let _toastTimer = null;
export function mostrarToast(titulo, sub) {
  const el = document.getElementById('toast-notif');
  if (!el) return;
  document.getElementById('toast-titulo').textContent = titulo;
  document.getElementById('toast-sub').textContent    = sub || '';
  el.classList.add('show');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 4500);
}

export function copiarTexto(texto, btnEl, labelOk = '✓ Copiado') {
  navigator.clipboard.writeText(texto).then(() => {
    const orig = btnEl.textContent;
    btnEl.textContent = labelOk;
    setTimeout(() => { btnEl.textContent = orig; }, 2000);
  });
}

export function fmt(val) {
  const n = parseFloat(val);
  return isNaN(n)
    ? '0,00 €'
    : n.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export function gerarId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function dataHoje() {
  return new Date().toISOString().split('T')[0];
}

export function formatarData(iso) {
  if (!iso) return '';
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-PT');
}
