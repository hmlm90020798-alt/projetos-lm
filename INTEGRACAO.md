# Instruções de Integração — reclamacoes.js

## 1. Adicionar ao index.html

### a) No menu lateral, após o item "Comunicações":
```html
<button class="nav-btn" data-view="reclamacoes" onclick="setView('reclamacoes')">
  ⚠️ Reclamações
</button>
```

### b) Adicionar a nova view, após a div das comunicações:
```html
<section id="view-reclamacoes" class="view" style="display:none">
  <!-- preenchido dinamicamente por reclamacoes.js -->
</section>
```

### c) No <head> ou junto aos outros imports de scripts:
```html
<script type="module">
  import { renderReclamacoes } from './reclamacoes.js';
  window._renderReclamacoes = renderReclamacoes;
</script>
```

---

## 2. Adicionar ao main.js (ou onde está o setView)

Na função que gere a navegação entre views, adicionar o caso "reclamacoes":

```javascript
case 'reclamacoes':
  document.getElementById('view-reclamacoes').style.display = '';
  window._renderReclamacoes?.();
  break;
```

---

## 3. CSS a adicionar ao style.css

```css
/* ── Reclamações ── */
.rec-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem; }
.rec-titulo { font-size:1.3rem; font-weight:700; margin:0 0 .2rem; }
.rec-sub { font-size:.875rem; color:var(--text-secondary,#6b7280); margin:0; }
.rec-stats { display:flex; gap:1rem; margin-bottom:1.5rem; flex-wrap:wrap; }
.rec-stat { background:var(--card-bg,#fff); border:1px solid var(--border,#e5e7eb); border-radius:10px; padding:.75rem 1.25rem; text-align:center; min-width:90px; }
.rec-stat-num { display:block; font-size:1.6rem; font-weight:800; }
.rec-stat-label { font-size:.75rem; color:var(--text-secondary,#6b7280); }
.rec-lista { display:flex; flex-direction:column; gap:1rem; }
.rec-card { background:var(--card-bg,#fff); border:1px solid var(--border,#e5e7eb); border-radius:12px; padding:1.1rem; }
.rec-card-header { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; margin-bottom:.9rem; flex-wrap:wrap; }
.rec-card-nome { font-weight:700; font-size:.95rem; margin-bottom:.25rem; }
.rec-card-meta { font-size:.8rem; color:var(--text-secondary,#6b7280); display:flex; gap:.75rem; flex-wrap:wrap; }
.rec-card-badges { display:flex; gap:.4rem; flex-wrap:wrap; }
.rec-badge { font-size:.75rem; font-weight:600; padding:.2rem .55rem; border-radius:20px; }
.rec-problemas { display:flex; flex-direction:column; gap:.5rem; margin-bottom:.9rem; }
.rec-problema { display:flex; gap:.75rem; padding:.6rem .75rem; background:var(--bg-alt,#f9fafb); border-radius:8px; }
.rec-problema.resolvido { opacity:.5; text-decoration:line-through; }
.rec-problema-check { padding-top:.15rem; }
.rec-problema-tipo { font-size:.8rem; font-weight:700; color:var(--text,#111); }
.rec-problema-desc { font-size:.85rem; color:var(--text-secondary,#555); margin-top:.1rem; }
.rec-problema-ref { font-size:.78rem; color:var(--text-secondary,#888); margin-top:.2rem; }
.rec-problema-foto { font-size:.78rem; color:#3b82f6; margin-top:.2rem; }
.rec-card-acoes { display:flex; gap:.5rem; flex-wrap:wrap; padding-top:.75rem; border-top:1px solid var(--border,#e5e7eb); }
.rec-btn { font-size:.82rem; padding:.35rem .8rem; border-radius:7px; border:none; cursor:pointer; font-weight:600; transition:opacity .15s; }
.rec-btn:hover { opacity:.8; }
.rec-btn-ia    { background:#ede9fe; color:#7c3aed; }
.rec-btn-email { background:#dcfce7; color:#16a34a; }
.rec-btn-edit  { background:#e0f2fe; color:#0369a1; }
.rec-btn-del   { background:#fee2e2; color:#dc2626; }
.rec-form-problema { transition: box-shadow .15s; }
.rec-form-problema:hover { box-shadow: 0 2px 8px rgba(0,0,0,.06); }
```

---

## Resumo dos ficheiros a alterar

| Ficheiro | O que fazer |
|---|---|
| `reclamacoes.js` | Adicionar (novo ficheiro) |
| `index.html` | Adicionar botão no menu + section da view + import |
| `main.js` | Adicionar case 'reclamacoes' no setView |
| `style.css` | Adicionar bloco CSS acima |
