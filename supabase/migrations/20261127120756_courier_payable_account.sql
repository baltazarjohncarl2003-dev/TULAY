-- Owner decision 2026-11-27: courier orders ship on TULAY's own Ninja Van account. TULAY pays Ninja Van,
-- so the shipping fee the buyer paid is owed to the courier, not to the supplier. New ledger account for it.
-- Own file: a new enum value cannot be used in the transaction that adds it.
alter type public.ledger_account add value if not exists 'courier_payable';
