import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Tailwind 클래스 병합 헬퍼.
 * shadcn/ui 표준 패턴 — 조건부 클래스 + 충돌 해결.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 한국 원화 포맷터.
 */
export function formatKRW(amount: number, opts?: { sign?: boolean }): string {
  const formatted = amount.toLocaleString("ko-KR");
  return opts?.sign ? `₩${formatted}` : formatted;
}

/**
 * 만족도 별점 (0~5) 텍스트 표현.
 */
export function formatRating(rating: number | null | undefined): string {
  if (rating === null || rating === undefined) return "—";
  return `${rating.toFixed(1)} / 5.0`;
}

/**
 * 한국 휴대폰 번호 포맷 (010-1234-5678).
 */
export function formatKoreanPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

/**
 * 마스킹 — 주민번호/계좌번호 등 민감정보.
 */
export function maskMiddle(value: string, visibleStart = 3, visibleEnd = 2): string {
  if (!value) return "";
  if (value.length <= visibleStart + visibleEnd) return value;
  const masked = "•".repeat(value.length - visibleStart - visibleEnd);
  return `${value.slice(0, visibleStart)}${masked}${value.slice(-visibleEnd)}`;
}
