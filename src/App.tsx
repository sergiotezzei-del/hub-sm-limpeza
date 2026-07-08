import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { activities, employees, products } from "./data";
import { GuardShiftPanel } from "./modules/security/components/GuardShift";
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
  AppUserType,
  CleaningOrder,
  EmployeeId,
  EmployeeProfile,
  GuardId,
  InventoryProduct,
  ManagedUser,
  OrderItem,
  StockCheck,
  StockCheckItem,
  StockMovement,
  UserDepartment,
  UserPermission,
  UserRole,
} from "./types";

type View =
  | "login"
  | "employee"
  | "guard"
  | "user-home"
  | "employee-preview"
  | "order-form"
  | "admin"
  | "cleaning-dashboard"
  | "orders"
  | "profiles"
  | "stock-check"
  | "stock-exit"
  | "product-register"
  | "stock-exit-history"
  | "current-stock"
  | "order-history"
  | "neia-history"
  | "users-permissions"
  | "security-menu"
  | "security-guards"
  | "security-guard-detail";

type ManualDraft = {
  name: string;
  quantity: string;
  observation: string;
};

type GuardName = "Carlos Clemente" | "Salomão";

type StockExitUserId = string;

type ProductRegisterMode = "edit" | "new";

type ProductRegisterDetails = {
  mode: ProductRegisterMode;
  productId: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
  barcode: string;
  photoData: string;
};

type GuardShift = {
  startDate: string;
  startText: string;
  startTime: string;
  endDate: string;
  endText: string;
  endTime: string;
  shiftType: string;
  observation?: string;
};

type SavedSession = {
  view: View;
  currentUser: UserRole | null;
  previewEmployeeId: EmployeeId | null;
  selectedGuardName?: GuardName | null;
};

const BRAND = "SANTA MARIA SOLUÇÕES IMOBILIÁRIAS";
const FOOTER = "TEZZEI - Operações & Processos";
const SESSION_KEY = "hub-sm-active-session";
const INVENTORY_KEY = "hub-sm-inventory-products";
const STOCK_MOVEMENTS_KEY = "hub-sm-stock-movements";
const USERS_KEY = "hub-sm-users-permissions";
const LEGACY_PRODUCT_PHOTOS_KEY = "hub-sm-product-photos";
const PRODUCT_PHOTO_SOURCE_MAX_BYTES = 10 * 1024 * 1024;
const PRODUCT_PHOTO_SOURCE_MAX_DATA_URL_LENGTH = 14 * 1024 * 1024;
const PRODUCT_PHOTO_MAX_DATA_URL_LENGTH = 70 * 1024;
const INVENTORY_STORAGE_MAX_CHARS = 4_000_000;
const PRODUCT_PHOTO_TOO_HEAVY_MESSAGE = "Foto muito pesada. Tire outra foto mais simples ou reduza a imagem.";
const PRODUCT_PHOTO_COMPRESSION_STEPS = [
  { maxSide: 360, quality: 0.62 },
  { maxSide: 300, quality: 0.52 },
  { maxSide: 240, quality: 0.45 },
];
const productUnitOptions = ["Litro", "Unidade", "Galão", "Caixa", "Pacote", "Fardo", "Par", "Rolo", "Quilo", "Unidade/Pacote"];
const DEFAULT_PRODUCT_UNIT = "Unidade";

class ProductPhotoTooHeavyError extends Error {
  constructor() {
    super("PRODUCT_PHOTO_TOO_HEAVY");
    this.name = "ProductPhotoTooHeavyError";
  }
}

class InventoryStorageTooLargeError extends Error {
  constructor() {
    super("INVENTORY_STORAGE_TOO_LARGE");
    this.name = "InventoryStorageTooLargeError";
  }
}

const emptyManualDraft: ManualDraft = {
  name: "",
  quantity: "",
  observation: "",
};

const employeeIds = Object.keys(employees) as EmployeeId[];
const guardNames: GuardName[] = ["Carlos Clemente", "Salomão"];

const guardUserMap: Record<GuardId, GuardName> = {
  "carlos-clemente": "Carlos Clemente",
  salomao: "Salomão",
};

const userDepartments: UserDepartment[] = ["Administração", "Limpeza", "Segurança", "Manutenção", "Estoque", "Café", "Água", "Patrimônio", "Chaves"];
const userTypes: AppUserType[] = ["Admin", "Limpeza", "Segurança", "Manutenção", "Estoque", "Consulta"];
const permissionOptions: Array<{ id: UserPermission; label: string }> = [
  { id: "painel-admin", label: "Painel admin" },
  { id: "limpeza", label: "Limpeza" },
  { id: "estoque", label: "Estoque" },
  { id: "saida-estoque", label: "Saída de estoque" },
  { id: "cafe", label: "Máquina de Café" },
  { id: "agua", label: "Água" },
  { id: "seguranca", label: "Segurança" },
  { id: "guardas", label: "Guardas" },
  { id: "manutencao", label: "Manutenção" },
  { id: "chaves", label: "Chaves" },
  { id: "patrimonio", label: "Patrimônio" },
  { id: "relatorios", label: "Relatórios" },
];
const allUserPermissions = permissionOptions.map((permission) => permission.id);
const defaultCreatedAt = "2026-01-01T00:00:00.000Z";

const defaultManagedUsers: ManagedUser[] = [
  {
    id: "tezzei",
    name: "Admin Tezzei",
    accessCode: "1234",
    userType: "Admin",
    jobTitle: "Administrador",
    department: "Administração",
    active: true,
    permissions: allUserPermissions,
    protected: true,
    system: true,
    createdAt: defaultCreatedAt,
    updatedAt: defaultCreatedAt,
  },
  {
    id: "neia",
    name: employees.neia.name,
    accessCode: "neia1234",
    userType: "Limpeza",
    jobTitle: "Limpeza",
    department: "Limpeza",
    active: true,
    permissions: ["limpeza", "estoque", "saida-estoque"],
    linkedEmployeeId: "neia",
    system: true,
    createdAt: defaultCreatedAt,
    updatedAt: defaultCreatedAt,
  },
  {
    id: "selma",
    name: employees.selma.name,
    accessCode: "selma1234",
    userType: "Limpeza",
    jobTitle: "Limpeza",
    department: "Limpeza",
    active: true,
    permissions: ["limpeza", "saida-estoque"],
    linkedEmployeeId: "selma",
    system: true,
    createdAt: defaultCreatedAt,
    updatedAt: defaultCreatedAt,
  },
  {
    id: "helena",
    name: employees.helena.name,
    accessCode: "helena1234",
    userType: "Limpeza",
    jobTitle: "Limpeza",
    department: "Limpeza",
    active: true,
    permissions: ["limpeza", "saida-estoque"],
    linkedEmployeeId: "helena",
    system: true,
    createdAt: defaultCreatedAt,
    updatedAt: defaultCreatedAt,
  },
  {
    id: "carlos-clemente",
    name: "Carlos Clemente",
    accessCode: "carlos1234",
    userType: "Segurança",
    jobTitle: "Guarda Santa Maria",
    department: "Segurança",
    active: true,
    permissions: ["seguranca", "guardas"],
    linkedGuardId: "carlos-clemente",
    system: true,
    createdAt: defaultCreatedAt,
    updatedAt: defaultCreatedAt,
  },
  {
    id: "salomao",
    name: "Salomão",
    accessCode: "salomao1234",
    userType: "Segurança",
    jobTitle: "Guarda Santa Maria",
    department: "Segurança",
    active: true,
    permissions: ["seguranca", "guardas"],
    linkedGuardId: "salomao",
    system: true,
    createdAt: defaultCreatedAt,
    updatedAt: defaultCreatedAt,
  },
];

