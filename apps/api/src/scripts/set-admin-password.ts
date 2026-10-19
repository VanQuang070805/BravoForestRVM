import { hash } from 'bcrypt';
import { createConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';

type AccountRow = RowDataPacket & {
  user_id: number;
  role_id: number;
  status: string;
  deleted_at: Date | null;
};

async function main() {
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? '';
  const email = (process.env.ADMIN_BOOTSTRAP_EMAIL ?? 'admin@bravoforest.local').trim();
  const fullName = (process.env.ADMIN_BOOTSTRAP_NAME ?? 'Quản trị viên').trim();

  if (Array.from(password).length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('Set ADMIN_BOOTSTRAP_PASSWORD to a unique password of 12–72 UTF-8 bytes. The value is never printed.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (process.env.NODE_ENV === 'production' && email.toLowerCase().endsWith('.local'))) {
    throw new Error('Set ADMIN_BOOTSTRAP_EMAIL to a valid, deliverable email address.');
  }
  if (!fullName || fullName.length > 100) {
    throw new Error('ADMIN_BOOTSTRAP_NAME must contain 1–100 characters.');
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

  let transactionStarted = false;
  try {
    const passwordHash = await hash(password, 12);
    await connection.beginTransaction();
    transactionStarted = true;
    const [roles] = await connection.execute<RowDataPacket[]>(
      "SELECT role_id FROM roles WHERE role_name='ADMIN' LIMIT 1",
    );
    if (!roles.length) throw new Error('Required ADMIN role is missing from the database seed.');
    const roleId = Number(roles[0].role_id);

    const [accounts] = await connection.execute<AccountRow[]>(
      `SELECT user_id, role_id, status, deleted_at
       FROM users WHERE LOWER(email)=LOWER(?) LIMIT 2 FOR UPDATE`,
      [email],
    );
    if (accounts.length > 1) throw new Error('More than one account matches ADMIN_BOOTSTRAP_EMAIL.');

    if (accounts.length) {
      const account = accounts[0];
      if (Number(account.role_id) !== roleId) throw new Error('ADMIN_BOOTSTRAP_EMAIL belongs to a non-admin account.');
      if (account.status === 'DELETED' || account.deleted_at) {
        throw new Error('The matching admin account is deleted; choose a different bootstrap email.');
      }
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE users SET full_name=?, password_hash=?, status='ACTIVE',
           email_verified_at=COALESCE(email_verified_at,NOW()), credential_version=credential_version+1
         WHERE user_id=? AND deleted_at IS NULL`,
        [fullName, passwordHash, account.user_id],
      );
      if (result.affectedRows !== 1) throw new Error('Admin password was not updated.');
    } else {
      await connection.execute<ResultSetHeader>(
        `INSERT INTO users(role_id,full_name,email,password_hash,status,email_verified_at)
         VALUES(?,?,?,?,'ACTIVE',NOW())`,
        [roleId, fullName, email, passwordHash],
      );
    }

    await connection.commit();
    transactionStarted = false;
    console.info(`Admin account is ready: ${email}.`);
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Admin password update failed.');
  process.exitCode = 1;
});
