import { useEffect } from "react";
import { showHubSaveSuccess } from "../../shared/ui/HubSaveSuccessHost";
import {
  getPatrimonyErrorMessage,
  saveOrganizationPerson,
} from "./services/patrimonyService";
import "./notebookPersonCombobox.css";

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

function isPersonLabel(label: HTMLLabelElement) {
  const text = normalize(directText(label));
  return text.includes("nome da pessoa") || text === "pessoa";
}

function findLabelSelect(root: ParentNode, needle: string) {
  return Array.from(root.querySelectorAll<HTMLLabelElement>("label"))
    .find((label) => normalize(directText(label)).includes(normalize(needle)))
    ?.querySelector<HTMLSelectElement>("select") ?? null;
}

function getSelectedText(select: HTMLSelectElement) {
  const option = select.options[select.selectedIndex];
  if (!select.value || !option) return "";
  return (option.textContent ?? "").trim();
}

function findCurrentPersonSelect() {
  const modal = document.querySelector<HTMLElement>(".notebook-modal");
  if (!modal) return null;
  return Array.from(modal.querySelectorAll<HTMLLabelElement>("label"))
    .find(isPersonLabel)
    ?.querySelector<HTMLSelectElement>("select") ?? null;
}

function clickInventoryRefresh() {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>(".notebook-inventory-toolbar button"))
    .find((entry) => normalize(entry.textContent ?? "") === "atualizar");
  button?.click();
}

function ensureOption(select: HTMLSelectElement, value: string, text: string) {
  let option = Array.from(select.options).find((entry) => entry.value === value);
  if (!option) {
    option = document.createElement("option");
    option.value = value;
    select.appendChild(option);
  }
  option.textContent = text;
}

function optionValuesFrom(select: HTMLSelectElement | null) {
  if (!select) return [];
  return Array.from(select.options)
    .filter((option) => option.value)
    .map((option) => ({ value: option.value, label: (option.textContent ?? "").trim() }))
    .filter((entry) => entry.label && !normalize(entry.label).includes("selecione"));
}

function openNewPersonDialog(targetSelect: HTMLSelectElement, suggestedName = "") {
  document.querySelector("[data-hub-new-person-overlay='true']")?.remove();

  const notebookModal = targetSelect.closest<HTMLElement>(".notebook-modal");
  const departmentSelect = notebookModal ? findLabelSelect(notebookModal, "setor") : null;
  const teamSelect = notebookModal ? findLabelSelect(notebookModal, "equipe / gerente") : null;
  const departments = optionValuesFrom(departmentSelect);
  const teams = optionValuesFrom(teamSelect);

  const overlay = document.createElement("div");
  overlay.className = "hub-new-person-overlay";
  overlay.dataset.hubNewPersonOverlay = "true";

  const form = document.createElement("form");
  form.className = "hub-new-person-card";
  form.innerHTML = `
    <header>
      <div>
        <h3>Cadastrar nova pessoa</h3>
        <p>Esse nome ficará salvo no diretório central do HUB.</p>
      </div>
      <button type="button" data-close="true" aria-label="Fechar">×</button>
    </header>
    <label>Nome da pessoa
      <input name="name" required autocomplete="off" placeholder="Digite o nome" />
    </label>
    <div class="hub-new-person-grid">
      <label>Setor
        <input name="department" required autocomplete="off" list="hub-person-departments" placeholder="Ex.: Vendas" />
        <datalist id="hub-person-departments"></datalist>
      </label>
      <label>Equipe / gerente
        <input name="teamName" autocomplete="off" list="hub-person-teams" placeholder="Sem equipe / gerente" />
        <datalist id="hub-person-teams"></datalist>
      </label>
    </div>
    <div class="hub-new-person-error" data-error="true" role="status"></div>
    <footer>
      <button type="button" data-close="true">Cancelar</button>
      <button type="submit" class="primary">Salvar pessoa</button>
    </footer>
  `;

  const nameInput = form.elements.namedItem("name") as HTMLInputElement;
  const departmentInput = form.elements.namedItem("department") as HTMLInputElement;
  const teamInput = form.elements.namedItem("teamName") as HTMLInputElement;
  const departmentList = form.querySelector<HTMLDataListElement>("#hub-person-departments");
  const teamList = form.querySelector<HTMLDataListElement>("#hub-person-teams");
  const errorBox = form.querySelector<HTMLElement>("[data-error='true']");
  const submit = form.querySelector<HTMLButtonElement>("button[type='submit']");

  departments.forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.value;
    option.label = entry.label;
    departmentList?.appendChild(option);
  });
  teams.forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.value;
    option.label = entry.label;
    teamList?.appendChild(option);
  });

  nameInput.value = suggestedName.trim();

  const close = () => overlay.remove();
  form.querySelectorAll<HTMLButtonElement>("[data-close='true']").forEach((button) => button.addEventListener("click", close));
  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay) close();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!nameInput.value.trim() || !departmentInput.value.trim() || submit?.disabled) return;

    if (submit) {
      submit.disabled = true;
      submit.textContent = "Salvando...";
    }
    if (errorBox) errorBox.textContent = "";

    try {
      const saved = await saveOrganizationPerson({
        name: nameInput.value.trim(),
        personType: "funcionario",
        department: departmentInput.value.trim(),
        teamName: teamInput.value.trim(),
        active: true,
      });

      window.dispatchEvent(new CustomEvent("hub:organization-directory-updated"));
      clickInventoryRefresh();
      close();

      window.setTimeout(() => {
        const currentSelect = findCurrentPersonSelect() ?? targetSelect;
        ensureOption(currentSelect, saved.id, saved.name);
        currentSelect.value = saved.id;
        currentSelect.dispatchEvent(new Event("change", { bubbles: true }));
        currentSelect.dispatchEvent(new CustomEvent("hub:person-combobox-sync", { bubbles: true }));
      }, 450);

      showHubSaveSuccess({
        title: "Pessoa cadastrada com sucesso",
        newLabel: "Cadastrar nova pessoa",
        onNew: () => {
          const currentSelect = findCurrentPersonSelect() ?? targetSelect;
          openNewPersonDialog(currentSelect);
        },
      });
    } catch (error) {
      if (errorBox) errorBox.textContent = getPatrimonyErrorMessage(error);
      if (submit) {
        submit.disabled = false;
        submit.textContent = "Salvar pessoa";
      }
    }
  });

  overlay.appendChild(form);
  document.body.appendChild(overlay);
  window.setTimeout(() => nameInput.focus(), 0);
}

