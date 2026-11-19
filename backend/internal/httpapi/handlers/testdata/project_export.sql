-- Test data for the project export: one project that uses every table. Every existing user becomes Owner.

INSERT INTO tara_project (id, name, description) VALUES
    ('5eed0000-0000-4000-8000-000000000001', 'Smart headlamp (seed data)',
     'Example TARA of an adaptive headlamp control unit. Created by make seed.');

INSERT INTO project_role_assignment (tara_project_id, user_id, project_role)
SELECT '5eed0000-0000-4000-8000-000000000001', id, 'OWNER' FROM iam_user;

INSERT INTO item_definition (id, tara_project_id, name, scope_type, lifecycle_phase, boundary, functions,
                             operational_environment) VALUES
    ('5eed0000-0000-4000-8000-000000000010', '5eed0000-0000-4000-8000-000000000001',
     'Adaptive headlamp ECU', 'ITEM', 'Concept',
     'ECU, camera interface and diagnostic port; the vehicle bus is outside the boundary.',
     'Adjusts the light distribution to oncoming traffic based on camera images.',
     'Road vehicle, workshop diagnostics over the OBD port.');

INSERT INTO asset (id, item_definition_id, name, description, identification_source) VALUES
    ('5eed0000-0000-4000-8000-000000000020', '5eed0000-0000-4000-8000-000000000010',
     'Camera image stream', 'Frames from the front camera to the ECU.', 'ITEM_DEF'),
    ('5eed0000-0000-4000-8000-000000000021', '5eed0000-0000-4000-8000-000000000010',
     'Firmware image', 'Software stored on the ECU.', 'ITEM_DEF');

INSERT INTO asset_cybersecurity_property (id, asset_id, property_type, description) VALUES
    ('5eed0000-0000-4000-8000-000000000030', '5eed0000-0000-4000-8000-000000000020', 'INTEGRITY',
     'Frames must not be changed on the way to the ECU.'),
    ('5eed0000-0000-4000-8000-000000000031', '5eed0000-0000-4000-8000-000000000020', 'AVAILABILITY',
     'Frames must arrive in time.'),
    ('5eed0000-0000-4000-8000-000000000032', '5eed0000-0000-4000-8000-000000000021', 'INTEGRITY',
     'Only signed firmware may run.'),
    ('5eed0000-0000-4000-8000-000000000033', '5eed0000-0000-4000-8000-000000000021', 'CONFIDENTIALITY', NULL);

INSERT INTO damage_scenario (id, item_definition_id, title, functionality_adverse_relation,
                             road_user_harm_description) VALUES
    ('5eed0000-0000-4000-8000-000000000040', '5eed0000-0000-4000-8000-000000000010',
     'Headlamp glares oncoming traffic', 'Light distribution is not adapted.',
     'Oncoming drivers are blinded and may cause an accident.'),
    ('5eed0000-0000-4000-8000-000000000041', '5eed0000-0000-4000-8000-000000000010',
     'Headlamp switches off at night', 'No light on the road.',
     'The driver cannot see obstacles.');

INSERT INTO damage_scenario_asset_property (id, damage_scenario_id, asset_cybersecurity_property_id,
                                            compromise_mechanism_note) VALUES
    ('5eed0000-0000-4000-8000-000000000050', '5eed0000-0000-4000-8000-000000000040',
     '5eed0000-0000-4000-8000-000000000030', 'Changed frames show no oncoming car.'),
    ('5eed0000-0000-4000-8000-000000000051', '5eed0000-0000-4000-8000-000000000041',
     '5eed0000-0000-4000-8000-000000000031', NULL);

INSERT INTO impact_rating (id, damage_scenario_id, impact_category, rating_value, is_omitted_by_pm_15_07,
                           omission_or_rating_rationale, reused_from_functional_safety) VALUES
    ('5eed0000-0000-4000-8000-000000000060', '5eed0000-0000-4000-8000-000000000040', 'SAFETY', 'SEVERE', false,
     'Taken from the hazard analysis.', true),
    ('5eed0000-0000-4000-8000-000000000061', '5eed0000-0000-4000-8000-000000000040', 'FINANCIAL', 'MODERATE', false,
     NULL, false),
    ('5eed0000-0000-4000-8000-000000000062', '5eed0000-0000-4000-8000-000000000041', 'SAFETY', 'MAJOR', false,
     NULL, false),
    ('5eed0000-0000-4000-8000-000000000063', '5eed0000-0000-4000-8000-000000000041', 'PRIVACY', 'OMITTED', true,
     'No personal data involved.', false);

