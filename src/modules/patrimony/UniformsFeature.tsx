import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { AppIcon } from "../../components/AppIcon";
import {
  createUniformSignedTermUrl,
  correctUniformDeliveryPerson,
  correctUniformDeliverySize,
  getUniformsErrorMessage,
  loadUniformsDataset,
  markUniformTermPrinted,
  registerUniformDeliveryBatch,
  registerUniformStockReceipt,
  returnUniformAssignment,
  uploadUniformSignedTerm,
  type UniformDeliveryCorrectionMode,
  type UniformDeliveryLineInput,
  type UniformsDataset,
} from "./services/uniformsService";
import { openUniformDeliveryTermForPrint } from "./services/uniformTermDocument";
import { saveOrganizationPerson } from "./services/patrimonyService";
import { downloadUniformInventoryPdf } from "./services/uniformInventoryPdf";
import type {
  OrganizationPerson,
  OrganizationPersonDraft,
  PatrimonyAssignment,
  PatrimonyItem,
  PatrimonyMovement,
  PatrimonyPersonType,
  PatrimonyReturnCondition,
  UniformDeliveryBatch,
  UniformDeliveryBatchItem,
  UniformDeliveryTerm,
} from "./types/patrimony.types";
import "./uniforms.css";

type UniformsFeatureProps = {
  actorName: string;
};

type UniformView = "stock" | "delivery" | "terms" | "person" | "returns" | "history" | "receipts";
type LoadStatus = "idle" | "loading" | "ready" | "error";

type DeliveryLineDraft = {
  id: string;
  itemId: string;
  quantity: string;
  observation: string;
};

type CorrectionDraft = {
  open: boolean;
  operationId: string;
  batchId: string;
  action: "person" | "size";
  newPersonId: string;
  newPersonQuery: string;
  batchItemId: string;
  targetItemId: string;
  quantity: string;
  mode: UniformDeliveryCorrectionMode;
  reason: string;
};

type ReceiptDraft = {
  mode: "existing" | "new";
  itemId: string;
  itemCode: string;
  name: string;
  description: string;
  size: string;
  fabric: string;
  color: string;
  quantity: string;
  receivedAt: string;
  supplier: string;
  proposalNumber: string;
  notes: string;
};

const emptyData: UniformsDataset = {
  patrimony: { people: [], items: [], assignments: [], spaces: [], spaceAssignments: [], movements: [] },
  templates: [],
  batches: [],
  batchItems: [],
  terms: [],
  attachments: [],
};

const personTypeOptions: Array<{ value: PatrimonyPersonType; label: string }> = [
  { value: "funcionario", label: "Funcionário" },
  { value: "temporario", label: "Temporário" },
  { value: "prestador", label: "Prestador" },
  { value: "outro", label: "Outro" },
];

const returnConditionOptions: Array<{ value: PatrimonyReturnCondition; label: string }> = [
  { value: "bom", label: "Bom / retorna ao estoque" },
  { value: "danificado", label: "Danificado" },
  { value: "perdido", label: "Perdido / não devolvido" },
];

function newDeliveryLine(): DeliveryLineDraft {
  return { id: crypto.randomUUID(), itemId: "", quantity: "1", observation: "" };
}

function newPersonDraft(initialName = ""): OrganizationPersonDraft {
  return {
    name: initialName,
    personType: "funcionario",
    department: "",
    teamName: "",
    jobTitle: "",
    active: true,
    notes: "",
  };
}

function newReceiptDraft(): ReceiptDraft {
  return {
    mode: "existing",
    itemId: "",
    itemCode: "",
    name: "",
    description: "",
    size: "",
    fabric: "",
    color: "",
    quantity: "1",
    receivedAt: new Date().toISOString().slice(0, 10),
    supplier: "",
    proposalNumber: "",
    notes: "",
  };
}

function newCorrectionDraft(batchId = ""): CorrectionDraft {
  return {
    open: Boolean(batchId),
    operationId: crypto.randomUUID(),
    batchId,
    action: "person",
    newPersonId: "",
    newPersonQuery: "",
    batchItemId: "",
    targetItemId: "",
    quantity: "1",
    mode: "correcao_administrativa",
    reason: "",
  };
}

