// ════════════════════════════════════════════════
// utils.js — Utilitários partilhados · Projetos LM
// ════════════════════════════════════════════════

// ── calcTotal ─────────────────────────────────────
// Fonte única de verdade para o total de um projecto.
// Usada em cliente.js, painel.js e painel-dashboard.js.
//
// Estrutura actual:   orc_* (valores únicos por categoria) + orcamento[] (cats livres)
// Compatibilidade:    estrutura antiga com arrays de itens com preço individual

export function calcTotal(p) {
  const n = v => parseFloat(String(v || '0').replace(',', '.')) || 0;
  let t = 0;

  // Categorias fixas
  t += n(p.orc_moveis);
  t += n(p.orc_tampos);
  t += n(p.orc_eletros);
  t += n(p.orc_acessorios);

  // Categorias livres (estrutura actual: {categoria, valor})
  (p.orcamento || []).forEach(c => { t += n(c.valor); });

  // Compatibilidade retroactiva: estrutura antiga com arrays de itens com preço
  if (t === 0) {
    const s = a => (a || []).forEach(i => { t += parseFloat(i.preco) || 0; });
    s(p.tampos); s(p.eletros); s(p.acessorios);
    (p.extras    || []).forEach(c => s(c.itens));
    (p.orcamento || []).forEach(c => s(c.itens));
  }

  return Math.max(0, t - (parseFloat(p.desconto) || 0));
}
