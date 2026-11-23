package handlers_test

import (
	"net/http"
	"slices"
	"sort"
	"strings"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
)

// versionedOperations accept If-Match and reject a change based on an outdated version with 412
// (docs/internal/architecture/backend/backend-architecture.md#conflicting-edits).
var versionedOperations = []string{
	"replace-tara-project", "update-tara-project", "delete-tara-project",
	"update-project-member", "remove-project-member",
	"replace-item-definition", "update-item-definition", "delete-item-definition",
}

// notVersionedYet change records that have a version, but do not check If-Match yet. Move an
// operation to versionedOperations when it does; new operations must go into one of the lists.
var notVersionedYet = []string{
	"replace-asset", "update-asset", "delete-asset",
	"replace-asset-cybersecurity-property", "update-asset-cybersecurity-property", "delete-asset-cybersecurity-property",
	"replace-damage-scenario-asset-property", "update-damage-scenario-asset-property", "delete-damage-scenario-asset-property",
	"replace-threat-scenario-asset-property", "update-threat-scenario-asset-property", "delete-threat-scenario-asset-property",
	"replace-attack-path", "update-attack-path", "delete-attack-path",
	"replace-attack-feasibility-rating", "update-attack-feasibility-rating", "delete-attack-feasibility-rating",
	"replace-damage-scenario", "update-damage-scenario", "delete-damage-scenario",
	"replace-impact-rating", "update-impact-rating", "delete-impact-rating",
	"replace-risk-value", "update-risk-value", "delete-risk-value",
	"replace-risk-treatment-decision", "update-risk-treatment-decision", "delete-risk-treatment-decision",
}

// unversioned change records that have nothing to overwrite: a link has no fields besides its two
// ends, an attachment cannot be edited, and deleting one that is already gone returns 404.
var unversioned = []string{
	"delete-threat-damage-link", "delete-threat-attack-path-link", "delete-attachment",
}

// TestEveryChangeIsDeclaredForVersions makes adding a PUT, PATCH, or DELETE a conscious decision about
// conflicting edits, like TestEveryChangeIsDeclaredForAudit for the audit history. Creating a record
// needs no version: there is no earlier state to overwrite.
func TestEveryChangeIsDeclaredForVersions(t *testing.T) {
	declared := map[string]string{}
	for _, list := range []struct {
		name string
		ids  []string
	}{{"versionedOperations", versionedOperations}, {"notVersionedYet", notVersionedYet}, {"unversioned", unversioned}} {
		for _, id := range list.ids {
			if other, ok := declared[id]; ok {
				t.Errorf("%s is listed in %s and %s", id, other, list.name)
			}
			declared[id] = list.name
		}
	}
	var problems []string
	for path, item := range httpapi.OpenAPI().Paths {
		if !strings.HasPrefix(path, "/api/") {
			continue
		}
		for method, op := range map[string]*huma.Operation{http.MethodPut: item.Put, http.MethodPatch: item.Patch, http.MethodDelete: item.Delete} {
			if op == nil {
				continue
			}
			list, ok := declared[op.OperationID]
			delete(declared, op.OperationID)
			hasIfMatch := slices.ContainsFunc(op.Parameters, func(p *huma.Param) bool { return p.In == "header" && p.Name == "If-Match" })
			response412, has412 := op.Responses["412"]
			_, has428 := op.Responses["428"]
			documented := hasIfMatch && has412 && response412.Headers["ETag"] != nil && has428
			switch {
			case !ok:
				problems = append(problems, method+" "+path+" ("+op.OperationID+") is in none of the lists")
			case list == "versionedOperations" && !documented:
				problems = append(problems, op.OperationID+" is versioned but does not document If-Match, 412 with ETag, and 428")
			case list != "versionedOperations" && hasIfMatch:
				problems = append(problems, op.OperationID+" accepts If-Match; move it to versionedOperations")
			}
		}
	}
	for id, list := range declared {
		problems = append(problems, id+" is listed in "+list+" but no such PUT, PATCH, or DELETE exists")
	}
	sort.Strings(problems)
	for _, problem := range problems {
		t.Error(problem)
	}
}
