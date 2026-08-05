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
        'const TaskBoardScreen = lazy(() => import("./modules/tasks/TaskBoardScreen").then((module) => ({ default: module.TaskBoardScreen })));',
        'const TaskBoardScreen = lazy(() => import("./modules/tasks/TaskBoardScreen").then((module) => ({ default: module.TaskBoardScreen })));\nconst ServiceRequestsScreen = lazy(() => import("./modules/service-requests/ServiceRequestsScreen").then((module) => ({ default: module.ServiceRequestsScreen })));',
        "import lazy dos chamados",
    )

    text = replace_once(
        text,
        '  | "tasks-board"\n  | "cleaning-dashboard"',
        '  | "tasks-board"\n  | "service-requests"\n  | "cleaning-dashboard"',
        "view de chamados",
    )

    text = replace_once(
        text,
        '  { id: "afazeres", label: "Afazeres" },\n  { id: "relatorios", label: "Relatórios" },',
        '  { id: "afazeres", label: "Afazeres" },\n  { id: "chamados", label: "Chamados" },\n  { id: "relatorios", label: "Relatórios" },',
        "permissão de chamados",
    )

    text = replace_once(
        text,
        '''  function openTaskBoard() {
    if (currentUser !== "tezzei" || !hasCurrentPermission("afazeres")) {''',
        '''  function openServiceRequests() {
    if (currentUser !== "tezzei" || !hasCurrentPermission("chamados")) {
      setNotice("Sem permissão para acessar Chamados.");
      return;
    }

    setNotice("");
    setSelectedGuardName(null);
    setView("service-requests");
  }

  function openTaskBoard() {
    if (currentUser !== "tezzei" || !hasCurrentPermission("afazeres")) {''',
        "função para abrir chamados",
    )

    text = replace_once(
        text,
        '          onOpenTasks={openTaskBoard}\n          onOpenAssetsMaterials={openAssetsMaterialsMenu}',
        '          onOpenTasks={openTaskBoard}\n          onOpenServiceRequests={openServiceRequests}\n          onOpenAssetsMaterials={openAssetsMaterialsMenu}',
        "prop de chamados no menu Admin",
    )

    text = replace_once(
        text,
        '''      {view === "copa-cafe-menu" && <CopaCafeMenuScreen permissions={getManagedUserPermissions(currentUser, managedUsers)} onBack={() => setView(getCurrentHomeView())} onLogout={goToLogin} />}''',
        '''      {view === "service-requests" && (
        currentUser === "tezzei" && currentManagedUser && hasCurrentPermission("chamados") ? (
          <Suspense fallback={<section className="screen"><TopBar title="Chamados" subtitle="Carregando solicitações internas." onLogout={goToLogin} /><section className="empty-state"><h2>Carregando Chamados...</h2></section></section>}>
            <ServiceRequestsScreen
              currentUser={currentManagedUser}
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
        "renderização da tela de chamados",
    )

    old_signature = 'function AdminSectorHomeScreen({ user, notice, newOrdersCount, onlineEnabled, permissions, onLogout, onProfilePhotoChange, onOpenCleaningDashboard, onOpenCopaCafe, onOpenSecurity, onOpenMaintenance, onOpenTasks, onOpenAssetsMaterials, onOpenHubAdministration }: { user: ManagedUser; notice: string; newOrdersCount: number; onlineEnabled: boolean; permissions: UserPermission[]; onLogout: () => void; onProfilePhotoChange: (file: File | null) => void | Promise<void>; onOpenCleaningDashboard: () => void; onOpenCopaCafe: () => void; onOpenSecurity: () => void; onOpenMaintenance: () => void; onOpenTasks: () => void; onOpenAssetsMaterials: () => void; onOpenHubAdministration: () => void }) {'
    new_signature = 'function AdminSectorHomeScreen({ user, notice, newOrdersCount, onlineEnabled, permissions, onLogout, onProfilePhotoChange, onOpenCleaningDashboard, onOpenCopaCafe, onOpenSecurity, onOpenMaintenance, onOpenTasks, onOpenServiceRequests, onOpenAssetsMaterials, onOpenHubAdministration }: { user: ManagedUser; notice: string; newOrdersCount: number; onlineEnabled: boolean; permissions: UserPermission[]; onLogout: () => void; onProfilePhotoChange: (file: File | null) => void | Promise<void>; onOpenCleaningDashboard: () => void; onOpenCopaCafe: () => void; onOpenSecurity: () => void; onOpenMaintenance: () => void; onOpenTasks: () => void; onOpenServiceRequests: () => void; onOpenAssetsMaterials: () => void; onOpenHubAdministration: () => void }) {'
    text = replace_once(text, old_signature, new_signature, "assinatura do menu Admin")

    text = replace_once(
        text,
        '''  const managementCards: SectorModuleCard[] = [
    { key: "afazeres", title: "Afazeres", detail: "Tarefas, prazos, prioridades e acompanhamento diário.", enabled: permissions.includes("afazeres"), onClick: onOpenTasks, icon: "reports" },
    { key: "bens-materiais", title: "Bens e Materiais", detail: "Patrimônio, alocações, ferramentas e suprimentos.", enabled: permissions.includes("estoque") || permissions.includes("patrimonio"), onClick: onOpenAssetsMaterials, icon: "stock" },''',
        '''  const managementCards: SectorModuleCard[] = [
    { key: "chamados", title: "Chamados", detail: "Solicitações internas, atendimento e histórico.", enabled: permissions.includes("chamados"), onClick: onOpenServiceRequests, icon: "reports" },
    { key: "afazeres", title: "Afazeres", detail: "Tarefas, prazos, prioridades e acompanhamento diário.", enabled: permissions.includes("afazeres"), onClick: onOpenTasks, icon: "reports" },
    { key: "bens-materiais", title: "Bens e Materiais", detail: "Patrimônio, alocações, ferramentas e suprimentos.", enabled: permissions.includes("estoque") || permissions.includes("patrimonio"), onClick: onOpenAssetsMaterials, icon: "stock" },''',
        "card Chamados em Gestão",
    )

    text = replace_once(
        text,
        '    createSystemStatusCard({ key: "tasks", title: "Afazeres", icon: "reports", available: permissions.includes("afazeres"), restricted: true, note: "Quadro de tarefas e prazos disponível para o Admin Tezzei." }),\n    createSystemStatusCard({ key: "users", title: "Usuários & Permissões", icon: "users", available: hasAdmin, note: "Cadastro e sincronização de usuários disponíveis somente para Admin." }),',
        '    createSystemStatusCard({ key: "tasks", title: "Afazeres", icon: "reports", available: permissions.includes("afazeres"), restricted: true, note: "Quadro de tarefas e prazos disponível para o Admin Tezzei." }),\n    createSystemStatusCard({ key: "service-requests", title: "Chamados", icon: "reports", available: permissions.includes("chamados"), restricted: true, note: "Portal público de abertura e painel de atendimento disponíveis para o Admin Tezzei." }),\n    createSystemStatusCard({ key: "users", title: "Usuários & Permissões", icon: "users", available: hasAdmin, note: "Cadastro e sincronização de usuários disponíveis somente para Admin." }),',
        "status do módulo Chamados",
    )

    APP_PATH.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