const guardScheduleRows: Record<GuardName, string[]> = {
  "Carlos Clemente": [
    "2026-06-30|terça-feira, 30 de junho|19:00|2026-07-01|quarta-feira, 1 de julho|07:00|NOTURNO|",
    "2026-07-02|quinta-feira, 2 de julho|19:00|2026-07-03|sexta-feira, 3 de julho|07:00|NOTURNO|",
    "2026-07-04|sábado, 4 de julho|07:00|2026-07-04|sábado, 4 de julho|19:00|DIURNO|",
    "2026-07-05|domingo, 5 de julho|07:00|2026-07-05|domingo, 5 de julho|19:00|DIURNO|",
    "2026-07-06|segunda-feira, 6 de julho|19:00|2026-07-07|terça-feira, 7 de julho|07:00|NOTURNO|",
    "2026-07-08|quarta-feira, 8 de julho|19:00|2026-07-09|quinta-feira, 9 de julho|07:00|NOTURNO|",
    "2026-07-09|quinta-feira, 9 de julho|07:00|2026-07-09|quinta-feira, 9 de julho|13:00|DIURNO|FERIADO - EXTRA 6H",
    "2026-07-10|sexta-feira, 10 de julho|19:00|2026-07-11|sábado, 11 de julho|07:00|NOTURNO|",
    "2026-07-11|sábado, 11 de julho|19:00|2026-07-12|domingo, 12 de julho|07:00|NOTURNO|",
    "2026-07-12|domingo, 12 de julho|19:00|2026-07-13|segunda-feira, 13 de julho|07:00|NOTURNO|",
    "2026-07-14|terça-feira, 14 de julho|19:00|2026-07-15|quarta-feira, 15 de julho|07:00|NOTURNO|",
    "2026-07-16|quinta-feira, 16 de julho|19:00|2026-07-17|sexta-feira, 17 de julho|07:00|NOTURNO|",
    "2026-07-18|sábado, 18 de julho|07:00|2026-07-18|sábado, 18 de julho|19:00|DIURNO|",
    "2026-07-19|domingo, 19 de julho|07:00|2026-07-19|domingo, 19 de julho|19:00|DIURNO|",
    "2026-07-20|segunda-feira, 20 de julho|19:00|2026-07-21|terça-feira, 21 de julho|07:00|NOTURNO|",
    "2026-07-22|quarta-feira, 22 de julho|19:00|2026-07-23|quinta-feira, 23 de julho|07:00|NOTURNO|",
    "2026-07-25|sábado, 25 de julho|07:00|2026-07-25|sábado, 25 de julho|19:00|DIURNO|",
    "2026-07-26|domingo, 26 de julho|07:00|2026-07-26|domingo, 26 de julho|19:00|DIURNO|",
    "2026-07-27|segunda-feira, 27 de julho|19:00|2026-07-28|terça-feira, 28 de julho|07:00|NOTURNO|",
    "2026-07-29|quarta-feira, 29 de julho|19:00|2026-07-30|quinta-feira, 30 de julho|07:00|NOTURNO|",
  ],
  Salomão: [
    "2026-07-01|quarta-feira, 1 de julho|19:00|2026-07-02|quinta-feira, 2 de julho|07:00|NOTURNO|",
    "2026-07-03|sexta-feira, 3 de julho|19:00|2026-07-04|sábado, 4 de julho|07:00|NOTURNO|",
    "2026-07-04|sábado, 4 de julho|19:00|2026-07-05|domingo, 5 de julho|07:00|NOTURNO|",
    "2026-07-05|domingo, 5 de julho|19:00|2026-07-06|segunda-feira, 6 de julho|07:00|NOTURNO|",
    "2026-07-07|terça-feira, 7 de julho|19:00|2026-07-08|quarta-feira, 8 de julho|07:00|NOTURNO|",
    "2026-07-09|quinta-feira, 9 de julho|13:00|2026-07-09|quinta-feira, 9 de julho|19:00|DIURNO|FERIADO - EXTRA 6H",
    "2026-07-09|quinta-feira, 9 de julho|19:00|2026-07-10|sexta-feira, 10 de julho|07:00|NOTURNO|",
    "2026-07-11|sábado, 11 de julho|07:00|2026-07-11|sábado, 11 de julho|19:00|DIURNO|",
    "2026-07-12|domingo, 12 de julho|07:00|2026-07-12|domingo, 12 de julho|19:00|DIURNO|",
    "2026-07-13|segunda-feira, 13 de julho|19:00|2026-07-14|terça-feira, 14 de julho|07:00|NOTURNO|",
    "2026-07-15|quarta-feira, 15 de julho|19:00|2026-07-16|quinta-feira, 16 de julho|07:00|NOTURNO|",
    "2026-07-17|sexta-feira, 17 de julho|19:00|2026-07-18|sábado, 18 de julho|07:00|NOTURNO|",
    "2026-07-18|sábado, 18 de julho|19:00|2026-07-19|domingo, 19 de julho|07:00|NOTURNO|",
    "2026-07-19|domingo, 19 de julho|19:00|2026-07-20|segunda-feira, 20 de julho|07:00|NOTURNO|",
    "2026-07-21|terça-feira, 21 de julho|19:00|2026-07-22|quarta-feira, 22 de julho|07:00|NOTURNO|",
    "2026-07-23|quinta-feira, 23 de julho|19:00|2026-07-24|sexta-feira, 24 de julho|07:00|NOTURNO|",
    "2026-07-24|sexta-feira, 24 de julho|19:00|2026-07-25|sábado, 25 de julho|07:00|NOTURNO|",
    "2026-07-25|sábado, 25 de julho|19:00|2026-07-26|domingo, 26 de julho|07:00|NOTURNO|",
    "2026-07-26|domingo, 26 de julho|19:00|2026-07-27|segunda-feira, 27 de julho|07:00|NOTURNO|",
    "2026-07-28|terça-feira, 28 de julho|19:00|2026-07-29|quarta-feira, 29 de julho|07:00|NOTURNO|",
    "2026-07-30|quinta-feira, 30 de julho|19:00|2026-07-31|sexta-feira, 31 de julho|07:00|NOTURNO|",
    "2026-07-31|sexta-feira, 31 de julho|19:00|2026-08-01|sábado, 1 de agosto|07:00|NOTURNO|",
  ],
};

