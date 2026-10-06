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

Customer & Organisation Manager gives Jira administrators one place to manage JSM customers and organisations, with a bulk importer built for real-world data.

- Preview every row as Create, Update, Skip or Error before anything changes in Jira.
- Map any CSV columns, and save mappings for next time.
- Import 16,000+ customers in retry-safe batches. They're added to the service project and their organisations.
- Bad rows are left out with the reason; the rest still import.
- Missing organisations are created only after the whole site has been checked, so none are duplicated.
- Interrupted imports resume from where they stopped.
- Client → Organisation sync keeps the JSM Organizations field in step with a Client field, with no Jira Automation rules.

Runs entirely on Atlassian Forge, with no external services.

## Highlights and screenshots

The images (1840×900) and the exact highlight titles, summaries and screenshot captions are in [`docs/marketing/`](marketing/README.md):

1. **Know exactly what an import will change**: `highlight-1-know-before-you-import.png`
2. **Built for 16,000+ customer imports**: `highlight-2-built-for-large-sites.png`
3. **Organisations that stay in sync**: `highlight-3-organisations-in-sync.png`

Plus six captioned screenshots: column mapping, import results, sync settings, import history, organisations, and the large-import confirmation.

## Keywords

Jira Service Management, JSM customers, organizations, organisation, bulk import, CSV import, customer import, customer management, organization sync, client field, automation alternative

## URLs (publish these before submitting)

| Field | Value |
|---|---|
| Documentation | https://nuvriqo.atlassian.net/wiki/spaces/NS/pages/9240577 (from `docs/public/documentation.md`) |
| Support page | https://nuvriqo.atlassian.net/wiki/spaces/NS/pages/44924930 (from `docs/public/support.md`) |
| Support / service desk | https://nuvriqo.atlassian.net/servicedesk/customer/portal/2 |
| Security & privacy overview | https://nuvriqo.atlassian.net/wiki/spaces/NS/pages/45056001 (from `docs/public/security.md`) |
| Release notes | https://nuvriqo.atlassian.net/wiki/spaces/NS/pages/9437185 |
| Privacy policy | Nuvriqo privacy policy (shared): https://nuvriqo.atlassian.net/wiki/spaces/NS/pages/1540097 |
| EULA | Atlassian Marketplace standard (Bonterms), as for Follow-Up Manager and Portal+ |
| Contact | support@nuvriqo.com |

Past rejections of other Nuvriqo apps came from a **missing support portal link** on a paid app, **invalid links**, and an **unsubmitted Privacy & Security questionnaire**. Check all three before submitting.

## Privacy & Security questionnaire answers

The questionnaire ignores automated input, so an administrator types these in by hand.

- **Does the app store End-User Data outside Atlassian?** No. Forge only; no egress.
- **Does the app process End-User Data?** Yes, in transit only. Customer names and emails from the CSV and from Jira are shown to the administrator and sent to Jira's customer API. They are not stored.
- **Data stored by the app (Forge KVS):** import session metadata (file name, SHA-256 file fingerprint, service project id, row and batch counts, row numbers, Jira task ids, timestamps), saved column mappings (CSV header names), sync settings (field ids, project keys, Client value → organisation mappings), the last sync check's counts, and a correction log (issue keys, Client values, organisation ids). No names, emails or account IDs.
- **Retention:** import records expire 180 days after their last update; the sync correction log after 90 days; settings and mappings remain until changed or deleted; all app data is removed by Atlassian after uninstall.
- **Personal data reporting:** not applicable, because no Atlassian account IDs are stored.
- **Encryption:** Forge-managed encryption in transit and at rest.
- **Access control:** Jira administrators only; every admin-page call is checked server-side and uses the administrator's own permissions (`asUser`). The sync event trigger runs as the app and only edits the Organizations field on tickets in projects an administrator selected.
- **Data residency:** follows the Atlassian site's Forge data residency (Runs on Atlassian).
- **Sub-processors:** none beyond Atlassian.

### Scope justification (paste into the scope justification field, 250–5000 characters)

