import { useEffect, useState, type FormEvent } from "react";
import { getInventoryProducts, getNeiaOrderHistory, getStockChecks, getStockMovements } from "../../storage";
import { brazilDate, calculateConsumption, parseConsumptionQuestion, productCheckReadings, productOrders, type ConsumptionData, type ConsumptionQuery, type ConsumptionReport } from "./consumption";
import { stockHistoryDate } from "./stockHistory";
import "./cleaning-consumption.css";

const quantity = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const dateTime = (value: number) => stockHistoryDate(new Date(value).toISOString());

export function CleaningConsumption({ onBack, onLogout }: { onBack: () => void; onLogout: () => void }) {
  const [data, setData] = useState<ConsumptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [question, setQuestion] = useState("");
  const [report, setReport] = useState<ConsumptionReport | null>(null);
  const [query, setQuery] = useState<ConsumptionQuery>({ productId: "", mode: "checks", days: 30, from: brazilDate(), to: brazilDate(), startId: "", endId: "" });

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(null);
    setReport(null);
    Promise.all([
      getInventoryProducts({ requireRemote: true }), getStockChecks({ requireRemote: true }),
      getStockMovements({ requireRemote: true }), getNeiaOrderHistory({ requireRemote: true }),
    ]).then(([products, checks, movements, orders]) => {
      if (!active) return;
      setData({ products, checks, movements, orders });
      setQuery((current) => ({ ...current, productId: products.some((p) => p.id === current.productId) ? current.productId : (products.find((p) => p.name.toLowerCase() === "detergente") ?? products[0])?.id ?? "" }));
    }).catch(() => {
      if (active) setError("Não foi possível carregar o histórico completo. Confira a conexão e tente novamente.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);

  const product = data?.products.find((p) => p.id === query.productId);
  const anchors = data && product ? query.mode === "checks"
    ? productCheckReadings(product, data.checks).map((r) => ({ id: r.check.id, label: `${r.check.data} às ${r.check.hora} · ${quantity(r.item.quantity)} ${r.item.unit}` }))
    : productOrders(product, data.orders).map((order) => ({ id: order.id, label: `${order.data} às ${order.hora}` })) : [];

  function run(next: ConsumptionQuery) {
    if (!data) return;
    setError("");
    setReport(null);
    try { setReport(calculateConsumption(data, next)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível calcular este período."); }
  }

  function ask(event: FormEvent) {
    event.preventDefault();
    if (!data) return;
    setReport(null);
    try {
      const next = parseConsumptionQuestion(question, data.products);
      setQuery(next);
      run(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Revise a pergunta."); }
  }

  function updateQuery(patch: Partial<ConsumptionQuery>) {
    setQuery((current) => ({ ...current, ...patch }));
    setReport(null);
    setError("");
  }

  return <section className="screen cleaning-consumption">
    <header className="top-bar"><div><p className="eyebrow">LIMPEZA</p><h1>Consultar consumo</h1><p>Quanto saiu do estoque e o que mudou entre as conferências.</p></div></header>
    <div className="screen-action-row"><button className="ghost-button" onClick={onBack}>Voltar para Limpeza</button><button className="logout-button" onClick={onLogout}>Sair</button></div>
    {loading ? <p role="status">Carregando produtos e histórico...</p> : data && <>
      <section className="consumption-question-card">
        <form onSubmit={ask}>
          <label htmlFor="consumption-question">O que você quer saber?</label>
          <input id="consumption-question" value={question} maxLength={300} onChange={(event) => { setQuestion(event.target.value); setReport(null); setError(""); }} placeholder="Quanto de detergente gastamos nos últimos 20 dias?" required />
          <button className="primary-button" type="submit">Consultar</button>
        </form>
        <p className="consumption-hint">Use o nome do produto e o período. Exemplos:</p>
        <div className="consumption-examples">
          {["Detergente nos últimos 20 dias", "Detergente entre as últimas duas conferências"].map((example) => <button className="ghost-button" key={example} type="button" onClick={() => { setQuestion(example); setReport(null); setError(""); }}>{example}</button>)}
        </div>
        <details className="consumption-filters"><summary>Escolher produto e período</summary>
          <form onSubmit={(event) => { event.preventDefault(); setQuestion(""); run(query); }}>
            <label>Produto<select value={query.productId} onChange={(event) => updateQuery({ productId: event.target.value, startId: "", endId: "" })} required>{data.products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>Período<select value={query.mode} onChange={(event) => updateQuery({ mode: event.target.value as ConsumptionQuery["mode"], startId: "", endId: "" })}>
              <option value="checks">Entre conferências da Neia</option><option value="days">Últimos dias</option><option value="dates">Escolher datas</option><option value="orders">Entre pedidos da Neia</option>
            </select></label>
            {query.mode === "days" && <label>Quantidade de dias<input type="number" min="1" max="3650" step="1" value={query.days} onChange={(event) => updateQuery({ days: Number(event.target.value) })} required /><small>Inclui hoje até o momento da consulta.</small></label>}
            {query.mode === "dates" && <><label>De<input type="date" value={query.from} max={brazilDate()} onChange={(event) => updateQuery({ from: event.target.value })} required /></label><label>Até<input type="date" value={query.to} min={query.from} max={brazilDate()} onChange={(event) => updateQuery({ to: event.target.value })} required /></label></>}
            {(query.mode === "checks" || query.mode === "orders") && <>
              <label>Início<select value={query.startId || anchors[1]?.id || ""} onChange={(event) => updateQuery({ startId: event.target.value })} required>{anchors.length < 2 && <option value="">Sem registros suficientes</option>}{anchors.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
              <label>Fim<select value={query.endId || anchors[0]?.id || ""} onChange={(event) => updateQuery({ endId: event.target.value })} required>{anchors.length === 0 && <option value="">Sem registros</option>}{anchors.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
            </>}
            <button className="primary-button" type="submit">Calcular consumo</button>
          </form>
        </details>
      </section>
    </>}
    {error && <p className="error-message" role="alert">{error}</p>}
    {!loading && !data && <button className="primary-button" type="button" onClick={() => setRevision((current) => current + 1)}>Tentar novamente</button>}
    {report && <ConsumptionResult report={report} />}
    {data && <button className="ghost-button consumption-refresh" type="button" onClick={() => setRevision((current) => current + 1)}>Atualizar histórico</button>}
  </section>;
}

export function ConsumptionResult({ report }: { report: ConsumptionReport }) {
  const c = report.comparison;
  const unit = report.product.unit;
  return <section className="consumption-result" aria-live="polite" aria-label="Resultado da consulta">
    <h2>{report.product.name}</h2>
    <p>{dateTime(report.from)} a {dateTime(report.mode === "dates" ? report.to - 1 : report.to)}</p>
    <div className="consumption-totals">
      <article><span>Saídas registradas para uso</span><strong>{quantity(report.exits)} <small>{unit}</small></strong></article>
      <article><span>Entradas registradas no estoque</span><strong>{quantity(report.entries)} <small>{unit}</small></strong></article>
    </div>
    {report.exits === 0 && <p>Nenhuma saída registrada neste período. Isso não confirma que o produto não foi usado.</p>}
    {c ? <section className="consumption-comparison">
      <h3>{report.mode === "checks" ? "Comparação das conferências" : "Conferências dentro desse período"}</h3>
      <p>{dateTime(c.first.time)} a {dateTime(c.last.time)}</p>
      {c.estimated !== null ? <>
        <p className="consumption-estimate">Consumo estimado: <strong>{quantity(c.estimated)} {unit}</strong></p>
        <p>{quantity(c.first.item.quantity)} no início + {quantity(c.entries)} de entradas − {quantity(c.last.item.quantity)} no fim.</p>
        <p>Nesse intervalo, as saídas registradas somam {quantity(c.exits)} {unit}.</p>
        {c.difference !== 0 && <p className="consumption-difference">Diferença a conferir: {quantity(Math.abs(c.difference!))} {unit}. {c.difference! > 0 ? "A redução foi maior que as saídas registradas." : "As saídas registradas foram maiores que a redução observada."}</p>}
        <p className="consumption-hint">A estimativa depende das contagens e dos recebimentos registrados; perdas e retiradas sem registro também podem explicar a diferença.</p>
      </> : <p>{c.reason}</p>}
    </section> : <p>Sem duas conferências válidas da Neia nesse intervalo para estimar a redução do estoque.</p>}
    <details className="consumption-evidence"><summary>Ver registros usados no cálculo</summary>
      {c && <p>Contagem inicial: {quantity(c.first.item.quantity)} {unit} · Contagem final: {quantity(c.last.item.quantity)} {unit}.</p>}
      <h3>Movimentações</h3>
      {report.movements.length ? <ul>{report.movements.map((m) => <li key={m.id}><span>{m.movementType === "saida" ? "Saída para uso" : m.movementType === "entrada" ? "Entrada" : "Ajuste"} · {stockHistoryDate(m.createdAt)}<small>{m.userName}{m.observation ? ` · ${m.observation}` : ""}</small></span><strong>{quantity(m.quantity)} {m.unit}</strong></li>)}</ul> : <p>Nenhuma movimentação registrada.</p>}
      <h3>Pedidos no período</h3><p>Pedidos são uma referência de datas. Só entradas registradas contam como recebimento.</p>
      {report.orders.length ? <ul>{report.orders.map((order) => <li key={order.id}><span>{order.data} às {order.hora}<small>{order.status}</small></span></li>)}</ul> : <p>Nenhum pedido desse produto no período.</p>}
    </details>
  </section>;
}
