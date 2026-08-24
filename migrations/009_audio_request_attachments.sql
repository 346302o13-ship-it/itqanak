-- Audio attachment support for request conversations. File bytes remain private
-- and pass through the same validation, object storage, and malware-scan flow.
-- This migration is forward-only. Do not edit after it is applied.

ALTER TABLE service_request_attachments
  DROP CONSTRAINT service_request_attachments_normalized_extension_check;

ALTER TABLE service_request_attachments
  ADD CONSTRAINT service_request_attachments_normalized_extension_check
    CHECK (
      normalized_extension IN (
        '.pdf', '.docx', '.pptx', '.xlsx', '.txt', '.png', '.jpg', '.jpeg',
        '.webm', '.ogg', '.mp3', '.wav'
      )
    );
