from pathlib import Path

path = Path("src/modules/marketing/MarketingFeature.tsx")
text = path.read_text(encoding="utf-8")

old_label = '<label>Próxima etapa<select value={status} onChange={(event) => setStatus(event.target.value as MarketingRequestStatus)}>{selectableStatuses.map((value) => <option value={value} key={value}>{statusLabels[value]}</option>)}</select></label>'
new_label = '<label>Status<select value={status} onChange={(event) => setStatus(event.target.value as MarketingRequestStatus)}>{selectableStatuses.map((value) => <option value={value} key={value}>{statusLabels[value]}</option>)}</select></label>'
if old_label not in text:
    raise SystemExit("Rótulo esperado do seletor não encontrado.")
text = text.replace(old_label, new_label, 1)

helper_start = text.index("function allowedManagementStatuses(request: MarketingRequest): MarketingRequestStatus[] {")
helper_end = text.index("\n\nfunction defaultTab", helper_start)
new_helper = '''function allowedManagementStatuses(request: MarketingRequest): MarketingRequestStatus[] {
  if (request.status === "pronto" || request.status === "cancelado") return [request.status];
  return request.requestKind === "capture_edit"
    ? ["solicitado", "agendado", "aguardando_edicao", "em_edicao", "em_aprovacao", "revisao", "pronto", "bloqueado", "cancelado"]
    : ["solicitado", "aguardando_edicao", "em_edicao", "em_aprovacao", "revisao", "pronto", "bloqueado", "cancelado"];
}'''
text = text[:helper_start] + new_helper + text[helper_end:]

validation_start = text.index('    if (props.request.requestKind === "capture_edit" && status === "agendado" && !confirmed) {')
validation_end = text.index('    const payload: Record<string, unknown> = {', validation_start)
new_validation = '''    if (props.request.requestKind === "capture_edit") {
      const statusNeedsConfirmedCapture = ["agendado", "aguardando_edicao", "em_edicao", "em_aprovacao", "revisao", "pronto"].includes(status);
      if (statusNeedsConfirmedCapture && !confirmed) {
        props.onError("Confirme o horário da captação antes de colocar o pedido nessa etapa.");
        return;
      }
      if (status === "solicitado" && confirmed) {
        props.onError("Este pedido já possui captação confirmada. Escolha Agendado ou uma etapa de produção antes de salvar.");
        return;
      }
    }
'''
text = text[:validation_start] + new_validation + text[validation_end:]
path.write_text(text, encoding="utf-8")

sw = Path("public/sw.js")
sw_text = sw.read_text(encoding="utf-8")
if "hub-santa-maria-v20" in sw_text:
    sw_text = sw_text.replace("hub-santa-maria-v20", "hub-santa-maria-v21", 1)
elif "hub-santa-maria-v21" not in sw_text:
    raise SystemExit("Versão esperada do cache PWA não encontrada.")
sw.write_text(sw_text, encoding="utf-8")
