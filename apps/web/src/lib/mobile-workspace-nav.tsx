"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface MobileWorkspaceNavContextValue {
  readonly visible: boolean;
  readonly setVisible: (visible: boolean) => void;
}

const MobileWorkspaceNavContext = createContext<MobileWorkspaceNavContextValue | undefined>(
  undefined,
);

/**
 * Lets a `workspace` shell page's deeply-nested chat surface (the admin
 * unified inbox) tell the shell whether its bottom tab bar should show —
 * WhatsApp shows it while browsing the conversation list, hides it once a
 * chat is open. Default is hidden, matching every workspace page that never
 * opts in (the assistant page, the student support page).
 */
export function MobileWorkspaceNavProvider({ children }: { readonly children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  return (
    <MobileWorkspaceNavContext.Provider value={{ visible, setVisible }}>
      {children}
    </MobileWorkspaceNavContext.Provider>
  );
}

export function useMobileWorkspaceNavVisible(): boolean {
  return useContext(MobileWorkspaceNavContext)?.visible ?? false;
}

export function useSetMobileWorkspaceNavVisible(): (visible: boolean) => void {
  const setVisible = useContext(MobileWorkspaceNavContext)?.setVisible;
  return setVisible ?? (() => {});
}
