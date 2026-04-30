"use server";

// SPEC-PROPOSAL-001 §M4 — 제안서 수정 + status 전환 Server Actions.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { requireUser } from "@/lib/auth";
import { proposalCreateSchema } from "@/lib/proposals/validation";
import {
  softDeleteProposal,
  transitionProposalStatus,
  updateProposal,
} from "@/lib/proposals/queries";
import { PROPOSAL_ERRORS } from "@/lib/proposals/errors";
import {
  rejectIfFrozen,
  timestampUpdatesForTransition,
  validateProposalTransition,
} from "@/lib/proposals/status-machine";
import type { ProposalStatus } from "@/lib/proposals/types";
import type { CreateProposalState } from "../../new/actions";

export async function updateProposalAction(
  proposalId: string,
  _prev: CreateProposalState | undefined,
  formData: FormData,
): Promise<CreateProposalState> {
  await requireUser();
  const supabase = createClient(await cookies());
  const expectedUpdatedAt = String(formData.get("expectedUpdatedAt") ?? "");

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

  const result = await updateProposal(supabase, {
    id: proposalId,
    expectedUpdatedAt,
    title: parsed.data.title,
    proposedPeriodStart: parsed.data.proposedPeriodStart ?? null,
    proposedPeriodEnd: parsed.data.proposedPeriodEnd ?? null,
    proposedBusinessAmountKrw: parsed.data.proposedBusinessAmountKrw ?? null,
    proposedHourlyRateKrw: parsed.data.proposedHourlyRateKrw ?? null,
    notes: parsed.data.notes ?? null,
    requiredSkillIds: parsed.data.requiredSkillIds,
  });

  if (!result.ok) {
    if (result.reason === "stale-or-frozen") {
      return {
        ok: false,
        errors: { _root: [PROPOSAL_ERRORS.FROZEN_NO_EDIT] },
      };
    }
    return {
      ok: false,
      errors: { _root: [PROPOSAL_ERRORS.UPDATE_FAILED_GENERIC] },
    };
  }

  revalidatePath(`/proposals/${proposalId}`);
  revalidatePath("/proposals");
  redirect(`/proposals/${proposalId}`);
}

export type StatusTransitionResult =
  | { ok: true }
  | { ok: false; message: string };

export async function transitionProposalStatusAction(args: {
  proposalId: string;
  toStatus: ProposalStatus;
  expectedUpdatedAt: string;
}): Promise<StatusTransitionResult> {
  await requireUser();
  const supabase = createClient(await cookies());

  // 현재 상태 조회 (트랜잭션 시작 전 검증)
  const { data: row, error } = (await supabase
    .from("proposals")
    .select("status, updated_at")
    .eq("id", args.proposalId)
    .is("deleted_at", null)
    .maybeSingle()) as {
    data: { status: ProposalStatus; updated_at: string } | null;
    error: unknown;
  };

  if (error || !row) {
    return { ok: false, message: PROPOSAL_ERRORS.PROPOSAL_NOT_FOUND };
  }

  const frozenCheck = rejectIfFrozen(row.status);
  if (!frozenCheck.ok) {
    return { ok: false, message: frozenCheck.reason };
  }

  const validation = validateProposalTransition(row.status, args.toStatus);
  if (!validation.ok) {
    return { ok: false, message: validation.reason };
  }

  const now = new Date();
  const updates = timestampUpdatesForTransition(args.toStatus, now);

  const result = await transitionProposalStatus(supabase, {
    id: args.proposalId,
    expectedUpdatedAt: args.expectedUpdatedAt,
    fromStatus: row.status,
    toStatus: args.toStatus,
    submittedAt: updates.submittedAt?.toISOString(),
    decidedAt: updates.decidedAt?.toISOString(),
  });

  if (!result.ok) {
    if (result.reason === "stale-or-state-changed") {
      return { ok: false, message: PROPOSAL_ERRORS.STALE_UPDATE };
    }
    return { ok: false, message: PROPOSAL_ERRORS.UPDATE_FAILED_GENERIC };
  }

  revalidatePath(`/proposals/${args.proposalId}`);
  revalidatePath("/proposals");
  return { ok: true };
}

export async function deleteProposalAction(
  proposalId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const supabase = createClient(await cookies());
  const result = await softDeleteProposal(supabase, proposalId);
  if (!result.ok) {
    return { ok: false, error: PROPOSAL_ERRORS.UPDATE_FAILED_GENERIC };
  }
  revalidatePath(`/proposals/${proposalId}`);
  revalidatePath("/proposals");
  return { ok: true };
}
