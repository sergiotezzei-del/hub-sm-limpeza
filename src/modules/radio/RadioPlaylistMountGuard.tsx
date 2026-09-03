import { useEffect, useState } from "react";
import { RadioStudioHost } from "./RadioStudioHost";

const RADIO_DIALOG_SELECTOR = '[role="dialog"][aria-label="Rádio Santa Maria"]';

function shouldMountStudio() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/radio") return true;
  return Boolean(document.querySelector(RADIO_DIALOG_SELECTOR));
}

export function RadioPlaylistMountGuard() {
  const [mounted, setMounted] = useState(() => shouldMountStudio());

  useEffect(() => {
    const sync = () => {
      const next = shouldMountStudio();
      setMounted((current) => current === next ? current : next);
    };

    sync();
    const timer = window.setInterval(sync, 1500);
    window.addEventListener("focus", sync);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", sync);
    };
  }, []);

  return mounted ? <RadioStudioHost /> : null;
}
