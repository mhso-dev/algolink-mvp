// SPEC-PROPOSAL-001 §M4 — 제안서 수정 페이지.
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import {
  getProposalById,
  getProposalRequiredSkills,
} from "@/lib/proposals/queries";
import { isFrozenProposalStatus } from "@/lib/proposals/types";
import { ProposalForm } from "@/components/proposals/ProposalForm";
import { updateProposalAction } from "./actions";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditProposalPage({ params }: Props) {
  await requireUser();
  const { id } = await params;
  const supabase = createClient(await cookies());

  const proposal = await getProposalById(supabase, id);
  if (!proposal) notFound();

  if (isFrozenProposalStatus(proposal.status)) {
    notFound();
  }

  const [skills, clientsRes, allSkillsRes] = await Promise.all([
    getProposalRequiredSkills(supabase, id),
    supabase
      .from("clients")
      .select("id, company_name")
      .is("deleted_at", null)
      .order("company_name"),
    supabase.from("skill_categories").select("id, name").order("name"),
  ]);

  const clients = (clientsRes.data ?? []) as Array<{
    id: string;
    company_name: string;
  }>;
  const allSkills = (allSkillsRes.data ?? []) as Array<{
    id: string;
    name: string;
  }>;

  return (
    <div className="container mx-auto py-8 max-w-3xl">
      <Link
        href={`/proposals/${proposal.id}`}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ChevronLeft className="h-4 w-4 mr-1" />
        제안서 상세
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>제안서 수정</CardTitle>
        </CardHeader>
        <CardContent>
          <ProposalForm
            mode="edit"
            clients={clients}
            skills={allSkills}
            action={updateProposalAction.bind(null, proposal.id)}
            initial={{
              id: proposal.id,
              title: proposal.title,
              clientId: proposal.client_id,
              proposedPeriodStart: proposal.proposed_period_start,
              proposedPeriodEnd: proposal.proposed_period_end,
              proposedBusinessAmountKrw: proposal.proposed_business_amount_krw,
              proposedHourlyRateKrw: proposal.proposed_hourly_rate_krw,
              notes: proposal.notes,
              requiredSkillIds: skills.map((s) => s.skill_id),
              expectedUpdatedAt: proposal.updated_at,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
