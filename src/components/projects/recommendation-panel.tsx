"use client";

// SPEC-PROJECT-001 §2.6/§2.7 — 추천 결과 표시 + 1-클릭 배정 버튼.
// SPEC-RECOMMEND-001 §3 REQ-RECOMMEND-006 — AI 어휘 제거 + model/source 배지 미노출.
// @MX:SPEC: SPEC-PROJECT-001
// @MX:SPEC: SPEC-RECOMMEND-001
// @MX:SPEC: SPEC-SKILL-ABSTRACT-001 — proficiency 배지 부재. binary skillMatch 표시(0~100%).

import * as React from "react";
import { Sparkles, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatRating } from "@/lib/utils";
import {
  runRecommendationAction,
  assignInstructorAction,
} from "@/app/(app)/(operator)/projects/[id]/actions";

interface PanelCandidate {
  instructorId: string;
  displayName: string;
  skillMatch: number;
  availability: 0 | 1;
  satisfaction: number;
  finalScore: number;
  matchedSkillIds: string[];
  reason: string;
  source: "claude" | "fallback";
}

interface Props {
  projectId: string;
  hasInstructor: boolean;
  initialCandidates: PanelCandidate[];
  recommendationId: string | null;
  adoptedInstructorId: string | null;
  disclaimer: string;
}

export function RecommendationPanel(props: Props) {
  const {
    projectId,
    hasInstructor,
    initialCandidates,
    recommendationId: initialRecId,
    adoptedInstructorId,
    disclaimer,
  } = props;

  const [candidates, setCandidates] = React.useState(initialCandidates);
  const [recId, setRecId] = React.useState<string | null>(initialRecId);
  const [loading, setLoading] = React.useState(false);
  const [assigning, setAssigning] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const onRecommend = async () => {
    setLoading(true);
    setMessage(null);
    setErrorMsg(null);
    try {
      const res = await runRecommendationAction(projectId);
      if (!res.ok) {
        setErrorMsg(res.message ?? "추천 실행 실패");
      } else {
        setCandidates(res.candidates ?? []);
        setRecId(res.recommendationId ?? null);
        if ((res.candidates ?? []).length === 0) {
          setMessage("기술스택을 만족하는 후보가 0명입니다.");
        } else if ((res.candidates ?? []).length < 3) {
          setMessage(
            `기술스택을 만족하는 후보가 ${(res.candidates ?? []).length}명입니다.`,
          );
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const onAssign = async (instructorId: string) => {
    setAssigning(instructorId);
    setErrorMsg(null);
    try {
      const res = await assignInstructorAction({
        projectId,
        instructorId,
        recommendationId: recId,
      });
      if (!res.ok) {
        setErrorMsg(res.message ?? "배정 실패");
      } else {
        setMessage("배정 요청이 전송되었습니다.");
      }
    } finally {
      setAssigning(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[var(--color-primary)]" />
          강사 추천
        </CardTitle>
        {!hasInstructor && (
          <Button onClick={onRecommend} disabled={loading} size="sm">
            <Sparkles className="h-3.5 w-3.5" />
            {loading ? "추천 생성 중…" : candidates.length > 0 ? "추천 다시 실행" : "추천 실행"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm md:text-xs text-[var(--color-text-muted)]">{disclaimer}</p>

        {loading && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-md border border-dashed border-[var(--color-border)] p-6 text-center text-sm"
          >
            추천을 생성하고 있습니다…
          </div>
        )}

        {message && (
          <div className="text-sm text-[var(--color-text-muted)]" role="status">
            {message}
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="flex items-center gap-2 text-sm text-[var(--color-state-alert)]"
          >
            <AlertTriangle className="h-4 w-4" /> {errorMsg}
          </div>
        )}

        {!loading && candidates.length > 0 && (
          <ul className="space-y-2" aria-label="강사 추천 후보">
            {candidates.map((c, idx) => {
              const isAdopted = adoptedInstructorId === c.instructorId;
              return (
                <li
                  key={c.instructorId}
                  className="rounded-md border border-[var(--color-border)] p-3 flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[var(--color-text-muted)]">
                          #{idx + 1}
                        </span>
                        <span className="font-semibold text-sm">
                          {c.displayName}
                        </span>
                        {isAdopted && (
                          <Badge variant="settled" className="text-[10px]">
                            <CheckCircle2 className="h-3 w-3 mr-0.5" /> 배정됨
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm mt-1.5">{c.reason}</p>
                      <div className="flex flex-wrap gap-2 mt-2 text-xs text-[var(--color-text-muted)]">
                        <span>
                          점수 {(c.finalScore * 100).toFixed(0)}점
                        </span>
                        <span>•</span>
                        <span>스킬 {(c.skillMatch * 100).toFixed(0)}%</span>
                        <span>•</span>
                        <span>일정 {c.availability ? "OK" : "충돌"}</span>
                        <span>•</span>
                        <span>
                          만족도 {formatRating(c.satisfaction * 4 + 1)}
                        </span>
                      </div>
                    </div>
                    {!hasInstructor && !isAdopted && (
                      <Button
                        size="sm"
                        onClick={() => onAssign(c.instructorId)}
                        disabled={assigning !== null}
                        aria-describedby={`reason-${c.instructorId}`}
                      >
                        {assigning === c.instructorId ? "처리 중…" : "배정 요청"}
                      </Button>
                    )}
                  </div>
                  <span id={`reason-${c.instructorId}`} className="sr-only">
                    {c.reason}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {!loading && candidates.length === 0 && hasInstructor && (
          <p className="text-sm text-[var(--color-text-muted)]">
            이미 강사가 배정되었습니다.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
