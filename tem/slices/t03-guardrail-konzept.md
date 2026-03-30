# T03 Guardrail-Konzept fuer Wrapper

## Ziel
Wrapper, Adapter und Legacy-Fallbacks duerfen nicht mehr heimlich herumliegen wie defekte Kabel hinter der Wand. Jeder Rest bekommt eine Frist, eine Referenz, eine klare Verantwortung und einen automatischen Check.

## Wrapper-Ablaufdaten
Jeder Wrapper fuehrt strukturierte Metadaten mit:
- `wrapperId`: stabiler technischer Name
- `canonicalTarget`: kanonische Ziel-API
- `owner`: zuständiges Team oder Person
- `ticketRef`: Migrations- oder Abbau-Ticket
- `introducedAt`: Einfuehrungsdatum
- `expiresAt`: hartes Ablaufdatum
- `state`: `active`, `warn`, `expired`, `removed`
- `reason`: kurzer Grund fuer die Existenz
- `lastObservedAt`: letzter produktiver Aufruf

Pflichtregel:
- Kein Wrapper ohne `expiresAt`.
- Kein Wrapper ohne `ticketRef`.
- Kein Wrapper ohne `canonicalTarget`.
- Kein Wrapper ohne Eintrag in der zentralen Guardrail-Liste.

Beispiel fuer Naming:
- Wrapper-ID: `wrp-base-ui-controller`
- Ticket: `T03-BASEUI-017`
- Ziel-API: `ui.baseController.v2`
- Flag: `legacy.wrapper.base-ui-controller`
- CI-Job: `check:wrapper-guardrails`

## Flag-Strategie
Flags steuern nur die kontrollierte Uebergangsphase, nicht den Dauerbetrieb.

### Grundregeln
- Ein Flag pro Wrapper-Familie, nicht pro Callsite.
- Flag-Namen sind im Namespace `legacy.wrapper.<bereich>.<modul>`.
- Flags sind standardmaessig nur fuer Migration offen, nie als permanente Rueckfall-Lizenz.
- Ein Flag darf niemals ein abgelaufenes `expiresAt` ueberschreiben.
- Wenn ein Wrapper entfernt ist, wird das Flag geloescht, nicht deaktiviert. Deaktiviert ist nur die Ausrede-Version von geloescht.

### Empfohlene Namen
- `legacy.wrapper.base-ui-controller`
- `legacy.wrapper.main-menu-controller`
- `legacy.wrapper.ui-controller`
- `legacy.wrapper.world-render-fallback`

### Flag-Logik
- `true` bedeutet: Wrapper ist noch im kontrollierten Migrationsfenster.
- `false` bedeutet: Wrapper darf nicht mehr fuer neue Pfade verwendet werden.
- Abgelaufen bedeutet: CI blockiert, selbst wenn das Flag versehentlich noch `true` ist.

## TTL-Regeln
TTL ist nicht verhandelbar, nur begruendbar.

### Standard-TTL
- UI-Controller-Wrapper: 14 Tage
- Runtime-/Bootstrap-Wrapper: 7 Tage
- Render-/Browser-Fallbacks: 7 Tage
- Niedrigrisiko-Adapter mit klarer Ablösung: 21 Tage

### Verlaengerung
- Maximal eine Verlängerung pro Wrapper.
- Verlaengerung nur mit neuem Ticket-Comment und aktualisiertem `expiresAt`.
- Jede Verlaengerung braucht eine konkrete Ursache, keine Wolkenformel wie "noch nicht fertig".

### TTL-Beispiele
- `wrp-base-ui-controller` aktiv ab `2026-03-30`, Ablauf `2026-04-13`
- `wrp-world-render-fallback` aktiv ab `2026-03-30`, Ablauf `2026-04-06`
- `wrp-ui-controller` aktiv ab `2026-03-30`, Ablauf `2026-04-20`

## CI- und Policy-Check
Der Check laeuft als fester Gatekeeper vor Merge und vor Release.

### Was der Check prueft
- Jeder Wrapper hat `wrapperId`, `ticketRef`, `canonicalTarget`, `expiresAt`.
- Kein `expiresAt` liegt in der Vergangenheit.
- Kein Wrapper ist `state=active`, wenn das zugehoerige Flag fehlt.
- Kein Flag existiert ohne passenden Wrapper-Eintrag.
- Keine produktive Referenz zeigt auf einen Wrapper, dessen Migration als abgeschlossen markiert ist.
- Kein Wrapper wird ohne Owner gepflegt.

### CI-Gate-Beispiel
Jobname:
- `check:wrapper-guardrails`

Fail-Bedingungen:
- `expiresAt < today`
- `ticketRef` fehlt
- `canonicalTarget` fehlt
- Flag existiert, aber Wrapper-Eintrag fehlt
- Wrapper ist `warn` oder `expired` und trotzdem noch im produktiven Pfad aktiv

Beispielausgabe:
```text
FAIL: wrp-main-menu-controller expired at 2026-04-01
FAIL: legacy.wrapper.main-menu-controller still enabled
FAIL: missing ticketRef for wrp-ui-controller
```

### Report-Format
Der Check schreibt einen kompakten Report mit:
- Wrapper-ID
- Status
- Ablaufdatum
- Letzter produktiver Aufruf
- Owner
- Offene Restarbeit

## Eskalationspfad
Wenn ein Wrapper am Ablauf kratzt oder drueber ist, wird nicht diskutiert wie in einer kaputten Ausschusssitzung. Dann greift ein klarer Pfad.

### Stufe 1: Warnung
- 7 Tage vor Ablauf erscheint der Wrapper im CI-Report als `warn`.
- Owner bekommt ein Update mit Ticket-Ref und Restzeit.

### Stufe 2: Blockade
- Am Ablaufdatum wird der Merge fuer Aenderungen mit Wrapper-Abhaengigkeit blockiert.
- Neue Wrapper-Referenzen duerfen nicht mehr hinzukommen.

### Stufe 3: Ausnahme
- Nur bei externer Blockade darf ein Ausnahme-Ticket eroeffnet werden.
- Die Ausnahme braucht begruendete Ursache, neue Ziel-Deadline und explizite Freigabe.
- Ausnahme verlaengert maximal um 7 Tage.

### Stufe 4: Entfernung
- Nach erfolgreicher Migration wird der Wrapper aus Code, Flag-Registry und CI-Allowlist entfernt.
- Danach muss der Guardrail-Check wieder gruen sein, sonst ist die "Entfernung" nur Kosmetik.

## Operative Definition fuer T03
T03 ist abgeschlossen, wenn:
- Wrapper-Metadaten verbindlich definiert sind,
- Flag-Namespace und TTL-Regeln feststehen,
- ein CI-Policy-Check beschrieben ist,
- der Eskalationspfad fuer Warnung, Blockade und Ausnahme festgelegt ist.

## Kurzfassung
Wrapper sind nur noch mit Zeitstempel, Ticket und Exit-Plan geduldet. Ohne diese drei Dinge ist der Wrapper kein Uebergang, sondern technischer Muell mit Marketing-Label.
