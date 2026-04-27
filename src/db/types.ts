// @MX:NOTE: SPEC-DB-001 §2.2 — pgcrypto bytea 컬럼용 Drizzle 커스텀 타입.
// app.encrypt_pii(text) → bytea, app.decrypt_pii(bytea, uuid) → text 함수와 함께 사용.
import { customType } from "drizzle-orm/pg-core";

export const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
});
