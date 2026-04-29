-- SPEC-RECEIPT-001 M1 — payout-receipts Storage 버킷 + RLS 정책
-- @MX:ANCHOR: REQ-RECEIPT-RLS-001/002/003.
-- @MX:REASON: 영수증 PDF 저장소 + 강사 self-read / operator/admin 전체 접근 / default deny 3-tier RLS.

-- 버킷 생성 (private, 50MB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('payout-receipts', 'payout-receipts', false, 52428800)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit;

-- payout-evidence 버킷 (강사 송금 영수증 첨부) — 별도 버킷 분리
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('payout-evidence', 'payout-evidence', false, 10485760)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit;

-- ============================================
-- payout-receipts RLS 정책
-- ============================================

-- 강사 self SELECT — files.storage_path = storage.objects.name (bucket-relative 1:1 매칭)
DROP POLICY IF EXISTS payout_receipts_self_select ON storage.objects;
CREATE POLICY payout_receipts_self_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'payout-receipts'
  AND app.current_user_role() = 'instructor'
  AND auth.uid() = (
    SELECT i.user_id
    FROM instructors i
    JOIN settlements s ON s.instructor_id = i.id
    WHERE s.receipt_file_id = (
      SELECT id FROM files WHERE storage_path = storage.objects.name
      ORDER BY uploaded_at DESC LIMIT 1
    )
    LIMIT 1
  )
);

-- operator/admin 전체 RW
DROP POLICY IF EXISTS payout_receipts_operator_all ON storage.objects;
CREATE POLICY payout_receipts_operator_all ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'payout-receipts' AND app.current_user_role() IN ('operator', 'admin'))
WITH CHECK (bucket_id = 'payout-receipts' AND app.current_user_role() IN ('operator', 'admin'));

-- service_role 전체 (Server Action 영수증 발급 시 storage upload용)
DROP POLICY IF EXISTS payout_receipts_service_all ON storage.objects;
CREATE POLICY payout_receipts_service_all ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'payout-receipts')
WITH CHECK (bucket_id = 'payout-receipts');

-- ============================================
-- payout-evidence RLS 정책 (강사 송금 영수증 첨부)
-- ============================================

DROP POLICY IF EXISTS payout_evidence_self_select ON storage.objects;
CREATE POLICY payout_evidence_self_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'payout-evidence'
  AND app.current_user_role() = 'instructor'
  AND auth.uid() = (
    SELECT f.owner_id FROM files f
    WHERE f.storage_path = storage.objects.name
    ORDER BY f.uploaded_at DESC LIMIT 1
  )
);

DROP POLICY IF EXISTS payout_evidence_self_insert ON storage.objects;
CREATE POLICY payout_evidence_self_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'payout-evidence'
  AND app.current_user_role() = 'instructor'
);

DROP POLICY IF EXISTS payout_evidence_operator_all ON storage.objects;
CREATE POLICY payout_evidence_operator_all ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'payout-evidence' AND app.current_user_role() IN ('operator', 'admin'))
WITH CHECK (bucket_id = 'payout-evidence' AND app.current_user_role() IN ('operator', 'admin'));
