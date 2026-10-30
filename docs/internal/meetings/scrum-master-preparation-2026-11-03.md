# Scrum-Master-Vorbereitung – 3. November 2026

Diese Vorbereitung orientiert sich an euren Onsite-Protokollen vom
[13. Oktober](onsite-2026-10-13.md), [20. Oktober](onsite-2026-10-20.md) und
[27. Oktober](onsite-2026-10-27.md) sowie am [Online-Sync vom 30. Oktober](online-2026-10-30.md).
Die englische [Meeting-Vorlage](onsite-2026-11-03.md) bleibt im bisherigen Stil;
dieser deutsche Leitfaden ist deine Hilfe beim Moderieren.

Datum: Dienstag, 3. November 2026, KW45. Scrum Master: Matthias, laut Auswahl vom
27. Oktober. Die vorherige Planung bestätigt Sprint 4 vom 27. Oktober bis
3. November. Ein Sprintziel wurde dort nicht dokumentiert; das vereinbarte Ziel
mit dem Team klären. Uhrzeit noch bestätigen.
Für Sprint 5 ist der 3. bis 10. November ein Vorschlag anhand der bisherigen
Planungsweise; Zeitraum und Ziel werden gemeinsam vereinbart.

## Dein Ziel als Moderator

Am Ende sollen alle wissen, was tatsächlich funktioniert, was noch offen ist,
welche Entscheidungen getroffen wurden und wer welchen nächsten Schritt übernimmt.
Du moderierst den Ablauf; Ergebnisse, Prioritäten und Sprintziel bestätigt ihr
gemeinsam mit dem Team und dem Product Owner. Du musst nicht alle technischen
Fragen selbst beantworten.

## Vorbereitung während der Woche

- [ ] Übergabe mit dem bisherigen Scrum Master: Sprintziel, ausgewählte Tickets,
  offene Beschlüsse, Termin und verfügbare Zeit klären.
- [x] Protokoll vom 27. Oktober liegt vor; Sprintzeitraum und Scrum Master wurden
  in die Meeting-Vorlage übernommen.
- [ ] Die Updates vom 30. Oktober vor dem Review aktualisieren: gemeldete Ergebnisse,
  geplante Arbeit und offene Entscheidungen getrennt prüfen.
- [ ] Die ausgewählten Sprint-Tickets im Board prüfen. Eine offene Backlog-Aufgabe
  ist nicht automatisch Teil des Sprints.
- [ ] Pro Beitrag Demo-Verantwortliche und einen kurzen Ablauf klären:
  Ergebnis, sichtbarer Nachweis, offene Arbeit, benötigte Entscheidung.
- [ ] Review-Blockaden früh sichtbar machen: fehlendes Review, rote CI,
  Merge-Konflikt oder Abhängigkeit getrennt notieren.
- [ ] Demo-Zugänge und Umgebung vorab testen; bei Ausfall einen Screenshot,
  Testlauf oder kurzen vorbereiteten Nachweis bereithalten.
- [ ] Einen Protokollführer vereinbaren, damit du gleichzeitig moderieren kannst.

## Am Vortag und direkt vor dem Termin

- [ ] GitHub-Stand aktualisieren und nur Ergebnisse des tatsächlich betrachteten
  Sprintzeitraums in die Ergebnisliste übernehmen.
- [ ] Abgeschlossene Ergebnisse von offenen PRs und Entwürfen unterscheiden.
  Ein grüner Test oder ein fertiger lokaler Stand ersetzt kein ausstehendes Review.
- [ ] Demo-Reihenfolge und Zeitrahmen mit dem Team abstimmen.
- [ ] Fragen an den Product Owner sowie echte Entscheidungspunkte sammeln.
- [ ] Meeting-Vorlage und Board öffnen; Sprintziel sichtbar bereithalten.

## Vorgeschlagener Ablauf: 120 Minuten

Die Zeitboxen sind ein Vorschlag. Bestätige sie passend zur tatsächlichen
Terminlänge und Anzahl der Demos.

