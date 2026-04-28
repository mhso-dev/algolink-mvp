// SPEC-ME-001 §2.2 REQ-ME-RESUME-002 / §4.1 — 강사 본인 영역 데이터 액세스 헬퍼.
// @MX:ANCHOR: 강사 self-area의 모든 Server Action이 이 모듈을 통해 instructorId를 얻는다.
// @MX:REASON: instructors row 부재 race를 ensureInstructorRow에서 1회만 처리.

import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getCurrentUser } from "@/auth/server";

export type ResumeSection =
  | "educations"
  | "work_experiences"
  | "teaching_experiences"
  | "certifications"
  | "publications"
  | "instructor_projects"
  | "other_activities";

export const RESUME_SECTIONS: ResumeSection[] = [
  "educations",
  "work_experiences",
  "teaching_experiences",
  "certifications",
  "publications",
  "instructor_projects",
  "other_activities",
];

export interface MeContext {
  userId: string;
  email: string;
  instructorId: string;
}

/**
 * 현재 강사의 instructors row를 보장한다.
 * - user_id로 조회 → 있으면 반환
 * - 없으면 새로 생성 (idempotent)
 *
 * 강사가 아닌 사용자가 호출하면 null 반환.
 */
export async function ensureInstructorRow(): Promise<MeContext | null> {
  const user = await getCurrentUser();
  if (!user || user.role !== "instructor") return null;

  const supabase = createClient(await cookies());

  // 1. user_id로 조회
  const { data: existing } = await supabase
    .from("instructors")
    .select("id, name_kr, email")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .limit(1)
    .returns<{ id: string; name_kr: string | null; email: string | null }[]>();

  if (existing && existing.length > 0) {
    return {
      userId: user.id,
      email: user.email,
      instructorId: existing[0]!.id,
    };
  }

  // 2. email로 매칭 시도 (operator가 미리 강사를 등록 후 invite 수락한 경우)
  if (user.email) {
    const { data: byEmail } = await supabase
      .from("instructors")
      .select("id, user_id")
      .eq("email", user.email)
      .is("deleted_at", null)
      .limit(1)
      .returns<{ id: string; user_id: string | null }[]>();
    if (byEmail && byEmail.length > 0) {
      const row = byEmail[0]!;
      // user_id 미설정이면 채워준다.
      if (!row.user_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from("instructors")
          .update({ user_id: user.id })
          .eq("id", row.id);
      }
      return { userId: user.id, email: user.email, instructorId: row.id };
    }
  }

  // 3. 신규 생성
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: created, error } = await (supabase as any)
    .from("instructors")
    .insert({
      user_id: user.id,
      name_kr: user.email?.split("@")[0] ?? "강사",
      email: user.email ?? null,
    })
    .select("id")
    .single();

  if (error || !created) {
    console.error("[ensureInstructorRow] insert failed", error);
    return null;
  }
  return {
    userId: user.id,
    email: user.email,
    instructorId: (created as { id: string }).id,
  };
}

/** 본인 instructors 기본 정보 조회 */
export async function getMyBasicInfo(instructorId: string) {
  const supabase = createClient(await cookies());
  const { data } = await supabase
    .from("instructors_safe")
    .select("id, name_kr, name_en, email, phone")
    .eq("id", instructorId)
    .limit(1)
    .returns<{ id: string; name_kr: string | null; name_en: string | null; email: string | null; phone: string | null }[]>();
  // instructors_safe 에 없는 컬럼(주소, 한자명, birth_date)은 별도 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extra = await (supabase as any)
    .from("instructors")
    .select("name_hanja, birth_date, address")
    .eq("id", instructorId)
    .limit(1);
  const row = data?.[0] ?? null;
  const ex = (extra.data?.[0] ?? null) as
    | { name_hanja: string | null; birth_date: string | null; address: string | null }
    | null;
  if (!row) return null;
  return {
    nameKr: row.name_kr ?? "",
    nameEn: row.name_en ?? "",
    nameHanja: ex?.name_hanja ?? "",
    birthDate: ex?.birth_date ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    address: ex?.address ?? "",
  };
}

/** 7개 섹션 일괄 read (page render용) */
export async function getMyResumeSections(instructorId: string) {
  const supabase = createClient(await cookies());
  const fetchOne = async (table: ResumeSection) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from(table)
      .select("*")
      .eq("instructor_id", instructorId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    return (data ?? []) as Array<Record<string, unknown>>;
  };
  const [educations, workExperiences, teachingExperiences, certifications, publications, instructorProjects, otherActivities] =
    await Promise.all([
      fetchOne("educations"),
      fetchOne("work_experiences"),
      fetchOne("teaching_experiences"),
      fetchOne("certifications"),
      fetchOne("publications"),
      fetchOne("instructor_projects"),
      fetchOne("other_activities"),
    ]);
  return {
    educations,
    workExperiences,
    teachingExperiences,
    certifications,
    publications,
    instructorProjects,
    otherActivities,
  };
}

/** 본인 schedule_items 일괄 조회 (캘린더 표시용) */
export async function getMySchedules(instructorId: string) {
  const supabase = createClient(await cookies());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("schedule_items")
    .select("id, schedule_kind, title, starts_at, ends_at, notes")
    .eq("instructor_id", instructorId)
    .order("starts_at", { ascending: true });
  return (data ?? []) as Array<{
    id: string;
    schedule_kind: "system_lecture" | "personal" | "unavailable";
    title: string | null;
    starts_at: string;
    ends_at: string;
    notes: string | null;
  }>;
}

/** 본인 row 권한 검증 — instructorId가 self가 아니면 false */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function assertOwnership(
  supabase: any,
  table: ResumeSection,
  rowId: string,
  myInstructorId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from(table)
    .select("instructor_id")
    .eq("id", rowId)
    .limit(1);
  const row = data?.[0] as { instructor_id: string } | undefined;
  return !!row && row.instructor_id === myInstructorId;
}
