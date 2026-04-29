// SPEC-INSTRUCTOR-001 §2.4 — AI 요약 + 폴백 + empty 분기 카드.

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import { formatKstDateTime } from "@/lib/instructor/format";
import type { SummaryResult } from "@/lib/instructor/types";
import { RegenerateButton } from "./regenerate-button";

type Props = {
  instructorId: string;
  result: SummaryResult;
};

function renderAiSummary(text: string) {
  // text는 "### 강점 ... ### 약점 ... ### 추천 분야 ..." 마크다운.
  const sections = text.split(/^###\s+/m).filter(Boolean);
  if (sections.length === 0) {
    return <p className="text-sm whitespace-pre-wrap">{text}</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {sections.map((sec, idx) => {
        const [heading, ...rest] = sec.split("\n");
        const body = rest.join("\n").trim();
        return (
          <section key={idx}>
            <h3 className="text-sm font-semibold mb-1">{heading.trim()}</h3>
            <p className="text-sm whitespace-pre-wrap text-[var(--color-text-muted)]">
              {body}
            </p>
          </section>
        );
      })}
    </div>
  );
}

export function SatisfactionSummaryCard({ instructorId, result }: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-[var(--color-primary)]" />
          AI 만족도 요약
        </CardTitle>
        {result.kind === "ai" ? (
          <RegenerateButton instructorId={instructorId} />
        ) : null}
      </CardHeader>
      <CardContent>
        {result.kind === "ai" ? (
          <div className="flex flex-col gap-3">
            {renderAiSummary(result.summary)}
            <p className="text-[10px] text-[var(--color-text-subtle)]">
              {result.model} · {formatKstDateTime(result.generatedAt)} (KST)
              {result.cached ? " · 캐시" : ""}
            </p>
          </div>
        ) : result.kind === "fallback" ? (
          <div className="flex flex-col gap-3">
            <div
              role="status"
              className="text-xs px-3 py-2 rounded-md bg-[var(--color-state-warning-bg,#fff7ed)] text-[var(--color-state-warning-text,#9a3412)]"
            >
              AI 요약을 사용할 수 없어 평균 점수와 최근 코멘트로 대체합니다.
            </div>
            <p className="text-sm">
              평균 점수:{" "}
              <strong>
                {result.avgScore !== null ? result.avgScore.toFixed(1) : "-"} /
                5.0
              </strong>{" "}
              ({result.reviewCount}건)
            </p>
            <ul className="flex flex-col gap-2">
              {result.recentComments.map((c, i) => (
                <li
                  key={i}
                  className="text-sm md:text-xs border-l-2 border-[var(--color-border)] pl-3"
                >
                  <Badge variant="secondary" className="mr-1">
                    {c.score}/5
                  </Badge>
                  <span className="font-medium">{c.projectTitle}</span>
                  <p className="mt-1 text-[var(--color-text-muted)]">
                    {c.comment}
                  </p>
                </li>
              ))}
              {result.recentComments.length === 0 ? (
                <li className="text-sm md:text-xs text-[var(--color-text-muted)]">
                  최근 코멘트가 없습니다.
                </li>
              ) : null}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)]">
            AI 요약은 만족도 코멘트가 3건 이상 누적된 후 생성됩니다.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
