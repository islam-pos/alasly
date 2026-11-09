# Alasly AutoCare ERP

React and Express application for the AutoCare ERP system. The production server serves both the API and the built client from one origin.

## Railway deployment

1. Connect the private `islam-pos/alasly` repository to a Railway service and deploy the `main` branch. `railway.toml` selects the Dockerfile build.
2. Attach a Railway persistent volume mounted at `/data` before the first deploy.
3. Set `JWT_SECRET` in the Railway service variables to a random secret of at least 32 bytes. Keep it in Railway, not in Git.
4. Deploy and wait for the `/api/health` health check to pass. The initial administrator credentials are `admin` / `admin`; the first login is restricted until you set a different password.

The container stops if a required secret is missing or Railway does not report a volume mounted at `/data`. On its first start, the service copies the repository's existing SQLite database into that volume and replaces other existing user passwords with random values; the `admin` account receives the temporary `admin` password and must change it before using the system. Later starts keep using the persistent copy and do not repeat the reset. The database includes existing business records, so keep the repository private and restrict access to the deployed service.

Sign in as `admin` / `admin` and immediately choose a new password. Other existing users remain in the database but their previous passwords are invalidated; an administrator can assign them new passwords under Settings → Users.

## cPanel deployment

The shared cPanel plan can run the app with its Node.js Application Manager. This deployment uses the account's home directory for the persistent SQLite database, backups, and repair photos; it does not use Docker or Railway's `/data` volume.

1. For the initial application setup, build the client and server from the repository root:

   ```powershell
   npm --prefix client ci
   npm --prefix client run build
   npm --prefix server ci
   npm --prefix server run prisma:generate
   npm --prefix server run build
   ```

2. Create the production seed database from the `server` directory:

   ```powershell
   $env:DATABASE_URL = "file:$((Resolve-Path .).Path -replace '\\', '/')/prisma/autocare.db"
   npx prisma db push --skip-generate
   npm run prisma:seed:production
   Remove-Item Env:DATABASE_URL
   ```

3. For the initial setup only, package the tracked files together with `client/dist`, `server/dist`, and `server/prisma/autocare.db`. Exclude `.git`, `node_modules`, and every `.env` file. Upload and extract the package in the cPanel home directory, keeping the `client` and `server` folders side by side.
4. In **Setup Node.js App**, create or edit a Node.js 22 application in **Development** mode, set the application root to `autocare-erp/server`, the application URL to the domain root, and the startup file to `cpanel-start.cjs`. Run **NPM Install**, then change the application mode to **Production** and restart it.
5. Add `JWT_SECRET` (at least 32 bytes) and, for the first startup only, `INITIAL_ADMIN_PASSWORD` (4–15 English letters and digits) as application environment variables in cPanel. Do not put secrets in uploaded files or Git. On first startup, `cpanel-start.cjs` copies the existing database to the persistent data directory, runs migrations, sets the administrator password to `INITIAL_ADMIN_PASSWORD`, and replaces other users' password hashes with random values. After `/api/health` succeeds, remove `INITIAL_ADMIN_PASSWORD` from the cPanel variables, sign in as `admin` with that temporary password, and change it immediately. The one-time marker prevents password initialization from running again.

For updates after the initial setup, use **Git Version Control** to update the repository from `origin/main`, then deploy the checked-out HEAD commit. The repository's `.cpanel.yml` runs `server/cpanel-deploy.sh`, which builds the server and client and copies only application source, compiled output, the committed Prisma Client, package manifests, the Prisma schema, and the Passenger startup file into `~/autocare-erp`. The generated client includes the cPanel Linux engine so the constrained host does not need to run Prisma generation. When changing the Prisma schema or Prisma version, regenerate and commit `server/generated/prisma` before deploying. The script reuses build dependencies while their lockfiles are unchanged. It does not copy `.env` files, `node_modules`, the seed database, or anything in `~/autocare-erp-data`. After deployment, run **NPM Install** in **Setup Node.js App** and restart the application.

