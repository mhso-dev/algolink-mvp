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
  proposal_id: string | null;
  status: string;
  operator_id: string | null;
  proposed_time_slot_start: string | null;
  proposed_time_slot_end: string | null;
  question_note: string | null;
  created_at: string;
  response_status: ResponseStatus | null;
  response_responded_at: string | null;
  response_conditional_note: string | null;
}

interface InquiryCardProps {
  data: InquiryCardData;
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
              {formatKstDateRange(data.proposed_time_slot_start, data.proposed_time_slot_end)}
            </dd>
          </div>
          {data.question_note && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-[var(--color-text-muted)]">문의 내용</dt>
              <dd className="text-sm mt-1">{data.question_note}</dd>
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
