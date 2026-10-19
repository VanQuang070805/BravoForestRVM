-- Apply once to databases created before credential_version was added to BravoForest.sql.
ALTER TABLE users
    ADD COLUMN credential_version INT UNSIGNED NOT NULL DEFAULT 0 AFTER password_hash;

-- Revoke access/refresh tokens issued before this field existed.
UPDATE users
SET credential_version = credential_version + 1;
