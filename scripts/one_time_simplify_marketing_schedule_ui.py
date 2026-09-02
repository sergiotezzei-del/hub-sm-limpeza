from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: esperado 1 trecho, encontrado {count}")
    return text.replace(old, new, 1)

feature_path = Path("src/modules/marketing/MarketingFeature.tsx")
text = feature_path.read_text(encoding="utf-8")

text = replace_once(text, '  formatDuration,\n', '', 'remove formatDuration import')
text = replace_once(
    text,
    'const REFRESH_MS = 20000;\n',
    'const REFRESH_MS = 20000;\nconst MARKETING_STANDARD_TIMES = ["08:00", "09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00"] as const;\n',
    'standard times constant',
)

text = replace_once(
    text,
    '  const [periodExceptionOpen, setPeriodExceptionOpen] = useState(false);\n  const [periodExceptionDate, setPeriodExceptionDate] = useState("");\n  const [periodExceptionTime, setPeriodExceptionTime] = useState("14:00");\n  const [periodExceptionReason, setPeriodExceptionReason] = useState("");\n',
    '  const [periodExceptionOpen, setPeriodExceptionOpen] = useState(false);\n  const [periodExceptionMode, setPeriodExceptionMode] = useState<"period" | "custom">("period");\n  const [periodExceptionPeriod, setPeriodExceptionPeriod] = useState<"morning" | "afternoon" | null>(null);\n  const [periodExceptionDate, setPeriodExceptionDate] = useState("");\n  const [periodExceptionTime, setPeriodExceptionTime] = useState("14:00");\n  const [periodExceptionReason, setPeriodExceptionReason] = useState("");\n',
    'exception states',
)

marker = '  async function requestPeriodException(event: FormEvent) {\n'
helper = '''  function openPeriodException(input: { dateKey?: string; period?: "morning" | "afternoon"; mode?: "period" | "custom" } = {}) {\n    const mode = input.mode || (input.period ? "period" : "custom");\n    setPeriodExceptionMode(mode);\n    setPeriodExceptionPeriod(input.period || null);\n    setPeriodExceptionDate(input.dateKey || "");\n    setPeriodExceptionTime(input.period === "morning" ? "08:00" : input.period === "afternoon" ? "14:00" : mode === "custom" ? "18:00" : "14:00");\n    setPeriodExceptionReason("");\n    setPeriodExceptionOpen(true);\n  }\n\n'''
if marker not in text:
    raise SystemExit('requestPeriodException marker ausente')
text = text.replace(marker, helper + marker, 1)

old_request_start = '''  async function requestPeriodException(event: FormEvent) {\n    event.preventDefault();\n    if (!periodExceptionDate || !periodExceptionTime) { props.onError("Escolha a data e o horário da emergência."); return; }\n    if (periodExceptionReason.trim().length < 5) { props.onError("Explique o motivo da emergência com pelo menos 5 caracteres."); return; }\n'''
new_request_start = '''  async function requestPeriodException(event: FormEvent) {\n    event.preventDefault();\n    if (!periodExceptionDate || !periodExceptionTime) { props.onError("Escolha a data e o horário."); return; }\n    const isStandard = MARKETING_STANDARD_TIMES.includes(periodExceptionTime as (typeof MARKETING_STANDARD_TIMES)[number]);\n    if (periodExceptionMode === "period" && !isStandard) { props.onError("No encaixe, escolha um horário padrão da manhã ou da tarde."); return; }\n    if (periodExceptionMode === "custom" && isStandard) { props.onError("Para horário fora do padrão, escolha um horário diferente de 08, 09, 10, 11, 14, 15, 16 ou 17h."); return; }\n    if (periodExceptionReason.trim().length < 5) { props.onError("Explique o motivo da exceção com pelo menos 5 caracteres."); return; }\n'''
text = replace_once(text, old_request_start, new_request_start, 'exception submit validation')

text = re.sub(
    r'\n\s*const duration = request\.confirmedCaptureAt\n\s*\? request\.confirmedCaptureDurationMinutes\n\s*: request\.preferredCaptureDurationMinutes;',
    '',
    text,
    count=1,
)
text = replace_once(
    text,
    '<small>{request.assignedMarketingName || "Responsável não definido"} · {formatDuration(duration)}</small>',
    '<small>{request.assignedMarketingName || "Responsável não definido"}</small>',
    'agenda duration label',
)

