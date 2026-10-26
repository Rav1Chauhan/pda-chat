import { describe, expect, it } from "vitest";
import nacl from "tweetnacl";
import { PublicKey } from "@solana/web3.js";
import sodium from "libsodium-wrappers-sumo";
import {
  createKeyAuthMessage,
  verifyKeyAuthSignature,
} from "../key-auth";

describe("encryption key wallet authentication", () => {
  it("accepts a valid signature from the claimed wallet", async () => {
    await sodium.ready;

    const wallet = nacl.sign.keyPair();
    const walletAddress = new PublicKey(wallet.publicKey).toBase58();
    const encryptionPair = sodium.crypto_box_keypair();
    const encryptionPublicKey = sodium.to_base64(
      encryptionPair.publicKey,
      sodium.base64_variants.URLSAFE_NO_PADDING
    );

    const message = createKeyAuthMessage(walletAddress, encryptionPublicKey);
    const signature = nacl.sign.detached(message, wallet.secretKey);

    expect(
      verifyKeyAuthSignature(walletAddress, encryptionPublicKey, signature)
    ).toBe(true);
  });

  it("rejects a tampered signature", async () => {
    await sodium.ready;

    const wallet = nacl.sign.keyPair();
    const walletAddress = new PublicKey(wallet.publicKey).toBase58();
    const encryptionPair = sodium.crypto_box_keypair();
    const encryptionPublicKey = sodium.to_base64(
      encryptionPair.publicKey,
      sodium.base64_variants.URLSAFE_NO_PADDING
    );

    const message = createKeyAuthMessage(walletAddress, encryptionPublicKey);
    const signature = nacl.sign.detached(message, wallet.secretKey);
    signature[0] ^= 1;

    expect(
      verifyKeyAuthSignature(walletAddress, encryptionPublicKey, signature)
    ).toBe(false);
  });

  it("rejects a signature from a different wallet", async () => {
    await sodium.ready;

    const signer = nacl.sign.keyPair();
    const otherWallet = nacl.sign.keyPair();
    const walletAddress = new PublicKey(otherWallet.publicKey).toBase58();
    const encryptionPair = sodium.crypto_box_keypair();
    const encryptionPublicKey = sodium.to_base64(
      encryptionPair.publicKey,
      sodium.base64_variants.URLSAFE_NO_PADDING
    );

    const message = createKeyAuthMessage(walletAddress, encryptionPublicKey);
    const signature = nacl.sign.detached(message, signer.secretKey);

    expect(
      verifyKeyAuthSignature(walletAddress, encryptionPublicKey, signature)
    ).toBe(false);
  });
});
