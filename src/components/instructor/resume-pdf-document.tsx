// SPEC-ME-001 §2.2 REQ-ME-RESUME-PDF — 이력서 PDF 컴포넌트.
// @MX:NOTE: server-only.
import "server-only";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import path from "node:path";
import {
  type ResumePdfPayload,
  type ResumePdfRow,
  type ResumePdfSections,
  maskBasicForPdf,
} from "@/lib/instructor/resume-pdf-data";

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
    console.error("[resume-pdf] font register failed", err);
  }
}

const styles = StyleSheet.create({
  page: { fontFamily: "NotoSansKR", fontSize: 10, paddingTop: 36, paddingBottom: 36, paddingHorizontal: 40, lineHeight: 1.4, color: "#111111" },
  header: { marginBottom: 16, borderBottomWidth: 1, borderBottomColor: "#222222", paddingBottom: 8 },
  headerName: { fontSize: 22, fontWeight: 700 },
  headerSub: { fontSize: 10, color: "#444444", marginTop: 4 },
  basicGrid: { marginTop: 6, flexDirection: "row", flexWrap: "wrap" },
  basicCell: { width: "50%", marginTop: 2, fontSize: 10 },
  basicLabel: { color: "#555555" },
  sectionTitle: { fontSize: 13, fontWeight: 700, marginTop: 14, marginBottom: 6, paddingBottom: 2, borderBottomWidth: 0.7, borderBottomColor: "#888888" },
  row: { marginBottom: 6 },
  rowTitle: { fontSize: 11, fontWeight: 700 },
  rowSub: { fontSize: 10, color: "#333333" },
  rowPeriod: { fontSize: 9, color: "#666666", marginTop: 1 },
  rowDesc: { fontSize: 10, color: "#222222", marginTop: 2 },
  // NotoSansKR italic 변형이 미설치 — fontStyle italic 사용 시 react-pdf 가
  // "Could not resolve font" 로 throw. 색상으로만 강조하고 italic 은 제거.
  empty: { fontSize: 10, color: "#888888" },
  footer: { position: "absolute", bottom: 16, left: 0, right: 0, textAlign: "center", fontSize: 8, color: "#888888" },
  maskBadge: { marginTop: 4, fontSize: 9, color: "#a14b00" },
});

function SectionBlock({ title, rows }: { title: string; rows: ResumePdfRow[] }) {
  return (
    <View wrap>
      <Text style={styles.sectionTitle}>{title}</Text>
      {rows.length === 0 ? (
        <Text style={styles.empty}>등록된 항목이 없습니다.</Text>
      ) : (
        rows.map((r, idx) => (
          <View key={`${title}-${idx}`} style={styles.row} wrap={false}>
            {r.title ? <Text style={styles.rowTitle}>{r.title}</Text> : null}
            {r.subtitle ? <Text style={styles.rowSub}>{r.subtitle}</Text> : null}
            {r.period ? <Text style={styles.rowPeriod}>{r.period}</Text> : null}
            {r.description ? <Text style={styles.rowDesc}>{r.description}</Text> : null}
          </View>
        ))
      )}
    </View>
  );
}

const SECTION_LABELS: Array<{ key: keyof ResumePdfSections; label: string }> = [
  { key: "educations", label: "학력" },
  { key: "workExperiences", label: "경력" },
  { key: "teachingExperiences", label: "강의 이력" },
  { key: "certifications", label: "자격" },
  { key: "publications", label: "저서" },
  { key: "instructorProjects", label: "프로젝트" },
  { key: "otherActivities", label: "기타 활동" },
];

export function ResumePdfDocument(props: { payload: ResumePdfPayload }) {
  ensureFontRegistered();
  const { payload } = props;
  const basic = maskBasicForPdf(payload.basic, payload.maskPii);
  const sections = payload.sections;
  return (
    <Document title={`이력서_${payload.basic.nameKr || "강사"}`} author={payload.basic.nameKr || "강사"} creator="Algolink" producer="Algolink">
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header}>
          <Text style={styles.headerName}>{basic.nameKr || "(이름 미입력)"}</Text>
          {basic.nameEn || basic.nameHanja ? (
            <Text style={styles.headerSub}>{[basic.nameEn, basic.nameHanja].filter(Boolean).join(" / ")}</Text>
          ) : null}
          <View style={styles.basicGrid}>
            {basic.email ? (<Text style={styles.basicCell}><Text style={styles.basicLabel}>이메일: </Text>{basic.email}</Text>) : null}
            {basic.phone ? (<Text style={styles.basicCell}><Text style={styles.basicLabel}>연락처: </Text>{basic.phone}</Text>) : null}
            {basic.birthDate ? (<Text style={styles.basicCell}><Text style={styles.basicLabel}>생년월일: </Text>{basic.birthDate}</Text>) : null}
            {basic.address ? (<Text style={styles.basicCell}><Text style={styles.basicLabel}>주소: </Text>{basic.address}</Text>) : null}
          </View>
          {payload.maskPii ? (<Text style={styles.maskBadge}>※ 개인정보 마스킹 모드로 출력된 문서입니다.</Text>) : null}
        </View>
        {SECTION_LABELS.map(({ key, label }) => (<SectionBlock key={key} title={label} rows={sections[key]} />))}
        <Text style={styles.footer} render={({ pageNumber, totalPages }) => `Algolink · 마지막 업데이트 ${payload.generatedAt} · ${pageNumber}/${totalPages}`} fixed />
      </Page>
    </Document>
  );
}
