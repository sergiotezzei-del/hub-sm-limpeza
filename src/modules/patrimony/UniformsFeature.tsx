import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { authenticatedSupabaseFetch, SUPABASE_URL } from "../security/services/supabaseClient";
import { UniformsFeature as UniformsFeatureCore } from "./UniformsFeatureCore";
import { UniformDeliveryCancellation } from "./UniformDeliveryCancellation";
import { UniformTermExclusion } from "./UniformTermExclusion";
import { loadUniformsDataset, type UniformsDataset } from "./services/uniformsService";

type UniformsFeatureProps = { actorName: string };
type ExclusionRow = { term_id: string; reason: string; actor_name: string; created_at: string };

export function UniformsFeature({ actorName }: UniformsFeatureProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [notice, setNotice] = useState("");
  const [nav, setNav] = useState<HTMLElement | null>(null);
  const [termHeader, setTermHeader] = useState<HTMLElement | null>(null);
  const [data, setData] = useState<UniformsDataset | null>(null);
  const [exclusions, setExclusions] = useState<ExclusionRow[]>([]);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      loadUniformsDataset(),
      authenticatedSupabaseFetch(`${SUPABASE_URL}/rest/v1/uniform_term_exclusions?select=term_id,reason,actor_name,created_at&order=created_at.desc&limit=250`, {
        headers: { Accept: "application/json" },
      }).then(async (response) => {
        if (!response.ok) throw new Error("TERM_EXCLUSION_READ_FAILED");
        return await response.json() as ExclusionRow[];
      }),
    ]).then(([nextData, nextExclusions]) => {
      if (!alive) return;
      setData(nextData);
      setExclusions(nextExclusions);
    }).catch(() => {
      if (!alive) return;
      setData(null);
      setExclusions([]);
    });
    return () => { alive = false; };
  }, [refreshKey]);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const findTargets = () => {
      const nextNav = element.querySelector<HTMLElement>(".uniforms-tabs");
      const nextHeader = Array.from(element.querySelectorAll<HTMLElement>(".uniforms-card .section-title-row"))
        .find((header) => header.querySelector("h3")?.textContent?.includes("Termos aguardando assinatura")) ?? null;
      setNav((previous) => previous === nextNav ? previous : nextNav);
      setTermHeader((previous) => previous === nextHeader ? previous : nextHeader);
    };
    findTargets();
    const observer = new MutationObserver(findTargets);
    observer.observe(element, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [refreshKey]);

  useEffect(() => {
    const element = root.current;
    if (!element || !data) return;
    const excludedIds = new Set(exclusions.map((item) => item.term_id));
    const people = new Map(data.patrimony.people.map((person) => [person.id, person]));
    const batches = new Map(data.batches.map((batch) => [batch.id, batch]));
    const formatDate = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));
    const applyVisibility = () => {
      const header = Array.from(element.querySelectorAll<HTMLElement>(".uniforms-card .section-title-row"))
        .find((item) => item.querySelector("h3")?.textContent?.includes("Termos aguardando assinatura"));
      const panel = header?.closest(".uniforms-card");
      if (!panel) return;
      const rows = Array.from(panel.querySelectorAll<HTMLElement>(".uniforms-list-row"));
      // Never suppress a term by a guessed position if the live list changed since our fetch.
      if (rows.length !== data.terms.length) return;
      const matches = rows.every((row, index) => {
        const term = data.terms[index];
        const batch = batches.get(term.batchId);
        const person = batch ? people.get(batch.personId) : undefined;
        const displayName = row.querySelector("strong")?.textContent?.trim() ?? "";
        const displayDate = row.querySelector("small")?.textContent ?? "";
        return displayName === (person?.name ?? "Pessoa não encontrada") && displayDate.startsWith(formatDate(term.generatedAt));
      });
      if (!matches) return;
      rows.forEach((row, index) => {
        const hidden = excludedIds.has(data.terms[index].id);
        row.hidden = hidden;
        row.style.display = hidden ? "none" : "";
      });
    };
    applyVisibility();
    const observer = new MutationObserver(applyVisibility);
    observer.observe(element, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [data, exclusions, refreshKey]);

  function refreshAfterAction(message: string) {
    setNotice(message);
    setRefreshKey((value) => value + 1);
  }

  return (
    <>
      {notice && <p role="status" className="success-message" style={{ margin: "8px 0" }}>{notice}</p>}
      <div ref={root}>
        <UniformsFeatureCore key={refreshKey} actorName={actorName} />
      </div>
      {nav && createPortal(
        <UniformDeliveryCancellation actorName={actorName} onCancelled={() => refreshAfterAction("ENTREGA CANCELADA. Estoque e termos atualizados; histórico preservado.")} />,
        nav,
      )}
      {termHeader && createPortal(
        <UniformTermExclusion actorName={actorName} data={data} exclusions={exclusions} onExcluded={refreshAfterAction} />,
        termHeader,
      )}
    </>
  );
}
