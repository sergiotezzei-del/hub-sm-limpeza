import { FormEvent, useEffect, useMemo, useState } from "react";
import { SantaMariaBrand } from "../../components/SantaMariaBrand";
import { santaMariaRequestSectors } from "../../config/santaMariaSectors";
import {
  getPublicAuditorioErrorMessage,
  getPublicAuditorioStatus,
  loadPublicAuditorioAvailability,
  submitPublicAuditorioRequest,
} from "./services/auditorioService";
import type {
  AuditorioAvailability,
  AuditorioEventType,
  AuditorioFoodResponsible,
  AuditorioFoodType,
  AuditorioReservedSlot,
  PublicAuditorioReceipt,
  PublicAuditorioStatus,
} from "./types/auditorio.types";
import "./publicAuditorio.css";

type PublicMode = "agenda" | "consulta";

type PublicFormState = {
  requesterName: string;
  requesterPhone: string;
  requesterEmail: string;
  requesterDepartment: string;
  requesterCompany: string;
  eventType: AuditorioEventType;
  eventName: string;
  launchName: string;
  builderName: string;
  eventDate: string;
  setupTime: string;
  startTime: string;
  endTime: string;
  teardownTime: string;
  peopleCount: string;
  foodType: AuditorioFoodType;
  foodResponsible: AuditorioFoodResponsible | "";
  foodResponsibleOther: string;
  needsProjector: boolean;
  needsMicrophone: boolean;
  needsSound: boolean;
  needsChairs: boolean;
  needsTables: boolean;
  specialNeeds: string;
  notes: string;
  website: string;
};

type AvailabilitySegment = {
  start: string;
  end: string;
  status: "available" | "reserved";
};

const eventTypeOptions: Array<{ value: AuditorioEventType; label: string }> = [
  { value: "lancamento", label: "Lançamento" },
  { value: "treinamento", label: "Treinamento" },
  { value: "reuniao", label: "Reunião" },
  { value: "palestra", label: "Palestra" },
  { value: "evento_interno", label: "Evento interno" },
  { value: "apresentacao", label: "Apresentação" },
  { value: "outro", label: "Outro" },
];

const foodTypeOptions: Array<{ value: AuditorioFoodType; label: string }> = [
  { value: "nao", label: "Não" },
  { value: "coffee_break", label: "Coffee break" },
  { value: "buffet", label: "Buffet" },
];

const foodResponsibleOptions: Array<{ value: AuditorioFoodResponsible; label: string }> = [
  { value: "santa_maria", label: "Santa Maria" },
  { value: "construtora", label: "Construtora" },
  { value: "empresa_evento", label: "Empresa responsável pelo evento" },
  { value: "outro", label: "Outro" },
];

const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const emptyForm = (eventDate: string): PublicFormState => ({
  requesterName: "",
  requesterPhone: "",
  requesterEmail: "",
  requesterDepartment: "",
  requesterCompany: "",
  eventType: "reuniao",
  eventName: "",
  launchName: "",
  builderName: "",
  eventDate,
  setupTime: "18:00",
  startTime: "19:00",
  endTime: "21:00",
  teardownTime: "22:00",
  peopleCount: "",
  foodType: "nao",
  foodResponsible: "",
  foodResponsibleOther: "",
  needsProjector: false,
  needsMicrophone: false,
  needsSound: false,
  needsChairs: false,
  needsTables: false,
  specialNeeds: "",
  notes: "",
  website: "",
});

