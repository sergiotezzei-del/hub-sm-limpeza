export const SANTA_MARIA_TASK_SECTORS = [
  "Geral",
  "Administração",
  "Diretoria",
  "Infraestrutura",
  "Manutenção",
  "Limpeza",
  "Copa / Café",
  "Segurança",
  "Recepção",
  "Financeiro",
  "Contratos",
  "Locação",
  "Vendas",
  "Marketing",
  "Jurídico",
  "Compras / Estoque",
  "Patrimônio",
] as const;

export function buildTaskSectorOptions(existingDepartments: Array<string | null | undefined>) {
  const options = new Set<string>();
  for (const sector of SANTA_MARIA_TASK_SECTORS) options.add(sector);

  const legacyDepartments = existingDepartments
    .map((department) => department?.trim())
    .filter((department): department is string => Boolean(department))
    .filter((department) => !options.has(department))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  for (const department of legacyDepartments) options.add(department);
  return Array.from(options);
}
