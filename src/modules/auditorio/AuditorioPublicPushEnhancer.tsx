import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HubPublicPushSetupCard } from "../public-push/HubPublicPushSetupCard";
import {
  prepareAuditorioPushByAccess,
  type HubPublicPushSetup,
} from "../public-push/hubPublicPushClient";

export function AuditorioPublicPushEnhancer() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [setup, setSetup] = useState<HubPublicPushSetup | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [failed, setFailed] = useState(false);
  const preparedKey = useRef("");

  useEffect(() => {
    const sync = () => {
      const next = document.querySelector<HTMLElement>(".auditorio-public-success")
        || document.querySelector<HTMLElement>(".auditorio-status-card");
      setHost((current) => current === next ? current : next);
    };
    sync();
    const root = document.getElementById("root");
    if (!root) return;
    const observer = new MutationObserver(sync);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!host) {
      setSetup(null);
      setFailed(false);
      preparedKey.current = "";
      return;
    }

    const { protocolText, accessCode } = readAccessData(host);
    const protocolNumber = parseProtocolNumber(protocolText);
    if (!protocolNumber || !accessCode) return;

    const key = `${protocolNumber}:${accessCode}`;
    if (preparedKey.current === key) return;
    preparedKey.current = key;
    setPreparing(true);
    setFailed(false);
    setSetup(null);

    void prepareAuditorioPushByAccess(protocolNumber, accessCode)
      .then(setSetup)
      .catch(() => setFailed(true))
      .finally(() => setPreparing(false));
  }, [host]);

  if (!host) return null;
  return createPortal(
    <HubPublicPushSetupCard
      setup={setup}
      preparing={preparing}
      prepareFailed={failed}
      contextLabel="Auditório"
    />,
    host,
  );
}

function readAccessData(host: HTMLElement) {
  if (host.classList.contains("auditorio-public-success")) {
    return {
      protocolText: host.querySelector<HTMLElement>(".auditorio-receipt:not(.code) strong")?.textContent?.trim() || "",
      accessCode: host.querySelector<HTMLElement>(".auditorio-receipt.code strong")?.textContent?.trim() || "",
    };
  }

  const inputs = document.querySelectorAll<HTMLInputElement>(".auditorio-consult-form input");
  return {
    protocolText: inputs[0]?.value?.trim() || "",
    accessCode: inputs[1]?.value?.trim() || "",
  };
}

function parseProtocolNumber(value: string) {
  const match = value.toUpperCase().match(/(?:AUD-)?(?:\d{4}-)?(\d{1,12})$/);
  const parsed = Number(match?.[1] || "");
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}
