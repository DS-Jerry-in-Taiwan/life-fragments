"use client";
import { useEffect, useState } from "react";
import * as api from "../../lib/api-client";
import type { Story } from "../../lib/stories";
import { useAction } from "../../lib/use-action";
import StatusMessage from "../common/StatusMessage";
import StatusPill from "../story/StatusPill";
import StoryExtra from "../story/StoryExtra";
import StoryMeta from "../story/StoryMeta";
import NavButton from "../shell/NavButton";
import EraseAll from "./EraseAll";

/** 我的片段: this browser's submissions, withdraw one or erase everything. */
export default function MyStories() {
  const action = useAction(true);
  const { busy, setNotice } = action;
  const [mine, setMine] = useState<Story[]>([]);
  const load = async () => setMine(await api.listMyStories());
  useEffect(() => {
    action.run(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function withdraw(id: string) {
    if (!confirm("確定刪除這段文字？刪除後會停止在網站上分享，無法復原。")) return;
    return action.run(async () => {
      await api.withdrawStory(id);
      await load();
      setNotice("已刪除這段文字。");
    });
  }
  function erase() {
    if (!confirm("刪除這個瀏覽器的全部投稿與回饋？無法復原。")) return;
    return action.run(async () => {
      await api.eraseMyData();
      setMine([]);
      setNotice("已刪除本瀏覽器對應的投稿與回饋。");
    });
  }
  return (
    <>
      <StatusMessage action={action} />
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
            <NavButton to="/write" className="secondary">
              留下此刻 →
            </NavButton>
          </div>
        )}
        {mine.map((s) => (
          <article className="own-story" key={s.id}>
            <StatusPill status={s.status} />
            <StoryMeta story={s} />
            <h2>{s.title}</h2>
            <p className="prewrap">{s.body}</p>
            <StoryExtra story={s} />
            <button className="danger" disabled={busy} onClick={() => withdraw(s.id)}>
              撤回並刪除
            </button>
          </article>
        ))}
        <EraseAll busy={busy} onErase={erase} />
      </section>
    </>
  );
}