| Dauer | Abschnitt | Dein Einstieg / gewünschtes Ergebnis |
| --- | --- | --- |
| 5 Min. | Einstieg | „Unser Sprintziel war … Heute prüfen wir Ergebnisse und planen die nächste Woche.“ |
| 45 Min. | Sprint Review | Ergebnisse zeigen, Feedback sammeln, Zielerreichung bewerten |
| 20 Min. | Retrospektive | Zusammenarbeit reflektieren; ein bis zwei konkrete Verbesserungen vereinbaren |
| 30 Min. | Sprint Planning | Kapazität, gemeinsames Ziel, passende Tickets und Abhängigkeiten klären |
| 15 Min. | Diskussion | Vorbereitete Entscheidungen treffen; Detailthemen bei Bedarf auslagern |
| 5 Min. | Abschluss | Beschlüsse, Verantwortliche, Termine und nächsten Scrum Master bestätigen |

## Fragen für den Sprint Review

Gib jeder Demo denselben kurzen Rahmen:

1. „Welches Problem oder Ticket habt ihr bearbeitet?“
2. „Was kann ich jetzt konkret sehen oder ausprobieren?“
3. „Was davon ist in main integriert, was wartet noch auf Review?“
4. „Was fehlt noch, und was ist der konkrete nächste Schritt?“
5. „Welches Feedback oder welche Entscheidung braucht ihr?“

Beende den Review mit: „Inwieweit haben wir unser Sprintziel erreicht?“
Halte Abweichungen sachlich fest, ohne neue Ziele rückwirkend zum alten Sprintziel
zu erklären. Lange technische Lösungsdiskussionen als Folgetermin mit Beteiligten
und Verantwortlichem notieren.

## Konkrete Vorbereitungsthemen

