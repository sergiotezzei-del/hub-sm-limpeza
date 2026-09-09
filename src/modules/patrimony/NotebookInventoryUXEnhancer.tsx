import { useEffect, useRef, useState } from "react";
import { loadOrganizationDirectory } from "../../shared/organization/organizationDirectory";
import { showHubSaveSuccess } from "../../shared/ui/HubSaveSuccessHost";
import { NotebookItemEditEnhancer } from "./NotebookItemEditEnhancer";
import { downloadNotebookInventoryPdf } from "./services/notebookInventoryPdf";
import "./notebookInventoryUx.css";

const COMBINED_LEASING_TEAM = "Equipe Ramzy/Adriana";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function directText(element: Element) {
  return Array.from(element.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? "")
    .join(" ")
    .trim();
}

function ensurePersonSearch(label: HTMLLabelElement) {
  const select = label.querySelector<HTMLSelectElement>("select");
  if (!select || label.querySelector("[data-hub-person-search='true']")) return;

  const ownLabel = normalize(directText(label));
  if (!(ownLabel.includes("nome da pessoa") || ownLabel === "pessoa" || ownLabel.startsWith("pessoa "))) return;

  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = "Buscar nome...";
  input.autocomplete = "off";
  input.className = "hub-directory-person-search";
  input.dataset.hubPersonSearch = "true";

  const applyFilter = () => {
    const term = normalize(input.value);
    Array.from(select.options).forEach((option) => {
      if (!option.value || option.selected) {
        option.hidden = false;
        return;
      }
      option.hidden = Boolean(term) && !normalize(option.textContent ?? "").includes(term);
    });
  };

  input.addEventListener("input", applyFilter);
  input.addEventListener("search", applyFilter);
  label.insertBefore(input, select);
}

function ensureCombinedLeasingTeam(select: HTMLSelectElement) {
  if (Array.from(select.options).some((option) => option.value === COMBINED_LEASING_TEAM)) return;
  const option = document.createElement("option");
  option.value = COMBINED_LEASING_TEAM;
  option.textContent = "Ramzy/Adriana";
  select.appendChild(option);
}

function selectedPersonIdInside(container: Element | null) {
  if (!container) return "";
  const label = Array.from(container.querySelectorAll<HTMLLabelElement>("label"))
    .find((entry) => normalize(directText(entry)).includes("nome da pessoa"));
  return label?.querySelector<HTMLSelectElement>("select")?.value ?? "";
}

function enhanceTeamSelects(root: ParentNode, teamByPersonId: Map<string, string>) {
  root.querySelectorAll<HTMLLabelElement>("label").forEach((label) => {
    const labelText = normalize(directText(label));
    if (!labelText.includes("equipe / gerente")) return;
    const select = label.querySelector<HTMLSelectElement>("select");
    if (!select) return;
    ensureCombinedLeasingTeam(select);
    Array.from(select.options).forEach((option) => {
      if (option.value === "Equipe Ramzy" || option.value === "Equipe Adriana") {
        option.hidden = true;
        option.disabled = true;
      }
    });

    const modal = label.closest(".notebook-modal");
    const personId = selectedPersonIdInside(modal);
    if (personId && teamByPersonId.get(personId) === COMBINED_LEASING_TEAM) {
      select.value = COMBINED_LEASING_TEAM;
    }
  });
}

function removeDeveloperCreditFromDialogs(root: ParentNode) {
  root.querySelectorAll<HTMLElement>("[role='dialog'], .notebook-modal, [class*='-modal']").forEach((dialog) => {
    dialog.querySelectorAll<HTMLElement>("small, span, p, div, footer").forEach((element) => {
      if (element.children.length > 0) return;
      if (/desenvolvido\s+por/i.test(element.textContent ?? "")) element.remove();
    });
  });
}

function findButtonByText(selector: string, text: string) {
  const needle = normalize(text);
  return Array.from(document.querySelectorAll<HTMLButtonElement>(selector))
    .find((button) => normalize(button.textContent ?? "").includes(needle));
}

function openNewNotebook() {
  findButtonByText(".notebook-inventory-actions button", "Inventariar notebook")?.click();
}

function openNewPerson() {
  findButtonByText(".notebook-inventory-actions button", "Pessoas")?.click();
  window.setTimeout(() => {
    findButtonByText(".notebook-directory-toolbar button", "Nova pessoa")?.click();
  }, 80);
}

function openNativePatrimonyRecord(recordLabel: "Pessoas" | "Itens") {
  findButtonByText(".patrimony-tabs button", "Cadastros e histórico")?.click();
  window.setTimeout(() => {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(".patrimony-screen button"));
    const target = buttons.find((button) => normalize(button.textContent ?? "") === normalize(recordLabel));
    target?.click();
  }, 50);
}

function openLockerArea() {
  findButtonByText(".patrimony-tabs button", "Mesas e lockers")?.click();
}

