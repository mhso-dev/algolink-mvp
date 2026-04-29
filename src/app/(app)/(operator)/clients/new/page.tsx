// SPEC-CLIENT-001 §2.1 — 신규 고객사 등록 페이지.

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { ClientForm } from "../_components/client-form";
import { Container } from "@/components/app/container";

export const dynamic = "force-dynamic";

export default async function NewClientPage() {
  await requireUser();

  return (
    <Container variant="narrow" className="flex flex-col gap-6 py-6">
      <header className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="min-h-touch min-w-touch">
          <Link href="/clients" aria-label="고객사 목록으로 돌아가기">
            <ChevronLeft />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">신규 고객사 등록</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            회사 정보·사업자등록증·인수인계 메모·담당자 정보를 입력해 등록하세요.
          </p>
        </div>
      </header>

      <ClientForm mode="create" />
    </Container>
  );
}
