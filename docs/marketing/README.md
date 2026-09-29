# Marketplace images

All images are 1840×900 PNG, taken from the real app with fictional demo data. To regenerate them, see `qa/marketing/README.md`.

Limits: highlight title ≤ 50 characters, highlight summary ≤ 220, screenshot caption ≤ 220.

## Highlights (use these three)

### 1. `highlight-1-know-before-you-import.png`
- **Title:** Know exactly what an import will change
- **Summary:** Every CSV row is checked against Jira and marked Create, Update, Skip or Error, including which organisations will be created. Bad rows are left out; nothing changes until you click Import.

### 2. `highlight-2-built-for-large-sites.png`
- **Title:** Built for 16,000+ customer imports
- **Summary:** Large files are compared against every existing customer in controlled batches, then imported 100 at a time with retries. Interrupted imports resume from the batch where they stopped.

### 3. `highlight-3-organisations-in-sync.png`
- **Title:** Organisations that stay in sync
- **Summary:** Map a Client field to JSM organisations once. New tickets and Client changes update the Organizations field automatically, with no Jira Automation rules. A health check finds and fixes existing tickets.

## Screenshots (captions)

| File | Caption |
|---|---|
| `screenshot-1-column-mapping.png` | Choose which columns hold the email, name and organisation, or let a saved mapping fill them in for files with the same layout. |
| `screenshot-2-import-results.png` | See exactly what finished. Rows that couldn't be completed are listed with Jira's reason, ready to download, fix and import again. |
| `screenshot-3-sync-settings.png` | Pick the Client field and projects, then map each Client value to its organisation. Organisations added by hand are never removed. |
| `screenshot-4-import-history.png` | Every import is recorded with its file, progress, customers added and the status of each Jira bulk task. |
| `screenshot-5-organisations.png` | Browse and search every organisation on the site, however many you have. |
| `screenshot-6-large-import-confirmation.png` | Large imports are confirmed first, with a summary of what will change. Very large ones need the number of changes typed. |
