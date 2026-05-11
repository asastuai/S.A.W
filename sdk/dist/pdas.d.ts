import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
export declare function deriveWalletPda(owner: PublicKey, salt: Buffer): [PublicKey, number];
export declare function derivePolicyPda(wallet: PublicKey): [PublicKey, number];
export declare function deriveQueuePda(wallet: PublicKey): [PublicKey, number];
export declare function deriveRequestPda(wallet: PublicKey, id: BN): [PublicKey, number];
export declare function randomSalt(): Buffer;
