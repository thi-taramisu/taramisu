package handlers_test

import (
	"context"
	"fmt"
	"net/http"
	"reflect"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
)

type auditRequest func(http.Handler, string, string, string, string, int) map[string]any

// rejectAuditInsert forces PostgreSQL to reject the audit event after the handler's mutation.
type rejectAuditInsert struct{ *db.Store }

func (f rejectAuditInsert) Audit(ctx context.Context, actor db.Actor, change func(context.Context) (db.Change, error)) error {
	return f.Store.Audit(ctx, actor, func(ctx context.Context) (db.Change, error) {
		event, err := change(ctx)
		if err == nil && event.Event != "" {
			event.Event += "\x00"
		}
		return event, err
	})
}

type resourceAuditFixture struct {
	t                  *testing.T
	ctx                context.Context
	pool               *pgxpool.Pool
	serve              auditRequest
	handler, failing   http.Handler
	project, actor     string
	rollbackOperations map[string]bool
}

func (f resourceAuditFixture) seed(query string, args ...any) string {
	f.t.Helper()
	var id string
	if err := f.pool.QueryRow(f.ctx, query, args...).Scan(&id); err != nil {
		f.t.Fatal(err)
	}
	return id
}

type auditResource struct {
	target, operation, path string
	parentColumn, parentID  string
	create, replace, patch  string
	upsert                  bool
	unavailableOnFailure    bool
}

func (f resourceAuditFixture) exercise(r auditResource) {
	f.t.Helper()
	// These table and column names are constants supplied by the test cases below.
	snapshot := func() string {
		return f.seed(fmt.Sprintf(`SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id), '[]'::jsonb)::text FROM %s r WHERE %s = $1`, r.target, r.parentColumn), r.parentID)
	}
	history := func() []storedEvent { return auditEvents(f.t, f.ctx, f.pool, f.project) }
	request := func(operation, method, path, body string, status int) map[string]any {
		return f.serve(f.handler, operation, method, path, body, status)
	}
	rollback := func(operation, method, path, body string) {
		f.t.Helper()
		beforeRows, beforeEvents := snapshot(), history()
		status, message := http.StatusInternalServerError, "unexpected error"
		if r.unavailableOnFailure {
			status, message = http.StatusServiceUnavailable, "asset property database operation failed"
		}
		logged := captureLog(f.t, message, func() {
			f.serve(f.failing, operation, method, path, body, status)
		})
		if len(logged) != 1 || !strings.Contains(fmt.Sprint(logged[0]["error"]), "22021") {
			f.t.Fatalf("%s: expected PostgreSQL to reject the audit insert, got %v", operation, logged)
		}
		if snapshot() != beforeRows || !reflect.DeepEqual(history(), beforeEvents) {
			f.t.Fatalf("%s: failed audit insert changed the resource or its audit history", operation)
		}
		f.rollbackOperations[operation] = true
	}
	checkEvent := func(count int, operation, action, id string, before, after any) {
		f.t.Helper()
		events := history()
		want := storedEvent{f.actor, r.target + "." + action, r.target, id, before, after, operation}
		if len(events) != count+1 {
			f.t.Fatalf("%s: expected one new event, got %d", operation, len(events)-count)
		}
		if got := events[count]; !reflect.DeepEqual(got, want) {
			f.t.Fatalf("%s: expected new event %+v, got %+v", operation, want, got)
		}
	}
	checkNoEvent := func(operation, method, path, body string, status int) {
		f.t.Helper()
		before := history()
		request(operation, method, path, body, status)
		if !reflect.DeepEqual(history(), before) {
			f.t.Fatalf("%s %s: unchanged or rejected request wrote an audit event", method, path)
		}
	}

	createMethod, createOperation, createStatus := http.MethodPost, "create-"+r.operation, http.StatusCreated
	if r.upsert {
		createMethod, createOperation, createStatus = http.MethodPut, "replace-"+r.operation, http.StatusOK
	}
	rollback(createOperation, createMethod, r.path, r.create)
	count := len(history())
	current := request(createOperation, createMethod, r.path, r.create, createStatus)
	id := current["id"].(string)
	checkEvent(count, createOperation, "created", id, nil, current)
	member := r.path
	if !r.upsert {
		member += "/" + id
	}
	updates := []struct{ operation, method, body string }{
		{"replace-" + r.operation, http.MethodPut, r.replace},
		{"update-" + r.operation, http.MethodPatch, r.patch},
	}
	for _, update := range updates {
		if update.body == "" {
			continue
		}
		rollback(update.operation, update.method, member, update.body)
		count = len(history())
		next := request(update.operation, update.method, member, update.body, http.StatusOK)
		checkEvent(count, update.operation, "updated", id, current, next)
		checkNoEvent(update.operation, update.method, member, update.body, http.StatusOK)
		current = next
	}
	deleteOperation := "delete-" + r.operation
	rollback(deleteOperation, http.MethodDelete, member, "")
	count = len(history())
	request(deleteOperation, http.MethodDelete, member, "", http.StatusNoContent)
	checkEvent(count, deleteOperation, "deleted", id, current, nil)
	checkNoEvent(deleteOperation, http.MethodDelete, member, "", http.StatusNotFound)
	for _, update := range updates {
		if update.body != "" && (!r.upsert || update.method != http.MethodPut) {
			checkNoEvent(update.operation, update.method, member, update.body, http.StatusNotFound)
		}
	}
}

