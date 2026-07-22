import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { CleaningDeliveryFeature } from "./modules/cleaning/components/CleaningDeliveryFeature";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <CleaningDeliveryFeature />
  </StrictMode>,
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch((error) => {
        console.error("Erro ao remover service worker:", error);
      });
  });
}

if ("caches" in window) {
  window.addEventListener("load", () => {
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .catch((error) => {
        console.error("Erro ao limpar cache do app:", error);
      });
  });
}
