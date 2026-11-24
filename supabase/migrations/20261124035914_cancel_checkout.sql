-- Buyer cancels their own unpaid cart checkout (e.g. after pressing Back from the payment page) so they can
-- edit the cart and check out again without waiting for checkout_ttl_minutes. The app closes the gateway
-- session first; if a payment still lands afterwards, confirm_payment sees a closed checkout and flags it
-- needs_review for a refund, the same as a payment after expiry.
create function public.cancel_checkout(p_checkout_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  co public.checkouts;
begin
  -- Locks the row, so a payment confirming at the same moment either finishes first or waits for this.
  select * into co from public.checkouts where id = p_checkout_id and buyer_id = uid for update;
  if co.id is null then
    raise exception 'Checkout not found' using errcode = 'P0002';
  end if;
  if co.selection_id is not null then
    raise exception 'Quotation payments cannot be cancelled here' using errcode = '22023';
  end if;
  if co.status <> 'pending' then
    raise exception 'This checkout is already %', co.status using errcode = '22023';
  end if;
  perform private.release_checkout(co.id, 'cancelled', 'Cancelled by the buyer before paying');
  perform private.audit('checkout.cancel', 'checkouts', co.id::text, jsonb_build_object('total_centavos', co.total_centavos));
end $$;

revoke execute on function public.cancel_checkout(uuid) from public, anon;
grant execute on function public.cancel_checkout(uuid) to authenticated;