export function PublicAuditorioPage() {
  const publicTitle = "Agendamento do Auditório | Santa Maria";
  if (document.title !== publicTitle) {
    document.title = publicTitle;
    document.documentElement.setAttribute("data-hub-page-title", publicTitle);
  }

  const today = useMemo(() => toDateInput(new Date()), []);
  const normalizedPath = window.location.pathname.replace(/\/+$/, "") || "/";
  const params = new URLSearchParams(window.location.search);
  const initialMode: PublicMode = normalizedPath === "/auditorio/consulta" ? "consulta" : "agenda";
  const [mode, setMode] = useState<PublicMode>(initialMode);
  const [submissionId, setSubmissionId] = useState(createSubmissionId);
  const [accessCode, setAccessCode] = useState(createAccessCode);
  const [selectedDate, setSelectedDate] = useState(today);
  const [monthDate, setMonthDate] = useState(() => parseDateInput(today));
  const [form, setForm] = useState<PublicFormState>(() => emptyForm(today));
  const [availability, setAvailability] = useState<AuditorioAvailability | null>(null);
  const [loadingAvailability, setLoadingAvailability] = useState(true);
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState<PublicAuditorioReceipt | null>(null);
  const [lookupProtocol, setLookupProtocol] = useState(params.get("protocolo") || "");
  const [lookupCode, setLookupCode] = useState(params.get("codigo") || "");
  const [lookupStatus, setLookupStatus] = useState<PublicAuditorioStatus | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupMessage, setLookupMessage] = useState("");

  useEffect(() => {
    document.title = publicTitle;
    document.documentElement.setAttribute("data-hub-page-title", publicTitle);
    return () => {
      document.documentElement.removeAttribute("data-hub-page-title");
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoadingAvailability(true);
    setAvailabilityMessage("");
    void loadPublicAuditorioAvailability(monthDate.getFullYear(), monthDate.getMonth() + 1)
      .then((data) => {
        if (active) setAvailability(data);
      })
      .catch((error) => {
        if (active) setAvailabilityMessage(getPublicAuditorioErrorMessage(error));
      })
      .finally(() => {
        if (active) setLoadingAvailability(false);
      });
    return () => {
      active = false;
    };
  }, [monthDate]);

  useEffect(() => {
    setForm((current) => ({ ...current, eventDate: selectedDate }));
  }, [selectedDate]);

  const reservedSlotsByDate = useMemo(() => {
    const grouped = new Map<string, AuditorioReservedSlot[]>();
    for (const slot of availability?.reservedSlots ?? []) {
      const list = grouped.get(slot.date) ?? [];
      list.push(slot);
      grouped.set(slot.date, list);
    }
    for (const slots of grouped.values()) {
      slots.sort((first, second) => timeToMinutes(first.start) - timeToMinutes(second.start));
    }
    return grouped;
  }, [availability]);

  const selectedSegments = useMemo(
    () => buildDaySegments(availability, selectedDate),
    [availability, selectedDate],
  );

  const calendarDays = useMemo(() => buildCalendarDays(monthDate), [monthDate]);
  const selectedSlots = reservedSlotsByDate.get(selectedDate) ?? [];
  const hasCurrentConflict = hasOverlap(form.setupTime, form.teardownTime, selectedSlots);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setMessage("");
    const validation = validateForm(form, selectedSlots, today);
    if (validation) {
      setMessage(validation);
      return;
    }

    setSubmitting(true);
    try {
      const nextReceipt = await submitPublicAuditorioRequest({
        submissionId,
        accessCode,
        requesterName: form.requesterName,
        requesterPhone: form.requesterPhone,
        requesterEmail: form.requesterEmail,
        requesterDepartment: form.requesterDepartment,
        requesterCompany: form.requesterCompany,
        eventType: form.eventType,
        eventName: form.eventName,
        launchName: form.launchName,
        builderName: form.builderName,
        eventDate: form.eventDate,
        setupTime: form.setupTime,
        startTime: form.startTime,
        endTime: form.endTime,
        teardownTime: form.teardownTime,
        peopleCount: Number(form.peopleCount),
        foodType: form.foodType,
        foodResponsible: form.foodResponsible,
        foodResponsibleOther: form.foodResponsibleOther,
        needsProjector: form.needsProjector,
        needsMicrophone: form.needsMicrophone,
        needsSound: form.needsSound,
        needsChairs: form.needsChairs,
        needsTables: form.needsTables,
        specialNeeds: form.specialNeeds,
        notes: form.notes,
        website: form.website,
      });
      setReceipt(nextReceipt);
      setLookupProtocol(nextReceipt.protocol);
      setLookupCode(nextReceipt.accessCode);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setMessage(getPublicAuditorioErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function consult(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (lookupLoading) return;
    setLookupMessage("");
    setLookupStatus(null);

    if (!lookupProtocol.trim() || !lookupCode.trim()) {
      setLookupMessage("Informe protocolo e código de consulta.");
      return;
    }

    setLookupLoading(true);
    try {
      setLookupStatus(await getPublicAuditorioStatus(lookupProtocol, lookupCode));
    } catch (error) {
      setLookupMessage(getPublicAuditorioErrorMessage(error));
    } finally {
      setLookupLoading(false);
    }
  }

  function selectDay(dateValue: string) {
    setSelectedDate(dateValue);
    const parsed = parseDateInput(dateValue);
    if (parsed.getMonth() !== monthDate.getMonth() || parsed.getFullYear() !== monthDate.getFullYear()) {
      setMonthDate(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
    }
    setReceipt(null);
    setMessage("");
  }

  function changeMonth(offset: number) {
    const next = new Date(monthDate.getFullYear(), monthDate.getMonth() + offset, 1);
    setMonthDate(next);
    if (offset !== 0) {
      const selected = parseDateInput(selectedDate);
      if (selected.getFullYear() !== next.getFullYear() || selected.getMonth() !== next.getMonth()) {
        const fallback = toDateInput(new Date(next.getFullYear(), next.getMonth(), 1));
        setSelectedDate(fallback < today ? today : fallback);
      }
    }
  }

  function useSegment(segment: AvailabilitySegment) {
    setSelectedDate(selectedDate);
    setForm((current) => ({
      ...current,
      eventDate: selectedDate,
      setupTime: segment.start,
      startTime: segment.start,
      endTime: segment.end,
      teardownTime: segment.end,
    }));
    setMessage("");
  }

  function startAnotherRequest() {
    const nextSubmissionId = createSubmissionId();
    const nextAccessCode = createAccessCode();
    setSubmissionId(nextSubmissionId);
    setAccessCode(nextAccessCode);
    setForm(emptyForm(selectedDate));
    setReceipt(null);
    setMessage("");
    setMode("agenda");
    void loadPublicAuditorioAvailability(monthDate.getFullYear(), monthDate.getMonth() + 1)
      .then(setAvailability)
      .catch((error) => setAvailabilityMessage(getPublicAuditorioErrorMessage(error)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="auditorio-public-page">
      <section className="auditorio-public-shell">
        <header className="auditorio-public-brand">
          <SantaMariaBrand className="auditorio-public-logo panel-corner-brand" />
          <div>
            <strong>Agendamento do Auditório</strong>
            <span>HUB Santa Maria</span>
          </div>
        </header>

        <nav className="auditorio-public-tabs" aria-label="Agendamento e consulta">
          <button className={mode === "agenda" ? "active" : ""} type="button" onClick={() => setMode("agenda")}>Agendar</button>
          <button className={mode === "consulta" ? "active" : ""} type="button" onClick={() => setMode("consulta")}>Consultar solicitação</button>
        </nav>

        {mode === "consulta" ? (
          <section className="auditorio-public-card">
            <p className="auditorio-public-eyebrow">Acompanhamento</p>
            <h1>Consulta de solicitação</h1>
            <p className="auditorio-public-intro">
              Use o protocolo e o código recebidos ao enviar o pedido.
            </p>

            <form className="auditorio-consult-form" onSubmit={consult}>
              <label>
                <span>Protocolo *</span>
                <input value={lookupProtocol} onChange={(event) => setLookupProtocol(event.target.value)} placeholder="AUD-2026-000001" required />
              </label>
              <label>
                <span>Código de consulta *</span>
                <input value={lookupCode} onChange={(event) => setLookupCode(event.target.value.toUpperCase())} placeholder="ABCD-1234" required />
              </label>
              {lookupMessage && <p className="auditorio-public-error" role="alert">{lookupMessage}</p>}
              <button className="auditorio-public-primary" type="submit" disabled={lookupLoading}>
                {lookupLoading ? "Consultando..." : "Consultar"}
              </button>
            </form>

            {lookupStatus && (
              <article className="auditorio-status-card">
                <span className={`auditorio-status-pill status-${lookupStatus.status}`}>{lookupStatus.statusLabel}</span>
                <h2>{lookupStatus.eventName}</h2>
                <dl>
                  <div><dt>Protocolo</dt><dd>{lookupStatus.protocol}</dd></div>
                  <div><dt>Data</dt><dd>{formatDate(lookupStatus.eventDate)}</dd></div>
                  <div><dt>Uso do auditório</dt><dd>{lookupStatus.setupTime} às {lookupStatus.teardownTime}</dd></div>
                  <div><dt>Evento</dt><dd>{lookupStatus.startTime} às {lookupStatus.endTime}</dd></div>
                  <div><dt>Público estimado</dt><dd>{lookupStatus.peopleCount} pessoas</dd></div>
                  <div><dt>Alimentação</dt><dd>{lookupStatus.foodTypeLabel}</dd></div>
                </dl>
                {lookupStatus.adminNote && (
                  <p className="auditorio-admin-note"><strong>Observação:</strong> {lookupStatus.adminNote}</p>
                )}
              </article>
            )}
          </section>
        ) : receipt ? (
          <section className="auditorio-public-success" aria-live="polite">
            <span className="auditorio-success-icon" aria-hidden="true">✓</span>
            <p className="auditorio-public-eyebrow">Solicitação enviada</p>
            <h1>Pedido registrado como pendente</h1>
            <p>Guarde o protocolo e o código para acompanhar a aprovação.</p>

            <article className="auditorio-receipt">
              <span>Protocolo</span>
              <strong>{receipt.protocol}</strong>
              <small>Enviado em {formatDateTime(receipt.createdAt)}</small>
            </article>

            <article className="auditorio-receipt code">
              <span>Código de consulta</span>
              <strong>{receipt.accessCode}</strong>
              <small>Esse código não aparece para a administração.</small>
            </article>

            <div className="auditorio-success-actions">
              <a className="auditorio-public-secondary" href={`/auditorio/consulta?protocolo=${encodeURIComponent(receipt.protocol)}&codigo=${encodeURIComponent(receipt.accessCode)}`}>
                Consultar status
              </a>
              <button className="auditorio-public-primary" type="button" onClick={startAnotherRequest}>Novo agendamento</button>
            </div>
          </section>
        ) : (
          <section className="auditorio-public-grid">
            <section className="auditorio-public-card calendar-card">
              <div className="auditorio-calendar-head">
                <div>
                  <p className="auditorio-public-eyebrow">Calendário</p>
                  <h1>{formatMonth(monthDate)}</h1>
                </div>
                <div className="auditorio-month-actions">
                  <button type="button" onClick={() => changeMonth(-1)} aria-label="Mês anterior">‹</button>
                  <button type="button" onClick={() => changeMonth(1)} aria-label="Próximo mês">›</button>
                </div>
              </div>

              {availabilityMessage && <p className="auditorio-public-error" role="alert">{availabilityMessage}</p>}

              <div className="auditorio-calendar" aria-label="Calendário mensal">
                {weekDays.map((day) => <span className="auditorio-weekday" key={day}>{day}</span>)}
                {calendarDays.map((day) => {
                  const slots = reservedSlotsByDate.get(day.value) ?? [];
                  const selected = day.value === selectedDate;
                  const disabled = day.value < today;
                  return (
                    <button
                      className={[
                        "auditorio-day",
                        day.currentMonth ? "" : "muted",
                        selected ? "selected" : "",
                        disabled ? "disabled" : "",
                      ].filter(Boolean).join(" ")}
                      type="button"
                      key={day.value}
                      onClick={() => !disabled && selectDay(day.value)}
                      disabled={disabled}
                      aria-pressed={selected}
                    >
                      <strong>{day.label}</strong>
                      <span>{slots.length > 0 ? `${slots.length} reserva${slots.length > 1 ? "s" : ""}` : "Livre"}</span>
                    </button>
                  );
                })}
              </div>
              {loadingAvailability && <p className="auditorio-loading">Carregando disponibilidade...</p>}
            </section>

            <aside className="auditorio-public-card availability-card">
              <p className="auditorio-public-eyebrow">Disponibilidade</p>
              <h2>{formatDate(selectedDate)}</h2>
              <div className="auditorio-day-segments">
                {selectedSegments.length === 0 ? (
                  <p className="auditorio-empty-text">Selecione uma data para ver os horários.</p>
                ) : selectedSegments.map((segment) => (
                  <article className={`auditorio-segment ${segment.status}`} key={`${segment.start}-${segment.end}-${segment.status}`}>
                    <span>{segment.start} às {segment.end}</span>
                    <strong>{segment.status === "reserved" ? "Reservado" : "Disponível"}</strong>
                    {segment.status === "available" && (
                      <button type="button" onClick={() => useSegment(segment)}>Usar intervalo</button>
                    )}
                  </article>
                ))}
              </div>
            </aside>

            <section className="auditorio-public-card form-card">
              <p className="auditorio-public-eyebrow">Solicitação</p>
              <h2>Dados para análise</h2>
              <form onSubmit={submit}>
                <fieldset>
                  <legend>Dados do solicitante</legend>
                  <label>
                    <span>Nome do solicitante *</span>
                    <input value={form.requesterName} onChange={(event) => updateForm({ requesterName: event.target.value })} autoComplete="name" maxLength={140} required />
                  </label>
                  <label>
                    <span>Telefone / WhatsApp *</span>
                    <input value={form.requesterPhone} onChange={(event) => updateForm({ requesterPhone: event.target.value })} autoComplete="tel" maxLength={40} required />
                  </label>
                  <label>
                    <span>E-mail</span>
                    <input type="email" value={form.requesterEmail} onChange={(event) => updateForm({ requesterEmail: event.target.value })} autoComplete="email" maxLength={180} />
                  </label>
                  <label>
                    <span>Setor</span>
                    <select value={form.requesterDepartment} onChange={(event) => updateForm({ requesterDepartment: event.target.value })}>
                      <option value="">Selecione, se aplicável</option>
                      {santaMariaRequestSectors.map((sector) => <option key={sector} value={sector}>{sector}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Empresa</span>
                    <input value={form.requesterCompany} onChange={(event) => updateForm({ requesterCompany: event.target.value })} maxLength={160} />
                  </label>
                </fieldset>

                <fieldset>
                  <legend>Evento</legend>
                  <label>
                    <span>Nome do evento *</span>
                    <input value={form.eventName} onChange={(event) => updateForm({ eventName: event.target.value })} maxLength={180} required />
                  </label>
                  <label>
                    <span>Tipo de evento *</span>
                    <select value={form.eventType} onChange={(event) => updateForm({ eventType: event.target.value as AuditorioEventType })} required>
                      {eventTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  {form.eventType === "lancamento" && (
                    <>
                      <label>
                        <span>Nome do lançamento *</span>
                        <input value={form.launchName} onChange={(event) => updateForm({ launchName: event.target.value })} maxLength={180} required />
                      </label>
                      <label>
                        <span>Construtora *</span>
                        <input value={form.builderName} onChange={(event) => updateForm({ builderName: event.target.value })} maxLength={180} required />
                      </label>
                    </>
                  )}
                  <label>
                    <span>Data *</span>
                    <input type="date" value={form.eventDate} min={today} onChange={(event) => selectDay(event.target.value)} required />
                  </label>
                  <label>
                    <span>Quantidade estimada de pessoas *</span>
                    <input type="number" min="1" max="500" value={form.peopleCount} onChange={(event) => updateForm({ peopleCount: event.target.value })} required />
                  </label>
                </fieldset>

                <fieldset>
                  <legend>Montagem e uso do auditório</legend>
                  <label>
                    <span>Início da montagem *</span>
                    <input type="time" step="1800" value={form.setupTime} onChange={(event) => updateForm({ setupTime: event.target.value })} required />
                  </label>
                  <label>
                    <span>Início do evento *</span>
                    <input type="time" step="1800" value={form.startTime} onChange={(event) => updateForm({ startTime: event.target.value })} required />
                  </label>
                  <label>
                    <span>Término do evento *</span>
                    <input type="time" step="1800" value={form.endTime} onChange={(event) => updateForm({ endTime: event.target.value })} required />
                  </label>
                  <label>
                    <span>Finalização / desmontagem *</span>
                    <input type="time" step="1800" value={form.teardownTime} onChange={(event) => updateForm({ teardownTime: event.target.value })} required />
                  </label>
                  {hasCurrentConflict && (
                    <p className="auditorio-public-warning">
                      O período total de uso do auditório conflita com uma reserva aprovada.
                    </p>
                  )}
                </fieldset>

                <fieldset>
                  <legend>Alimentação</legend>
                  <label>
                    <span>Terá alimentação? *</span>
                    <select value={form.foodType} onChange={(event) => updateForm({ foodType: event.target.value as AuditorioFoodType, foodResponsible: "", foodResponsibleOther: "" })}>
                      {foodTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  {form.foodType !== "nao" && (
                    <>
                      <label>
                        <span>Responsável *</span>
                        <select value={form.foodResponsible} onChange={(event) => updateForm({ foodResponsible: event.target.value as AuditorioFoodResponsible })} required>
                          <option value="" disabled>Selecione</option>
                          {foodResponsibleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </label>
                      {form.foodResponsible === "outro" && (
                        <label>
                          <span>Descreva o responsável *</span>
                          <input value={form.foodResponsibleOther} onChange={(event) => updateForm({ foodResponsibleOther: event.target.value })} maxLength={180} required />
                        </label>
                      )}
                    </>
                  )}
                </fieldset>

                <fieldset className="auditorio-checkbox-grid">
                  <legend>Estrutura do auditório</legend>
                  <CheckLabel label="Projetor / TV" checked={form.needsProjector} onChange={(value) => updateForm({ needsProjector: value })} />
                  <CheckLabel label="Microfone" checked={form.needsMicrophone} onChange={(value) => updateForm({ needsMicrophone: value })} />
                  <CheckLabel label="Sistema de som" checked={form.needsSound} onChange={(value) => updateForm({ needsSound: value })} />
                  <CheckLabel label="Organizar cadeiras" checked={form.needsChairs} onChange={(value) => updateForm({ needsChairs: value })} />
                  <CheckLabel label="Mesas" checked={form.needsTables} onChange={(value) => updateForm({ needsTables: value })} />
                  <label className="wide">
                    <span>Necessidade especial</span>
                    <textarea value={form.specialNeeds} onChange={(event) => updateForm({ specialNeeds: event.target.value })} rows={3} maxLength={1200} />
                  </label>
                </fieldset>

                <label className="auditorio-full-field">
                  <span>Observações / informações adicionais</span>
                  <textarea value={form.notes} onChange={(event) => updateForm({ notes: event.target.value })} rows={4} maxLength={2500} />
                </label>

                <label className="auditorio-honeypot" tabIndex={-1}>
                  <span>Website</span>
                  <input value={form.website} onChange={(event) => updateForm({ website: event.target.value })} autoComplete="off" tabIndex={-1} />
                </label>

                {message && <p className="auditorio-public-error" role="alert">{message}</p>}

                <button className="auditorio-public-primary" type="submit" disabled={submitting}>
                  {submitting ? "Enviando..." : "Enviar solicitação"}
                </button>
              </form>
            </section>
          </section>
        )}

        <footer className="auditorio-public-footer">Desenvolvido por TEZZEI</footer>
      </section>
    </main>
  );

  function updateForm(patch: Partial<PublicFormState>) {
    setForm((current) => ({ ...current, ...patch }));
  }
}

function CheckLabel({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="auditorio-check-label">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function validateForm(form: PublicFormState, reservedSlots: AuditorioReservedSlot[], today: string) {
  if (!form.requesterName.trim()) return "Informe o nome do solicitante.";
  if (!form.requesterPhone.trim()) return "Informe o telefone ou WhatsApp.";
  if (!form.eventName.trim()) return "Informe o nome do evento.";
  if (form.eventType === "lancamento" && (!form.launchName.trim() || !form.builderName.trim())) {
    return "Informe o nome do lançamento e a construtora.";
  }
  if (!form.eventDate || form.eventDate < today) return "Escolha uma data válida.";
  if (!isOrderedTimeRange(form.setupTime, form.startTime, form.endTime, form.teardownTime)) {
    return "Confira os horários: montagem deve iniciar antes do evento e desmontagem deve terminar depois.";
  }
  if (!Number.isFinite(Number(form.peopleCount)) || Number(form.peopleCount) <= 0) {
    return "Informe a quantidade estimada de pessoas.";
  }
  if (form.foodType !== "nao" && !form.foodResponsible) return "Informe quem será responsável pela alimentação.";
  if (form.foodResponsible === "outro" && !form.foodResponsibleOther.trim()) return "Descreva o responsável pela alimentação.";
  if (hasOverlap(form.setupTime, form.teardownTime, reservedSlots)) {
    return "Esse período conflita com uma reserva aprovada. Escolha outro horário.";
  }
  return "";
}

function buildCalendarDays(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const start = new Date(year, month, 1 - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    return {
      value: toDateInput(date),
      label: String(date.getDate()),
      currentMonth: date.getMonth() === month,
    };
  });
}

function buildDaySegments(availability: AuditorioAvailability | null, dateValue: string): AvailabilitySegment[] {
  if (!availability) return [];
  const dayStart = timeToMinutes(availability.dayStart);
  const dayEnd = timeToMinutes(availability.dayEnd);
  const reserved = availability.reservedSlots
    .filter((slot) => slot.date === dateValue)
    .map((slot) => ({
      start: Math.max(dayStart, timeToMinutes(slot.start)),
      end: Math.min(dayEnd, timeToMinutes(slot.end)),
    }))
    .filter((slot) => slot.start < slot.end)
    .sort((first, second) => first.start - second.start);

  const segments: AvailabilitySegment[] = [];
  let cursor = dayStart;
  for (const slot of reserved) {
    if (cursor < slot.start) {
      segments.push({ start: minutesToTime(cursor), end: minutesToTime(slot.start), status: "available" });
    }
    segments.push({ start: minutesToTime(slot.start), end: minutesToTime(slot.end), status: "reserved" });
    cursor = Math.max(cursor, slot.end);
  }
  if (cursor < dayEnd) segments.push({ start: minutesToTime(cursor), end: minutesToTime(dayEnd), status: "available" });
  return segments;
}

function hasOverlap(start: string, end: string, slots: AuditorioReservedSlot[]) {
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || startMinutes >= endMinutes) return false;
  return slots.some((slot) => startMinutes < timeToMinutes(slot.end) && endMinutes > timeToMinutes(slot.start));
}

function isOrderedTimeRange(setup: string, start: string, end: string, teardown: string) {
  const setupMinutes = timeToMinutes(setup);
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  const teardownMinutes = timeToMinutes(teardown);
  return setupMinutes <= startMinutes && startMinutes < endMinutes && endMinutes <= teardownMinutes;
}

function timeToMinutes(value: string) {
  const [hour = "", minute = ""] = value.split(":");
  const parsedHour = Number(hour);
  const parsedMinute = Number(minute);
  if (!Number.isFinite(parsedHour) || !Number.isFinite(parsedMinute)) return Number.NaN;
  return parsedHour * 60 + parsedMinute;
}

function minutesToTime(value: number) {
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseDateInput(value: string) {
  return new Date(`${value}T12:00:00`);
}

function toDateInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatMonth(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeZone: "America/Sao_Paulo",
  }).format(parseDateInput(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function createSubmissionId() {
  const browserCrypto = globalThis.crypto;
  if (browserCrypto && typeof browserCrypto.randomUUID === "function") {
    return browserCrypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (browserCrypto && typeof browserCrypto.getRandomValues === "function") {
    browserCrypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function createAccessCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  const browserCrypto = globalThis.crypto;
  if (browserCrypto && typeof browserCrypto.getRandomValues === "function") {
    browserCrypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  const raw = Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}
