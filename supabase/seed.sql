-- Demo data: one organization with two warehouses that differ in layout, fleet and technology.
-- Users are created separately by scripts/seed-demo-users.mjs (Supabase Auth admin API).

insert into public.organizations (id, name) values
  ('a0000000-0000-4000-8000-000000000001', 'Demo Logistics');

insert into public.warehouses (id, org_id, name, timezone, layout) values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'Jakarta Distribution Center', 'Asia/Jakarta', '{"template": "jakarta-dc"}'),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001',
   'Surabaya Cross-Dock Hub', 'Asia/Jakarta', '{"template": "surabaya-hub"}');

-- Jakarta: rack-heavy site with forklifts, AGVs and scan drones.
insert into public.assets (org_id, warehouse_id, serial_number, name, type, manufacturer, model, zone, rpm, sensors) values
  ('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'FK-2024-0001', 'Forklift FK-01', 'forklift', 'Toyota', '8FBE15', 'A', 1800, '[{"id":"acc-1","component":"front wheel motor","kind":"accelerometer"}]'),
  ('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'FK-2024-0002', 'Forklift FK-02', 'forklift', 'Toyota', '8FBE15', 'A', 1800, '[{"id":"acc-1","component":"front wheel motor","kind":"accelerometer"}]'),
  ('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'FK-2024-0003', 'Forklift FK-03', 'forklift', 'Linde', 'E20', 'B', 1800, '[{"id":"acc-1","component":"drive motor","kind":"accelerometer"}]'),
  ('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'AGV-2024-0001', 'AGV Robot R1', 'agv', 'Geek+', 'P800', 'P', 1500, '[{"id":"acc-1","component":"drive wheel","kind":"accelerometer"}]'),
  ('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'AGV-2024-0002', 'AGV Robot R2', 'agv', 'Geek+', 'P800', 'P', 1500, '[{"id":"acc-1","component":"drive wheel","kind":"accelerometer"}]'),
  ('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'AGV-2024-0003', 'AGV Robot R3', 'agv', 'Geek+', 'P800', 'P', 1500, '[{"id":"acc-1","component":"drive wheel","kind":"accelerometer"}]'),
  ('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'DR-2024-0001', 'Scan Drone D1', 'drone', 'DJI', 'M30', 'A', 6000, '[{"id":"imu-1","component":"rotor 1","kind":"accelerometer"}]'),
  ('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'DR-2024-0002', 'Scan Drone D2', 'drone', 'DJI', 'M30', 'B', 6000, '[{"id":"imu-1","component":"rotor 1","kind":"accelerometer"}]');

-- Surabaya: conveyor-driven cross-dock, mostly AGVs, a different vendor mix.
insert into public.assets (org_id, warehouse_id, serial_number, name, type, manufacturer, model, zone, rpm, sensors) values
  ('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'AGV-2025-0101', 'AGV S1', 'agv', 'Hai Robotics', 'HaiPick', 'IN', 1500, '[{"id":"acc-1","component":"drive wheel","kind":"accelerometer"}]'),
  ('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'AGV-2025-0102', 'AGV S2', 'agv', 'Hai Robotics', 'HaiPick', 'IN', 1500, '[{"id":"acc-1","component":"drive wheel","kind":"accelerometer"}]'),
  ('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'AGV-2025-0103', 'AGV S3', 'agv', 'Locus', 'Origin', 'OUT', 1500, '[{"id":"acc-1","component":"drive wheel","kind":"accelerometer"}]'),
  ('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'AGV-2025-0104', 'AGV S4', 'agv', 'Locus', 'Origin', 'OUT', 1500, '[{"id":"acc-1","component":"drive wheel","kind":"accelerometer"}]'),
  ('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'DR-2025-0101', 'Scan Drone S-D1', 'drone', 'Autel', 'Evo Max', 'IN', 6000, '[{"id":"imu-1","component":"rotor 1","kind":"accelerometer"}]'),
  ('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'CV-2025-0101', 'Sorter Belt 1', 'conveyor', 'Interroll', 'RollerDrive EC5000', 'SORT', 900, '[{"id":"acc-1","component":"drive roller","kind":"accelerometer"}]'),
  ('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'CV-2025-0102', 'Sorter Belt 2', 'conveyor', 'Interroll', 'RollerDrive EC5000', 'SORT', 900, '[{"id":"acc-1","component":"drive roller","kind":"accelerometer"}]'),
  ('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'FK-2025-0101', 'Forklift S-FK1', 'forklift', 'Hyster', 'E50', 'OUT', 1800, '[{"id":"acc-1","component":"drive motor","kind":"accelerometer"}]');
