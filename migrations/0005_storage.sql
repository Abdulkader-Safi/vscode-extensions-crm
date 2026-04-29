-- Provision the `crm-files` bucket used for avatar / logo uploads.
-- One bucket, user-scoped folders: paths like `<user_id>/avatar.png`.
-- RLS: the first folder segment must equal the caller's auth.uid().
INSERT INTO storage.buckets (id, name, public)
VALUES ('crm-files', 'crm-files', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "crm-files: owner select" ON storage.objects;
DROP POLICY IF EXISTS "crm-files: owner insert" ON storage.objects;
DROP POLICY IF EXISTS "crm-files: owner update" ON storage.objects;
DROP POLICY IF EXISTS "crm-files: owner delete" ON storage.objects;

CREATE POLICY "crm-files: owner select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'crm-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "crm-files: owner insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'crm-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "crm-files: owner update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'crm-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "crm-files: owner delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'crm-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
