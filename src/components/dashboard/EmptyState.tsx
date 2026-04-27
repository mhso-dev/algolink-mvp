// @MX:NOTE: SPEC-DASHBOARD-001 — 빈 상태 (role="status").
export function EmptyState({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="flex items-center justify-center py-6 text-center text-xs text-[var(--color-text-subtle)]"
    >
      {message}
    </div>
  );
}
