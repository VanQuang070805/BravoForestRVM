-- Apply once to an existing BravoForest database. Cash-outs start disabled.
ALTER TABLE wallet_transactions
    DROP CONSTRAINT chk_wt_rules,
    MODIFY txn_type ENUM('EARN','REDEEM','REFUND','ADJUST','EXPIRE','CASHOUT','CASHOUT_REFUND') NOT NULL,
    ADD COLUMN cashout_id BIGINT UNSIGNED NULL AFTER redemption_id,
    ADD CONSTRAINT chk_wt_rules CHECK (
           (txn_type = 'EARN'   AND points > 0  AND session_id IS NOT NULL AND redemption_id IS NULL AND cashout_id IS NULL)
        OR (txn_type = 'REDEEM' AND points < 0  AND redemption_id IS NOT NULL AND session_id IS NULL AND cashout_id IS NULL)
        OR (txn_type = 'REFUND' AND points > 0  AND redemption_id IS NOT NULL AND session_id IS NULL AND cashout_id IS NULL)
        OR (txn_type = 'ADJUST' AND points <> 0 AND created_by IS NOT NULL AND session_id IS NULL AND redemption_id IS NULL AND cashout_id IS NULL)
        OR (txn_type = 'EXPIRE' AND points < 0  AND session_id IS NULL AND redemption_id IS NULL AND cashout_id IS NULL)
        OR (txn_type = 'CASHOUT' AND points < 0 AND cashout_id IS NOT NULL AND session_id IS NULL AND redemption_id IS NULL)
        OR (txn_type = 'CASHOUT_REFUND' AND points > 0 AND cashout_id IS NOT NULL AND session_id IS NULL AND redemption_id IS NULL)
    ),
    ADD UNIQUE KEY uq_wt_cashout (cashout_id, txn_type);

CREATE TABLE cashout_policy (
    policy_id               TINYINT UNSIGNED PRIMARY KEY,
    enabled                 BOOLEAN NOT NULL DEFAULT FALSE,
    points_per_step         INT UNSIGNED NULL,
    vnd_per_step            BIGINT UNSIGNED NULL,
    min_points              INT UNSIGNED NULL,
    max_points_per_request  INT UNSIGNED NULL,
    max_points_per_day      INT UNSIGNED NULL,
    version                 INT UNSIGNED NOT NULL DEFAULT 1,
    updated_by              BIGINT UNSIGNED NULL,
    updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_cp_user FOREIGN KEY (updated_by) REFERENCES users(user_id),
    CONSTRAINT chk_cp_values CHECK (
        policy_id = 1 AND (enabled = FALSE OR (
            points_per_step > 0 AND vnd_per_step > 0 AND min_points > 0
            AND max_points_per_request >= min_points
            AND max_points_per_day >= max_points_per_request
            AND MOD(min_points, points_per_step) = 0
            AND MOD(max_points_per_request, points_per_step) = 0
            AND MOD(max_points_per_day, points_per_step) = 0
        ))
    )
) ENGINE=InnoDB;

INSERT INTO cashout_policy(policy_id,enabled) VALUES(1,FALSE);

CREATE TABLE cashout_requests (
    cashout_id          BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    wallet_id           BIGINT UNSIGNED NOT NULL,
    user_id             BIGINT UNSIGNED NOT NULL,
    points              INT UNSIGNED NOT NULL,
    amount_vnd          BIGINT UNSIGNED NOT NULL,
    points_per_step     INT UNSIGNED NOT NULL,
    vnd_per_step        BIGINT UNSIGNED NOT NULL,
    policy_version      INT UNSIGNED NOT NULL,
    bank_name           VARCHAR(100) NOT NULL,
    recipient_cipher    TEXT NOT NULL,
    account_last4       CHAR(4) NOT NULL,
    status              ENUM('PENDING_REVIEW','APPROVED','PAID','REJECTED','FAILED') NOT NULL DEFAULT 'PENDING_REVIEW',
    decision_reason     VARCHAR(255) NULL,
    transfer_reference  VARCHAR(120) NULL,
    idempotency_key     VARCHAR(64) NOT NULL UNIQUE,
    reviewed_by         BIGINT UNSIGNED NULL,
    reviewed_at         DATETIME NULL,
    paid_by             BIGINT UNSIGNED NULL,
    paid_at             DATETIME NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_co_wallet FOREIGN KEY (wallet_id) REFERENCES wallets(wallet_id),
    CONSTRAINT fk_co_user FOREIGN KEY (user_id) REFERENCES users(user_id),
    CONSTRAINT fk_co_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(user_id),
    CONSTRAINT fk_co_paid_by FOREIGN KEY (paid_by) REFERENCES users(user_id),
    CONSTRAINT chk_co_values CHECK (points > 0 AND amount_vnd > 0 AND points_per_step > 0 AND vnd_per_step > 0 AND MOD(points, points_per_step) = 0),
    INDEX idx_co_user_time (user_id, created_at),
    INDEX idx_co_status_time (status, created_at)
) ENGINE=InnoDB;

ALTER TABLE wallet_transactions
    ADD CONSTRAINT fk_wt_cashout FOREIGN KEY (cashout_id) REFERENCES cashout_requests(cashout_id);
