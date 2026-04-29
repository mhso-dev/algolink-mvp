-- SPEC-PROPOSAL-001 §M1 / REQ-PROPOSAL-SIGNAL-001/002 — instructor_inquiry_history 시그널 view.
-- non-materialized (query-time aggregation).
-- RLS pass-through: underlying proposal_inquiries 테이블의 RLS 정책이 적용됨.

CREATE OR REPLACE VIEW instructor_inquiry_history AS
SELECT
  i.id AS instructor_id,
  COUNT(*) FILTER (
    WHERE pi.status = 'accepted'
      AND pi.responded_at > now() - interval '90 days'
  )::bigint AS prior_accepted_count_90d,
  COUNT(*) FILTER (
    WHERE pi.status = 'declined'
      AND pi.responded_at > now() - interval '90 days'
  )::bigint AS prior_declined_count_90d,
  COUNT(*) FILTER (
    WHERE pi.status = 'pending'
  )::bigint AS prior_pending_count,
  MAX(pi.responded_at) AS last_responded_at
FROM instructors i
LEFT JOIN proposal_inquiries pi ON pi.instructor_id = i.id
GROUP BY i.id;

COMMENT ON VIEW instructor_inquiry_history IS
  'SPEC-PROPOSAL-001 §M1 — 강사별 사전 문의 응답 시그널 (90일 윈도우). SPEC-RECOMMEND-001 가중치 변경 0건 (read-only signal infrastructure).';
