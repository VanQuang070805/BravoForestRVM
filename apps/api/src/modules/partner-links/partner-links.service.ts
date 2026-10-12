import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { SecretBox } from '../../common/security';
import { CreatePartnerLinkDto } from './partner-links.dto';

type PartnerVerificationResponse = { verified?: boolean; accountId?: string };

@Injectable()
export class PartnerLinksService {
  constructor(private readonly db: DataSource) {}

  partners() {
    return this.db.query(
      `SELECT partner_id,code,name,logo_url,partner_type
       FROM partners WHERE status='ACTIVE' ORDER BY name`,
    );
  }

  list(userId: string) {
    return this.db.query(
      `SELECT l.link_id,l.partner_id,p.code partner_code,p.name partner_name,
              p.logo_url,l.external_account_id,l.status,l.linked_at
       FROM user_partner_links l JOIN partners p ON p.partner_id=l.partner_id
       WHERE l.user_id=? ORDER BY l.linked_at DESC`,
      [userId],
    );
  }

  async create(userId: string, dto: CreatePartnerLinkDto) {
    const [partner] = await this.db.query(
      `SELECT partner_id,partner_type,api_base_url,credential_ref
       FROM partners WHERE partner_id=? AND status='ACTIVE'`,
      [dto.partnerId],
    );
    if (!partner) throw new NotFoundException('Active partner not found');
    if (partner.partner_type !== 'EXTERNAL') throw new BadRequestException('Only external partner accounts can be linked');

    await this.verifyOwnership(partner, dto.externalAccountId.trim());

    try {
      return await this.db.transaction(async (manager) => {
        const [user] = await manager.query("SELECT user_id FROM users WHERE user_id=? AND status='ACTIVE' FOR UPDATE", [userId]);
        if (!user) throw new NotFoundException('Active user not found');
        const [lockedPartner] = await manager.query(
          "SELECT partner_id FROM partners WHERE partner_id=? AND status='ACTIVE' AND partner_type='EXTERNAL' FOR UPDATE",
          [dto.partnerId],
        );
        if (!lockedPartner) throw new NotFoundException('Active partner not found');
        const [existing] = await manager.query(
          'SELECT link_id,status FROM user_partner_links WHERE user_id=? AND partner_id=? FOR UPDATE',
          [userId, dto.partnerId],
        );
        if (existing?.status === 'ACTIVE') throw new ConflictException('This partner account has already been linked');

        if (existing) {
          await manager.query(
            "UPDATE user_partner_links SET external_account_id=?,status='ACTIVE',linked_at=NOW() WHERE link_id=?",
            [dto.externalAccountId.trim(), existing.link_id],
          );
          await manager.query(
            `INSERT INTO audit_logs(user_id,action,entity_type,entity_id,detail)
             VALUES(?,'RELINK_PARTNER_ACCOUNT','PARTNER_LINK',?,?)`,
            [userId, existing.link_id, JSON.stringify({ partnerId: dto.partnerId })],
          );
          return { linkId: String(existing.link_id), status: 'ACTIVE', verified: true };
        }

        const result = await manager.query(
          `INSERT INTO user_partner_links(user_id,partner_id,external_account_id,status)
           VALUES(?,?,?,'ACTIVE')`,
          [userId, dto.partnerId, dto.externalAccountId.trim()],
        );
        await manager.query(
          `INSERT INTO audit_logs(user_id,action,entity_type,entity_id,detail)
           VALUES(?,'LINK_PARTNER_ACCOUNT','PARTNER_LINK',?,?)`,
          [userId, result.insertId, JSON.stringify({ partnerId: dto.partnerId })],
        );
        return { linkId: String(result.insertId), status: 'ACTIVE', verified: true };
      });
    } catch (error) {
      if (this.isDuplicateKey(error)) throw new ConflictException('This partner account is already linked');
      throw error;
    }
  }

  async revoke(userId: string, linkId: string) {
    return this.db.transaction(async (manager) => {
      const [link] = await manager.query(
        'SELECT link_id,status FROM user_partner_links WHERE link_id=? AND user_id=? FOR UPDATE',
        [linkId, userId],
      );
      if (!link) throw new NotFoundException('Partner link not found');
      if (link.status === 'REVOKED') return { ok: true, idempotent: true };
      await manager.query("UPDATE user_partner_links SET status='REVOKED' WHERE link_id=?", [linkId]);
      await manager.query("INSERT INTO audit_logs(user_id,action,entity_type,entity_id) VALUES(?,'REVOKE_PARTNER_LINK','PARTNER_LINK',?)", [userId, linkId]);
      return { ok: true, idempotent: false };
    });
  }

  private async verifyOwnership(partner: any, externalAccountId: string) {
    const baseUrl = String(partner.api_base_url ?? '').replace(/\/$/, '');
    if (!baseUrl || !partner.credential_ref) {
      throw new ServiceUnavailableException('Partner account verification is not configured');
    }
    const credentialName = `PARTNER_CREDENTIAL_${String(partner.credential_ref).replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}`;
    const storedCredential = process.env[credentialName];
    if (!storedCredential) throw new ServiceUnavailableException('Partner credentials are not configured');

    const parsed = this.validatePartnerUrl(baseUrl);
    const allowedHosts = (process.env.PARTNER_API_ALLOWED_HOSTS ?? '')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
    if (process.env.NODE_ENV === 'production' && !allowedHosts.includes(parsed.hostname.toLowerCase())) {
      throw new ServiceUnavailableException('Partner API host is not on the production allowlist');
    }

    const credential = storedCredential.startsWith('enc:')
      ? new SecretBox().decrypt(storedCredential.slice(4))
      : storedCredential;
    const endpoint = `${baseUrl}/accounts/verify`;
    const requestId = `link-${randomUUID()}`;
    let httpStatus: number | null = null;
    let success = false;
    let errorMessage: string | null = null;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${credential}`,
          'idempotency-key': requestId,
        },
        body: JSON.stringify({ accountId: externalAccountId }),
        signal: AbortSignal.timeout(10_000),
      });
      httpStatus = response.status;
      if (!response.ok) throw new ServiceUnavailableException(`Partner verification returned HTTP ${response.status}`);
      const result = await response.json() as PartnerVerificationResponse;
      success = result.verified === true && String(result.accountId ?? '') === externalAccountId;
      if (!success) throw new BadRequestException('Partner could not verify ownership of this account');
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Partner verification failed';
      if (error instanceof BadRequestException || error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('Partner account verification failed');
    } finally {
      try {
        await this.db.query(
          `INSERT INTO partner_api_logs(partner_id,request_id,endpoint,http_status,is_success,error_message)
           VALUES(?,?,?,?,?,?)`,
          [partner.partner_id, requestId, endpoint.slice(0, 255), httpStatus, success, errorMessage?.slice(0, 500) ?? null],
        );
      } catch {
        // Verification outcome is still returned if the independent audit log write fails.
      }
    }
  }

  private validatePartnerUrl(value: string) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new ServiceUnavailableException('Partner API URL is invalid');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || url.search) {
      throw new ServiceUnavailableException('Partner API URL must be an HTTP(S) base URL without credentials, query, or fragment');
    }
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
      throw new ServiceUnavailableException('Partner API must use HTTPS in production');
    }
    return url;
  }

  private isDuplicateKey(error: unknown) {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'ER_DUP_ENTRY';
  }
}
