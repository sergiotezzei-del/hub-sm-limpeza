import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { loadPatrimonyDataset, saveOrganizationPerson } from "./services/patrimonyService";
import {
  emptyPersonDocumentProfile,
  loadPersonDocumentProfile,
  savePersonDocumentProfile,
  type PersonDocumentProfile,
} from "./services/personDocumentProfileService";
import type { OrganizationPerson, PatrimonyPersonType } from "./types/patrimony.types";
import "./personDocumentProfiles.css";

const fields: Array<{ key: keyof PersonDocumentProfile; label: string; type?: string; placeholder?: string }> = [
  { key: "fullName", label: "Nome completo para documentos *", placeholder: "Nome completo conforme documento" },
  { key: "ihomeClientCode", label: "Código do cliente no iHome", placeholder: "Opcional · apenas números" },
  { key: "cpf", label: "CPF", placeholder: "Opcional" },
  { key: "rg", label: "RG", placeholder: "Opcional" },
  { key: "birthDate", label: "Data de nascimento", type: "date" },
  { key: "maritalStatus", label: "Estado civil" },
  { key: "nationality", label: "Nacionalidade" },
  { key: "phone", label: "Celular" },
  { key: "email", label: "E-mail", type: "email" },
  { key: "residentialPhone", label: "Telefone residencial" },
  { key: "commercialPhone", label: "Telefone comercial" },
  { key: "addressLine", label: "Endereço (rua, número e complemento)" },
  { key: "neighborhood", label: "Bairro" },
  { key: "city", label: "Cidade" },
  { key: "state", label: "Estado / UF" },
  { key: "postalCode", label: "CEP" },
];

