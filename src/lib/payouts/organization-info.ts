// @MX:NOTE: SPEC-RECEIPT-001 §M2 REQ-RECEIPT-PDF-003 — 알고링크 사업자 정보 우선순위.
// @MX:REASON: DB(organization_info id=1) > env > ORGANIZATION_INFO_MISSING 거부.

import { PAYOUT_ERRORS } from "./errors";
import type { OrganizationInfo } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupaLike = { from: (table: string) => any };

/** organization_info 테이블 → DB row 형식. */
interface DbRow {
  id: number;
  name: string | null;
  business_number: string | null;
  representative: string | null;
  address: string | null;
  contact: string | null;
}

/**
 * 알고링크 사업자 정보 로더.
 *
 * 우선순위:
 *   1. DB `organization_info` 테이블의 id=1 행 (모든 필드 non-empty)
 *   2. env 변수 `ORG_NAME`/`ORG_BIZ_NUMBER`/`ORG_REPRESENTATIVE`/`ORG_ADDRESS`/`ORG_CONTACT`
 *   3. throw `ORGANIZATION_INFO_MISSING`
 */
export async function getOrganizationInfo(
  supabase: SupaLike,
): Promise<OrganizationInfo> {
  // 1. DB 우선
  try {
    const { data, error } = await supabase
      .from("organization_info")
      .select(
        "id, name, business_number, representative, address, contact",
      )
      .eq("id", 1)
      .maybeSingle();

    if (!error && data) {
      const row = data as DbRow;
      const fromDb = mapRow(row);
      if (fromDb !== null) return fromDb;
    }
  } catch {
    // fallthrough to env
  }

  // 2. env fallback
  const fromEnv = readEnvOrgInfo();
  if (fromEnv !== null) return fromEnv;

  // 3. 둘 다 없음
  throw new Error(PAYOUT_ERRORS.ORGANIZATION_INFO_MISSING);
}

function mapRow(row: DbRow): OrganizationInfo | null {
  const name = (row.name ?? "").trim();
  const businessNumber = (row.business_number ?? "").trim();
  const representative = (row.representative ?? "").trim();
  const address = (row.address ?? "").trim();
  const contact = (row.contact ?? "").trim();
  if (!name || !businessNumber || !representative || !address || !contact) {
    return null;
  }
  return { name, businessNumber, representative, address, contact };
}

function readEnvOrgInfo(): OrganizationInfo | null {
  const name = (process.env.ORG_NAME ?? "").trim();
  const businessNumber = (process.env.ORG_BIZ_NUMBER ?? "").trim();
  const representative = (process.env.ORG_REPRESENTATIVE ?? "").trim();
  const address = (process.env.ORG_ADDRESS ?? "").trim();
  const contact = (process.env.ORG_CONTACT ?? "").trim();
  if (!name || !businessNumber || !representative || !address || !contact) {
    return null;
  }
  return { name, businessNumber, representative, address, contact };
}