> Customer & Organisation Manager is a Jira admin page for bulk-managing Jira Service Management customers and organisations, with an optional Client → Organisation sync. Every call from the admin page is made as the signed-in Jira administrator (asUser) after a server-side check of the Administer permission. The sync issue trigger runs as the app, only on projects an administrator enabled, and only edits the Organizations field.
> storage:app stores import session metadata (row counts, row numbers, Jira bulk task ids, timestamps), saved CSV column mappings, sync settings and a 90-day correction log (issue keys and organisation ids) in Forge storage; no customer names, emails or account ids are stored.
> read:jira-work is used for GET /rest/api/3/mypermissions (the administrator check on every request), and for Client → Organisation sync: receiving issue created/updated events, reading the Jira field list, reading a ticket's Client and Organizations fields, JQL search for the sync health check, and JQL autocomplete for Client value suggestions.
> read:jira-user is used only to find an imported customer's account id by email (GET /rest/api/3/user/search), so the import can add them to the chosen service project and their organisations.
> write:jira-work is used only by Client → Organisation sync to set the Organizations field on a ticket (PUT /rest/api/3/issue/{id}), when an administrator has turned sync on for that project, or confirms a bulk correction.
> read:servicedesk-request lists service projects (GET /rest/servicedeskapi/servicedesk) for the service-project picker.
> manage:servicedesk-customer lists a service project's customers, lists organisations, creates organisations that an import needs, and adds imported customers to the chosen service project and to their organisations (/rest/servicedeskapi/servicedesk/{id}/customer, /rest/servicedeskapi/organization, /rest/servicedeskapi/organization/{id}/user).
> write:customer:jira-service-management and write:customer.profile:jira-service-management create and update customer accounts (email, display name, customer detail values) through the JSM customer bulk API (/jsm/csm/api/v1/customer/profile/bulk).
> read:task:jira-service-management reads the status of those bulk tasks (/jsm/csm/api/v1/tasks/{id}) for the Import History view.
> read:customer.detail-field:jira-service-management lists the site's customer detail field definitions (/jsm/csm/api/v1/customer/details) so the importer can map CSV columns to them and check values against each field's type and options.
> write:customer.detail:jira-service-management sets an imported customer's detail values (PUT /jsm/csm/api/v1/customer/{id}/details). The importer creates customers with POST /rest/servicedeskapi/customer and sets their details one customer at a time, several in parallel, because the queued bulk API took about 8 minutes per 100 customers on a live site. The bulk API is still used for a changed name on an existing customer.

### More Privacy & Security answers

These are carried over from the August Confluence "Marketplace Submission Pack" and updated for version 0.5.0. Items marked **(confirm)** need a decision from Nuvriqo before publishing.

| Question | Answer | Note |
|---|---|---|
| Processes End-User Data outside Atlassian products or the end user's browser? | No | Forge only. |
| Logs End-User Data? | No | Resolvers don't log row content; Jira error messages on sync failures go to the app's own KVS log, not to external logs. |
| Exposes remote REST APIs? | No | No web triggers, no Forge Remote. |
| Shares End-User Data or logs with third parties / sub-processors? | No | |
| Customer-managed egress | Not applicable | No egress in the manifest. |
| Stores End-User Data after uninstall? | No | Forge removes the app's storage. |
| Custom retention period? | Yes | Import records 180 days; sync correction log 90 days (KVS TTL). |
| GDPR role | Processor **(confirm)** | Suggested text: "The app processes JSM customer names, email addresses, account identifiers and organisation information only on the customer's instructions to provide the requested administration functions. Processing stays within Atlassian Jira, JSM and Forge." |
| CCPA business / service provider | Not applicable **(confirm)** | |
| DPA available? | No | Change once a Nuvriqo DPA is published. |
| Transfers EEA data outside the EEA? | No | No vendor-controlled egress. |
| Security contact | support@nuvriqo.com | Until a dedicated security address exists. |
| Security policy URL | https://nuvriqo.atlassian.net/wiki/spaces/NS/pages/45056001 | |
| CAIQ Lite / certifications / bug bounty | No | Unless Nuvriqo obtains them. |
| Accesses Atlassian PATs, passwords or shared secrets? | No | |

