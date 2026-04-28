// SPEC-CLIENT-001 §3.3 — Zod 검증 스키마.
// @MX:NOTE: 등록·수정 폼 + 파일 mime/size + 담당자 N명 검증.

import { z } from "zod";
import { CLIENT_ERRORS } from "./errors";

// zod v4 의 z.string().uuid() 는 RFC 4122 version/variant 비트를 강제 검증한다.
// 시드/synthetic UUID 는 PostgreSQL uuid 컬럼은 허용하지만 zod v4 strict UUID 는 거부한다.
const uuidLike = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    { message: "UUID 형식이 아닙니다." },
  );

export const FILE_MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
export const FILE_MIME_WHITELIST = [
  "application/pdf",
  "image/png",
  "image/jpeg",
] as const;

export type AllowedMimeType = (typeof FILE_MIME_WHITELIST)[number];

const HANDOVER_MEMO_MAX = 500;

export const contactSchema = z.object({
  id: uuidLike.optional(),
  name: z
    .string()
    .trim()
    .min(1, CLIENT_ERRORS.CONTACT_NAME_REQUIRED),
  position: z.string().trim().nullish().transform((v) => (v ? v : null)),
  email: z
    .string()
    .trim()
    .email(CLIENT_ERRORS.CONTACT_EMAIL_INVALID)
    .or(z.literal(""))
    .nullish()
    .transform((v) => (v ? v : null)),
  phone: z.string().trim().nullish().transform((v) => (v ? v : null)),
});

export const createClientSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(1, CLIENT_ERRORS.COMPANY_NAME_REQUIRED),
  address: z.string().trim().nullish().transform((v) => (v ? v : null)),
  handoverMemo: z
    .string()
    .trim()
    .max(HANDOVER_MEMO_MAX, CLIENT_ERRORS.HANDOVER_MEMO_TOO_LONG)
    .nullish()
    .transform((v) => (v ? v : null)),
  contacts: z
    .array(contactSchema)
    .min(1, CLIENT_ERRORS.CONTACTS_MIN_ONE),
  businessLicenseFileId: uuidLike.nullish().transform((v) => v ?? null),
});

export const updateClientSchema = createClientSchema.partial({
  companyName: true,
  contacts: true,
});

export type CreateClientFormInput = z.input<typeof createClientSchema>;
export type CreateClientFormOutput = z.output<typeof createClientSchema>;

/**
 * 파일 객체(File-like)에 대한 mime/size 검증. Storage 호출 전 사전 차단.
 * @returns null = 통과, string = 한국어 에러 메시지
 */
export function validateFileMeta(meta: { type: string; size: number }): string | null {
  if (!FILE_MIME_WHITELIST.includes(meta.type as AllowedMimeType)) {
    return CLIENT_ERRORS.FILE_MIME_INVALID;
  }
  if (meta.size > FILE_MAX_SIZE_BYTES) {
    return CLIENT_ERRORS.FILE_TOO_LARGE;
  }
  return null;
}
