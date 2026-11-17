CREATE TABLE service_status (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    message text NOT NULL
);

-- Declared in rank order so that max() and ORDER BY return the highest role.
CREATE TYPE project_role AS ENUM ('VIEWER', 'EDITOR', 'OWNER');
CREATE TYPE scope_type AS ENUM ('ITEM', 'COMPONENT');
CREATE TYPE identification_source AS ENUM (
    'ITEM_DEF', 'IMPACT_RATING', 'THREAT_DERIVED', 'CATALOGUE'
);
CREATE TYPE cybersecurity_property_type AS ENUM (
    'CONFIDENTIALITY', 'INTEGRITY', 'AVAILABILITY'
);
CREATE TYPE impact_category AS ENUM ('SAFETY', 'FINANCIAL', 'OPERATIONAL', 'PRIVACY');
CREATE TYPE impact_rating_value AS ENUM (
    'SEVERE', 'MAJOR', 'MODERATE', 'NEGLIGIBLE', 'OMITTED'
);
CREATE TYPE elicitation_method AS ENUM (
    'GROUP_DISCUSSION', 'MALICIOUS_USE_CASE', 'EVITA', 'TVRA', 'PASTA', 'STRIDE', 'OTHER'
);
CREATE TYPE attack_feasibility AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'VERY_LOW');
CREATE TYPE analysis_approach AS ENUM ('TOP_DOWN', 'BOTTOM_UP');
CREATE TYPE risk_determination_method AS ENUM ('RISK_MATRIX', 'RISK_FORMULA');
CREATE TYPE risk_treatment_option AS ENUM ('AVOIDING', 'REDUCING', 'SHARING', 'RETAINING');

CREATE TABLE iam_user (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    external_iam_sub text NOT NULL UNIQUE
);

CREATE TABLE iam_group (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    external_iam_group_id text NOT NULL UNIQUE
);

