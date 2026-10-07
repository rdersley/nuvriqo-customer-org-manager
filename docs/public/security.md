# Nuvriqo Customer & Organisation Manager — Security & privacy

## Summary

- Runs entirely on Atlassian Forge ("Runs on Atlassian"). No external servers, no data leaves Atlassian.
- Only Jira administrators can use it, and it acts with the signed-in administrator's own Jira permissions.
- Customer names and email addresses are **not stored** by the app.
- Import records are deleted automatically 180 days after their last update.

## How the app handles your data

**CSV files** are read in the administrator's browser. Rows are sent to Jira's customer API when you import. The app does not keep a copy of the file or its rows. To recognise an interrupted import, it stores a one-way fingerprint (SHA-256) of the file, not its contents.

**What the app stores** (in Forge storage for your site):

- Import sessions: file name, file fingerprint, service project, row and batch counts, the row numbers to import, Jira task IDs, and timestamps. Kept for 180 days after the last update.
- Bulk task records: Jira task ID, batch number, row count and time. Kept for 180 days.
- Saved column mappings: a name and the CSV header names. Kept until deleted.

It stores no names, email addresses or Atlassian account IDs.

**What the app changes in Jira:**

- When an administrator clicks Import or Resume: creates or updates customers in the selected service project, adds them to organisations, and creates organisations that don't exist yet.
- When Organisation sync is on: sets the Organizations field on tickets in the projects an administrator selected, when a ticket is created or its Client changes. This runs in the background as the app, and only edits the Organizations field. Administrators can also correct existing tickets from the Sync health check.

Sync also keeps its settings and mappings, the last check's counts, and a log of corrections (ticket key, Client value, organisations before and after) for 90 days.

## Access and permissions

Every request is checked on the server for the **Administer Jira** permission. The app requests only the Jira scopes it uses:

| Scope | Used for |
|---|---|
| `storage:app` | Storing import records and saved mappings |
| `read:jira-work` | Checking the administrator permission; reading ticket fields for Organisation sync |
| `read:jira-user` | Finding imported customers' accounts by email, to add them to the service project and organisations |
| `write:jira-work` | Setting the Organizations field for Organisation sync |
| `read:servicedesk-request` | Listing service projects |
| `manage:servicedesk-customer` | Listing customers and organisations, creating organisations, and adding imported customers to the service project and organisations |
| `write:customer:jira-service-management`, `write:customer.profile:jira-service-management` | Creating and updating customers, their customer details and their organisation membership |
| `read:task:jira-service-management` | Showing the status of import tasks |
| `read:customer.detail-field:jira-service-management` | Listing your customer detail fields so an import can fill them in |
| `write:customer.detail:jira-service-management` | Setting imported customers' detail values |
| `read:customer.detail:jira-service-management` | Reading a ticket reporter's customer details to fill ticket fields (Ticket details) |

## Uninstalling

Data the app stored is removed by Atlassian after the app is uninstalled. Customers and organisations created in Jira stay in Jira.

## Privacy policy

This app is covered by the Nuvriqo privacy policy: https://nuvriqo.atlassian.net/wiki/spaces/NS/pages/1540097

## Reporting a security issue

Email support@nuvriqo.com with "Security" in the subject line. Include your site address, the app version and steps to reproduce. Please don't include passwords, API tokens or customer data.
