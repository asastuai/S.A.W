-- Add cerebras and kimi as allowed LLM providers (v1.1+ multi-provider expansion).

alter table byok_keys drop constraint byok_keys_provider_check;
alter table byok_keys add constraint byok_keys_provider_check
  check (provider in (
    'groq', 'openai', 'anthropic', 'gemini', 'grok', 'deepseek',
    'cerebras', 'kimi'
  ));
