"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import * as api from "../../lib/api-client";
import type { LetterType } from "../../lib/stories";
import { useAction } from "../../lib/use-action";
import { useConfirm } from "../common/ConfirmDialog";
import SectionIntro from "../common/SectionIntro";
import StatusMessage from "../common/StatusMessage";
import Turnstile, { type TurnstileHandle } from "../common/Turnstile";
import { useShell } from "../shell/ShellContext";
import BodyCount from "./BodyCount";
import ConsentFields from "./ConsentFields";
import { letterBody, MAX_BODY } from "./letterBody";
import ModeChooser from "./ModeChooser";
import PastLetterForm from "./PastLetterForm";
import PresentLetterForm from "./PresentLetterForm";
import SubmitSuccess from "./SubmitSuccess";
import { clearDraft, type Draft, draftFields, readDraft, saveDraft, useDraft } from "./useDraft";
import styles from "./WriteFlow.module.css";

/**
 * 寫一封信: choose past / present → form → success. The letter type is the
 * `?mode=` query, so /write?mode=past can be linked to directly.
 *
 * The unsent letter of each type is kept in sessionStorage (useDraft.ts)
 * with its writing attempt: a reload, the back button or a visit to another
 * page brings the same letter back under the same attempt, without a second
 * start. It is cleared once the letter is sent, and when the author confirms
 * 重新選擇寫法.
 *
 * Focus follows the screen (V5-c4): the form's title once a type is chosen,
 * the success heading once the letter is sent, the chooser's title after
 * 重新選擇寫法. While the form is open its errors show next to the submit
 * button instead of at the top of the page.
 */
