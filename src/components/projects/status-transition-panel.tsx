"use client";

// SPEC-PROJECT-001 §2.5 — 상태 전환 컨트롤 (graph 기반 다음 단계 후보 노출).

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { transitionStatusAction } from "@/app/(app)/(operator)/projects/[id]/actions";
import {
  ALLOWED_TRANSITIONS,
  validateTransition,
} from "@/lib/projects/status-machine";
import { STATUS_LABELS, type ProjectStatus } from "@/lib/projects";

interface Props {
  projectId: string;
  currentStatus: ProjectStatus;
  hasInstructor: boolean;
}

export function StatusTransitionPanel({
  projectId,
  currentStatus,
  hasInstructor,
}: Props) {
  const [busy, setBusy] = React.useState<ProjectStatus | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? [];

  const handle = async (to: ProjectStatus) => {
    setErrorMsg(null);
    // 클라이언트 사전 검증 (서버에서도 재검증됨)
    const verdict = validateTransition(currentStatus, to, {
      instructorId: hasInstructor ? "client-stub" : null,
    });
    if (!verdict.ok) {
      setErrorMsg(verdict.reason);
      return;
    }
    setBusy(to);
    try {
      const res = await transitionStatusAction({ projectId, to });
      if (!res.ok) setErrorMsg(res.message ?? "상태 변경 실패");
    } finally {
      setBusy(null);
    }
  };

  if (allowed.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">상태 전환</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-[var(--color-text-muted)]">
          더 이상 이동할 단계가 없습니다.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">상태 전환</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-[var(--color-text-muted)]">
          현재 상태:{" "}
          <Badge variant="info" className="ml-1">
            {STATUS_LABELS[currentStatus]}
          </Badge>
        </p>
        <div className="flex flex-wrap gap-2">
          {allowed.map((to) => (
            <Button
              key={to}
              variant="outline"
              size="sm"
              onClick={() => handle(to)}
              disabled={busy !== null}
            >
              → {STATUS_LABELS[to]}
            </Button>
          ))}
        </div>
        {errorMsg && (
          <div
            role="alert"
            className="flex items-center gap-2 text-sm text-[var(--color-state-alert)] mt-2"
          >
            <AlertTriangle className="h-4 w-4" />
            {errorMsg}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
