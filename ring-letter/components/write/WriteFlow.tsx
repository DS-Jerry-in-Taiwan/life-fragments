"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import * as api from "../../lib/api-client";
import type { LetterType } from "../../lib/stories";
import { useAction } from "../../lib/use-action";
import StatusMessage from "../common/StatusMessage";
import { useShell } from "../shell/ShellContext";
import ConsentFields from "./ConsentFields";
import ModeChooser from "./ModeChooser";
import PastLetterForm from "./PastLetterForm";
import PresentLetterForm from "./PresentLetterForm";
import SubmitSuccess from "./SubmitSuccess";

/**
 * 寫一封信: choose past / present → form → success. The letter type is the
 * `?mode=` query, so /write?mode=past can be linked to directly.
 */
export default function WriteFlow() {
  const router = useRouter();
  const { openPrivacy } = useShell();
  const query = useSearchParams().get("mode");
  const mode: LetterType | "" = query === "past" || query === "present" ? query : "";
  const action = useAction();
  const { busy, setError } = action;
  // The writing attempt recorded by `start`, for the type it was started as.
  const [attempt, setAttempt] = useState<{ mode: LetterType; id: string } | null>(null),
    [source, setSource] = useState("recollection"),
    [body, setBody] = useState(""),
    [saved, setSaved] = useState(false),
    [shownMode, setShownMode] = useState(mode);
  // A new ?mode= (nav click, back / forward) starts a fresh letter.
  if (shownMode !== mode) {
    setShownMode(mode);
    setSaved(false);
    setBody("");
    setSource("recollection");
  }
  const setMode = (next: LetterType | "") =>
    router.push(next ? `/write?mode=${next}` : "/write", { scroll: false });
  function chooseMode(next: LetterType) {
    return action.run(async () => {
      setAttempt({ mode: next, id: await api.startWriting(next) });
      setMode(next);
    });
  }
  // Opened by a direct link to /write?mode=…: record the attempt now.
  const starting = useRef<LetterType | null>(null);
  useEffect(() => {
    if (!mode || saved || attempt?.mode === mode || starting.current === mode) return;
    starting.current = mode;
    action
      .run(async () => setAttempt({ mode, id: await api.startWriting(mode) }))
      .finally(() => (starting.current = null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, saved, attempt]);
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const val = (key: string) => String(f.get(key) || "").trim();
    const text =
      mode === "past" && source === "recollection"
        ? [
            ["event", "我記得的事"],
            ["scene", "那個畫面"],
            ["feeling", "當時的感受"],
          ]
            .filter(([key]) => val(key))
            .map(([key, label]) => label + "：" + val(key))
            .join("\n\n")
        : body.trim();
    if (!text) {
      setError("至少留下一件事、一個畫面或一點感受。");
      return;
    }
    if (text.length > 1500) {
      setError("這封信的正文合計超過 1,500 字，請稍微縮短後再送出。");
      return;
    }
    return action.run(async () => {
      await api.submitLetter({
        title: val("title"),
        body: text,
        era: mode === "present" ? "今天" : val("era"),
        source: mode === "present" ? "present" : source,
        letterType: mode as LetterType,
        attempt: attempt?.mode === mode ? attempt.id : "",
        mood: val("mood"),
        reflection: val("reflection"),
        adult: f.get("adult") === "on",
        privacy: f.get("privacy") === "on",
        share: f.get("share") === "on",
      });
      setSaved(true);
      setBody("");
      form.reset();
    });
  }
  return (
    <>
      <StatusMessage action={action} />
      <section className="writing">
        <div className="section-intro">
          <p className="eyebrow">寫一封信</p>
          <h1>
            {mode === "past"
              ? "回想一段經歷"
              : mode === "present"
                ? "記下此刻"
                : "你今天想怎麼寫？"}
          </h1>
          <p>
            <span className="sentence">不必寫得漂亮，也不需要有結論。</span>
            <span className="sentence">只留下你願意記錄的部分。</span>
          </p>
        </div>
        {saved ? (
          <SubmitSuccess />
        ) : !mode ? (
          <ModeChooser busy={busy} onChoose={chooseMode} />
        ) : (
          <form className="write-form" onSubmit={submit}>
            <button
              type="button"
              className="text-btn"
              onClick={() => {
                if (confirm("切換寫法會清除這份未送出的草稿，確定切換？")) {
                  setMode("");
                }
              }}
            >
              ← 重新選擇寫法
            </button>
            <label htmlFor="title">給這封信一個名字（選填）</label>
            <input
              name="title"
              id="title"
              maxLength={60}
              placeholder={mode === "past" ? "例如：那天，我提早一站下車" : "留白也可以"}
            />
            {mode === "past" ? (
              <PastLetterForm
                source={source}
                onSourceChange={setSource}
                body={body}
                onBodyChange={setBody}
              />
            ) : (
              <PresentLetterForm body={body} onBodyChange={setBody} />
            )}
            <ConsentFields onOpenPrivacy={openPrivacy} />
            <button className="primary submit" disabled={busy}>
              {busy ? "正在儲存…" : "留下這封信 ↗"}
            </button>
            <p className="quiet">不保證送達日期，也不提供即時回信。</p>
          </form>
        )}
      </section>
    </>
  );
}
