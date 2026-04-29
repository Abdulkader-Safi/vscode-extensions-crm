-- Each user's invoice numbers must be unique. Prevents two parallel windows
-- (or two browser tabs) from creating duplicate INV-0001 entries.
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_user_invoice_number_unique
  UNIQUE (user_id, invoice_number);