export default function WriteFlow() {
  const router = useRouter();
  const { openPrivacy } = useShell();
  const query = useSearchParams().get("mode");
  const mode: LetterType | "" = query === "past" || query === "present" ? query : "";
  const action = useAction();
  const { busy, error, setError } = action;
  const confirm = useConfirm();
  // The writing attempt recorded by `start`, for the type it was started as.
  const [attempt, setAttempt] = useState<{ mode: LetterType; id: string } | null>(null),
    [source, setSource] = useState("recollection"),
    [body, setBody] = useState(""),
    // The restored inputs (defaultValue) of the form when it opens.
    [fields, setFields] = useState<Draft["fields"]>({}),
    // The uncontrolled inputs as typed so far, for the live body count.
    [typed, setTyped] = useState<Draft["fields"]>({}),
    [saved, setSaved] = useState(false),
    [shownMode, setShownMode] = useState(mode),
    // Bumped on every refused submit, so a repeated identical error is
    // scrolled back into view too.
    [failures, setFailures] = useState(0);
  /** Puts a type's saved letter (or an empty one) into the form; its attempt too, if any. */
  function restore(next: LetterType | "") {
    const draft = next ? readDraft(next) : null;
    setBody(draft?.body ?? "");
    setSource(draft?.source ?? "recollection");
    setFields(draft?.fields ?? {});
    setTyped(draft?.fields ?? {});
    if (next && draft?.attempt) setAttempt({ mode: next, id: draft.attempt });
    return !!draft?.attempt;
  }
  // A new ?mode= (nav click, back / forward): that type's draft, or a fresh
  // letter. (Only on the client: the first render, the server's, has no draft.)
  if (shownMode !== mode) {
    setShownMode(mode);
    setSaved(false);
    // A message about the letter that was on screen.
    setError("");
    restore(mode);
  }
  const setMode = (next: LetterType | "") =>
    router.push(next ? `/write?mode=${next}` : "/write", { scroll: false });
  // Only the latest `start` may set the attempt (a slow one can't overwrite a newer one).
  const latest = useRef(0);
  const turnstile = useRef<TurnstileHandle>(null);
  const title = useRef<HTMLHeadingElement>(null),
    successTitle = useRef<HTMLHeadingElement>(null),
    formError = useRef<HTMLDivElement>(null),
    // Where focus goes once the next screen is up: set only by the author's
    // own actions (choose, send, 重新選擇寫法), not by a reload or back / forward.
    focusNext = useRef<"title" | "success" | null>(null);
  async function begin(next: LetterType) {
    const n = ++latest.current;
    const id = await api.startWriting(next);
    if (n !== latest.current) return;
    setAttempt({ mode: next, id });
    saveDraft(next, { ...readDraft(next), attempt: id });
  }
  function chooseMode(next: LetterType) {
    return action.run(async () => {
      // A letter of this type in progress goes on under its own attempt.
      if (!readDraft(next)?.attempt) await begin(next);
      focusNext.current = "title";
      setMode(next);
    });
  }
  // As in v1, the form only shows once a writing attempt exists for this
  // type, so a letter can always be submitted.
  const ready = !!mode && attempt?.mode === mode;
  const screen = saved ? "success" : ready ? "form" : "chooser";
  useEffect(() => {
    const target = focusNext.current;
    if (!target || (target === "success") !== (screen === "success")) return;
    focusNext.current = null;
    (target === "success" ? successTitle : title).current?.focus();
  }, [screen]);
  // An error by the submit button is scrolled into view (on a phone the
  // button can be at the bottom edge).
  useEffect(() => {
    if (error) formError.current?.scrollIntoView({ block: "nearest" });
  }, [error, failures]);
  // Arrived at /write?mode=… without one (direct link, reload, back /
  // forward): the draft's attempt, or record one now, once; if that fails the
  // chooser stays, with the error.
  const autoStarted = useRef<LetterType | null>(null);
  useEffect(() => {
    if (!mode) autoStarted.current = null;
    if (!mode || saved || ready || autoStarted.current === mode) return;
    autoStarted.current = mode;
    action.run(async () => {
      if (!restore(mode)) await begin(mode);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, saved, ready]);
  const { form: draftForm, onInput: saveDraftNow } = useDraft(
    mode,
    ready && !saved ? attempt.id : undefined,
    source,
    body,
  );
  // The guided questions unmount while 原文 is chosen and remount from
  // `fields` when it isn't: keep what was typed in them, so the shown
  // answers, the live count and the sent body stay the same text.
  function changeSource(next: string) {
    const kept: Draft["fields"] =
      source === "recollection"
        ? { ...typed }
        : { ...typed, event: fields?.event, scene: fields?.scene, feeling: fields?.feeling };
    setFields(kept);
    setTyped(kept);
    setSource(next);
  }
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const val = (key: string) => String(f.get(key) || "").trim();
    const text = letterBody(mode as LetterType, source, body, val);
    if (!text) {
      setError("至少留下一件事、一個畫面或一點感受。");
      setFailures((n) => n + 1);
      return;
    }
    if (text.length > MAX_BODY) {
      setError("這封信的正文合計超過 1,500 字，請稍微縮短後再送出。");
      setFailures((n) => n + 1);
      return;
    }
    return action.run(async () => {
      try {
        await api.submitLetter(
          {
            title: val("title"),
            body: text,
            era: mode === "present" ? "今天" : val("era"),
            source: mode === "present" ? "present" : source,
            letterType: mode as LetterType,
            attempt: attempt!.id,
            mood: val("mood"),
            reflection: val("reflection"),
            adult: f.get("adult") === "on",
            privacy: f.get("privacy") === "on",
            share: f.get("share") === "on",
          },
          () => turnstile.current!.getToken(),
        );
      } catch (e) {
        // The draft's attempt is gone (a tab left open past 30 days, a new
        // session): start a new one and keep the letter for another try.
        if (e instanceof api.ApiError && e.code === "attempt") {
          await begin(mode as LetterType);
          throw new Error("這份草稿的試寫紀錄已過期，已重新開始；文字都還在，請再送出一次。");
        }
        throw e;
      } finally {
        // A token is good for one request, whatever the answer was.
        turnstile.current?.reset();
      }
      focusNext.current = "success";
      setSaved(true);
      // That attempt is completed; the next letter needs a new one.
      clearDraft(mode as LetterType);
      setAttempt(null);
      autoStarted.current = null;
      setBody("");
      setTyped({});
      form.reset();
    });
  }
  const count = mode && (
    <BodyCount length={letterBody(mode, source, body, (name) => typed?.[name] ?? "").length} />
  );
  return (
    <>
      {screen !== "form" && <StatusMessage action={action} />}
      <section className={styles.writing}>
        <SectionIntro
          titleRef={title}
          eyebrow="寫一封信"
          title={
            !saved && !ready
              ? "你今天想怎麼寫？"
              : mode === "past"
                ? "回想一段經歷"
                : mode === "present"
                  ? "記下此刻"
                  : "你今天想怎麼寫？"
          }
        >
          <span className="sentence">不必寫得漂亮，也不需要有結論。</span>
          <span className="sentence">只留下你願意記錄的部分。</span>
        </SectionIntro>
        {saved ? (
          <SubmitSuccess headingRef={successTitle} />
        ) : !ready ? (
          <ModeChooser busy={busy} onChoose={chooseMode} />
        ) : (
          <form
            key={mode}
            ref={draftForm}
            className={styles.form}
            onSubmit={submit}
            onInput={(e) => {
              saveDraftNow();
              setTyped(draftFields(e.currentTarget));
            }}
            onKeyDown={(e) => {
              // Enter in a one-line field would send the whole letter; not
              // while an IME is composing (that Enter picks the characters).
              if (
                e.key === "Enter" &&
                e.target instanceof HTMLInputElement &&
                !e.nativeEvent.isComposing &&
                e.keyCode !== 229
              )
                e.preventDefault();
            }}
          >
            <button
              type="button"
              className="text-btn"
              onClick={async () => {
                const ok = await confirm({
                  title: "重新選擇寫法",
                  message: "切換寫法會清除這份未送出的草稿，確定切換？",
                  confirmLabel: "清除並切換",
                  danger: true,
                });
                if (!ok) return;
                clearDraft(mode as LetterType);
                focusNext.current = "title";
                setMode("");
              }}
            >
              ← 重新選擇寫法
            </button>
            <label htmlFor="title">給這封信一個名字（選填）</label>
            <input
              name="title"
              id="title"
              maxLength={60}
              defaultValue={fields?.title}
              placeholder={mode === "past" ? "例如：那天，我提早一站下車" : "留白也可以"}
            />
            {mode === "past" ? (
              <PastLetterForm
                source={source}
                onSourceChange={changeSource}
                body={body}
                onBodyChange={setBody}
                draft={fields}
                count={count}
              />
            ) : (
              <PresentLetterForm body={body} onBodyChange={setBody} draft={fields} count={count} />
            )}
            <ConsentFields onOpenPrivacy={openPrivacy} />
            <Turnstile action="submit" ref={turnstile} className={styles.turnstile} />
            <button className={`primary ${styles.submit}`} disabled={busy}>
              {busy ? "正在儲存…" : "留下這封信 ↗"}
            </button>
            {error && (
              <div role="alert" ref={formError} className={styles.error}>
                {error}
              </div>
            )}
            <p className="quiet">不保證送達日期，也不提供即時回信。</p>
          </form>
        )}
      </section>
    </>
  );
}
