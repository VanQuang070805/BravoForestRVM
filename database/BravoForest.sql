-- =====================================================================
-- CƠ SỞ DỮ LIỆU: HỆ THỐNG RVM (REVERSE VENDING MACHINE) + WEB ĐỔI ĐIỂM
-- Phiên bản dành cho XAMPP (MariaDB 10.4+ / MySQL 8) | Chuẩn 3NF | InnoDB | utf8mb4
--
-- CÁCH NHẬP VÀO XAMPP
--   1. Bật Apache và MySQL trong XAMPP Control Panel.
--   2. Mở http://localhost/phpmyadmin
--   3. Ở màn hình chủ (KHÔNG chọn database nào) -> tab "Nhập / Import"
--      -> Chọn tệp BravoForest.sql -> bấm "Thực hiện / Go".
--      File tự tạo database `BravoForest`.
--   Hoặc dùng dòng lệnh (Windows):
--      C:\xampp\mysql\bin\mysql.exe -u root --default-character-set=utf8mb4 < BravoForest.sql
--
-- YÊU CẦU: MariaDB >= 10.2.1 (XAMPP 7.4 / 8.x). Khuyến nghị >= 10.4 để ràng buộc CHECK
-- được kiểm tra đầy đủ. Bản MariaDB quá cũ sẽ bỏ qua CHECK nhưng vẫn chạy.
--
-- Luồng nghiệp vụ:
--  1. Máy hỏi khách có đăng nhập không. Nếu có -> tạo recycling_session và hiện QR (qr_token).
--  2. Khách mở web (đã đăng nhập) quét QR -> web gán user_id vào phiên.
--  3. Khách bỏ chai, bấm OK -> cảm biến xử lý từng vỏ -> ghi deposit_items.
--  4. Máy nghiền chai nhựa -> ghi crushed_at cho từng vỏ.
--  5. Phiên hoàn tất -> ghi 1 dòng EARN vào wallet_transactions (cộng điểm vào ví).
--  6. Khách đổi voucher -> redemptions + 1 dòng REDEEM (trừ điểm), có thể gọi API đối tác.
-- Số dư ví KHÔNG lưu cứng: tính từ sổ cái wallet_transactions (view v_wallet_balance).
-- =====================================================================
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Bỏ dấu "--" ở dòng dưới nếu muốn nhập lại từ đầu. CẢNH BÁO: xóa toàn bộ dữ liệu cũ!
-- DROP DATABASE IF EXISTS BravoForest;

CREATE DATABASE IF NOT EXISTS BravoForest CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE BravoForest;

-- =====================================================================
-- 1. NGƯỜI DÙNG, PHÂN QUYỀN (RBAC), THÔNG BÁO
-- =====================================================================
CREATE TABLE roles (
    role_id      TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    role_name    VARCHAR(30) NOT NULL UNIQUE,        -- CUSTOMER, ADMIN, TECHNICIAN
    description  VARCHAR(200)
) ENGINE=InnoDB;

CREATE TABLE permissions (
    permission_id  SMALLINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    code           VARCHAR(60) NOT NULL UNIQUE,      -- MACHINE_WRITE, VOUCHER_WRITE...
    description    VARCHAR(200)
) ENGINE=InnoDB;

CREATE TABLE role_permissions (
    role_id        TINYINT UNSIGNED NOT NULL,
    permission_id  SMALLINT UNSIGNED NOT NULL,
    PRIMARY KEY (role_id, permission_id),
    CONSTRAINT fk_rp_role FOREIGN KEY (role_id)       REFERENCES roles(role_id),
    CONSTRAINT fk_rp_perm FOREIGN KEY (permission_id) REFERENCES permissions(permission_id)
) ENGINE=InnoDB;

CREATE TABLE users (
    user_id            BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    role_id            TINYINT UNSIGNED NOT NULL,
    full_name          VARCHAR(100) NOT NULL,
    email              VARCHAR(150) UNIQUE,
    phone              VARCHAR(20)  UNIQUE,
    password_hash      VARCHAR(255) NOT NULL,
    status             ENUM('ACTIVE','LOCKED','DELETED') NOT NULL DEFAULT 'ACTIVE',
    email_verified_at  DATETIME NULL,
    phone_verified_at  DATETIME NULL,
    created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at      DATETIME NULL,
    deleted_at         DATETIME NULL,
    CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(role_id),
    CONSTRAINT chk_users_contact CHECK (email IS NOT NULL OR phone IS NOT NULL)
) ENGINE=InnoDB;

CREATE TABLE notifications (
    notification_id  BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    user_id          BIGINT UNSIGNED NOT NULL,
    title            VARCHAR(150) NOT NULL,
    body             VARCHAR(500),
    read_at          DATETIME NULL,
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_nt_user FOREIGN KEY (user_id) REFERENCES users(user_id),
    INDEX idx_nt_user (user_id, read_at)
) ENGINE=InnoDB;

