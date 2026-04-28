// SPEC-ME-001 §2.2 REQ-ME-RESUME-PDF — 이력서 PDF 다운로드 Route Handler.
// GET /me/resume/export?mask=true|false  →  application/pdf 스트림.
// @MX:ANCHOR: 강사 본인만 호출 가능. SPEC-AUTH-001 의 requireUser + role guard.
// @MX:REASON: 개인정보가 포함된 PDF — 타인 다운로드 차단 필수.
// @MX:SPEC: SPEC-ME-001 §2.2 REQ-ME-RESUME-PDF-001/002

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  ensureInstructorRow,
  getMyBasicInfo,
  getMyResumeSections,
} from "@/lib/instructor/me-queries";
import {
  buildResumePdfSections,
  buildResumeFilename,
  type ResumePdfPayload,
} from "@/lib/instructor/resume-pdf-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function buildContentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]+/g, "_");
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function GET(req: Request) {
  const session = await requireUser();
  if (session.role !== "instructor") {
    return badRequest("강사 본인만 이력서를 다운로드할 수 있습니다.", 403);
  }
  const ctx = await ensureInstructorRow();
  if (!ctx) {
    return badRequest("강사 프로필을 찾을 수 없습니다.", 404);
  }
  const url = new URL(req.url);
  const maskParam = url.searchParams.get("mask");
  const maskPii = maskParam === null ? true : maskParam !== "false";
  const [basicInfo, sections] = await Promise.all([
    getMyBasicInfo(ctx.instructorId),
    getMyResumeSections(ctx.instructorId),
  ]);
  if (!basicInfo) {
    return badRequest("기본 정보가 없습니다. 이력서 페이지에서 먼저 입력해주세요.", 404);
  }
  const payload: ResumePdfPayload = {
    basic: {
      nameKr: basicInfo.nameKr,
      nameEn: basicInfo.nameEn,
      nameHanja: basicInfo.nameHanja,
      birthDate: basicInfo.birthDate,
      email: basicInfo.email,
      phone: basicInfo.phone,
      address: basicInfo.address,
    },
    sections: buildResumePdfSections({
      educations: sections.educations,
      workExperiences: sections.workExperiences,
      teachingExperiences: sections.teachingExperiences,
      certifications: sections.certifications,
      publications: sections.publications,
      instructorProjects: sections.instructorProjects,
      otherActivities: sections.otherActivities,
    }),
    generatedAt: new Date().toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      hour12: false,
    }),
    maskPii,
  };
  let pdfBuffer: Buffer;
  try {
    const { renderToBuffer } = await import("@react-pdf/renderer");
    const { ResumePdfDocument } = await import(
      "@/components/instructor/resume-pdf-document"
    );
    pdfBuffer = await renderToBuffer(<ResumePdfDocument payload={payload} />);
  } catch (err) {
    console.error("[resume export] PDF 생성 실패", err);
    return badRequest("PDF 생성 중 오류가 발생했습니다.", 500);
  }
  const filename = buildResumeFilename(basicInfo.nameKr || "강사");
  const body = new Uint8Array(pdfBuffer);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": buildContentDisposition(filename),
      "Cache-Control": "no-store",
      "X-Resume-Mask": maskPii ? "1" : "0",
    },
  });
}
