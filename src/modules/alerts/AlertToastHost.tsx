import { useEffect, useRef, useState } from "react";
import "./alertToasts.css";

type ToastEvent = CustomEvent<{
  key: string;
  title: string;
  body: string;
}>;

type HubToast = {
  id: string;
  key: string;
  title: string;
  body: string;
  closing: boolean;
};

const MAX_VISIBLE_TOASTS = 3;
const AUTO_CLOSE_MS = 5000;
const EXIT_MS = 260;

export function AlertToastHost() {
  const [toasts, setToasts] = useState<HubToast[]>([]);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    function closeToast(id: string) {
      setToasts((current) => current.map((toast) => toast.id === id ? { ...toast, closing: true } : toast));
      const exitTimer = window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, EXIT_MS);
      timers.current.push(exitTimer);
    }

    function onToast(event: Event) {
      const detail = (event as ToastEvent).detail;
      if (!detail?.key) return;
      const id = `${detail.key}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
      const next: HubToast = {
        id,
        key: detail.key,
        title: detail.title || "Novo alerta no HUB",
        body: detail.body || "Abra o HUB para conferir.",
        closing: false,
      };

      setToasts((current) => [...current.filter((toast) => toast.key !== detail.key), next].slice(-MAX_VISIBLE_TOASTS));
      playChime();

      const timer = window.setTimeout(() => closeToast(id), AUTO_CLOSE_MS);
      timers.current.push(timer);
    }

    document.addEventListener("hub:show-alert-toast", onToast);
    return () => {
      document.removeEventListener("hub:show-alert-toast", onToast);
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current = [];
    };
  }, []);

  function dismiss(id: string) {
    setToasts((current) => current.map((toast) => toast.id === id ? { ...toast, closing: true } : toast));
    const timer = window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, EXIT_MS);
    timers.current.push(timer);
  }

  function openToast(toast: HubToast) {
    document.dispatchEvent(new CustomEvent("hub:open-alert", { detail: { key: toast.key } }));
    dismiss(toast.id);
  }

  if (toasts.length === 0) return null;

  return (
    <aside className="hub-alert-toast-stack" aria-live="polite" aria-label="Novos alertas">
      {toasts.map((toast) => (
        <article className={`hub-alert-toast ${toast.closing ? "is-closing" : ""}`} key={toast.id}>
          <header className="hub-alert-toast-head">
            <span className="hub-alert-toast-avatar">T</span>
            <strong>Hub SM</strong>
            <button type="button" aria-label="Fechar aviso" onClick={() => dismiss(toast.id)}>×</button>
          </header>
          <button className="hub-alert-toast-body" type="button" onClick={() => openToast(toast)}>
            <strong>{toast.title}</strong>
            <span>{toast.body}</span>
          </button>
        </article>
      ))}
    </aside>
  );
}

function playChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const now = context.currentTime;
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.045, now + 0.02);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    master.connect(context.destination);

    const notes = [659.25, 783.99];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + 0.04 + (index * 0.16);
      const end = start + 0.14;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.7, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(start);
      oscillator.stop(end + 0.02);
    });

    window.setTimeout(() => { void context.close(); }, 700);
  } catch {
    // Alguns navegadores bloqueiam áudio até a primeira interação do usuário.
  }
}