Die PR-Listen in der Meeting-Vorlage wurden am **30. Oktober 2026** mit GitHub
abgeglichen: [Sprint Results](onsite-2026-11-03.md#sprint-results) enthalten 13 offene
PRs, darunter ein Entwurf, sowie 8 geschlossene PRs.
Die Kategorien heißen wie am 27. Oktober **Completed:** und **Open:**;
beide Listen sind aufsteigend nach PR-Nummer sortiert.
**Open:** enthält alle aktuell offenen PRs. **Completed:** führt seit dem 27. Oktober
um 00:00 Uhr (Europe/Berlin) geschlossene PRs auf; gemergte PRs sind abgehakt.
Ohne Merge geschlossene PRs bleiben unabgehakt und sind entsprechend gekennzeichnet.
In der geschlossenen Liste bleibt bereits im Abschnitt **Completed** vom 27. Oktober
behandeltes Ergebnis ausgeschlossen, einschließlich der bisherigen Architektur-,
Filetree- und Accessibility-Arbeit.
Diese Listen vor dem Termin erneut aktualisieren.

Die folgenden Nachfragen basieren auf den Protokollen vom **27. und 30. Oktober**.
Gemeldete Implementierungen im Review zeigen lassen und den Merge-Status prüfen.
Geplante CRUD- und S3-Arbeit bleibt als geplant erfasst, bis neue Ergebnisse vorliegen.

| Bereich | Bekannter Stand / Referenzen | Sinnvolle Nachfrage / möglicher Nachweis |
| --- | --- | --- |
| Frontend / Johannes | Offene [PRs #150](https://github.com/thi-taramisu/taramisu/pull/150) und [#158](https://github.com/thi-taramisu/taramisu/pull/158): Item-Page mit Mock-Daten, OpenAPI-Anbindung für #118, GitHub Action und Trennung echter/gemockter Daten. | Item-Page und Schema-Workflow zeigen lassen: Welche Aufrufe nutzen echte Daten, welche noch Mocks? |
| Authentik / Lasse | [PR #165](https://github.com/thi-taramisu/taramisu/pull/165) zur Benutzerregistrierung mit Admin-Freigabe ist offen. | Registrierung demonstrieren und Review-Rückmeldungen prüfen. |
| CRUD-API | Backend soll die Logik aus [PR #134](https://github.com/thi-taramisu/taramisu/pull/134) umsetzen; Lasse plant ein CRUD-Issue. | Was wurde inzwischen umgesetzt? Aufgabenabgrenzung und Issue-Links klären. |
| S3 / Datei-Upload | Lasse plant das S3-Issue; vom 27. Oktober ist ein Ticket für den Backend-Datei-Upload nachzuverfolgen. | Welche Tickets gehören zusammen, wer übernimmt welchen Teil, und gibt es Ergebnisse? |
| Dokumentation / Tim | Backend-Dokumentation ergänzt und [PR #154](https://github.com/thi-taramisu/taramisu/pull/154) reviewed. | Änderungen zeigen lassen und offene Review-Rückmeldungen prüfen. |
| JWT und Zugriffsrechte / Lorenz | Zustandslose JWT-Authentifizierung mit Authentik besprochen; Rollen, Berechtigungen und Gruppenzugriffe noch festzulegen. | Was ist bereits vereinbart? Offene Entscheidungen und Verantwortliche festhalten. |
| VM / Bootstrap / Thomas | Am 30. Oktober noch keine Ergebnisse; Bootstrap-Skript kann auch in einem Docker-Container getestet werden. | Gibt es inzwischen einen Testlauf oder eine konkrete Blockade? |
| Infrastruktur | Entwicklungsumgebung mit Basti statt direktem Produktions-SSH; Load Balancing erforderlich; Proxy-Evaluation und Compose-Aufräumen unter `deploy/` nachverfolgen. Authentik bleibt ein eigenständiger Dienst. | Sind Umgebung und Zuständigkeiten geklärt? Welche Abhängigkeiten sind noch offen? |
| Betrieb | Sentry-[PR #128](https://github.com/thi-taramisu/taramisu/pull/128) offen; Image-Publishing [#141](https://github.com/thi-taramisu/taramisu/pull/141) und Docs-Integration [#140](https://github.com/thi-taramisu/taramisu/pull/140) gemergt. Proxy-Vergleich [#119](https://github.com/thi-taramisu/taramisu/pull/119) ohne Merge geschlossen. | Gemergte Ergebnisse zeigen lassen; offene Monitoring-Arbeit und Ergebnis des Proxy-Vergleichs klären. |
| LLM / Ilyass | Surya angeschrieben, Stand 30. Oktober ohne Antwort. LLM bleibt im Scope; ein bis zwei Wochen weiter beobachten. | Rückmeldung erfragen, Zuständigkeit für die Beobachtung klären; Scope zwischen dem 6. und 13. November erneut bewerten. Vorgabe zu selbst gehosteten/lokalen Modellen berücksichtigen. |

## Retrospektive: frühere Vereinbarungen wieder aufgreifen

Im Protokoll vom 20. Oktober wurden langsame Reviews, doppelte Arbeit, fehlende
PR-Aufmerksamkeit und verteilte technische Diskussionen angesprochen.

- „Hat sich die Wartezeit auf Reviews verbessert? Welches konkrete Beispiel gibt es?“
- „Arbeiten wir auf zugewiesenen Tickets, und sehen wir Abhängigkeiten früh genug?“
- „Sind technische Entscheidungen im zugehörigen PR nachvollziehbar dokumentiert?“
- „Sind die Übergaben per Follow-up-Ticket aus der Retrospektive vom 27. Oktober
  nachvollziehbar, und wurde die Arbeit vor dem Commit auf Vollständigkeit geprüft?“
- „Was wollen wir nächste Woche beibehalten, stoppen oder anfangen?“

Wählt ein bis zwei Verbesserungen statt einer langen Wunschliste. Jede Maßnahme
bekommt eine verantwortliche Person und einen Zeitpunkt, an dem ihr ihre Wirkung
prüft. Beispiel zur Diskussion: „Review-Anfragen bekommen bis zum nächsten
Arbeitstag eine Rückmeldung oder einen vereinbarten Reviewtermin.“

## Planung und Abschluss

Für die Planung zuerst Verfügbarkeit und Prioritäten klären, dann ein gemeinsames
Sprintziel formulieren. Felix ist nicht mehr Teil der Gruppe; Lasse hat seinen PR
übernommen. Diese Übergabe und Lasses geplante CRUD-/S3-Arbeit bei der Kapazität
berücksichtigen. Zu jedem ausgewählten Ticket festhalten: erwartetes
Ergebnis, Verantwortlicher, Abhängigkeit und benötigtes Review. Offene Arbeit nicht
automatisch vollständig in den nächsten Sprint übernehmen.

Zum Schluss die Aktionsliste laut vorlesen: „Wer macht was bis wann?“ Fehlende
Verantwortliche oder Termine direkt klären. Nächsten Scrum Master bestätigen.

Nach dem Termin Platzhalter im Protokoll bereinigen, echte Ergebnisse und
Beschlüsse eintragen und Änderungen über einen PR zur Teamprüfung bereitstellen.
Laut [Vereinbarung vom 6. Oktober](onsite-2026-10-06.md) soll dieser mindestens
24 Stunden offen bleiben oder bis alle zugestimmt haben. GitHub-Regeln für das
Mergen gelten zusätzlich.
