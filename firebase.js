// ════════════════════════════════════════════════
// firebase.js — Firebase · Projetos LM
//
// ── REGRAS FIRESTORE A APLICAR NA CONSOLA ───────
// rules_version = '2';
// service cloud.firestore {
//   match /databases/{database}/documents {
//     match /projetos/{projetoId} {
//       allow read: if true;
//       allow write: if request.auth != null;
//     }
//     match /visitas/{projetoId} {
//       allow read, write: if true;
//     }
//   }
// }
//
// ── API KEY ──────────────────────────────────────
// Restringir em Google Cloud Console ao domínio:
// hmlm90020798-alt.github.io
// ════════════════════════════════════════════════

import { initializeApp }                                        from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, setDoc, getDoc, getDocs,
         deleteDoc, collection, query }                         from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth, signInWithEmailAndPassword,
         signOut, onAuthStateChanged }                          from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { setState, getState }                                   from './state.js';

const _cfg = {
  apiKey:            'AIzaSyALyrpFSGx4evXtOYCfRIvWc_jTjByz0R8',
  authDomain:        'hm-projetos-lm.firebaseapp.com',
  projectId:         'hm-projetos-lm',
  storageBucket:     'hm-projetos-lm.firebasestorage.app',
  messagingSenderId: '772658359928',
  appId:             '1:772658359928:web:98332ec006329f380ec78d',
};

const _app  = initializeApp(_cfg);
export const _db   = getFirestore(_app);
export const _auth = getAuth(_app);
const _col  = collection(_db, 'projetos');

// ── Sync indicator ───────────────────────────────
function setSyncStatus(s) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  const map = { saving: '⏳ A guardar…', saved: '✓ Guardado', error: '⚠️ Erro' };
  el.textContent = map[s] || '';
  el.className   = 'sync-status sync-' + s;
  if (s === 'saved') setTimeout(() => { el.textContent = ''; el.className = 'sync-status'; }, 2500);
}

// ── Compressão de imagens ────────────────────────
function comprimirImagem(b64, maxDim = 900, q = 0.72) {
  return new Promise(resolve => {
    if (b64.startsWith('http') || b64.length < 130000) { resolve(b64); return; }
    const img = new Image();
    img.onload = () => {
      const s  = Math.min(1, maxDim / Math.max(img.width, img.height));
      const cw = Math.round(img.width  * s);
      const ch = Math.round(img.height * s);
      const c  = document.createElement('canvas');
      c.width  = cw; c.height = ch;
      c.getContext('2d').drawImage(img, 0, 0, cw, ch);
      resolve(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => resolve(b64);
    img.src = b64;
  });
}

async function guardarProjFirestore(proj) {
  const imgs = await Promise.all((proj.imagens || []).map(i => comprimirImagem(i)));
  const p    = { ...proj, imagens: imgs };
  await setDoc(doc(_db, 'projetos', proj.id), p);
  return p;
}

// ── API pública ──────────────────────────────────

export async function guardar(projetoEspecifico) {
  if (getState('modoStandalone')) return;
  setSyncStatus('saving');
  try {
    const lista = getState('projetos');
    if (projetoEspecifico) {
      const atualizado = await guardarProjFirestore(projetoEspecifico);
      const idx = lista.findIndex(p => p.id === projetoEspecifico.id);
      if (idx >= 0) lista[idx] = atualizado;
    } else {
      for (const p of lista) await guardarProjFirestore(p);
    }
    try { localStorage.setItem('projetoslm_v1', JSON.stringify(lista)); } catch (_) {}
    setSyncStatus('saved');
  } catch (e) {
    console.error('Firebase save error:', e);
    setSyncStatus('error');
    try { localStorage.setItem('projetoslm_v1', JSON.stringify(getState('projetos'))); } catch (_) {}
    alert('Erro ao guardar: ' + e.message);
  }
}

export async function carregar() {
  if (getState('modoStandalone')) {
    if (typeof PROJETO_EMBED !== 'undefined' && PROJETO_EMBED)
      setState({ projetos: [PROJETO_EMBED] });
    return;
  }
  try {
    const snap = await getDocs(query(_col));
    if (!snap.empty) {
      const lista = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => new Date(b.dataCriacao || 0) - new Date(a.dataCriacao || 0));
      setState({ projetos: lista });
    } else {
      try {
        const local = localStorage.getItem('projetoslm_v1');
        if (local) setState({ projetos: JSON.parse(local) });
      } catch (_) {}
    }
  } catch (e) {
    console.error('Firebase load error:', e);
    try {
      const local = localStorage.getItem('projetoslm_v1');
      if (local) setState({ projetos: JSON.parse(local) });
    } catch (_) {}
  }
}

export async function apagar(id) {
  await deleteDoc(doc(_db, 'projetos', id));
  setState({ projetos: getState('projetos').filter(p => p.id !== id) });
}

export async function carregarUm(id) {
  const snap = await getDoc(doc(_db, 'projetos', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function registarVisita(id) {
  try {
    const ref  = doc(_db, 'visitas', id);
    const snap = await getDoc(ref);
    const d    = snap.exists() ? snap.data() : { total: 0, visitas: [] };
    const agora = new Date();
    d.total    = (d.total || 0) + 1;
    d.visitas  = [...(d.visitas || []).slice(-49), {
      data: agora.toLocaleDateString('pt-PT'),
      hora: agora.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
    }];
    await setDoc(ref, d);
  } catch (_) {}
}

export async function verificarAprovacoes(onNova) {
  for (const p of getState('projetos')) {
    try {
      const snap = await getDoc(doc(_db, 'projetos', p.id));
      if (!snap.exists()) continue;
      const d   = snap.data();
      const nova = !p.aprovacao?.data && d.aprovacao?.data;
      p.aprovacao = d.aprovacao;
      p.fase      = d.fase;
      if (nova) onNova(p, d);
    } catch (_) {}
  }
}

// ── Auth ─────────────────────────────────────────
export const doLogin  = (e, p) => signInWithEmailAndPassword(_auth, e, p);
export const doLogout = ()      => signOut(_auth);
export const onAuth   = cb      => onAuthStateChanged(_auth, cb);
