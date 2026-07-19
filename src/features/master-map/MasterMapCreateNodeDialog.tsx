import { useEffect, useMemo, useState } from "react";
import { AppIcon, type AppIconName } from "../../components/AppIcon";
import { dynamicPageTypeLabels, type DynamicPageTemplate, type DynamicPageType } from "./dynamicPageTypes";
import type { MasterMapDestinationType, MasterMapNodeType, MasterMapTargetScreen } from "./masterMapTypes";

export type MasterMapCreateNodeDraft = {
  title: string;
  description: string;
  nodeType: MasterMapNodeType;
  iconKey: AppIconName;
  destinationType: MasterMapDestinationType;
  targetScreen?: MasterMapTargetScreen;
  externalUrl?: string;
  plannedModuleKey?: string;
  pageType?: DynamicPageType;
  templateId?: string;
};

type MasterMapCreateNodeDialogProps = {
  open: boolean;
  mode: "node" | "child";
  templates: DynamicPageTemplate[];
  onClose: () => void;
  onSubmit: (draft: MasterMapCreateNodeDraft) => void;
};

const nodeTypeOptions: Array<{ value: MasterMapNodeType; label: string }> = [
  { value: "module", label: "Modulo" },
  { value: "submodule", label: "Submodulo" },
  { value: "project", label: "Projeto" },
  { value: "task", label: "Tarefa" },
  { value: "physical", label: "Fisico" },
  { value: "integration", label: "Integracao" },
  { value: "milestone", label: "Marco" },
];

const iconOptions: AppIconName[] = [
  "map",
  "cleaning",
  "coffee",
  "water",
  "security",
  "guards",
  "parking",
  "vehicle",
  "search",
  "camera",
  "edit",
  "save",
  "warning",
  "success",
  "blocked",
  "stock",
  "users",
  "reports",
  "qr",
  "payment",
  "settings",
];

const destinationOptions: Array<{ value: MasterMapDestinationType; label: string }> = [
  { value: "NONE", label: "Apenas mostrar detalhes" },
  { value: "DYNAMIC_PAGE", label: "Criar/abrir pagina dinamica" },
  { value: "EXISTING_SCREEN", label: "Abrir tela existente" },
  { value: "EXTERNAL_URL", label: "Abrir link externo" },
  { value: "PLANNED_MODULE", label: "Modulo ainda nao desenvolvido" },
];

const targetScreenOptions: Array<{ value: MasterMapTargetScreen; label: string }> = [
  { value: "cleaning-dashboard", label: "Limpeza" },
  { value: "current-stock", label: "Estoque Atual da Limpeza" },
  { value: "stock-exit-history", label: "Historico de Estoque" },
  { value: "product-register", label: "Cadastro de Produtos" },
  { value: "copa-cafe-menu", label: "Copa & Cafe" },
  { value: "security-menu", label: "Seguranca" },
  { value: "security-guards", label: "Guardas" },
  { value: "security-monitoring", label: "Monitoramento" },
  { value: "security-parking", label: "Estacionamento" },
  { value: "security-guards-payment", label: "Fechamento / Pagamento" },
  { value: "users-permissions", label: "Usuarios & Permissoes" },
  { value: "system-status", label: "Status do Sistema" },
  { value: "master-map", label: "Mapa Mestre" },
];

const pageTypes = Object.keys(dynamicPageTypeLabels) as DynamicPageType[];

