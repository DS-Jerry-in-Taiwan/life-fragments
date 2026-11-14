"use client";
import { useCallback, useEffect, useState } from "react";
import * as api from "../../lib/api-client";
import { CONTACT_EMAIL, CONTACT_MAILTO } from "../../lib/contact";
import type { Story } from "../../lib/stories";
import { useAction } from "../../lib/use-action";
import { useConfirm } from "../common/ConfirmDialog";
import SectionIntro from "../common/SectionIntro";
import StatusMessage from "../common/StatusMessage";
import StatusPill from "../story/StatusPill";
import StoryExtra from "../story/StoryExtra";
import StoryMeta from "../story/StoryMeta";
import own from "../story/OwnStory.module.css";
import NavButton from "../shell/NavButton";
import { clearDraft } from "../write/useDraft";
import EraseAll from "./EraseAll";
import Logout from "./Logout";
import ShareToggle, { type ShareConsent } from "./ShareToggle";
import styles from "./MyStories.module.css";

/** Unsent letters (sessionStorage) belong to this identity too; their attempts are gone with it. */
function forgetDrafts() {
  clearDraft("past");
  clearDraft("present");
}

/** 我的片段: this browser's submissions, change one's sharing or withdraw it, log out or erase everything. */
export default function MyStories() {
  const action = useAction(true);
  const { busy, setNotice } = action;
  const confirm = useConfirm();
  const [mine, setMine] = useState<Story[]>([]);
  // Sharing changes report a failure next to the story (the open form or
  // button) instead of the banner at the top, and hand focus to the story's
  // new sharing control on success.
  const [sharingError, setSharingError] = useState<{ id: string; error: string } | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const load = async () => setMine(await api.listMyStories());
  useEffect(() => {
    action.run(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function withdraw(id: string) {
    const ok = await confirm({
      title: "撤回並刪除",
      message: "確定刪除這段文字？刪除後會停止在網站上分享，無法復原。",
      confirmLabel: "確定刪除",
      danger: true,
    });
    if (!ok) return;
    setSharingError(null);
    return action.run(async () => {
      await api.withdrawStory(id);
      await load();
      setNotice("已刪除這段文字。");
    });
  }
  const clearFocus = useCallback(() => setFocusId(null), []);
  function changeSharing(id: string, consent: ShareConsent | null, done: string) {
    setSharingError(null);
    setFocusId(null);
    return action.run(async () => {
      try {
        await api.setStorySharing(id, consent !== null, consent ?? undefined);
      } catch (e) {
        setSharingError({ id, error: e instanceof Error ? e.message : String(e) });
        return;
      }
      await load();
      setFocusId(id);
      setNotice(done);
    });
  }
  function share(id: string, consent: ShareConsent) {
    return changeSharing(id, consent, "已送出分享申請，等待人工審閱。");
  }
  async function stopSharing(s: Story) {
    const message =
      s.status === "approved"
        ? "停止分享？這篇會立即從公開信箱下架，改為不公開保存，仍留在「我的片段」；未公開的文字最多保存 30 天，讀者回饋也照常在 30 天後清除。之後想再分享，需要重新申請並經人工審閱。"
        : "停止分享？這篇會退出審閱，改為不公開保存，仍留在「我的片段」；未公開的文字最多保存 30 天。之後想再分享，需要重新申請並經人工審閱。";
    if (!(await confirm({ title: "停止分享", message, confirmLabel: "停止分享" }))) return;
    return changeSharing(s.id, null, "已停止分享，這篇改為不公開保存。");
  }
  async function erase() {
    const ok = await confirm({
      title: "刪除我的所有資料",
      message: "刪除這個瀏覽器的全部投稿與回饋？無法復原。",
      confirmLabel: "全部刪除",
      danger: true,
    });
    if (!ok) return;
    return action.run(async () => {
      await api.eraseMyData();
      forgetDrafts();
      setMine([]);
      setNotice("已刪除本瀏覽器對應的投稿與回饋。");
    });
  }
  async function logout() {
    const ok = await confirm({
      title: "在這台裝置登出",
      message:
        "在這台裝置登出？投稿會保留，但不會再出現在這個瀏覽器的「我的片段」，也無法再從這裡刪除；回饋與試寫紀錄會在 30 天後自動清除。之後再投稿，會以新的身分開始。",
      confirmLabel: "登出",
    });
    if (!ok) return;
    return action.run(async () => {
      await api.logout();
      forgetDrafts();
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
            <ShareToggle
              key={s.status}
              story={s}
              busy={busy}
              error={sharingError?.id === s.id ? sharingError.error : undefined}
              focus={focusId === s.id}
              onFocused={clearFocus}
              onShare={share}
              onStop={stopSharing}
            />
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
