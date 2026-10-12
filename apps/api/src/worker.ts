import 'dotenv/config';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { AppDataSource } from './database/data-source';
import { SecretBox } from './common/security';

const logger = new Logger('BravoForestWorker');

async function failRedemption(redemptionId: string, reason: string) {
  await AppDataSource.transaction(async (manager) => {
    const [redemption] = await manager.query(
      `SELECT r.redemption_id,r.status,r.code_id,w.wallet_id
       FROM redemptions r JOIN wallets w ON w.wallet_id=r.wallet_id
       WHERE r.redemption_id=? FOR UPDATE`,
      [redemptionId],
    );
    if (!redemption || redemption.status !== 'PENDING') return;

    await manager.query("UPDATE redemptions SET status='FAILED',failure_reason=? WHERE redemption_id=?", [reason.slice(0, 255), redemptionId]);
    if (redemption.code_id) {
      await manager.query("UPDATE voucher_codes SET status='AVAILABLE' WHERE code_id=? AND status='RESERVED'", [redemption.code_id]);
    }
    const [debit] = await manager.query(
      "SELECT -points points FROM wallet_transactions WHERE redemption_id=? AND txn_type='REDEEM'",
      [redemptionId],
    );
    if (debit && Number(debit.points) > 0) {
      await manager.query(
        `INSERT INTO wallet_transactions(wallet_id,txn_type,points,redemption_id,note)
         VALUES(?,'REFUND',?,?,?)`,
        [redemption.wallet_id, Number(debit.points), redemptionId, reason.slice(0, 255)],
      );
    }
  });
}

async function fulfillRedemption(redemptionId: string) {
  const [redemption] = await AppDataSource.query(
    `SELECT r.*,v.fulfillment_type,v.partner_id,p.api_base_url,p.credential_ref,
            upl.external_account_id
     FROM redemptions r JOIN vouchers v ON v.voucher_id=r.voucher_id
     JOIN partners p ON p.partner_id=v.partner_id
     LEFT JOIN user_partner_links upl ON upl.link_id=r.link_id
     WHERE r.redemption_id=?`,
    [redemptionId],
  );
  if (!redemption || redemption.status !== 'PENDING') return;

  if (redemption.fulfillment_type === 'CODE_POOL') {
    await AppDataSource.transaction(async (manager) => {
      const [current] = await manager.query('SELECT status,code_id FROM redemptions WHERE redemption_id=? FOR UPDATE', [redemptionId]);
      if (!current || current.status !== 'PENDING') return;
      if (!current.code_id) throw new Error('Reserved voucher code is missing');
      const code = await manager.query("UPDATE voucher_codes SET status='ISSUED' WHERE code_id=? AND status='RESERVED'", [current.code_id]);
      if (!code.affectedRows) throw new Error('Reserved voucher code is no longer available');
      await manager.query(
        "UPDATE redemptions SET status='ISSUED',issued_at=NOW() WHERE redemption_id=? AND status='PENDING'",
        [redemptionId],
      );
    });
    return;
  }

  const requestId = `redemption-${redemptionId}`;
  const baseUrl = String(redemption.api_base_url ?? '').replace(/\/$/, '');
  const endpoint = `${baseUrl}/redemptions`;
  let httpStatus: number | null = null;
  let errorMessage: string | null = null;

  try {
    if (!baseUrl) throw new Error('Partner API URL is not configured');
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
      throw new Error('Partner API must use HTTPS in production');
    }
    const allowedHosts = (process.env.PARTNER_API_ALLOWED_HOSTS ?? '')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
    if (process.env.NODE_ENV === 'production' && !allowedHosts.includes(parsed.hostname.toLowerCase())) {
      throw new Error('Partner API host is not on the production allowlist');
    }
    const credentialName = `PARTNER_CREDENTIAL_${String(redemption.credential_ref ?? '').replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}`;
    const storedCredential = process.env[credentialName];
    if (!storedCredential) throw new Error(`Partner credential ${credentialName} is not configured`);
    const credential = storedCredential.startsWith('enc:')
      ? new SecretBox().decrypt(storedCredential.slice(4))
      : storedCredential;

    const response = await fetch(endpoint, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${credential}`,
        'idempotency-key': requestId,
      },
      body: JSON.stringify({
        redemptionId: String(redemption.redemption_id),
        accountId: redemption.external_account_id ?? null,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    httpStatus = response.status;
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Partner returned HTTP ${response.status}`);

    const externalRef = String(body.reference ?? body.id ?? requestId).slice(0, 100);
    await AppDataSource.transaction(async (manager) => {
      await manager.query(
        `UPDATE redemptions SET status='ISSUED',external_ref=?,issued_at=NOW()
         WHERE redemption_id=? AND status='PENDING'`,
        [externalRef, redemptionId],
      );
    });
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : 'Partner request failed';
    throw error;
  } finally {
    try {
      await AppDataSource.query(
        `INSERT INTO partner_api_logs(partner_id,redemption_id,request_id,endpoint,http_status,is_success,error_message)
         VALUES(?,?,?,?,?,?,?)`,
        [redemption.partner_id, redemptionId, requestId, endpoint.slice(0, 255), httpStatus, errorMessage === null, errorMessage?.slice(0, 500) ?? null],
      );
    } catch (logError) {
      logger.error(`Could not save partner API log for redemption ${redemptionId}`, logError instanceof Error ? logError.stack : undefined);
    }
  }
}

