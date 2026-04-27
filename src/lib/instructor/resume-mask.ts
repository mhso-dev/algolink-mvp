// SPEC-ME-001 §2.2 REQ-ME-RESUME-007 — 이력서 PDF 다운로드 시 개인정보 마스킹.
// @MX:ANCHOR: 마스킹 규칙은 PDF 출력 / 운영자 read 전반에서 재사용.
// @MX:REASON: 개인정보보호법 — 외부 공유 시 평문 노출 금지. fan_in 기대 >= 3.
//
// pure module — 클라이언트/서버 양쪽 사용 가능. node:crypto 의존 없음.

/** 주민등록번호: 앞 6자리만 유지, 뒷 7자리 마스킹. */
export function maskResidentNumber(value: string | null | undefined): string {
  if (!value) return "";
  // dash 유무 모두 허용. 숫자만 추출 후 13자리 검증.
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 13) return "";
  return `${digits.slice(0, 6)}-*******`;
}

/** 휴대폰: 가운데 4자리 마스킹. dash 없는 입력도 graceful. */
export function maskPhone(value: string | null | undefined): string {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-****-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    // 010-123-4567 형태 (구 번호) — 가운데 3자리 마스킹.
    return `${digits.slice(0, 3)}-***-${digits.slice(6)}`;
  }
  // 알 수 없는 형식 → 빈 문자열 (graceful).
  return "";
}

/** 이메일: local-part 앞 2자만 노출, 나머지는 ***. local 1자면 1자만. */
export function maskEmail(value: string | null | undefined): string {
  if (!value) return "";
  const at = value.indexOf("@");
  if (at <= 0) return "";
  const local = value.slice(0, at);
  const domain = value.slice(at);
  const visible = local.length >= 2 ? local.slice(0, 2) : local.slice(0, 1);
  return `${visible}***${domain}`;
}

/** 계좌번호: 앞 4 + 가운데 마스킹 + 뒤 4. */
export function maskBankAccount(value: string | null | undefined): string {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8) return "";
  const head = digits.slice(0, 4);
  const tail = digits.slice(-4);
  const middleLen = digits.length - 8;
  const middle = "*".repeat(Math.max(middleLen, 4));
  return `${head}-${middle}-${tail}`;
}

/** 사업자등록번호: 앞 3 노출, 나머지 마스킹. */
export function maskBusinessNumber(value: string | null | undefined): string {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 10) return "";
  return `${digits.slice(0, 3)}-**-*****`;
}

/** 주소: 시/구까지만 표시, 나머지는 ***. */
export function maskAddress(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/\s+/);
  if (parts.length <= 2) return `${trimmed} ***`;
  return `${parts[0]} ${parts[1]} ***`;
}
