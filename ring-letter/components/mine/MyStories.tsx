"use client";
import { useEffect, useState } from "react";
import * as api from "../../lib/api-client";
import { CONTACT_EMAIL, CONTACT_MAILTO } from "../../lib/contact";
import type { Story } from "../../lib/stories";
import { useAction } from "../../lib/use-action";
import SectionIntro from "../common/SectionIntro";
import StatusMessage from "../common/StatusMessage";
import StatusPill from "../story/StatusPill";
import StoryExtra from "../story/StoryExtra";
import StoryMeta from "../story/StoryMeta";
import own from "../story/OwnStory.module.css";
import NavButton from "../shell/NavButton";
import EraseAll from "./EraseAll";
import Logout from "./Logout";
import styles from "./MyStories.module.css";

/** 我的片段: this browser's submissions, withdraw one, log out or erase everything. */
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
  function logout() {
    if (
      !confirm(
        "在這台裝置登出？投稿會保留，但不會再出現在這個瀏覽器的「我的片段」，也無法再從這裡刪除；回饋與試寫紀錄會在 30 天後自動清除。之後再投稿，會以新的身分開始。",
      )
    )
      return;
    return action.run(async () => {
      await api.logout();
      setMine([]);
      setNotice("已在這台裝置登出。投稿仍保留；需要刪除時，請寫信請管理者代刪。");
    });
  }
  return (
    <>
      <StatusMessage action={action} />
      <section className={styles.collection}>
        <SectionIntro eyebrow="只屬於這個瀏覽器的信匣" title="我的片段">
          <span className="sentence">投稿存在伺服器；此瀏覽器的 Cookie 是你的存取憑證。</span>
          <span className="sentence">每次回來都會再記得你一年。</span>
          <span className="sentence">
            清除 Cookie、換裝置或登出後，無法在這裡找回，可寫信到{" "}
            <a href={CONTACT_MAILTO}>{CONTACT_EMAIL}</a> 請管理者代刪。
          </span>
        </SectionIntro>
        {busy && <p role="status">正在處理…</p>}
        {!busy && !mine.length && (
          <div className={styles.empty}>
            <span>☾</span>
            <h2>還沒有留下的片段</h2>
            <p>有些話，可以從今天開始保存。</p>
            <NavButton to="/write" className="secondary">
              留下此刻 →
            </NavButton>
          </div>
        )}
        {mine.map((s) => (
          <article className={own.ownStory} key={s.id}>
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
        <Logout busy={busy} onLogout={logout} />
        <EraseAll busy={busy} onErase={erase} />
      </section>
    </>
  );
}
