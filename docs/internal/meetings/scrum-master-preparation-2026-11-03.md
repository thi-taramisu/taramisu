# Scrum-Master-Vorbereitung – 3. November 2026

Diese Vorbereitung orientiert sich an euren Onsite-Protokollen vom
[13. Oktober](onsite-2026-10-13.md) und [20. Oktober](onsite-2026-10-20.md).
Die englische [Meeting-Vorlage](onsite-2026-11-03.md) bleibt im bisherigen Stil;
dieser deutsche Leitfaden ist deine Hilfe beim Moderieren.

Datum: Dienstag, 3. November 2026, KW45. Uhrzeit und Sprintnummer noch bestätigen.
Nach der bisherigen Wochenfolge wäre der Review für Sprint 4 vom 28. Oktober
bis 3. November und die Planung für Sprint 5 vom 4. bis 10. November.
Die tatsächlichen Vereinbarungen aus der vorherigen Planung haben Vorrang.

## Dein Ziel als Moderator

Am Ende sollen alle wissen, was tatsächlich funktioniert, was noch offen ist,
welche Entscheidungen getroffen wurden und wer welchen nächsten Schritt übernimmt.
Du moderierst den Ablauf; Ergebnisse, Prioritäten und Sprintziel bestätigt ihr
gemeinsam mit dem Team und dem Product Owner. Du musst nicht alle technischen
Fragen selbst beantworten.

## Vorbereitung während der Woche

- [ ] Übergabe mit dem bisherigen Scrum Master: Sprintziel, ausgewählte Tickets,
  offene Beschlüsse, Termin und verfügbare Zeit klären.
- [ ] Prüfen, ob es inzwischen ein Protokoll vom 27. Oktober gibt. Beim Erstellen
  dieses Entwurfs war lokal keines vorhanden.
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

## Konkrete Vorbereitungsthemen aus GitHub

**Momentaufnahme vom 27. Oktober 2026, vor dem kommenden Reviewzeitraum.**
Alle unten genannten PRs und Issues waren beim Abruf offen. Das sind Kandidaten
für Nachfragen, keine feststehenden Sprintaufgaben oder abgeschlossenen Ergebnisse.
Vor dem Termin Status und Sprintzuordnung erneut prüfen.

| Bereich | Referenzen | Sinnvolle Nachfrage / möglicher Nachweis |
| --- | --- | --- |
| Frontend | [PR #120](https://github.com/thi-taramisu/taramisu/pull/120), [PR #142](https://github.com/thi-taramisu/taramisu/pull/142) | Hauptseite und Projekteinstellungen zeigen: Was ist schon integriert, welche Daten sind noch Beispiele? |
| Domänen-API | [PR #138](https://github.com/thi-taramisu/taramisu/pull/138), [PR #134](https://github.com/thi-taramisu/taramisu/pull/134) | Item-/Projekt-CRUD und Berechtigungen demonstrieren; Reviewstatus und nächsten Schritt klären. |
| API-Anbindung | [Issue #118](https://github.com/thi-taramisu/taramisu/issues/118) | Wie kommen aktuelle Backend-Typen ins Frontend, und was blockiert die Verbindung? |
| Betrieb | [PR #128](https://github.com/thi-taramisu/taramisu/pull/128), [PR #141](https://github.com/thi-taramisu/taramisu/pull/141), [PR #140](https://github.com/thi-taramisu/taramisu/pull/140) | Monitoring, Image-Publishing und Docs-Integration: Was ist getestet, was tatsächlich veröffentlicht oder gestartet? |
| Architektur / Infrastruktur | [PR #87](https://github.com/thi-taramisu/taramisu/pull/87), [Issue #100](https://github.com/thi-taramisu/taramisu/issues/100), [Issue #110](https://github.com/thi-taramisu/taramisu/issues/110) | Sind Netzwerktopologie und Zuständigkeiten geklärt? Welche Abhängigkeit verhindert den nächsten integrierten Stand? |
| Berechtigungen | [Issue #143](https://github.com/thi-taramisu/taramisu/issues/143) | Welche Entscheidung braucht das Team zu Rollen, Gruppen und Zugriffsrechten? |

## Retrospektive: frühere Vereinbarungen wieder aufgreifen

Im Protokoll vom 20. Oktober wurden langsame Reviews, doppelte Arbeit, fehlende
PR-Aufmerksamkeit und verteilte technische Diskussionen angesprochen.

- „Hat sich die Wartezeit auf Reviews verbessert? Welches konkrete Beispiel gibt es?“
- „Arbeiten wir auf zugewiesenen Tickets, und sehen wir Abhängigkeiten früh genug?“
- „Sind technische Entscheidungen im zugehörigen PR nachvollziehbar dokumentiert?“
- „Was wollen wir nächste Woche beibehalten, stoppen oder anfangen?“

Wählt ein bis zwei Verbesserungen statt einer langen Wunschliste. Jede Maßnahme
bekommt eine verantwortliche Person und einen Zeitpunkt, an dem ihr ihre Wirkung
prüft. Beispiel zur Diskussion: „Review-Anfragen bekommen bis zum nächsten
Arbeitstag eine Rückmeldung oder einen vereinbarten Reviewtermin.“

## Planung und Abschluss

Für die Planung zuerst Verfügbarkeit und Prioritäten klären, dann ein gemeinsames
Sprintziel formulieren. Zu jedem ausgewählten Ticket festhalten: erwartetes
Ergebnis, Verantwortlicher, Abhängigkeit und benötigtes Review. Offene Arbeit nicht
automatisch vollständig in den nächsten Sprint übernehmen.

Zum Schluss die Aktionsliste laut vorlesen: „Wer macht was bis wann?“ Fehlende
Verantwortliche oder Termine direkt klären. Nächsten Scrum Master bestätigen.

Nach dem Termin Platzhalter im Protokoll bereinigen, echte Ergebnisse und
Beschlüsse eintragen und Änderungen über einen PR zur Teamprüfung bereitstellen.
Laut [Vereinbarung vom 6. Oktober](onsite-2026-10-06.md) soll dieser mindestens
24 Stunden offen bleiben oder bis alle zugestimmt haben. GitHub-Regeln für das
Mergen gelten zusätzlich.
