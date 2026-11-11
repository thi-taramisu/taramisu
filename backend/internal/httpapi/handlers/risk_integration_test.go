package handlers_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/thi-taramisu/taramisu/backend/internal/auth/authtest"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi/handlers"
)

func TestRiskPostgresLifecycle(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to run PostgreSQL integration tests")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := tx.Rollback(ctx); err != nil && !errors.Is(err, pgx.ErrTxClosed) {
			t.Error(err)
		}
	}()
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := tx.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	const item = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
	const otherItem = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
	const otherThreat = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
	const otherImpact = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
	const damage = "ffffffff-ffff-4fff-8fff-ffffffffffff"
	const otherDamage = "99999999-9999-4999-8999-999999999999"
	queries := db.NewStore(tx)
	fixture := authtest.NewFixture(t, queries)
	a := &riskAPI{handler: httpapi.New(queries, fixture.Manager), token: "Bearer " + fixture.Token(t, nil)}
	createdProject := a.call("POST", "/api/v1/projects", `{"name":"Risk test"}`)
	var projectBody handlers.TaraProjectBody
	if createdProject.Code != 201 || json.Unmarshal(createdProject.Body.Bytes(), &projectBody) != nil {
		t.Fatalf("create project: %d %s", createdProject.Code, createdProject.Body)
	}
	project := projectBody.ID
	exec(`INSERT INTO item_definition(id,tara_project_id,name,scope_type) VALUES($1,$3,'First','ITEM'),($2,$3,'Other','ITEM')`, item, otherItem, project)
	exec(`INSERT INTO threat_scenario(id,item_definition_id,title) VALUES($1,$2,'Threat'),($3,$4,'Other threat')`, riskThreat, item, otherThreat, otherItem)
	exec(`INSERT INTO damage_scenario(id,item_definition_id,title) VALUES($1,$2,'Damage'),($3,$4,'Other damage')`, damage, item, otherDamage, otherItem)
	exec(`INSERT INTO impact_rating(id,damage_scenario_id,impact_category) VALUES($1,$2,'SAFETY'),($3,$4,'SAFETY')`, riskImpact, damage, otherImpact, otherDamage)
	call := func(method, path, body string, want int) *httptest.ResponseRecorder {
		t.Helper()
		exec("SAVEPOINT risk_request")
		w := a.call(method, path, body)
		if w.Code >= 400 {
			exec("ROLLBACK TO SAVEPOINT risk_request")
		}
		exec("RELEASE SAVEPOINT risk_request")
		if w.Code != want {
			t.Fatalf("%s %s %s: got %d, want %d: %s", method, path, body, w.Code, want, w.Body)
		}
		return w
	}
	readValue := func(w *httptest.ResponseRecorder) handlers.RiskValue {
		t.Helper()
		var out handlers.RiskValue
		if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		return out
	}
	readDecision := func(w *httptest.ResponseRecorder) handlers.RiskTreatmentDecision {
		t.Helper()
		var out handlers.RiskTreatmentDecision
		if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		return out
	}
	values := riskPrefix + "/risk-values"
	decisions := riskPrefix + "/risk-treatment-decisions"
	empty := call("GET", values, "", 200)
	if strings.TrimSpace(empty.Body.String()) != "[]" {
		t.Fatalf("empty list: %s", empty.Body)
	}
	value := readValue(call("POST", values, riskJSON, 201))
	path := values + "/" + value.ID
	if value.ID == "" || value.ThreatScenarioID != riskThreat || value.RiskScore != 3 {
		t.Fatalf("created risk: %+v", value)
	}
	if got := readValue(call("GET", path, "", 200)); got.ImpactRatingID != riskImpact {
		t.Fatal("risk reference not persisted")
	}
	call("POST", values, riskJSON, 409)
	foreign := strings.ReplaceAll(riskJSON, riskImpact, otherImpact)
	call("POST", values, foreign, 404)
	call("PUT", path, foreign, 404)
	call("PATCH", path, `{"impact_rating_id":"`+otherImpact+`"}`, 404)
	call("GET", "/api/v1/threat-scenarios/"+otherThreat+"/risk-values/"+value.ID, "", 404)
	value = readValue(call("PATCH", path, `{"risk_score":5}`, 200))
	if value.RiskScore != 5 || value.ImpactRatingID != riskImpact {
		t.Fatal("PATCH overwrote omitted risk fields")
	}
	value = readValue(call("PUT", path, strings.ReplaceAll(riskJSON, "RISK_MATRIX", "RISK_FORMULA"), 200))
	if value.RiskScore != 3 || value.DeterminationMethod != db.RiskDeterminationMethodRISKFORMULA {
		t.Fatal("PUT did not replace risk")
	}
	value = readValue(call("PATCH", path, `{"impact_rating_id":"`+riskImpact+`","determination_method":"RISK_MATRIX"}`, 200))
	if value.DeterminationMethod != db.RiskDeterminationMethodRISKMATRIX {
		t.Fatal("enum patch not persisted")
	}
	var listed []handlers.RiskValue
	w := call("GET", values+"?limit=1&offset=0", "", 200)
	if json.Unmarshal(w.Body.Bytes(), &listed) != nil || len(listed) != 1 {
		t.Fatalf("pagination: %s", w.Body)
	}
	if got := call("GET", values+"?limit=1&offset=1", "", 200); strings.TrimSpace(got.Body.String()) != "[]" {
		t.Fatal("offset ignored")
	}
	decision := readDecision(call("POST", decisions, `{"risk_value_id":"`+value.ID+`","treatment_option":"RETAINING","is_cybersecurity_claim":true,"decision_rationale":"Accepted"}`, 201))
	dpath := decisions + "/" + decision.ID
	decision = readDecision(call("GET", dpath, "", 200))
	if decision.RiskValueID == nil || *decision.RiskValueID != value.ID || !decision.IsCybersecurityClaim {
		t.Fatal("decision fields not persisted")
	}
	call("DELETE", path, "", 409)
	call("PATCH", dpath, `{"is_cybersecurity_claim":false}`, 422)
	call("POST", decisions, `{"treatment_option":"SHARING"}`, 422)
	foreignDecision := `{"risk_value_id":"` + value.ID + `","treatment_option":"REDUCING"}`
	otherDecisions := "/api/v1/threat-scenarios/" + otherThreat + "/risk-treatment-decisions"
	call("POST", otherDecisions, foreignDecision, 404)
	other := readDecision(call("POST", otherDecisions, treatmentJSON, 201))
	call("PUT", otherDecisions+"/"+other.ID, foreignDecision, 404)
	call("PATCH", otherDecisions+"/"+other.ID, `{"risk_value_id":"`+value.ID+`"}`, 404)
	call("GET", otherDecisions+"/"+decision.ID, "", 404)
	decision = readDecision(call("PATCH", dpath, `{"treatment_option":"REDUCING","is_cybersecurity_claim":false,"risk_value_id":null,"decision_rationale":null}`, 200))
	if decision.RiskValueID != nil || decision.DecisionRationale != nil || decision.IsCybersecurityClaim {
		t.Fatal("nullable PATCH or false ignored")
	}
	decision = readDecision(call("PATCH", dpath, `{"risk_value_id":"`+value.ID+`","decision_rationale":"New rationale"}`, 200))
	if decision.RiskValueID == nil || decision.DecisionRationale == nil || decision.TreatmentOption != db.RiskTreatmentOptionREDUCING {
		t.Fatal("PATCH lost omitted fields")
	}
	decision = readDecision(call("PUT", dpath, treatmentJSON, 200))
	if decision.RiskValueID != nil || decision.DecisionRationale == nil {
		t.Fatal("PUT did not clear omitted reference")
	}
	decision = readDecision(call("PUT", dpath, `{"treatment_option":"AVOIDING"}`, 200))
	if decision.DecisionRationale != nil {
		t.Fatal("PUT did not clear omitted rationale")
	}
	call("GET", decisions+"?limit=1&offset=0", "", 200)
	// Project roles are enforced for reads and writes, including inherited group assignments.
	exec(`UPDATE project_role_assignment SET project_role='VIEWER' WHERE tara_project_id=$1`, project)
	for _, resource := range []struct{ collection, member, body string }{{values, path, riskJSON}, {decisions, dpath, treatmentJSON}} {
		call("GET", resource.collection, "", 200)
		call("GET", resource.member, "", 200)
		for _, method := range []string{"POST", "PUT", "PATCH", "DELETE"} {
			target := resource.member
			if method == "POST" {
				target = resource.collection
			}
			call(method, target, resource.body, 403)
		}
	}
	exec(`DELETE FROM project_role_assignment WHERE tara_project_id=$1`, project)
	call("GET", values, "", 404)
	call("GET", decisions, "", 404)
	const group = "88888888-8888-4888-8888-888888888888"
	const externalGroup = "77777777-7777-4777-8777-777777777777"
	exec(`INSERT INTO iam_group(id,external_iam_group_id) VALUES($1,$2)`, group, externalGroup)
	exec(`INSERT INTO project_role_assignment(tara_project_id,group_id,project_role) VALUES($1,$2,'EDITOR')`, project, group)
	// A group assignment alone grants nothing until the signed token carries that group.
	call("PATCH", path, `{"risk_score":2}`, 404)
	a.token = "Bearer " + fixture.Token(t, map[string]any{"taramisu_groups": []string{externalGroup}})
	call("GET", values, "", 200)
	call("GET", decisions, "", 200)
	call("PATCH", path, `{"risk_score":2}`, 200)
	call("DELETE", dpath, "", 204)
	call("DELETE", dpath, "", 404)
	call("DELETE", path, "", 204)
	call("GET", path, "", 404)
	call("PATCH", path, `{}`, 404)
	call("DELETE", otherDecisions+"/"+other.ID, "", 204)
}
