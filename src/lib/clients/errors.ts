// SPEC-CLIENT-001 §3.3 — 한국어 에러 메시지 매핑.
// @MX:NOTE: validation/file-upload/queries 모두 동일 메시지 사용.

export const CLIENT_ERRORS = {
  COMPANY_NAME_REQUIRED: "회사명을 입력해주세요",
  CONTACTS_MIN_ONE: "담당자를 1명 이상 등록해주세요",
  CONTACT_NAME_REQUIRED: "담당자 이름을 입력해주세요",
  CONTACT_EMAIL_INVALID: "올바른 이메일 형식이 아닙니다",
  HANDOVER_MEMO_TOO_LONG: "인수인계 메모는 500자 이하여야 합니다",
  FILE_TOO_LARGE: "파일 크기는 5MB 이하여야 합니다",
  FILE_MIME_INVALID: "PDF, PNG, JPG 형식만 업로드 가능합니다",
  FILE_UPLOAD_FAILED: "파일 업로드에 실패했습니다",
  CLIENT_NOT_FOUND: "고객사를 찾을 수 없습니다",
  CREATE_FAILED: "고객사 등록에 실패했습니다",
  UPDATE_FAILED: "고객사 수정에 실패했습니다",
  DELETE_FAILED: "고객사 삭제에 실패했습니다",
  PERMISSION_DENIED: "권한이 없습니다",
} as const;

export type ClientErrorCode = keyof typeof CLIENT_ERRORS;
