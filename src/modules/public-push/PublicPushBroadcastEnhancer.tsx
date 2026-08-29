import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  broadcastHubPublicPush,
  loadHubPublicPushStats,
  type HubPublicPushStats,
  type PublicPushBroadcastTarget,
} from "./publicPushAdminService";
import "./publicPushBroadcast.css";

const EMPTY_STATS: HubPublicPushStats = {
  activeDevices: 0,
  auditorio: 0,
  serviceRequest: 0,
  marketing: 0,
};

export function PublicPushBroadcastEnhancer() {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const sync = () => {
      const next = document.querySelector<HTMLElement>(".hub-admin-push-box");
      setHost((current) => current === next ? current : next);
    };
    sync();
    const root = document.getElementById("root");
    if (!root) return;
    const observer = new MutationObserver(sync);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (!host) return null;
  return createPortal(<PublicPushBroadcastPanel />, host);
}

function PublicPushBroadcastPanel() {
  const [stats, setStats] = useState<HubPublicPushStats>(EMPTY_STATS);
  const [target, setTarget] = useState<PublicPushBroadcastTarget>("all");
  const [title, setTitle] = useState("Aviso Santa Maria");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void loadHubPublicPushStats()
      .then((value) => { if (active) setStats(value); })
      .catch(() => { if (active) setMessage("Não foi possível carregar os aparelhos cadastrados."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const targetCount = useMemo(() => {
    if (target === "auditorio") return stats.auditorio;
    if (target === "service_request") return stats.serviceRequest;
    if (target === "marketing") return stats.marketing;
    return stats.activeDevices;
  }, [stats, target]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const cleanTitle = title.trim();
    const cleanBody = body.trim();
    if (!cleanTitle || !cleanBody) {
      setMessage("Informe o título e a mensagem.");
      return;
    }
    if (targetCount <= 0) {
      setMessage("Não há aparelhos cadastrados para este grupo.");
      return;
    }
    const targetLabel = target === "all" ? "todos os aparelhos cadastrados" : `${targetCount} aparelho(s) deste grupo`;
    if (!window.confirm(`Enviar esta notificação para ${targetLabel}?`)) return;

    setSending(true);
    setMessage("");
    try {
      const result = await broadcastHubPublicPush({ target, title: cleanTitle, body: cleanBody, url: "/" });
      setMessage(`Enviado para ${result.sent} aparelho(s)${result.failed ? ` · ${result.failed} falha(s)` : ""}.`);
      if (result.sent > 0) setBody("");
      const nextStats = await loadHubPublicPushStats();
      setStats(nextStats);
    } catch (error) {
      const raw = error instanceof Error ? error.message : "";
      setMessage(raw.includes("SESSION") || raw.includes("admin_required")
        ? "Sua sessão administrativa não está válida. Entre novamente no HUB."
        : "Não foi possível enviar a notificação.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="hub-public-broadcast">
      <div className="hub-public-broadcast-head">
        <div>
          <strong>📣 Disparar notificação</strong>
          <small>{loading ? "Carregando aparelhos..." : `${stats.activeDevices} aparelho(s) público(s) cadastrado(s)`}</small>
        </div>
      </div>

      <form onSubmit={send}>
        <label>
          Quem recebe
          <select value={target} onChange={(event) => setTarget(event.target.value as PublicPushBroadcastTarget)}>
            <option value="all">Todos os aparelhos ({stats.activeDevices})</option>
            <option value="auditorio">Auditório ({stats.auditorio})</option>
            <option value="service_request">Chamados ({stats.serviceRequest})</option>
            <option value="marketing">Marketing ({stats.marketing})</option>
          </select>
        </label>
        <label>
          Título
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} />
        </label>
        <label>
          Mensagem
          <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={1000} rows={3} placeholder="Digite o aviso que será enviado aos aparelhos..." />
        </label>
        <button type="submit" disabled={sending || loading || targetCount <= 0}>
          {sending ? "ENVIANDO..." : `ENVIAR PARA ${targetCount} APARELHO(S)`}
        </button>
        {message && <small className="hub-public-broadcast-message" role="status">{message}</small>}
      </form>
    </section>
  );
}
