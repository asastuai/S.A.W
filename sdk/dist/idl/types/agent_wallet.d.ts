/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/agent_wallet.json`.
 */
export type AgentWallet = {
    "address": "6wsPfHTs13KA3seca53S8sc4oW7ropypGU7PzA4345TB";
    "metadata": {
        "name": "agentWallet";
        "version": "0.1.0";
        "spec": "0.1.0";
        "description": "SAW agent_wallet program — PDA-based wallet with policy enforcement and human-in-the-loop approval";
    };
    "instructions": [
        {
            "name": "approveAndExecute";
            "discriminator": [
                33,
                102,
                199,
                162,
                95,
                77,
                158,
                45
            ];
            "accounts": [
                {
                    "name": "wallet";
                },
                {
                    "name": "owner";
                    "writable": true;
                    "signer": true;
                },
                {
                    "name": "policy";
                    "writable": true;
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const";
                                "value": [
                                    112,
                                    111,
                                    108,
                                    105,
                                    99,
                                    121
                                ];
                            },
                            {
                                "kind": "account";
                                "path": "wallet";
                            }
                        ];
                        "program": {
                            "kind": "const";
                            "value": [
                                211,
                                249,
                                146,
                                206,
                                24,
                                25,
                                206,
                                52,
                                33,
                                82,
                                117,
                                146,
                                11,
                                22,
                                169,
                                169,
                                14,
                                118,
                                168,
                                203,
                                148,
                                180,
                                194,
                                52,
                                209,
                                92,
                                42,
                                88,
                                115,
                                235,
                                245,
                                236
                            ];
                        };
                    };
                },
                {
                    "name": "queue";
                    "writable": true;
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const";
                                "value": [
                                    113,
                                    117,
                                    101,
                                    117,
                                    101
                                ];
                            },
                            {
                                "kind": "account";
                                "path": "wallet";
                            }
                        ];
                        "program": {
                            "kind": "const";
                            "value": [
                                108,
                                47,
                                64,
                                233,
                                180,
                                231,
                                162,
                                143,
                                226,
                                64,
                                121,
                                184,
                                27,
                                143,
                                233,
                                216,
                                43,
                                107,
                                165,
                                26,
                                179,
                                66,
                                234,
                                253,
                                172,
                                21,
                                173,
                                42,
                                82,
                                41,
                                11,
                                251
                            ];
                        };
                    };
                },
                {
                    "name": "request";
                    "writable": true;
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const";
                                "value": [
                                    114,
                                    101,
                                    113,
                                    117,
                                    101,
                                    115,
                                    116
                                ];
                            },
                            {
                                "kind": "account";
                                "path": "request.wallet";
                                "account": "requestAccount";
                            },
                            {
                                "kind": "account";
                                "path": "request.id";
                                "account": "requestAccount";
                            }
                        ];
                        "program": {
                            "kind": "const";
                            "value": [
                                108,
                                47,
                                64,
                                233,
                                180,
                                231,
                                162,
                                143,
                                226,
                                64,
                                121,
                                184,
                                27,
                                143,
                                233,
                                216,
                                43,
                                107,
                                165,
                                26,
                                179,
                                66,
                                234,
                                253,
                                172,
                                21,
                                173,
                                42,
                                82,
                                41,
                                11,
                                251
                            ];
                        };
                    };
                },
                {
                    "name": "mint";
                },
                {
                    "name": "sourceTokenAccount";
                    "writable": true;
                },
                {
                    "name": "recipientTokenAccount";
                    "writable": true;
                },
                {
                    "name": "policyProgram";
                    "address": "FGTkQ9C8zr7Rm9WFZ7rK6cDdY7Bju1dTsjSN5GuHqAJF";
                },
                {
                    "name": "queueProgram";
                    "address": "8HJpiQCaCHcvbDVX7K6shcHmNkUZJUfSEqm9mhVcXXnr";
                },
                {
                    "name": "tokenProgram";
                }
            ];
            "args": [];
        },
        {
            "name": "denyRequest";
            "discriminator": [
                143,
                236,
                238,
                188,
                131,
                164,
                217,
                107
            ];
            "accounts": [
                {
                    "name": "wallet";
                },
                {
                    "name": "owner";
                    "signer": true;
                },
                {
                    "name": "queue";
                    "writable": true;
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const";
                                "value": [
                                    113,
                                    117,
                                    101,
                                    117,
                                    101
                                ];
                            },
                            {
                                "kind": "account";
                                "path": "wallet";
                            }
                        ];
                        "program": {
                            "kind": "const";
                            "value": [
                                108,
                                47,
                                64,
                                233,
                                180,
                                231,
                                162,
                                143,
                                226,
                                64,
                                121,
                                184,
                                27,
                                143,
                                233,
                                216,
                                43,
                                107,
                                165,
                                26,
                                179,
                                66,
                                234,
                                253,
                                172,
                                21,
                                173,
                                42,
                                82,
                                41,
                                11,
                                251
                            ];
                        };
                    };
                },
                {
                    "name": "request";
                    "writable": true;
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const";
                                "value": [
                                    114,
                                    101,
                                    113,
                                    117,
                                    101,
                                    115,
                                    116
                                ];
                            },
                            {
                                "kind": "account";
                                "path": "request.wallet";
                                "account": "requestAccount";
                            },
                            {
                                "kind": "account";
                                "path": "request.id";
                                "account": "requestAccount";
                            }
                        ];
                        "program": {
                            "kind": "const";
                            "value": [
                                108,
                                47,
                                64,
                                233,
                                180,
                                231,
                                162,
                                143,
                                226,
                                64,
                                121,
                                184,
                                27,
                                143,
                                233,
                                216,
                                43,
                                107,
                                165,
                                26,
                                179,
                                66,
                                234,
                                253,
                                172,
                                21,
                                173,
                                42,
                                82,
                                41,
                                11,
                                251
                            ];
                        };
                    };
                },
                {
                    "name": "queueProgram";
                    "address": "8HJpiQCaCHcvbDVX7K6shcHmNkUZJUfSEqm9mhVcXXnr";
                }
            ];
            "args": [];
        },
        {
            "name": "emergencyWithdraw";
            "discriminator": [
                239,
                45,
                203,
                64,
                150,
                73,
                218,
                92
            ];
            "accounts": [
                {
                    "name": "wallet";
                },
                {
                    "name": "owner";
                    "signer": true;
                },
                {
                    "name": "policy";
                    "writable": true;
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const";
                                "value": [
                                    112,
                                    111,
                                    108,
                                    105,
                                    99,
                                    121
                                ];
                            },
                            {
                                "kind": "account";
                                "path": "wallet";
                            }
                        ];
                        "program": {
                            "kind": "const";
                            "value": [
                                211,
                                249,
                                146,
                                206,
                                24,
                                25,
                                206,
                                52,
                                33,
                                82,
                                117,
                                146,
                                11,
                                22,
                                169,
                                169,
                                14,
                                118,
                                168,
                                203,
                                148,
                                180,
                                194,
                                52,
                                209,
                                92,
                                42,
                                88,
                                115,
                                235,
                                245,
                                236
                            ];
                        };
                    };
                },
                {
                    "name": "policyProgram";
                    "address": "FGTkQ9C8zr7Rm9WFZ7rK6cDdY7Bju1dTsjSN5GuHqAJF";
                },
                {
                    "name": "mint";
                },
                {
                    "name": "sourceTokenAccount";
                    "writable": true;
                },
                {
                    "name": "ownerTokenAccount";
                    "writable": true;
                },
                {
                    "name": "tokenProgram";
                }
            ];
            "args": [];
        },
        {
            "name": "initializeWallet";
            "discriminator": [
                213,
                0,
                239,
                240,
                73,
                100,
                188,
                193
            ];
            "accounts": [
                {
                    "name": "wallet";
                    "writable": true;
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const";
                                "value": [
                                    119,
                                    97,
                                    108,
                                    108,
                                    101,
                                    116
                                ];
                            },
                            {
                                "kind": "account";
                                "path": "owner";
                            },
                            {
                                "kind": "arg";
                                "path": "salt";
                            }
                        ];
                    };
                },
                {
                    "name": "owner";
                    "writable": true;
                    "signer": true;
                },
                {
                    "name": "policy";
                    "writable": true;
                },
                {
                    "name": "queue";
                    "writable": true;
                },
                {
                    "name": "policyProgram";
                    "address": "FGTkQ9C8zr7Rm9WFZ7rK6cDdY7Bju1dTsjSN5GuHqAJF";
                },
                {
                    "name": "queueProgram";
                    "address": "8HJpiQCaCHcvbDVX7K6shcHmNkUZJUfSEqm9mhVcXXnr";
                },
                {
                    "name": "systemProgram";
                    "address": "11111111111111111111111111111111";
                }
            ];
            "args": [
                {
                    "name": "salt";
                    "type": {
                        "array": [
                            "u8",
                            32
                        ];
                    };
                },
                {
                    "name": "agent";
                    "type": "pubkey";
                },
                {
                    "name": "params";
                    "type": {
                        "defined": {
                            "name": "policyParams";
                        };
                    };
                }
            ];
        },
        {
            "name": "payDirect";
            "discriminator": [
                224,
                119,
                163,
                189,
                43,
                93,
                113,
                21
            ];
            "accounts": [
                {
                    "name": "wallet";
                },
                {
                    "name": "agent";
                    "signer": true;
                },
                {
                    "name": "policy";
                    "writable": true;
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const";
                                "value": [
                                    112,
                                    111,
                                    108,
                                    105,
                                    99,
                                    121
                                ];
                            },
                            {
                                "kind": "account";
                                "path": "wallet";
                            }
                        ];
                        "program": {
                            "kind": "const";
                            "value": [
                                211,
                                249,
                                146,
                                206,
                                24,
                                25,
                                206,
                                52,
                                33,
                                82,
                                117,
                                146,
                                11,
                                22,
                                169,
                                169,
                                14,
                                118,
                                168,
                                203,
                                148,
                                180,
                                194,
                                52,
                                209,
                                92,
                                42,
                                88,
                                115,
                                235,
                                245,
                                236
                            ];
                        };
                    };
                },
                {
                    "name": "mint";
                },
                {
                    "name": "sourceTokenAccount";
                    "writable": true;
                },
                {
                    "name": "recipientTokenAccount";
                    "writable": true;
                },
                {
                    "name": "policyProgram";
                    "address": "FGTkQ9C8zr7Rm9WFZ7rK6cDdY7Bju1dTsjSN5GuHqAJF";
                },
                {
                    "name": "tokenProgram";
                }
            ];
            "args": [
                {
                    "name": "to";
                    "type": "pubkey";
                },
                {
                    "name": "amount";
                    "type": "u64";
                },
                {
                    "name": "memo";
                    "type": {
                        "array": [
                            "u8",
                            32
                        ];
                    };
                }
            ];
        },
        {
            "name": "requestPayment";
            "discriminator": [
                200,
                214,
                181,
                94,
                178,
                84,
                71,
                247
            ];
            "accounts": [
                {
                    "name": "wallet";
                },
                {
                    "name": "agent";
                    "signer": true;
                },
                {
                    "name": "policy";
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const";
                                "value": [
                                    112,
                                    111,
                                    108,
                                    105,
                                    99,
                                    121
                                ];
                            },
                            {
                                "kind": "account";
                                "path": "wallet";
                            }
                        ];
                        "program": {
                            "kind": "const";
                            "value": [
                                211,
                                249,
                                146,
                                206,
                                24,
                                25,
                                206,
                                52,
                                33,
                                82,
                                117,
                                146,
                                11,
                                22,
                                169,
                                169,
                                14,
                                118,
                                168,
                                203,
                                148,
                                180,
                                194,
                                52,
                                209,
                                92,
                                42,
                                88,
                                115,
                                235,
                                245,
                                236
                            ];
                        };
                    };
                },
                {
                    "name": "queue";
                    "writable": true;
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const";
                                "value": [
                                    113,
                                    117,
                                    101,
                                    117,
                                    101
                                ];
                            },
                            {
                                "kind": "account";
                                "path": "wallet";
                            }
                        ];
                        "program": {
                            "kind": "const";
                            "value": [
                                108,
                                47,
                                64,
                                233,
                                180,
                                231,
                                162,
                                143,
                                226,
                                64,
                                121,
                                184,
                                27,
                                143,
                                233,
                                216,
                                43,
                                107,
                                165,
                                26,
                                179,
                                66,
                                234,
                                253,
                                172,
                                21,
                                173,
                                42,
                                82,
                                41,
                                11,
                                251
                            ];
                        };
                    };
                },
                {
                    "name": "request";
                    "writable": true;
                },
                {
                    "name": "payer";
                    "writable": true;
                    "signer": true;
                },
                {
                    "name": "queueProgram";
                    "address": "8HJpiQCaCHcvbDVX7K6shcHmNkUZJUfSEqm9mhVcXXnr";
                },
                {
                    "name": "systemProgram";
                    "address": "11111111111111111111111111111111";
                }
            ];
            "args": [
                {
                    "name": "to";
                    "type": "pubkey";
                },
                {
                    "name": "mint";
                    "type": "pubkey";
                },
                {
                    "name": "amount";
                    "type": "u64";
                },
                {
                    "name": "memo";
                    "type": {
                        "array": [
                            "u8",
                            32
                        ];
                    };
                }
            ];
        },
        {
            "name": "revokeAgent";
            "discriminator": [
                227,
                60,
                209,
                125,
                240,
                117,
                163,
                73
            ];
            "accounts": [
                {
                    "name": "wallet";
                    "writable": true;
                },
                {
                    "name": "owner";
                    "signer": true;
                }
            ];
            "args": [];
        },
        {
            "name": "setAgent";
            "discriminator": [
                154,
                74,
                121,
                91,
                137,
                19,
                101,
                166
            ];
            "accounts": [
                {
                    "name": "wallet";
                    "writable": true;
                },
                {
                    "name": "owner";
                    "signer": true;
                }
            ];
            "args": [
                {
                    "name": "newAgent";
                    "type": "pubkey";
                }
            ];
        }
    ];
    "accounts": [
        {
            "name": "policyAccount";
            "discriminator": [
                218,
                201,
                183,
                164,
                156,
                127,
                81,
                175
            ];
        },
        {
            "name": "queueState";
            "discriminator": [
                18,
                227,
                150,
                65,
                218,
                214,
                72,
                191
            ];
        },
        {
            "name": "requestAccount";
            "discriminator": [
                108,
                23,
                6,
                158,
                184,
                6,
                152,
                121
            ];
        },
        {
            "name": "walletAccount";
            "discriminator": [
                158,
                98,
                171,
                153,
                212,
                64,
                242,
                213
            ];
        }
    ];
    "events": [
        {
            "name": "agentRevoked";
            "discriminator": [
                12,
                251,
                249,
                166,
                122,
                83,
                162,
                116
            ];
        },
        {
            "name": "agentSet";
            "discriminator": [
                205,
                125,
                51,
                16,
                30,
                110,
                117,
                11
            ];
        },
        {
            "name": "emergencyWithdrawal";
            "discriminator": [
                225,
                77,
                96,
                117,
                149,
                211,
                83,
                71
            ];
        },
        {
            "name": "paymentExecuted";
            "discriminator": [
                153,
                165,
                141,
                18,
                246,
                20,
                204,
                227
            ];
        },
        {
            "name": "walletInitialized";
            "discriminator": [
                6,
                2,
                95,
                235,
                116,
                238,
                156,
                98
            ];
        }
    ];
    "errors": [
        {
            "code": 6000;
            "name": "notOwner";
            "msg": "Caller is not the wallet owner (handler)";
        },
        {
            "code": 6001;
            "name": "notActiveAgent";
            "msg": "Caller is not the active agent";
        },
        {
            "code": 6002;
            "name": "agentRevoked";
            "msg": "Agent is currently revoked";
        },
        {
            "code": 6003;
            "name": "tokenNotAllowed";
            "msg": "Token is not in policy allowlist";
        },
        {
            "code": 6004;
            "name": "recipientNotAllowed";
            "msg": "Recipient is not in policy allowlist";
        },
        {
            "code": 6005;
            "name": "exceedsPerTxLimit";
            "msg": "Transaction exceeds per-transaction limit";
        },
        {
            "code": 6006;
            "name": "exceedsDailyLimit";
            "msg": "Transaction exceeds daily spending limit";
        },
        {
            "code": 6007;
            "name": "cooldownActive";
            "msg": "Cooldown period has not elapsed";
        },
        {
            "code": 6008;
            "name": "requestMismatch";
            "msg": "Approval request mismatch";
        },
        {
            "code": 6009;
            "name": "notApproved";
            "msg": "Approval request is not in approved status";
        },
        {
            "code": 6010;
            "name": "insufficientBalance";
            "msg": "Insufficient wallet balance";
        },
        {
            "code": 6011;
            "name": "zeroAmount";
            "msg": "Amount must be greater than zero";
        }
    ];
    "types": [
        {
            "name": "agentRevoked";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "wallet";
                        "type": "pubkey";
                    },
                    {
                        "name": "agent";
                        "type": "pubkey";
                    }
                ];
            };
        },
        {
            "name": "agentSet";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "wallet";
                        "type": "pubkey";
                    },
                    {
                        "name": "agent";
                        "type": "pubkey";
                    }
                ];
            };
        },
        {
            "name": "emergencyWithdrawal";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "wallet";
                        "type": "pubkey";
                    },
                    {
                        "name": "mint";
                        "type": "pubkey";
                    },
                    {
                        "name": "amount";
                        "type": "u64";
                    }
                ];
            };
        },
        {
            "name": "paymentExecuted";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "wallet";
                        "type": "pubkey";
                    },
                    {
                        "name": "to";
                        "type": "pubkey";
                    },
                    {
                        "name": "mint";
                        "type": "pubkey";
                    },
                    {
                        "name": "amount";
                        "type": "u64";
                    }
                ];
            };
        },
        {
            "name": "policyAccount";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "wallet";
                        "type": "pubkey";
                    },
                    {
                        "name": "owner";
                        "type": "pubkey";
                    },
                    {
                        "name": "dailyLimit";
                        "type": "u64";
                    },
                    {
                        "name": "perTxLimit";
                        "type": "u64";
                    },
                    {
                        "name": "approvalThreshold";
                        "type": "u64";
                    },
                    {
                        "name": "cooldownSeconds";
                        "type": "u64";
                    },
                    {
                        "name": "recipientAllowlist";
                        "type": {
                            "vec": "pubkey";
                        };
                    },
                    {
                        "name": "tokenAllowlist";
                        "type": {
                            "vec": "pubkey";
                        };
                    },
                    {
                        "name": "dailySpent";
                        "type": "u64";
                    },
                    {
                        "name": "lastTxTimestamp";
                        "type": "i64";
                    },
                    {
                        "name": "lastResetTimestamp";
                        "type": "i64";
                    },
                    {
                        "name": "bump";
                        "type": "u8";
                    }
                ];
            };
        },
        {
            "name": "policyParams";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "dailyLimit";
                        "type": "u64";
                    },
                    {
                        "name": "perTxLimit";
                        "type": "u64";
                    },
                    {
                        "name": "approvalThreshold";
                        "type": "u64";
                    },
                    {
                        "name": "cooldownSeconds";
                        "type": "u64";
                    },
                    {
                        "name": "recipientAllowlist";
                        "type": {
                            "vec": "pubkey";
                        };
                    },
                    {
                        "name": "tokenAllowlist";
                        "type": {
                            "vec": "pubkey";
                        };
                    }
                ];
            };
        },
        {
            "name": "queueState";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "wallet";
                        "type": "pubkey";
                    },
                    {
                        "name": "owner";
                        "type": "pubkey";
                    },
                    {
                        "name": "nextRequestId";
                        "type": "u64";
                    },
                    {
                        "name": "pendingCount";
                        "type": "u32";
                    },
                    {
                        "name": "bump";
                        "type": "u8";
                    }
                ];
            };
        },
        {
            "name": "requestAccount";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "wallet";
                        "type": "pubkey";
                    },
                    {
                        "name": "id";
                        "type": "u64";
                    },
                    {
                        "name": "to";
                        "type": "pubkey";
                    },
                    {
                        "name": "mint";
                        "type": "pubkey";
                    },
                    {
                        "name": "amount";
                        "type": "u64";
                    },
                    {
                        "name": "memo";
                        "type": {
                            "array": [
                                "u8",
                                32
                            ];
                        };
                    },
                    {
                        "name": "createdAt";
                        "type": "i64";
                    },
                    {
                        "name": "expiresAt";
                        "type": "i64";
                    },
                    {
                        "name": "status";
                        "type": {
                            "defined": {
                                "name": "requestStatus";
                            };
                        };
                    },
                    {
                        "name": "bump";
                        "type": "u8";
                    }
                ];
            };
        },
        {
            "name": "requestStatus";
            "type": {
                "kind": "enum";
                "variants": [
                    {
                        "name": "pending";
                    },
                    {
                        "name": "approved";
                    },
                    {
                        "name": "denied";
                    }
                ];
            };
        },
        {
            "name": "walletAccount";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "owner";
                        "type": "pubkey";
                    },
                    {
                        "name": "agent";
                        "type": "pubkey";
                    },
                    {
                        "name": "agentActive";
                        "type": "bool";
                    },
                    {
                        "name": "salt";
                        "type": {
                            "array": [
                                "u8",
                                32
                            ];
                        };
                    },
                    {
                        "name": "bump";
                        "type": "u8";
                    }
                ];
            };
        },
        {
            "name": "walletInitialized";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "wallet";
                        "type": "pubkey";
                    },
                    {
                        "name": "owner";
                        "type": "pubkey";
                    },
                    {
                        "name": "agent";
                        "type": "pubkey";
                    }
                ];
            };
        }
    ];
};
