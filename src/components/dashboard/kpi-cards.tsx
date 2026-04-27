import { Receipt, Users, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: number | string;
  description: string;
  icon: typeof Receipt;
  tone: "primary" | "warning" | "alert";
  href?: string;
}

const toneStyles: Record<KpiCardProps["tone"], { bg: string; text: string; iconBg: string }> = {
  primary: {
    bg: "bg-[var(--color-primary-muted)]",
    text: "text-[var(--color-primary-muted-foreground)]",
    iconBg: "bg-[var(--color-primary)] text-white",
  },
  warning: {
    bg: "bg-[var(--color-state-pending-muted)]",
    text: "text-[var(--color-state-pending)]",
    iconBg: "bg-[var(--color-state-pending)] text-white",
  },
  alert: {
    bg: "bg-[var(--color-state-alert-muted)]",
    text: "text-[var(--color-state-alert)]",
    iconBg: "bg-[var(--color-state-alert)] text-white",
  },
};

function KpiCard({ label, value, description, icon: Icon, tone }: KpiCardProps) {
  const tones = toneStyles[tone];
  return (
    <Card className="flex items-center gap-4 p-5">
      <div className={cn("flex h-12 w-12 items-center justify-center rounded-lg", tones.iconBg)}>
        <Icon className="h-6 w-6" strokeWidth={2} />
      </div>
      <div className="flex flex-col">
        <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          {label}
        </span>
        <span className="text-2xl font-bold leading-tight font-tabular text-[var(--color-text)]">
          {value}
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">{description}</span>
      </div>
    </Card>
  );
}

interface KpiCardsProps {
  pendingSettlements: number;
  pendingAssignments: number;
  alerts: number;
}

export function KpiCards({
  pendingSettlements,
  pendingAssignments,
  alerts,
}: KpiCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <KpiCard
        label="정산 대기"
        value={pendingSettlements}
        description="요청 또는 승인 대기 중"
        icon={Receipt}
        tone="warning"
      />
      <KpiCard
        label="배정 대기"
        value={pendingAssignments}
        description="강사 미배정 의뢰 건"
        icon={Users}
        tone="primary"
      />
      <KpiCard
        label="이슈 알림"
        value={alerts}
        description="응답 지연·일정 충돌·만족도 낮음"
        icon={AlertTriangle}
        tone="alert"
      />
    </div>
  );
}
