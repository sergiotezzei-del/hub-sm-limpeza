import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { authenticatedSupabaseFetch, SUPABASE_URL } from "../security/services/supabaseClient";
import { RadioTestPage } from "./RadioTestPage";

const HUB_SESSION_KEY = "hub-sm-active-session";

type MiniPlayerState = {
  title: string | null;
  artist: string | null;
  player_status: string | null;
  volume: number | null;
  mute: boolean;
  updated_at: string;
};

type MiniPlayerCommand = "pause" | "resume" | "next" | "mute" | "unmute";

export function RadioHomeEnhancer() {
  const [managementGrid, setManagementGrid] = useState<HTMLElement | null>(null);
  const [profileSide, setProfileSide] = useState<HTMLElement | null>(null);
  const [miniPlayer, setMiniPlayer] = useState<MiniPlayerState | null>(null);
  const [controlBusy, setControlBusy] = useState<MiniPlayerCommand | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sync = () => {
      if (!isTezzeiAdminSession()) {
        setManagementGrid(null);
        setProfileSide(null);
        return;
      }

      const sections = Array.from(document.querySelectorAll<HTMLElement>(".hub-home-section"));
      const managementSection = sections.find((section) => section.querySelector("h2")?.textContent?.trim() === "Gestão");
      const homeScreen = managementSection?.closest<HTMLElement>(".screen") ?? null;
      const nextGrid = managementSection?.querySelector<HTMLElement>(".module-grid") ?? null;
      const nextProfileSide = homeScreen?.querySelector<HTMLElement>(".profile-hero-side") ?? null;

      setManagementGrid((current) => current === nextGrid ? current : nextGrid);
      setProfileSide((current) => current === nextProfileSide ? current : nextProfileSide);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("focus", sync);

    return () => {
      observer.disconnect();
      window.removeEventListener("focus", sync);
    };
  }, []);

  useEffect(() => {
    if (!profileSide) return;
    profileSide.classList.add("radio-mini-active");
    return () => profileSide.classList.remove("radio-mini-active");
  }, [profileSide]);

  useEffect(() => {
    if (!managementGrid) {
      setMiniPlayer(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const response = await authenticatedSupabaseFetch(
          `${SUPABASE_URL}/rest/v1/radio_player_state?select=title,artist,player_status,volume,mute,updated_at&id=eq.main&limit=1`,
          { headers: { Accept: "application/json" } },
        );
        if (!response.ok) return;
        const rows = (await response.json()) as MiniPlayerState[];
        if (!cancelled) setMiniPlayer(rows[0] ?? null);
      } catch {
        if (!cancelled) setMiniPlayer(null);
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [managementGrid]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const playerOnline = useMemo(() => {
    if (!miniPlayer?.updated_at) return false;
    return Date.now() - new Date(miniPlayer.updated_at).getTime() < 12000;
  }, [miniPlayer]);

  const isPlaying = miniPlayer?.player_status === "play";

  const sendMiniCommand = async (command: MiniPlayerCommand) => {
    if (!playerOnline || controlBusy) return;
    setControlBusy(command);

    try {
      const response = await authenticatedSupabaseFetch(`${SUPABASE_URL}/rest/v1/radio_player_commands`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ command, value: null }),
      });

      if (!response.ok) return;

      if (command === "pause") {
        setMiniPlayer((current) => current ? { ...current, player_status: "pause" } : current);
      } else if (command === "resume") {
        setMiniPlayer((current) => current ? { ...current, player_status: "play" } : current);
      } else if (command === "mute") {
        setMiniPlayer((current) => current ? { ...current, mute: true } : current);
      } else if (command === "unmute") {
        setMiniPlayer((current) => current ? { ...current, mute: false } : current);
      }
    } catch {
      // A atualização automática do player confirma o estado real em seguida.
    } finally {
      window.setTimeout(() => setControlBusy(null), 550);
    }
  };

  return (
    <>
      <style>{radioMiniCss}</style>

      {profileSide ? createPortal(
        <div className="radio-mini-card" aria-label="Controle rápido da Rádio Santa Maria">
          <button
            className="radio-mini-main"
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir Rádio Santa Maria"
            title="Abrir Rádio Santa Maria"
          >
            <span className="radio-mini-icon" aria-hidden="true">♫</span>
            <span className="radio-mini-copy">
              <span className="radio-mini-topline">
                <span className={playerOnline ? "radio-mini-dot is-online" : "radio-mini-dot"} />
                <strong>Rádio Santa Maria</strong>
              </span>
              <span className="radio-mini-track">
                {playerOnline ? (miniPlayer?.title || "Som ambiente") : "Ponte offline"}
              </span>
              <span className="radio-mini-artist">
                {playerOnline ? (miniPlayer?.artist || (isPlaying ? "Tocando" : "Pausado")) : "Clique para abrir"}
              </span>
            </span>
          </button>

          <div className="radio-mini-controls" aria-label="Controles rápidos da rádio">
            <button
              type="button"
              className="radio-mini-control"
              disabled={!playerOnline || Boolean(controlBusy)}
              onClick={() => void sendMiniCommand(isPlaying ? "pause" : "resume")}
              aria-label={isPlaying ? "Pausar música" : "Tocar música"}
              title={isPlaying ? "Pausar" : "Tocar"}
            >
              {isPlaying ? "Ⅱ" : "▶"}
            </button>
            <button
              type="button"
              className="radio-mini-control"
              disabled={!playerOnline || Boolean(controlBusy)}
              onClick={() => void sendMiniCommand("next")}
              aria-label="Próxima música"
              title="Próxima"
            >
              ▶|
            </button>
            <button
              type="button"
              className="radio-mini-control radio-mini-volume"
              disabled={!playerOnline || Boolean(controlBusy)}
              onClick={() => void sendMiniCommand(miniPlayer?.mute ? "unmute" : "mute")}
              aria-label={miniPlayer?.mute ? "Ativar volume" : "Silenciar volume"}
              title={miniPlayer?.mute ? "Ativar som" : `Volume ${miniPlayer?.volume ?? 0}%`}
            >
              <span aria-hidden="true">{miniPlayer?.mute ? "×" : "♪"}</span>
              <small>{miniPlayer?.mute ? "0" : miniPlayer?.volume ?? 0}</small>
            </button>
          </div>
        </div>,
        profileSide,
      ) : null}

      {managementGrid ? createPortal(
        <button
          className="admin-card module-card with-icon has-access action-card"
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir Rádio Santa Maria"
        >
          <span className="module-icon-circle" aria-hidden="true" style={{ fontSize: 24, fontWeight: 800 }}>♫</span>
          <span className="module-card-copy">
            <span className="module-card-title">Rádio Santa Maria</span>
            <strong>Música ambiente, controles, comunicados e programação.</strong>
          </span>
        </button>,
        managementGrid,
      ) : null}

      {open ? createPortal(
        <div style={overlayStyle} role="dialog" aria-modal="true" aria-label="Rádio Santa Maria">
          <button type="button" onClick={() => setOpen(false)} style={backButtonStyle}>← Voltar ao HUB</button>
          <div style={contentStyle}>
            <RadioTestPage />
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

function isTezzeiAdminSession() {
  try {
    const raw = window.sessionStorage.getItem(HUB_SESSION_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { currentUser?: unknown };
    return parsed.currentUser === "tezzei";
  } catch {
    return false;
  }
}

const radioMiniCss = `
.profile-hero-side.radio-mini-active {
  flex-direction: row;
  align-items: center;
  flex-wrap: nowrap;
  gap: 10px;
}

.profile-hero-side.radio-mini-active .panel-corner-brand {
  order: 2;
  flex: 0 0 auto;
}

.radio-mini-card {
  order: 1;
  width: 184px;
  height: 82px;
  flex: 0 0 184px;
  display: grid;
  grid-template-rows: 1fr 25px;
  gap: 3px;
  padding: 7px 8px 6px;
  color: #1f2933;
  background: #ffffff;
  border: 1px solid #d8dee8;
  border-left: 4px solid #f97316;
  border-radius: 8px;
  box-shadow: 0 5px 14px rgba(31, 41, 51, 0.06);
  overflow: hidden;
}

.radio-mini-main {
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0;
  color: inherit;
  text-align: left;
  background: transparent;
  border: 0;
}

.radio-mini-main:hover .radio-mini-track {
  color: #c2410c;
}

.radio-mini-icon {
  width: 29px;
  height: 29px;
  flex: 0 0 29px;
  display: grid;
  place-items: center;
  color: #c2410c;
  background: #fff1e6;
  border: 1px solid #fed7aa;
  border-radius: 7px;
  font-size: 16px;
  font-weight: 900;
}

.radio-mini-copy {
  min-width: 0;
  display: grid;
  gap: 1px;
}

.radio-mini-topline {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 9px;
  line-height: 1.1;
}

.radio-mini-topline strong,
.radio-mini-track,
.radio-mini-artist {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.radio-mini-dot {
  width: 6px;
  height: 6px;
  flex: 0 0 6px;
  border-radius: 999px;
  background: #ef4444;
}

.radio-mini-dot.is-online {
  background: #22c55e;
}

.radio-mini-track {
  color: #111827;
  font-size: 11px;
  line-height: 1.15;
  font-weight: 900;
}

.radio-mini-artist {
  color: #667085;
  font-size: 9px;
  line-height: 1.1;
  font-weight: 700;
}

.radio-mini-controls {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  padding-top: 3px;
  border-top: 1px solid #edf0f4;
}

.radio-mini-control {
  width: 23px;
  height: 22px;
  min-width: 23px;
  min-height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 1px;
  padding: 0;
  color: #334155;
  background: #f8fafc;
  border: 1px solid #d8dee8;
  border-radius: 6px;
  font-size: 9px;
  line-height: 1;
  font-weight: 900;
}

.radio-mini-control:hover:not(:disabled) {
  color: #c2410c;
  background: #fff7ed;
  border-color: #fdba74;
}

.radio-mini-control:disabled {
  opacity: 0.45;
}

.radio-mini-volume {
  width: 39px;
  min-width: 39px;
}

.radio-mini-volume small {
  font-size: 7px;
  font-weight: 900;
}

@media (max-width: 720px) {
  .profile-hero-side.radio-mini-active {
    flex-direction: column;
    align-items: flex-end;
  }

  .radio-mini-card {
    width: 152px;
    height: 78px;
    flex-basis: 152px;
  }
}
`;

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 10000,
  overflow: "auto",
  background: "#f3f4f6",
};

const backButtonStyle: React.CSSProperties = {
  position: "fixed",
  top: 16,
  left: 16,
  zIndex: 10001,
  border: "1px solid #d1d5db",
  borderRadius: 10,
  background: "#ffffff",
  color: "#111827",
  padding: "9px 13px",
  fontWeight: 800,
  cursor: "pointer",
  boxShadow: "0 6px 18px rgba(15, 23, 42, 0.10)",
};

const contentStyle: React.CSSProperties = {
  minHeight: "100vh",
};
