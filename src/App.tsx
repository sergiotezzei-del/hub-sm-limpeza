import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { activities, employees, products } from "./data";
import {
  addOrder,
  addStockCheck,
  deleteOrder as removeStoredOrder,
  getEmployeeProfiles,
  getLocalEmployeeProfiles,
  getLocalOrders,
  getNeiaOrderHistory,
  getOrderHistory,
  getOrders,
  isCloudStorageEnabled,
  saveEmployeePhoto,
  updateOrder as updateStoredOrder,
} from "./storage";
import type {
  CleaningOrder,
  EmployeeId,
  EmployeeProfile,
  InventoryProduct,
  OrderItem,
  StockCheck,
  StockCheckItem,
  StockMovement,
  UserRole,
} from "./types";

type View =
  | "login"
  | "employee"
  | "employee-preview"
  | "order-form"
  | "admin"
  | "cleaning-dashboard"
  | "orders"
  | "profiles"
  | "stock-check"
  | "stock-exit"
  | "barcode-register"
  | "stock-exit-history"
  | "current-stock"
  | "order-history"
  | "neia-history";

type ManualDraft = {
  name: string;
  quantity: string;
  observation: string;
};

type SavedSession = {
  view: View;
  currentUser: UserRole | null;
  previewEmployeeId: EmployeeId | null;
};

const BRAND = "SANTA MARIA SOLUÇÕES IMOBILIÁRIAS";
const FOOTER = "TEZZEI - Operações & Processos";
const SESSION_KEY = "hub-sm-active-session";
const INVENTORY_KEY = "hub-sm-inventory-products";
const STOCK_MOVEMENTS_KEY = "hub-sm-stock-movements";

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

const employeeIds = Object.keys(employees) as EmployeeId[];

