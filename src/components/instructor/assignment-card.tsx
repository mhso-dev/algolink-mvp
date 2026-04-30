// SPEC-CONFIRM-001 §M4 REQ-CONFIRM-ASSIGNMENTS-002 — 정식 배정 요청 1건 카드.
// server component (children: client ResponsePanel만 클라이언트).

import Link from "next/link";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatKstDateRange } from "@/lib/dashboard/format";
import { formatKRW } from "@/lib/utils";
import { ResponsePanel } from "./response-panel";
import type { ResponseStatus } from "@/lib/responses";


export interface AssignmentCardData {
  id: string;
  title: string;
  status: string;
  client_company_name: string | null;
  education_start_at: string | null;
  education_end_at: string | null;
  business_amount_krw: number;
  request_created_at: string | null;
  response_status: ResponseStatus | null;
  response_responded_at: string | null;
  response_conditional_note: string | null;
}

interface AssignmentCardProps {
  data: AssignmentCardData;
  responseAction: (input: { status: ResponseStatus; conditionalNote?: string | null }) => Promise<{
    ok: boolean;
    reason?: string;
  }>;
}

function formatKstDateTime(iso: string | null): string {
  if (!iso) return "미정";
  try {
    const d = new Date(iso);
    return format(d, "yyyy.MM.dd HH:mm 'KST'", { locale: ko });
  } catch {
    return "미정";
  }
}

export function AssignmentCard({ data, responseAction }: AssignmentCardProps) {
  const isAcceptedConfirmed =
    data.response_status === "accepted" && data.status === "assignment_confirmed";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base">{data.title}</CardTitle>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              {data.client_company_name ?? "고객사 미지정"}
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
            <dt className="text-xs text-[var(--color-text-muted)]">교육 일정</dt>
            <dd className="font-tabular">
              {formatKstDateRange(data.education_start_at, data.education_end_at)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-text-muted)]">사업비</dt>
            <dd className="font-tabular">
              {formatKRW(data.business_amount_krw, { sign: true })}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-text-muted)]">요청 시각</dt>
            <dd className="font-tabular">
              {formatKstDateTime(data.request_created_at)}
            </dd>
          </div>
        </dl>

        {isAcceptedConfirmed && (
          <div
            className="rounded-md border-l-4 border-l-[var(--color-state-success)] bg-[var(--color-state-success-muted)]/40 p-3 text-sm"
            role="status"
          >
            <p className="font-medium text-[var(--color-text)]">
              배정이 확정되었습니다. 일정에 자동 등록되었습니다.
            </p>
            <Link
              href="/me/schedule"
              className="text-xs text-[var(--color-primary)] underline mt-1 inline-block"
            >
              일정 보기 →
            </Link>
          </div>
        )}

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
