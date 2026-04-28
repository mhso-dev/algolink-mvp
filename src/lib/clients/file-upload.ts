// SPEC-CLIENT-001 §2.7 + §3.4 — 사업자등록증 파일 업로드 어댑터.
// @MX:NOTE: Supabase Storage 'business-licenses' 버킷에 업로드 + files 테이블 row 생성.
// @MX:WARN: Storage 업로드 후 files INSERT 실패 시 고아 객체 발생 가능. deleteOrphanFile로 보상.
// @MX:REASON: Supabase JS는 트랜잭션을 지원하지 않아 Storage + DB 일관성을 어플리케이션이 책임.

import { CLIENT_ERRORS } from "./errors";
import { validateFileMeta } from "./validation";

const BUCKET_NAME = "business-licenses";
const SIGNED_URL_EXPIRES_IN = 60; // seconds

// 좁은 인터페이스 — Supabase JS 클라이언트의 from/storage만 사용.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (table: string) => any; storage: any };

export interface UploadInput {
  /** 업로드할 파일 데이터 (Blob/File/ArrayBuffer 호환) */
  file: Blob | File | ArrayBuffer;
  /** mime type — File일 경우 file.type 사용 권장 */
  mimeType: string;
  /** 바이트 크기 */
  sizeBytes: number;
  /** 원본 파일명 (확장자 추출용) */
  fileName: string;
  /** 클라이언트 id (없으면 _tmp 경로) */
  clientId?: string;
  /** 업로더 user id */
  ownerId: string;
}

export interface UploadResult {
  fileId: string;
  storagePath: string;
}

function pickExt(fileName: string, mimeType: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot >= 0 && dot < fileName.length - 1) {
    return fileName.slice(dot + 1).toLowerCase();
  }
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  return "bin";
}

function genUuid(): string {
  // node 18+/Edge에 있는 globalThis.crypto.randomUUID 활용.
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // fallback: 충분히 충돌 위험 낮은 timestamp+random
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * 사업자등록증 업로드: mime/size 사전 검증 → Storage 업로드 → files row INSERT.
 * 실패 시 throw. 호출자는 try/catch로 한국어 메시지 매핑.
 */
export async function uploadBusinessLicense(
  supabase: Sb,
  input: UploadInput,
): Promise<UploadResult> {
  const validationError = validateFileMeta({
    type: input.mimeType,
    size: input.sizeBytes,
  });
  if (validationError) {
    throw new Error(
      validationError === CLIENT_ERRORS.FILE_MIME_INVALID
        ? "FILE_MIME_INVALID"
        : "FILE_TOO_LARGE",
    );
  }

  const ext = pickExt(input.fileName, input.mimeType);
  const dir = input.clientId ?? "_tmp";
  const storagePath = `${dir}/${genUuid()}.${ext}`;

  const { error: uploadErr } = (await supabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, input.file, {
      contentType: input.mimeType,
      upsert: false,
    })) as { error: unknown };

  if (uploadErr) {
    console.error("[uploadBusinessLicense] storage upload failed", uploadErr);
    throw new Error("FILE_UPLOAD_FAILED");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error: insertErr } = await (supabase as any)
    .from("files")
    .insert({
      storage_path: storagePath,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      owner_id: input.ownerId,
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    // 보상: Storage 객체 삭제 (best-effort)
    await supabase.storage
      .from(BUCKET_NAME)
      .remove([storagePath])
      .catch(() => {});
    throw new Error("FILE_UPLOAD_FAILED");
  }

  return {
    fileId: (inserted as { id: string }).id,
    storagePath,
  };
}

/** 다운로드용 signed URL 생성. */
export async function getBusinessLicenseSignedUrl(
  supabase: Sb,
  storagePath: string,
  expiresIn: number = SIGNED_URL_EXPIRES_IN,
): Promise<string | null> {
  const { data, error } = (await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(storagePath, expiresIn)) as {
    data: { signedUrl: string } | null;
    error: unknown;
  };
  if (error || !data) {
    console.error("[getBusinessLicenseSignedUrl] failed", error);
    return null;
  }
  return data.signedUrl;
}

/** 트랜잭션 보상용 — Storage + files row 정리 (best-effort, throw하지 않음). */
export async function deleteOrphanFile(
  supabase: Sb,
  fileId: string,
  storagePath: string,
): Promise<void> {
  await supabase.storage
    .from(BUCKET_NAME)
    .remove([storagePath])
    .catch(() => {});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("files")
    .delete()
    .eq("id", fileId)
    .then(() => {})
    .catch(() => {});
}
