package handlers_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/auth/authtest"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi/handlers"
)

const riskThreat = "11111111-1111-4111-8111-111111111111"
const riskID = "22222222-2222-4222-8222-222222222222"
const riskImpact = "33333333-3333-4333-8333-333333333333"
const riskPrefix = "/api/v1/threat-scenarios/" + riskThreat
const riskJSON = `{"impact_rating_id":"` + riskImpact + `","risk_score":3,"determination_method":"RISK_MATRIX"}`
const treatmentJSON = `{"treatment_option":"REDUCING","decision_rationale":"Mitigate"}`

func riskTestUUID(value string) pgtype.UUID {
	var id pgtype.UUID
	if err := id.Scan(value); err != nil {
		panic(err)
	}
	return id
}

type riskFake struct {
	handlers.StatusReader
	handlers.TaraProjectStore
	handlers.ProjectAccessStore
	handlers.ProjectMemberStore
	handlers.ItemDefinitionStore
	handlers.DamageScenarioStore
	handlers.ImpactRatingStore
	handlers.ThreatDamageLinkStore
	allowed        bool
	accessErr, err error
	access         db.GetProjectRoleParams
	role           db.ProjectRole
	scenario       pgtype.UUID
	lookupErr      error
	calls          int
	valuePatch     db.PatchRiskValueParams
	treatmentPatch db.PatchRiskTreatmentDecisionParams
}

func (s *riskFake) GetProjectRole(_ context.Context, p db.GetProjectRoleParams) (db.ProjectRole, error) {
	s.access = p
	if s.accessErr != nil {
		return "", s.accessErr
	}
	if !s.allowed {
		return "", pgx.ErrNoRows
	}
	if s.role == "" {
		return db.ProjectRoleEDITOR, nil
	}
	return s.role, nil
}
func (s *riskFake) ProjectIDForThreatScenario(_ context.Context, id pgtype.UUID) (pgtype.UUID, error) {
	s.scenario = id
	return riskTestUUID("aaaaaaaa-0000-4000-8000-000000000100"), s.lookupErr
}
func (s *riskFake) value() db.RiskValue {
	return db.RiskValue{ID: riskTestUUID(riskID), ThreatScenarioID: riskTestUUID(riskThreat), ImpactRatingID: riskTestUUID(riskImpact), RiskScore: 3, DeterminationMethod: db.RiskDeterminationMethodRISKMATRIX}
}
func (s *riskFake) treatment() db.RiskTreatmentDecision {
	return db.RiskTreatmentDecision{ID: riskTestUUID(riskID), ThreatScenarioID: riskTestUUID(riskThreat), TreatmentOption: db.RiskTreatmentOptionREDUCING}
}
func (s *riskFake) ListRiskValues(context.Context, db.ListRiskValuesParams) ([]db.RiskValue, error) {
	s.calls++
	return []db.RiskValue{s.value()}, s.err
}
func (s *riskFake) GetRiskValue(context.Context, db.GetRiskValueParams) (db.RiskValue, error) {
	s.calls++
	return s.value(), s.err
}
func (s *riskFake) CreateRiskValue(context.Context, db.CreateRiskValueParams) (db.RiskValue, error) {
	s.calls++
	return s.value(), s.err
}
func (s *riskFake) ReplaceRiskValue(context.Context, db.ReplaceRiskValueParams) (db.RiskValue, error) {
	s.calls++
	return s.value(), s.err
}
func (s *riskFake) PatchRiskValue(_ context.Context, p db.PatchRiskValueParams) (db.RiskValue, error) {
	s.valuePatch = p
	s.calls++
	return s.value(), s.err
}
func (s *riskFake) DeleteRiskValue(context.Context, db.DeleteRiskValueParams) (pgtype.UUID, error) {
	s.calls++
	return riskTestUUID(riskID), s.err
}
func (s *riskFake) ListRiskTreatmentDecisions(context.Context, db.ListRiskTreatmentDecisionsParams) ([]db.RiskTreatmentDecision, error) {
	s.calls++
	return []db.RiskTreatmentDecision{s.treatment()}, s.err
}
func (s *riskFake) GetRiskTreatmentDecision(context.Context, db.GetRiskTreatmentDecisionParams) (db.RiskTreatmentDecision, error) {
	s.calls++
	return s.treatment(), s.err
}
func (s *riskFake) CreateRiskTreatmentDecision(context.Context, db.CreateRiskTreatmentDecisionParams) (db.RiskTreatmentDecision, error) {
	s.calls++
	return s.treatment(), s.err
}
func (s *riskFake) ReplaceRiskTreatmentDecision(context.Context, db.ReplaceRiskTreatmentDecisionParams) (db.RiskTreatmentDecision, error) {
	s.calls++
	return s.treatment(), s.err
}
func (s *riskFake) PatchRiskTreatmentDecision(_ context.Context, p db.PatchRiskTreatmentDecisionParams) (db.RiskTreatmentDecision, error) {
	s.treatmentPatch = p
	s.calls++
	return s.treatment(), s.err
}
func (s *riskFake) DeleteRiskTreatmentDecision(context.Context, db.DeleteRiskTreatmentDecisionParams) (pgtype.UUID, error) {
	s.calls++
	return riskTestUUID(riskID), s.err
}

