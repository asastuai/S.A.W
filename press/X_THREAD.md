# X / Twitter thread — SAW v1.5 announce

Copy-paste each tweet as-is. Lead is the security rigor: "I built an agent wallet, then brought adversaries to break it." Numbers count chars (X limit = 280 per tweet for unverified, 25k+ for verified).

---

## Thread (7 tweets)

### 1/7 (hook)

```
i gave an AI agent a wallet it cannot drain.

SAW — Secret Agent Wallet, on solana.

your agent moves money inside on-chain limits.
you hold the override.
the policy is enforced by consensus, not by trusting the app.

live: saw-gilt.vercel.app
```

### 2/7 (the problem)

```
today you get two options:

give the agent your seed phrase → one prompt injection and you're at zero.
sign every tx yourself → you just killed the autonomy that made it an agent.

SAW is the layer between.
the on-chain policy is the floor.
```

### 3/7 (the trick — PDA-derived authority)

```
the trick: the wallet is not a keypair.

the funds live on a program-derived address. no key you can copy.
the agent holds a separate key that can only TRIGGER policy-gated instructions.
the program signs the transfer, and only after the policy passes.

bootstrap is one signature.
```

### 4/7 (security — the differentiator)

```
this is custody. so i audited it like custody.

3 security passes: the on-chain programs, the SDK, the full web surface.
then an adversarial review — 4 independent reviewers trying to break the gate from different angles.

verdict: sound. zero real holes.
0 critical / high / medium open.
```

### 5/7 (the proof — the recipient gate)

```
the part i care about most:

an agent key, on its own, cannot send funds to an address you never approved.
an unknown or prompt-injected destination escalates to YOUR signature.
hard caps deny first, so nothing gets laundered through the queue.

enforced on-chain. i wrote the test that proves it.
```

### 6/7 (the build — open source)

```
built solo, on devnet, in the open.

3 anchor programs, a TS SDK, a live demo with real on-chain execution, supabase, privy, a telegram bridge.

every handler, wake, fee and credit is public:
saw-gilt.vercel.app/dashboard

code + 3 audit reports: github.com/asastuai/S.A.W
```

### 7/7 (the ask)

```
looking for:
- devs building agent infra on solana
- design partners on devnet (tell me what breaks)
- anyone who wants the wallet layer their agent needs before it touches mainnet

DMs open.

— Juan Cruz Maisú ♥
```

---

## Screenshots needed (you take, on your machine)

1. **For tweet 1:** the `/demo` page mid-flow, a clean briefing room with one item queued. Hard-refresh first so there's no leftover state from testing.

2. **For tweet 4:** `docs/security-audit-v1.5.md` scrolled to the Summary + "Remediation status" table (0 critical/high/medium open). Use a code-block screenshot tool so it renders crisply. Optional second image: the adversarial-review verdict ("sound, zero real holes").

3. **For tweet 5:** the Anchor test output showing the green crown-jewel line: *"agent cannot pay_direct to an arbitrary/injected destination (crown jewel)"*. Run `anchor test` and screenshot the passing block — proof, not a claim.

4. **For tweet 6:** the `/dashboard` page with real numbers (handlers, operatives, credits). Even small numbers are fine; it shows the data is real, not mocked.

5. **Optional cover image:** the Operative mascot at ~180px on the gold theme.

Take the screenshots → drop them on the X compose UI in the order above.

---

## Tone check

- no em-dashes (use → or rewrite)
- first-person possessive ("i gave", "i wrote the test", "the wallet your agent needs")
- compression
- Benedetti line breaks (each line a breath)
- signature on the closing tweet

---

## Alt hook (softer, product-first)

```
spent the last two months building the wallet layer AI agents have been missing.

SAW — programmable on-chain custody for agents on solana.
the agent acts under hard limits. you sign the override. the chain enforces it.

3 audits deep. live on devnet.
saw-gilt.vercel.app
```

## Alt hook (builder / auditor-first)

```
i shipped an agent wallet, then i tried to break it.

SAW: on-chain custody for AI agents on solana.
3 security passes + an adversarial review of the policy gate. zero real holes.

an agent key alone cannot move funds to an address you didn't approve.

→ saw-gilt.vercel.app
→ github.com/asastuai/S.A.W
```
