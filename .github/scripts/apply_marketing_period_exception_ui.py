from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Expected text not found in {path}: {old[:180]!r}")
    p.write_text(text.replace(old, new, 1))


service = "src/modules/marketing/marketingService.ts"
feature = "src/modules/marketing/MarketingFeature.tsx"
css = "src/modules/marketing/marketing.css"

replace_once(
    service,
    '''  managerReviewStatus?: MarketingManagerReviewStatus | null;\n  managerReviewUpdatedAt?: string | null;\n  completedAt?: string | null;''',
    '''  managerReviewStatus?: MarketingManagerReviewStatus | null;\n  managerReviewUpdatedAt?: string | null;\n  specialCaptureAt?: string | null;\n  specialCaptureReason?: string | null;\n  specialCaptureStatus?: "pending" | "approved" | "rejected" | null;\n  specialCaptureDecidedByName?: string | null;\n  specialCaptureDecidedAt?: string | null;\n  completedAt?: string | null;''',
)

replace_once(
    service,
    '''export async function rescheduleMarketingRequest(sessionToken: string, requestId: string) {\n  await rpc<unknown>("marketing_v2_reschedule_request", {\n    p_session_token: sessionToken,\n    p_request_id: requestId,\n  });\n}\n\nexport async function requestMarketingQueueOverride''',
    '''export async function rescheduleMarketingRequest(sessionToken: string, requestId: string) {\n  await rpc<unknown>("marketing_v2_reschedule_request", {\n    p_session_token: sessionToken,\n    p_request_id: requestId,\n  });\n}\n\nexport async function requestMarketingPeriodException(\n  sessionToken: string,\n  requestId: string,\n  specialCaptureAt: string,\n  reason: string,\n) {\n  await rpc<unknown>("marketing_v2_request_period_exception", {\n    p_session_token: sessionToken,\n    p_request_id: requestId,\n    p_special_capture_at: specialCaptureAt,\n    p_reason: reason,\n  });\n}\n\nexport async function decideMarketingPeriodException(\n  sessionToken: string,\n  requestId: string,\n  decision: "approved" | "rejected",\n) {\n  await rpc<unknown>("marketing_v2_decide_special_capture", {\n    p_session_token: sessionToken,\n    p_request_id: requestId,\n    p_decision: decision,\n  });\n}\n\nexport async function requestMarketingQueueOverride''',
)

replace_once(
    service,
    '''  if (normalized.includes("MARKETING_RESCHEDULE_NOT_SCHEDULED")) return "Este pedido não está mais agendado. Atualize o Marketing e confira a fila.";\n  if (normalized.includes("MARKETING_TEAM_REQUIRED"))''',
    '''  if (normalized.includes("MARKETING_RESCHEDULE_NOT_SCHEDULED")) return "Este pedido não está mais agendado. Atualize o Marketing e confira a fila.";\n  if (normalized.includes("MARKETING_SPECIAL_REQUEST_DENIED")) return "Somente Maria e Arthur podem solicitar uma exceção de agenda.";\n  if (normalized.includes("MARKETING_SPECIAL_DECISION_DENIED")) return "Somente Sérgio Tezzei pode aprovar ou negar esta exceção de agenda.";\n  if (normalized.includes("MARKETING_SPECIAL_REASON_REQUIRED")) return "Explique o motivo da emergência com pelo menos 5 caracteres.";\n  if (normalized.includes("MARKETING_SPECIAL_TIME_INVALID")) return "Escolha uma data e horário futuros.";\n  if (normalized.includes("MARKETING_SPECIAL_TIME_NOT_STANDARD_SLOT")) return "A exceção deve usar um dos horários da agenda: 08, 09, 10, 11, 14, 15, 16 ou 17h.";\n  if (normalized.includes("MARKETING_SPECIAL_PERIOD_NOT_RESERVED")) return "Esse período está livre. Use o agendamento normal, sem pedir exceção.";\n  if (normalized.includes("MARKETING_SPECIAL_EXACT_CONFLICT")) return "Já existe uma captação exatamente nesse horário. Escolha outro horário do período.";\n  if (normalized.includes("MARKETING_SPECIAL_ALREADY_PENDING")) return "Já existe uma exceção aguardando autorização para este pedido.";\n  if (normalized.includes("MARKETING_SPECIAL_NOT_PENDING")) return "Esta exceção já foi analisada ou não está mais pendente.";\n  if (normalized.includes("MARKETING_TEAM_REQUIRED"))''',
)

