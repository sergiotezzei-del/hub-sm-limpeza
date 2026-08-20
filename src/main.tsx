import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AlertDashboardEnhancer } from "./modules/alerts/AlertDashboardEnhancer";
import { GoogleCalendarAlertEnhancer } from "./modules/alerts/GoogleCalendarAlertEnhancer";
import { CleaningDeliveryFeature } from "./modules/cleaning/components/CleaningDeliveryFeature";
import { AirConditioningMapFeature } from "./modules/patrimony/AirConditioningMapFeature";
import { PatrimonySpaceMapsFeature } from "./modules/patrimony/PatrimonySpaceMapsFeature";
import { PublicServiceRequestPage } from "./modules/service-requests/PublicServiceRequestPage";
import "./styles.css";
import "./modules/alerts/alertsExtensions.css";
import "./modules/alerts/dashboardAlignment.css";
import "./modules/alerts/dashboardAlignmentRuntime";

const normalizedPath = window.location.pathname.replace(/\/+$/, "") || "/";
const isPublicServiceRequestPage = normalizedPath === "/chamados";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isPublicServiceRequestPage ? (
      <PublicServiceRequestPage />
    ) : (
      <>
        <App />
        <AlertDashboardEnhancer />
        <GoogleCalendarAlertEnhancer />
        <CleaningDeliveryFeature />
        <AirConditioningMapFeature />
        <PatrimonySpaceMapsFeature />
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
