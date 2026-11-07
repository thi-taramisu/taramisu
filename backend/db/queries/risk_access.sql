-- name: CanAccessRiskScenario :one
SELECT EXISTS (
 SELECT 1 FROM threat_scenario t
 JOIN item_definition i ON i.id = t.item_definition_id
 JOIN project_role_assignment p ON p.tara_project_id = i.tara_project_id
 WHERE t.id = sqlc.arg(threat_scenario_id)
 AND (p.user_id = sqlc.arg(user_id) OR p.group_id IN (
   SELECT group_id FROM iam_user_group_member WHERE user_id = sqlc.arg(user_id)))
 AND (sqlc.arg(read_only)::boolean OR p.project_role IN ('OWNER', 'EDITOR'))
);
