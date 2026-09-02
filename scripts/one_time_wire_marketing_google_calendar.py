from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: esperado 1 trecho, encontrado {count}")
    return text.replace(old, new, 1)

feature_path = Path("src/modules/marketing/MarketingFeature.tsx")
text = feature_path.read_text(encoding="utf-8")

text = replace_once(
    text,
    '} from "./marketingService";\nimport "./marketing.css";',
    '} from "./marketingService";\nimport { MarketingGoogleCalendarBridge, MarketingGoogleCalendarPanel } from "./MarketingGoogleCalendarPanel";\nimport "./marketing.css";',
    "import Google Calendar",
)

text = replace_once(
    text,
    '''  return (\n    <>\n      {alertHost && adminAlerts.map((request) => createPortal(''',
    '''  return (\n    <>\n      {props.sessionToken && (\n        <MarketingGoogleCalendarBridge\n          sessionToken={props.sessionToken}\n          currentUserId={props.currentUserId}\n          onConnected={(message) => { setNotice(message); setError(""); setTab("agenda"); props.onOpen(); }}\n          onError={(message) => { setError(message); props.onOpen(); }}\n        />\n      )}\n      {alertHost && adminAlerts.map((request) => createPortal(''',
    "OAuth callback bridge",
)

text = replace_once(
    text,
    '{props.tab === "agenda" && <AgendaView dashboard={props.dashboard} onSelect={props.onSelect} />}',
    '{props.tab === "agenda" && <AgendaView sessionToken={props.sessionToken} dashboard={props.dashboard} onSelect={props.onSelect} onError={props.onError} onNotice={props.onNotice} />}',
    "AgendaView props",
)

old_signature = 'function AgendaView({ dashboard, onSelect }: { dashboard: MarketingDashboard; onSelect: (request: MarketingRequest) => void }) {'
new_signature = '''function AgendaView({ sessionToken, dashboard, onSelect, onError, onNotice }: {\n  sessionToken: string;\n  dashboard: MarketingDashboard;\n  onSelect: (request: MarketingRequest) => void;\n  onError: (message: string) => void;\n  onNotice: (message: string) => void;\n}) {'''
text = replace_once(text, old_signature, new_signature, "AgendaView signature")

text = replace_once(
    text,
    '''  return (\n    <section className="marketing-agenda-view">\n      <div className="marketing-section-head"><div><h2>Agenda de captação</h2><p>Data solicitada pelo gerente e confirmação do Marketing ficam separadas.</p></div></div>''',
    '''  return (\n    <section className="marketing-agenda-view">\n      <MarketingGoogleCalendarPanel\n        sessionToken={sessionToken}\n        currentUserId={dashboard.context.userId}\n        role={dashboard.context.role}\n        onError={onError}\n        onNotice={onNotice}\n      />\n      <div className="marketing-section-head"><div><h2>Agenda de captação</h2><p>Data solicitada pelo gerente e confirmação do Marketing ficam separadas.</p></div></div>''',
    "AgendaView Google panel",
)

feature_path.write_text(text, encoding="utf-8")

service_path = Path("src/modules/alerts/googleCalendarService.ts")
service = service_path.read_text(encoding="utf-8")
service = replace_once(
    service,
    '''  const state = params.get("state")?.trim() ?? "";\n  const code = params.get("code")?.trim() ?? "";''',
    '''  const state = params.get("state")?.trim() ?? "";\n  if (state.startsWith("mkt_")) return null;\n  const code = params.get("code")?.trim() ?? "";''',
    "ignore Marketing OAuth callback",
)
service_path.write_text(service, encoding="utf-8")

print("Marketing Google Calendar integrado à interface")
