"use client";

// SPEC-AUTH-001 §2.4 REQ-AUTH-INVITE-006 — 대기 중인 초대 목록 + 취소 버튼.

import * as React from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { revokeInvitation } from "./actions";

export interface PendingInvitation {
  id: string;
  email: string;
  invited_role: "instructor" | "operator" | "admin";
  invited_by: string;
  expires_at: string;
  created_at: string;
}

interface PendingInvitationsProps {
  invitations: PendingInvitation[];
}

const ROLE_LABEL: Record<PendingInvitation["invited_role"], string> = {
  instructor: "강사",
  operator: "운영자",
  admin: "관리자",
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ko-KR", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function PendingInvitations({ invitations }: PendingInvitationsProps) {
  const [revokingId, setRevokingId] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  if (invitations.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-[var(--color-text-muted)]">
        대기 중인 초대가 없습니다.
      </Card>
    );
  }

  const onRevoke = async (id: string, email: string) => {
    if (!window.confirm(`${email} 초대를 취소하시겠습니까?`)) return;

    setRevokingId(id);
    setErrorMsg(null);
    const result = await revokeInvitation(id);
    setRevokingId(null);
    if (result?.error) {
      setErrorMsg(result.error);
    }
    // 성공 시 revalidatePath로 페이지가 다시 렌더되어 목록이 갱신됨.
  };

  return (
    <div className="flex flex-col gap-3">
      {errorMsg ? (
        <p
          role="alert"
          className="rounded-md bg-[var(--color-state-alert-muted)] border border-[var(--color-state-alert)]/30 px-3 py-2 text-sm text-[var(--color-state-alert)]"
        >
          {errorMsg}
        </p>
      ) : null}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-surface-muted)] text-left text-xs text-[var(--color-text-muted)]">
            <tr>
              <th className="px-4 py-2 font-medium">이메일</th>
              <th className="px-4 py-2 font-medium">역할</th>
              <th className="px-4 py-2 font-medium">발송일</th>
              <th className="px-4 py-2 font-medium">만료</th>
              <th className="px-4 py-2 font-medium text-right">작업</th>
            </tr>
          </thead>
          <tbody>
            {invitations.map((inv) => (
              <tr
                key={inv.id}
                className="border-t border-[var(--color-border)]"
              >
                <td className="px-4 py-2 font-mono text-xs">{inv.email}</td>
                <td className="px-4 py-2">{ROLE_LABEL[inv.invited_role]}</td>
                <td className="px-4 py-2 text-[var(--color-text-muted)]">
                  {formatDate(inv.created_at)}
                </td>
                <td className="px-4 py-2 text-[var(--color-text-muted)]">
                  {formatDate(inv.expires_at)}
                </td>
                <td className="px-4 py-2 text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onRevoke(inv.id, inv.email)}
                    disabled={revokingId === inv.id}
                    aria-label={`${inv.email} 초대 취소`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    {revokingId === inv.id ? "취소 중…" : "취소"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