function App() {
  const initialSession = getInitialSession();
  const [view, setView] = useState<View>(initialSession.view);
  const [currentUser, setCurrentUser] = useState<UserRole | null>(initialSession.currentUser);
  const [previewEmployeeId, setPreviewEmployeeId] = useState<EmployeeId | null>(initialSession.previewEmployeeId);
  const [selectedGuardName, setSelectedGuardName] = useState<GuardName | null>(initialSession.selectedGuardName ?? null);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [orders, setOrders] = useState<CleaningOrder[]>(() => getLocalOrders().filter((order) => !order.deletedAt));
  const [historyOrders, setHistoryOrders] = useState<CleaningOrder[]>([]);
  const [profiles, setProfiles] = useState<Record<EmployeeId, EmployeeProfile>>(() => getLocalEmployeeProfiles());
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>(() => getLocalManagedUsers());
  const [inventoryProducts, setInventoryProducts] = useState<InventoryProduct[]>(() => getLocalInventoryProducts());
  const [stockMovements, setStockMovements] = useState<StockMovement[]>(() => getLocalStockMovements());
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [manualOpen, setManualOpen] = useState(false);
  const [manualDraft, setManualDraft] = useState<ManualDraft>(emptyManualDraft);
  const [manualItems, setManualItems] = useState<OrderItem[]>([]);
  const [stockQuantities, setStockQuantities] = useState<Record<string, string>>({});
  const [stockObservations, setStockObservations] = useState<Record<string, string>>({});
  const [stockExitUserId, setStockExitUserId] = useState<StockExitUserId>("neia");
  const [stockExitBarcode, setStockExitBarcode] = useState("");
  const [stockExitProductId, setStockExitProductId] = useState("");
  const [stockExitQuantity, setStockExitQuantity] = useState("1");
  const [stockExitObservation, setStockExitObservation] = useState("");
  const [stockExitMessage, setStockExitMessage] = useState("");
  const [barcodeProductId, setBarcodeProductId] = useState(products[0]?.id ?? "");
  const [productRegisterMode, setProductRegisterMode] = useState<ProductRegisterMode>("edit");
  const [productName, setProductName] = useState(products[0]?.name ?? "");
  const [productUnit, setProductUnit] = useState(products[0]?.unit ?? DEFAULT_PRODUCT_UNIT);
  const [productCurrentStock, setProductCurrentStock] = useState("0");
  const [productMinStock, setProductMinStock] = useState("0");
  const [barcodeValue, setBarcodeValue] = useState("");
  const [productPhotoData, setProductPhotoData] = useState("");
  const [productSaving, setProductSaving] = useState(false);
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
      const session: SavedSession = { view, currentUser, previewEmployeeId, selectedGuardName };
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }
  }, [view, currentUser, previewEmployeeId, selectedGuardName]);

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
  const currentManagedUser = useMemo(() => getManagedUser(managedUsers, currentUser), [managedUsers, currentUser]);
  const selectedExitProduct = inventoryProducts.find((product) => product.id === stockExitProductId) ?? null;
  const selectedRegisterProduct = inventoryProducts.find((product) => product.id === barcodeProductId) ?? null;

  function getAfterCleaningActionView(): View {
    if (hasCurrentPermission("painel-admin")) return previewEmployeeId ? "employee-preview" : "cleaning-dashboard";
    if (isGuardId(currentUser)) return "guard";
    if (isEmployeeId(currentUser)) return "employee";
    return "user-home";
  }

  function getCurrentHomeView(): View {
    if (hasCurrentPermission("painel-admin")) return "admin";
    if (isGuardId(currentUser)) return "guard";
    if (isEmployeeId(currentUser)) return "employee";
    return "user-home";
  }

  function hasCurrentPermission(permission: UserPermission) {
    return hasManagedUserPermission(currentUser, permission, managedUsers);
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
    setSelectedGuardName(null);
    setView("login");
    setPassword("");
    setLoginError("");
    setNotice("");
    setEditingOrderId(null);
    setEditDraft([]);
  }

  function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const user = findManagedUserByAccessCode(password.trim(), managedUsers);

    if (!user) {
      setLoginError("Senha incorreta");
      return;
    }

    if (!user.active) {
      setLoginError("Usuário inativo");
      return;
    }

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) activeElement.blur();

    setCurrentUser(user.id);
    setPreviewEmployeeId(null);
    setSelectedGuardName(user.linkedGuardId ? guardUserMap[user.linkedGuardId] : null);
    setLoginError("");
    setNotice("");
    void refreshOrders();
    void refreshProfiles();
    refreshInventory();
    refreshStockMovements();
    setView(getInitialViewForManagedUser(user));
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
    if (!userId && !hasCurrentPermission("saida-estoque")) {
      setNotice("Sem permissão para saída de estoque.");
      return;
    }

    const nextUser = userId ?? activeEmployeeId ?? currentUser ?? "neia";
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

    addLocalStockExit({ product: selectedExitProduct, quantity, userId: stockExitUserId, userName: getStockExitUserName(stockExitUserId, managedUsers), observation: stockExitObservation });
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

  async function handleProductPhotoFile(file: File | null) {
    if (!file) return;
    try {
      setBarcodeMessage("Preparando foto...");
      const photoData = await imageFileToProductThumbnail(file);
      setProductPhotoData(photoData);
      setBarcodeMessage("Foto compactada. Salve o produto para confirmar.");
    } catch (error) {
      setBarcodeMessage(getProductPhotoErrorMessage(error));
    }
  }

  function selectProductForRegister(productId: string) {
    const product = inventoryProducts.find((item) => item.id === productId);
    if (!product) return;
    setProductRegisterMode("edit");
    setBarcodeProductId(productId);
    fillProductRegisterFields(product);
    setBarcodeMessage("");
  }

  function fillProductRegisterFields(product: InventoryProduct) {
    setProductName(product.name);
    setProductUnit(product.unit || DEFAULT_PRODUCT_UNIT);
    setProductCurrentStock(String(product.currentStock ?? 0));
    setProductMinStock(String(product.minStock ?? 0));
    setBarcodeValue(product.barcode ?? "");
    setProductPhotoData(product.photoData ?? "");
  }

  function startNewProductRegister() {
    setProductRegisterMode("new");
    setBarcodeProductId("");
    setProductName("");
    setProductUnit(DEFAULT_PRODUCT_UNIT);
    setProductCurrentStock("0");
    setProductMinStock("0");
    setBarcodeValue("");
    setProductPhotoData("");
    setBarcodeMessage("");
  }

  function cancelNewProductRegister() {
    const product = inventoryProducts[0];
    if (!product) return;
    setProductRegisterMode("edit");
    setBarcodeProductId(product.id);
    fillProductRegisterFields(product);
    setBarcodeMessage("");
  }

  function openProductRegister() {
    refreshInventory();
    const currentProducts = getLocalInventoryProducts();
    const currentProduct = currentProducts.find((product) => product.id === barcodeProductId) ?? currentProducts[0];
    if (currentProduct) {
      setProductRegisterMode("edit");
      setBarcodeProductId(currentProduct.id);
      fillProductRegisterFields(currentProduct);
    }
    setBarcodeMessage("");
    setView("product-register");
  }

  async function saveProductRegister() {
    if (productSaving) return;
    if (productRegisterMode === "edit" && !barcodeProductId) {
      setBarcodeMessage("Selecione um produto.");
      return;
    }
    const nextProductName = productName.trim();
    const nextCurrentStock = parseProductQuantity(productCurrentStock);
    const nextMinStock = parseProductQuantity(productMinStock);

    if (!nextProductName) {
      setBarcodeMessage("Informe o nome do produto.");
      return;
    }
    if (nextCurrentStock === null) {
      setBarcodeMessage("Informe um estoque atual válido.");
      return;
    }
    if (nextMinStock === null) {
      setBarcodeMessage("Informe um estoque mínimo válido.");
      return;
    }

    setProductSaving(true);
    setBarcodeMessage("Salvando...");
    try {
      await waitForNextFrame();
      const result = await prepareLocalProductDetails({
        mode: productRegisterMode,
        productId: barcodeProductId,
        name: nextProductName,
        unit: productUnit,
        currentStock: nextCurrentStock,
        minStock: nextMinStock,
        barcode: barcodeValue.trim(),
        photoData: productPhotoData,
      });
      saveLocalProductDetails(result.products);
      setInventoryProducts(result.products);
      const savedProduct = result.products.find((product) => product.id === result.productId);
      if (savedProduct) {
        setProductRegisterMode("edit");
        setBarcodeProductId(savedProduct.id);
        fillProductRegisterFields(savedProduct);
      }
      setBarcodeMessage("Produto salvo.");
    } catch (error) {
      setBarcodeMessage(getProductSaveErrorMessage(error));
    } finally {
      setProductSaving(false);
    }
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
    if (!hasCurrentPermission("limpeza")) {
      setNotice("Sem permissão para acessar Limpeza.");
      return;
    }

    setNotice("");
    setSelectedGuardName(null);
    void refreshOrders();
    void refreshProfiles();
    refreshInventory();
    refreshStockMovements();
    setView("cleaning-dashboard");
  }

  function openSecurityMenu() {
    if (!hasCurrentPermission("seguranca")) {
      setNotice("Sem permissão para acessar Segurança.");
      return;
    }

    setNotice("");
    setSelectedGuardName(null);
    setView("security-menu");
  }

  function openSecurityGuards() {
    if (!hasCurrentPermission("guardas")) {
      setNotice("Sem permissão para acessar Guardas.");
      return;
    }

    setNotice("");
    setSelectedGuardName(null);
    setView("security-guards");
  }

  function openGuardDetail(guardName: GuardName) {
    setNotice("");
    setSelectedGuardName(guardName);
    setView("security-guard-detail");
  }

  function previewEmployee(employeeId: EmployeeId) {
    setNotice("");
    setPreviewEmployeeId(employeeId);
    setView("employee-preview");
  }

  function openUsersPermissions() {
    if (!hasCurrentPermission("painel-admin")) {
      setNotice("Sem permissão para gerenciar usuários.");
      return;
    }

    setNotice("");
    setSelectedGuardName(null);
    setView("users-permissions");
  }

  function saveManagedUser(user: ManagedUser) {
    const cleanAccessCode = user.accessCode.trim();
    const cleanName = user.name.trim();

    if (!cleanName || !cleanAccessCode) {
      setNotice("Informe nome e senha/código de acesso.");
      return false;
    }

    if (managedUsers.some((current) => current.id !== user.id && current.accessCode === cleanAccessCode)) {
      setNotice("Esse código de acesso já está em uso.");
      return false;
    }

    const previousUser = managedUsers.find((current) => current.id === user.id);
    const now = new Date().toISOString();
    const normalizedUser: ManagedUser = {
      ...user,
      name: cleanName,
      accessCode: cleanAccessCode,
      active: user.protected ? true : user.active,
      permissions: user.id === "tezzei" ? allUserPermissions : uniquePermissions(user.permissions),
      createdAt: previousUser?.createdAt ?? user.createdAt ?? now,
      updatedAt: now,
    };
    const nextUsers = upsertManagedUser(managedUsers, normalizedUser);
    saveLocalManagedUsers(nextUsers);
    setManagedUsers(nextUsers);
    setNotice("Usuário salvo.");
    return true;
  }

  function deleteManagedUser(userId: string) {
    const user = managedUsers.find((current) => current.id === userId);
    if (!user) return;
    if (user.system || user.protected) {
      setNotice("Usuário do sistema não pode ser apagado.");
      return;
    }

    const nextUsers = managedUsers.filter((current) => current.id !== userId);
    saveLocalManagedUsers(nextUsers);
    setManagedUsers(nextUsers);
    setNotice("Usuário apagado.");
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

      {view === "guard" && currentUser && isGuardId(currentUser) && (
        <GuardUserScreen guardLocalId={currentUser} guardName={guardUserMap[currentUser]} onLogout={goToLogin} />
      )}

      {view === "user-home" && currentManagedUser && (
        <UserAccessScreen
          user={currentManagedUser}
          notice={notice}
          permissions={getManagedUserPermissions(currentUser, managedUsers)}
          onLogout={goToLogin}
          onOpenCleaningDashboard={openCleaningDashboard}
          onOpenStockExit={() => openStockExit()}
          onOpenSecurity={openSecurityMenu}
        />
      )}

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
          adminMode={hasCurrentPermission("painel-admin")}
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

      {view === "product-register" && (
        <ProductRegisterScreen
          inventoryProducts={inventoryProducts}
          selectedProduct={selectedRegisterProduct}
          mode={productRegisterMode}
          productId={barcodeProductId}
          productName={productName}
          unit={productUnit}
          currentStock={productCurrentStock}
          minStock={productMinStock}
          barcode={barcodeValue}
          photoData={productPhotoData}
          message={barcodeMessage}
          saving={productSaving}
          unitOptions={productUnitOptions}
          onBack={() => setView("cleaning-dashboard")}
          onLogout={goToLogin}
          onCreateNew={startNewProductRegister}
          onCancelCreate={cancelNewProductRegister}
          onProductChange={selectProductForRegister}
          onProductNameChange={setProductName}
          onUnitChange={setProductUnit}
          onCurrentStockChange={setProductCurrentStock}
          onMinStockChange={setProductMinStock}
          onBarcodeChange={setBarcodeValue}
          onBarcodeFileChange={handleBarcodeRegisterFile}
          onPhotoFileChange={handleProductPhotoFile}
          onRemovePhoto={() => setProductPhotoData("")}
          onSave={saveProductRegister}
        />
      )}

      {view === "stock-exit-history" && <StockExitHistoryScreen movements={stockMovements} onBack={() => setView("cleaning-dashboard")} onLogout={goToLogin} />}
      {view === "current-stock" && <CurrentStockScreen inventoryProducts={inventoryProducts} onBack={() => setView("cleaning-dashboard")} onLogout={goToLogin} />}

      {view === "admin" && (
        <AdminScreen
          newOrdersCount={newOrders.length}
          onlineEnabled={onlineEnabled}
          permissions={getManagedUserPermissions(currentUser, managedUsers)}
          onLogout={goToLogin}
          onOpenCleaningDashboard={openCleaningDashboard}
          onOpenSecurity={openSecurityMenu}
          onOpenUsersPermissions={openUsersPermissions}
        />
      )}

      {view === "users-permissions" && (
        <UsersPermissionsScreen
          users={managedUsers}
          notice={notice}
          onBack={() => setView(getCurrentHomeView())}
          onLogout={goToLogin}
          onSaveUser={saveManagedUser}
          onDeleteUser={deleteManagedUser}
        />
      )}

      {view === "security-menu" && <SecurityMenuScreen permissions={getManagedUserPermissions(currentUser, managedUsers)} onBack={() => setView(getCurrentHomeView())} onLogout={goToLogin} onOpenGuards={openSecurityGuards} />}

      {view === "security-guards" && <SecurityGuardsScreen onBack={openSecurityMenu} onLogout={goToLogin} onOpenGuard={openGuardDetail} />}

      {view === "security-guard-detail" && selectedGuardName && (
        <SecurityGuardDetailScreen guardLocalId={getGuardIdFromName(selectedGuardName)} guardName={selectedGuardName} onBack={openSecurityGuards} onLogout={goToLogin} />
      )}

      {view === "cleaning-dashboard" && (
        <CleaningDashboardScreen
          newOrdersCount={newOrders.length}
          permissions={getManagedUserPermissions(currentUser, managedUsers)}
          onBack={() => setView(getCurrentHomeView())}
          onLogout={goToLogin}
          onOpenOrders={() => {
            setNotice("");
            void refreshOrders();
            setView("orders");
          }}
          onOpenStockExit={() => openStockExit("neia")}
          onOpenBarcodeRegister={() => {
            openProductRegister();
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
    <ProfileHero
      name={employee.name}
      role="Limpeza"
      department="Limpeza"
      subtitle={adminPreview ? "Visualização pelo Painel Tezzei" : employee.schedule}
      photoData={profile?.photoData}
      actions={(
        <>
          {adminPreview && <button className="ghost-button" type="button" onClick={onBackToProfiles}>Voltar</button>}
          <label className="photo-button">Cadastrar / alterar foto<input type="file" accept="image/*" capture="environment" onChange={handleFileChange} /></label>
          <button className="logout-button" type="button" onClick={onLogout}>Sair</button>
        </>
      )}
    />
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

function StockExitScreen({ inventoryProducts, selectedProduct, userId, barcode, quantity, observation, message, adminMode, onBack, onLogout, onUserChange, onBarcodeChange, onFileChange, onProductChange, onQuantityChange, onObservationChange, onConfirm }: { inventoryProducts: InventoryProduct[]; selectedProduct: InventoryProduct | null; userId: StockExitUserId; barcode: string; quantity: string; observation: string; message: string; adminMode: boolean; onBack: () => void; onLogout: () => void; onUserChange: (userId: StockExitUserId) => void; onBarcodeChange: (barcode: string) => void; onFileChange: (file: File | null) => void; onProductChange: (productId: string) => void; onQuantityChange: (quantity: string) => void; onObservationChange: (observation: string) => void; onConfirm: () => void }) {
  return (
    <section className="screen"><TopBar title="Saída de Produto" subtitle="Bipe o código de barras e confirme a retirada" onLogout={onLogout} /><button className="ghost-button" type="button" onClick={onBack}>Voltar</button>{message && <p className="notice-message">{message}</p>}<section className="manual-form inventory-form">{adminMode && <label>Quem retirou<select value={userId} onChange={(event) => onUserChange(event.target.value as StockExitUserId)}>{employeeIds.map((employeeId) => <option key={employeeId} value={employeeId}>{employees[employeeId].name}</option>)}<option value="Sergio Tezzei">Sergio Tezzei</option></select></label>}<label className="scan-button">Abrir câmera / bipar código<input type="file" accept="image/*" capture="environment" onChange={(event) => { onFileChange(event.target.files?.[0] ?? null); event.target.value = ""; }} /></label><label>Código de barras<input type="text" inputMode="numeric" value={barcode} placeholder="Bipe ou digite o código" onChange={(event) => onBarcodeChange(event.target.value)} /></label><label>Produto encontrado / ajuste manual<select value={selectedProduct?.id ?? ""} onChange={(event) => onProductChange(event.target.value)}><option value="">Selecione o produto</option>{inventoryProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>{selectedProduct && <article className="inventory-found-card"><span>Produto</span><strong>{selectedProduct.name}</strong><small>Estoque atual: {formatStockQuantity(selectedProduct.currentStock, selectedProduct.unit)}</small></article>}<label>Quantidade retirada<input type="number" inputMode="decimal" min="0" value={quantity} onChange={(event) => onQuantityChange(event.target.value)} /></label><label>Observação opcional<textarea rows={3} value={observation} onChange={(event) => onObservationChange(event.target.value)} /></label><button className="primary-button wide-button" type="button" onClick={onConfirm}>Confirmar saída</button></section></section>
  );
}

function ProductRegisterScreen({ inventoryProducts, selectedProduct, mode, productId, productName, unit, currentStock, minStock, barcode, photoData, message, saving, unitOptions, onBack, onLogout, onCreateNew, onCancelCreate, onProductChange, onProductNameChange, onUnitChange, onCurrentStockChange, onMinStockChange, onBarcodeChange, onBarcodeFileChange, onPhotoFileChange, onRemovePhoto, onSave }: { inventoryProducts: InventoryProduct[]; selectedProduct: InventoryProduct | null; mode: ProductRegisterMode; productId: string; productName: string; unit: string; currentStock: string; minStock: string; barcode: string; photoData: string; message: string; saving: boolean; unitOptions: string[]; onBack: () => void; onLogout: () => void; onCreateNew: () => void; onCancelCreate: () => void; onProductChange: (productId: string) => void; onProductNameChange: (name: string) => void; onUnitChange: (unit: string) => void; onCurrentStockChange: (stock: string) => void; onMinStockChange: (stock: string) => void; onBarcodeChange: (barcode: string) => void; onBarcodeFileChange: (file: File | null) => void; onPhotoFileChange: (file: File | null) => void; onRemovePhoto: () => void; onSave: () => void | Promise<void> }) {
  const displayName = productName.trim() || selectedProduct?.name || "Novo produto";
  const stockPreview = parseProductQuantity(currentStock) ?? 0;
  const unitPreview = unit || DEFAULT_PRODUCT_UNIT;

  return (
    <section className="screen">
      <TopBar title="Cadastro de Produtos" subtitle="Edite código de barras e foto do produto" onLogout={onLogout} />
      <button className="ghost-button" type="button" onClick={onBack} disabled={saving}>Voltar para Limpeza</button>
      {message && <p className={message.includes("salvo") ? "success-message" : "notice-message"}>{message}</p>}
      <section className="manual-form inventory-form product-register-form">
        <div className="button-grid">
          <button className="secondary-button" type="button" disabled={saving} onClick={onCreateNew}>Cadastrar novo produto</button>
          {mode === "new" && <button className="ghost-button" type="button" disabled={saving || inventoryProducts.length === 0} onClick={onCancelCreate}>Editar produto existente</button>}
        </div>
        <p className="card-kicker">{mode === "new" ? "Cadastrando novo produto" : "Editando produto existente"}</p>
        {mode === "edit" && (
          <label>
            Produto
            <select value={productId} disabled={saving} onChange={(event) => onProductChange(event.target.value)}>
              {inventoryProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
          </label>
        )}
        <article className="product-register-card">
          <ProductPhoto productName={displayName} photoData={photoData} />
          <div>
            <strong>{displayName}</strong>
            <small>{formatStockQuantity(stockPreview, unitPreview)}</small>
            <label className="photo-button product-photo-edit">
              Alterar foto
              <input type="file" accept="image/*" capture="environment" disabled={saving} onChange={(event) => { onPhotoFileChange(event.target.files?.[0] ?? null); event.target.value = ""; }} />
            </label>
            {photoData && <button className="ghost-button product-photo-remove" type="button" disabled={saving} onClick={onRemovePhoto}>Remover foto</button>}
          </div>
        </article>
        <label>
          Nome do produto
          <input type="text" value={productName} placeholder="Nome do produto" disabled={saving} onChange={(event) => onProductNameChange(event.target.value)} />
        </label>
        <label>
          Unidade
          <select value={unit} disabled={saving} onChange={(event) => onUnitChange(event.target.value)}>
            {unitOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label>
          Estoque atual
          <input type="number" inputMode="decimal" min="0" value={currentStock} disabled={saving} onChange={(event) => onCurrentStockChange(event.target.value)} />
        </label>
        <label>
          Estoque mínimo
          <input type="number" inputMode="decimal" min="0" value={minStock} disabled={saving} onChange={(event) => onMinStockChange(event.target.value)} />
        </label>
        <label className="scan-button">
          Abrir câmera / ler código
          <input type="file" accept="image/*" capture="environment" disabled={saving} onChange={(event) => { onBarcodeFileChange(event.target.files?.[0] ?? null); event.target.value = ""; }} />
        </label>
        <label>
          Código de barras
          <input type="text" inputMode="numeric" value={barcode} placeholder="Bipe ou digite o código" disabled={saving} onChange={(event) => onBarcodeChange(event.target.value)} />
        </label>
        <button className="primary-button wide-button" type="button" disabled={saving} onClick={() => { void onSave(); }}>{saving ? "Salvando..." : "Salvar Produto"}</button>
      </section>
    </section>
  );
}

function StockExitHistoryScreen({ movements, onBack, onLogout }: { movements: StockMovement[]; onBack: () => void; onLogout: () => void }) {
  return <section className="screen"><TopBar title="Histórico de Saídas" subtitle="Consumo de produtos por usuária" onLogout={onLogout} /><button className="ghost-button" type="button" onClick={onBack}>Voltar para Limpeza</button>{movements.length === 0 ? <section className="empty-state"><h2>Nenhuma saída registrada</h2><p>Quando uma funcionária retirar produto, aparecerá aqui.</p></section> : <section className="orders-list">{movements.map((movement) => <article className="order-card" key={movement.id}><div className="order-head"><div><p className="card-kicker">{formatDateTime(movement.createdAt)}</p><h2>{movement.productName}</h2><small>Retirado por {movement.userName}</small>{movement.barcode && <small>Código: {movement.barcode}</small>}{movement.observation && <small>{movement.observation}</small>}</div><span className="status-done">{formatStockQuantity(movement.quantity, movement.unit)}</span></div></article>)}</section>}</section>;
}

function CurrentStockScreen({ inventoryProducts, onBack, onLogout }: { inventoryProducts: InventoryProduct[]; onBack: () => void; onLogout: () => void }) {
  return <section className="screen"><TopBar title="Estoque Atual" subtitle="Produtos cadastrados para controle de limpeza" onLogout={onLogout} /><button className="ghost-button" type="button" onClick={onBack}>Voltar para Limpeza</button><section className="product-list current-stock-list">{inventoryProducts.map((product) => <article className="product-row inventory-stock-row" key={product.id}><ProductPhoto productName={product.name} photoData={product.photoData} /><span><strong>{product.name}</strong><small>{product.barcode ? `Código: ${product.barcode}` : "Sem código cadastrado"}</small></span><strong className="stock-quantity">{formatStockQuantity(product.currentStock, product.unit)}</strong></article>)}</section></section>;
}

function ProductPhoto({ productName, photoData }: { productName: string; photoData?: string }) {
  return <div className="product-photo-box" aria-label={`Foto de ${productName}`}>{photoData ? <img src={photoData} alt={`Foto de ${productName}`} /> : <span>Sem foto</span>}</div>;
}

function UserAccessScreen({ user, permissions, notice, onLogout, onOpenCleaningDashboard, onOpenStockExit, onOpenSecurity }: { user: ManagedUser; permissions: UserPermission[]; notice: string; onLogout: () => void; onOpenCleaningDashboard: () => void; onOpenStockExit: () => void; onOpenSecurity: () => void }) {
  const moduleCards: Array<{ permission: UserPermission; title: string; detail: string; onClick?: () => void; className?: string }> = [
    { permission: "limpeza", title: "Limpeza", detail: "Rotinas e pedidos", onClick: onOpenCleaningDashboard, className: "cleaning-card" },
    { permission: "saida-estoque", title: "Saída de estoque", detail: "Bipar retirada do estoque", onClick: onOpenStockExit },
    { permission: "seguranca", title: "Segurança", detail: "Guardas e escalas", onClick: onOpenSecurity, className: "security-card" },
    { permission: "guardas", title: "Guardas", detail: "Escalas e plantões", onClick: onOpenSecurity, className: "security-card" },
    { permission: "estoque", title: "Estoque", detail: "Produtos e códigos" },
    { permission: "cafe", title: "Máquina de Café", detail: "Insumos e reposição" },
    { permission: "agua", title: "Água", detail: "Fardos e copos" },
    { permission: "manutencao", title: "Manutenção", detail: "Chamados internos" },
    { permission: "chaves", title: "Chaves", detail: "Controle de acessos" },
    { permission: "patrimonio", title: "Patrimônio", detail: "Itens e equipamentos" },
    { permission: "relatorios", title: "Relatórios", detail: "Consultas liberadas" },
  ];
  const hasAnyModule = permissions.length > 0;

  return (
    <section className="screen">
      <ProfileHero name={user.name} role={user.jobTitle} department={user.department} photoData={user.photoData} subtitle={user.userType} actions={<button className="logout-button" type="button" onClick={onLogout}>Sair</button>} />
      {notice && <p className="notice-message">{notice}</p>}
      <section className="admin-grid module-grid">
        {moduleCards.map((card) => (
          <ModuleCard key={card.permission} title={card.title} detail={card.detail} enabled={permissions.includes(card.permission)} onClick={card.onClick} className={card.className} />
        ))}
      </section>
      {!hasAnyModule && <section className="empty-state"><h2>Nenhum módulo liberado</h2><p>Solicite permissão ao admin.</p></section>}
    </section>
  );
}

function UsersPermissionsScreen({ users, notice, onBack, onLogout, onSaveUser, onDeleteUser }: { users: ManagedUser[]; notice: string; onBack: () => void; onLogout: () => void; onSaveUser: (user: ManagedUser) => boolean; onDeleteUser: (userId: string) => void }) {
  const [selectedUserId, setSelectedUserId] = useState(users[0]?.id ?? "");
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? users[0] ?? createBlankManagedUser();
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<ManagedUser>(() => cloneManagedUser(selectedUser));

  useEffect(() => {
    const nextUser = users.find((user) => user.id === selectedUserId) ?? users[0] ?? createBlankManagedUser();
    if (!creating) setDraft(cloneManagedUser(nextUser));
  }, [creating, selectedUserId, users]);

  function startNewUser() {
    const newUser = createBlankManagedUser();
    setCreating(true);
    setSelectedUserId(newUser.id);
    setDraft(newUser);
  }

  function selectUser(userId: string) {
    setCreating(false);
    setSelectedUserId(userId);
  }

  async function handleUserPhoto(file: File | null) {
    if (!file) return;
    const photoData = await imageFileToDataUrl(file);
    setDraft((current) => ({ ...current, photoData }));
  }

  function togglePermission(permission: UserPermission) {
    setDraft((current) => {
      const hasPermission = current.permissions.includes(permission);
      const permissions = hasPermission
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission];
      return { ...current, permissions };
    });
  }

  function saveDraft() {
    const saved = onSaveUser(draft);
    if (saved) {
      setCreating(false);
      setSelectedUserId(draft.id);
    }
  }

  function deleteDraft() {
    if (!window.confirm("Apagar este usuário?")) return;
    onDeleteUser(draft.id);
    setCreating(false);
    setSelectedUserId(users[0]?.id ?? "");
  }

  return <section className="screen users-screen"><TopBar title="Usuários e Permissões" subtitle="Acessos, setores e módulos do HUB SM" onLogout={onLogout} /><button className="ghost-button" type="button" onClick={onBack}>Voltar</button>{notice && <p className={notice.includes("salvo") || notice.includes("apagado") ? "success-message" : "notice-message"}>{notice}</p>}<section className="users-layout"><aside className="users-list"><button className="primary-button wide-button" type="button" onClick={startNewUser}>Cadastrar novo usuário</button>{users.map((user) => <button key={user.id} type="button" className={`user-list-card ${user.active ? "has-access" : "no-access"} ${user.id === selectedUserId && !creating ? "selected" : ""}`} onClick={() => selectUser(user.id)}><UserAvatar user={user} /><span>{user.name}</span><strong>{user.jobTitle}</strong><small>{user.department} — {user.active ? "Ativo" : "Inativo"}</small></button>)}</aside><section className="user-editor"><div className="user-editor-head"><UserAvatar user={draft} large /><div><p className="card-kicker">{creating ? "Novo usuário" : "Editar usuário"}</p><h2>{draft.name || "Usuário sem nome"}</h2><small>{draft.department} — {draft.userType}</small></div></div><section className="manual-form user-form"><label>Nome<input type="text" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label>Senha / código de acesso<input type="text" value={draft.accessCode} onChange={(event) => setDraft({ ...draft, accessCode: event.target.value })} /></label><label>Cargo / função<input type="text" value={draft.jobTitle} onChange={(event) => setDraft({ ...draft, jobTitle: event.target.value })} /></label><label>Setor / departamento<select value={draft.department} onChange={(event) => setDraft({ ...draft, department: event.target.value as UserDepartment })}>{userDepartments.map((department) => <option key={department} value={department}>{department}</option>)}</select></label><label>Tipo de usuário<select value={draft.userType} onChange={(event) => setDraft({ ...draft, userType: event.target.value as AppUserType })}>{userTypes.map((userType) => <option key={userType} value={userType}>{userType}</option>)}</select></label><label className="checkbox-row"><input type="checkbox" checked={draft.active} disabled={draft.protected} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /><span>Usuário ativo</span></label><label className="photo-button user-photo-button">Definir foto do usuário<input type="file" accept="image/*" capture="environment" onChange={(event) => { void handleUserPhoto(event.target.files?.[0] ?? null); event.target.value = ""; }} /></label>{draft.photoData && <button className="ghost-button" type="button" onClick={() => setDraft({ ...draft, photoData: undefined })}>Remover foto</button>}</section><section className="permissions-panel"><h2>Permissões por módulo</h2><div className="permissions-grid">{permissionOptions.map((permission) => { const checked = draft.id === "tezzei" || draft.permissions.includes(permission.id); return <label className={`checkbox-row permission-row ${checked ? "has-access" : "no-access"}`} key={permission.id}><input type="checkbox" checked={checked} disabled={draft.id === "tezzei"} onChange={() => togglePermission(permission.id)} /><span>{permission.label}</span></label>; })}</div></section><div className="button-grid user-actions"><button className="primary-button" type="button" onClick={saveDraft}>Salvar usuário</button><button className="secondary-button" type="button" disabled={draft.protected || !draft.active} onClick={() => setDraft({ ...draft, active: false })}>Inativar usuário</button>{!draft.system && !draft.protected && <button className="danger-button" type="button" onClick={deleteDraft}>Apagar usuário</button>}</div></section></section></section>;
}

function UserAvatar({ user, large = false }: { user: ManagedUser; large?: boolean }) {
  return <ProfileAvatar name={user.name} photoData={user.photoData} large={large} />;
}

function ProfileAvatar({ name, photoData, large = false }: { name: string; photoData?: string; large?: boolean }) {
  return <div className={large ? "user-avatar profile-avatar large" : "user-avatar profile-avatar"}>{photoData ? <img src={photoData} alt={`Foto de ${name}`} /> : <span>{getInitials(name)}</span>}</div>;
}

function ProfileHero({ name, role, department, subtitle, photoData, actions }: { name: string; role: string; department: string; subtitle?: string; photoData?: string; actions?: ReactNode }) {
  return (
    <header className="profile-hero">
      <ProfileAvatar name={name} photoData={photoData} large />
      <div className="profile-hero-copy">
        <p className="eyebrow">{department}</p>
        <h1>{name}</h1>
        <p>{role}{subtitle ? ` — ${subtitle}` : ""}</p>
      </div>
      {actions && <div className="profile-actions">{actions}</div>}
    </header>
  );
}

function ModuleCard({ title, detail, enabled = true, onClick, className = "", attention }: { title: string; detail: string; enabled?: boolean; onClick?: () => void; className?: string; attention?: string }) {
  const hasAttention = enabled && Boolean(attention);
  const cardClass = ["admin-card", "module-card", enabled ? "has-access" : "no-access", enabled && onClick ? "action-card" : "", className, hasAttention ? "needs-attention" : ""].filter(Boolean).join(" ");
  const content = (
    <>
      <span>{title}</span>
      <strong>{detail}</strong>
      {hasAttention && <small className="attention-pill">{attention}</small>}
      {!enabled && <small className="access-pill">Sem acesso</small>}
    </>
  );

  if (enabled && onClick) {
    return <button className={cardClass} type="button" onClick={onClick}>{content}</button>;
  }

  return <article className={cardClass} aria-disabled={!enabled}>{content}</article>;
}

function AdminScreen({ newOrdersCount, onlineEnabled, permissions, onLogout, onOpenCleaningDashboard, onOpenSecurity, onOpenUsersPermissions }: { newOrdersCount: number; onlineEnabled: boolean; permissions: UserPermission[]; onLogout: () => void; onOpenCleaningDashboard: () => void; onOpenSecurity: () => void; onOpenUsersPermissions: () => void }) {
  const cards: Array<{ permission: UserPermission; title: string; detail: string; onClick?: () => void; className?: string; attention?: string }> = [
    { permission: "limpeza", title: "Limpeza", detail: newOrdersCount > 0 ? `${newOrdersCount} pedido(s) pendente(s)` : "Rotinas, pedidos Sinval e equipe", onClick: onOpenCleaningDashboard, className: "cleaning-card", attention: newOrdersCount > 0 ? "Precisa de atenção" : undefined },
    { permission: "estoque", title: "Estoque", detail: "Produtos, códigos e saídas" },
    { permission: "cafe", title: "Máquina de Café", detail: "Insumos, doses e reposição" },
    { permission: "agua", title: "Água", detail: "Controle de fardos e copos" },
    { permission: "manutencao", title: "Manutenção", detail: "Chamados e tarefas internas" },
    { permission: "chaves", title: "Chaves", detail: "Controle de acessos" },
    { permission: "seguranca", title: "Segurança", detail: "Guardas e escalas", onClick: onOpenSecurity, className: "security-card" },
    { permission: "patrimonio", title: "Patrimônio", detail: "Itens, equipamentos e auditoria" },
    { permission: "relatorios", title: "Relatórios", detail: "Consultas e auditoria" },
    { permission: "painel-admin", title: "Usuários e Permissões", detail: "Acessos, setores e módulos", onClick: onOpenUsersPermissions, className: "users-card" },
  ];

  return (
    <section className="screen">
      <TopBar title="Painel Tezzei" subtitle={onlineEnabled ? "Central Operacional HUB SM — online" : "Central Operacional HUB SM — local"} onLogout={onLogout} />
      <section className="admin-grid module-grid">
        {cards.map((card) => <ModuleCard key={card.permission} title={card.title} detail={card.detail} enabled={permissions.includes(card.permission)} onClick={card.onClick} className={card.className} attention={card.attention} />)}
      </section>
    </section>
  );
}

function SecurityMenuScreen({ permissions, onBack, onLogout, onOpenGuards }: { permissions: UserPermission[]; onBack: () => void; onLogout: () => void; onOpenGuards: () => void }) {
  const canGuards = permissions.includes("guardas");
  return <section className="screen"><TopBar title="Segurança" subtitle="Controle de segurança" onLogout={onLogout} /><button className="ghost-button" type="button" onClick={onBack}>Voltar</button><section className="admin-grid security-grid"><ModuleCard title="Guardas" detail="Controle dos guardas" enabled={canGuards} onClick={onOpenGuards} className="security-card" /></section></section>;
}

function SecurityGuardsScreen({ onBack, onLogout, onOpenGuard }: { onBack: () => void; onLogout: () => void; onOpenGuard: (guardName: GuardName) => void }) {
  return <section className="screen"><TopBar title="Guardas" subtitle="Selecione o guarda" onLogout={onLogout} /><button className="ghost-button" type="button" onClick={onBack}>Voltar para Segurança</button><section className="admin-grid security-grid"><TodayDutyCard />{guardNames.map((guardName) => <ModuleCard key={guardName} title={guardName} detail="Guarda Santa Maria" enabled onClick={() => onOpenGuard(guardName)} className="security-card" />)}</section></section>;
}

function SecurityGuardDetailScreen({ guardLocalId, guardName, onBack, onLogout }: { guardLocalId: GuardId; guardName: GuardName; onBack: () => void; onLogout: () => void }) {
  const summary = getGuardSummaryShift(guardName);
  const upcomingShifts = getUpcomingGuardShifts(guardName);
  const todayShift = getGuardTodayShift(guardName);
  const nextShift = getNextGuardFutureShift(guardName);

  return <section className="screen"><ProfileHero name={guardName} role="Guarda Santa Maria" department="Segurança" subtitle="Escala de horário" actions={<><button className="ghost-button" type="button" onClick={onBack}>Voltar para Guardas</button><button className="logout-button" type="button" onClick={onLogout}>Sair</button></>} /><GuardShiftPanel guardLocalId={guardLocalId} guardName={guardName} todayShift={todayShift} nextShift={nextShift} canManage={false} /><section className="shift-section">{summary ? <ShiftCard shift={summary.shift} label={summary.label} featured /> : <article className="shift-card featured"><span>ESCALA</span><strong>Sem próximo plantão lançado</strong><p>Atualize a escala do mês.</p></article>}<h2>Próximos plantões</h2><div className="shift-list">{upcomingShifts.length > 0 ? upcomingShifts.map((shift) => <ShiftCard key={`${shift.startDate}-${shift.startTime}-${shift.endDate}-${shift.endTime}`} shift={shift} />) : <article className="shift-card"><strong>Sem próximos plantões</strong><p>Atualize a escala do mês.</p></article>}</div></section></section>;
}

function GuardUserScreen({ guardLocalId, guardName, onLogout }: { guardLocalId: GuardId; guardName: GuardName; onLogout: () => void }) {
  const summary = getGuardSummaryShift(guardName);
  const upcomingShifts = getUpcomingGuardShifts(guardName);
  const todayShift = getGuardTodayShift(guardName);
  const nextShift = getNextGuardFutureShift(guardName);

  return <section className="screen"><ProfileHero name={guardName} role="Guarda Santa Maria" department="Segurança" subtitle="Escala de horário" actions={<button className="logout-button" type="button" onClick={onLogout}>Sair</button>} /><GuardShiftPanel guardLocalId={guardLocalId} guardName={guardName} todayShift={todayShift} nextShift={nextShift} canManage /><section className="shift-section">{summary ? <ShiftCard shift={summary.shift} label={summary.label} featured /> : <article className="shift-card featured"><span>ESCALA</span><strong>Sem próximo plantão lançado</strong><p>Atualize a escala do mês.</p></article>}<h2>Próximos plantões</h2><div className="shift-list">{upcomingShifts.length > 0 ? upcomingShifts.map((shift) => <ShiftCard key={`${shift.startDate}-${shift.startTime}-${shift.endDate}-${shift.endTime}`} shift={shift} />) : <article className="shift-card"><strong>Sem próximos plantões</strong><p>Atualize a escala do mês.</p></article>}</div></section></section>;
}

function TodayDutyCard() {
  const duty = getTodayDuty();
  if (!duty) {
    return <article className="service-today-card"><span>HOJE DE SERVIÇO</span><strong>Nenhum guarda lançado para hoje</strong><p>Atualize a escala quando houver novo plantão.</p></article>;
  }

  return <article className="service-today-card"><span>HOJE DE SERVIÇO</span><strong>{duty.guardName}</strong><p>Entrada: {duty.shift.startTime}<br />Saída: {duty.shift.endTime} — {duty.shift.endText}</p>{duty.shift.observation && <p className="shift-observation">{duty.shift.observation}</p>}</article>;
}

function ShiftCard({ shift, label, featured = false }: { shift: GuardShift; label?: string; featured?: boolean }) {
  return <article className={featured ? "shift-card featured" : "shift-card"}><span>{label ?? shift.shiftType}</span><strong>{shift.startText}</strong><p>Entrada: {shift.startTime}<br />Saída: {shift.endTime} — {shift.endText}</p>{shift.observation && <p className="shift-observation">{shift.observation}</p>}</article>;
}

function CleaningDashboardScreen({ newOrdersCount, permissions, onBack, onLogout, onOpenOrders, onOpenStockExit, onOpenBarcodeRegister, onOpenCurrentStock, onOpenStockHistory, onOpenProfiles, onOpenOrderHistory, onOpenNeiaHistory }: { newOrdersCount: number; permissions: UserPermission[]; onBack: () => void; onLogout: () => void; onOpenOrders: () => void; onOpenStockExit: () => void; onOpenBarcodeRegister: () => void; onOpenCurrentStock: () => void; onOpenStockHistory: () => void; onOpenProfiles: () => void; onOpenOrderHistory: () => void; onOpenNeiaHistory: () => void }) {
  const canCleaning = permissions.includes("limpeza");
  const canStock = permissions.includes("estoque");
  const canStockExit = permissions.includes("saida-estoque");
  const canReports = permissions.includes("relatorios");
  const cards = [
    { key: "orders", title: "Pedidos Sinval", detail: newOrdersCount > 0 ? `${newOrdersCount} pedido(s) pendente(s)` : "Nenhum pedido pendente", enabled: canCleaning, onClick: onOpenOrders, attention: newOrdersCount > 0 ? "Verificar agora" : undefined },
    { key: "stock-exit", title: "Saída de Produto", detail: "Bipar retirada do estoque", enabled: canStockExit, onClick: onOpenStockExit },
    { key: "product-register", title: "Cadastro de Produtos", detail: "Produtos, códigos e foto", enabled: canStock, onClick: onOpenBarcodeRegister },
    { key: "current-stock", title: "Estoque Atual", detail: "Produtos e códigos cadastrados", enabled: canStock, onClick: onOpenCurrentStock },
    { key: "stock-history", title: "Histórico de Saídas", detail: "Quem usou, quando e quanto", enabled: canStock, onClick: onOpenStockHistory },
    { key: "neia-history", title: "Histórico Neia", detail: "Todos os pedidos feitos pela Neia", enabled: canCleaning, onClick: onOpenNeiaHistory },
    { key: "order-history", title: "Histórico / Auditoria", detail: "Concluídos e excluídos", enabled: canReports, onClick: onOpenOrderHistory },
    { key: "profiles", title: "Perfis da equipe", detail: "Acessar telas da Neia, Selma e Helena", enabled: canCleaning, onClick: onOpenProfiles },
  ];

  return <section className="screen"><TopBar title="Gestão de Limpeza" subtitle="Neia, Selma, Helena, pedidos, estoque e auditoria" onLogout={onLogout} /><button className="ghost-button" type="button" onClick={onBack}>Voltar</button>{canCleaning && newOrdersCount > 0 && <button className="alert-banner cleaning-alert-banner" type="button" onClick={onOpenOrders}>Pedido novo da Neia — precisa de atenção</button>}<section className="admin-grid cleaning-dashboard-grid">{cards.map((card) => <ModuleCard key={card.key} title={card.title} detail={card.detail} enabled={card.enabled} onClick={card.onClick} className="cleaning-control-card" attention={card.attention} />)}</section></section>;
}

function ProfilesScreen({ profiles, notice, onBack, onLogout, onPreviewEmployee, onProfilePhotoChange }: { profiles: Record<EmployeeId, EmployeeProfile>; notice: string; onBack: () => void; onLogout: () => void; onPreviewEmployee: (employeeId: EmployeeId) => void; onProfilePhotoChange: (employeeId: EmployeeId, file: File | null) => void }) {
  return <section className="screen"><TopBar title="Perfis da Equipe de Limpeza" subtitle="Visualizar telas sem digitar senha" onLogout={onLogout} /><button className="ghost-button" type="button" onClick={onBack}>Voltar para Limpeza</button>{notice && <p className="success-message">{notice}</p>}<section className="profile-grid">{employeeIds.map((employeeId) => { const employee = employees[employeeId]; const profile = profiles[employeeId]; return <article className="profile-card" key={employeeId}><ProfileAvatar name={employee.name} photoData={profile?.photoData} large /><div className="profile-card-copy"><p className="card-kicker">Limpeza</p><h2>{employee.name}</h2><p>Limpeza — {employee.schedule}</p></div><div className="profile-card-actions"><label className="photo-button">Cadastrar / alterar foto<input type="file" accept="image/*" capture="environment" onChange={(event) => { onProfilePhotoChange(employeeId, event.target.files?.[0] ?? null); event.target.value = ""; }} /></label><button className="primary-button" type="button" onClick={() => onPreviewEmployee(employeeId)}>Ver tela da usuária</button></div></article>; })}</section></section>;
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
  return <ModuleCard title={title} detail={detail} enabled />;
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

function getGuardShifts(guardName: GuardName) {
  return guardScheduleRows[guardName]
    .map(parseGuardShift)
    .sort((first, second) => getShiftStart(first).getTime() - getShiftStart(second).getTime());
}

function parseGuardShift(row: string): GuardShift {
  const [startDate, startText, startTime, endDate, endText, endTime, shiftType, observation] = row.split("|");
  return {
    startDate,
    startText,
    startTime,
    endDate,
    endText,
    endTime,
    shiftType,
    observation: observation || undefined,
  };
}

function getShiftStart(shift: GuardShift) {
  return parseBrazilDateTime(shift.startDate, shift.startTime);
}

function getShiftEnd(shift: GuardShift) {
  return parseBrazilDateTime(shift.endDate, shift.endTime);
}

function parseBrazilDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00-03:00`);
}

function getTodayIso(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayDuty(now = new Date()): { guardName: GuardName; shift: GuardShift } | null {
  const activeShift = guardNames
    .map((guardName) => ({ guardName, shift: getGuardShifts(guardName).find((shift) => getShiftStart(shift) <= now && now <= getShiftEnd(shift)) }))
    .find((item): item is { guardName: GuardName; shift: GuardShift } => Boolean(item.shift));

  if (activeShift) return activeShift;

  const today = getTodayIso(now);
  return guardNames
    .map((guardName) => ({ guardName, shift: getGuardShifts(guardName).find((shift) => shift.startDate === today) }))
    .find((item): item is { guardName: GuardName; shift: GuardShift } => Boolean(item.shift)) ?? null;
}

function getGuardSummaryShift(guardName: GuardName, now = new Date()): { label: "HOJE" | "PRÓXIMA ESCALA"; shift: GuardShift } | null {
  const shifts = getGuardShifts(guardName);
  const activeShift = shifts.find((shift) => getShiftStart(shift) <= now && now <= getShiftEnd(shift));
  if (activeShift) return { label: "HOJE", shift: activeShift };

  const today = getTodayIso(now);
  const todayShift = shifts.find((shift) => shift.startDate === today);
  if (todayShift) return { label: "HOJE", shift: todayShift };

  const nextShift = shifts.find((shift) => getShiftStart(shift) > now);
  return nextShift ? { label: "PRÓXIMA ESCALA", shift: nextShift } : null;
}

function getGuardTodayShift(guardName: GuardName, now = new Date()) {
  const today = getTodayIso(now);
  return getGuardShifts(guardName).find((shift) => shift.startDate === today) ?? null;
}

function getNextGuardFutureShift(guardName: GuardName, now = new Date()) {
  return getGuardShifts(guardName).find((shift) => getShiftStart(shift) > now) ?? null;
}

function getUpcomingGuardShifts(guardName: GuardName, now = new Date()) {
  return getGuardShifts(guardName)
    .filter((shift) => getShiftEnd(shift) >= now)
    .slice(0, 6);
}

function getGuardIdFromName(guardName: GuardName): GuardId {
  return guardName === "Carlos Clemente" ? "carlos-clemente" : "salomao";
}

function isGuardName(value: unknown): value is GuardName {
  return typeof value === "string" && guardNames.includes(value as GuardName);
}

function isGuardId(value: unknown): value is GuardId {
  return value === "carlos-clemente" || value === "salomao";
}

function isEmployeeId(value: unknown): value is EmployeeId {
  return typeof value === "string" && employeeIds.includes(value as EmployeeId);
}

function getActiveEmployeeId(view: View, currentUser: UserRole | null, previewEmployeeId: EmployeeId | null): EmployeeId | null {
  if (view === "employee-preview") return previewEmployeeId;
  if (view === "employee" && currentUser === "tezzei") return previewEmployeeId;
  if (isEmployeeId(currentUser)) return currentUser;
  return null;
}

function getManagedUser(users: ManagedUser[], userId: UserRole | null) {
  if (!userId) return null;
  return users.find((user) => user.id === userId) ?? null;
}

function getManagedUserPermissions(userId: UserRole | null, users: ManagedUser[]) {
  if (userId === "tezzei") return allUserPermissions;
  const user = getManagedUser(users, userId);
  return user?.active ? uniquePermissions(user.permissions) : [];
}

function hasManagedUserPermission(userId: UserRole | null, permission: UserPermission, users: ManagedUser[]) {
  return getManagedUserPermissions(userId, users).includes(permission);
}

function findManagedUserByAccessCode(accessCode: string, users: ManagedUser[]) {
  return users.find((user) => user.accessCode === accessCode) ?? null;
}

function getInitialViewForManagedUser(user: ManagedUser): View {
  if (user.linkedGuardId) return "guard";
  if (user.linkedEmployeeId) return "employee";
  if (user.permissions.includes("painel-admin")) return "admin";
  return "user-home";
}

function upsertManagedUser(users: ManagedUser[], user: ManagedUser) {
  const exists = users.some((current) => current.id === user.id);
  if (exists) return users.map((current) => (current.id === user.id ? user : current));
  return [...users, user];
}

function createBlankManagedUser(): ManagedUser {
  const now = new Date().toISOString();
  return {
    id: `user-${createId()}`,
    name: "",
    accessCode: "",
    userType: "Consulta",
    jobTitle: "Consulta",
    department: "Administração",
    active: true,
    permissions: [],
    createdAt: now,
    updatedAt: now,
  };
}

function cloneManagedUser(user: ManagedUser): ManagedUser {
  return { ...user, permissions: [...user.permissions] };
}

function uniquePermissions(permissions: UserPermission[]) {
  return permissionOptions
    .map((permission) => permission.id)
    .filter((permission) => permissions.includes(permission));
}

function getStockExitUserName(userId: StockExitUserId, users: ManagedUser[]) {
  if (userId === "Sergio Tezzei") return userId;
  if (isEmployeeId(userId)) return employees[userId].name;
  return users.find((user) => user.id === userId)?.name ?? userId;
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

function formatStockQuantity(quantity: number, unit: string) {
  return `${quantity} ${pluralizeUnit(unit, quantity)}`;
}

function pluralizeUnit(unit: string, quantity: number): string {
  if (Number(quantity) === 1) return unit;
  if (unit.includes("/")) return unit.split("/").map((part) => pluralizeUnit(part, quantity)).join("/");
  const pluralMap: Record<string, string> = {
    Litro: "Litros",
    Unidade: "Unidades",
    Galão: "Galões",
    Caixa: "Caixas",
    Pacote: "Pacotes",
    Fardo: "Fardos",
    Par: "Pares",
    Rolo: "Rolos",
    Quilo: "Quilos",
  };
  return pluralMap[unit] ?? unit;
}

function parseProductQuantity(value: string) {
  const normalizedValue = value.trim().replace(",", ".");
  if (!normalizedValue) return null;
  const quantity = Number(normalizedValue);
  if (!Number.isFinite(quantity) || quantity < 0) return null;
  return quantity;
}

function getInitialSession(): SavedSession {
  const fallback: SavedSession = { view: "login", currentUser: null, previewEmployeeId: null, selectedGuardName: null };
  if (typeof window === "undefined") return fallback;
  const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  const isReload = navigation?.type === "reload";
  if (!isReload) return fallback;
  try {
    const storedSession = window.sessionStorage.getItem(SESSION_KEY);
    if (!storedSession) return fallback;
    const parsed = JSON.parse(storedSession) as SavedSession;
    if (!parsed.currentUser) return fallback;
    if (isGuardId(parsed.currentUser)) {
      return { ...parsed, view: "guard", previewEmployeeId: null, selectedGuardName: guardUserMap[parsed.currentUser] };
    }
    if (parsed.view === "security-guard-detail" && !isGuardName(parsed.selectedGuardName)) {
      return { ...parsed, view: "security-guards", selectedGuardName: null };
    }
    return parsed;
  } catch { return fallback; }
}

function getLocalManagedUsers(): ManagedUser[] {
  if (typeof window === "undefined") return defaultManagedUsers;
  const rawUsers = window.localStorage.getItem(USERS_KEY);
  if (!rawUsers) return defaultManagedUsers.map(cloneManagedUser);

  try {
    const parsed = JSON.parse(rawUsers);
    if (!Array.isArray(parsed)) return defaultManagedUsers.map(cloneManagedUser);
    return mergeManagedUsers(parsed);
  } catch {
    return defaultManagedUsers.map(cloneManagedUser);
  }
}

function saveLocalManagedUsers(users: ManagedUser[]) {
  window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function mergeManagedUsers(storedUsers: unknown[]) {
  const validStoredUsers = storedUsers.filter(isManagedUserLike);
  const storedMap = new Map(validStoredUsers.map((user) => [user.id, user]));
  const defaultIds = new Set(defaultManagedUsers.map((user) => user.id));
  const systemUsers = defaultManagedUsers.map((defaultUser) => {
    const storedUser = storedMap.get(defaultUser.id);
    return normalizeManagedUser({
      ...defaultUser,
      ...storedUser,
      id: defaultUser.id,
      linkedEmployeeId: defaultUser.linkedEmployeeId,
      linkedGuardId: defaultUser.linkedGuardId,
      protected: defaultUser.protected,
      system: true,
      active: defaultUser.protected ? true : storedUser?.active ?? defaultUser.active,
      permissions: defaultUser.id === "tezzei" ? allUserPermissions : storedUser?.permissions ?? defaultUser.permissions,
    });
  });
  const customUsers = validStoredUsers
    .filter((user) => !defaultIds.has(user.id))
    .map(normalizeManagedUser);

  return [...systemUsers, ...customUsers];
}

function isManagedUserLike(value: unknown): value is ManagedUser {
  if (!value || typeof value !== "object") return false;
  const user = value as Partial<ManagedUser>;
  return typeof user.id === "string" && typeof user.name === "string" && typeof user.accessCode === "string";
}

function normalizeManagedUser(user: ManagedUser): ManagedUser {
  const userType = userTypes.includes(user.userType) ? user.userType : "Consulta";
  return {
    ...user,
    name: user.name || "Usuário",
    accessCode: user.accessCode || "",
    userType,
    jobTitle: user.jobTitle || userType,
    department: userDepartments.includes(user.department) ? user.department : "Administração",
    active: Boolean(user.active),
    permissions: user.id === "tezzei" ? allUserPermissions : uniquePermissions(Array.isArray(user.permissions) ? user.permissions : []),
    createdAt: user.createdAt || defaultCreatedAt,
    updatedAt: user.updatedAt || user.createdAt || defaultCreatedAt,
  };
}

function baseInventory(): InventoryProduct[] {
  return products.map((product) => ({ ...product, currentStock: 0, minStock: 0 }));
}

function getLocalInventoryProducts(): InventoryProduct[] {
  const rawProducts = window.localStorage.getItem(INVENTORY_KEY);
  const legacyPhotos = getLegacyProductPhotos();
  if (!rawProducts) {
    return baseInventory().map((product) => ({ ...product, photoData: legacyPhotos[getLegacyProductPhotoKey(product.name)] }));
  }
  try {
    const parsed = JSON.parse(rawProducts);
    if (!Array.isArray(parsed)) throw new Error("Estoque inválido");
    const storedProducts = parsed.filter(isInventoryProductLike).map(normalizeInventoryProduct);
    const localMap = new Map(storedProducts.map((product) => [product.id, product]));
    const baseProducts = baseInventory().map((product) => {
      const localProduct = localMap.get(product.id);
      return {
        ...product,
        ...localProduct,
        photoData: localProduct?.photoData ?? legacyPhotos[getLegacyProductPhotoKey(product.name)],
      };
    });
    const baseIds = new Set(baseProducts.map((product) => product.id));
    const customProducts = storedProducts.filter((product) => !baseIds.has(product.id));
    return [...baseProducts, ...customProducts];
  } catch {
    return baseInventory().map((product) => ({ ...product, photoData: legacyPhotos[getLegacyProductPhotoKey(product.name)] }));
  }
}

function saveLocalInventoryProducts(inventoryProducts: InventoryProduct[]) {
  window.localStorage.setItem(INVENTORY_KEY, JSON.stringify(inventoryProducts));
}

function isInventoryProductLike(value: unknown): value is Partial<InventoryProduct> & { id: string; name: string } {
  if (!value || typeof value !== "object") return false;
  const product = value as Partial<InventoryProduct>;
  return typeof product.id === "string" && typeof product.name === "string";
}

function normalizeInventoryProduct(product: Partial<InventoryProduct> & { id: string; name: string }): InventoryProduct {
  return {
    id: product.id,
    name: product.name || "Produto",
    unit: product.unit || DEFAULT_PRODUCT_UNIT,
    barcode: product.barcode || undefined,
    photoData: product.photoData || undefined,
    currentStock: typeof product.currentStock === "number" && Number.isFinite(product.currentStock) ? product.currentStock : 0,
    minStock: typeof product.minStock === "number" && Number.isFinite(product.minStock) ? product.minStock : 0,
  };
}

async function prepareLocalProductDetails(details: ProductRegisterDetails): Promise<{ products: InventoryProduct[]; productId: string }> {
  const currentProducts = getLocalInventoryProducts();
  const unit = details.unit || DEFAULT_PRODUCT_UNIT;
  const savedProduct: InventoryProduct = {
    id: details.mode === "new" ? createProductId(details.name, currentProducts) : details.productId,
    name: details.name,
    unit,
    currentStock: details.currentStock,
    minStock: details.minStock,
    barcode: details.barcode || undefined,
    photoData: details.photoData || undefined,
  };

  const nextProducts = details.mode === "new"
    ? [...currentProducts, savedProduct]
    : currentProducts.map((product) => product.id === details.productId ? { ...product, ...savedProduct } : product);

  return { products: await compactInventoryProductPhotos(nextProducts), productId: savedProduct.id };
}

function saveLocalProductDetails(inventoryProducts: InventoryProduct[]) {
  const serializedProducts = JSON.stringify(inventoryProducts);
  if (serializedProducts.length > INVENTORY_STORAGE_MAX_CHARS) {
    throw new InventoryStorageTooLargeError();
  }
  window.localStorage.setItem(INVENTORY_KEY, serializedProducts);
}

async function compactInventoryProductPhotos(inventoryProducts: InventoryProduct[]) {
  const compactProducts: InventoryProduct[] = [];
  for (const product of inventoryProducts) {
    if (!product.photoData || product.photoData.length <= PRODUCT_PHOTO_MAX_DATA_URL_LENGTH) {
      compactProducts.push(product);
      continue;
    }

    const photoData = await dataUrlToProductThumbnail(product.photoData);
    compactProducts.push({ ...product, photoData });
    await waitForNextFrame();
  }

  return compactProducts;
}

function getProductPhotoErrorMessage(error: unknown) {
  if (isProductPhotoTooHeavyError(error)) return PRODUCT_PHOTO_TOO_HEAVY_MESSAGE;
  return "Não foi possível carregar a foto. Tente outra imagem.";
}

function getProductSaveErrorMessage(error: unknown) {
  if (isProductPhotoTooHeavyError(error) || error instanceof InventoryStorageTooLargeError || isStorageQuotaError(error)) {
    return PRODUCT_PHOTO_TOO_HEAVY_MESSAGE;
  }
  return "Não foi possível salvar o produto. Tente novamente.";
}

function isProductPhotoTooHeavyError(error: unknown) {
  return error instanceof ProductPhotoTooHeavyError;
}

function isStorageQuotaError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const quotaError = error as { name?: string; code?: number };
  return quotaError.name === "QuotaExceededError" || quotaError.name === "NS_ERROR_DOM_QUOTA_REACHED" || quotaError.code === 22 || quotaError.code === 1014;
}

function getLegacyProductPhotos(): Record<string, string> {
  const rawPhotos = window.localStorage.getItem(LEGACY_PRODUCT_PHOTOS_KEY);
  if (!rawPhotos) return {};
  try {
    const parsed = JSON.parse(rawPhotos);
    return parsed && typeof parsed === "object" ? parsed as Record<string, string> : {};
  } catch { return {}; }
}

function getLegacyProductPhotoKey(productName: string) {
  return productName.trim().toLowerCase();
}

function createProductId(productName: string, existingProducts: InventoryProduct[]) {
  const baseId = slugifyProductName(productName) || `produto-${Date.now()}`;
  const existingIds = new Set(existingProducts.map((product) => product.id));
  let productId = baseId;
  let suffix = 2;
  while (existingIds.has(productId)) {
    productId = `${baseId}-${suffix}`;
    suffix += 1;
  }
  return productId;
}

function slugifyProductName(productName: string) {
  return productName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
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

function addLocalStockExit(input: { product: InventoryProduct; quantity: number; userId: StockExitUserId; userName: string; observation?: string }) {
  const movement: StockMovement = { id: createId(), productId: input.product.id, productName: input.product.name, unit: input.product.unit, barcode: input.product.barcode, movementType: "saida", quantity: input.quantity, userId: input.userId, userName: input.userName, createdAt: new Date().toISOString(), observation: input.observation?.trim() || undefined };
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
  try {
    return await resizeImageElementToDataUrl(image, 520, 0.78);
  } catch {
    return rawDataUrl;
  }
}

async function imageFileToProductThumbnail(file: File): Promise<string> {
  if (file.size > PRODUCT_PHOTO_SOURCE_MAX_BYTES) {
    throw new ProductPhotoTooHeavyError();
  }

  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(imageUrl);
    return createProductThumbnailDataUrl(image);
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

async function dataUrlToProductThumbnail(dataUrl: string): Promise<string> {
  if (dataUrl.length > PRODUCT_PHOTO_SOURCE_MAX_DATA_URL_LENGTH) {
    throw new ProductPhotoTooHeavyError();
  }

  const image = await loadImage(dataUrl);
  return createProductThumbnailDataUrl(image);
}

async function createProductThumbnailDataUrl(image: HTMLImageElement): Promise<string> {
  for (const step of PRODUCT_PHOTO_COMPRESSION_STEPS) {
    const photoData = await resizeImageElementToDataUrl(image, step.maxSide, step.quality);
    if (photoData.length <= PRODUCT_PHOTO_MAX_DATA_URL_LENGTH) {
      return photoData;
    }
    await waitForNextFrame();
  }

  throw new ProductPhotoTooHeavyError();
}

async function resizeImageElementToDataUrl(image: HTMLImageElement, maxSize: number, quality: number): Promise<string> {
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas indisponível");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvasToDataUrl(canvas, "image/jpeg", quality);
}

function canvasToDataUrl(canvas: HTMLCanvasElement, type: string, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Não foi possível compactar a imagem."));
        return;
      }
      readFileAsDataUrl(blob).then(resolve).catch(reject);
    }, type, quality);
  });
}

function readFileAsDataUrl(file: Blob): Promise<string> {
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

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export default App;
