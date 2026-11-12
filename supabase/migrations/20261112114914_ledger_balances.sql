-- Ledger balances (credit - debit) per account and supplier, over the whole ledger.
-- security_invoker: the caller's RLS on ledger_entries applies (finance sees all, a supplier its own payable).
create view public.ledger_balances with (security_invoker = true) as
select account, supplier_id, sum(credit_centavos - debit_centavos)::bigint as balance_centavos
from public.ledger_entries
group by account, supplier_id;

revoke all on public.ledger_balances from anon, authenticated;
grant select on public.ledger_balances to authenticated;