async function processJob(job: Job, connection: Redis) {
  if (job.name === 'fulfill-redemption') {
    await fulfillRedemption(String(job.data.redemptionId));
    return;
  }
  if (job.name === 'analytics-session') {
    await connection.publish('bravoforest:analytics', JSON.stringify(job.data));
  }
}

async function requeuePendingRedemptions(queue: Queue) {
  const pending = await AppDataSource.query(
    `SELECT redemption_id FROM redemptions WHERE status='PENDING'
     ORDER BY created_at LIMIT 500`,
  );
  for (const row of pending) {
    const redemptionId = String(row.redemption_id);
    const jobId = `redemption-${redemptionId}`;
    const existing = await queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (!['completed', 'failed'].includes(state)) continue;
      await existing.remove();
    }
    await queue.add(
      'fulfill-redemption',
      { redemptionId },
      { jobId, attempts: 5, backoff: { type: 'exponential', delay: 5_000 }, removeOnComplete: 100 },
    );
  }
}

async function start() {
  await AppDataSource.initialize();
  const connection = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', { maxRetriesPerRequest: null });
  const queueConnection = connection.duplicate();
  const queue = new Queue('bravoforest', { connection: queueConnection });
  const worker = new Worker('bravoforest', (job) => processJob(job, connection), { connection });

  worker.on('failed', async (job, error) => {
    if (!job || job.name !== 'fulfill-redemption') return;
    logger.warn(`Voucher job ${job.id} failed (${job.attemptsMade}/${job.opts.attempts ?? 1}): ${error.message}`);
    if (job.attemptsMade >= Number(job.opts.attempts ?? 1)) {
      try {
        await failRedemption(String(job.data.redemptionId), 'Partner fulfillment failed after retries');
      } catch (refundError) {
        logger.error(`Could not refund failed redemption ${job.data.redemptionId}`, refundError instanceof Error ? refundError.stack : undefined);
      }
    }
  });

  const expiryTimer = setInterval(() => {
    void AppDataSource.query(
      `UPDATE recycling_sessions SET status='EXPIRED',completed_at=NOW()
       WHERE (status='WAITING_LOGIN' AND qr_expires_at<NOW())
          OR (status='DEPOSITING' AND started_at<NOW()-INTERVAL 30 MINUTE)`,
    ).catch((error) => logger.error('Could not expire QR sessions', error instanceof Error ? error.stack : undefined));
  }, 60_000);
  expiryTimer.unref();

  let reconciling = false;
  const reconcile = async () => {
    if (reconciling) return;
    reconciling = true;
    try {
      await requeuePendingRedemptions(queue);
    } catch (error) {
      logger.error('Could not reconcile pending voucher redemptions', error instanceof Error ? error.stack : undefined);
    } finally {
      reconciling = false;
    }
  };
  await reconcile();
  const reconciliationTimer = setInterval(() => void reconcile(), 30_000);
  reconciliationTimer.unref();

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    clearInterval(expiryTimer);
    clearInterval(reconciliationTimer);
    await Promise.all([worker.close(), queue.close()]);
    await Promise.all([connection.quit(), queueConnection.quit()]);
    await AppDataSource.destroy();
  };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());
  logger.log('BravoForest worker is ready');
}

void start().catch((error) => {
  logger.error('Worker failed to start', error instanceof Error ? error.stack : undefined);
  process.exitCode = 1;
});
