// SPEC-CLIENT-001 §3.3 — 도메인 타입 정의.
// @MX:NOTE: clients/client_contacts/files Drizzle 스키마에서 파생된 input/output 타입.

import type { Client, ClientContact } from "@/db/schema/client";
import type { FileRow } from "@/db/schema/files";

export type { Client, ClientContact };
export type FileMeta = FileRow;

export interface ContactInput {
  id?: string; // 수정 시 기존 row id (미존재 시 신규)
  name: string;
  position?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface CreateClientInput {
  companyName: string;
  address?: string | null;
  handoverMemo?: string | null;
  contacts: ContactInput[];
  businessLicenseFileId?: string | null;
}

export interface UpdateClientInput {
  companyName?: string;
  address?: string | null;
  handoverMemo?: string | null;
  contacts?: ContactInput[]; // 전체 재정의 (diff는 contacts.diffContacts로 계산)
  businessLicenseFileId?: string | null;
}

export interface ClientListRow {
  id: string;
  company_name: string;
  address: string | null;
  handover_memo: string | null;
  business_license_file_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientDetail {
  client: ClientListRow;
  contacts: Array<{
    id: string;
    client_id: string;
    name: string;
    position: string | null;
    email: string | null;
    phone: string | null;
    sort_order: string | null;
    created_at: string;
  }>;
  businessLicense: {
    id: string;
    storage_path: string;
    mime_type: string;
    size_bytes: number;
  } | null;
}
