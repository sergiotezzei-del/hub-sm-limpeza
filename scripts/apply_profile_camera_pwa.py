from __future__ import annotations

import base64
import json
from pathlib import Path

APP = Path("src/App.tsx")
STYLES = Path("src/styles.css")
MAIN = Path("src/main.tsx")
INDEX = Path("index.html")
MANIFEST = Path("public/manifest.webmanifest")
ICON_SVG = Path("public/icons/icon.svg")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: esperado 1 trecho, encontrado {count}")
    return text.replace(old, new, 1)


PROFILE_AVATAR_MENU = r'''import { useEffect, useRef, useState } from "react";

type ProfileAvatarMenuProps = {
  name: string;
  photoData?: string;
  large?: boolean;
  compact?: boolean;
  onPhotoChange: (file: File | null) => void | Promise<void>;
  onLogout: () => void;
};

export function ProfileAvatarMenu({ name, photoData, large = false, compact = false, onPhotoChange, onLogout }: ProfileAvatarMenuProps) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraMessage, setCameraMessage] = useState("");
  const [cameraReady, setCameraReady] = useState(false);

  useEffect(() => {
    function closeOutside(event: MouseEvent | TouchEvent) {
      const details = detailsRef.current;
      if (details?.open && event.target instanceof Node && !details.contains(event.target)) details.open = false;
    }
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("touchstart", closeOutside);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("touchstart", closeOutside);
    };
  }, []);

  useEffect(() => {
    if (!cameraOpen) return;
    let active = true;
    setCameraReady(false);
    setCameraMessage("Abrindo câmera...");

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraMessage("A câmera não está disponível neste navegador. Use Escolher foto.");
      return;
    }

    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    }).then((stream) => {
      if (!active) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraReady(true);
      setCameraMessage("Enquadre o rosto e tire a foto.");
    }).catch(() => {
      setCameraMessage("Não foi possível abrir a câmera. Verifique a permissão do navegador ou escolha uma foto.");
    });

    return () => {
      active = false;
      stopCamera();
    };
  }, [cameraOpen]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  function closeCamera() {
    stopCamera();
    setCameraOpen(false);
    setCameraReady(false);
  }

  function openCamera() {
    if (detailsRef.current) detailsRef.current.open = false;
    setCameraOpen(true);
  }

  function openFilePicker() {
    if (detailsRef.current) detailsRef.current.open = false;
    fileInputRef.current?.click();
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setCameraMessage("Aguarde a imagem da câmera aparecer.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setCameraMessage("Não foi possível capturar a imagem.");
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        setCameraMessage("Não foi possível capturar a imagem.");
        return;
      }
      const file = new File([blob], `foto-perfil-${Date.now()}.jpg`, { type: "image/jpeg" });
      void onPhotoChange(file);
      closeCamera();
    }, "image/jpeg", 0.86);
  }

  const avatarClass = ["user-avatar", "profile-avatar", large ? "large" : "", compact ? "compact" : ""].filter(Boolean).join(" ");

  return (
    <>
      <details className="profile-avatar-menu" ref={detailsRef}>
        <summary className="profile-avatar-menu-trigger" aria-label={`Abrir opções do perfil de ${name}`} title="Abrir opções do perfil">
          <span className={avatarClass}>{photoData ? <img src={photoData} alt={`Foto de ${name}`} /> : <span>{getInitials(name)}</span>}</span>
          <span className="profile-avatar-camera-badge" aria-hidden="true">⌄</span>
        </summary>
        <div className="profile-avatar-menu-popover">
          <button type="button" onClick={openCamera}>Tirar foto com a câmera</button>
          <button type="button" onClick={openFilePicker}>Escolher foto do aparelho</button>
          <button className="profile-avatar-logout" type="button" onClick={onLogout}>Sair</button>
        </div>
      </details>

      <input
        ref={fileInputRef}
        className="profile-avatar-file-input"
        type="file"
        accept="image/*"
        onChange={(event) => {
          void onPhotoChange(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />

      {cameraOpen && (
        <div className="profile-camera-backdrop" role="presentation">
          <section className="profile-camera-dialog" role="dialog" aria-modal="true" aria-label="Tirar foto de perfil">
            <div className="profile-camera-head">
              <div><strong>Tirar foto</strong><span>{name}</span></div>
              <button type="button" onClick={closeCamera} aria-label="Fechar câmera">×</button>
            </div>
            <div className="profile-camera-video-frame">
              <video ref={videoRef} autoPlay muted playsInline />
            </div>
            <p>{cameraMessage}</p>
            <div className="profile-camera-actions">
              <button className="primary-button" type="button" disabled={!cameraReady} onClick={capturePhoto}>Tirar foto</button>
              <button className="secondary-button" type="button" onClick={openFilePicker}>Escolher arquivo</button>
              <button className="ghost-button" type="button" onClick={closeCamera}>Cancelar</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}
'''

