"use server";

// SPEC-CLIENT-001 §3.4 — 고객사 수정/삭제 Server Action.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient as createSupabaseClient } from "@/utils/supabase/server";
import { getCurrentUser } from "@/auth/server";
import { createClientSchema } from "@/lib/clients/validation";
import {
  getClient,
  updateClient,
  softDeleteClient,
} from "@/lib/clients/queries";
import {
  uploadBusinessLicense,
  deleteOrphanFile,
} from "@/lib/clients/file-upload";
import { CLIENT_ERRORS } from "@/lib/clients/errors";
import type { ExistingContact } from "@/lib/clients/contacts";

export interface UpdateClientFormState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
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

export async function updateClientAction(
  clientId: string,
  _prev: UpdateClientFormState | undefined,
  formData: FormData,
): Promise<UpdateClientFormState> {
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

  // 기존 contacts 로드 (diff 계산용)
  const detail = await getClient(supabase, clientId);
  if (!detail) {
    return { ok: false, message: CLIENT_ERRORS.CLIENT_NOT_FOUND };
  }
  const existingContacts: ExistingContact[] = detail.contacts.map((c) => ({
    id: c.id,
    name: c.name,
    position: c.position,
    email: c.email,
    phone: c.phone,
    sortOrder: c.sort_order,
  }));

  // 신규 파일 업로드 (선택)
  let nextFileId: string | null | undefined = data.businessLicenseFileId;
  let uploadedStoragePath: string | null = null;
  const uploadedFile = formData.get("businessLicenseFile");
  if (
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
        clientId,
        ownerId: user.id,
      });
      nextFileId = result.fileId;
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
  } else {
    // 파일 신규 업로드 없으면 기존 fileId 유지 (변경 안 함)
    nextFileId = detail.client.business_license_file_id;
  }

  try {
    await updateClient(
      supabase,
      clientId,
      {
        companyName: data.companyName,
        address: data.address ?? null,
        handoverMemo: data.handoverMemo ?? null,
        contacts: data.contacts,
        businessLicenseFileId: nextFileId ?? null,
      },
      existingContacts,
    );
  } catch {
    // 보상: 신규 업로드 파일 정리
    if (uploadedStoragePath && nextFileId && nextFileId !== detail.client.business_license_file_id) {
      await deleteOrphanFile(supabase, nextFileId, uploadedStoragePath);
    }
    return { ok: false, message: CLIENT_ERRORS.UPDATE_FAILED };
  }

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}`);
}

export async function deleteClientAction(clientId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "operator" && user.role !== "admin")) {
    throw new Error(CLIENT_ERRORS.PERMISSION_DENIED);
  }
  const supabase = createSupabaseClient(await cookies());
  await softDeleteClient(supabase, clientId);
  revalidatePath("/clients");
  redirect("/clients");
}
