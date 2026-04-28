// SPEC-ADMIN-001 §3.2 F-301 — 회원/권한 변경 입력 스키마.
// @MX:NOTE: 본 스키마는 admin 자가 lockout(본인 role 변경/본인 비활성화)을 차단하는 1차 방어선이다.
// @MX:SPEC: SPEC-ADMIN-001 EARS B-6, B-8

import { z } from "zod";

export const ADMIN_USER_ROLES = ["instructor", "operator", "admin"] as const;
export type AdminUserRole = (typeof ADMIN_USER_ROLES)[number];

// zod v4 의 z.string().uuid() 는 RFC 4122 version/variant 비트를 강제 검증한다.
// 시드/dev placeholder UUID (예: 00000000-0000-0000-0000-00000000bbb2) 는 PostgreSQL
// uuid 컬럼은 허용하지만 zod v4 strict UUID 는 거부한다. 형태만 검증한다.
const uuid = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "UUID 형식이 아닙니다.",
  );

/** 역할 변경 입력. 본인이 본인 role을 변경하는 경우는 거부. */
export const updateRoleInput = z
  .object({
    actorId: uuid,
    targetUserId: uuid,
    newRole: z.enum(ADMIN_USER_ROLES),
  })
  .superRefine((value, ctx) => {
    if (value.actorId === value.targetUserId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["newRole"],
        message: "본인 계정의 역할은 변경할 수 없습니다.",
      });
    }
  });

export type UpdateRoleInput = z.infer<typeof updateRoleInput>;

/** is_active 토글 입력. 본인을 비활성화 시도 시 거부. */
export const setActiveInput = z
  .object({
    actorId: uuid,
    targetUserId: uuid,
    nextActive: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.actorId === value.targetUserId && value.nextActive === false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nextActive"],
        message: "본인 계정을 비활성화할 수 없습니다.",
      });
    }
  });

export type SetActiveInput = z.infer<typeof setActiveInput>;