CREATE TABLE tara_project (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    default_rating_method text CHECK (default_rating_method IN ('ATTACK_POTENTIAL', 'CVSS', 'ATTACK_VECTOR')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE project_role_assignment (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tara_project_id uuid NOT NULL REFERENCES tara_project (id) ON DELETE CASCADE,
    user_id uuid REFERENCES iam_user (id) ON DELETE CASCADE,
    group_id uuid REFERENCES iam_group (id) ON DELETE CASCADE,
    project_role project_role NOT NULL,
    assigned_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT project_role_assignment_one_principal CHECK (
        (user_id IS NOT NULL) <> (group_id IS NOT NULL)
    ),
    CONSTRAINT project_role_assignment_one_user_role UNIQUE (tara_project_id, user_id),
    CONSTRAINT project_role_assignment_one_group_role UNIQUE (tara_project_id, group_id)
);

CREATE INDEX project_role_assignment_user_id_idx ON project_role_assignment (user_id);
CREATE INDEX project_role_assignment_group_id_idx ON project_role_assignment (group_id);

CREATE TABLE item_definition (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tara_project_id uuid NOT NULL REFERENCES tara_project (id),
    name text NOT NULL,
    scope_type scope_type NOT NULL,
    lifecycle_phase text,
    boundary text,
    functions text,
    operational_environment text,
    item_definition_wp_09_01 text,
    cybersecurity_specs_wp_10_01 text,
    architectural_design text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX item_definition_tara_project_id_idx ON item_definition (tara_project_id);

CREATE TABLE asset (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    item_definition_id uuid NOT NULL REFERENCES item_definition (id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    identification_source identification_source
);

CREATE INDEX asset_item_definition_id_idx ON asset (item_definition_id);

CREATE TABLE asset_cybersecurity_property (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id uuid NOT NULL REFERENCES asset (id) ON DELETE CASCADE,
    property_type cybersecurity_property_type NOT NULL,
    description text,
    UNIQUE (asset_id, property_type)
);

CREATE TABLE damage_scenario (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    item_definition_id uuid NOT NULL REFERENCES item_definition (id) ON DELETE CASCADE,
    title text NOT NULL,
    functionality_adverse_relation text,
    road_user_harm_description text
);

CREATE INDEX damage_scenario_item_definition_id_idx ON damage_scenario (item_definition_id);

CREATE TABLE damage_scenario_asset_property (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    damage_scenario_id uuid NOT NULL REFERENCES damage_scenario (id) ON DELETE CASCADE,
    asset_cybersecurity_property_id uuid NOT NULL REFERENCES asset_cybersecurity_property (id) ON DELETE CASCADE,
    compromise_mechanism_note text,
    UNIQUE (damage_scenario_id, asset_cybersecurity_property_id)
);

CREATE INDEX damage_scenario_asset_property_property_id_idx
    ON damage_scenario_asset_property (asset_cybersecurity_property_id);

CREATE TABLE impact_rating (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    damage_scenario_id uuid NOT NULL REFERENCES damage_scenario (id) ON DELETE CASCADE,
    impact_category impact_category NOT NULL,
    rating_value impact_rating_value,
    is_omitted_by_pm_15_07 boolean NOT NULL DEFAULT false,
    omission_or_rating_rationale text,
    reused_from_functional_safety boolean NOT NULL DEFAULT false,
    UNIQUE (damage_scenario_id, impact_category),
    CONSTRAINT impact_rating_omission_consistent CHECK (
        is_omitted_by_pm_15_07 = (rating_value IS NOT NULL AND rating_value = 'OMITTED')
    ),
    CONSTRAINT impact_rating_functional_safety_category CHECK (
        NOT reused_from_functional_safety OR impact_category = 'SAFETY'
    )
);

CREATE TABLE threat_scenario (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    item_definition_id uuid NOT NULL REFERENCES item_definition (id) ON DELETE CASCADE,
    title text NOT NULL,
    cause_of_compromise text,
    elicitation_method elicitation_method,
    technical_notes text,
    aggregated_attack_feasibility attack_feasibility,
    max_risk_score integer CHECK (max_risk_score BETWEEN 1 AND 5)
);

CREATE INDEX threat_scenario_item_definition_id_idx ON threat_scenario (item_definition_id);

CREATE TABLE threat_scenario_asset_property (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    threat_scenario_id uuid NOT NULL REFERENCES threat_scenario (id) ON DELETE CASCADE,
    asset_cybersecurity_property_id uuid NOT NULL REFERENCES asset_cybersecurity_property (id) ON DELETE CASCADE,
    UNIQUE (threat_scenario_id, asset_cybersecurity_property_id)
);

CREATE INDEX threat_scenario_asset_property_property_id_idx
    ON threat_scenario_asset_property (asset_cybersecurity_property_id);

CREATE TABLE threat_damage_link (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    threat_scenario_id uuid NOT NULL REFERENCES threat_scenario (id) ON DELETE CASCADE,
    damage_scenario_id uuid NOT NULL REFERENCES damage_scenario (id) ON DELETE CASCADE,
    UNIQUE (threat_scenario_id, damage_scenario_id)
);

CREATE INDEX threat_damage_link_damage_scenario_id_idx ON threat_damage_link (damage_scenario_id);

CREATE TABLE attack_path (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    item_definition_id uuid NOT NULL REFERENCES item_definition (id) ON DELETE CASCADE,
    title text NOT NULL,
    analysis_approach analysis_approach,
    is_partial_early_stage boolean NOT NULL DEFAULT true,
    attack_steps_and_weaknesses jsonb,
    initial_rating_method text NOT NULL DEFAULT 'ATTACK_POTENTIAL' CHECK (initial_rating_method IN ('ATTACK_POTENTIAL', 'CVSS', 'ATTACK_VECTOR'))
);

CREATE INDEX attack_path_item_definition_id_idx ON attack_path (item_definition_id);

CREATE TABLE threat_attack_path_link (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    threat_scenario_id uuid NOT NULL REFERENCES threat_scenario (id) ON DELETE CASCADE,
    attack_path_id uuid NOT NULL REFERENCES attack_path (id) ON DELETE CASCADE,
    UNIQUE (threat_scenario_id, attack_path_id)
);

CREATE INDEX threat_attack_path_link_attack_path_id_idx ON threat_attack_path_link (attack_path_id);

CREATE TABLE attack_feasibility_rating (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    attack_path_id uuid NOT NULL UNIQUE REFERENCES attack_path (id) ON DELETE CASCADE,
    rating_method text NOT NULL DEFAULT 'ATTACK_POTENTIAL' CHECK (rating_method IN ('ATTACK_POTENTIAL', 'CVSS', 'ATTACK_VECTOR')),
    cvss_attack_vector text CHECK (cvss_attack_vector IN ('NETWORK', 'ADJACENT', 'LOCAL', 'PHYSICAL')),
    cvss_attack_complexity text CHECK (cvss_attack_complexity IN ('LOW', 'HIGH')),
    cvss_privileges_required text CHECK (cvss_privileges_required IN ('NONE', 'LOW', 'HIGH')),
    cvss_user_interaction text CHECK (cvss_user_interaction IN ('NONE', 'REQUIRED')),
    cvss_scope text CHECK (cvss_scope IN ('UNCHANGED', 'CHANGED')),
    attack_vector text CHECK (attack_vector IN ('NETWORK', 'ADJACENT', 'LOCAL', 'PHYSICAL')),
    ap_elapsed_time integer CHECK (ap_elapsed_time >= 0),
    ap_specialist_expertise integer CHECK (ap_specialist_expertise >= 0),
    ap_knowledge_of_item integer CHECK (ap_knowledge_of_item >= 0),
    ap_window_of_opportunity integer CHECK (ap_window_of_opportunity >= 0),
    ap_equipment integer CHECK (ap_equipment >= 0),
    ap_total_score integer CHECK (ap_total_score >= 0),
    feasibility_rating attack_feasibility,
    rationale text,
    -- Only the selected method may have inputs. CVSS needs all five metrics;
    -- attack vector needs its vector. Attack potential keeps supporting partial drafts.
    -- num_nonnulls counts populated fields, including numeric values of zero.
    CONSTRAINT attack_feasibility_method_inputs CHECK (
        (rating_method = 'ATTACK_POTENTIAL'
            AND num_nonnulls(cvss_attack_vector, cvss_attack_complexity, cvss_privileges_required, cvss_user_interaction, cvss_scope, attack_vector) = 0)
        OR (rating_method = 'CVSS'
            AND num_nonnulls(cvss_attack_vector, cvss_attack_complexity, cvss_privileges_required, cvss_user_interaction, cvss_scope) = 5
            AND num_nonnulls(ap_elapsed_time, ap_specialist_expertise, ap_knowledge_of_item, ap_window_of_opportunity, ap_equipment, ap_total_score, attack_vector) = 0)
        OR (rating_method = 'ATTACK_VECTOR' AND attack_vector IS NOT NULL
            AND num_nonnulls(ap_elapsed_time, ap_specialist_expertise, ap_knowledge_of_item, ap_window_of_opportunity, ap_equipment, ap_total_score,
                cvss_attack_vector, cvss_attack_complexity, cvss_privileges_required, cvss_user_interaction, cvss_scope) = 0)
    ),
    CONSTRAINT attack_feasibility_rating_total_consistent CHECK (
        ap_total_score IS NULL OR (
            ap_elapsed_time IS NOT NULL
            AND ap_specialist_expertise IS NOT NULL
            AND ap_knowledge_of_item IS NOT NULL
            AND ap_window_of_opportunity IS NOT NULL
            AND ap_equipment IS NOT NULL
            AND ap_total_score = ap_elapsed_time + ap_specialist_expertise
                + ap_knowledge_of_item + ap_window_of_opportunity + ap_equipment
        )
    )
);

CREATE TABLE risk_value (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    threat_scenario_id uuid NOT NULL REFERENCES threat_scenario (id) ON DELETE CASCADE,
    impact_rating_id uuid NOT NULL REFERENCES impact_rating (id) ON DELETE CASCADE,
    risk_score integer NOT NULL CHECK (risk_score BETWEEN 1 AND 5),
    determination_method risk_determination_method NOT NULL,
    UNIQUE (threat_scenario_id, impact_rating_id),
    UNIQUE (id, threat_scenario_id)
);

CREATE INDEX risk_value_impact_rating_id_idx ON risk_value (impact_rating_id);

CREATE TABLE risk_treatment_decision (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    threat_scenario_id uuid NOT NULL REFERENCES threat_scenario (id) ON DELETE CASCADE,
    risk_value_id uuid,
    treatment_option risk_treatment_option NOT NULL,
    decision_rationale text,
    is_cybersecurity_claim boolean NOT NULL DEFAULT false,
    CONSTRAINT risk_treatment_decision_risk_threat_fk
        FOREIGN KEY (risk_value_id, threat_scenario_id)
        REFERENCES risk_value (id, threat_scenario_id) ON DELETE NO ACTION,
    CONSTRAINT risk_treatment_decision_claim_required CHECK (
        treatment_option NOT IN ('RETAINING', 'SHARING') OR is_cybersecurity_claim
    )
);

CREATE INDEX risk_treatment_decision_threat_scenario_id_idx
    ON risk_treatment_decision (threat_scenario_id);
CREATE INDEX risk_treatment_decision_risk_value_id_idx
    ON risk_treatment_decision (risk_value_id, threat_scenario_id);
