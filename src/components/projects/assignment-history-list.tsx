// SPEC-PROJECT-001 §2.3 REQ-PROJECT-DETAIL-006 / §2.6 REQ-PROJECT-RECOMMEND-006 —
// 추천 + 배정 이력 시간순 리스트.

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface RecommendationHistoryEntry {
  id: string;
  createdAt: string; // ISO
  model: string;
  candidateCount: number;
  adoptedInstructorId: string | null;
  adoptedDisplayName: string | null;
  topCandidates: Array<{
    instructorId: string;
    displayName: string;
    finalScore: number;
    rank: number; // 1-based
  }>;
}

export interface StatusHistoryEntry {
  id: string;
  changedAt: string; // ISO
  fromStatus: string | null;
  toStatus: string;
  fromLabel: string | null;
  toLabel: string;
  changedByName: string | null;
}

interface Props {
  recommendations: RecommendationHistoryEntry[];
  statusHistory: StatusHistoryEntry[];
}

function formatKstShort(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function AssignmentHistoryList({ recommendations, statusHistory }: Props) {
  const isEmpty = recommendations.length === 0 && statusHistory.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">배정 / 상태 이력</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {isEmpty ? (
          <p className="text-[var(--color-text-muted)]">
            아직 추천 실행 또는 상태 변경 기록이 없습니다.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {recommendations.length > 0 && (
              <section aria-labelledby="rec-history-heading">
                <h3
                  id="rec-history-heading"
                  className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-2"
                >
                  추천 이력 (총 {recommendations.length}건)
                </h3>
                <ol className="flex flex-col gap-3">
                  {recommendations.map((rec, idx) => (
                    <li
                      key={rec.id}
                      className="rounded-md border border-[var(--color-border)] p-3"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-tabular text-[var(--color-text-muted)]">
                            {formatKstShort(rec.createdAt)}
                          </span>
                          {idx === 0 && (
                            <Badge variant="info" className="text-[10px]">
                              현재
                            </Badge>
                          )}
                          <span className="text-xs text-[var(--color-text-subtle)]">
                            모델: {rec.model}
                          </span>
                        </div>
                        {rec.adoptedInstructorId && (
                          <Badge variant="settled" className="text-[10px]">
                            채택: {rec.adoptedDisplayName ?? rec.adoptedInstructorId.slice(0, 8)}
                          </Badge>
                        )}
                      </div>
                      <ul className="flex flex-wrap gap-2 text-xs">
                        {rec.topCandidates.map((c) => {
                          const adopted = c.instructorId === rec.adoptedInstructorId;
                          return (
                            <li
                              key={c.instructorId}
                              className={
                                adopted
                                  ? "px-2 py-1 rounded border-2 border-[var(--color-state-settled)] bg-[var(--color-state-settled-muted)]"
                                  : "px-2 py-1 rounded border border-[var(--color-border)]"
                              }
                            >
                              <span className="font-tabular text-[10px] mr-1">
                                #{c.rank}
                              </span>
                              {c.displayName}
                              <span className="ml-1.5 text-[var(--color-text-muted)] font-tabular">
                                {(c.finalScore * 100).toFixed(0)}점
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {statusHistory.length > 0 && (
              <section aria-labelledby="status-history-heading">
                <h3
                  id="status-history-heading"
                  className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-2"
                >
                  상태 변경 이력 (총 {statusHistory.length}건)
                </h3>
                <ol className="flex flex-col gap-1.5">
                  {statusHistory.map((h) => (
                    <li
                      key={h.id}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span className="font-tabular text-[var(--color-text-muted)] min-w-[120px]">
                        {formatKstShort(h.changedAt)}
                      </span>
                      <span>
                        {h.fromLabel ? (
                          <>
                            <span className="text-[var(--color-text-muted)]">
                              {h.fromLabel}
                            </span>
                            <span className="mx-1.5">→</span>
                          </>
                        ) : (
                          <span className="text-[var(--color-text-muted)]">최초 등록 → </span>
                        )}
                        <span className="font-medium">{h.toLabel}</span>
                      </span>
                      {h.changedByName && (
                        <span className="text-[var(--color-text-subtle)] ml-auto">
                          by {h.changedByName}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
