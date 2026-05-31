# Giving an AI Agent a Wallet It Can't Drain: PDA-Derived Authority on Solana

*Tutorial #1 in the SAW (Secret Agent Wallet) series. How to give an autonomous agent the power to spend, while keeping the keys to the kingdom for yourself.*

---

## The problem nobody wants to say out loud

You want an AI agent that can act on-chain. Buy the dip, rebalance a position, pay a recurring invoice, park idle stablecoins in a vault. To do any of that, the agent needs to sign transactions. To sign transactions, it needs a key.

So you do the obvious thing: you generate a keypair, fund it, and hand it to the agent.

Now think about what you just did. That key can move 100% of the funds, to anyone, instantly, forever. The agent is one hallucinated tool call (or one prompt injection, or one leaked process memory) away from sending everything to an address it invented. There is no daily limit. There is no "ask me first for anything over X". There is no undo. The key is the wallet, and whoever holds the key owns the wallet.

This is the wrong abstraction. A human assistant with your company card does not get unlimited authority. They get a card with a spend limit, a list of approved vendors, and a manager who signs off on the big stuff. The card is a *delegated, bounded* authority, not a copy of your bank login.

SAW builds exactly that abstraction for agents on Solana. The trick at the center of it is **PDA-derived authority**, and this tutorial walks through how it works and how to bootstrap one wallet in a single transaction.

## The key insight: the wallet is not a keypair

On Solana, a Program Derived Address (PDA) is an address that no private key can sign for. It is derived deterministically from a program ID and a set of seeds, and only the owning program can "sign" for it, by calling `invoke_signed` with those seeds. There is no secret key sitting in a file somewhere. The authority lives in *code*, not in *bytes you can copy*.

SAW uses this to flip the model:

- The **funds** live in token accounts whose authority is a **wallet PDA**, not a keypair.
- The **agent** holds an ordinary keypair, but that keypair is *not* the authority over the funds. It can only *trigger* instructions on the program.
- Every fund-moving instruction the agent triggers is checked, on-chain, against a **policy** before the program signs the transfer with the PDA seeds.
- The **owner** (you, your Phantom wallet) keeps the powers that matter: change the agent, revoke it, approve large payments, pull everything out in an emergency.

So a compromised agent key is not "game over". It is "the attacker can now do exactly what the policy allows, and nothing more". That is the whole point.

## The three programs

SAW is three small Anchor programs that talk to each other via CPI:

| Program | Job |
|---|---|
| `agent_wallet` | Custody. Holds the wallet PDA, moves funds, enforces the agent's identity. |
| `policy_registry` | The rules. Daily limit, per-transaction limit, cooldown, the allowed-recipient set, the approval threshold. |
| `approval_queue` | The owner's inbox. Payments the agent is not pre-authorized to make wait here for an owner signature. |

Each one stays small and auditable on purpose. The custody program never invents policy; it asks `policy_registry`. The policy program never moves funds; it just answers "allowed, needs approval, or denied".

## The addresses: everything hangs off the wallet PDA

All of SAW's accounts are PDAs seeded off a small number of inputs, so the client can derive every address it needs without a single RPC lookup. Here is the SDK's derivation code (`sdk/src/pdas.ts`):

```ts
// The wallet PDA: owned by agent_wallet, seeded by the OWNER + a random salt.
// The salt lets one owner have many independent agent wallets.
export function deriveWalletPda(owner: PublicKey, salt: Buffer): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("wallet"), owner.toBuffer(), salt],
    AGENT_WALLET_PROGRAM_ID
  );
}

// The policy and queue both hang off the wallet PDA, so there is exactly one
// of each per wallet and you can never substitute someone else's policy.
export function derivePolicyPda(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("policy"), wallet.toBuffer()],
    POLICY_REGISTRY_PROGRAM_ID
  );
}

export function deriveQueuePda(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("queue"), wallet.toBuffer()],
    APPROVAL_QUEUE_PROGRAM_ID
  );
}
```

