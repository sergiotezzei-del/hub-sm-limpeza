import { FormEvent, useEffect, useState } from "react";
import { SantaMariaBrand } from "../../components/SantaMariaBrand";
import { CaptureSchedulePicker } from "./CaptureSchedulePicker";
import { ExclusiveChoice } from "./ExclusiveChoice";
import {
  formatCaptureRange,
  MARKETING_CONTENT_OPTIONS,
  type MarketingCaptureSelection,
} from "./marketingConfig";
import {
  getPublicMarketingErrorMessage,
  loadPublicMarketingData,
  submitPublicMarketingRequest,
  type PublicMarketingAvailability,
  type PublicMarketingOptions,
  type PublicMarketingReceipt,
} from "./publicMarketingService";
import "./marketing.css";
import "./publicMarketing.css";

type PublicFormState = {
  requesterName: string;
  teamId: string;
  brokerName: string;
  hasPropertyCode: boolean;
  propertyReference: string;
  isExclusive: boolean | null;
  requestKind: "capture_edit" | "edit_only";
  contentTypes: string[];
  captureLocation: string;
  capturePreference: "choose" | "marketing";
  preferredCapture: MarketingCaptureSelection | null;
  assetLink: string;
  paidTraffic: boolean;
  requesterNotes: string;
  urgencyRequested: boolean;
  urgencyReason: string;
  hasMultipleProperties: boolean | null;
  website: string;
};

const emptyForm = (): PublicFormState => ({
  requesterName: "",
  teamId: "",
  brokerName: "",
  hasPropertyCode: true,
  propertyReference: "",
  isExclusive: null,
  requestKind: "capture_edit",
  contentTypes: ["video"],
  captureLocation: "",
  capturePreference: "marketing",
  preferredCapture: null,
  assetLink: "",
  paidTraffic: false,
  requesterNotes: "",
  urgencyRequested: false,
  urgencyReason: "",
  hasMultipleProperties: null,
  website: "",
});