replace_once(
    feature,
    '''  MarketingCaptureSelection,\n} from "./marketingConfig";''',
    '''  MarketingCaptureSelection,\n  zonedLocalToIso,\n} from "./marketingConfig";''',
)

replace_once(
    feature,
    '''  createMarketingRequest,\n  decideMarketingQueueOverride,''',
    '''  createMarketingRequest,\n  decideMarketingPeriodException,\n  decideMarketingQueueOverride,''',
)

replace_once(
    feature,
    '''  requestMarketingQueueOverride,\n  rescheduleMarketingRequest,''',
    '''  requestMarketingPeriodException,\n  requestMarketingQueueOverride,\n  rescheduleMarketingRequest,''',
)

replace_once(
    feature,
    '''  const adminAlerts = dashboard?.context.role === "admin" && alertHost\n    ? dashboard.requests.filter((request) => request.status === "solicitado" || (request.urgencyRequested && !request.urgencyDecidedAt)).slice(0, 8)\n    : [];\n  const queueOverrideAlerts''',
    '''  const adminAlerts = dashboard?.context.role === "admin" && alertHost\n    ? dashboard.requests.filter((request) => request.specialCaptureStatus !== "pending" && (request.status === "solicitado" || (request.urgencyRequested && !request.urgencyDecidedAt))).slice(0, 8)\n    : [];\n  const specialCaptureAlerts = dashboard?.context.userId === "tezzei" && alertHost\n    ? dashboard.requests.filter((request) => request.specialCaptureStatus === "pending").slice(0, 8)\n    : [];\n  const queueOverrideAlerts''',
)

replace_once(
    feature,
    '''      {alertHost && queueOverrideAlerts.map((override) => createPortal(''',
    '''      {alertHost && specialCaptureAlerts.map((request) => createPortal(\n        <article className="hub-alert-card marketing-day-alert is-urgent" key={`marketing-special-alert-${request.id}`} data-marketing-request-id={request.id}>\n          <div className="hub-alert-card-status"><span>EXCEÇÃO DE AGENDA</span><time>{formatTime(request.updatedAt)}</time></div>\n          <h3>Marketing pediu sua autorização</h3>\n          <p>Pedido #{request.requestNumber} · {request.brokerName}</p>\n          <small>{request.specialCaptureAt ? formatMarketingDateTime(request.specialCaptureAt, dashboard!.scheduleConfig.timezone) : "Horário não informado"} · {request.specialCaptureReason}</small>\n          <button className="hub-alert-done-button marketing-alert-open" type="button" onClick={() => { setSelected(request); setTab("central"); props.onOpen(); }}>ANALISAR</button>\n        </article>,\n        alertHost,\n      ))}\n      {alertHost && queueOverrideAlerts.map((override) => createPortal(''',
)

replace_once(
    feature,
    '''  const [adminEditOpen, setAdminEditOpen] = useState(false);\n  const [deleteOpen, setDeleteOpen] = useState(false);\n  const canManage = props.role === "admin" || props.role === "marketing";''',
    '''  const [adminEditOpen, setAdminEditOpen] = useState(false);\n  const [deleteOpen, setDeleteOpen] = useState(false);\n  const [periodExceptionOpen, setPeriodExceptionOpen] = useState(false);\n  const [periodExceptionDate, setPeriodExceptionDate] = useState("");\n  const [periodExceptionTime, setPeriodExceptionTime] = useState("14:00");\n  const [periodExceptionReason, setPeriodExceptionReason] = useState("");\n  const canManage = props.role === "admin" || props.role === "marketing";\n  const isMarketingScheduler = props.dashboard.context.userId === "maria" || props.dashboard.context.userId === "arthur";''',
)

