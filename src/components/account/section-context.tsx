import { createContext, useContext, useEffect } from "react";

/**
 * Which in-page account section is showing. The shell reads it so the bottom
 * bar only highlights Overview while the Overview section is open.
 */
export const AccountSectionContext = createContext<((section: string) => void) | null>(null);

export function useReportAccountSection(section: string) {
  const report = useContext(AccountSectionContext);
  useEffect(() => {
    report?.(section);
  }, [report, section]);
  useEffect(() => () => report?.("overview"), [report]);
}
