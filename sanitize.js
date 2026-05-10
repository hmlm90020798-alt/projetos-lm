/**
 * sanitize.js — Projetos LM
 * Helpers de segurança para renderização de dados em HTML.
 *
 * Utilização:
 *   import { esc, safeUrl, nl2br } from './sanitize.js';
 *
 * Regra: qualquer valor vindo de Firestore, formulário ou IA
 * que entre num template innerHTML DEVE passar por esc().
 */

/**
 * Escapa caracteres HTML especiais.
 * Usar em TODOS os campos de texto dinâmico dentro de innerHTML.
 *
 * @param {*} val — qualquer valor (string, número, null, undefined)
 * @returns {string} string segura para inserir em HTML
 *
 * Exemplo:
 *   `<div class="card-nome">${esc(p.nome)}</div>`
 */
export function esc(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

/**
 * Valida e sanitiza URLs antes de as usar em href ou src.
 * Aceita apenas http:// e https://.
 * Rejeita javascript:, data:, e qualquer outro protocolo.
 *
 * @param {*} url
 * @returns {string} URL validada ou '#' se inválida/vazia
 *
 * Exemplo:
 *   `<a href="${safeUrl(d.url)}" target="_blank">`
 */
export function safeUrl(url) {
  if (!url || typeof url !== 'string') return '#';
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return '#';
}

/**
 * Converte newlines em <br> de forma segura.
 * Escapa o texto primeiro, depois converte \n em <br>.
 * Usar para campos de texto livre (notas, descrições, mensagens).
 *
 * @param {*} val
 * @returns {string} HTML com quebras de linha seguras
 *
 * Exemplo:
 *   `<p class="rec-msg-texto">${nl2br(texto)}</p>`
 */
export function nl2br(val) {
  if (val === null || val === undefined) return '';
  return esc(val).replace(/\n/g, '<br>');
}
