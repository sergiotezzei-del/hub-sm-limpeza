import { useEffect, useMemo, useState } from "react";
import { INTELBRAS_AMT8000_CONFIG } from "./config";
import { describeIntelbrasCommand, getIntelbrasAlarmProvider, getIntelbrasWaitingMessage } from "./alarmService";
import type { IntelbrasAuditRecord, IntelbrasCommand, IntelbrasPanelSnapshot, IntelbrasPartitionState, IntelbrasZoneState } from "./types";
import "./alarmScreen.css";

type AlarmTab = "overview" | "partitions" | "zones" | "history";

type Props = {
  actorUserId: string;
  actorName: string;
  onBack: () => void;
  onLogout: () => void;
};

const provider = getIntelbrasAlarmProvider();

function partitionLabel(state: IntelbrasPartitionState) {
  if (state === "armed") return "Ativada";
  if (state === "disarmed") return "Desativada";
  if (state === "triggered") return "Disparada";
  return "Aguardando leitura";
}

function zoneLabel(state: IntelbrasZoneState) {
  if (state === "closed") return "Fechada";
  if (state === "open") return "Aberta";
  if (state === "bypassed") return "Anulada";
  if (state === "triggered") return "Disparada";
  return "Aguardando leitura";
}

function stateTone(state: IntelbrasPartitionState | IntelbrasZoneState) {
  if (state === "triggered" || state === "open") return "danger";
  if (state === "armed" || state === "closed") return "ok";
  if (state === "bypassed") return "warning";
  return "neutral";
}

function commandTarget(command: IntelbrasCommand) {
  if ("partitionId" in command) return `Partição ${command.partitionId}`;
  if ("zoneId" in command) return `Zona ${command.zoneId}`;
  return "Central completa";
}

