import { describe, expect, it } from "vitest";
import {
  generateEncryptionKeyPair,
  encryptMessage,
  decryptMessage,
} from "../encryption";

describe("end-to-end message encryption", () => {
  it("allows both sender and recipient to decrypt the message", async () => {
    const sender = await generateEncryptionKeyPair();
    const recipient = await generateEncryptionKeyPair();

    const encrypted = await encryptMessage(
      "Hello, private Solana chat!",
      sender,
      recipient.publicKey,
    );

    await expect(decryptMessage(encrypted, sender)).resolves.toBe(
      "Hello, private Solana chat!",
    );

    await expect(decryptMessage(encrypted, recipient)).resolves.toBe(
      "Hello, private Solana chat!",
    );
  });

  it("rejects a key that does not belong to either participant", async () => {
    const sender = await generateEncryptionKeyPair();
    const recipient = await generateEncryptionKeyPair();
    const stranger = await generateEncryptionKeyPair();

    const encrypted = await encryptMessage(
      "Private message",
      sender,
      recipient.publicKey,
    );

    await expect(decryptMessage(encrypted, stranger)).rejects.toThrow(
      "Your key is not authorized to read this message.",
    );
  });

  it("rejects a modified ciphertext", async () => {
    const sender = await generateEncryptionKeyPair();
    const recipient = await generateEncryptionKeyPair();

    const encrypted = await encryptMessage(
      "Do not tamper with this",
      sender,
      recipient.publicKey,
    );

    const altered = {
      ...encrypted,
      ciphertext:
        encrypted.ciphertext[0] === "A"
          ? "B" + encrypted.ciphertext.slice(1)
          : "A" + encrypted.ciphertext.slice(1),
    };

    await expect(decryptMessage(altered, recipient)).rejects.toThrow();
  });

  it("rejects an empty message", async () => {
    const sender = await generateEncryptionKeyPair();
    const recipient = await generateEncryptionKeyPair();

    await expect(
      encryptMessage("   ", sender, recipient.publicKey),
    ).rejects.toThrow("Message cannot be empty.");
  });
});
