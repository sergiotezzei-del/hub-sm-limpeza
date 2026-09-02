import { useEffect, useState } from "react";
import { RadioPlaylistEnhancer } from "./RadioPlaylistEnhancer";

const RADIO_DIALOG_SELECTOR = '[role="dialog"][aria-label="Rádio Santa Maria"]';

function shouldMountPlaylist() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/radio") return true;
  return Boolean(document.querySelector(RADIO_DIALOG_SELECTOR));
}

export function RadioPlaylistMountGuard() {
  const [mounted, setMounted] = useState(() => shouldMountPlaylist());

  useEffect(() => {
    const sync = () => {
      const next = shouldMountPlaylist();
      setMounted((current) => current === next ? current : next);
    };

    sync();
    const timer = window.setInterval(sync, 900);
    window.addEventListener("focus", sync);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", sync);
    };
  }, []);

  return mounted ? <RadioPlaylistEnhancer /> : null;
}
