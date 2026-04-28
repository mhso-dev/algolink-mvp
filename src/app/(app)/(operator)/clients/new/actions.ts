"use server";

// SPEC-CLIENT-001 §3.4 — 고객사 등록 Server Action.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient as createSupabaseClient } from "@/utils/supabase/server";
import { getCurrentUser } from "@/auth/server";
import { createClientSchema } from "@/lib/clients/validation";
import { createClient as createClientRow } from "@/lib/clients/queries";
import {
  uploadBusinessLicense,
  deleteOrphanFile,
} from "@/lib/clients/file-upload";
import { CLIENT_ERRORS } from "@/lib/clients/errors";

export interface CreateClientFormState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  clientId?: string;
}

interface ContactFormPayload {
  id?: string;
  name: string;
  position?: string;
  email?: string;
  phone?: string;
}

function parseContactsJson(raw: FormDataEntryValue | null): ContactFormPayload[] {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ContactFormPayload[];
  } catch {
    return [];
  }
}

export async function createClientAction(
  _prev: CreateClientFormState | undefined,
  formData: FormData,
): Promise<CreateClientFormState> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "operator" && user.role !== "admin")) {
    return { ok: false, message: CLIENT_ERRORS.PERMISSION_DENIED };
  }

  const contacts = parseContactsJson(formData.get("contacts"));

  const parsed = createClientSchema.safeParse({
    companyName: formData.get("companyName"),
    address: formData.get("address") ?? null,
    handoverMemo: formData.get("handoverMemo") ?? null,
    contacts,
    businessLicenseFileId: formData.get("businessLicenseFileId") ?? null,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_form";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return {
      ok: false,
      message: "입력 값을 확인해 주세요.",
      fieldErrors,
    };
  }

  const data = parsed.data;
  const supabase = createSupabaseClient(await cookies());

  // 파일 업로드 (선택) — 등록 전에 _tmp 경로로 업로드하고 fileId만 받는다.
  let uploadedFileId = data.businessLicenseFileId ?? null;
  let uploadedStoragePath: string | null = null;
  const uploadedFile = formData.get("businessLicenseFile");
  if (
    !uploadedFileId &&
    uploadedFile &&
    typeof uploadedFile !== "string" &&
    uploadedFile.size > 0
  ) {
    try {
      const result = await uploadBusinessLicense(supabase, {
        file: uploadedFile,
        mimeType: uploadedFile.type,
        sizeBytes: uploadedFile.size,
        fileName: uploadedFile.name,
        ownerId: user.id,
      });
      uploadedFileId = result.fileId;
      uploadedStoragePath = result.storagePath;
    } catch (err) {
      const code = (err as Error).message;
      const message =
        code === "FILE_MIME_INVALID"
          ? CLIENT_ERRORS.FILE_MIME_INVALID
          : code === "FILE_TOO_LARGE"
            ? CLIENT_ERRORS.FILE_TOO_LARGE
            : CLIENT_ERRORS.FILE_UPLOAD_FAILED;
      return { ok: false, message };
    }
  }

  let clientId: string;
  try {
    const result = await createClientRow(
      supabase,
      {
        companyName: data.companyName,
        address: data.address ?? null,
        handoverMemo: data.handoverMemo ?? null,
        contacts: data.contacts,
        businessLicenseFileId: uploadedFileId,
      },
      user.id,
    );
    clientId = result.id;
  } catch {
    // 보상: 업로드한 파일 정리
    if (uploadedFileId && uploadedStoragePath) {
      await deleteOrphanFile(supabase, uploadedFileId, uploadedStoragePath);
    }
    return { ok: false, message: CLIENT_ERRORS.CREATE_FAILED };
  }

  revalidatePath("/clients");
  redirect(`/clients/${clientId}`);
}
