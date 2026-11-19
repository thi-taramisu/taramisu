package handlers

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
)

func TestBuildProjectExportNestsRecordsUnderTheirItem(t *testing.T) {
	uuid := func(s string) pgtype.UUID {
		var id pgtype.UUID
		if err := id.Scan(s); err != nil {
			t.Fatal(err)
		}
		return id
	}
	first, second := uuid("00000000-0000-4000-8000-000000000001"), uuid("00000000-0000-4000-8000-000000000002")
	data := db.ProjectExport{
		Project:         db.TaraProject{ID: uuid("00000000-0000-4000-8000-0000000000aa"), Name: "P"},
		ItemDefinitions: []db.ItemDefinition{{ID: first, Name: "first"}, {ID: second, Name: "second"}},
		Assets:          []db.Asset{{ID: uuid("00000000-0000-4000-8000-000000000010"), ItemDefinitionID: second, Name: "A"}},
		ThreatScenarios: []db.ThreatScenario{{ID: uuid("00000000-0000-4000-8000-000000000020"), ItemDefinitionID: first, Title: "T"}},
	}

	doc := buildProjectExport(data, time.Unix(0, 0).UTC())

	if doc.FormatVersion != ExportFormatVersion || len(doc.Items) != 2 {
		t.Fatalf("format_version = %d, items = %d", doc.FormatVersion, len(doc.Items))
	}
	if len(doc.Items[0].Assets) != 0 || len(doc.Items[0].ThreatScenarios) != 1 {
		t.Fatalf("first item: %d assets, %d threats", len(doc.Items[0].Assets), len(doc.Items[0].ThreatScenarios))
	}
	if len(doc.Items[1].Assets) != 1 || len(doc.Items[1].ThreatScenarios) != 0 {
		t.Fatalf("second item: %d assets, %d threats", len(doc.Items[1].Assets), len(doc.Items[1].ThreatScenarios))
	}
	raw, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	for _, list := range []string{"assets", "damage_scenarios", "attack_paths", "cybersecurity_properties", "asset_property_links", "risk_values"} {
		if strings.Contains(string(raw), `"`+list+`":null`) {
			t.Fatalf("%s is null, want []: %s", list, raw)
		}
	}
}
