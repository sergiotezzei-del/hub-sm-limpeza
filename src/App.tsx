import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { AppIcon, type AppIconName } from "./components/AppIcon";
import { activities, employees } from "./data";
import { GuardShiftPanel, GuardSyncDiagnosticPanel } from "./modules/security/components/GuardShift";
import { signInAdminSupabaseAuth, signInGuardSupabaseAuth } from "./modules/security/services/guardAuthBridge";
import { loadGuardPaymentData, saveGuardPaymentProfile, saveGuardPaymentRecords, updateGuardPaymentRecordStatus } from "./modules/security/services/paymentService";
import { DEFAULT_GUARD_ROUND_POINTS, DEFAULT_GUARD_ROUND_SCHEDULES, loadGuardRoundReport } from "./modules/security/services/roundService";
import { loadGuardMonitoringEntries } from "./modules/security/services/shiftService";
import { signOutSupabaseAuth } from "./modules/security/services/supabaseClient";
import { createBlankVehicleDraft, loadVehicleRecords, normalizeVehiclePlate, saveVehicleRecord, vehicleToDraft } from "./modules/security/services/vehicleService";
import { deleteManagedUserRemote, getManagedUserRemoteLoginErrorMessage, isManagedUsersRemoteProtectedError, loadManagedUsersRemote, loginManagedUserRemoteByAccessCode, saveManagedUserRemote, syncLocalManagedUsersToCloud } from "./modules/users/services/managedUserService";
import type { GuardPaymentLoadState, GuardPaymentProfile, GuardPaymentRecord, GuardPaymentStatus } from "./modules/security/types/payment.types";
import type { GuardRoundCheckin, GuardRoundCheckinSource, GuardRoundCheckinStatus, GuardRoundLoadState, GuardRoundPoint, GuardRoundReportEntry, GuardRoundReportStatus, GuardRoundSchedule } from "./modules/security/types/round.types";
import type { GuardMonitoringEntry, GuardMonitoringLoadState, GuardShiftStatus } from "./modules/security/types/shift.types";
import type { VehicleLoadState, VehicleRecord, VehicleRecordDraft } from "./modules/security/types/vehicle.types";
import { vehicleOwnerTypes } from "./modules/security/types/vehicle.types";
import { recognizePlateFromPhoto } from "./utils/plateOcr";
import {
  addOrder,
  addStockCheck,
  deleteOrder as removeStoredOrder,
  getEmployeeProfiles,
  getCleaningOfflineQueueSummary,
  getInventoryProducts as getStoredInventoryProducts,
  getLocalEmployeeProfiles,
  getLocalInventoryProducts as getStoredLocalInventoryProducts,
  getLocalOrders,
  getLocalStockMovements as getStoredLocalStockMovements,
  getNeiaOrderHistory,
  getOrderHistory,
  getOrders,
  getStockMovements as getStoredStockMovements,
  InventoryStorageTooLargeError,
  isCloudStorageEnabled,
  prepareCleaningForRealUse,
  registerStockExit,
  saveEmployeePhoto,
  saveInventoryProductDetails,
  syncCleaningOfflineQueue,
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
  | "system-status"
  | "copa-cafe-menu"
  | "maintenance-menu"
  | "general-stock-menu"
  | "patrimony-menu"
  | "reports-menu"
  | "security-menu"
  | "security-guards"
  | "security-guards-payment"
  | "security-monitoring"
  | "security-parking"
  | "security-guard-detail";

type ManualDraft = {
  name: string;
  quantity: string;
  observation: string;
};

type GuardName = "Carlos Clemente" | "Salomão";

type MonitoringTab = "entries" | "rounds" | "qrcode";
type MonitoringGuardFilter = "all" | GuardName;
type MonitoringStatusFilter = "all" | "ok" | "late" | "out_of_sequence" | "pending";
type MonitoringShiftSummaryStatus = "complete" | "in_progress" | "incomplete" | "late" | "out_of_sequence";
type RoundScheduleDisplayStatus = "complete" | "incomplete" | "late" | "out_of_sequence" | "waiting";
type MonitoringAlertLevel = "ok" | "warning" | "danger";
type PaymentStatus = "ok" | "check_entry" | "check_exit" | "check_rounds" | "check_shift";
type GuardPaymentExtraType = "Feriado 1/2 dia" | "Feriado dia inteiro" | "Plantão especial 1/2 dia" | "Plantão especial dia inteiro" | "Evento especial 1/2 dia" | "Evento especial dia inteiro" | "Outro";

type GuardPaymentExtra = {
  id: string;
  guardId: GuardId;
  date: string;
  type: GuardPaymentExtraType;
  description: string;
  amount: number;
};

type GuardShiftConferenceItem = {
  id: string;
  guardId: GuardId;
  guardName: GuardName;
  date: string;
  line: string;
};

type GuardPaymentClosingRow = {
  guardId: GuardId;
  guardName: GuardName;
  paymentName: string;
  profile: GuardPaymentProfile;
  profileComplete: boolean;
  shifts: GuardShiftConferenceItem[];
  extras: GuardPaymentExtra[];
  baseAmount: number;
  holidayExtraAmount: number;
  shiftExtraAmount: number;
  totalAmount: number;
  extraDescription: string;
};

type MonitoringAlert = {
  id: string;
  level: MonitoringAlertLevel;
  guardName?: string;
  title: string;
  message: string;
};

type PaymentReportRow = {
  id: string;
  guardName: string;
  date: string;
  shiftType: string;
  scheduledStart: string;
  scheduledEnd: string;
  registeredStart: string;
  registeredEnd: string;
  expectedHours: string;
  registeredHours: string;
  serviceStatus: string;
  roundsExpected: number;
  roundsComplete: number;
  pointsRegistered: number;
  pointsPending: number;
  lateCount: number;
  outOfSequenceCount: number;
  paymentStatus: PaymentStatus;
  observations: string;
};

type MonitoringShiftSummary = {
  id: string;
  shiftSessionId: string;
  guardName: string;
  guardLocalId?: GuardId;
  scheduledDate: string;
  scheduledStart: string;
  scheduledEnd: string;
  shiftStatus: GuardShiftStatus;
  startedAt?: string;
  endedAt?: string;
  source: "Supabase" | "Local";
  roundsExpected: number;
  roundsComplete: number;
  pointsExpected: number;
  pointsRegistered: number;
  pointsPending: number;
  overduePendingPoints: number;
  lateCount: number;
  outOfSequenceCount: number;
  status: MonitoringShiftSummaryStatus;
};

type MonitoringOverviewMetrics = {
  registeredShifts: number;
  activeShifts: number;
  roundsExpected: number;
  roundsComplete: number;
  pointsRegistered: number;
  pointsPending: number;
  lateCount: number;
  outOfSequenceCount: number;
};

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
type ManagedUsersSyncState = {
  source: "local" | "supabase";
  message: string;
  loading: boolean;
  syncing: boolean;
  remoteProtected: boolean;
  lastSyncedAt?: string;
};

const SESSION_KEY = "hub-sm-active-session";
const USERS_KEY = "hub-sm-users-permissions";
const PRODUCT_PHOTO_SOURCE_MAX_BYTES = 10 * 1024 * 1024;
const PRODUCT_PHOTO_SOURCE_MAX_DATA_URL_LENGTH = 14 * 1024 * 1024;
const PRODUCT_PHOTO_MAX_DATA_URL_LENGTH = 70 * 1024;
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

const GUARD_PAYMENT_BASE_AMOUNT = 1000;
const GUARD_PAYMENT_HALF_EXTRA_AMOUNT = 75;
const GUARD_PAYMENT_FULL_EXTRA_AMOUNT = 150;
const guardPaymentStatuses: GuardPaymentStatus[] = ["PENDENTE", "ENVIADO AO FINANCEIRO", "PAGO"];
const guardPaymentExtraTypes: GuardPaymentExtraType[] = [
  "Feriado 1/2 dia",
  "Feriado dia inteiro",
  "Plantão especial 1/2 dia",
  "Plantão especial dia inteiro",
  "Evento especial 1/2 dia",
  "Evento especial dia inteiro",
  "Outro",
];

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
  { id: "estacionamento-consulta", label: "Estacionamento - consulta" },
  { id: "estacionamento-cadastro", label: "Estacionamento - cadastro" },
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
    permissions: ["seguranca", "guardas", "estacionamento-consulta"],
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
    permissions: ["seguranca", "guardas", "estacionamento-consulta"],
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
  const [managedUsersSync, setManagedUsersSync] = useState<ManagedUsersSyncState>({
    source: "local",
    message: "Usando usuários locais neste aparelho.",
    loading: false,
    syncing: false,
    remoteProtected: false,
  });
  const [inventoryProducts, setInventoryProducts] = useState<InventoryProduct[]>(() => getStoredLocalInventoryProducts());
  const [stockMovements, setStockMovements] = useState<StockMovement[]>(() => getStoredLocalStockMovements());
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
  const [barcodeProductId, setBarcodeProductId] = useState(() => getStoredLocalInventoryProducts()[0]?.id ?? "");
  const [productRegisterMode, setProductRegisterMode] = useState<ProductRegisterMode>("edit");
  const [productName, setProductName] = useState(() => getStoredLocalInventoryProducts()[0]?.name ?? "");
  const [productUnit, setProductUnit] = useState(() => getStoredLocalInventoryProducts()[0]?.unit ?? DEFAULT_PRODUCT_UNIT);
  const [productCurrentStock, setProductCurrentStock] = useState("0");
  const [productMinStock, setProductMinStock] = useState("0");
  const [barcodeValue, setBarcodeValue] = useState("");
  const [productPhotoData, setProductPhotoData] = useState("");
  const [productSaving, setProductSaving] = useState(false);
  const [barcodeMessage, setBarcodeMessage] = useState("");
  const [productRegisterBackView, setProductRegisterBackView] = useState<View>("cleaning-dashboard");
  const [notice, setNotice] = useState("");
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<OrderItem[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<CleaningOrder | null>(null);
  const [cleaningPrepOpen, setCleaningPrepOpen] = useState(false);
  const [cleaningPrepRunning, setCleaningPrepRunning] = useState(false);
  const [offlinePendingCount, setOfflinePendingCount] = useState(() => getCleaningOfflineQueueSummary().total);
  const [offlineSyncing, setOfflineSyncing] = useState(false);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [stockCheckSubmitting, setStockCheckSubmitting] = useState(false);
  const [stockExitSubmitting, setStockExitSubmitting] = useState(false);
  const cleaningSubmitLocks = useRef({ order: false, stockCheck: false, stockExit: false });

  const onlineEnabled = isCloudStorageEnabled();

  useEffect(() => {
    document.title = `${BRAND} - Central Operacional HUB SM`;
    void refreshOrders();
    void refreshProfiles();
    void refreshInventory();
    void refreshStockMovements();
    void refreshManagedUsersFromCloud({ showNotice: false });
    refreshOfflinePendingCount();
    void syncOfflinePendencies();

    const interval = window.setInterval(() => {
      if (isCloudStorageEnabled()) {
        void syncOfflinePendencies();
        void refreshOrders();
      }
    }, 30000);

    const handleOnline = () => {
      void syncOfflinePendencies();
    };
    window.addEventListener("online", handleOnline);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", handleOnline);
    };
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

  function hasAnyCurrentPermission(permissions: UserPermission[]) {
    return permissions.some((permission) => hasCurrentPermission(permission));
  }

  async function refreshOrders() {
    const currentOrders = await getOrders();
    setOrders(currentOrders);
  }

  async function refreshProfiles() {
    const currentProfiles = await getEmployeeProfiles();
    setProfiles(currentProfiles);
  }

  async function refreshInventory() {
    const currentProducts = await getStoredInventoryProducts();
    setInventoryProducts(currentProducts);
    return currentProducts;
  }

  async function refreshStockMovements() {
    const currentMovements = await getStoredStockMovements();
    setStockMovements(currentMovements);
    return currentMovements;
  }

  async function refreshManagedUsersFromCloud({ showNotice = true } = {}) {
    setManagedUsersSync((current) => ({ ...current, loading: true }));

    try {
      const remoteUsers = await loadManagedUsersRemote();
      const nextUsers = mergeManagedUserSources(remoteUsers, getLocalManagedUsers());
      saveLocalManagedUsers(nextUsers);
      setManagedUsers(nextUsers);
      const message = "Usuários sincronizados com Supabase.";
      setManagedUsersSync({
        source: "supabase",
        message,
        loading: false,
        syncing: false,
        remoteProtected: false,
        lastSyncedAt: new Date().toISOString(),
      });
      if (showNotice) setNotice(message);
      return nextUsers;
    } catch (error) {
      const fallbackUsers = getLocalManagedUsers();
      setManagedUsers(fallbackUsers);
      const remoteProtected = isManagedUsersRemoteProtectedError(error);
      const message = remoteProtected
        ? "Usuários protegidos por RLS. Faça login como Admin com sessão Supabase autorizada."
        : "Usando usuários locais neste aparelho.";
      setManagedUsersSync((current) => ({
        ...current,
        source: "local",
        message,
        loading: false,
        syncing: false,
        remoteProtected,
      }));
      if (showNotice) setNotice(message);
      return fallbackUsers;
    }
  }

  async function syncManagedUsersToCloud() {
    setManagedUsersSync((current) => ({ ...current, syncing: true }));
    setNotice("Sincronizando usuários deste aparelho...");

    try {
      const remoteUsers = await syncLocalManagedUsersToCloud(managedUsers);
      const nextUsers = mergeManagedUserSources(remoteUsers, getLocalManagedUsers());
      saveLocalManagedUsers(nextUsers);
      setManagedUsers(nextUsers);
      const message = "Usuários deste aparelho sincronizados com Supabase.";
      setManagedUsersSync({
        source: "supabase",
        message: "Usuários sincronizados com Supabase.",
        loading: false,
        syncing: false,
        remoteProtected: false,
        lastSyncedAt: new Date().toISOString(),
      });
      setNotice(message);
    } catch (error) {
      const remoteProtected = isManagedUsersRemoteProtectedError(error);
      const message = remoteProtected
        ? "Não foi possível sincronizar: acesso protegido por RLS."
        : "Não foi possível sincronizar agora. Usuários continuam salvos neste aparelho.";
      setManagedUsersSync((current) => ({
        ...current,
        source: "local",
        message: remoteProtected ? "Usuários protegidos por RLS." : "Usando usuários locais neste aparelho.",
        loading: false,
        syncing: false,
        remoteProtected,
      }));
      setNotice(message);
    }
  }

  function refreshOfflinePendingCount() {
    const summary = getCleaningOfflineQueueSummary();
    setOfflinePendingCount(summary.total);
    return summary;
  }

  async function syncOfflinePendencies() {
    const currentSummary = refreshOfflinePendingCount();
    if (currentSummary.total === 0 || !isCloudStorageEnabled()) return currentSummary;

    setOfflineSyncing(true);
    setNotice("Sincronizando pendências...");

    try {
      const result = await syncCleaningOfflineQueue();
      const nextSummary = refreshOfflinePendingCount();
      if (result.synced > 0 && result.remaining === 0) {
        setNotice("Pendências sincronizadas com sucesso.");
        await Promise.all([refreshOrders(), refreshInventory(), refreshStockMovements()]);
      } else if (result.remaining > 0) {
        setNotice("Existem pendências salvas neste aparelho aguardando internet.");
      }
      return nextSummary;
    } catch {
      refreshOfflinePendingCount();
      setNotice("Existem pendências salvas neste aparelho aguardando internet.");
      return getCleaningOfflineQueueSummary();
    } finally {
      setOfflineSyncing(false);
    }
  }

  function goToLogin() {
    void signOutSupabaseAuth();
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

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanPassword = password.trim();
    let user = findManagedUserByAccessCode(cleanPassword, managedUsers);
    let loginNotice = "";

    if (cleanPassword && (!user || !user.system)) {
      try {
        const remoteUser = await loginManagedUserRemoteByAccessCode(cleanPassword);

        if (remoteUser) {
          const normalizedRemoteUser = normalizeManagedUser(remoteUser);
          const nextUsers = upsertManagedUser(managedUsers, normalizedRemoteUser);
          saveLocalManagedUsers(nextUsers);
          setManagedUsers(nextUsers);
          setManagedUsersSync({
            source: "supabase",
            message: "Usuários sincronizados com Supabase.",
            loading: false,
            syncing: false,
            remoteProtected: false,
            lastSyncedAt: new Date().toISOString(),
          });
          user = normalizedRemoteUser;
          loginNotice = "Usuário sincronizado. Entrando...";
        } else if (!user || !user.system) {
          setLoginError("Senha incorreta");
          return;
        }
      } catch (error) {
        if (!user) {
          setLoginError(getManagedUserRemoteLoginErrorMessage(error));
          return;
        }
      }
    }

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

    if (user.linkedGuardId) {
      await signInGuardSupabaseAuth(user.linkedGuardId, cleanPassword);
    } else if (user.id === "tezzei") {
      await signInAdminSupabaseAuth(cleanPassword);
      void refreshManagedUsersFromCloud({ showNotice: false });
    } else {
      void signOutSupabaseAuth();
    }

    setCurrentUser(user.id);
    setPreviewEmployeeId(null);
    setSelectedGuardName(user.linkedGuardId ? guardUserMap[user.linkedGuardId] : null);
    setLoginError("");
    setNotice(loginNotice);
    void refreshOrders();
    void refreshProfiles();
    void refreshInventory();
    void refreshStockMovements();
    void syncOfflinePendencies();
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
    if (cleaningSubmitLocks.current.order) return;

    const selectedProducts = inventoryProducts
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

    cleaningSubmitLocks.current.order = true;
    setOrderSubmitting(true);

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
      const result = await addOrder(order);
      refreshOfflinePendingCount();
      if (result.synced) await refreshOrders();
      setQuantities({});
      setManualItems([]);
      setManualDraft(emptyManualDraft);
      setManualOpen(false);
      setNotice(result.synced ? "Pedido enviado para Tezzei." : "Pedido salvo neste aparelho. Pendente de sincronização.");
      setView(getAfterCleaningActionView());
    } catch {
      await refreshOrders();
      refreshOfflinePendingCount();
      setNotice("Pedido salvo neste aparelho. Pendente de sincronização.");
      setView(getAfterCleaningActionView());
    } finally {
      cleaningSubmitLocks.current.order = false;
      setOrderSubmitting(false);
    }
  }

  async function sendStockCheck() {
    if (cleaningSubmitLocks.current.stockCheck) return;

    const items = inventoryProducts
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

    cleaningSubmitLocks.current.stockCheck = true;
    setStockCheckSubmitting(true);

    const now = new Date();
    const check: StockCheck = {
      id: createId(),
      data: now.toLocaleDateString("pt-BR"),
      hora: now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      conferente: "Neia",
      itens: items,
    };

    try {
      const result = await addStockCheck(check);
      refreshOfflinePendingCount();
      setStockQuantities({});
      setStockObservations({});
      setNotice(result.synced ? "Conferência de estoque enviada para Tezzei." : "Conferência salva neste aparelho. Pendente de sincronização.");
      setView(getAfterCleaningActionView());
    } catch {
      refreshOfflinePendingCount();
      setNotice("Conferência salva neste aparelho. Pendente de sincronização.");
      setView(getAfterCleaningActionView());
    } finally {
      cleaningSubmitLocks.current.stockCheck = false;
      setStockCheckSubmitting(false);
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
    void refreshInventory();
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

  async function confirmStockExit() {
    if (cleaningSubmitLocks.current.stockExit) return;

    if (!selectedExitProduct) {
      setStockExitMessage("Bipe ou selecione um produto antes de confirmar.");
      return;
    }

    const quantity = Number(stockExitQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setStockExitMessage("Informe uma quantidade maior que zero.");
      return;
    }

    cleaningSubmitLocks.current.stockExit = true;
    setStockExitSubmitting(true);

    try {
      const result = await registerStockExit({ product: selectedExitProduct, quantity, userId: stockExitUserId, userName: getStockExitUserName(stockExitUserId, managedUsers), observation: stockExitObservation, operationId: createId() });
      refreshOfflinePendingCount();
      if (result.synced) await Promise.all([refreshInventory(), refreshStockMovements()]);
      setStockExitBarcode("");
      setStockExitProductId("");
      setStockExitQuantity("1");
      setStockExitObservation("");
      setStockExitMessage(result.synced ? "Saída registrada com sucesso." : "Saída salva neste aparelho. Pendente de sincronização.");
    } catch {
      await Promise.all([refreshInventory(), refreshStockMovements()]);
      refreshOfflinePendingCount();
      setStockExitMessage("Saída salva neste aparelho. Pendente de sincronização.");
    } finally {
      cleaningSubmitLocks.current.stockExit = false;
      setStockExitSubmitting(false);
    }
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

  async function openProductRegister() {
    const currentProducts = await refreshInventory();
    const currentProduct = currentProducts.find((product) => product.id === barcodeProductId) ?? currentProducts[0];
    if (currentProduct) {
      setProductRegisterMode("edit");
      setBarcodeProductId(currentProduct.id);
      fillProductRegisterFields(currentProduct);
    }
    setProductRegisterBackView("cleaning-dashboard");
    setBarcodeMessage("");
    setView("product-register");
  }

  function openProductRegisterFromStock(productId: string) {
    const currentProduct = inventoryProducts.find((product) => product.id === productId);
    if (!currentProduct) return;
    setProductRegisterMode("edit");
    setBarcodeProductId(currentProduct.id);
    fillProductRegisterFields(currentProduct);
    setProductRegisterBackView("current-stock");
    setBarcodeMessage("");
    setView("product-register");
  }

  function backFromProductRegister() {
    if (productRegisterBackView === "current-stock") {
      void refreshInventory();
    }
    setView(productRegisterBackView);
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
      const product = await prepareProductDetails({
        mode: productRegisterMode,
        productId: barcodeProductId,
        name: nextProductName,
        unit: productUnit,
        currentStock: nextCurrentStock,
        minStock: nextMinStock,
        barcode: barcodeValue.trim(),
        photoData: productPhotoData,
      }, inventoryProducts);
      const result = await saveInventoryProductDetails({ mode: productRegisterMode, product });
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
      refreshOfflinePendingCount();
      setNotice("Pedido atualizado neste aparelho. Pendente de sincronização.");
    }
  }

  async function markOrderDone(order: CleaningOrder) {
    try {
      await updateStoredOrder({ ...order, status: "Pedido feito" });
      await refreshOrders();
      setNotice("Pedido marcado como feito.");
    } catch {
      await refreshOrders();
      refreshOfflinePendingCount();
      setNotice("Pedido marcado neste aparelho. Pendente de sincronização.");
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
      refreshOfflinePendingCount();
      setNotice("Pedido excluído neste aparelho. Pendente de sincronização.");
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
    if (!hasCurrentPermission("painel-admin")) {
      setNotice("Você não tem acesso a este módulo.");
      return;
    }

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
    void refreshInventory();
    void refreshStockMovements();
    setView("cleaning-dashboard");
  }

  function openSecurityMenu() {
    if (!hasAnyCurrentPermission(["seguranca", "guardas", "estacionamento-consulta", "estacionamento-cadastro"])) {
      setNotice("Sem permissão para acessar Segurança.");
      return;
    }

    setNotice("");
    setSelectedGuardName(null);
    setView("security-menu");
  }

  function openCopaCafeMenu() {
    if (!hasAnyCurrentPermission(["cafe", "agua"])) {
      setNotice("Sem permissão para acessar Copa & Café.");
      return;
    }

    setNotice("");
    setSelectedGuardName(null);
    setView("copa-cafe-menu");
  }

  function openMaintenanceMenu() {
    if (!hasCurrentPermission("manutencao")) {
      setNotice("Sem permissão para acessar Manutenção.");
      return;
    }

    setNotice("");
    setSelectedGuardName(null);
    setView("maintenance-menu");
  }

  function openGeneralStockMenu() {
    if (!hasCurrentPermission("estoque")) {
      setNotice("Sem permissão para acessar Estoque Geral.");
      return;
    }

    setNotice("");
    setSelectedGuardName(null);
    setView("general-stock-menu");
  }

  function openPatrimonyMenu() {
    if (!hasAnyCurrentPermission(["patrimonio", "chaves"])) {
      setNotice("Sem permissão para acessar Patrimônio.");
      return;
    }

    setNotice("");
    setSelectedGuardName(null);
    setView("patrimony-menu");
  }

  function openReportsMenu() {
    if (!hasCurrentPermission("relatorios")) {
      setNotice("Sem permissão para acessar Relatórios.");
      return;
    }

    setNotice("");
    setSelectedGuardName(null);
    setView("reports-menu");
  }

  function openSecurityGuards() {
    if (!hasCurrentPermission("guardas")) {
      setNotice("Sem permissão para acessar Guardas.");
      return;
    }

    setNotice("");
    setSelectedGuardName(null);
    if (isGuardId(currentUser)) {
      setView("guard");
      return;
    }

    setView("security-guards");
  }

  function openSecurityMonitoring() {
    if (currentUser !== "tezzei" || !hasCurrentPermission("painel-admin")) {
      setNotice("Sem permissão para acessar Monitoramento.");
      return;
    }

    setNotice("");
    setSelectedGuardName(null);
    setView("security-monitoring");
  }

  function openSecurityParking() {
    if (!hasAnyCurrentPermission(["painel-admin", "estacionamento-consulta", "estacionamento-cadastro"])) {
      setNotice("Sem permissão para acessar Estacionamento.");
      return;
    }

    setNotice("");
    setSelectedGuardName(null);
    setView("security-parking");
  }

  function openGuardPaymentReport() {
    if (currentUser !== "tezzei" || !hasCurrentPermission("painel-admin")) {
      setNotice("Sem permissão para acessar Fechamento / Pagamento.");
      return;
    }

    setNotice("");
    setSelectedGuardName(null);
    setView("security-guards-payment");
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
    void refreshManagedUsersFromCloud({ showNotice: false });
  }

  function openSystemStatus() {
    if (currentUser !== "tezzei" || !hasCurrentPermission("painel-admin")) {
      setNotice("Você não tem acesso a este módulo.");
      return;
    }

    setNotice("");
    setSelectedGuardName(null);
    setView("system-status");
  }

  function openCleaningPreparation() {
    if (currentUser !== "tezzei" || !hasCurrentPermission("painel-admin")) {
      setNotice("Somente o Admin Tezzei pode preparar a Limpeza para uso real.");
      return;
    }

    setNotice("");
    setCleaningPrepOpen(true);
  }

  async function confirmCleaningPreparation() {
    if (cleaningPrepRunning) return;
    setCleaningPrepRunning(true);

    try {
      const result = await prepareCleaningForRealUse();
      await Promise.all([refreshOrders(), refreshInventory(), refreshStockMovements()]);
      const remoteMessage = result.cloud ? "Supabase limpo com seguranca." : "Supabase nao configurado; limpeza local aplicada.";
      setHistoryOrders([]);
      setNotice(`${remoteMessage} Historicos de teste da Limpeza foram zerados.`);
      setCleaningPrepOpen(false);
    } catch {
      setNotice("Nao foi possivel preparar a Limpeza. Verifique a conexao e tente novamente.");
    } finally {
      setCleaningPrepRunning(false);
    }
  }

  async function saveManagedUser(user: ManagedUser) {
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
      permissions: getNormalizedManagedUserPermissions(user, user.permissions),
      createdAt: previousUser?.createdAt ?? user.createdAt ?? now,
      updatedAt: now,
    };
    try {
      const remoteUser = await saveManagedUserRemote(normalizedUser);
      const nextUsers = upsertManagedUser(managedUsers, normalizeManagedUser(remoteUser));
      saveLocalManagedUsers(nextUsers);
      setManagedUsers(nextUsers);
      setManagedUsersSync({
        source: "supabase",
        message: "Usuários sincronizados com Supabase.",
        loading: false,
        syncing: false,
        remoteProtected: false,
        lastSyncedAt: new Date().toISOString(),
      });
      setNotice("Usuário salvo e sincronizado.");
      return true;
    } catch (error) {
      const nextUsers = upsertManagedUser(managedUsers, normalizedUser);
      saveLocalManagedUsers(nextUsers);
      setManagedUsers(nextUsers);
      const remoteProtected = isManagedUsersRemoteProtectedError(error);
      setManagedUsersSync((current) => ({
        ...current,
        source: "local",
        message: remoteProtected ? "Usuários protegidos por RLS." : "Usando usuários locais neste aparelho.",
        loading: false,
        syncing: false,
        remoteProtected,
      }));
      setNotice(remoteProtected ? "Usuário salvo neste aparelho. Supabase protegido por RLS." : "Usuário salvo neste aparelho. Sincronize quando o Supabase estiver disponível.");
      return true;
    }
  }

  async function deleteManagedUser(userId: string) {
    const user = managedUsers.find((current) => current.id === userId);
    if (!user) return;
    if (user.system || user.protected) {
      setNotice("Usuário do sistema não pode ser apagado.");
      return;
    }

    const nextUsers = managedUsers.filter((current) => current.id !== userId);
    try {
      await deleteManagedUserRemote(userId);
      saveLocalManagedUsers(nextUsers);
      setManagedUsers(nextUsers);
      setManagedUsersSync({
        source: "supabase",
        message: "Usuários sincronizados com Supabase.",
        loading: false,
        syncing: false,
        remoteProtected: false,
        lastSyncedAt: new Date().toISOString(),
      });
      setNotice("Usuário apagado e sincronizado.");
    } catch (error) {
      saveLocalManagedUsers(nextUsers);
      setManagedUsers(nextUsers);
      const remoteProtected = isManagedUsersRemoteProtectedError(error);
      setManagedUsersSync((current) => ({
        ...current,
        source: "local",
        message: remoteProtected ? "Usuários protegidos por RLS." : "Usando usuários locais neste aparelho.",
        loading: false,
        syncing: false,
        remoteProtected,
      }));
      setNotice(remoteProtected ? "Usuário apagado neste aparelho. Supabase protegido por RLS." : "Usuário apagado neste aparelho. Sincronize quando o Supabase estiver disponível.");
    }
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
        <GuardUserScreen guardLocalId={currentUser} guardName={guardUserMap[currentUser]} permissions={getManagedUserPermissions(currentUser, managedUsers)} onOpenParking={openSecurityParking} onLogout={goToLogin} />
      )}

      {view === "user-home" && currentManagedUser && (
        <UserSectorHomeScreen
          user={currentManagedUser}
          notice={notice}
          permissions={getManagedUserPermissions(currentUser, managedUsers)}
          onLogout={goToLogin}
          onOpenCleaningDashboard={openCleaningDashboard}
          onOpenStockExit={() => openStockExit()}
          onOpenCopaCafe={openCopaCafeMenu}
          onOpenMaintenance={openMaintenanceMenu}
          onOpenGeneralStock={openGeneralStockMenu}
          onOpenPatrimony={openPatrimonyMenu}
          onOpenReports={openReportsMenu}
          onOpenSecurity={openSecurityMenu}
        />
      )}

      {(view === "employee" || view === "employee-preview") && activeEmployeeId && (
        <EmployeeScreen
          employeeId={activeEmployeeId}
          profile={profiles[activeEmployeeId]}
          notice={notice}
          offlinePendingCount={offlinePendingCount}
          offlineSyncing={offlineSyncing}
          adminPreview={view === "employee-preview"}
          onLogout={goToLogin}
          onBackToProfiles={() => setView("profiles")}
          onSyncOffline={() => { void syncOfflinePendencies(); }}
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
          products={inventoryProducts}
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
          sending={orderSubmitting}
        />
      )}

      {view === "stock-check" && (
        <StockCheckScreen
          products={inventoryProducts}
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
          sending={stockCheckSubmitting}
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
          saving={stockExitSubmitting}
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
          backLabel={productRegisterBackView === "current-stock" ? "Voltar para Estoque Atual" : "Voltar para Limpeza"}
          onBack={backFromProductRegister}
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
      {view === "current-stock" && <CurrentStockScreen inventoryProducts={inventoryProducts} onBack={() => setView("cleaning-dashboard")} onLogout={goToLogin} onEditProduct={openProductRegisterFromStock} />}

      {view === "admin" && (
        <AdminSectorHomeScreen
          newOrdersCount={newOrders.length}
          onlineEnabled={onlineEnabled}
          permissions={getManagedUserPermissions(currentUser, managedUsers)}
          onLogout={goToLogin}
          onOpenCleaningDashboard={openCleaningDashboard}
          onOpenCopaCafe={openCopaCafeMenu}
          onOpenSecurity={openSecurityMenu}
          onOpenMaintenance={openMaintenanceMenu}
          onOpenGeneralStock={openGeneralStockMenu}
          onOpenPatrimony={openPatrimonyMenu}
          onOpenReports={openReportsMenu}
          onOpenUsersPermissions={openUsersPermissions}
          onOpenSystemStatus={openSystemStatus}
        />
      )}

      {view === "copa-cafe-menu" && <CopaCafeMenuScreen permissions={getManagedUserPermissions(currentUser, managedUsers)} onBack={() => setView(getCurrentHomeView())} onLogout={goToLogin} />}

      {view === "maintenance-menu" && <MaintenanceMenuScreen permissions={getManagedUserPermissions(currentUser, managedUsers)} onBack={() => setView(getCurrentHomeView())} onLogout={goToLogin} />}

      {view === "general-stock-menu" && <GeneralStockMenuScreen permissions={getManagedUserPermissions(currentUser, managedUsers)} onBack={() => setView(getCurrentHomeView())} onLogout={goToLogin} />}

      {view === "patrimony-menu" && <PatrimonyMenuScreen permissions={getManagedUserPermissions(currentUser, managedUsers)} onBack={() => setView(getCurrentHomeView())} onLogout={goToLogin} />}

      {view === "reports-menu" && <ReportsMenuScreen permissions={getManagedUserPermissions(currentUser, managedUsers)} onBack={() => setView(getCurrentHomeView())} onLogout={goToLogin} />}

      {view === "users-permissions" && (
        hasCurrentPermission("painel-admin") ? (
        <UsersPermissionsScreen
          users={managedUsers}
          syncState={managedUsersSync}
          notice={notice}
          onBack={() => setView(getCurrentHomeView())}
          onLogout={goToLogin}
          onSaveUser={saveManagedUser}
          onDeleteUser={deleteManagedUser}
          onSyncLocalUsers={syncManagedUsersToCloud}
        />
        ) : (
          <AccessDeniedScreen onBack={() => setView(getCurrentHomeView())} onLogout={goToLogin} />
        )
      )}

      {view === "system-status" && (
        currentUser === "tezzei" && hasCurrentPermission("painel-admin") ? (
          <SystemStatusScreen
            permissions={getManagedUserPermissions(currentUser, managedUsers)}
            users={managedUsers}
            onBack={() => setView("admin")}
            onLogout={goToLogin}
          />
        ) : (
          <AccessDeniedScreen onBack={() => setView(getCurrentHomeView())} onLogout={goToLogin} />
        )
      )}

      {view === "security-menu" && <SecurityMenuScreen permissions={getManagedUserPermissions(currentUser, managedUsers)} isAdmin={currentUser === "tezzei"} onBack={() => setView(getCurrentHomeView())} onLogout={goToLogin} onOpenGuards={openSecurityGuards} onOpenMonitoring={openSecurityMonitoring} onOpenParking={openSecurityParking} />}

      {view === "security-guards" && (
        hasCurrentPermission("guardas") ? (
          <SecurityGuardsScreen isAdmin={currentUser === "tezzei"} onBack={openSecurityMenu} onLogout={goToLogin} onOpenGuard={openGuardDetail} onOpenPayment={openGuardPaymentReport} showPayment={currentUser === "tezzei"} />
        ) : (
          <AccessDeniedScreen onBack={() => setView(getCurrentHomeView())} onLogout={goToLogin} />
        )
      )}

      {view === "security-guards-payment" && (
        currentUser === "tezzei" && hasCurrentPermission("painel-admin") ? (
          <SecurityGuardsPaymentScreen onBack={openSecurityGuards} onLogout={goToLogin} />
        ) : (
          <AccessDeniedScreen onBack={() => setView(getCurrentHomeView())} onLogout={goToLogin} />
        )
      )}

      {view === "security-monitoring" && (
        currentUser === "tezzei" && hasCurrentPermission("painel-admin") ? (
          <SecurityMonitoringScreen onBack={openSecurityMenu} onLogout={goToLogin} />
        ) : (
          <AccessDeniedScreen onBack={() => setView(getCurrentHomeView())} onLogout={goToLogin} />
        )
      )}

      {view === "security-parking" && (
        hasAnyCurrentPermission(["painel-admin", "estacionamento-consulta", "estacionamento-cadastro"]) ? (
          <SecurityParkingScreen permissions={getManagedUserPermissions(currentUser, managedUsers)} isAdmin={currentUser === "tezzei"} onBack={() => setView(isGuardId(currentUser) ? "guard" : "security-menu")} onLogout={goToLogin} />
        ) : (
          <AccessDeniedScreen onBack={() => setView(getCurrentHomeView())} onLogout={goToLogin} />
        )
      )}

      {view === "security-guard-detail" && (
        selectedGuardName && hasCurrentPermission("guardas") ? (
          <SecurityGuardDetailScreen guardLocalId={getGuardIdFromName(selectedGuardName)} guardName={selectedGuardName} onBack={openSecurityGuards} onLogout={goToLogin} />
        ) : (
          <AccessDeniedScreen onBack={() => setView(getCurrentHomeView())} onLogout={goToLogin} />
        )
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
            void openProductRegister();
          }}
          onOpenCurrentStock={() => {
            void refreshInventory();
            setView("current-stock");
          }}
          onOpenStockHistory={() => {
            void refreshStockMovements();
            setView("stock-exit-history");
          }}
          onOpenProfiles={openProfiles}
          onOpenOrderHistory={openOrderHistory}
          onOpenNeiaHistory={openNeiaHistory}
          onPrepareCleaning={openCleaningPreparation}
          offlinePendingCount={offlinePendingCount}
          offlineSyncing={offlineSyncing}
          onSyncOffline={() => { void syncOfflinePendencies(); }}
        />
      )}

      {view === "profiles" && (
        hasCurrentPermission("painel-admin") ? (
        <ProfilesScreen profiles={profiles} notice={notice} onBack={() => setView("cleaning-dashboard")} onLogout={goToLogin} onPreviewEmployee={previewEmployee} onProfilePhotoChange={handlePhotoChange} />
        ) : (
          <AccessDeniedScreen onBack={() => setView(getCurrentHomeView())} onLogout={goToLogin} />
        )
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
      {cleaningPrepOpen && <CleaningPrepDialog running={cleaningPrepRunning} onCancel={() => setCleaningPrepOpen(false)} onConfirm={confirmCleaningPreparation} />}

      <footer>{FOOTER}</footer>
    </main>
  );
}

function LoginScreen({ password, loginError, onPasswordChange, onSubmit }: { password: string; loginError: string; onPasswordChange: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void> }) {
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

function EmployeeScreen({ employeeId, profile, notice, offlinePendingCount, offlineSyncing, adminPreview, onLogout, onBackToProfiles, onSyncOffline, onNewOrder, onStockCheck, onStockExit, onOpenHistory, onProfilePhotoChange }: { employeeId: EmployeeId; profile: EmployeeProfile; notice: string; offlinePendingCount: number; offlineSyncing: boolean; adminPreview: boolean; onLogout: () => void; onBackToProfiles: () => void; onSyncOffline: () => void; onNewOrder: () => void; onStockCheck: () => void; onStockExit: () => void; onOpenHistory: () => void; onProfilePhotoChange: (employeeId: EmployeeId, file: File | null) => void }) {
  const employee = employees[employeeId];
  const employeeActivities = activities.filter((activity) => activity.employeeId === employeeId);
  return (
    <section className="screen">
      <EmployeeHeader employeeId={employeeId} profile={profile} adminPreview={adminPreview} onLogout={onLogout} onBackToProfiles={onBackToProfiles} onProfilePhotoChange={onProfilePhotoChange} />
      {notice && <p className="success-message">{notice}</p>}
      <OfflinePendingNotice count={offlinePendingCount} syncing={offlineSyncing} onSync={onSyncOffline} />
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

function OrderFormScreen({ products, quantities, manualOpen, manualDraft, manualItems, notice, sending, onBack, onLogout, onQuantityChange, onManualOpenChange, onManualDraftChange, onAddManualItem, onRemoveManualItem, onSendOrder }: { products: InventoryProduct[]; quantities: Record<string, string>; manualOpen: boolean; manualDraft: ManualDraft; manualItems: OrderItem[]; notice: string; sending: boolean; onBack: () => void; onLogout: () => void; onQuantityChange: (productId: string, value: string) => void; onManualOpenChange: (value: boolean) => void; onManualDraftChange: (draft: ManualDraft) => void; onAddManualItem: () => void; onRemoveManualItem: (itemId: string) => void; onSendOrder: () => void }) {
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
      <button className="primary-button wide-button sticky-action" type="button" disabled={sending} onClick={onSendOrder}>{sending ? "Salvando..." : "Enviar Pedido"}</button>
    </section>
  );
}

function StockCheckScreen({ products, quantities, observations, notice, sending, onBack, onLogout, onQuantityChange, onObservationChange, onSendStockCheck }: { products: InventoryProduct[]; quantities: Record<string, string>; observations: Record<string, string>; notice: string; sending: boolean; onBack: () => void; onLogout: () => void; onQuantityChange: (productId: string, value: string) => void; onObservationChange: (productId: string, value: string) => void; onSendStockCheck: () => void }) {
  return (
    <section className="screen"><TopBar title="Conferência de Estoque" subtitle="Solicitante: Neia" onLogout={onLogout} /><button className="ghost-button" type="button" onClick={onBack}>Voltar</button>{notice && <p className="notice-message">{notice}</p>}<section className="product-list">{products.map((product) => <label className="product-row stock-row" key={product.id}><span><strong>{product.name}</strong><small>{product.unit}</small></span><input type="number" inputMode="decimal" min="0" placeholder="Qtd" value={quantities[product.id] ?? ""} onChange={(event) => onQuantityChange(product.id, event.target.value)} /><input type="text" placeholder="Obs." value={observations[product.id] ?? ""} onChange={(event) => onObservationChange(product.id, event.target.value)} /></label>)}</section><button className="primary-button wide-button sticky-action" type="button" disabled={sending} onClick={onSendStockCheck}>{sending ? "Salvando..." : "Enviar Conferência"}</button></section>
  );
}

function StockExitScreen({ inventoryProducts, selectedProduct, userId, barcode, quantity, observation, message, saving, adminMode, onBack, onLogout, onUserChange, onBarcodeChange, onFileChange, onProductChange, onQuantityChange, onObservationChange, onConfirm }: { inventoryProducts: InventoryProduct[]; selectedProduct: InventoryProduct | null; userId: StockExitUserId; barcode: string; quantity: string; observation: string; message: string; saving: boolean; adminMode: boolean; onBack: () => void; onLogout: () => void; onUserChange: (userId: StockExitUserId) => void; onBarcodeChange: (barcode: string) => void; onFileChange: (file: File | null) => void; onProductChange: (productId: string) => void; onQuantityChange: (quantity: string) => void; onObservationChange: (observation: string) => void; onConfirm: () => void }) {
  return (
    <section className="screen"><TopBar title="Saída de Produto" subtitle="Bipe o código de barras e confirme a retirada" onLogout={onLogout} /><button className="ghost-button" type="button" onClick={onBack}><AppIcon name="back" size="sm" className="action-icon" />Voltar</button>{message && <p className="notice-message">{message}</p>}<section className="manual-form inventory-form">{adminMode && <label>Quem retirou<select value={userId} onChange={(event) => onUserChange(event.target.value as StockExitUserId)}>{employeeIds.map((employeeId) => <option key={employeeId} value={employeeId}>{employees[employeeId].name}</option>)}<option value="Sergio Tezzei">Sergio Tezzei</option></select></label>}<label className="scan-button"><AppIcon name="camera" size="sm" className="action-icon" />Abrir câmera / bipar código<input type="file" accept="image/*" capture="environment" onChange={(event) => { onFileChange(event.target.files?.[0] ?? null); event.target.value = ""; }} /></label><label>Código de barras<input type="text" inputMode="numeric" value={barcode} placeholder="Bipe ou digite o código" onChange={(event) => onBarcodeChange(event.target.value)} /></label><label>Produto encontrado / ajuste manual<select value={selectedProduct?.id ?? ""} onChange={(event) => onProductChange(event.target.value)}><option value="">Selecione o produto</option>{inventoryProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>{selectedProduct && <article className="inventory-found-card"><span>Produto</span><strong>{selectedProduct.name}</strong><small>Estoque atual: {formatStockQuantity(selectedProduct.currentStock, selectedProduct.unit)}</small></article>}<label>Quantidade retirada<input type="number" inputMode="decimal" min="0" value={quantity} onChange={(event) => onQuantityChange(event.target.value)} /></label><label>Observação opcional<textarea rows={3} value={observation} onChange={(event) => onObservationChange(event.target.value)} /></label><button className="primary-button wide-button" type="button" disabled={saving} onClick={onConfirm}><AppIcon name="save" size="sm" className="action-icon" />{saving ? "Salvando..." : "Confirmar saída"}</button></section></section>
  );
}

function ProductRegisterScreen({ inventoryProducts, selectedProduct, mode, productId, productName, unit, currentStock, minStock, barcode, photoData, message, saving, unitOptions, backLabel, onBack, onLogout, onCreateNew, onCancelCreate, onProductChange, onProductNameChange, onUnitChange, onCurrentStockChange, onMinStockChange, onBarcodeChange, onBarcodeFileChange, onPhotoFileChange, onRemovePhoto, onSave }: { inventoryProducts: InventoryProduct[]; selectedProduct: InventoryProduct | null; mode: ProductRegisterMode; productId: string; productName: string; unit: string; currentStock: string; minStock: string; barcode: string; photoData: string; message: string; saving: boolean; unitOptions: string[]; backLabel: string; onBack: () => void; onLogout: () => void; onCreateNew: () => void; onCancelCreate: () => void; onProductChange: (productId: string) => void; onProductNameChange: (name: string) => void; onUnitChange: (unit: string) => void; onCurrentStockChange: (stock: string) => void; onMinStockChange: (stock: string) => void; onBarcodeChange: (barcode: string) => void; onBarcodeFileChange: (file: File | null) => void; onPhotoFileChange: (file: File | null) => void; onRemovePhoto: () => void; onSave: () => void | Promise<void> }) {
  const displayName = productName.trim() || selectedProduct?.name || "Novo produto";
  const stockPreview = parseProductQuantity(currentStock) ?? 0;
  const unitPreview = unit || DEFAULT_PRODUCT_UNIT;

  return (
    <section className="screen">
      <TopBar title="Cadastro de Produtos" subtitle="Edite código de barras e foto do produto" onLogout={onLogout} />
      <button className="ghost-button" type="button" onClick={onBack} disabled={saving}>{backLabel}</button>
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
          <AppIcon name="camera" size="sm" className="action-icon" />Abrir câmera / ler código
          <input type="file" accept="image/*" capture="environment" disabled={saving} onChange={(event) => { onBarcodeFileChange(event.target.files?.[0] ?? null); event.target.value = ""; }} />
        </label>
        <label>
          Código de barras
          <input type="text" inputMode="numeric" value={barcode} placeholder="Bipe ou digite o código" disabled={saving} onChange={(event) => onBarcodeChange(event.target.value)} />
        </label>
        <button className="primary-button wide-button" type="button" disabled={saving} onClick={() => { void onSave(); }}><AppIcon name="save" size="sm" className="action-icon" />{saving ? "Salvando..." : "Salvar Produto"}</button>
      </section>
    </section>
  );
}

function StockExitHistoryScreen({ movements, onBack, onLogout }: { movements: StockMovement[]; onBack: () => void; onLogout: () => void }) {
  return <section className="screen"><TopBar title="Histórico de Saídas" subtitle="Consumo de produtos por usuária" onLogout={onLogout} /><button className="ghost-button" type="button" onClick={onBack}>Voltar para Limpeza</button>{movements.length === 0 ? <section className="empty-state"><h2>Nenhuma saída registrada</h2><p>Quando uma funcionária retirar produto, aparecerá aqui.</p></section> : <section className="orders-list">{movements.map((movement) => <article className="order-card" key={movement.id}><div className="order-head"><div><p className="card-kicker">{formatDateTime(movement.createdAt)}</p><h2>{movement.productName}</h2><small>Retirado por {movement.userName}</small>{movement.barcode && <small>Código: {movement.barcode}</small>}{movement.observation && <small>{movement.observation}</small>}</div><span className="status-done">{formatStockQuantity(movement.quantity, movement.unit)}</span></div></article>)}</section>}</section>;
}

function CurrentStockScreen({ inventoryProducts, onBack, onLogout, onEditProduct }: { inventoryProducts: InventoryProduct[]; onBack: () => void; onLogout: () => void; onEditProduct: (productId: string) => void }) {
  return <section className="screen"><TopBar title="Estoque Atual" subtitle="Produtos cadastrados para controle de limpeza" onLogout={onLogout} /><button className="ghost-button" type="button" onClick={onBack}><AppIcon name="back" size="sm" className="action-icon" />Voltar para Limpeza</button><section className="product-list current-stock-list">{inventoryProducts.map((product) => <article className="product-row inventory-stock-row" key={product.id}><ProductPhoto productName={product.name} photoData={product.photoData} /><span><strong>{product.name}</strong><small>{product.barcode ? `Código: ${product.barcode}` : "Sem código cadastrado"}</small></span><strong className="stock-quantity">{formatStockQuantity(product.currentStock, product.unit)}</strong><button className="secondary-button inventory-edit-button" type="button" onClick={() => onEditProduct(product.id)}><AppIcon name="edit" size="sm" className="action-icon" />Editar</button></article>)}</section></section>;
}

function ProductPhoto({ productName, photoData }: { productName: string; photoData?: string }) {
  return <div className="product-photo-box" aria-label={`Foto de ${productName}`}>{photoData ? <img src={photoData} alt={`Foto de ${productName}`} /> : <span>Sem foto</span>}</div>;
}

function UserAccessScreen({ user, permissions, notice, onLogout, onOpenCleaningDashboard, onOpenStockExit, onOpenSecurity }: { user: ManagedUser; permissions: UserPermission[]; notice: string; onLogout: () => void; onOpenCleaningDashboard: () => void; onOpenStockExit: () => void; onOpenSecurity: () => void }) {
  const moduleCards: Array<{ permission: UserPermission; title: string; detail: string; onClick?: () => void; className?: string; icon?: AppIconName }> = [
    { permission: "limpeza", title: "Limpeza", detail: "Rotinas e pedidos", onClick: onOpenCleaningDashboard, className: "cleaning-card", icon: "cleaning" },
    { permission: "saida-estoque", title: "Saída de estoque", detail: "Bipar retirada do estoque", onClick: onOpenStockExit, icon: "stock" },
    { permission: "seguranca", title: "Segurança", detail: "Guardas e escalas", onClick: onOpenSecurity, className: "security-card", icon: "security" },
    { permission: "guardas", title: "Guardas", detail: "Escalas e plantões", onClick: onOpenSecurity, className: "security-card", icon: "guards" },
    { permission: "estoque", title: "Estoque", detail: "Produtos e códigos", icon: "stock" },
    { permission: "cafe", title: "Máquina de Café", detail: "Insumos e reposição", icon: "coffee" },
    { permission: "agua", title: "Água", detail: "Fardos e copos", icon: "water" },
    { permission: "manutencao", title: "Manutenção", detail: "Chamados internos", icon: "settings" },
    { permission: "chaves", title: "Chaves", detail: "Controle de acessos", icon: "settings" },
    { permission: "patrimonio", title: "Patrimônio", detail: "Itens e equipamentos", icon: "stock" },
    { permission: "relatorios", title: "Relatórios", detail: "Consultas liberadas", icon: "reports" },
  ];
  const hasAnyModule = permissions.length > 0;

  return (
    <section className="screen">
      <ProfileHero name={user.name} role={user.jobTitle} department={user.department} photoData={user.photoData} subtitle={user.userType} actions={<button className="logout-button" type="button" onClick={onLogout}>Sair</button>} />
      {notice && <p className="notice-message">{notice}</p>}
      <section className="admin-grid module-grid">
        {moduleCards.map((card) => (
          <ModuleCard key={card.permission} title={card.title} detail={card.detail} enabled={permissions.includes(card.permission)} onClick={card.onClick} className={card.className} icon={card.icon} />
        ))}
      </section>
      {!hasAnyModule && <section className="empty-state"><h2>Nenhum módulo liberado</h2><p>Solicite permissão ao admin.</p></section>}
    </section>
  );
}

function UsersPermissionsScreen({ users, syncState, notice, onBack, onLogout, onSaveUser, onDeleteUser, onSyncLocalUsers }: { users: ManagedUser[]; syncState: ManagedUsersSyncState; notice: string; onBack: () => void; onLogout: () => void; onSaveUser: (user: ManagedUser) => Promise<boolean>; onDeleteUser: (userId: string) => Promise<void>; onSyncLocalUsers: () => Promise<void> }) {
  const [selectedUserId, setSelectedUserId] = useState(users[0]?.id ?? "");
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? users[0] ?? createBlankManagedUser();
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<ManagedUser>(() => cloneManagedUser(selectedUser));
  const [savingUser, setSavingUser] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);
  const actionBusy = savingUser || deletingUser || syncState.loading || syncState.syncing;

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

  async function saveDraft() {
    if (savingUser) return;
    setSavingUser(true);
    try {
      const saved = await onSaveUser(draft);
      if (saved) {
        setCreating(false);
        setSelectedUserId(draft.id);
      }
    } finally {
      setSavingUser(false);
    }
  }

  async function deleteDraft() {
    if (!window.confirm("Apagar este usuário?")) return;
    setDeletingUser(true);
    try {
      await onDeleteUser(draft.id);
      setCreating(false);
      setSelectedUserId(users[0]?.id ?? "");
    } finally {
      setDeletingUser(false);
    }
  }

  return (
    <section className="screen users-screen">
      <TopBar title="Usuários e Permissões" subtitle="Acessos, setores e módulos do HUB SM" onLogout={onLogout} />
      <button className="ghost-button" type="button" onClick={onBack}><AppIcon name="back" size="sm" className="action-icon" />Voltar</button>
      <section className={syncState.source === "supabase" ? "users-sync-panel synced" : "users-sync-panel local"}>
        <div>
          <p className="card-kicker">Origem dos usuários</p>
          <strong>{syncState.loading ? "Verificando sincronização..." : syncState.message}</strong>
          {syncState.lastSyncedAt && <small>Última sincronização: {formatDateTime(syncState.lastSyncedAt)}</small>}
        </div>
        <button className="secondary-button" type="button" disabled={actionBusy} onClick={() => { void onSyncLocalUsers(); }}>
          <AppIcon name="users" size="sm" className="action-icon" />{syncState.syncing ? "Sincronizando..." : "Sincronizar usuários deste aparelho"}
        </button>
      </section>
      {notice && <p className={notice.includes("salvo") || notice.includes("apagado") || notice.includes("sincronizado") ? "success-message" : "notice-message"}>{notice}</p>}
      <section className="users-layout">
        <aside className="users-list">
          <button className="primary-button wide-button" type="button" disabled={actionBusy} onClick={startNewUser}><AppIcon name="users" size="sm" className="action-icon" />Cadastrar novo usuário</button>
          {users.map((user) => (
            <button key={user.id} type="button" className={`user-list-card ${user.active ? "has-access" : "no-access"} ${user.id === selectedUserId && !creating ? "selected" : ""}`} disabled={actionBusy} onClick={() => selectUser(user.id)}>
              <UserAvatar user={user} />
              <span>{user.name}</span>
              <strong>{user.jobTitle}</strong>
              <small>{user.department} — {user.active ? "Ativo" : "Inativo"}</small>
            </button>
          ))}
        </aside>
        <section className="user-editor">
          <div className="user-editor-head">
            <UserAvatar user={draft} large />
            <div>
              <p className="card-kicker">{creating ? "Novo usuário" : "Editar usuário"}</p>
              <h2>{draft.name || "Usuário sem nome"}</h2>
              <small>{draft.department} — {draft.userType}</small>
            </div>
          </div>
          <section className="manual-form user-form">
            <label>Nome<input type="text" value={draft.name} disabled={actionBusy} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
            <label>Senha / código de acesso<input type="text" value={draft.accessCode} disabled={actionBusy} onChange={(event) => setDraft({ ...draft, accessCode: event.target.value })} /></label>
            <label>Cargo / função<input type="text" value={draft.jobTitle} disabled={actionBusy} onChange={(event) => setDraft({ ...draft, jobTitle: event.target.value })} /></label>
            <label>Setor / departamento<select value={draft.department} disabled={actionBusy} onChange={(event) => setDraft({ ...draft, department: event.target.value as UserDepartment })}>{userDepartments.map((department) => <option key={department} value={department}>{department}</option>)}</select></label>
            <label>Tipo de usuário<select value={draft.userType} disabled={actionBusy} onChange={(event) => setDraft({ ...draft, userType: event.target.value as AppUserType })}>{userTypes.map((userType) => <option key={userType} value={userType}>{userType}</option>)}</select></label>
            <label className="checkbox-row"><input type="checkbox" checked={draft.active} disabled={actionBusy || draft.protected} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /><span>Usuário ativo</span></label>
            <label className="photo-button user-photo-button">Definir foto do usuário<input type="file" accept="image/*" capture="environment" disabled={actionBusy} onChange={(event) => { void handleUserPhoto(event.target.files?.[0] ?? null); event.target.value = ""; }} /></label>
            {draft.photoData && <button className="ghost-button" type="button" disabled={actionBusy} onClick={() => setDraft({ ...draft, photoData: undefined })}>Remover foto</button>}
          </section>
          <section className="permissions-panel">
            <h2>Permissões por módulo</h2>
            <div className="permissions-grid">
              {permissionOptions.map((permission) => {
                const checked = draft.id === "tezzei" || draft.permissions.includes(permission.id);
                return (
                  <label className={`checkbox-row permission-row ${checked ? "has-access" : "no-access"}`} key={permission.id}>
                    <input type="checkbox" checked={checked} disabled={actionBusy || draft.id === "tezzei"} onChange={() => togglePermission(permission.id)} />
                    <span>{permission.label}</span>
                  </label>
                );
              })}
            </div>
          </section>
          <div className="button-grid user-actions">
            <button className="primary-button" type="button" disabled={actionBusy} onClick={saveDraft}><AppIcon name="save" size="sm" className="action-icon" />{savingUser ? "Salvando..." : "Salvar usuário"}</button>
            <button className="secondary-button" type="button" disabled={actionBusy || draft.protected || !draft.active} onClick={() => setDraft({ ...draft, active: false })}><AppIcon name="blocked" size="sm" className="action-icon" />Inativar usuário</button>
            {!draft.system && !draft.protected && <button className="danger-button" type="button" disabled={actionBusy} onClick={deleteDraft}><AppIcon name="blocked" size="sm" className="action-icon" />{deletingUser ? "Apagando..." : "Apagar usuário"}</button>}
          </div>
        </section>
      </section>
    </section>
  );
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

type SectorModuleCard = {
  key: string;
  title: string;
  detail: string;
  enabled: boolean;
  onClick?: () => void;
  className?: string;
  attention?: string;
  icon?: AppIconName;
};

function ModuleCard({ title, detail, enabled = true, onClick, className = "", attention, icon }: { title: string; detail: string; enabled?: boolean; onClick?: () => void; className?: string; attention?: string; icon?: AppIconName }) {
  const hasAttention = enabled && Boolean(attention);
  const cardClass = ["admin-card", "module-card", icon ? "with-icon" : "", enabled ? "has-access" : "no-access", enabled && onClick ? "action-card" : "", className, hasAttention ? "needs-attention" : ""].filter(Boolean).join(" ");
  const content = (
    <>
      {icon && (
        <span className="module-icon-circle" aria-hidden="true">
          <AppIcon name={icon} size="lg" className="module-icon" />
        </span>
      )}
      <span className="module-card-copy">
        <span className="module-card-title">{title}</span>
        <strong>{detail}</strong>
        {hasAttention && <small className="attention-pill">{attention}</small>}
        {!enabled && <small className="access-pill">Sem acesso</small>}
      </span>
    </>
  );

  if (enabled && onClick) {
    return <button className={cardClass} type="button" onClick={onClick}>{content}</button>;
  }

  return <article className={cardClass} aria-disabled={!enabled}>{content}</article>;
}

function AccessDeniedScreen({ onBack, onLogout }: { onBack: () => void; onLogout: () => void }) {
  return (
    <section className="screen">
      <TopBar title="Acesso restrito" subtitle="Você não tem acesso a este módulo." onLogout={onLogout} />
      <button className="ghost-button" type="button" onClick={onBack}><AppIcon name="back" size="sm" className="action-icon" />Voltar</button>
      <section className="empty-state">
        <h2>Você não tem acesso a este módulo.</h2>
        <p>Solicite permissão ao admin.</p>
      </section>
    </section>
  );
}

function UserSectorHomeScreen({ user, permissions, notice, onLogout, onOpenCleaningDashboard, onOpenStockExit, onOpenCopaCafe, onOpenMaintenance, onOpenGeneralStock, onOpenPatrimony, onOpenReports, onOpenSecurity }: { user: ManagedUser; permissions: UserPermission[]; notice: string; onLogout: () => void; onOpenCleaningDashboard: () => void; onOpenStockExit: () => void; onOpenCopaCafe: () => void; onOpenMaintenance: () => void; onOpenGeneralStock: () => void; onOpenPatrimony: () => void; onOpenReports: () => void; onOpenSecurity: () => void }) {
  const canCleaning = permissions.includes("limpeza") || permissions.includes("saida-estoque");
  const cards: SectorModuleCard[] = [
    { key: "limpeza", title: "Limpeza", detail: "Rotinas, produtos, pedidos e histórico da equipe de limpeza.", enabled: canCleaning, onClick: permissions.includes("limpeza") ? onOpenCleaningDashboard : onOpenStockExit, className: "cleaning-card", icon: "cleaning" },
    { key: "copa-cafe", title: "Copa & Café", detail: "Máquina de café, água, copos, bebidas e insumos da copa.", enabled: permissions.includes("cafe") || permissions.includes("agua"), onClick: onOpenCopaCafe, icon: "coffee" },
    { key: "seguranca", title: "Segurança", detail: "Guardas, rondas, monitoramento, estacionamento e fechamento dos serviços.", enabled: permissions.includes("seguranca") || permissions.includes("guardas") || permissions.includes("estacionamento-consulta") || permissions.includes("estacionamento-cadastro"), onClick: onOpenSecurity, className: "security-card", icon: "security" },
    { key: "manutencao", title: "Manutenção", detail: "Chamados, obras, fornecedores e pendências prediais.", enabled: permissions.includes("manutencao"), onClick: onOpenMaintenance, icon: "settings" },
    { key: "estoque-geral", title: "Estoque Geral", detail: "Materiais diversos, ferramentas, informática e itens de apoio.", enabled: permissions.includes("estoque"), onClick: onOpenGeneralStock, icon: "stock" },
    { key: "patrimonio", title: "Patrimônio", detail: "Equipamentos, móveis, rede, câmeras, chaves e inventário.", enabled: permissions.includes("patrimonio") || permissions.includes("chaves"), onClick: onOpenPatrimony, icon: "stock" },
    { key: "relatorios", title: "Relatórios", detail: "Consultas e relatórios por área operacional.", enabled: permissions.includes("relatorios"), onClick: onOpenReports, icon: "reports" },
  ];
  const visibleCards = cards.filter((card) => card.enabled);
  const hasAnyModule = visibleCards.length > 0;

  return (
    <section className="screen">
      <ProfileHero name={user.name} role={user.jobTitle} department={user.department} photoData={user.photoData} subtitle={user.userType} actions={<button className="logout-button" type="button" onClick={onLogout}>Sair</button>} />
      {notice && <p className="notice-message">{notice}</p>}
      <section className="admin-grid module-grid">
        {visibleCards.map((card) => <ModuleCard key={card.key} title={card.title} detail={card.detail} enabled={card.enabled} onClick={card.onClick} className={card.className} attention={card.attention} icon={card.icon} />)}
      </section>
      {!hasAnyModule && <section className="empty-state"><h2>Nenhum módulo liberado</h2><p>Solicite permissão ao admin.</p></section>}
    </section>
  );
}

function AdminSectorHomeScreen({ newOrdersCount, onlineEnabled, permissions, onLogout, onOpenCleaningDashboard, onOpenCopaCafe, onOpenSecurity, onOpenMaintenance, onOpenGeneralStock, onOpenPatrimony, onOpenReports, onOpenUsersPermissions, onOpenSystemStatus }: { newOrdersCount: number; onlineEnabled: boolean; permissions: UserPermission[]; onLogout: () => void; onOpenCleaningDashboard: () => void; onOpenCopaCafe: () => void; onOpenSecurity: () => void; onOpenMaintenance: () => void; onOpenGeneralStock: () => void; onOpenPatrimony: () => void; onOpenReports: () => void; onOpenUsersPermissions: () => void; onOpenSystemStatus: () => void }) {
  const cards: SectorModuleCard[] = [
    { key: "limpeza", title: "Limpeza", detail: "Rotinas, produtos, pedidos e histórico da equipe de limpeza.", enabled: permissions.includes("limpeza"), onClick: onOpenCleaningDashboard, className: "cleaning-card", attention: newOrdersCount > 0 ? `${newOrdersCount} pedido(s) pendente(s)` : undefined, icon: "cleaning" },
    { key: "copa-cafe", title: "Copa & Café", detail: "Máquina de café, água, copos, bebidas e insumos da copa.", enabled: permissions.includes("cafe") || permissions.includes("agua"), onClick: onOpenCopaCafe, icon: "coffee" },
    { key: "seguranca", title: "Segurança", detail: "Guardas, rondas, monitoramento, estacionamento e fechamento dos serviços.", enabled: permissions.includes("seguranca"), onClick: onOpenSecurity, className: "security-card", icon: "security" },
    { key: "manutencao", title: "Manutenção", detail: "Chamados, obras, fornecedores e pendências prediais.", enabled: permissions.includes("manutencao"), onClick: onOpenMaintenance, icon: "settings" },
    { key: "estoque-geral", title: "Estoque Geral", detail: "Materiais diversos, ferramentas, informática e itens de apoio.", enabled: permissions.includes("estoque"), onClick: onOpenGeneralStock, icon: "stock" },
    { key: "patrimonio", title: "Patrimônio", detail: "Equipamentos, móveis, rede, câmeras, chaves e inventário.", enabled: permissions.includes("patrimonio") || permissions.includes("chaves"), onClick: onOpenPatrimony, icon: "stock" },
    { key: "relatorios", title: "Relatórios", detail: "Consultas e relatórios por área operacional.", enabled: permissions.includes("relatorios"), onClick: onOpenReports, icon: "reports" },
    { key: "usuarios-permissoes", title: "Usuários & Permissões", detail: "Cadastro de usuários, acessos e permissões do sistema.", enabled: permissions.includes("painel-admin"), onClick: onOpenUsersPermissions, className: "users-card", icon: "users" },
    { key: "status-sistema", title: "Status do Sistema", detail: "Visão rápida dos módulos principais do HUB SM.", enabled: permissions.includes("painel-admin"), onClick: onOpenSystemStatus, className: "users-card", icon: "reports" },
  ];

  return (
    <section className="screen">
      <TopBar title="Painel Tezzei" subtitle={onlineEnabled ? "Central Operacional HUB SM — online" : "Central Operacional HUB SM — local"} onLogout={onLogout} />
      <section className="admin-grid module-grid">
        {cards.map((card) => <ModuleCard key={card.key} title={card.title} detail={card.detail} enabled={card.enabled} onClick={card.onClick} className={card.className} attention={card.attention} icon={card.icon} />)}
      </section>
    </section>
  );
}

type SystemStatusLevel = "Operacional" | "Atenção" | "Restrito" | "Não configurado";
type SystemStatusTone = "operational" | "attention" | "restricted" | "not-configured";

type SystemStatusCard = {
  key: string;
  title: string;
  icon: AppIconName;
  status: SystemStatusLevel;
  tone: SystemStatusTone;
  note: string;
};

function createSystemStatusCard({ key, title, icon, available, note, restricted = false }: { key: string; title: string; icon: AppIconName; available: boolean; note: string; restricted?: boolean }): SystemStatusCard {
  if (restricted && available) {
    return { key, title, icon, status: "Restrito", tone: "restricted", note };
  }

  return {
    key,
    title,
    icon,
    status: available ? "Operacional" : "Não configurado",
    tone: available ? "operational" : "not-configured",
    note: available ? note : "Módulo não disponível para o perfil atual.",
  };
}

function SystemStatusScreen({ permissions, users, onBack, onLogout }: { permissions: UserPermission[]; users: ManagedUser[]; onBack: () => void; onLogout: () => void }) {
  const hasAdmin = permissions.includes("painel-admin");
  const hasSecurity = permissions.includes("seguranca");
  const hasGuards = permissions.includes("guardas");
  const hasParking = hasAdmin || permissions.includes("estacionamento-consulta") || permissions.includes("estacionamento-cadastro");
  const hasParkingRegister = hasAdmin || permissions.includes("estacionamento-cadastro");
  const systemCards: SystemStatusCard[] = [
    createSystemStatusCard({ key: "cleaning", title: "Limpeza", icon: "cleaning", available: permissions.includes("limpeza"), note: "Pedidos, conferência, estoque e histórico da limpeza disponíveis." }),
    createSystemStatusCard({ key: "copa-cafe", title: "Copa & Café", icon: "coffee", available: permissions.includes("cafe") || permissions.includes("agua"), note: "Café, água e insumos da copa organizados no menu operacional." }),
    createSystemStatusCard({ key: "security", title: "Segurança", icon: "security", available: hasSecurity, note: "Menu de segurança disponível com guardas, monitoramento e estacionamento." }),
    createSystemStatusCard({ key: "parking", title: "Estacionamento", icon: "parking", available: hasParking, note: hasParkingRegister ? "Consulta e cadastro de veículos disponíveis para Admin." : "Consulta rápida de veículos disponível." }),
    createSystemStatusCard({ key: "guards", title: "Guardas", icon: "guards", available: hasGuards, note: "Área dos guardas disponível para plantão, ronda e QR Code." }),
    createSystemStatusCard({ key: "rounds", title: "Rondas", icon: "guards", available: hasSecurity && hasGuards, note: "Relatório e registro de rondas disponíveis na área de segurança." }),
    createSystemStatusCard({ key: "qrcode", title: "QR Code", icon: "qr", available: hasGuards, note: "Leitura de QR Code disponível no fluxo operacional do guarda." }),
    createSystemStatusCard({ key: "payments", title: "Pagamentos", icon: "payment", available: hasAdmin, restricted: true, note: "Fechamento / Pagamento restrito ao Admin/Tezzei em Segurança > Guardas." }),
    createSystemStatusCard({ key: "users", title: "Usuários & Permissões", icon: "users", available: hasAdmin, note: "Cadastro e sincronização de usuários disponíveis somente para Admin." }),
    { key: "plate-ocr", title: "OCR de Placas", icon: "camera", status: "Atenção", tone: "attention", note: "OCR auxiliar. Requer validação com placa real." },
  ];
  const mainProfiles = [
    { id: "tezzei", name: "Admin / Tezzei", profile: "Admin", modules: "Acesso total ao HUB SM." },
    { id: "carlos-clemente", name: "Carlos Clemente", profile: "Guarda", modules: "Segurança, Guardas, Rondas, QR Code e Estacionamento." },
    { id: "salomao", name: "Salomão", profile: "Guarda", modules: "Segurança, Guardas, Rondas, QR Code e Estacionamento." },
    { id: "neia", name: "Neia", profile: "Limpeza", modules: "Limpeza, pedidos, conferência e estoque conforme permissões." },
    { id: "selma", name: "Selma", profile: "Limpeza", modules: "Limpeza conforme permissões atuais." },
    { id: "helena", name: "Helena", profile: "Limpeza", modules: "Limpeza conforme permissões atuais." },
  ];
  const pendingItems = [
    "Validar OCR de placas no celular com placa real.",
    "Validar fluxo dos guardas em uso real.",
    "Validar Limpeza em uso real.",
    "Validar permissões após novos usuários.",
  ];

  return (
    <section className="screen">
      <TopBar title="Status do Sistema" subtitle="Visão rápida dos módulos principais do HUB SM." onLogout={onLogout} />
      <button className="ghost-button" type="button" onClick={onBack}><AppIcon name="back" size="sm" className="action-icon" />Voltar</button>
      <section className="system-status-grid" aria-label="Status dos módulos">
        {systemCards.map((card) => (
          <article className={`system-status-card system-status-${card.tone}`} key={card.key}>
            <div className="system-status-card-head">
              <span className="module-icon-circle" aria-hidden="true">
                <AppIcon name={card.icon} size="lg" className="module-icon" />
              </span>
              <span className={`system-status-pill system-status-pill-${card.tone}`}>{card.status}</span>
            </div>
            <h2>{card.title}</h2>
            <p>{card.note}</p>
          </article>
        ))}
      </section>

      <section className="system-status-section">
        <div className="section-title-row">
          <AppIcon name="users" size="md" className="status-icon icon-info" />
          <h2>Perfis principais</h2>
        </div>
        <div className="system-profile-list">
          {mainProfiles.map((profile) => {
            const user = users.find((current) => current.id === profile.id);
            const active = user?.active !== false;
            return (
              <article className="system-profile-card" key={profile.id}>
                <div>
                  <strong>{profile.name}</strong>
                  <span>{profile.profile}</span>
                </div>
                <p>{profile.modules}</p>
                <small className={active ? "system-profile-active" : "system-profile-inactive"}>{active ? "Ativo" : "Inativo"}</small>
              </article>
            );
          })}
        </div>
      </section>

      <section className="system-status-section">
        <div className="section-title-row">
          <AppIcon name="warning" size="md" className="status-icon icon-warning" />
          <h2>Pendências conhecidas</h2>
        </div>
        <ul className="system-pending-list">
          {pendingItems.map((item) => (
            <li key={item}><AppIcon name="warning" size="sm" className="status-icon icon-warning" />{item}</li>
          ))}
        </ul>
      </section>
    </section>
  );
}

function OperationalSectorScreen({ title, subtitle, cards, onBack, onLogout }: { title: string; subtitle: string; cards: SectorModuleCard[]; onBack: () => void; onLogout: () => void }) {
  const visibleCards = cards.filter((card) => card.enabled);

  return (
    <section className="screen">
      <TopBar title={title} subtitle={subtitle} onLogout={onLogout} />
      <button className="ghost-button" type="button" onClick={onBack}>Voltar</button>
      <section className="admin-grid module-grid">
        {visibleCards.map((card) => <ModuleCard key={card.key} title={card.title} detail={card.detail} enabled={card.enabled} onClick={card.onClick} className={card.className} attention={card.attention} icon={card.icon} />)}
      </section>
      {visibleCards.length === 0 && <section className="empty-state"><h2>Você não tem acesso a este módulo.</h2><p>Solicite permissão ao admin.</p></section>}
    </section>
  );
}

function CopaCafeMenuScreen({ permissions, onBack, onLogout }: { permissions: UserPermission[]; onBack: () => void; onLogout: () => void }) {
  const canCoffee = permissions.includes("cafe");
  const canWater = permissions.includes("agua");
  const canShared = canCoffee || canWater;
  const cards: SectorModuleCard[] = [
    { key: "coffee-machine", title: "Máquina de Café", detail: "Operação, doses e acompanhamento da máquina.", enabled: canCoffee, icon: "coffee" },
    { key: "coffee-readings", title: "Leituras da máquina", detail: "Conferência das leituras e consumo registrado.", enabled: canCoffee, icon: "reports" },
    { key: "coffee-stock", title: "Estoque de insumos da máquina", detail: "Grãos, leite, chocolate, açúcar e reposição.", enabled: canCoffee, icon: "stock" },
    { key: "nestle-order", title: "Pedido Nestlé", detail: "Solicitações e reposições com fornecedor.", enabled: canCoffee, icon: "coffee" },
    { key: "water", title: "Água", detail: "Controle de fardos, galões e consumo.", enabled: canWater, icon: "water" },
    { key: "water-stock", title: "Estoque de água", detail: "Saldo de água separado do estoque geral.", enabled: canWater, icon: "stock" },
    { key: "water-purchases", title: "Compras de água", detail: "Pedidos, compras e reposições de água.", enabled: canWater, icon: "water" },
    { key: "cups-disposables", title: "Copos e descartáveis", detail: "Copos, mexedores, guardanapos e descartáveis.", enabled: canShared, icon: "coffee" },
    { key: "fridge-drinks", title: "Bebidas da geladeira", detail: "Bebidas e itens refrigerados da copa.", enabled: canShared, icon: "water" },
    { key: "gourmet-items", title: "Itens da área gourmet", detail: "Itens de apoio da área gourmet dentro da copa.", enabled: canShared, icon: "settings" },
  ];
  return <OperationalSectorScreen title="Copa & Café" subtitle="Café, água, bebidas e insumos da copa" cards={cards} onBack={onBack} onLogout={onLogout} />;
}

function MaintenanceMenuScreen({ permissions, onBack, onLogout }: { permissions: UserPermission[]; onBack: () => void; onLogout: () => void }) {
  const canMaintenance = permissions.includes("manutencao");
  const cards: SectorModuleCard[] = [
    { key: "tickets", title: "Chamados", detail: "Solicitações e ocorrências prediais.", enabled: canMaintenance, icon: "settings" },
    { key: "works", title: "Obras / Reformas", detail: "Acompanhamento de obras e reformas.", enabled: canMaintenance, icon: "settings" },
    { key: "suppliers", title: "Fornecedores", detail: "Contatos e prestadores de manutenção.", enabled: canMaintenance, icon: "users" },
    { key: "quotes", title: "Orçamentos", detail: "Cotações e valores em análise.", enabled: canMaintenance, icon: "payment" },
    { key: "pending", title: "Pendências", detail: "Itens abertos e próximas ações.", enabled: canMaintenance, icon: "warning" },
    { key: "history", title: "Histórico de manutenção", detail: "Registro de serviços já acompanhados.", enabled: canMaintenance, icon: "reports" },
  ];
  return <OperationalSectorScreen title="Manutenção" subtitle="Chamados, obras, fornecedores e pendências prediais" cards={cards} onBack={onBack} onLogout={onLogout} />;
}

function GeneralStockMenuScreen({ permissions, onBack, onLogout }: { permissions: UserPermission[]; onBack: () => void; onLogout: () => void }) {
  const canStock = permissions.includes("estoque");
  const cards: SectorModuleCard[] = [
    { key: "misc", title: "Materiais diversos", detail: "Itens de apoio que não pertencem a limpeza nem copa.", enabled: canStock, icon: "stock" },
    { key: "tools", title: "Ferramentas", detail: "Ferramentas e acessórios de uso geral.", enabled: canStock, icon: "settings" },
    { key: "electric", title: "Elétrica", detail: "Lâmpadas, tomadas, cabos e materiais elétricos.", enabled: canStock, icon: "settings" },
    { key: "it", title: "Informática", detail: "Mouse, teclado, cabos, pendrive e itens de TI.", enabled: canStock, icon: "settings" },
    { key: "construction", title: "Material de obra", detail: "Materiais de obra e apoio a pequenos reparos.", enabled: canStock, icon: "stock" },
  ];
  return <OperationalSectorScreen title="Estoque Geral" subtitle="Materiais diversos, ferramentas, informática e itens de apoio" cards={cards} onBack={onBack} onLogout={onLogout} />;
}

function PatrimonyMenuScreen({ permissions, onBack, onLogout }: { permissions: UserPermission[]; onBack: () => void; onLogout: () => void }) {
  const canPatrimony = permissions.includes("patrimonio");
  const canKeys = permissions.includes("chaves");
  const cards: SectorModuleCard[] = [
    { key: "equipment", title: "Equipamentos", detail: "Equipamentos controlados pelo patrimônio.", enabled: canPatrimony, icon: "stock" },
    { key: "furniture", title: "Móveis", detail: "Móveis e itens físicos das áreas comuns.", enabled: canPatrimony, icon: "stock" },
    { key: "printers", title: "Impressoras", detail: "Impressoras, suprimentos e controle patrimonial.", enabled: canPatrimony, icon: "reports" },
    { key: "cameras", title: "Câmeras", detail: "Câmeras e equipamentos de segurança patrimonial.", enabled: canPatrimony, icon: "camera" },
    { key: "network", title: "Rede / Wi-Fi", detail: "Rede, Wi-Fi e equipamentos de conectividade.", enabled: canPatrimony, icon: "settings" },
    { key: "keys", title: "Chaves", detail: "Controle de chaves e acessos físicos.", enabled: canKeys, icon: "security" },
    { key: "inventory", title: "Inventário patrimonial", detail: "Inventário de bens, locais e responsáveis.", enabled: canPatrimony, icon: "reports" },
  ];
  return <OperationalSectorScreen title="Patrimônio" subtitle="Equipamentos, móveis, rede, câmeras, chaves e inventário" cards={cards} onBack={onBack} onLogout={onLogout} />;
}

function ReportsMenuScreen({ permissions, onBack, onLogout }: { permissions: UserPermission[]; onBack: () => void; onLogout: () => void }) {
  const canReports = permissions.includes("relatorios");
  const cards: SectorModuleCard[] = [
    { key: "cleaning", title: "Limpeza", detail: "Relatórios de pedidos, estoque e histórico da limpeza.", enabled: canReports, icon: "cleaning" },
    { key: "copa-cafe", title: "Copa & Café", detail: "Relatórios de café, água, bebidas e insumos.", enabled: canReports, icon: "coffee" },
    { key: "security", title: "Segurança", detail: "Relatórios de guardas, serviços, rondas e QR Codes.", enabled: canReports, icon: "security" },
    { key: "maintenance", title: "Manutenção", detail: "Relatórios de chamados, obras e pendências.", enabled: canReports, icon: "settings" },
    { key: "stock", title: "Estoque", detail: "Relatórios de materiais diversos e itens de apoio.", enabled: canReports, icon: "stock" },
    { key: "general", title: "Geral", detail: "Consultas consolidadas por área operacional.", enabled: canReports, icon: "reports" },
  ];
  return <OperationalSectorScreen title="Relatórios" subtitle="Consultas e relatórios por área operacional" cards={cards} onBack={onBack} onLogout={onLogout} />;
}

function AdminScreen({ newOrdersCount, onlineEnabled, permissions, onLogout, onOpenCleaningDashboard, onOpenSecurity, onOpenUsersPermissions }: { newOrdersCount: number; onlineEnabled: boolean; permissions: UserPermission[]; onLogout: () => void; onOpenCleaningDashboard: () => void; onOpenSecurity: () => void; onOpenUsersPermissions: () => void }) {
  const cards: Array<{ permission: UserPermission; title: string; detail: string; onClick?: () => void; className?: string; attention?: string; icon?: AppIconName }> = [
    { permission: "limpeza", title: "Limpeza", detail: newOrdersCount > 0 ? `${newOrdersCount} pedido(s) pendente(s)` : "Rotinas, pedidos Sinval e equipe", onClick: onOpenCleaningDashboard, className: "cleaning-card", attention: newOrdersCount > 0 ? "Precisa de atenção" : undefined, icon: "cleaning" },
    { permission: "estoque", title: "Estoque", detail: "Produtos, códigos e saídas", icon: "stock" },
    { permission: "cafe", title: "Máquina de Café", detail: "Insumos, doses e reposição", icon: "coffee" },
    { permission: "agua", title: "Água", detail: "Controle de fardos e copos", icon: "water" },
    { permission: "manutencao", title: "Manutenção", detail: "Chamados e tarefas internas", icon: "settings" },
    { permission: "chaves", title: "Chaves", detail: "Controle de acessos", icon: "security" },
    { permission: "seguranca", title: "Segurança", detail: "Guardas e escalas", onClick: onOpenSecurity, className: "security-card", icon: "security" },
    { permission: "patrimonio", title: "Patrimônio", detail: "Itens, equipamentos e auditoria", icon: "stock" },
    { permission: "relatorios", title: "Relatórios", detail: "Consultas e auditoria", icon: "reports" },
    { permission: "painel-admin", title: "Usuários e Permissões", detail: "Acessos, setores e módulos", onClick: onOpenUsersPermissions, className: "users-card", icon: "users" },
  ];

  return (
    <section className="screen">
      <TopBar title="Painel Tezzei" subtitle={onlineEnabled ? "Central Operacional HUB SM — online" : "Central Operacional HUB SM — local"} onLogout={onLogout} />
      <section className="admin-grid module-grid">
        {cards.map((card) => <ModuleCard key={card.permission} title={card.title} detail={card.detail} enabled={permissions.includes(card.permission)} onClick={card.onClick} className={card.className} attention={card.attention} icon={card.icon} />)}
      </section>
    </section>
  );
}

function SecurityMenuScreen({ permissions, isAdmin, onBack, onLogout, onOpenGuards, onOpenMonitoring, onOpenParking }: { permissions: UserPermission[]; isAdmin: boolean; onBack: () => void; onLogout: () => void; onOpenGuards: () => void; onOpenMonitoring: () => void; onOpenParking: () => void }) {
  const canGuards = permissions.includes("guardas");
  const canMonitoring = isAdmin && permissions.includes("painel-admin");
  const canParking = permissions.includes("estacionamento-consulta") || permissions.includes("estacionamento-cadastro") || permissions.includes("painel-admin");
  const canRegisterParking = isAdmin || permissions.includes("painel-admin") || permissions.includes("estacionamento-cadastro");
  const cards: SectorModuleCard[] = [
    { key: "guards", title: "Guardas", detail: isAdmin ? "Controle dos guardas" : "Serviço, rondas e QR Code", enabled: canGuards, onClick: onOpenGuards, className: "security-card", icon: "guards" },
    { key: "monitoring", title: "Monitoramento", detail: "Entradas, saídas e rondas", enabled: canMonitoring, onClick: onOpenMonitoring, className: "security-card", icon: "reports" },
    { key: "parking", title: "Estacionamento", detail: canRegisterParking ? "Consulta e cadastro de veículos" : "Consulta rápida de veículos", enabled: canParking, onClick: onOpenParking, className: "security-card", icon: "parking" },
  ];
  const visibleCards = cards.filter((card) => isAdmin || card.enabled);

  return <section className="screen"><TopBar title="Segurança" subtitle="Controle de segurança" onLogout={onLogout} /><button className="ghost-button" type="button" onClick={onBack}><AppIcon name="back" size="sm" className="action-icon" />Voltar</button><section className="admin-grid security-grid">{visibleCards.map((card) => <ModuleCard key={card.key} title={card.title} detail={card.detail} enabled={card.enabled} onClick={card.onClick} className={card.className} icon={card.icon} />)}</section>{visibleCards.length === 0 && <section className="empty-state"><h2>Você não tem acesso a este módulo.</h2><p>Solicite permissão ao admin.</p></section>}</section>;
}

type ParkingTab = "search" | "register";
type VehicleResultTone = "ok" | "priority" | "warning" | "danger";

type VehicleRecentSearch = {
  normalizedPlate: string;
  plate: string;
  statusLabel: string;
  tone: VehicleResultTone;
};

type VehicleSearchTermType = "plate" | "text";

const VEHICLE_PLATE_SEARCH_PATTERN = /^[A-Z]{3}([0-9]{4}|[0-9][A-Z][0-9]{2})$/;

function normalizeOperationalText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function normalizeVehicleSearchText(value: string) {
  return normalizeOperationalText(value).replace(/\s+/g, " ");
}

function getVehicleSearchTermType(term: string): VehicleSearchTermType {
  return VEHICLE_PLATE_SEARCH_PATTERN.test(normalizeVehiclePlate(term)) ? "plate" : "text";
}

function vehicleMatchesSearchTerm(vehicle: VehicleRecord, term: string) {
  const normalizedTerm = normalizeVehicleSearchText(term);
  const compactTerm = normalizeVehiclePlate(term);
  if (!normalizedTerm && !compactTerm) return false;

  if (compactTerm && (
    vehicle.normalizedPlate.includes(compactTerm)
    || normalizeVehiclePlate(vehicle.plate).includes(compactTerm)
  )) {
    return true;
  }

  return [
    vehicle.plate,
    vehicle.normalizedPlate,
    vehicle.ownerName,
    vehicle.ownerType,
    vehicle.department,
    vehicle.brand,
    vehicle.model,
    vehicle.color,
    vehicle.notes,
  ].some((field) => normalizeVehicleSearchText(field).includes(normalizedTerm));
}

function getEmployeeDepartmentLabel(department: string) {
  const normalized = normalizeOperationalText(department);
  if (!normalized) return "";
  if (normalized === "ADM" || normalized.includes("ADMINISTRATIVO") || normalized.includes("ADMINISTRACAO")) return "ADM";
  if (normalized.includes("FINANCEIRO")) return "FINANCEIRO";
  if (normalized.includes("VENDAS")) return "VENDAS";
  if (normalized.includes("LOCACAO")) return "LOCAÇÃO";
  if (normalized.includes("MARKETING")) return "MARKETING";
  return department.trim().toUpperCase();
}

function isInternalParkingDepartment(department: string) {
  const normalized = normalizeOperationalText(department);
  return normalized === "ADM" || normalized.includes("ADMINISTRATIVO") || normalized.includes("ADMINISTRACAO") || normalized.includes("FINANCEIRO");
}

function getVehicleOperationalStatus(vehicle: VehicleRecord | null): { label: string; message: string; tone: VehicleResultTone } {
  if (!vehicle) {
    return { label: "NÃO CADASTRADO", message: "Veículo não cadastrado.", tone: "danger" };
  }

  if (!vehicle.active || !vehicle.parkingAuthorized) {
    return { label: "NÃO AUTORIZADO", message: "Veículo inativo ou sem autorização para estacionar.", tone: "danger" };
  }

  const ownerType = normalizeOperationalText(vehicle.ownerType);
  if (ownerType === "CLIENTE" || ownerType === "CORRETOR") {
    return { label: ownerType, message: "Prioridade do pátio.", tone: "priority" };
  }

  if (ownerType === "FUNCIONARIO") {
    const departmentLabel = getEmployeeDepartmentLabel(vehicle.department);
    const isInternal = isInternalParkingDepartment(vehicle.department);
    return {
      label: departmentLabel ? `FUNCIONÁRIO ${departmentLabel}` : "FUNCIONÁRIO",
      message: isInternal ? "ATENÇÃO: veículo de setor interno. Verificar se pode ocupar vaga do pátio." : "Veículo cadastrado e autorizado.",
      tone: isInternal ? "warning" : "ok",
    };
  }

  return { label: vehicle.ownerType.toUpperCase(), message: "Veículo cadastrado e autorizado.", tone: "ok" };
}

function SecurityParkingScreen({ permissions, isAdmin, onBack, onLogout }: { permissions: UserPermission[]; isAdmin: boolean; onBack: () => void; onLogout: () => void }) {
  const canRegister = isAdmin || permissions.includes("painel-admin") || permissions.includes("estacionamento-cadastro");
  const [activeTab, setActiveTab] = useState<ParkingTab>("search");
  const [vehicleState, setVehicleState] = useState<VehicleLoadState>({ vehicles: [], remoteReadable: false, remoteProtected: false });
  const [loading, setLoading] = useState(true);
  const [searchPlate, setSearchPlate] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const platePhotoFileInputRef = useRef<HTMLInputElement | null>(null);
  const [capturedPlatePhoto, setCapturedPlatePhoto] = useState("");
  const [plateCaptureGuideOpen, setPlateCaptureGuideOpen] = useState(false);
  const [platePhotoDialogOpen, setPlatePhotoDialogOpen] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const [searchedPlate, setSearchedPlate] = useState("");
  const [searchedTermType, setSearchedTermType] = useState<VehicleSearchTermType>("plate");
  const [resultVehicle, setResultVehicle] = useState<VehicleRecord | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<VehicleRecord[]>([]);
  const [searchResultsTerm, setSearchResultsTerm] = useState("");
  const [searchResultsOpen, setSearchResultsOpen] = useState(false);
  const [draft, setDraft] = useState<VehicleRecordDraft>(() => createBlankVehicleDraft());
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [saving, setSaving] = useState(false);
  const [formMessage, setFormMessage] = useState("");
  const [recentSearches, setRecentSearches] = useState<VehicleRecentSearch[]>([]);
  const vehicles = vehicleState.vehicles;
  const sortedVehicles = useMemo(() => [...vehicles].sort((first, second) => `${first.ownerName} ${first.plate}`.localeCompare(`${second.ownerName} ${second.plate}`)), [vehicles]);
  const knownParkingPlates = useMemo(() => vehicles.map((vehicle) => vehicle.normalizedPlate).filter(Boolean), [vehicles]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadVehicleRecords()
      .then((state) => {
        if (!active) return;
        setVehicleState(state);
      })
      .catch(() => {
        if (!active) return;
        setVehicleState({ vehicles: [], remoteReadable: false, remoteProtected: false, message: "Erro ao carregar veículos." });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  function upsertVehicleInState(vehicle: VehicleRecord) {
    setVehicleState((current) => {
      const exists = current.vehicles.some((item) => item.id === vehicle.id || item.normalizedPlate === vehicle.normalizedPlate);
      return {
        ...current,
        vehicles: exists
          ? current.vehicles.map((item) => (item.id === vehicle.id || item.normalizedPlate === vehicle.normalizedPlate ? vehicle : item))
          : [...current.vehicles, vehicle],
      };
    });
  }

  async function refreshVehicles() {
    const state = await loadVehicleRecords();
    setVehicleState(state);
    return state.vehicles;
  }

  async function handlePlatePhoto(file: File | null) {
    if (!file) return;
    try {
      const photoData = await imageFileToDataUrl(file);
      setCapturedPlatePhoto(photoData);
      setPlateCaptureGuideOpen(false);
      setPlatePhotoDialogOpen(true);
      setSearchMessage("Foto capturada. Confira a placa para pesquisar.");
    } catch {
      setSearchMessage("Não foi possível salvar a foto da placa. Digite a placa manualmente.");
    }
  }

  function openPlateCaptureGuide() {
    setPlateCaptureGuideOpen(true);
  }

  function requestPlatePhotoCapture() {
    setPlateCaptureGuideOpen(false);
    platePhotoFileInputRef.current?.click();
  }

  function retakePlatePhoto() {
    setCapturedPlatePhoto("");
    setPlatePhotoDialogOpen(false);
    requestPlatePhotoCapture();
  }

  async function handleDraftPhoto(file: File | null, field: "carPhotoData" | "platePhotoData") {
    if (!file) return;
    try {
      const photoData = await imageFileToDataUrl(file);
      setDraft((current) => ({ ...current, [field]: photoData }));
      setFormMessage("Foto adicionada. Salve o veículo para confirmar.");
    } catch {
      setFormMessage("Não foi possível salvar a foto. Tente uma imagem menor.");
    }
  }

  function rememberVehicleSearch(plate: string, vehicle: VehicleRecord | null) {
    const normalizedPlate = normalizeVehiclePlate(plate);
    if (!normalizedPlate) return;

    const status = getVehicleOperationalStatus(vehicle);
    setRecentSearches((current) => [
      { normalizedPlate, plate: plate.trim().toUpperCase(), statusLabel: status.label, tone: status.tone },
      ...current.filter((item) => item.normalizedPlate !== normalizedPlate),
    ].slice(0, 4));
  }

  function focusParkingSearchInput() {
    window.setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 80);
  }

  function openVehicleResult(vehicle: VehicleRecord | null, term: string, termType: VehicleSearchTermType) {
    const displayTerm = term.trim().toUpperCase();
    setSearchedPlate(vehicle?.plate || displayTerm);
    setSearchedTermType(termType);
    setResultVehicle(vehicle);
    setResultOpen(true);
    setSearchResultsOpen(false);
    setSearchMessage(vehicle ? "" : termType === "plate" ? "Veículo não cadastrado." : "Nenhum veículo encontrado.");
    if (vehicle) rememberVehicleSearch(vehicle.plate, vehicle);
    else if (termType === "plate") rememberVehicleSearch(displayTerm, null);
  }

  async function searchVehicleByTerm(term: string) {
    const trimmedTerm = term.trim();
    const termType = getVehicleSearchTermType(trimmedTerm);
    const normalizedPlate = normalizeVehiclePlate(trimmedTerm);
    if (!trimmedTerm) {
      setSearchMessage("Digite placa, nome, modelo ou departamento para pesquisar.");
      focusParkingSearchInput();
      return;
    }

    const currentVehicles = vehicleState.remoteReadable ? vehicles : await refreshVehicles();
    const exactPlateVehicle = termType === "plate"
      ? currentVehicles.find((vehicle) => vehicle.normalizedPlate === normalizedPlate) ?? null
      : null;

    if (exactPlateVehicle) {
      openVehicleResult(exactPlateVehicle, trimmedTerm, "plate");
      return;
    }

    const matches = currentVehicles.filter((vehicle) => vehicleMatchesSearchTerm(vehicle, trimmedTerm));
    if (matches.length === 1) {
      openVehicleResult(matches[0], trimmedTerm, termType);
      return;
    }

    if (matches.length > 1) {
      setSearchResults(matches);
      setSearchResultsTerm(trimmedTerm);
      setSearchResultsOpen(true);
      setResultOpen(false);
      setSearchMessage(`${matches.length} veículos encontrados.`);
      return;
    }

    openVehicleResult(null, trimmedTerm, termType);
  }

  async function searchVehicle() {
    await searchVehicleByTerm(searchPlate);
  }

  async function searchVehicleByPlate(plate: string) {
    await searchVehicleByTerm(plate);
  }

  async function searchCapturedPlatePhoto(plate: string) {
    setSearchPlate(plate.trim().toUpperCase());
    await searchVehicleByTerm(plate);
    setPlatePhotoDialogOpen(false);
  }

  function startNewVehicleSearch() {
    setResultOpen(false);
    setSearchResultsOpen(false);
    setSearchResults([]);
    setSearchResultsTerm("");
    setResultVehicle(null);
    setSearchedPlate("");
    setSearchPlate("");
    setSearchMessage("");
    setCapturedPlatePhoto("");
    setPlateCaptureGuideOpen(false);
    setPlatePhotoDialogOpen(false);
    setActiveTab("search");
    focusParkingSearchInput();
  }

  function startVehicleCreate(plate = "", platePhotoData = "") {
    setDraft(createBlankVehicleDraft(plate, platePhotoData));
    setSelectedVehicleId("");
    setFormMessage("");
    setActiveTab("register");
  }

  function editVehicle(vehicle: VehicleRecord) {
    setDraft(vehicleToDraft(vehicle));
    setSelectedVehicleId(vehicle.id);
    setFormMessage("");
    setActiveTab("register");
  }

  function selectVehicleForEdit(vehicleId: string) {
    setSelectedVehicleId(vehicleId);
    const vehicle = vehicles.find((item) => item.id === vehicleId);
    if (vehicle) {
      setDraft(vehicleToDraft(vehicle));
      setFormMessage("");
    }
  }

  async function saveParkingVehicle(nextDraft = draft) {
    const normalizedPlate = normalizeVehiclePlate(nextDraft.plate);
    if (!canRegister) {
      setFormMessage("Sem permissão para cadastrar veículos.");
      return;
    }
    if (!normalizedPlate) {
      setFormMessage("Informe a placa do veículo.");
      return;
    }

    setSaving(true);
    setFormMessage("Salvando veículo...");
    try {
      const result = await saveVehicleRecord(nextDraft);
      upsertVehicleInState(result.vehicle);
      setDraft(vehicleToDraft(result.vehicle));
      setSelectedVehicleId(result.vehicle.id);
      setFormMessage(result.message);
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Não foi possível salvar o veículo.");
    } finally {
      setSaving(false);
    }
  }

  async function inactivateVehicle() {
    if (!draft.id) {
      setFormMessage("Selecione um veículo cadastrado para inativar.");
      return;
    }
    await saveParkingVehicle({ ...draft, active: false });
  }

  return (
    <section className="screen parking-screen">
      <TopBar title="Estacionamento" subtitle="Consulta rápida de placas e controle de veículos" onLogout={onLogout} />
      <button className="ghost-button" type="button" onClick={onBack}><AppIcon name="back" size="sm" className="action-icon" />Voltar para Segurança</button>
      {vehicleState.message && <p className="notice-message">{vehicleState.message}</p>}
      <div className="monitoring-tabs parking-tabs">
        <button className={activeTab === "search" ? "active" : ""} type="button" onClick={() => setActiveTab("search")}><AppIcon name="search" size="sm" className="action-icon" />Pesquisar Veículo</button>
        {canRegister && <button className={activeTab === "register" ? "active" : ""} type="button" onClick={() => setActiveTab("register")}><AppIcon name="vehicle" size="sm" className="action-icon" />Cadastro de Veículos</button>}
      </div>

      {activeTab === "search" && (
        <section className="parking-search-panel">
          <button className="scan-button parking-photo-button" type="button" onClick={openPlateCaptureGuide}><AppIcon name="camera" size="lg" className="action-icon" />Tirar foto da placa</button>
          <input ref={platePhotoFileInputRef} className="parking-photo-input" type="file" accept="image/*" capture="environment" onChange={(event) => { void handlePlatePhoto(event.target.files?.[0] ?? null); event.target.value = ""; }} />
          {capturedPlatePhoto && <VehiclePhotoPreview label="Foto da placa capturada" photoData={capturedPlatePhoto} />}
          <section className="manual-form parking-search-form">
            <label>
              Digite placa, nome, modelo ou departamento
              <input
                ref={searchInputRef}
                type="text"
                value={searchPlate}
                placeholder="Ex.: GYN-5544, Raquel, HB20, Vendas"
                autoCapitalize="characters"
                onChange={(event) => setSearchPlate(event.target.value.toUpperCase())}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void searchVehicle();
                  }
                }}
              />
            </label>
            <button className="primary-button wide-button" type="button" disabled={loading} onClick={() => { void searchVehicle(); }}><AppIcon name="search" size="sm" className="action-icon" />{loading ? "Carregando..." : "Pesquisar"}</button>
          </section>
          {searchMessage && <p className={searchMessage.includes("capturada") ? "success-message" : "notice-message"}>{searchMessage}</p>}
          {recentSearches.length > 0 && (
            <section className="parking-recent-searches" aria-label="Últimas consultas">
              <div className="parking-recent-title">
                <span>Últimas consultas</span>
                <strong>Toque para pesquisar novamente</strong>
              </div>
              <div className="parking-recent-list">
                {recentSearches.map((item) => (
                  <button
                    key={item.normalizedPlate}
                    className={`parking-recent-item vehicle-tone-${item.tone}`}
                    type="button"
                    onClick={() => {
                      setSearchPlate(item.plate);
                      void searchVehicleByPlate(item.plate);
                    }}
                  >
                    <strong>{item.plate}</strong>
                    <span>{item.statusLabel}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </section>
      )}

      {activeTab === "register" && canRegister && (
        <section className="parking-register-panel">
          <div className="button-grid">
            <button className="secondary-button" type="button" disabled={saving} onClick={() => startVehicleCreate()}><AppIcon name="vehicle" size="sm" className="action-icon" />Cadastrar novo veículo</button>
            {sortedVehicles.length > 0 && (
              <label>
                Editar veículo existente
                <select value={selectedVehicleId} disabled={saving} onChange={(event) => selectVehicleForEdit(event.target.value)}>
                  <option value="">Selecione</option>
                  {sortedVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate} - {vehicle.ownerName || "Sem nome"}</option>)}
                </select>
              </label>
            )}
          </div>
          {formMessage && <p className={formMessage.includes("salvo") || formMessage.includes("adicionada") ? "success-message" : "notice-message"}>{formMessage}</p>}
          <VehicleRegisterForm draft={draft} saving={saving} onDraftChange={setDraft} onPhotoChange={handleDraftPhoto} onSave={() => { void saveParkingVehicle(); }} onInactivate={() => { void inactivateVehicle(); }} />
        </section>
      )}

      {resultOpen && (
        <VehicleResultDialog
          plate={searchedPlate}
          vehicle={resultVehicle}
          canRegister={resultVehicle ? canRegister : canRegister && searchedTermType === "plate"}
          onClose={() => setResultOpen(false)}
          onNewSearch={startNewVehicleSearch}
          onRegister={() => {
            setResultOpen(false);
            startVehicleCreate(searchedPlate, capturedPlatePhoto);
          }}
          onEdit={(vehicle) => {
            setResultOpen(false);
            editVehicle(vehicle);
          }}
        />
      )}

      {searchResultsOpen && (
        <VehicleSearchResultsDialog
          term={searchResultsTerm}
          vehicles={searchResults}
          onClose={() => setSearchResultsOpen(false)}
          onNewSearch={startNewVehicleSearch}
          onSelect={(vehicle) => openVehicleResult(vehicle, vehicle.plate, "plate")}
        />
      )}

      {plateCaptureGuideOpen && (
        <PlateCaptureGuideDialog
          onClose={() => setPlateCaptureGuideOpen(false)}
          onCapture={requestPlatePhotoCapture}
        />
      )}

      {platePhotoDialogOpen && capturedPlatePhoto && (
        <PlatePhotoSearchDialog
          photoData={capturedPlatePhoto}
          initialPlate={searchPlate}
          knownPlates={knownParkingPlates}
          onClose={() => setPlatePhotoDialogOpen(false)}
          onRetake={retakePlatePhoto}
          onSearch={(plate) => searchCapturedPlatePhoto(plate)}
        />
      )}
    </section>
  );
}

function PlateCaptureGuideDialog({ onClose, onCapture }: { onClose: () => void; onCapture: () => void }) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog plate-capture-guide-dialog" role="dialog" aria-modal="true" aria-label="Orientação para fotografar placa">
        <div className="plate-photo-dialog-head">
          <p className="card-kicker">Estacionamento</p>
          <h2>Foto da placa</h2>
          <p>Encaixe a placa dentro da moldura.</p>
        </div>
        <div className="plate-capture-frame" aria-label="Moldura para enquadrar a placa">
          <span>Encaixe a placa aqui</span>
        </div>
        <ul className="plate-capture-tips">
          <li>Aproxime o celular.</li>
          <li>Evite reflexo.</li>
          <li>Mantenha a placa reta.</li>
          <li>Prefira foto horizontal se possível.</li>
        </ul>
        <div className="button-grid">
          <button className="primary-button" type="button" onClick={onCapture}><AppIcon name="camera" size="sm" className="action-icon" />Abrir câmera</button>
          <button className="ghost-button" type="button" onClick={onClose}>Cancelar</button>
        </div>
      </section>
    </div>
  );
}

function PlatePhotoSearchDialog({ photoData, initialPlate, knownPlates, onClose, onRetake, onSearch }: { photoData: string; initialPlate: string; knownPlates: string[]; onClose: () => void; onRetake: () => void; onSearch: (plate: string) => Promise<void> }) {
  const plateInputRef = useRef<HTMLInputElement | null>(null);
  const plateEditedRef = useRef(false);
  const [platePhotoDraftPlate, setPlatePhotoDraftPlate] = useState(initialPlate.trim().toUpperCase());
  const [plateOcrMessage, setPlateOcrMessage] = useState("Digite a placa vista na foto ou aguarde a tentativa de leitura automática.");
  const [plateOcrRunning, setPlateOcrRunning] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const focusTimer = window.setTimeout(() => {
      plateInputRef.current?.focus();
      plateInputRef.current?.select();
    }, 80);
    return () => window.clearTimeout(focusTimer);
  }, []);

  useEffect(() => {
    let active = true;
    setPlateOcrRunning(true);
    setPlateOcrMessage("Tentando ler a placa...");

    recognizePlateFromPhoto(photoData, knownPlates)
      .then((result) => {
        if (!active) return;
        if (result.plate) {
          const userAlreadyTyped = plateEditedRef.current;
          if (!userAlreadyTyped) setPlatePhotoDraftPlate(result.plate);
          const suggestionMessage = result.source === "known-fuzzy" ? `Placa provável pela base: ${result.plate}. Confira antes de pesquisar.` : `Placa sugerida: ${result.plate}. Confira antes de pesquisar.`;
          setPlateOcrMessage(userAlreadyTyped ? `Leitura sugeriu: ${result.plate}. Mantive a placa digitada para conferência.` : suggestionMessage);
          window.setTimeout(() => {
            plateInputRef.current?.focus();
            plateInputRef.current?.select();
          }, 40);
          return;
        }
        setPlateOcrMessage(result.source === "ambiguous" ? "Encontrei mais de uma possibilidade. Digite a placa vista na foto." : "Não consegui identificar com segurança. Digite a placa vista na foto ou refaça a foto mais próxima.");
      })
      .catch(() => {
        if (active) setPlateOcrMessage("Não consegui identificar com segurança. Digite a placa vista na foto ou refaça a foto mais próxima.");
      })
      .finally(() => {
        if (active) setPlateOcrRunning(false);
      });

    return () => { active = false; };
  }, [photoData, knownPlates]);

  async function submitPlateSearch() {
    if (!normalizeVehiclePlate(platePhotoDraftPlate)) {
      setPlateOcrMessage("Confira ou digite a placa para pesquisar.");
      plateInputRef.current?.focus();
      return;
    }

    setSearching(true);
    setPlateOcrMessage("Pesquisando veículo...");
    try {
      await onSearch(platePhotoDraftPlate);
    } catch {
      setPlateOcrMessage("Não foi possível pesquisar agora. Tente novamente.");
      setSearching(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog plate-photo-dialog" role="dialog" aria-modal="true" aria-label="Conferir placa fotografada">
        <div className="plate-photo-dialog-head">
          <p className="card-kicker">Foto capturada</p>
          <h2>Confira a placa</h2>
        </div>
        <VehiclePhotoPreview label="Foto da placa capturada" photoData={photoData} />
        <p className="plate-photo-caption">Quanto mais próxima e reta estiver a placa, melhor a leitura.</p>
        <section className="manual-form plate-photo-search-form">
          <label>
            Confira ou digite a placa
            <input
              ref={plateInputRef}
              type="text"
              value={platePhotoDraftPlate}
              placeholder="Ex.: GJU-6539"
              autoCapitalize="characters"
              autoComplete="off"
              autoFocus
              disabled={searching}
              onChange={(event) => {
                plateEditedRef.current = true;
                setPlatePhotoDraftPlate(event.target.value.toUpperCase());
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void submitPlateSearch();
                }
              }}
            />
          </label>
          <button className="primary-button plate-photo-search-button" type="button" disabled={searching} onClick={() => { void submitPlateSearch(); }}><AppIcon name="search" size="sm" className="action-icon" />{searching ? "Pesquisando..." : "Pesquisar veículo"}</button>
          {plateOcrMessage && <p className="notice-message">{plateOcrMessage}</p>}
          <div className="button-grid plate-photo-actions">
            <button className="secondary-button" type="button" disabled={searching} onClick={onRetake}><AppIcon name="camera" size="sm" className="action-icon" />Refazer foto</button>
            <button className="ghost-button plate-photo-cancel-button" type="button" disabled={searching} onClick={onClose}>Cancelar</button>
          </div>
        </section>
      </section>
    </div>
  );
}

function VehicleRegisterForm({ draft, saving, onDraftChange, onPhotoChange, onSave, onInactivate }: { draft: VehicleRecordDraft; saving: boolean; onDraftChange: (draft: VehicleRecordDraft) => void; onPhotoChange: (file: File | null, field: "carPhotoData" | "platePhotoData") => void; onSave: () => void; onInactivate: () => void }) {
  return (
    <section className="manual-form parking-register-form">
      <label>Placa<input type="text" value={draft.plate} placeholder="Ex.: GJU-6539" disabled={saving} autoCapitalize="characters" onChange={(event) => onDraftChange({ ...draft, plate: event.target.value.toUpperCase() })} /></label>
      <label>Tipo de vínculo<select value={draft.ownerType} disabled={saving} onChange={(event) => onDraftChange({ ...draft, ownerType: event.target.value as VehicleRecordDraft["ownerType"] })}>{vehicleOwnerTypes.map((ownerType) => <option key={ownerType} value={ownerType}>{ownerType}</option>)}</select></label>
      <label>Nome<input type="text" value={draft.ownerName} disabled={saving} onChange={(event) => onDraftChange({ ...draft, ownerName: event.target.value })} /></label>
      <label>Departamento<input type="text" value={draft.department} disabled={saving} onChange={(event) => onDraftChange({ ...draft, department: event.target.value })} /></label>
      <label>Marca<input type="text" value={draft.brand} disabled={saving} onChange={(event) => onDraftChange({ ...draft, brand: event.target.value })} /></label>
      <label>Modelo<input type="text" value={draft.model} disabled={saving} onChange={(event) => onDraftChange({ ...draft, model: event.target.value })} /></label>
      <label>Cor<input type="text" value={draft.color} disabled={saving} onChange={(event) => onDraftChange({ ...draft, color: event.target.value })} /></label>
      <div className="parking-photo-grid">
        <VehiclePhotoField label="Foto do carro" photoData={draft.carPhotoData} disabled={saving} onChange={(file) => onPhotoChange(file, "carPhotoData")} onRemove={() => onDraftChange({ ...draft, carPhotoData: undefined })} />
        <VehiclePhotoField label="Foto da placa" photoData={draft.platePhotoData} disabled={saving} onChange={(file) => onPhotoChange(file, "platePhotoData")} onRemove={() => onDraftChange({ ...draft, platePhotoData: undefined })} />
      </div>
      <label className="checkbox-row"><input type="checkbox" checked={draft.parkingAuthorized} disabled={saving} onChange={(event) => onDraftChange({ ...draft, parkingAuthorized: event.target.checked })} /><span>Autorizado a estacionar</span></label>
      <label className="checkbox-row"><input type="checkbox" checked={draft.parkingPriority} disabled={saving} onChange={(event) => onDraftChange({ ...draft, parkingPriority: event.target.checked })} /><span>Prioridade de vaga</span></label>
      <label className="checkbox-row"><input type="checkbox" checked={draft.active} disabled={saving} onChange={(event) => onDraftChange({ ...draft, active: event.target.checked })} /><span>Veículo ativo</span></label>
      <label>Observações<textarea rows={3} value={draft.notes} disabled={saving} onChange={(event) => onDraftChange({ ...draft, notes: event.target.value })} /></label>
      <div className="button-grid">
        <button className="primary-button" type="button" disabled={saving} onClick={onSave}><AppIcon name="save" size="sm" className="action-icon" />{saving ? "Salvando..." : "Salvar veículo"}</button>
        <button className="secondary-button" type="button" disabled={saving || !draft.id || !draft.active} onClick={onInactivate}><AppIcon name="blocked" size="sm" className="action-icon" />Inativar veículo</button>
      </div>
    </section>
  );
}

function VehiclePhotoField({ label, photoData, disabled, onChange, onRemove }: { label: string; photoData?: string; disabled: boolean; onChange: (file: File | null) => void; onRemove: () => void }) {
  return (
    <article className="vehicle-photo-field">
      <VehiclePhotoPreview label={label} photoData={photoData} />
      <label className="photo-button">
        <AppIcon name="camera" size="sm" className="action-icon" />{label}
        <input type="file" accept="image/*" capture="environment" disabled={disabled} onChange={(event) => { onChange(event.target.files?.[0] ?? null); event.target.value = ""; }} />
      </label>
      {photoData && <button className="ghost-button" type="button" disabled={disabled} onClick={onRemove}><AppIcon name="blocked" size="sm" className="action-icon" />Remover foto</button>}
    </article>
  );
}

function VehiclePhotoPreview({ label, photoData }: { label: string; photoData?: string }) {
  return <div className="vehicle-photo-preview" aria-label={label}>{photoData ? <img src={photoData} alt={label} /> : <span>{label}</span>}</div>;
}

function VehicleSearchResultsDialog({ term, vehicles, onClose, onNewSearch, onSelect }: { term: string; vehicles: VehicleRecord[]; onClose: () => void; onNewSearch: () => void; onSelect: (vehicle: VehicleRecord) => void }) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog vehicle-search-results-dialog" role="dialog" aria-modal="true" aria-label="Resultados da pesquisa de veículos">
        <div className="vehicle-result-head">
          <div>
            <p className="card-kicker">Resultados</p>
            <h2>{vehicles.length} veículos encontrados</h2>
          </div>
          <span className="vehicle-status-pill">Busca: {term}</span>
        </div>
        <div className="vehicle-search-results-list">
          {vehicles.map((vehicle) => {
            const status = getVehicleOperationalStatus(vehicle);
            return (
              <button key={vehicle.id} className={`vehicle-search-result-item vehicle-tone-${status.tone}`} type="button" onClick={() => onSelect(vehicle)}>
                <span className="vehicle-search-result-plate">{vehicle.plate}</span>
                <strong>{vehicle.ownerName || "Sem nome"}</strong>
                <span>{vehicle.department || "Departamento não informado"}</span>
                <small>{[vehicle.brand, vehicle.model, vehicle.color].filter(Boolean).join(" - ") || "Veículo sem detalhes"}</small>
                <em>{status.label}</em>
              </button>
            );
          })}
        </div>
        <div className="button-grid">
          <button className="primary-button" type="button" onClick={onNewSearch}><AppIcon name="search" size="sm" className="action-icon" />Nova consulta</button>
          <button className="ghost-button" type="button" onClick={onClose}>Fechar</button>
        </div>
      </section>
    </div>
  );
}

function VehicleResultDialog({ plate, vehicle, canRegister, onClose, onNewSearch, onRegister, onEdit }: { plate: string; vehicle: VehicleRecord | null; canRegister: boolean; onClose: () => void; onNewSearch: () => void; onRegister: () => void; onEdit: (vehicle: VehicleRecord) => void }) {
  const status = getVehicleOperationalStatus(vehicle);
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog vehicle-result-dialog" role="dialog" aria-modal="true" aria-label="Resultado da pesquisa de veículo">
        <div className={`vehicle-status-hero vehicle-tone-${status.tone}`}>
          <span>Status operacional</span>
          <strong>{status.label}</strong>
          <p>{status.message}</p>
        </div>
        {vehicle ? (
          <>
            <div className="vehicle-result-head">
              <div>
                <p className="card-kicker">Placa</p>
                <h2>{vehicle.plate}</h2>
              </div>
              <span className={`vehicle-status-pill vehicle-tone-${status.tone}`}>{vehicle.active ? "Cadastro ativo" : "Cadastro inativo"}</span>
            </div>
            <div className="vehicle-result-grid">
              <VehicleResultField label="Placa" value={vehicle.plate} />
              <VehicleResultField label="Nome" value={vehicle.ownerName || "Não informado"} />
              <VehicleResultField label="Departamento" value={vehicle.department || "Não informado"} />
              <VehicleResultField label="Tipo de vínculo" value={vehicle.ownerType} />
              <VehicleResultField label="Marca" value={vehicle.brand || "Não informado"} />
              <VehicleResultField label="Modelo" value={vehicle.model || "Não informado"} />
              <VehicleResultField label="Cor" value={vehicle.color || "Não informado"} />
              <VehicleResultField label="Autorizado a estacionar" value={vehicle.parkingAuthorized ? "Sim" : "Não"} />
              <VehicleResultField label="Prioridade de vaga" value={vehicle.parkingPriority ? "Sim" : "Não"} />
              <VehicleResultField label="Observações" value={vehicle.notes || "Sem observações"} wide />
            </div>
            <div className="parking-photo-grid">
              <VehiclePhotoPreview label="Foto do carro" photoData={vehicle.carPhotoData} />
              <VehiclePhotoPreview label="Foto da placa" photoData={vehicle.platePhotoData} />
            </div>
            <div className="button-grid">
              <button className="primary-button" type="button" onClick={onNewSearch}><AppIcon name="search" size="sm" className="action-icon" />Nova consulta</button>
              <button className="ghost-button" type="button" onClick={onClose}>Fechar</button>
              {canRegister && <button className="secondary-button" type="button" onClick={() => onEdit(vehicle)}><AppIcon name="edit" size="sm" className="action-icon" />Editar cadastro</button>}
            </div>
          </>
        ) : (
          <>
            <div className="vehicle-result-grid">
              <VehicleResultField label="Placa pesquisada" value={plate || "Não informada"} wide />
            </div>
            <div className="button-grid">
              <button className="primary-button" type="button" onClick={onNewSearch}><AppIcon name="search" size="sm" className="action-icon" />Nova consulta</button>
              <button className="ghost-button" type="button" onClick={onClose}>Fechar</button>
              {canRegister && <button className="secondary-button" type="button" onClick={onRegister}><AppIcon name="vehicle" size="sm" className="action-icon" />Cadastrar este veículo</button>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function VehicleResultField({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={wide ? "vehicle-result-field wide" : "vehicle-result-field"}><span>{label}</span><strong>{value}</strong></div>;
}

function useGuardMonitoringData() {
  const [dateFilter, setDateFilter] = useState(() => getTodayIso());
  const [guardFilter, setGuardFilter] = useState<MonitoringGuardFilter>("all");
  const [statusFilter, setStatusFilter] = useState<MonitoringStatusFilter>("all");
  const [monitoringState, setMonitoringState] = useState<GuardMonitoringLoadState>({
    entries: [],
    remoteReadable: false,
    remoteProtected: false,
    message: "Carregando registros de entrada e encerramento...",
  });
  const [roundState, setRoundState] = useState<GuardRoundLoadState>({
    points: DEFAULT_GUARD_ROUND_POINTS,
    schedules: DEFAULT_GUARD_ROUND_SCHEDULES,
    entries: [],
    remoteReadable: false,
    remoteProtected: false,
    message: "Carregando rondas...",
  });
  const [loading, setLoading] = useState(true);
  const [roundsLoading, setRoundsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadGuardMonitoringEntries()
      .then((state) => {
        if (active) setMonitoringState(state);
      })
      .catch(() => {
        if (!active) return;
        setMonitoringState({
          entries: [],
          remoteReadable: false,
          remoteProtected: false,
          message: "Não foi possível carregar os registros de monitoramento.",
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setRoundsLoading(true);
    loadGuardRoundReport()
      .then((state) => {
        if (active) setRoundState(state);
      })
      .catch(() => {
        if (!active) return;
        setRoundState({
          points: DEFAULT_GUARD_ROUND_POINTS,
          schedules: DEFAULT_GUARD_ROUND_SCHEDULES,
          entries: [],
          remoteReadable: false,
          remoteProtected: false,
          message: "Não foi possível carregar o relatório de rondas.",
        });
      })
      .finally(() => {
        if (active) setRoundsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const shiftSummaries = useMemo(() => buildMonitoringShiftSummaries(
    monitoringState.entries,
    roundState.entries,
    roundState.points,
    roundState.schedules,
  ), [monitoringState.entries, roundState.entries, roundState.points, roundState.schedules]);
  const filteredShiftSummaries = useMemo(() => shiftSummaries.filter((summary) => (
    matchesMonitoringDate(summary.scheduledDate, dateFilter)
    && matchesMonitoringGuardName(summary.guardName, guardFilter)
    && matchesMonitoringSummaryStatus(summary, statusFilter)
  )), [dateFilter, guardFilter, shiftSummaries, statusFilter]);
  const filteredShiftIds = useMemo(() => new Set(filteredShiftSummaries.map((summary) => summary.shiftSessionId)), [filteredShiftSummaries]);
  const overviewMetrics = useMemo(() => getMonitoringOverviewMetrics(filteredShiftSummaries), [filteredShiftSummaries]);
  const filteredEntries = useMemo(() => monitoringState.entries.filter((entry) => filteredShiftIds.has(entry.id)), [filteredShiftIds, monitoringState.entries]);
  const filteredRoundEntries = useMemo(() => roundState.entries.filter((entry) => filteredShiftIds.has(entry.shiftSessionId)), [filteredShiftIds, roundState.entries]);

  return {
    dateFilter,
    filteredEntries,
    filteredRoundEntries,
    filteredShiftSummaries,
    guardFilter,
    loading,
    monitoringState,
    overviewMetrics,
    roundState,
    roundsLoading,
    setDateFilter,
    setGuardFilter,
    setStatusFilter,
    shiftSummaries,
    statusFilter,
  };
}

function SecurityMonitoringScreen({ onBack, onLogout }: { onBack: () => void; onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<MonitoringTab>("entries");
  const {
    dateFilter,
    filteredEntries,
    filteredRoundEntries,
    filteredShiftSummaries,
    guardFilter,
    loading,
    monitoringState,
    overviewMetrics,
    roundState,
    roundsLoading,
    setDateFilter,
    setGuardFilter,
    setStatusFilter,
    statusFilter,
  } = useGuardMonitoringData();
  const monitoringAlerts = useMemo(() => buildMonitoringAlerts(filteredShiftSummaries, activeTab), [activeTab, filteredShiftSummaries]);
  const showOperationalSummary = activeTab === "entries" || activeTab === "rounds";

  return (
    <section className="screen monitoring-screen">
      <TopBar title="Monitoramento de Guardas" subtitle="Relatórios de entrada, saída e rondas" onLogout={onLogout} />
      <button className="ghost-button" type="button" onClick={onBack}><AppIcon name="back" size="sm" className="action-icon" />Voltar para Segurança</button>
      <div className="monitoring-tabs" role="tablist" aria-label="Relatórios de monitoramento">
        <button className={activeTab === "entries" ? "active" : ""} type="button" onClick={() => setActiveTab("entries")}><AppIcon name="security" size="sm" className="action-icon" />Entrada / Ativação de Serviço</button>
        <button className={activeTab === "rounds" ? "active" : ""} type="button" onClick={() => setActiveTab("rounds")}><AppIcon name="guards" size="sm" className="action-icon" />Rondas</button>
        <button className={activeTab === "qrcode" ? "active" : ""} type="button" onClick={() => setActiveTab("qrcode")}><AppIcon name="qr" size="sm" className="action-icon" />QR Code</button>
      </div>

      {activeTab !== "qrcode" && (
        <>
          <MonitoringGlobalFilters
            dateFilter={dateFilter}
            guardFilter={guardFilter}
            statusFilter={statusFilter}
            onDateFilterChange={setDateFilter}
            onGuardFilterChange={setGuardFilter}
            onStatusFilterChange={setStatusFilter}
          />
          {showOperationalSummary && (
            <>
              <MonitoringAlertsPanel alerts={monitoringAlerts} />
              <MonitoringOverviewCards metrics={overviewMetrics} />
              <ShiftSummarySection loading={loading || roundsLoading} summaries={filteredShiftSummaries} />
            </>
          )}
        </>
      )}

      {activeTab === "entries" && (
        <section className="monitoring-panel">
          {monitoringState.message && <p className={monitoringState.remoteReadable ? "success-message" : "notice-message"}>{monitoringState.message}</p>}
          {loading && <article className="monitoring-card"><strong>Carregando registros...</strong></article>}
          {!loading && filteredEntries.length === 0 && <article className="empty-state">Nenhum registro de ativação encontrado.</article>}
          {!loading && filteredEntries.length > 0 && (
            <div className="monitoring-list">
              {filteredEntries.map((entry) => <MonitoringEntryCard key={entry.id} entry={entry} />)}
            </div>
          )}
        </section>
      )}

      {activeTab === "rounds" && (
        <section className="monitoring-panel">
          {roundState.message && <p className={roundState.remoteReadable ? "success-message" : "notice-message"}>{roundState.message}</p>}
          <article className="monitoring-card rounds-config-card">
            <span>RONDAS</span>
            <strong>Pontos e horários programados</strong>
            <div className="round-schedule-strip">
              {sortRoundSchedulesForDisplay(roundState.schedules).map((schedule) => <b key={schedule.id}>{schedule.scheduledTime}</b>)}
            </div>
            <ol className="round-point-sequence">
              {sortRoundPointsForDisplay(roundState.points).map((point) => <li key={point.id}>{point.name}</li>)}
            </ol>
          </article>
          {roundsLoading && <article className="monitoring-card"><strong>Carregando rondas...</strong></article>}
          {!roundsLoading && <RoundScheduleReport entries={filteredRoundEntries} points={roundState.points} schedules={roundState.schedules} shiftSummaries={filteredShiftSummaries} />}
        </section>
      )}

      {activeTab === "qrcode" && (
        <section className="monitoring-panel monitoring-qrcode-panel">
          <RoundQrCodesPanel points={roundState.points} />
        </section>
      )}

    </section>
  );
}

function SecurityGuardsPaymentScreen({ onBack, onLogout }: { onBack: () => void; onLogout: () => void }) {

  return (
    <section className="screen monitoring-screen guards-payment-screen">
      <TopBar title="Fechamento / Pagamento" subtitle="Conferência dos plantões dos guardas" onLogout={onLogout} />
      <button className="ghost-button" type="button" onClick={onBack}><AppIcon name="back" size="sm" className="action-icon" />Voltar para Guardas</button>
      <PaymentReportSection />
    </section>
  );
}

function MonitoringAlertsPanel({ alerts }: { alerts: MonitoringAlert[] }) {
  if (alerts.length === 0) {
    return (
      <section className="monitoring-alerts-panel" aria-label="Alertas do monitoramento">
        <div className="monitoring-alerts-title">
          <span>ALERTAS DO MONITORAMENTO</span>
          <strong>Tudo certo no monitoramento selecionado.</strong>
        </div>
        <article className="monitoring-alert-card alert-ok">
          <span><AppIcon name="success" size="sm" className="status-icon icon-success" />Tudo certo</span>
          <p>Nenhum alerta para os filtros atuais.</p>
        </article>
      </section>
    );
  }

  return (
    <section className="monitoring-alerts-panel" aria-label="Alertas do monitoramento">
      <div className="monitoring-alerts-title">
        <span>ALERTAS DO MONITORAMENTO</span>
        <strong>{alerts.length} alerta(s) para os filtros atuais</strong>
      </div>
      <div className="monitoring-alert-list">
        {alerts.map((alert) => (
          <article className={`monitoring-alert-card alert-${alert.level}`} key={alert.id}>
            <span><AppIcon name={alert.level === "danger" ? "blocked" : "warning"} size="sm" className={`status-icon ${alert.level === "danger" ? "icon-danger" : "icon-warning"}`} />{alert.title}</span>
            <p>{alert.message}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function MonitoringOverviewCards({ metrics }: { metrics: MonitoringOverviewMetrics }) {
  const cards = [
    { label: "Plantões registrados hoje", value: metrics.registeredShifts },
    { label: "Plantões ativos agora", value: metrics.activeShifts },
    { label: "Rondas previstas", value: metrics.roundsExpected },
    { label: "Rondas completas", value: metrics.roundsComplete },
    { label: "Pontos registrados", value: metrics.pointsRegistered },
    { label: "Pontos pendentes", value: metrics.pointsPending },
    { label: "Atrasos", value: metrics.lateCount },
    { label: "Fora de sequência", value: metrics.outOfSequenceCount },
  ];

  return (
    <section className="monitoring-overview-grid" aria-label="Resumo gerencial do monitoramento">
      {cards.map((card) => (
        <article className="monitoring-overview-card" key={card.label}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
        </article>
      ))}
    </section>
  );
}

function MonitoringGlobalFilters({
  dateFilter,
  guardFilter,
  statusFilter,
  onDateFilterChange,
  onGuardFilterChange,
  onStatusFilterChange,
}: {
  dateFilter: string;
  guardFilter: MonitoringGuardFilter;
  statusFilter: MonitoringStatusFilter;
  onDateFilterChange: (value: string) => void;
  onGuardFilterChange: (value: MonitoringGuardFilter) => void;
  onStatusFilterChange: (value: MonitoringStatusFilter) => void;
}) {
  return (
    <div className="monitoring-filters monitoring-global-filters">
      <label>Data<input type="date" value={dateFilter} onChange={(event) => onDateFilterChange(event.target.value)} /></label>
      <label>Guarda<select value={guardFilter} onChange={(event) => onGuardFilterChange(event.target.value as MonitoringGuardFilter)}><option value="all">Todos</option>{guardNames.map((guardName) => <option key={guardName} value={guardName}>{guardName}</option>)}</select></label>
      <label>Status<select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value as MonitoringStatusFilter)}><option value="all">Todos</option><option value="ok">OK</option><option value="late">Atrasado</option><option value="out_of_sequence">Fora de sequência</option><option value="pending">Pendente</option></select></label>
    </div>
  );
}

function ShiftSummarySection({ loading, summaries }: { loading: boolean; summaries: MonitoringShiftSummary[] }) {
  return (
    <section className="shift-summary-section" aria-label="Resumo do plantão">
      <div className="round-report-title">
        <span>RESUMO DO PLANTÃO</span>
        <strong>Visão gerencial por serviço</strong>
      </div>
      {loading && <article className="monitoring-card"><strong>Carregando resumo do plantão...</strong></article>}
      {!loading && summaries.length === 0 && <article className="empty-state">Nenhum plantão encontrado para os filtros atuais.</article>}
      {!loading && summaries.length > 0 && (
        <div className="shift-summary-list">
          {summaries.map((summary) => <ShiftSummaryCard key={summary.id} summary={summary} />)}
        </div>
      )}
    </section>
  );
}

function ShiftSummaryCard({ summary }: { summary: MonitoringShiftSummary }) {
  return (
    <article className="monitoring-card shift-summary-card">
      <div className="monitoring-card-head">
        <div>
          <span>{formatDateOnly(summary.scheduledDate)}</span>
          <strong>{summary.guardName}</strong>
        </div>
        <em className={`monitoring-status shift-${summary.status}`}>{formatShiftSummaryStatus(summary.status)}</em>
      </div>
      <div className="shift-summary-times">
        <small>Entrada<b>{formatShiftSummaryEntry(summary)}</b></small>
        <small>Saída<b>{formatShiftSummaryExit(summary)}</b></small>
      </div>
      <div className="monitoring-compact-grid shift-summary-grid">
        <small>Rondas previstas<b>{summary.roundsExpected}</b></small>
        <small>Rondas completas<b>{summary.roundsComplete}</b></small>
        <small>Pontos registrados<b>{summary.pointsRegistered}/{summary.pointsExpected}</b></small>
        <small>Pendentes<b>{summary.pointsPending}</b></small>
        <small>Atrasos<b>{summary.lateCount}</b></small>
        <small>Fora de sequência<b>{summary.outOfSequenceCount}</b></small>
      </div>
    </article>
  );
}

function PaymentReportSection() {
  const defaultPeriod = useMemo(() => getDefaultPaymentPeriod(), []);
  const [periodStart, setPeriodStart] = useState(defaultPeriod.start);
  const [periodEnd, setPeriodEnd] = useState(defaultPeriod.end);
  const [paymentDate, setPaymentDate] = useState(defaultPeriod.paymentDate);
  const [closingStatus, setClosingStatus] = useState<GuardPaymentStatus>("PENDENTE");
  const [paymentState, setPaymentState] = useState<GuardPaymentLoadState>({
    profiles: [],
    records: [],
    remoteReadable: false,
    remoteProtected: false,
  });
  const [paymentLoading, setPaymentLoading] = useState(true);
  const [profileDrafts, setProfileDrafts] = useState<Record<GuardId, GuardPaymentProfile>>(() => buildPaymentProfileDrafts([]));
  const [extras, setExtras] = useState<Record<GuardId, GuardPaymentExtra[]>>({ "carlos-clemente": [], salomao: [] });
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");

  useEffect(() => {
    let active = true;
    setPaymentLoading(true);
    setPaymentError("");
    loadGuardPaymentData()
      .then((state) => {
        if (!active) return;
        setPaymentState(state);
        setProfileDrafts(buildPaymentProfileDrafts(state.profiles));
        setPaymentError(getPaymentLoadErrorMessage(state.message));
      })
      .catch(() => {
        if (!active) return;
        setPaymentState({
          profiles: [],
          records: [],
          remoteReadable: false,
          remoteProtected: false,
          message: "Não foi possível carregar dados de pagamento.",
        });
        setPaymentError("Erro ao carregar dados de pagamento.");
      })
      .finally(() => {
        if (active) setPaymentLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const closingRows = useMemo(() => buildGuardPaymentClosingRows({
    extras,
    periodEnd,
    periodStart,
    profiles: profileDrafts,
  }), [extras, periodEnd, periodStart, profileDrafts]);
  const totalGeneral = useMemo(() => closingRows.reduce((total, row) => total + row.totalAmount, 0), [closingRows]);
  const totalExtras = useMemo(() => closingRows.reduce((total, row) => total + row.extras.length, 0), [closingRows]);
  const financeMessage = useMemo(() => buildFinanceMessage(closingRows, periodStart, periodEnd), [closingRows, periodEnd, periodStart]);
  const paymentSheetText = useMemo(() => buildPaymentSheetText(closingRows, paymentDate, periodStart, periodEnd, closingStatus), [closingRows, closingStatus, paymentDate, periodEnd, periodStart]);
  const loading = paymentLoading;

  function updateProfileDraft(guardId: GuardId, field: keyof GuardPaymentProfile, value: string) {
    setProfileDrafts((current) => ({
      ...current,
      [guardId]: {
        ...current[guardId],
        [field]: value,
      },
    }));
  }

  async function handleSaveProfile(guardId: GuardId) {
    setPaymentError("");
    try {
      const result = await saveGuardPaymentProfile(profileDrafts[guardId]);
      setPaymentState((current) => ({
        ...current,
        profiles: upsertProfileList(current.profiles, result.profile),
      }));
      setProfileDrafts((current) => ({ ...current, [guardId]: result.profile }));
      setCopyMessage(result.message);
    } catch {
      setPaymentError("Erro ao salvar dados de pagamento.");
    }
  }

  function handleAddExtra(guardId: GuardId) {
    setExtras((current) => ({
      ...current,
      [guardId]: [...current[guardId], createGuardPaymentExtra(guardId)],
    }));
  }

  function handleUpdateExtra(guardId: GuardId, extraId: string, field: keyof GuardPaymentExtra, value: string) {
    setExtras((current) => ({
      ...current,
      [guardId]: current[guardId].map((extra) => extra.id === extraId ? updateGuardPaymentExtra(extra, field, value) : extra),
    }));
  }

  function handleRemoveExtra(guardId: GuardId, extraId: string) {
    setExtras((current) => ({
      ...current,
      [guardId]: current[guardId].filter((extra) => extra.id !== extraId),
    }));
  }

  async function handleCopyFinanceMessage() {
    const copied = await copyToClipboard(financeMessage);
    setCopyMessage(copied ? "Mensagem para financeiro copiada." : "Não foi possível copiar a mensagem.");
  }

  async function handleCopyPaymentRows() {
    const copied = await copyToClipboard(paymentSheetText);
    setCopyMessage(copied ? "Linhas para PAGAMENTOS copiadas." : "Não foi possível copiar as linhas para PAGAMENTOS.");
  }

  async function handleSaveClosing() {
    setPaymentError("");
    try {
      const records = buildPaymentRecordsFromClosingRows(closingRows, paymentDate, periodStart, periodEnd, closingStatus, financeMessage);
      const result = await saveGuardPaymentRecords(records);
      setPaymentState((current) => ({
        ...current,
        records: mergePaymentRecords(current.records, result.records),
      }));
      setCopyMessage(result.message);
    } catch {
      setPaymentError("Erro ao salvar pagamento.");
    }
  }

  async function handleUpdateRecordStatus(recordId: string, status: GuardPaymentStatus) {
    setPaymentError("");
    try {
      const result = await updateGuardPaymentRecordStatus(recordId, status);
      setPaymentState((current) => ({
        ...current,
        records: result.record ? mergePaymentRecords(current.records, [result.record]) : current.records,
      }));
      setCopyMessage(result.message);
    } catch {
      setPaymentError("Erro ao salvar pagamento.");
    }
  }

  return (
    <section className="payment-report-section payment-report-print-area" aria-label="Fechamento e pagamento dos guardas">
      <div className="payment-report-head">
        <div>
          <span>FECHAMENTO / PAGAMENTO</span>
          <strong>Fluxo oficial Santa Maria</strong>
          <p>Base quinzenal fixa de {formatCurrencyBRL(GUARD_PAYMENT_BASE_AMOUNT)} por guarda. Plantões normais entram como conferência, sem diária automática.</p>
        </div>
        <div className="payment-report-actions">
          <button className="secondary-button" type="button" onClick={handleCopyFinanceMessage} disabled={loading}>Copiar mensagem</button>
          <button className="secondary-button" type="button" onClick={handleCopyPaymentRows} disabled={loading}>Copiar linhas para PAGAMENTOS</button>
          <button className="secondary-button" type="button" onClick={handleSaveClosing} disabled={loading}>Salvar fechamento</button>
        </div>
      </div>

      {paymentError && <p className="notice-message">{paymentError}</p>}
      {copyMessage && <p className={copyMessage.includes("copiada") || copyMessage.includes("copiadas") || copyMessage.includes("salvo") ? "success-message" : "notice-message"}>{copyMessage}</p>}
      {loading && <article className="monitoring-card"><strong>Carregando fechamento...</strong></article>}

      <section className="payment-config-grid">
        <article className="monitoring-card payment-config-card">
          <span>CONFIGURAÇÃO DO PERÍODO</span>
          <div className="payment-form-grid">
            <label>Data inicial<input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></label>
            <label>Data final<input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label>
            <label>Data do pagamento<input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /></label>
            <label>Status do fechamento<select value={closingStatus} onChange={(event) => setClosingStatus(event.target.value as GuardPaymentStatus)}>{guardPaymentStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
          </div>
        </article>

        <article className="monitoring-card payment-total-card">
          <span>RESUMO FINANCEIRO</span>
          <strong>{formatCurrencyBRL(totalGeneral)}</strong>
          <div className="payment-mini-grid">
            <small>Base por guarda<b>{formatCurrencyBRL(GUARD_PAYMENT_BASE_AMOUNT)}</b></small>
            <small>Extras lançados<b>{totalExtras}</b></small>
            <small>Guardas<b>{closingRows.length}</b></small>
            <small>Status<b>{closingStatus}</b></small>
          </div>
        </article>
      </section>

      <section className="payment-profile-section">
        <PaymentProfileSummary profiles={profileDrafts} editing={showProfileEditor} onToggle={() => setShowProfileEditor((current) => !current)} />
        {showProfileEditor && (
          <div className="payment-profile-grid">
            {guardNames.map((guardName) => {
              const guardId = getGuardIdFromName(guardName);
              return (
                <PaymentProfileEditor
                  key={guardId}
                  onChange={updateProfileDraft}
                  onSave={handleSaveProfile}
                  profile={profileDrafts[guardId]}
                />
              );
            })}
          </div>
        )}
      </section>

      <section className="payment-guard-list">
        {closingRows.map((row) => (
          <PaymentClosingGuardCard
            key={row.guardId}
            onAddExtra={handleAddExtra}
            onRemoveExtra={handleRemoveExtra}
            onUpdateExtra={handleUpdateExtra}
            row={row}
          />
        ))}
      </section>

      <section className="monitoring-card payment-message-card">
        <div className="monitoring-card-head">
          <div>
            <span>MENSAGEM PARA FINANCEIRO</span>
            <strong>Pronta para copiar</strong>
          </div>
          <em className="payment-status payment-ok">Total geral: {formatCurrencyBRL(totalGeneral)}</em>
        </div>
        <textarea readOnly value={financeMessage} />
      </section>

      <PaymentHistorySection records={paymentState.records} onStatusChange={handleUpdateRecordStatus} />
    </section>
  );
}

function PaymentProfileSummary({ profiles, editing, onToggle }: { profiles: Record<GuardId, GuardPaymentProfile>; editing: boolean; onToggle: () => void }) {
  return (
    <article className="monitoring-card payment-profile-summary">
      <div className="monitoring-card-head">
        <div>
          <span>DADOS DE PAGAMENTO DOS GUARDAS</span>
          <strong>Cadastro protegido</strong>
        </div>
        <button className="secondary-button" type="button" onClick={onToggle}>{editing ? "Fechar dados de pagamento" : "Editar dados de pagamento"}</button>
      </div>
      <div className="payment-profile-status-grid">
        {guardNames.map((guardName) => {
          const guardId = getGuardIdFromName(guardName);
          const complete = getMissingPaymentProfileFields(profiles[guardId]).length === 0;
          return <small key={guardId}>{guardName}<b>{complete ? "Completo" : "Incompleto"}</b></small>;
        })}
      </div>
    </article>
  );
}

function PaymentProfileEditor({ profile, onChange, onSave }: { profile: GuardPaymentProfile; onChange: (guardId: GuardId, field: keyof GuardPaymentProfile, value: string) => void; onSave: (guardId: GuardId) => void }) {
  const missing = getMissingPaymentProfileFields(profile);
  return (
    <article className="monitoring-card payment-profile-card">
      <div className="monitoring-card-head">
        <div>
          <span>{profile.operationalName}</span>
          <strong>{profile.paymentName || "Nome para pagamento pendente"}</strong>
        </div>
        <em className={`payment-status ${missing.length === 0 ? "payment-ok" : "payment-check_shift"}`}>{missing.length === 0 ? "Completo" : "Incompleto"}</em>
      </div>
      {missing.length > 0 && <p className="notice-message">Dados de pagamento incompletos para este guarda: {missing.join(", ")}.</p>}
      <div className="payment-form-grid">
        <label>Nome para pagamento<input value={profile.paymentName} onChange={(event) => onChange(profile.guardId, "paymentName", event.target.value)} /></label>
        <label>Banco<input value={profile.bankName} onChange={(event) => onChange(profile.guardId, "bankName", event.target.value)} /></label>
        <label>Agência<input value={profile.agency} onChange={(event) => onChange(profile.guardId, "agency", event.target.value)} /></label>
        <label>Tipo de conta<input value={profile.accountType} onChange={(event) => onChange(profile.guardId, "accountType", event.target.value)} placeholder="Conta Corrente, Poupança..." /></label>
        <label>Conta<input value={profile.accountNumber} onChange={(event) => onChange(profile.guardId, "accountNumber", event.target.value)} /></label>
        <label>CPF<input value={profile.cpf} onChange={(event) => onChange(profile.guardId, "cpf", event.target.value)} /></label>
        <label>Pix<input value={profile.pix} onChange={(event) => onChange(profile.guardId, "pix", event.target.value)} /></label>
      </div>
      <label className="payment-notes-field">Observação<textarea value={profile.notes} onChange={(event) => onChange(profile.guardId, "notes", event.target.value)} /></label>
      <button className="secondary-button" type="button" onClick={() => onSave(profile.guardId)}>Salvar dados de pagamento</button>
    </article>
  );
}

function PaymentClosingGuardCard({ row, onAddExtra, onUpdateExtra, onRemoveExtra }: { row: GuardPaymentClosingRow; onAddExtra: (guardId: GuardId) => void; onUpdateExtra: (guardId: GuardId, extraId: string, field: keyof GuardPaymentExtra, value: string) => void; onRemoveExtra: (guardId: GuardId, extraId: string) => void }) {
  return (
    <article className="monitoring-card payment-guard-card">
      <div className="monitoring-card-head">
        <div>
          <span>{row.guardName}</span>
          <strong>Total: {formatCurrencyBRL(row.totalAmount)}</strong>
        </div>
        <em className="payment-status payment-ok">Base quinzenal: {formatCurrencyBRL(row.baseAmount)}</em>
      </div>
      {!row.profileComplete && <p className="notice-message">Dados de pagamento incompletos para este guarda.</p>}
      <div className="payment-mini-grid">
        <small>Base fixa<b>{formatCurrencyBRL(row.baseAmount)}</b></small>
        <small>Extra feriado<b>{formatCurrencyBRL(row.holidayExtraAmount)}</b></small>
        <small>Plantão/outros<b>{formatCurrencyBRL(row.shiftExtraAmount)}</b></small>
        <small>Total<b>{formatCurrencyBRL(row.totalAmount)}</b></small>
      </div>
      <div className="payment-conference-list">
        <strong>Dias/turnos do período</strong>
        {row.shifts.length === 0 && <p>Nenhum plantão da escala encontrado no período.</p>}
        {row.shifts.length > 0 && <div className="payment-turn-list">{row.shifts.map((shift) => <span className="payment-turn-pill" key={shift.id}>{shift.line}</span>)}</div>}
      </div>
      <div className="payment-extra-list">
        <div className="payment-extra-head">
          <strong>Extras por guarda</strong>
          <button className="secondary-button" type="button" onClick={() => onAddExtra(row.guardId)}>Adicionar extra</button>
        </div>
        {row.extras.length === 0 && <p>Sem extras lançados. Dias normais não geram diária automática.</p>}
        {row.extras.map((extra) => (
          <div className="payment-extra-row" key={extra.id}>
            <label>Data<input type="date" value={extra.date} onChange={(event) => onUpdateExtra(row.guardId, extra.id, "date", event.target.value)} /></label>
            <label>Tipo<select value={extra.type} onChange={(event) => onUpdateExtra(row.guardId, extra.id, "type", event.target.value)}>{guardPaymentExtraTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
            <label>Motivo<input value={extra.description} onChange={(event) => onUpdateExtra(row.guardId, extra.id, "description", event.target.value)} placeholder="Ex.: feriado, cobertura, evento" /></label>
            <label>Valor<input inputMode="decimal" value={String(extra.amount)} onChange={(event) => onUpdateExtra(row.guardId, extra.id, "amount", event.target.value)} /></label>
            <button className="danger-button" type="button" onClick={() => onRemoveExtra(row.guardId, extra.id)}>Remover</button>
          </div>
        ))}
      </div>
    </article>
  );
}

function PaymentConferenceSummary({ rows, totalGeneral }: { rows: GuardPaymentClosingRow[]; totalGeneral: number }) {
  const shiftsCount = rows.reduce((total, row) => total + row.shifts.length, 0);
  const extrasCount = rows.reduce((total, row) => total + row.extras.length, 0);
  return (
    <section className="monitoring-card payment-summary-card">
      <span>RESUMO DE CONFERÊNCIA</span>
      <div className="payment-mini-grid">
        <small>Dias conferidos<b>{shiftsCount}</b></small>
        <small>Guardas<b>{rows.length}</b></small>
        <small>Extras identificados<b>{extrasCount}</b></small>
        <small>Total geral<b>{formatCurrencyBRL(totalGeneral)}</b></small>
      </div>
      {rows.map((row) => <p key={row.guardId}><b>{row.guardName}:</b> {formatCurrencyBRL(row.totalAmount)} ({row.extras.length} extra(s)).</p>)}
    </section>
  );
}

function PaymentSheetPreview({ rows, paymentDate, periodStart, periodEnd, status, notes }: { rows: GuardPaymentClosingRow[]; paymentDate: string; periodStart: string; periodEnd: string; status: GuardPaymentStatus; notes: string }) {
  return (
    <section className="monitoring-card payment-sheet-card">
      <span>ABA PAGAMENTOS</span>
      <strong>Linhas prontas para Google Sheets</strong>
      <div className="payment-sheet-table">
        <div className="payment-sheet-row header"><b>DATA PAGTO</b><b>PERÍODO</b><b>GUARDA</b><b>BASE QUINZENAL</b><b>EXTRA FERIADO</b><b>EXTRA PLANTÃO</b><b>DESCRIÇÃO EXTRAS</b><b>TOTAL</b><b>STATUS</b><b>OBSERVAÇÃO</b></div>
        {rows.map((row) => (
          <div className="payment-sheet-row" key={row.guardId}>
            <span>{formatDateShort(paymentDate)}</span>
            <span>{formatPaymentPeriodLabel(periodStart, periodEnd)}</span>
            <span>{row.paymentName || row.guardName}</span>
            <span>{formatCurrencyBRL(row.baseAmount)}</span>
            <span>{formatCurrencyBRL(row.holidayExtraAmount)}</span>
            <span>{formatCurrencyBRL(row.shiftExtraAmount)}</span>
            <span>{row.extraDescription || "--"}</span>
            <span>{formatCurrencyBRL(row.totalAmount)}</span>
            <span>{status}</span>
            <span>{notes || "--"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function PaymentHistorySection({ records, onStatusChange }: { records: GuardPaymentRecord[]; onStatusChange: (recordId: string, status: GuardPaymentStatus) => void }) {
  return (
    <section className="payment-history-section">
      <div className="round-report-title">
        <span>HISTÓRICO DE PAGAMENTOS</span>
        <strong>Fechamentos salvos no app</strong>
      </div>
      {records.length === 0 && <article className="empty-state">Nenhum fechamento salvo ainda.</article>}
      {records.length > 0 && (
        <div className="payment-history-list">
          {records.map((record) => (
            <article className="monitoring-card payment-history-card" key={record.id}>
              <div className="monitoring-card-head">
                <div>
                  <span>{formatPaymentPeriodLabel(record.periodStart, record.periodEnd)} • Pagto {formatDateShort(record.paymentDate)}</span>
                  <strong>{record.guardDisplayName}</strong>
                </div>
                <em className={`payment-status payment-history-${record.status.toLowerCase().replace(/\s+/g, "-")}`}>{record.status}</em>
              </div>
              <div className="payment-mini-grid">
                <small>Data pagamento<b>{formatDateShort(record.paymentDate)}</b></small>
                <small>Período<b>{formatPaymentPeriodLabel(record.periodStart, record.periodEnd)}</b></small>
                <small>Guarda<b>{record.guardDisplayName}</b></small>
                <small>Total<b>{formatCurrencyBRL(record.totalAmount)}</b></small>
              </div>
              <label>Status<select value={record.status} onChange={(event) => onStatusChange(record.id, event.target.value as GuardPaymentStatus)}>{guardPaymentStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function MonitoringEntryCard({ entry }: { entry: GuardMonitoringEntry }) {
  const locationStatus = getMonitoringLocationStatus(entry);
  const hasLocation = Boolean(entry.startLocation || entry.endLocation);

  return (
    <article className="monitoring-card monitoring-entry-card">
      <div className="monitoring-card-head">
        <span>{formatDateOnly(entry.scheduledDate)}</span>
        <em className={`monitoring-status ${entry.status}`}>{formatMonitoringStatus(entry.status)}</em>
      </div>
      <strong className="monitoring-guard-name">{entry.guardName}</strong>
      <div className="monitoring-compact-grid">
        <small>Previsto<b>{entry.scheduledStart}-{entry.scheduledEnd}</b></small>
        <small>Ativação<b>{formatTimeOnly(entry.startedAt)}</b></small>
        <small>Encerramento<b>{formatTimeOnly(entry.endedAt)}</b></small>
        <small>Duração<b>{formatMonitoringDuration(entry.startedAt, entry.endedAt)}</b></small>
      </div>
      <div className="monitoring-card-footer">
        <span className={`monitoring-chip ${entry.source === "Supabase" ? "source-remote" : "source-local"}`}>{entry.source}</span>
        <span className={`monitoring-chip ${locationStatus.className}`}>{locationStatus.label}</span>
        {hasLocation && (
          <details className="monitoring-location">
            <summary>Ver localização</summary>
            {entry.startLocation && <p>Inicial: {formatLocation(entry.startLocation.latitude)}, {formatLocation(entry.startLocation.longitude)}{entry.startLocation.accuracy ? ` (${Math.round(entry.startLocation.accuracy)}m)` : ""}</p>}
            {entry.endLocation && <p>Final: {formatLocation(entry.endLocation.latitude)}, {formatLocation(entry.endLocation.longitude)}{entry.endLocation.accuracy ? ` (${Math.round(entry.endLocation.accuracy)}m)` : ""}</p>}
          </details>
        )}
      </div>
    </article>
  );
}

function RoundQrCodesPanel({ points }: { points: GuardRoundPoint[] }) {
  const [copiedToken, setCopiedToken] = useState("");
  const sortedPoints = sortRoundPointsForDisplay(points);
  const totalPoints = sortedPoints.length || 6;

  async function handleCopyToken(token: string) {
    const copied = await copyToClipboard(token);
    setCopiedToken(copied ? token : "");
  }

  function handlePrintQrCodes() {
    const clearPrintMode = () => {
      document.body.classList.remove("print-round-qrs");
      window.removeEventListener("afterprint", clearPrintMode);
    };

    document.body.classList.add("print-round-qrs");
    window.addEventListener("afterprint", clearPrintMode);
    window.requestAnimationFrame(() => {
      window.print();
    });
  }

  return (
    <article className="monitoring-card round-qr-panel">
      <div className="round-qr-panel-head">
        <div>
          <span>QR CODES DOS PONTOS</span>
          <strong>Etiquetas para operação física</strong>
          <p>Use estes QR Codes nos pontos físicos da ronda. Cada código identifica um ponto ativo da sequência.</p>
        </div>
        <button className="secondary-button round-print-button" type="button" onClick={handlePrintQrCodes}><AppIcon name="qr" size="sm" className="action-icon" />Imprimir QR Codes</button>
      </div>
      <div className="round-qr-grid">
        {sortedPoints.map((point) => (
          <RoundQrCodeCard
            copied={copiedToken === point.qrToken}
            key={point.id}
            onCopy={handleCopyToken}
            point={point}
          />
        ))}
      </div>
      <section className="round-print-sheet" aria-hidden="true">
        {sortedPoints.map((point) => (
          <article className="round-print-label" key={`print-${point.id}`}>
            <h1>SANTA MARIA</h1>
            <strong>RONDA DE SEGURANÇA</strong>
            <p>{point.name}</p>
            <QRCodeSVG value={point.qrToken} size={154} marginSize={1} level="M" />
            <small>Ponto {point.sequenceOrder} de {totalPoints}</small>
          </article>
        ))}
      </section>
    </article>
  );
}

function RoundQrCodeCard({ point, copied, onCopy }: { point: GuardRoundPoint; copied: boolean; onCopy: (token: string) => void }) {
  return (
    <section className="round-qr-card">
      <div>
        <span>Ponto {point.sequenceOrder}</span>
        <strong>{point.name}</strong>
      </div>
      <div className="round-qr-image" aria-label={`QR Code ${point.name}`}>
        <QRCodeSVG value={point.qrToken} size={132} marginSize={1} level="M" />
      </div>
      <code className="round-qr-token">{point.qrToken}</code>
      <button className="secondary-button" type="button" onClick={() => onCopy(point.qrToken)}><AppIcon name="qr" size="sm" className="action-icon" />Copiar token</button>
      {copied && <small className="round-copy-status">Token copiado.</small>}
    </section>
  );
}

function RoundScheduleReport({ entries, points, schedules, shiftSummaries }: { entries: GuardRoundReportEntry[]; points: GuardRoundPoint[]; schedules: GuardRoundSchedule[]; shiftSummaries: MonitoringShiftSummary[] }) {
  const sortedSchedules = sortRoundSchedulesForDisplay(schedules);
  const sortedPoints = sortRoundPointsForDisplay(points);
  const summaryByShift = new Map(shiftSummaries.map((summary) => [summary.shiftSessionId, summary]));

  return (
    <section className="round-report-section" aria-label="Relatório de rondas por horário">
      <div className="round-report-title">
        <span>RELATÓRIO DE RONDAS</span>
        <strong>Acompanhamento por horário</strong>
      </div>
      {sortedSchedules.map((schedule) => {
        const scheduleEntries = entries.filter((entry) => entry.schedule.id === schedule.id || entry.schedule.scheduledTime === schedule.scheduledTime);
        return <RoundScheduleGroup entries={scheduleEntries} key={schedule.id} points={sortedPoints} schedule={schedule} summaryByShift={summaryByShift} />;
      })}
    </section>
  );
}

function RoundScheduleGroup({ entries, points, schedule, summaryByShift }: { entries: GuardRoundReportEntry[]; points: GuardRoundPoint[]; schedule: GuardRoundSchedule; summaryByShift: Map<string, MonitoringShiftSummary> }) {
  return (
    <article className="monitoring-card round-schedule-group">
      <div className="monitoring-card-head">
        <span>Horário de ronda</span>
        <em className="monitoring-status round-schedule-time">{schedule.scheduledTime}</em>
      </div>
      {entries.length === 0 && (
        <div className="round-report-run empty">
          <strong>Sem registros lançados</strong>
          <RoundPointStatusList points={points.map((point) => ({ point }))} />
        </div>
      )}
      {entries.length > 0 && entries.map((entry) => <RoundReportRunCard entry={entry} key={entry.id} summary={summaryByShift.get(entry.shiftSessionId)} />)}
    </article>
  );
}

function RoundReportRunCard({ entry, summary }: { entry: GuardRoundReportEntry; summary?: MonitoringShiftSummary }) {
  const scheduleStatus = getRoundScheduleDisplayStatus(entry);

  return (
    <section className="round-report-run">
      <div className="monitoring-card-head">
        <span>{entry.guardName} • Plantão {formatDateOnly(summary?.scheduledDate ?? entry.scheduledDate)}</span>
        <em className={`monitoring-status round-display-${scheduleStatus}`}>{formatRoundScheduleDisplayStatus(scheduleStatus)}</em>
      </div>
      <div className="monitoring-compact-grid round-summary-grid">
        <small>Programado<b>{entry.schedule.scheduledTime}</b></small>
        <small>Status horário<b>{formatRoundScheduleDisplayStatus(scheduleStatus)}</b></small>
        <small>Pontos batidos<b>{entry.completedPoints}</b></small>
        <small>Pendentes<b>{entry.pendingPoints}</b></small>
        <small>Origem<b>{entry.source}</b></small>
      </div>
      <RoundPointStatusList points={entry.points} />
    </section>
  );
}

function RoundPointStatusList({ points }: { points: Array<{ point: GuardRoundPoint; checkin?: GuardRoundCheckin }> }) {
  return (
    <ul className="round-checkin-list">
      {points.map(({ point, checkin }) => {
        const status = getRoundPointStatus(checkin);
        return (
          <li className={`round-point-row ${status.className}`} key={point.id}>
            <span className="round-point-number">{point.sequenceOrder}</span>
            <span className="round-point-main">
              <b>{point.name}</b>
              <small>{checkin ? `${formatTimeOnly(checkin.checkedAt)} • ${formatRoundCheckinSource(checkin.checkinSource)}` : "Sem batida registrada"}</small>
            </span>
            <em>{status.label}</em>
            {checkin?.location && (
              <details className="round-point-location">
                <summary>Ver localização</summary>
                <p>{formatLocation(checkin.location.latitude)}, {formatLocation(checkin.location.longitude)}{checkin.location.accuracy ? ` (${Math.round(checkin.location.accuracy)}m)` : ""}</p>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function buildPaymentReportRows(summaries: MonitoringShiftSummary[]): PaymentReportRow[] {
  return summaries.map((summary) => {
    const paymentStatus = getPaymentStatus(summary);
    return {
      id: summary.shiftSessionId,
      guardName: summary.guardName,
      date: summary.scheduledDate,
      shiftType: getPaymentShiftType(summary),
      scheduledStart: summary.scheduledStart,
      scheduledEnd: summary.scheduledEnd,
      registeredStart: formatTimeOnly(summary.startedAt),
      registeredEnd: formatTimeOnly(summary.endedAt),
      expectedHours: formatExpectedShiftHours(summary),
      registeredHours: formatRegisteredShiftHours(summary),
      serviceStatus: formatMonitoringStatus(summary.shiftStatus),
      roundsExpected: summary.roundsExpected,
      roundsComplete: summary.roundsComplete,
      pointsRegistered: summary.pointsRegistered,
      pointsPending: summary.pointsPending,
      lateCount: summary.lateCount,
      outOfSequenceCount: summary.outOfSequenceCount,
      paymentStatus,
      observations: getPaymentObservation(summary, paymentStatus),
    };
  });
}

function getPaymentStatus(summary: MonitoringShiftSummary): PaymentStatus {
  if (summary.shiftStatus === "active" || (summary.startedAt && !summary.endedAt)) return "check_exit";
  if (!summary.startedAt || summary.shiftStatus === "pending") return "check_entry";
  if (summary.pointsPending > 0 || summary.lateCount > 0 || summary.outOfSequenceCount > 0) return "check_rounds";
  if (summary.shiftStatus === "auto_ended" || summary.scheduledStart === "--" || summary.scheduledEnd === "--") return "check_shift";
  return "ok";
}

function getPaymentObservation(summary: MonitoringShiftSummary, status: PaymentStatus) {
  if (status === "ok") return "Plantão completo para conferência.";
  if (status === "check_exit") return "Saída não registrada ou serviço ainda ativo.";
  if (status === "check_entry") return "Entrada não registrada ou plantão pendente.";
  if (status === "check_rounds") {
    const issues = [
      summary.pointsPending > 0 ? `${summary.pointsPending} ponto(s) pendente(s)` : "",
      summary.lateCount > 0 ? `${summary.lateCount} atraso(s)` : "",
      summary.outOfSequenceCount > 0 ? `${summary.outOfSequenceCount} fora de sequência` : "",
    ].filter(Boolean);
    return `Conferir rondas: ${issues.join(", ")}.`;
  }
  return "Conferir consistência do plantão.";
}

function formatPaymentStatus(status: PaymentStatus) {
  const labels: Record<PaymentStatus, string> = {
    ok: "OK para pagamento",
    check_entry: "Conferir entrada",
    check_exit: "Conferir saída",
    check_rounds: "Conferir rondas",
    check_shift: "Conferir plantão",
  };
  return labels[status];
}

function getPaymentShiftType(summary: MonitoringShiftSummary) {
  if (summary.scheduledStart === "--" || summary.scheduledEnd === "--") return "Não identificado";
  const expectedMinutes = getExpectedShiftMinutes(summary);
  if (summary.scheduledEnd <= summary.scheduledStart) return "Noturno";
  if (expectedMinutes !== null && expectedMinutes <= 360) return "Extra 6h";
  return "Diurno";
}

function formatExpectedShiftHours(summary: MonitoringShiftSummary) {
  const expectedMinutes = getExpectedShiftMinutes(summary);
  return expectedMinutes === null ? "--" : formatDurationMinutes(expectedMinutes);
}

function getExpectedShiftMinutes(summary: MonitoringShiftSummary) {
  const start = getMonitoringShiftStartAt(summary);
  const end = getMonitoringShiftEndAt(summary);
  if (!start || !end) return null;
  return getDurationMinutes(start.toISOString(), end.toISOString());
}

function formatRegisteredShiftHours(summary: MonitoringShiftSummary) {
  if (!summary.startedAt) return "Sem entrada";
  if (!summary.endedAt) return "Incompleto";
  const minutes = getDurationMinutes(summary.startedAt, summary.endedAt);
  return minutes === null ? "--" : formatDurationMinutes(minutes);
}

function getDurationMinutes(startedAt: string, endedAt: string) {
  const durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(durationMs) || durationMs < 0) return null;
  return Math.round(durationMs / 60000);
}

function formatDurationMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h${String(minutes).padStart(2, "0")}`;
}

function formatPaymentReportText(rows: PaymentReportRow[], dateFilter: string, guardFilter: MonitoringGuardFilter, statusFilter: MonitoringStatusFilter) {
  const filters = [
    `Data: ${dateFilter ? formatDateFull(dateFilter) : "Todas"}`,
    `Guarda: ${guardFilter === "all" ? "Todos" : guardFilter}`,
    `Status: ${formatMonitoringStatusFilter(statusFilter)}`,
  ];

  const lines = [
    "FECHAMENTO DE GUARDAS",
    `Período/Filtro: ${filters.join(" | ")}`,
    "",
    ...rows.flatMap((row) => [
      `${row.guardName} - ${formatDateFull(row.date)} - ${row.shiftType}`,
      `Previsto: ${row.scheduledStart} às ${row.scheduledEnd}`,
      `Registrado: ${row.registeredStart} às ${row.registeredEnd}`,
      `Horas previstas: ${row.expectedHours}`,
      `Horas registradas: ${row.registeredHours}`,
      `Status do serviço: ${row.serviceStatus}`,
      `Rondas: ${row.roundsComplete}/${row.roundsExpected}`,
      `Pontos registrados: ${row.pointsRegistered}`,
      `Pendências: ${row.pointsPending}`,
      `Atrasos: ${row.lateCount}`,
      `Fora de sequência: ${row.outOfSequenceCount}`,
      `Status: ${formatPaymentStatus(row.paymentStatus)}`,
      `Observações: ${row.observations}`,
      "",
    ]),
  ];

  return lines.join("\n").trim();
}

function getDefaultPaymentPeriod() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const day = today.getDate();
  const start = new Date(year, month, day <= 15 ? 1 : 16);
  const end = day <= 15 ? new Date(year, month, 15) : new Date(year, month + 1, 0);
  return {
    start: toIsoDate(start),
    end: toIsoDate(end),
    paymentDate: toIsoDate(today),
  };
}

function buildPaymentProfileDrafts(profiles: GuardPaymentProfile[]): Record<GuardId, GuardPaymentProfile> {
  const now = new Date().toISOString();
  return guardNames.reduce((drafts, guardName) => {
    const guardId = getGuardIdFromName(guardName);
    const profile = profiles.find((current) => current.guardId === guardId);
    drafts[guardId] = profile ?? {
      id: `local-profile-${guardId}`,
      guardId,
      operationalName: guardName,
      paymentName: "",
      bankName: "",
      agency: "",
      accountType: "",
      accountNumber: "",
      cpf: "",
      pix: "",
      notes: "",
      createdAt: now,
      updatedAt: now,
      source: "Local",
    };
    return drafts;
  }, {} as Record<GuardId, GuardPaymentProfile>);
}

function buildGuardPaymentClosingRows(input: {
  extras: Record<GuardId, GuardPaymentExtra[]>;
  periodEnd: string;
  periodStart: string;
  profiles: Record<GuardId, GuardPaymentProfile>;
}): GuardPaymentClosingRow[] {
  return guardNames.map((guardName) => {
    const guardId = getGuardIdFromName(guardName);
    const profile = input.profiles[guardId];
    const shifts = buildGuardShiftConferenceItems(guardId, guardName, input.periodStart, input.periodEnd);
    const guardExtras = input.extras[guardId] ?? [];
    const holidayExtraAmount = roundPaymentAmount(guardExtras.filter(isHolidayPaymentExtra).reduce((total, extra) => total + extra.amount, 0));
    const shiftExtraAmount = roundPaymentAmount(guardExtras.filter((extra) => !isHolidayPaymentExtra(extra)).reduce((total, extra) => total + extra.amount, 0));
    const totalAmount = roundPaymentAmount(GUARD_PAYMENT_BASE_AMOUNT + holidayExtraAmount + shiftExtraAmount);
    return {
      guardId,
      guardName,
      paymentName: profile.paymentName.trim(),
      profile,
      profileComplete: getMissingPaymentProfileFields(profile).length === 0,
      shifts,
      extras: guardExtras,
      baseAmount: GUARD_PAYMENT_BASE_AMOUNT,
      holidayExtraAmount,
      shiftExtraAmount,
      totalAmount,
      extraDescription: formatPaymentExtraDescription(guardExtras),
    };
  });
}

function buildGuardShiftConferenceItems(
  guardId: GuardId,
  guardName: GuardName,
  periodStart: string,
  periodEnd: string,
): GuardShiftConferenceItem[] {
  return getGuardShifts(guardName)
    .filter((shift) => isDateInPaymentPeriod(shift.startDate, periodStart, periodEnd))
    .map((shift) => buildScheduledPaymentShiftItem(guardId, guardName, shift));
}

function buildScheduledPaymentShiftItem(guardId: GuardId, guardName: GuardName, shift: GuardShift): GuardShiftConferenceItem {
  const id = `${guardId}-${shift.startDate}-${shift.startTime}`;
  return {
    id,
    guardId,
    guardName,
    date: shift.startDate,
    line: `${formatDateShort(shift.startDate)} ${formatGuardShiftKind(shift)}`,
  };
}

function buildFinanceMessage(rows: GuardPaymentClosingRow[], periodStart: string, periodEnd: string) {
  const lines = [
    "Bom dia.",
    "",
    `Segue pagamento dos guardas referente ao período de ${formatPaymentPeriodLabel(periodStart, periodEnd)}.`,
    "",
    ...rows.flatMap((row) => buildFinanceMessageGuardLines(row)),
    `Total geral: ${formatCurrencyBRL(rows.reduce((total, row) => total + row.totalAmount, 0))}`,
  ];

  return lines.join("\n").trim();
}

function buildFinanceMessageGuardLines(row: GuardPaymentClosingRow) {
  const profile = row.profile;
  const financeName = getFinanceGuardName(row);
  return [
    financeName,
    "",
    ...buildFinanceShiftLines(row),
    "",
    `Base quinzenal: ${formatCurrencyBRL(row.baseAmount)}`,
    `Extra feriado 1/2 dia: ${formatCurrencyBRL(row.holidayExtraAmount)}`,
    `Outros extras: ${formatCurrencyBRL(row.shiftExtraAmount)}`,
    "",
    `Banco: ${profile.bankName || "--"}`,
    `Agência: ${profile.agency || "--"}`,
    `Conta Corrente: ${profile.accountNumber || "--"}`,
    `CPF: ${profile.cpf || "--"}`,
    `Pix: ${profile.pix || "--"}`,
    `Nome: ${profile.paymentName || financeName}`,
    `Valor: ${formatCurrencyBRL(row.totalAmount)}`,
    "",
    "",
  ];
}

function buildFinanceShiftLines(row: GuardPaymentClosingRow) {
  const scheduledLines = row.shifts.map((shift) => shift.line);
  const extraLines = row.extras.map(formatFinanceExtraLine).filter(Boolean);
  return [...scheduledLines, ...extraLines];
}

function formatFinanceExtraLine(extra: GuardPaymentExtra) {
  const dateLabel = extra.date ? formatDateShort(extra.date) : "XX/XX";
  const reason = extra.description.trim();
  if (extra.type.startsWith("Feriado")) {
    return `${dateLabel} dia + feriado ${extra.type.includes("1/2") ? "1/2 dia" : "dia inteiro"}`;
  }
  if (extra.type.includes("Plantão")) {
    return `${dateLabel} dia + plantão referente a ${reason || "extra"}`;
  }
  return `${dateLabel} dia + ${reason || extra.type.toLowerCase()}`;
}

function getFinanceGuardName(row: GuardPaymentClosingRow) {
  if (row.guardId === "salomao") return "Ricardo Salomão";
  return row.guardName;
}

function buildPaymentSheetText(rows: GuardPaymentClosingRow[], paymentDate: string, periodStart: string, periodEnd: string, status: GuardPaymentStatus) {
  const header = ["DATA PAGTO", "PERÍODO", "GUARDA", "BASE QUINZENAL", "EXTRA FERIADO", "EXTRA PLANTÃO", "DESCRIÇÃO EXTRAS", "TOTAL", "STATUS", "OBSERVAÇÃO"];
  const periodLabel = formatPaymentPeriodLabel(periodStart, periodEnd);
  const lines = rows.map((row) => [
    formatDateShort(paymentDate),
    periodLabel,
    getFinanceGuardName(row),
    formatCurrencyBRL(row.baseAmount),
    formatCurrencyBRL(row.holidayExtraAmount),
    formatCurrencyBRL(row.shiftExtraAmount),
    row.extraDescription || "Sem extras",
    formatCurrencyBRL(row.totalAmount),
    status,
    "OK",
  ].map(sanitizePaymentSheetCell).join("\t"));
  return [header.join("\t"), ...lines].join("\n");
}

function buildPaymentRecordsFromClosingRows(
  rows: GuardPaymentClosingRow[],
  paymentDate: string,
  periodStart: string,
  periodEnd: string,
  status: GuardPaymentStatus,
  financeMessage: string,
): GuardPaymentRecord[] {
  const now = new Date().toISOString();
  const periodLabel = formatPaymentPeriodLabel(periodStart, periodEnd);
  return rows.map((row) => ({
    id: createId(),
    paymentDate,
    periodLabel,
    periodStart,
    periodEnd,
    guardId: row.guardId,
    guardDisplayName: getFinanceGuardName(row),
    baseAmount: row.baseAmount,
    holidayExtraAmount: row.holidayExtraAmount,
    shiftExtraAmount: row.shiftExtraAmount,
    extraDescription: row.extraDescription,
    totalAmount: row.totalAmount,
    status,
    notes: "",
    financeMessage,
    createdAt: now,
    updatedAt: now,
    source: "Local",
  }));
}

function upsertProfileList(profiles: GuardPaymentProfile[], profile: GuardPaymentProfile) {
  return profiles.some((current) => current.guardId === profile.guardId || current.id === profile.id)
    ? profiles.map((current) => (current.guardId === profile.guardId || current.id === profile.id ? profile : current))
    : [profile, ...profiles];
}

function mergePaymentRecords(currentRecords: GuardPaymentRecord[], nextRecords: GuardPaymentRecord[]) {
  const recordMap = new Map(currentRecords.map((record) => [record.id, record]));
  nextRecords.forEach((record) => recordMap.set(record.id, record));
  return [...recordMap.values()].sort((first, second) => (
    new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime()
  ));
}

function createGuardPaymentExtra(guardId: GuardId): GuardPaymentExtra {
  return {
    id: createId(),
    guardId,
    date: getTodayIso(),
    type: "Feriado 1/2 dia",
    description: "",
    amount: GUARD_PAYMENT_HALF_EXTRA_AMOUNT,
  };
}

function updateGuardPaymentExtra(extra: GuardPaymentExtra, field: keyof GuardPaymentExtra, value: string): GuardPaymentExtra {
  if (field === "amount") return { ...extra, amount: parsePaymentAmount(value) };
  if (field === "date") return { ...extra, date: value };
  if (field === "description") return { ...extra, description: value };
  if (field === "type") {
    const type = guardPaymentExtraTypes.includes(value as GuardPaymentExtraType) ? value as GuardPaymentExtraType : extra.type;
    return { ...extra, type, amount: getDefaultAmountForPaymentExtra(type, extra.amount) };
  }
  return extra;
}

function getDefaultAmountForPaymentExtra(type: GuardPaymentExtraType, currentAmount: number) {
  if (type.includes("1/2")) return GUARD_PAYMENT_HALF_EXTRA_AMOUNT;
  if (type !== "Outro") return GUARD_PAYMENT_FULL_EXTRA_AMOUNT;
  return currentAmount || 0;
}

function getMissingPaymentProfileFields(profile: GuardPaymentProfile) {
  const fields = [
    ["nome para pagamento", profile.paymentName],
    ["banco", profile.bankName],
    ["agencia", profile.agency],
    ["tipo de conta", profile.accountType],
    ["conta", profile.accountNumber],
    ["CPF", profile.cpf],
  ] as const;
  return fields.filter(([, value]) => !value.trim()).map(([label]) => label);
}

function getPaymentLoadErrorMessage(message?: string) {
  if (!message) return "";
  return message.toLowerCase().startsWith("erro") ? message : "";
}

function formatPaymentExtraDescription(extras: GuardPaymentExtra[]) {
  return extras
    .filter((extra) => extra.amount > 0 || extra.description.trim())
    .map((extra) => `${extra.type}${extra.description.trim() ? ` - ${extra.description.trim()}` : ""}: ${formatCurrencyBRL(extra.amount)}`)
    .join("; ");
}

function isHolidayPaymentExtra(extra: GuardPaymentExtra) {
  return extra.type === "Feriado 1/2 dia";
}

function formatGuardShiftKind(shift: GuardShift) {
  if (shift.shiftType.toUpperCase().includes("NOTURNO")) return "noite";
  return "dia";
}

function formatGuardShiftObservation(observation: string) {
  return observation.toLowerCase().replace(/\s+/g, " ").trim();
}

function formatCurrencyBRL(value: number) {
  return roundPaymentAmount(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPaymentPeriodLabel(periodStart: string, periodEnd: string) {
  return `${formatDateShort(periodStart)} a ${formatDateShort(periodEnd)}`;
}

function formatDateShort(value: string) {
  const date = parseDateOnly(value);
  if (!date) return "--";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function isDateInPaymentPeriod(value: string, periodStart: string, periodEnd: string) {
  return Boolean(value) && value >= periodStart && value <= periodEnd;
}

function getPaymentScheduleKey(date: string, time: string) {
  return `${date}|${time}`;
}

function parsePaymentAmount(value: string) {
  const parsed = Number(value.replace(/\./g, "").replace(",", "."));
  return roundPaymentAmount(Number.isFinite(parsed) ? parsed : 0);
}

function roundPaymentAmount(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function sanitizePaymentSheetCell(value: string | number) {
  return String(value).replace(/[\t\r\n]+/g, " ").trim();
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonitoringStatusFilter(statusFilter: MonitoringStatusFilter) {
  const labels: Record<MonitoringStatusFilter, string> = {
    all: "Todos",
    ok: "OK",
    late: "Atrasado",
    out_of_sequence: "Fora de sequência",
    pending: "Pendente",
  };
  return labels[statusFilter];
}

function buildMonitoringAlerts(summaries: MonitoringShiftSummary[], activeTab: MonitoringTab): MonitoringAlert[] {
  if (activeTab === "qrcode") return [];
  const now = new Date();

  return summaries.flatMap((summary) => {
    const alerts: MonitoringAlert[] = [];

    if (activeTab === "entries") {
      const scheduledStartAt = getMonitoringShiftStartAt(summary);
      const scheduledEndAt = getMonitoringShiftEndAt(summary);

      if (summary.shiftStatus === "pending" && scheduledStartAt && now.getTime() > scheduledStartAt.getTime()) {
        alerts.push({
          id: `${summary.shiftSessionId}-service-not-started`,
          level: "danger",
          guardName: summary.guardName,
          title: "Serviço não ativado",
          message: `${summary.guardName} - Serviço previsto para ${summary.scheduledStart} ainda não foi ativado.`,
        });
      }

      if (summary.shiftStatus === "active" && scheduledEndAt && now.getTime() > scheduledEndAt.getTime()) {
        alerts.push({
          id: `${summary.shiftSessionId}-service-without-end`,
          level: "danger",
          guardName: summary.guardName,
          title: "Serviço ativo sem encerramento",
          message: `${summary.guardName} - Serviço previsto para encerrar às ${summary.scheduledEnd} ainda está ativo.`,
        });
      }
    }

    if (activeTab === "rounds") {
      if (summary.overduePendingPoints > 0) {
        alerts.push({
          id: `${summary.shiftSessionId}-round-pending`,
          level: "warning",
          guardName: summary.guardName,
          title: "Ronda pendente",
          message: `${summary.guardName} - ${summary.overduePendingPoints} ponto(s) pendente(s) em ronda vencida.`,
        });
      }

      if (summary.lateCount > 0) {
        alerts.push({
          id: `${summary.shiftSessionId}-round-late`,
          level: "warning",
          guardName: summary.guardName,
          title: "Ronda atrasada",
          message: `${summary.guardName} - ${summary.lateCount} ponto(s) registrado(s) fora do horário.`,
        });
      }

      if (summary.outOfSequenceCount > 0) {
        alerts.push({
          id: `${summary.shiftSessionId}-round-out-of-sequence`,
          level: "danger",
          guardName: summary.guardName,
          title: "Fora de sequência",
          message: `${summary.guardName} - ${summary.outOfSequenceCount} ponto(s) fora da sequência da ronda.`,
        });
      }
    }

    return alerts;
  });
}

function buildMonitoringShiftSummaries(
  entries: GuardMonitoringEntry[],
  roundEntries: GuardRoundReportEntry[],
  points: GuardRoundPoint[],
  schedules: GuardRoundSchedule[],
): MonitoringShiftSummary[] {
  const roundEntriesByShift = groupRoundEntriesByShift(roundEntries);
  const summaries = entries.map((entry) => buildMonitoringShiftSummary(entry, roundEntriesByShift.get(entry.id) ?? [], points, schedules));
  const knownShiftIds = new Set(entries.map((entry) => entry.id));

  roundEntriesByShift.forEach((shiftRoundEntries, shiftSessionId) => {
    if (knownShiftIds.has(shiftSessionId)) return;
    const firstRoundEntry = shiftRoundEntries[0];
    if (!firstRoundEntry) return;
    summaries.push(buildMonitoringShiftSummaryFromRounds(firstRoundEntry, shiftRoundEntries, points, schedules));
  });

  return summaries.sort((first, second) => {
    const firstTime = new Date(first.startedAt ?? `${first.scheduledDate}T${first.scheduledStart}:00`).getTime();
    const secondTime = new Date(second.startedAt ?? `${second.scheduledDate}T${second.scheduledStart}:00`).getTime();
    return secondTime - firstTime || first.guardName.localeCompare(second.guardName);
  });
}

function groupRoundEntriesByShift(entries: GuardRoundReportEntry[]) {
  const grouped = new Map<string, GuardRoundReportEntry[]>();
  entries.forEach((entry) => {
    grouped.set(entry.shiftSessionId, [...(grouped.get(entry.shiftSessionId) ?? []), entry]);
  });
  grouped.forEach((shiftEntries, shiftSessionId) => {
    grouped.set(shiftSessionId, [...shiftEntries].sort((first, second) => first.schedule.sequenceOrder - second.schedule.sequenceOrder));
  });
  return grouped;
}

function buildMonitoringShiftSummary(
  entry: GuardMonitoringEntry,
  roundEntries: GuardRoundReportEntry[],
  points: GuardRoundPoint[],
  schedules: GuardRoundSchedule[],
): MonitoringShiftSummary {
  const metrics = getShiftRoundMetrics(entry.scheduledDate, entry.scheduledStart, entry.status, roundEntries, points, schedules);
  return {
    id: entry.id,
    shiftSessionId: entry.id,
    guardName: entry.guardName,
    guardLocalId: entry.guardLocalId,
    scheduledDate: entry.scheduledDate,
    scheduledStart: entry.scheduledStart,
    scheduledEnd: entry.scheduledEnd,
    shiftStatus: entry.status,
    startedAt: entry.startedAt,
    endedAt: entry.endedAt,
    source: entry.source,
    ...metrics,
    status: getShiftSummaryStatus(entry.status, metrics),
  };
}

function buildMonitoringShiftSummaryFromRounds(
  entry: GuardRoundReportEntry,
  roundEntries: GuardRoundReportEntry[],
  points: GuardRoundPoint[],
  schedules: GuardRoundSchedule[],
): MonitoringShiftSummary {
  const metrics = getShiftRoundMetrics(entry.scheduledDate, "", "ended", roundEntries, points, schedules);
  return {
    id: `rounds-${entry.shiftSessionId}`,
    shiftSessionId: entry.shiftSessionId,
    guardName: entry.guardName,
    guardLocalId: entry.guardLocalId,
    scheduledDate: entry.scheduledDate,
    scheduledStart: "--",
    scheduledEnd: "--",
    shiftStatus: "ended",
    source: entry.source,
    ...metrics,
    status: getShiftSummaryStatus("ended", metrics),
  };
}

function getShiftRoundMetrics(
  scheduledDate: string,
  scheduledStart: string,
  shiftStatus: GuardShiftStatus,
  roundEntries: GuardRoundReportEntry[],
  points: GuardRoundPoint[],
  schedules: GuardRoundSchedule[],
) {
  const sortedSchedules = sortRoundSchedulesForDisplay(schedules);
  const pointsPerRound = points.length;
  const roundsExpected = sortedSchedules.length;
  const pointsExpected = roundsExpected * pointsPerRound;
  const roundsComplete = roundEntries.filter((entry) => entry.completedPoints >= pointsPerRound).length;
  const pointsRegistered = roundEntries.reduce((total, entry) => total + Math.min(pointsPerRound, entry.completedPoints), 0);
  const pointsPending = Math.max(0, pointsExpected - pointsRegistered);
  const lateCount = countRoundCheckinsByStatus(roundEntries, "late");
  const outOfSequenceCount = countRoundCheckinsByStatus(roundEntries, "out_of_sequence");
  const overduePendingPoints = getOverduePendingPoints(scheduledDate, scheduledStart, shiftStatus, roundEntries, pointsPerRound, sortedSchedules);

  return {
    roundsExpected,
    roundsComplete,
    pointsExpected,
    pointsRegistered,
    pointsPending,
    overduePendingPoints,
    lateCount,
    outOfSequenceCount,
  };
}

function countRoundCheckinsByStatus(entries: GuardRoundReportEntry[], status: GuardRoundCheckinStatus) {
  return entries.reduce((total, entry) => (
    total + entry.points.filter((point) => point.checkin?.status === status).length
  ), 0);
}

function getOverduePendingPoints(
  scheduledDate: string,
  scheduledStart: string,
  shiftStatus: GuardShiftStatus,
  roundEntries: GuardRoundReportEntry[],
  pointsPerRound: number,
  schedules: GuardRoundSchedule[],
) {
  const now = new Date();
  return schedules.reduce((total, schedule) => {
    const entry = roundEntries.find((current) => current.schedule.id === schedule.id || current.schedule.scheduledTime === schedule.scheduledTime);
    const pendingPoints = Math.max(0, pointsPerRound - (entry?.completedPoints ?? 0));
    if (pendingPoints === 0) return total;
    if (shiftStatus !== "active" && shiftStatus !== "pending") return total + pendingPoints;

    const scheduledAt = getMonitoringRoundScheduledAt(scheduledDate, scheduledStart, schedule.scheduledTime);
    const toleranceMs = schedule.toleranceMinutes * 60000;
    return now.getTime() > scheduledAt.getTime() + toleranceMs ? total + pendingPoints : total;
  }, 0);
}

function getShiftSummaryStatus(
  shiftStatus: GuardShiftStatus,
  metrics: Omit<MonitoringShiftSummary, "id" | "shiftSessionId" | "guardName" | "guardLocalId" | "scheduledDate" | "scheduledStart" | "scheduledEnd" | "shiftStatus" | "startedAt" | "endedAt" | "source" | "status">,
): MonitoringShiftSummaryStatus {
  if (metrics.pointsExpected > 0 && metrics.pointsRegistered >= metrics.pointsExpected && metrics.lateCount === 0 && metrics.outOfSequenceCount === 0) return "complete";
  if (metrics.outOfSequenceCount > 0) return "out_of_sequence";
  if (metrics.overduePendingPoints > 0) return "incomplete";
  if (metrics.lateCount > 0) return "late";
  if (shiftStatus === "active" && metrics.pointsPending > 0) return "in_progress";
  if (metrics.pointsPending > 0) return "incomplete";
  return "complete";
}

function getMonitoringOverviewMetrics(summaries: MonitoringShiftSummary[]): MonitoringOverviewMetrics {
  return summaries.reduce((metrics, summary) => ({
    registeredShifts: metrics.registeredShifts + 1,
    activeShifts: metrics.activeShifts + (summary.shiftStatus === "active" ? 1 : 0),
    roundsExpected: metrics.roundsExpected + summary.roundsExpected,
    roundsComplete: metrics.roundsComplete + summary.roundsComplete,
    pointsRegistered: metrics.pointsRegistered + summary.pointsRegistered,
    pointsPending: metrics.pointsPending + summary.pointsPending,
    lateCount: metrics.lateCount + summary.lateCount,
    outOfSequenceCount: metrics.outOfSequenceCount + summary.outOfSequenceCount,
  }), {
    registeredShifts: 0,
    activeShifts: 0,
    roundsExpected: 0,
    roundsComplete: 0,
    pointsRegistered: 0,
    pointsPending: 0,
    lateCount: 0,
    outOfSequenceCount: 0,
  });
}

function matchesMonitoringDate(scheduledDate: string, dateFilter: string) {
  return !dateFilter || scheduledDate === dateFilter;
}

function matchesMonitoringGuardName(guardName: string, guardFilter: MonitoringGuardFilter) {
  return guardFilter === "all" || guardName === guardFilter;
}

function matchesMonitoringSummaryStatus(summary: MonitoringShiftSummary, statusFilter: MonitoringStatusFilter) {
  if (statusFilter === "all") return true;
  if (statusFilter === "ok") return summary.status === "complete";
  if (statusFilter === "late") return summary.status === "late" || summary.lateCount > 0;
  if (statusFilter === "out_of_sequence") return summary.status === "out_of_sequence" || summary.outOfSequenceCount > 0;
  return summary.status === "incomplete" || summary.status === "in_progress" || summary.pointsPending > 0;
}

function formatMonitoringStatus(status: GuardShiftStatus) {
  const labels: Record<GuardShiftStatus, string> = {
    pending: "Pendente",
    active: "Ativo",
    ended: "Encerrado",
    auto_ended: "Encerrado automático",
  };
  return labels[status];
}

function formatShiftSummaryStatus(status: MonitoringShiftSummaryStatus) {
  const labels: Record<MonitoringShiftSummaryStatus, string> = {
    complete: "Completo",
    in_progress: "Em andamento",
    incomplete: "Incompleto",
    late: "Com atraso",
    out_of_sequence: "Fora de sequência",
  };
  return labels[status];
}

function formatShiftSummaryEntry(summary: MonitoringShiftSummary) {
  if (!summary.startedAt) return `Prev. ${summary.scheduledStart}`;
  return `${formatTimeOnly(summary.startedAt)} (prev. ${summary.scheduledStart})`;
}

function formatShiftSummaryExit(summary: MonitoringShiftSummary) {
  if (summary.shiftStatus === "active") return "Serviço ativo";
  if (!summary.endedAt) return `Prev. ${summary.scheduledEnd}`;
  return `${formatTimeOnly(summary.endedAt)} (prev. ${summary.scheduledEnd})`;
}

function formatRoundReportStatus(status: GuardRoundReportStatus) {
  const labels: Record<GuardRoundReportStatus, string> = {
    pending: "Pendente",
    in_progress: "Em andamento",
    completed: "Completa",
    late: "Atraso",
    out_of_sequence: "Fora da sequência",
  };
  return labels[status];
}

function getRoundScheduleDisplayStatus(entry: GuardRoundReportEntry): RoundScheduleDisplayStatus {
  if (entry.status === "out_of_sequence") return "out_of_sequence";
  if (entry.status === "late") return "late";
  if (entry.completedPoints >= entry.points.length) return "complete";
  const scheduledAt = getMonitoringRoundScheduledAt(entry.scheduledDate, "", entry.schedule.scheduledTime);
  const toleranceMs = entry.schedule.toleranceMinutes * 60000;
  return new Date().getTime() <= scheduledAt.getTime() + toleranceMs ? "waiting" : "incomplete";
}

function formatRoundScheduleDisplayStatus(status: RoundScheduleDisplayStatus) {
  const labels: Record<RoundScheduleDisplayStatus, string> = {
    complete: "Completa",
    incomplete: "Incompleta",
    late: "Com atraso",
    out_of_sequence: "Fora de sequência",
    waiting: "Aguardando horário",
  };
  return labels[status];
}

function formatRoundCheckinStatus(status: GuardRoundCheckinStatus) {
  const labels: Record<GuardRoundCheckinStatus, string> = {
    on_time: "No horário",
    late: "Atrasado",
    out_of_sequence: "Fora da sequência",
  };
  return labels[status];
}

function formatRoundCheckinSource(source: GuardRoundCheckinSource) {
  return source === "qr" ? "QR Code" : "Manual";
}

function getRoundPointStatus(checkin?: GuardRoundCheckin) {
  if (!checkin) return { label: "Pendente", className: "pending" };
  if (checkin.status === "late") return { label: "Atrasado", className: "problem" };
  if (checkin.status === "out_of_sequence") return { label: "Fora da sequência", className: "problem" };
  return { label: "OK", className: "ok" };
}

function sortRoundPointsForDisplay(points: GuardRoundPoint[]) {
  return [...points].sort((first, second) => first.sequenceOrder - second.sequenceOrder || first.name.localeCompare(second.name));
}

function sortRoundSchedulesForDisplay(schedules: GuardRoundSchedule[]) {
  return [...schedules].sort((first, second) => first.sequenceOrder - second.sequenceOrder || first.scheduledTime.localeCompare(second.scheduledTime));
}

function getMonitoringShiftStartAt(summary: MonitoringShiftSummary) {
  return getMonitoringShiftTime(summary.scheduledDate, summary.scheduledStart);
}

function getMonitoringShiftEndAt(summary: MonitoringShiftSummary) {
  const startedAt = getMonitoringShiftStartAt(summary);
  const endedAt = getMonitoringShiftTime(summary.scheduledDate, summary.scheduledEnd);
  if (!startedAt || !endedAt) return null;
  if (endedAt.getTime() <= startedAt.getTime()) endedAt.setDate(endedAt.getDate() + 1);
  return endedAt;
}

function getMonitoringShiftTime(scheduledDate: string, scheduledTime: string) {
  if (!scheduledTime || scheduledTime === "--") return null;
  const date = new Date(`${scheduledDate}T${scheduledTime}:00-03:00`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function getMonitoringRoundScheduledAt(scheduledDate: string, scheduledStart: string, scheduledTime: string) {
  const date = new Date(`${scheduledDate}T${scheduledTime}:00-03:00`);
  if (scheduledStart && scheduledTime < scheduledStart) date.setDate(date.getDate() + 1);
  return date;
}

async function copyToClipboard(value: string) {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fallback below covers browsers without clipboard permission.
  }

  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.style.position = "fixed";
  textArea.style.left = "-999px";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textArea);
  }
}

function formatDateOnly(value: string) {
  const date = parseDateOnly(value);
  if (!date) return "--";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function formatDateFull(value: string) {
  const date = parseDateOnly(value);
  if (!date) return "--";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDateTimeShort(value: string | undefined) {
  if (!value) return "--";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "--";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatTimeOnly(value: string | undefined) {
  if (!value) return "--";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "--";
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatMonitoringDuration(startedAt?: string, endedAt?: string) {
  if (!startedAt || !endedAt) return "--";
  const durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(durationMs) || durationMs < 0) return "--";
  const totalMinutes = Math.round(durationMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return `${hours}h ${String(minutes).padStart(2, "0")}min`;
}

function formatLocation(value: number) {
  return value.toFixed(5);
}

function getMonitoringLocationStatus(entry: GuardMonitoringEntry) {
  if (entry.startLocation && entry.endLocation) return { label: "Localização OK", className: "location-ok" };
  if (entry.startLocation || entry.endLocation) return { label: "Localização parcial", className: "location-partial" };
  return { label: "Sem localização", className: "location-empty" };
}

function parseDateOnly(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function SecurityGuardsScreen({ isAdmin, onBack, onLogout, onOpenGuard, onOpenPayment, showPayment }: { isAdmin: boolean; onBack: () => void; onLogout: () => void; onOpenGuard: (guardName: GuardName) => void; onOpenPayment: () => void; showPayment: boolean }) {
  return <section className="screen"><TopBar title="Guardas" subtitle="Selecione o guarda" onLogout={onLogout} /><button className="ghost-button" type="button" onClick={onBack}><AppIcon name="back" size="sm" className="action-icon" />Voltar para Segurança</button>{isAdmin && <GuardSyncDiagnosticPanel />}<section className="admin-grid security-grid"><TodayDutyCard />{guardNames.map((guardName) => <ModuleCard key={guardName} title={guardName} detail="Guarda Santa Maria" enabled onClick={() => onOpenGuard(guardName)} className="security-card" icon="guards" />)}{showPayment && <ModuleCard title="Fechamento / Pagamento" detail="Conferência dos plantões" enabled onClick={onOpenPayment} className="security-card" icon="payment" />}</section></section>;
}

function SecurityGuardDetailScreen({ guardLocalId, guardName, onBack, onLogout }: { guardLocalId: GuardId; guardName: GuardName; onBack: () => void; onLogout: () => void }) {
  const summary = getGuardSummaryShift(guardName);
  const upcomingShifts = getUpcomingGuardShifts(guardName);
  const todayShift = getGuardTodayShift(guardName);
  const nextShift = getNextGuardFutureShift(guardName);

  return <section className="screen"><ProfileHero name={guardName} role="Guarda Santa Maria" department="Segurança" subtitle="Escala de horário" actions={<><button className="ghost-button" type="button" onClick={onBack}>Voltar para Guardas</button><button className="logout-button" type="button" onClick={onLogout}>Sair</button></>} /><GuardShiftPanel guardLocalId={guardLocalId} guardName={guardName} todayShift={todayShift} nextShift={nextShift} canManage={false} showTechnicalSync /><section className="shift-section">{summary ? <ShiftCard shift={summary.shift} label={summary.label} featured /> : <article className="shift-card featured"><span>ESCALA</span><strong>Sem próximo plantão lançado</strong><p>Atualize a escala do mês.</p></article>}<h2>Próximos plantões</h2><div className="shift-list">{upcomingShifts.length > 0 ? upcomingShifts.map((shift) => <ShiftCard key={`${shift.startDate}-${shift.startTime}-${shift.endDate}-${shift.endTime}`} shift={shift} />) : <article className="shift-card"><strong>Sem próximos plantões</strong><p>Atualize a escala do mês.</p></article>}</div></section></section>;
}

function GuardUserScreen({ guardLocalId, guardName, permissions, onOpenParking, onLogout }: { guardLocalId: GuardId; guardName: GuardName; permissions: UserPermission[]; onOpenParking: () => void; onLogout: () => void }) {
  const summary = getGuardSummaryShift(guardName);
  const upcomingShifts = getUpcomingGuardShifts(guardName);
  const todayShift = getGuardTodayShift(guardName);
  const nextShift = getNextGuardFutureShift(guardName);
  const canParkingSearch = permissions.includes("estacionamento-consulta") || permissions.includes("estacionamento-cadastro") || permissions.includes("painel-admin");

  return <section className="screen"><ProfileHero name={guardName} role="Guarda Santa Maria" department="Segurança" subtitle="Escala de horário" actions={<button className="logout-button" type="button" onClick={onLogout}>Sair</button>} /><GuardShiftPanel guardLocalId={guardLocalId} guardName={guardName} todayShift={todayShift} nextShift={nextShift} canManage /><section className="admin-grid security-grid guard-access-grid" aria-label="Acessos do guarda"><ModuleCard title="Rondas / QR Code" detail="Registrar pontos durante o serviço ativo" enabled className="security-card" icon="qr" />{canParkingSearch && <ModuleCard title="Estacionamento" detail="Pesquisar veículo no pátio" enabled onClick={onOpenParking} className="security-card" icon="parking" />}</section><section className="shift-section">{summary ? <ShiftCard shift={summary.shift} label={summary.label} featured /> : <article className="shift-card featured"><span>ESCALA</span><strong>Sem próximo plantão lançado</strong><p>Atualize a escala do mês.</p></article>}<h2>Próximos plantões</h2><div className="shift-list">{upcomingShifts.length > 0 ? upcomingShifts.map((shift) => <ShiftCard key={`${shift.startDate}-${shift.startTime}-${shift.endDate}-${shift.endTime}`} shift={shift} />) : <article className="shift-card"><strong>Sem próximos plantões</strong><p>Atualize a escala do mês.</p></article>}</div></section></section>;
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

function CleaningDashboardScreen({ newOrdersCount, permissions, offlinePendingCount, offlineSyncing, onBack, onLogout, onSyncOffline, onOpenOrders, onOpenStockExit, onOpenBarcodeRegister, onOpenCurrentStock, onOpenStockHistory, onOpenProfiles, onOpenOrderHistory, onOpenNeiaHistory, onPrepareCleaning }: { newOrdersCount: number; permissions: UserPermission[]; offlinePendingCount: number; offlineSyncing: boolean; onBack: () => void; onLogout: () => void; onSyncOffline: () => void; onOpenOrders: () => void; onOpenStockExit: () => void; onOpenBarcodeRegister: () => void; onOpenCurrentStock: () => void; onOpenStockHistory: () => void; onOpenProfiles: () => void; onOpenOrderHistory: () => void; onOpenNeiaHistory: () => void; onPrepareCleaning: () => void }) {
  const canCleaning = permissions.includes("limpeza");
  const canStock = permissions.includes("estoque");
  const canStockExit = permissions.includes("saida-estoque");
  const canReports = permissions.includes("relatorios");
  const canAdmin = permissions.includes("painel-admin");
  const cards: SectorModuleCard[] = [
    { key: "orders", title: "Pedidos Sinval", detail: newOrdersCount > 0 ? `${newOrdersCount} pedido(s) pendente(s)` : "Nenhum pedido pendente", enabled: canCleaning, onClick: onOpenOrders, attention: newOrdersCount > 0 ? "Verificar agora" : undefined, icon: "cleaning" },
    { key: "stock-exit", title: "Saída de Produto", detail: "Bipar retirada do estoque", enabled: canStockExit, onClick: onOpenStockExit, icon: "stock" },
    { key: "product-register", title: "Cadastro de Produtos", detail: "Produtos, códigos e foto", enabled: canStock, onClick: onOpenBarcodeRegister, icon: "edit" },
    { key: "current-stock", title: "Estoque Atual", detail: "Produtos e códigos cadastrados", enabled: canStock, onClick: onOpenCurrentStock, icon: "stock" },
    { key: "stock-history", title: "Histórico de Saídas", detail: "Quem usou, quando e quanto", enabled: canStock, onClick: onOpenStockHistory, icon: "reports" },
    { key: "neia-history", title: "Histórico Neia", detail: "Todos os pedidos feitos pela Neia", enabled: canCleaning, onClick: onOpenNeiaHistory, icon: "reports" },
    { key: "order-history", title: "Histórico / Auditoria", detail: "Concluídos e excluídos", enabled: canReports, onClick: onOpenOrderHistory, icon: "reports" },
    { key: "profiles", title: "Perfis da equipe", detail: "Acessar telas da Neia, Selma e Helena", enabled: canAdmin, onClick: onOpenProfiles, icon: "users" },
    { key: "prepare-real-use", title: "Preparar Limpeza para uso real", detail: "Zerar historicos de teste sem apagar produtos", enabled: canAdmin, onClick: onPrepareCleaning, icon: "settings" },
  ];
  const visibleCards = cards.filter((card) => card.enabled);

  return <section className="screen"><TopBar title="Gestão de Limpeza" subtitle="Neia, Selma, Helena, pedidos, estoque e auditoria" onLogout={onLogout} /><button className="ghost-button" type="button" onClick={onBack}><AppIcon name="back" size="sm" className="action-icon" />Voltar</button><OfflinePendingNotice count={offlinePendingCount} syncing={offlineSyncing} onSync={onSyncOffline} />{canCleaning && newOrdersCount > 0 && <button className="alert-banner cleaning-alert-banner" type="button" onClick={onOpenOrders}><AppIcon name="warning" size="sm" className="action-icon" />Pedido novo da Neia — precisa de atenção</button>}<section className="admin-grid cleaning-dashboard-grid">{visibleCards.map((card) => <ModuleCard key={card.key} title={card.title} detail={card.detail} enabled={card.enabled} onClick={card.onClick} className="cleaning-control-card" attention={card.attention} icon={card.icon} />)}</section>{visibleCards.length === 0 && <section className="empty-state"><h2>Você não tem acesso a este módulo.</h2><p>Solicite permissão ao admin.</p></section>}</section>;
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

function OfflinePendingNotice({ count, syncing, onSync }: { count: number; syncing: boolean; onSync: () => void }) {
  if (count === 0 && !syncing) return null;
  return <button className="offline-pending-banner" type="button" disabled={syncing} onClick={onSync}><strong>Pendências offline: {count}</strong><span>{syncing ? "Sincronizando pendências..." : "Existem pendências salvas neste aparelho aguardando internet."}</span></button>;
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

function CleaningPrepDialog({ running, onCancel, onConfirm }: { running: boolean; onCancel: () => void; onConfirm: () => void | Promise<void> }) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog" role="dialog" aria-modal="true">
        <h2>Preparar Limpeza para uso real?</h2>
        <p>Esta acao limpa pedidos, conferencias, saidas e solicitacoes de foto de teste. Produtos, categorias, fornecedores, usuarios, permissoes, seguranca, rondas e pagamentos serao preservados.</p>
        <div className="button-grid">
          <button className="ghost-button" type="button" disabled={running} onClick={onCancel}>Cancelar</button>
          <button className="danger-button" type="button" disabled={running} onClick={() => { void onConfirm(); }}>{running ? "Preparando..." : "Preparar Limpeza"}</button>
        </div>
      </section>
    </div>
  );
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

function getRequiredProfilePermissions(user: ManagedUser): UserPermission[] {
  if (user.id === "tezzei") return allUserPermissions;
  if (user.linkedGuardId || normalizeOperationalText(user.jobTitle).includes("GUARDA")) {
    return ["seguranca", "guardas", "estacionamento-consulta"];
  }
  if (user.linkedEmployeeId) {
    return ["limpeza"];
  }
  return [];
}

function getNormalizedManagedUserPermissions(user: ManagedUser, permissions: UserPermission[]) {
  if (user.id === "tezzei") return allUserPermissions;
  return uniquePermissions([...getRequiredProfilePermissions(user), ...permissions]);
}

function getManagedUserPermissions(userId: UserRole | null, users: ManagedUser[]) {
  if (userId === "tezzei") return allUserPermissions;
  const user = getManagedUser(users, userId);
  return user?.active ? getNormalizedManagedUserPermissions(user, user.permissions) : [];
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
      permissions: getNormalizedManagedUserPermissions(defaultUser, storedUser?.permissions ?? defaultUser.permissions),
    });
  });
  const customUsers = validStoredUsers
    .filter((user) => !defaultIds.has(user.id))
    .map(normalizeManagedUser);

  return [...systemUsers, ...customUsers];
}

function mergeManagedUserSources(remoteUsers: ManagedUser[], localUsers: ManagedUser[]) {
  const remoteIds = new Set(remoteUsers.map((user) => user.id));
  const remoteAccessCodes = new Set(remoteUsers.map((user) => user.accessCode));
  const unsyncedLocalUsers = localUsers.filter((user) =>
    !remoteIds.has(user.id)
    && !remoteAccessCodes.has(user.accessCode)
  );

  return mergeManagedUsers([...remoteUsers, ...unsyncedLocalUsers]);
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
    permissions: getNormalizedManagedUserPermissions(user, Array.isArray(user.permissions) ? user.permissions : []),
    createdAt: user.createdAt || defaultCreatedAt,
    updatedAt: user.updatedAt || user.createdAt || defaultCreatedAt,
  };
}

async function prepareProductDetails(details: ProductRegisterDetails, currentProducts: InventoryProduct[]): Promise<InventoryProduct> {
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

  const [compactedProduct] = await compactInventoryProductPhotos([savedProduct]);
  return compactedProduct;
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
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    return (char === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export default App;
