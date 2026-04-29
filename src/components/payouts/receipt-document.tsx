// SPEC-RECEIPT-001 §M3 REQ-RECEIPT-PDF-001~005 — 영수증 PDF 컴포넌트.
// @MX:NOTE: server-only 환경에서만 호출 (Node.js runtime). Font.register는 process.cwd() 기준 절대 경로 필수 (REQ-RECEIPT-PDF-001).
// @MX:REASON: bare /fonts/... 경로는 browser-only — Node.js runtime에서는 한국어 깨짐.
//
// "server-only" import는 의도적으로 생략 — unit test에서 renderReceiptPdf를 직접 호출 가능하도록.
// 본 컴포넌트는 confirm-remittance Server Action + Route Handler에서만 import되므로 client bundle 노출 위험은 없음.
import path from "node:path";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { formatKstDate } from "@/lib/dashboard/format";
import { formatKRW } from "@/lib/utils";
import type { OrganizationInfo } from "@/lib/payouts/types";

const fontDir = path.join(process.cwd(), "public", "fonts");

let _registered = false;
function ensureFontRegistered() {
  if (_registered) return;
  try {
    Font.register({
      family: "NotoSansKR",
      fonts: [
        { src: path.join(fontDir, "NotoSansKR-Regular.ttf"), fontWeight: 400 },
        { src: path.join(fontDir, "NotoSansKR-Bold.ttf"), fontWeight: 700 },
      ],
    });
    Font.registerHyphenationCallback((word) => [word]);
    _registered = true;
  } catch (err) {
    console.error("[receipt-pdf] font register failed", err);
  }
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "NotoSansKR",
    fontSize: 10,
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 50,
    color: "#111111",
    lineHeight: 1.5,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 2,
    borderBottomColor: "#1f2937",
    paddingBottom: 12,
    marginBottom: 24,
  },
  title: { fontSize: 28, fontWeight: 700 },
  receiptNumber: { fontSize: 12, color: "#374151" },
  issuedAt: { fontSize: 10, color: "#6b7280", marginTop: 2 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    marginTop: 16,
    marginBottom: 6,
    color: "#1f2937",
  },
  infoBlock: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 0.5,
    borderColor: "#d1d5db",
    backgroundColor: "#fafafa",
  },
  infoCell: { width: "50%", marginVertical: 2 },
  infoLabel: { fontSize: 9, color: "#6b7280" },
  infoValue: { fontSize: 11, color: "#111111", fontWeight: 700 },
  table: { marginTop: 12, marginBottom: 16 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: "#d1d5db",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderColor: "#e5e7eb",
  },
  cellLabel: { width: "30%", fontSize: 10, color: "#6b7280" },
  cellValue: { width: "70%", fontSize: 11, fontWeight: 700 },
  totalAmount: {
    fontSize: 18,
    fontWeight: 700,
    color: "#1f2937",
    textAlign: "right",
    marginTop: 8,
  },
  declaration: {
    marginTop: 24,
    fontSize: 12,
    fontWeight: 700,
    textAlign: "center",
    paddingVertical: 12,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: "#1f2937",
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 50,
    right: 50,
    textAlign: "center",
    fontSize: 8,
    color: "#9ca3af",
  },
});

export interface ReceiptDocumentProps {
  receiptNumber: string;
  issuedAt: Date;
  remittanceReceivedAt: string | Date | null;
  amountKrw: number;
  instructor: {
    name: string;
    businessNumber: string | null;
  };
  organization: OrganizationInfo;
}

export function ReceiptDocument({
  receiptNumber,
  issuedAt,
  remittanceReceivedAt,
  amountKrw,
  instructor,
  organization,
}: ReceiptDocumentProps) {
  ensureFontRegistered();

  const issuedLabel = `${formatKstDate(issuedAt)} (KST)`;
  const remittanceLabel = remittanceReceivedAt
    ? `${formatKstDate(remittanceReceivedAt)} (KST)`
    : "-";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* 1. Header — 영수증 타이틀 + 번호 + 발행일 */}
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.title}>영수증</Text>
            <Text style={styles.issuedAt}>발행일: {issuedLabel}</Text>
          </View>
          <View>
            <Text style={styles.receiptNumber}>영수증 번호</Text>
            <Text style={[styles.infoValue, { fontSize: 14 }]}>
              {receiptNumber}
            </Text>
          </View>
        </View>

        {/* 2. 강사 정보 (수령자) */}
        <Text style={styles.sectionTitle}>강사 정보 (수령자)</Text>
        <View style={styles.infoBlock}>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>강사명</Text>
            <Text style={styles.infoValue}>{instructor.name}</Text>
          </View>
          {instructor.businessNumber ? (
            <View style={styles.infoCell}>
              <Text style={styles.infoLabel}>사업자등록번호</Text>
              <Text style={styles.infoValue}>{instructor.businessNumber}</Text>
            </View>
          ) : null}
        </View>

        {/* 3. 알고링크 정보 (발행자) */}
        <Text style={styles.sectionTitle}>알고링크 정보 (발행자)</Text>
        <View style={styles.infoBlock}>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>상호</Text>
            <Text style={styles.infoValue}>{organization.name}</Text>
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>사업자등록번호</Text>
            <Text style={styles.infoValue}>{organization.businessNumber}</Text>
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>대표자</Text>
            <Text style={styles.infoValue}>{organization.representative}</Text>
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>연락처</Text>
            <Text style={styles.infoValue}>{organization.contact}</Text>
          </View>
          <View style={[styles.infoCell, { width: "100%" }]}>
            <Text style={styles.infoLabel}>주소</Text>
            <Text style={styles.infoValue}>{organization.address}</Text>
          </View>
        </View>

        {/* 4. 거래 정보 */}
        <Text style={styles.sectionTitle}>거래 정보</Text>
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <Text style={styles.cellLabel}>송금일</Text>
            <Text style={styles.cellValue}>{remittanceLabel}</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.cellLabel}>입금 금액</Text>
            <Text style={styles.cellValue}>{formatKRW(amountKrw)} 원</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.cellLabel}>사유</Text>
            <Text style={styles.cellValue}>강의 사업비 정산</Text>
          </View>
        </View>

        {/* 5. 본문 — 정히 영수합니다 */}
        <Text style={styles.declaration}>위 금액을 정히 영수합니다.</Text>

        {/* 6. Footer */}
        <Text style={styles.footer}>
          Algolink AI Agentic Platform · 자동 발행 영수증 · {receiptNumber}
        </Text>
      </Page>
    </Document>
  );
}