old_alert = '''          <h3>Marketing pediu sua autorização</h3>\n          <p>Pedido #{request.requestNumber} · {request.brokerName}</p>\n          <small>{request.specialCaptureAt ? formatMarketingDateTime(request.specialCaptureAt, dashboard!.scheduleConfig.timezone) : "Horário não informado"} · {request.specialCaptureReason}</small>\n'''
new_alert = '''          <h3>Autorizar agenda excepcional</h3>\n          <p>Pedido #{request.requestNumber} · {request.brokerName}</p>\n          <small>{request.specialCaptureAt ? formatMarketingDateTime(request.specialCaptureAt, dashboard!.scheduleConfig.timezone) : "Horário não informado"}<br />Motivo: {request.specialCaptureReason}</small>\n'''
text = replace_once(text, old_alert, new_alert, 'admin exception alert')

old_pending = '''        {props.request.specialCaptureStatus === "pending" && props.request.specialCaptureAt && (\n          <section className="marketing-period-exception pending">\n            <strong>EXCEÇÃO DE AGENDA · AGUARDANDO AUTORIZAÇÃO</strong>\n            <h3>{formatMarketingDateTime(props.request.specialCaptureAt, props.dashboard.scheduleConfig.timezone)}</h3>\n            <p>{props.request.specialCaptureReason}</p>\n            {props.dashboard.context.userId === "tezzei" && props.role === "admin" ? (\n              <div><button type="button" disabled={busy} onClick={() => void decidePeriodException("approved")}>APROVAR E AGENDAR</button><button type="button" className="secondary" disabled={busy} onClick={() => void decidePeriodException("rejected")}>NÃO APROVAR</button></div>\n            ) : <small>Somente Sérgio Tezzei pode aprovar. O pedido ainda NÃO está agendado.</small>}\n          </section>\n        )}\n'''
new_pending = '''        {props.request.specialCaptureStatus === "pending" && props.request.specialCaptureAt && (\n          <section className="marketing-period-exception pending">\n            <span className="marketing-exception-eyebrow">AGUARDANDO AUTORIZAÇÃO</span>\n            <h3>Agenda excepcional solicitada</h3>\n            <strong>{formatMarketingDateTime(props.request.specialCaptureAt, props.dashboard.scheduleConfig.timezone)}</strong>\n            <p><b>Motivo:</b> {props.request.specialCaptureReason}</p>\n            {props.dashboard.context.userId === "tezzei" && props.role === "admin" ? (\n              <div><button type="button" disabled={busy} onClick={() => void decidePeriodException("approved")}>APROVAR E AGENDAR</button><button type="button" className="secondary" disabled={busy} onClick={() => void decidePeriodException("rejected")}>NÃO APROVAR</button></div>\n            ) : <small>O pedido ainda não está agendado. Aguardando Sérgio Tezzei.</small>}\n          </section>\n        )}\n'''
text = replace_once(text, old_pending, new_pending, 'pending exception card')

