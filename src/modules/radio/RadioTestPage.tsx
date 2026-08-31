import { useCallback, useEffect, useState } from "react";
import {
  authenticatedSupabaseFetch,
  readSupabaseRestError,
  SUPABASE_URL,
} from "../security/services/supabaseClient";

const TEST_FILE = "radio-sm-voz-teste.mp3";
const TEST_MESSAGE = "Atenção. Teste da Rádio Santa Maria. Nosso sistema de comunicação interna está funcionando.";
const TEST_DURATION_SECONDS = 9;

type RadioAnnouncement = {
  id: string;
  title: string;
  message: string | null;
  local_file: string;
  duration_seconds: number;
  scheduled_for: string;
  status: "queued" | "claimed" | "completed" | "failed" | "cancelled";
  created_at: string;
  completed_at: string | null;
  last_error: string | null;
};

export function RadioTestPage() {
  const [rows, setRows] = useState<RadioAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    try {
      const response = await authenticatedSupabaseFetch(
        `${SUPABASE_URL}/rest/v1/radio_announcements?select=id,title,message,local_file,duration_seconds,scheduled_for,status,created_at,completed_at,last_error&order=created_at.desc&limit=8`,
        { headers: { Accept: "application/json" } },
      );

      if (!response.ok) {
        const details = await readSupabaseRestError(response);
        throw new Error(details.message || `HTTP ${response.status}`);
      }

      const data = (await response.json()) as RadioAnnouncement[];
      setRows(data);
      setError(null);
    } catch (loadError) {
      setError(formatError(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows();
    const timer = window.setInterval(() => void loadRows(), 3000);
    return () => window.clearInterval(timer);
  }, [loadRows]);

  const sendTest = async () => {
    if (sending) return;
    setSending(true);
    setError(null);
    setMessage(null);

    try {
      const response = await authenticatedSupabaseFetch(`${SUPABASE_URL}/rest/v1/radio_announcements`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          title: "Teste Rádio Santa Maria",
          message: TEST_MESSAGE,
          local_file: TEST_FILE,
          duration_seconds: TEST_DURATION_SECONDS,
          scheduled_for: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        const details = await readSupabaseRestError(response);
        throw new Error(details.message || `HTTP ${response.status}`);
      }

      setMessage("Comunicado enviado para a fila. A ponte local deve reproduzir em poucos segundos.");
      await loadRows();
    } catch (sendError) {
      setError(formatError(sendError));
    } finally {
      setSending(false);
    }
  };

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.kicker}>HUB SANTA MARIA</div>
        <h1 style={styles.title}>Rádio Santa Maria</h1>
        <p style={styles.subtitle}>Prova de integração HUB → Supabase → PC local → AudioCast.</p>

        <div style={styles.testBox}>
          <strong>Comunicado de teste</strong>
          <p style={styles.testText}>{TEST_MESSAGE}</p>
          <div style={styles.fileLine}>Arquivo local: <code>{TEST_FILE}</code></div>
          <button type="button" style={{ ...styles.button, opacity: sending ? 0.65 : 1 }} onClick={() => void sendTest()} disabled={sending}>
            {sending ? "Enviando..." : "Disparar teste no som"}
          </button>
        </div>

        {message ? <div style={styles.success}>{message}</div> : null}
        {error ? <div style={styles.error}>{error}</div> : null}

        <div style={styles.listHeader}>
          <h2 style={styles.listTitle}>Últimos disparos</h2>
          <button type="button" style={styles.refreshButton} onClick={() => void loadRows()}>Atualizar</button>
        </div>

        {loading ? (
          <p>Carregando...</p>
        ) : rows.length === 0 ? (
          <p style={styles.muted}>Nenhum comunicado enviado ainda.</p>
        ) : (
          <div style={styles.list}>
            {rows.map((row) => (
              <article key={row.id} style={styles.row}>
                <div>
                  <strong>{row.title}</strong>
                  <div style={styles.rowMeta}>{formatDate(row.created_at)} · {row.local_file}</div>
                  {row.last_error ? <div style={styles.rowError}>{row.last_error}</div> : null}
                </div>
                <span style={statusStyle(row.status)}>{statusLabel(row.status)}</span>
              </article>
            ))}
          </div>
        )}

        <p style={styles.note}>
          Para o teste funcionar, a ponte Node precisa estar aberta no computador 10.11.22.50 e o arquivo MP3 precisa existir em C:\Users\user.
        </p>
      </section>
    </main>
  );
}

