// SPEC-PROPOSAL-001 §M2 — 한국어 에러 상수 단일 출처.
// 인라인 한국어 문자열 사용 금지. 모든 사용자 메시지는 본 모듈 경유.

export const PROPOSAL_ERRORS = {
  // 상태 전환
  INVALID_TRANSITION: "허용되지 않은 상태 전환입니다.",
  FROZEN_NO_EDIT: "확정된 제안서는 수정할 수 없습니다.",

  // 입력 검증 (REQ-PROPOSAL-ENTITY-007)
  END_BEFORE_START: "종료일은 시작일 이후여야 합니다.",
  TITLE_REQUIRED: "제목을 입력해주세요.",
  TITLE_TOO_LONG: "제목은 200자 이내로 입력해주세요.",
  CLIENT_REQUIRED: "고객사를 선택해주세요.",

  // 디스패치 (REQ-PROPOSAL-INQUIRY-004/005)
  INQUIRY_DUPLICATE: "이미 사전 문의를 보낸 강사입니다.",
  INQUIRY_FROZEN_PROPOSAL: "확정된 제안서에는 추가 문의를 보낼 수 없습니다.",
  INQUIRY_NO_INSTRUCTORS: "한 명 이상의 강사를 선택해주세요.",

  // 변환 (REQ-PROPOSAL-CONVERT-002)
  CONVERT_NEED_SUBMITTED:
    "제출 상태의 제안서만 수주 처리할 수 있습니다.",
  CONVERT_ALREADY_DONE_TEMPLATE: (projectId: string) =>
    `이미 프로젝트로 변환된 제안서입니다. (project_id=${projectId})`,

  // 첨부 (REQ-PROPOSAL-ENTITY-008)
  ATTACHMENT_INVALID_MIME: "PDF, PNG, JPG 파일만 업로드 가능합니다.",
  ATTACHMENT_TOO_LARGE: "파일 크기는 5MB 이하여야 합니다.",
  ATTACHMENT_UPLOAD_FAILED:
    "첨부 업로드에 실패했습니다. 잠시 후 다시 시도해주세요.",

  // 일반
  PROPOSAL_NOT_FOUND: "제안서를 찾을 수 없습니다.",
  STALE_UPDATE:
    "다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도하세요.",
  CREATE_FAILED_GENERIC: "제안서 등록에 실패했습니다.",
  UPDATE_FAILED_GENERIC: "제안서 수정에 실패했습니다.",
  DISPATCH_FAILED_GENERIC: "사전 문의 발송에 실패했습니다.",
  CONVERT_FAILED_GENERIC:
    "제안서 변환에 실패했습니다. 잠시 후 다시 시도해주세요.",
} as const;

export type ProposalErrorKey = keyof typeof PROPOSAL_ERRORS;
