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

The first row must be a header row with these columns (any order):

| Column | Required | Notes |
|---|---|---|
| `Email` | Yes | Must be a valid email address. Each email may appear only once. |
| `Full Name` or `Display Name` | Yes | The customer's display name. |
| `Organisation` | No | The organisation to add the customer to. It's created if it doesn't exist. |

Save as UTF-8 CSV. Files of 16,000+ rows are supported.

### 2. Preview

On the **Import** tab, choose the CSV file. Nothing changes in Jira at this point. The app checks every row against Jira and marks it:

- **Create**: a new customer will be created.
- **Update**: the customer exists and their display name will change.
- **Skip**: the customer already matches Jira.
- **Error**: the row is invalid and will be left out. The reason is shown, and the rest of the file can still be imported.

A note says when an organisation will be created. For large files, Import stays disabled until every row has been checked.

### 3. Import

Click **Import N customer changes**. Changes are sent to Jira in batches of 100. Each batch is retried up to three times, and a retried batch is never applied twice. Missing organisations are created first. The app checks every organisation on the site before creating one, so existing organisations are never duplicated.

### Resuming an interrupted import

If an import stops part-way (for example the browser closed), open the Import tab and choose **the same file** again. The app recognises it and offers **Resume saved import from batch N**. Choosing the file changes nothing; the import only continues when you click Resume.

## Import History

Shows each import session (file, progress, status) and each Jira bulk task with its current status. Click **Refresh status** to update. Records are kept for 180 days.

## Licence

Without an active licence the app is read-only: you can browse and preview, but importing is turned off until a licence or trial is active.

## Troubleshooting

| Problem | What to do |
|---|---|
| "Jira administrator permission is required" | Ask a Jira administrator to open the app, or grant the Administer Jira global permission. |
| "Required CSV column missing" | Check the header row is exactly `Email`, `Full Name` (or `Display Name`) and optionally `Organisation`. |
| Rows marked Error with "Duplicate email in file" | Each email may appear once. Remove the duplicates and choose the file again. |
| A batch failed after three attempts | Earlier batches are saved. Choose the same file again and click Resume. |
| Read-only notice | The site's licence isn't active. Start a trial or renew from **Manage apps**. |

## Support

See the [support page](support.md), or email support@nuvriqo.com.
