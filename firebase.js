// ════════════════════════════════════════════════
// firebase.js — Firebase · Projetos LM
//
// ── REGRAS FIRESTORE A APLICAR NA CONSOLA ───────
// rules_version = '2';
// service cloud.firestore {
//   match /databases/{database}/documents {
//     match /projetos/{projetoId} {
//       allow read: if true;
//       // Escrita autenticada (painel) OU aprovação do cliente
//       allow write: if request.auth != null
//         || (request.resource.data.diff(resource.data).affectedKeys()
//             .hasOnly(['aprovacao','fase']));
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

import { initializeApp }                                        from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, setDoc, getDoc, getDocs,
         collection, deleteDoc, updateDoc }                     from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth, signInWithEmailAndPassword,
         signOut, onAuthStateChanged }                          from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getState, setState }                                   from './state.js';

const _cfg = {
  apiKey:            'AIzaSyALyrpFSGx4evXtOYCfRIvWc_jTjByz0R8',
  authDomain:        "hm-projetos-lm.firebaseapp.com",
  projectId:         "hm-projetos-lm",
  storageBucket:     'hm-projetos-lm.firebasestorage.app',
  messagingSenderId: '772658359928',
  appId:             '1:772658359928:web:98332ec006329f380ec78d',
};

const _app  = initializeApp(_cfg);
export const _db   = getFirestore(_app);
export const _auth = getAuth(_app);

const _col  = collection(_db, 'projetos');

// ── Sincronização visual ──────────────────────────
function syncStatus(estado) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  el.className = 'sync-status sync-' + estado;
  el.textContent = estado === 'saving' ? '● A guardar…' : estado === 'saved' ? '✓ Guardado' : '✗ Erro';
  if (estado === 'saved') setTimeout(() => { el.textContent = ''; }, 3000);
}

// ── CRUD ──────────────────────────────────────────
export async function carregar() {
  try {
    const snap = await getDocs(_col);
    const lista = [];
    snap.forEach(d => lista.push({ id: d.id, ...d.data() }));
    lista.sort((a, b) => (b.dataCriacao || '').localeCompare(a.dataCriacao || ''));
    setState({ projetos: lista });
  } catch (e) { console.error('Erro ao carregar:', e); }
}

export async function guardar(proj) {
  syncStatus('saving');
  try {
    await setDoc(doc(_db, 'projetos', proj.id), proj);
    const lista = getState('projetos');
    const idx = lista.findIndex(p => p.id === proj.id);
    if (idx >= 0) lista[idx] = proj; else lista.unshift(proj);
    setState({ projetos: lista });
    syncStatus('saved');
  } catch (e) { syncStatus('error'); console.error(e); }
}

export async function apagar(id) {
  try {
    await deleteDoc(doc(_db, 'projetos', id));
    setState({ projetos: getState('projetos').filter(p => p.id !== id) });
  } catch (e) { console.error(e); }
}

export async function carregarUm(id) {
  const snap = await getDoc(doc(_db, 'projetos', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// ── Aprovação pelo cliente (sem autenticação) ─────
export async function aprovarClienteFirebase(id, aprovacao) {
  // Usa updateDoc — só actualiza os campos aprovacao e fase
  // As Firestore Rules permitem este write específico sem autenticação
  await updateDoc(doc(_db, 'projetos', id), {
    aprovacao,
    fase: 'aprovado',
  });
}

// ── Visitas ───────────────────────────────────────
export async function registarVisita(id) {
  try {
    const ref  = doc(_db, 'visitas', id);
    const snap = await getDoc(ref);
    const d    = snap.exists() ? snap.data() : { total: 0, visitas: [] };
    const agora = new Date();
    d.total    = (d.total || 0) + 1;
    d.visitas  = [...(d.visitas || []).slice(-99), {
      data: agora.toLocaleDateString('pt-PT'),
      hora: agora.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
      ts:   agora.getTime(),
    }];
    await setDoc(ref, d);
  } catch (_) {}
}

export async function carregarVisitas(ids) {
  const resultado = {};
  for (const id of ids) {
    try {
      const snap = await getDoc(doc(_db, 'visitas', id));
      if (snap.exists()) resultado[id] = snap.data();
    } catch (_) {}
  }
  return resultado;
}

// ── Polling de aprovações ─────────────────────────
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

// ── Auth ──────────────────────────────────────────
export const doLogin  = (e, p) => signInWithEmailAndPassword(_auth, e, p);
export const doLogout = ()     => signOut(_auth);
export const onAuth   = cb     => onAuthStateChanged(_auth, cb);

// ── Contactos e Templates de Ocorrências ─────────
export async function guardarContactos(lista) {
  try { await setDoc(doc(_db, 'config', 'contactos'), { lista }); } catch (e) { console.error(e); }
}
export async function carregarContactos() {
  try {
    const snap = await getDoc(doc(_db, 'config', 'contactos'));
    return snap.exists() ? snap.data().lista : [];
  } catch (_) { return []; }
}
export async function guardarTemplates(lista) {
  try { await setDoc(doc(_db, 'config', 'templates'), { lista }); } catch (e) { console.error(e); }
}
export async function carregarTemplates() {
  try {
    const snap = await getDoc(doc(_db, 'config', 'templates'));
    return snap.exists() ? snap.data().lista : [];
  } catch (_) { return []; }
}
