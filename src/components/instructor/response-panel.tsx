"use client";

// SPEC-CONFIRM-001 §M4 — 강사 응답 패널 (3 버튼 + conditional textarea + 1시간 카운트다운).
// REQ-CONFIRM-INQUIRIES-003/004, REQ-CONFIRM-ASSIGNMENTS-003/004, REQ-CONFIRM-RESPONSE-WINDOW-002/006.

import { useState, useTransition, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CHANGE_WINDOW_HOURS, isWithinChangeWindow } from "@/lib/responses";
import type { ResponseStatus } from "@/lib/responses";

const STATUS_LABEL: Record<ResponseStatus, string> = {
  accepted: "수락",
  declined: "거절",
  conditional: "조건부",
};

const STATUS_VARIANT: Record<
  ResponseStatus,
  "confirmed" | "alert" | "proposed"
> = {
  accepted: "confirmed",
  declined: "alert",
  conditional: "proposed",
};

export interface ResponsePanelProps {
  /** 기존 응답 상태 (null = 미응답). */
  currentStatus: ResponseStatus | null;
  /** 기존 응답 시각 (null = 미응답). */
  respondedAt: string | null;
  /** 기존 conditional_note (null이면 비어있음). */
  conditionalNote: string | null;
  /** Server Action 호출 (해당 라우트별 actions.ts에서 주입). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: (input: { status: ResponseStatus; conditionalNote?: string | null }) => Promise<{
    ok: boolean;
    reason?: string;
  }>;
  /** 응답 후 toast 메시지 callback (선택). */
  onResult?: (result: { ok: boolean; reason?: string }) => void;
}

export function ResponsePanel(props: ResponsePanelProps) {
  const [status, setStatus] = useState<ResponseStatus | null>(props.currentStatus);
  const [note, setNote] = useState<string>(props.conditionalNote ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState<boolean>(props.currentStatus === null);

  const respondedAtDate = props.respondedAt ? new Date(props.respondedAt) : null;
  const [now, setNow] = useState(() => new Date());

  // REQ-CONFIRM-RESPONSE-WINDOW-006 — 1초마다 카운트다운 갱신
  useEffect(() => {
    if (!respondedAtDate) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [respondedAtDate]);

  const withinWindow = isWithinChangeWindow(respondedAtDate, now);
  const isFinalLocked = !!respondedAtDate && !withinWindow;

  // 카운트다운 표시 (mm:ss)
  let countdown = "";
  if (respondedAtDate && withinWindow) {
    const elapsed = now.getTime() - respondedAtDate.getTime();
    const remaining = CHANGE_WINDOW_HOURS * 60 * 60 * 1000 - elapsed;
    if (remaining > 0) {
      const mm = Math.floor(remaining / 60000);
      const ss = Math.floor((remaining % 60000) / 1000);
      countdown = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    }
  }

  function handleClick(target: ResponseStatus) {
    setError(null);
    if (target === "conditional" && note.trim().length < 5) {
      setError("조건부 응답에는 5자 이상의 메모를 입력해주세요.");
      return;
    }
    startTransition(async () => {
      const result = await props.action({
        status: target,
        conditionalNote: target === "conditional" ? note.trim() : null,
      });
      if (!result.ok) {
        setError(result.reason ?? "응답 저장에 실패했습니다.");
      } else {
        setStatus(target);
        setShowPanel(false);
      }
      props.onResult?.(result);
    });
  }

  // final lock — read-only 표시
  if (isFinalLocked && status) {
    return (
      <div className="flex items-center gap-2">
        <Badge
          variant={STATUS_VARIANT[status]}
          aria-label={`응답 확정: ${STATUS_LABEL[status]}`}
        >
          {STATUS_LABEL[status]}
        </Badge>
        <span className="text-xs text-[var(--color-text-muted)]">응답 확정</span>
      </div>
    );
  }

  // 응답 후 윈도 내 (panel 닫힘 상태) — 응답 변경 affordance
  if (status !== null && !showPanel) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <Badge
          variant={STATUS_VARIANT[status]}
          aria-label={`현재 응답: ${STATUS_LABEL[status]}`}
        >
          {STATUS_LABEL[status]}
        </Badge>
        {countdown && (
          <span
            className="text-xs text-[var(--color-text-muted)] font-tabular"
            role="timer"
            aria-live="polite"
          >
            남은 변경 가능 시간: {countdown}
          </span>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowPanel(true)}
          disabled={isPending}
        >
          응답 변경
        </Button>
      </div>
    );
  }

  // 응답 패널 (active)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          variant="default"
          onClick={() => handleClick("accepted")}
          disabled={isPending}
        >
          수락
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => handleClick("declined")}
          disabled={isPending}
        >
          거절
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => handleClick("conditional")}
          disabled={isPending}
        >
          조건부
        </Button>
        {status !== null && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowPanel(false)}
            disabled={isPending}
          >
            취소
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="response-note" className="text-xs">
          조건부 응답 메모 (조건부 선택 시 필수, 5자 이상)
        </Label>
        <Textarea
          id="response-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="예: 5/3은 가능, 5/4는 18시 이후만 가능합니다."
          rows={3}
          maxLength={2000}
          aria-describedby="response-note-help"
          disabled={isPending}
        />
        <span
          id="response-note-help"
          className="text-xs text-[var(--color-text-muted)]"
        >
          {note.length}/2000자
        </span>
      </div>
      {error && (
        <p
          className="text-xs text-[var(--color-state-error)]"
          role="alert"
          aria-live="assertive"
        >
          {error}
        </p>
      )}
    </div>
  );
}