type riskAPI struct {
	handler http.Handler
	token   string
}

func newRiskAPI(t *testing.T, store httpapi.Queries) *riskAPI {
	t.Helper()
	manager, token := authtest.NewManagerAndToken(t)
	return &riskAPI{handler: httpapi.New(store, manager), token: token}
}
func (a *riskAPI) call(method, path, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	if a.token != "" {
		r.Header.Set("Authorization", a.token)
	}
	w := httptest.NewRecorder()
	a.handler.ServeHTTP(w, r)
	return w
}
func TestRiskRoutes(t *testing.T) {
	s := &riskFake{allowed: true}
	a := newRiskAPI(t, s)
	for slug, body := range map[string]string{"risk-values": riskJSON, "risk-treatment-decisions": treatmentJSON} {
		collection := riskPrefix + "/" + slug
		for _, tc := range []struct {
			method, path, body string
			status             int
		}{
			{"POST", collection, body, 201}, {"GET", collection, "", 200}, {"GET", collection + "/" + riskID, "", 200},
			{"PUT", collection + "/" + riskID, body, 200}, {"PATCH", collection + "/" + riskID, `{}`, 200}, {"DELETE", collection + "/" + riskID, "", 204},
		} {
			t.Run(slug+tc.method+tc.path, func(t *testing.T) {
				w := a.call(tc.method, tc.path, tc.body)
				if w.Code != tc.status {
					t.Fatalf("got %d: %s", w.Code, w.Body)
				}
				if tc.method == http.MethodPost && w.Header().Get("Location") != collection+"/"+riskID {
					t.Fatal("incorrect Location")
				}
				if s.access.UserID != riskTestUUID(authtest.UserID) || s.scenario != riskTestUUID(riskThreat) || s.access.ProjectID != riskTestUUID("aaaaaaaa-0000-4000-8000-000000000100") {
					t.Fatalf("incorrect authorization: %+v", s.access)
				}
				token := a.token
				a.token = ""
				w = a.call(tc.method, tc.path, tc.body)
				a.token = token
				if w.Code != 401 {
					t.Fatalf("unauthenticated: %d", w.Code)
				}
				s.allowed = false
				w = a.call(tc.method, tc.path, tc.body)
				s.allowed = true
				if w.Code != 404 {
					t.Fatalf("inaccessible: %d", w.Code)
				}
				s.accessErr = errors.New("private details")
				w = a.call(tc.method, tc.path, tc.body)
				s.accessErr = nil
				if w.Code != 500 || strings.Contains(w.Body.String(), "private details") {
					t.Fatalf("authorization error: %d %s", w.Code, w.Body)
				}
				for _, failure := range []struct {
					err    error
					status int
				}{
					{pgx.ErrNoRows, 404}, {&pgconn.PgError{Code: "23505"}, 409}, {&pgconn.PgError{Code: "23503"}, 409}, {&pgconn.PgError{Code: "23514"}, 422}, {errors.New("private details"), 500},
				} {
					s.err = failure.err
					w = a.call(tc.method, tc.path, tc.body)
					s.err = nil
					if w.Code != failure.status || strings.Contains(w.Body.String(), "private details") {
						t.Fatalf("database error: %d %s", w.Code, w.Body)
					}
				}
			})
		}
	}
}
func TestRiskValidationAndPatchPresence(t *testing.T) {
	s := &riskFake{allowed: true}
	a := newRiskAPI(t, s)
	values := riskPrefix + "/risk-values"
	decisions := riskPrefix + "/risk-treatment-decisions"
	for _, tc := range []struct{ method, path, body string }{
		{"POST", values, `{}`}, {"POST", values, strings.ReplaceAll(riskJSON, `"risk_score":3`, `"risk_score":0`)},
		{"POST", values, strings.ReplaceAll(riskJSON, "RISK_MATRIX", "unknown")},
		{"POST", values, strings.ReplaceAll(riskJSON, riskImpact, "bad")},
		{"POST", decisions, `{"treatment_option":"unknown"}`},
		{"POST", decisions, `{"treatment_option":"REDUCING","risk_value_id":"bad"}`},
		{"PATCH", values + "/" + riskID, `{"risk_score":null}`},
		{"PATCH", values + "/" + riskID, `{"impact_rating_id":null}`},
		{"PATCH", values + "/" + riskID, `{"determination_method":null}`},
		{"PATCH", decisions + "/" + riskID, `{"treatment_option":null}`},
		{"PATCH", decisions + "/" + riskID, `{"is_cybersecurity_claim":null}`},
		{"PATCH", decisions + "/" + riskID, `{"decision_rationale":12}`},
		{"GET", values + "?limit=0", ""}, {"GET", values + "?offset=-1", ""}, {"GET", values + "/bad", ""},
		{"GET", "/api/v1/threat-scenarios/bad/risk-values", ""},
	} {
		if w := a.call(tc.method, tc.path, tc.body); w.Code != 422 {
			t.Errorf("%s %s %s: %d %s", tc.method, tc.path, tc.body, w.Code, w.Body)
		}
	}
	if s.calls != 0 {
		t.Fatal("invalid request reached resource storage")
	}
	for _, body := range []string{`{}`, `{"risk_value_id":null,"decision_rationale":null,"is_cybersecurity_claim":false}`, `{"risk_value_id":"` + riskID + `","decision_rationale":"why"}`} {
		if w := a.call("PATCH", decisions+"/"+riskID, body); w.Code != 200 {
			t.Fatalf("patch: %d %s", w.Code, w.Body)
		}
		var fields map[string]json.RawMessage
		if err := json.Unmarshal([]byte(body), &fields); err != nil {
			t.Fatal(err)
		}
		_, riskSent := fields["risk_value_id"]
		_, rationaleSent := fields["decision_rationale"]
		if s.treatmentPatch.SetRiskValueID != riskSent || s.treatmentPatch.SetDecisionRationale != rationaleSent {
			t.Fatal("PATCH presence lost")
		}
		if body == `{}` && s.treatmentPatch.IsCybersecurityClaim != nil {
			t.Fatal("omitted boolean supplied")
		}
		if strings.Contains(body, `"is_cybersecurity_claim":false`) && (s.treatmentPatch.IsCybersecurityClaim == nil || *s.treatmentPatch.IsCybersecurityClaim) {
			t.Fatal("explicit false lost")
		}
	}
	if w := a.call("PATCH", values+"/"+riskID, `{"risk_score":5}`); w.Code != 200 || s.valuePatch.RiskScore == nil || *s.valuePatch.RiskScore != 5 || s.valuePatch.ImpactRatingID.Valid {
		t.Fatal("partial risk update lost presence")
	}
}
func TestRiskOpenAPI(t *testing.T) {
	spec := httpapi.OpenAPI()
	for _, slug := range []string{"risk-values", "risk-treatment-decisions"} {
		singular := strings.TrimSuffix(slug, "s")
		collection := spec.Paths["/api/v1/threat-scenarios/{threat_scenario_id}/"+slug]
		member := spec.Paths["/api/v1/threat-scenarios/{threat_scenario_id}/"+slug+"/{id}"]
		if collection == nil || member == nil {
			t.Fatal("missing risk route")
		}
		for id, op := range map[string]*huma.Operation{
			"list-" + slug: collection.Get, "create-" + singular: collection.Post,
			"get-" + singular: member.Get, "replace-" + singular: member.Put,
			"update-" + singular: member.Patch, "delete-" + singular: member.Delete,
		} {
			if op == nil || len(op.Security) != 1 || op.Security[0]["bearer"] == nil {
				t.Fatal("missing authenticated operation")
			}
			if op.OperationID != id {
				t.Errorf("operation ID = %q, want %q", op.OperationID, id)
			}
			permission := "edit"
			if op.Method == http.MethodGet {
				permission = "read"
			}
			if op.Extensions["x-taramisu-permission"] != permission || op.Responses["403"] == nil {
				t.Errorf("missing project permission or forbidden response for %s", id)
			}
		}
		if collection.Post.Responses["201"] == nil || member.Delete.Responses["204"] == nil {
			t.Fatal("incorrect CRUD success statuses")
		}
	}
}

