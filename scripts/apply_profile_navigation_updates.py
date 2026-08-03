from __future__ import annotations

from pathlib import Path

APP = Path("src/App.tsx")
STYLES = Path("src/styles.css")
MODULE_DASHBOARD = Path("public/module-dashboard.css")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: esperado 1 trecho, encontrado {count}")
    return text.replace(old, new, 1)


def main() -> None:
    app = APP.read_text(encoding="utf-8")
    styles = STYLES.read_text(encoding="utf-8")
    module_css = MODULE_DASHBOARD.read_text(encoding="utf-8")

    app = replace_once(
        app,
        '''  function goToLogin() {
    void signOutSupabaseAuth();''',
        '''  function goToMainMenu() {
    setNotice("");
    setPreviewEmployeeId(null);
    setEditingOrderId(null);
    setEditDraft([]);
    setDeleteTarget(null);
    setCleaningPrepOpen(false);
    setView(getCurrentHomeView());
  }

  function goToLogin() {
    void signOutSupabaseAuth();''',
        "atalho para menu principal",
    )

    app = replace_once(
        app,
        '''  async function handlePhotoChange(employeeId: EmployeeId, file: File | null) {
    if (!file) return;''',
        '''  async function handleCurrentUserPhoto(file: File | null) {
    if (!file || !currentManagedUser) return;
    try {
      setNotice("Salvando foto de perfil...");
      const photoData = await imageFileToDataUrl(file);
      const saved = await saveManagedUser({ ...currentManagedUser, photoData, updatedAt: new Date().toISOString() });
      if (saved) setNotice("Foto de perfil salva.");
    } catch {
      setNotice("Não foi possível salvar a foto de perfil.");
    }
  }

  async function handlePhotoChange(employeeId: EmployeeId, file: File | null) {
    if (!file) return;''',
        "salvar foto do usuário atual",
    )

    app = replace_once(
        app,
        '''      {view === "guard" && currentUser && isGuardId(currentUser) && (
        <GuardUserScreen guardLocalId={currentUser} guardName={guardUserMap[currentUser]} permissions={getManagedUserPermissions(currentUser, managedUsers)} onOpenParking={openSecurityParking} onLogout={goToLogin} />
      )}''',
        '''      {view === "guard" && currentUser && isGuardId(currentUser) && (
        <>
          <GuardUserScreen guardLocalId={currentUser} guardName={guardUserMap[currentUser]} permissions={getManagedUserPermissions(currentUser, managedUsers)} onOpenParking={openSecurityParking} onLogout={goToLogin} />
          {currentManagedUser && (
            <aside className="guard-profile-shortcut" aria-label="Foto de perfil">
              <ProfileAvatar name={currentManagedUser.name} photoData={currentManagedUser.photoData} />
              <ProfilePhotoAction onFileChange={handleCurrentUserPhoto} compact />
            </aside>
          )}
        </>
      )}''',
        "foto no menu do guarda",
    )

    app = replace_once(
        app,
        '''          onOpenHubAdministration={openHubAdministrationMenu}
          onOpenSecurity={openSecurityMenu}''',
        '''          onOpenHubAdministration={openHubAdministrationMenu}
          onOpenSecurity={openSecurityMenu}
          onProfilePhotoChange={handleCurrentUserPhoto}''',
        "foto no menu de usuário",
    )

    app = replace_once(
        app,
        '''        <AdminSectorHomeScreen
          newOrdersCount={newOrders.length}
          onlineEnabled={onlineEnabled}
          permissions={getManagedUserPermissions(currentUser, managedUsers)}
          onLogout={goToLogin}''',
        '''        <AdminSectorHomeScreen
          user={currentManagedUser ?? defaultManagedUsers[0]}
          notice={notice}
          newOrdersCount={newOrders.length}
          onlineEnabled={onlineEnabled}
          permissions={getManagedUserPermissions(currentUser, managedUsers)}
          onLogout={goToLogin}
          onProfilePhotoChange={handleCurrentUserPhoto}''',
        "perfil no menu do admin",
    )

    app = replace_once(
        app,
        '''      {deleteTarget && <DeleteDialog order={deleteTarget} onCancel={() => setDeleteTarget(null)} onConfirm={confirmDeleteOrder} />}
      {cleaningPrepOpen && <CleaningPrepDialog running={cleaningPrepRunning} onCancel={() => setCleaningPrepOpen(false)} onConfirm={confirmCleaningPreparation} />}

      <footer>{FOOTER}</footer>''',
        '''      {currentUser && view !== "login" && view !== getCurrentHomeView() && (
        <button className="global-main-menu-button" type="button" onClick={goToMainMenu} aria-label="Voltar ao menu principal" title="Voltar ao menu principal">
          <span className="global-main-menu-icon" aria-hidden="true">☰</span>
          <span>Menu principal</span>
        </button>
      )}

      {deleteTarget && <DeleteDialog order={deleteTarget} onCancel={() => setDeleteTarget(null)} onConfirm={confirmDeleteOrder} />}
      {cleaningPrepOpen && <CleaningPrepDialog running={cleaningPrepRunning} onCancel={() => setCleaningPrepOpen(false)} onConfirm={confirmCleaningPreparation} />}

      <footer>{FOOTER}</footer>''',
        "botão global do menu principal",
    )

    app = replace_once(
        app,
        '''          <label className="photo-button">Cadastrar / alterar foto<input type="file" accept="image/*" capture="environment" onChange={handleFileChange} /></label>''',
        '''          <ProfilePhotoAction onFileChange={(file) => onProfilePhotoChange(employeeId, file)} />''',
        "foto padronizada da equipe de limpeza",
    )

    app = replace_once(
        app,
        '''function ProfileHero({ name, role, department, subtitle, photoData, actions }: { name: string; role: string; department: string; subtitle?: string; photoData?: string; actions?: ReactNode }) {''',
        '''function ProfilePhotoAction({ onFileChange, compact = false }: { onFileChange: (file: File | null) => void | Promise<void>; compact?: boolean }) {
  return (
    <label className={compact ? "photo-button profile-photo-action compact" : "photo-button profile-photo-action"}>
      <AppIcon name="camera" size="sm" className="action-icon" />
      <span>{compact ? "Foto" : "Cadastrar / alterar foto"}</span>
      <input type="file" accept="image/*" capture="environment" onChange={(event) => { void onFileChange(event.target.files?.[0] ?? null); event.target.value = ""; }} />
    </label>
  );
}

function ProfileHero({ name, role, department, subtitle, photoData, actions }: { name: string; role: string; department: string; subtitle?: string; photoData?: string; actions?: ReactNode }) {''',
        "componente padrão de foto",
    )

    app = replace_once(
        app,
        '''function UserSectorHomeScreen({ user, permissions, notice, onLogout, onOpenCleaningDashboard, onOpenStockExit, onOpenCopaCafe, onOpenMaintenance, onOpenAssetsMaterials, onOpenHubAdministration, onOpenSecurity }: { user: ManagedUser; permissions: UserPermission[]; notice: string; onLogout: () => void; onOpenCleaningDashboard: () => void; onOpenStockExit: () => void; onOpenCopaCafe: () => void; onOpenMaintenance: () => void; onOpenAssetsMaterials: () => void; onOpenHubAdministration: () => void; onOpenSecurity: () => void }) {''',
        '''function UserSectorHomeScreen({ user, permissions, notice, onLogout, onOpenCleaningDashboard, onOpenStockExit, onOpenCopaCafe, onOpenMaintenance, onOpenAssetsMaterials, onOpenHubAdministration, onOpenSecurity, onProfilePhotoChange }: { user: ManagedUser; permissions: UserPermission[]; notice: string; onLogout: () => void; onOpenCleaningDashboard: () => void; onOpenStockExit: () => void; onOpenCopaCafe: () => void; onOpenMaintenance: () => void; onOpenAssetsMaterials: () => void; onOpenHubAdministration: () => void; onOpenSecurity: () => void; onProfilePhotoChange: (file: File | null) => void | Promise<void> }) {''',
        "assinatura do menu do usuário",
    )

    app = replace_once(
        app,
        '''    { key: "limpeza", title: "Limpeza", detail: "Rotinas, produtos, pedidos e histórico da equipe.", enabled: canCleaning, onClick: permissions.includes("limpeza") ? onOpenCleaningDashboard : onOpenStockExit, className: "cleaning-card", icon: "cleaning" },''',
        '''    { key: "limpeza", title: "Limpeza", detail: "Rotinas, produtos, pedidos e histórico da equipe.", enabled: canCleaning, onClick: permissions.includes("limpeza") ? onOpenCleaningDashboard : onOpenStockExit, icon: "cleaning" },''',
        "card de limpeza do usuário",
    )

    app = replace_once(
        app,
        '''      <ProfileHero name={user.name} role={user.jobTitle} department={user.department} photoData={user.photoData} subtitle={user.userType} actions={<button className="logout-button" type="button" onClick={onLogout}>Sair</button>} />''',
        '''      <ProfileHero
        name={user.name}
        role={user.jobTitle}
        department={user.department}
        photoData={user.photoData}
        subtitle={user.userType}
        actions={<><ProfilePhotoAction onFileChange={onProfilePhotoChange} /><button className="logout-button" type="button" onClick={onLogout}>Sair</button></>}
      />''',
        "foto no cabeçalho do usuário",
    )

    app = replace_once(
        app,
        '''function AdminSectorHomeScreen({ newOrdersCount, onlineEnabled, permissions, onLogout, onOpenCleaningDashboard, onOpenCopaCafe, onOpenSecurity, onOpenMaintenance, onOpenAssetsMaterials, onOpenHubAdministration }: { newOrdersCount: number; onlineEnabled: boolean; permissions: UserPermission[]; onLogout: () => void; onOpenCleaningDashboard: () => void; onOpenCopaCafe: () => void; onOpenSecurity: () => void; onOpenMaintenance: () => void; onOpenAssetsMaterials: () => void; onOpenHubAdministration: () => void }) {''',
        '''function AdminSectorHomeScreen({ user, notice, newOrdersCount, onlineEnabled, permissions, onLogout, onProfilePhotoChange, onOpenCleaningDashboard, onOpenCopaCafe, onOpenSecurity, onOpenMaintenance, onOpenAssetsMaterials, onOpenHubAdministration }: { user: ManagedUser; notice: string; newOrdersCount: number; onlineEnabled: boolean; permissions: UserPermission[]; onLogout: () => void; onProfilePhotoChange: (file: File | null) => void | Promise<void>; onOpenCleaningDashboard: () => void; onOpenCopaCafe: () => void; onOpenSecurity: () => void; onOpenMaintenance: () => void; onOpenAssetsMaterials: () => void; onOpenHubAdministration: () => void }) {''',
        "assinatura do menu do admin",
    )

    app = replace_once(
        app,
        '''    { key: "limpeza", title: "Limpeza", detail: "Rotinas, produtos, pedidos e histórico da equipe.", enabled: permissions.includes("limpeza"), onClick: onOpenCleaningDashboard, className: "cleaning-card", attention: newOrdersCount > 0 ? `${newOrdersCount} pedido(s) pendente(s)` : undefined, icon: "cleaning" },''',
        '''    { key: "limpeza", title: "Limpeza", detail: "Rotinas, produtos, pedidos e histórico da equipe.", enabled: permissions.includes("limpeza"), onClick: onOpenCleaningDashboard, icon: "cleaning" },''',
        "card de limpeza do admin",
    )

    app = replace_once(
        app,
        '''      <TopBar title="Painel Tezzei" subtitle={onlineEnabled ? "Central Operacional HUB SM — online" : "Central Operacional HUB SM — local"} onLogout={onLogout} />''',
        '''      <ProfileHero
        name={user.name}
        role={user.jobTitle}
        department={user.department}
        photoData={user.photoData}
        subtitle={onlineEnabled ? "Central Operacional HUB SM — online" : "Central Operacional HUB SM — local"}
        actions={<><ProfilePhotoAction onFileChange={onProfilePhotoChange} /><button className="logout-button" type="button" onClick={onLogout}>Sair</button></>}
      />
      {notice && <p className="notice-message">{notice}</p>}''',
        "cabeçalho com foto do admin",
    )

    module_css = replace_once(
        module_css,
        '''.cleaning-card,
.cleaning-control-card:first-child {
  grid-column: 1 / -1 !important;
  min-height: 118px !important;
  border-left-color: #f97316 !important;
}''',
        '''.cleaning-control-card:first-child {
  grid-column: 1 / -1 !important;
  min-height: 118px !important;
  border-left-color: #f97316 !important;
}

.cleaning-card {
  grid-column: auto !important;
  min-height: 104px !important;
}''',
        "tamanho do card de limpeza",
    )

    extra_styles = r'''

/* Navegação global e foto de perfil padronizada */
.profile-photo-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  padding: 10px 12px;
}

.profile-photo-action.compact {
  min-height: 38px;
  padding: 8px 10px;
  font-size: 0.82rem;
}

.global-main-menu-button {
  position: fixed;
  right: 16px;
  bottom: calc(72px + env(safe-area-inset-bottom));
  z-index: 80;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 42px;
  padding: 10px 13px;
  border: 1px solid #fed7aa;
  border-radius: 999px;
  color: var(--orange-dark);
  background: #ffffff;
  box-shadow: 0 10px 28px rgba(31, 41, 51, 0.18);
  font-weight: 900;
}

.global-main-menu-button:hover {
  background: var(--orange-soft);
  border-color: var(--orange);
}

.global-main-menu-icon {
  font-size: 1rem;
  line-height: 1;
}

.guard-profile-shortcut {
  position: fixed;
  top: calc(12px + env(safe-area-inset-top));
  left: 12px;
  z-index: 70;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: var(--shadow-card);
}

.guard-profile-shortcut .profile-avatar {
  width: 38px;
  height: 38px;
}

@media (max-width: 720px) {
  .global-main-menu-button {
    right: 12px;
    bottom: calc(68px + env(safe-area-inset-bottom));
  }

  .profile-actions {
    align-items: stretch;
  }

  .profile-photo-action,
  .profile-actions .logout-button {
    width: 100%;
  }
}
'''

    if "/* Navegação global e foto de perfil padronizada */" in styles:
        raise RuntimeError("estilos de navegação já existem")
    styles += extra_styles

    APP.write_text(app, encoding="utf-8")
    STYLES.write_text(styles, encoding="utf-8")
    MODULE_DASHBOARD.write_text(module_css, encoding="utf-8")


if __name__ == "__main__":
    main()