Two things worth noticing, because they are load-bearing for security:

1. The wallet is seeded by `owner`, not by the agent. The agent can never derive a wallet that belongs to it; only the owner can create one.
2. The policy and queue are seeded by `wallet.key()`. On the program side these come with `seeds = [...]` and `seeds::program = ...` constraints, so an attacker cannot pass in a *different*, more permissive policy account. The address is bound to the wallet by consensus.

One more note on that salt. It must come from a CSPRNG, never `Math.random()`. SAW's `randomSalt()` uses `crypto.randomBytes` in Node and `crypto.getRandomValues` in the browser, and throws if neither is available rather than silently degrading. Low-entropy seeds are how PDA pre-image and collision problems start.

## Bootstrapping a wallet in one transaction

Here is the part that makes SAW pleasant to integrate. A working agent wallet needs three accounts initialized (the wallet, its policy, its queue), and they live in three different programs. You could make the user sign three transactions. You should not.

`agent_wallet::initialize_wallet` sets up the wallet PDA and then *CPIs into the other two programs* to register the policy and the queue, all inside one instruction. The wallet PDA signs those CPIs with its own seeds:

```rust
pub fn initialize_wallet(
    ctx: Context<InitializeWallet>,
    salt: [u8; 32],
    agent: Pubkey,
    params: PolicyParams,
) -> Result<()> {
    let wallet = &mut ctx.accounts.wallet;
    wallet.owner = ctx.accounts.owner.key();
    wallet.agent = agent;
    wallet.agent_active = true;
    wallet.salt = salt;
    wallet.bump = ctx.bumps.wallet;

    // These seeds ARE the wallet's signing authority. Only this program,
    // holding these seeds, can sign as the wallet PDA.
    let owner_key = ctx.accounts.owner.key();
    let signer_seeds: &[&[u8]] = &[b"wallet", owner_key.as_ref(), &salt, &[wallet.bump]];

    // CPI #1: register the spending policy (in policy_registry), wallet-PDA-signed.
    cpi::register_policy(/* ...accounts... */, owner_key, params, signer_seeds)?;

    // CPI #2: register the approval queue (in approval_queue), wallet-PDA-signed.
    cpi::register_queue(/* ...accounts... */, owner_key, signer_seeds)?;

    Ok(())
}
```

From the client, the whole thing is one call. The SDK derives the three PDAs and fires `initialize_wallet`:

```ts
const client = SawClient.fromConnection(connection, ownerKeypair);

const handle = await client.createWallet(
  {
    owner: owner.publicKey,
    agent: agent.publicKey,             // a separate keypair you generated for the agent
    salt: randomSalt(),                 // CSPRNG
    policy: buildPolicy({
      mint,                             // the SPL mint this wallet is denominated in
      dailyLimit: toBaseUnits(500, decimals),
      perTxLimit: toBaseUnits(120, decimals),
      approvalThreshold: toBaseUnits(80, decimals),
      recipientAllowlist: [knownVendor],  // pre-authorized auto-spend destinations
    }),
  },
  ownerKeypair                          // the OWNER signs the bootstrap
);
```

Notice who signs: the **owner**. The agent does not exist as a signer here at all; it is just a public key written into the wallet account. The owner is the one provisioning the agent's bounded authority.

A word on `toBaseUnits`. On-chain there is no oracle, so the policy caps are compared against raw token base-units of the wallet's pinned mint. Build your caps with the mint's *actual* decimals (`handle.fetchMintDecimals(mint)`), not a hardcoded `6`, or a 9-decimal mint will be off by a factor of 1000.

## How the agent actually pays

When the agent wants to pay, it calls `pay_direct` and signs with its own keypair. But the agent's signature is not what moves the money. The program checks the policy, and only then signs the SPL transfer with the *wallet PDA* seeds:

