// SPEC-ME-001 §2.7 REQ-ME-PAYOUT-001~009 — 지급 정보 등록 폼.
// @MX:WARN: 평문 PII 는 폼 제출 직후 클라이언트 state 에서 제거되어야 함.
// @MX:REASON: localStorage / React DevTools 노출 차단.
import { CreditCard } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { ensureInstructorRow } from "@/lib/instructor/me-queries";
import { getMyPayoutMasked, type MaskedPayout } from "@/lib/instructor/payout-queries";
import { PayoutSettingsForm } from "@/components/instructor/payout-settings-form";

export const dynamic = "force-dynamic";

const EMPTY_PAYOUT: MaskedPayout = {
  hasResidentNumber: false,
  hasBankAccount: false,
  hasBusinessNumber: false,
  residentNumberMasked: "",
  bankName: "",
  bankAccountMasked: "",
  accountHolder: "",
  businessNumberMasked: "",
  withholdingTaxRate: "3.30",
};

export default async function PayoutSettingsPage() {
  await requireUser();
  const me = await ensureInstructorRow();
  const initial = me ? await getMyPayoutMasked(me.instructorId) : EMPTY_PAYOUT;

  return (
    <div className="mx-auto max-w-2xl px-6 py-6 flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <CreditCard className="h-6 w-6 text-[var(--color-primary)]" />
          지급 정보
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          모든 민감 정보는 pgcrypto 로 암호화 저장됩니다. 마스킹된 값을 변경하려면 새로 입력해주세요.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">기본 지급 정보</CardTitle>
          <CardDescription>
            인건비(3.30% / 8.80%) 또는 세금계산서(0%) 처리 방식을 선택하세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {me ? (
            <PayoutSettingsForm initial={initial} />
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">
              강사 권한 계정으로 로그인해야 지급 정보를 설정할 수 있습니다.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
