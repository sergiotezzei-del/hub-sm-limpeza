export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event("hub-pwa-install-available"));
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    window.dispatchEvent(new Event("hub-pwa-install-changed"));
  });
}

export function canPromptPwaInstall() {
  return Boolean(deferredInstallPrompt) && !isPwaStandalone();
}

export function isPwaStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

export async function promptPwaInstall() {
  if (!deferredInstallPrompt) return false;
  const prompt = deferredInstallPrompt;
  await prompt.prompt();
  const choice = await prompt.userChoice;
  if (choice.outcome === "accepted") deferredInstallPrompt = null;
  window.dispatchEvent(new Event("hub-pwa-install-changed"));
  return choice.outcome === "accepted";
}