```rust
pub fn pay_direct(ctx: Context<PayDirect>, to: Pubkey, amount: u64, _memo: [u8; 32]) -> Result<()> {
    let wallet = &ctx.accounts.wallet;
    require!(wallet.agent_active, WalletError::AgentRevoked);
    require_keys_eq!(ctx.accounts.agent.key(), wallet.agent, WalletError::NotActiveAgent);

    // Ask the policy program: allowed, needs approval, or denied?
    let outcome = evaluate_policy(&ctx.accounts.policy, to, mint, amount, now);
    match outcome {
        CheckOutcome::Allowed => {}
        // An un-pre-authorized destination (or over-threshold amount) cannot be
        // auto-spent. The agent must route it through the owner's approval queue.
        CheckOutcome::RequiresApproval => return err!(WalletError::RequiresOwnerApproval),
        CheckOutcome::Denied(reason) => return Err(map_deny(reason).into()),
    }

    // Only now does the program sign the transfer, as the wallet PDA.
    let signer_seeds: &[&[u8]] = &[b"wallet", wallet.owner.as_ref(), &wallet.salt, &[wallet.bump]];
    token_interface::transfer_checked(
        CpiContext::new_with_signer(/* token program */, /* accounts */, &[signer_seeds]),
        amount,
        decimals,
    )?;
    // ...record the spend against the daily counter, atomically...
    Ok(())
}
```

Read that control flow as an attacker would. You have the agent key. You call `pay_direct(to = your_address, amount = everything)`. What happens?

- `amount` is checked against `per_tx_limit` and the daily limit first. Over the cap? `Denied`. You cannot launder an over-limit payment through anything.
- Your address is not in `recipient_allowlist`. So `evaluate_policy` returns `RequiresApproval`, and `pay_direct` rejects with `RequiresOwnerApproval`. The transfer never happens.
- To send to an unknown address at all, you have to go through `request_payment`, which only *queues* the payment. Executing it requires `approve_and_execute`, which is gated by `require_keys_eq!(owner == wallet.owner)` with the owner as a `Signer`. You do not have the owner's key. The queued request sits there until the real owner approves or denies it.

The agent key, by itself, can do exactly what the owner pre-authorized: spend up to the caps, to the listed recipients. Everything else needs a human. That is delegated, bounded authority, enforced by consensus and not by hoping the client behaves.

## The owner keeps the powers that matter

Four instructions are owner-only (`owner: Signer` plus a key check against `wallet.owner`):

- `set_agent` rotates the agent to a fresh keypair (compromised agent? swap it, keep the funds and history).
- `revoke_agent` flips `agent_active` to false, freezing the agent without touching the funds.
- `emergency_withdraw` pulls the entire balance back to the owner, bypassing policy, for when things go wrong.
- `set_policy` updates the caps and the allowlist.

The agent can reach none of these. It cannot widen its own limits, add itself to the allowlist, reassign the agent key to one it controls, or withdraw to an attacker. The blast radius of a fully compromised agent key is permanently capped by what the owner configured, and the owner can shut it down at any time.

## Try it

The on-chain programs are live on Solana devnet and the flow above is real, signed, and visible on the explorer. The TypeScript SDK gives you `createWallet`, `buildPolicy`, `toBaseUnits`, and a `WalletHandle` with `pay`, `requestPayment`, `approveAndExecute`, `rotateAgent`, `revokeAgent`, and `emergencyWithdraw`. A few dozen lines and you have an agent with a wallet it cannot run away with.

## Why this is the missing layer

Every agent framework today solves *reasoning*. Almost none solve *authority*. The default answer to "how does the agent pay" is still "give it a funded keypair", which is the on-chain equivalent of giving an intern your root password and hoping.

PDA-derived authority turns that into a real permission model: the funds belong to a program-controlled address, the agent gets a bounded, revocable, policy-gated delegation, and the human keeps the keys to the kingdom. It is boring in the way good security is boring, and it is exactly the layer agents need before they touch real money.

Next tutorial: the approval queue, and how an agent proposes a payment that you sign off on from your phone.

---

*Juan Cruz Maisú ♥*
