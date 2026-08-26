import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AlertToastHost } from "./modules/alerts/AlertToastHost";
import { LiveAlertDashboardEnhancer } from "./modules/alerts/LiveAlertDashboardEnhancer";
import { CleaningActivityAlertEnhancer } from "./modules/alerts/CleaningActivityAlertEnhancer";
import { GoogleCalendarAlertEnhancer } from "./modules/alerts/GoogleCalendarAlertEnhancer";
import { WindowsNotificationControl } from "./modules/alerts/WindowsNotificationControl";
import "./modules/alerts/browserAlertAttention";
import { CleaningDeliveryFeature } from "./modules/cleaning/components/CleaningDeliveryFeature";
import { NeiaDeliveryShortcutFeature } from "./modules/cleaning/components/NeiaDeliveryShortcutFeature";
import { NeiaHistoryEnhancer } from "./modules/cleaning/components/NeiaHistoryEnhancer";
import { MarketingSessionKeepalive } from "./modules/marketing/MarketingSessionKeepalive";
import { AirConditioningMapFeature } from "./modules/patrimony/AirConditioningMapFeature";
import { PatrimonyPeopleEquipmentFeature } from "./modules/patrimony/PatrimonyPeopleEquipmentFeature";
import { PatrimonySpaceMapsFeature } from "./modules/patrimony/PatrimonySpaceMapsFeature";
import { MarketingPushAttentionHost } from "./modules/marketing/MarketingPushAttentionHost";
import { MarketingPushReceiverPage } from "./modules/marketing/MarketingPushReceiverPage";
import { PublicMarketingRequestPage } from "./modules/marketing/PublicMarketingRequestPage";
import { isMarketingNotificationReceiver, readPendingMarketingPushSetup } from "./modules/marketing/marketingPushClient";
import { HubAuthSessionGuard } from "./modules/security/HubAuthSessionGuard";
import { PublicServiceRequestPage } from "./modules/service-requests/PublicServiceRequestPage";
import { isPwaStandalone } from "./pwaInstall";
import "./styles.css";
import "./modules/alerts/alertsExtensions.css";
import "./modules/alerts/dashboardAlignment.css";
import "./modules/alerts/dashboardAlignmentRuntime";
import "./modules/tasks/taskBoardSimplified.css";

const normalizedPath = window.location.pathname.replace(/\/+$/, "") || "/";
const isPublicServiceRequestPage = normalizedPath === "/chamados";
const isPublicMarketingRequestPage = normalizedPath === "/marketing/pedido";
const isMarketingNotificationPage = normalizedPath === "/marketing/notificacoes";
const queryRequestsInternalHub = new URLSearchParams(window.location.search).get("hub") === "interno";

if (queryRequestsInternalHub) {
  try {
    window.sessionStorage.setItem("hub-internal-bypass", "1");
  } catch {
    // O parâmetro atual já garante o bypass desta abertura.
  }
}

let internalBypass = queryRequestsInternalHub;
try {
  internalBypass = internalBypass || window.sessionStorage.getItem("hub-internal-bypass") === "1";
} catch {
  // Sem sessionStorage, apenas o parâmetro explícito funciona.
}

const shouldOpenNotificationReceiver = isMarketingNotificationPage
  || (
    normalizedPath === "/"
    && isPwaStandalone()
    && !internalBypass
    && (Boolean(readPendingMarketingPushSetup()) || isMarketingNotificationReceiver())
  );

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isPublicMarketingRequestPage ? (
      <>
        <PublicMarketingRequestPage />
        <MarketingPushAttentionHost />
      </>
    ) : isPublicServiceRequestPage ? (
      <PublicServiceRequestPage />
    ) : shouldOpenNotificationReceiver ? (
      <>
        <MarketingPushReceiverPage />
        <MarketingPushAttentionHost />
      </>
    ) : (
      <>
        <App />
        <HubAuthSessionGuard />
        <MarketingSessionKeepalive />
        <LiveAlertDashboardEnhancer />
        <WindowsNotificationControl />
        <AlertToastHost />
        <CleaningActivityAlertEnhancer />
        <GoogleCalendarAlertEnhancer />
        <CleaningDeliveryFeature />
        <NeiaDeliveryShortcutFeature />
        <NeiaHistoryEnhancer />
        <AirConditioningMapFeature />
        <PatrimonyPeopleEquipmentFeature />
        <PatrimonySpaceMapsFeature />
        <MarketingPushAttentionHost />
      </>
    )}
  </StrictMode>,
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js")
      .catch((error) => {
        console.error("Erro ao registrar service worker:", error);
      });
  });
}
