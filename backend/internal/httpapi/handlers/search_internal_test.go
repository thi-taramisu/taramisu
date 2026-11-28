package handlers

import "testing"

func TestParseDisplayID(t *testing.T) {
	cases := []struct {
		query, wantType, wantDigits string
	}{
		{"TS-12", searchTypeThreatScenario, "12"},
		{"ts12", searchTypeThreatScenario, "12"},
		{"ts 12", searchTypeThreatScenario, "12"},
		{"Ts - 12", searchTypeThreatScenario, "12"},
		{"TS-012", searchTypeThreatScenario, "12"},
		{"IT-1", searchTypeItem, "1"},
		{"as-7", searchTypeAsset, "7"},
		{"DS-3", searchTypeDamageScenario, "3"},
		{"AP-100", searchTypeAttackPath, "100"},
		{"TS-0", "", ""},
		{"TS", "", ""},
		{"TS-", "", ""},
		{"XX-1", "", ""},
		{"TS-1a", "", ""},
		{"TS-1234567890", "", ""},
		{"Spoofed TS-1", "", ""},
		{"12", "", ""},
	}
	for _, tc := range cases {
		gotType, gotDigits := parseDisplayID(tc.query)
		if gotType != tc.wantType || gotDigits != tc.wantDigits {
			t.Errorf("parseDisplayID(%q) = %q, %q; want %q, %q", tc.query, gotType, gotDigits, tc.wantType, tc.wantDigits)
		}
	}
}
