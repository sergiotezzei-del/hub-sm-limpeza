import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AppIcon } from "../../components/AppIcon";
import "./patrimonySpaceMaps.css";

type SpaceMapView = "tables" | "lockers" | null;

export function PatrimonySpaceMapsFeature() {
  const [screen, setScreen] = useState<HTMLElement | null>(null);
  const [tabHost, setTabHost] = useState<HTMLElement | null>(null);
  const [sourceButton, setSourceButton] = useState<HTMLButtonElement | null>(null);
  const [view, setView] = useState<SpaceMapView>(null);

  useEffect(() => {
    const sync = () => {
      const nextScreen = document.querySelector<HTMLElement>(".patrimony-screen");
      const nextTabs = nextScreen?.querySelector<HTMLElement>(".patrimony-tabs") ?? null;
      const nextSource = nextTabs
        ? Array.from(nextTabs.querySelectorAll<HTMLButtonElement>("button")).find((button) => normalize(button.textContent ?? "").includes("mesas e lockers")) ?? null
        : null;

      setScreen((current) => current === nextScreen ? current : nextScreen);
      setTabHost((current) => current === nextTabs ? current : nextTabs);
      setSourceButton((current) => current === nextSource ? current : nextSource);

      if (!nextScreen || !nextTabs || !nextSource) setView(null);
      tagSpaceSections(nextScreen);
    };

    sync();
    const root = document.getElementById("root");
    if (!root) return () => undefined;
    const observer = new MutationObserver(sync);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!sourceButton) return () => undefined;
    sourceButton.classList.add("space-maps-source-tab");
    sourceButton.setAttribute("aria-hidden", "true");
    sourceButton.tabIndex = -1;
    return () => {
      sourceButton.classList.remove("space-maps-source-tab");
      sourceButton.removeAttribute("aria-hidden");
      sourceButton.tabIndex = 0;
    };
  }, [sourceButton]);

  useEffect(() => {
    if (!screen) return () => undefined;
    screen.classList.toggle("space-map-view-tables", view === "tables");
    screen.classList.toggle("space-map-view-lockers", view === "lockers");
    tagSpaceSections(screen);
    return () => {
      screen.classList.remove("space-map-view-tables", "space-map-view-lockers");
    };
  }, [screen, view]);

  useEffect(() => {
    if (!tabHost) return () => undefined;
    const handleTabClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>("button");
      if (!button || button === sourceButton || button.hasAttribute("data-space-map-tab")) return;
      setView(null);
    };
    tabHost.addEventListener("click", handleTabClick);
    return () => tabHost.removeEventListener("click", handleTabClick);
  }, [sourceButton, tabHost]);

  function openView(nextView: Exclude<SpaceMapView, null>) {
    setView(nextView);
    sourceButton?.click();
    requestAnimationFrame(() => tagSpaceSections(screen));
  }

  if (!tabHost || !sourceButton) return null;

  return createPortal(
    <>
      <button
        className={view === "tables" ? "active" : ""}
        data-space-map-tab="tables"
        type="button"
        onClick={() => openView("tables")}
      >
        <AppIcon name="map" size="sm" className="action-icon" />
        Mapa de mesas
      </button>
      <button
        className={view === "lockers" ? "active" : ""}
        data-space-map-tab="lockers"
        type="button"
        onClick={() => openView("lockers")}
      >
        <AppIcon name="stock" size="sm" className="action-icon" />
        Mapa de lockers
      </button>
    </>,
    tabHost,
  );
}

function tagSpaceSections(screen: HTMLElement | null) {
  if (!screen) return;
  const cards = Array.from(screen.querySelectorAll<HTMLElement>(".patrimony-panel > .patrimony-card"));
  cards.forEach((card) => {
    const heading = normalize(card.querySelector("h2")?.textContent ?? "");
    card.classList.toggle("space-map-lockers-section", heading === "lockers");
    card.classList.toggle("space-map-tables-section", heading.includes("mesas da locacao"));
    card.classList.toggle("space-map-keys-section", heading.includes("chaves vinculadas"));
  });
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
