-- M-3 fix: addCreditsFromTopup raced on concurrent topups for the same
-- handler because it was read-then-write at the PostgREST layer. Move
-- the increment into a stored function so Postgres serializes it.
--
-- Idempotency is still enforced upstream by the unique tx_signature
-- on llm_credit_topups — same sig won't double-credit. This function
-- just makes the multi-distinct-sig case race-safe.

create or replace function add_credits(
  p_handler_id uuid,
  p_amount_calls int,
  p_lamports bigint,
  p_tx text
) returns integer
language plpgsql
security definer
as $$
declare new_balance int;
begin
  insert into llm_credits (
    handler_id, balance_calls, total_paid_lamports, last_topup_at, last_topup_tx, updated_at
  )
  values (p_handler_id, p_amount_calls, p_lamports, now(), p_tx, now())
  on conflict (handler_id) do update set
    balance_calls       = llm_credits.balance_calls       + EXCLUDED.balance_calls,
    total_paid_lamports = llm_credits.total_paid_lamports + EXCLUDED.total_paid_lamports,
    last_topup_at       = EXCLUDED.last_topup_at,
    last_topup_tx       = EXCLUDED.last_topup_tx,
    updated_at          = EXCLUDED.updated_at
  returning balance_calls into new_balance;
  return new_balance;
end;
$$;

-- spendOneCall has the same race shape (read-then-CAS-write). The
-- CAS handles single-call concurrency but won't decrement on contention;
-- the user gets a free LLM call. Bound the leakage by making decrement
-- atomic and unconditional.
create or replace function spend_one_call(p_handler_id uuid) returns integer
language plpgsql
security definer
as $$
declare new_balance int;
begin
  update llm_credits
    set balance_calls = balance_calls - 1, updated_at = now()
    where handler_id = p_handler_id and balance_calls > 0
    returning balance_calls into new_balance;
  if new_balance is null then
    raise exception 'no_credits';
  end if;
  return new_balance;
end;
$$;