function enhancePersonLabel(label: HTMLLabelElement) {
  if (!isPersonLabel(label)) return;
  const select = label.querySelector<HTMLSelectElement>("select");
  if (!select) return;

  const legacySearch = label.querySelector<HTMLInputElement>("[data-hub-person-search='true']");
  if (legacySearch) legacySearch.style.display = "none";
  select.classList.add("hub-person-native-select-hidden");

  let wrapper = label.querySelector<HTMLElement>("[data-hub-person-combobox='true']");
  if (wrapper) {
    const input = wrapper.querySelector<HTMLInputElement>("input");
    if (input && document.activeElement !== input) input.value = getSelectedText(select);
    return;
  }

  wrapper = document.createElement("div");
  wrapper.className = "hub-person-combobox";
  wrapper.dataset.hubPersonCombobox = "true";

  const input = document.createElement("input");
  input.type = "text";
  input.autocomplete = "off";
  input.placeholder = "Digite ou selecione um nome";
  input.value = getSelectedText(select);
  input.className = "hub-person-combobox-input";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "hub-person-combobox-toggle";
  toggle.setAttribute("aria-label", "Abrir lista de pessoas");
  toggle.textContent = "⌄";

  const dropdown = document.createElement("div");
  dropdown.className = "hub-person-combobox-menu";
  dropdown.hidden = true;

  let openedWithoutFilter = false;

  const close = () => {
    dropdown.hidden = true;
    wrapper?.classList.remove("open");
  };

  const choose = (value: string, text: string) => {
    ensureOption(select, value, text);
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    input.value = value ? text : "";
    openedWithoutFilter = false;
    close();
  };

  const render = () => {
    dropdown.replaceChildren();
    const typed = input.value.trim();
    const term = openedWithoutFilter ? "" : normalize(typed);

    const options = Array.from(select.options)
      .filter((option) => !option.disabled && !option.hidden)
      .map((option) => ({ value: option.value, text: (option.textContent ?? "").trim() }))
      .filter((entry) => entry.text)
      .filter((entry) => !term || normalize(entry.text).includes(term));

    options.forEach((entry) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "hub-person-combobox-option";
      if (entry.value === select.value) button.classList.add("selected");
      button.textContent = entry.text;
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => choose(entry.value, entry.value ? entry.text : ""));
      dropdown.appendChild(button);
    });

    if (options.length === 0) {
      const empty = document.createElement("div");
      empty.className = "hub-person-combobox-empty";
      empty.textContent = "Nenhum nome encontrado.";
      dropdown.appendChild(empty);
    }

    const add = document.createElement("button");
    add.type = "button";
    add.className = "hub-person-combobox-add";
    add.textContent = typed && !openedWithoutFilter ? `+ Cadastrar “${typed}”` : "+ Cadastrar novo nome";
    add.addEventListener("mousedown", (event) => event.preventDefault());
    add.addEventListener("click", () => {
      close();
      openNewPersonDialog(select, typed && !openedWithoutFilter ? typed : "");
    });
    dropdown.appendChild(add);
  };

  const open = (showAll: boolean) => {
    openedWithoutFilter = showAll;
    render();
    dropdown.hidden = false;
    wrapper?.classList.add("open");
  };

  input.addEventListener("focus", () => open(true));
  input.addEventListener("click", () => open(true));
  input.addEventListener("input", () => {
    openedWithoutFilter = false;
    open(false);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      close();
      input.value = getSelectedText(select);
      return;
    }
    if (event.key === "Enter" && !dropdown.hidden) {
      const first = dropdown.querySelector<HTMLButtonElement>(".hub-person-combobox-option");
      if (first) {
        event.preventDefault();
        first.click();
      }
    }
  });

  toggle.addEventListener("click", () => {
    if (dropdown.hidden) {
      input.focus();
      open(true);
    } else {
      close();
    }
  });

  const sync = () => {
    if (document.activeElement !== input) input.value = getSelectedText(select);
  };
  select.addEventListener("change", () => window.setTimeout(sync, 0));
  select.addEventListener("hub:person-combobox-sync", sync as EventListener);

  const onDocumentMouseDown = (event: MouseEvent) => {
    if (!wrapper?.contains(event.target as Node)) close();
  };
  document.addEventListener("mousedown", onDocumentMouseDown);

  wrapper.append(input, toggle, dropdown);
  select.insertAdjacentElement("beforebegin", wrapper);
}

export function NotebookPersonComboboxEnhancer() {
  useEffect(() => {
    const enhance = () => {
      document.querySelectorAll<HTMLLabelElement>(".notebook-modal label").forEach(enhancePersonLabel);
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
