// SPEC-NOTIFY-001 §M2 — emit + list zod 스키마.
import { z } from "zod";
import { NOTIFICATION_TYPES } from "./types";

// zod v4 의 z.string().uuid() 는 RFC 4122 version/variant 비트를 강제 검증한다.
// 본 프로젝트의 시드(`20260427000070_seed.sql`)는 placeholder UUID
// (예: `00000000-0000-0000-0000-00000000cccc`) 를 사용하며 이는 PostgreSQL uuid 컬럼은
// 허용하지만 zod v4 strict UUID 정규식과 충돌한다. 형태(36자, 5블록 hex)만 검증한다.
const uuidLooseSchema = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "UUID 형식이 아닙니다.",
  );

export const emitPayloadSchema = z.object({
  recipientId: uuidLooseSchema,
  type: z.enum(NOTIFICATION_TYPES as unknown as [string, ...string[]]),
  title: z.string().min(1).max(200),
  body: z.string().max(2000).optional(),
  linkUrl: z.string().regex(/^\//, "linkUrl은 / 로 시작해야 합니다.").optional(),
  dedupKey: z.string().optional(),
  /** 콘솔 로그의 free-form 컨텍스트 (예: "instructor_id=<uuid> settlement_id=<uuid>"). */
  logContext: z.string().optional(),
});

export type EmitPayload = z.infer<typeof emitPayloadSchema>;
