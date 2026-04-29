"use client";

// SPEC-CLIENT-001 §3.2 — 등록·수정 공용 폼 (단일 컴포넌트, 모드 prop으로 분기).
// react-hook-form 의존을 피하고 useState 기반의 단순 컨트롤드 폼으로 구현 (TRUST 5: Readable).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CLIENT_ERRORS } from "@/lib/clients/errors";
import {
  FILE_MAX_SIZE_BYTES,
  FILE_MIME_WHITELIST,
  validateFileMeta,
} from "@/lib/clients/validation";
import { createClientAction } from "../new/actions";
import { updateClientAction } from "../[id]/edit/actions";

interface ContactFormItem {
  id?: string;
  name: string;
  position: string;
  email: string;
  phone: string;
}

interface DefaultValues {
  companyName: string;
  address: string;
  handoverMemo: string;
  contacts: ContactFormItem[];
  businessLicenseFileName: string | null;
}

export interface ClientFormProps {
  mode: "create" | "edit";
  clientId?: string;
  defaultValues?: DefaultValues;
}

const EMPTY_CONTACT: ContactFormItem = {
  name: "",
  position: "",
  email: "",
  phone: "",
};

export function ClientForm({ mode, clientId, defaultValues }: ClientFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [companyName, setCompanyName] = useState(defaultValues?.companyName ?? "");
  const [address, setAddress] = useState(defaultValues?.address ?? "");
  const [handoverMemo, setHandoverMemo] = useState(
    defaultValues?.handoverMemo ?? "",
  );
  const [contacts, setContacts] = useState<ContactFormItem[]>(
    defaultValues?.contacts && defaultValues.contacts.length > 0
      ? defaultValues.contacts
      : [{ ...EMPTY_CONTACT }],
  );
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const existingFileName =
    defaultValues?.businessLicenseFileName ?? null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      setFile(null);
      return;
    }
    const err = validateFileMeta({ type: f.type, size: f.size });
    if (err) {
      setFileError(err);
      setFile(null);
      e.target.value = "";
      return;
    }
    setFile(f);
  };

  const updateContact = (index: number, patch: Partial<ContactFormItem>) => {
    setContacts((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    );
  };

  const addContact = () => {
    setContacts((prev) => [...prev, { ...EMPTY_CONTACT }]);
  };

  const removeContact = (index: number) => {
    setContacts((prev) => prev.filter((_, i) => i !== index));
  };

  const moveContact = (index: number, dir: -1 | 1) => {
    setContacts((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setServerMessage(null);
    setFieldErrors({});

    if (contacts.length === 0) {
      setServerMessage(CLIENT_ERRORS.CONTACTS_MIN_ONE);
      return;
    }

    const formData = new FormData();
    formData.set("companyName", companyName);
    formData.set("address", address);
    formData.set("handoverMemo", handoverMemo);
    formData.set(
      "contacts",
      JSON.stringify(
        contacts.map((c) => ({
          id: c.id,
          name: c.name,
          position: c.position || undefined,
          email: c.email || undefined,
          phone: c.phone || undefined,
        })),
      ),
    );
    if (file) {
      formData.set("businessLicenseFile", file);
    }

    startTransition(async () => {
      try {
        if (mode === "create") {
          const result = await createClientAction(undefined, formData);
          if (result && !result.ok) {
            setServerMessage(result.message ?? "등록에 실패했어요");
            setFieldErrors(result.fieldErrors ?? {});
          }
        } else if (mode === "edit" && clientId) {
          const result = await updateClientAction(clientId, undefined, formData);
          if (result && !result.ok) {
            setServerMessage(result.message ?? "수정에 실패했어요");
            setFieldErrors(result.fieldErrors ?? {});
          }
        }
      } catch (err) {
        // redirect는 throw로 동작 — 실제 에러만 캐치
        const msg = (err as Error).message ?? "";
        if (!msg.startsWith("NEXT_REDIRECT")) {
          throw err;
        }
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <Card className="p-5 flex flex-col gap-4">
        <h2 className="text-lg font-semibold">회사 정보</h2>
        <div className="flex flex-col gap-2">
          <Label htmlFor="companyName">
            회사명 <span className="text-[var(--color-state-alert)]">*</span>
          </Label>
          <Input
            id="companyName"
            name="companyName"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
            aria-describedby={fieldErrors.companyName ? "companyName-error" : undefined}
            aria-invalid={Boolean(fieldErrors.companyName)}
          />
          {fieldErrors.companyName ? (
            <p id="companyName-error" className="text-xs text-[var(--color-state-alert)]">
              {fieldErrors.companyName.join(", ")}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="address">주소</Label>
          <Input
            id="address"
            name="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="handoverMemo">인수인계 메모 (500자 이내)</Label>
          <Textarea
            id="handoverMemo"
            name="handoverMemo"
            value={handoverMemo}
            onChange={(e) => setHandoverMemo(e.target.value)}
            rows={4}
            maxLength={500}
            aria-describedby={fieldErrors.handoverMemo ? "handoverMemo-error" : undefined}
          />
          {fieldErrors.handoverMemo ? (
            <p id="handoverMemo-error" className="text-xs text-[var(--color-state-alert)]">
              {fieldErrors.handoverMemo.join(", ")}
            </p>
          ) : null}
          <p className="text-xs text-[var(--color-text-muted)]">
            {handoverMemo.length}/500
          </p>
        </div>
      </Card>

      <Card className="p-5 flex flex-col gap-3">
        <h2 className="text-lg font-semibold">사업자등록증</h2>
        {existingFileName ? (
          <p className="text-xs text-[var(--color-text-muted)]">
            현재 등록된 파일: {existingFileName} (새 파일을 선택하면 교체됩니다)
          </p>
        ) : null}
        <div className="flex flex-col gap-2">
          <Label htmlFor="businessLicenseFile">
            파일 (PDF/PNG/JPG, 최대 5MB)
          </Label>
          <Input
            id="businessLicenseFile"
            type="file"
            accept={FILE_MIME_WHITELIST.join(",")}
            onChange={handleFileChange}
            aria-describedby={fileError ? "file-error" : undefined}
            aria-invalid={Boolean(fileError)}
          />
          {fileError ? (
            <p id="file-error" className="text-xs text-[var(--color-state-alert)]">
              {fileError}
            </p>
          ) : null}
          {file ? (
            <p className="text-xs text-[var(--color-text-muted)]">
              선택됨: {file.name} ({(file.size / 1024 / 1024).toFixed(2)}MB)
            </p>
          ) : null}
        </div>
      </Card>

      <Card className="p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">담당자 ({contacts.length}명)</h2>
          <Button type="button" variant="outline" size="sm" onClick={addContact}>
            <Plus className="h-4 w-4" /> 담당자 추가
          </Button>
        </div>
        {contacts.map((c, idx) => (
          <div
            key={`contact-${idx}`}
            className="border rounded-md p-3 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs text-[var(--color-text-muted)]">
                담당자 #{idx + 1}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => moveContact(idx, -1)}
                  disabled={idx === 0}
                  aria-label="위로 이동"
                  className="min-h-touch min-w-touch"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => moveContact(idx, 1)}
                  disabled={idx === contacts.length - 1}
                  aria-label="아래로 이동"
                  className="min-h-touch min-w-touch"
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeContact(idx)}
                  disabled={contacts.length <= 1}
                  aria-label="담당자 삭제"
                  className="min-h-touch min-w-touch"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor={`contact-name-${idx}`}>
                  이름 <span className="text-[var(--color-state-alert)]">*</span>
                </Label>
                <Input
                  id={`contact-name-${idx}`}
                  value={c.name}
                  onChange={(e) => updateContact(idx, { name: e.target.value })}
                  required
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`contact-position-${idx}`}>직책</Label>
                <Input
                  id={`contact-position-${idx}`}
                  value={c.position}
                  onChange={(e) => updateContact(idx, { position: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`contact-email-${idx}`}>이메일</Label>
                <Input
                  id={`contact-email-${idx}`}
                  type="email"
                  value={c.email}
                  onChange={(e) => updateContact(idx, { email: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`contact-phone-${idx}`}>전화번호</Label>
                <Input
                  id={`contact-phone-${idx}`}
                  value={c.phone}
                  onChange={(e) => updateContact(idx, { phone: e.target.value })}
                />
              </div>
            </div>
          </div>
        ))}
        {fieldErrors.contacts ? (
          <p className="text-xs text-[var(--color-state-alert)]">
            {fieldErrors.contacts.join(", ")}
          </p>
        ) : null}
      </Card>

      {serverMessage ? (
        <div
          role="alert"
          className="text-sm text-[var(--color-state-alert)] bg-red-50 border border-red-200 rounded-md p-3"
        >
          {serverMessage}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isPending}
        >
          취소
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending
            ? mode === "create"
              ? "등록 중..."
              : "저장 중..."
            : mode === "create"
              ? "등록"
              : "저장"}
        </Button>
      </div>
      <p className="sr-only">
        파일 최대 크기는 {FILE_MAX_SIZE_BYTES / 1024 / 1024}MB입니다.
      </p>
    </form>
  );
}
