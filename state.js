// ════════════════════════════════════════════════
// state.js — Estado Central · Projetos LM
// REGRA: nunca modificar _state directamente
// Usar sempre setState / getState
// ════════════════════════════════════════════════

const _state = {
  projetos:       [],
  isClienteMode:  false,
  modoStandalone: false,
  editId:         null,
  editImgs:       [],
  filtroAtivo:    'todos',
  lbImgs:         [],
  lbIdx:          0,
  projAtualId:    null,
  projCache:      null,
  lang:           'pt',
  cdInterval:     null,
};

export function getState(key) {
  if (key === undefined) return { ..._state };
  return _state[key];
}

export function setState(partial) {
  Object.assign(_state, partial);
}

export const getProjects    = () => _state.projetos;
export const getLang        = () => _state.lang;
export const getEditId      = () => _state.editId;
export const getProjAtualId = () => _state.projAtualId;