old_capture = '''          {props.request.requestKind === "capture_edit" && (\n            <section className="marketing-capture-control span-2">\n              <h4>Captação</h4>\n              <div className="marketing-requested-capture">\n                <span>Data solicitada pelo gerente</span>\n                <strong>{props.request.preferredCaptureAt ? formatMarketingDateTime(props.request.preferredCaptureAt, props.dashboard.scheduleConfig.timezone) : "Aguardando definição do Marketing"}</strong>\n                {props.request.preferredCaptureAt && <small>Duração solicitada: {formatDuration(props.request.preferredCaptureDurationMinutes)}</small>}\n              </div>\n              <div className="marketing-capture-actions">\n                {props.request.preferredCaptureAt && props.request.preferredCaptureDurationMinutes && <button type="button" onClick={() => { setConfirmed({ startAt: props.request.preferredCaptureAt!, durationMinutes: props.request.preferredCaptureDurationMinutes! }); setCapturePickerOpen(false); }}>MANTER DATA SOLICITADA</button>}\n                <button type="button" className="secondary" onClick={() => setCapturePickerOpen(true)}>ESCOLHER OUTRA DATA/HORA</button>\n              </div>\n              {confirmed && !capturePickerOpen && <div className="marketing-confirmed-summary"><span>Captação selecionada</span><strong>{formatCaptureRange(confirmed.startAt, confirmed.durationMinutes, props.dashboard.scheduleConfig.timezone)}</strong></div>}\n              {capturePickerOpen && (\n                <CaptureSchedulePicker\n                  config={props.dashboard.scheduleConfig}\n                  occupiedSlots={props.dashboard.occupiedCaptureSlots}\n                  excludedRequestId={props.request.id}\n                  excludedCaptureGroupId={props.request.captureGroupId}\n                  value={confirmed}\n                  onCancel={() => setCapturePickerOpen(false)}\n                  onConfirm={(selection) => { setConfirmed(selection); setCapturePickerOpen(false); }}\n                />\n              )}\n              {isMarketingScheduler && props.request.specialCaptureStatus !== "pending" && (\n                <div className="marketing-period-exception-callout">\n                  <strong>PERÍODO JÁ RESERVADO?</strong>\n                  <p>O agendamento normal fica bloqueado. Se for uma emergência real, você pode pedir uma exceção para Sérgio Tezzei.</p>\n                  <button type="button" className="secondary" onClick={() => setPeriodExceptionOpen(true)}>SOLICITAR EXCEÇÃO / EMERGÊNCIA</button>\n                </div>\n              )}\n            </section>\n          )}\n'''
new_capture = '''          {props.request.requestKind === "capture_edit" && props.request.specialCaptureStatus !== "pending" && (\n            <section className="marketing-capture-control span-2">\n              <div className="marketing-capture-control-head"><div><h4>Agendamento da captação</h4><small>Escolha um horário livre. Não é necessário informar duração.</small></div></div>\n              <div className="marketing-requested-capture">\n                <span>Solicitação original</span>\n                <strong>{props.request.preferredCaptureAt ? formatMarketingDateTime(props.request.preferredCaptureAt, props.dashboard.scheduleConfig.timezone) : "Marketing define a data"}</strong>\n              </div>\n              <div className="marketing-capture-actions">\n                {props.request.preferredCaptureAt && props.request.preferredCaptureDurationMinutes && <button type="button" onClick={() => { setConfirmed({ startAt: props.request.preferredCaptureAt!, durationMinutes: props.request.preferredCaptureDurationMinutes! }); setCapturePickerOpen(false); }}>USAR HORÁRIO SOLICITADO</button>}\n                <button type="button" className="secondary" onClick={() => setCapturePickerOpen(true)}>ESCOLHER HORÁRIO LIVRE</button>\n                {isMarketingScheduler && <button type="button" className="secondary marketing-custom-time-button" onClick={() => openPeriodException({ mode: "custom" })}>HORÁRIO FORA DO PADRÃO</button>}\n              </div>\n              {confirmed && !capturePickerOpen && <div className="marketing-confirmed-summary"><span>Horário escolhido</span><strong>{formatCaptureRange(confirmed.startAt, confirmed.durationMinutes, props.dashboard.scheduleConfig.timezone)}</strong></div>}\n              {capturePickerOpen && (\n                <CaptureSchedulePicker\n                  config={props.dashboard.scheduleConfig}\n                  occupiedSlots={props.dashboard.occupiedCaptureSlots}\n                  excludedRequestId={props.request.id}\n                  excludedCaptureGroupId={props.request.captureGroupId}\n                  value={confirmed}\n                  onCancel={() => setCapturePickerOpen(false)}\n                  onConfirm={(selection) => { setConfirmed(selection); setCapturePickerOpen(false); }}\n                  onRequestException={isMarketingScheduler ? ({ dateKey, period }) => openPeriodException({ dateKey, period, mode: "period" }) : undefined}\n                />\n              )}\n            </section>\n          )}\n'''
text = replace_once(text, old_capture, new_capture, 'capture control')

