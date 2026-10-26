import nacl from "tweetnacl";
import sodium from "libsodium-wrappers-sumo";
import { PublicKey } from "@solana/web3.js";
import type { EncryptionKeyPair } from "@/lib/encryption";

const DOMAIN = "PDA-CHAT-ENCRYPTION-KEY-V1";

export function createKeyAuthMessage(
  walletAddress: string,
  encryptionPublicKey: string
): Uint8Array {
  const wallet = new PublicKey(walletAddress);

  const message = [
    DOMAIN,
    `Wallet: ${wallet.toBase58()}`,
    `Encryption Public Key: ${encryptionPublicKey}`,
    "Purpose: Bind this encryption key to this wallet.",
  ].join("\n");

  return new TextEncoder().encode(message);
}

export function verifyKeyAuthSignature(
  walletAddress: string,
  encryptionPublicKey: string,
  signature: Uint8Array
): boolean {
  try {
    const message = createKeyAuthMessage(walletAddress, encryptionPublicKey);

    return (
      signature.length === nacl.sign.signatureLength &&
      nacl.sign.detached.verify(
        message,
        signature,
        new PublicKey(walletAddress).toBytes()
      )
    );
  } catch {
    return false;
  }
}

export async function authenticateEncryptionKey(
  walletAddress: string,
  keys: EncryptionKeyPair,
  signMessage: (message: Uint8Array) => Promise<{ signature: Uint8Array }>
): Promise<{ message: Uint8Array; signature: Uint8Array }> {
  await sodium.ready;

  const publicKey = sodium.from_base64(
    keys.publicKey,
    sodium.base64_variants.URLSAFE_NO_PADDING
  );

  if (publicKey.length !== nacl.box.publicKeyLength) {
    throw new Error("Invalid encryption public key.");
  }

  const message = createKeyAuthMessage(walletAddress, keys.publicKey);
  const signed = await signMessage(message);

  if (
    !verifyKeyAuthSignature(
      walletAddress,
      keys.publicKey,
      signed.signature
    )
  ) {
    throw new Error("Wallet signature verification failed.");
  }

  return { message, signature: signed.signature };
}
