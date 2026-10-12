INSERT INTO service_status (id, message)
VALUES (true, 'database reachable')
ON CONFLICT (id) DO NOTHING;