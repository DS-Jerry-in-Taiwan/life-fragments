import type { LetterType } from "../../lib/stories";

/** The server's limit on a story's body (lib/server/validation.ts, `body.max(1500)`). */
export const MAX_BODY = 1500;

/** The guided questions of a 回憶信, in order, with the label each answer is sent under. */
const QUESTIONS = [
  ["event", "我記得的事"],
  ["scene", "那個畫面"],
  ["feeling", "當時的感受"],
] as const;

/**
 * The body exactly as it is sent: a 回憶信 written with the guided questions
 * sends its answered questions as 「label：answer」 paragraphs; the others
 * send the body text. Both the submit check and the live count use this, so
 * `letterBody(…).length` (UTF-16 code units, like the server's zod `max`) is
 * the number the server checks.
 *
 * `value(name)` reads one form field (event / scene / feeling); `body` is the
 * controlled body text (原文 / 當下信).
 */
export function letterBody(
  mode: LetterType,
  source: string,
  body: string,
  value: (name: (typeof QUESTIONS)[number][0]) => string,
) {
  if (mode !== "past" || source !== "recollection") return body.trim();
  return QUESTIONS.map(([name, label]) => [label, value(name).trim()])
    .filter(([, answer]) => answer)
    .map(([label, answer]) => label + "：" + answer)
    .join("\n\n");
}