PWA_INSTALL = r'''export type BeforeInstallPromptEvent = Event & {
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
'''

HOME_MENU_META = r'''import { useEffect, useState } from "react";
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
'''

SERVICE_WORKER = r'''const CACHE_NAME = "hub-santa-maria-v1";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => cached);
      return cached || network;
    }),
  );
});
'''

ICON_SVG_CONTENT = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" role="img" aria-label="TEZZEI HUB Santa Maria">
  <rect width="192" height="192" rx="36" fill="#f97316"/>
  <rect x="24" y="24" width="144" height="144" rx="28" fill="#ffffff" opacity="0.12"/>
  <path fill="#ffffff" d="M42 48h108v28h-39v76H81V76H42V48z"/>
</svg>
'''

ICON_180 = "iVBORw0KGgoAAAANSUhEUgAAALQAAAC0CAIAAACyr5FlAAABcUlEQVR42u3dwQ2AIAxAUTHGEXBQHMNFHQFPLsARD7XvTSDNTzkRS291gZHVCBAH4kAciANxIA7EgTgQB+IAcSAOxIE4EAfiQByIA3EgDhAH4kAciANxIA7EgTgQB+IAcSAOxIE4EAfiQByIA3EgDsQB4kAciANxIA7EgTiIbgv0rft1/2Diz3nYHLhWEAfiAHEgDsSBOBAH4kAciANxIA4QB+JAHIgDcSAOxIE4EAfiQBwwUHqrSY4668FcoCdrNgfiQByIA3EgDsSBOEAciANxIA7EgTgQB+JAHIgDcYA4EAfiQByIA3EgDsSBOBAHiANxIA7EgTgQB+JAHIgDcYA4EAfiQByIA3EgDsSBOBAH4gBxIA7EwfcS/R0SmwNxIA7EgTgQB+JAHIgDxIE4EAfiQByIA3EgDsSBOEAciANxIA7EgTgQB+JAHIgDcRgB4kAciANxIA7EgTgQB+JAHCAOxIE4EAfiQByIA3EgDtJ5AdZuC+5A1YTZAAAAAElFTkSuQmCC"
ICON_192 = "iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAIAAADdvvtQAAABiklEQVR42u3byw2AIBBAQTHGEtZCsQwbtYT1ZA+Gg8BMBXxelhMlayzw1eoIEBACQkAICASEgBAQAgIBISAEhIBAQAgIASEgEBACQkAICAGBgBAQAkJAICAEhIAQEAgIASEgBAQCQkAICAEhIBAQAkJACAgEhIAQEAICASEgBISAQEA0tHW67v26B7uJ5zxMIDxhICAEhIAQEAgIASEgBAQCQkAICAGBgBAQAkJACAgEhIAQEAICASEgBMS4StaYdvMN/0d3+jHZBEJACAgBgYAQEAJCQCAgBISAEBAICAEhIAQEAkJACAgBISAQEAJCQAgIBISAEBACAgEhIASEgEBACAgBISAQEAJCQAgIAYGAEBACQkAgIASEgBAQCAgBISAEBAJCQAgIATGvkjWcAiYQAkJACAgEhIAQEAICASEgBISAQEAICAEhIBAQAkJACAgBgYAQEAJCQCAgBISAEBAICAEhIAQEAkJACAgBISAQEAJCQAgIBISAEBACAgEhIASEgEBACIhfeAGSGAwGRb/HkwAAAABJRU5ErkJggg=="
ICON_512 = "iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAIAAAB7GkOtAAAFwUlEQVR42u3XsRGAIBBFQXEcSsBCoQwapQSITA0NHW63Az7Bm0uzlgOAeE4TAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgAgAAAENBlgiByH0bgo9VuI7gAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAABAEAAABAAALaWZi1W4J9yH3s8ZLXbb+ICAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAABAAAAQAAAEAQAAAEAAABAAAAQBAAAAQAAAEAAABAEAAAATABAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAAIAAACAIAAACAAAAgAAAIAgAAAIAAACAAAAgCAAAAgAAACAIAAABDCAwNjDoYNoWzNAAAAAElFTkSuQmCC"

CSS_APPEND = r'''

