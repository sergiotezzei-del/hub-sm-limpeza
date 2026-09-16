import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { authenticatedSupabaseFetch, getFreshSupabaseAccessToken, SUPABASE_URL } from "../../security/services/supabaseClient";
import type { UniformsDataset } from "./services/uniformsService";

type ExclusionRow = { term_id: string; reason: string; actor_name: string; created_at: string };
type Props = {
  actorName: string;
  data: UniformsDataset | null;
  exclusions: ExclusionRow[];
  onExcluded: (notice: string) => void;
};

export function UniformTermExclusion({ actorName, data, exclusions, onExcluded }: Props) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const [termId, setTermId] = useState("");
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const excludedIds = useMemo(() => new Set(exclusions.map((row) => row.term_id)), [exclusions]);
  const terms = data?.terms.filter((term) => !excludedIds.has(term.id)) ?? [];
  const selected = terms.find((term) => term.id === termId);
  const batch = data?.batches.find((item) => item.id === selected?.batchId);
  const person = data?.patrimony.people.find((item) => item.id === batch?.personId);
  const pendingCount = (data?.batchItems ?? []).filter((item) => item.batchId === batch?.id && item.active)
    .reduce((sum, item) => {
      const assignment = data?.patrimony.assignments.find((entry) => entry.id === item.patrimonyAssignmentId);
      return sum + Math.max(0, (assignment?.quantity ?? 0) - (assignment?.returnedQuantity ?? 0));
    }, 0);
  const signedOrAttached = selected?.status === "assinado" || Boolean(selected?.signedDocumentPath || selected?.signedUploadedAt)
    || Boolean(data?.attachments.some((item) => item.termId === selected?.id));
  const invalid = !selected || signedOrAttached || pendingCount > 0 || reason.trim().length < 5 || !password || busy;

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
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) { setOpen(false); setPassword(""); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, busy]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (invalid || !selected) return;
    setBusy(true);
    setMessage("");
    try {
      const token = await getFreshSupabaseAccessToken();
      if (!token) throw new Error("Sessão expirada. Entre novamente no HUB.");
      const response = await fetch(`${SUPABASE_URL}/functions/v1/cancel-uniform-delivery`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "term", termId: selected.id, operationId, password, reason: reason.trim(), actorName }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string; excluded?: boolean };
      if (!response.ok || result.excluded !== true) throw new Error(result.error || "Não foi possível excluir o termo.");
      setPassword(""); setReason(""); setTermId(""); setOperationId(crypto.randomUUID()); setOpen(false);
      onExcluded("TERMO RETIRADO DA LISTA. Documento original e justificativa preservados no histórico; estoque inalterado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível excluir o termo.");
    } finally {
      setPassword("");
      setBusy(false);
    }
  }

  if (!isAdmin) return null;
  return (
    <>
      <button className="secondary-button" type="button" disabled={!data || busy} onClick={() => {
        setOpen(true); setMessage(""); setOperationId(crypto.randomUUID());
      }}>Excluir termo</button>
      {open && typeof document !== "undefined" && createPortal(
        <div className="uniforms-modal-backdrop" role="presentation" style={{ zIndex: 2000 }}>
          <form className="uniforms-modal" role="dialog" aria-modal="true" aria-label="Excluir termo"
            onSubmit={(event) => { void submit(event); }}
            style={{ maxWidth: 620, maxHeight: "min(90vh, 850px)", overflowY: "auto", padding: 20, display: "grid", gap: 12 }}>
            <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <h3 style={{ margin: 0 }}>Excluir termo</h3>
              <button type="button" disabled={busy} onClick={() => { setOpen(false); setPassword(""); }}>Fechar</button>
            </header>
            <p style={{ margin: 0 }}>Retira o termo da lista operacional, mas mantém documento e motivo no histórico. <strong>Não movimenta o estoque.</strong> Termos assinados não podem ser excluídos.</p>
            <label>Termo a excluir
              <select required value={termId} disabled={busy} onChange={(event) => {
                setTermId(event.target.value); setMessage(""); setOperationId(crypto.randomUUID());
              }}>
                <option value="">Selecione uma pessoa e o termo</option>
                {terms.map((term) => {
                  const termBatch = data?.batches.find((item) => item.id === term.batchId);
                  const termPerson = data?.patrimony.people.find((item) => item.id === termBatch?.personId);
                  return <option value={term.id} key={term.id}>
                    {termPerson?.name ?? "Pessoa"} · {new Date(term.generatedAt).toLocaleDateString("pt-BR")} · {term.status === "assinado" ? "Assinado" : term.status === "substituido" ? "Substituído" : "Aguardando assinatura"} · {term.id.slice(0, 8)}
                  </option>;
                })}
              </select>
            </label>
            {selected && <section className="uniforms-inline-summary" style={{ display: "grid", gap: 5 }}>
              <strong>{person?.name ?? "Pessoa"}</strong>
              <span>{new Date(selected.generatedAt).toLocaleDateString("pt-BR")} · Termo {selected.id.slice(0, 8)}</span>
              {signedOrAttached && <strong>Bloqueado: documento assinado ou com anexo deve ser preservado.</strong>}
              {!signedOrAttached && pendingCount > 0 && <strong>Bloqueado: há {pendingCount} peça(s) ainda atribuída(s). Corrija ou exclua a entrega antes de retirar o termo.</strong>}
              {!signedOrAttached && pendingCount === 0 && <strong>Nenhuma peça será movimentada. Somente o termo será retirado da lista.</strong>}
            </section>}
            <label>Motivo obrigatório
              <textarea required minLength={5} rows={3} disabled={busy} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Por que o termo deve sair da lista?" />
            </label>
            <label>Senha da sua própria conta HUB
              <input required type="password" autoComplete="current-password" disabled={busy} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Sua senha (não é armazenada)" />
            </label>
            <button type="submit" className="primary-button" disabled={invalid} style={{ background: "#b91c1c" }}>
              {busy ? "Confirmando..." : "CONFIRMAR EXCLUSÃO DO TERMO"}
            </button>
            {message && <p role="status" style={{ margin: 0 }}>{message}</p>}
            {exclusions.length > 0 && <details>
              <summary>Termos excluídos anteriormente ({exclusions.length}) — histórico</summary>
              {exclusions.map((item) => <p key={item.term_id}>
                {item.term_id.slice(0, 8)} · {new Date(item.created_at).toLocaleString("pt-BR")} · {item.actor_name} · {item.reason}
              </p>)}
            </details>}
          </form>
        </div>, document.body,
      )}
    </>
  );
}