The cPanel start script sets `DATABASE_URL` and `DATA_DIR` to the persistent `~/autocare-erp-data` directory. It preserves that directory across application uploads and restarts. Keep cPanel backups of this directory; the shared plan's SQLite database is not a managed database service. Point the domain's DNS A record to the hosting account's shared IP and issue a valid SSL certificate before using the public site.

## User permissions and HR

Administrators can create, update, deactivate, and delete user accounts from Settings → Users, link an account to an employee, and either inherit role permissions or set individual permissions. WhatsApp and Telegram connection settings remain restricted to active administrators. Employee records can be created, edited, or deactivated in HR; deactivation also disables the linked user account while preserving attendance and payroll history.

HR stores attendance durations as whole minutes. Monthly base pay is calculated as monthly salary divided by the configurable standard monthly hours (initially 208), multiplied by completed attendance minutes. The system generates the previous month's payroll on the first day of each month in `Africa/Cairo`; manual generation is safe to repeat and payroll rows are unique by employee and month. Pending commissions created during the payroll month are included in that month's payroll.

## Supplier accounts and exports

Supplier and customer creation forms can create a linked account for the other role. Supplier statements are available per supplier or combined, and include opening balances, purchase invoices, returns, and linked payment vouchers. Report, invoice, estimate, and financial-record export actions provide an Excel-compatible `.xls` download and a printable PDF view; use the browser print dialog's “Save as PDF” option for a PDF file.

The global search and text-entry fields provide live suggestions from matching customer, supplier, employee, vehicle, item, stock-location, invoice, and repair-order data. Item cards can be created and edited with bilingual names, part and manufacturer details, category, unit, storage location, stock thresholds, and (with permission) purchase and sales prices; opening quantities are assigned to a selected warehouse. SKU codes and barcodes are checked for duplicates without regard to letter case, and Arabic item names are checked for duplicates within the same category when creating, editing, or importing items. Duplicate import rows are skipped and included in the import report. Barcode printing opens an interactive preview where users can set copies, choose a preset or custom label size, set barcode height, and toggle the company name, item name, SKU, or available price. It supports thermal rolls and common 40×30, 50×30, 58×40, 57×32, 60×40, and 100×50 mm label stocks, with each label on its own page; select the installed printer in the browser print dialog and set scale to 100%. The item catalog can be exported to Excel-compatible `.xls` or printable PDF, and imports `.xlsx` workbooks, standard binary `.xls` workbooks, and the system's Excel `.xls` format. Download the Excel template first; rows with duplicate SKU/barcodes or invalid category/unit values are skipped and included in the import report. The importer supports sparse worksheet rows/cells and Arabic or Persian numerals in numeric fields.

## Workshop estimates, evidence, and vehicle handover

Repair orders let staff capture or select up to 20 vehicle-condition photos at intake (JPG, PNG, or WebP, up to 3 MB each); the photos remain attached to the repair order and can be viewed in its photos tab. Additional photo attachments can also be added later. Photos are stored on the persistent data volume. Repair orders also support tracked technician work time and recording which issued parts were used or returned. A pending estimate can be shared through a temporary, single-use customer approval link; the customer can approve or reject it and leave a note. The estimate is not sent automatically—share the generated link through the channel you choose.

After invoice creation, the repair order remains ready for delivery. Record any later cash or card payments against the invoice, then complete the handover checklist with the recipient's name, odometer, and signature. Handover closes the repair order and stores the selected warranty duration and terms. Cash payments require an available cashbox; card payments are recorded on the invoice but are not reconciled to a bank account automatically. Uploaded repair photos require the same persistent `/data` volume configured for production.

## Egypt location, currency, and printing

Company and branch defaults use Egypt, with Egyptian pounds (`EGP`, `ج.م`) as the official system currency. Server startup migrates existing company and bank currency settings to EGP. Existing seeded company and branch locations are migrated to Cairo and Alexandria at server startup; customer and supplier records are left unchanged. The configured tax rate is not changed by the currency migration and should be reviewed separately for local tax requirements. Company settings include independently configurable paper size and standard/thermal layout for barcode labels and for invoices/reports, plus company-name visibility and invoice-field visibility. Browser print dialogs still control the physical printer selection. Company profile fields, invoice text, and the support card shown in the quick sidebar can be edited from Settings. Barcode labels use scannable Code 128 and can be printed individually or for the filtered item results from the item catalog and inventory pages; item storage locations can also be edited from the inventory table.

