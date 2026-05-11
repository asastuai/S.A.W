/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/approval_queue.json`.
 */
export type ApprovalQueue = {
  "address": "8HJpiQCaCHcvbDVX7K6shcHmNkUZJUfSEqm9mhVcXXnr",
  "metadata": {
    "name": "approvalQueue",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "createRequest",
      "discriminator": [
        219,
        191,
        93,
        237,
        18,
        44,
        42,
        84
      ],
      "accounts": [
        {
          "name": "queue",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  101,
                  117,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "queue.wallet",
                "account": "queueState"
              }
            ]
          }
        },
        {
          "name": "request",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  113,
                  117,
                  101,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "queue.wallet",
                "account": "queueState"
              },
              {
                "kind": "account",
                "path": "queue.next_request_id",
                "account": "queueState"
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
          "name": "to",
          "type": "pubkey"
        },
        {
          "name": "mint",
          "type": "pubkey"
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "memo",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ],
      "returns": "u64"
    },
    {
      "name": "markApproved",
      "discriminator": [
        25,
        140,
        220,
        59,
        183,
        74,
        229,
        51
      ],
      "accounts": [
        {
          "name": "queue",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  101,
                  117,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "queue.wallet",
                "account": "queueState"
              }
            ]
          }
        },
        {
          "name": "request",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  113,
                  117,
                  101,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "request.wallet",
                "account": "requestAccount"
              },
              {
                "kind": "account",
                "path": "request.id",
                "account": "requestAccount"
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
      "name": "markDenied",
      "discriminator": [
        143,
        82,
        189,
        105,
        188,
        43,
        41,
        56
      ],
      "accounts": [
        {
          "name": "queue",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  101,
                  117,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "queue.wallet",
                "account": "queueState"
              }
            ]
          }
        },
        {
          "name": "request",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  113,
                  117,
                  101,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "request.wallet",
                "account": "requestAccount"
              },
              {
                "kind": "account",
                "path": "request.id",
                "account": "requestAccount"
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
      "name": "registerQueue",
      "discriminator": [
        188,
        11,
        37,
        47,
        42,
        142,
        245,
        37
      ],
      "accounts": [
        {
          "name": "queue",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  101,
                  117,
                  101
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
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "queueState",
      "discriminator": [
        18,
        227,
        150,
        65,
        218,
        214,
        72,
        191
      ]
    },
    {
      "name": "requestAccount",
      "discriminator": [
        108,
        23,
        6,
        158,
        184,
        6,
        152,
        121
      ]
    }
  ],
  "events": [
    {
      "name": "requestApproved",
      "discriminator": [
        158,
        196,
        69,
        207,
        98,
        44,
        119,
        187
      ]
    },
    {
      "name": "requestCreated",
      "discriminator": [
        102,
        44,
        0,
        225,
        163,
        110,
        167,
        187
      ]
    },
    {
      "name": "requestDenied",
      "discriminator": [
        21,
        164,
        219,
        5,
        34,
        138,
        199,
        213
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "maxPendingReached",
      "msg": "Maximum pending requests reached for this wallet"
    },
    {
      "code": 6001,
      "name": "notPending",
      "msg": "Request is not in Pending status"
    },
    {
      "code": 6002,
      "name": "expired",
      "msg": "Request has expired"
    },
    {
      "code": 6003,
      "name": "notWallet",
      "msg": "Caller is not the registered wallet"
    },
    {
      "code": 6004,
      "name": "notOwner",
      "msg": "Caller is not the registered owner"
    },
    {
      "code": 6005,
      "name": "wrongWallet",
      "msg": "Request does not belong to this wallet"
    }
  ],
  "types": [
    {
      "name": "queueState",
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
            "name": "nextRequestId",
            "type": "u64"
          },
          {
            "name": "pendingCount",
            "type": "u32"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "requestAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "to",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "memo",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "requestStatus"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "requestApproved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "requestCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "to",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "requestDenied",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "requestStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "pending"
          },
          {
            "name": "approved"
          },
          {
            "name": "denied"
          }
        ]
      }
    }
  ]
};
