"use client";
import { useEffect, useImperativeHandle, useRef } from "react";
import { useShell } from "../shell/ShellContext";

// Cloudflare Turnstile for submitting a letter or feedback (#4 §5.1). The
// script loads only once one of those forms is on screen. The widget stays
// invisible unless Cloudflare needs the visitor to interact, and a token is
// fetched only at submit time: writing can take longer than a token's five
// minutes, and each token is good for one request.

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const UNAVAILABLE = "人機驗證暫時無法載入，請保留文字並稍後重試。";
const FAILED = "人機驗證沒有通過，請再試一次。";
/** A stalled api.js fires neither load nor error; give up so the form isn't stuck. */
const SCRIPT_TIMEOUT_MS = 15000;
/**
 * A challenge that stalls without calling any callback must not leave the
 * form busy. The deadline pauses while the visitor is shown an interactive
 * challenge (Turnstile's own timeout-callback covers that) and restarts after.
 */
const TOKEN_TIMEOUT_MS = 30000;

type RenderOptions = {
  sitekey: string;
  action: string;
  execution: "execute";
  appearance: "interaction-only";
  theme: "dark";
  language: string;
  callback: (token: string) => void;
  "error-callback": () => boolean;
  "expired-callback": () => void;
  "timeout-callback": () => void;
  "before-interactive-callback": () => void;
  "after-interactive-callback": () => void;
};
type TurnstileApi = {
  render: (el: HTMLElement, options: RenderOptions) => string | undefined;
  execute: (id: string) => void;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;
function loadScript() {
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const s = document.createElement("script");
    const fail = () => {
      clearTimeout(timer);
      s.onload = s.onerror = null;
      s.remove();
      reject(new Error(UNAVAILABLE));
    };
    const timer = setTimeout(fail, SCRIPT_TIMEOUT_MS);
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => {
      clearTimeout(timer);
      if (window.turnstile) resolve(window.turnstile);
      else fail();
    };
    s.onerror = fail;
    document.head.appendChild(s);
  }).catch((e) => {
    loading = null; // let the next submit try again
    throw e;
  });
  return loading;
}

export type TurnstileHandle = {
  /** Runs the challenge and resolves with a one-time token. */
  getToken: () => Promise<string>;
  /** Readies the widget for the next token; call after every request. */
  reset: () => void;
};

type Pending = { resolve: (token: string) => void; reject: (e: Error) => void };

export default function Turnstile({
  action,
  ref,
  className,
}: {
  action: "submit" | "feedback";
  ref: React.Ref<TurnstileHandle>;
  /** Spacing in the form around it; the widget only takes up room when it shows a challenge. */
  className?: string;
}) {
  const { turnstileSiteKey } = useShell();
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<Promise<{ api: TurnstileApi; id: string }> | null>(null);
  const pending = useRef<Pending | null>(null);
  const used = useRef(false);
  const deadline = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopDeadline = () => {
    if (deadline.current) clearTimeout(deadline.current);
    deadline.current = null;
  };
  const startDeadline = (api: TurnstileApi, id: string) => {
    stopDeadline();
    deadline.current = setTimeout(() => {
      deadline.current = null;
      if (!pending.current) return;
      settle(new Error(UNAVAILABLE));
      try {
        api.reset(id);
        used.current = false;
      } catch {
        // the widget is gone; the next getToken() mounts a new one
      }
    }, TOKEN_TIMEOUT_MS);
  };

  const settle = (outcome: string | Error) => {
    stopDeadline();
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    if (typeof outcome === "string") p.resolve(outcome);
    else p.reject(outcome);
  };

  function mount() {
    widget.current ??= (async () => {
      if (!turnstileSiteKey) throw new Error(UNAVAILABLE);
      const api = await loadScript();
      if (!box.current) throw new Error(UNAVAILABLE);
      const id = api.render(box.current, {
        sitekey: turnstileSiteKey,
        action,
        execution: "execute",
        appearance: "interaction-only",
        // The forms are on the night sky; "auto" would follow a light system theme.
        theme: "dark",
        language: "zh-tw",
        callback: (token) => settle(token),
        "error-callback": () => {
          settle(new Error(FAILED));
          return true; // handled: no retry loop inside the widget
        },
        "expired-callback": () => settle(new Error(FAILED)),
        "timeout-callback": () => settle(new Error(FAILED)),
        "before-interactive-callback": () => stopDeadline(),
        "after-interactive-callback": () => {
          // only fires after render() returned, so `id` is set
          if (pending.current && id) startDeadline(api, id);
        },
      });
      if (!id) throw new Error(UNAVAILABLE);
      return { api, id };
    })().catch((e) => {
      widget.current = null;
      throw e;
    });
    return widget.current;
  }

  useEffect(() => {
    mount().catch(() => {}); // a failure shows when the visitor submits
    return () => {
      const w = widget.current;
      widget.current = null;
      settle(new Error(FAILED));
      w?.then(({ api, id }) => api.remove(id)).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnstileSiteKey, action]);

  useImperativeHandle(ref, () => ({
    async getToken() {
      const { api, id } = await mount();
      if (used.current) api.reset(id);
      used.current = true;
      settle(new Error(FAILED));
      return new Promise<string>((resolve, reject) => {
        pending.current = { resolve, reject };
        startDeadline(api, id);
        api.execute(id);
      });
    },
    reset() {
      widget.current
        ?.then(({ api, id }) => {
          api.reset(id);
          used.current = false;
        })
        .catch(() => {});
    },
  }));

  return <div ref={box} className={className} />;
}