export function UniformsFeature({ actorName }: UniformsFeatureProps) {
  const [data, setData] = useState<UniformsDataset>(emptyData);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("idle");
  const [activeView, setActiveView] = useState<UniformView>("stock");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const [deliveryPersonId, setDeliveryPersonId] = useState("");
  const [deliveryPersonQuery, setDeliveryPersonQuery] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [deliveryLines, setDeliveryLines] = useState<DeliveryLineDraft[]>([newDeliveryLine()]);
  const [lastDelivery, setLastDelivery] = useState<{ batchId: string; termId: string } | null>(null);
  const [quickPersonOpen, setQuickPersonOpen] = useState(false);
  const [quickPersonContext, setQuickPersonContext] = useState<"delivery" | "correction">("delivery");
  const [quickPersonDraft, setQuickPersonDraft] = useState<OrganizationPersonDraft>(() => newPersonDraft());
  const [correctionDraft, setCorrectionDraft] = useState<CorrectionDraft>(() => newCorrectionDraft());
  const [correctionResult, setCorrectionResult] = useState<{ batchId: string; termId: string } | null>(null);

  const [personQuery, setPersonQuery] = useState("");
  const [personStatusFilter, setPersonStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const [returnAssignmentId, setReturnAssignmentId] = useState("");
  const [returnQuantity, setReturnQuantity] = useState("1");
  const [returnCondition, setReturnCondition] = useState<PatrimonyReturnCondition>("bom");
  const [returnReason, setReturnReason] = useState("");

  const [historyFilters, setHistoryFilters] = useState({ personId: "all", itemId: "all", movementType: "all", from: "", to: "" });
  const [receiptDraft, setReceiptDraft] = useState<ReceiptDraft>(() => newReceiptDraft());
  const [uploadingTermId, setUploadingTermId] = useState("");
  const [uploadNotes, setUploadNotes] = useState("");

  const itemById = useMemo(() => new Map(data.patrimony.items.map((item) => [item.id, item])), [data.patrimony.items]);
  const personById = useMemo(() => new Map(data.patrimony.people.map((person) => [person.id, person])), [data.patrimony.people]);
  const assignmentById = useMemo(() => new Map(data.patrimony.assignments.map((assignment) => [assignment.id, assignment])), [data.patrimony.assignments]);
  const batchById = useMemo(() => new Map(data.batches.map((batch) => [batch.id, batch])), [data.batches]);
  const termByBatchId = useMemo(() => currentTermByBatchId(data.terms), [data.terms]);
  const templateByVersion = useMemo(() => new Map(data.templates.map((template) => [template.version, template])), [data.templates]);
  const activeBatchItemsByBatchId = useMemo(() => {
    const map = new Map<string, UniformDeliveryBatchItem[]>();
    data.batchItems.filter((item) => item.active !== false).forEach((item) => {
      map.set(item.batchId, [...(map.get(item.batchId) ?? []), item]);
    });
    return map;
  }, [data.batchItems]);

  const uniformItems = useMemo(
    () => data.patrimony.items.filter(isUniform).sort(compareUniformItems),
    [data.patrimony.items],
  );
  const activePeople = useMemo(
    () => data.patrimony.people.filter((person) => person.active).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [data.patrimony.people],
  );
  const activeUniformAssignments = useMemo(
    () => data.patrimony.assignments.filter((assignment) => {
      const item = itemById.get(assignment.itemId);
      return Boolean(item && isUniform(item) && openQuantity(assignment) > 0);
    }),
    [data.patrimony.assignments, itemById],
  );

  const stockSummary = useMemo(() => {
    const received = sum(uniformItems.map((item) => item.totalQuantity));
    const available = sum(uniformItems.map((item) => item.availableQuantity));
    const damaged = sum(uniformItems.map((item) => item.maintenanceQuantity));
    const lost = sum(uniformItems.map((item) => item.lostQuantity));
    return {
      received,
      available,
      delivered: Math.max(0, received - available - damaged - lost),
      damaged,
      lost,
      awaitingTerms: data.terms.filter((term) => term.status === "aguardando_assinatura").length,
    };
  }, [data.terms, uniformItems]);

  const selectedDeliveryPerson = personById.get(deliveryPersonId);
  const deliverySummary = useMemo(() => {
    let valid = Boolean(selectedDeliveryPerson?.active);
    let total = 0;
    const seen = new Set<string>();
    const lines: UniformDeliveryLineInput[] = [];
    for (const line of deliveryLines) {
      const item = itemById.get(line.itemId);
      const quantity = Number(line.quantity);
      if (!item || !isUniform(item) || !Number.isFinite(quantity) || quantity <= 0 || quantity > item.availableQuantity || seen.has(item.id)) {
        valid = false;
      } else {
        seen.add(item.id);
        total += quantity;
        lines.push({ itemId: item.id, quantity, observation: line.observation });
      }
    }
    return { valid: valid && lines.length > 0, total, lines };
  }, [deliveryLines, itemById, selectedDeliveryPerson]);

  const selectedReturnAssignment = activeUniformAssignments.find((assignment) => assignment.id === returnAssignmentId);
  const selectedReturnItem = selectedReturnAssignment ? itemById.get(selectedReturnAssignment.itemId) : undefined;
  const selectedReturnPerson = selectedReturnAssignment ? personById.get(selectedReturnAssignment.personId) : undefined;
  const maxReturnQuantity = selectedReturnAssignment ? openQuantity(selectedReturnAssignment) : 0;
  const returnQuantityNumber = Number(returnQuantity);
  const returnValid = Boolean(selectedReturnAssignment && selectedReturnItem)
    && Number.isFinite(returnQuantityNumber)
    && returnQuantityNumber > 0
    && returnQuantityNumber <= maxReturnQuantity
    && returnReason.trim().length >= 3;

  const filteredPeople = useMemo(() => {
    const term = normalize(personQuery);
    return data.patrimony.people.filter((person) => {
      const matchesStatus = personStatusFilter === "all" || (personStatusFilter === "active" ? person.active : !person.active);
      const matchesTerm = !term || normalize(`${person.name} ${person.department} ${person.teamName ?? ""}`).includes(term);
      return matchesStatus && matchesTerm;
    });
  }, [data.patrimony.people, personQuery, personStatusFilter]);

  const filteredMovements = useMemo(() => {
    const uniformIds = new Set(uniformItems.map((item) => item.id));
    const fromTime = historyFilters.from ? new Date(`${historyFilters.from}T00:00:00`).getTime() : null;
    const toTime = historyFilters.to ? new Date(`${historyFilters.to}T23:59:59`).getTime() : null;
    return data.patrimony.movements.filter((movement) => {
      if (!movement.itemId || !uniformIds.has(movement.itemId)) return false;
      const time = new Date(movement.createdAt).getTime();
      return (historyFilters.personId === "all" || movement.personId === historyFilters.personId)
        && (historyFilters.itemId === "all" || movement.itemId === historyFilters.itemId)
        && (historyFilters.movementType === "all" || movement.movementType === historyFilters.movementType)
        && (fromTime === null || time >= fromTime)
        && (toTime === null || time <= toTime);
    });
  }, [data.patrimony.movements, historyFilters, uniformItems]);

  const uniformMovements = useMemo(() => {
    const uniformIds = new Set(uniformItems.map((item) => item.id));
    return data.patrimony.movements.filter((movement) => movement.itemId && uniformIds.has(movement.itemId));
  }, [data.patrimony.movements, uniformItems]);

  async function refresh(showLoading = true) {
    if (showLoading) setLoadStatus("loading");
    setNotice("");
    try {
      const next = await loadUniformsDataset();
      setData(next);
      setLoadStatus("ready");
    } catch (error) {
      setLoadStatus("error");
      setNotice(getUniformsErrorMessage(error));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleDeliverySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !deliverySummary.valid || !selectedDeliveryPerson) return;
    setBusy(true);
    setNotice("");
    try {
      const batchId = crypto.randomUUID();
      const termId = crypto.randomUUID();
      await registerUniformDeliveryBatch({
        batchId,
        termId,
        personId: selectedDeliveryPerson.id,
        items: deliverySummary.lines,
        actorName,
        notes: deliveryNotes,
        templateVersion: activeTemplate()?.version ?? "V5",
      });
      setLastDelivery({ batchId, termId });
      setNotice("ENTREGA REALIZADA COM SUCESSO");
      setDeliveryLines([newDeliveryLine()]);
      setDeliveryNotes("");
      setDeliveryPersonId("");
      setDeliveryPersonQuery("");
      await refresh(false);
    } catch (error) {
      setNotice(getUniformsErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleQuickPersonSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const saved = await saveOrganizationPerson({ ...quickPersonDraft, active: true });
      if (quickPersonContext === "correction") {
        setCorrectionDraft((current) => ({ ...current, newPersonId: saved.id, newPersonQuery: saved.name }));
      } else {
        setDeliveryPersonId(saved.id);
        setDeliveryPersonQuery(saved.name);
      }
      setQuickPersonOpen(false);
      setQuickPersonDraft(newPersonDraft());
      await refresh(false);
    } catch (error) {
      setNotice(getUniformsErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleCorrectionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !correctionDraft.open) return;
    const batch = batchById.get(correctionDraft.batchId);
    const term = batch ? termByBatchId.get(batch.id) : undefined;
    const template = activeTemplate();
    const reason = correctionDraft.reason.trim();
    if (!batch || !term || !template) {
      setNotice("Não foi possível localizar a entrega vigente para correção.");
      return;
    }
    if (reason.length < 3) {
      setNotice("Informe o motivo da correção.");
      return;
    }

    setBusy(true);
    setNotice("");
    try {
      if (correctionDraft.action === "person") {
        const newPerson = personById.get(correctionDraft.newPersonId);
        if (!newPerson?.active) throw new Error("Funcionário correto não encontrado ou inativo.");
        const result = await correctUniformDeliveryPerson({
          correctionId: correctionDraft.operationId,
          batchId: batch.id,
          newPersonId: newPerson.id,
          reason,
          actorName,
          newBatchId: term.status === "assinado" ? crypto.randomUUID() : undefined,
          newTermId: crypto.randomUUID(),
          templateVersion: template.version,
        });
        setCorrectionResult({ batchId: result.batchId, termId: result.termId });
      } else {
        const line = (activeBatchItemsByBatchId.get(batch.id) ?? []).find((item) => item.id === correctionDraft.batchItemId);
        const assignment = line ? assignmentById.get(line.patrimonyAssignmentId) : undefined;
        const quantity = Number(correctionDraft.quantity);
        if (!line || !assignment) throw new Error("Peça da entrega não encontrada.");
        if (!Number.isFinite(quantity) || quantity <= 0 || quantity > Math.min(line.quantity, openQuantity(assignment))) throw new Error("Quantidade inválida para correção.");
        const target = itemById.get(correctionDraft.targetItemId);
        if (!target || !isUniform(target)) throw new Error("Tamanho correto não encontrado.");
        const mode = term.status === "assinado" ? "troca_fisica" : correctionDraft.mode;
        const result = await correctUniformDeliverySize({
          correctionId: correctionDraft.operationId,
          batchItemId: line.id,
          targetItemId: target.id,
          quantity,
          mode,
          reason,
          actorName,
          newBatchId: term.status === "assinado" ? crypto.randomUUID() : undefined,
          newTermId: crypto.randomUUID(),
          templateVersion: template.version,
        });
        setCorrectionResult({ batchId: result.batchId, termId: result.termId });
      }
      setCorrectionDraft(newCorrectionDraft());
      setNotice("CORREÇÃO REALIZADA COM SUCESSO");
      await refresh(false);
    } catch (error) {
      setNotice(getUniformsErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleReturnSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !returnValid) return;
    setBusy(true);
    setNotice("");
    try {
      await returnUniformAssignment({
        assignmentId: returnAssignmentId,
        quantity: returnQuantityNumber,
        condition: returnCondition,
        actorName,
        reason: returnReason,
      });
      setNotice("DEVOLUÇÃO REALIZADA COM SUCESSO");
      setReturnAssignmentId("");
      setReturnQuantity("1");
      setReturnCondition("bom");
      setReturnReason("");
      await refresh(false);
    } catch (error) {
      setNotice(getUniformsErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleReceiptSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const quantity = Number(receiptDraft.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setNotice("Informe uma quantidade válida.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      await registerUniformStockReceipt({
        itemId: receiptDraft.mode === "existing" ? receiptDraft.itemId : undefined,
        itemCode: receiptDraft.mode === "new" ? receiptDraft.itemCode : undefined,
        name: receiptDraft.mode === "new" ? receiptDraft.name : undefined,
        description: receiptDraft.description,
        size: receiptDraft.mode === "new" ? receiptDraft.size : undefined,
        fabric: receiptDraft.mode === "new" ? receiptDraft.fabric : undefined,
        color: receiptDraft.mode === "new" ? receiptDraft.color : undefined,
        quantity,
        receivedAt: receiptDraft.receivedAt,
        supplier: receiptDraft.supplier,
        proposalNumber: receiptDraft.proposalNumber,
        actorName,
        notes: receiptDraft.notes,
      });
      setNotice("ENTRADA REGISTRADA COM SUCESSO");
      setReceiptDraft(newReceiptDraft());
      await refresh(false);
    } catch (error) {
      setNotice(getUniformsErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handlePrintTerm(batchId: string) {
    const batch = batchById.get(batchId);
    const term = batch ? termByBatchId.get(batch.id) : undefined;
    const person = batch ? personById.get(batch.personId) : undefined;
    const template = term ? templateByVersion.get(term.templateVersion) : activeTemplate();
    if (!batch || !term || !person || !template) {
      setNotice("Não foi possível localizar os dados do termo.");
      return;
    }
    if (term.status === "substituido") {
      setNotice("Este termo foi substituído por uma correção e não pode mais ser impresso.");
      return;
    }
    try {
      await openUniformDeliveryTermForPrint({
        person,
        batch,
        term,
        template,
        batchItems: activeBatchItemsByBatchId.get(batch.id) ?? [],
        itemById,
      });
      await markUniformTermPrinted(term.id, actorName);
      await refresh(false);
    } catch (error) {
      setNotice(getUniformsErrorMessage(error));
    }
  }

  async function handleUploadTerm(term: UniformDeliveryTerm, file?: File | null) {
    if (!file || busy) return;
    const batch = batchById.get(term.batchId);
    if (!batch) return;
    if (term.status === "substituido") {
      setNotice("Este termo foi substituído por uma correção e não pode receber assinatura.");
      return;
    }
    setBusy(true);
    setNotice("");
    setUploadingTermId(term.id);
    try {
      await uploadUniformSignedTerm({
        termId: term.id,
        batchId: batch.id,
        personId: batch.personId,
        file,
        actorName,
        notes: uploadNotes,
      });
      setNotice("TERMO ASSINADO REGISTRADO COM SUCESSO");
      setUploadNotes("");
      await refresh(false);
    } catch (error) {
      setNotice(getUniformsErrorMessage(error));
    } finally {
      setUploadingTermId("");
      setBusy(false);
    }
  }

  async function handleViewSignedTerm(term: UniformDeliveryTerm) {
    if (!term.signedDocumentPath) return;
    try {
      const url = await createUniformSignedTermUrl(term.signedDocumentPath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setNotice(getUniformsErrorMessage(error));
    }
  }

  async function handlePdf() {
    setBusy(true);
    setNotice("");
    try {
      const result = await downloadUniformInventoryPdf(data);
      setNotice(`PDF gerado · ${result.total} vínculo(s) atual(is).`);
    } catch (error) {
      setNotice(getUniformsErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function openCorrection(batchId: string, action: "person" | "size" = "person") {
    const firstLine = activeBatchItemsByBatchId.get(batchId)?.[0];
    const term = termByBatchId.get(batchId);
    setCorrectionResult(null);
    setCorrectionDraft({
      ...newCorrectionDraft(batchId),
      action,
      batchItemId: firstLine?.id ?? "",
      mode: term?.status === "assinado" ? "troca_fisica" : "correcao_administrativa",
    });
    setNotice("");
  }

  function activeTemplate() {
    return data.templates.find((template) => template.active) ?? data.templates[0];
  }

  if (loadStatus === "idle" || loadStatus === "loading") {
    return <section className="patrimony-panel uniforms-panel"><section className="empty-state"><h2>Carregando Uniformes...</h2><p>Buscando estoque, entregas e termos.</p></section></section>;
  }

  if (loadStatus === "error") {
    return (
      <section className="patrimony-panel uniforms-panel">
        <section className="empty-state">
          <h2>Não foi possível abrir Uniformes.</h2>
          <p>{notice || "Saia e entre novamente com o Admin Tezzei."}</p>
          <button className="primary-button" type="button" onClick={() => { void refresh(); }}>Tentar novamente</button>
        </section>
      </section>
    );
  }

  return (
    <section className="patrimony-panel uniforms-panel">
      <header className="uniforms-header">
        <div>
          <p className="eyebrow">PATRIMÔNIO</p>
          <h2>Uniformes</h2>
          <span>Estoque, entrega agrupada, termos assinados, devoluções e histórico.</span>
        </div>
        <button className="secondary-button" type="button" disabled={busy} onClick={handlePdf}><AppIcon name="reports" size="sm" className="action-icon" />Gerar relatório PDF</button>
      </header>

      {notice && <p className={isSuccessNotice(notice) ? "success-message" : "notice-message"}>{notice}</p>}
      {correctionResult && (
        <section className="uniforms-correction-success">
          <button className="primary-button" type="button" disabled={busy} onClick={() => { void handlePrintTerm(correctionResult.batchId); }}>Ver termo atualizado</button>
          <button className="secondary-button" type="button" disabled={busy} onClick={() => setCorrectionResult(null)}>Sair</button>
        </section>
      )}

      <nav className="uniforms-tabs" aria-label="Áreas de Uniformes">
        <button className={activeView === "stock" ? "active" : ""} type="button" onClick={() => setActiveView("stock")}>Estoque</button>
        <button className={activeView === "delivery" ? "active" : ""} type="button" onClick={() => setActiveView("delivery")}>Entregar uniformes</button>
        <button className={activeView === "terms" ? "active" : ""} type="button" onClick={() => setActiveView("terms")}>Termos</button>
        <button className={activeView === "person" ? "active" : ""} type="button" onClick={() => setActiveView("person")}>Consulta por pessoa</button>
        <button className={activeView === "returns" ? "active" : ""} type="button" onClick={() => setActiveView("returns")}>Devolução</button>
        <button className={activeView === "receipts" ? "active" : ""} type="button" onClick={() => setActiveView("receipts")}>Receber remessa</button>
        <button className={activeView === "history" ? "active" : ""} type="button" onClick={() => setActiveView("history")}>Histórico</button>
      </nav>

      <section className="uniforms-summary-grid">
        <UniformStat label="Total recebido" value={stockSummary.received} />
        <UniformStat label="Em estoque" value={stockSummary.available} />
        <UniformStat label="Entregue" value={stockSummary.delivered} />
        <UniformStat label="Danificado" value={stockSummary.damaged} />
        <UniformStat label="Perdido / não devolvido" value={stockSummary.lost} />
        <UniformStat label="Termos aguardando assinatura" value={stockSummary.awaitingTerms} />
      </section>

      {activeView === "stock" && (
        <section className="uniforms-card">
          <div className="section-title-row">
            <AppIcon name="stock" size="md" className="status-icon icon-info" />
            <h3>Estoque de uniformes</h3>
          </div>
          <div className="uniforms-table-wrap">
            <table className="uniforms-table">
              <thead><tr><th>Produto</th><th>Tamanho</th><th>Recebido</th><th>Entregue</th><th>Disponível</th><th>Danificado</th><th>Perdido</th></tr></thead>
              <tbody>
                {uniformItems.map((item) => {
                  const delivered = Math.max(0, item.totalQuantity - item.availableQuantity - item.maintenanceQuantity - item.lostQuantity);
                  return (
                    <tr key={item.id}>
                      <td><strong>{item.name}</strong><small>{item.code} · {item.uniformFabric ?? "Sem tecido"}{item.uniformColor ? ` · ${item.uniformColor}` : ""} · Proposta {item.uniformProposalNumber ?? "-"}</small></td>
                      <td>{item.uniformSize ?? "-"}</td>
                      <td>{formatNumber(item.totalQuantity)}</td>
                      <td>{formatNumber(delivered)}</td>
                      <td>{formatNumber(item.availableQuantity)}</td>
                      <td>{formatNumber(item.maintenanceQuantity)}</td>
                      <td>{formatNumber(item.lostQuantity)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeView === "delivery" && (
        <section className="uniforms-grid-two">
          <form className="uniforms-card uniforms-form" onSubmit={handleDeliverySubmit}>
            <div className="section-title-row">
              <AppIcon name="save" size="md" className="status-icon icon-success" />
              <h3>Entrega agrupada</h3>
            </div>
            <PersonSearchSelect
              activeOnly
              label="Nome da pessoa"
              people={activePeople}
              query={deliveryPersonQuery}
              selectedPersonId={deliveryPersonId}
              onQueryChange={setDeliveryPersonQuery}
              onSelect={(person) => {
                setDeliveryPersonId(person.id);
                setDeliveryPersonQuery(person.name);
              }}
              onCreate={(name) => {
                setQuickPersonContext("delivery");
                setQuickPersonDraft(newPersonDraft(name));
                setQuickPersonOpen(true);
              }}
            />
            {selectedDeliveryPerson && (
              <article className="uniforms-inline-summary">
                <strong>{selectedDeliveryPerson.name}</strong>
                <span>{selectedDeliveryPerson.department} · {selectedDeliveryPerson.teamName ?? "Sem equipe"}</span>
              </article>
            )}
            <div className="uniforms-line-list">
              {deliveryLines.map((line, index) => {
                const item = itemById.get(line.itemId);
                return (
                  <div className="uniforms-line" key={line.id}>
                    <label>
                      Produto
                      <select value={line.itemId} disabled={busy} onChange={(event) => updateDeliveryLine(line.id, { itemId: event.target.value })}>
                        <option value="">Selecione</option>
                        {uniformItems.filter((current) => current.availableQuantity > 0 || current.id === line.itemId).map((current) => (
                          <option key={current.id} value={current.id}>{current.code} · {current.name} · Tam. {current.uniformSize ?? "-"} · disponível {formatNumber(current.availableQuantity)}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Quantidade
                      <input type="number" min="1" step="1" max={item?.availableQuantity ?? undefined} value={line.quantity} disabled={busy} onChange={(event) => updateDeliveryLine(line.id, { quantity: event.target.value })} />
                    </label>
                    <label>
                      Observação
                      <input value={line.observation} disabled={busy} onChange={(event) => updateDeliveryLine(line.id, { observation: event.target.value })} />
                    </label>
                    <button className="ghost-button" type="button" disabled={busy || deliveryLines.length === 1} onClick={() => removeDeliveryLine(line.id)}>Remover</button>
                    {item && <small className="uniforms-line-stock">Disponível: {formatNumber(item.availableQuantity)} · Tamanho {item.uniformSize ?? "-"}</small>}
                    {index === deliveryLines.length - 1 && <button className="secondary-button" type="button" disabled={busy} onClick={() => setDeliveryLines((current) => [...current, newDeliveryLine()])}>Adicionar peça</button>}
                  </div>
                );
              })}
            </div>
            <label>Observação do lote<textarea rows={3} value={deliveryNotes} disabled={busy} onChange={(event) => setDeliveryNotes(event.target.value)} /></label>
            <section className={deliverySummary.valid ? "uniforms-confirm ok" : "uniforms-confirm danger"}>
              <strong>Resumo antes de confirmar</strong>
              <span>{selectedDeliveryPerson?.name ?? "Selecione a pessoa"} · {selectedDeliveryPerson?.department ?? "Setor"} · {selectedDeliveryPerson?.teamName ?? "Equipe"}</span>
              {deliverySummary.lines.length > 0 && (
                <ul>
                  {deliverySummary.lines.map((line) => {
                    const item = itemById.get(line.itemId);
                    return <li key={line.itemId}>{item?.name ?? "Uniforme"} · Tam. {item?.uniformSize ?? "-"} · {formatNumber(line.quantity)} peça(s)</li>;
                  })}
                </ul>
              )}
              <span>Total de peças: {formatNumber(deliverySummary.total)}</span>
            </section>
            <button className="primary-button wide-button" type="submit" disabled={busy || !deliverySummary.valid}>Confirmar entrega</button>
          </form>

          <section className="uniforms-card">
            <h3>Após confirmar entrega</h3>
            {lastDelivery ? (
              <div className="uniforms-success-actions">
                <strong>ENTREGA REALIZADA COM SUCESSO</strong>
                <button className="primary-button" type="button" onClick={() => { void handlePrintTerm(lastDelivery.batchId); }}>Imprimir termo</button>
                <button className="secondary-button" type="button" onClick={() => setActiveView("stock")}>Sair</button>
                <button className="ghost-button" type="button" onClick={() => { setLastDelivery(null); setActiveView("delivery"); }}>Nova entrega</button>
              </div>
            ) : (
              <p className="empty-copy">Ao registrar uma entrega, o termo fica disponível para impressão imediata.</p>
            )}
          </section>
        </section>
      )}

      {activeView === "terms" && (
        <TermsPanel
          batches={data.batches}
          batchItemsByBatchId={activeBatchItemsByBatchId}
          busy={busy}
          itemById={itemById}
          onCorrect={(batch) => openCorrection(batch.id)}
          onPrint={(batch) => { void handlePrintTerm(batch.id); }}
          onUpload={handleUploadTerm}
          onView={handleViewSignedTerm}
          peopleById={personById}
          terms={data.terms}
          uploadNotes={uploadNotes}
          uploadingTermId={uploadingTermId}
          setUploadNotes={setUploadNotes}
        />
      )}

      {activeView === "person" && (
        <PersonLookupPanel
          assignments={activeUniformAssignments}
          batchItemsByBatchId={activeBatchItemsByBatchId}
          batches={data.batches}
          filteredPeople={filteredPeople}
          itemById={itemById}
          movements={uniformMovements}
          onCorrectBatch={(batchId) => openCorrection(batchId)}
          onPersonQueryChange={setPersonQuery}
          onStatusFilterChange={setPersonStatusFilter}
          personQuery={personQuery}
          personStatusFilter={personStatusFilter}
          terms={data.terms}
        />
      )}

      {activeView === "returns" && (
        <form className="uniforms-card uniforms-form" onSubmit={handleReturnSubmit}>
          <div className="section-title-row">
            <AppIcon name="back" size="md" className="status-icon icon-warning" />
            <h3>Devolução de uniforme</h3>
          </div>
          <label>
            Uniforme pendente
            <select value={returnAssignmentId} disabled={busy} onChange={(event) => setReturnAssignmentId(event.target.value)}>
              <option value="">Selecione</option>
              {activeUniformAssignments.map((assignment) => {
                const item = itemById.get(assignment.itemId);
                const person = personById.get(assignment.personId);
                return <option key={assignment.id} value={assignment.id}>{person?.name ?? "Pessoa"} · {item?.name ?? "Uniforme"} · Tam. {item?.uniformSize ?? "-"} · pendente {formatNumber(openQuantity(assignment))}</option>;
              })}
            </select>
          </label>
          {selectedReturnItem && selectedReturnPerson && (
            <article className="uniforms-inline-summary">
              <strong>{selectedReturnPerson.name}</strong>
              <span>{selectedReturnItem.name} · Tamanho {selectedReturnItem.uniformSize ?? "-"} · Pendente {formatNumber(maxReturnQuantity)}</span>
            </article>
          )}
          <div className="uniforms-form-grid">
            <label>Quantidade<input type="number" min="1" step="1" max={maxReturnQuantity || undefined} value={returnQuantity} disabled={busy} onChange={(event) => setReturnQuantity(event.target.value)} /></label>
            <label>Estado<select value={returnCondition} disabled={busy} onChange={(event) => setReturnCondition(event.target.value as PatrimonyReturnCondition)}>{returnConditionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          </div>
          <label>Motivo obrigatório<textarea required rows={3} value={returnReason} disabled={busy} onChange={(event) => setReturnReason(event.target.value)} /></label>
          <button className="primary-button wide-button" type="submit" disabled={busy || !returnValid}>Confirmar devolução</button>
        </form>
      )}

      {activeView === "receipts" && (
        <form className="uniforms-card uniforms-form" onSubmit={handleReceiptSubmit}>
          <div className="section-title-row">
            <AppIcon name="stock" size="md" className="status-icon icon-success" />
            <h3>Receber nova remessa</h3>
          </div>
          <div className="patrimony-segmented compact" role="group" aria-label="Tipo de entrada">
            <button className={receiptDraft.mode === "existing" ? "active" : ""} type="button" disabled={busy} onClick={() => setReceiptDraft({ ...receiptDraft, mode: "existing" })}>Item existente</button>
            <button className={receiptDraft.mode === "new" ? "active" : ""} type="button" disabled={busy} onClick={() => setReceiptDraft({ ...receiptDraft, mode: "new" })}>Novo uniforme</button>
          </div>
          {receiptDraft.mode === "existing" ? (
            <label>
              Uniforme
              <select required value={receiptDraft.itemId} disabled={busy} onChange={(event) => setReceiptDraft({ ...receiptDraft, itemId: event.target.value })}>
                <option value="">Selecione</option>
                {uniformItems.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name} · Tam. {item.uniformSize ?? "-"}</option>)}
              </select>
            </label>
          ) : (
            <>
              <div className="uniforms-form-grid">
                <label>Código UNI<input required value={receiptDraft.itemCode} disabled={busy} placeholder="UNI-025" onChange={(event) => setReceiptDraft({ ...receiptDraft, itemCode: event.target.value.toUpperCase() })} /></label>
                <label>Nome/tipo<input required value={receiptDraft.name} disabled={busy} onChange={(event) => setReceiptDraft({ ...receiptDraft, name: event.target.value })} /></label>
              </div>
              <div className="uniforms-form-grid">
                <label>Tamanho<input required value={receiptDraft.size} disabled={busy} onChange={(event) => setReceiptDraft({ ...receiptDraft, size: event.target.value })} /></label>
                <label>Tecido<input value={receiptDraft.fabric} disabled={busy} onChange={(event) => setReceiptDraft({ ...receiptDraft, fabric: event.target.value })} /></label>
                <label>Cor<input value={receiptDraft.color} disabled={busy} onChange={(event) => setReceiptDraft({ ...receiptDraft, color: event.target.value })} /></label>
              </div>
              <label>Descrição<input value={receiptDraft.description} disabled={busy} onChange={(event) => setReceiptDraft({ ...receiptDraft, description: event.target.value })} /></label>
            </>
          )}
          <div className="uniforms-form-grid">
            <label>Quantidade<input required type="number" min="1" step="1" value={receiptDraft.quantity} disabled={busy} onChange={(event) => setReceiptDraft({ ...receiptDraft, quantity: event.target.value })} /></label>
            <label>Data<input required type="date" value={receiptDraft.receivedAt} disabled={busy} onChange={(event) => setReceiptDraft({ ...receiptDraft, receivedAt: event.target.value })} /></label>
            <label>Número da proposta/pedido<input value={receiptDraft.proposalNumber} disabled={busy} onChange={(event) => setReceiptDraft({ ...receiptDraft, proposalNumber: event.target.value })} /></label>
          </div>
          <label>Fornecedor<input value={receiptDraft.supplier} disabled={busy} onChange={(event) => setReceiptDraft({ ...receiptDraft, supplier: event.target.value })} /></label>
          <label>Observação<textarea rows={3} value={receiptDraft.notes} disabled={busy} onChange={(event) => setReceiptDraft({ ...receiptDraft, notes: event.target.value })} /></label>
          <button className="primary-button wide-button" type="submit" disabled={busy}>{busy ? "Registrando..." : "Confirmar entrada"}</button>
        </form>
      )}

      {activeView === "history" && (
        <HistoryPanel
          filters={historyFilters}
          itemById={itemById}
          movements={filteredMovements}
          onFiltersChange={setHistoryFilters}
          people={data.patrimony.people}
          personById={personById}
          uniformItems={uniformItems}
        />
      )}

      {quickPersonOpen && (
        <QuickPersonModal
          busy={busy}
          draft={quickPersonDraft}
          onClose={() => setQuickPersonOpen(false)}
          onDraftChange={setQuickPersonDraft}
          onSubmit={handleQuickPersonSubmit}
        />
      )}

      {correctionDraft.open && (
        <UniformCorrectionModal
          activePeople={activePeople}
          assignmentsById={assignmentById}
          batch={batchById.get(correctionDraft.batchId)}
          batchItems={activeBatchItemsByBatchId.get(correctionDraft.batchId) ?? []}
          busy={busy}
          draft={correctionDraft}
          itemById={itemById}
          onClose={() => setCorrectionDraft(newCorrectionDraft())}
          onCreatePerson={(name) => {
            setQuickPersonContext("correction");
            setQuickPersonDraft(newPersonDraft(name));
            setQuickPersonOpen(true);
          }}
          onDraftChange={setCorrectionDraft}
          onSubmit={handleCorrectionSubmit}
          person={batchById.get(correctionDraft.batchId) ? personById.get(batchById.get(correctionDraft.batchId)!.personId) : undefined}
          term={termByBatchId.get(correctionDraft.batchId)}
          uniformItems={uniformItems}
        />
      )}
    </section>
  );

  function updateDeliveryLine(lineId: string, update: Partial<DeliveryLineDraft>) {
    setDeliveryLines((current) => current.map((line) => line.id === lineId ? { ...line, ...update } : line));
  }

  function removeDeliveryLine(lineId: string) {
    setDeliveryLines((current) => current.filter((line) => line.id !== lineId));
  }
}

function UniformStat({ label, value }: { label: string; value: number }) {
  return (
    <article className="uniforms-stat">
      <span>{label}</span>
      <strong>{formatNumber(value)}</strong>
    </article>
  );
}

function TermsPanel(props: {
  batches: UniformDeliveryBatch[];
  terms: UniformDeliveryTerm[];
  peopleById: Map<string, OrganizationPerson>;
  itemById: Map<string, PatrimonyItem>;
  batchItemsByBatchId: Map<string, UniformDeliveryBatchItem[]>;
  busy: boolean;
  uploadingTermId: string;
  uploadNotes: string;
  setUploadNotes: (value: string) => void;
  onCorrect: (batch: UniformDeliveryBatch) => void;
  onPrint: (batch: UniformDeliveryBatch) => void;
  onView: (term: UniformDeliveryTerm) => void;
  onUpload: (term: UniformDeliveryTerm, file?: File | null) => void;
}) {
  return (
    <section className="uniforms-card">
      <div className="section-title-row">
        <AppIcon name="reports" size="md" className="status-icon icon-info" />
        <h3>Termos aguardando assinatura: {props.terms.filter((term) => term.status === "aguardando_assinatura").length}</h3>
      </div>
      <div className="uniforms-list">
        {props.terms.length === 0 ? <p className="empty-copy">Nenhum termo gerado ainda.</p> : props.terms.map((term) => {
          const batch = props.batches.find((current) => current.id === term.batchId);
          const person = batch ? props.peopleById.get(batch.personId) : undefined;
          const quantity = sum((props.batchItemsByBatchId.get(term.batchId) ?? []).map((item) => item.quantity));
          const replaced = term.status === "substituido";
          return (
            <article className="uniforms-list-row" key={term.id}>
              <div>
                <strong>{person?.name ?? "Pessoa não encontrada"}</strong>
                <small>{formatDate(term.generatedAt)} · {formatNumber(quantity)} peça(s) · {termStatusLabel(term.status)}</small>
                {term.signedUploadedAt && <small>TERMO ASSINADO · {formatDateTime(term.signedUploadedAt)} · {term.signedUploadedByName ?? "Responsável não informado"}</small>}
                {replaced && <small>Substituído{term.replacedAt ? ` em ${formatDateTime(term.replacedAt)}` : ""}{term.replacedByName ? ` · ${term.replacedByName}` : ""}{term.replacementReason ? ` · ${term.replacementReason}` : ""}</small>}
              </div>
              <div className="uniforms-row-actions">
                {batch && !replaced && <button className="secondary-button" type="button" disabled={props.busy} onClick={() => props.onCorrect(batch)}>Corrigir entrega</button>}
                <button className="secondary-button" type="button" disabled={!batch || props.busy || replaced} onClick={() => batch && props.onPrint(batch)}>Reimprimir</button>
                {term.signedDocumentPath && <button className="ghost-button" type="button" disabled={props.busy} onClick={() => props.onView(term)}>Visualizar</button>}
                <label className={replaced ? "uniforms-upload-button disabled" : "uniforms-upload-button"}>
                  {term.signedDocumentPath ? "Substituir documento" : "Registrar termo assinado"}
                  <input
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    capture="environment"
                    disabled={props.busy || replaced}
                    type="file"
                    onChange={(event: ChangeEvent<HTMLInputElement>) => props.onUpload(term, event.target.files?.[0] ?? null)}
                  />
                </label>
                {props.uploadingTermId === term.id && <small>Enviando...</small>}
              </div>
            </article>
          );
        })}
      </div>
      <label className="uniforms-upload-note">Observação do upload/substituição<input value={props.uploadNotes} disabled={props.busy} onChange={(event) => props.setUploadNotes(event.target.value)} /></label>
    </section>
  );
}

function UniformCorrectionModal(props: {
  activePeople: OrganizationPerson[];
  assignmentsById: Map<string, PatrimonyAssignment>;
  batch?: UniformDeliveryBatch;
  batchItems: UniformDeliveryBatchItem[];
  busy: boolean;
  draft: CorrectionDraft;
  itemById: Map<string, PatrimonyItem>;
  onClose: () => void;
  onCreatePerson: (name: string) => void;
  onDraftChange: (draft: CorrectionDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  person?: OrganizationPerson;
  term?: UniformDeliveryTerm;
  uniformItems: PatrimonyItem[];
}) {
  const selectedPerson = props.activePeople.find((person) => person.id === props.draft.newPersonId);
  const selectedLine = props.batchItems.find((line) => line.id === props.draft.batchItemId);
  const selectedAssignment = selectedLine ? props.assignmentsById.get(selectedLine.patrimonyAssignmentId) : undefined;
  const sourceItem = selectedLine ? props.itemById.get(selectedLine.itemId) : undefined;
  const targetItem = props.itemById.get(props.draft.targetItemId);
  const quantityNumber = Number(props.draft.quantity);
  const maxQuantity = selectedLine && selectedAssignment ? Math.min(selectedLine.quantity, openQuantity(selectedAssignment)) : 0;
  const signedTerm = props.term?.status === "assinado";
  const sizeMode = signedTerm ? "troca_fisica" : props.draft.mode;
  const targetOptions = sourceItem ? uniformSizeCorrectionOptions(props.uniformItems, sourceItem, props.draft.targetItemId) : [];
  const sizeValid = Boolean(
    selectedLine
    && targetItem
    && Number.isFinite(quantityNumber)
    && quantityNumber > 0
    && quantityNumber <= maxQuantity
    && quantityNumber <= targetItem.availableQuantity
    && props.draft.reason.trim().length >= 3,
  );
  const personValid = Boolean(
    selectedPerson?.active
    && selectedPerson.id !== props.person?.id
    && props.draft.reason.trim().length >= 3,
  );
  const canSubmit = Boolean(props.batch && props.term) && (props.draft.action === "person" ? personValid : sizeValid);

  function update(update: Partial<CorrectionDraft>) {
    props.onDraftChange({ ...props.draft, ...update });
  }

  return (
    <div className="uniforms-modal-backdrop" role="dialog" aria-modal="true">
      <form className="uniforms-modal uniforms-correction-modal" onSubmit={props.onSubmit}>
        <header>
          <div>
            <h3>Corrigir entrega</h3>
            <small>{props.term ? `Termo ${termStatusLabel(props.term.status)}` : "Termo não localizado"}</small>
          </div>
          <button type="button" onClick={props.onClose}>Fechar</button>
        </header>

        <section className="uniforms-inline-summary">
          <strong>{props.person?.name ?? "Funcionário não localizado"}</strong>
          <span>{props.person?.department ?? "Setor"} · {props.person?.teamName ?? "Equipe"}</span>
          <span>{props.batch ? `Entrega de ${formatDate(props.batch.deliveredAt)}` : "Entrega não localizada"}</span>
        </section>

        <section className="uniforms-correction-items">
          {props.batchItems.length === 0 ? <p className="empty-copy">Nenhuma peça pendente nesta entrega.</p> : props.batchItems.map((line) => {
            const item = props.itemById.get(line.itemId);
            return <span key={line.id}>{item?.name ?? "Uniforme"} · Tam. {item?.uniformSize ?? "-"} · {formatNumber(line.quantity)} peça(s)</span>;
          })}
        </section>

        <div className="patrimony-segmented compact" role="group" aria-label="Tipo de correção">
          <button className={props.draft.action === "person" ? "active" : ""} type="button" disabled={props.busy} onClick={() => update({ action: "person" })}>Corrigir pessoa</button>
          <button className={props.draft.action === "size" ? "active" : ""} type="button" disabled={props.busy} onClick={() => update({ action: "size" })}>Corrigir tamanho</button>
        </div>

        {props.draft.action === "person" ? (
          <>
            <PersonSearchSelect
              activeOnly
              label="Funcionário correto"
              people={props.activePeople}
              query={props.draft.newPersonQuery}
              selectedPersonId={props.draft.newPersonId}
              onQueryChange={(value) => update({ newPersonQuery: value })}
              onSelect={(person) => update({ newPersonId: person.id, newPersonQuery: person.name })}
              onCreate={props.onCreatePerson}
            />
            {selectedPerson && (
              <article className="uniforms-inline-summary">
                <strong>{selectedPerson.name}</strong>
                <span>{selectedPerson.department} · {selectedPerson.teamName ?? "Sem equipe"}</span>
              </article>
            )}
          </>
        ) : (
          <>
            <label>
              Peça entregue
              <select value={props.draft.batchItemId} disabled={props.busy} onChange={(event) => update({ batchItemId: event.target.value, targetItemId: "", quantity: "1" })}>
                <option value="">Selecione</option>
                {props.batchItems.map((line) => {
                  const item = props.itemById.get(line.itemId);
                  const assignment = props.assignmentsById.get(line.patrimonyAssignmentId);
                  return <option key={line.id} value={line.id}>{item?.name ?? "Uniforme"} · Tam. {item?.uniformSize ?? "-"} · pendente {formatNumber(assignment ? openQuantity(assignment) : line.quantity)}</option>;
                })}
              </select>
            </label>
            <div className="uniforms-form-grid">
              <label>
                Tamanho correto
                <select value={props.draft.targetItemId} disabled={props.busy || !sourceItem} onChange={(event) => update({ targetItemId: event.target.value })}>
                  <option value="">Selecione</option>
                  {targetOptions.map((item) => (
                    <option key={item.id} value={item.id}>{item.code} · Tam. {item.uniformSize ?? "-"} · disponível {formatNumber(item.availableQuantity)}</option>
                  ))}
                </select>
              </label>
              <label>Quantidade<input type="number" min="1" step="1" max={maxQuantity || undefined} value={props.draft.quantity} disabled={props.busy} onChange={(event) => update({ quantity: event.target.value })} /></label>
            </div>
            {!signedTerm && (
              <div className="patrimony-segmented compact" role="group" aria-label="Modo de correção de tamanho">
                <button className={props.draft.mode === "correcao_administrativa" ? "active" : ""} type="button" disabled={props.busy} onClick={() => update({ mode: "correcao_administrativa" })}>Correção administrativa</button>
                <button className={props.draft.mode === "troca_fisica" ? "active" : ""} type="button" disabled={props.busy} onClick={() => update({ mode: "troca_fisica" })}>Troca física</button>
              </div>
            )}
            {signedTerm && <p className="notice-message compact">Termo assinado: o original será preservado e a correção gerará nova entrega/termo de retificação.</p>}
          </>
        )}

        <label>Motivo obrigatório<textarea required rows={3} value={props.draft.reason} disabled={props.busy} onChange={(event) => update({ reason: event.target.value })} /></label>

        <section className={canSubmit ? "uniforms-confirm ok" : "uniforms-confirm"}>
          <strong>Resumo da correção</strong>
          {props.draft.action === "person" ? (
            <>
              <span>De: {props.person?.name ?? "Pessoa atual"}</span>
              <span>Para: {selectedPerson?.name ?? "Selecione o funcionário correto"}</span>
              <span>Estoque: sem alteração de quantidade. {signedTerm ? "Termo assinado original preservado; nova entrega e novo termo serão gerados." : "Termo atual será substituído e o termo atualizado será gerado."}</span>
            </>
          ) : (
            <>
              <span>Peça: {sourceItem?.name ?? "Selecione a peça"} · Tam. {sourceItem?.uniformSize ?? "-"}</span>
              <span>Correção: Tam. {targetItem?.uniformSize ?? "selecione"} · {Number.isFinite(quantityNumber) ? formatNumber(quantityNumber) : "0"} peça(s)</span>
              <span>{sizeMode === "correcao_administrativa" ? "Sem devolução física fictícia: ajusta somente o lançamento e o saldo disponível dos tamanhos." : "Troca física: registra devolução da peça anterior e entrega do tamanho correto."}</span>
              <span>Total recebido: não será alterado.</span>
            </>
          )}
        </section>

        <div className="button-grid">
          <button className="primary-button" type="submit" disabled={props.busy || !canSubmit}>Confirmar correção</button>
          <button className="ghost-button" type="button" disabled={props.busy} onClick={props.onClose}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}

function PersonLookupPanel(props: {
  filteredPeople: OrganizationPerson[];
  assignments: PatrimonyAssignment[];
  batchItemsByBatchId: Map<string, UniformDeliveryBatchItem[]>;
  itemById: Map<string, PatrimonyItem>;
  personQuery: string;
  personStatusFilter: "all" | "active" | "inactive";
  onCorrectBatch: (batchId: string) => void;
  onPersonQueryChange: (value: string) => void;
  onStatusFilterChange: (value: "all" | "active" | "inactive") => void;
  batches: UniformDeliveryBatch[];
  terms: UniformDeliveryTerm[];
  movements: PatrimonyMovement[];
}) {
  const termByBatchId = currentTermByBatchId(props.terms);
  return (
    <section className="uniforms-card">
      <div className="uniforms-filter-row">
        <label>Buscar funcionário<input type="search" value={props.personQuery} onChange={(event) => props.onPersonQueryChange(event.target.value)} /></label>
        <label>Status<select value={props.personStatusFilter} onChange={(event) => props.onStatusFilterChange(event.target.value as "all" | "active" | "inactive")}><option value="all">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select></label>
      </div>
      <div className="uniforms-list">
        {props.filteredPeople.map((person) => {
          const currentAssignments = props.assignments.filter((assignment) => assignment.personId === person.id);
          const personBatches = props.batches.filter((batch) => batch.personId === person.id);
          return (
            <article className="uniforms-person-card" key={person.id}>
              <header>
                <div><strong>{person.name}</strong><small>{person.department} · {person.teamName ?? "Sem equipe"}</small></div>
                <span className={person.active ? "patrimony-status-pill success" : "patrimony-status-pill muted"}>{person.active ? "Ativo" : "Inativo"}</span>
              </header>
              <h4>Uniformes atuais</h4>
              {currentAssignments.length === 0 ? <p className="empty-copy">Nenhum uniforme pendente.</p> : currentAssignments.map((assignment) => {
                const item = props.itemById.get(assignment.itemId);
                return <p key={assignment.id}>{item?.name ?? "Uniforme"} · Tam. {item?.uniformSize ?? "-"} · {formatNumber(openQuantity(assignment))} peça(s) · {formatDate(assignment.assignedAt)}</p>;
              })}
              <h4>Termos</h4>
              {personBatches.length === 0 ? <p className="empty-copy">Nenhum termo.</p> : personBatches.map((batch) => {
                const term = termByBatchId.get(batch.id);
                const quantity = sum((props.batchItemsByBatchId.get(batch.id) ?? []).map((item) => item.quantity));
                return (
                  <div className="uniforms-person-term" key={batch.id}>
                    <p>{formatDate(batch.deliveredAt)} · {formatNumber(quantity)} peça(s) · {termStatusLabel(term?.status)}</p>
                    {term?.status !== "substituido" && <button className="secondary-button" type="button" onClick={() => props.onCorrectBatch(batch.id)}>Corrigir entrega</button>}
                  </div>
                );
              })}
              <h4>Histórico</h4>
              {props.movements.filter((movement) => movement.personId === person.id).length === 0 ? (
                <p className="empty-copy">Nenhuma movimentação de uniforme.</p>
              ) : props.movements.filter((movement) => movement.personId === person.id).slice(0, 8).map((movement) => {
                const item = movement.itemId ? props.itemById.get(movement.itemId) : undefined;
                return <p key={movement.id}>{formatDateTime(movement.createdAt)} · {movementLabel(movement.movementType)} · {item?.name ?? "Uniforme"} · Tam. {item?.uniformSize ?? "-"} · {formatNumber(movement.quantity)} peça(s){movement.notes ? ` · ${movement.notes}` : ""}</p>;
              })}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function HistoryPanel(props: {
  filters: { personId: string; itemId: string; movementType: string; from: string; to: string };
  onFiltersChange: (filters: { personId: string; itemId: string; movementType: string; from: string; to: string }) => void;
  movements: PatrimonyMovement[];
  people: OrganizationPerson[];
  uniformItems: PatrimonyItem[];
  itemById: Map<string, PatrimonyItem>;
  personById: Map<string, OrganizationPerson>;
}) {
  return (
    <section className="uniforms-card">
      <div className="uniforms-filter-row">
        <label>Pessoa<select value={props.filters.personId} onChange={(event) => props.onFiltersChange({ ...props.filters, personId: event.target.value })}><option value="all">Todas</option>{props.people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
        <label>Produto<select value={props.filters.itemId} onChange={(event) => props.onFiltersChange({ ...props.filters, itemId: event.target.value })}><option value="all">Todos</option>{props.uniformItems.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name} · {item.uniformSize}</option>)}</select></label>
        <label>Movimento<select value={props.filters.movementType} onChange={(event) => props.onFiltersChange({ ...props.filters, movementType: event.target.value })}><option value="all">Todos</option><option value="entrada_estoque">Entrada</option><option value="entrega">Entrega</option><option value="devolucao">Devolução</option></select></label>
        <label>De<input type="date" value={props.filters.from} onChange={(event) => props.onFiltersChange({ ...props.filters, from: event.target.value })} /></label>
        <label>Até<input type="date" value={props.filters.to} onChange={(event) => props.onFiltersChange({ ...props.filters, to: event.target.value })} /></label>
      </div>
      <div className="uniforms-list">
        {props.movements.length === 0 ? <p className="empty-copy">Nenhuma movimentação encontrada.</p> : props.movements.map((movement) => {
          const item = movement.itemId ? props.itemById.get(movement.itemId) : undefined;
          const person = movement.personId ? props.personById.get(movement.personId) : undefined;
          return (
            <article className="uniforms-list-row" key={movement.id}>
              <div>
                <strong>{movementLabel(movement.movementType)}</strong>
                <small>{formatDateTime(movement.createdAt)} · {movement.actorName}</small>
                <small>{person?.name ?? "Sem pessoa"} · {item?.name ?? "Uniforme"} · Tam. {item?.uniformSize ?? "-"} · {formatNumber(movement.quantity)} peça(s)</small>
                {movement.notes && <small>{movement.notes}</small>}
              </div>
              {movement.condition && <span className="patrimony-status-pill muted">{movement.condition}</span>}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PersonSearchSelect(props: {
  label: string;
  people: OrganizationPerson[];
  query: string;
  selectedPersonId: string;
  activeOnly?: boolean;
  onQueryChange: (value: string) => void;
  onSelect: (person: OrganizationPerson) => void;
  onCreate: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    const term = normalize(props.query);
    return props.people
      .filter((person) => !term || normalize(`${person.name} ${person.department} ${person.teamName ?? ""}`).includes(term))
      .slice(0, 80);
  }, [props.people, props.query]);

  return (
    <div className="uniforms-combobox">
      <label>{props.label}<input value={props.query} onFocus={() => setOpen(true)} onChange={(event) => { props.onQueryChange(event.target.value); setOpen(true); }} placeholder="Clique ou digite para buscar" /></label>
      {open && (
        <div className="uniforms-combobox-menu">
          {filtered.map((person) => (
            <button type="button" key={person.id} onClick={() => { props.onSelect(person); setOpen(false); }}>
              <strong>{person.name}</strong>
              <span>{person.department} · {person.teamName ?? "Sem equipe"}</span>
            </button>
          ))}
          <button type="button" className="create" onClick={() => { props.onCreate(props.query); setOpen(false); }}>+ Cadastrar novo nome</button>
        </div>
      )}
      {props.selectedPersonId && props.activeOnly && !props.people.some((person) => person.id === props.selectedPersonId) && <small>Pessoa inativa não pode receber uniforme.</small>}
    </div>
  );
}

function QuickPersonModal(props: {
  draft: OrganizationPersonDraft;
  busy: boolean;
  onDraftChange: (draft: OrganizationPersonDraft) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="uniforms-modal-backdrop" role="dialog" aria-modal="true">
      <form className="uniforms-modal" onSubmit={props.onSubmit}>
        <header><h3>Cadastrar novo nome</h3><button type="button" onClick={props.onClose}>Fechar</button></header>
        <label>Nome<input required value={props.draft.name} disabled={props.busy} onChange={(event) => props.onDraftChange({ ...props.draft, name: event.target.value })} /></label>
        <div className="uniforms-form-grid">
          <label>Setor<input required value={props.draft.department} disabled={props.busy} onChange={(event) => props.onDraftChange({ ...props.draft, department: event.target.value })} /></label>
          <label>Equipe / gerente<input value={props.draft.teamName ?? ""} disabled={props.busy} onChange={(event) => props.onDraftChange({ ...props.draft, teamName: event.target.value })} /></label>
        </div>
        <div className="uniforms-form-grid">
          <label>Função<input value={props.draft.jobTitle ?? ""} disabled={props.busy} onChange={(event) => props.onDraftChange({ ...props.draft, jobTitle: event.target.value })} /></label>
          <label>Tipo<select value={props.draft.personType} disabled={props.busy} onChange={(event) => props.onDraftChange({ ...props.draft, personType: event.target.value as PatrimonyPersonType })}>{personTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        </div>
        <div className="button-grid">
          <button className="primary-button" type="submit" disabled={props.busy}>Salvar</button>
          <button className="ghost-button" type="button" disabled={props.busy} onClick={props.onClose}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}

function isUniform(item: PatrimonyItem) {
  return normalize(item.category) === "uniforme" || item.code.startsWith("UNI-");
}

function compareUniformItems(a: PatrimonyItem, b: PatrimonyItem) {
  return `${a.name} ${a.uniformSize ?? ""}`.localeCompare(`${b.name} ${b.uniformSize ?? ""}`, "pt-BR", { numeric: true });
}

function openQuantity(assignment: PatrimonyAssignment) {
  return Math.max(0, assignment.quantity - assignment.returnedQuantity);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function movementLabel(value: string) {
  if (value === "entrada_estoque") return "Entrada em estoque";
  if (value === "entrega") return "Entrega";
  if (value === "devolucao") return "Devolução";
  if (value === "transferencia") return "Transferência";
  if (value === "ajuste") return "Ajuste";
  return value;
}

function currentTermByBatchId(terms: UniformDeliveryTerm[]) {
  const map = new Map<string, UniformDeliveryTerm>();
  terms.forEach((term) => {
    if (term.status === "substituido" || map.has(term.batchId)) return;
    map.set(term.batchId, term);
  });
  return map;
}

function termStatusLabel(status?: UniformDeliveryTerm["status"]) {
  if (status === "assinado") return "Assinado";
  if (status === "substituido") return "Substituído";
  return "Aguardando assinatura";
}

function uniformSizeCorrectionOptions(items: PatrimonyItem[], sourceItem: PatrimonyItem, selectedItemId: string) {
  const sameFamily = items.filter((item) => {
    if (item.id === sourceItem.id) return false;
    if (!isUniform(item)) return false;
    return normalize(`${item.name} ${item.uniformFabric ?? ""} ${item.uniformColor ?? ""}`)
      === normalize(`${sourceItem.name} ${sourceItem.uniformFabric ?? ""} ${sourceItem.uniformColor ?? ""}`);
  });
  const options = sameFamily.length > 0 ? sameFamily : items.filter((item) => item.id !== sourceItem.id && isUniform(item));
  return options
    .filter((item) => item.availableQuantity > 0 || item.id === selectedItemId)
    .sort(compareUniformItems);
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function isSuccessNotice(value: string) {
  return normalize(value).includes("sucesso") || normalize(value).includes("pdf gerado");
}
