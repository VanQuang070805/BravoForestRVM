USE BravoForest;

-- Minimal lookup/configuration data only. This does not create demo users,
-- machines, partners, vouchers, or transactions.
INSERT INTO materials(code, name) VALUES
  ('PET', 'Nhựa PET'),
  ('ALU', 'Nhôm')
ON DUPLICATE KEY UPDATE name=VALUES(name);

INSERT INTO container_types(material_id, name, volume_ml, min_weight_g, max_weight_g)
SELECT m.material_id, seed.name, seed.volume_ml, seed.min_weight_g, seed.max_weight_g
FROM materials m
JOIN (
  SELECT 'PET' material_code, 'Chai PET 350 ml' name, 350 volume_ml, 5.00 min_weight_g, 100.00 max_weight_g
  UNION ALL SELECT 'PET', 'Chai PET 500 ml', 500, 5.00, 120.00
  UNION ALL SELECT 'ALU', 'Lon nhôm 330 ml', 330, 5.00, 40.00
) seed ON seed.material_code=m.code
WHERE NOT EXISTS (
  SELECT 1 FROM container_types current_type
  WHERE current_type.material_id=m.material_id AND current_type.name=seed.name
);

INSERT INTO reject_reasons(code, description) VALUES
  ('UNKNOWN_BARCODE', 'Không nhận diện được mã vạch'),
  ('UNSUPPORTED_MATERIAL', 'Vật liệu không được máy hỗ trợ'),
  ('WEIGHT_OUT_OF_RANGE', 'Khối lượng ngoài ngưỡng cho phép'),
  ('DAMAGED_CONTAINER', 'Vỏ chai hoặc lon bị biến dạng trước khi tiếp nhận'),
  ('CONTAMINATED', 'Vật chứa còn chất lỏng hoặc bị bẩn'),
  ('SENSOR_REJECTED', 'Cảm biến không xác nhận vật phẩm hợp lệ')
ON DUPLICATE KEY UPDATE description=VALUES(description);

INSERT INTO alert_types(code, description, severity) VALUES
  ('BIN_FULL', 'Thùng chứa gần hoặc đã đầy', 'WARNING'),
  ('SENSOR_ERROR', 'Cảm biến báo lỗi', 'CRITICAL'),
  ('MACHINE_OFFLINE', 'Máy không gửi heartbeat', 'WARNING')
ON DUPLICATE KEY UPDATE description=VALUES(description), severity=VALUES(severity);

INSERT INTO voucher_categories(name) VALUES
  ('Đồ uống'),
  ('Di chuyển'),
  ('Mua sắm'),
  ('Phong cách sống')
ON DUPLICATE KEY UPDATE name=VALUES(name);

INSERT INTO point_rules(container_type_id, points_per_item, valid_from, valid_to, created_by)
SELECT ct.container_type_id, 10, NOW(), NULL, NULL
FROM container_types ct
JOIN materials m ON m.material_id=ct.material_id
WHERE (m.code='PET' OR m.code='ALU')
  AND NOT EXISTS (
    SELECT 1 FROM point_rules existing_rule
    WHERE existing_rule.container_type_id=ct.container_type_id
      AND COALESCE(existing_rule.valid_to, '9999-12-31 23:59:59') > NOW()
  );
