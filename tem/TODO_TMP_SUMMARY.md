# TODO TMP Summary

## Ziel
Zentrale Sammelstelle fuer temporaere Daten unter `tem/`.
Status wird strikt getrennt gefuehrt in `Offen` und `Erledigt`.

## Offen
- [ ] `CF-001` final technisch schliessen (aktuell `REVIEW`): [beide-plaene.md](./beide-plaene.md), [cf-001-rebuttal.md](./rebuttals/cf-001-rebuttal.md)
- [ ] `CF-002` final technisch schliessen (aktuell `REVIEW`): [beide-plaene.md](./beide-plaene.md), [cf-002-rebuttal.md](./rebuttals/cf-002-rebuttal.md), [repair-check-cf002.md](./repair-check-cf002.md)
- [ ] `T01` final freigeben (aktuell `REVIEW`): [t01-legacy-wrapper-inventur.md](./t01-legacy-wrapper-inventur.md), [t01-rebuttal.md](./rebuttals/t01-rebuttal.md)
- [ ] `T02` final freigeben (aktuell `REVIEW`): [t02-kanonische-api-matrix.md](./slices/t02-kanonische-api-matrix.md), [t02-rebuttal.md](./rebuttals/t02-rebuttal.md)
- [ ] `CF-003+` und `T04+` sequenziell umsetzen mit parallel laufender Gegenpruefung/Reparatur je Task (siehe [beide-plaene.md](./beide-plaene.md))
- [ ] `evidence:bundle` strikt gruen bekommen (aktuell kein `jszip`-Fehler mehr, aber strict-target=10 wird verfehlt): [evidence-remediation-jszip.md](./slices/evidence-remediation-jszip.md)

## Erledigt
- [x] Zwei Ausgangsplaene atomisiert und in eine zentrale Datei ueberfuehrt: [beide-plaene.md](./beide-plaene.md)
- [x] Architektur-Notiz CF-001 erstellt: [cf-001-architektur-notiz.md](./cf-001-architektur-notiz.md)
- [x] Legacy-/Wrapper-Inventur initial erstellt und erweitert: [t01-legacy-wrapper-inventur.md](./t01-legacy-wrapper-inventur.md)
- [x] Testline-Update + Verify wurde ausgefuehrt (laut Subagent-Protokoll)
- [x] Kritischer Bug-Review erstellt: [reported-bugs.md](./reported-bugs.md)
- [x] Test-Evidence-Report erstellt: [test-evidence-report.md](./test-evidence-report.md)
- [x] Langfristiger Bug-Plan erstellt: [langfristiger-bug-plan.md](./langfristiger-bug-plan.md)
- [x] Slice-Dokumentation aufgebaut: [slices](./slices)
- [x] CHECK-Rechtfertigungsrunde ausgefuehrt: [check-justification/summary.md](./check-justification/summary.md)
- [x] CHECK-Marker auf `REVIEW` synchronisiert fuer `CF-001`, `CF-002`, `T01`, `T02`, `T03`: [beide-plaene.md](./beide-plaene.md)
- [x] CF-002-Reparaturzyklus mit Gegenpruefung + Nachreparatur abgeschlossen: [repair-check-cf002.md](./repair-check-cf002.md)
- [x] Nitpick-Fixes umgesetzt und validiert: [nitpick-check-report.md](./nitpick-check-report.md)
- [x] Doku/SoT-Validitaetsreport erstellt: [sot-doc-validity-report.md](./sot-doc-validity-report.md)
- [x] `T03` technisch aktiviert: Wrapper-Registry + CI/Runtime-Guard (`check:wrapper-guardrails`) in `preflight`/`check:required`
- [x] GPG-Signing-Fix dokumentiert und im echten User-Kontext verifiziert: [gpg-signing-runbook.md](./gpg-signing-runbook.md)

## TMP Artefaktindex
- Arbeitslog: [md-worklog.md](./md-worklog.md)
- Traceability: [traceability-map.md](./traceability-map.md)
- Rebuttals: [rebuttals](./rebuttals)
- Check-Justification: [check-justification](./check-justification)
- Plan-Slices: [slices](./slices)
