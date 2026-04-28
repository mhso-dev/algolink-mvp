// SPEC-NOTIFY-001 §M2 — emit + list zod 스키마.
import { z } from "zod";
import { NOTIFICATION_TYPES } from "./types";

export const emitPayloadSchema = z.object({
  recipientId: z.string().uuid(),
  type: z.enum(NOTIFICATION_TYPES as unknown as [string, ...string[]]),
  title: z.string().min(1).max(200),
  body: z.string().max(2000).optional(),
  linkUrl: z.string().regex(/^\//, "linkUrl은 / 로 시작해야 합니다.").optional(),
  dedupKey: z.string().optional(),
  /** 콘솔 로그의 free-form 컨텍스트 (예: "instructor_id=<uuid> settlement_id=<uuid>"). */
  logContext: z.string().optional(),
});

export type EmitPayload = z.infer<typeof emitPayloadSchema>;
