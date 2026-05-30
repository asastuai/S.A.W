/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/policy_registry.json`.
 */
export type PolicyRegistry = {
  "address": "FGTkQ9C8zr7Rm9WFZ7rK6cDdY7Bju1dTsjSN5GuHqAJF",
  "metadata": {
    "name": "policyRegistry",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "recordSpend",
      "discriminator": [
        111,
        102,
        17,
        64,
        245,
        202,
        79,
        55
      ],
      "accounts": [
        {
          "name": "policy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "policy.wallet",
                "account": "policyAccount"
              }
            ]
          }
        },
        {
          "name": "wallet",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "registerPolicy",
      "discriminator": [
        62,
        66,
        167,
        36,
        252,
        227,
        38,
        132
      ],
      "accounts": [
        {
          "name": "policy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "wallet",
          "signer": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "owner",
          "type": "pubkey"
        },
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "policyParams"
            }
          }
        }
      ]
    },
    {
      "name": "resetDailySpent",
      "docs": [
        "L-4 fix: when the wallet is emergency-withdrawn, the agent's",
        "daily_spent counter still reflects pre-emergency activity. If the",
        "owner refunds the wallet within the same day, the agent finds",
        "itself artificially throttled until midnight. This zeros the",
        "counter. Only callable by the wallet PDA (CPI from agent_wallet's",
        "emergency_withdraw)."
      ],
      "discriminator": [
        162,
        18,
        89,
        96,
        191,
        119,
        181,
        10
      ],
      "accounts": [
        {
          "name": "policy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "policy.wallet",
                "account": "policyAccount"
              }
            ]
          }
        },
        {
          "name": "wallet",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "setPolicy",
      "discriminator": [
        40,
        133,
        12,
        157,
        235,
        202,
        2,
        132
      ],
      "accounts": [
        {
          "name": "policy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  108,
                  105,
                  99,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "policy.wallet",
                "account": "policyAccount"
              }
            ]
          }
        },
        {
          "name": "owner",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "policyParams"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "policyAccount",
      "discriminator": [
        218,
        201,
        183,
        164,
        156,
        127,
        81,
        175
      ]
    }
  ],
  "events": [
    {
      "name": "policySet",
      "discriminator": [
        126,
        246,
        69,
        48,
        9,
        240,
        226,
        52
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "tokenNotAllowed",
      "msg": "Token is not in the allowlist"
    },
    {
      "code": 6001,
      "name": "recipientNotAllowed",
      "msg": "Recipient is not in the allowlist"
    },
    {
      "code": 6002,
      "name": "exceedsPerTxLimit",
      "msg": "Transaction exceeds per-transaction limit"
    },
    {
      "code": 6003,
      "name": "exceedsDailyLimit",
      "msg": "Transaction exceeds daily spending limit"
    },
    {
      "code": 6004,
      "name": "cooldownActive",
      "msg": "Cooldown period has not elapsed"
    },
    {
      "code": 6005,
      "name": "notOwner",
      "msg": "Caller is not the registered owner"
    },
    {
      "code": 6006,
      "name": "notWallet",
      "msg": "Caller is not the registered wallet"
    },
    {
      "code": 6007,
      "name": "allowlistTooLarge",
      "msg": "Allowlist exceeds maximum size"
    },
    {
      "code": 6008,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6009,
      "name": "cooldownTooLong",
      "msg": "cooldown_seconds exceeds maximum allowed (7 days)"
    },
    {
      "code": 6010,
      "name": "invalidDailyLimit",
      "msg": "daily_limit must be > 0 unless the allowlist is empty (intentional pause)"
    }
  ],
  "types": [
    {
      "name": "policyAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "dailyLimit",
            "type": "u64"
          },
          {
            "name": "perTxLimit",
            "type": "u64"
          },
          {
            "name": "approvalThreshold",
            "type": "u64"
          },
          {
            "name": "cooldownSeconds",
            "type": "u64"
          },
          {
            "name": "recipientAllowlist",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "tokenAllowlist",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "dailySpent",
            "type": "u64"
          },
          {
            "name": "lastTxTimestamp",
            "type": "i64"
          },
          {
            "name": "lastResetTimestamp",
            "type": "i64"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "policyParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "dailyLimit",
            "type": "u64"
          },
          {
            "name": "perTxLimit",
            "type": "u64"
          },
          {
            "name": "approvalThreshold",
            "type": "u64"
          },
          {
            "name": "cooldownSeconds",
            "type": "u64"
          },
          {
            "name": "recipientAllowlist",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "tokenAllowlist",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "mint",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "policySet",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          }
        ]
      }
    }
  ]
};
