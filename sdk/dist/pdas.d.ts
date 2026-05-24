import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
export declare function deriveWalletPda(owner: PublicKey, salt: Buffer): [PublicKey, number];
export declare function derivePolicyPda(wallet: PublicKey): [PublicKey, number];
export declare function deriveQueuePda(wallet: PublicKey): [PublicKey, number];
export declare function deriveRequestPda(wallet: PublicKey, id: BN): [PublicKey, number];
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
export declare function randomSalt(): Buffer;
