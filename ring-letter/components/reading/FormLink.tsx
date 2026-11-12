"use client";
import { useState } from "react";
import { FORM_URL_DISTRESS, FORM_URL_ECHO } from "../../data/matching";

/** Link to an external form; while the URL is still "#" it shows 尚未開放 instead of navigating. */
export default function FormLink({
  kind,
  children,
  className = "primary",
}: {
  kind: "distress" | "echo";
  children: React.ReactNode;
  className?: string;
}) {
  const [notice, setNotice] = useState(false);
  const href = kind === "distress" ? FORM_URL_DISTRESS : FORM_URL_ECHO;
  return (
    <span className="form-link">
      <a
        className={className}
        href={href}
        data-event={kind === "echo" ? "echo_click" : "distress_click"}
        onClick={(e) => {
          if (href === "#") {
            e.preventDefault();
            setNotice(true);
          }
        }}
      >
        {children}
      </a>
      {notice && (
        <span className="form-placeholder" role="status">
          {kind === "echo" ? "回音" : "投稿"}表單尚未開放。你可以先讀信，這次沒有送出任何文字。
        </span>
      )}
    </span>
  );
}
