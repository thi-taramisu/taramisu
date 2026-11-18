package handlers_test

import (
	"net/http"
	"sort"
	"strings"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
)

// auditedOperations record their changes in the audit history (docs/internal/architecture/audit.md).
var auditedOperations = []string{
	"create-tara-project", "replace-tara-project", "update-tara-project", "delete-tara-project",
	"add-project-member", "update-project-member", "remove-project-member",
	"create-item-definition", "replace-item-definition", "update-item-definition", "delete-item-definition",
}

// notAuditedYet change analysis content without an audit event. Move an operation to
// auditedOperations when its changes are recorded; new operations must go into one of the lists.
var notAuditedYet = []string{
	"create-asset", "replace-asset", "update-asset", "delete-asset",
	"create-asset-cybersecurity-property", "replace-asset-cybersecurity-property", "update-asset-cybersecurity-property",
	"delete-asset-cybersecurity-property",
	"create-damage-scenario-asset-property", "replace-damage-scenario-asset-property", "update-damage-scenario-asset-property",
	"delete-damage-scenario-asset-property",
	"create-threat-scenario-asset-property", "replace-threat-scenario-asset-property", "update-threat-scenario-asset-property",
	"delete-threat-scenario-asset-property",
	"create-attack-path", "replace-attack-path", "update-attack-path", "delete-attack-path",
	"replace-attack-feasibility-rating", "update-attack-feasibility-rating", "delete-attack-feasibility-rating",
	"create-damage-scenario", "replace-damage-scenario", "update-damage-scenario", "delete-damage-scenario",
	"create-impact-rating", "replace-impact-rating", "update-impact-rating", "delete-impact-rating",
	"create-threat-damage-link", "delete-threat-damage-link",
	"create-threat-attack-path-link", "delete-threat-attack-path-link",
	"create-risk-value", "replace-risk-value", "update-risk-value", "delete-risk-value",
	"create-risk-treatment-decision", "replace-risk-treatment-decision", "update-risk-treatment-decision",
	"delete-risk-treatment-decision",
}

// TestEveryChangeIsDeclaredForAudit makes adding a mutating operation a conscious decision about its
// audit events, like the access declaration in handlers.Register.
func TestEveryChangeIsDeclaredForAudit(t *testing.T) {
	declared := map[string]string{}
	for _, list := range []struct {
		name string
		ids  []string
	}{{"auditedOperations", auditedOperations}, {"notAuditedYet", notAuditedYet}} {
		for _, id := range list.ids {
			if other, ok := declared[id]; ok {
				t.Errorf("%s is listed in %s and %s", id, other, list.name)
			}
			declared[id] = list.name
		}
	}
	var undeclared []string
	for path, item := range httpapi.OpenAPI().Paths {
		if !strings.HasPrefix(path, "/api/") {
			continue
		}
		for method, op := range map[string]*huma.Operation{
			http.MethodPost: item.Post, http.MethodPut: item.Put, http.MethodPatch: item.Patch, http.MethodDelete: item.Delete,
		} {
			if op == nil {
				continue
			}
			if _, ok := declared[op.OperationID]; !ok {
				undeclared = append(undeclared, method+" "+path+" ("+op.OperationID+")")
			}
			delete(declared, op.OperationID)
		}
	}
	sort.Strings(undeclared)
	for _, op := range undeclared {
		t.Errorf("%s is neither in auditedOperations nor in notAuditedYet", op)
	}
	for id := range declared {
		t.Errorf("%s is listed but no such mutating operation exists", id)
	}
}
