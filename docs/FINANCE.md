# Internal finance ledger

ITQANAK records request-linked dues and manually confirmed full payments. This
module is an internal ledger only: it does not integrate with a payment gateway,
collect card data, initiate a transfer, or infer that a payment happened.

Amounts are stored as integer minor units (`SAR`/`AED`: 2, `KWD`: 3). A due is
created only for a submitted request and is permanently tied to that request's
student. Its bilingual title, description, amount, currency, and due date become
immutable when created. Corrections use a void-and-recreate workflow.

The only state transitions are:

- `UNPAID -> PAID` when an authorized administrator records a verified full payment.
- `PAID -> UNPAID` when an authorized administrator reverses that confirmation with a reason.
- `UNPAID -> VOIDED` when an authorized administrator voids the due with a reason.

Every transition appends a `finance_ledger_entries` row and a redacted security
audit event. The ledger rejects update, delete, and truncate. Optimistic versions
prevent concurrent operator changes from silently overwriting one another.

Capabilities are intentionally separate:

- `finance.read.own`: student reads only dues joined to their own user ID.
- `admin.finance.read`: administrator reads due records.
- `admin.finance.manage`: administrator creates and transitions records.
- `admin.finance.reports.read`: administrator reads currency-separated aggregates.

Browser pages are `/ar/student/finance`, `/en/student/finance`,
`/ar/admin/finance`, and `/en/admin/finance`. Public service pages remain free of
prices. Never store banking credentials, card data, government identifiers, or
unnecessary personal data in the free-text payment reference or note fields.
