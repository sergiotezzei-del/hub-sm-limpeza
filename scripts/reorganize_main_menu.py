from __future__ import annotations

import re
from pathlib import Path

APP_PATH = Path("src/App.tsx")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: esperado 1 trecho, encontrado {count}")
    return text.replace(old, new, 1)


def replace_regex_once(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"{label}: esperado 1 trecho, encontrado {count}")
    return updated


def main() -> None:
    text = APP_PATH.read_text(encoding="utf-8")

    text = replace_once(
        text,
        '  | "maintenance-menu"\n  | "general-stock-menu"\n  | "patrimony-menu"\n  | "reports-menu"',
        '  | "maintenance-menu"\n  | "assets-materials-menu"\n  | "hub-administration-menu"\n  | "general-stock-menu"\n  | "patrimony-menu"\n  | "reports-menu"',
        "views dos novos agrupadores",
    )

    text = replace_once(
        text,
        '  function openGeneralStockMenu() {\n    if (!hasCurrentPermission("estoque")) {\n      setNotice("Sem permissão para acessar Estoque Geral.");',
        '''  function openAssetsMaterialsMenu() {
    if (!hasAnyCurrentPermission(["estoque", "patrimonio"])) {
      setNotice("Sem permissão para acessar Bens e Materiais.");
      return;
    }

    setNotice("");
    setSelectedGuardName(null);
    setView("assets-materials-menu");
  }

  function openHubAdministrationMenu() {
    if (!hasAnyCurrentPermission(["painel-admin", "relatorios"])) {
      setNotice("Sem permissão para acessar Administração do HUB.");
      return;
    }

    setNotice("");
    setSelectedGuardName(null);
    setView("hub-administration-menu");
  }

  function openGeneralStockMenu() {
    if (!hasCurrentPermission("estoque")) {
      setNotice("Sem permissão para acessar Materiais e Suprimentos.");''',
        "funções dos agrupadores",
    )

    text = replace_once(
        text,
        '''          onOpenGeneralStock={openGeneralStockMenu}
          onOpenPatrimony={openPatrimonyMenu}
          onOpenReports={openReportsMenu}''',
        '''          onOpenAssetsMaterials={openAssetsMaterialsMenu}
          onOpenHubAdministration={openHubAdministrationMenu}''',
        "props do menu do usuário",
    )

    text = replace_once(
        text,
        '''          onOpenGeneralStock={openGeneralStockMenu}
          onOpenPatrimony={openPatrimonyMenu}
          onOpenReports={openReportsMenu}
          onOpenUsersPermissions={openUsersPermissions}
          onOpenSystemStatus={openSystemStatus}
          onOpenMasterMap={openMasterMap}''',
        '''          onOpenAssetsMaterials={openAssetsMaterialsMenu}
          onOpenHubAdministration={openHubAdministrationMenu}''',
        "props do menu do admin",
    )

    text = replace_once(
        text,
        '''      {view === "maintenance-menu" && <MaintenanceMenuScreen permissions={getManagedUserPermissions(currentUser, managedUsers)} onBack={() => setView(getCurrentHomeView())} onLogout={goToLogin} />}

      {view === "general-stock-menu" && <GeneralStockMenuScreen permissions={getManagedUserPermissions(currentUser, managedUsers)} onBack={() => setView(getCurrentHomeView())} onLogout={goToLogin} />}

      {view === "patrimony-menu" && (''',
        '''      {view === "maintenance-menu" && <MaintenanceMenuScreen permissions={getManagedUserPermissions(currentUser, managedUsers)} onBack={() => setView(getCurrentHomeView())} onLogout={goToLogin} />}

      {view === "assets-materials-menu" && (
        <AssetsMaterialsMenuScreen
          permissions={getManagedUserPermissions(currentUser, managedUsers)}
          onBack={() => setView(getCurrentHomeView())}
          onLogout={goToLogin}
          onOpenMaterials={openGeneralStockMenu}
          onOpenPatrimony={openPatrimonyMenu}
        />
      )}

      {view === "hub-administration-menu" && (
        <HubAdministrationMenuScreen
          permissions={getManagedUserPermissions(currentUser, managedUsers)}
          onBack={() => setView(getCurrentHomeView())}
          onLogout={goToLogin}
          onOpenReports={openReportsMenu}
          onOpenUsersPermissions={openUsersPermissions}
          onOpenSystemStatus={openSystemStatus}
        />
      )}

      {view === "general-stock-menu" && <GeneralStockMenuScreen permissions={getManagedUserPermissions(currentUser, managedUsers)} onBack={() => setView("assets-materials-menu")} onLogout={goToLogin} />}

      {view === "patrimony-menu" && (''',
        "renderização dos agrupadores",
    )

    text = replace_once(
        text,
        '              onBack={() => setView(getCurrentHomeView())}\n              onLogout={goToLogin}',
        '              onBack={() => setView("assets-materials-menu")}\n              onLogout={goToLogin}',
        "volta do patrimônio",
    )

    patrimony_denied_old = '          <AccessDeniedScreen onBack={() => setView(getCurrentHomeView())} onLogout={goToLogin} />\n        )\n      )}\n\n      {view === "reports-menu" && <ReportsMenuScreen permissions={getManagedUserPermissions(currentUser, managedUsers)} onBack={() => setView(getCurrentHomeView())} onLogout={goToLogin} />}'
    patrimony_denied_new = '          <AccessDeniedScreen onBack={() => setView("assets-materials-menu")} onLogout={goToLogin} />\n        )\n      )}\n\n      {view === "reports-menu" && <ReportsMenuScreen permissions={getManagedUserPermissions(currentUser, managedUsers)} onBack={() => setView("hub-administration-menu")} onLogout={goToLogin} />}'
    text = replace_once(text, patrimony_denied_old, patrimony_denied_new, "volta de patrimônio e relatórios")

    text = replace_once(
        text,
        '          onBack={() => setView(getCurrentHomeView())}\n          onLogout={goToLogin}\n          onSaveUser={saveManagedUser}',
        '          onBack={() => setView("hub-administration-menu")}\n          onLogout={goToLogin}\n          onSaveUser={saveManagedUser}',
        "volta de usuários",
    )

    users_denied_pattern = r'(\{view === "users-permissions".*?\) : \(\n\s*)<AccessDeniedScreen onBack=\{\(\) => setView\(getCurrentHomeView\(\)\)\} onLogout=\{goToLogin\} />(\n\s*\)\n\s*\)\})'
    text = replace_regex_once(
        text,
        users_denied_pattern,
        r'\1<AccessDeniedScreen onBack={() => setView("hub-administration-menu")} onLogout={goToLogin} />\2',
        "acesso negado de usuários",
    )

    text = replace_once(
        text,
        '            onBack={() => setView("admin")}\n            onLogout={goToLogin}',
        '            onBack={() => setView("hub-administration-menu")}\n            onLogout={goToLogin}',
        "volta do status",
    )

    status_denied_pattern = r'(\{view === "system-status".*?\) : \(\n\s*)<AccessDeniedScreen onBack=\{\(\) => setView\(getCurrentHomeView\(\)\)\} onLogout=\{goToLogin\} />(\n\s*\)\n\s*\)\})'
    text = replace_regex_once(
        text,
        status_denied_pattern,
        r'\1<AccessDeniedScreen onBack={() => setView("hub-administration-menu")} onLogout={goToLogin} />\2',
        "acesso negado do status",
    )

    user_screen = r'''function UserSectorHomeScreen({ user, permissions, notice, onLogout, onOpenCleaningDashboard, onOpenStockExit, onOpenCopaCafe, onOpenMaintenance, onOpenAssetsMaterials, onOpenHubAdministration, onOpenSecurity }: { user: ManagedUser; permissions: UserPermission[]; notice: string; onLogout: () => void; onOpenCleaningDashboard: () => void; onOpenStockExit: () => void; onOpenCopaCafe: () => void; onOpenMaintenance: () => void; onOpenAssetsMaterials: () => void; onOpenHubAdministration: () => void; onOpenSecurity: () => void }) {
  const canCleaning = permissions.includes("limpeza") || permissions.includes("saida-estoque");
  const operationCards: SectorModuleCard[] = [
    { key: "limpeza", title: "Limpeza", detail: "Rotinas, produtos, pedidos e histórico da equipe.", enabled: canCleaning, onClick: permissions.includes("limpeza") ? onOpenCleaningDashboard : onOpenStockExit, className: "cleaning-card", icon: "cleaning" },
    { key: "copa-cafe", title: "Copa & Café", detail: "Café, água, bebidas e insumos da copa.", enabled: permissions.includes("cafe") || permissions.includes("agua"), onClick: onOpenCopaCafe, icon: "coffee" },
    { key: "seguranca", title: "Segurança", detail: "Guardas, rondas, estacionamento e monitoramento.", enabled: permissions.includes("seguranca") || permissions.includes("guardas") || permissions.includes("estacionamento-consulta") || permissions.includes("estacionamento-cadastro"), onClick: onOpenSecurity, className: "security-card", icon: "security" },
    { key: "manutencao", title: "Manutenção", detail: "Chamados, obras, fornecedores e pendências prediais.", enabled: permissions.includes("manutencao"), onClick: onOpenMaintenance, icon: "settings" },
  ];
  const managementCards: SectorModuleCard[] = [
    { key: "bens-materiais", title: "Bens e Materiais", detail: "Patrimônio, alocações, ferramentas e suprimentos.", enabled: permissions.includes("estoque") || permissions.includes("patrimonio"), onClick: onOpenAssetsMaterials, icon: "stock" },
    { key: "administracao-hub", title: "Administração do HUB", detail: "Relatórios e ferramentas administrativas liberadas.", enabled: permissions.includes("relatorios") || permissions.includes("painel-admin"), onClick: onOpenHubAdministration, className: "users-card", icon: "users" },
  ];
  const visibleOperationCards = operationCards.filter((card) => card.enabled);
  const visibleManagementCards = managementCards.filter((card) => card.enabled);
  const hasAnyModule = visibleOperationCards.length + visibleManagementCards.length > 0;

  return (
    <section className="screen">
      <ProfileHero name={user.name} role={user.jobTitle} department={user.department} photoData={user.photoData} subtitle={user.userType} actions={<button className="logout-button" type="button" onClick={onLogout}>Sair</button>} />
      {notice && <p className="notice-message">{notice}</p>}
      {visibleOperationCards.length > 0 && (
        <section className="section-block hub-home-section">
          <h2>Operação</h2>
          <section className="admin-grid module-grid">
            {visibleOperationCards.map((card) => <ModuleCard key={card.key} title={card.title} detail={card.detail} enabled={card.enabled} onClick={card.onClick} className={card.className} attention={card.attention} icon={card.icon} />)}
          </section>
        </section>
      )}
      {visibleManagementCards.length > 0 && (
        <section className="section-block hub-home-section">
          <h2>Gestão</h2>
          <section className="admin-grid module-grid">
            {visibleManagementCards.map((card) => <ModuleCard key={card.key} title={card.title} detail={card.detail} enabled={card.enabled} onClick={card.onClick} className={card.className} attention={card.attention} icon={card.icon} />)}
          </section>
        </section>
      )}
      {!hasAnyModule && <section className="empty-state"><h2>Nenhum módulo liberado</h2><p>Solicite permissão ao admin.</p></section>}
    </section>
  );
}'''

    text = replace_regex_once(
        text,
        r'function UserSectorHomeScreen\(.*?\n}\n\nfunction AdminSectorHomeScreen',
        user_screen + "\n\nfunction AdminSectorHomeScreen",
        "menu principal do usuário",
    )

    admin_screen = r'''function AdminSectorHomeScreen({ newOrdersCount, onlineEnabled, permissions, onLogout, onOpenCleaningDashboard, onOpenCopaCafe, onOpenSecurity, onOpenMaintenance, onOpenAssetsMaterials, onOpenHubAdministration }: { newOrdersCount: number; onlineEnabled: boolean; permissions: UserPermission[]; onLogout: () => void; onOpenCleaningDashboard: () => void; onOpenCopaCafe: () => void; onOpenSecurity: () => void; onOpenMaintenance: () => void; onOpenAssetsMaterials: () => void; onOpenHubAdministration: () => void }) {
  const operationCards: SectorModuleCard[] = [
    { key: "limpeza", title: "Limpeza", detail: "Rotinas, produtos, pedidos e histórico da equipe.", enabled: permissions.includes("limpeza"), onClick: onOpenCleaningDashboard, className: "cleaning-card", attention: newOrdersCount > 0 ? `${newOrdersCount} pedido(s) pendente(s)` : undefined, icon: "cleaning" },
    { key: "copa-cafe", title: "Copa & Café", detail: "Café, água, bebidas e insumos da copa.", enabled: permissions.includes("cafe") || permissions.includes("agua"), onClick: onOpenCopaCafe, icon: "coffee" },
    { key: "seguranca", title: "Segurança", detail: "Guardas, rondas, estacionamento e monitoramento.", enabled: permissions.includes("seguranca") || permissions.includes("guardas") || permissions.includes("estacionamento-consulta") || permissions.includes("estacionamento-cadastro"), onClick: onOpenSecurity, className: "security-card", icon: "security" },
    { key: "manutencao", title: "Manutenção", detail: "Chamados, obras, fornecedores e pendências prediais.", enabled: permissions.includes("manutencao"), onClick: onOpenMaintenance, icon: "settings" },
  ];
  const managementCards: SectorModuleCard[] = [
    { key: "bens-materiais", title: "Bens e Materiais", detail: "Patrimônio, alocações, ferramentas e suprimentos.", enabled: permissions.includes("estoque") || permissions.includes("patrimonio"), onClick: onOpenAssetsMaterials, icon: "stock" },
    { key: "administracao-hub", title: "Administração do HUB", detail: "Usuários, permissões, relatórios e status do sistema.", enabled: permissions.includes("painel-admin") || permissions.includes("relatorios"), onClick: onOpenHubAdministration, className: "users-card", icon: "users" },
  ];
  const visibleOperationCards = operationCards.filter((card) => card.enabled);
  const visibleManagementCards = managementCards.filter((card) => card.enabled);

  return (
    <section className="screen">
      <TopBar title="Painel Tezzei" subtitle={onlineEnabled ? "Central Operacional HUB SM — online" : "Central Operacional HUB SM — local"} onLogout={onLogout} />
      {visibleOperationCards.length > 0 && (
        <section className="section-block hub-home-section">
          <h2>Operação</h2>
          <section className="admin-grid module-grid">
            {visibleOperationCards.map((card) => <ModuleCard key={card.key} title={card.title} detail={card.detail} enabled={card.enabled} onClick={card.onClick} className={card.className} attention={card.attention} icon={card.icon} />)}
          </section>
        </section>
      )}
      {visibleManagementCards.length > 0 && (
        <section className="section-block hub-home-section">
          <h2>Gestão</h2>
          <section className="admin-grid module-grid">
            {visibleManagementCards.map((card) => <ModuleCard key={card.key} title={card.title} detail={card.detail} enabled={card.enabled} onClick={card.onClick} className={card.className} attention={card.attention} icon={card.icon} />)}
          </section>
        </section>
      )}
    </section>
  );
}'''

    text = replace_regex_once(
        text,
        r'function AdminSectorHomeScreen\(.*?\n}\n\ntype SystemStatusLevel',
        admin_screen + "\n\ntype SystemStatusLevel",
        "menu principal do admin",
    )

    grouping_screens = r'''function AssetsMaterialsMenuScreen({ permissions, onBack, onLogout, onOpenMaterials, onOpenPatrimony }: { permissions: UserPermission[]; onBack: () => void; onLogout: () => void; onOpenMaterials: () => void; onOpenPatrimony: () => void }) {
  const cards: SectorModuleCard[] = [
    { key: "patrimonio-alocacoes", title: "Patrimônio e Alocações", detail: "Equipamentos, pessoas, entregas, mesas, lockers e chaves.", enabled: permissions.includes("patrimonio"), onClick: onOpenPatrimony, icon: "stock" },
    { key: "materiais-suprimentos", title: "Materiais e Suprimentos", detail: "Ferramentas, elétrica, material de obra e itens de consumo.", enabled: permissions.includes("estoque"), onClick: onOpenMaterials, icon: "settings" },
  ];
  return <OperationalSectorScreen title="Bens e Materiais" subtitle="Controle de bens duráveis, alocações e materiais de apoio" cards={cards} onBack={onBack} onLogout={onLogout} />;
}

function HubAdministrationMenuScreen({ permissions, onBack, onLogout, onOpenReports, onOpenUsersPermissions, onOpenSystemStatus }: { permissions: UserPermission[]; onBack: () => void; onLogout: () => void; onOpenReports: () => void; onOpenUsersPermissions: () => void; onOpenSystemStatus: () => void }) {
  const cards: SectorModuleCard[] = [
    { key: "usuarios-permissoes", title: "Usuários e Permissões", detail: "Cadastro de usuários, acessos e permissões do sistema.", enabled: permissions.includes("painel-admin"), onClick: onOpenUsersPermissions, className: "users-card", icon: "users" },
    { key: "relatorios", title: "Relatórios", detail: "Consultas e relatórios por área operacional.", enabled: permissions.includes("relatorios"), onClick: onOpenReports, icon: "reports" },
    { key: "status-sistema", title: "Status do Sistema", detail: "Situação dos módulos, integrações e pendências do HUB.", enabled: permissions.includes("painel-admin"), onClick: onOpenSystemStatus, className: "users-card", icon: "reports" },
  ];
  return <OperationalSectorScreen title="Administração do HUB" subtitle="Usuários, permissões, relatórios e situação do sistema" cards={cards} onBack={onBack} onLogout={onLogout} />;
}

'''

    text = replace_once(
        text,
        'function GeneralStockMenuScreen({ permissions, onBack, onLogout }',
        grouping_screens + 'function GeneralStockMenuScreen({ permissions, onBack, onLogout }',
        "telas dos agrupadores",
    )

    old_stock_screen = '''function GeneralStockMenuScreen({ permissions, onBack, onLogout }: { permissions: UserPermission[]; onBack: () => void; onLogout: () => void }) {
  const canStock = permissions.includes("estoque");
  const cards: SectorModuleCard[] = [
    { key: "misc", title: "Materiais diversos", detail: "Itens de apoio que não pertencem a limpeza nem copa.", enabled: canStock, icon: "stock" },
    { key: "tools", title: "Ferramentas", detail: "Ferramentas e acessórios de uso geral.", enabled: canStock, icon: "settings" },
    { key: "electric", title: "Elétrica", detail: "Lâmpadas, tomadas, cabos e materiais elétricos.", enabled: canStock, icon: "settings" },
    { key: "it", title: "Informática", detail: "Mouse, teclado, cabos, pendrive e itens de TI.", enabled: canStock, icon: "settings" },
    { key: "construction", title: "Material de obra", detail: "Materiais de obra e apoio a pequenos reparos.", enabled: canStock, icon: "stock" },
  ];
  return <OperationalSectorScreen title="Estoque Geral" subtitle="Materiais diversos, ferramentas, informática e itens de apoio" cards={cards} onBack={onBack} onLogout={onLogout} />;
}'''
    new_stock_screen = '''function GeneralStockMenuScreen({ permissions, onBack, onLogout }: { permissions: UserPermission[]; onBack: () => void; onLogout: () => void }) {
  const canStock = permissions.includes("estoque");
  const cards: SectorModuleCard[] = [
    { key: "misc", title: "Materiais diversos", detail: "Itens de apoio que não pertencem à limpeza nem à copa.", enabled: canStock, icon: "stock" },
    { key: "tools", title: "Ferramentas", detail: "Ferramentas e acessórios de uso geral.", enabled: canStock, icon: "settings" },
    { key: "electric", title: "Elétrica", detail: "Lâmpadas, tomadas, cabos e materiais elétricos.", enabled: canStock, icon: "settings" },
    { key: "it-consumables", title: "Informática de consumo", detail: "Cabos, adaptadores, conectores, pendrives e itens sem controle individual.", enabled: canStock, icon: "settings" },
    { key: "construction", title: "Material de obra", detail: "Materiais de obra e apoio a pequenos reparos.", enabled: canStock, icon: "stock" },
  ];
  return <OperationalSectorScreen title="Materiais e Suprimentos" subtitle="Ferramentas, elétrica, material de obra e itens de consumo" cards={cards} onBack={onBack} onLogout={onLogout} />;
}'''
    text = replace_once(text, old_stock_screen, new_stock_screen, "renomeação do estoque geral")

    APP_PATH.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
