"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveWalletPda = deriveWalletPda;
exports.derivePolicyPda = derivePolicyPda;
exports.deriveQueuePda = deriveQueuePda;
exports.deriveRequestPda = deriveRequestPda;
exports.randomSalt = randomSalt;
const web3_js_1 = require("@solana/web3.js");
const program_ids_1 = require("./program-ids");
function deriveWalletPda(owner, salt) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("wallet"), owner.toBuffer(), salt], program_ids_1.AGENT_WALLET_PROGRAM_ID);
}
function derivePolicyPda(wallet) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("policy"), wallet.toBuffer()], program_ids_1.POLICY_REGISTRY_PROGRAM_ID);
}
function deriveQueuePda(wallet) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("queue"), wallet.toBuffer()], program_ids_1.APPROVAL_QUEUE_PROGRAM_ID);
}
function deriveRequestPda(wallet, id) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from("request"), wallet.toBuffer(), id.toArrayLike(Buffer, "le", 8)], program_ids_1.APPROVAL_QUEUE_PROGRAM_ID);
}
/**
 * Generate a 32-byte salt for wallet PDA derivation.
 *
 * SECURITY: must use a CSPRNG. The original implementation used
 * Math.random() which is NOT cryptographically secure and is predictable
 * across calls. While not directly exploitable today (the program
 * requires the owner signature on initialize), low-entropy salts could
 * enable PDA collision attacks or pre-image attacks if the wallet
 * derivation logic ever changes. Always use crypto.getRandomValues
 * (browser) or crypto.randomBytes (Node).
 */
function randomSalt() {
    // Prefer Node's crypto.randomBytes when available; fall back to the
    // Web Crypto API in browsers. Both are CSPRNG-backed.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeCrypto = typeof globalThis !== "undefined" &&
        typeof globalThis.process !== "undefined" &&
        typeof require !== "undefined"
        ? (() => {
            try {
                return require("crypto");
            }
            catch {
                return null;
            }
        })()
        : null;
    if (nodeCrypto?.randomBytes) {
        return nodeCrypto.randomBytes(32);
    }
    const webCrypto = typeof globalThis !== "undefined" && globalThis.crypto;
    if (webCrypto?.getRandomValues) {
        const arr = new Uint8Array(32);
        webCrypto.getRandomValues(arr);
        return Buffer.from(arr);
    }
    throw new Error("randomSalt: no CSPRNG available (Node crypto.randomBytes or Web Crypto getRandomValues required)");
}
