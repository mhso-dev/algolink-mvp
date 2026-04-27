// @MX:NOTE: SPEC-DASHBOARD-001 — 부분 실패 ErrorState (role="alert").
import Link from "next/link";

interface ErrorStateProps {
  title?: string;
  message?: string;
  retryHref?: string;
}

export function ErrorState({
  title = "데이터를 불러오지 못했습니다.",
  message = "잠시 후 다시 시도해주세요.",
  retryHref = "/dashboard",
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="rounded-md border border-[var(--color-state-alert)] bg-[var(--color-state-alert-muted)] p-4 text-sm"
    >
      <p className="font-semibold text-[var(--color-state-alert)]">{title}</p>
      <p className="mt-1 text-[var(--color-text-muted)]">{message}</p>
      <Link
        href={retryHref}
        className="mt-2 inline-block text-xs font-medium text-[var(--color-primary)] underline"
      >
        다시 시도
      </Link>
    </div>
  );
}