replace_once(
    feature,
    '''  async function requestOverride(event: FormEvent) {''',
    '''  async function requestPeriodException(event: FormEvent) {\n    event.preventDefault();\n    if (!periodExceptionDate || !periodExceptionTime) { props.onError("Escolha a data e o horário da emergência."); return; }\n    if (periodExceptionReason.trim().length < 5) { props.onError("Explique o motivo da emergência com pelo menos 5 caracteres."); return; }\n    setBusy(true);\n    props.onError("");\n    try {\n      const specialAt = zonedLocalToIso(periodExceptionDate, periodExceptionTime, props.dashboard.scheduleConfig.timezone);\n      await requestMarketingPeriodException(props.sessionToken, props.request.id, specialAt, periodExceptionReason.trim());\n      props.onNotice(`Exceção do pedido #${props.request.requestNumber} enviada para autorização de Sérgio Tezzei.`);\n      setPeriodExceptionOpen(false);\n      setPeriodExceptionReason("");\n      setCapturePickerOpen(false);\n      await props.onChanged();\n    } catch (error) {\n      props.onError(getMarketingErrorMessage(error));\n    } finally {\n      setBusy(false);\n    }\n  }\n\n  async function decidePeriodException(decision: "approved" | "rejected") {\n    if (busy) return;\n    setBusy(true);\n    props.onError("");\n    try {\n      await decideMarketingPeriodException(props.sessionToken, props.request.id, decision);\n      props.onNotice(decision === "approved" ? `Exceção do pedido #${props.request.requestNumber} aprovada e agendada.` : `Exceção do pedido #${props.request.requestNumber} negada. O pedido continua aguardando outro horário.`);\n      await props.onChanged();\n      if (decision === "approved") props.onClose();\n    } catch (error) {\n      props.onError(getMarketingErrorMessage(error));\n    } finally {\n      setBusy(false);\n    }\n  }\n\n  async function requestOverride(event: FormEvent) {''',
)

replace_once(
    feature,
    '''        {props.request.urgencyRequested && <div className={`marketing-urgency-box ${props.request.urgencyApproved ? "approved" : ""}`}><strong>Urgência solicitada</strong><p>{props.request.urgencyReason}</p><small>{props.request.urgencyDecidedAt ? `${props.request.urgencyApproved ? "Aprovada" : "Mantida na fila normal"} por ${props.request.urgencyDecidedByName || "Admin"}` : "Aguardando análise interna"}</small>{props.role === "admin" && !props.request.urgencyDecidedAt && <div><button type="button" disabled={busy} onClick={() => void run("approve_urgency")}>APROVAR PRIORIDADE</button><button type="button" disabled={busy} onClick={() => void run("reject_urgency")}>MANTER FILA</button></div>}</div>}\n        {props.role === "admin" && <div className="marketing-admin-actions">''',
    '''        {props.request.urgencyRequested && <div className={`marketing-urgency-box ${props.request.urgencyApproved ? "approved" : ""}`}><strong>Urgência solicitada</strong><p>{props.request.urgencyReason}</p><small>{props.request.urgencyDecidedAt ? `${props.request.urgencyApproved ? "Aprovada" : "Mantida na fila normal"} por ${props.request.urgencyDecidedByName || "Admin"}` : "Aguardando análise interna"}</small>{props.role === "admin" && !props.request.urgencyDecidedAt && <div><button type="button" disabled={busy} onClick={() => void run("approve_urgency")}>APROVAR PRIORIDADE</button><button type="button" disabled={busy} onClick={() => void run("reject_urgency")}>MANTER FILA</button></div>}</div>}\n        {props.request.specialCaptureStatus === "pending" && props.request.specialCaptureAt && (\n          <section className="marketing-period-exception pending">\n            <strong>EXCEÇÃO DE AGENDA · AGUARDANDO AUTORIZAÇÃO</strong>\n            <h3>{formatMarketingDateTime(props.request.specialCaptureAt, props.dashboard.scheduleConfig.timezone)}</h3>\n            <p>{props.request.specialCaptureReason}</p>\n            {props.dashboard.context.userId === "tezzei" && props.role === "admin" ? (\n              <div><button type="button" disabled={busy} onClick={() => void decidePeriodException("approved")}>APROVAR E AGENDAR</button><button type="button" className="secondary" disabled={busy} onClick={() => void decidePeriodException("rejected")}>NÃO APROVAR</button></div>\n            ) : <small>Somente Sérgio Tezzei pode aprovar. O pedido ainda NÃO está agendado.</small>}\n          </section>\n        )}\n        {props.request.specialCaptureStatus === "rejected" && props.request.specialCaptureAt && <section className="marketing-period-exception rejected"><strong>EXCEÇÃO NÃO APROVADA</strong><p>{formatMarketingDateTime(props.request.specialCaptureAt, props.dashboard.scheduleConfig.timezone)} · escolha outro período disponível.</p></section>}\n        {props.role === "admin" && <div className="marketing-admin-actions">''',
)

