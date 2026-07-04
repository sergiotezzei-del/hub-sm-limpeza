import { FormEvent, useMemo, useState } from "react";
import { activities, employees, products } from "./data";
import {
  addOrder,
  deleteOrder as removeStoredOrder,
  getOrders,
  updateOrder as updateStoredOrder,
} from "./storage";
import type { CleaningOrder, EmployeeId, OrderItem, UserRole } from "./types";

type View = "login" | "employee" | "order-form" | "admin" | "orders";

type ManualDraft = {
  name: string;
  quantity: string;
  observation: string;
};

const passwords: Record<string, UserRole> = {
  "1234": "tezzei",
  neia1234: "neia",
  selma1234: "selma",
  helena1234: "helena",
};

const emptyManualDraft: ManualDraft = {
  name: "",
  quantity: "",
  observation: "",
};

function App() {
  const [view, setView] = useState<View>("login");
  const [currentUser, setCurrentUser] = useState<UserRole | null>(null);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [orders, setOrders] = useState<CleaningOrder[]>(() => getOrders());
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [manualOpen, setManualOpen] = useState(false);
  const [manualDraft, setManualDraft] = useState<ManualDraft>(emptyManualDraft);
  const [manualItems, setManualItems] = useState<OrderItem[]>([]);
  const [notice, setNotice] = useState("");
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<OrderItem[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<CleaningOrder | null>(null);

  const newOrders = useMemo(
    () => orders.filter((order) => order.status === "Novo"),
    [orders],
  );

  const employee =
    currentUser && currentUser !== "tezzei" ? employees[currentUser] : null;

  function refreshOrders() {
    setOrders(getOrders());
  }

  function goToLogin() {
    setCurrentUser(null);
    setView("login");
    setPassword("");
    setLoginError("");
    setNotice("");
    setEditingOrderId(null);
    setEditDraft([]);
  }

  function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const user = passwords[password.trim()];

    if (!user) {
      setLoginError("Senha incorreta");
      return;
    }

    setCurrentUser(user);
    setLoginError("");
    setNotice("");
    refreshOrders();
    setView(user === "tezzei" ? "admin" : "employee");
  }

  function setProductQuantity(productId: string, value: string) {
    setQuantities((current) => ({ ...current, [productId]: value }));
  }

  function addManualItem() {
    const quantity = Number(manualDraft.quantity);

    if (!manualDraft.name.trim() || !Number.isFinite(quantity) || quantity <= 0) {
      setNotice("Informe o produto e uma quantidade maior que zero.");
      return;
    }

    setManualItems((current) => [
      ...current,
      {
        id: createId(),
        productName: manualDraft.name.trim(),
        unit: "Produto não cadastrado",
        quantity,
        manual: true,
        observation: manualDraft.observation.trim() || undefined,
      },
    ]);
    setManualDraft(emptyManualDraft);
    setNotice("");
  }

  function removeManualItem(itemId: string) {
    setManualItems((current) => current.filter((item) => item.id !== itemId));
  }

  function sendOrder() {
    const selectedProducts = products
      .map((product) => {
        const quantity = Number(quantities[product.id]);
        if (!Number.isFinite(quantity) || quantity <= 0) return null;
        return {
          id: product.id,
          productName: product.name,
          unit: product.unit,
          quantity,
        };
      })
      .filter((item): item is OrderItem => Boolean(item));

    const items = [...selectedProducts, ...manualItems].filter((item) => item.quantity > 0);

    if (items.length === 0) {
      setNotice("Adicione pelo menos um item ao pedido.");
      return;
    }

    const now = new Date();
    const order: CleaningOrder = {
      id: createId(),
      data: now.toLocaleDateString("pt-BR"),
      hora: now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      solicitante: "Neia",
      status: "Novo",
      itens: items,
    };

    addOrder(order);
    refreshOrders();
    setQuantities({});
    setManualItems([]);
    setManualDraft(emptyManualDraft);
    setManualOpen(false);
    setNotice("Pedido enviado para Tezzei.");
    setView("employee");
  }

  async function copyOrder(order: CleaningOrder) {
    const text = [
      "Pedido de Materiais - Sinval",
      `Solicitante: ${order.solicitante}`,
      `Data: ${order.data}`,
      "",
      ...order.itens.map((item) => `${item.productName} - ${item.quantity} ${item.unit}`),
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setNotice("Pedido copiado.");
    } catch {
      setNotice("Não foi possível copiar automaticamente.");
    }
  }

  function startEdit(order: CleaningOrder) {
    setEditingOrderId(order.id);
    setEditDraft(order.itens.map((item) => ({ ...item })));
    setNotice("");
  }

  function updateDraftItem(itemId: string, field: keyof OrderItem, value: string) {
    setEditDraft((current) =>
      current.map((item) =>
        item.id === itemId
          ? field === "quantity"
            ? { ...item, quantity: Number(value) }
            : { ...item, [field]: value }
          : item,
      ),
    );
  }

  function removeDraftItem(itemId: string) {
    setEditDraft((current) => current.filter((item) => item.id !== itemId));
  }

  function saveEdit(order: CleaningOrder) {
    const cleanItems = editDraft
      .map((item) => ({
        ...item,
        productName: item.productName.trim(),
        observation: item.observation?.trim() || undefined,
      }))
      .filter((item) => item.productName && item.quantity > 0);

    if (cleanItems.length === 0) {
      setNotice("Pedido precisa ter pelo menos um item.");
      return;
    }

    updateStoredOrder({ ...order, itens: cleanItems });
    refreshOrders();
    setEditingOrderId(null);
    setEditDraft([]);
    setNotice("Pedido atualizado.");
  }

  function markOrderDone(order: CleaningOrder) {
    updateStoredOrder({ ...order, status: "Pedido feito" });
    refreshOrders();
    setNotice("Pedido marcado como feito.");
  }

  function confirmDeleteOrder() {
    if (!deleteTarget) return;
    removeStoredOrder(deleteTarget.id);
    refreshOrders();
    setDeleteTarget(null);
    setNotice("Pedido excluído.");
  }

  return (
    <main className="app-shell">
      {view === "login" && (
        <LoginScreen
          password={password}
          loginError={loginError}
          onPasswordChange={setPassword}
          onSubmit={handleLogin}
        />
      )}

      {view === "employee" && employee && (
        <EmployeeScreen
          employeeId={employee.id}
          notice={notice}
          onLogout={goToLogin}
          onNewOrder={() => {
            setNotice("");
            setView("order-form");
          }}
        />
      )}

      {view === "order-form" && (
        <OrderFormScreen
          quantities={quantities}
          manualOpen={manualOpen}
          manualDraft={manualDraft}
          manualItems={manualItems}
          notice={notice}
          onBack={() => {
            setNotice("");
            setView("employee");
          }}
          onLogout={goToLogin}
          onQuantityChange={setProductQuantity}
          onManualOpenChange={setManualOpen}
          onManualDraftChange={setManualDraft}
          onAddManualItem={addManualItem}
          onRemoveManualItem={removeManualItem}
          onSendOrder={sendOrder}
        />
      )}

      {view === "admin" && (
        <AdminScreen
          newOrdersCount={newOrders.length}
          onLogout={goToLogin}
          onOpenOrders={() => {
            setNotice("");
            refreshOrders();
            setView("orders");
          }}
        />
      )}

      {view === "orders" && (
        <OrdersScreen
          orders={orders}
          notice={notice}
          editingOrderId={editingOrderId}
          editDraft={editDraft}
          onBack={() => {
            setEditingOrderId(null);
            setNotice("");
            refreshOrders();
            setView("admin");
          }}
          onLogout={goToLogin}
          onCopyOrder={copyOrder}
          onStartEdit={startEdit}
          onCancelEdit={() => {
            setEditingOrderId(null);
            setEditDraft([]);
          }}
          onUpdateDraftItem={updateDraftItem}
          onRemoveDraftItem={removeDraftItem}
          onSaveEdit={saveEdit}
          onMarkDone={markOrderDone}
          onRequestDelete={setDeleteTarget}
        />
      )}

      {deleteTarget && (
        <DeleteDialog
          order={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDeleteOrder}
        />
      )}

      <footer>Desenvolvido por TEZZEI</footer>
    </main>
  );
}

