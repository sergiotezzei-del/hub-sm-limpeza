from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: esperado 1 trecho, encontrado {count}")
    return text.replace(old, new, 1)

public_path = Path("src/modules/marketing/PublicMarketingRequestPage.tsx")
text = public_path.read_text(encoding="utf-8")
text = replace_once(text, "  formatDuration,\n", "", "remove public formatDuration import")
old = '''                        ? <div>\n                            <strong>{formatMarketingDateTime(form.preferredCapture.startAt, availability.scheduleConfig.timezone)}</strong>\n                            <small> Data/período mantidos do primeiro imóvel.</small>\n                            <p>Duração estimada deste imóvel:</p>\n                            <div className="marketing-duration-options">\n                              {availability.scheduleConfig.durationOptionsMinutes.filter((duration) => duration <= 120).map((duration) => (\n                                <button\n                                  type="button"\n                                  key={duration}\n                                  className={form.preferredCapture?.durationMinutes === duration ? "selected" : ""}\n                                  onClick={() => setForm({ ...form, preferredCapture: { startAt: form.preferredCapture!.startAt, durationMinutes: duration } })}\n                                >\n                                  {formatDuration(duration)}\n                                </button>\n                              ))}\n                            </div>\n                          </div>\n'''
new = '''                        ? <div className="marketing-grouped-capture-time">\n                            <strong>{formatMarketingDateTime(form.preferredCapture.startAt, availability.scheduleConfig.timezone)}</strong>\n                            <small>Mesmo dia e horário da saída do primeiro imóvel.</small>\n                          </div>\n'''
text = replace_once(text, old, new, "grouped capture duration")
public_path.write_text(text, encoding="utf-8")

feature_path = Path("src/modules/marketing/MarketingFeature.tsx")
feature = feature_path.read_text(encoding="utf-8")
feature = feature.replace("Escolha a data, o horário e a duração da captação.", "Escolha a data e o horário da captação.")
feature_path.write_text(feature, encoding="utf-8")

service_path = Path("src/modules/marketing/marketingService.ts")
service = service_path.read_text(encoding="utf-8")
service = service.replace('if (normalized.includes("MARKETING_CAPTURE_DURATION_REQUIRED")) return "Escolha a data, o horário e a duração da captação.";', 'if (normalized.includes("MARKETING_CAPTURE_DURATION_REQUIRED")) return "Escolha a data e o horário da captação.";')
service_path.write_text(service, encoding="utf-8")

css_path = Path("src/modules/marketing/publicMarketing.css")
css = css_path.read_text(encoding="utf-8")
css += '''\n.marketing-grouped-capture-time { display:grid; gap:4px; padding:10px 12px; border:1px solid #d8d1e1; border-radius:8px; background:#faf8fc; }\n.marketing-grouped-capture-time small { color:#6f6678; }\n'''
css_path.write_text(css, encoding="utf-8")

print("Duração removida das telas do Marketing")
