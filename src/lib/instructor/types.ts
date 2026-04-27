// SPEC-INSTRUCTOR-001 §2.1/§2.2/§2.4 — 강사 도메인 타입.
// PII 컬럼은 본 타입 어디에도 노출되지 않음 (instructors_safe view 기반).

export type InstructorListRow = {
  id: string;
  nameKr: string;
  topSkills: string[]; // 최대 3
  totalSkillCount: number; // 전체 카테고리 수 (배지 +N more)
  lectureCount: number;
  settlementTotalKrw: number;
  avgScore: number | null; // 0 reviews면 null
  reviewCount: number;
  lastLectureDate: Date | null;
};

export type InstructorListSort =
  | "name_kr"
  | "lecture_count"
  | "avg_score"
  | "last_lecture_date";

export type InstructorListFilter = {
  name?: string;
  skillIds?: string[];
  scoreMin?: number; // 0.0 ~ 5.0 (0 = 미평가 포함)
  scoreMax?: number;
  sort?: InstructorListSort;
  dir?: "asc" | "desc";
  page: number; // 1-indexed
  pageSize: number; // default 20
};

export type InstructorHistoryRow = {
  projectId: string;
  projectTitle: string;
  startDate: Date | null;
  endDate: Date | null;
  score: number | null;
  comment: string | null;
};

export type InstructorDetail = {
  id: string;
  nameKr: string;
  nameEn: string | null;
  email: string | null;
  phone: string | null;
  skills: { id: string; name: string }[];
  createdAt: Date;
  userId: string | null;
  history: InstructorHistoryRow[];
};

export type ReviewComment = {
  score: number;
  comment: string;
  projectTitle: string;
  endDate: Date | null;
};

export type SummaryResult =
  | {
      kind: "ai";
      summary: string;
      model: string;
      generatedAt: Date;
      cached: boolean;
    }
  | {
      kind: "fallback";
      avgScore: number | null;
      reviewCount: number;
      recentComments: ReviewComment[];
      reason: "api_error" | "timeout" | "quota";
    }
  | { kind: "empty"; reviewCount: number };
