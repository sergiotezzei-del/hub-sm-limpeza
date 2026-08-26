export const HUB_ACTIVE_SESSION_KEY = "hub-sm-active-session";

export function forceHubSessionReauthentication() {
  try {
    window.sessionStorage.removeItem(HUB_ACTIVE_SESSION_KEY);
  } catch {
    // A recarga ainda devolve o usuário ao login quando o sessionStorage não está disponível.
  }

  window.location.reload();
}
