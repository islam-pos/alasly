# Alasly AutoCare ERP

React and Express application for the AutoCare ERP system. The production server serves both the API and the built client from one origin.

## Railway deployment

1. Connect the private `islam-pos/alasly` repository to a Railway service and deploy the `main` branch. `railway.toml` selects the Dockerfile build.
2. Attach a Railway persistent volume mounted at `/data` before the first deploy.
3. Set `JWT_SECRET` in the Railway service variables to a random secret of at least 32 bytes. Keep it in Railway, not in Git.
4. Set `INITIAL_ADMIN_PASSWORD` to a unique password of 16-72 bytes in Railway. This is required only on first startup.
5. Deploy and wait for the `/api/health` health check to pass, then remove `INITIAL_ADMIN_PASSWORD` from the Railway variables.

The container stops if a required secret is missing or weak, or if Railway does not report a volume mounted at `/data`. On its first start, the service copies the repository's existing SQLite database into that volume and replaces all existing user passwords with random values, except the `admin` account, which receives `INITIAL_ADMIN_PASSWORD`. Later starts keep using the persistent copy and do not repeat the reset. The database includes existing business records, so keep the repository private and restrict access to the deployed service.

Sign in as `admin` with the password entered in Railway. Other existing users remain in the database but their previous passwords are invalidated; an administrator can assign them new passwords under Settings → Users.

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

Archives are first stored under `/data/backups` on the Railway persistent volume. This protects against application or deployment failures, but not loss of that volume; download archives regularly and store them outside Railway. Restore only accepts archives generated by the system and validates the SQLite integrity before replacing data. To restore, select an archive in Settings → Backup and restore and then restart the Railway service. The server enters maintenance while the restore is pending, preserves the pre-restore database and attachments under `/data/backups/pre-restore-*`, and applies the restore before startup migrations.

An administrator should periodically verify that a downloaded archive can be restored in a separate test deployment. The application does not upload backups to an external storage provider yet.

## Automated tests

```powershell
npm --prefix server run prisma:generate
npm --prefix server run build
npm --prefix server test
npm --prefix client run build
```
