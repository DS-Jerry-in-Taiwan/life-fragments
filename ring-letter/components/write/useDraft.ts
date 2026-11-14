import { useCallback, useEffect, useRef } from "react";
import type { LetterType } from "../../lib/stories";

/**
 * The unsent letter, kept in sessionStorage (#4 §10 item 4): it survives a
 * reload or an accidental navigation, never outlives the tab (a shared
 * computer's next user doesn't see it), and never reaches the server. Never
 * localStorage. Only the letter's own fields: not the consent boxes, not the
 * Turnstile token.
 */
export type Draft = {
  /**
   * The writing attempt this letter was started under (POST
   * /api/writing-attempts), so a reload goes on with the same attempt instead
   * of counting a second start.
   */
  attempt?: string;
  /** 回憶信: guided questions or pasted original text. */
  source?: string;
  /** The controlled body (原文 / 當下信). */
  body?: string;
  /** The uncontrolled inputs, by name (DRAFT_FIELDS). */
  fields?: Partial<Record<DraftField, string>>;
};

/** Every text input of both forms that is saved; the consent checkboxes are not. */
export const DRAFT_FIELDS = [
  "title",
  "era",
  "event",
  "scene",
  "feeling",
  "reflection",
  "mood",
] as const;
export type DraftField = (typeof DRAFT_FIELDS)[number];

/** One draft per letter type. */
const key = (mode: LetterType) => `ring-letter:draft:${mode}`;

// Storage can be missing or throw (private mode, storage disabled, quota):
// the form then just works without a draft.
export function readDraft(mode: LetterType): Draft | null {
  try {
    const raw = sessionStorage.getItem(key(mode));
    const draft: unknown = raw ? JSON.parse(raw) : null;
    return draft && typeof draft === "object" ? (draft as Draft) : null;
  } catch {
    return null;
  }
}

export function saveDraft(mode: LetterType, draft: Draft) {
  try {
    sessionStorage.setItem(key(mode), JSON.stringify(draft));
  } catch {
    // Not saved; the text is still in the form.
  }
}

export function clearDraft(mode: LetterType) {
  try {
    sessionStorage.removeItem(key(mode));
  } catch {
    // Nothing to clear.
  }
}

/** The saved inputs of a form (FormData), empty ones left out. */
function draftFields(form: HTMLFormElement): Draft["fields"] {
  const f = new FormData(form);
  const fields: Draft["fields"] = {};
  for (const name of DRAFT_FIELDS) {
    const value = f.get(name);
    if (typeof value === "string" && value) fields[name] = value;
  }
  return fields;
}

/**
 * Keeps the open letter form's draft saved: on every edit of an
 * uncontrolled input (`onInput` on the form) and whenever the controlled
 * parts change. `attempt` undefined: no form open (chooser, success), nothing
 * is saved.
 */
export function useDraft(
  mode: LetterType | "",
  attempt: string | undefined,
  source: string,
  body: string,
) {
  const form = useRef<HTMLFormElement>(null);
  const save = useCallback(() => {
    if (mode && attempt && form.current)
      saveDraft(mode, { attempt, source, body, fields: draftFields(form.current) });
  }, [mode, attempt, source, body]);
  useEffect(save, [save]);
  return { form, onInput: save };
}
