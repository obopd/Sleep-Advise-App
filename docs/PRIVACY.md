# Privacy and security

* **No backend.** There are no accounts and no server. Records live only in the browser's storage on the user's phone. The app makes no network requests other than loading its own files (a test fails if code contacting another host is added; the Content-Security-Policy blocks other connections and third-party scripts).
* **Data leaves the phone only as files the user saves**: backup files (More → Backup) and research exports (More → Research & export). Those files are the user's responsibility to store privately.
* **Sensitive categories**: medication tracking is off by default; medication records are excluded from research exports unless the user includes them (backups always contain everything).
* **Research**: off by default; exports use a pseudonymous participant ID.
* **No AI services or model training** receive any data.
* **XSS**: user text is only inserted as text, never HTML; `innerHTML` is used only for static SVG drawn from numbers; the CSP allows only the app's own scripts.
* **Deletion**: More → Privacy deletes everything on the phone, including the earlier version's copy.
* **Logging**: no personal data is logged.
* **Known limits**: browser storage is protected by the phone's own encryption and lock screen, not by the app; anyone with the unlocked phone can open it (an app passcode is on the roadmap). Clearing website data or removing the app deletes the records: keep backup files.
