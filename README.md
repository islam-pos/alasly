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

## Supplier accounts and exports

Supplier and customer creation forms can create a linked account for the other role. Supplier statements are available per supplier or combined, and include opening balances, purchase invoices, returns, and linked payment vouchers. Report, invoice, estimate, and financial-record export actions provide an Excel-compatible `.xls` download and a printable PDF view; use the browser print dialog's “Save as PDF” option for a PDF file.

## Local builds

```powershell
npm --prefix server run prisma:generate
npm --prefix server run build
npm --prefix client run build
```