replace_once(
    feature,
    '''              {capturePickerOpen && (\n                <CaptureSchedulePicker\n                  config={props.dashboard.scheduleConfig}\n                  occupiedSlots={props.dashboard.occupiedCaptureSlots}\n                  excludedRequestId={props.request.id}\n                  excludedCaptureGroupId={props.request.captureGroupId}\n                  value={confirmed}\n                  onCancel={() => setCapturePickerOpen(false)}\n                  onConfirm={(selection) => { setConfirmed(selection); setCapturePickerOpen(false); }}\n                />\n              )}\n            </section>''',
    '''              {capturePickerOpen && (\n                <CaptureSchedulePicker\n                  config={props.dashboard.scheduleConfig}\n                  occupiedSlots={props.dashboard.occupiedCaptureSlots}\n                  excludedRequestId={props.request.id}\n                  excludedCaptureGroupId={props.request.captureGroupId}\n                  value={confirmed}\n                  onCancel={() => setCapturePickerOpen(false)}\n                  onConfirm={(selection) => { setConfirmed(selection); setCapturePickerOpen(false); }}\n                />\n              )}\n              {isMarketingScheduler && props.request.specialCaptureStatus !== "pending" && (\n                <div className="marketing-period-exception-callout">\n                  <strong>PERÍODO JÁ RESERVADO?</strong>\n                  <p>O agendamento normal fica bloqueado. Se for uma emergência real, você pode pedir uma exceção para Sérgio Tezzei.</p>\n                  <button type="button" className="secondary" onClick={() => setPeriodExceptionOpen(true)}>SOLICITAR EXCEÇÃO / EMERGÊNCIA</button>\n                </div>\n              )}\n            </section>''',
)

replace_once(
    feature,
    '''        </form>}\n        {canManage && pendingManagerReview &&''',
    '''        </form>}\n        {periodExceptionOpen && isMarketingScheduler && props.request.specialCaptureStatus !== "pending" && (\n          <form className="marketing-period-exception-form" onSubmit={requestPeriodException}>\n            <h3>Solicitar exceção de agenda</h3>\n            <p>Use somente em caso de emergência. O pedido só será agendado depois da autorização de Sérgio Tezzei.</p>\n            <div className="marketing-period-exception-fields">\n              <label>Data<input type="date" value={periodExceptionDate} onChange={(event) => setPeriodExceptionDate(event.target.value)} required /></label>\n              <label>Horário<select value={periodExceptionTime} onChange={(event) => setPeriodExceptionTime(event.target.value)}><option>08:00</option><option>09:00</option><option>10:00</option><option>11:00</option><option>14:00</option><option>15:00</option><option>16:00</option><option>17:00</option></select></label>\n            </div>\n            <label>Por que precisa agendar mesmo com o período reservado?<textarea value={periodExceptionReason} onChange={(event) => setPeriodExceptionReason(event.target.value)} minLength={5} maxLength={1000} required /></label>\n            <div><button type="button" className="secondary" onClick={() => setPeriodExceptionOpen(false)}>CANCELAR</button><button type="submit" disabled={busy}>{busy ? "Enviando..." : "PEDIR AUTORIZAÇÃO AO TEZZEI"}</button></div>\n          </form>\n        )}\n        {canManage && pendingManagerReview &&''',
)

p = Path(css)
text = p.read_text()
marker = "/* marketing-period-exception */"
if marker not in text:
    text += r'''

/* marketing-period-exception */
.marketing-period-exception-callout,
.marketing-period-exception,
.marketing-period-exception-form {
  border: 1px solid #d7b65a;
  border-radius: 14px;
  background: #fffaf0;
  padding: 14px;
  margin-top: 12px;
}
.marketing-period-exception-callout strong,
.marketing-period-exception strong { display: block; margin-bottom: 6px; }
.marketing-period-exception-callout p,
.marketing-period-exception p,
.marketing-period-exception-form p { margin: 6px 0 10px; }
.marketing-period-exception.pending { border-color: #c58a14; background: #fff8e8; }
.marketing-period-exception.rejected { border-color: #b74747; background: #fff3f3; }
.marketing-period-exception > div,
.marketing-period-exception-form > div:last-child { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.marketing-period-exception-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.marketing-period-exception-form label { display: grid; gap: 6px; margin-top: 10px; }
.marketing-period-exception-form textarea { min-height: 90px; }
@media (max-width: 640px) { .marketing-period-exception-fields { grid-template-columns: 1fr; } }
'''
    p.write_text(text)
