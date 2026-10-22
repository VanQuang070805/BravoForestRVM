-- Apply once to an existing BravoForest database before deploying this API/controller.
-- Existing idempotency data is copied out of sensor_data before adding the unique key.

ALTER TABLE recycling_sessions
  ADD COLUMN finish_requested_at DATETIME NULL AFTER linked_at;

ALTER TABLE deposit_items
  ADD COLUMN idempotency_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER session_id,
  ADD COLUMN request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER idempotency_key;

UPDATE deposit_items
SET idempotency_key = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(sensor_data, '$.requestKey')), ''),
    request_hash = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(sensor_data, '$.requestHash')), '')
WHERE sensor_data IS NOT NULL
  AND JSON_VALID(sensor_data)
  AND JSON_EXTRACT(sensor_data, '$.requestKey') IS NOT NULL;

ALTER TABLE deposit_items
  ADD UNIQUE KEY uq_di_session_request (session_id, idempotency_key);
