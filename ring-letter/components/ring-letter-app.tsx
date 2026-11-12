"use client";
import { useEffect, useState } from "react";
import MatchExperience from "./match-experience";
import { DEMO_STORIES } from "../data/demo-stories";
import * as api from "../lib/api-client";
import {
  STATUS_NAME,
  formatStoryMeta,
  type Feedback,
  type FeedbackKind,
  type LetterType,
  type ModerationAction,
  type Story,
  type WritingMetric,
} from "../lib/stories";
function Extra({ story: s }: { story: Story }) {
  return (
    <>
      {s.mood && <p className="mood">此刻心情：{s.mood}</p>}
      {s.reflection && (
        <aside className="reflection">
          <h3>現在回頭看</h3>
          <p className="prewrap">{s.reflection}</p>
        </aside>
      )}
    </>
  );
}
export default function RingLetterApp({ initialTab = "home" }: { initialTab?: string }) {
  const [tab, setTab] = useState(initialTab),
    [stories, setStories] = useState<Story[]>([]),
    [index, setIndex] = useState(0),
    [mine, setMine] = useState<Story[]>([]),
    [review, setReview] = useState<Story[]>([]),
    [feedback, setFeedback] = useState<Feedback[]>([]),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [feedbackConsent, setFeedbackConsent] = useState(false),
    [note, setNote] = useState(""),
    [sent, setSent] = useState<string[]>([]),
    [body, setBody] = useState(""),
    [saved, setSaved] = useState(false),
    [privacy, setPrivacy] = useState(false);
  const [mode, setMode] = useState(""),
    [attempt, setAttempt] = useState(""),
    [source, setSource] = useState("recollection"),
    [metrics, setMetrics] = useState<WritingMetric[]>([]);
  // Admin UI only appears once /api/admin confirms the viewer (Cloudflare Access + ADMIN_EMAILS).
  const [admin, setAdmin] = useState(false);
  // The /admin route is behind Cloudflare Access; load the review queue on arrival.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (initialTab === "admin") loadAdmin();
  }, []);
  const list = stories.length ? stories : DEMO_STORIES;
  const current = list[index % list.length];
  async function refresh() {
    setStories(await api.listApprovedStories());
  }
  function go(t: string) {
    if (t === "write") {
      setMode("");
      setSaved(false);
    }
    setTab(t);
    setNotice("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (t === "mine") {
      loadMine();
      refresh().catch(() => {});
    }
    if (t === "archive") {
      setLoading(true);
      refresh()
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }
    if (t === "admin") loadAdmin();
  }
  async function loadMine() {
    setBusy(true);
    try {
      setMine(await api.listMyStories());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function loadAdmin() {
    setBusy(true);
    try {
      const d = await api.getAdminQueue();
      setReview(d.stories);
      setFeedback(d.feedback);
      setMetrics(d.metrics);
      setAdmin(true);
    } catch (e: any) {
      setAdmin(false);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function react(kind: FeedbackKind) {
    if (!feedbackConsent) {
      setError("請先勾選同意保存本次體驗回饋。你也可以不留回饋，直接閱讀下一篇。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.sendFeedback(current.id, kind, note);
      setNotice(kind === "report" ? "已收到問題回報，管理者會查看。" : "謝謝，你的回饋已保存。");
      setSent([...sent, current.id + kind]);
      setNote("");
      if (kind === "more") {
        setIndex(index + 1);
        setNotice("翻到另一段故事。");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function chooseMode(next: LetterType) {
    setBusy(true);
    setError("");
    try {
      setAttempt(await api.startWriting(next));
      setMode(next);
      setBody("");
      setSource("recollection");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
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
    setBusy(true);
    setError("");
    try {
      await api.submitLetter({
        title: val("title"),
        body: text,
        era: mode === "present" ? "今天" : val("era"),
        source: mode === "present" ? "present" : source,
        letterType: mode as LetterType,
        attempt,
        mood: val("mood"),
        reflection: val("reflection"),
        adult: f.get("adult") === "on",
        privacy: f.get("privacy") === "on",
        share: f.get("share") === "on",
      });
      setSaved(true);
      setBody("");
      form.reset();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function withdraw(id: string) {
    if (!confirm("確定刪除這段文字？刪除後會停止在網站上分享，無法復原。")) return;
    setBusy(true);
    setError("");
    try {
      await api.withdrawStory(id);
      await loadMine();
      await refresh();
      setNotice("已刪除這段文字。");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function moderate(id: string, status: ModerationAction) {
    if (status === "delete" && !confirm("永久刪除這篇及其回饋？")) return;
    setBusy(true);
    setError("");
    try {
      await api.moderateStory(id, status);
      await loadAdmin();
      await refresh();
      setNotice("已更新文章狀態。");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function erase() {
    if (!confirm("刪除這個瀏覽器的全部投稿與回饋？無法復原。")) return;
    setBusy(true);
    setError("");
    try {
      await api.eraseMyData();
      setMine([]);
      await refresh();
      setNotice("已刪除本瀏覽器對應的投稿與回饋。");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="sky">
      <div className="stars" aria-hidden="true" />
      <header>
        <button className="brand" onClick={() => go("home")}>
          <span className="logo">☾</span> Ring letter<span className="brand-small">時光來信</span>
        </button>
        <nav aria-label="主要導覽">
          <button className={tab === "read" ? "active" : ""} onClick={() => go("read")}>
            讀一封信
          </button>
          <button className={tab === "write" ? "active" : ""} onClick={() => go("write")}>
            寫一封信
          </button>
          <button className={tab === "mine" ? "active" : ""} onClick={() => go("mine")}>
            我的片段
          </button>
        </nav>
      </header>
      <main>
        {error && (
          <div role="alert" className="message error">
            {error}
            <button onClick={() => setError("")} aria-label="關閉錯誤">
              ×
            </button>
          </div>
        )}
        {notice && (
          <div role="status" className="message">
            {notice}
          </div>
        )}
        {tab === "home" && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <p className="eyebrow">
                  <span /> 匿名文字分享 · 回憶與此刻
                </p>
                <h1>
                  <span className="headline-sentence">
                    <span>寫下你的</span>
                    <span>經歷與心情，</span>
                  </span>
                  <em className="headline-sentence">
                    <span>讀讀</span>
                    <span>陌生人的故事。</span>
                  </em>
                </h1>
                <div className="intro">
                  <p>在 Ring letter，你可以回想一段過去，也可以記錄今天的感受。</p>
                  <p>如果有相似的過去經歷，我們會試著讓那封信回應現在的你。</p>
                  <p>你也可以先讀，不必先寫。</p>
                </div>
                <div className="hero-actions">
                  <button className="primary" onClick={() => go("read")}>
                    先讀一封 <span>↗</span>
                  </button>
                  <button className="text-btn" onClick={() => go("write")}>
                    我想寫一封 <span>→</span>
                  </button>
                </div>
                <p className="quiet">不必認識彼此，也不必立刻回應。</p>
              </div>
              <div className="illustration" aria-hidden="true">
                <div className="orbit orbit-one" />
                <div className="orbit orbit-two" />
                <div className="moon" />
                <span className="spark s1">✦</span>
                <span className="spark s2">✧</span>
                <span className="spark s3">·</span>
                <div className="letter-back" />
                <div className="letter-art">
                  <div className="paper-date">致，某一天讀到這裡的你</div>
                  <p>
                    那時候的我，
                    <br />
                    也還不知道
                    <br />
                    後來會怎麼樣。
                  </p>
                  <div className="paper-lines" />
                  <span className="seal">rl</span>
                </div>
                <span className="orbit-note">一段生活，另一個時刻。</span>
              </div>
            </section>
            <section className="bottom-note">
              <div>
                <span className="tiny-star">✦</span>
                <p>讓真實的片段留下來</p>
              </div>
              <p>
                這裡沒有追蹤與私訊。
                <br />
                只有文字，和願意停留片刻的你。
              </p>
              <div className="test-badge">
                早期體驗版 <span>·</span> 手機也能閱讀
              </div>
            </section>
            <section className="how">
              <h2>讓現在，遇見一段過去</h2>
              <div>
                <article>
                  <h3>01／留下此刻</h3>
                  <p>寫下你現在的情緒，或正在困擾你的事。不用完整，也不用想好答案，先留下來。</p>
                </article>
                <article>
                  <h3>02／遇見過去</h3>
                  <p>
                    如果有一封來自過去的信，寫的人曾經遇過和你很類似的事，我們會把那封信送到你面前。它不是建議，是另一個人在當時留下的真實經歷。
                  </p>
                </article>
                <article>
                  <h3>03／留下回音</h3>
                  <p>
                    你可以回覆那封信，寫給幾年前的那個人。你的文字，也可能在某一天，被媒合給另一個正在經歷同樣事情的人。
                  </p>
                </article>
              </div>
            </section>
            <section className="matching-explanation">
              <h2>這封信，會怎麼來到你面前？</h2>
              <p>
                <span className="sentence">
                  當你留下現在的困擾，如果有一封來自過去的信，寫的人遇過和你類似的事，我們會把那封信送給你，作為給你的回應。
                </span>
                <span className="sentence">
                  測試期間由真人人工媒合，不是即時回覆，大約需要 1–3 天。
                </span>
                <span className="sentence">
                  如果目前沒有相似的信，我們會先告訴你，不會隨便拿一封不像的湊給你。
                </span>
              </p>
            </section>
            <MatchExperience onWrite={() => go("write")} />
          </>
        )}
        {tab === "read" && <MatchExperience onWrite={() => go("write")} />}
        {tab === "archive" && (
          <section className="reading">
            <div className="section-intro">
              <p className="eyebrow">時光信箱</p>
              <h1>
                <span className="heading-phrase">有一段生活，</span>
                <span className="heading-phrase">在這裡等你。</span>
              </h1>
              <p>
                {loading
                  ? "正在查看信箱…"
                  : stories.length
                    ? "以下是作者同意分享、經審閱的真實片段。"
                    : "信箱剛剛開啟。先讀一段示範，感受這裡的節奏。"}
              </p>
            </div>
            <article className="story-paper">
              <div className="story-top">
                <span>
                  {current.source === "demo" ? "示範故事 · AI 虛構創作" : "真人投稿 · 經作者同意"}
                </span>
                <span>✦</span>
              </div>
              <p className="era">{formatStoryMeta(current)}</p>
              <h2>{current.title}</h2>
              <div className="story-body">{current.body}</div>
              <Extra story={current} />
              <div className="story-end">· · ·</div>
              {current.source === "demo" && (
                <p className="demo-note">
                  這不是使用者投稿，也不代表真實事件。這段文字僅用來試讀介面。
                </p>
              )}
            </article>
            <div className="reader-actions">
              <button
                className="secondary"
                onClick={() => {
                  setIndex(index + 1);
                  setNotice("");
                  setError("");
                }}
              >
                再讀一封 →
              </button>
              <button
                className="text-btn"
                onClick={() => {
                  setSaved(false);
                  go("write");
                }}
              >
                留下我的片段
              </button>
            </div>
            <details className="feedback-box">
              <summary>願意告訴我們讀起來如何嗎？</summary>
              <label className="check">
                <input
                  type="checkbox"
                  checked={feedbackConsent}
                  onChange={(e) => setFeedbackConsent(e.target.checked)}
                />
                我已滿 18 歲，同意保存本次回饋供團隊測試分析，提供 30
                天存取，過期不再顯示並於後續清理。可在「我的片段」刪除。
              </label>
              <div className="chips">
                {(
                  [
                    ["resonate", "有一點共鳴"],
                    ["neutral", "沒有特別感覺"],
                    ["more", "想繼續讀"],
                  ] as const
                ).map(([k, t]) => (
                  <button
                    disabled={busy || sent.includes(current.id + k)}
                    key={k}
                    onClick={() => react(k)}
                  >
                    {sent.includes(current.id + k) ? "✓ 已記錄" : t}
                  </button>
                ))}
              </div>
              <label htmlFor="note">有沒有哪個細節留下印象？也可以說哪裡不適合。</label>
              <textarea
                id="note"
                maxLength={500}
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="可不填。請不要留下姓名或聯絡方式。"
              />
              <div className="reader-actions">
                <button
                  className="secondary"
                  disabled={busy || !note.trim()}
                  onClick={() => react("comment")}
                >
                  送出回饋
                </button>
                <button className="text-btn" disabled={busy} onClick={() => react("report")}>
                  回報這篇有問題
                </button>
              </div>
            </details>
          </section>
        )}
        {tab === "write" && (
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
              <div className="success">
                <span>✦</span>
                <h2>你的文字已留下。</h2>
                <p>
                  如果你勾選願意分享，會先經人工審閱，再讓其他讀者看見；未勾選的內容只供你與管理團隊查看。
                </p>
                <p>請保留此瀏覽器的 Cookie，才能查看與刪除。</p>
                <button className="primary" onClick={() => go("mine")}>
                  查看我的片段 →
                </button>
              </div>
            ) : !mode ? (
              <>
                <div className="writing-options">
                  <button disabled={busy} onClick={() => chooseMode("past")}>
                    <span>回憶信</span>
                    <h2>
                      有一段過去，
                      <br />
                      我還記得
                    </h2>
                    <p>
                      <span className="sentence">幾個小問題，陪你回想一件事。</span>
                      <span className="sentence">想不起來的部分，可以留白。</span>
                    </p>
                    <strong>回想一段經歷 →</strong>
                  </button>
                  <button disabled={busy} onClick={() => chooseMode("present")}>
                    <span>當下信</span>
                    <h2>
                      今天，
                      <br />
                      我有一點感受
                    </h2>
                    <p>
                      <span className="sentence">寫下剛剛發生的事和現在的心情。</span>
                      <span className="sentence">一兩句也可以。</span>
                    </p>
                    <strong>記下此刻 →</strong>
                  </button>
                </div>
                <p className="quiet">
                  選擇寫法時，會記錄本次開始與是否完成，供團隊比較試寫流程。未送出的文字不會儲存。紀錄提供
                  30 天存取，可在「我的片段」刪除。
                </p>
              </>
            ) : (
              <form className="write-form" onSubmit={submit}>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => {
                    if (confirm("切換寫法會清除這份未送出的草稿，確定切換？")) {
                      setMode("");
                      setBody("");
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
                  <>
                    <label htmlFor="era">這件事大約發生在什麼時候？</label>
                    <input
                      id="era"
                      name="era"
                      required
                      maxLength={40}
                      placeholder="例如：高中時／約三年前／記不清了"
                    />
                    <label htmlFor="source">你想怎麼寫？</label>
                    <select id="source" value={source} onChange={(e) => setSource(e.target.value)}>
                      <option value="recollection">跟著提問，現在回憶書寫</option>
                      <option value="original">貼上當時留下的原文</option>
                    </select>
                    {source === "recollection" ? (
                      <>
                        <p className="quiet">
                          以下三題可自由選答，至少填一項，合計最多 1,500
                          字。記不清楚可以直接說，不需要補成完整故事。
                        </p>
                        <label htmlFor="event">你想起的是哪一件事？</label>
                        <textarea
                          name="event"
                          id="event"
                          maxLength={700}
                          rows={3}
                          placeholder="從一件小事開始也可以。"
                        />
                        <label htmlFor="scene">如果只留下一個畫面，你會寫下哪個瞬間？</label>
                        <textarea name="scene" id="scene" maxLength={700} rows={3} />
                        <label htmlFor="feeling">那時候，你最在意或最不確定的是什麼？</label>
                        <textarea
                          name="feeling"
                          id="feeling"
                          maxLength={700}
                          rows={3}
                          placeholder="寫當時記得的感覺，不必用現在的答案解釋。"
                        />
                      </>
                    ) : (
                      <>
                        <label htmlFor="body">當時的原文</label>
                        <textarea
                          id="body"
                          required
                          maxLength={1500}
                          rows={8}
                          value={body}
                          onChange={(e) => setBody(e.target.value)}
                        />
                      </>
                    )}
                    <label htmlFor="reflection">現在回頭看，有什麼跟當時想的不一樣？（選填）</label>
                    <textarea
                      name="reflection"
                      id="reflection"
                      maxLength={800}
                      rows={3}
                      placeholder="沒有改變、還不明白，或不想回答，都可以。"
                    />
                    <p className="quiet">這段會另外標示為「現在回頭看」，與當時的感受分開呈現。</p>
                  </>
                ) : (
                  <>
                    <label htmlFor="body">剛剛發生了什麼？</label>
                    <textarea
                      id="body"
                      required
                      maxLength={1500}
                      rows={4}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder="今天一句話。想多說一點，也可以接著寫。"
                    />
                    <label htmlFor="mood">現在的感覺</label>
                    <input
                      id="mood"
                      name="mood"
                      required
                      maxLength={60}
                      list="moods"
                      placeholder="選一個，或用自己的話說"
                    />
                    <datalist id="moods">
                      {["開心", "疲倦", "焦慮", "平靜", "說不上來"].map((m) => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                    <p className="quiet">一兩句就可以，沒有最低字數。送出時會標示今天的日期。</p>
                  </>
                )}
                <div className="consent">
                  <label className="check">
                    <input type="checkbox" name="share" />
                    我願意讓這份原文經人工審閱後，匿名分享給本網站的其他讀者。（可不勾選）
                  </label>
                  <p>
                    <span className="sentence">未勾選時不會公開，管理團隊仍可閱讀。</span>
                    <span className="sentence">審閱不會改寫原文。</span>
                    <span className="sentence">請移除姓名、公司、地址與第三人的私密資訊。</span>
                  </p>
                  <label className="check">
                    <input type="checkbox" name="adult" required />
                    我已滿 18 歲，內容是我的真實經歷，且有權分享。
                  </label>
                  <label className="check">
                    <input type="checkbox" name="privacy" required />
                    我了解團隊可閱讀投稿，資料提供 30
                    天存取，過期不再顯示並於後續清理。我可在原瀏覽器刪除，已被截圖或轉傳的內容無法收回。
                  </label>
                  <button type="button" className="inline-link" onClick={() => setPrivacy(true)}>
                    完整資料使用說明
                  </button>
                </div>
                <button className="primary submit" disabled={busy}>
                  {busy ? "正在儲存…" : "留下這封信 ↗"}
                </button>
                <p className="quiet">不保證送達日期，也不提供即時回信。</p>
              </form>
            )}
          </section>
        )}
        {tab === "mine" && (
          <section className="collection">
            <div className="section-intro">
              <p className="eyebrow">只屬於這個瀏覽器的信匣</p>
              <h1>我的片段</h1>
              <p>
                <span className="sentence">投稿存在伺服器；此瀏覽器的 Cookie 是你的存取憑證。</span>
                <span className="sentence">清除 Cookie 或換裝置後，將無法自行找回。</span>
                <span className="sentence">本版提供 30 天存取，過期不再顯示。</span>
              </p>
            </div>
            {busy && <p role="status">正在處理…</p>}
            {!busy && !mine.length && (
              <div className="empty">
                <span>☾</span>
                <h2>還沒有留下的片段</h2>
                <p>有些話，可以從今天開始保存。</p>
                <button
                  className="secondary"
                  onClick={() => {
                    setSaved(false);
                    go("write");
                  }}
                >
                  留下此刻 →
                </button>
              </div>
            )}
            {mine.map((s) => (
              <article className="own-story" key={s.id}>
                <span className="pill">{STATUS_NAME[s.status || "pending"]}</span>
                <p className="era">{formatStoryMeta(s)}</p>
                <h2>{s.title}</h2>
                <p className="prewrap">{s.body}</p>
                <Extra story={s} />
                <button className="danger" disabled={busy} onClick={() => withdraw(s.id)}>
                  撤回並刪除
                </button>
              </article>
            ))}
            <div className="erase">
              <p>也可以一次刪除這個瀏覽器的全部投稿與體驗回饋。</p>
              <button className="text-btn" disabled={busy} onClick={erase}>
                刪除我的所有資料
              </button>
            </div>
          </section>
        )}
        {tab === "admin" && admin && (
          <section className="admin">
            <div className="section-intro">
              <p className="eyebrow">管理者專用</p>
              <h1>把關每一封來信</h1>
              <p>
                <span className="sentence">只審核原文。</span>
                <span className="sentence">不同意分享的片段不能公開。</span>
                <span className="sentence">資料提供 30 天存取，過期不再顯示。</span>
              </p>
            </div>
            <div className="stats">
              <div>
                <strong>{review.filter((s) => s.status === "pending").length}</strong>待審投稿
              </div>
              <div>
                <strong>{review.filter((s) => s.status === "approved").length}</strong>已分享
              </div>
              <div>
                <strong>{feedback.filter((f) => f.kind === "more").length}</strong>想繼續讀 · 次數
              </div>
              <div>
                <strong>{feedback.length}</strong>回饋筆數
              </div>
            </div>
            <p className="quiet">
              顯示最近 200 篇、300
              筆回饋；這些是事件筆數，不是獨立人數。示範故事回饋會標示，不當成真實內容需求證據。
            </p>
            <button className="secondary" disabled={busy} onClick={loadAdmin}>
              重新整理
            </button>
            <h2>兩種寫法的試寫情況</h2>
            <div className="metrics">
              <table>
                <thead>
                  <tr>
                    <th>寫法</th>
                    <th>開始</th>
                    <th>完成</th>
                    <th>同意分享</th>
                  </tr>
                </thead>
                <tbody>
                  {["past", "present"].map((type) => {
                    const m = metrics.find((x) => x.letterType === type);
                    return (
                      <tr key={type}>
                        <th>{type === "past" ? "回憶信" : "當下信"}</th>
                        <td>{m?.starts || 0}</td>
                        <td>{m?.completions || 0}</td>
                        <td>{m?.shares || 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="quiet">
              最近 30
              天的試寫次數，不是人數。「開始」指選擇寫法進入表單；「完成」包含未公開投稿；「同意分享」不代表已核准。單封撤回保留完成次數，刪除所有資料會移除對應紀錄。早期投稿未納入。
            </p>
            <h2>投稿審閱</h2>
            {review.length === 0 && <p className="empty-small">尚無投稿，收到後會出現在這裡。</p>}
            {review.map((s) => (
              <article className="own-story" key={s.id}>
                <span className="pill">{STATUS_NAME[s.status || "pending"]}</span>
                <p className="era">{formatStoryMeta(s)}</p>
                <h3>{s.title}</h3>
                <p className="prewrap">{s.body}</p>
                <Extra story={s} />
                <div className="chips">
                  {s.status !== "private" && (
                    <>
                      <button disabled={busy} onClick={() => moderate(s.id, "approved")}>
                        核准分享原文
                      </button>
                      <button disabled={busy} onClick={() => moderate(s.id, "rejected")}>
                        暫不分享／下架
                      </button>
                    </>
                  )}
                  <button
                    className="danger"
                    disabled={busy}
                    onClick={() => moderate(s.id, "delete")}
                  >
                    永久刪除
                  </button>
                </div>
              </article>
            ))}
            <h2>閱讀回饋與回報</h2>
            {feedback.length === 0 && <p className="empty-small">尚無回饋。</p>}
            {feedback.map((f) => (
              <article className="feedback-item" key={f.id}>
                <span>
                  {
                    (
                      {
                        more: "想繼續讀",
                        resonate: "有共鳴",
                        neutral: "無特別感覺",
                        comment: "文字回饋",
                        report: "⚑ 問題回報",
                      } as any
                    )[f.kind]
                  }
                </span>
                <small>
                  {f.story.startsWith("demo-")
                    ? "示範故事"
                    : review.find((s) => s.id === f.story)?.title || "文章 " + f.story}{" "}
                  · {new Date(f.created).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
                </small>
                <p>{f.note || "未留文字"}</p>
              </article>
            ))}
          </section>
        )}
      </main>
      <footer>
        <span>
          Ring letter <span className="footer-phrase">把片刻，留給時間。</span>
        </span>
        <div>
          <button onClick={() => go("mine")}>先前投稿與撤回</button>
          <button onClick={() => go("archive")}>先前公開信箱</button>
          <button onClick={() => setPrivacy(true)}>先前投稿資料說明</button>
          {admin ? (
            <button onClick={() => go("admin")}>管理信箱</button>
          ) : (
            <a href="/admin">管理者登入</a>
          )}
        </div>
      </footer>
      {privacy && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="privacy-title"
          >
            <button className="close" onClick={() => setPrivacy(false)} aria-label="關閉說明">
              ×
            </button>
            <h2 id="privacy-title">讓文字安心留下</h2>
            <p>
              <span className="sentence">
                這是 Ring letter 團隊的小型測試網站，僅供 18 歲以上使用。
              </span>
              <span className="sentence">
                閱讀不用註冊；投稿與回饋使用隨機的瀏覽器識別 Cookie，不要求姓名、電子郵件或 LINE
                帳號。
              </span>
            </p>
            <h3>什麼會被保存？</h3>
            <p>
              <span className="sentence">
                你送出的標題、文字、心情、回顧、時間標示、來源類型、分享同意與時間，以及自願送出的回饋。
              </span>
              <span className="sentence">
                另記錄選擇的寫法、開始與完成時間，供團隊比較流程；未送出的文字不會保存。
              </span>
              <span className="sentence">管理者可閱讀這些資料。</span>
              <span className="sentence">未勾選分享的文字不會公開。</span>
            </p>
            <h3>多久？如何刪除？</h3>
            <p>
              <span className="sentence">
                資料最多供使用 30 天，過期即不再顯示，並於後續建立體驗工作階段時清理。
              </span>
              <span className="sentence">你可隨時在「我的片段」刪除這個瀏覽器的投稿及回饋。</span>
              <span className="sentence">請保留 Cookie；清除後本版沒有跨裝置找回功能。</span>
              <span className="sentence">
                系統備份與託管平台紀錄依平台機制保存，不保證同步清除。
              </span>
            </p>
            <h3>匿名分享的邊界</h3>
            <p>
              <span className="sentence">分享後文章可能被任何取得網站連結的人閱讀。</span>
              <span className="sentence">即使沒有姓名，熟悉事件的人仍可能認出作者。</span>
              <span className="sentence">請勿投稿第三人私密資訊；讀者請勿截圖轉傳、辨認作者。</span>
              <span className="sentence">撤回可停止網站顯示，無法收回別人已保存的內容。</span>
            </p>
            <h3>人工審閱，不代寫人生</h3>
            <p>
              <span className="sentence">團隊只核准原文或暫不分享，不改寫投稿。</span>
              <span className="sentence">
                沒有取得同意，不把投稿用於公開宣傳、其他產品或外部 AI 分析。
              </span>
              <span className="sentence">示範故事明確標為 AI 虛構，不是真人投稿。</span>
            </p>
            <p>
              <span className="sentence">此處不是即時對話或緊急支援服務。</span>
              <span className="sentence">若文字讓你不適，可以離開並透過閱讀頁回報。</span>
            </p>
            <button className="primary" onClick={() => setPrivacy(false)}>
              我了解了
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
