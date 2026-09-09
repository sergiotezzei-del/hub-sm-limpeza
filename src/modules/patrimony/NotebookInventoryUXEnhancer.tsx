import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { downloadNotebookInventoryPdf } from "./services/notebookInventoryPdf";
import "./notebookInventoryUx.css";

type SuccessKind = "notebook" | "person";
type SuccessState = { kind: SuccessKind; title: string } | null;

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

function enhanceTeamSelects(root: ParentNode) {
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

export function NotebookInventoryUXEnhancer() {
  const [success, setSuccess] = useState<SuccessState>(null);
  const handledNoticeRef = useRef("");

  useEffect(() => {
    const enhance = () => {
      document.querySelectorAll<HTMLLabelElement>(".notebook-modal label, .patrimony-screen label")
        .forEach(ensurePersonSearch);
      enhanceTeamSelects(document);
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

      const notice = document.querySelector<HTMLElement>(".notebook-inventory-page > .notebook-inventory-notice");
      const message = (notice?.textContent ?? "").trim();
      if (!message) {
        handledNoticeRef.current = "";
        return;
      }
      if (message === handledNoticeRef.current) return;
      handledNoticeRef.current = message;

      if (/^NB-\d+\s+cadastrado/i.test(message)) {
        setSuccess({ kind: "notebook", title: "Notebook cadastrado com sucesso" });
      } else if (/pessoa adicionada ao diret[oó]rio/i.test(message) || /^pessoa salva:/i.test(message)) {
        setSuccess({ kind: "person", title: "Pessoa cadastrada com sucesso" });
      }
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  function handleNew() {
    const kind = success?.kind;
    setSuccess(null);
    window.setTimeout(() => {
      if (kind === "notebook") {
        findButtonByText(".notebook-inventory-actions button", "Inventariar notebook")?.click();
        return;
      }
      if (kind === "person") {
        findButtonByText(".notebook-inventory-actions button", "Pessoas")?.click();
        window.setTimeout(() => {
          findButtonByText(".notebook-directory-toolbar button", "Nova pessoa")?.click();
        }, 80);
      }
    }, 30);
  }

  if (!success) return null;

  return createPortal(
    <div className="hub-save-success-backdrop" role="presentation">
      <section className="hub-save-success-modal" role="dialog" aria-modal="true" aria-label={success.title}>
        <div className="hub-save-success-icon">✓</div>
        <h3>{success.title}</h3>
        <p>As informações foram salvas no HUB.</p>
        <div className="hub-save-success-actions">
          <button type="button" onClick={() => setSuccess(null)}>Sair</button>
          <button className="primary" type="button" onClick={handleNew}>
            {success.kind === "notebook" ? "Cadastrar novo notebook" : "Cadastrar nova pessoa"}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
