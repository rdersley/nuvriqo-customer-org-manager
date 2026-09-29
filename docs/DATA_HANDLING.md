# Data handling — Nuvriqo Customer & Organisation Manager

_Last checked against the code: 28 September 2026 (app version 0.3.0)._

This is the source of truth for the Privacy & Security questionnaire and the public security page. If the code changes what is read, written or stored, update this file in the same pull request.

## Architecture

- Forge-native Jira admin page (`jira:adminPage`) with one resolver function.
- No Forge Remote, no external fetch, no vendor-operated servers, no analytics.
- Every Jira call uses `api.asUser()`, so it runs with the signed-in administrator's own permissions. The app never uses `asApp()`.
- Every resolver first checks that the caller has the Jira **Administer** global permission.

## Data read from Jira / JSM

| Data | API | Why |
|---|---|---|
| The caller's Administer permission | `GET /rest/api/3/mypermissions` | Admin-only access check on every call |
| Service projects (id, name) | `GET /rest/servicedeskapi/servicedesk` | Service-project picker |
| Customers of a service project (account id, display name, email) | `GET /rest/servicedeskapi/servicedesk/{id}/customer` | Customer list/search and the import comparison |
| Organisations (id, name) | `GET /rest/servicedeskapi/organization` | Organisation list, and matching CSV organisation names |
| Bulk task status | `GET /jsm/csm/api/v1/tasks/{id}` | Import History status column |

Customer names and emails are shown in the browser and used in memory for the preview. **They are never written to app storage.**

## Data written to Jira / JSM

| Change | API | When |
|---|---|---|
| Create an organisation | `POST /rest/servicedeskapi/organization` | Only for organisation names that a complete scan of the site proved missing, when an administrator clicks Import or Resume |
| Create or update customer profiles, and add them to organisations | `POST /jsm/csm/api/v1/customer/profile/bulk` | When an administrator clicks Import or Resume; at most 100 rows per request, each with an idempotency key |

## CSV files

- The CSV is read and parsed **in the administrator's browser**.
- For files of 500 rows or fewer, rows are sent to the resolver for validation; the resolver returns errors and keeps nothing.
- Rows being imported are sent to the resolver in batches of 100 and passed straight to the Jira bulk API. The resolver keeps nothing from the rows.
- The browser computes a SHA-256 fingerprint of the file so an interrupted import can be recognised and resumed. Only the fingerprint is stored, not the file.

## Data stored in Forge storage (KVS)

Installation-scoped Forge KVS only. No customer names or email addresses are stored.

| Key | Contents | Retention |
|---|---|---|
| `import-session:<id>` | Import session: file name, file fingerprint, service project id, row counts, batch counts, status, per-batch Jira task ids and idempotency keys, timestamps | 180 days after last update (KVS TTL) |
| `import-session-rows:<id>:<n>` | The CSV row numbers the session will import (numbers only), in chunks of 5,000 | 180 days after last update |
| `import-recovery:<serviceDeskId>:<fingerprint>` | Pointer to the session that can be resumed for a file | 180 days, or deleted when the session completes |
| `import:<idempotencyKey>` | Bulk task record: Jira task id, batch number, row count, row range, timestamp | 180 days |
| `import-mapping:<id>` | Saved CSV column mapping: mapping name, service project id, CSV header names | Until an administrator deletes it |

**Personal data:** the app stores no Atlassian account IDs, emails or names, so it does not use the Personal Data Reporting API (`report:personal-data` is not requested). The CSV file name is stored as typed by the administrator; admins should avoid putting personal data in file names.

## Licensing and read-only mode

In production, a site without an active licence can still browse and preview, but every resolver that changes Jira or app storage refuses the call (see `src/license.js`).

## Uninstall

After uninstall, the installation's KVS data is removed by Atlassian under Forge's hosted-storage retention policy. Confirm the current retention window in Atlassian's Forge documentation before quoting a number in the questionnaire. Changes already made in Jira (customers, organisations) stay in Jira.

## External egress

None. `manifest.yml` declares no external fetch permissions.
