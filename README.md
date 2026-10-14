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

The global search and text-entry fields provide live suggestions from matching customer, supplier, employee, vehicle, item, stock-location, invoice, and repair-order data. Item cards can be created and edited with bilingual names, part and manufacturer details, category, unit, storage location, stock thresholds, and (with permission) purchase and sales prices; opening quantities are assigned to a selected warehouse. The item catalog can be exported to Excel-compatible `.xls` or printable PDF, and imports `.xlsx` workbooks or the system's Excel `.xls` format. Download the Excel template first; rows with duplicate SKU/barcodes or invalid category/unit values are skipped and included in the import report.

## Egypt location and printing

Company and branch defaults use Egypt. Existing seeded company and branch locations are migrated to Cairo and Alexandria at server startup; customer and supplier records are left unchanged. Company settings include independently configurable paper size and standard/thermal layout for barcode labels and for invoices/reports, plus company-name visibility and invoice-field visibility. Browser print dialogs still control the physical printer selection. Company profile fields, invoice text, and the support card shown in the quick sidebar can be edited from Settings. Barcode labels use scannable Code 128 and can be printed individually or for the filtered item results from the item catalog and inventory pages; item storage locations can also be edited from the inventory table.

WhatsApp Cloud API integration sends invoice PDFs to customers and suppliers who have a saved WhatsApp number and have explicitly opted in. Purchase requests for low-stock items can be manually assigned to a supplier and sent with a temporary supplier response link. Configure the variables in `server/.env.example` as Railway service variables; never commit the access token. Create the approved templates `sales_invoice_pdf_ar` and `supplier_invoice_pdf_ar` with a document header and three body text parameters (recipient name, invoice number, total). Create `stock_shortage_request_ar` with three body text parameters (supplier, request number, item count) and a dynamic URL button whose URL is `https://<public-domain>/api/public/purchase-requests/{{1}}`. Confirm the Arabic template language code in WhatsApp Manager before setting `WHATSAPP_TEMPLATE_LANGUAGE`.

Administrators configure manager notifications from Settings → Notification integrations (the WhatsApp and Telegram quick links are in the sidebar). Opening the settings page automatically starts QR pairing for each unlinked channel. WhatsApp links through an unofficial WhatsApp Web library; Telegram links a personal Telegram account through the unofficial MTProto client. Both approaches may stop working or lead to account restrictions; use dedicated accounts at your own risk, and run only one server instance for each linked account. Set `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` from [my.telegram.org/apps](https://my.telegram.org/apps) in the server environment before using Telegram QR login. WhatsApp uses the latest WhatsApp Web protocol version fetched at connection time, with the currently installed Baileys version as a logged fallback. The legacy Telegram bot token/chat configuration is cleared during migration. WhatsApp and Telegram sessions are stored encrypted in the database with keys derived from `JWT_SECRET`; changing that secret requires linking the accounts again. Telegram notifications are sent to the linked account's Saved Messages. Connection tests send real messages. Invoice PDF and supplier shortage-request messages described above still use the separate WhatsApp Cloud API integration and its approved templates. Enable only the event categories required; end-of-shift summaries are scheduled for 23:00 `Africa/Cairo`, with a database uniqueness guard against duplicate sends across server restarts/replicas. Activity and data-update alerts reflect operations present in the audit log; profit figures are estimates based on saved item costs and do not include every accounting adjustment or return.

System-generated POS, maintenance, and purchase invoice numbers each use their own sequential yearly series. Existing invoice numbers are respected when initializing a series, and allocation is serialized with invoice creation to avoid duplicates from concurrent requests. The supplier invoice number remains a separate optional field for the number printed on the supplier's original invoice.

## Local builds

```powershell
npm --prefix server run prisma:generate
npm --prefix server run build
npm --prefix client run build
```