old_form = '''        {periodExceptionOpen && isMarketingScheduler && props.request.specialCaptureStatus !== "pending" && (\n          <form className="marketing-period-exception-form" onSubmit={requestPeriodException}>\n            <h3>Solicitar exceção de agenda</h3>\n            <p>Use somente em caso de emergência. O pedido só será agendado depois da autorização de Sérgio Tezzei.</p>\n            <div className="marketing-period-exception-fields">\n              <label>Data<input type="date" value={periodExceptionDate} onChange={(event) => setPeriodExceptionDate(event.target.value)} required /></label>\n              <label>Horário<select value={periodExceptionTime} onChange={(event) => setPeriodExceptionTime(event.target.value)}><option>08:00</option><option>09:00</option><option>10:00</option><option>11:00</option><option>14:00</option><option>15:00</option><option>16:00</option><option>17:00</option></select></label>\n            </div>\n            <label>Por que precisa agendar mesmo com o período reservado?<textarea value={periodExceptionReason} onChange={(event) => setPeriodExceptionReason(event.target.value)} minLength={5} maxLength={1000} required /></label>\n            <div><button type="button" className="secondary" onClick={() => setPeriodExceptionOpen(false)}>CANCELAR</button><button type="submit" disabled={busy}>{busy ? "Enviando..." : "PEDIR AUTORIZAÇÃO AO TEZZEI"}</button></div>\n          </form>\n        )}\n'''
new_form = '''        {periodExceptionOpen && isMarketingScheduler && props.request.specialCaptureStatus !== "pending" && createPortal(\n          <div className="marketing-modal-backdrop marketing-confirmation-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPeriodExceptionOpen(false); }}>\n            <form className="marketing-schedule-exception-modal" onSubmit={requestPeriodException}>\n              <header><div><small>EXCEÇÃO DE AGENDA</small><h2>Precisa sair da agenda normal?</h2></div><button type="button" aria-label="Fechar" onClick={() => setPeriodExceptionOpen(false)}>×</button></header>\n              <p className="marketing-exception-intro">Escolha o motivo abaixo. <b>Isso não agenda o pedido agora.</b> A solicitação vai para Sérgio Tezzei aprovar.</p>\n              <div className="marketing-exception-mode">\n                <button type="button" className={periodExceptionMode === "period" ? "selected" : ""} onClick={() => { setPeriodExceptionMode("period"); setPeriodExceptionTime(periodExceptionPeriod === "morning" ? "08:00" : "14:00"); }}><strong>ENCAIXE</strong><small>Outro horário dentro de um período já reservado.</small></button>\n                <button type="button" className={periodExceptionMode === "custom" ? "selected" : ""} onClick={() => { setPeriodExceptionMode("custom"); setPeriodExceptionPeriod(null); setPeriodExceptionTime("18:00"); }}><strong>FORA DO PADRÃO</strong><small>Ex.: 12:30, 13:30 ou 18:00.</small></button>\n              </div>\n              <div className="marketing-period-exception-fields">\n                <label>Data<input type="date" value={periodExceptionDate} onChange={(event) => setPeriodExceptionDate(event.target.value)} required /></label>\n                {periodExceptionMode === "period" ? (\n                  <label>Horário<select value={periodExceptionTime} onChange={(event) => setPeriodExceptionTime(event.target.value)}>{(periodExceptionPeriod === "morning" ? MARKETING_STANDARD_TIMES.slice(0, 4) : periodExceptionPeriod === "afternoon" ? MARKETING_STANDARD_TIMES.slice(4) : MARKETING_STANDARD_TIMES).map((time) => <option key={time}>{time}</option>)}</select></label>\n                ) : (\n                  <label>Horário especial<input type="time" step="900" value={periodExceptionTime} onChange={(event) => setPeriodExceptionTime(event.target.value)} required /></label>\n                )}\n              </div>\n              <label className="marketing-exception-reason">Justificativa<textarea value={periodExceptionReason} onChange={(event) => setPeriodExceptionReason(event.target.value)} minLength={5} maxLength={1000} placeholder="Explique por que esse encaixe ou horário especial é necessário." required /></label>\n              <div className="marketing-exception-approval-note"><strong>Próximo passo</strong><span>Você envia → Sérgio Tezzei analisa → somente se aprovado o pedido entra na agenda.</span></div>\n              <footer><button type="button" className="secondary" onClick={() => setPeriodExceptionOpen(false)}>CANCELAR</button><button type="submit" disabled={busy}>{busy ? "Enviando..." : "ENVIAR PARA APROVAÇÃO"}</button></footer>\n            </form>\n          </div>,\n          document.body,\n        )}\n'''
text = replace_once(text, old_form, new_form, 'exception modal')

feature_path.write_text(text, encoding="utf-8")

