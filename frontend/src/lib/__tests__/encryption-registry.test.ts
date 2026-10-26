import { describe, expect, it } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  getEncryptionKeyPda,
  registerEncryptionKey,
  updateEncryptionKey,
} from "@/lib/encryption-registry";
import { PROGRAM_ID } from "@/lib/anchor";

describe("encryption registry", () => {
  it("derives the same PDA for the same wallet", () => {
    const wallet = Keypair.generate().publicKey;

    const first = getEncryptionKeyPda(wallet);
    const second = getEncryptionKeyPda(wallet);

    expect(first.equals(second)).toBe(true);
  });

  it("derives different PDAs for different wallets", () => {
    const walletA = Keypair.generate().publicKey;
    const walletB = Keypair.generate().publicKey;

    expect(getEncryptionKeyPda(walletA).equals(getEncryptionKeyPda(walletB)))
      .toBe(false);
  });

  it("derives the PDA using the expected seed and program ID", () => {
    const wallet = Keypair.generate().publicKey;

    const [expected] = PublicKey.findProgramAddressSync(
      [Buffer.from("encryption_key"), wallet.toBuffer()],
      PROGRAM_ID,
    );

    expect(getEncryptionKeyPda(wallet).equals(expected)).toBe(true);
  });

  it("rejects a public key with the wrong length before submitting", async () => {
    const provider = {
      wallet: { publicKey: Keypair.generate().publicKey },
    } as never;

    await expect(registerEncryptionKey(provider, new Uint8Array(31)))
      .rejects.toThrow("Encryption public key must be exactly 32 bytes.");

    await expect(updateEncryptionKey(provider, new Uint8Array(33)))
      .rejects.toThrow("Encryption public key must be exactly 32 bytes.");
  });
});
