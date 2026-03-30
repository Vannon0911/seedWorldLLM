# evidence:bundle Slice - jszip Blocker

## Ursache
- `tem/test-evidence-report.md` zeigt einen klaren Tooling-Fehler: `npm run evidence:bundle` bricht beim Laden von `dev/scripts/build-evidence-bundle.mjs` mit `ERR_MODULE_NOT_FOUND` fuer `jszip` ab.
- Der Befund passt zu einem Manifest-Drift: Das Build-Skript importiert `jszip`, aber `package.json` und `package-lock.json` deklarieren die Abhaengigkeit nicht.
- Die eigentlichen Test- und Evidence-Gates sind davon nicht betroffen; der Blocker sitzt isoliert im Bundle-Generator.

## Minimaler Fix
- `jszip` als explizite Laufzeitabhaengigkeit im Projektmanifest nachziehen und den Lockfile-Stand aktualisieren.
- Den Bundle-Builder unveraendert lassen, sofern er fachlich korrekt arbeitet; hier fehlt nur die deklarierte Dependency, nicht die Logik.
- Den Fix bewusst klein halten: kein Refactor des Evidence-Workflows, kein Seitentausch im Testpfad.

## Validierung
- `npm run evidence:bundle` muss den Modul-Load ohne `ERR_MODULE_NOT_FOUND` schaffen und das Bundle erfolgreich erzeugen.
- Danach `npm run evidence:verify` erneut laufen lassen, um sicherzustellen, dass das Artefakt weiterhin akzeptiert wird.
- Optional als Rueckversicherung: `npm test`, damit der Dependency-Nachzug keine ungewollten Nebenwirkungen im bestehenden Testlauf erzeugt.

## Risiken
- Eine nachgezogene Dependency kann ESM/CJS-Interoperabilitaet oder Versionskonflikte offenlegen, wenn `jszip` nicht sauber an die aktuelle Node-/Build-Umgebung passt.
- Falls der Lockfile nicht konsistent aktualisiert wird, bleibt der Fehler in frischen Installationen bestehen und wandert nur auf anderes Geraffel.
- Ein zu breiter Fix im Bundle-Skript wuerde das eigentliche Problem verschleiern statt es zu beseitigen.

## Follow-up
- Einen kleinen CI- oder Smoke-Check fuer `npm run evidence:bundle` in einer sauberen Umgebung ergaenzen, damit verdeckte Tooling-Dependencies nicht wieder durchrutschen.
- Falls weitere Build-Skripte implizite Imports haben, dieselbe Manifest-Pruefung auf sie anwenden, bevor der naechste fehlende Stein wieder den ganzen Karren blockiert.
