import type { MasterMapStatus } from "./masterMapTypes";

const legendItems: Array<{ status: MasterMapStatus; label: string; detail: string }> = [
  { status: "NOT_STARTED", label: "Não iniciado", detail: "Ainda sem piloto ou validação." },
  { status: "IN_PROGRESS", label: "Em desenvolvimento", detail: "Em instalação, estudo ou teste." },
  { status: "COMPLETED", label: "Concluído", detail: "Validado em uso real." },
];

export function MasterMapLegend() {
  return (
    <section className="master-map-legend" aria-label="Legenda de status">
      {legendItems.map((item) => (
        <div key={item.status}>
          <span className={`master-map-status-dot status-${item.status.toLowerCase().replace(/_/g, "-")}`} />
          <strong>{item.label}</strong>
          <small>{item.detail}</small>
        </div>
      ))}
    </section>
  );
}
