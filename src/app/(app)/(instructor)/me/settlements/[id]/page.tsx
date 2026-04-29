// SPEC-RECEIPT-001 §M4/M6 — 강사 본인 정산 상세 (client_direct 흐름 송금 등록 + 영수증 다운로드).
// REQ-RECEIPT-INSTRUCTOR-001/005/006.

import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { requireUser } from "@/lib/auth";
import { ensureInstructorRow } from "@/lib/instructor/me-queries";
import { Container } from "@/components/app/container";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatKRW } from "@/lib/utils";
import { formatKstDate } from "@/lib/dashboard/format";
import {
  SETTLEMENT_FLOW_LABEL,
  settlementStatusBadgeVariant,
} from "@/lib/payouts/types";
import { getStatusLabel } from "@/lib/payouts/status-machine";
import { RemittanceRegistrationForm } from "@/components/payouts/remittance-registration-form";
import { ReceiptPreviewLink } from "@/components/payouts/receipt-preview-link";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

function formatKstDateTime(iso: string | null): string {
  if (!iso) return "—";
  return `${new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso))} KST`;
}

export default async function InstructorSettlementDetailPage({ params }: PageProps) {
  const session = await requireUser();
  if (session.role !== "instructor") {
    redirect("/dashboard");
  }
  const me = await ensureInstructorRow();
  if (!me) {
    redirect("/me");
  }

  const { id } = await params;
  const supabase = createClient(await cookies());

  // 본인 정산만 SELECT (RLS).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: settlement, error } = await (supabase as any)
    .from("settlements")
    .select(
      "id, project_id, instructor_id, settlement_flow, status, business_amount_krw, instructor_fee_krw, withholding_tax_rate, withholding_tax_amount_krw, instructor_remittance_amount_krw, instructor_remittance_received_at, client_payout_amount_krw, receipt_file_id, receipt_issued_at, receipt_number, notes, created_at",
    )
    .eq("id", id)
    .eq("instructor_id", me.instructorId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !settlement) notFound();

  const isClientDirect = settlement.settlement_flow === "client_direct";
  const status = settlement.status;
  const statusLabel = getStatusLabel(status, settlement.settlement_flow);

  // 프로젝트 + 고객사 메타.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("title, clients:client_id ( company_name )")
    .eq("id", settlement.project_id)
    .maybeSingle();
  const projectTitle = (project as { title?: string } | null)?.title ?? "—";
  const clientName =
    (project as { clients?: { company_name?: string | null } } | null)?.clients
      ?.company_name ?? null;

  // 영수증 PDF storage_path (paid 상태만).
  let receiptStoragePath: string | null = null;
  if (isClientDirect && status === "paid" && settlement.receipt_file_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: file } = await (supabase as any)
      .from("files")
      .select("storage_path")
      .eq("id", settlement.receipt_file_id)
      .maybeSingle();
    receiptStoragePath = (file as { storage_path?: string } | null)?.storage_path ?? null;
  }

  return (
    <Container variant="narrow" className="flex flex-col gap-5 py-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/me/settlements">
            <ChevronLeft /> 목록으로
          </Link>
        </Button>
      </div>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">정산 상세</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          프로젝트:{" "}
          <span className="font-medium text-[var(--color-text)]">{projectTitle}</span>
          {clientName ? (
            <>
              <span className="mx-2">·</span>
              고객사:{" "}
              <span className="font-medium text-[var(--color-text)]">{clientName}</span>
            </>
          ) : null}
        </p>
        <div className="flex items-center gap-2">
          <Badge
            variant={
              settlement.settlement_flow === "corporate" ? "info" : "proposed"
            }
          >
            {SETTLEMENT_FLOW_LABEL[settlement.settlement_flow as keyof typeof SETTLEMENT_FLOW_LABEL]}
          </Badge>
          <Badge variant={settlementStatusBadgeVariant(status)}>
            {statusLabel}
          </Badge>
        </div>
      </header>

      {/* 금액 */}
      <Card>
        <CardHeader>
          <CardTitle>금액 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-y-2 text-sm md:grid-cols-3">
            <dt className="text-[var(--color-text-muted)]">사업비</dt>
            <dd className="md:col-span-2 font-tabular">
              {formatKRW(settlement.business_amount_krw)} 원
            </dd>
            <dt className="text-[var(--color-text-muted)]">강사비</dt>
            <dd className="md:col-span-2 font-tabular">
              {formatKRW(settlement.instructor_fee_krw)} 원
            </dd>
            <dt className="text-[var(--color-text-muted)]">원천세율</dt>
            <dd className="md:col-span-2">
              {Number(settlement.withholding_tax_rate ?? 0).toFixed(2)}%
            </dd>
            <dt className="text-[var(--color-text-muted)]">원천세 금액</dt>
            <dd className="md:col-span-2 font-tabular">
              {formatKRW(settlement.withholding_tax_amount_krw ?? 0)} 원
            </dd>
            {isClientDirect ? (
              <>
                <dt className="text-[var(--color-text-muted)] mt-2">
                  알고링크 송금 금액
                </dt>
                <dd className="md:col-span-2 font-tabular font-medium mt-2">
                  {formatKRW(settlement.instructor_remittance_amount_krw ?? 0)} 원
                </dd>
              </>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      {/* SPEC-RECEIPT-001 §M4 — pending 강사 송금 등록 CTA */}
      {isClientDirect && status === "pending" ? (
        <Card>
          <CardHeader>
            <CardTitle>송금 완료 등록</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[var(--color-text-muted)] mb-4">
              알고링크 계좌로 송금을 완료한 후, 아래 폼에 송금 일자와 금액을 입력하세요.
              알고링크 운영자가 입금 확인을 마치면 영수증이 자동 발급됩니다.
            </p>
            <RemittanceRegistrationForm
              settlementId={settlement.id}
              expectedAmountKrw={settlement.instructor_remittance_amount_krw ?? 0}
            />
          </CardContent>
        </Card>
      ) : null}

      {/* 강사 송금 등록 정보 (requested/paid 상태) */}
      {isClientDirect && (status === "requested" || status === "paid") ? (
        <Card>
          <CardHeader>
            <CardTitle>송금 등록 정보</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-y-2 text-sm md:grid-cols-3">
              <dt className="text-[var(--color-text-muted)]">고객사 송금</dt>
              <dd className="md:col-span-2 font-tabular">
                {formatKRW(settlement.client_payout_amount_krw ?? 0)} 원
              </dd>
              <dt className="text-[var(--color-text-muted)]">알고링크 송금 등록</dt>
              <dd className="md:col-span-2">
                {status === "requested" ? "운영자 확인 대기" : "확인 완료"}
              </dd>
              {settlement.instructor_remittance_received_at ? (
                <>
                  <dt className="text-[var(--color-text-muted)]">입금 확인 일자</dt>
                  <dd className="md:col-span-2">
                    {formatKstDate(settlement.instructor_remittance_received_at)} (KST)
                  </dd>
                </>
              ) : null}
            </dl>
          </CardContent>
        </Card>
      ) : null}

      {/* SPEC-RECEIPT-001 §M6 — paid 영수증 다운로드 */}
      {isClientDirect && status === "paid" && settlement.receipt_number ? (
        <Card>
          <CardHeader>
            <CardTitle>영수증</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <dl className="grid grid-cols-2 gap-y-2 text-sm md:grid-cols-3">
              <dt className="text-[var(--color-text-muted)]">영수증 번호</dt>
              <dd className="md:col-span-2 font-medium">
                {settlement.receipt_number}
              </dd>
              <dt className="text-[var(--color-text-muted)]">발급 일시</dt>
              <dd className="md:col-span-2">
                {formatKstDateTime(settlement.receipt_issued_at)}
              </dd>
            </dl>
            {receiptStoragePath ? (
              <ReceiptPreviewLink
                storagePath={receiptStoragePath}
                receiptNumber={settlement.receipt_number}
              />
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {settlement.notes ? (
        <Card>
          <CardHeader>
            <CardTitle>메모</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{settlement.notes}</p>
          </CardContent>
        </Card>
      ) : null}
    </Container>
  );
}
