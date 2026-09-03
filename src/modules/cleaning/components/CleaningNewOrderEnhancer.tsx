import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { getInventoryProducts, getOrders } from "../../../storage";
import { sessionAwareSupabaseFetch, SUPABASE_URL, supabaseConfigured } from "../../security/services/supabaseClient";
import type { InventoryProduct } from "../../../types";
import "./cleaningNewOrder.css";

const SESSION_KEY = "hub-sm-active-session";
const USERS_KEY = "hub-sm-users-permissions";

type ManualDraft = {
  name: string;
  quantity: string;
  observation: string;
};

type NewOrderItem = {
  id: string;
  productName: string;
  unit: string;
  quantity: number;
  manual?: boolean;
  observation?: string;
};

const emptyManualDraft: ManualDraft = { name: "", quantity: "", observation: "" };

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

function readSession() {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) as { view?: string; currentUser?: string } : {};
  } catch {
    return {};
  }
}

function currentView() {
  return String(readSession().view ?? "");
}

function currentRequesterName() {
  const currentUser = String(readSession().currentUser ?? "").trim();
  if (currentUser === "neia") return "Neia";
  if (currentUser === "tezzei") return "Tezzei";

  try {
    const raw = window.localStorage.getItem(USERS_KEY);
    const users = raw ? JSON.parse(raw) : [];
    if (Array.isArray(users)) {
      const user = users.find((item) => item && typeof item === "object" && String(item.id ?? "") === currentUser);
      const name = String(user?.name ?? "").trim();
      if (name) return name;
    }
  } catch {
    // Usa o identificador da sessão como último recurso.
  }

  return currentUser || "Tezzei";
}

