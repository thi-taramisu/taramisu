package handlers_test

import (
	"context"
	"strings"
	"testing"
)

func TestPropertyAndLinkProjectRolesPostgres(t *testing.T) {
	f := newPropertyFixture(t)
	ctx := context.Background()
	root := "/api/v1/item-definitions/" + f.item
	var damageLink, threatLink string
	if err := f.tx.QueryRow(ctx, `INSERT INTO damage_scenario_asset_property (damage_scenario_id,asset_cybersecurity_property_id) VALUES ($1,$2) RETURNING id::text`, f.damage, f.property).Scan(&damageLink); err != nil {
		t.Fatal(err)
	}
	if err := f.tx.QueryRow(ctx, `INSERT INTO threat_scenario_asset_property (threat_scenario_id,asset_cybersecurity_property_id) VALUES ($1,$2) RETURNING id::text`, f.threat, f.property).Scan(&threatLink); err != nil {
		t.Fatal(err)
	}
	routes := []propertyRouteCase{
		{"asset", root + "/assets", root + "/assets/" + f.asset, `{"name":"ECU"}`},
		{"property", root + "/assets/" + f.secondAsset + "/cybersecurity-properties", root + "/assets/" + f.secondAsset + "/cybersecurity-properties/" + f.property, `{"property_type":"INTEGRITY"}`},
		{"damage", root + "/damage-scenario-asset-properties", root + "/damage-scenario-asset-properties/" + damageLink, `{"damage_scenario_id":"` + f.damage + `","asset_cybersecurity_property_id":"` + f.property + `"}`},
		{"threat", root + "/threat-scenario-asset-properties", root + "/threat-scenario-asset-properties/" + threatLink, `{"threat_scenario_id":"` + f.threat + `","asset_cybersecurity_property_id":"` + f.property + `"}`},
	}
	// This group grants Editor only in the first item's project.
	if _, err := f.tx.Exec(ctx, `WITH added_group AS (INSERT INTO iam_group (external_iam_group_id) VALUES ($1) RETURNING id)
        INSERT INTO project_role_assignment (tara_project_id,group_id,project_role)
        SELECT i.tara_project_id,g.id,'EDITOR' FROM item_definition i,added_group g WHERE i.id=$2`, teamGroupID, f.item); err != nil {
		t.Fatal(err)
	}
	outsider := *f.api
	outsider.token = "Bearer " + f.authFixture.Token(t, map[string]any{"sub": "property-api-outsider"})
	// A group assignment grants no access without the signed group claim.
	for _, route := range routes {
		for _, method := range []string{"GET", "POST", "PUT", "PATCH", "DELETE", "LIST"} {
			path, verb := route.member, method
			if method == "POST" || method == "LIST" {
				path = route.collection
			}
			if method == "LIST" {
				verb = "GET"
			}
			propertyStatus(t, outsider.Do(verb, path, strings.NewReader(route.body)), 404)
		}
	}
	// The project was created through the API; adjust its fixture role to exercise Viewer writes.
	if _, err := f.tx.Exec(ctx, `UPDATE project_role_assignment SET project_role='VIEWER'
        WHERE user_id IS NOT NULL AND tara_project_id=(SELECT tara_project_id FROM item_definition WHERE id=$1)`, f.item); err != nil {
		t.Fatal(err)
	}
	for _, route := range routes {
		propertyStatus(t, f.api.Get(route.collection), 200)
		propertyStatus(t, f.api.Get(route.member), 200)
		for _, method := range []string{"POST", "PUT", "PATCH", "DELETE"} {
			path := route.member
			if method == "POST" {
				path = route.collection
			}
			propertyStatus(t, f.api.Do(method, path, strings.NewReader(route.body)), 403)
		}
	}
	if _, err := f.tx.Exec(ctx, `UPDATE project_role_assignment SET project_role='EDITOR'
        WHERE user_id IS NOT NULL AND tara_project_id=(SELECT tara_project_id FROM item_definition WHERE id=$1)`, f.item); err != nil {
		t.Fatal(err)
	}
	groupMember := outsider
	groupMember.token = "Bearer " + f.authFixture.Token(t, map[string]any{"sub": "property-api-outsider", "taramisu_groups": []string{teamGroupID}})
	for _, route := range routes {
		propertyStatus(t, f.api.Patch(route.member, map[string]any{}), 200)
		propertyStatus(t, groupMember.Get(route.collection), 200)
		propertyStatus(t, groupMember.Get(route.member), 200)
		propertyStatus(t, groupMember.Patch(route.member, map[string]any{}), 200)
		propertyStatus(t, groupMember.Get(strings.Replace(route.collection, f.item, f.otherItem, 1)), 404)
	}
}