export function AlarmScreen({ actorUserId, actorName, onBack, onLogout }: Props) {
  const [tab, setTab] = useState<AlarmTab>("overview");
  const [snapshot, setSnapshot] = useState<IntelbrasPanelSnapshot | null>(null);
  const [audit, setAudit] = useState<IntelbrasAuditRecord[]>([]);
  const [pendingCommand, setPendingCommand] = useState<IntelbrasCommand | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const [nextSnapshot, nextAudit] = await Promise.all([provider.loadSnapshot(), provider.loadAudit()]);
      setSnapshot(nextSnapshot);
      setAudit(nextAudit);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const knownProblems = useMemo(() => {
    if (!snapshot) return [] as string[];
    const problems: string[] = [];
    if (snapshot.integrationState !== "ready") problems.push("Integração oficial ainda não conectada");
    if (snapshot.online === false) problems.push("Central offline");
    if (snapshot.sirenActive === true) problems.push("Sirene ativa");
    if (snapshot.batteryActive === false) problems.push("Bateria indisponível");
    problems.push(...snapshot.partitions.filter((item) => item.state === "triggered").map((item) => `${item.name} disparada`));
    problems.push(...snapshot.zones.filter((item) => item.state === "triggered").map((item) => `${item.name} disparada`));
    return problems;
  }, [snapshot]);

  async function confirmCommand() {
    if (!pendingCommand) return;
    setSending(true);
    try {
      const result = await provider.executeCommand(pendingCommand, {
        actorUserId,
        actorName,
        source: window.matchMedia("(display-mode: standalone)").matches ? "hub_pwa" : "hub_web",
      });
      setMessage(result.message);
      setPendingCommand(null);
      setAudit(await provider.loadAudit());
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="alarm-screen">
      <header className="alarm-topbar">
        <div>
          <span className="alarm-eyebrow">SEGURANÇA • INTELBRAS</span>
          <h1>Alarme Santa Maria</h1>
          <p>AMT 8000 LITE • firmware {INTELBRAS_AMT8000_CONFIG.firmware ?? "—"}</p>
        </div>
        <span className="alarm-mode-badge">MODO PREPARAÇÃO</span>
      </header>

      <div className="alarm-nav-actions">
        <button type="button" onClick={onBack}>← Voltar para Segurança</button>
        <button type="button" onClick={onLogout}>Sair</button>
      </div>

      <section className="alarm-safety-banner" role="status">
        <strong>🔒 Nenhum comando real está sendo enviado.</strong>
        <span>{getIntelbrasWaitingMessage()}</span>
      </section>

      {message && <section className="alarm-message">{message}</section>}

      <nav className="alarm-tabs" aria-label="Áreas do alarme">
        <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")} type="button">Visão geral</button>
        <button className={tab === "partitions" ? "active" : ""} onClick={() => setTab("partitions")} type="button">Partições</button>
        <button className={tab === "zones" ? "active" : ""} onClick={() => setTab("zones")} type="button">Zonas</button>
        <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")} type="button">Histórico</button>
      </nav>

      {loading && <section className="alarm-empty">Carregando estrutura do alarme...</section>}

      {!loading && snapshot && tab === "overview" && (
        <>
          <section className="alarm-summary-grid">
            <article><span>Central</span><strong>{snapshot.online === null ? "Aguardando integração" : snapshot.online ? "Online" : "Offline"}</strong></article>
            <article><span>Sirene</span><strong>{snapshot.sirenActive === null || snapshot.sirenActive === undefined ? "Sem leitura" : snapshot.sirenActive ? "Ativa" : "Desligada"}</strong></article>
            <article><span>Bateria</span><strong>{snapshot.batteryActive === null || snapshot.batteryActive === undefined ? "Sem leitura" : snapshot.batteryActive ? "Ativa" : "Falha"}</strong></article>
            <article><span>Partições</span><strong>{snapshot.partitions.length}</strong></article>
          </section>

          <section className="alarm-panel-card">
            <div className="alarm-card-heading">
              <div><span className="alarm-eyebrow">CENTRAL</span><h2>{snapshot.panelName}</h2></div>
              <button type="button" onClick={() => void refresh()}>↻ Atualizar status</button>
            </div>
            <dl className="alarm-details">
              <div><dt>Modelo</dt><dd>{snapshot.model}</dd></div>
              <div><dt>IP local</dt><dd>{INTELBRAS_AMT8000_CONFIG.localIp ?? "—"}</dd></div>
              <div><dt>Transporte planejado</dt><dd>SDK/API oficial ou ponte local</dd></div>
              <div><dt>Última atualização</dt><dd>{new Date(snapshot.updatedAt).toLocaleString("pt-BR")}</dd></div>
            </dl>
          </section>

          <section className="alarm-panel-card alarm-command-center">
            <div className="alarm-card-heading"><div><span className="alarm-eyebrow">COMANDOS GERAIS</span><h2>Ativar / Desativar</h2></div></div>
            <div className="alarm-command-grid">
              <button className="alarm-arm-button" type="button" onClick={() => setPendingCommand({ type: "arm_all" })}>🔒 ATIVAR TUDO</button>
              <button className="alarm-disarm-button" type="button" onClick={() => setPendingCommand({ type: "disarm_all" })}>🔓 DESATIVAR TUDO</button>
            </div>
            <small>O fluxo de confirmação já está pronto, mas o adaptador bloqueia o envio até o protocolo Intelbras ser validado.</small>
          </section>

          <section className="alarm-panel-card">
            <div className="alarm-card-heading"><div><span className="alarm-eyebrow">ATENÇÃO</span><h2>Situação da central</h2></div></div>
            {knownProblems.length ? <ul className="alarm-problem-list">{knownProblems.map((problem) => <li key={problem}>{problem}</li>)}</ul> : <p className="alarm-muted">Nenhuma ocorrência crítica identificada.</p>}
          </section>
        </>
      )}

      {!loading && snapshot && tab === "partitions" && (
        <section className="alarm-list">
          {snapshot.partitions.map((partition) => (
            <article className="alarm-item-card" key={partition.id}>
              <div className="alarm-item-title">
                <div><span>PARTIÇÃO {partition.id}</span><h2>{partition.name}</h2></div>
                <strong className={`alarm-state alarm-state-${stateTone(partition.state)}`}>{partitionLabel(partition.state)}</strong>
              </div>
              <div className="alarm-command-grid compact">
                <button className="alarm-arm-button" type="button" onClick={() => setPendingCommand({ type: "arm_partition", partitionId: partition.id })}>Ativar</button>
                <button className="alarm-disarm-button" type="button" onClick={() => setPendingCommand({ type: "disarm_partition", partitionId: partition.id })}>Desativar</button>
              </div>
            </article>
          ))}
        </section>
      )}

      {!loading && snapshot && tab === "zones" && (
        <section className="alarm-list">
          {snapshot.zones.length === 0 ? (
            <section className="alarm-empty"><strong>Zonas ainda não carregadas.</strong><span>Quando o SDK/API conectar, o HUB preencherá automaticamente número, nome, partição e estado de cada zona.</span></section>
          ) : snapshot.zones.map((zone) => (
            <article className="alarm-item-card" key={zone.id}>
              <div className="alarm-item-title">
                <div><span>ZONA {zone.id}</span><h2>{zone.name}</h2><small>{zone.partitionId ? `Partição ${zone.partitionId}` : "Sem partição informada"}</small></div>
                <strong className={`alarm-state alarm-state-${stateTone(zone.state)}`}>{zoneLabel(zone.state)}</strong>
              </div>
              <div className="alarm-command-grid compact">
                <button type="button" onClick={() => setPendingCommand({ type: "bypass_zone", zoneId: zone.id })}>Anular zona</button>
                <button type="button" onClick={() => setPendingCommand({ type: "restore_zone", zoneId: zone.id })}>Restaurar zona</button>
              </div>
            </article>
          ))}
        </section>
      )}

      {!loading && tab === "history" && (
        <section className="alarm-panel-card">
          <div className="alarm-card-heading"><div><span className="alarm-eyebrow">AUDITORIA</span><h2>Histórico de comandos</h2></div></div>
          {audit.length === 0 ? <p className="alarm-muted">Nenhum comando registrado nesta sessão.</p> : (
            <div className="alarm-audit-list">{audit.map((record) => (
              <article key={record.id}><div><strong>{describeIntelbrasCommand(record.command)}</strong><span>{commandTarget(record.command)} • {record.actorName}</span></div><div><b>{record.status.toUpperCase()}</b><time>{new Date(record.createdAt).toLocaleString("pt-BR")}</time></div></article>
            ))}</div>
          )}
        </section>
      )}

      {pendingCommand && (
        <div className="alarm-dialog-backdrop" role="presentation">
          <section className="alarm-dialog" role="dialog" aria-modal="true" aria-label="Confirmar comando do alarme">
            <span className="alarm-eyebrow">CONFIRMAÇÃO DE SEGURANÇA</span>
            <h2>{describeIntelbrasCommand(pendingCommand)}</h2>
            <p><strong>Destino:</strong> {commandTarget(pendingCommand)}</p>
            <p>Quando a integração estiver liberada, esta confirmação será obrigatória antes de qualquer comando.</p>
            <div className="alarm-dialog-warning">⚠️ Nesta fase o comando será bloqueado e NÃO chegará à central Intelbras.</div>
            <div className="alarm-dialog-actions">
              <button type="button" disabled={sending} onClick={() => setPendingCommand(null)}>Cancelar</button>
              <button className="alarm-confirm-button" type="button" disabled={sending} onClick={() => void confirmCommand()}>{sending ? "Validando..." : "Confirmar fluxo"}</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
