import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { RadioStudioHost } from "./RadioStudioHost";

const RADIO_DIALOG_SELECTOR = '[role="dialog"][aria-label="Rádio Santa Maria"]';

function findStudioHost() {
  const dialog = document.querySelector<HTMLElement>(RADIO_DIALOG_SELECTOR);
  if (!dialog) return null;
  return dialog.querySelector<HTMLElement>(":scope > div") ?? dialog;
}

export function RadioPlaylistMountGuard() {
  const [host, setHost] = useState<HTMLElement | null>(() => findStudioHost());

  useEffect(() => {
    const sync = () => {
      const next = findStudioHost();
      setHost((current) => current === next ? current : next);
    };

    sync();
    const timer = window.setInterval(sync, 1500);
    window.addEventListener("focus", sync);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", sync);
    };
  }, []);

  return host ? createPortal(<RadioStudioHost />, host) : null;
}
