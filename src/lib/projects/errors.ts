// SPEC-PROJECT-001 — 한국어 에러 메시지 단일 출처 (REQ-PROJECT-ERROR).
// SPEC-RECOMMEND-001 — RECOMMENDATION_DISCLAIMER 문구에서 "AI" 어휘 제거 (REQ-RECOMMEND-006).
// 인라인 한국어 문자열 사용 금지. 모든 사용자 메시지는 본 모듈 경유.

export const PROJECT_ERRORS = {
  STATUS_NEED_INSTRUCTOR: "강사를 배정해야 컨펌 단계로 이동할 수 있습니다.",
  STATUS_NEED_EDUCATION_DONE: "강의 종료 후에만 정산을 시작할 수 있습니다.",
  STATUS_INVALID_TRANSITION: "허용되지 않은 상태 전환입니다.",
  STALE_UPDATE: "다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도하세요.",
  ASSIGN_NOT_IN_TOP3:
    "추천 결과에 포함되지 않은 강사는 배정할 수 없습니다. 추천을 다시 실행하세요.",
  ASSIGN_FAILED_GENERIC: "배정에 실패했습니다. 잠시 후 다시 시도해주세요.",
  END_BEFORE_START: "종료일은 시작일보다 늦어야 합니다.",
  PROJECT_NOT_FOUND: "프로젝트를 찾을 수 없습니다.",
  RECOMMEND_NO_CANDIDATE_TEMPLATE: (n: number) =>
    `기술스택을 만족하는 후보가 ${n}명입니다.`,
  RECOMMENDATION_DISCLAIMER:
    "강사 추천은 참고용이며 최종 배정은 담당자가 결정합니다.",
  CREATE_FAILED_GENERIC: "프로젝트 등록에 실패했습니다.",
} as const;
