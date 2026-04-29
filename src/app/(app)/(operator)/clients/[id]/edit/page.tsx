// SPEC-CLIENT-001 §2.4 — 고객사 수정 페이지.

import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient as createSupabaseClient } from "@/utils/supabase/server";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { getClient } from "@/lib/clients/queries";
import { ClientForm } from "../../_components/client-form";
import { Container } from "@/components/app/container";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditClientPage({ params }: PageProps) {
  await requireUser();
  const { id } = await params;
  const supabase = createSupabaseClient(await cookies());

  const detail = await getClient(supabase, id);
  if (!detail) {
    notFound();
  }

  return (
    <Container variant="narrow" className="flex flex-col gap-6 py-6">
      <header className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href={`/clients/${id}`} aria-label="고객사 상세로 돌아가기">
            <ChevronLeft />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">고객사 수정</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            {detail.client.company_name}
          </p>
        </div>
      </header>

      <ClientForm
        mode="edit"
        clientId={id}
        defaultValues={{
          companyName: detail.client.company_name,
          address: detail.client.address ?? "",
          handoverMemo: detail.client.handover_memo ?? "",
          contacts: detail.contacts.map((c) => ({
            id: c.id,
            name: c.name,
            position: c.position ?? "",
            email: c.email ?? "",
            phone: c.phone ?? "",
          })),
          businessLicenseFileName: detail.businessLicense
            ? filenameFromPath(detail.businessLicense.storage_path)
            : null,
        }}
      />
    </Container>
  );
}

function filenameFromPath(p: string): string {
  const slash = p.lastIndexOf("/");
  return slash >= 0 ? p.slice(slash + 1) : p;
}
