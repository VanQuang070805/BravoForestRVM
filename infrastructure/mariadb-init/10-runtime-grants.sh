#!/bin/sh
set -eu

: "${MARIADB_ROOT_PASSWORD:?MARIADB_ROOT_PASSWORD is required}"
: "${MARIADB_DATABASE:?MARIADB_DATABASE is required}"
: "${MARIADB_USER:?MARIADB_USER is required}"

case "$MARIADB_DATABASE$MARIADB_USER" in
  *[!A-Za-z0-9_]*)
    echo 'MARIADB_DATABASE and MARIADB_USER may contain only letters, numbers, and underscores.' >&2
    exit 1
    ;;
esac

# The official image creates MARIADB_USER with broad privileges on the database.
# Runtime code only needs data reads/writes; schema changes use a separate DBA step.
MYSQL_PWD="$MARIADB_ROOT_PASSWORD" mariadb --protocol=socket --user=root <<SQL
REVOKE ALL PRIVILEGES, GRANT OPTION FROM '${MARIADB_USER}'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON \`${MARIADB_DATABASE}\`.* TO '${MARIADB_USER}'@'%';
FLUSH PRIVILEGES;
SQL
