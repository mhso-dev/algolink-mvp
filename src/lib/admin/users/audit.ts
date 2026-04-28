// SPEC-ADMIN-001 §2.1 F-301 audit — 구조화 콘솔 로그 (후속 SPEC-AUDIT-001에서 audit_log 테이블 영속화).
// @MX:NOTE: 함수 시그니처는 후속 SPEC에서 audit_log INSERT로 교체될 때도 그대로 유지되도록 설계.
// @MX:SPEC: SPEC-ADMIN-001 EARS B-5, B-7

import type { AdminUserRole } from "./validation";

export interface AuditRoleChange {
  kind: "role_change";
  actorId: string;
  targetId: string;
  beforeRole: AdminUserRole;
  afterRole: AdminUserRole;
  at: string; // ISO-8601
}

export interface AuditActiveChange {
  kind: "active_change";
  actorId: string;
  targetId: string;
  beforeActive: boolean;
  afterActive: boolean;
  at: string;
}

export type AuditEntry = AuditRoleChange | AuditActiveChange;

/** SPEC-AUDIT-001에서 영속화될 인터페이스. 현 단계는 console.log JSON 출력. */
export function logRoleChange(params: {
  actorId: string;
  targetId: string;
  beforeRole: AdminUserRole;
  afterRole: AdminUserRole;
  at?: string;
}): AuditRoleChange {
  const entry: AuditRoleChange = {
    kind: "role_change",
    actorId: params.actorId,
    targetId: params.targetId,
    beforeRole: params.beforeRole,
    afterRole: params.afterRole,
    at: params.at ?? new Date().toISOString(),
  };
  // 구조화 로그 — 후속 SPEC에서 audit_log INSERT로 대체.
  console.log("[audit]", JSON.stringify(entry));
  return entry;
}

export function logActiveChange(params: {
  actorId: string;
  targetId: string;
  beforeActive: boolean;
  afterActive: boolean;
  at?: string;
}): AuditActiveChange {
  const entry: AuditActiveChange = {
    kind: "active_change",
    actorId: params.actorId,
    targetId: params.targetId,
    beforeActive: params.beforeActive,
    afterActive: params.afterActive,
    at: params.at ?? new Date().toISOString(),
  };
  console.log("[audit]", JSON.stringify(entry));
  return entry;
}