export function PublicMarketingRequestPage() {
  const [submissionId, setSubmissionId] = useState(createSubmissionId);
  const [captureGroupId, setCaptureGroupId] = useState<string | null>(null);
  const [form, setForm] = useState<PublicFormState>(emptyForm);
  const [options, setOptions] = useState<PublicMarketingOptions | null>(null);
  const [availability, setAvailability] = useState<PublicMarketingAvailability | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState<PublicMarketingReceipt | null>(null);

  useEffect(() => {
    document.title = "Solicitação de Marketing | Santa Maria";
    let active = true;
    void loadPublicMarketingData()
      .then((data) => {
        if (!active) return;
        setOptions(data.options);
        setAvailability(data.availability);
        setForm((current) => ({ ...current, teamId: current.teamId || data.options.teams[0]?.id || "" }));
      })
      .catch((error) => {
        if (active) setMessage(getPublicMarketingErrorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  function toggleContent(value: string) {
    setForm((current) => ({
      ...current,
      contentTypes: current.contentTypes.includes(value)
        ? current.contentTypes.filter((item) => item !== value)
        : [...current.contentTypes, value],
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setMessage("");
    if (!form.requesterName.trim() || !form.teamId || !form.brokerName.trim()) {
      setMessage("Preencha solicitante, equipe e corretor.");
      return;
    }
    if (form.hasPropertyCode && !form.propertyReference.trim()) {
      setMessage("Informe o código do imóvel ou marque Ainda não.");
      return;
    }
    if (form.isExclusive === null) {
      setMessage("Informe se o imóvel é exclusividade.");
      return;
    }
    if (form.contentTypes.length === 0) {
      setMessage("Selecione pelo menos um tipo de conteúdo.");
      return;
    }
    if (form.requestKind === "capture_edit" && !form.captureLocation.trim()) {
      setMessage("Informe o local da captação.");
      return;
    }
    if (form.requestKind === "capture_edit" && form.capturePreference === "choose" && !form.preferredCapture) {
      setMessage("Escolha a data e o período da captação.");
      return;
    }
    if (form.requestKind === "capture_edit" && form.hasMultipleProperties === null) {
      setMessage("Informe se há mais de um imóvel nesta saída de captação.");
      return;
    }
    if (form.urgencyRequested && !form.urgencyReason.trim()) {
      setMessage("Explique o motivo da solicitação de urgência.");
      return;
    }

    setSubmitting(true);
    try {
      const nextCaptureGroupId = form.requestKind === "capture_edit" && form.hasMultipleProperties
        ? captureGroupId || createSubmissionId()
        : null;
      if (nextCaptureGroupId && !captureGroupId) setCaptureGroupId(nextCaptureGroupId);
      const nextReceipt = await submitPublicMarketingRequest({
        submissionId,
        requesterName: form.requesterName,
        teamId: form.teamId,
        brokerName: form.brokerName,
        hasPropertyCode: form.hasPropertyCode,
        propertyReference: form.propertyReference,
        isExclusive: form.isExclusive,
        requestKind: form.requestKind,
        contentTypes: form.contentTypes,
        captureLocation: form.requestKind === "capture_edit" ? form.captureLocation : undefined,
        preferredCaptureAt: form.requestKind === "capture_edit" ? form.preferredCapture?.startAt : undefined,
        preferredCaptureDurationMinutes: form.requestKind === "capture_edit" ? form.preferredCapture?.durationMinutes : undefined,
        assetLink: form.assetLink,
        paidTraffic: form.paidTraffic,
        requesterNotes: form.requesterNotes,
        urgencyRequested: form.urgencyRequested,
        urgencyReason: form.urgencyReason,
        website: form.website,
        captureGroupId: nextCaptureGroupId,
      });
      setReceipt(nextReceipt);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setMessage(getPublicMarketingErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  function addAnotherProperty() {
    const common = form;
    setSubmissionId(createSubmissionId());
    setForm({
      ...emptyForm(),
      requesterName: common.requesterName,
      teamId: common.teamId,
      brokerName: common.brokerName,
      requestKind: common.requestKind,
      contentTypes: common.contentTypes,
      captureLocation: common.captureLocation,
      capturePreference: common.capturePreference,
      preferredCapture: common.preferredCapture,
      requesterNotes: common.requesterNotes,
      hasMultipleProperties: true,
    });
    setReceipt(null);
    setMessage("");
    setPickerOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="marketing-public-page">
      <section className="marketing-public-shell">
        <header className="marketing-public-brand">
          <SantaMariaBrand className="marketing-public-logo" />
          <div><strong>SANTA MARIA</strong><span>SOLICITAÇÃO DE MARKETING</span><small>Envio direto para a equipe de Marketing</small></div>
        </header>

        {receipt ? (
          <section className="marketing-public-success" aria-live="polite">
            <span className="marketing-public-success-icon" aria-hidden="true">✓</span>
            <p className="marketing-public-eyebrow">PEDIDO ENVIADO</p>
            <h1>Seu pedido foi enviado diretamente ao Marketing.</h1>
            <article>
              <span>PEDIDO</span>
              <strong>#{receipt.requestNumber}</strong>
              <small>Equipe: {receipt.teamName}</small>
            </article>
            <p>O gerente da sua equipe e o Marketing poderão acompanhar o andamento pelo HUB.</p>
            {receipt.captureGroupId && form.hasMultipleProperties && (
              <button className="marketing-public-add-property" type="button" onClick={addAnotherProperty}>
                ADICIONAR OUTRO IMÓVEL DESTA MESMA SAÍDA
              </button>
            )}
          </section>
        ) : (
          <section className="marketing-public-card">
            <p className="marketing-public-eyebrow">SOLICITAÇÃO DE MARKETING</p>
            <h1>Envie seu pedido</h1>
            <p className="marketing-public-intro">Preencha as informações para enviar sua solicitação diretamente ao Marketing.</p>

            {loading ? <div className="marketing-public-loading">Carregando formulário...</div> : options && availability ? (
              <form onSubmit={submit}>
                <label>Nome de quem está fazendo a solicitação *<input value={form.requesterName} onChange={(event) => setForm({ ...form, requesterName: event.target.value })} maxLength={120} autoComplete="name" required /></label>
                <label>Equipe / gerente *<select value={form.teamId} onChange={(event) => setForm({ ...form, teamId: event.target.value })} required><option value="" disabled>Selecione...</option>{options.teams.map((team) => <option key={team.id} value={team.id}>{team.managerName}</option>)}</select></label>
                <label>Nome do corretor *<input value={form.brokerName} onChange={(event) => setForm({ ...form, brokerName: event.target.value })} maxLength={120} required /></label>

                <fieldset><legend>O imóvel já tem código?</legend><label><input type="radio" checked={form.hasPropertyCode} onChange={() => setForm({ ...form, hasPropertyCode: true })} /> Sim</label><label><input type="radio" checked={!form.hasPropertyCode} onChange={() => setForm({ ...form, hasPropertyCode: false, propertyReference: "" })} /> Ainda não</label></fieldset>
                <label className={!form.hasPropertyCode ? "marketing-public-field-disabled" : ""}>Código do imóvel<input value={form.propertyReference} onChange={(event) => setForm({ ...form, propertyReference: event.target.value })} maxLength={80} placeholder={form.hasPropertyCode ? "Ex.: 78119" : "Sem código informado"} required={form.hasPropertyCode} disabled={!form.hasPropertyCode} /></label>
                <ExclusiveChoice name="public-marketing-exclusive" value={form.isExclusive} onChange={(isExclusive) => setForm({ ...form, isExclusive })} />
                <p className="marketing-public-property-rule">Cada solicitação deve corresponder a um único imóvel.</p>

                <fieldset><legend>O que precisa?</legend><label><input type="radio" checked={form.requestKind === "capture_edit"} onChange={() => setForm({ ...form, requestKind: "capture_edit" })} /> Captação + edição</label><label><input type="radio" checked={form.requestKind === "edit_only"} onChange={() => { setForm({ ...form, requestKind: "edit_only", captureLocation: "", capturePreference: "marketing", preferredCapture: null }); setPickerOpen(false); }} /> Somente edição</label></fieldset>
                <fieldset className="marketing-public-content"><legend>Tipo de conteúdo *</legend>{MARKETING_CONTENT_OPTIONS.map((option) => <label key={option.value}><input type="checkbox" checked={form.contentTypes.includes(option.value)} onChange={() => toggleContent(option.value)} /> {option.label}</label>)}</fieldset>

                {form.requestKind === "capture_edit" && <>
                  <label>Local da captação *<input value={form.captureLocation} onChange={(event) => setForm({ ...form, captureLocation: event.target.value })} maxLength={300} placeholder="Endereço / empreendimento" required /></label>
                  <fieldset><legend>Há mais de um imóvel nesta mesma saída de captação?</legend><label><input type="radio" checked={form.hasMultipleProperties === true} onChange={() => setForm({ ...form, hasMultipleProperties: true })} /> Sim</label><label><input type="radio" checked={form.hasMultipleProperties === false} onChange={() => { setForm({ ...form, hasMultipleProperties: false }); setCaptureGroupId(null); }} /> Não</label></fieldset>
                  <fieldset className="marketing-public-capture-choice"><legend>Data da captação</legend><button type="button" className={form.capturePreference === "choose" ? "selected" : ""} onClick={() => { setForm({ ...form, capturePreference: "choose" }); setPickerOpen(true); }}>ESCOLHER DATA E HORÁRIO</button><button type="button" className={form.capturePreference === "marketing" ? "selected" : ""} onClick={() => { setForm({ ...form, capturePreference: "marketing", preferredCapture: null }); setPickerOpen(false); }}>DEIXAR O MARKETING DEFINIR</button>{form.capturePreference === "marketing" && <p>O Marketing definirá a melhor data e horário conforme disponibilidade.</p>}{form.capturePreference === "choose" && form.preferredCapture && !pickerOpen && <div><strong>{formatCaptureRange(form.preferredCapture.startAt, form.preferredCapture.durationMinutes, availability.scheduleConfig.timezone)}</strong><button type="button" onClick={() => setPickerOpen(true)}>ALTERAR</button></div>}</fieldset>
                  {form.capturePreference === "choose" && pickerOpen && <div className="marketing-public-picker"><CaptureSchedulePicker config={availability.scheduleConfig} occupiedSlots={availability.occupiedCaptureSlots} value={form.preferredCapture} onConfirm={(selection) => { setForm({ ...form, preferredCapture: selection }); setPickerOpen(false); }} onCancel={() => setPickerOpen(false)} /></div>}
                </>}

                <label>Link de arquivos<input type="url" value={form.assetLink} onChange={(event) => setForm({ ...form, assetLink: event.target.value })} maxLength={2000} placeholder="Google Drive, OneDrive..." /></label>
                <label className="marketing-public-check"><input type="checkbox" checked={form.paidTraffic} onChange={(event) => setForm({ ...form, paidTraffic: event.target.checked })} /> Tráfego pago</label>
                <label>Observações<textarea value={form.requesterNotes} onChange={(event) => setForm({ ...form, requesterNotes: event.target.value })} rows={4} maxLength={3000} /></label>
                <label className="marketing-public-check urgent"><input type="checkbox" checked={form.urgencyRequested} onChange={(event) => setForm({ ...form, urgencyRequested: event.target.checked })} /> Solicitar urgência <small>A urgência será analisada internamente e não altera a ordem automaticamente.</small></label>
                {form.urgencyRequested && <label>Motivo da urgência *<textarea value={form.urgencyReason} onChange={(event) => setForm({ ...form, urgencyReason: event.target.value })} rows={3} maxLength={1000} required /></label>}
                <label className="marketing-public-honeypot" aria-hidden="true">Site<input value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} tabIndex={-1} autoComplete="off" /></label>

                {message && <p className="marketing-public-error" role="alert">{message}</p>}
                <button className="marketing-public-submit" type="submit" disabled={submitting}>{submitting ? "Enviando..." : "ENVIAR PEDIDO"}</button>
              </form>
            ) : null}
            {!loading && message && !options && <p className="marketing-public-error" role="alert">{message}</p>}
          </section>
        )}

      </section>
    </main>
  );
}

function createSubmissionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
