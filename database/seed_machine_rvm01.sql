USE BravoForest;

-- Cấu hình vận hành tối thiểu cho máy thật tại 12 Chùa Bộc.
-- Không tạo người dùng, giao dịch, số dư, voucher, cảnh báo hoặc API key.
-- Chạy database/seed_reference_data.sql trước file này.

INSERT INTO machine_locations(name, address, district, city, is_active)
SELECT 'Trạm RVM - 12 Chùa Bộc', '12 Chùa Bộc', 'Đống Đa', 'Hà Nội', TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM machine_locations
  WHERE address='12 Chùa Bộc' AND district='Đống Đa' AND city='Hà Nội'
);

INSERT INTO machines(machine_code, operational_status)
VALUES ('RVM-01', 'ACTIVE')
ON DUPLICATE KEY UPDATE operational_status=VALUES(operational_status);

SET @rvm01_machine_id = (SELECT machine_id FROM machines WHERE machine_code='RVM-01' LIMIT 1);
SET @rvm01_location_id = (
  SELECT location_id FROM machine_locations
  WHERE address='12 Chùa Bộc' AND district='Đống Đa' AND city='Hà Nội'
  ORDER BY location_id LIMIT 1
);

INSERT INTO machine_deployments(machine_id, location_id, deployed_at)
SELECT @rvm01_machine_id, @rvm01_location_id, NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM machine_deployments
  WHERE machine_id=@rvm01_machine_id AND removed_at IS NULL
);

INSERT INTO container_types(material_id, name, volume_ml, min_weight_g, max_weight_g)
SELECT material_id, 'Chai PET (AI xác nhận)', NULL, NULL, NULL
FROM materials
WHERE code='PET' AND NOT EXISTS (
  SELECT 1 FROM container_types WHERE name='Chai PET (AI xác nhận)'
);

INSERT INTO container_types(material_id, name, volume_ml, min_weight_g, max_weight_g)
SELECT material_id, 'Lon nhôm (AI xác nhận)', NULL, NULL, NULL
FROM materials
WHERE code='ALU' AND NOT EXISTS (
  SELECT 1 FROM container_types WHERE name='Lon nhôm (AI xác nhận)'
);

INSERT INTO point_rules(container_type_id, points_per_item, valid_from, valid_to, created_by)
SELECT container_type_id, 10, NOW(), NULL, NULL
FROM container_types ct
WHERE ct.name IN ('Chai PET (AI xác nhận)', 'Lon nhôm (AI xác nhận)')
  AND NOT EXISTS (
    SELECT 1 FROM point_rules pr
    WHERE pr.container_type_id=ct.container_type_id
      AND COALESCE(pr.valid_to, '9999-12-31 23:59:59') > NOW()
  );

INSERT INTO machine_bins(machine_id, material_id, processing, capacity_items, capacity_kg, status)
SELECT @rvm01_machine_id, material_id, 'STORE', 1000, NULL, 'ACTIVE'
FROM materials m
WHERE m.code IN ('PET', 'ALU')
  AND NOT EXISTS (
    SELECT 1 FROM machine_bins mb
    WHERE mb.machine_id=@rvm01_machine_id AND mb.material_id=m.material_id
  );

SELECT m.machine_id, m.machine_code, l.name location_name, l.address
FROM machines m
JOIN machine_deployments md ON md.machine_id=m.machine_id AND md.removed_at IS NULL
JOIN machine_locations l ON l.location_id=md.location_id
WHERE m.machine_code='RVM-01';

SELECT pr.rule_id, ct.name, mt.code material_code, pr.points_per_item
FROM point_rules pr
JOIN container_types ct ON ct.container_type_id=pr.container_type_id
JOIN materials mt ON mt.material_id=ct.material_id
WHERE ct.name IN ('Chai PET (AI xác nhận)', 'Lon nhôm (AI xác nhận)')
  AND COALESCE(pr.valid_to, '9999-12-31 23:59:59') > NOW();
