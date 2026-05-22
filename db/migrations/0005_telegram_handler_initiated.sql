-- Allow web-initiated pairing where the handler is known up-front and
-- chat_id is filled in when the user clicks the deep link.

alter table telegram_pair_codes
  add column if not exists handler_id uuid references handlers(id) on delete cascade;

alter table telegram_pair_codes
  alter column chat_id drop not null;
