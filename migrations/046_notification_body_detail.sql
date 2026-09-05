-- Put real detail in the notification body — the message text (or a media
-- label) for a support message, the request number + current status for a
-- request update — instead of the generic "you have a new message" /
-- "request was updated". A BEFORE INSERT trigger on user_notifications so the
-- two large projection functions in migration 019 stay untouched; it only
-- overwrites body_ar/body_en (and the title for a support message). This
-- migration is forward-only.

CREATE FUNCTION enrich_user_notification_body()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  msg RECORD;
  req RECORD;
  preview TEXT;
  label_ar TEXT;
  label_en TEXT;
BEGIN
  IF NEW.kind = 'MESSAGE_RECEIVED' AND NEW.message_id IS NOT NULL THEN
    SELECT content_type, body, sender_type INTO msg
    FROM support_messages WHERE id = NEW.message_id;
    IF FOUND THEN
      IF msg.content_type = 'TEXT' THEN
        preview := btrim(regexp_replace(coalesce(msg.body, ''), '\s+', ' ', 'g'));
        IF char_length(preview) > 220 THEN
          preview := left(preview, 219) || '…';
        END IF;
      ELSIF msg.content_type = 'IMAGE' THEN
        preview := '📷 صورة';
      ELSIF msg.content_type = 'AUDIO' THEN
        preview := '🎤 رسالة صوتية';
      ELSE
        preview := '📎 ' || left(btrim(coalesce(msg.body, 'ملف')), 200);
      END IF;

      IF preview IS NOT NULL AND char_length(preview) >= 1 THEN
        NEW.body_ar := preview;
        NEW.body_en := preview;
      END IF;

      IF msg.sender_type = 'ADMIN' THEN
        NEW.title_ar := 'رسالة من الإدارة';
        NEW.title_en := 'Message from the team';
      ELSIF msg.sender_type = 'STUDENT' THEN
        NEW.title_ar := 'رسالة من الطالب';
        NEW.title_en := 'Message from a student';
      END IF;
    END IF;

  ELSIF NEW.kind IN ('REQUEST_STATUS_UPDATED', 'REQUEST_UPDATED')
        AND NEW.request_id IS NOT NULL THEN
    SELECT request_number, status INTO req FROM service_requests WHERE id = NEW.request_id;
    IF FOUND THEN
      label_ar := CASE req.status
        WHEN 'DRAFT' THEN 'مسودة'
        WHEN 'SUBMITTED' THEN 'تم الإرسال'
        WHEN 'UNDER_REVIEW' THEN 'قيد المراجعة'
        WHEN 'WAITING_FOR_STUDENT' THEN 'بانتظار ردك'
        WHEN 'QUOTED' THEN 'تم التسعير'
        WHEN 'ACCEPTED' THEN 'مقبول'
        WHEN 'IN_PROGRESS' THEN 'قيد التنفيذ'
        WHEN 'DELIVERED' THEN 'تم التسليم'
        WHEN 'REVISION_REQUESTED' THEN 'طلب تعديل'
        WHEN 'COMPLETED' THEN 'مكتمل'
        WHEN 'CANCELLED' THEN 'ملغى'
        WHEN 'REJECTED' THEN 'مرفوض'
        ELSE req.status
      END;
      label_en := CASE req.status
        WHEN 'DRAFT' THEN 'Draft'
        WHEN 'SUBMITTED' THEN 'Submitted'
        WHEN 'UNDER_REVIEW' THEN 'Under review'
        WHEN 'WAITING_FOR_STUDENT' THEN 'Waiting for you'
        WHEN 'QUOTED' THEN 'Quoted'
        WHEN 'ACCEPTED' THEN 'Accepted'
        WHEN 'IN_PROGRESS' THEN 'In progress'
        WHEN 'DELIVERED' THEN 'Delivered'
        WHEN 'REVISION_REQUESTED' THEN 'Revision requested'
        WHEN 'COMPLETED' THEN 'Completed'
        WHEN 'CANCELLED' THEN 'Cancelled'
        WHEN 'REJECTED' THEN 'Rejected'
        ELSE req.status
      END;
      NEW.body_ar := 'الطلب ' || req.request_number || ' — الحالة: ' || label_ar;
      NEW.body_en := 'Request ' || req.request_number || ' — status: ' || label_en;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER user_notifications_enrich_body
BEFORE INSERT ON user_notifications
FOR EACH ROW EXECUTE FUNCTION enrich_user_notification_body();