func TestRiskProjectPermissions(t *testing.T) {
	for _, tc := range []struct {
		name      string
		allowed   bool
		role      db.ProjectRole
		lookupErr error
	}{
		{name: "non-member"},
		{name: "missing scenario", allowed: true, lookupErr: pgx.ErrNoRows},
		{name: "viewer", allowed: true, role: db.ProjectRoleVIEWER},
		{name: "editor", allowed: true, role: db.ProjectRoleEDITOR},
		{name: "owner", allowed: true, role: db.ProjectRoleOWNER},
	} {
		t.Run(tc.name, func(t *testing.T) {
			store := &riskFake{allowed: tc.allowed, role: tc.role, lookupErr: tc.lookupErr}
			api := newRiskAPI(t, store)
			for slug, body := range map[string]string{"risk-values": riskJSON, "risk-treatment-decisions": treatmentJSON} {
				collection := riskPrefix + "/" + slug
				member := collection + "/" + riskID
				for _, operation := range []struct {
					method, path, body string
					status             int
				}{
					{"GET", collection, "", 200}, {"GET", member, "", 200},
					{"POST", collection, body, 201}, {"PUT", member, body, 200},
					{"PATCH", member, `{}`, 200}, {"DELETE", member, "", 204},
				} {
					want := operation.status
					if !tc.allowed || tc.lookupErr != nil {
						want = 404
					} else if tc.role == db.ProjectRoleVIEWER && operation.method != "GET" {
						want = 403
					}
					before := store.calls
					response := api.call(operation.method, operation.path, operation.body)
					if response.Code != want {
						t.Errorf("%s %s: got %d, want %d: %s", operation.method, operation.path, response.Code, want, response.Body)
					}
					if want >= 400 && store.calls != before {
						t.Fatal("denied request reached resource storage")
					}
				}
			}
		})
	}
}
