-- RFQs: TULAY's review note is for the buyer and support only. Invited suppliers could read it through the
-- API (the site hid it). Same pattern as product_review_notes in 20261122110049_audit_money_fixes.sql.
revoke select on public.rfqs from authenticated;
grant select (id, ref, buyer_id, product, category_id, description, specs, quantity, unit, city, province, required_by,
  budget_centavos, sharing_consent, delivery_preference, needs_bir_invoice, status, idempotency_key, submitted_at,
  created_at, updated_at, public_board)
  on public.rfqs to authenticated;

create function public.rfq_review_notes(p_ids uuid[]) returns table (rfq_id uuid, note text)
language sql stable security definer set search_path = '' as $$
  select r.id, r.review_note from public.rfqs r
  where r.id = any (p_ids)
    and (r.buyer_id = auth.uid() or public.has_admin_role('support'));
$$;
revoke all on function public.rfq_review_notes(uuid[]) from public, anon;
grant execute on function public.rfq_review_notes(uuid[]) to authenticated;
