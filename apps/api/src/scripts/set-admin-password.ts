import { hash } from 'bcrypt';
import { createConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';

type AdminRow = RowDataPacket & { user_id: number };

async function main() {
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? '';
  const email = (process.env.ADMIN_BOOTSTRAP_EMAIL ?? 'admin@bravoforest.local').trim();

  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('Set ADMIN_BOOTSTRAP_PASSWORD to a unique password of 12–72 UTF-8 bytes. The value is never printed.');
  }

  const { DB_HOST, DB_USER, DB_NAME } = process.env;
  if (!DB_HOST || !DB_USER || !DB_NAME) {
    throw new Error('DB_HOST, DB_USER, and DB_NAME must be set in apps/api/.env.');
  }

  const connection = await createConnection({
    host: DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: DB_USER,
    password: process.env.DB_PASSWORD ?? '',
    database: DB_NAME,
    charset: 'utf8mb4',
  });

  try {
    const [admins] = await connection.execute<AdminRow[]>(
      `SELECT u.user_id
       FROM users u
       INNER JOIN roles r ON r.role_id = u.role_id
       WHERE LOWER(u.email) = LOWER(?)
         AND r.role_name = 'ADMIN'
         AND u.status = 'ACTIVE'
         AND u.deleted_at IS NULL`,
      [email],
    );

    if (admins.length !== 1) {
      throw new Error('Expected exactly one active admin account matching ADMIN_BOOTSTRAP_EMAIL.');
    }

    const passwordHash = await hash(password, 12);
    const [result] = await connection.execute<ResultSetHeader>(
      'UPDATE users SET password_hash = ? WHERE user_id = ?',
      [passwordHash, admins[0].user_id],
    );

    if (result.affectedRows !== 1) {
      throw new Error('Admin password was not updated.');
    }

    console.info(`Updated password for admin account ${email}.`);
  } finally {
    await connection.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Admin password update failed.');
  process.exitCode = 1;
});
