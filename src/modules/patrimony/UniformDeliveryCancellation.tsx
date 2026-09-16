import { FormEvent, useEffect, useMemo, useState } from "react";
import { authenticatedSupabaseFetch, getFreshSupabaseAccessToken, SUPABASE_URL } from "../security/services/supabaseClient";
import { loadUniformsDataset, type UniformsDataset } from "./services/uniformsService";

// Cancellation is deliberately a separate admin panel: the existing delivery,
// return and correction flows retain their original behavior.
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
  const availableBatches = data.batches.filter((entry) => entry.status === "aguardando_assinatura" && data.terms.some((t) => t.batchId === entry.id && t.status === "aguardando_assinatura"));
  const pendingPieces = lines.reduce((total, line) => {
    const assignment = assignmentsById.get(line.patrimonyAssignmentId);
    return total + Math.max(0, (assignment?.quantity ?? 0) - (assignment?.returnedQuantity ?? 0));
  }, 0);
  const invalid = !batch || !term || term.status !== "aguardando_assinatura" || reason.trim().length < 5 || !password || !physicalConfirmed || busy || loading;

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
        body: JSON.stringify({ batchId: batch.id, operationId, password, reason: reason.trim(), physicalConfirmed, actorName }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string; restoredQuantity?: number };
      if (!response.ok) throw new Error(result.error || "Não foi possível cancelar esta entrega.");
      setPassword(""); setReason(""); setPhysicalConfirmed(false); setSelectedBatchId("");
      setOperationId(crypto.randomUUID());
      setData(await loadUniformsDataset());
      onCancelled();
      setMessage(`ENTREGA CANCELADA. ${result.restoredQuantity ?? 0} peça(s) pendente(s) devolvida(s) ao estoque. O histórico foi preservado.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível cancelar a entrega.");
    } finally {
      // Never retain a password between attempts or after a failed operation.
      setPassword("");
      setBusy(false);
    }
  }

  if (!isAdmin) return null;
  return (
    <section style={{ margin: "12px 0", padding: "14px", border: "1px solid #fed7aa", borderRadius: 10, background: "#fffaf5" }}>
      <button type="button" className="secondary-button" onClick={() => { if (open) { setOpen(false); setPassword(""); } else void showPanel(); }} disabled={busy}>
        {open ? "Fechar exclusão" : "Excluir entrega"}
      </button>
      {open && (
        <form onSubmit={(event) => { void submit(event); }} style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <h3 style={{ margin: 0 }}>Excluir entrega — cancelamento com histórico</h3>
          <p style={{ margin: 0 }}>Somente uma entrega por vez. Peças já devolvidas não voltam ao estoque novamente. Termos assinados e entregas com correções vinculadas não podem ser excluídos aqui.</p>
          {loading ? <p>Carregando entregas...</p> : (
            <label>Entrega a excluir
              <select required value={selectedBatchId} disabled={busy} onChange={(event) => { setSelectedBatchId(event.target.value); setOperationId(crypto.randomUUID()); setMessage(""); }}>
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
            <div style={{ padding: 12, border: "1px solid #fdba74", borderRadius: 8 }}>
              <strong>{peopleById.get(batch.personId)?.name ?? "Pessoa"}</strong>
              <ul>{lines.map((line) => {
                const item = itemsById.get(line.itemId);
                const assignment = assignmentsById.get(line.patrimonyAssignmentId);
                return <li key={line.id}>{item?.name ?? "Uniforme"} · tam. {item?.uniformSize ?? "-"}: {line.quantity} entregue(s), {assignment?.returnedQuantity ?? 0} já devolvida(s), {Math.max(0, (assignment?.quantity ?? 0) - (assignment?.returnedQuantity ?? 0))} pendente(s)</li>;
              })}</ul>
              <strong>Retorno previsto ao estoque: {pendingPieces} peça(s).</strong>
              <p style={{ marginBottom: 0 }}>A entrega será marcada como CANCELADA; o termo antigo será SUBSTITUÍDO e não poderá ser assinado nem reimpresso como vigente.</p>
            </div>
          )}
          <label>Motivo obrigatório
            <textarea required minLength={5} rows={3} value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} placeholder="Por que essa entrega foi lançada incorretamente?" />
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
      )}
    </section>
  );
}
