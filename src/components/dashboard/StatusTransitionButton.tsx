"use client";
// @MX:NOTE: SPEC-DASHBOARD-001 §M5 — 단일 단계 전환 버튼 (Server Action).
import * as React from "react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ProjectStatus } from "@/lib/projects";
import { transitionProjectStatusAction } from "@/app/(app)/(operator)/dashboard/actions";

interface StatusTransitionButtonProps {
  projectId: string;
  fromStatus: ProjectStatus;
  toStatus: ProjectStatus;
  toLabel: string;
}

export function StatusTransitionButton({
  projectId,
  fromStatus,
  toStatus,
  toLabel,
}: StatusTransitionButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [announce, setAnnounce] = React.useState<{ kind: "status" | "alert"; msg: string } | null>(
    null,
  );

  const onClick = () => {
    startTransition(async () => {
      const res = await transitionProjectStatusAction(projectId, fromStatus, toStatus);
      if (res.ok) {
        toast.success(`${toLabel.replace(/으로$/, "")} 단계로 이동했습니다.`);
        setAnnounce({ kind: "status", msg: `${toLabel} 단계로 이동했습니다.` });
      } else {
        toast.error(res.message);
        setAnnounce({ kind: "alert", msg: res.message });
      }
    });
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={onClick}
        aria-label={`${toLabel} 상태로 전환`}
      >
        {isPending ? "전환 중…" : toLabel}
      </Button>
      {announce && (
        <span
          role={announce.kind === "status" ? "status" : "alert"}
          aria-live={announce.kind === "status" ? "polite" : "assertive"}
          className="sr-only"
        >
          {announce.msg}
        </span>
      )}
    </>
  );
}
