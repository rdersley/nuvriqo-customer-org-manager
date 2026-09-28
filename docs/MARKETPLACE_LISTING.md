# Marketplace listing — Nuvriqo Customer & Organisation Manager

Source for the Atlassian Marketplace listing and the Privacy & Security questionnaire. Facts come from [DATA_HANDLING.md](DATA_HANDLING.md) and [SECURITY.md](SECURITY.md); keep them in sync.

## Names

- **App name:** Nuvriqo Customer & Organisation Manager for Jira Service Management
- **Short name (in Jira):** Customer & Organisation Manager
- **Suggested key:** `com.nuvriqo.customer-org-manager`
- **Compatibility:** Jira Cloud with Jira Service Management
- **Hosting:** Runs on Atlassian (Forge). No external egress.

## Tagline (≤ 80 characters)

Bulk-import and manage JSM customers and organisations safely, at any scale.

## Summary (≤ 250 characters)

Import thousands of Jira Service Management customers from a CSV, see exactly what will be created, updated or skipped before anything changes, and create missing organisations automatically, without duplicates. Built for large sites.

## More details (250–1000 characters)

Customer & Organisation Manager gives Jira administrators one place to manage JSM customers and organisations, and a bulk importer built for real-world data.

- Preview every row as Create, Update, Skip or Error before anything changes in Jira.
- Import 16,000+ customers in controlled, retry-safe batches of 100.
- Bad rows are excluded and listed with the reason; the valid rows still import.
- Missing organisations are created automatically, only after the whole site has been checked, so existing ones are never duplicated.
- Interrupted imports resume from the batch where they stopped, using the original row plan.
- Search every customer and organisation, however many your site has.
- Import history shows each import and the status of every Jira bulk task.

Runs entirely on Atlassian Forge and uses only the signed-in administrator's own Jira permissions.

## Highlights (3)

1. **Know before you import.** Every CSV row is checked against Jira and marked Create, Update, Skip or Error. Nothing changes until you click Import. _(Screenshot: Import preview with counts and row actions.)_
2. **Built for large sites.** Import 16,000+ customers in retry-safe batches. Organisation matching checks every organisation on the site, so none are duplicated. _(Screenshot: large-import comparison and progress.)_
3. **Safe to stop and resume.** If an import is interrupted, select the same file and resume from the batch where it stopped. _(Screenshot: saved import recovered, with the Resume button.)_

## Keywords

Jira Service Management, JSM customers, organizations, organisation, bulk import, CSV import, customer import, customer management, service desk customers, user import

## URLs (publish these before submitting)

| Field | Value |
|---|---|
| Documentation | Confluence page from `docs/public/documentation.md` (NS space) |
| Support / service desk | https://nuvriqo.atlassian.net/servicedesk/customer/portal/2 |
| Security & privacy overview | Confluence page from `docs/public/security.md` (NS space) |
| Privacy policy | Nuvriqo privacy policy (shared): https://nuvriqo.atlassian.net/wiki/spaces/NS/pages/1540097 |
| EULA | Atlassian Marketplace standard (Bonterms), as for Follow-Up Manager and Portal+ |
| Contact | support@nuvriqo.com |

Past rejections of other Nuvriqo apps came from a **missing support portal link** on a paid app, **invalid links**, and an **unsubmitted Privacy & Security questionnaire**. Check all three before submitting.

## Privacy & Security questionnaire answers

The questionnaire ignores automated input, so an administrator types these in by hand.

- **Does the app store End-User Data outside Atlassian?** No. Forge only; no egress.
- **Does the app process End-User Data?** Yes, in transit only. Customer names and emails from the CSV and from Jira are shown to the administrator and sent to Jira's customer API. They are not stored.
- **Data stored by the app (Forge KVS):** import session metadata (file name, SHA-256 file fingerprint, service project id, row and batch counts, row numbers, Jira task ids, timestamps) and saved column mappings (CSV header names). No names, emails or account IDs.
- **Retention:** import records expire 180 days after their last update; saved mappings remain until deleted; all app data is removed by Atlassian after uninstall.
- **Personal data reporting:** not applicable, because no Atlassian account IDs are stored.
- **Encryption:** Forge-managed encryption in transit and at rest.
- **Access control:** Jira administrators only; every call is checked server-side; all Jira calls use the administrator's own permissions (`asUser`).
- **Data residency:** follows the Atlassian site's Forge data residency (Runs on Atlassian).
- **Sub-processors:** none beyond Atlassian.

### Scope justification (paste into the scope justification field, 250–5000 characters)

> Customer & Organisation Manager is a Jira admin page for bulk-managing Jira Service Management customers and organisations. Every call is made as the signed-in Jira administrator (asUser) after a server-side check of the Administer permission.
> storage:app stores import session metadata (row counts, row numbers, Jira bulk task ids, timestamps) and saved CSV column mappings in Forge storage; no customer names or emails are stored.
> read:jira-work is used only for GET /rest/api/3/mypermissions, the administrator check on every request.
> read:servicedesk-request lists service projects (GET /rest/servicedeskapi/servicedesk) for the service-project picker.
> manage:servicedesk-customer lists a service project's customers, lists organisations, and creates organisations that an import needs (/rest/servicedeskapi/servicedesk/{id}/customer, /rest/servicedeskapi/organization).
> write:customer:jira-service-management and write:customer.profile:jira-service-management create and update customer profiles and their organisation membership through the JSM customer bulk API (/jsm/csm/api/v1/customer/profile/bulk).
> read:task:jira-service-management reads the status of those bulk tasks (/jsm/csm/api/v1/tasks/{id}) for the Import History view.

## Pricing

To be decided by Nuvriqo (paid via Atlassian, like Follow-Up Manager). Licensing is enforced in code: without an active licence the app is read-only.
