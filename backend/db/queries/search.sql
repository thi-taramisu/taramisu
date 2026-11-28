-- Global search (#240, ADR 0005 in docs/internal/adr/0005-backend-search.md) over projects and their elements.
-- Only projects the caller has a role in, directly or through a group (as in ListTaraProjects), are
-- searched; the filter applies before the pagination. Project IDs outside them return no results.
-- Each element branch also filters by the accessible project IDs, so that PostgreSQL reads only their rows
-- (through the (tara_project_id, display_number) indexes) before it compares any text.
--
-- A row matches if
-- - its name contains the query (strpos on lower-cased text; the query never goes into a LIKE pattern,
--   so % and _ are literal; a query that unaccent empties, such as a lone combining accent, matches nothing),
-- - or the query is similar to a word in it (pg_trgm word_similarity, default threshold 0.6),
-- - or the query is a display ID: the element type matches and the number starts with id_digits.
-- Names are compared without accents (unaccent), so "schaden" finds "Schäden".
-- Display IDs are not matched by similarity: "TS-7" would be similar to every TS ID.
--
-- Order: exact display ID, display ID prefix by number (TS-1, TS-10, TS-11, ...), exact name, names that
-- contain the query, names that are only similar; within each, by similarity. Name, type, and id make the
-- order total, so that pages are stable.
-- total counts all matches; a page past the last match has no rows and therefore no total.
-- name: SearchElements :many
WITH projects AS (
    SELECT p.id, p.name
    FROM tara_project p
    WHERE p.id IN (
        SELECT a.tara_project_id
        FROM project_role_assignment a
        LEFT JOIN iam_group g ON g.id = a.group_id
        WHERE a.user_id = sqlc.arg(user_id) OR g.external_iam_group_id = ANY(sqlc.arg(group_ids)::text[])
    )
    AND (cardinality(sqlc.arg(project_ids)::uuid[]) = 0 OR p.id = ANY(sqlc.arg(project_ids)::uuid[]))
), access AS (
    SELECT coalesce(array_agg(id), '{}')::uuid[] AS ids FROM projects
), candidates AS (
    SELECT 'projects'::text AS type, p.id, NULL::integer AS display_number, p.name,
        p.id AS project_id, p.name AS project_name, NULL::uuid AS item_id, NULL::text AS item_name
    FROM projects p
    UNION ALL
    SELECT 'items', i.id, i.display_number, i.name, p.id, p.name, NULL, NULL
    FROM item_definition i JOIN projects p ON p.id = i.tara_project_id
    WHERE i.tara_project_id = ANY((SELECT ids FROM access)::uuid[])
    UNION ALL
    SELECT 'assets', e.id, e.display_number, e.name, p.id, p.name, i.id, i.name
    FROM asset e JOIN projects p ON p.id = e.tara_project_id JOIN item_definition i ON i.id = e.item_definition_id
    WHERE e.tara_project_id = ANY((SELECT ids FROM access)::uuid[])
    UNION ALL
    SELECT 'damage-scenarios', e.id, e.display_number, e.title, p.id, p.name, i.id, i.name
    FROM damage_scenario e JOIN projects p ON p.id = e.tara_project_id JOIN item_definition i ON i.id = e.item_definition_id
    WHERE e.tara_project_id = ANY((SELECT ids FROM access)::uuid[])
    UNION ALL
    SELECT 'threat-scenarios', e.id, e.display_number, e.title, p.id, p.name, i.id, i.name
    FROM threat_scenario e JOIN projects p ON p.id = e.tara_project_id JOIN item_definition i ON i.id = e.item_definition_id
    WHERE e.tara_project_id = ANY((SELECT ids FROM access)::uuid[])
    UNION ALL
    SELECT 'attack-paths', e.id, e.display_number, e.title, p.id, p.name, i.id, i.name
    FROM attack_path e JOIN projects p ON p.id = e.tara_project_id JOIN item_definition i ON i.id = e.item_definition_id
    WHERE e.tara_project_id = ANY((SELECT ids FROM access)::uuid[])
), matches AS (
    SELECT c.type, c.id, c.display_number, c.name, c.project_id, c.project_name, c.item_id, c.item_name,
        (c.type = sqlc.arg(id_type)::text AND c.display_number::text = sqlc.arg(id_digits)::text) AS exact_id,
        (c.type = sqlc.arg(id_type)::text AND c.display_number::text LIKE sqlc.arg(id_digits)::text || '%') AS id_prefix,
        (btrim(unaccent(sqlc.arg(query)::text)) <> ''
            AND lower(unaccent(c.name)) = lower(unaccent(sqlc.arg(query)::text))) AS exact_name,
        (btrim(unaccent(sqlc.arg(query)::text)) <> ''
            AND strpos(lower(unaccent(c.name)), lower(unaccent(sqlc.arg(query)::text))) > 0) AS contains_query,
        unaccent(sqlc.arg(query)::text) <% unaccent(c.name) AS similar_name
    FROM candidates c
    WHERE cardinality(sqlc.arg(types)::text[]) = 0 OR c.type = ANY(sqlc.arg(types)::text[])
)
SELECT type, id, display_number, name, project_id, project_name, item_id, item_name,
    count(*) OVER () AS total
FROM matches
WHERE id_prefix OR contains_query OR similar_name
ORDER BY exact_id DESC, id_prefix DESC, CASE WHEN id_prefix THEN display_number END,
    exact_name DESC, contains_query DESC,
    word_similarity(unaccent(sqlc.arg(query)::text), unaccent(name)) DESC,
    name, type, id
LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);
