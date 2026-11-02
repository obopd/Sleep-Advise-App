# External integrations (Phase 7)

Principle: the app has no backend, so only integrations that work entirely on the phone are possible. Everything below that needs a server or vendor credentials is out of scope by design.

| Source | Status | Notes |
|---|---|---|
| **Apple Health export (export.xml)** | Implemented and tested | File chosen by the user; streamed so large exports work. Sleep analysis (In Bed / Asleep stages) → `sleep_episodes` with `source = import_apple_health`; Apple Watch Time in Daylight → `light_exposure_events` as `device_daylight` (no lux). Timestamps carry a UTC offset, so instants are exact; the IANA zone is not in the export, so the user's current zone is recorded and flagged. Re-imports are de-duplicated. |
| **Sleep-diary CSV** (other apps) | Implemented and tested | `date, bedTime, wakeTime` + optional columns (aliases accepted). Read as local time in the user's zone. |
| **Light-sensor CSV** (Actiwatch, ActTrust, other loggers) | Implemented and tested | Timestamp (or Date + Time) and lux; 10-minute mean bins as `sensor` light events; implausible values (< 0 or > 200,000 lux) rejected; explicit offsets honoured. Spectral/melanopic columns are not parsed yet; never derived from lux. |
| Apple HealthKit live sync | Not implemented: requires a native iOS app | HealthKit has no web API. Would need a native wrapper (e.g. Capacitor/Swift) and App Store distribution. |
| Google Health Connect | Not implemented: requires a native Android app | On-device Android API only. |
| Fitbit, Oura, Withings, Garmin cloud APIs | Not planned (needs a backend) | Vendor OAuth needs developer credentials kept on a server. Users can still import if the vendor offers a CSV/file export (sleep CSV importer). |
| Phone ambient-light sensor in the browser | Not implemented | The Generic Sensor API's AmbientLightSensor is not available in iOS Safari, and phone sensors in pockets do not measure eye-level light. |
| Spectral / melanopic light loggers | Requires hardware | Schema is ready (`spectral_measurement`, `melanopic_edi_lux`); a parser can be added for a specific device's export format. |

All imports run on the device; files are never uploaded.
