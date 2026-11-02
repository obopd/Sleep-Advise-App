# Privacy and security

* **Default: local-only.** Records live in the browser's storage on the user's phone. Nothing is sent anywhere. No analytics, no third-party scripts (Content-Security-Policy restricts scripts to the app's own files and network calls to the app and, if enabled, Supabase).
* **Optional cloud sync** (Supabase): email/password auth; every table protected by Row Level Security (tested). The browser holds only the public anon key; no service-role key is used or needed. Sign-in tokens are stored in the browser like Planner's; an XSS bug could expose them, so user text is only ever inserted as text (never HTML) and the CSP blocks injected scripts.
* **Sensitive categories**: medication tracking is off by default; medication records are excluded from exports unless the user includes them.
* **Research**: off by default; exports use a pseudonymous participant ID; researchers can read lab and enrolment tables only, never diaries.
* **No AI services** receive any data. If an AI explanation feature is added later, send the minimum necessary, with explicit consent and an appropriate data-processing agreement.
* **No model training** on user data without explicit research consent.
* **Deletion**: More → Privacy deletes everything on the device (including the v1 backup). Account deletion (cloud) removes the cloud copy including research rows. See DATABASE.md, "Consent, withdrawal and deletion".
* **Logging**: the app does not log personal data to the console or any server.
* **Known limits**: browser storage is not encrypted at rest beyond the phone's own encryption; anyone with the unlocked phone can open the app. A lock screen/passcode feature is on the roadmap.