/* Perfil acionado pela foto, câmera real, relógio e instalação PWA */
.profile-avatar-menu {
  position: relative;
  width: fit-content;
  z-index: 45;
}

.profile-avatar-menu > summary {
  list-style: none;
}

.profile-avatar-menu > summary::-webkit-details-marker {
  display: none;
}

.profile-avatar-menu-trigger {
  position: relative;
  display: block;
  padding: 0;
  border: 0;
  border-radius: 16px;
  background: transparent;
  cursor: pointer;
}

.profile-avatar-menu-trigger:focus-visible {
  outline: 3px solid rgba(249, 115, 22, 0.34);
  outline-offset: 4px;
}

.profile-avatar-menu-trigger .profile-avatar {
  transition: transform 160ms ease, box-shadow 160ms ease;
}

.profile-avatar-menu-trigger:hover .profile-avatar,
.profile-avatar-menu[open] .profile-avatar {
  transform: translateY(-1px);
  box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.22), var(--shadow-card);
}

.profile-avatar-camera-badge {
  position: absolute;
  right: -3px;
  bottom: -3px;
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 2px solid #ffffff;
  border-radius: 999px;
  color: #ffffff;
  background: var(--orange);
  font-size: 1rem;
  font-weight: 900;
  line-height: 1;
}

.profile-avatar-menu-popover {
  position: absolute;
  top: calc(100% + 10px);
  left: 0;
  z-index: 90;
  display: grid;
  width: min(270px, calc(100vw - 32px));
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 18px 45px rgba(31, 41, 51, 0.22);
}

.profile-avatar-menu-popover button {
  min-height: 42px;
  padding: 10px 12px;
  border: 0;
  border-radius: 8px;
  color: var(--ink);
  background: #ffffff;
  font-weight: 800;
  text-align: left;
}

.profile-avatar-menu-popover button:hover {
  background: var(--orange-soft);
}

.profile-avatar-menu-popover .profile-avatar-logout {
  color: var(--red);
  border-top: 1px solid var(--line);
  border-radius: 0 0 8px 8px;
}

.profile-avatar-file-input {
  position: fixed;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}

.profile-camera-backdrop {
  position: fixed;
  inset: 0;
  z-index: 250;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(15, 23, 42, 0.78);
}

.profile-camera-dialog {
  display: grid;
  width: min(100%, 640px);
  max-height: calc(100vh - 32px);
  gap: 12px;
  overflow: auto;
  padding: 16px;
  border-radius: 14px;
  background: #ffffff;
}

.profile-camera-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.profile-camera-head div {
  display: grid;
  gap: 2px;
}

.profile-camera-head span,
.profile-camera-dialog > p {
  margin: 0;
  color: var(--muted);
  font-size: 0.86rem;
}

