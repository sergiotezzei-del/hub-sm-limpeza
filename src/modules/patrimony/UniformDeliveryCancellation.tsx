import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { authenticatedSupabaseFetch, getFreshSupabaseAccessToken, SUPABASE_URL } from "../../security/services/supabaseClient";
import { loadUniformsDataset, type UniformsDataset } from "./services/uniformsService";

const emptyData: UniformsDataset = {
  patrimony: { people: [], items: [], assignments: [], spaces: [], spaceAssignments: [], movements: [] },
  templates: [], batches: [], batchItems: [], terms: [], attachments: [],
};

type Props = { actorName: string; onCancelled: () => void };

export function UniformDeliveryCancellation({ actorName, onCancelled }: Props) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<UniformsDataset>(emptyData);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [physicalConfirmed, setPhysicalConfirmed] = useState(false);
  const [hideTerm, setHideTerm] = useState(false);
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    void authenticatedSupabaseFetch(`${SUPABASE_URL}/rest/v1/rpc/is_hub_admin`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    }).then(async (response) => {
      if (mounted && response.ok) setIsAdmin((await response.json()) === true);
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) { setOpen(false); setPassword(""); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, busy]);

  async function showPanel() {
    setOpen(true);
    setMessage("");
    setLoading(true);
    try {
      setData(await loadUniformsDataset());
    } catch {
      setMessage("Não foi possível carregar as entregas. Atualize a página e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  const batch = data.batches.find((entry) => entry.id === selectedBatchId);
  const term = data.terms.find((entry) => entry.batchId === selectedBatchId && entry.status !== "substituido");
  const lines = data.batchItems.filter((line) => line.batchId === selectedBatchId && line.active);
  const itemsById = useMemo(() => new Map(data.patrimony.items.map((item) => [item.id, item])), [data]);
  const assignmentsById = useMemo(() => new Map(data.patrimony.assignments.map((assignment) => [assignment.id, assignment])), [data]);
  const peopleById = useMemo(() => new Map(data.patrimony.people.map((person) => [person.id, person])), [data]);
  const availableBatches = data.batches.filter((entry) => entry.status === "aguardando_assinatura"
    && data.terms.some((t) => t.batchId === entry.id && t.status === "aguardando_assinatura"));
  const pendingPieces = lines.reduce((total, line) => {
    const assignment = assignmentsById.get(line.patrimonyAssignmentId);
    return total + Math.max(0, (assignment?.quantity ?? 0) - (assignment?.returnedQuantity ?? 0));
  }, 0);
  const invalid = !batch || !term || term.status !== "aguardando_assinatura" || reason.trim().length < 5
    || !password || !physicalConfirmed || busy || loading;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (invalid || !batch) return;
    setBusy(true);
    setMessage("");
    try {
      const token = await getFreshSupabaseAccessToken();
      if (!token) throw new Error("Sessão expirada. Entre novamente no HUB.");
      const response = await fetch(`${SUPABASE_URL}/functions/v1/cancel-uniform-delivery`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "delivery", batchId: batch.id, operationId, password,
          reason: reason.trim(), physicalConfirmed, hideTerm, actorName }),
      });
      const result = await response.json().catch(() => ({})) as {
        error?: string; restoredQuantity?: number; termExcluded?: boolean;
      };
      if (!response.ok) throw new Error(result.error || "Não foi possível cancelar esta entrega.");
      setPassword(""); setReason(""); setPhysicalConfirmed(false); setHideTerm(false); setSelectedBatchId("");
      setOperationId(crypto.randomUUID());
      setMessage(`ENTREGA CANCELADA. ${result.restoredQuantity ?? 0} peça(s) voltaram ao estoque. ${result.termExcluded ? "Termo retirado da lista ativa." : "Termo preservado no histórico."}`);
      setData(await loadUniformsDataset());
      onCancelled();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível cancelar a entrega.");
    } finally {
      setPassword("");
      setBusy(false);
    }
  }

  if (!isAdmin) return null;
  return (
    <>
      <button type="button" onClick={() => { if (open) { setOpen(false); setPassword(""); } else void showPanel(); }} disabled={busy}>
        Excluir entrega
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div className="uniforms-modal-backdrop" role="presentation" style={{ zIndex: 2000 }}>
          <form role="dialog" aria-modal="true" aria-label="Excluir entrega" className="uniforms-modal" onSubmit={(event) => { void submit(event); }}
            style={{ maxWidth: 650, maxHeight: "min(90vh, 850px)", overflowY: "auto", padding: 20, display: "grid", gap: 12 }}>
            <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <h3 style={{ margin: 0 }}>Excluir entrega</h3>
              <button type="button" disabled={busy} onClick={() => { setOpen(false); setPassword(""); }}>Fechar</button>
            </header>
            <p style={{ margin: 0 }}>Cancelamento com histórico. Peças já devolvidas não entram novamente no estoque. Entregas assinadas ou com correções vinculadas ficam protegidas.</p>
            {loading ? <p>Carregando entregas...</p> : (
              <label>Entrega a excluir
                <select required value={selectedBatchId} disabled={busy} onChange={(event) => {
                  setSelectedBatchId(event.target.value); setOperationId(crypto.randomUUID()); setMessage("");
                }}>
                  <option value="">Selecione a pessoa e a entrega</option>
                  {availableBatches.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {peopleById.get(entry.personId)?.name ?? "Pessoa"} · {new Date(entry.deliveredAt).toLocaleDateString("pt-BR")} · lote {entry.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {batch && (
              <section className="uniforms-inline-summary" style={{ display: "grid", gap: 8 }}>
                <strong>{peopleById.get(batch.personId)?.name ?? "Pessoa"}</strong>
                <ul style={{ margin: 0 }}>{lines.map((line) => {
                  const item = itemsById.get(line.itemId);
                  const assignment = assignmentsById.get(line.patrimonyAssignmentId);
                  return <li key={line.id}>{item?.name ?? "Uniforme"} · tam. {item?.uniformSize ?? "-"}: {line.quantity} entregue(s), {assignment?.returnedQuantity ?? 0} já devolvida(s), {Math.max(0, (assignment?.quantity ?? 0) - (assignment?.returnedQuantity ?? 0))} pendente(s)</li>;
                })}</ul>
                <strong>Retorno previsto: {pendingPieces} peça(s).</strong>
                <small>O termo será invalidado para novas assinaturas e impressões, independentemente da escolha abaixo.</small>
              </section>
            )}
            <label>Motivo obrigatório
              <textarea required minLength={5} rows={3} value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} placeholder="Por que esta entrega está sendo cancelada?" />
            </label>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <input type="checkbox" checked={hideTerm} disabled={busy} onChange={(event) => setHideTerm(event.target.checked)} />
              <span><strong>Deseja excluir também o termo da aba Termos?</strong><br /><small>Se marcar, ele sai da lista operacional, mas permanece no histórico de auditoria.</small></span>
            </label>
            <label>Confirme com a senha da sua própria conta HUB
              <input required type="password" autoComplete="current-password" value={password} disabled={busy} onChange={(event) => setPassword(event.target.value)} placeholder="Sua senha (não é armazenada)" />
            </label>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <input type="checkbox" checked={physicalConfirmed} disabled={busy} onChange={(event) => setPhysicalConfirmed(event.target.checked)} />
              Confirmo que todas as peças pendentes desta entrega estão fisicamente disponíveis para voltar ao estoque.
            </label>
            <button type="submit" className="primary-button" disabled={invalid} style={{ background: "#b91c1c" }}>
              {busy ? "Confirmando com segurança..." : "CONFIRMAR EXCLUSÃO DA ENTREGA"}
            </button>
            {message && <p role="status" style={{ margin: 0 }}>{message}</p>}
          </form>
        </div>, document.body,
      )}
    </>
  );
}
