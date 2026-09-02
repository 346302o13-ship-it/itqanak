-- Make `delete_after` a free-standing "scheduled purge time" so an administrator
-- can extend (or bring forward) the retention of any conversation file from the
-- storage dashboard, not only files that have already been downloaded.
--
--   delete_after IS NULL  -> no explicit schedule; an undownloaded file follows
--                            the age rule, a downloaded file always has one set.
--   delete_after set      -> the object is purged once that time passes.
--
-- The only remaining download invariant is that the counter and the timestamp
-- move together.

ALTER TABLE unified_conversation_attachments
  DROP CONSTRAINT unified_conversation_attachments_download_consistency_check;

ALTER TABLE unified_conversation_attachments
  ADD CONSTRAINT unified_conversation_attachments_download_consistency_check
  CHECK ((download_count = 0) = (last_downloaded_at IS NULL));
