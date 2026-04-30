// SPEC-CONFIRM-001 §M4 — 사전 가용성 문의 1건 카드.

import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatKstDateRange } from "@/lib/dashboard/format";
import { ResponsePanel } from "./response-panel";
import type { ResponseStatus } from "@/lib/responses";

export interface InquiryCardData {
  id: string;
  status: string;
  requested_start: string | null;
  requested_end: string | null;
  skill_stack: string[] | null;
  operator_memo: string | null;
  created_at: string;
  response_status: ResponseStatus | null;
  response_responded_at: string | null;
  response_conditional_note: string | null;
}

interface InquiryCardProps {
  data: InquiryCardData;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  responseAction: (input: { status: ResponseStatus; conditionalNote?: string | null }) => Promise<{
    ok: boolean;
    reason?: string;
  }>;
}

function formatKstDateTime(iso: string | null): string {
  if (!iso) return "미정";
  try {
    return format(new Date(iso), "yyyy.MM.dd HH:mm 'KST'", { locale: ko });
  } catch {
    return "미정";
  }
}

export function InquiryCard({ data, responseAction }: InquiryCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base">사전 가용성 문의</CardTitle>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              {formatKstDateTime(data.created_at)} 운영자 발송
            </p>
          </div>
          {data.response_status && (
            <Badge
              variant={
                data.response_status === "accepted"
                  ? "confirmed"
                  : data.response_status === "declined"
                    ? "alert"
                    : "proposed"
              }
            >
              {data.response_status === "accepted"
                ? "수락"
                : data.response_status === "declined"
                  ? "거절"
                  : "조건부"}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <div className="sm:col-span-2">
            <dt className="text-xs text-[var(--color-text-muted)]">문의 일정</dt>
            <dd className="font-tabular">
              {formatKstDateRange(data.requested_start, data.requested_end)}
            </dd>
          </div>
          {data.skill_stack && data.skill_stack.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-[var(--color-text-muted)]">기술 스택</dt>
              <dd className="flex gap-1 flex-wrap mt-1">
                {data.skill_stack.map((s) => (
                  <Badge key={s} variant="secondary" className="text-xs">
                    {s}
                  </Badge>
                ))}
              </dd>
            </div>
          )}
          {data.operator_memo && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-[var(--color-text-muted)]">운영자 메모</dt>
              <dd className="text-sm mt-1">{data.operator_memo}</dd>
            </div>
          )}
        </dl>

        <div className="border-t border-[var(--color-border)] pt-3">
          <ResponsePanel
            currentStatus={data.response_status}
            respondedAt={data.response_responded_at}
            conditionalNote={data.response_conditional_note}
            action={responseAction}
          />
        </div>
      </CardContent>
    </Card>
  );
}