function normalize(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function actorName() {
  try {
    const raw = sessionStorage.getItem("hub-sm-active-session");
    const session = raw ? JSON.parse(raw) as { name?: string; userName?: string } : null;
    return session?.name || session?.userName || "Admin HUB";
  } catch { return "Admin HUB"; }
}

export function PersonDocumentProfilesFeature() {
  const [screen, setScreen] = useState<HTMLElement | null>(null);
  const [tabs, setTabs] = useState<HTMLElement | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [active, setActive] = useState(false);
  const [people, setPeople] = useState<OrganizationPerson[]>([]);
  const [filter, setFilter] = useState("");
  const [personId, setPersonId] = useState("");
  const [newMode, setNewMode] = useState(false);
  const [newPerson, setNewPerson] = useState({ name: "", department: "", teamName: "", jobTitle: "", personType: "funcionario" as PatrimonyPersonType });
  const [profile, setProfile] = useState<PersonDocumentProfile>(emptyPersonDocumentProfile);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const sync = () => {
      const nextScreen = document.querySelector<HTMLElement>(".patrimony-screen");
      const nextTabs = nextScreen?.querySelector<HTMLElement>(".patrimony-tabs") ?? null;
      setScreen((current) => current === nextScreen ? current : nextScreen);
      setTabs((current) => current === nextTabs ? current : nextTabs);
      if (!nextScreen || !nextTabs) setActive(false);
    };
    sync();
    const root = document.getElementById("root");
    if (!root) return () => undefined;
    const observer = new MutationObserver(sync);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!tabs) { setHost(null); return () => undefined; }
    const element = document.createElement("div");
    element.className = "person-document-host";
    tabs.insertAdjacentElement("afterend", element);
    setHost(element);
    return () => { element.remove(); setHost(null); };
  }, [tabs]);

  useEffect(() => {
    if (!screen || !tabs || !host) return () => undefined;
    const siblings = Array.from(screen.children) as HTMLElement[];
    siblings.forEach((element) => {
      if (element === host || element === tabs) return;
      element.classList.toggle("person-document-native-hidden", active && Boolean(tabs.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING));
    });
    return () => siblings.forEach((element) => element.classList.remove("person-document-native-hidden"));
  }, [active, screen, tabs, host]);

  useEffect(() => {
    if (!tabs) return () => undefined;
    const onClick = (event: Event) => {
      const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("button");
      if (button && !button.hasAttribute("data-person-document-tab")) setActive(false);
    };
    tabs.addEventListener("click", onClick);
    return () => tabs.removeEventListener("click", onClick);
  }, [tabs]);

  useEffect(() => {
    if (!active) return;
    setLoading(true);
    void loadPatrimonyDataset()
      .then((data) => setPeople(data.people.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))))
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Erro ao carregar pessoas."))
      .finally(() => setLoading(false));
  }, [active]);

  useEffect(() => {
    if (!personId || newMode) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setSuccess("");
    void loadPersonDocumentProfile(personId)
      .then((data) => { if (!cancelled) setProfile(data); })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Erro ao carregar dados documentais."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [personId, newMode]);

  const filtered = useMemo(() => people.filter((person) => normalize(`${person.name} ${person.department} ${person.teamName ?? ""}`).includes(normalize(filter))), [people, filter]);
  const selectedPerson = people.find((person) => person.id === personId);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (!profile.fullName.trim()) { setError("Informe o nome completo da pessoa."); return; }
    if (reason.trim().length < 3) { setError("Informe o motivo da alteração."); return; }
    if (newMode && (!newPerson.name.trim() || !newPerson.department.trim())) { setError("Informe nome de sistema e setor."); return; }
    setSaving(true);
    setError("");
    setSuccess("");
    let targetId = personId;
    try {
      if (newMode) {
        const saved = await saveOrganizationPerson({
          name: newPerson.name.trim(), department: newPerson.department.trim(), teamName: newPerson.teamName.trim(),
          jobTitle: newPerson.jobTitle.trim(), personType: newPerson.personType, active: true,
        });
        targetId = saved.id;
        setPersonId(targetId);
        setNewMode(false);
      }
      if (!targetId) throw new Error("Selecione uma pessoa.");
      await savePersonDocumentProfile({ personId: targetId, profile, actorName: actorName(), reason });
      const refreshed = await loadPatrimonyDataset();
      setPeople(refreshed.people.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
      window.dispatchEvent(new CustomEvent("hub:organization-directory-updated"));
      setReason("");
      setSuccess("Dados documentais salvos com sucesso. Os próximos termos usarão o nome completo.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar.");
    } finally { setSaving(false); }
  }

  if (!tabs) return null;
  const tab = createPortal(
    <button type="button" data-person-document-tab="true" className={active ? "active" : ""} onClick={() => setActive(true)}>Dados para documentos</button>, tabs,
  );
  if (!host) return tab;
  return <>{tab}{createPortal(active && <section className="person-document-panel">
    <header><h2>Cadastro documental de pessoas</h2><p>Nome de sistema permanece igual ao iHome; nome completo é usado em recibos e documentos.</p></header>
    <div className="person-document-picker">
      <label>Buscar nome de sistema<input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Digite para localizar a pessoa" /></label>
      <label>Selecionar pessoa<select disabled={newMode || loading} value={newMode ? "" : personId} onChange={(event) => { setNewMode(false); setPersonId(event.target.value); setProfile(emptyPersonDocumentProfile()); }}>
        <option value="">Selecione</option>
        {filtered.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.department}{person.active ? "" : " · INATIVA"}</option>)}
      </select></label>
      <button type="button" onClick={() => { setNewMode(true); setPersonId(""); setProfile(emptyPersonDocumentProfile()); setNewPerson({ name: "", department: "", teamName: "", jobTitle: "", personType: "funcionario" }); setError(""); setSuccess(""); }}>+ Nova pessoa</button>
    </div>
    {loading && <p role="status">Carregando...</p>}
    {(personId || newMode) && <form onSubmit={(event) => { void save(event); }}>
      <div className="person-document-system"><strong>Nome de sistema:</strong> {newMode ? "Novo cadastro" : selectedPerson?.name} {selectedPerson && <span> · {selectedPerson.department} · {selectedPerson.teamName ?? "Sem equipe"}</span>}</div>
      {newMode && <div className="person-document-fields">
        <label>Nome de sistema *<input required value={newPerson.name} onChange={(event) => setNewPerson({ ...newPerson, name: event.target.value })} placeholder="Nome igual ao iHome" /></label>
        <label>Setor *<input required value={newPerson.department} onChange={(event) => setNewPerson({ ...newPerson, department: event.target.value })} /></label>
        <label>Equipe / gerente<input value={newPerson.teamName} onChange={(event) => setNewPerson({ ...newPerson, teamName: event.target.value })} /></label>
        <label>Função<input value={newPerson.jobTitle} onChange={(event) => setNewPerson({ ...newPerson, jobTitle: event.target.value })} /></label>
        <label>Tipo<select value={newPerson.personType} onChange={(event) => setNewPerson({ ...newPerson, personType: event.target.value as PatrimonyPersonType })}>
          <option value="funcionario">Funcionário</option><option value="corretor_terceirizado">Corretor</option><option value="consultor_terceirizado">Consultor</option><option value="prestador">Prestador</option><option value="temporario">Temporário</option><option value="outro">Outro</option>
        </select></label>
      </div>}
      <div className="person-document-fields">
        {fields.map((field) => <label key={field.key}>{field.label}<input
          type={field.type ?? "text"} value={profile[field.key]} placeholder={field.placeholder}
          required={field.key === "fullName"} autoComplete="off"
          onChange={(event) => setProfile((current) => ({ ...current, [field.key]: event.target.value }))}
        /></label>)}
      </div>
      <label className="person-document-reason">Motivo do cadastro/alteração *<textarea required minLength={3} rows={2} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ex.: nome completo conferido com cadastro do iHome" /></label>
      <p className="person-document-privacy">Dados pessoais disponíveis apenas a administradores autorizados. CPF, RG e endereço não aparecem nas listas de escolha de pessoas.</p>
      {error && <p className="person-document-error" role="alert">{error}</p>}
      {success && <p className="person-document-success" role="status">{success}</p>}
      <div className="person-document-actions"><button type="submit" disabled={saving || loading}>{saving ? "Salvando..." : "Salvar dados documentais"}</button></div>
    </form>}
  </section>, host)}</>;
}
