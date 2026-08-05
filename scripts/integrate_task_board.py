from __future__ import annotations

from pathlib import Path

APP_PATH = Path("src/App.tsx")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: esperado 1 trecho, encontrado {count}")
    return text.replace(old, new, 1)


def main() -> None:
    text = APP_PATH.read_text(encoding="utf-8")

    text = replace_once(
        text,
        'const PatrimonyScreen = lazy(() => import("./modules/patrimony/PatrimonyScreen").then((module) => ({ default: module.PatrimonyScreen })));',
        'const PatrimonyScreen = lazy(() => import("./modules/patrimony/PatrimonyScreen").then((module) => ({ default: module.PatrimonyScreen })));\nconst TaskBoardScreen = lazy(() => import("./modules/tasks/TaskBoardScreen").then((module) => ({ default: module.TaskBoardScreen })));',
        "import lazy de Afazeres",
    )

    text = replace_once(
        text,
        '  | "admin"\n  | "cleaning-dashboard"',
        '  | "admin"\n  | "tasks-board"\n  | "cleaning-dashboard"',
        "view de Afazeres",
    )

    text = replace_once(
        text,
        '  { id: "patrimonio", label: "Patrimônio" },\n  { id: "relatorios", label: "Relatórios" },',
        '  { id: "patrimonio", label: "Patrimônio" },\n  { id: "afazeres", label: "Afazeres" },\n  { id: "relatorios", label: "Relatórios" },',
        "opção de permissão de Afazeres",
    )

    text = replace_once(
        text,
        '''  function openAssetsMaterialsMenu() {
    if (!hasAnyCurrentPermission(["estoque", "patrimonio"])) {''',
        '''  function openTaskBoard() {
    if (currentUser !== "tezzei" || !hasCurrentPermission("afazeres")) {
      setNotice("Sem permissão para acessar Afazeres.");
      return;
    }

    setNotice("");
    setSelectedGuardName(null);
    setView("tasks-board");
  }

  function openAssetsMaterialsMenu() {
    if (!hasAnyCurrentPermission(["estoque", "patrimonio"])) {''',
        "função para abrir Afazeres",
    )

    text = replace_once(
        text,
        '          onOpenMaintenance={openMaintenanceMenu}\n          onOpenAssetsMaterials={openAssetsMaterialsMenu}',
        '          onOpenMaintenance={openMaintenanceMenu}\n          onOpenTasks={openTaskBoard}\n          onOpenAssetsMaterials={openAssetsMaterialsMenu}',
        "prop de Afazeres no menu Admin",
    )

    text = replace_once(
        text,
        '''      {view === "copa-cafe-menu" && <CopaCafeMenuScreen permissions={getManagedUserPermissions(currentUser, managedUsers)} onBack={() => setView(getCurrentHomeView())} onLogout={goToLogin} />}''',
        '''      {view === "tasks-board" && (
        currentUser === "tezzei" && currentManagedUser && hasCurrentPermission("afazeres") ? (
          <Suspense fallback={<section className="screen"><TopBar title="Afazeres" subtitle="Carregando seu quadro de trabalho." onLogout={goToLogin} /><section className="empty-state"><h2>Carregando Afazeres...</h2></section></section>}>
            <TaskBoardScreen
              currentUser={currentManagedUser}
              managedUsers={managedUsers}
              permissions={getManagedUserPermissions(currentUser, managedUsers)}
              onBack={() => setView("admin")}
              onLogout={goToLogin}
            />
          </Suspense>
        ) : (
          <AccessDeniedScreen onBack={() => setView(getCurrentHomeView())} onLogout={goToLogin} />
        )
      )}

      {view === "copa-cafe-menu" && <CopaCafeMenuScreen permissions={getManagedUserPermissions(currentUser, managedUsers)} onBack={() => setView(getCurrentHomeView())} onLogout={goToLogin} />}''',
        "renderização da tela Afazeres",
    )

    old_signature = 'function AdminSectorHomeScreen({ user, notice, newOrdersCount, onlineEnabled, permissions, onLogout, onProfilePhotoChange, onOpenCleaningDashboard, onOpenCopaCafe, onOpenSecurity, onOpenMaintenance, onOpenAssetsMaterials, onOpenHubAdministration }: { user: ManagedUser; notice: string; newOrdersCount: number; onlineEnabled: boolean; permissions: UserPermission[]; onLogout: () => void; onProfilePhotoChange: (file: File | null) => void | Promise<void>; onOpenCleaningDashboard: () => void; onOpenCopaCafe: () => void; onOpenSecurity: () => void; onOpenMaintenance: () => void; onOpenAssetsMaterials: () => void; onOpenHubAdministration: () => void }) {'
    new_signature = 'function AdminSectorHomeScreen({ user, notice, newOrdersCount, onlineEnabled, permissions, onLogout, onProfilePhotoChange, onOpenCleaningDashboard, onOpenCopaCafe, onOpenSecurity, onOpenMaintenance, onOpenTasks, onOpenAssetsMaterials, onOpenHubAdministration }: { user: ManagedUser; notice: string; newOrdersCount: number; onlineEnabled: boolean; permissions: UserPermission[]; onLogout: () => void; onProfilePhotoChange: (file: File | null) => void | Promise<void>; onOpenCleaningDashboard: () => void; onOpenCopaCafe: () => void; onOpenSecurity: () => void; onOpenMaintenance: () => void; onOpenTasks: () => void; onOpenAssetsMaterials: () => void; onOpenHubAdministration: () => void }) {'
    text = replace_once(text, old_signature, new_signature, "assinatura do menu Admin")

    text = replace_once(
        text,
        '''  const managementCards: SectorModuleCard[] = [
    { key: "bens-materiais", title: "Bens e Materiais", detail: "Patrimônio, alocações, ferramentas e suprimentos.", enabled: permissions.includes("estoque") || permissions.includes("patrimonio"), onClick: onOpenAssetsMaterials, icon: "stock" },
    { key: "administracao-hub", title: "Administração do HUB", detail: "Usuários, permissões, relatórios e status do sistema.", enabled: permissions.includes("painel-admin") || permissions.includes("relatorios"), onClick: onOpenHubAdministration, className: "users-card", icon: "users" },
  ];''',
        '''  const managementCards: SectorModuleCard[] = [
    { key: "afazeres", title: "Afazeres", detail: "Tarefas, prazos, prioridades e acompanhamento diário.", enabled: permissions.includes("afazeres"), onClick: onOpenTasks, icon: "reports" },
    { key: "bens-materiais", title: "Bens e Materiais", detail: "Patrimônio, alocações, ferramentas e suprimentos.", enabled: permissions.includes("estoque") || permissions.includes("patrimonio"), onClick: onOpenAssetsMaterials, icon: "stock" },
    { key: "administracao-hub", title: "Administração do HUB", detail: "Usuários, permissões, relatórios e status do sistema.", enabled: permissions.includes("painel-admin") || permissions.includes("relatorios"), onClick: onOpenHubAdministration, className: "users-card", icon: "users" },
  ];''',
        "card Afazeres em Gestão",
    )

    text = replace_once(
        text,
        '    createSystemStatusCard({ key: "users", title: "Usuários & Permissões", icon: "users", available: hasAdmin, note: "Cadastro e sincronização de usuários disponíveis somente para Admin." }),',
        '    createSystemStatusCard({ key: "tasks", title: "Afazeres", icon: "reports", available: permissions.includes("afazeres"), restricted: true, note: "Quadro de tarefas e prazos disponível para o Admin Tezzei." }),\n    createSystemStatusCard({ key: "users", title: "Usuários & Permissões", icon: "users", available: hasAdmin, note: "Cadastro e sincronização de usuários disponíveis somente para Admin." }),',
        "status do módulo Afazeres",
    )

    APP_PATH.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
