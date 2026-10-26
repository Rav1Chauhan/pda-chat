import type { AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { getProgram, PROGRAM_ID } from "@/lib/anchor";

const REGISTRY_SEED = Buffer.from("encryption_key");

export function getEncryptionKeyPda(owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [REGISTRY_SEED, owner.toBuffer()],
    PROGRAM_ID,
  )[0];
}

function validateEncryptionPublicKey(publicKey: Uint8Array): number[] {
  if (publicKey.length !== 32) {
    throw new Error("Encryption public key must be exactly 32 bytes.");
  }

  return Array.from(publicKey);
}

export async function registerEncryptionKey(
  provider: AnchorProvider,
  encryptionPublicKey: Uint8Array,
) {
  const owner = provider.wallet.publicKey;
  const encryptionKey = getEncryptionKeyPda(owner);
  const program = getProgram(provider);

  const signature = await program.methods
    .registerEncryptionKey(validateEncryptionPublicKey(encryptionPublicKey))
    .accounts({
      encryptionKey,
      owner,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return {
    signature,
    address: encryptionKey.toBase58(),
  };
}

export async function updateEncryptionKey(
  provider: AnchorProvider,
  encryptionPublicKey: Uint8Array,
) {
  const owner = provider.wallet.publicKey;
  const encryptionKey = getEncryptionKeyPda(owner);
  const program = getProgram(provider);

  const signature = await program.methods
    .updateEncryptionKey(validateEncryptionPublicKey(encryptionPublicKey))
    .accounts({
      encryptionKey,
      owner,
    })
    .rpc();

  return {
    signature,
    address: encryptionKey.toBase58(),
  };
}

export async function fetchEncryptionPublicKey(
  provider: AnchorProvider,
  owner: PublicKey,
): Promise<Uint8Array | null> {
  const encryptionKey = getEncryptionKeyPda(owner);
  const accountInfo = await provider.connection.getAccountInfo(
    encryptionKey,
    "confirmed",
  );

  if (!accountInfo) return null;

  const program = getProgram(provider);
  const coder = program.coder.accounts;
  const decoded = coder.decode("encryptionKey", Buffer.from(accountInfo.data)) as {
    owner: PublicKey;
    encryptionPublicKey: number[] | Uint8Array;
    bump: number;
  };

  if (!decoded.owner.equals(owner)) {
    throw new Error("Encryption registry owner does not match the requested wallet.");
  }

  const publicKey = Uint8Array.from(decoded.encryptionPublicKey);

  if (publicKey.length !== 32) {
    throw new Error("Registry contains an invalid encryption public key.");
  }

  return publicKey;
}
