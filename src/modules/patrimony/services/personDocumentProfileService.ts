import {
  authenticatedSupabaseFetch,
  SUPABASE_URL,
  supabaseConfigured,
} from "../../security/services/supabaseClient";

export type PersonDocumentProfile = {
  fullName: string;
  ihomeClientCode: string;
  cpf: string;
  rg: string;
  birthDate: string;
  maritalStatus: string;
  nationality: string;
  phone: string;
  email: string;
  residentialPhone: string;
  commercialPhone: string;
  addressLine: string;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
};

export const emptyPersonDocumentProfile = (): PersonDocumentProfile => ({
  fullName: "", ihomeClientCode: "", cpf: "", rg: "", birthDate: "", maritalStatus: "",
  nationality: "", phone: "", email: "", residentialPhone: "", commercialPhone: "",
  addressLine: "", neighborhood: "", city: "", state: "", postalCode: "",
});

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!supabaseConfigured) throw new Error("Supabase não configurado.");
  const response = await authenticatedSupabaseFetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers as Record<string, string> | undefined) },
  });
  if (!response.ok) {
    const raw = await response.text();
    try { const detail = JSON.parse(raw) as { message?: string }; throw new Error(detail.message || `Erro ${response.status}`); }
    catch (error) { if (error instanceof SyntaxError) throw new Error(`Erro ${response.status} ao acessar os dados documentais.`); throw error; }
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function loadPersonDocumentProfile(personId: string): Promise<PersonDocumentProfile> {
  const [people, details] = await Promise.all([
    request<Array<{ full_name: string | null; ihome_client_code: string | null; phone: string | null; email: string | null }>>(
      `organization_people?id=eq.${encodeURIComponent(personId)}&select=full_name,ihome_client_code,phone,email&limit=1`,
    ),
    request<Array<{
      cpf: string | null; rg: string | null; birth_date: string | null; marital_status: string | null;
      nationality: string | null; residential_phone: string | null; commercial_phone: string | null;
      address_line: string | null; neighborhood: string | null; city: string | null;
      state: string | null; postal_code: string | null;
    }>>(`organization_person_private_details?person_id=eq.${encodeURIComponent(personId)}&select=*&limit=1`),
  ]);
  if (!people[0]) throw new Error("Pessoa não encontrada ou sem permissão.");
  const person = people[0];
  const detail = details[0];
  return {
    fullName: person.full_name ?? "", ihomeClientCode: person.ihome_client_code ?? "",
    phone: person.phone ?? "", email: person.email ?? "",
    cpf: detail?.cpf ?? "", rg: detail?.rg ?? "", birthDate: detail?.birth_date ?? "",
    maritalStatus: detail?.marital_status ?? "", nationality: detail?.nationality ?? "",
    residentialPhone: detail?.residential_phone ?? "", commercialPhone: detail?.commercial_phone ?? "",
    addressLine: detail?.address_line ?? "", neighborhood: detail?.neighborhood ?? "",
    city: detail?.city ?? "", state: detail?.state ?? "", postalCode: detail?.postal_code ?? "",
  };
}

export async function savePersonDocumentProfile(input: {
  personId: string;
  profile: PersonDocumentProfile;
  actorName: string;
  reason: string;
}) {
  const { profile } = input;
  if (!profile.fullName.trim()) throw new Error("Informe o nome completo para documentos.");
  if (input.reason.trim().length < 3) throw new Error("Informe o motivo da alteração.");
  return request<string>("rpc/save_organization_person_document_profile", {
    method: "POST",
    body: JSON.stringify({
      p_person_id: input.personId,
      p_full_name: profile.fullName.trim(),
      p_ihome_client_code: profile.ihomeClientCode.trim() || null,
      p_profile: {
        cpf: profile.cpf.trim(), rg: profile.rg.trim(), birth_date: profile.birthDate || null,
        marital_status: profile.maritalStatus.trim(), nationality: profile.nationality.trim(),
        phone: profile.phone.trim(), email: profile.email.trim(),
        residential_phone: profile.residentialPhone.trim(), commercial_phone: profile.commercialPhone.trim(),
        address_line: profile.addressLine.trim(), neighborhood: profile.neighborhood.trim(),
        city: profile.city.trim(), state: profile.state.trim(), postal_code: profile.postalCode.trim(),
      },
      p_actor_name: input.actorName.trim(), p_reason: input.reason.trim(),
    }),
  });
}
