-- SPEC-DB-001 §2.7 REQ-DB001-SCHEDULE-CONFLICT — schedule_items 일정 충돌 EXCLUSION.
-- system_lecture 또는 unavailable인 항목만 검사 대상 (personal은 자유).
-- WHERE 절로 부분 EXCLUSION을 표현 (Postgres 9.0+).
ALTER TABLE schedule_items
  ADD CONSTRAINT schedule_items_no_overlap
  EXCLUDE USING gist (
    instructor_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (schedule_kind IN ('system_lecture', 'unavailable'));

-- system_lecture 일정은 project_id NOT NULL 강제 (REQ-DB001-SCHEDULE-LECTURE-LINK).
ALTER TABLE schedule_items
  ADD CONSTRAINT schedule_items_lecture_requires_project
  CHECK (
    schedule_kind <> 'system_lecture'
    OR project_id IS NOT NULL
  );

-- 일정 시작/종료 시간 무결성.
ALTER TABLE schedule_items
  ADD CONSTRAINT schedule_items_time_order
  CHECK (ends_at > starts_at);
