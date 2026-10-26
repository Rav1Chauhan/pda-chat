import { AnchorProvider } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
  clusterApiUrl,
} from "@solana/web3.js";
import type { PhantomProvider } from "@/lib/anchor";

type BrowserWallet = {
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(
    transaction: T
  ): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(
    transactions: T[]
  ): Promise<T[]>;
};

export function createPhantomWallet(
  provider: PhantomProvider
): BrowserWallet {
  if (!provider.publicKey) {
    throw new Error("Connect Phantom before creating the wallet adapter.");
  }

  const phantom = window.phantom?.solana as
    | (PhantomProvider & {
        signTransaction<T extends Transaction | VersionedTransaction>(
          transaction: T
        ): Promise<T>;
        signAllTransactions<T extends Transaction | VersionedTransaction>(
          transactions: T[]
        ): Promise<T[]>;
      })
    | undefined;

  if (!phantom?.signTransaction || !phantom.signAllTransactions) {
    throw new Error("Phantom transaction signing is unavailable.");
  }

  return {
    publicKey: provider.publicKey,

    signTransaction<T extends Transaction | VersionedTransaction>(
      transaction: T
    ): Promise<T> {
      return phantom.signTransaction(transaction);
    },

    signAllTransactions<T extends Transaction | VersionedTransaction>(
      transactions: T[]
    ): Promise<T[]> {
      return phantom.signAllTransactions(transactions);
    },
  };
}

export async function signEncryptionKeyMessage(
  provider: PhantomProvider,
  message: Uint8Array,
): Promise<Uint8Array> {
  if (!provider.publicKey) {
    throw new Error("Connect Phantom before signing.");
  }

  const phantom = window.phantom?.solana as
    | (PhantomProvider & {
        signMessage?: (
          message: Uint8Array,
        ) => Promise<{ signature: Uint8Array }>;
      })
    | undefined;

  if (!phantom?.signMessage) {
    throw new Error(
      "Phantom message signing is unavailable in this wallet session.",
    );
  }

  const result = await phantom.signMessage(message);
  if (!(result.signature instanceof Uint8Array) || result.signature.length !== 64) {
    throw new Error("Phantom returned an invalid message signature.");
  }

  return result.signature;
}

export function createAnchorProvider(
  provider: PhantomProvider
): AnchorProvider {
  const wallet = createPhantomWallet(provider);
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

  return new AnchorProvider(
    connection,
    wallet as ConstructorParameters<typeof AnchorProvider>[1],
    { commitment: "confirmed" }
  );
}
