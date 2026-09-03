import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AlertToastHost } from "./modules/alerts/AlertToastHost";
import { LiveAlertDashboardEnhancer } from "./modules/alerts/LiveAlertDashboardEnhancer";
import { CleaningActivityAlertEnhancer } from "./modules/alerts/CleaningActivityAlertEnhancer";
import { GoogleCalendarAlertEnhancer } from "./modules/alerts/GoogleCalendarAlertEnhancer";
import { AlertPanelPriorityEnhancer } from "./modules/alerts/AlertPanelPriorityEnhancer";
import { AuditorioPendingAlertEnhancer } from "./modules/alerts/AuditorioPendingAlertEnhancer";
import { WindowsNotificationControl } from "./modules/alerts/WindowsNotificationControl";
import "./modules/alerts/browserAlertAttention";
import { AuditorioPublicPushEnhancer } from "./modules/auditorio/AuditorioPublicPushEnhancer";
import { PublicAuditorioPage } from "./modules/auditorio/PublicAuditorioPage";
import "./modules/auditorio/auditorioCalendarStatusRuntime";
import { CleaningDeliveryFeature } from "./modules/cleaning/components/CleaningDeliveryFeature";
import { CleaningConsumptionEnhancer } from "./modules/cleaning/components/CleaningConsumptionEnhancer";
import { CleaningNewOrderEnhancer } from "./modules/cleaning/components/CleaningNewOrderEnhancer";
import { CleaningOrdersCollapseEnhancer } from "./modules/cleaning/components/CleaningOrdersCollapseEnhancer";
import { NeiaDeliveryShortcutFeature } from "./modules/cleaning/components/NeiaDeliveryShortcutFeature";
import { NeiaHistoryEnhancer } from "./modules/cleaning/components/NeiaHistoryEnhancer";
import { MarketingAlertAcknowledgementEnhancer } from "./modules/marketing/MarketingAlertAcknowledgementEnhancer";
import { MarketingSessionKeepalive } from "./modules/marketing/MarketingSessionKeepalive";
import { AirConditioningMapFeature } from "./modules/patrimony/AirConditioningMapFeature";
import { PatrimonyPeopleEquipmentFeature } from "./modules/patrimony/PatrimonyPeopleEquipmentFeature";
import { PatrimonySpaceMapsFeature } from "./modules/patrimony/PatrimonySpaceMapsFeature";
import { MarketingPushAttentionHost } from "./modules/marketing/MarketingPushAttentionHost";
import { MarketingPushReceiverPage } from "./modules/marketing/MarketingPushReceiverPage";
import { PublicMarketingRequestPage } from "./modules/marketing/PublicMarketingRequestPage";
import { isMarketingNotificationReceiver, readPendingMarketingPushSetup } from "./modules/marketing/marketingPushClient";
import { HubPublicPushReceiverPage } from "./modules/public-push/HubPublicPushReceiverPage";
import { PublicPushBroadcastEnhancer } from "./modules/public-push/PublicPushBroadcastEnhancer";
import { readPendingHubPublicPushSetup } from "./modules/public-push/hubPublicPushClient";
import { RadioHomeEnhancer } from "./modules/radio/RadioHomeEnhancer";
import { RadioPlaylistEnhancer } from "./modules/radio/RadioPlaylistEnhancer";
import { RadioPlaylistMountGuard } from "./modules/radio/RadioPlaylistMountGuard";
import { RadioTestPage } from "./modules/radio/RadioTestPage";
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
const isPublicAuditorioPage = normalizedPath === "/auditorio" || normalizedPath === "/auditorio/consulta";
const isMarketingNotificationPage = normalizedPath === "/marketing/notificacoes";
const isRadioTestPage = normalizedPath === "/radio";
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

const pendingHubPublicPush = readPendingHubPublicPushSetup();
const shouldOpenHubPublicPushReceiver = normalizedPath === "/"
  && isPwaStandalone()
  && !internalBypass
  && Boolean(pendingHubPublicPush);

const shouldOpenMarketingNotificationReceiver = isMarketingNotificationPage
  || (
    normalizedPath === "/"
    && isPwaStandalone()
    && !internalBypass
    && !shouldOpenHubPublicPushReceiver
    && (Boolean(readPendingMarketingPushSetup()) || isMarketingNotificationReceiver())
  );

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isRadioTestPage ? (
      <>
        <RadioTestPage />
        <RadioPlaylistEnhancer />
        <HubAuthSessionGuard />
      </>
    ) : isPublicAuditorioPage ? (
      <>
        <PublicAuditorioPage />
        <AuditorioPublicPushEnhancer />
      </>
    ) : isPublicMarketingRequestPage ? (
      <>
        <PublicMarketingRequestPage />
        <MarketingPushAttentionHost />
      </>
    ) : isPublicServiceRequestPage ? (
      <PublicServiceRequestPage />
    ) : shouldOpenHubPublicPushReceiver ? (
      <HubPublicPushReceiverPage />
    ) : shouldOpenMarketingNotificationReceiver ? (
      <>
        <MarketingPushReceiverPage />
        <MarketingPushAttentionHost />
      </>
    ) : (
      <>
        <App />
        <HubAuthSessionGuard />
        <MarketingSessionKeepalive />
        <MarketingAlertAcknowledgementEnhancer />
        <LiveAlertDashboardEnhancer />
        <WindowsNotificationControl />
        <AlertToastHost />
        <CleaningActivityAlertEnhancer />
        <GoogleCalendarAlertEnhancer />
        <AlertPanelPriorityEnhancer />
        <AuditorioPendingAlertEnhancer />
        <CleaningDeliveryFeature />
        <CleaningConsumptionEnhancer />
        <CleaningNewOrderEnhancer />
        <CleaningOrdersCollapseEnhancer />
        <NeiaDeliveryShortcutFeature />
        <NeiaHistoryEnhancer />
        <AirConditioningMapFeature />
        <PatrimonyPeopleEquipmentFeature />
        <PatrimonySpaceMapsFeature />
        <MarketingPushAttentionHost />
        <PublicPushBroadcastEnhancer />
        <RadioHomeEnhancer />
        <RadioPlaylistMountGuard />
      </>
    )}
  </StrictMode>,
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch((error) => {
        console.error("Erro ao registrar service worker:", error);
      });
  });
}
