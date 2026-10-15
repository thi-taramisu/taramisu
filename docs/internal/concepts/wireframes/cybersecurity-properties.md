# Cybersecurity Properties in the Wireframes

Concept note for ticket [#43](https://github.com/thi-taramisu/taramisu/issues/43). Status: draft for discussion.

## In short

- A *cybersecurity property* says **what about an asset we want to protect**: its confidentiality, its integrity or its availability (C / I / A).
- Our current wireframe (Concept #02) puts the C / I / A checkboxes on the **damage scenario**. That does not work, because one damage scenario can involve several assets.
- Proposal: the property belongs to the **link between an asset and a damage scenario** (and between an asset and a threat scenario). The asset itself only lists which properties are relevant for it.
- This follows ISO/SAE 21434 and keeps every starting point of a TARA possible.
- It needs a small schema change for [#40](https://github.com/thi-taramisu/taramisu/issues/40), which has to be agreed with Lorenz.

## Background: the TARA terms you need

A TARA (Threat Analysis and Risk Assessment) answers two questions about a system: what can go wrong, and how bad would it be. ISO/SAE 21434 describes how to do it. These are the terms this note uses, with one running example from our wireframes, the battery pack of an electric vehicle.

| Term | Meaning | Example |
|---|---|---|
| **Item** | The system under analysis. | EV Battery Pack |
| **Asset** | Something of value inside the item that could be attacked. | The firmware of the cell monitoring controller, "Firmware (CMC)" |
| **Cybersecurity property** | The aspect of an asset worth protecting. The standard names confidentiality (no unauthorized reading), integrity (no unauthorized change) and availability (it keeps working). | Integrity of the firmware |
| **Damage scenario** | The bad outcome for a road user if a property is lost. | "Unsafe cell operation" |
| **Threat scenario** | How an attacker could cause that loss. | "CMC firmware tampering" |

Read together: *if the **integrity** of **Firmware (CMC)** is lost, the result is **unsafe cell operation**.* And: *tampering with the firmware is the threat that causes the loss of integrity.* That one sentence is the core of this note. The property connects an asset to a damage scenario, and an asset to a threat scenario.

## What the standard says

ISO/SAE 21434:2021 (checked 2026-10-15; the standard is licensed, so everything below is paraphrased, with the clause so you can look it up).

| Reference | What it says | What it means for us |
|---|---|---|
| 3.1.2, Note 1 | An asset has one or more properties, and compromising them can lead to one or more damage scenarios. | Asset, property and damage scenario are linked many-to-many. |
| 3.1.20 | A cybersecurity property is an attribute worth protecting. The note names confidentiality, integrity and/or availability. | C / I / A are the named properties. The list is introductory, not closed. |
| RQ-15-02 (15.3.2) | Identify assets together with the properties whose compromise leads to a damage scenario. | The property belongs to the pair *asset and damage scenario*. |
| Note 2 to RQ-15-02 | Assets can be found from the item definition, an impact rating, by deriving them from threat scenarios, or from catalogues. | There are several valid ways to start. |
| RQ-15-03 (15.4.2) | A threat scenario names the targeted asset, the compromised property of that asset and the cause. | The property also belongs to the pair *asset and threat scenario*. |
| Note 3 to RQ-15-03 | A damage scenario can have several threat scenarios and the other way round. | Threat and damage scenarios are many-to-many. |
| 15.3.1.1, 15.4.1.1 | The only prerequisite for identifying assets and threat scenarios is the item definition. | Neither step has to come first. |
| 15.1 | The clause 15 methods are generic modules that can be used at any point of the item's lifecycle. This is about *when* a TARA is done, not the order of steps. | Fits a modular approach, but is not proof of one. |
| Annex H, Table H.2 | An informative example (the headlamp system from the course slides) with the columns asset, property (C / I / A) and damage scenario. One row can mark several properties, and one asset appears in several rows. | This is the structure proposed below. |

Notation: **RQ-15-02** is requirement number 2 of clause 15, a "shall" statement. **Annex H** is an informative example that walks through a full TARA.

Not in the standard: authenticity, authorization and non-repudiation. They appear in our draft data model because they come from the STRIDE threat categories.

## Where we are today

- **Wireframes ([Concept #02 in Whimsical](https://whimsical.com/taramisu/taramisu-concept-MeRaRm6cqUmmG6KBFgjiim), documented in [PR #27](https://github.com/thi-taramisu/taramisu/pull/27)):** the damage scenario's Definition tab has the three C / I / A checkboxes. The threat scenario has a STRIDE block marked "STRIDE Optional?" and no property field. The asset's Definition tab is not drawn.
- **Draft data model ([data-model.md](https://github.com/thi-taramisu/taramisu/blob/docs/initial-er-schema/docs/internal/architecture/data-model.md), branch `docs/initial-er-schema`):** the `ASSET` table has six yes/no flags (C, I, A plus authenticity, authorization, non-repudiation). The link tables `ASSET_DAMAGE_MAPPING` and `ASSET_THREAT_MAPPING` only have a free-text `notes` field. The data model is still being worked on in [#40](https://github.com/thi-taramisu/taramisu/issues/40).
- **Database on `main` ([schema.sql](https://github.com/thi-taramisu/taramisu/blob/main/backend/db/schema.sql)):** only a placeholder table so far, so nothing is blocked by existing tables.
- **Course slides:** slide 9 shows the table asset, property, damage scenario. Slide 11 maps a damage scenario to a threat scenario that causes "loss of I or A".

## The problem

A damage scenario can involve several assets (that is the many-to-many from the standard). With the checkboxes on the damage scenario, we cannot say **which asset's property** is lost.

Example: "Unsafe cell operation" can happen because the integrity of *Firmware (CMC)* is lost, or because the availability of *Firmware Update (CMC)* is lost. One set of checkboxes on the damage scenario cannot show both.

There is a second problem. The standard does not force the order asset, then damage scenario, then threat scenario. A user may start from a threat scenario, and then there is no asset yet to hold the property.

## Options

| | Where the property is stored | Good | Bad |
|---|---|---|---|
| A | On the asset only (data model today) | Simple. | Cannot say which property leads to which damage or threat. The slide 9 table cannot be rebuilt. |
| B | On the damage scenario (wireframe today) | Quick to edit. | Wrong when a damage scenario has several assets. Cannot be filled when starting from a threat scenario. |
| C | **On the link** asset to damage scenario and asset to threat scenario, plus the list of relevant properties on the asset | Matches RQ-15-02, RQ-15-03 and Annex H. Works from every starting point. Gives the graph view something to show on its lines. | Needs a schema change and an inline edit on the link. |

## Proposal: option C

1. **Asset, Definition tab:** the user ticks which properties are relevant for this asset. This is the list to choose from later.
2. **Link asset to damage scenario:** the user marks which of the asset's properties, if lost, lead to this damage. One link can mark several. This is one row of the Annex H table.
3. **Link asset to threat scenario:** the user marks which property the threat compromises. One property per link, as in RQ-15-03.
4. **Damage scenario, Definition tab:** the checkboxes are removed. It shows a read-only list of the affected assets with their properties.
5. **Graph view:** each line between an asset and a damage or threat scenario carries the property marks (C / I / A).

Because the property sits on the link, it does not matter whether the user starts at the asset, the damage scenario or the threat scenario.

The proposed screens are in the Claude Design canvas "TARAmisu Cybersecurity Properties Wireframes": asset definition, asset's damage scenario links, damage scenario definition, threat scenario definition, a threat scenario started before any asset exists, and the graph view.

### Schema change for #40 (proposal, for Lorenz)

- `ASSET_DAMAGE_MAPPING`: add the compromised properties as a set per link (for example three yes/no fields, one per C / I / A), with at least one set. Annex H marks several properties in one row, so a set fits.
- `ASSET_THREAT_MAPPING`: add one `compromised_property` value. If a threat compromises two properties of one asset, that is two links.
- `THREAT_SCENARIO`: a nullable `compromised_property` for the case "threat scenario first, no asset yet". It is cleared when the asset link is created and the property moves to the link.
- `ASSET` keeps its flags for the relevant properties. A link may only use a property that is enabled on the asset.
- Property list: C / I / A for now, stored in a way that more values could be added later.

## Decisions (2026-10-15)

To be confirmed with Lorenz (data model) and the stakeholders.

1. **Three properties in the UI:** C / I / A only. The three extra flags in the draft data model are not used for now.
2. **Relation level:** the property is stored on the links (option C).
3. **Required or optional:** follow the standard. A link to a damage scenario carries at least one property (RQ-15-02). The item definition is the only prerequisite.
4. **Threat scenario first:** allowed. The property is kept on the threat scenario until an asset link exists, then it moves to the link.
5. **Starting points:** the hierarchical path (item, asset, damage scenario, threat scenario) is the first one we design. Other starting points are out of scope for #43, but the data model must not block them.

## Next steps

- Agree the schema change with Lorenz in [#40](https://github.com/thi-taramisu/taramisu/issues/40).
- Confirm the decisions with the wireframe team on 16.10 (see [planning.md](https://github.com/thi-taramisu/taramisu/blob/wireframes-concept/docs/internal/concepts/wireframes/planning.md)), and carry them into the wireframes ([#35](https://github.com/thi-taramisu/taramisu/issues/35), [#34](https://github.com/thi-taramisu/taramisu/issues/34)).
- Correct a citation in the data model: it names "15.3.2, Note 1" as the source of the asset to damage scenario many-to-many relation. That note does not say this. The source is 3.1.2, Note 1.
