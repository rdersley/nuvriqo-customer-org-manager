# Nuvriqo Customer & Organisation Manager — Documentation

Customer & Organisation Manager is a Jira administration page for managing Jira Service Management customers and organisations, including large CSV imports.

## Who can use it

Jira administrators (the **Administer Jira** global permission). The app appears under **Jira settings → Apps → Customer & Organisation Manager**.

## Getting started

1. Install the app from the Atlassian Marketplace.
2. Open **Jira settings → Apps → Customer & Organisation Manager**.
3. Pick a service project from the list at the top right. Customers and imports apply to that service project.

## Customers

Lists the customers of the selected service project. Search by name or email, then **Reset** to clear the search.

## Organisations

Lists every organisation on the site, loading in batches for large sites. Type in the search box to filter. Up to 500 matches are shown at once; search to narrow the list.

## Importing customers

### 1. Prepare the CSV

The first row must be a header row. The columns can have any names and be in any order. You'll choose which one holds each field:

| Field | Required | Notes |
|---|---|---|
| Email | Yes | Must be a valid email address. Each email may appear only once. |
| Full name | Yes | The customer's display name. |
| Organisation | No | The organisation to add the customer to. It's created if it doesn't exist. |

Save as UTF-8 CSV. Other columns are ignored. Quoted values may contain commas and line breaks. Files of 16,000+ rows are supported.

### Choose the columns

When you choose a file, the **Column mapping** card shows which column the app will use for each field, with a sample value from the file.

- Common names like *Email*, *E-mail address*, *Full Name*, *Contact name*, *Organisation* or *Company* are matched automatically, and the preview starts straight away.
- Otherwise, pick the columns and click **Preview with these columns**.
- To reuse a layout (for example a monthly export from another system), type a name and click **Save mapping**. Next time you choose a file with those columns, the saved mapping is used automatically. You can also pick one from **Use a saved mapping**.
- If you resume an interrupted import, the same columns are used again.

### 2. Preview

On the **Import** tab, choose the CSV file. Nothing changes in Jira at this point. The app checks every row against Jira and marks it:

- **Create**: a new customer will be created.
- **Update**: the customer exists and their display name will change.
- **Skip**: the customer already matches Jira.
- **Error**: the row is invalid and will be left out. The reason is shown, and the rest of the file can still be imported.

A note says when an organisation will be created. For large files, Import stays disabled until every row has been checked.

### 3. Import

Click **Import N customer changes**. Missing organisations are created first. The app checks every organisation on the site before creating one, so existing organisations are never duplicated. Customers are then created or updated in batches of 100 and added to the selected service project and their organisations. Each batch is retried up to three times, and a retried batch is never applied twice.

When the import finishes, the app shows how many customers were added. It also lists any row that couldn't be finished, with Jira's reason. **Download rows to fix (CSV)** gives you those rows in the import format, ready to correct and import again.

### Resuming an interrupted import

If an import stops part-way (for example the browser closed), open the Import tab and choose **the same file** again. The app recognises it and offers **Resume saved import from batch N**. Choosing the file changes nothing; the import only continues when you click Resume.

## Import History

Shows each import session (file, progress, status) and each Jira bulk task with its current status. Click **Refresh status** to update. Records are kept for 180 days.

## Organisation sync

Many teams record the customer on a ticket twice: once in a **Client** custom field (for example `RYR`) and again in the JSM **Organizations** field (for example *Ryanair*). Organisation sync keeps the Organizations field correct automatically, with no Jira Automation rules.

### How it decides

The Client field is the source of truth. When a ticket is created, or its Client changes:

- The organisation mapped to the Client value is added.
- Any **other mapped** organisation is removed (so changing `RYR` → `RYS` swaps *Ryanair* for *Buzz*).
- Organisations that aren't in any mapping are **left alone**, so anything added by hand stays.
- If the Client is empty, or its value has no mapping, nothing changes. Unmapped values are listed so you can add them.

### Set it up

1. Open the **Organisation sync** tab.
2. Choose the **Client field**: a single-select or text custom field. The Organizations field is found automatically.
3. Tick the **projects** sync should run in.
4. Add a row in **Client mappings** for each Client value and its organisation. Suggestions come from the values your tickets use.
5. Tick **Sync is on**, then **Save settings**.

### Fix existing tickets

In **Sync health**, click **Check tickets**. The app checks every ticket in the selected projects that has a Client value, and shows how many are correct, how many need correcting, and which Client values have no mapping. Checking changes nothing. To fix them, click **Correct N tickets**, review, and confirm. Each ticket is re-checked just before it's changed.

**Recent corrections** lists every change the app made in the last 90 days.

## Licence

Without an active licence the app is read-only: you can browse and preview, but importing is turned off until a licence or trial is active.

## Troubleshooting

| Problem | What to do |
|---|---|
| "Jira administrator permission is required" | Ask a Jira administrator to open the app, or grant the Administer Jira global permission. |
| "Required CSV column missing" | Check the header row is exactly `Email`, `Full Name` (or `Display Name`) and optionally `Organisation`. |
| Rows marked Error with "Duplicate email in file" | Each email may appear once. Remove the duplicates and choose the file again. |
| A batch failed after three attempts | Earlier batches are saved. Choose the same file again and click Resume. |
| Imported customers don't show on the Customers tab | If the service project lets any customer raise requests, Jira doesn't keep a list of added customers, so they aren't listed there. They're still in their organisations and can use the portal. Projects restricted to added customers list them as usual. |
| Rows marked "no customer account yet" | Jira takes a few minutes to make newly created customers searchable. The app re-checks for about 3 minutes after the last batch; click **Check again** later for any still waiting. |
| Read-only notice | The site's licence isn't active. Start a trial or renew from **Manage apps**. |

## Support

See the [support page](support.md), or email support@nuvriqo.com.
