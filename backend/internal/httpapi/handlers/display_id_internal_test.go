package handlers

import (
	"testing"

	"github.com/thi-taramisu/taramisu/backend/internal/db"
)

// TestDisplayIDs checks the format of the display IDs in each element response: the type's prefix and
// the number without leading zeros.
func TestDisplayIDs(t *testing.T) {
	for _, tc := range []struct{ got, want string }{
		{itemDefinition(db.ItemDefinition{DisplayNumber: 1}).DisplayID, "IT-1"},
		{assetBody(db.Asset{DisplayNumber: 7}).DisplayID, "AS-7"},
		{toDamageScenarioBody(db.DamageScenario{DisplayNumber: 12}).DisplayID, "DS-12"},
		{toAttackPathBody(db.AttackPath{DisplayNumber: 100}).DisplayID, "AP-100"},
		{displayID(displayPrefixThreatScenario, 2147483647), "TS-2147483647"},
	} {
		if tc.got != tc.want {
			t.Errorf("display ID = %q, want %q", tc.got, tc.want)
		}
	}
}