export function NotebookInventoryUXEnhancer() {
  const handledNoticeRef = useRef("");
  const handledPatrimonyNoticeRef = useRef("");
  const teamByPersonIdRef = useRef(new Map<string, string>());
  const [directoryVersion, setDirectoryVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const refreshDirectory = () => {
      void loadOrganizationDirectory(true)
        .then((people) => {
          if (cancelled) return;
          teamByPersonIdRef.current = new Map(people.map((person) => [person.id, person.teamName ?? ""]));
          setDirectoryVersion((current) => current + 1);
        })
        .catch((error) => console.warn("Diretório central indisponível para complemento visual:", error));
    };

    refreshDirectory();
    const handleDirectoryChange = () => refreshDirectory();
    window.addEventListener("hub:organization-directory-updated", handleDirectoryChange);
    return () => {
      cancelled = true;
      window.removeEventListener("hub:organization-directory-updated", handleDirectoryChange);
    };
  }, []);

  useEffect(() => {
    const enhance = () => {
      document.querySelectorAll<HTMLLabelElement>(".notebook-modal label, .patrimony-screen label")
        .forEach(ensurePersonSearch);
      enhanceTeamSelects(document, teamByPersonIdRef.current);
      removeDeveloperCreditFromDialogs(document);

      const actions = document.querySelector<HTMLElement>(".notebook-inventory-actions");
      if (actions && !actions.querySelector("[data-notebook-report-button='true']")) {
        const reportButton = document.createElement("button");
        reportButton.type = "button";
        reportButton.textContent = "Gerar relatório PDF";
        reportButton.dataset.notebookReportButton = "true";
        reportButton.className = "notebook-report-button";
        reportButton.addEventListener("click", async () => {
          if (reportButton.disabled) return;
          reportButton.disabled = true;
          const original = reportButton.textContent;
          reportButton.textContent = "Gerando PDF...";
          try {
            const result = await downloadNotebookInventoryPdf();
            reportButton.textContent = `PDF gerado · ${result.total} notebooks`;
            window.setTimeout(() => {
              if (document.body.contains(reportButton)) reportButton.textContent = original;
            }, 2200);
          } catch (error) {
            reportButton.textContent = "Erro ao gerar PDF";
            console.error("Falha ao gerar relatório do inventário:", error);
            window.setTimeout(() => {
              if (document.body.contains(reportButton)) reportButton.textContent = original;
            }, 2500);
          } finally {
            reportButton.disabled = false;
          }
        });
        const primary = actions.querySelector("button.primary");
        if (primary) actions.insertBefore(reportButton, primary);
        else actions.appendChild(reportButton);
      }

      const notebookNotice = document.querySelector<HTMLElement>(".notebook-inventory-page > .notebook-inventory-notice");
      const notebookMessage = (notebookNotice?.textContent ?? "").trim();
      if (!notebookMessage) {
        handledNoticeRef.current = "";
      } else if (notebookMessage !== handledNoticeRef.current) {
        handledNoticeRef.current = notebookMessage;
        if (/^NB-\d+\s+cadastrado/i.test(notebookMessage)) {
          showHubSaveSuccess({
            title: "Notebook cadastrado com sucesso",
            newLabel: "Cadastrar novo notebook",
            onNew: openNewNotebook,
          });
        } else if (/pessoa adicionada ao diret[oó]rio/i.test(notebookMessage)) {
          showHubSaveSuccess({
            title: "Pessoa cadastrada com sucesso",
            newLabel: "Cadastrar nova pessoa",
            onNew: openNewPerson,
          });
        }
      }

      const patrimonyNotice = document.querySelector<HTMLElement>(".patrimony-screen > .success-message");
      const patrimonyMessage = (patrimonyNotice?.textContent ?? "").trim();
      if (!patrimonyMessage) {
        handledPatrimonyNoticeRef.current = "";
      } else if (patrimonyMessage !== handledPatrimonyNoticeRef.current) {
        handledPatrimonyNoticeRef.current = patrimonyMessage;
        if (/^pessoa salva:/i.test(patrimonyMessage)) {
          showHubSaveSuccess({
            title: "Pessoa cadastrada com sucesso",
            newLabel: "Cadastrar nova pessoa",
            onNew: () => openNativePatrimonyRecord("Pessoas"),
          });
        } else if (/^item salvo:/i.test(patrimonyMessage)) {
          showHubSaveSuccess({
            title: "Item cadastrado com sucesso",
            newLabel: "Cadastrar novo item",
            onNew: () => openNativePatrimonyRecord("Itens"),
          });
        } else if (/\batribu[ií]do para\b/i.test(patrimonyMessage)) {
          showHubSaveSuccess({
            title: "Locker atribuído com sucesso",
            newLabel: "Atribuir outro locker",
            onNew: openLockerArea,
          });
        }
      }
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [directoryVersion]);

  return <NotebookItemEditEnhancer />;
}
