// SPEC-PAYOUT-002 §M5 REQ-PAYOUT002-GENERATE-002/-005/-008 — 정산 일괄 생성 클라이언트 폼.
// useActionState (React 19) — 서버 응답 + 에러 표시.

"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatKRW } from "@/lib/utils";
import { generateSettlementsAction, type GenerateActionState } from "@/app/(app)/(operator)/settlements/generate/actions";
import {
  SETTLEMENT_FLOWS,
  SETTLEMENT_FLOW_LABEL,
  type SettlementFlow,
} from "@/lib/payouts/types";

interface PreviewRowDTO {
  project_id: string;
  project_title: string;
  instructor_name: string;
  total_hours: number;
  business_amount_krw: number;
  instructor_fee_krw: number;
  default_flow: SettlementFlow | null;
}

interface Props {
  rows: PreviewRowDTO[];
  periodStart: string;
  periodEnd: string;
  unbilledCount: number;
  projectCount: number;
}

const GOV_TAX_RATES = [3.3, 8.8] as const;

export function GenerateSettlementsForm({
  rows,
  periodStart,
  periodEnd,
  unbilledCount,
  projectCount,
}: Props) {
  // 운영자가 선택한 flow override (default_flow가 null인 행에 필요)
  const [flowSelections, setFlowSelections] = useState<
    Record<string, SettlementFlow>
  >(() => {
    const init: Record<string, SettlementFlow> = {};
    for (const r of rows) {
      if (r.default_flow) init[r.project_id] = r.default_flow;
    }
    return init;
  });
  const [taxRateSelections, setTaxRateSelections] = useState<
    Record<string, number>
  >({});

  const [state, formAction, pending] = useActionState<
    GenerateActionState | undefined,
    FormData
  >(generateSettlementsAction, undefined);

  // 모든 프로젝트가 flow를 가졌는지 체크
  const allFlowsResolved = rows.every((r) => Boolean(flowSelections[r.project_id]));

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        // REQ-GENERATE-005 confirmation
        const msg = `기간 ${periodStart} ~ ${periodEnd}의 미청구 강의 ${unbilledCount}건에 대해 ${projectCount}개 정산 행을 생성합니다. 계속하시겠습니까?`;
        if (!window.confirm(msg)) {
          e.preventDefault();
        }
      }}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="period_start" value={periodStart} />
      <input type="hidden" name="period_end" value={periodEnd} />

      {/* 운영자가 flow를 선택해야 하는 행 (default_flow=null) */}
      {rows.some((r) => !r.default_flow) && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-medium mb-2">정산 흐름 선택 필요</p>
          <div className="flex flex-col gap-2">
            {rows
              .filter((r) => !r.default_flow)
              .map((r) => (
                <div
                  key={r.project_id}
                  className="flex flex-wrap items-center gap-2"
                >
                  <span className="text-sm">{r.project_title}:</span>
                  <Select
                    value={flowSelections[r.project_id] ?? ""}
                    onValueChange={(value) => {
                      setFlowSelections((prev) => ({
                        ...prev,
                        [r.project_id]: value as SettlementFlow,
                      }));
                      // government로 바뀌면 default 3.30
                      if (value === "government") {
                        setTaxRateSelections((prev) => ({
                          ...prev,
                          [r.project_id]: 3.3,
                        }));
                      } else {
                        setTaxRateSelections((prev) => {
                          const next = { ...prev };
                          delete next[r.project_id];
                          return next;
                        });
                      }
                    }}
                  >
                    <SelectTrigger className="h-9 w-32">
                      <SelectValue placeholder="흐름 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {SETTLEMENT_FLOWS.map((f) => (
                        <SelectItem key={f} value={f}>
                          {SETTLEMENT_FLOW_LABEL[f]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {flowSelections[r.project_id] === "government" && (
                    <Select
                      value={String(taxRateSelections[r.project_id] ?? 3.3)}
                      onValueChange={(value) =>
                        setTaxRateSelections((prev) => ({
                          ...prev,
                          [r.project_id]: Number(value),
                        }))
                      }
                    >
                      <SelectTrigger className="h-9 w-28">
                        <SelectValue placeholder="세율" />
                      </SelectTrigger>
                      <SelectContent>
                        {GOV_TAX_RATES.map((r2) => (
                          <SelectItem key={r2} value={String(r2)}>
                            {r2.toFixed(2)}%
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 모든 행의 flow + tax_rate를 hidden field로 직렬화 */}
      {rows.map((r) => {
        const flow = flowSelections[r.project_id];
        const taxRate = taxRateSelections[r.project_id];
        return (
          <div key={r.project_id}>
            {flow && (
              <input
                type="hidden"
                name={`flow_overrides_${r.project_id}`}
                value={flow}
              />
            )}
            {flow === "government" && taxRate !== undefined && (
              <input
                type="hidden"
                name={`tax_rate_overrides_${r.project_id}`}
                value={String(taxRate)}
              />
            )}
          </div>
        );
      })}

      {state && state.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <p className="text-sm text-[var(--color-text-muted)]">
          총 {unbilledCount}건 / {projectCount}개 프로젝트 — 합계 사업비{" "}
          {formatKRW(rows.reduce((s, r) => s + r.business_amount_krw, 0))} / 강사비{" "}
          {formatKRW(rows.reduce((s, r) => s + r.instructor_fee_krw, 0))}
        </p>
      </div>

      <Button
        type="submit"
        disabled={pending || rows.length === 0 || !allFlowsResolved}
      >
        {pending ? "생성 중..." : "정산 생성"}
      </Button>
    </form>
  );
}
