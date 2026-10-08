import { useEffect, useState } from "react";

const WORKSPACE_MOBILE_QUERY = "(max-width: 639px)";

export function useWorkspaceMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.matchMedia(WORKSPACE_MOBILE_QUERY).matches);

  useEffect(() => {
    const query = window.matchMedia(WORKSPACE_MOBILE_QUERY);
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return mobile;
}
