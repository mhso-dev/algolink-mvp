// SPEC-CLIENT-001 §3.3 — clients/client_contacts/files Supabase 쿼리.
// @MX:NOTE: Server Actions 및 페이지에서 호출. Supabase JS client (server) 인스턴스를 주입받음.

import type { ClientListQuery } from "./list-query";
import { buildClientSearchPattern } from "./list-query";
import type {
  ClientDetail,
  ClientListRow,
  ContactInput,
  CreateClientInput,
  UpdateClientInput,
} from "./types";
import { diffContacts, type ExistingContact } from "./contacts";

// SupabaseClient 타입은 generic Database가 너무 광범위하므로 from만 사용하는 좁은 인터페이스로 약속.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (table: string) => any };

// @MX:ANCHOR: 고객사 리스트 핵심 진입점. fan_in 예상 ≥ 3 (clients 페이지, 프로젝트 등록 콤보, 추후 검색).
// @MX:REASON: SPEC-CLIENT-001 REQ-CLIENT001-LIST-* 핵심. signature 변경 시 광범위한 영향.
// @MX:SPEC: SPEC-CLIENT-001 §2.2
export async function listClients(
  supabase: Sb,
  query: ClientListQuery,
): Promise<{ rows: ClientListRow[]; total: number }> {
  const pattern = buildClientSearchPattern(query.q);

  let q = supabase
    .from("clients")
    .select(
      "id, company_name, address, handover_memo, business_license_file_id, created_at, updated_at",
      { count: "exact" },
    )
    .is("deleted_at", null);

  if (pattern) {
    q = q.ilike("company_name", pattern);
  }

  q = q.order("company_name", { ascending: true });

  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;
  q = q.range(from, to);

  const { data, count, error } = (await q) as {
    data: ClientListRow[] | null;
    count: number | null;
    error: unknown;
  };
  if (error) {
    console.error("[listClients] supabase error", error);
    return { rows: [], total: 0 };
  }
  return { rows: data ?? [], total: count ?? 0 };
}

/** 단일 고객사 상세 (soft-delete 제외). null이면 404. */
export async function getClient(
  supabase: Sb,
  id: string,
): Promise<ClientDetail | null> {
  const { data: client, error } = (await supabase
    .from("clients")
    .select(
      "id, company_name, address, handover_memo, business_license_file_id, created_at, updated_at, deleted_at",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle()) as {
    data:
      | (ClientListRow & { deleted_at: string | null })
      | null;
    error: unknown;
  };

  if (error || !client) return null;

  const [{ data: contacts }, businessLicense] = await Promise.all([
    supabase
      .from("client_contacts")
      .select("id, client_id, name, position, email, phone, sort_order, created_at")
      .eq("client_id", id)
      .order("sort_order", { ascending: true }) as Promise<{
      data:
        | Array<{
            id: string;
            client_id: string;
            name: string;
            position: string | null;
            email: string | null;
            phone: string | null;
            sort_order: string | null;
            created_at: string;
          }>
        | null;
    }>,
    client.business_license_file_id
      ? (supabase
          .from("files")
          .select("id, storage_path, mime_type, size_bytes")
          .eq("id", client.business_license_file_id)
          .maybeSingle() as Promise<{
          data: {
            id: string;
            storage_path: string;
            mime_type: string;
            size_bytes: number;
          } | null;
        }>)
      : Promise.resolve({ data: null }),
  ]);

  return {
    client: {
      id: client.id,
      company_name: client.company_name,
      address: client.address,
      handover_memo: client.handover_memo,
      business_license_file_id: client.business_license_file_id,
      created_at: client.created_at,
      updated_at: client.updated_at,
    },
    contacts: contacts ?? [],
    businessLicense: businessLicense.data,
  };
}

// @MX:ANCHOR: 고객사 + 담당자 단일 트랜잭션 등록.
// @MX:REASON: SPEC-CLIENT-001 REQ-CLIENT001-CREATE-SUBMIT의 원자성. Supabase는 multi-table 트랜잭션을
//             직접 지원하지 않으므로 contacts 실패 시 client row를 best-effort 롤백한다.
// @MX:WARN: Supabase JS는 트랜잭션 미지원. contacts INSERT 실패 시 client soft-delete 보상.
// @MX:SPEC: SPEC-CLIENT-001 §3.4
export async function createClient(
  supabase: Sb,
  input: CreateClientInput,
  createdBy: string,
): Promise<{ id: string }> {
  const insertPayload = {
    company_name: input.companyName,
    address: input.address ?? null,
    handover_memo: input.handoverMemo ?? null,
    business_license_file_id: input.businessLicenseFileId ?? null,
    created_by: createdBy,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error } = await (supabase as any)
    .from("clients")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error || !inserted) {
    throw new Error("CREATE_FAILED");
  }

  const clientId = (inserted as { id: string }).id;

  if (input.contacts.length > 0) {
    const contactRows = input.contacts.map((c, index) => ({
      client_id: clientId,
      name: c.name,
      position: c.position ?? null,
      email: c.email ?? null,
      phone: c.phone ?? null,
      sort_order: String(index),
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: contactsErr } = await (supabase as any)
      .from("client_contacts")
      .insert(contactRows);
    if (contactsErr) {
      // 보상: client row를 즉시 soft-delete (best-effort)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("clients")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", clientId);
      throw new Error("CREATE_FAILED");
    }
  }

  return { id: clientId };
}

/** 고객사 정보 + 담당자 diff 적용 업데이트. */
export async function updateClient(
  supabase: Sb,
  id: string,
  input: UpdateClientInput,
  existingContacts?: ExistingContact[],
): Promise<void> {
  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.companyName !== undefined) updatePayload.company_name = input.companyName;
  if (input.address !== undefined) updatePayload.address = input.address;
  if (input.handoverMemo !== undefined) updatePayload.handover_memo = input.handoverMemo;
  if (input.businessLicenseFileId !== undefined) {
    updatePayload.business_license_file_id = input.businessLicenseFileId;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("clients")
    .update(updatePayload)
    .eq("id", id);
  if (error) throw new Error("UPDATE_FAILED");

  if (input.contacts && existingContacts) {
    await syncContacts(supabase, id, existingContacts, input.contacts);
  }
}

/** 담당자 diff를 실제 DB에 반영. */
export async function syncContacts(
  supabase: Sb,
  clientId: string,
  existing: ExistingContact[],
  incoming: ContactInput[],
): Promise<void> {
  const diff = diffContacts(existing, incoming);

  if (diff.toRemove.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("client_contacts")
      .delete()
      .in("id", diff.toRemove);
    if (error) throw new Error("UPDATE_FAILED");
  }

  if (diff.toAdd.length > 0) {
    const rows = diff.toAdd.map((c) => ({
      client_id: clientId,
      name: c.name,
      position: c.position,
      email: c.email,
      phone: c.phone,
      sort_order: c.sortOrder,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("client_contacts").insert(rows);
    if (error) throw new Error("UPDATE_FAILED");
  }

  for (const u of diff.toUpdate) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("client_contacts")
      .update({
        name: u.name,
        position: u.position,
        email: u.email,
        phone: u.phone,
        sort_order: u.sortOrder,
      })
      .eq("id", u.id);
    if (error) throw new Error("UPDATE_FAILED");
  }
}

/** Soft delete (REQ-CLIENT001-DELETE-SOFT). */
export async function softDeleteClient(supabase: Sb, id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("clients")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error("DELETE_FAILED");
}
