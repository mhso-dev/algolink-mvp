// SPEC-CLIENT-001 §2.3 — 고객사 상세 페이지.

import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil } from "lucide-react";
import { createClient as createSupabaseClient } from "@/utils/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getClient } from "@/lib/clients/queries";
import { getBusinessLicenseSignedUrl } from "@/lib/clients/file-upload";
import { DeleteClientButton } from "../_components/delete-client-button";
import { Container } from "@/components/app/container";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ClientDetailPage({ params }: PageProps) {
  await requireUser();
  const { id } = await params;
  const supabase = createSupabaseClient(await cookies());

  const detail = await getClient(supabase, id);
  if (!detail) {
    notFound();
  }

  const license = detail.businessLicense;
  let signedUrl: string | null = null;
  if (license) {
    signedUrl = await getBusinessLicenseSignedUrl(supabase, license.storage_path, 60);
  }

  return (
    <Container variant="narrow" className="flex flex-col gap-6 py-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/clients" aria-label="고객사 목록으로 돌아가기">
              <ChevronLeft />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {detail.client.company_name}
            </h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
              등록일: {formatKstDateTime(detail.client.created_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/clients/${id}/edit`}>
              <Pencil className="h-4 w-4" /> 수정
            </Link>
          </Button>
          <DeleteClientButton clientId={id} />
        </div>
      </header>

      <Card className="p-5 flex flex-col gap-4">
        <h2 className="text-lg font-semibold">회사 정보</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-[var(--color-text-muted)] text-xs mb-1">회사명</dt>
            <dd className="font-medium">{detail.client.company_name}</dd>
          </div>
          <div>
            <dt className="text-[var(--color-text-muted)] text-xs mb-1">주소</dt>
            <dd>{detail.client.address ?? "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[var(--color-text-muted)] text-xs mb-1">인수인계 메모</dt>
            <dd className="whitespace-pre-wrap">
              {detail.client.handover_memo ?? "—"}
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="p-5 flex flex-col gap-3">
        <h2 className="text-lg font-semibold">사업자등록증</h2>
        {license ? (
          <div className="flex items-center justify-between text-sm">
            <div>
              <p className="font-medium">{filenameFromPath(license.storage_path)}</p>
              <p className="text-xs text-[var(--color-text-muted)]">
                {formatBytes(license.size_bytes)} · {license.mime_type}
              </p>
            </div>
            {signedUrl ? (
              <Button asChild variant="outline" size="sm">
                <a href={signedUrl} target="_blank" rel="noopener noreferrer">
                  다운로드
                </a>
              </Button>
            ) : (
              <span className="text-xs text-[var(--color-state-alert)]">
                다운로드 링크를 생성하지 못했어요
              </span>
            )}
          </div>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)]">
            업로드된 사업자등록증이 없어요.
          </p>
        )}
      </Card>

      <Card className="p-5 flex flex-col gap-3">
        <h2 className="text-lg font-semibold">담당자 ({detail.contacts.length}명)</h2>
        {detail.contacts.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            등록된 담당자가 없어요.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {detail.contacts.map((c) => (
              <li
                key={c.id}
                className="flex flex-col sm:flex-row sm:items-center sm:gap-4 border rounded-md px-3 py-2 text-sm"
              >
                <span className="font-medium min-w-[8rem]">{c.name}</span>
                {c.position ? (
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {c.position}
                  </span>
                ) : null}
                <span className="text-xs text-[var(--color-text-muted)] sm:ml-auto">
                  {c.email ?? "—"}
                </span>
                <span className="text-xs text-[var(--color-text-muted)] font-tabular">
                  {c.phone ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Container>
  );
}

function formatKstDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function filenameFromPath(p: string): string {
  const slash = p.lastIndexOf("/");
  return slash >= 0 ? p.slice(slash + 1) : p;
}
