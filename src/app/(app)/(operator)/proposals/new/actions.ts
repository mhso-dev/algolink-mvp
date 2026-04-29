"use server";

// SPEC-PROPOSAL-001 §M4 REQ-PROPOSAL-ENTITY-006 — 제안서 등록 Server Action.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { requireUser } from "@/lib/auth";
import { proposalCreateSchema } from "@/lib/proposals/validation";
import { createProposal } from "@/lib/proposals/queries";
import { PROPOSAL_ERRORS } from "@/lib/proposals/errors";

export type CreateProposalState =
  | { ok: false; errors: Record<string, string[]>; message?: string }
  | { ok: true };

export async function createProposalAction(
  _prev: CreateProposalState | undefined,
  formData: FormData,
): Promise<CreateProposalState> {
  const user = await requireUser();
  const supabase = createClient(await cookies());

  const requiredSkillIds = formData.getAll("requiredSkillIds").map(String);
  const raw = {
    title: String(formData.get("title") ?? "").trim(),
    clientId: String(formData.get("clientId") ?? ""),
    proposedPeriodStart: formData.get("proposedPeriodStart")
      ? String(formData.get("proposedPeriodStart"))
      : null,
    proposedPeriodEnd: formData.get("proposedPeriodEnd")
      ? String(formData.get("proposedPeriodEnd"))
      : null,
    proposedBusinessAmountKrw: formData.get("proposedBusinessAmountKrw")
      ? Number(formData.get("proposedBusinessAmountKrw"))
      : null,
    proposedHourlyRateKrw: formData.get("proposedHourlyRateKrw")
      ? Number(formData.get("proposedHourlyRateKrw"))
      : null,
    notes: formData.get("notes") ? String(formData.get("notes")) : null,
    requiredSkillIds,
  };

  const parsed = proposalCreateSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.map(String).join(".") || "_root";
      errors[key] = errors[key] ?? [];
      errors[key]!.push(issue.message);
    }
    return { ok: false, errors };
  }

  const result = await createProposal(supabase, {
    title: parsed.data.title,
    clientId: parsed.data.clientId,
    operatorId: user.id,
    proposedPeriodStart: parsed.data.proposedPeriodStart ?? null,
    proposedPeriodEnd: parsed.data.proposedPeriodEnd ?? null,
    proposedBusinessAmountKrw: parsed.data.proposedBusinessAmountKrw ?? null,
    proposedHourlyRateKrw: parsed.data.proposedHourlyRateKrw ?? null,
    notes: parsed.data.notes ?? null,
    requiredSkillIds: parsed.data.requiredSkillIds,
  });

  if (!result.ok) {
    return {
      ok: false,
      errors: { _root: [PROPOSAL_ERRORS.CREATE_FAILED_GENERIC] },
    };
  }

  revalidatePath("/proposals");
  redirect(`/proposals/${result.id}`);
}
