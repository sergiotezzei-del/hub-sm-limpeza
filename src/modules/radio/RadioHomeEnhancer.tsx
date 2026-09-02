import { useEffect, useMemo, useRef, useState } from "react";
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

type RadioRuntimeState = {
  id: "main";
  operating_mode: "automation" | "temporary";
  temporary_started_at: string | null;
  temporary_started_by: string | null;
  resume_on_exit: boolean;
  saved_player_status: string | null;
  saved_title: string | null;
  saved_artist: string | null;
  saved_album: string | null;
  saved_mode: number | null;
  saved_current_ms: number | null;
  saved_total_ms: number | null;
  updated_at: string;
};

type MiniPlayerCommand = "pause" | "resume" | "next" | "volume" | "mute" | "unmute";

export function RadioHomeEnhancer() {
  const [managementGrid, setManagementGrid] = useState<HTMLElement | null>(null);
  const [profileSide, setProfileSide] = useState<HTMLElement | null>(null);
  const [miniPlayer, setMiniPlayer] = useState<MiniPlayerState | null>(null);
  const [runtimeState, setRuntimeState] = useState<RadioRuntimeState | null>(null);
  const [controlBusy, setControlBusy] = useState<MiniPlayerCommand | null>(null);
  const [modeBusy, setModeBusy] = useState(false);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [volumeDraft, setVolumeDraft] = useState(0);
  const [open, setOpen] = useState(false);
  const volumeMenuRef = useRef<HTMLDivElement | null>(null);

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
      setRuntimeState(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const [playerResponse, runtimeResponse] = await Promise.all([
          authenticatedSupabaseFetch(
            `${SUPABASE_URL}/rest/v1/radio_player_state?select=title,artist,player_status,volume,mute,updated_at&id=eq.main&limit=1`,
            { headers: { Accept: "application/json" } },
          ),
          authenticatedSupabaseFetch(
            `${SUPABASE_URL}/rest/v1/radio_runtime_state?select=id,operating_mode,temporary_started_at,temporary_started_by,resume_on_exit,saved_player_status,saved_title,saved_artist,saved_album,saved_mode,saved_current_ms,saved_total_ms,updated_at&id=eq.main&limit=1`,
            { headers: { Accept: "application/json" } },
          ),
        ]);

        if (playerResponse.ok) {
          const rows = (await playerResponse.json()) as MiniPlayerState[];
          if (!cancelled) setMiniPlayer(rows[0] ?? null);
        }

        if (runtimeResponse.ok) {
          const rows = (await runtimeResponse.json()) as RadioRuntimeState[];
          if (!cancelled) setRuntimeState(rows[0] ?? null);
        }
      } catch {
        if (!cancelled) {
          setMiniPlayer(null);
          setRuntimeState(null);
        }
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
    if (miniPlayer?.volume !== null && miniPlayer?.volume !== undefined && !volumeOpen) {
      setVolumeDraft(miniPlayer.volume);
    }
  }, [miniPlayer?.volume, volumeOpen]);

  useEffect(() => {
    if (!volumeOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!volumeMenuRef.current?.contains(event.target as Node)) {
        setVolumeOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [volumeOpen]);

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
  const temporaryActive = runtimeState?.operating_mode === "temporary";

  const sendMiniCommand = async (command: MiniPlayerCommand, value: number | null = null) => {
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
        body: JSON.stringify({ command, value: command === "volume" ? Math.round(value ?? volumeDraft) : null }),
      });

      if (!response.ok) return;

      if (command === "pause") {
        setMiniPlayer((current) => current ? { ...current, player_status: "pause" } : current);
      } else if (command === "resume") {
        setMiniPlayer((current) => current ? { ...current, player_status: "play" } : current);
      } else if (command === "volume") {
        setMiniPlayer((current) => current ? { ...current, volume: Math.round(value ?? volumeDraft) } : current);
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

  const toggleTemporaryMode = async () => {
    if (!playerOnline || modeBusy) return;
    setModeBusy(true);
    setVolumeOpen(false);

    try {
      const rpcName = temporaryActive ? "radio_finish_temporary_mode" : "radio_start_temporary_mode";
      const response = await authenticatedSupabaseFetch(`${SUPABASE_URL}/rest/v1/rpc/${rpcName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: "{}",
      });

      if (!response.ok) return;

      const payload = await response.json() as RadioRuntimeState | RadioRuntimeState[];
      const nextState = Array.isArray(payload) ? payload[0] : payload;
      if (nextState) setRuntimeState(nextState);

      if (!temporaryActive && isPlaying) {
        setMiniPlayer((current) => current ? { ...current, player_status: "pause" } : current);
      } else if (temporaryActive && runtimeState?.resume_on_exit) {
        setMiniPlayer((current) => current ? { ...current, player_status: "play" } : current);
      }
    } catch {
      // O polling confirma o estado real e evita travar o mini player em caso de falha transitória.
    } finally {
      window.setTimeout(() => setModeBusy(false), 700);
    }
  };

  const commitVolume = () => {
    void sendMiniCommand("volume", volumeDraft);
  };

  return (
    <>
      <style>{radioMiniCss}</style>

      {profileSide ? createPortal(
        <div className={temporaryActive ? "radio-mini-card is-temporary" : "radio-mini-card"} aria-label="Controle rápido da Rádio Santa Maria">
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
                {temporaryActive ? "Modo temporário ativo" : playerOnline ? (miniPlayer?.title || "Som ambiente") : "Ponte offline"}
              </span>
              <span className="radio-mini-artist">
                {temporaryActive
                  ? (miniPlayer?.title || "Programação normal pausada")
                  : playerOnline
                    ? (miniPlayer?.artist || (isPlaying ? "Tocando" : "Pausado"))
                    : "Clique para abrir"}
              </span>
            </span>
          </button>

          <div className="radio-mini-controls" aria-label="Controles rápidos da rádio">
            <button
              type="button"
              className={temporaryActive ? "radio-mini-control radio-mini-mode is-active" : "radio-mini-control radio-mini-mode"}
              disabled={!playerOnline || modeBusy || Boolean(controlBusy)}
              onClick={() => void toggleTemporaryMode()}
              aria-label={temporaryActive ? "Voltar à programação normal" : "Ativar modo temporário"}
              title={temporaryActive ? "Voltar à programação" : "Assumir rádio temporariamente"}
            >
              {modeBusy ? "..." : temporaryActive ? "VOLTAR" : "TEMP"}
            </button>
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

            <div className="radio-mini-volume-wrap" ref={volumeMenuRef}>
              <button
                type="button"
                className={volumeOpen ? "radio-mini-control radio-mini-volume is-open" : "radio-mini-control radio-mini-volume"}
                disabled={!playerOnline}
                onClick={() => setVolumeOpen((current) => !current)}
                aria-label="Abrir controle de volume"
                aria-expanded={volumeOpen}
                title={`Volume ${miniPlayer?.mute ? 0 : miniPlayer?.volume ?? 0}%`}
              >
                <span aria-hidden="true">{miniPlayer?.mute ? "🔇" : "🔊"}</span>
                <small>{miniPlayer?.mute ? "0" : miniPlayer?.volume ?? 0}</small>
              </button>

              {volumeOpen ? (
                <div className="radio-mini-volume-popover" role="dialog" aria-label="Ajustar volume da Rádio Santa Maria">
                  <div className="radio-mini-volume-head">
                    <strong>Volume</strong>
                    <span>{volumeDraft}%</span>
                  </div>
                  <input
                    className="radio-mini-volume-slider"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={volumeDraft}
                    disabled={!playerOnline || controlBusy === "volume"}
                    aria-label="Nível do volume"
                    onChange={(event) => setVolumeDraft(Number(event.target.value))}
                    onPointerUp={commitVolume}
                    onKeyUp={commitVolume}
                    onBlur={commitVolume}
                  />
                  <button
                    type="button"
                    className={miniPlayer?.mute ? "radio-mini-mute-button is-muted" : "radio-mini-mute-button"}
                    disabled={!playerOnline || Boolean(controlBusy)}
                    onClick={() => void sendMiniCommand(miniPlayer?.mute ? "unmute" : "mute")}
                  >
                    {miniPlayer?.mute ? "Ativar som" : "Deixar mudo"}
                  </button>
                </div>
              ) : null}
            </div>
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
  position: relative;
  order: 1;
  width: 184px;
  height: 98px;
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
  overflow: visible;
}

.radio-mini-card.is-temporary {
  border-color: #fdba74;
  border-left-color: #ea580c;
  background: #fffaf5;
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
  overflow: hidden;
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

.radio-mini-card.is-temporary .radio-mini-track {
  color: #c2410c;
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
  gap: 4px;
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

.radio-mini-control:hover:not(:disabled),
.radio-mini-control.is-open {
  color: #c2410c;
  background: #fff7ed;
  border-color: #fdba74;
}

.radio-mini-control:disabled {
  opacity: 0.45;
}

.radio-mini-mode {
  width: 48px;
  min-width: 48px;
  font-size: 7px;
  letter-spacing: 0.02em;
}

.radio-mini-mode.is-active {
  color: #9a3412;
  background: #ffedd5;
  border-color: #fb923c;
}

.radio-mini-volume-wrap {
  position: relative;
  display: flex;
}

.radio-mini-volume {
  width: 43px;
  min-width: 43px;
}

.radio-mini-volume small {
  font-size: 7px;
  font-weight: 900;
}

.radio-mini-volume-popover {
  position: absolute;
  z-index: 40;
  top: calc(100% + 7px);
  right: 0;
  width: 156px;
  display: grid;
  gap: 8px;
  padding: 10px;
  color: #1f2933;
  background: #ffffff;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  box-shadow: 0 12px 28px rgba(31, 41, 51, 0.18);
}

.radio-mini-volume-popover::before {
  content: "";
  position: absolute;
  top: -5px;
  right: 15px;
  width: 8px;
  height: 8px;
  background: #ffffff;
  border-left: 1px solid #d8dee8;
  border-top: 1px solid #d8dee8;
  transform: rotate(45deg);
}

.radio-mini-volume-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
}

.radio-mini-volume-head span {
  color: #667085;
  font-size: 10px;
  font-weight: 900;
}

.radio-mini-volume-slider {
  width: 100%;
  min-height: 20px;
  margin: 0;
  padding: 0;
  accent-color: #f97316;
}

.radio-mini-mute-button {
  min-height: 28px;
  padding: 5px 8px;
  color: #7c2d12;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 6px;
  font-size: 10px;
  line-height: 1;
  font-weight: 900;
}

.radio-mini-mute-button.is-muted {
  color: #166534;
  background: #f0fdf4;
  border-color: #bbf7d0;
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

  .radio-mini-mode {
    width: 39px;
    min-width: 39px;
    font-size: 6px;
  }

  .radio-mini-volume-popover {
    width: 148px;
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