WhatsApp Cloud API integration sends invoice PDFs to customers and suppliers who have a saved WhatsApp number and have explicitly opted in. Purchase requests for low-stock items can be manually assigned to a supplier and sent with a temporary supplier response link. Configure the variables in `server/.env.example` as Railway service variables; never commit the access token. Create the approved templates `sales_invoice_pdf_ar` and `supplier_invoice_pdf_ar` with a document header and three body text parameters (recipient name, invoice number, total). Create `stock_shortage_request_ar` with three body text parameters (supplier, request number, item count) and a dynamic URL button whose URL is `https://<public-domain>/api/public/purchase-requests/{{1}}`. Confirm the Arabic template language code in WhatsApp Manager before setting `WHATSAPP_TEMPLATE_LANGUAGE`.

Administrators configure manager notifications from Settings → Notification integrations (the WhatsApp and Telegram quick links are in the sidebar). Opening the settings page automatically starts QR pairing for each unlinked channel. WhatsApp links through an unofficial WhatsApp Web library; Telegram links a personal Telegram account through the unofficial MTProto client. Both approaches may stop working or lead to account restrictions; use dedicated accounts at your own risk, and run only one server instance for each linked account. Set `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` from [my.telegram.org/apps](https://my.telegram.org/apps) in the server environment before using Telegram QR login. WhatsApp uses the latest WhatsApp Web protocol version fetched at connection time, with the currently installed Baileys version as a logged fallback. The legacy Telegram bot token/chat configuration is cleared during migration. WhatsApp and Telegram sessions are stored encrypted in the database with keys derived from `JWT_SECRET`; changing that secret requires linking the accounts again. Telegram notifications are sent to the linked account's Saved Messages. Connection tests send real messages. Invoice PDF and supplier shortage-request messages described above still use the separate WhatsApp Cloud API integration and its approved templates. Enable only the event categories required; notifications, shift summaries, and maintenance reminders are persisted in a delivery queue and retried with exponential backoff after delivery failures. Delivery is at-least-once: a provider timeout after accepting a message can still result in a duplicate on retry.

## Bank reconciliation, profit reports, and ETA status

Users with bank-management permission can import bank statements as CSV and reconcile lines against recorded deposits, card settlements, and withdrawals. Automatic matching is limited to a unique candidate with matching amount, direction, nearby date, and a compatible reference; ambiguous lines require manual review. Imported files are protected against duplicate re-imports by their content hash.

The profit-and-loss report excludes invoice VAT from revenue, allocates invoice discounts and tax across sale lines, reduces sales and restores the original recorded item cost for posted returns, and excludes expense VAT by using the expense base amount. New returns snapshot their invoice price, discount, tax, and cost; reports mark periods containing legacy returns as estimates. Branch-filtered reports warn that expenses and other revenues are not assigned to branches in the current data model. Figures remain operational reports, not a substitute for audited financial statements.

The application does not currently submit tax invoices or receipts to the Egyptian Tax Authority (ETA). Printed invoices and WhatsApp PDFs are not ETA submissions. Production integration requires the taxpayer's ETA enrollment, the appropriate eInvoice/eReceipt profile and supported document types, and credentials from the taxpayer's ETA portal; these must be provided and tested in the ETA sandbox before enabling submission. See the [ETA integration toolkit](https://sdk.invoicing.eta.gov.eg/) for its current integration materials.

System-generated POS, maintenance, and purchase invoice numbers each use their own sequential yearly series. Existing invoice numbers are respected when initializing a series, and allocation is serialized with invoice creation to avoid duplicates from concurrent requests. The supplier invoice number remains a separate optional field for the number printed on the supplier's original invoice.

## Local builds

## Backups and restore

The server creates one automatic SQLite snapshot each day after 03:00 `Africa/Cairo` and keeps the 30 newest daily and 10 newest manual archives. A snapshot contains a consistent SQLite copy and the repair-photo attachments; create or download a manual archive from Settings → Backup and restore. Backup management and restore are restricted to the active `admin` account.

Archives are first stored under `/data/backups` on the Railway persistent volume. If Cloudflare R2 is configured, each archive is also encrypted with AES-256-GCM before upload to `alasly/backups/`; local backup creation remains available when R2 is not configured. Configure `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `BACKUP_ENCRYPTION_KEY` in the server environment. The encryption key must be 32 cryptographically random bytes encoded as 64 hexadecimal characters or Base64; generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Store it separately in a secure password manager: losing or changing this key makes existing remote archives unrecoverable. The Settings backup screen can test the R2 credentials and key.

Restore only accepts archives generated by the system and validates the SQLite integrity before replacing data. To restore, select an archive in Settings → Backup and restore and then restart the Railway service. The server enters maintenance while the restore is pending, preserves the pre-restore database and attachments under `/data/backups/pre-restore-*`, and applies the restore before startup migrations. Remote archives can be downloaded or restored even if the local Railway volume no longer contains them.

An administrator should periodically verify that a downloaded archive can be restored in a separate test deployment.

## Approvals, customer collections, and login security

Inventory counts are saved as pending review. They record the server-side book balance at count creation; a different user with inventory-management access must approve or reject the count. Approval applies adjustments only if the book balance has not changed since the count was recorded.

Purchase invoices are saved as drafts. They do not affect stock, item costs, supplier balances, or accounting until another purchasing-authorized user approves them. Rejected drafts remain in the audit trail and can be recreated. The shortage-order workflow suggests quantities from each item's maximum stock level, and the comparison action shows the latest 50 prices from approved supplier invoices.

Customer receipts can be recorded against open invoices from the sales register. Each receipt is capped at the invoice's exact remaining balance, updates the customer balance and invoice status, and posts to the cash/card/bank and receivables accounts. Cash receipts require an active cashbox. The receivables aging report groups open balances by invoice age (up to 30, 31–60, 61–90, and over 90 days).

Administrator accounts must enroll in an authenticator app on their first login; subsequent logins require the current six-digit code. MFA secrets are encrypted using `MFA_ENCRYPTION_KEY` when configured (at least 32 bytes), or a key derived from `JWT_SECRET` otherwise. Keep the active key stable and private; losing or changing it requires manual database recovery before administrator sign-in can resume. Five consecutive failed password or MFA checks lock that account for 15 minutes.

The Users and permissions settings tab lets an administrator record completion of a periodic role/user-permission review in the audit log.

The administrator backup screen also displays API/database status, R2 configuration, and pending notification queue counts. These checks are operational indicators and do not replace external uptime monitoring or periodic restore drills.

## Automated tests

```powershell
npm --prefix server run prisma:generate
npm --prefix server run build
npm --prefix server test
npm --prefix client test
npm --prefix client run build
```

Client UI tests use Vitest and jsdom. They cover barcode-label selection, copy counts, search behavior, print limits, blocked print windows, and Escape navigation around text fields and dialogs.

## Offline access status

The PWA shell is cached for startup, and successful JSON API responses are cached per authenticated session for read-only access to pages and records previously loaded on that device. Cached responses expire after 30 days and are limited to the 300 most recently loaded requests per session. A user must sign in on the device while online before using cached data.

Non-delete API writes that lose their connection are stored in an IndexedDB outbox and clearly reported as not yet sent to the server. Basic customer, supplier, vehicle, and employee creation can be replayed automatically. Edits and consequential operations remain in the outbox for an explicit user review; deletions, authentication changes, and file uploads are not queued. The user must compare the latest server record before manually replaying an edit. A server-side idempotency receipt protects retries that use the same operation key; an uncertain result is held for review rather than submitted twice. This is not a full offline replica: workflows that depend on the immediate server response, related newly-created records, or current inventory/cash balances still require a connection.

Cached business data and queued request details are stored locally in the device/browser profile. Use offline mode only on trusted, access-controlled devices and do not clear application storage while there are pending operations. Logging out clears cached API responses but preserves the outbox until it is synchronized or explicitly removed after checking the server.