INSERT INTO threat_scenario (id, item_definition_id, title, cause_of_compromise, elicitation_method,
                             technical_notes, aggregated_attack_feasibility, max_risk_score) VALUES
    ('5eed0000-0000-4000-8000-000000000070', '5eed0000-0000-4000-8000-000000000010',
     'Spoofed camera frames', 'Camera link is not authenticated.', 'STRIDE', NULL, 'MEDIUM', 4),
    ('5eed0000-0000-4000-8000-000000000071', '5eed0000-0000-4000-8000-000000000010',
     'Firmware replaced with a manipulated image', 'Diagnostic port accepts unsigned images.',
     'GROUP_DISCUSSION', 'Needs physical access.', 'LOW', 3);

INSERT INTO threat_scenario_asset_property (id, threat_scenario_id, asset_cybersecurity_property_id) VALUES
    ('5eed0000-0000-4000-8000-000000000080', '5eed0000-0000-4000-8000-000000000070',
     '5eed0000-0000-4000-8000-000000000030'),
    ('5eed0000-0000-4000-8000-000000000081', '5eed0000-0000-4000-8000-000000000071',
     '5eed0000-0000-4000-8000-000000000032');

INSERT INTO threat_damage_link (id, threat_scenario_id, damage_scenario_id) VALUES
    ('5eed0000-0000-4000-8000-000000000090', '5eed0000-0000-4000-8000-000000000070',
     '5eed0000-0000-4000-8000-000000000040'),
    ('5eed0000-0000-4000-8000-000000000091', '5eed0000-0000-4000-8000-000000000071',
     '5eed0000-0000-4000-8000-000000000040'),
    ('5eed0000-0000-4000-8000-000000000092', '5eed0000-0000-4000-8000-000000000071',
     '5eed0000-0000-4000-8000-000000000041');

INSERT INTO attack_path (id, item_definition_id, title, analysis_approach, is_partial_early_stage,
                         attack_steps_and_weaknesses) VALUES
    ('5eed0000-0000-4000-8000-0000000000a0', '5eed0000-0000-4000-8000-000000000010',
     'Inject frames on the camera link', 'BOTTOM_UP', false,
     '{"steps": ["Connect to the camera cable", "Send prepared frames"], "weaknesses": ["No message authentication"]}'),
    ('5eed0000-0000-4000-8000-0000000000a1', '5eed0000-0000-4000-8000-000000000010',
     'Flash a modified firmware over the diagnostic port', 'TOP_DOWN', true, NULL);

INSERT INTO threat_attack_path_link (id, threat_scenario_id, attack_path_id) VALUES
    ('5eed0000-0000-4000-8000-0000000000b0', '5eed0000-0000-4000-8000-000000000070',
     '5eed0000-0000-4000-8000-0000000000a0'),
    ('5eed0000-0000-4000-8000-0000000000b1', '5eed0000-0000-4000-8000-000000000071',
     '5eed0000-0000-4000-8000-0000000000a1');

INSERT INTO attack_feasibility_rating (id, attack_path_id, ap_elapsed_time, ap_specialist_expertise,
                                       ap_knowledge_of_item, ap_window_of_opportunity, ap_equipment,
                                       ap_total_score, feasibility_rating, rationale) VALUES
    ('5eed0000-0000-4000-8000-0000000000c0', '5eed0000-0000-4000-8000-0000000000a0', 1, 3, 3, 1, 4, 12,
     'MEDIUM', 'Needs a few hours and standard tools.');

INSERT INTO risk_value (id, threat_scenario_id, impact_rating_id, risk_score, determination_method) VALUES
    ('5eed0000-0000-4000-8000-0000000000d0', '5eed0000-0000-4000-8000-000000000070',
     '5eed0000-0000-4000-8000-000000000060', 4, 'RISK_MATRIX'),
    ('5eed0000-0000-4000-8000-0000000000d1', '5eed0000-0000-4000-8000-000000000070',
     '5eed0000-0000-4000-8000-000000000061', 2, 'RISK_MATRIX'),
    ('5eed0000-0000-4000-8000-0000000000d2', '5eed0000-0000-4000-8000-000000000071',
     '5eed0000-0000-4000-8000-000000000062', 3, 'RISK_FORMULA');

INSERT INTO risk_treatment_decision (id, threat_scenario_id, risk_value_id, treatment_option,
                                     decision_rationale, is_cybersecurity_claim) VALUES
    ('5eed0000-0000-4000-8000-0000000000e0', '5eed0000-0000-4000-8000-000000000070',
     '5eed0000-0000-4000-8000-0000000000d0', 'REDUCING', 'Authenticate the camera link.', false),
    ('5eed0000-0000-4000-8000-0000000000e1', '5eed0000-0000-4000-8000-000000000071',
     '5eed0000-0000-4000-8000-0000000000d2', 'RETAINING', 'Physical access is required.', true);