### Forge app security questionnaire

| # | Question | Answer |
|---|---|---|
| 1 / 1a | User interactions? Uses `asUser()` for user actions? | Yes / Yes. Every admin-page resolver uses `asUser()`. |
| 2 | Forge Remote? | No |
| 3 | Before `asApp()` actions that need user permissions, are permissions checked? | Yes. Only the Client → Organisation sync trigger uses `asApp()`. It isn't a user request: it applies a configuration that only a Jira administrator can save (checked server-side), only on the projects they selected, and only edits the Organizations field. |
| 4 | Web triggers? | No |
| 5 | Display conditions used instead of permission checks? | No display conditions; every resolver checks the Administer permission. |
| 6 | Egress to external hosts? | No |
| 7 | Least-privilege scopes? | Yes. 9 scopes, each justified above; 6 unused scopes were removed in 0.3.0. |
| 8 | Logs sensitive information? | No |
| 9 / 9a | Validates and sanitises input? | Yes. CSV rows are validated (email format, required name, duplicate emails); organisation names are trimmed and deduplicated; resolvers validate ids (`customfield_\d+`, numeric ids, SHA-256 fingerprints), cap batch sizes (100 rows per bulk request, 20 organisations per create call, 25 tickets per correction call, 50,000 rows per import plan) and build Jira paths with Forge's `route` template. Sync field ids come from the site, not the browser. |
| 10 | Automated dependency review? | Yes. `npm audit` in the release gate, and lockfiles are committed. |
| 11 / 12 | Collects Atlassian or third-party credentials? | No / No |
| 13 | Secrets in URLs, source or repos? | No |
| 14 / 14a | Vulnerability scans? | Yes. Software composition analysis (`npm audit`). |
| 15–17 | Bug fix policy read; incident notification; security contact | Yes; Yes; support@nuvriqo.com via the Nuvriqo Atlassian account. |

### Reviewer test instructions

1. Install on a Jira Cloud site with Jira Service Management, as a Jira administrator.
2. Open **Jira settings → Apps → Customer & Organisation Manager**.
3. **Customers:** pick a service project; customers load and search works.
4. **Organisations:** every organisation loads, with a count; search filters.
5. **Import:** upload a small CSV (`Email,Full Name,Organisation`) with one invalid email and one new organisation. The preview marks rows Create / Update / Skip / Error and notes the organisation to be created. Click Import. The result says how many customers were added, and the new organisation exists with the customer in it.
6. **Column mapping:** upload a CSV with other column names (for example `Contact,Mail,Company`). Choose the columns, preview, save the mapping, and upload again: the mapping is applied automatically.
   **Customer details:** create a customer detail field (for example a single-choice "Base" with options DUB and STN) under Customer details in JSM. Upload `Email,First Name,Last Name,Base`: the full name is built from the two name columns, Base is mapped automatically, a value that isn't an option shows as an Error, and after import the customer's Base is set.
7. **Organisation sync:** create a single-select field "Client" on a service project, and an organisation added to that project. Map a Client value to the organisation, select the project, turn sync on and save. Create a ticket with that Client value: its Organizations field is set within seconds. **Check tickets** shows the counts, and Recent corrections lists the change.
8. **Import History** shows the session and its bulk task.

### Release notes (1.0 / app version 0.8.0)

> First Marketplace release of Nuvriqo Customer & Organisation Manager for Jira Service Management: a Jira admin page to view and search customers and organisations; CSV import with column mapping and saved mappings, including a full name built from first and last name columns and your JSM customer detail fields (checked against each field's type and options; blank cells leave values unchanged); a Jira-aware Create / Update / Skip / Error preview; automatic creation of missing organisations after checking every organisation on the site; imports of 16,000+ rows in retry-safe batches that add customers to the service project and their organisations; resumable imports; confirmation for large imports; import history; and Client → Organisation sync that keeps the JSM Organizations field in step with a Client field, with a health check and bulk correction. Built on Atlassian Forge with no external services.

## Pricing

To be decided by Nuvriqo (paid via Atlassian, like Follow-Up Manager). Licensing is enforced in code: without an active licence the app is read-only.
