// Compatibility import for the two standalone Uniformes cancellation dialogs.
// Re-export the existing session-aware client: never instantiate a second client.
export { authenticatedSupabaseFetch, getFreshSupabaseAccessToken, SUPABASE_URL } from "../../modules/security/services/supabaseClient";