export function MasterMapCreateNodeDialog({ open, mode, templates, onClose, onSubmit }: MasterMapCreateNodeDialogProps) {
  const [draft, setDraft] = useState<MasterMapCreateNodeDraft>(() => getInitialDraft(mode, templates));
  const templateOptions = useMemo(() => templates.filter((template) => template.pageType === draft.pageType), [draft.pageType, templates]);
  const selectedTemplateId = draft.templateId && templateOptions.some((template) => template.id === draft.templateId)
    ? draft.templateId
    : templateOptions[0]?.id;

  useEffect(() => {
    if (open) setDraft(getInitialDraft(mode, templates));
  }, [mode, open, templates]);

  if (!open) return null;

  function submit() {
    const title = draft.title.trim();
    if (!title) return;
    if (draft.destinationType === "DYNAMIC_PAGE" && !selectedTemplateId) return;
    if (draft.destinationType === "EXTERNAL_URL" && !isSafeUrl(draft.externalUrl)) return;
    onSubmit({
      ...draft,
      title,
      description: draft.description.trim(),
      templateId: selectedTemplateId,
      targetScreen: draft.destinationType === "EXISTING_SCREEN" ? draft.targetScreen : undefined,
      externalUrl: draft.destinationType === "EXTERNAL_URL" ? draft.externalUrl?.trim() : undefined,
      plannedModuleKey: draft.destinationType === "PLANNED_MODULE" ? draft.plannedModuleKey?.trim() : undefined,
    });
  }

  return (
    <div className="dialog-backdrop">
      <section className="dialog master-map-create-dialog" role="dialog" aria-modal="true" aria-labelledby="master-map-create-title">
        <div className="master-map-details-head">
          <div>
            <p className="eyebrow">Mapa Mestre</p>
            <h2 id="master-map-create-title">{mode === "child" ? "Criar no filho" : "Criar no mapa"}</h2>
          </div>
          <button className="ghost-button" type="button" onClick={onClose}>Fechar</button>
        </div>

        <label>Nome do quadro
          <input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
        </label>
        <label>Descricao curta
          <textarea rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
        </label>
        <div className="master-map-form-grid">
          <label>Tipo
            <select value={draft.nodeType} onChange={(event) => setDraft({ ...draft, nodeType: event.target.value as MasterMapNodeType })}>
              {nodeTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>Icone
            <select value={draft.iconKey} onChange={(event) => setDraft({ ...draft, iconKey: event.target.value as AppIconName })}>
              {iconOptions.map((icon) => <option key={icon} value={icon}>{icon}</option>)}
            </select>
          </label>
        </div>

        <label>Ao clicar neste quadro, o que deve acontecer?
          <select value={draft.destinationType} onChange={(event) => setDraft({ ...draft, destinationType: event.target.value as MasterMapDestinationType })}>
            {destinationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>

        {draft.destinationType === "DYNAMIC_PAGE" && (
          <div className="master-map-form-grid">
            <label>Tipo de pagina
              <select value={draft.pageType} onChange={(event) => setDraft({ ...draft, pageType: event.target.value as DynamicPageType, templateId: undefined })}>
                {pageTypes.map((type) => <option key={type} value={type}>{dynamicPageTypeLabels[type]}</option>)}
              </select>
            </label>
            <label>Template
              <select value={selectedTemplateId ?? ""} onChange={(event) => setDraft({ ...draft, templateId: event.target.value })}>
                {templateOptions.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
            </label>
          </div>
        )}

        {draft.destinationType === "EXISTING_SCREEN" && (
          <label>Tela existente
            <select value={draft.targetScreen ?? "master-map"} onChange={(event) => setDraft({ ...draft, targetScreen: event.target.value as MasterMapTargetScreen })}>
              {targetScreenOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        )}

        {draft.destinationType === "EXTERNAL_URL" && (
          <label>Link externo seguro
            <input placeholder="https://..." value={draft.externalUrl ?? ""} onChange={(event) => setDraft({ ...draft, externalUrl: event.target.value })} />
          </label>
        )}

        {draft.destinationType === "PLANNED_MODULE" && (
          <label>Chave do modulo planejado
            <input placeholder="ex.: sm-key-control-operacao" value={draft.plannedModuleKey ?? ""} onChange={(event) => setDraft({ ...draft, plannedModuleKey: event.target.value })} />
          </label>
        )}

        <div className="master-map-details-actions">
          <button className="primary-button" type="button" onClick={submit}><AppIcon name="save" size="sm" className="action-icon" />Criar quadro</button>
          <button className="ghost-button" type="button" onClick={onClose}>Cancelar</button>
        </div>
      </section>
    </div>
  );
}

function getInitialDraft(mode: "node" | "child", templates: DynamicPageTemplate[]): MasterMapCreateNodeDraft {
  const firstProjectTemplate = templates.find((template) => template.pageType === "PROJECT");
  return {
    title: mode === "child" ? "Novo quadro filho" : "Novo quadro",
    description: "",
    nodeType: mode === "child" ? "task" : "project",
    iconKey: "settings",
    destinationType: "NONE",
    targetScreen: "master-map",
    pageType: "PROJECT",
    templateId: firstProjectTemplate?.id,
  };
}

function isSafeUrl(value?: string) {
  return Boolean(value && /^https?:\/\/\S+$/i.test(value.trim()));
}
