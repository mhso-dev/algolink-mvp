// SPEC-PROPOSAL-001 §M4 — 신규 제안서 등록 페이지.
import { cookies } from "next/headers";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { ProposalForm } from "@/components/proposals/ProposalForm";
import { createProposalAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function NewProposalPage() {
  await requireUser();
  const supabase = createClient(await cookies());

  const [clientsRes, skillsRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, company_name")
      .is("deleted_at", null)
      .order("company_name"),
    supabase
      .from("skill_categories")
      .select("id, name")
      .order("name"),
  ]);

  const clients = (clientsRes.data ?? []) as Array<{
    id: string;
    company_name: string;
  }>;
  const skills = (skillsRes.data ?? []) as Array<{
    id: string;
    name: string;
  }>;

  return (
    <div className="container mx-auto py-8 max-w-3xl">
      <Link
        href="/proposals"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ChevronLeft className="h-4 w-4 mr-1" />
        제안서 목록
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>신규 제안서 등록</CardTitle>
        </CardHeader>
        <CardContent>
          <ProposalForm
            mode="create"
            clients={clients}
            skills={skills}
            action={createProposalAction}
          />
        </CardContent>
      </Card>
    </div>
  );
}