async function createRemoteOrder(requesterName: string, items: NewOrderItem[]) {
  if (!supabaseConfigured || !SUPABASE_URL) throw new Error("Conexão com o banco indisponível.");

  const now = new Date();
  const orderId = createId();
  const orderResponse = await sessionAwareSupabaseFetch(`${SUPABASE_URL}/rest/v1/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify([{
      id: orderId,
      data: now.toLocaleDateString("pt-BR"),
      hora: now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      solicitante: requesterName,
      status: "Novo",
      deleted_at: null,
      completed_at: null,
    }]),
  });

  if (!orderResponse.ok) throw new Error("Não foi possível criar o pedido.");

  const itemResponse = await sessionAwareSupabaseFetch(`${SUPABASE_URL}/rest/v1/order_items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(items.map((item) => ({
      order_id: orderId,
      product_name: item.productName,
      unit: item.unit,
      quantity: item.quantity,
      manual: Boolean(item.manual),
      observation: item.observation ?? null,
    }))),
  });

  if (!itemResponse.ok) {
    try {
      await sessionAwareSupabaseFetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${orderId}`, { method: "DELETE" });
    } catch {
      // A falha principal é reportada abaixo.
    }
    throw new Error("O pedido foi iniciado, mas os itens não foram salvos. Tente novamente.");
  }

  await getOrders();
}

export function CleaningNewOrderEnhancer() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [manualOpen, setManualOpen] = useState(false);
  const [manualDraft, setManualDraft] = useState<ManualDraft>(emptyManualDraft);
  const [manualItems, setManualItems] = useState<NewOrderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const requesterName = useMemo(() => currentRequesterName(), [open]);

  useEffect(() => {
    const root = document.getElementById("root");
    if (!(root instanceof HTMLElement)) return;

    const updateTarget = () => {
      if (currentView() !== "orders") {
        setTarget(null);
        setOpen(false);
        return;
      }

      const screen = Array.from(root.querySelectorAll<HTMLElement>(".screen")).find((candidate) => {
        const heading = Array.from(candidate.querySelectorAll("h1, h2"))
          .map((node) => normalize(node.textContent ?? ""))
          .join(" ");
        return heading.includes("PEDIDOS SINVAL");
      });
      const actionRow = screen?.querySelector<HTMLElement>(".screen-action-row");
      if (!actionRow) {
        setTarget(null);
        return;
      }

      let host = actionRow.querySelector<HTMLElement>(".cleaning-new-order-host");
      if (!host) {
        host = document.createElement("span");
        host.className = "cleaning-new-order-host";
        const logoutButton = actionRow.querySelector(".logout-button");
        if (logoutButton) actionRow.insertBefore(host, logoutButton);
        else actionRow.appendChild(host);
      }
      setTarget((current) => current === host ? current : host);
    };

    updateTarget();
    const observer = new MutationObserver(updateTarget);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setLoading(true);
    setMessage("");
    void getInventoryProducts()
      .then(setProducts)
      .catch(() => setMessage("Não foi possível carregar os produtos."))
      .finally(() => setLoading(false));
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  function close() {
    if (saving) return;
    setOpen(false);
    setQuantities({});
    setManualOpen(false);
    setManualDraft(emptyManualDraft);
    setManualItems([]);
    setMessage("");
  }

  function addManualItem() {
    const quantity = Number(manualDraft.quantity.replace(",", "."));
    if (!manualDraft.name.trim() || !Number.isFinite(quantity) || quantity <= 0) {
      setMessage("Informe o produto e uma quantidade maior que zero.");
      return;
    }
    setManualItems((current) => [...current, {
      id: createId(),
      productName: manualDraft.name.trim(),
      unit: "Produto não cadastrado",
      quantity,
      manual: true,
      observation: manualDraft.observation.trim() || undefined,
    }]);
    setManualDraft(emptyManualDraft);
    setMessage("");
  }

  async function saveOrder() {
    if (saving) return;
    const registeredItems = products.flatMap((product) => {
      const quantity = Number((quantities[product.id] ?? "").replace(",", "."));
      if (!Number.isFinite(quantity) || quantity <= 0) return [];
      return [{ id: product.id, productName: product.name, unit: product.unit, quantity } satisfies NewOrderItem];
    });
    const items = [...registeredItems, ...manualItems];
    if (!items.length) {
      setMessage("Adicione pelo menos um item ao pedido.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      await createRemoteOrder(requesterName, items);
      setMessage("Pedido criado com sucesso.");
      window.setTimeout(() => window.location.reload(), 450);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível criar o pedido.");
      setSaving(false);
    }
  }

  if (!target) return null;

  return <>
    {createPortal(
      <button className="primary-button cleaning-new-order-button" type="button" onClick={() => setOpen(true)}>
        + Novo Pedido
      </button>,
      target,
    )}
    {open && createPortal(
      <div className="cleaning-new-order-overlay" role="dialog" aria-modal="true" aria-label="Novo Pedido Sinval">
        <section className="screen cleaning-new-order-screen">
          <header className="top-bar">
            <div><p className="eyebrow">LIMPEZA</p><h1>Novo Pedido Sinval</h1><p>Solicitante: {requesterName}</p></div>
          </header>
          <div className="screen-action-row">
            <button className="ghost-button" type="button" disabled={saving} onClick={close}>Voltar para Pedidos</button>
          </div>

          {message && <p className={message.includes("sucesso") ? "success-message" : "notice-message"}>{message}</p>}
          {loading ? <p className="notice-message">Carregando produtos...</p> : <>
            <section className="product-list" aria-label="Produtos cadastrados">
              {products.map((product) => (
                <label className="product-row" key={product.id}>
                  <span><strong>{product.name}</strong><small>{product.unit}</small></span>
                  <input type="number" inputMode="decimal" min="0" placeholder="0" value={quantities[product.id] ?? ""} onChange={(event) => setQuantities((current) => ({ ...current, [product.id]: event.target.value }))} />
                </label>
              ))}
            </section>
            <button className="secondary-button wide-button" type="button" onClick={() => setManualOpen((current) => !current)}>Adicionar produto que não está na lista</button>
            {manualOpen && <section className="manual-form">
              <label>Nome do produto<input type="text" value={manualDraft.name} onChange={(event) => setManualDraft((current) => ({ ...current, name: event.target.value }))} /></label>
              <label>Quantidade<input type="number" inputMode="decimal" min="0" value={manualDraft.quantity} onChange={(event) => setManualDraft((current) => ({ ...current, quantity: event.target.value }))} /></label>
              <label>Observação opcional<textarea rows={3} value={manualDraft.observation} onChange={(event) => setManualDraft((current) => ({ ...current, observation: event.target.value }))} /></label>
              <button className="primary-button" type="button" onClick={addManualItem}>Adicionar ao pedido</button>
            </section>}
            {manualItems.length > 0 && <section className="section-block"><h2>Produtos não cadastrados</h2><div className="activity-list">
              {manualItems.map((item) => <article className="activity-card" key={item.id}><div><p className="card-kicker">{item.unit}</p><h3>{item.productName}</h3></div><p>Quantidade: {item.quantity}</p>{item.observation && <p>{item.observation}</p>}<button className="danger-button" type="button" onClick={() => setManualItems((current) => current.filter((currentItem) => currentItem.id !== item.id))}>Remover</button></article>)}
            </div></section>}
            <button className="primary-button wide-button sticky-action" type="button" disabled={saving || loading} onClick={() => { void saveOrder(); }}>{saving ? "Salvando..." : "Enviar Pedido"}</button>
          </>}
        </section>
      </div>,
      document.body,
    )}
  </>;
}
