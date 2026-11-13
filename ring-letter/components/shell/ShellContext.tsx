"use client";
import { createContext, useContext } from "react";

/** State that lives in the layout and outlasts route changes. */
export type Shell = {
  openPrivacy: () => void;
  /** Footer shows 管理信箱 once /api/admin/summary has accepted the viewer. */
  setAdmin: (admin: boolean) => void;
};

export const ShellContext = createContext<Shell>({ openPrivacy: () => {}, setAdmin: () => {} });

export const useShell = () => useContext(ShellContext);