function statusLabel(status: RadioAnnouncement["status"]) {
  if (status === "queued") return "NA FILA";
  if (status === "claimed") return "TOCANDO";
  if (status === "completed") return "CONCLUÍDO";
  if (status === "failed") return "FALHOU";
  return "CANCELADO";
}

function statusStyle(status: RadioAnnouncement["status"]): React.CSSProperties {
  const base: React.CSSProperties = {
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 800,
    whiteSpace: "nowrap",
  };
  if (status === "completed") return { ...base, background: "#dcfce7", color: "#166534" };
  if (status === "failed") return { ...base, background: "#fee2e2", color: "#991b1b" };
  if (status === "claimed") return { ...base, background: "#dbeafe", color: "#1d4ed8" };
  if (status === "queued") return { ...base, background: "#fef3c7", color: "#92400e" };
  return { ...base, background: "#e5e7eb", color: "#374151" };
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("SUPABASE_AUTH_SESSION_REQUIRED")) {
    return "Sessão do HUB não encontrada. Entre no HUB como administrador e abra /radio novamente.";
  }
  return `Não foi possível concluir a operação: ${message}`;
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f3f4f6",
    padding: "32px 16px",
    fontFamily: "Inter, system-ui, sans-serif",
    color: "#111827",
  },
  card: {
    width: "min(760px, 100%)",
    margin: "0 auto",
    background: "#ffffff",
    borderRadius: 20,
    padding: 28,
    boxShadow: "0 12px 36px rgba(15, 23, 42, 0.08)",
  },
  kicker: { fontSize: 12, fontWeight: 900, letterSpacing: "0.14em", color: "#6b7280" },
  title: { margin: "6px 0 0", fontSize: 32, lineHeight: 1.1 },
  subtitle: { margin: "8px 0 24px", color: "#6b7280" },
  testBox: { border: "1px solid #e5e7eb", borderRadius: 16, padding: 18, background: "#f9fafb" },
  testText: { margin: "8px 0", lineHeight: 1.5 },
  fileLine: { marginBottom: 16, fontSize: 13, color: "#6b7280" },
  button: {
    border: 0,
    borderRadius: 10,
    padding: "11px 16px",
    background: "#111827",
    color: "#ffffff",
    fontWeight: 800,
    cursor: "pointer",
  },
  success: { marginTop: 14, padding: 12, borderRadius: 10, background: "#dcfce7", color: "#166534", fontSize: 14 },
  error: { marginTop: 14, padding: 12, borderRadius: 10, background: "#fee2e2", color: "#991b1b", fontSize: 14 },
  listHeader: { marginTop: 28, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  listTitle: { margin: 0, fontSize: 18 },
  refreshButton: { border: "1px solid #d1d5db", background: "#fff", borderRadius: 8, padding: "7px 10px", cursor: "pointer" },
  list: { marginTop: 10, display: "grid", gap: 8 },
  row: { border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" },
  rowMeta: { marginTop: 4, fontSize: 12, color: "#6b7280" },
  rowError: { marginTop: 5, fontSize: 12, color: "#b91c1c" },
  muted: { color: "#6b7280" },
  note: { margin: "22px 0 0", paddingTop: 16, borderTop: "1px solid #e5e7eb", color: "#6b7280", fontSize: 13, lineHeight: 1.5 },
};