config_path = Path("src/modules/marketing/marketingConfig.ts")
config = config_path.read_text(encoding="utf-8")
config = replace_once(config, '{ id: "morning", label: "Manhã", start: "08:30", end: "11:00" },\n  { id: "afternoon", label: "Tarde", start: "14:00", end: "16:00" },', '{ id: "morning", label: "Manhã", start: "08:00", end: "12:00" },\n  { id: "afternoon", label: "Tarde", start: "14:00", end: "18:00" },', 'default capture windows')
old_range = '''export function formatCaptureRange(startAt: string, durationMinutes: number, timezone: string) {\n  const start = new Date(startAt);\n  if (Number.isNaN(start.getTime())) return "Data não informada";\n  const end = new Date(start.getTime() + durationMinutes * 60000);\n  const date = new Intl.DateTimeFormat("pt-BR", {\n    timeZone: timezone,\n    day: "2-digit",\n    month: "2-digit",\n    year: "numeric",\n  }).format(start);\n  const timeFormatter = new Intl.DateTimeFormat("pt-BR", {\n    timeZone: timezone,\n    hour: "2-digit",\n    minute: "2-digit",\n  });\n  return `${date} · ${timeFormatter.format(start)} às ${timeFormatter.format(end)}`;\n}\n'''
new_range = '''export function formatCaptureRange(startAt: string, _durationMinutes: number, timezone: string) {\n  const start = new Date(startAt);\n  if (Number.isNaN(start.getTime())) return "Data não informada";\n  const date = new Intl.DateTimeFormat("pt-BR", {\n    timeZone: timezone,\n    day: "2-digit",\n    month: "2-digit",\n    year: "numeric",\n  }).format(start);\n  const time = new Intl.DateTimeFormat("pt-BR", {\n    timeZone: timezone,\n    hour: "2-digit",\n    minute: "2-digit",\n  }).format(start);\n  return `${date} · ${time}`;\n}\n'''
config = replace_once(config, old_range, new_range, 'format capture without duration')
config_path.write_text(config, encoding="utf-8")

service_path = Path("src/modules/marketing/marketingService.ts")
service = service_path.read_text(encoding="utf-8")
service = service.replace('if (normalized.includes("MARKETING_SPECIAL_TIME_NOT_STANDARD_SLOT")) return "A exceção deve usar um dos horários da agenda: 08, 09, 10, 11, 14, 15, 16 ou 17h.";\n', '')
service = service.replace('if (normalized.includes("MARKETING_SPECIAL_PERIOD_NOT_RESERVED")) return "Esse período está livre. Use o agendamento normal, sem pedir exceção.";', 'if (normalized.includes("MARKETING_SPECIAL_PERIOD_NOT_RESERVED")) return "Esse período está livre. Use o agendamento normal; para outro horário, escolha Fora do padrão.";')
service = service.replace('if (normalized.includes("MARKETING_SPECIAL_EXACT_CONFLICT")) return "Já existe uma captação exatamente nesse horário. Escolha outro horário do período.";', 'if (normalized.includes("MARKETING_SPECIAL_EXACT_CONFLICT")) return "Já existe uma captação ocupando esse horário. Escolha outro horário.";')
service_path.write_text(service, encoding="utf-8")