type LoginScreenProps = {
  password: string;
  loginError: string;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function LoginScreen({ password, loginError, onPasswordChange, onSubmit }: LoginScreenProps) {
  return (
    <section className="screen login-screen">
      <div className="brand-mark" aria-hidden="true">T</div>
      <div className="title-group center">
        <p className="eyebrow">Central Operacional HUB SM</p>
        <h1>TEZZEI HUB</h1>
      </div>

      <form className="login-form" onSubmit={onSubmit}>
        <label htmlFor="password">Digite sua senha</label>
        <input
          id="password"
          type="password"
          value={password}
          autoComplete="current-password"
          onChange={(event) => onPasswordChange(event.target.value)}
        />
        {loginError && <p className="error-message">{loginError}</p>}
        <button className="primary-button" type="submit">Entrar</button>
      </form>
    </section>
  );
}

type EmployeeScreenProps = {
  employeeId: EmployeeId;
  notice: string;
  onLogout: () => void;
  onNewOrder: () => void;
};

function EmployeeScreen({ employeeId, notice, onLogout, onNewOrder }: EmployeeScreenProps) {
  const employee = employees[employeeId];
  const employeeActivities = activities.filter((activity) => activity.employeeId === employeeId);

  return (
    <section className="screen">
      <TopBar title={employee.name} subtitle="Módulo Limpeza" onLogout={onLogout} />
      {notice && <p className="success-message">{notice}</p>}

      <section className="info-grid" aria-label="Horários">
        <InfoCard title="Horário" value={employee.schedule} />
        <InfoCard title="Almoço" value={employee.lunch} />
        <InfoCard title="Sábado" value={employee.saturday} />
      </section>

      {employeeId === "neia" && (
        <button className="primary-button wide-button" type="button" onClick={onNewOrder}>
          Fazer Pedido Sinval
        </button>
      )}

      <section className="section-block">
        <h2>Atividades</h2>
        <div className="activity-list">
          {employeeActivities.map((activity) => (
            <article className="activity-card" key={activity.id}>
              <div>
                <p className="card-kicker">{activity.pavimento}</p>
                <h3>{activity.ambiente}</h3>
              </div>
              <p>{activity.atividade}</p>
              <span>{activity.frequencia}</span>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

type OrderFormScreenProps = {
  quantities: Record<string, string>;
  manualOpen: boolean;
  manualDraft: ManualDraft;
  manualItems: OrderItem[];
  notice: string;
  onBack: () => void;
  onLogout: () => void;
  onQuantityChange: (productId: string, value: string) => void;
  onManualOpenChange: (value: boolean) => void;
  onManualDraftChange: (draft: ManualDraft) => void;
  onAddManualItem: () => void;
  onRemoveManualItem: (itemId: string) => void;
  onSendOrder: () => void;
};

function OrderFormScreen({
  quantities,
  manualOpen,
  manualDraft,
  manualItems,
  notice,
  onBack,
  onLogout,
  onQuantityChange,
  onManualOpenChange,
  onManualDraftChange,
  onAddManualItem,
  onRemoveManualItem,
  onSendOrder,
}: OrderFormScreenProps) {
  return (
    <section className="screen">
      <TopBar title="Fazer Pedido Sinval" subtitle="Solicitante: Neia" onLogout={onLogout} />
      <button className="ghost-button" type="button" onClick={onBack}>Voltar para Neia</button>
      {notice && <p className="notice-message">{notice}</p>}

      <section className="product-list" aria-label="Produtos cadastrados">
        {products.map((product) => (
          <label className="product-row" key={product.id}>
            <span>
              <strong>{product.name}</strong>
              <small>{product.unit}</small>
            </span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              placeholder="0"
              value={quantities[product.id] ?? ""}
              onChange={(event) => onQuantityChange(product.id, event.target.value)}
              aria-label={`Quantidade de ${product.name}`}
            />
          </label>
        ))}
      </section>

      <button className="secondary-button wide-button" type="button" onClick={() => onManualOpenChange(!manualOpen)}>
        Adicionar pedido que não tem na lista
      </button>

      {manualOpen && (
        <section className="manual-form" aria-label="Produto não cadastrado">
          <label>
            Nome do produto
            <input
              type="text"
              value={manualDraft.name}
              onChange={(event) => onManualDraftChange({ ...manualDraft, name: event.target.value })}
            />
          </label>
          <label>
            Quantidade
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={manualDraft.quantity}
              onChange={(event) => onManualDraftChange({ ...manualDraft, quantity: event.target.value })}
            />
          </label>
          <label>
            Observação opcional
            <textarea
              value={manualDraft.observation}
              rows={3}
              onChange={(event) => onManualDraftChange({ ...manualDraft, observation: event.target.value })}
            />
          </label>
          <button className="primary-button" type="button" onClick={onAddManualItem}>Adicionar ao pedido</button>
        </section>
      )}

      {manualItems.length > 0 && (
        <section className="section-block">
          <h2>Produtos não cadastrados</h2>
          <div className="activity-list">
            {manualItems.map((item) => (
              <article className="activity-card" key={item.id}>
                <div>
                  <p className="card-kicker">{item.unit}</p>
                  <h3>{item.productName}</h3>
                </div>
                <p>Quantidade: {item.quantity}</p>
                {item.observation && <p>{item.observation}</p>}
                <button className="danger-button" type="button" onClick={() => onRemoveManualItem(item.id)}>Remover</button>
              </article>
            ))}
          </div>
        </section>
      )}

      <button className="primary-button wide-button sticky-action" type="button" onClick={onSendOrder}>
        Enviar Pedido
      </button>
    </section>
  );
}

type AdminScreenProps = {
  newOrdersCount: number;
  onLogout: () => void;
  onOpenOrders: () => void;
};

function AdminScreen({ newOrdersCount, onLogout, onOpenOrders }: AdminScreenProps) {
  return (
    <section className="screen">
      <TopBar title="Painel Tezzei" subtitle="Central Operacional HUB SM" onLogout={onLogout} />

      {newOrdersCount > 0 && (
        <button className="alert-banner" type="button" onClick={onOpenOrders}>
          🔔 Pedido novo da Neia
        </button>
      )}

      <section className="admin-grid" aria-label="Painel administrativo">
        <button className="admin-card action-card" type="button" onClick={onOpenOrders}>
          <span>Limpeza</span>
          <strong>Ativo — rotinas e pedidos Sinval</strong>
        </button>
        <button className="admin-card action-card" type="button" onClick={onOpenOrders}>
          <span>Pedidos Pendentes</span>
          <strong>{newOrdersCount > 0 ? `Pedidos Pendentes: ${newOrdersCount}` : "Nenhum pedido pendente"}</strong>
        </button>
        <AdminCard title="Estoque" detail="Em breve — produtos e inventário" />
        <AdminCard title="Manutenção" detail="Em breve — chamados internos" />
        <AdminCard title="Chaves" detail="Em breve — controle de acessos" />
        <AdminCard title="Patrimônio" detail="Em breve — itens e equipamentos" />
        <AdminCard title="Relatórios" detail="Em breve — indicadores" />
        <AdminCard title="Equipe" detail="Neia, Selma e Helena" />
      </section>
    </section>
  );
}

type OrdersScreenProps = {
  orders: CleaningOrder[];
  notice: string;
  editingOrderId: string | null;
  editDraft: OrderItem[];
  onBack: () => void;
  onLogout: () => void;
  onCopyOrder: (order: CleaningOrder) => void;
  onStartEdit: (order: CleaningOrder) => void;
  onCancelEdit: () => void;
  onUpdateDraftItem: (itemId: string, field: keyof OrderItem, value: string) => void;
  onRemoveDraftItem: (itemId: string) => void;
  onSaveEdit: (order: CleaningOrder) => void;
  onMarkDone: (order: CleaningOrder) => void;
  onRequestDelete: (order: CleaningOrder) => void;
};

function OrdersScreen({
  orders,
  notice,
  editingOrderId,
  editDraft,
  onBack,
  onLogout,
  onCopyOrder,
  onStartEdit,
  onCancelEdit,
  onUpdateDraftItem,
  onRemoveDraftItem,
  onSaveEdit,
  onMarkDone,
  onRequestDelete,
}: OrdersScreenProps) {
  return (
    <section className="screen">
      <TopBar title="Pedidos da Neia" subtitle="Pedidos salvos no aparelho" onLogout={onLogout} />
      <button className="ghost-button" type="button" onClick={onBack}>Voltar ao Painel</button>
      {notice && <p className="notice-message">{notice}</p>}

      {orders.length === 0 ? (
        <section className="empty-state">
          <h2>Nenhum pedido salvo</h2>
          <p>Quando a Neia enviar um pedido, ele aparecerá aqui.</p>
        </section>
      ) : (
        <section className="orders-list" aria-label="Pedidos salvos">
          {orders.map((order) => {
            const editing = editingOrderId === order.id;
            return (
              <article className="order-card" key={order.id}>
                <div className="order-head">
                  <div>
                    <p className="card-kicker">{order.data} às {order.hora}</p>
                    <h2>{order.solicitante}</h2>
                  </div>
                  <span className={order.status === "Novo" ? "status-new" : "status-done"}>{order.status}</span>
                </div>

                {editing ? (
                  <EditOrderItems items={editDraft} onUpdateDraftItem={onUpdateDraftItem} onRemoveDraftItem={onRemoveDraftItem} />
                ) : (
                  <ul className="item-list">
                    {order.itens.map((item) => (
                      <li key={item.id}>
                        <span>
                          {item.productName}
                          {item.manual && <small>Produto não cadastrado</small>}
                          {item.observation && <small>{item.observation}</small>}
                        </span>
                        <strong>{item.quantity} {item.unit}</strong>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="button-grid">
                  {editing ? (
                    <>
                      <button className="primary-button" type="button" onClick={() => onSaveEdit(order)}>Salvar</button>
                      <button className="ghost-button" type="button" onClick={onCancelEdit}>Cancelar</button>
                    </>
                  ) : (
                    <>
                      <button className="secondary-button" type="button" onClick={() => onCopyOrder(order)}>Copiar Pedido</button>
                      <button className="ghost-button" type="button" onClick={() => onStartEdit(order)}>Editar Pedido</button>
                      <button className="success-button" type="button" onClick={() => onMarkDone(order)}>Marcar como Pedido Feito</button>
                      <button className="danger-button" type="button" onClick={() => onRequestDelete(order)}>Excluir Pedido</button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </section>
  );
}

type EditOrderItemsProps = {
  items: OrderItem[];
  onUpdateDraftItem: (itemId: string, field: keyof OrderItem, value: string) => void;
  onRemoveDraftItem: (itemId: string) => void;
};

function EditOrderItems({ items, onUpdateDraftItem, onRemoveDraftItem }: EditOrderItemsProps) {
  return (
    <div className="edit-list">
      {items.map((item) => (
        <section className="edit-row" key={item.id}>
          <label>
            Produto
            <input
              type="text"
              value={item.productName}
              disabled={!item.manual}
              onChange={(event) => onUpdateDraftItem(item.id, "productName", event.target.value)}
            />
          </label>
          <label>
            Quantidade
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={String(item.quantity)}
              onChange={(event) => onUpdateDraftItem(item.id, "quantity", event.target.value)}
            />
          </label>
          {item.manual && (
            <label>
              Observação
              <input
                type="text"
                value={item.observation ?? ""}
                onChange={(event) => onUpdateDraftItem(item.id, "observation", event.target.value)}
              />
            </label>
          )}
          <button className="danger-button" type="button" onClick={() => onRemoveDraftItem(item.id)}>Remover</button>
        </section>
      ))}
    </div>
  );
}

type TopBarProps = {
  title: string;
  subtitle: string;
  onLogout: () => void;
};

function TopBar({ title, subtitle, onLogout }: TopBarProps) {
  return (
    <header className="top-bar">
      <div>
        <p className="eyebrow">TEZZEI HUB</p>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <button className="logout-button" type="button" onClick={onLogout}>Sair</button>
    </header>
  );
}

type InfoCardProps = { title: string; value: string };

function InfoCard({ title, value }: InfoCardProps) {
  return (
    <article className="info-card">
      <span>{title}</span>
      <strong>{value}</strong>
    </article>
  );
}

type AdminCardProps = { title: string; detail: string };

function AdminCard({ title, detail }: AdminCardProps) {
  return (
    <article className="admin-card">
      <span>{title}</span>
      <strong>{detail}</strong>
    </article>
  );
}

type DeleteDialogProps = {
  order: CleaningOrder;
  onCancel: () => void;
  onConfirm: () => void;
};

function DeleteDialog({ order, onCancel, onConfirm }: DeleteDialogProps) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title">
        <h2 id="delete-title">Tem certeza que deseja excluir este pedido?</h2>
        <p>Pedido de {order.solicitante}, {order.data} às {order.hora}.</p>
        <div className="button-grid">
          <button className="ghost-button" type="button" onClick={onCancel}>Cancelar</button>
          <button className="danger-button" type="button" onClick={onConfirm}>Excluir</button>
        </div>
      </section>
    </div>
  );
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default App;
