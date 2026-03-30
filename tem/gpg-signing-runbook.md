# GPG Signing Runbook (`D7EA78B1F7778AFD`)

## Problem
- Git commit signing failed with:
  - `gpg: ... keyboxd: Input/output error`
  - `gpg: trustdb is not writable`

## Ursache
- In der Codex-Sandbox sind Writes nach `%APPDATA%\gnupg` blockiert.
- GPG kann dort in Sandbox-Kontext nicht schreiben; im echten User-Kontext funktioniert es.

## Verifizierter Fix-Ablauf (real user context)
1. `gpgconf --kill all`
2. Lock-/Socket-Zustand bereinigen und Dienste neu starten:
   - `gpgconf --launch keyboxd`
   - `gpgconf --launch gpg-agent`
3. Key verifizieren:
   - `gpg --list-secret-keys --keyid-format=long`
4. Sign-Test:
   - `echo test-sign | gpg --clearsign`

## Ergebnis
- Sign-Test ist im unsandboxed Kontext erfolgreich (`exit 0`, gültige ASCII-armored Signatur).
- Key bleibt:
  - Key ID: `D7EA78B1F7778AFD`
  - Fingerprint: `F14A6FC849CF906ED7518584D7EA78B1F7778AFD`

## Git-Konfig (validiert)
- `user.signingkey=D7EA78B1F7778AFD`
- `commit.gpgsign=true`
- `gpg.program=C:\Program Files\GnuPG\bin\gpg.exe`

## Hinweis
- In Sandbox-Läufen können weiterhin `EPERM`/Write-Errors bei GPG auftreten.
- Für echte Signing-Verifikation oder signierte Commits den unsandboxed/elevated Kontext verwenden.