func (f resourceAuditFixture) exerciseAssetAudit(itemID string) {
	item := "/api/v1/item-definitions/" + itemID
	f.exercise(auditResource{
		target: "asset", operation: "asset", path: item + "/assets",
		parentColumn: "item_definition_id", parentID: itemID,
		create: "{\"name\":\"Controller\"}", replace: "{\"name\":\"Gateway\",\"description\":\"Vehicle network\"}",
		patch: "{\"description\":null}",
	})
	assetID := f.seed("INSERT INTO asset (item_definition_id, name) VALUES ($1, 'Link asset') RETURNING id::text", itemID)
	f.exercise(auditResource{
		unavailableOnFailure: true, target: "asset_cybersecurity_property", operation: "asset-cybersecurity-property",
		path: item + "/assets/" + assetID + "/cybersecurity-properties", parentColumn: "asset_id", parentID: assetID,
		create: "{\"property_type\":\"INTEGRITY\"}", replace: "{\"property_type\":\"AVAILABILITY\",\"description\":\"Required\"}",
		patch: "{\"description\":null}",
	})
	propertyID := f.seed("INSERT INTO asset_cybersecurity_property (asset_id, property_type) VALUES ($1, 'INTEGRITY') RETURNING id::text", assetID)
	otherProperty := f.seed("INSERT INTO asset_cybersecurity_property (asset_id, property_type) VALUES ($1, 'CONFIDENTIALITY') RETURNING id::text", assetID)
	damageID := f.seed("INSERT INTO damage_scenario (item_definition_id, title) VALUES ($1, 'Damage') RETURNING id::text", itemID)
	f.exercise(auditResource{
		unavailableOnFailure: true, target: "damage_scenario_asset_property", operation: "damage-scenario-asset-property",
		path: item + "/damage-scenario-asset-properties", parentColumn: "damage_scenario_id", parentID: damageID,
		create:  fmt.Sprintf("{\"damage_scenario_id\":%q,\"asset_cybersecurity_property_id\":%q}", damageID, propertyID),
		replace: fmt.Sprintf("{\"damage_scenario_id\":%q,\"asset_cybersecurity_property_id\":%q,\"compromise_mechanism_note\":\"Tampering\"}", damageID, propertyID),
		patch:   "{\"compromise_mechanism_note\":null}",
	})
	threatID := f.seed("INSERT INTO threat_scenario (item_definition_id, title) VALUES ($1, 'Threat') RETURNING id::text", itemID)
	f.exercise(auditResource{
		unavailableOnFailure: true, target: "threat_scenario_asset_property", operation: "threat-scenario-asset-property",
		path: item + "/threat-scenario-asset-properties", parentColumn: "threat_scenario_id", parentID: threatID,
		create:  fmt.Sprintf("{\"threat_scenario_id\":%q,\"asset_cybersecurity_property_id\":%q}", threatID, propertyID),
		replace: fmt.Sprintf("{\"threat_scenario_id\":%q,\"asset_cybersecurity_property_id\":%q}", threatID, otherProperty),
		patch:   fmt.Sprintf("{\"asset_cybersecurity_property_id\":%q}", propertyID),
	})
}

func (f resourceAuditFixture) exerciseDamageAudit(itemID string) {
	collection := "/api/v1/item-definitions/" + itemID + "/damage-scenarios"
	f.exercise(auditResource{
		target: "damage_scenario", operation: "damage-scenario", path: collection,
		parentColumn: "item_definition_id", parentID: itemID,
		create: "{\"title\":\"Control loss\"}", replace: "{\"title\":\"Steering loss\",\"road_user_harm_description\":\"Injury\"}",
		patch: "{\"road_user_harm_description\":null}",
	})
	damageID := f.seed("INSERT INTO damage_scenario (item_definition_id, title) VALUES ($1, 'Rated damage') RETURNING id::text", itemID)
	f.exercise(auditResource{
		target: "impact_rating", operation: "impact-rating", path: collection + "/" + damageID + "/impact-ratings",
		parentColumn: "damage_scenario_id", parentID: damageID,
		create:  "{\"impact_category\":\"SAFETY\",\"rating_value\":\"MAJOR\"}",
		replace: "{\"impact_category\":\"SAFETY\",\"rating_value\":\"SEVERE\"}",
		patch:   "{\"omission_or_rating_rationale\":\"Potential injury\"}",
	})
}

