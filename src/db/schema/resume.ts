// @MX:NOTE: SPEC-DB-001 §2.3 REQ-DB001-INSTRUCTOR — 7-sub-domain 이력서.
// 학력, 자격, 현업경력, 강의경력, 프로젝트, 기타활동, 저서.
import { pgTable, uuid, text, date, integer, timestamp, index } from "drizzle-orm/pg-core";
import { instructors } from "./instructor";

// 학력
export const educations = pgTable(
  "educations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    instructorId: uuid("instructor_id")
      .notNull()
      .references(() => instructors.id, { onDelete: "cascade" }),
    school: text("school").notNull(),
    major: text("major"),
    degree: text("degree"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_educations_instructor").on(t.instructorId)],
);

// 자격증
export const certifications = pgTable(
  "certifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    instructorId: uuid("instructor_id")
      .notNull()
      .references(() => instructors.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    issuer: text("issuer"),
    issuedDate: date("issued_date"),
    expiresDate: date("expires_date"),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_certifications_instructor").on(t.instructorId)],
);

// 현업 경력
export const workExperiences = pgTable(
  "work_experiences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    instructorId: uuid("instructor_id")
      .notNull()
      .references(() => instructors.id, { onDelete: "cascade" }),
    company: text("company").notNull(),
    position: text("position"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_work_experiences_instructor").on(t.instructorId)],
);

// 강의 경력
export const teachingExperiences = pgTable(
  "teaching_experiences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    instructorId: uuid("instructor_id")
      .notNull()
      .references(() => instructors.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    organization: text("organization"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_teaching_experiences_instructor").on(t.instructorId)],
);

// 강사가 자가 기재한 프로젝트 이력 — 시스템의 projects 테이블과 별개.
export const instructorProjects = pgTable(
  "instructor_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    instructorId: uuid("instructor_id")
      .notNull()
      .references(() => instructors.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    role: text("role"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_instructor_projects_instructor").on(t.instructorId)],
);

// 기타 활동 (수상, 저널, 컨퍼런스 등)
export const otherActivities = pgTable(
  "other_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    instructorId: uuid("instructor_id")
      .notNull()
      .references(() => instructors.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    category: text("category"),
    activityDate: date("activity_date"),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_other_activities_instructor").on(t.instructorId)],
);

// 저서/출판
export const publications = pgTable(
  "publications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    instructorId: uuid("instructor_id")
      .notNull()
      .references(() => instructors.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    publisher: text("publisher"),
    publishedDate: date("published_date"),
    isbn: text("isbn"),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_publications_instructor").on(t.instructorId)],
);
