// FASE 4P.33D — adaptador do piloto seguro portalPublications -> Portal Cliente existente.
// Âmbito fechado: apenas a rota ?pub= do piloto. A rota legada ?p= permanece inalterada.

import { _db } from './firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export const PILOT_PUBLIC_ID = 'pp_MUjoiPPMmubyWeLXo0TJYyV2gdq8FY_K';
export const PILOT_CLIENT_EVENT_URL = 'https://us-central1-hm-projetos-lm.cloudfunctions.net/pilotClientEvent';

const clean = v => typeof v === 'string' ? v.trim() : '';
const money = v => Number.isFinite(Number(v)) ? Number(v) : 0;

export function isPilotPublicId(publicId) {
  return clean(publicId) === PILOT_PUBLIC_ID;
}

export async function carregarPublicacaoPiloto(publicId) {
  if (!isPilotPublicId(publicId)) return null;
  const snap = await getDoc(doc(_db, 'portalPublications', publicId));
  if (!snap.exists()) return null;
  const raw = { publicId: snap.id, ...snap.data() };
  if (raw.active !== true) return null;
  if (raw.expiresAt?.toMillis && raw.expiresAt.toMillis() <= Date.now()) return null;
  const revision = Number(raw.revision);
  if (!Number.isInteger(revision) || revision < 1) return null;
  return raw;
}

export function adaptarPublicacaoParaPortal(publication) {
  const c = publication?.content || {};
  const sections = Array.isArray(c.budget?.sections) ? c.budget.sections : [];
  const total = money(c.budget?.total);

  const orcamento = sections.map(section => ({
    categoria: clean(section?.name),
    valor: money(section?.total),
    itens: (Array.isArray(section?.items) ? section.items : []).map(item => ({
      nome: clean(item?.name) || clean(item?.reference),
      referencia: clean(item?.reference),
      preco: money(item?.amount),
    })),
  })).filter(section => section.categoria);

  const elem_extras = orcamento.map(section => ({
    categoria: section.categoria,
    itens: section.itens.map(item => ({ ...item })),
  }));

  const imagens = (Array.isArray(c.media) ? c.media : [])
    .filter(item => clean(item?.url).startsWith('data:image/'))
    .sort((a,b) => Number(b?.featured === true) - Number(a?.featured === true))
    .map(item => clean(item?.url));

  const tipoRaw = clean(c.project?.type) || 'Cozinha';
  const tipoNorm = tipoRaw.toLocaleLowerCase('pt-PT');
  const tipo = tipoNorm.includes('cozinha') ? 'cozinha' : 'renovacao-parcial';

  const allowedPhases = new Set(['proposta','retificacao','aprovado','encomenda','entrega','montagem','concluido']);
  const phase = clean(c.progress?.phase).toLowerCase();
  const fase = allowedPhases.has(phase) ? phase : 'proposta';
  const dates = c.progress?.dates && typeof c.progress.dates === 'object' ? c.progress.dates : {};
  const occurrences = (Array.isArray(c.occurrences) ? c.occurrences : []).map((item, index) => {
    const status = clean(item?.status).toLowerCase();
    const estado = status.includes('resolvid') || status.includes('conclu') ? 'resolvida'
      : status.includes('acompanh') || status.includes('resolu') || status.includes('aguard') ? 'resolucao' : 'detectada';
    return {
      id: `public-${index + 1}`,
      tipo: 'outro',
      descricao: clean(item?.description) || clean(item?.title),
      estado,
      data: clean(item?.date),
      publica: true,
    };
  }).filter(item => item.descricao);

  return {
    id: publication.publicId,
    nome: clean(c.client?.name),
    tipo,
    tipoOutro: tipoRaw,
    fase,
    dataEntregaMat: clean(dates.delivery),
    dataInstalacao: clean(dates.installation),
    dataConclusao: clean(dates.completion),
    tema: 'escuro',
    titulo: clean(c.presentation?.title),
    objetivo: clean(c.presentation?.objective),
    imagens,
    docs: (Array.isArray(c.documents) ? c.documents : []).map(item => ({ nome: clean(item?.name), url: clean(item?.url), tipo: clean(item?.type), seccao: 'documentos' })).filter(item => item.nome && item.url),
    decisoesPublicas: (Array.isArray(c.decisions) ? c.decisions : []).map(item => ({ titulo: clean(item?.title), estado: clean(item?.status), data: clean(item?.date), texto: clean(item?.note) })).filter(item => item.titulo),
    notas: [],
    ocorrencias: occurrences,
    orcamento,
    elem_extras,
    total,
    _pilotSecure: true,
    _pilotPublicId: publication.publicId,
    _pilotRevision: Number(publication.revision),
  };
}

function requestId() {
  const uuid = globalThis.crypto?.randomUUID?.().replace(/-/g, '');
  if (uuid && uuid.length >= 16) return uuid.slice(0, 32);
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export async function enviarEventoPiloto({ publicId, revision, type, message }) {
  if (!isPilotPublicId(publicId)) throw new Error('PUBLIC_ID_NOT_ALLOWED');
  if (!Number.isInteger(Number(revision)) || Number(revision) < 1) throw new Error('REVISION_INVALID');
  const body = {
    publicId,
    type,
    publicationRevision: Number(revision),
    clientRequestId: requestId(),
  };
  if (type === 'client_message') body.message = clean(message);

  const response = await fetch(PILOT_CLIENT_EVENT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok !== true) {
    const err = new Error(data?.code || `HTTP_${response.status}`);
    err.code = data?.code || null;
    throw err;
  }
  return data;
}
