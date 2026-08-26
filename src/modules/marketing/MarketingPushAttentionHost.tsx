import { useEffect, useRef, useState } from "react";
import { acknowledgeMarketingPush, type MarketingPushNotificationPayload } from "./marketingPushClient";
import "./marketingPushAttention.css";

const DEFAULT_TITLE = "HUB Santa Maria";
const ALERT_TITLE = "🔔 AGENDAMENTO DO MARKETING · HUB Santa Maria";
const AUTO_HIDE_MS = 12000;
const BLINK_MS = 850;

export function MarketingPushAttentionHost() {
  const [payload, setPayload] = useState<MarketingPushNotificationPayload | null>(null);
  const hideTimerRef = useRef<number>(0);
  const blinkTimerRef = useRef<number>(0);
  const originalTitleRef = useRef(document.title || DEFAULT_TITLE);
  const faviconRef = useRef(document.querySelector<HTMLLinkElement>('link[rel~="icon"]'));
  const originalFaviconRef = useRef(faviconRef.current?.getAttribute("href") || "/icons/icon-192.png");

  useEffect(() => {
    const onMessage = (event: Event) => {
      const message = event as MessageEvent<{ type?: string; payload?: MarketingPushNotificationPayload }>;
      if (message.data?.type !== "hub:marketing-push" || !message.data.payload) return;
      showAttention(message.data.payload);
    };

    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener("message", onMessage);
      clearTimers();
      restoreVisuals();
    };
  }, []);

  function showAttention(next: MarketingPushNotificationPayload) {
    setPayload(next);
    playChime();
    clearTimers();
    let inverse = false;
    applyVisual(true);
    blinkTimerRef.current = window.setInterval(() => {
      inverse = !inverse;
      applyVisual(inverse);
    }, BLINK_MS);
    hideTimerRef.current = window.setTimeout(() => {
      setPayload(null);
      clearTimers();
      restoreVisuals();
    }, AUTO_HIDE_MS);
  }

  function clearTimers() {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    if (blinkTimerRef.current) window.clearInterval(blinkTimerRef.current);
    hideTimerRef.current = 0;
    blinkTimerRef.current = 0;
  }

  function applyVisual(inverse: boolean) {
    document.title = inverse ? ALERT_TITLE : originalTitleRef.current;
    const favicon = faviconRef.current;
    if (!favicon) return;
    if (!inverse) {
      favicon.setAttribute("href", originalFaviconRef.current);
      favicon.setAttribute("type", "image/png");
      return;
    }
    favicon.setAttribute("type", "image/svg+xml");
    favicon.setAttribute("href", inverseFavicon());
  }

  function restoreVisuals() {
    document.title = originalTitleRef.current;
    const favicon = faviconRef.current;
    if (favicon) {
      favicon.setAttribute("href", originalFaviconRef.current);
      favicon.setAttribute("type", "image/png");
    }
  }

  async function openNotification() {
    if (!payload) return;
    clearTimers();
    restoreVisuals();
    const ackToken = payload.data?.ackToken;
    if (ackToken) await acknowledgeMarketingPush(ackToken);
    setPayload(null);
    window.location.href = payload.data?.url || "/marketing/notificacoes";
  }

  function dismissToast(event: React.MouseEvent) {
    event.stopPropagation();
    setPayload(null);
    clearTimers();
    restoreVisuals();
  }

  if (!payload) return null;

  return (
    <aside className="marketing-push-toast" role="alert" aria-live="assertive" onClick={() => { void openNotification(); }}>
      <header>
        <span className="marketing-push-toast-avatar">T</span>
        <strong>HUB Santa Maria</strong>
        <button type="button" aria-label="Fechar aviso" onClick={dismissToast}>×</button>
      </header>
      <div className="marketing-push-toast-body">
        <strong>{payload.title || "Agendamento do Marketing"}</strong>
        <p>{payload.body || "Abra o HUB para visualizar."}</p>
        <span>CLIQUE PARA VISUALIZAR</span>
      </div>
    </aside>
  );
}

function inverseFavicon() {
  return `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
      <rect width="192" height="192" rx="36" fill="#ffffff"/>
      <path fill="#f97316" d="M42 48h108v28h-39v76H81V76H42V48z"/>
    </svg>
  `)}`;
}

function playChime() {
  try {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    const now = context.currentTime;
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.62);
    master.connect(context.destination);

    [659.25, 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + index * 0.18;
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.75, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(start);
      oscillator.stop(start + 0.34);
    });

    window.setTimeout(() => { void context.close(); }, 900);
  } catch {
    // O aviso nativo do sistema continua funcionando mesmo se o navegador bloquear áudio automático.
  }
}
