package handlers_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/thi-taramisu/taramisu/backend/internal/auth/authtest"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi/handlers"
)

type threatStore struct {
	fakeDamage
	audit auditRecorder
	row   db.ThreatScenario
	page  db.ListThreatScenariosParams
}

func (s *threatStore) Audit(ctx context.Context, actor db.Actor, change func(context.Context) (db.Change, error)) error {
	return s.audit.Audit(ctx, actor, change)
}

func (s *threatStore) CreateThreatScenario(_ context.Context, p db.CreateThreatScenarioParams) (db.ThreatScenario, error) {
	s.row = db.ThreatScenario{ID: dmgUUID(dmgThreatID), ItemDefinitionID: p.ItemDefinitionID, DisplayNumber: 7,
		Title: p.Title, CauseOfCompromise: p.CauseOfCompromise, ElicitationMethod: p.ElicitationMethod, TechnicalNotes: p.TechnicalNotes}
	return s.row, nil
}

func (s *threatStore) GetThreatScenario(_ context.Context, p db.GetThreatScenarioParams) (db.ThreatScenario, error) {
	if s.row.ID != p.ID || s.row.ItemDefinitionID != p.ItemDefinitionID {
		return db.ThreatScenario{}, pgx.ErrNoRows
	}
	return s.row, nil
}

func (s *threatStore) GetThreatScenarioForUpdate(ctx context.Context, p db.GetThreatScenarioForUpdateParams) (db.ThreatScenario, error) {
	return s.GetThreatScenario(ctx, db.GetThreatScenarioParams(p))
}

func (s *threatStore) GetThreatScenarioForDelete(ctx context.Context, p db.GetThreatScenarioForDeleteParams) (db.ThreatScenario, error) {
	return s.GetThreatScenario(ctx, db.GetThreatScenarioParams(p))
}

func (s *threatStore) ListThreatScenarios(_ context.Context, p db.ListThreatScenariosParams) ([]db.ThreatScenario, error) {
	s.page = p
	return []db.ThreatScenario{s.row}, nil
}

func (s *threatStore) ReplaceThreatScenario(_ context.Context, p db.ReplaceThreatScenarioParams) (db.ThreatScenario, error) {
	s.row.Title, s.row.CauseOfCompromise = p.Title, p.CauseOfCompromise
	s.row.ElicitationMethod, s.row.TechnicalNotes = p.ElicitationMethod, p.TechnicalNotes
	return s.row, nil
}

func (s *threatStore) UpdateThreatScenario(_ context.Context, p db.UpdateThreatScenarioParams) (db.ThreatScenario, error) {
	if p.SetElicitationMethod {
		s.row.ElicitationMethod = p.ElicitationMethod
	}
	return s.row, nil
}

func (s *threatStore) DeleteThreatScenario(context.Context, db.DeleteThreatScenarioParams) (int64, error) {
	s.row = db.ThreatScenario{}
	return 1, nil
}

func TestThreatScenarioRoutes(t *testing.T) {
	manager, bearer := authtest.NewManagerAndToken(t)
	store := &threatStore{fakeDamage: fakeDamage{role: db.ProjectRoleEDITOR}}
	h := httpapi.New(store, manager)
	collection := "/api/v1/item-definitions/" + dmgItemID + "/threat-scenarios"
	member := collection + "/" + dmgThreatID
	call := func(method, path, body string, want int) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", bearer)
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		if rr.Code != want {
			t.Fatalf("%s %s: status = %d, want %d: %s", method, path, rr.Code, want, rr.Body.String())
		}
		return rr
	}
	call(http.MethodPost, collection, `{"title":"Scenario","elicitation_method":"UNKNOWN"}`, http.StatusUnprocessableEntity)
	created := call(http.MethodPost, collection, `{"title":"Scenario","elicitation_method":"STRIDE","technical_notes":"notes"}`, http.StatusCreated)
	if got := created.Header().Get("Location"); got != member {
		t.Fatalf("Location = %q, want %q", got, member)
	}
	read := func(rr *httptest.ResponseRecorder) handlers.ThreatScenarioBody {
		t.Helper()
		var body handlers.ThreatScenarioBody
		if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		return body
	}
	if got := read(call(http.MethodGet, member, "", http.StatusOK)); got.DisplayID != "TS-7" || got.ElicitationMethod == nil || *got.ElicitationMethod != db.ElicitationMethodSTRIDE {
		t.Fatalf("read returned %+v", got)
	}
	call(http.MethodGet, collection+"?limit=2&offset=5", "", http.StatusOK)
	if store.page.PageLimit != 2 || store.page.PageOffset != 5 || store.page.ItemDefinitionID != dmgUUID(dmgItemID) {
		t.Fatalf("unexpected pagination: %+v", store.page)
	}
	call(http.MethodGet, strings.Replace(member, dmgItemID, dmgRatingID, 1), "", http.StatusNotFound)
	if got := read(call(http.MethodPatch, member, `{"elicitation_method":null}`, http.StatusOK)); got.ElicitationMethod != nil || got.TechnicalNotes == nil {
		t.Fatalf("PATCH should clear the method and preserve notes: %+v", got)
	}
	store.role = db.ProjectRoleVIEWER
	call(http.MethodDelete, member, "", http.StatusForbidden)
	store.role = db.ProjectRoleEDITOR
	if got := read(call(http.MethodPut, member, `{"title":"Replaced"}`, http.StatusOK)); got.Title != "Replaced" || got.TechnicalNotes != nil {
		t.Fatalf("PUT should clear omitted notes: %+v", got)
	}
	call(http.MethodDelete, member, "", http.StatusNoContent)
	call(http.MethodGet, member, "", http.StatusNotFound)
	if changes := store.audit.changes; len(changes) != 4 || changes[0].Event != "threat_scenario.created" || changes[3].Event != "threat_scenario.deleted" {
		t.Fatalf("unexpected audit events: %+v", changes)
	}
}
