from pathlib import Path

p = Path('.github/scripts/apply_marketing_periods_special.py')
text = p.read_text()
lines = text.splitlines()
filtered = []
for line in lines:
    if line.startswith("replace(path, '  if (normalized.includes(\"MARKETING_CAPTURE_PERIOD_LIMIT_REACHED\"))"):
        continue
    if line.startswith("replace(path, '  if (normalized.includes(\"MARKETING_CAPTURE_WINDOW_INVALID\")) return \"Escolha um horário entre 08:00"):
        continue
    filtered.append(line)
text = '\n'.join(filtered) + '\n'
marker = '# MarketingFeature.tsx\n'
patch = '''replace(path, '  if (normalized.includes("MARKETING_CAPTURE_CONFLICT")) return "Este horário já possui outra captação agendada.";', '  if (normalized.includes("MARKETING_CAPTURE_PERIOD_RESERVED")) return "Esse período já está reservado. Escolha outro período ou outra data.";\\n  if (normalized.includes("MARKETING_CAPTURE_CONFLICT")) return "Este horário já possui outra captação agendada.";')
replace(path, '  if (normalized.includes("MARKETING_CAPTURE_DURATION_REQUIRED")) return "Escolha a data, o horário e a duração da captação.";', '  if (normalized.includes("MARKETING_CAPTURE_DURATION_REQUIRED")) return "Escolha a data e o horário da captação.";')
replace(path, '  if (normalized.includes("MARKETING_CAPTURE_WINDOW_INVALID")) return "Escolha um horário disponível dentro da agenda do Marketing.";', '  if (normalized.includes("MARKETING_CAPTURE_WINDOW_INVALID")) return "Escolha um dos horários padrão: 08:00, 09:00, 10:00, 11:00, 14:00, 15:00, 16:00 ou 17:00.";\\n  if (normalized.includes("MARKETING_SPECIAL_REASON_REQUIRED")) return "Informe a justificativa para o horário fora do padrão.";\\n  if (normalized.includes("MARKETING_SPECIAL_TIME_INVALID")) return "O horário especial precisa ser uma data futura.";\\n  if (normalized.includes("MARKETING_SPECIAL_TIME_STANDARD_SLOT")) return "Esse horário pertence à agenda normal e não precisa de exceção.";\\n  if (normalized.includes("MARKETING_SPECIAL_DECISION_DENIED")) return "Somente Maria, Arthur ou o administrador podem decidir um horário fora do padrão.";\\n  if (normalized.includes("MARKETING_SPECIAL_NOT_PENDING")) return "Esta solicitação de horário especial já foi decidida.";')

'''
if marker not in text:
    raise SystemExit('marker not found')
text = text.replace(marker, patch + marker, 1)
p.write_text(text)
