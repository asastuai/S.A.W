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
function randomSalt() {
    const salt = Buffer.alloc(32);
    for (let i = 0; i < 32; i++) {
        salt[i] = Math.floor(Math.random() * 256);
    }
    return salt;
}