function App() {
  const initialSession = getInitialSession();
  const [view, setView] = useState<View>(initialSession.view);
  const [currentUser, setCurrentUser] = useState<UserRole | null>(initialSession.currentUser);
  const [previewEmployeeId, setPreviewEmployeeId] = useState<EmployeeId | null>(initialSession.previewEmployeeId);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [orders, setOrders] = useState<CleaningOrder[]>(() => getLocalOrders().filter((order) => !order.deletedAt));
  const [historyOrders, setHistoryOrders] = useState<CleaningOrder[]>([]);
  const [profiles, setProfiles] = useState<Record<EmployeeId, EmployeeProfile>>(() => getLocalEmployeeProfiles());
  const [inventoryProducts, setInventoryProducts] = useState<InventoryProduct[]>(() => getLocalInventoryProducts());
  const [stockMovements, setStockMovements] = useState<StockMovement[]>(() => getLocalStockMovements());
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [manualOpen, setManualOpen] = useState(false);
  const [manualDraft, setManualDraft] = useState<ManualDraft>(emptyManualDraft);
  const [manualItems, setManualItems] = useState<OrderItem[]>([]);
  const [stockQuantities, setStockQuantities] = useState<Record<string, string>>({});
  const [stockObservations, setStockObservations] = useState<Record<string, string>>({});
  const [stockExitUserId, setStockExitUserId] = useState<EmployeeId>("neia");
  const [stockExitBarcode, setStockExitBarcode] = useState("");
  const [stockExitProductId, setStockExitProductId] = useState("");
  const [stockExitQuantity, setStockExitQuantity] = useState("1");
  const [stockExitObservation, setStockExitObservation] = useState("");
  const [stockExitMessage, setStockExitMessage] = useState("");
  const [barcodeProductId, setBarcodeProductId] = useState(products[0]?.id ?? "");
  const [barcodeValue, setBarcodeValue] = useState("");
  const [barcodeMessage, setBarcodeMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<OrderItem[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<CleaningOrder | null>(null);

  const onlineEnabled = isCloudStorageEnabled();

  useEffect(() => {
    document.title = `${BRAND} - Central Operacional HUB SM`;
    void refreshOrders();
    void refreshProfiles();
    refreshInventory();
    refreshStockMovements();

    const interval = window.setInterval(() => {
      if (isCloudStorageEnabled()) {
        void refreshOrders();
      }
    }, 30000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (currentUser) {
      const session: SavedSession = { view, currentUser, previewEmployeeId };
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }
  }, [view, currentUser, previewEmployeeId]);

  useEffect(() => {
    const resetScroll = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    resetScroll();
    const frame = window.requestAnimationFrame(resetScroll);
    const timer = window.setTimeout(resetScroll, 120);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [view, currentUser, previewEmployeeId]);

  const newOrders = useMemo(() => orders.filter((order) => order.status === "Novo" && !order.deletedAt), [orders]);
  const activeEmployeeId = getActiveEmployeeId(view, currentUser, previewEmployeeId);
  const selectedExitProduct = inventoryProducts.find((product) => product.id === stockExitProductId) ?? null;

  function getAfterCleaningActionView(): View {
    if (currentUser === "tezzei") return previewEmployeeId ? "employee-preview" : "cleaning-dashboard";
    return "employee";
  }

  async function refreshOrders() {
    const currentOrders = await getOrders();
    setOrders(currentOrders);
  }

  async function refreshProfiles() {
    const currentProfiles = await getEmployeeProfiles();
    setProfiles(currentProfiles);
  }

  function refreshInventory() {
    setInventoryProducts(getLocalInventoryProducts());
  }

  function refreshStockMovements() {
    setStockMovements(getLocalStockMovements());
  }

  function goToLogin() {
    window.sessionStorage.removeItem(SESSION_KEY);
    setCurrentUser(null);
    setPreviewEmployeeId(null);
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

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) activeElement.blur();

    setCurrentUser(user);
    setPreviewEmployeeId(null);
    setLoginError("");
    setNotice("");
    void refreshOrders();
    void refreshProfiles();
    refreshInventory();
    refreshStockMovements();
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

  async function sendOrder() {
    const selectedProducts = products
      .map((product) => {
        const quantity = Number(quantities[product.id]);
        if (!Number.isFinite(quantity) || quantity <= 0) return null;
        return { id: product.id, productName: product.name, unit: product.unit, quantity };
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

    try {
      await addOrder(order);
      await refreshOrders();
      setQuantities({});
      setManualItems([]);
      setManualDraft(emptyManualDraft);
      setManualOpen(false);
      setNotice(onlineEnabled ? "Pedido enviado para Tezzei." : "Pedido salvo neste aparelho.");
      setView(getAfterCleaningActionView());
    } catch {
      await refreshOrders();
      setNotice("Pedido salvo neste aparelho. Falha ao sincronizar online.");
      setView(getAfterCleaningActionView());
    }
  }

  async function sendStockCheck() {
    const items = products
      .map((product) => {
        const quantity = Number(stockQuantities[product.id]);
        const observation = stockObservations[product.id]?.trim();
        if ((!Number.isFinite(quantity) || quantity <= 0) && !observation) return null;
        return {
          id: product.id,
          productName: product.name,
          unit: product.unit,
          quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 0,
          observation: observation || undefined,
        };
      })
      .filter((item): item is StockCheckItem => Boolean(item));

    if (items.length === 0) {
      setNotice("Informe pelo menos um item para conferir o estoque.");
      return;
    }

    const now = new Date();
    const check: StockCheck = {
      id: createId(),
      data: now.toLocaleDateString("pt-BR"),
      hora: now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      conferente: "Neia",
      itens: items,
    };

    try {
      await addStockCheck(check);
      setStockQuantities({});
      setStockObservations({});
      setNotice("Conferência de estoque enviada para Tezzei.");
      setView(getAfterCleaningActionView());
    } catch {
      setNotice("Conferência salva neste aparelho. Falha ao sincronizar online.");
      setView(getAfterCleaningActionView());
    }
  }

  function openStockExit(userId?: EmployeeId) {
    const nextUser = userId ?? activeEmployeeId ?? "neia";
    setStockExitUserId(nextUser);
    setStockExitBarcode("");
    setStockExitProductId("");
    setStockExitQuantity("1");
    setStockExitObservation("");
    setStockExitMessage("");
    refreshInventory();
    setView("stock-exit");
  }

  async function handleStockExitBarcode(barcode: string) {
    const cleanBarcode = barcode.trim();
    setStockExitBarcode(cleanBarcode);
    const product = inventoryProducts.find((item) => item.barcode === cleanBarcode);
    if (product) {
      setStockExitProductId(product.id);
      setStockExitMessage(`Produto encontrado: ${product.name}`);
    } else {
      setStockExitProductId("");
      setStockExitMessage(cleanBarcode ? `Produto não encontrado. Código: ${cleanBarcode}` : "");
    }
  }

  async function handleStockExitFile(file: File | null) {
    if (!file) return;
    try {
      const barcode = await decodeBarcodeFromFile(file);
      await handleStockExitBarcode(barcode);
    } catch {
      setStockExitMessage("Não consegui ler o código pela foto. Digite o código manualmente.");
    }
  }

  function confirmStockExit() {
    if (!selectedExitProduct) {
      setStockExitMessage("Bipe ou selecione um produto antes de confirmar.");
      return;
    }

    const quantity = Number(stockExitQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setStockExitMessage("Informe uma quantidade maior que zero.");
      return;
    }

    addLocalStockExit({ product: selectedExitProduct, quantity, userId: stockExitUserId, observation: stockExitObservation });
    refreshInventory();
    refreshStockMovements();
    setStockExitBarcode("");
    setStockExitProductId("");
    setStockExitQuantity("1");
    setStockExitObservation("");
    setStockExitMessage("Saída registrada com sucesso.");
  }

  async function handleBarcodeRegisterFile(file: File | null) {
    if (!file) return;
    try {
      const barcode = await decodeBarcodeFromFile(file);
      setBarcodeValue(barcode);
      setBarcodeMessage(`Código lido: ${barcode}`);
    } catch {
      setBarcodeMessage("Não consegui ler o código pela foto. Digite manualmente.");
    }
  }

  function saveBarcodeRegister() {
    if (!barcodeProductId || !barcodeValue.trim()) {
      setBarcodeMessage("Selecione um produto e informe o código.");
      return;
    }
    saveLocalProductBarcode(barcodeProductId, barcodeValue.trim());
    refreshInventory();
    setBarcodeValue("");
    setBarcodeMessage("Código de barras cadastrado.");
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

  async function saveEdit(order: CleaningOrder) {
    const cleanItems = editDraft
      .map((item) => ({ ...item, productName: item.productName.trim(), observation: item.observation?.trim() || undefined }))
      .filter((item) => item.productName && item.quantity > 0);

    if (cleanItems.length === 0) {
      setNotice("Pedido precisa ter pelo menos um item.");
      return;
    }

    try {
      await updateStoredOrder({ ...order, itens: cleanItems });
      await refreshOrders();
      setEditingOrderId(null);
      setEditDraft([]);
      setNotice("Pedido atualizado.");
    } catch {
      await refreshOrders();
      setNotice("Pedido atualizado apenas neste aparelho. Falha ao sincronizar online.");
    }
  }

  async function markOrderDone(order: CleaningOrder) {
    try {
      await updateStoredOrder({ ...order, status: "Pedido feito" });
      await refreshOrders();
      setNotice("Pedido marcado como feito.");
    } catch {
      await refreshOrders();
      setNotice("Pedido marcado apenas neste aparelho. Falha ao sincronizar online.");
    }
  }

  async function confirmDeleteOrder() {
    if (!deleteTarget) return;

    try {
      await removeStoredOrder(deleteTarget.id);
      await refreshOrders();
      setDeleteTarget(null);
      setNotice("Pedido excluído e enviado ao histórico.");
    } catch {
      await refreshOrders();
      setDeleteTarget(null);
      setNotice("Pedido excluído apenas neste aparelho. Falha ao sincronizar online.");
    }
  }

  async function openOrderHistory() {
    setNotice("");
    const history = await getOrderHistory();
    setHistoryOrders(history);
    setView("order-history");
  }

  async function openNeiaHistory() {
    setNotice("");
    const history = await getNeiaOrderHistory();
    setHistoryOrders(history);
    setView("neia-history");
  }

  function openProfiles() {
    setNotice("");
    setPreviewEmployeeId(null);
    void refreshProfiles();
    setView("profiles");
  }

  function openCleaningDashboard() {
    setNotice("");
    void refreshOrders();
    void refreshProfiles();
    refreshInventory();
    refreshStockMovements();
    setView("cleaning-dashboard");
  }

  function previewEmployee(employeeId: EmployeeId) {
    setNotice("");
    setPreviewEmployeeId(employeeId);
    setView("employee-preview");
  }

  async function handlePhotoChange(employeeId: EmployeeId, file: File | null) {
    if (!file) return;
    try {
      const photoData = await imageFileToDataUrl(file);
      await saveEmployeePhoto(employeeId, photoData);
      const currentProfiles = await getEmployeeProfiles();
      setProfiles(currentProfiles);
      setNotice("Foto cadastrada.");
    } catch {
      setNotice("Não foi possível salvar a foto.");
    }
  }

  return (
    <main className="app-shell">
      {view === "login" && <LoginScreen password={password} loginError={loginError} onPasswordChange={setPassword} onSubmit={handleLogin} />}

      {(view === "employee" || view === "employee-preview") && activeEmployeeId && (
        <EmployeeScreen
          employeeId={activeEmployeeId}
          profile={profiles[activeEmployeeId]}
          notice={notice}
          adminPreview={view === "employee-preview"}
          onLogout={goToLogin}
          onBackToProfiles={() => setView("profiles")}
          onNewOrder={() => {
            setNotice("");
            setView("order-form");
          }}
          onStockCheck={() => {
            setNotice("");
            setView("stock-check");
          }}
          onStockExit={() => openStockExit(activeEmployeeId)}
          onOpenHistory={openNeiaHistory}
          onProfilePhotoChange={handlePhotoChange}
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
            setView(activeEmployeeId ? "employee" : "cleaning-dashboard");
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

      {view === "stock-check" && (
        <StockCheckScreen
          quantities={stockQuantities}
          observations={stockObservations}
          notice={notice}
          onBack={() => {
            setNotice("");
            setView(activeEmployeeId ? "employee" : "cleaning-dashboard");
          }}
          onLogout={goToLogin}
          onQuantityChange={(productId, value) => setStockQuantities((current) => ({ ...current, [productId]: value }))}
          onObservationChange={(productId, value) => setStockObservations((current) => ({ ...current, [productId]: value }))}
          onSendStockCheck={sendStockCheck}
        />
      )}

      {view === "stock-exit" && (
        <StockExitScreen
          inventoryProducts={inventoryProducts}
          selectedProduct={selectedExitProduct}
          userId={stockExitUserId}
          barcode={stockExitBarcode}
          quantity={stockExitQuantity}
          observation={stockExitObservation}
          message={stockExitMessage}
          adminMode={currentUser === "tezzei"}
          onBack={() => setView(getAfterCleaningActionView())}
          onLogout={goToLogin}
          onUserChange={setStockExitUserId}
          onBarcodeChange={handleStockExitBarcode}
          onFileChange={handleStockExitFile}
          onProductChange={setStockExitProductId}
          onQuantityChange={setStockExitQuantity}
          onObservationChange={setStockExitObservation}
          onConfirm={confirmStockExit}
        />
      )}

      {view === "barcode-register" && (
        <BarcodeRegisterScreen
          inventoryProducts={inventoryProducts}
          productId={barcodeProductId}
          barcode={barcodeValue}
          message={barcodeMessage}
          onBack={() => setView("cleaning-dashboard")}
          onLogout={goToLogin}
          onProductChange={setBarcodeProductId}
          onBarcodeChange={setBarcodeValue}
          onFileChange={handleBarcodeRegisterFile}
          onSave={saveBarcodeRegister}
        />
      )}

      {view === "stock-exit-history" && <StockExitHistoryScreen movements={stockMovements} onBack={() => setView("cleaning-dashboard")} onLogout={goToLogin} />}
      {view === "current-stock" && <CurrentStockScreen inventoryProducts={inventoryProducts} onBack={() => setView("cleaning-dashboard")} onLogout={goToLogin} />}

      {view === "admin" && <AdminScreen newOrdersCount={newOrders.length} onlineEnabled={onlineEnabled} onLogout={goToLogin} onOpenCleaningDashboard={openCleaningDashboard} />}

      {view === "cleaning-dashboard" && (
        <CleaningDashboardScreen
          newOrdersCount={newOrders.length}
          onBack={() => setView("admin")}
          onLogout={goToLogin}
          onOpenOrders={() => {
            setNotice("");
            void refreshOrders();
            setView("orders");
          }}
          onOpenStockExit={() => openStockExit("neia")}
          onOpenBarcodeRegister={() => {
            setBarcodeMessage("");
            setView("barcode-register");
          }}
          onOpenCurrentStock={() => {
            refreshInventory();
            setView("current-stock");
          }}
          onOpenStockHistory={() => {
            refreshStockMovements();
            setView("stock-exit-history");
          }}
          onOpenProfiles={openProfiles}
          onOpenOrderHistory={openOrderHistory}
          onOpenNeiaHistory={openNeiaHistory}
        />
      )}

      {view === "profiles" && (
        <ProfilesScreen profiles={profiles} notice={notice} onBack={() => setView("cleaning-dashboard")} onLogout={goToLogin} onPreviewEmployee={previewEmployee} onProfilePhotoChange={handlePhotoChange} />
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
            void refreshOrders();
            setView("cleaning-dashboard");
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

      {(view === "order-history" || view === "neia-history") && (
        <HistoryScreen
          title={view === "order-history" ? "Histórico de Concluídos e Excluídos" : "Histórico de Pedidos da Neia"}
          subtitle={view === "order-history" ? "Pedidos concluídos ou apagados" : "Todos os pedidos feitos pela Neia"}
          orders={historyOrders}
          onBack={() => setView("cleaning-dashboard")}
          onLogout={goToLogin}
          onCopyOrder={copyOrder}
        />
      )}

      {deleteTarget && <DeleteDialog order={deleteTarget} onCancel={() => setDeleteTarget(null)} onConfirm={confirmDeleteOrder} />}

      <footer>{FOOTER}</footer>
    </main>
  );
}

function LoginScreen({ password, loginError, onPasswordChange, onSubmit }: { password: string; loginError: string; onPasswordChange: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <section className="screen login-screen">
      <div className="brand-mark" aria-hidden="true">SM</div>
      <div className="title-group center">
        <p className="eyebrow">Central Operacional HUB SM</p>
        <h1>{BRAND}</h1>
      </div>
      <form className="login-form" onSubmit={onSubmit}>
        <label htmlFor="password">Digite sua senha</label>
        <input id="password" type="password" value={password} autoComplete="current-password" onChange={(event) => onPasswordChange(event.target.value)} />
        {loginError && <p className="error-message">{loginError}</p>}
        <button className="primary-button" type="submit">Entrar</button>
      </form>
    </section>
  );
}

function EmployeeScreen({ employeeId, profile, notice, adminPreview, onLogout, onBackToProfiles, onNewOrder, onStockCheck, onStockExit, onOpenHistory, onProfilePhotoChange }: { employeeId: EmployeeId; profile: EmployeeProfile; notice: string; adminPreview: boolean; onLogout: () => void; onBackToProfiles: () => void; onNewOrder: () => void; onStockCheck: () => void; onStockExit: () => void; onOpenHistory: () => void; onProfilePhotoChange: (employeeId: EmployeeId, file: File | null) => void }) {
  const employee = employees[employeeId];
  const employeeActivities = activities.filter((activity) => activity.employeeId === employeeId);
  return (
    <section className="screen">
      <EmployeeHeader employeeId={employeeId} profile={profile} adminPreview={adminPreview} onLogout={onLogout} onBackToProfiles={onBackToProfiles} onProfilePhotoChange={onProfilePhotoChange} />
      {notice && <p className="success-message">{notice}</p>}
      <section className="info-grid work-schedule-card" aria-label="Horários">
        <InfoCard title="Horário" value={employee.schedule} />
        <InfoCard title="Almoço" value={employee.lunch} />
        <InfoCard title="Sábado" value={employee.saturday} />
      </section>
      <section className="quick-actions">
        <button className="secondary-button wide-button" type="button" onClick={onStockExit}>Saída de Produto do Estoque</button>
        {employeeId === "neia" && (
          <>
            <button className="primary-button wide-button" type="button" onClick={onNewOrder}>Fazer Pedido Sinval</button>
            <button className="secondary-button wide-button" type="button" onClick={onStockCheck}>Conferência de Estoque</button>
            <button className="ghost-button wide-button" type="button" onClick={onOpenHistory}>Histórico de Pedidos</button>
          </>
        )}
      </section>
      <section className="section-block">
        <h2>Atividades</h2>
        <div className="activity-list">
          {employeeActivities.map((activity) => (
            <article className="activity-card" key={activity.id}>
              <div><p className="card-kicker">{activity.pavimento}</p><h3>{activity.ambiente}</h3></div>
              <p>{activity.atividade}</p><span>{activity.frequencia}</span>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function EmployeeHeader({ employeeId, profile, adminPreview, onLogout, onBackToProfiles, onProfilePhotoChange }: { employeeId: EmployeeId; profile: EmployeeProfile; adminPreview: boolean; onLogout: () => void; onBackToProfiles: () => void; onProfilePhotoChange: (employeeId: EmployeeId, file: File | null) => void }) {
  const employee = employees[employeeId];
  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    onProfilePhotoChange(employeeId, event.target.files?.[0] ?? null);
    event.target.value = "";
  }
  return (
    <header className="top-bar employee-top-bar">
      <div className="employee-photo-box">{profile?.photoData ? <img src={profile.photoData} alt={`Foto de ${employee.name}`} /> : <span>{employee.name.slice(0, 1)}</span>}</div>
      <div className="employee-title-block">
        <p className="eyebrow">{BRAND}</p><h1>{employee.name}</h1><p>{adminPreview ? "Visualização pelo Painel Tezzei" : "Módulo Limpeza"}</p>
        <label className="photo-button">Cadastrar / alterar foto<input type="file" accept="image/*" capture="environment" onChange={handleFileChange} /></label>
      </div>
      <div className="top-actions">{adminPreview && <button className="ghost-button" type="button" onClick={onBackToProfiles}>Voltar</button>}<button className="logout-button" type="button" onClick={onLogout}>Sair</button></div>
    </header>
  );
}

function OrderFormScreen({ quantities, manualOpen, manualDraft, manualItems, notice, onBack, onLogout, onQuantityChange, onManualOpenChange, onManualDraftChange, onAddManualItem, onRemoveManualItem, onSendOrder }: { quantities: Record<string, string>; manualOpen: boolean; manualDraft: ManualDraft; manualItems: OrderItem[]; notice: string; onBack: () => void; onLogout: () => void; onQuantityChange: (productId: string, value: string) => void; onManualOpenChange: (value: boolean) => void; onManualDraftChange: (draft: ManualDraft) => void; onAddManualItem: () => void; onRemoveManualItem: (itemId: string) => void; onSendOrder: () => void }) {
  return (
    <section className="screen">
      <TopBar title="Fazer Pedido Sinval" subtitle="Solicitante: Neia" onLogout={onLogout} />
      <button className="ghost-button" type="button" onClick={onBack}>Voltar</button>{notice && <p className="notice-message">{notice}</p>}
      <section className="product-list" aria-label="Produtos cadastrados">
        {products.map((product) => <label className="product-row" key={product.id}><span><strong>{product.name}</strong><small>{product.unit}</small></span><input type="number" inputMode="numeric" min="0" placeholder="0" value={quantities[product.id] ?? ""} onChange={(event) => onQuantityChange(product.id, event.target.value)} /></label>)}
      </section>
      <button className="secondary-button wide-button" type="button" onClick={() => onManualOpenChange(!manualOpen)}>Adicionar pedido que não tem na lista</button>
      {manualOpen && <section className="manual-form"><label>Nome do produto<input type="text" value={manualDraft.name} onChange={(event) => onManualDraftChange({ ...manualDraft, name: event.target.value })} /></label><label>Quantidade<input type="number" inputMode="numeric" min="0" value={manualDraft.quantity} onChange={(event) => onManualDraftChange({ ...manualDraft, quantity: event.target.value })} /></label><label>Observação opcional<textarea value={manualDraft.observation} rows={3} onChange={(event) => onManualDraftChange({ ...manualDraft, observation: event.target.value })} /></label><button className="primary-button" type="button" onClick={onAddManualItem}>Adicionar ao pedido</button></section>}
      {manualItems.length > 0 && <section className="section-block"><h2>Produtos não cadastrados</h2><div className="activity-list">{manualItems.map((item) => <article className="activity-card" key={item.id}><div><p className="card-kicker">{item.unit}</p><h3>{item.productName}</h3></div><p>Quantidade: {item.quantity}</p>{item.observation && <p>{item.observation}</p>}<button className="danger-button" type="button" onClick={() => onRemoveManualItem(item.id)}>Remover</button></article>)}</div></section>}
      <button className="primary-button wide-button sticky-action" type="button" onClick={onSendOrder}>Enviar Pedido</button>
    </section>
  );
}

function StockCheckScreen({ quantities, observations, notice, onBack, onLogout, onQuantityChange, onObservationChange, onSendStockCheck }: { quantities: Record<string, string>; observations: Record<string, string>; notice: string; onBack: () => void; onLogout: () => void; onQuantityChange: (productId: string, value: string) => void; onObservationChange: (productId: string, value: string) => void; onSendStockCheck: () => void }) {
  return (
    <section className="screen"><TopBar title="Conferência de Estoque" subtitle="Solicitante: Neia" onLogout={onLogout} /><button className="ghost-button" type="button" onClick={onBack}>Voltar</button>{notice && <p className="notice-message">{notice}</p>}<section className="product-list">{products.map((product) => <label className="product-row stock-row" key={product.id}><span><strong>{product.name}</strong><small>{product.unit}</small></span><input type="number" inputMode="decimal" min="0" placeholder="Qtd" value={quantities[product.id] ?? ""} onChange={(event) => onQuantityChange(product.id, event.target.value)} /><input type="text" placeholder="Obs." value={observations[product.id] ?? ""} onChange={(event) => onObservationChange(product.id, event.target.value)} /></label>)}</section><button className="primary-button wide-button sticky-action" type="button" onClick={onSendStockCheck}>Enviar Conferência</button></section>
  );
}

function StockExitScreen({ inventoryProducts, selectedProduct, userId, barcode, quantity, observation, message, adminMode, onBack, onLogout, onUserChange, onBarcodeChange, onFileChange, onProductChange, onQuantityChange, onObservationChange, onConfirm }: { inventoryProducts: InventoryProduct[]; selectedProduct: InventoryProduct | null; userId: EmployeeId; barcode: string; quantity: string; observation: string; message: string; adminMode: boolean; onBack: () => void; onLogout: () => void; onUserChange: (userId: EmployeeId) => void; onBarcodeChange: (barcode: string) => void; onFileChange: (file: File | null) => void; onProductChange: (productId: string) => void; onQuantityChange: (quantity: string) => void; onObservationChange: (observation: string) => void; onConfirm: () => void }) {
  return (
    <section className="screen"><TopBar title="Saída de Produto" subtitle="Bipe o código de barras e confirme a retirada" onLogout={onLogout} /><button className="ghost-button" type="button" onClick={onBack}>Voltar</button>{message && <p className="notice-message">{message}</p>}<section className="manual-form inventory-form">{adminMode && <label>Quem retirou<select value={userId} onChange={(event) => onUserChange(event.target.value as EmployeeId)}>{employeeIds.map((employeeId) => <option key={employeeId} value={employeeId}>{employees[employeeId].name}</option>)}</select></label>}<label className="scan-button">Abrir câmera / bipar código<input type="file" accept="image/*" capture="environment" onChange={(event) => { onFileChange(event.target.files?.[0] ?? null); event.target.value = ""; }} /></label><label>Código de barras<input type="text" inputMode="numeric" value={barcode} placeholder="Bipe ou digite o código" onChange={(event) => onBarcodeChange(event.target.value)} /></label><label>Produto encontrado / ajuste manual<select value={selectedProduct?.id ?? ""} onChange={(event) => onProductChange(event.target.value)}><option value="">Selecione o produto</option>{inventoryProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>{selectedProduct && <article className="inventory-found-card"><span>Produto</span><strong>{selectedProduct.name}</strong><small>Unidade: {selectedProduct.unit} | Estoque atual: {selectedProduct.currentStock}</small></article>}<label>Quantidade retirada<input type="number" inputMode="decimal" min="0" value={quantity} onChange={(event) => onQuantityChange(event.target.value)} /></label><label>Observação opcional<textarea rows={3} value={observation} onChange={(event) => onObservationChange(event.target.value)} /></label><button className="primary-button wide-button" type="button" onClick={onConfirm}>Confirmar saída</button></section></section>
  );
}

function BarcodeRegisterScreen({ inventoryProducts, productId, barcode, message, onBack, onLogout, onProductChange, onBarcodeChange, onFileChange, onSave }: { inventoryProducts: InventoryProduct[]; productId: string; barcode: string; message: string; onBack: () => void; onLogout: () => void; onProductChange: (productId: string) => void; onBarcodeChange: (barcode: string) => void; onFileChange: (file: File | null) => void; onSave: () => void }) {
  return <section className="screen"><TopBar title="Cadastrar Código de Barras" subtitle="Vincule o código ao produto de limpeza" onLogout={onLogout} /><button className="ghost-button" type="button" onClick={onBack}>Voltar para Limpeza</button>{message && <p className="notice-message">{message}</p>}<section className="manual-form inventory-form"><label>Produto<select value={productId} onChange={(event) => onProductChange(event.target.value)}>{inventoryProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><label className="scan-button">Abrir câmera / ler código<input type="file" accept="image/*" capture="environment" onChange={(event) => { onFileChange(event.target.files?.[0] ?? null); event.target.value = ""; }} /></label><label>Código de barras<input type="text" inputMode="numeric" value={barcode} placeholder="Bipe ou digite o código" onChange={(event) => onBarcodeChange(event.target.value)} /></label><button className="primary-button wide-button" type="button" onClick={onSave}>Salvar código no produto</button></section></section>;
}

function StockExitHistoryScreen({ movements, onBack, onLogout }: { movements: StockMovement[]; onBack: () => void; onLogout: () => void }) {
  return <section className="screen"><TopBar title="Histórico de Saídas" subtitle="Consumo de produtos por usuária" onLogout={onLogout} /><button className="ghost-button" type="button" onClick={onBack}>Voltar para Limpeza</button>{movements.length === 0 ? <section className="empty-state"><h2>Nenhuma saída registrada</h2><p>Quando uma funcionária retirar produto, aparecerá aqui.</p></section> : <section className="orders-list">{movements.map((movement) => <article className="order-card" key={movement.id}><div className="order-head"><div><p className="card-kicker">{formatDateTime(movement.createdAt)}</p><h2>{movement.productName}</h2><small>Retirado por {movement.userName}</small>{movement.barcode && <small>Código: {movement.barcode}</small>}{movement.observation && <small>{movement.observation}</small>}</div><span className="status-done">{movement.quantity} {movement.unit}</span></div></article>)}</section>}</section>;
}

function CurrentStockScreen({ inventoryProducts, onBack, onLogout }: { inventoryProducts: InventoryProduct[]; onBack: () => void; onLogout: () => void }) {
  return <section className="screen"><TopBar title="Estoque Atual" subtitle="Produtos cadastrados para controle de limpeza" onLogout={onLogout} /><button className="ghost-button" type="button" onClick={onBack}>Voltar para Limpeza</button><section className="product-list">{inventoryProducts.map((product) => <article className="product-row inventory-stock-row" key={product.id}><span><strong>{product.name}</strong><small>{product.barcode ? `Código: ${product.barcode}` : "Sem código cadastrado"}</small></span><strong>{product.currentStock} {product.unit}</strong></article>)}</section></section>;
}

function AdminScreen({ newOrdersCount, onlineEnabled, onLogout, onOpenCleaningDashboard }: { newOrdersCount: number; onlineEnabled: boolean; onLogout: () => void; onOpenCleaningDashboard: () => void }) {
  return <section className="screen"><TopBar title="Painel Tezzei" subtitle={onlineEnabled ? "Central Operacional HUB SM — online" : "Central Operacional HUB SM — local"} onLogout={onLogout} /><section className="admin-grid module-grid"><button className={`admin-card action-card module-card cleaning-card ${newOrdersCount > 0 ? "needs-attention" : ""}`} type="button" onClick={onOpenCleaningDashboard}><span>Limpeza</span><strong>{newOrdersCount > 0 ? `${newOrdersCount} pedido(s) pendente(s)` : "Rotinas, pedidos Sinval e equipe"}</strong>{newOrdersCount > 0 && <small className="attention-pill">⚠ Precisa de atenção</small>}</button><AdminCard title="Máquina de Café" detail="Insumos, doses e reposição" /><AdminCard title="Água" detail="Controle de fardos e copos" /><AdminCard title="Manutenção" detail="Chamados e tarefas internas" /><AdminCard title="Chaves" detail="Controle de acessos" /><AdminCard title="Patrimônio" detail="Itens, equipamentos e auditoria" /></section></section>;
}

function CleaningDashboardScreen({ newOrdersCount, onBack, onLogout, onOpenOrders, onOpenStockExit, onOpenBarcodeRegister, onOpenCurrentStock, onOpenStockHistory, onOpenProfiles, onOpenOrderHistory, onOpenNeiaHistory }: { newOrdersCount: number; onBack: () => void; onLogout: () => void; onOpenOrders: () => void; onOpenStockExit: () => void; onOpenBarcodeRegister: () => void; onOpenCurrentStock: () => void; onOpenStockHistory: () => void; onOpenProfiles: () => void; onOpenOrderHistory: () => void; onOpenNeiaHistory: () => void }) {
  return <section className="screen"><TopBar title="Gestão de Limpeza" subtitle="Neia, Selma, Helena, pedidos, estoque e auditoria" onLogout={onLogout} /><button className="ghost-button" type="button" onClick={onBack}>Voltar ao Painel</button>{newOrdersCount > 0 && <button className="alert-banner cleaning-alert-banner" type="button" onClick={onOpenOrders}>🔔 Pedido novo da Neia — precisa de atenção</button>}<section className="admin-grid cleaning-dashboard-grid"><button className={`admin-card action-card cleaning-control-card ${newOrdersCount > 0 ? "needs-attention" : ""}`} type="button" onClick={onOpenOrders}><span>Pedidos Sinval</span><strong>{newOrdersCount > 0 ? `${newOrdersCount} pedido(s) pendente(s)` : "Nenhum pedido pendente"}</strong>{newOrdersCount > 0 && <small className="attention-pill">⚠ Verificar agora</small>}</button><button className="admin-card action-card cleaning-control-card" type="button" onClick={onOpenStockExit}><span>Saída de Produto</span><strong>Bipar retirada do estoque</strong></button><button className="admin-card action-card cleaning-control-card" type="button" onClick={onOpenBarcodeRegister}><span>Cadastrar Código</span><strong>Vincular código de barras ao produto</strong></button><button className="admin-card action-card cleaning-control-card" type="button" onClick={onOpenCurrentStock}><span>Estoque Atual</span><strong>Produtos e códigos cadastrados</strong></button><button className="admin-card action-card cleaning-control-card" type="button" onClick={onOpenStockHistory}><span>Histórico de Saídas</span><strong>Quem usou, quando e quanto</strong></button><button className="admin-card action-card cleaning-control-card" type="button" onClick={onOpenNeiaHistory}><span>Histórico Neia</span><strong>Todos os pedidos feitos pela Neia</strong></button><button className="admin-card action-card cleaning-control-card" type="button" onClick={onOpenOrderHistory}><span>Histórico / Auditoria</span><strong>Concluídos e excluídos</strong></button><button className="admin-card action-card cleaning-control-card" type="button" onClick={onOpenProfiles}><span>Perfis da equipe</span><strong>Acessar telas da Neia, Selma e Helena</strong></button></section></section>;
}

function ProfilesScreen({ profiles, notice, onBack, onLogout, onPreviewEmployee, onProfilePhotoChange }: { profiles: Record<EmployeeId, EmployeeProfile>; notice: string; onBack: () => void; onLogout: () => void; onPreviewEmployee: (employeeId: EmployeeId) => void; onProfilePhotoChange: (employeeId: EmployeeId, file: File | null) => void }) {
  return <section className="screen"><TopBar title="Perfis da Equipe de Limpeza" subtitle="Visualizar telas sem digitar senha" onLogout={onLogout} /><button className="ghost-button" type="button" onClick={onBack}>Voltar para Limpeza</button>{notice && <p className="success-message">{notice}</p>}<section className="profile-grid">{employeeIds.map((employeeId) => { const employee = employees[employeeId]; const profile = profiles[employeeId]; return <article className="profile-card" key={employeeId}><div className="employee-photo-box profile-photo-box">{profile?.photoData ? <img src={profile.photoData} alt={`Foto de ${employee.name}`} /> : <span>{employee.name.slice(0, 1)}</span>}</div><div><h2>{employee.name}</h2><p>{employee.schedule}</p></div><label className="photo-button">Cadastrar / alterar foto<input type="file" accept="image/*" capture="environment" onChange={(event) => { onProfilePhotoChange(employeeId, event.target.files?.[0] ?? null); event.target.value = ""; }} /></label><button className="primary-button" type="button" onClick={() => onPreviewEmployee(employeeId)}>Ver tela da usuária</button></article>; })}</section></section>;
}

function OrdersScreen({ orders, notice, editingOrderId, editDraft, onBack, onLogout, onCopyOrder, onStartEdit, onCancelEdit, onUpdateDraftItem, onRemoveDraftItem, onSaveEdit, onMarkDone, onRequestDelete }: { orders: CleaningOrder[]; notice: string; editingOrderId: string | null; editDraft: OrderItem[]; onBack: () => void; onLogout: () => void; onCopyOrder: (order: CleaningOrder) => void; onStartEdit: (order: CleaningOrder) => void; onCancelEdit: () => void; onUpdateDraftItem: (itemId: string, field: keyof OrderItem, value: string) => void; onRemoveDraftItem: (itemId: string) => void; onSaveEdit: (order: CleaningOrder) => void; onMarkDone: (order: CleaningOrder) => void; onRequestDelete: (order: CleaningOrder) => void }) {
  return <section className="screen"><TopBar title="Limpeza — Pedidos Sinval" subtitle="Pedidos feitos pela Neia" onLogout={onLogout} /><button className="ghost-button" type="button" onClick={onBack}>Voltar para Limpeza</button>{notice && <p className="notice-message">{notice}</p>}{orders.length === 0 ? <section className="empty-state"><h2>Nenhum pedido salvo</h2><p>Quando a Neia enviar um pedido, ele aparecerá aqui.</p></section> : <section className="orders-list">{orders.map((order) => { const editing = editingOrderId === order.id; return <article className="order-card" key={order.id}><OrderHeader order={order} />{editing ? <EditOrderItems items={editDraft} onUpdateDraftItem={onUpdateDraftItem} onRemoveDraftItem={onRemoveDraftItem} /> : <OrderItems order={order} />}<div className="button-grid">{editing ? <><button className="primary-button" type="button" onClick={() => onSaveEdit(order)}>Salvar</button><button className="ghost-button" type="button" onClick={onCancelEdit}>Cancelar</button></> : <><button className="secondary-button" type="button" onClick={() => onCopyOrder(order)}>Copiar Pedido</button><button className="ghost-button" type="button" onClick={() => onStartEdit(order)}>Editar Pedido</button><button className="success-button" type="button" onClick={() => onMarkDone(order)}>Marcar como Pedido Feito</button><button className="danger-button" type="button" onClick={() => onRequestDelete(order)}>Excluir Pedido</button></>}</div></article>; })}</section>}</section>;
}

function HistoryScreen({ title, subtitle, orders, onBack, onLogout, onCopyOrder }: { title: string; subtitle: string; orders: CleaningOrder[]; onBack: () => void; onLogout: () => void; onCopyOrder: (order: CleaningOrder) => void }) {
  return <section className="screen"><TopBar title={title} subtitle={subtitle} onLogout={onLogout} /><button className="ghost-button" type="button" onClick={onBack}>Voltar para Limpeza</button>{orders.length === 0 ? <section className="empty-state"><h2>Nenhum histórico encontrado</h2><p>Os pedidos concluídos ou excluídos aparecerão aqui.</p></section> : <section className="orders-list">{orders.map((order) => <article className="order-card" key={order.id}><OrderHeader order={order} /><OrderItems order={order} /><div className="button-grid"><button className="secondary-button" type="button" onClick={() => onCopyOrder(order)}>Copiar Pedido</button></div></article>)}</section>}</section>;
}

function EditOrderItems({ items, onUpdateDraftItem, onRemoveDraftItem }: { items: OrderItem[]; onUpdateDraftItem: (itemId: string, field: keyof OrderItem, value: string) => void; onRemoveDraftItem: (itemId: string) => void }) {
  return <div className="edit-list">{items.map((item) => <section className="edit-row" key={item.id}><label>Produto<input type="text" value={item.productName} disabled={!item.manual} onChange={(event) => onUpdateDraftItem(item.id, "productName", event.target.value)} /></label><label>Quantidade<input type="number" inputMode="numeric" min="0" value={String(item.quantity)} onChange={(event) => onUpdateDraftItem(item.id, "quantity", event.target.value)} /></label>{item.manual && <label>Observação<input type="text" value={item.observation ?? ""} onChange={(event) => onUpdateDraftItem(item.id, "observation", event.target.value)} /></label>}<button className="danger-button" type="button" onClick={() => onRemoveDraftItem(item.id)}>Remover</button></section>)}</div>;
}

function TopBar({ title, subtitle, onLogout }: { title: string; subtitle: string; onLogout: () => void }) {
  return <header className="top-bar"><div><p className="eyebrow">{BRAND}</p><h1>{title}</h1><p>{subtitle}</p></div><button className="logout-button" type="button" onClick={onLogout}>Sair</button></header>;
}

function InfoCard({ title, value }: { title: string; value: string }) {
  return <article className="info-card"><span>{title}</span><strong>{value}</strong></article>;
}

function AdminCard({ title, detail }: { title: string; detail: string }) {
  return <article className="admin-card module-card"><span>{title}</span><strong>{detail}</strong></article>;
}

function OrderHeader({ order }: { order: CleaningOrder }) {
  return <div className="order-head"><div><p className="card-kicker">{order.data} às {order.hora}</p><h2>{order.solicitante}</h2>{order.completedAt && <small>Concluído em {formatDateTime(order.completedAt)}</small>}{order.deletedAt && <small>Excluído em {formatDateTime(order.deletedAt)}</small>}</div><span className={getStatusClass(order)}>{getOrderStatusLabel(order)}</span></div>;
}

function OrderItems({ order }: { order: CleaningOrder }) {
  return <ul className="item-list">{order.itens.map((item) => <li key={item.id}><span>{item.productName}{item.manual && <small>Produto não cadastrado</small>}{item.observation && <small>{item.observation}</small>}</span><strong>{item.quantity} {item.unit}</strong></li>)}</ul>;
}

function DeleteDialog({ order, onCancel, onConfirm }: { order: CleaningOrder; onCancel: () => void; onConfirm: () => void }) {
  return <div className="dialog-backdrop" role="presentation"><section className="dialog" role="dialog" aria-modal="true"><h2>Tem certeza que deseja excluir este pedido?</h2><p>Pedido de {order.solicitante}, {order.data} às {order.hora}. Ele será enviado para o histórico.</p><div className="button-grid"><button className="ghost-button" type="button" onClick={onCancel}>Cancelar</button><button className="danger-button" type="button" onClick={onConfirm}>Excluir</button></div></section></div>;
}

function getActiveEmployeeId(view: View, currentUser: UserRole | null, previewEmployeeId: EmployeeId | null): EmployeeId | null {
  if (view === "employee-preview") return previewEmployeeId;
  if (view === "employee" && currentUser === "tezzei") return previewEmployeeId;
  if (currentUser && currentUser !== "tezzei") return currentUser;
  return null;
}

function getOrderStatusLabel(order: CleaningOrder) {
  if (order.deletedAt) return "Excluído";
  if (order.status === "Pedido feito") return "Concluído";
  return "Novo";
}

function getStatusClass(order: CleaningOrder) {
  if (order.deletedAt) return "status-deleted";
  if (order.status === "Pedido feito") return "status-done";
  return "status-new";
}

function formatDateTime(value: string) {
  try {
    return new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return value; }
}

function getInitialSession(): SavedSession {
  const fallback: SavedSession = { view: "login", currentUser: null, previewEmployeeId: null };
  if (typeof window === "undefined") return fallback;
  const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  const isReload = navigation?.type === "reload";
  if (!isReload) return fallback;
  try {
    const storedSession = window.sessionStorage.getItem(SESSION_KEY);
    if (!storedSession) return fallback;
    const parsed = JSON.parse(storedSession) as SavedSession;
    if (!parsed.currentUser) return fallback;
    return parsed;
  } catch { return fallback; }
}

function baseInventory(): InventoryProduct[] {
  return products.map((product) => ({ ...product, currentStock: 0, minStock: 0 }));
}

function getLocalInventoryProducts(): InventoryProduct[] {
  const rawProducts = window.localStorage.getItem(INVENTORY_KEY);
  if (!rawProducts) return baseInventory();
  try {
    const parsed = JSON.parse(rawProducts) as InventoryProduct[];
    const localMap = new Map(parsed.map((product) => [product.id, product]));
    return baseInventory().map((product) => ({ ...product, ...localMap.get(product.id) }));
  } catch { return baseInventory(); }
}

function saveLocalInventoryProducts(inventoryProducts: InventoryProduct[]) {
  window.localStorage.setItem(INVENTORY_KEY, JSON.stringify(inventoryProducts));
}

function saveLocalProductBarcode(productId: string, barcode: string) {
  saveLocalInventoryProducts(getLocalInventoryProducts().map((product) => product.id === productId ? { ...product, barcode } : product));
}

function getLocalStockMovements(): StockMovement[] {
  const rawMovements = window.localStorage.getItem(STOCK_MOVEMENTS_KEY);
  if (!rawMovements) return [];
  try {
    const parsed = JSON.parse(rawMovements);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveLocalStockMovements(movements: StockMovement[]) {
  window.localStorage.setItem(STOCK_MOVEMENTS_KEY, JSON.stringify(movements));
}

function addLocalStockExit(input: { product: InventoryProduct; quantity: number; userId: EmployeeId; observation?: string }) {
  const userName = employees[input.userId]?.name ?? input.userId;
  const movement: StockMovement = { id: createId(), productId: input.product.id, productName: input.product.name, unit: input.product.unit, barcode: input.product.barcode, movementType: "saida", quantity: input.quantity, userId: input.userId, userName, createdAt: new Date().toISOString(), observation: input.observation?.trim() || undefined };
  saveLocalStockMovements([movement, ...getLocalStockMovements()]);
  saveLocalInventoryProducts(getLocalInventoryProducts().map((product) => product.id === input.product.id ? { ...product, currentStock: Math.max(0, Number(product.currentStock || 0) - input.quantity) } : product));
}

async function decodeBarcodeFromFile(file: File): Promise<string> {
  const BarcodeDetectorConstructor = (window as unknown as { BarcodeDetector?: new (options?: unknown) => { detect: (image: ImageBitmap) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
  if (!BarcodeDetectorConstructor) throw new Error("Leitor não suportado");
  const bitmap = await createImageBitmap(file);
  try {
    const detector = new BarcodeDetectorConstructor({ formats: ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e"] });
    const results = await detector.detect(bitmap);
    const barcode = results[0]?.rawValue;
    if (!barcode) throw new Error("Código não encontrado");
    return barcode;
  } finally { bitmap.close(); }
}

async function imageFileToDataUrl(file: File): Promise<string> {
  const rawDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(rawDataUrl);
  const maxSize = 520;
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return rawDataUrl;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.78);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default App;
