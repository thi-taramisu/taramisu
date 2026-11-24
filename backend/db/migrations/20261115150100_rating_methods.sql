ALTER TABLE attack_feasibility_rating
ADD COLUMN rating_method text NOT NULL DEFAULT 'ATTACK_POTENTIAL' CHECK (rating_method IN ('ATTACK_POTENTIAL', 'CVSS', 'ATTACK_VECTOR')),
ADD COLUMN cvss_attack_vector text CHECK (cvss_attack_vector IN ('NETWORK', 'ADJACENT', 'LOCAL', 'PHYSICAL')),
ADD COLUMN cvss_attack_complexity text CHECK (cvss_attack_complexity IN ('LOW', 'HIGH')),
ADD COLUMN cvss_privileges_required text CHECK (cvss_privileges_required IN ('NONE', 'LOW', 'HIGH')),
ADD COLUMN cvss_user_interaction text CHECK (cvss_user_interaction IN ('NONE', 'REQUIRED')),
ADD COLUMN cvss_scope text CHECK (cvss_scope IN ('UNCHANGED', 'CHANGED')),
ADD COLUMN attack_vector text CHECK (attack_vector IN ('NETWORK', 'ADJACENT', 'LOCAL', 'PHYSICAL'));
ALTER TABLE attack_feasibility_rating ADD CONSTRAINT attack_feasibility_method_inputs CHECK (
        (rating_method = 'ATTACK_POTENTIAL'
            AND num_nonnulls(cvss_attack_vector, cvss_attack_complexity, cvss_privileges_required, cvss_user_interaction, cvss_scope, attack_vector) = 0)
        OR (rating_method = 'CVSS'
            AND num_nonnulls(cvss_attack_vector, cvss_attack_complexity, cvss_privileges_required, cvss_user_interaction, cvss_scope) = 5
            AND num_nonnulls(ap_elapsed_time, ap_specialist_expertise, ap_knowledge_of_item, ap_window_of_opportunity, ap_equipment, ap_total_score, attack_vector) = 0)
        OR (rating_method = 'ATTACK_VECTOR' AND attack_vector IS NOT NULL
            AND num_nonnulls(ap_elapsed_time, ap_specialist_expertise, ap_knowledge_of_item, ap_window_of_opportunity, ap_equipment, ap_total_score,
                cvss_attack_vector, cvss_attack_complexity, cvss_privileges_required, cvss_user_interaction, cvss_scope) = 0)
    );
