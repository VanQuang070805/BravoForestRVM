-- Apply after 20261021_harden_rvm_session_finalization.sql.
-- An activity lease lets the Pi stop accepting items if the kiosk browser exits.
ALTER TABLE recycling_sessions
  ADD COLUMN last_activity_at DATETIME NULL AFTER linked_at;

UPDATE recycling_sessions
SET last_activity_at=CASE
  WHEN status='COMPLETED' THEN COALESCE(completed_at,linked_at,started_at)
  ELSE COALESCE(linked_at,started_at)
END;

ALTER TABLE recycling_sessions
  MODIFY COLUMN last_activity_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

INSERT INTO reject_reasons(code,description)
VALUES ('SENSOR_REJECTED','Cảm biến không xác nhận vật phẩm hợp lệ')
ON DUPLICATE KEY UPDATE description=VALUES(description);
