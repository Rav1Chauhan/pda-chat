import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import sodium from "libsodium-wrappers-sumo";
import {
  generateEncryptionKeyPair,
  type EncryptionKeyPair,
} from "@/lib/encryption";
import {
  loadEncryptionKeys,
  saveEncryptionKeys,
} from "@/lib/key-storage";

const WALLET_A = "11111111111111111111111111111111";
const WALLET_B = "Vote111111111111111111111111111111111111111";

describe("encryption key storage", () => {
  beforeEach(async () => {
    await sodium.ready;
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("pda-chat-key-store");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Database deletion blocked"));
    });
  });

  it("saves and reloads the original key pair", async () => {
    const keys = await generateEncryptionKeyPair();

    await saveEncryptionKeys(WALLET_A, keys, "correct-horse-battery-staple");

    const loaded = await loadEncryptionKeys(
      WALLET_A,
      "correct-horse-battery-staple",
    );

    expect(loaded).toEqual(keys);
  });

  it("rejects an incorrect passphrase", async () => {
    const keys = await generateEncryptionKeyPair();

    await saveEncryptionKeys(WALLET_A, keys, "correct-horse-battery-staple");

    await expect(
      loadEncryptionKeys(WALLET_A, "incorrect-passphrase"),
    ).rejects.toThrow(/unlock keys/i);
  });

  it("does not unlock one wallet's keys under another wallet address", async () => {
    const keys = await generateEncryptionKeyPair();

    await saveEncryptionKeys(WALLET_A, keys, "correct-horse-battery-staple");

    await expect(
      loadEncryptionKeys(WALLET_B, "correct-horse-battery-staple"),
    ).resolves.toBeNull();
  });

  it("returns null when no keys have been saved", async () => {
    await expect(
      loadEncryptionKeys(WALLET_A, "correct-horse-battery-staple"),
    ).resolves.toBeNull();
  });

  it("rejects passphrases shorter than 12 characters", async () => {
    const keys: EncryptionKeyPair = await generateEncryptionKeyPair();

    await expect(
      saveEncryptionKeys(WALLET_A, keys, "short"),
    ).rejects.toThrow(/12 characters/i);
  });
});