.profile-camera-head > button {
  width: 42px;
  height: 42px;
  border: 0;
  border-radius: 999px;
  background: var(--neutral-soft);
  font-size: 1.4rem;
}

.profile-camera-video-frame {
  overflow: hidden;
  aspect-ratio: 4 / 3;
  border-radius: 12px;
  background: #0f172a;
}

.profile-camera-video-frame video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scaleX(-1);
}

.profile-camera-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.home-menu-meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 9px;
  min-height: 24px;
  margin: -6px 2px 12px;
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 750;
  text-transform: capitalize;
}

.home-menu-meta button {
  min-height: 28px;
  padding: 5px 9px;
  border: 1px solid #fed7aa;
  border-radius: 999px;
  color: var(--orange-dark);
  background: var(--orange-soft);
  font-size: 0.7rem;
  font-weight: 900;
}

.guard-profile-shortcut,
.profile-photo-action {
  display: none !important;
}

@media (max-width: 720px) {
  .profile-avatar-menu-popover {
    left: 50%;
    transform: translateX(-18%);
  }

  .profile-camera-actions {
    grid-template-columns: 1fr;
  }

  .home-menu-meta {
    justify-content: center;
    margin-top: 0;
  }
}
'''


def main() -> None:
    app = APP.read_text(encoding="utf-8")
    styles = STYLES.read_text(encoding="utf-8")
    main_tsx = MAIN.read_text(encoding="utf-8")
    index = INDEX.read_text(encoding="utf-8")

    app = replace_once(
        app,
        'import { AppIcon, type AppIconName } from "./components/AppIcon";\n',
        'import { AppIcon, type AppIconName } from "./components/AppIcon";\nimport { HomeMenuMeta } from "./components/HomeMenuMeta";\nimport { ProfileAvatarMenu } from "./components/ProfileAvatarMenu";\n',
        "imports dos componentes",
    )

    app = replace_once(
        app,
        '''      {view === "guard" && currentUser && isGuardId(currentUser) && (\n        <>\n          <GuardUserScreen guardLocalId={currentUser} guardName={guardUserMap[currentUser]} permissions={getManagedUserPermissions(currentUser, managedUsers)} onOpenParking={openSecurityParking} onLogout={goToLogin} />\n          {currentManagedUser && (\n            <aside className="guard-profile-shortcut" aria-label="Foto de perfil">\n              <ProfileAvatar name={currentManagedUser.name} photoData={currentManagedUser.photoData} />\n              <ProfilePhotoAction onFileChange={handleCurrentUserPhoto} compact />\n            </aside>\n          )}\n        </>\n      )}\n''',
        '''      {view === "guard" && currentUser && isGuardId(currentUser) && (\n        <GuardUserScreen\n          guardLocalId={currentUser}\n          guardName={guardUserMap[currentUser]}\n          permissions={getManagedUserPermissions(currentUser, managedUsers)}\n          photoData={currentManagedUser?.photoData}\n          onProfilePhotoChange={handleCurrentUserPhoto}\n          onOpenParking={openSecurityParking}\n          onLogout={goToLogin}\n        />\n      )}\n''',
        "menu do guarda",
    )

    app = replace_once(
        app,
        '''      <EmployeeHeader employeeId={employeeId} profile={profile} adminPreview={adminPreview} onLogout={onLogout} onBackToProfiles={onBackToProfiles} onProfilePhotoChange={onProfilePhotoChange} />\n      {notice && <p className="success-message">{notice}</p>}\n''',
        '''      <EmployeeHeader employeeId={employeeId} profile={profile} adminPreview={adminPreview} onLogout={onLogout} onBackToProfiles={onBackToProfiles} onProfilePhotoChange={onProfilePhotoChange} />\n      <HomeMenuMeta />\n      {notice && <p className="success-message">{notice}</p>}\n''',
        "data e hora da limpeza",
    )

    old_employee_header = '''function EmployeeHeader({ employeeId, profile, adminPreview, onLogout, onBackToProfiles, onProfilePhotoChange }: { employeeId: EmployeeId; profile: EmployeeProfile; adminPreview: boolean; onLogout: () => void; onBackToProfiles: () => void; onProfilePhotoChange: (employeeId: EmployeeId, file: File | null) => void }) {\n  const employee = employees[employeeId];\n  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {\n    onProfilePhotoChange(employeeId, event.target.files?.[0] ?? null);\n    event.target.value = "";\n  }\n  return (\n    <ProfileHero\n      name={employee.name}\n      role="Limpeza"\n      department="Limpeza"\n      subtitle={adminPreview ? "Visualização pelo Painel Tezzei" : employee.schedule}\n      photoData={profile?.photoData}\n      actions={(\n        <>\n          {adminPreview && <button className="ghost-button" type="button" onClick={onBackToProfiles}>Voltar</button>}\n          <ProfilePhotoAction onFileChange={(file) => onProfilePhotoChange(employeeId, file)} />\n          <button className="logout-button" type="button" onClick={onLogout}>Sair</button>\n        </>\n      )}\n    />\n  );\n}\n'''
    new_employee_header = '''function EmployeeHeader({ employeeId, profile, adminPreview, onLogout, onBackToProfiles, onProfilePhotoChange }: { employeeId: EmployeeId; profile: EmployeeProfile; adminPreview: boolean; onLogout: () => void; onBackToProfiles: () => void; onProfilePhotoChange: (employeeId: EmployeeId, file: File | null) => void }) {\n  const employee = employees[employeeId];\n  return (\n    <ProfileHero\n      name={employee.name}\n      role="Limpeza"\n      department="Limpeza"\n      subtitle={adminPreview ? "Visualização pelo Painel Tezzei" : employee.schedule}\n      photoData={profile?.photoData}\n      onProfilePhotoChange={(file) => onProfilePhotoChange(employeeId, file)}\n      onLogout={onLogout}\n      actions={adminPreview ? <button className="ghost-button" type="button" onClick={onBackToProfiles}>Voltar</button> : undefined}\n    />\n  );\n}\n'''
    app = replace_once(app, old_employee_header, new_employee_header, "cabeçalho da limpeza")

    old_photo_action = '''function ProfilePhotoAction({ onFileChange, compact = false }: { onFileChange: (file: File | null) => void | Promise<void>; compact?: boolean }) {\n  return (\n    <label className={compact ? "photo-button profile-photo-action compact" : "photo-button profile-photo-action"}>\n      <AppIcon name="camera" size="sm" className="action-icon" />\n      <span>{compact ? "Foto" : "Cadastrar / alterar foto"}</span>\n      <input type="file" accept="image/*" capture="environment" onChange={(event) => { void onFileChange(event.target.files?.[0] ?? null); event.target.value = ""; }} />\n    </label>\n  );\n}\n\n'''
    app = replace_once(app, old_photo_action, "", "remoção do botão de foto")

    old_profile_hero = '''function ProfileHero({ name, role, department, subtitle, photoData, actions }: { name: string; role: string; department: string; subtitle?: string; photoData?: string; actions?: ReactNode }) {\n  return (\n    <header className="profile-hero">\n      <ProfileAvatar name={name} photoData={photoData} large />\n      <div className="profile-hero-copy">\n        <p className="eyebrow">{department}</p>\n        <h1>{name}</h1>\n        <p>{role}{subtitle ? ` — ${subtitle}` : ""}</p>\n      </div>\n      {actions && <div className="profile-actions">{actions}</div>}\n    </header>\n  );\n}\n'''
    new_profile_hero = '''function ProfileHero({ name, role, department, subtitle, photoData, actions, onProfilePhotoChange, onLogout }: { name: string; role: string; department: string; subtitle?: string; photoData?: string; actions?: ReactNode; onProfilePhotoChange?: (file: File | null) => void | Promise<void>; onLogout?: () => void }) {\n  const interactiveAvatar = onProfilePhotoChange && onLogout;\n  return (\n    <header className="profile-hero">\n      {interactiveAvatar ? (\n        <ProfileAvatarMenu name={name} photoData={photoData} large onPhotoChange={onProfilePhotoChange} onLogout={onLogout} />\n      ) : (\n        <ProfileAvatar name={name} photoData={photoData} large />\n      )}\n      <div className="profile-hero-copy">\n        <p className="eyebrow">{department}</p>\n        <h1>{name}</h1>\n        <p>{role}{subtitle ? ` — ${subtitle}` : ""}</p>\n      </div>\n      {actions && <div className="profile-actions">{actions}</div>}\n    </header>\n  );\n}\n'''
    app = replace_once(app, old_profile_hero, new_profile_hero, "perfil interativo")

    old_user_hero = '''      <ProfileHero\n        name={user.name}\n        role={user.jobTitle}\n        department={user.department}\n        photoData={user.photoData}\n        subtitle={user.userType}\n        actions={<><ProfilePhotoAction onFileChange={onProfilePhotoChange} /><button className="logout-button" type="button" onClick={onLogout}>Sair</button></>}\n      />\n      {notice && <p className="notice-message">{notice}</p>}\n'''
    new_user_hero = '''      <ProfileHero\n        name={user.name}\n        role={user.jobTitle}\n        department={user.department}\n        photoData={user.photoData}\n        subtitle={user.userType}\n        onProfilePhotoChange={onProfilePhotoChange}\n        onLogout={onLogout}\n      />\n      <HomeMenuMeta />\n      {notice && <p className="notice-message">{notice}</p>}\n'''
    app = replace_once(app, old_user_hero, new_user_hero, "menu inicial do usuário")

    old_admin_hero = '''      <ProfileHero\n        name={user.name}\n        role={user.jobTitle}\n        department={user.department}\n        photoData={user.photoData}\n        subtitle={onlineEnabled ? "Central Operacional HUB SM — online" : "Central Operacional HUB SM — local"}\n        actions={<><ProfilePhotoAction onFileChange={onProfilePhotoChange} /><button className="logout-button" type="button" onClick={onLogout}>Sair</button></>}\n      />\n      {notice && <p className="notice-message">{notice}</p>}\n'''
    new_admin_hero = '''      <ProfileHero\n        name={user.name}\n        role={user.jobTitle}\n        department={user.department}\n        photoData={user.photoData}\n        subtitle={onlineEnabled ? "Central Operacional HUB SM — online" : "Central Operacional HUB SM — local"}\n        onProfilePhotoChange={onProfilePhotoChange}\n        onLogout={onLogout}\n      />\n      <HomeMenuMeta />\n      {notice && <p className="notice-message">{notice}</p>}\n'''
    app = replace_once(app, old_admin_hero, new_admin_hero, "menu inicial do admin")

    old_guard = '''function GuardUserScreen({ guardLocalId, guardName, permissions, onOpenParking, onLogout }: { guardLocalId: GuardId; guardName: GuardName; permissions: UserPermission[]; onOpenParking: () => void; onLogout: () => void }) {\n  const summary = getGuardSummaryShift(guardName);\n  const upcomingShifts = getUpcomingGuardShifts(guardName);\n  const todayShift = getGuardTodayShift(guardName);\n  const nextShift = getNextGuardFutureShift(guardName);\n  const canParkingSearch = permissions.includes("estacionamento-consulta") || permissions.includes("estacionamento-cadastro") || permissions.includes("painel-admin");\n\n  return <section className="screen"><ProfileHero name={guardName} role="Guarda Santa Maria" department="Segurança" subtitle="Escala de horário" actions={<button className="logout-button" type="button" onClick={onLogout}>Sair</button>} /><GuardShiftPanel guardLocalId={guardLocalId} guardName={guardName} todayShift={todayShift} nextShift={nextShift} canManage /><section className="admin-grid security-grid guard-access-grid" aria-label="Acessos do guarda"><ModuleCard title="Rondas / QR Code" detail="Registrar pontos durante o serviço ativo" enabled className="security-card" icon="qr" />{canParkingSearch && <ModuleCard title="Estacionamento" detail="Pesquisar veículo no pátio" enabled onClick={onOpenParking} className="security-card" icon="parking" />}</section><section className="shift-section">{summary ? <ShiftCard shift={summary.shift} label={summary.label} featured /> : <article className="shift-card featured"><span>ESCALA</span><strong>Sem próximo plantão lançado</strong><p>Atualize a escala do mês.</p></article>}<h2>Próximos plantões</h2><div className="shift-list">{upcomingShifts.length > 0 ? upcomingShifts.map((shift) => <ShiftCard key={`${shift.startDate}-${shift.startTime}-${shift.endDate}-${shift.endTime}`} shift={shift} />) : <article className="shift-card"><strong>Sem próximos plantões</strong><p>Atualize a escala do mês.</p></article>}</div></section></section>;\n}\n'''
    new_guard = '''function GuardUserScreen({ guardLocalId, guardName, permissions, photoData, onProfilePhotoChange, onOpenParking, onLogout }: { guardLocalId: GuardId; guardName: GuardName; permissions: UserPermission[]; photoData?: string; onProfilePhotoChange: (file: File | null) => void | Promise<void>; onOpenParking: () => void; onLogout: () => void }) {\n  const summary = getGuardSummaryShift(guardName);\n  const upcomingShifts = getUpcomingGuardShifts(guardName);\n  const todayShift = getGuardTodayShift(guardName);\n  const nextShift = getNextGuardFutureShift(guardName);\n  const canParkingSearch = permissions.includes("estacionamento-consulta") || permissions.includes("estacionamento-cadastro") || permissions.includes("painel-admin");\n\n  return (\n    <section className="screen">\n      <ProfileHero name={guardName} role="Guarda Santa Maria" department="Segurança" subtitle="Escala de horário" photoData={photoData} onProfilePhotoChange={onProfilePhotoChange} onLogout={onLogout} />\n      <HomeMenuMeta />\n      <GuardShiftPanel guardLocalId={guardLocalId} guardName={guardName} todayShift={todayShift} nextShift={nextShift} canManage />\n      <section className="admin-grid security-grid guard-access-grid" aria-label="Acessos do guarda">\n        <ModuleCard title="Rondas / QR Code" detail="Registrar pontos durante o serviço ativo" enabled className="security-card" icon="qr" />\n        {canParkingSearch && <ModuleCard title="Estacionamento" detail="Pesquisar veículo no pátio" enabled onClick={onOpenParking} className="security-card" icon="parking" />}\n      </section>\n      <section className="shift-section">\n        {summary ? <ShiftCard shift={summary.shift} label={summary.label} featured /> : <article className="shift-card featured"><span>ESCALA</span><strong>Sem próximo plantão lançado</strong><p>Atualize a escala do mês.</p></article>}\n        <h2>Próximos plantões</h2>\n        <div className="shift-list">{upcomingShifts.length > 0 ? upcomingShifts.map((shift) => <ShiftCard key={`${shift.startDate}-${shift.startTime}-${shift.endDate}-${shift.endTime}`} shift={shift} />) : <article className="shift-card"><strong>Sem próximos plantões</strong><p>Atualize a escala do mês.</p></article>}</div>\n      </section>\n    </section>\n  );\n}\n'''
    app = replace_once(app, old_guard, new_guard, "menu inicial do guarda")

    old_sw_cleanup = '''if ("serviceWorker" in navigator) {\n  window.addEventListener("load", () => {\n    navigator.serviceWorker.getRegistrations()\n      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))\n      .catch((error) => {\n        console.error("Erro ao remover service worker:", error);\n      });\n  });\n}\n\nif ("caches" in window) {\n  window.addEventListener("load", () => {\n    caches.keys()\n      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))\n      .catch((error) => {\n        console.error("Erro ao limpar cache do app:", error);\n      });\n  });\n}\n'''
    new_sw_registration = '''if ("serviceWorker" in navigator) {\n  window.addEventListener("load", () => {\n    navigator.serviceWorker.register("/sw.js")\n      .catch((error) => {\n        console.error("Erro ao registrar service worker:", error);\n      });\n  });\n}\n'''
    main_tsx = replace_once(main_tsx, old_sw_cleanup, new_sw_registration, "registro do service worker")

    index = replace_once(
        index,
        '    <meta name="apple-mobile-web-app-capable" content="yes" />\n',
        '    <meta name="apple-mobile-web-app-capable" content="yes" />\n    <meta name="apple-mobile-web-app-status-bar-style" content="default" />\n',
        "status bar do PWA",
    )
    index = replace_once(
        index,
        '    <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />\n    <link rel="apple-touch-icon" href="/icons/icon.svg" />\n',
        '    <link rel="icon" href="/icons/icon-192.png" type="image/png" />\n    <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />\n',
        "ícones do HTML",
    )

    if "/* Perfil acionado pela foto, câmera real, relógio e instalação PWA */" in styles:
        raise RuntimeError("CSS novo já existe")
    styles += CSS_APPEND

    APP.write_text(app, encoding="utf-8")
    STYLES.write_text(styles, encoding="utf-8")
    MAIN.write_text(main_tsx, encoding="utf-8")
    INDEX.write_text(index, encoding="utf-8")
    Path("src/components/ProfileAvatarMenu.tsx").write_text(PROFILE_AVATAR_MENU, encoding="utf-8")
    Path("src/components/HomeMenuMeta.tsx").write_text(HOME_MENU_META, encoding="utf-8")
    Path("src/pwaInstall.ts").write_text(PWA_INSTALL, encoding="utf-8")
    Path("public/sw.js").write_text(SERVICE_WORKER, encoding="utf-8")
    ICON_SVG.write_text(ICON_SVG_CONTENT, encoding="utf-8")

    manifest = {
        "id": "/",
        "name": "HUB Santa Maria",
        "short_name": "HUB SM",
        "description": "Central Operacional HUB Santa Maria",
        "start_url": "/",
        "scope": "/",
        "display": "standalone",
        "display_override": ["standalone", "minimal-ui"],
        "orientation": "any",
        "background_color": "#fff7ed",
        "theme_color": "#f97316",
        "categories": ["business", "productivity"],
        "prefer_related_applications": False,
        "icons": [
            {"src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
            {"src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
            {"src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ],
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    icons = Path("public/icons")
    icons.mkdir(parents=True, exist_ok=True)
    (icons / "apple-touch-icon.png").write_bytes(base64.b64decode(ICON_180))
    (icons / "icon-192.png").write_bytes(base64.b64decode(ICON_192))
    (icons / "icon-512.png").write_bytes(base64.b64decode(ICON_512))

    for path, expected in ((icons / "apple-touch-icon.png", 180), (icons / "icon-192.png", 192), (icons / "icon-512.png", 512)):
        data = path.read_bytes()
        if data[:8] != b"\x89PNG\r\n\x1a\n":
            raise RuntimeError(f"PNG inválido: {path}")
        width = int.from_bytes(data[16:20], "big")
        height = int.from_bytes(data[20:24], "big")
        if width != expected or height != expected:
            raise RuntimeError(f"Dimensão incorreta em {path}: {width}x{height}")

    parsed_manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if parsed_manifest.get("id") != "/" or len(parsed_manifest.get("icons", [])) < 2:
        raise RuntimeError("Manifesto PWA incompleto")


if __name__ == "__main__":
    main()