css_path = Path("src/modules/marketing/marketing.css")
css = css_path.read_text(encoding="utf-8")
css += r'''

/* Agenda simplificada do Marketing */
.marketing-schedule-picker-head { display:flex; justify-content:space-between; gap:12px; }
.marketing-schedule-picker-head > div { display:grid; gap:3px; }
.marketing-schedule-picker-head small { color:#6f6678; }
.marketing-period-cards { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
.marketing-period-card { border:1px solid #d8d1e1; border-radius:10px; padding:13px; display:grid; gap:12px; background:#fff; }
.marketing-period-card > header { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
.marketing-period-card > header > div { display:grid; gap:3px; }
.marketing-period-card > header small { color:#706879; font-size:.78rem; }
.marketing-period-card > header > span { border-radius:999px; padding:4px 8px; font-size:.7rem; font-weight:900; }
.marketing-period-card.free > header > span { background:#e9f5ed; color:#276641; }
.marketing-period-card.reserved { background:#fff8e8; border-color:#dfc070; }
.marketing-period-card.reserved > header > span { background:#f5dfaa; color:#76520a; }
.marketing-time-buttons { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:7px; }
.marketing-time-buttons button { min-height:48px; border:1px solid #bddac6; border-radius:8px; background:#fff; color:#245f3b; font:inherit; font-weight:850; cursor:pointer; }
.marketing-time-buttons button.selected { border-color:#4e38a5; box-shadow:0 0 0 2px rgba(78,56,165,.14); color:#4e38a5; }
.marketing-time-buttons button.unavailable { border-color:#ead2cf; background:#f8f3f2; color:#9b766f; cursor:not-allowed; }
.marketing-time-buttons button small { display:block; font-size:.62rem; margin-top:2px; }
.marketing-period-reserved-message { display:grid; gap:8px; }
.marketing-period-reserved-message p { margin:0; color:#6f5316; }
.marketing-period-reserved-message button { min-height:40px; border:1px solid #b17a12; border-radius:8px; background:#fff; color:#7b5510; font:inherit; font-weight:900; cursor:pointer; }
.marketing-lunch-note { color:#6e6676; }
.marketing-schedule-picker footer { align-items:center; justify-content:space-between; }
.marketing-selected-slot { display:grid; gap:2px; text-align:left; }
.marketing-selected-slot span { color:#756c82; font-size:.76rem; }
.marketing-schedule-footer-actions { display:flex; flex-wrap:wrap; gap:8px; }
.marketing-capture-control-head h4 { margin:0; }
.marketing-capture-control-head small { color:#6f6678; }
.marketing-custom-time-button { border-style:dashed !important; }
.marketing-exception-eyebrow { color:#8b6411; font-size:.72rem; font-weight:900; }
.marketing-period-exception.pending h3 { margin:2px 0; }
.marketing-period-exception.pending > strong { font-size:1.05rem; }
.marketing-schedule-exception-modal { width:min(620px,calc(100vw - 28px)); max-height:calc(100vh - 28px); overflow:auto; display:grid; gap:14px; padding:20px; border-radius:12px; background:#fff; box-shadow:0 24px 70px rgba(25,13,50,.3); }
.marketing-schedule-exception-modal > header { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
.marketing-schedule-exception-modal > header small { color:#9b6b0d; font-weight:900; }
.marketing-schedule-exception-modal > header h2 { margin:3px 0 0; }
.marketing-schedule-exception-modal > header > button { border:0; background:transparent; font-size:1.8rem; cursor:pointer; }
.marketing-exception-intro { margin:0; color:#5f5868; line-height:1.45; }
.marketing-exception-mode { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
.marketing-exception-mode button { display:grid; gap:4px; text-align:left; min-height:76px; padding:12px; border:1px solid #d8d1e1; border-radius:9px; background:#fff; color:#443b4d; font:inherit; cursor:pointer; }
.marketing-exception-mode button.selected { border-color:#8b6411; background:#fff8e8; box-shadow:0 0 0 2px rgba(139,100,17,.1); }
.marketing-exception-mode button small { color:#6f6678; }
.marketing-schedule-exception-modal .marketing-period-exception-fields { margin:0; }
.marketing-schedule-exception-modal label { display:grid; gap:6px; font-weight:800; }
.marketing-schedule-exception-modal input,
.marketing-schedule-exception-modal select,
.marketing-schedule-exception-modal textarea { width:100%; border:1px solid #cfc8d8; border-radius:8px; padding:10px; background:#fff; font:inherit; }
.marketing-schedule-exception-modal textarea { min-height:100px; resize:vertical; }
.marketing-exception-approval-note { display:grid; gap:3px; padding:11px; border-left:4px solid #8b6411; background:#fff8e8; }
.marketing-exception-approval-note span { color:#625b69; }
.marketing-schedule-exception-modal > footer { display:flex; justify-content:flex-end; gap:8px; }
.marketing-schedule-exception-modal > footer button { min-height:42px; border:0; border-radius:8px; padding:10px 14px; background:#5d386e; color:#fff; font:inherit; font-weight:900; cursor:pointer; }
.marketing-schedule-exception-modal > footer button.secondary { background:#ebe7ef; color:#4e3f57; }
.marketing-schedule-exception-modal > footer button:disabled { opacity:.55; cursor:not-allowed; }
@media (max-width:700px) {
  .marketing-period-cards,
  .marketing-exception-mode,
  .marketing-period-exception-fields { grid-template-columns:1fr; }
  .marketing-time-buttons { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .marketing-schedule-picker footer { align-items:stretch; flex-direction:column; }
  .marketing-schedule-footer-actions,
  .marketing-schedule-exception-modal > footer { display:grid; grid-template-columns:1fr; }
  .marketing-schedule-footer-actions button,
  .marketing-schedule-exception-modal > footer button { width:100%; }
}
'''
css_path.write_text(css, encoding="utf-8")

print("UI da agenda simplificada aplicada")
