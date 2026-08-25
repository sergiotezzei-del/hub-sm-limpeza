import { useEffect, useRef, useState } from "react";

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
    if (cameraOpen) {
      stopCamera();
      setCameraOpen(false);
      setCameraReady(false);
    }
    window.setTimeout(() => fileInputRef.current?.click(), 0);
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
          <div className="profile-avatar-menu-settings-label">Configurações</div>
          <div className="profile-notification-settings-slot" />
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
