-- SPEC-PROPOSAL-001 §M1 / REQ-PROPOSAL-ENTITY-008 / REQ-PROPOSAL-RLS-004
-- Storage 버킷 'proposal-attachments' + RLS 정책 + file_kind enum value.
-- @MX:WARN: Storage object와 files 메타 row 일관성은 file-upload.ts에서 보장 (SPEC-CLIENT-001 패턴).
-- @MX:REASON: Storage upload 성공 + DB INSERT 실패 시 deleteOrphanFile 보상 로직 필요.

-- =============================================================================
-- file_kind enum에 'proposal_attachment' 추가 (idempotent)
-- =============================================================================
DO $$
BEGIN
  -- file_kind enum이 존재하고 'proposal_attachment' 값이 없는 경우만 추가
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'file_kind') THEN
    -- ALTER TYPE ... ADD VALUE는 idempotent IF NOT EXISTS 지원
    ALTER TYPE file_kind ADD VALUE IF NOT EXISTS 'proposal_attachment';
  END IF;
END $$;

-- =============================================================================
-- Storage bucket 'proposal-attachments' (idempotent INSERT)
-- =============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'proposal-attachments',
  'proposal-attachments',
  false,
  5242880, -- 5MB
  ARRAY['application/pdf', 'image/png', 'image/jpeg']
)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- Storage RLS — operator/admin RW, instructor/anonymous deny
-- =============================================================================
DROP POLICY IF EXISTS "proposal_attachments_operator_admin_select" ON storage.objects;
CREATE POLICY "proposal_attachments_operator_admin_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'proposal-attachments'
    AND app.is_operator_or_admin()
  );

DROP POLICY IF EXISTS "proposal_attachments_operator_admin_insert" ON storage.objects;
CREATE POLICY "proposal_attachments_operator_admin_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'proposal-attachments'
    AND app.is_operator_or_admin()
  );

DROP POLICY IF EXISTS "proposal_attachments_operator_admin_update" ON storage.objects;
CREATE POLICY "proposal_attachments_operator_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'proposal-attachments'
    AND app.is_operator_or_admin()
  )
  WITH CHECK (
    bucket_id = 'proposal-attachments'
    AND app.is_operator_or_admin()
  );

DROP POLICY IF EXISTS "proposal_attachments_operator_admin_delete" ON storage.objects;
CREATE POLICY "proposal_attachments_operator_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'proposal-attachments'
    AND app.is_operator_or_admin()
  );
