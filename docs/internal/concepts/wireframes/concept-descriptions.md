
# Concept Descriptions

## Concept #01 – "Hierarchical Workspace"

* **Date:** 11.10.2026
* **Creator:** Bornkessel, Pascal
* **Link:** [Whimsical](https://whimsical.com/taramisu/taramisu-concept-MeRaRm6cqUmmG6KBFgjiim) (editable)

### Overview

* *Header:* Provides access to the project context and analysis-wide views, including risks, review, and coverage
* *Left Sidebar:*
  * *Hierarchy:* Displays the hierarchy between Project → Item → Asset → Damage Scenario → Threat Scenario → Attack Path
  * *Guidance:* Provides relevant questions, rating criteria, examples, and assessment comparisons.
* *Central Workspace:* Shows the selected object’s overview, related objects, or editing form.
* *Contextual Tabs:* Organize information within an object, such as Overview, Impact, Attack Paths, or Treatment.

## Concept #02 – "Hierarchical Workspace with Relations"

* **Date:** 18.10.2026
* **Creator:** Bornkessel, Pascal
* **Link:** [Whimsical](https://whimsical.com/taramisu/taramisu-concept-MeRaRm6cqUmmG6KBFgjiim) (editable)
* **Interactive Demonstration:** [concept_02_interactive.html](assets/concept_02_interactive.html)

### Overview

* ***Structure and Navigation:***
  * The project was moved from the tree into the header. Only one project is open at a time; to switch, use the project selector.
  * Each item has its own "Unassigned" section for objects that are not yet linked.
  * Objects appear at every location where they are linked (m:n). The tree structure is preserved.
  * Trace Strip: the chain Asset · Property → Damage → Threat → Path = Risk, with a context switcher when an object belongs to multiple
    paths.
  * Flat IDs per object type (A-01, DS-01, TS-01, AP-01) replace the hierarchical numbering.
* ***Creating and Linking:***
  * "+ New" is a flat list of 5 object types. The type is selected in the dialog, which only requires a name. Links are optional.
  * "+ Add …" in Relations opens a picker that can either link an existing object or create a new one.
  * New "Relations" tab for Asset, Damage Scenario, Threat Scenario, and Attack Path.
  * Removing a link does not delete the linked objects.
  * File upload for items, with support for multiple files.
* ***Technical Changes:***
  * C/I/A are no longer set on the Damage Scenario. They are set on the Asset → Damage link, in line with the Cybersecurity Properties
    Concept.
  * A Damage Scenario can have multiple assets and properties.
  * The Threat Scenario selects its targets through the causes of the linked Damage Scenarios (block "Damage Scenarios & Targets"). Each
    target asset has exactly one property (strict interpretation of RQ-15-03), but multiple target assets are allowed.
    If a threat compromises multiple properties of the same asset, this could be modeled by creating separate threat scenarios.
  * The Threat Scenario has an "Elicitation" field (Group discussion, Malicious use case, EVITA, TVRA, PASTA, STRIDE, Other) instead of
    STRIDE checkboxes.
  * The feasibility rating method can be selected (Attack Potential, CVSS, or Attack Vector per Annex G). The project default is set in the
    settings, and each Attack Path can deviate from it.
  * Treatment is decided once per Threat Scenario. The view shows which risk values it covers.
  * Asset-based risk table under Item › Risks and Asset › Risks, with one row per asset showing Property, Damage, Threat (with role),
    Feasibility, and Risk.
  * More flexible object creation: objects no longer have to be created in hierarchy order (15.3.2, Note 2).
* ***Project Management:***
  * "Project settings & members" page with:
    * General: name, default rating method, AI toggle
    * Members: roles Owner, Editor, Reviewer, and Viewer; the last Owner is protected from removal
    * Delete project
* ***Help and Assistance:***
  * A round "?" button at the bottom right opens a sidebar with field-specific guidance, including the normative reference and an example.
  * The guidance is generated from Markdown documents, so there is a single source of truth.
  * AI assistant as the second tab of the sidebar:
    * It sees the current context and offers relevant actions.
    * Suggestions are only applied after the user clicks Apply.
    * It never pre-selects ratings; it only provides supporting arguments.
    * It can be turned on or off per project.
