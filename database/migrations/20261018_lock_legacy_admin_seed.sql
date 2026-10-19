-- Apply after 20261018_add_user_credential_version.sql.
-- Disable only the legacy seeded credential; admins who changed the default password are untouched.
UPDATE users
SET status = 'LOCKED',
    credential_version = credential_version + 1
WHERE LOWER(email) = 'admin@bravoforest.local'
  AND BINARY password_hash = BINARY '$2b$12$ubVNySwL1gc2ortT1TN1tO3Etif6GesfRhp3aV.z8B0IkRVkkOqxy'
  AND status = 'ACTIVE'
  AND deleted_at IS NULL;