-- =====================================================================
-- 2. DANH MỤC VỎ CHAI & QUY TẮC ĐIỂM
-- =====================================================================
CREATE TABLE materials (
    material_id  TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    code         VARCHAR(20) NOT NULL UNIQUE,        -- PET, ALU, GLASS
    name         VARCHAR(50) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE container_types (
    container_type_id  INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    material_id        TINYINT UNSIGNED NOT NULL,
    name               VARCHAR(100) NOT NULL,        -- VD: Chai PET 500ml
    volume_ml          SMALLINT UNSIGNED,
    min_weight_g       DECIMAL(7,2),                 -- dải cân để cảm biến đối chiếu
    max_weight_g       DECIMAL(7,2),
    is_active          BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_ct_material FOREIGN KEY (material_id) REFERENCES materials(material_id),
    CONSTRAINT chk_ct_weight CHECK (min_weight_g IS NULL OR max_weight_g IS NULL OR min_weight_g <= max_weight_g)
) ENGINE=InnoDB;

CREATE TABLE product_barcodes (
    barcode            VARCHAR(50) PRIMARY KEY,
    container_type_id  INT UNSIGNED NOT NULL,
    brand              VARCHAR(100),
    CONSTRAINT fk_bc_ct FOREIGN KEY (container_type_id) REFERENCES container_types(container_type_id)
) ENGINE=InnoDB;

-- Mỗi loại vỏ có nhiều quy tắc điểm theo thời gian (lưu lịch sử, không ghi đè).
-- Lưu ý: ứng dụng/admin phải đảm bảo không chồng khoảng thời gian của cùng 1 loại vỏ.
CREATE TABLE point_rules (
    rule_id            INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    container_type_id  INT UNSIGNED NOT NULL,
    points_per_item    SMALLINT UNSIGNED NOT NULL,
    valid_from         DATETIME NOT NULL,
    valid_to           DATETIME NULL,
    created_by         BIGINT UNSIGNED NULL,
    CONSTRAINT fk_pr_ct   FOREIGN KEY (container_type_id) REFERENCES container_types(container_type_id),
    CONSTRAINT fk_pr_user FOREIGN KEY (created_by)        REFERENCES users(user_id),
    CONSTRAINT chk_pr_time CHECK (valid_to IS NULL OR valid_to > valid_from),
    INDEX idx_pr_lookup (container_type_id, valid_from, valid_to)
) ENGINE=InnoDB;

CREATE TABLE reject_reasons (
    reject_reason_id  TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    code              VARCHAR(40) NOT NULL UNIQUE,
    description       VARCHAR(200)
) ENGINE=InnoDB;

-- =====================================================================
-- 3. MÁY RVM: ĐỊA ĐIỂM, TRIỂN KHAI, THÙNG CHỨA, CẢNH BÁO, BẢO TRÌ
-- =====================================================================
CREATE TABLE machine_locations (
    location_id  INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    name         VARCHAR(150) NOT NULL,
    address      VARCHAR(255) NOT NULL,
    ward         VARCHAR(100),
    district     VARCHAR(100),
    city         VARCHAR(100),
    latitude     DECIMAL(9,6),
    longitude    DECIMAL(9,6),
    is_active    BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;

CREATE TABLE machines (
    machine_id          INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    machine_code        VARCHAR(30) NOT NULL UNIQUE,
    serial_number       VARCHAR(60) UNIQUE,
    model               VARCHAR(80),
    firmware_version    VARCHAR(30),
    operational_status  ENUM('ACTIVE','MAINTENANCE','DISABLED','DECOMMISSIONED') NOT NULL DEFAULT 'ACTIVE',
    installed_at        DATE,
    last_heartbeat_at   DATETIME NULL,               -- online/offline được suy ra từ cột này
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE machine_api_keys (                      -- máy xác thực với server, hỗ trợ xoay khóa
    key_id      INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    machine_id  INT UNSIGNED NOT NULL,
    key_hash    VARCHAR(255) NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at  DATETIME NULL,
    CONSTRAINT fk_mk_machine FOREIGN KEY (machine_id) REFERENCES machines(machine_id),
    INDEX idx_mk_machine (machine_id)
) ENGINE=InnoDB;

-- Lịch sử đặt máy tại địa điểm: biết chính xác phiên nào diễn ra ở đâu dù máy được chuyển chỗ.
CREATE TABLE machine_deployments (
    deployment_id     INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    machine_id        INT UNSIGNED NOT NULL,
    location_id       INT UNSIGNED NOT NULL,
    deployed_at       DATETIME NOT NULL,
    removed_at        DATETIME NULL,
    active_machine_id INT UNSIGNED GENERATED ALWAYS AS (IF(removed_at IS NULL, machine_id, NULL)) STORED,
    CONSTRAINT fk_md_machine  FOREIGN KEY (machine_id)  REFERENCES machines(machine_id),
    CONSTRAINT fk_md_location FOREIGN KEY (location_id) REFERENCES machine_locations(location_id),
    CONSTRAINT chk_md_time CHECK (removed_at IS NULL OR removed_at >= deployed_at),
    UNIQUE KEY uq_one_active_deployment (active_machine_id)   -- mỗi máy chỉ có 1 vị trí đang hoạt động
) ENGINE=InnoDB;

-- Thùng chứa trong máy: mỗi loại vật liệu 1 thùng. processing='CRUSH' = thùng của bộ phận nghiền.
CREATE TABLE machine_bins (
    bin_id          INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    machine_id      INT UNSIGNED NOT NULL,
    material_id     TINYINT UNSIGNED NOT NULL,
    processing      ENUM('CRUSH','STORE') NOT NULL,
    capacity_items  INT UNSIGNED,
    capacity_kg     DECIMAL(8,2),
    status          ENUM('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
    CONSTRAINT fk_bin_machine  FOREIGN KEY (machine_id)  REFERENCES machines(machine_id),
    CONSTRAINT fk_bin_material FOREIGN KEY (material_id) REFERENCES materials(material_id),
    UNIQUE KEY uq_bin_machine_material (machine_id, material_id)
) ENGINE=InnoDB;

CREATE TABLE bin_readings (                          -- cảm biến mức đầy theo thời gian
    reading_id    BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    bin_id        INT UNSIGNED NOT NULL,
    recorded_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fill_percent  TINYINT UNSIGNED NOT NULL,
    weight_kg     DECIMAL(8,2),
    CONSTRAINT fk_br_bin FOREIGN KEY (bin_id) REFERENCES machine_bins(bin_id),
    CONSTRAINT chk_br_fill CHECK (fill_percent <= 100),
    INDEX idx_br_bin_time (bin_id, recorded_at)
) ENGINE=InnoDB;

CREATE TABLE bin_collections (                       -- nhân viên thu gom / đổ thùng
    collection_id  BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    bin_id         INT UNSIGNED NOT NULL,
    collected_by   BIGINT UNSIGNED NOT NULL,
    collected_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    weight_kg      DECIMAL(8,2),
    note           VARCHAR(255),
    CONSTRAINT fk_bcol_bin  FOREIGN KEY (bin_id)       REFERENCES machine_bins(bin_id),
    CONSTRAINT fk_bcol_user FOREIGN KEY (collected_by) REFERENCES users(user_id),
    INDEX idx_bcol_bin_time (bin_id, collected_at)
) ENGINE=InnoDB;

CREATE TABLE alert_types (
    alert_type_id  SMALLINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    code           VARCHAR(40) NOT NULL UNIQUE,
    description    VARCHAR(200),
    severity       ENUM('INFO','WARNING','CRITICAL') NOT NULL
) ENGINE=InnoDB;

CREATE TABLE machine_alerts (
    alert_id       BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    machine_id     INT UNSIGNED NOT NULL,
    alert_type_id  SMALLINT UNSIGNED NOT NULL,
    message        VARCHAR(255),
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at    DATETIME NULL,
    resolved_by    BIGINT UNSIGNED NULL,
    CONSTRAINT fk_ma_machine FOREIGN KEY (machine_id)    REFERENCES machines(machine_id),
    CONSTRAINT fk_ma_type    FOREIGN KEY (alert_type_id) REFERENCES alert_types(alert_type_id),
    CONSTRAINT fk_ma_user    FOREIGN KEY (resolved_by)   REFERENCES users(user_id),
    INDEX idx_ma_machine_time (machine_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE maintenance_logs (
    log_id            BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    machine_id        INT UNSIGNED NOT NULL,
    performed_by      BIGINT UNSIGNED NOT NULL,
    maintenance_type  ENUM('INSPECTION','CLEANING','REPAIR','PART_REPLACEMENT','FIRMWARE_UPDATE') NOT NULL,
    description       VARCHAR(500),
    performed_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ml_machine FOREIGN KEY (machine_id)   REFERENCES machines(machine_id),
    CONSTRAINT fk_ml_user    FOREIGN KEY (performed_by) REFERENCES users(user_id),
    INDEX idx_ml_machine (machine_id, performed_at)
) ENGINE=InnoDB;

-- =====================================================================
-- 4. PHIÊN BỎ CHAI (CẦU NỐI MÁY <-> WEB)
-- =====================================================================
-- status: WAITING_LOGIN (hiện QR) -> DEPOSITING (khách đang bỏ chai) -> PROCESSING
--         (đã bấm OK, cảm biến xử lý) -> COMPLETED | CANCELLED | EXPIRED
-- Khách không đăng nhập: user_id = NULL, vẫn lưu số liệu cho máy, không cộng điểm.
-- (Tùy chọn) cho phép "nhận điểm muộn" trong GUEST_CLAIM_HOURS bằng cách quét QR trên biên lai.
CREATE TABLE recycling_sessions (
    session_id     BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    deployment_id  INT UNSIGNED NOT NULL,            -- suy ra máy + địa điểm tại thời điểm đó
    user_id        BIGINT UNSIGNED NULL,
    qr_token       CHAR(64) NOT NULL UNIQUE,         -- ngẫu nhiên, hết hạn nhanh
    qr_expires_at  DATETIME NOT NULL,
    status         ENUM('WAITING_LOGIN','DEPOSITING','PROCESSING','COMPLETED','CANCELLED','EXPIRED')
                   NOT NULL DEFAULT 'WAITING_LOGIN',
    started_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    linked_at      DATETIME NULL,                    -- lúc khách quét QR thành công
    confirmed_at   DATETIME NULL,                    -- lúc khách bấm OK trên màn hình
    completed_at   DATETIME NULL,
    CONSTRAINT fk_rs_deployment FOREIGN KEY (deployment_id) REFERENCES machine_deployments(deployment_id),
    CONSTRAINT fk_rs_user       FOREIGN KEY (user_id)       REFERENCES users(user_id),
    CONSTRAINT chk_rs_link CHECK ((user_id IS NULL) = (linked_at IS NULL)),
    INDEX idx_rs_user (user_id, started_at),
    INDEX idx_rs_deployment (deployment_id, started_at)
) ENGINE=InnoDB;

-- Mỗi dòng = 1 vỏ chai. Chấp nhận (rule_id có giá trị) HOẶC từ chối (reject_reason_id có giá trị).
-- Loại vỏ, vật liệu và điểm được suy ra qua rule_id -> point_rules -> container_types (3NF).
CREATE TABLE deposit_items (
    item_id           BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    session_id        BIGINT UNSIGNED NOT NULL,
    rule_id           INT UNSIGNED NULL,
    reject_reason_id  TINYINT UNSIGNED NULL,
    scanned_barcode   VARCHAR(50) NULL,              -- giá trị đọc thô, kể cả mã chưa có trong hệ thống
    measured_weight_g DECIMAL(7,2),
    sensor_data       JSON NULL,                     -- dữ liệu cảm biến thô (để kiểm tra gian lận/hiệu chuẩn)
    deposited_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    crushed_at        DATETIME NULL,                 -- đã đi qua bộ phận nghiền
    CONSTRAINT fk_di_session FOREIGN KEY (session_id)       REFERENCES recycling_sessions(session_id),
    CONSTRAINT fk_di_rule    FOREIGN KEY (rule_id)          REFERENCES point_rules(rule_id),
    CONSTRAINT fk_di_reject  FOREIGN KEY (reject_reason_id) REFERENCES reject_reasons(reject_reason_id),
    CONSTRAINT chk_di_outcome CHECK ((rule_id IS NULL) <> (reject_reason_id IS NULL)),
    CONSTRAINT chk_di_crush   CHECK (crushed_at IS NULL OR rule_id IS NOT NULL),
    INDEX idx_di_session (session_id),
    INDEX idx_di_time (deposited_at)
) ENGINE=InnoDB;

-- =====================================================================
-- 5. VÍ ĐIỂM & SỔ CÁI (nguồn sự thật duy nhất về điểm)
-- =====================================================================
CREATE TABLE wallets (
    wallet_id   BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    user_id     BIGINT UNSIGNED NOT NULL UNIQUE,     -- 1 người dùng : 1 ví
    status      ENUM('ACTIVE','FROZEN') NOT NULL DEFAULT 'ACTIVE',
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_wl_user FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB;

CREATE TABLE wallet_transactions (
    transaction_id  BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    wallet_id       BIGINT UNSIGNED NOT NULL,
    txn_type        ENUM('EARN','REDEEM','REFUND','ADJUST','EXPIRE') NOT NULL,
    points          INT NOT NULL,                    -- dương = cộng, âm = trừ
    session_id      BIGINT UNSIGNED NULL,            -- chỉ với EARN
    redemption_id   BIGINT UNSIGNED NULL,            -- chỉ với REDEEM / REFUND
    created_by      BIGINT UNSIGNED NULL,            -- admin, với ADJUST
    note            VARCHAR(255),
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_wt_wallet  FOREIGN KEY (wallet_id) REFERENCES wallets(wallet_id),
    CONSTRAINT fk_wt_session FOREIGN KEY (session_id) REFERENCES recycling_sessions(session_id),
    CONSTRAINT fk_wt_admin   FOREIGN KEY (created_by) REFERENCES users(user_id),
    CONSTRAINT chk_wt_rules CHECK (
           (txn_type = 'EARN'   AND points > 0  AND session_id IS NOT NULL AND redemption_id IS NULL)
        OR (txn_type = 'REDEEM' AND points < 0  AND redemption_id IS NOT NULL AND session_id IS NULL)
        OR (txn_type = 'REFUND' AND points > 0  AND redemption_id IS NOT NULL AND session_id IS NULL)
        OR (txn_type = 'ADJUST' AND points <> 0 AND created_by IS NOT NULL AND session_id IS NULL AND redemption_id IS NULL)
        OR (txn_type = 'EXPIRE' AND points < 0  AND session_id IS NULL AND redemption_id IS NULL)
    ),
    UNIQUE KEY uq_wt_session (session_id),                    -- 1 phiên chỉ được cộng điểm 1 lần
    UNIQUE KEY uq_wt_redemption (redemption_id, txn_type),    -- 1 lần trừ + tối đa 1 lần hoàn
    INDEX idx_wt_wallet_time (wallet_id, created_at)
) ENGINE=InnoDB;

-- =====================================================================
-- 6. VOUCHER, ĐỐI TÁC (SHOPEE, GRAB...) & ĐỔI THƯỞNG
-- =====================================================================
CREATE TABLE partners (
    partner_id      INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    code            VARCHAR(30) NOT NULL UNIQUE,     -- INTERNAL, SHOPEE, GRAB
    name            VARCHAR(100) NOT NULL,
    logo_url        VARCHAR(255),
    partner_type    ENUM('INTERNAL','EXTERNAL') NOT NULL,
    api_base_url    VARCHAR(255),
    credential_ref  VARCHAR(100),                    -- tham chiếu kho bí mật, KHÔNG lưu khóa thật ở đây
    status          ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE'
) ENGINE=InnoDB;

CREATE TABLE user_partner_links (                    -- khách liên kết tài khoản Shopee/Grab...
    link_id             BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    user_id             BIGINT UNSIGNED NOT NULL,
    partner_id          INT UNSIGNED NOT NULL,
    external_account_id VARCHAR(100) NOT NULL,
    token_ref           VARCHAR(100),                -- tham chiếu token đã mã hóa
    status              ENUM('ACTIVE','REVOKED') NOT NULL DEFAULT 'ACTIVE',
    linked_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_upl_user    FOREIGN KEY (user_id)    REFERENCES users(user_id),
    CONSTRAINT fk_upl_partner FOREIGN KEY (partner_id) REFERENCES partners(partner_id),
    UNIQUE KEY uq_upl_user_partner (user_id, partner_id),
    UNIQUE KEY uq_upl_external (partner_id, external_account_id)
) ENGINE=InnoDB;

CREATE TABLE voucher_categories (
    category_id  INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    name         VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB;

-- fulfillment_type:
--   CODE_POOL     : admin nhập sẵn mã (voucher_codes), hệ thống phát từng mã
--   PARTNER_API   : gọi API đối tác sinh mã khi khách đổi
--   ACCOUNT_TOPUP : đẩy giá trị vào tài khoản đối tác đã liên kết (user_partner_links)
CREATE TABLE vouchers (
    voucher_id         INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    partner_id         INT UNSIGNED NOT NULL,
    category_id        INT UNSIGNED NOT NULL,
    title              VARCHAR(150) NOT NULL,
    description        TEXT,
    terms              TEXT,
    image_url          VARCHAR(255),
    points_cost        INT UNSIGNED NOT NULL,
    face_value         DECIMAL(12,0) NULL,           -- mệnh giá quy đổi (VND)
    fulfillment_type   ENUM('CODE_POOL','PARTNER_API','ACCOUNT_TOPUP') NOT NULL,
    stock_limit        INT UNSIGNED NULL,            -- NULL = không giới hạn (dùng cho API/topup)
    validity_days      SMALLINT UNSIGNED NULL,       -- hạn dùng tính từ lúc đổi
    max_per_user       SMALLINT UNSIGNED NULL,
    available_from     DATETIME NULL,
    available_to       DATETIME NULL,
    status             ENUM('DRAFT','ACTIVE','PAUSED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    created_by         BIGINT UNSIGNED NULL,
    created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_vc_partner  FOREIGN KEY (partner_id)  REFERENCES partners(partner_id),
    CONSTRAINT fk_vc_category FOREIGN KEY (category_id) REFERENCES voucher_categories(category_id),
    CONSTRAINT fk_vc_user     FOREIGN KEY (created_by)  REFERENCES users(user_id),
    CONSTRAINT chk_vc_points CHECK (points_cost > 0),
    CONSTRAINT chk_vc_time   CHECK (available_to IS NULL OR available_from IS NULL OR available_to > available_from)
) ENGINE=InnoDB;

CREATE TABLE voucher_codes (
    code_id     BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    voucher_id  INT UNSIGNED NOT NULL,
    code        VARCHAR(100) NOT NULL,
    status      ENUM('AVAILABLE','RESERVED','ISSUED','VOID') NOT NULL DEFAULT 'AVAILABLE',
    expires_at  DATETIME NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_vcode_voucher FOREIGN KEY (voucher_id) REFERENCES vouchers(voucher_id),
    UNIQUE KEY uq_vcode (voucher_id, code),
    INDEX idx_vcode_pick (voucher_id, status)
) ENGINE=InnoDB;

-- Mỗi dòng = 1 voucher khách đã đổi. Số điểm đã trừ nằm ở wallet_transactions (REDEEM), không lặp ở đây.
CREATE TABLE redemptions (
    redemption_id    BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    wallet_id        BIGINT UNSIGNED NOT NULL,
    voucher_id       INT UNSIGNED NOT NULL,
    code_id          BIGINT UNSIGNED NULL UNIQUE,    -- mã được phát (CODE_POOL)
    link_id          BIGINT UNSIGNED NULL,           -- tài khoản đối tác nhận (ACCOUNT_TOPUP)
    status           ENUM('PENDING','ISSUED','USED','EXPIRED','FAILED','CANCELLED') NOT NULL DEFAULT 'PENDING',
    idempotency_key  VARCHAR(64) NOT NULL UNIQUE,    -- chống bấm đổi 2 lần / gọi API lặp
    external_ref     VARCHAR(100) NULL,              -- mã giao dịch phía đối tác
    failure_reason   VARCHAR(255) NULL,
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    issued_at        DATETIME NULL,
    used_at          DATETIME NULL,
    expires_at       DATETIME NULL,
    CONSTRAINT fk_rd_wallet  FOREIGN KEY (wallet_id)  REFERENCES wallets(wallet_id),
    CONSTRAINT fk_rd_voucher FOREIGN KEY (voucher_id) REFERENCES vouchers(voucher_id),
    CONSTRAINT fk_rd_code    FOREIGN KEY (code_id)    REFERENCES voucher_codes(code_id),
    CONSTRAINT fk_rd_link    FOREIGN KEY (link_id)    REFERENCES user_partner_links(link_id),
    INDEX idx_rd_wallet (wallet_id, created_at),
    INDEX idx_rd_voucher (voucher_id, status)
) ENGINE=InnoDB;

ALTER TABLE wallet_transactions
    ADD CONSTRAINT fk_wt_redemption FOREIGN KEY (redemption_id) REFERENCES redemptions(redemption_id);

CREATE TABLE partner_api_logs (                      -- nhật ký gọi API đối tác để đối soát
    log_id         BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    partner_id     INT UNSIGNED NOT NULL,
    redemption_id  BIGINT UNSIGNED NULL,
    request_id     VARCHAR(64) NOT NULL,
    endpoint       VARCHAR(255) NOT NULL,
    http_status    SMALLINT UNSIGNED,
    is_success     BOOLEAN NOT NULL,
    error_message  VARCHAR(500),
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pal_partner    FOREIGN KEY (partner_id)    REFERENCES partners(partner_id),
    CONSTRAINT fk_pal_redemption FOREIGN KEY (redemption_id) REFERENCES redemptions(redemption_id),
    INDEX idx_pal_request (request_id),
    INDEX idx_pal_partner_time (partner_id, created_at)
) ENGINE=InnoDB;

-- =====================================================================
-- 7. CẤU HÌNH HỆ THỐNG & NHẬT KÝ QUẢN TRỊ
-- =====================================================================
CREATE TABLE system_settings (
    setting_key    VARCHAR(60) PRIMARY KEY,
    setting_value  VARCHAR(255) NOT NULL,
    description    VARCHAR(200),
    updated_by     BIGINT UNSIGNED NULL,
    updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_ss_user FOREIGN KEY (updated_by) REFERENCES users(user_id)
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
    log_id       BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    user_id      BIGINT UNSIGNED NULL,
    action       VARCHAR(50) NOT NULL,               -- CREATE_MACHINE, UPDATE_VOUCHER, LOCK_USER...
    entity_type  VARCHAR(50) NOT NULL,
    entity_id    BIGINT UNSIGNED NULL,
    detail       JSON NULL,
    ip_address   VARCHAR(45),
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_au_user FOREIGN KEY (user_id) REFERENCES users(user_id),
    INDEX idx_au_entity (entity_type, entity_id),
    INDEX idx_au_time (created_at)
) ENGINE=InnoDB;

-- =====================================================================
-- 8. VIEW: SUY RA DỮ LIỆU (không lưu dư thừa -> giữ 3NF)
-- =====================================================================

-- Mọi vỏ chai kèm máy, địa điểm, vật liệu, điểm
CREATE VIEW v_item_facts AS
SELECT di.item_id, di.session_id, rs.user_id,
       md.machine_id, md.location_id,
       ct.container_type_id, ct.material_id,
       pr.points_per_item AS points,
       (di.rule_id IS NOT NULL) AS is_accepted,
       di.reject_reason_id, di.measured_weight_g, di.deposited_at, di.crushed_at
FROM deposit_items di
JOIN recycling_sessions rs  ON rs.session_id    = di.session_id
JOIN machine_deployments md ON md.deployment_id = rs.deployment_id
LEFT JOIN point_rules pr      ON pr.rule_id = di.rule_id
LEFT JOIN container_types ct  ON ct.container_type_id = pr.container_type_id;

-- Số dư ví
CREATE VIEW v_wallet_balance AS
SELECT w.wallet_id, w.user_id,
       COALESCE(SUM(wt.points), 0)                                   AS balance,
       COALESCE(SUM(CASE WHEN wt.points > 0 THEN wt.points END), 0)  AS total_in,
       COALESCE(-SUM(CASE WHEN wt.points < 0 THEN wt.points END), 0) AS total_out
FROM wallets w
LEFT JOIN wallet_transactions wt ON wt.wallet_id = w.wallet_id
GROUP BY w.wallet_id, w.user_id;

-- Tổng kết từng phiên: máy, địa điểm, thời gian, số lượng, điểm tính được và điểm đã cộng
CREATE VIEW v_session_summary AS
SELECT rs.session_id, rs.user_id, rs.status,
       m.machine_code, ml.name AS location_name, ml.address AS location_address,
       rs.started_at, rs.completed_at,
       COUNT(f.item_id)                         AS items_total,
       COALESCE(SUM(f.is_accepted), 0)          AS items_accepted,
       COALESCE(SUM(NOT f.is_accepted), 0)      AS items_rejected,
       COALESCE(SUM(f.measured_weight_g), 0)    AS total_weight_g,
       COALESCE(SUM(f.points), 0)               AS points_calculated,
       MAX(wt.points)                           AS points_credited
FROM recycling_sessions rs
JOIN machine_deployments md ON md.deployment_id = rs.deployment_id
JOIN machines m             ON m.machine_id = md.machine_id
JOIN machine_locations ml   ON ml.location_id = md.location_id
LEFT JOIN v_item_facts f    ON f.session_id = rs.session_id
LEFT JOIN wallet_transactions wt ON wt.session_id = rs.session_id
GROUP BY rs.session_id, rs.user_id, rs.status, m.machine_code, ml.name, ml.address, rs.started_at, rs.completed_at;

-- Chi tiết phiên theo loại vỏ: số lượng, điểm/vỏ, thành tiền
CREATE VIEW v_session_item_detail AS
SELECT f.session_id, ct.name AS container_type, mt.name AS material,
       COUNT(*) AS quantity, f.points AS points_per_item, SUM(f.points) AS subtotal_points
FROM v_item_facts f
JOIN container_types ct ON ct.container_type_id = f.container_type_id
JOIN materials mt       ON mt.material_id = f.material_id
WHERE f.is_accepted = 1
GROUP BY f.session_id, ct.name, mt.name, f.points;

-- Lịch sử điểm của khách (kèm máy/địa điểm nếu là EARN, kèm voucher nếu là REDEEM)
CREATE VIEW v_user_point_history AS
SELECT w.user_id, wt.transaction_id, wt.txn_type, wt.points, wt.created_at,
       wt.session_id, m.machine_code, ml.name AS location_name,
       wt.redemption_id, v.title AS voucher_title, wt.note
FROM wallet_transactions wt
JOIN wallets w ON w.wallet_id = wt.wallet_id
LEFT JOIN recycling_sessions rs  ON rs.session_id = wt.session_id
LEFT JOIN machine_deployments md ON md.deployment_id = rs.deployment_id
LEFT JOIN machines m             ON m.machine_id = md.machine_id
LEFT JOIN machine_locations ml   ON ml.location_id = md.location_id
LEFT JOIN redemptions r          ON r.redemption_id = wt.redemption_id
LEFT JOIN vouchers v             ON v.voucher_id = r.voucher_id;

-- Lịch sử đổi voucher
CREATE VIEW v_user_redemption_history AS
SELECT w.user_id, r.redemption_id, v.title AS voucher_title, p.name AS partner_name,
       -wt.points AS points_spent, r.status, vc.code AS voucher_code,
       r.created_at, r.issued_at, r.used_at, r.expires_at
FROM redemptions r
JOIN wallets w  ON w.wallet_id = r.wallet_id
JOIN vouchers v ON v.voucher_id = r.voucher_id
JOIN partners p ON p.partner_id = v.partner_id
LEFT JOIN voucher_codes vc ON vc.code_id = r.code_id
LEFT JOIN wallet_transactions wt ON wt.redemption_id = r.redemption_id AND wt.txn_type = 'REDEEM';

-- Tồn kho voucher
CREATE VIEW v_voucher_stock AS
SELECT v.voucher_id, v.title, v.fulfillment_type, v.status,
       (SELECT COUNT(*) FROM voucher_codes vc WHERE vc.voucher_id = v.voucher_id AND vc.status = 'AVAILABLE') AS codes_available,
       (SELECT COUNT(*) FROM redemptions r WHERE r.voucher_id = v.voucher_id AND r.status IN ('PENDING','ISSUED','USED')) AS redeemed_count,
       v.stock_limit
FROM vouchers v;

-- Trạng thái máy hiện tại (online suy ra từ heartbeat 5 phút)
CREATE VIEW v_machine_status AS
SELECT m.machine_id, m.machine_code, m.operational_status,
       CASE WHEN m.last_heartbeat_at >= NOW() - INTERVAL 5 MINUTE THEN 'ONLINE' ELSE 'OFFLINE' END AS connectivity,
       m.last_heartbeat_at, ml.name AS location_name, ml.city,
       (SELECT COUNT(*) FROM machine_alerts a WHERE a.machine_id = m.machine_id AND a.resolved_at IS NULL) AS open_alerts
FROM machines m
LEFT JOIN machine_deployments md ON md.active_machine_id = m.machine_id
LEFT JOIN machine_locations ml   ON ml.location_id = md.location_id;

-- Mức đầy mới nhất của từng thùng
CREATE VIEW v_bin_latest AS
SELECT b.bin_id, b.machine_id, b.material_id, b.processing, br.fill_percent, br.weight_kg, br.recorded_at
FROM machine_bins b
LEFT JOIN bin_readings br ON br.reading_id = (
    SELECT r2.reading_id FROM bin_readings r2
    WHERE r2.bin_id = b.bin_id ORDER BY r2.recorded_at DESC, r2.reading_id DESC LIMIT 1);

-- Thống kê theo máy theo ngày: nhận / từ chối / điểm phát / số vỏ đã nghiền
CREATE VIEW v_machine_daily_stats AS
SELECT f.machine_id, m.machine_code, DATE(f.deposited_at) AS day,
       COALESCE(SUM(f.is_accepted), 0)     AS accepted_items,
       COALESCE(SUM(NOT f.is_accepted), 0) AS rejected_items,
       COALESCE(SUM(f.points), 0)          AS points_issued,
       COUNT(f.crushed_at)                 AS crushed_items
FROM v_item_facts f
JOIN machines m ON m.machine_id = f.machine_id
GROUP BY f.machine_id, m.machine_code, DATE(f.deposited_at);

-- Số vỏ đã nghiền / lưu kể từ lần thu gom gần nhất của từng thùng (kiểm soát từng máy)
CREATE VIEW v_bin_since_collection AS
SELECT b.bin_id, m.machine_code, mt.name AS material, b.processing,
       COUNT(f.item_id)                      AS items_since_collection,
       COALESCE(SUM(f.measured_weight_g), 0) AS weight_g_since_collection
FROM machine_bins b
JOIN machines m   ON m.machine_id = b.machine_id
JOIN materials mt ON mt.material_id = b.material_id
LEFT JOIN v_item_facts f
       ON f.machine_id = b.machine_id AND f.material_id = b.material_id AND f.is_accepted = 1
      AND f.deposited_at > COALESCE((SELECT MAX(bc.collected_at) FROM bin_collections bc WHERE bc.bin_id = b.bin_id),
                                    '1970-01-01')
GROUP BY b.bin_id, m.machine_code, mt.name, b.processing;

-- =====================================================================
-- 9. DỮ LIỆU TỐI THIỂU
-- Chỉ có: 3 vai trò (bắt buộc để khóa ngoại users.role_id hoạt động) và 1 tài khoản ADMIN.
-- Mọi bảng còn lại để trống: quyền, vật liệu, loại vỏ, lý do từ chối, loại cảnh báo,
-- đối tác, danh mục voucher, cấu hình hệ thống... sẽ do admin/ứng dụng tự thêm.
--
-- TÀI KHOẢN ADMIN MẶC ĐỊNH:  admin@bravoforest.local  /  Admin@123456
-- >>> ĐỔI MẬT KHẨU NGAY SAU LẦN ĐĂNG NHẬP ĐẦU TIÊN. <<<
-- Muốn tự đặt mật khẩu: tạo hash bcrypt (PHP: password_hash('mat_khau', PASSWORD_BCRYPT))
-- rồi thay vào cột password_hash bên dưới.
-- =====================================================================
INSERT INTO roles (role_name, description) VALUES
  ('CUSTOMER','Khách hàng'), ('ADMIN','Quản trị viên'), ('TECHNICIAN','Kỹ thuật viên / thu gom');

INSERT INTO users (role_id, full_name, email, password_hash, status, email_verified_at)
SELECT role_id, 'Quản trị viên', 'admin@bravoforest.local',
       '$2b$12$ubVNySwL1gc2ortT1TN1tO3Etif6GesfRhp3aV.z8B0IkRVkkOqxy',
       'ACTIVE', NOW()
FROM roles WHERE role_name = 'ADMIN';

SET FOREIGN_KEY_CHECKS = 1;
