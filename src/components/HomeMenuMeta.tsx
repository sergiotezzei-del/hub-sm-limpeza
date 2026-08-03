import { useEffect, useState } from "react";
import { canPromptPwaInstall, isPwaStandalone, promptPwaInstall } from "../pwaInstall";

export function HomeMenuMeta() {
  const [now, setNow] = useState(() => new Date());
  const [installAvailable, setInstallAvailable] = useState(() => canPromptPwaInstall());

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 30000);
    const refreshInstall = () => setInstallAvailable(canPromptPwaInstall());
    window.addEventListener("hub-pwa-install-available", refreshInstall);
    window.addEventListener("hub-pwa-install-changed", refreshInstall);
    return () => {
      window.clearInterval(clock);
      window.removeEventListener("hub-pwa-install-available", refreshInstall);
      window.removeEventListener("hub-pwa-install-changed", refreshInstall);
    };
  }, []);

  const date = now.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="home-menu-meta" aria-label="Data e hora atuais">
      <span>{date.replace(".", "")} • {time}</span>
      {installAvailable && !isPwaStandalone() && (
        <button type="button" onClick={() => { void promptPwaInstall(); }}>Instalar aplicativo</button>
      )}
    </div>
  );
}