func (f resourceAuditFixture) exerciseAttackAudit(itemID string) {
	item := "/api/v1/item-definitions/" + itemID
	f.exercise(auditResource{
		target: "attack_path", operation: "attack-path", path: item + "/attack-paths",
		parentColumn: "item_definition_id", parentID: itemID,
		create: "{\"title\":\"Access interface\"}", replace: "{\"title\":\"Access debug interface\",\"analysis_approach\":\"BOTTOM_UP\"}",
		patch: "{\"is_partial_early_stage\":false}",
	})
	attackPath := f.seed("INSERT INTO attack_path (item_definition_id, title) VALUES ($1, 'Rated path') RETURNING id::text", itemID)
	f.exercise(auditResource{
		target: "attack_feasibility_rating", operation: "attack-feasibility-rating", path: item + "/attack-paths/" + attackPath + "/feasibility-rating",
		parentColumn: "attack_path_id", parentID: attackPath, upsert: true,
		create: "{\"rationale\":\"Physical access\"}", replace: "{\"rationale\":\"Debug connector\"}",
		patch: "{\"rationale\":null}",
	})
	threat := f.seed("INSERT INTO threat_scenario (item_definition_id, title) VALUES ($1, 'Threat') RETURNING id::text", itemID)
	damage := f.seed("INSERT INTO damage_scenario (item_definition_id, title) VALUES ($1, 'Damage') RETURNING id::text", itemID)
	f.exercise(auditResource{
		target: "threat_damage_link", operation: "threat-damage-link", path: item + "/threat-damage-links",
		parentColumn: "threat_scenario_id", parentID: threat,
		create: fmt.Sprintf("{\"threat_scenario_id\":%q,\"damage_scenario_id\":%q}", threat, damage),
	})
	f.exercise(auditResource{
		target: "threat_attack_path_link", operation: "threat-attack-path-link", path: item + "/threat-attack-path-links",
		parentColumn: "threat_scenario_id", parentID: threat,
		create: fmt.Sprintf("{\"threat_scenario_id\":%q,\"attack_path_id\":%q}", threat, attackPath),
	})
}

func (f resourceAuditFixture) exerciseRiskAudit(itemID string) {
	threat := f.seed("INSERT INTO threat_scenario (item_definition_id, title) VALUES ($1, 'Threat') RETURNING id::text", itemID)
	damage := f.seed("INSERT INTO damage_scenario (item_definition_id, title) VALUES ($1, 'Damage') RETURNING id::text", itemID)
	impact := f.seed("INSERT INTO impact_rating (damage_scenario_id, impact_category) VALUES ($1, 'SAFETY') RETURNING id::text", damage)
	scenario := "/api/v1/threat-scenarios/" + threat
	f.exercise(auditResource{
		target: "risk_value", operation: "risk-value", path: scenario + "/risk-values",
		parentColumn: "threat_scenario_id", parentID: threat,
		create:  fmt.Sprintf("{\"impact_rating_id\":%q,\"risk_score\":3,\"determination_method\":\"RISK_MATRIX\"}", impact),
		replace: fmt.Sprintf("{\"impact_rating_id\":%q,\"risk_score\":4,\"determination_method\":\"RISK_MATRIX\"}", impact),
		patch:   "{\"risk_score\":5}",
	})
	value := f.seed("INSERT INTO risk_value (threat_scenario_id, impact_rating_id, risk_score, determination_method) VALUES ($1, $2, 3, 'RISK_MATRIX') RETURNING id::text", threat, impact)
	f.exercise(auditResource{
		target: "risk_treatment_decision", operation: "risk-treatment-decision", path: scenario + "/risk-treatment-decisions",
		parentColumn: "threat_scenario_id", parentID: threat,
		create:  "{\"treatment_option\":\"REDUCING\"}",
		replace: fmt.Sprintf("{\"risk_value_id\":%q,\"treatment_option\":\"RETAINING\",\"decision_rationale\":\"Accepted\",\"is_cybersecurity_claim\":true}", value),
		patch:   "{\"risk_value_id\":null,\"decision_rationale\":null,\"is_cybersecurity_claim\":false,\"treatment_option\":\"REDUCING\"}",
	})
}
