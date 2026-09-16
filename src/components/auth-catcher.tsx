import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";

/** Old confirm links land on /account. Send the token to /login to finish the session. */
export function AuthCatcher() {
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.has("token_hash") && path !== "/login") {
      window.location.replace(`/login${window.location.search}${window.location.hash}`);
    }
  }, [path]);

  return null;
}
