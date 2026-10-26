import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  ENCRYPTED_MESSAGE_DISCRIMINATOR,
  parseEncryptedMessageAccount,
} from "../messages";

function makeAccountData() {
  const sender = new PublicKey("11111111111111111111111111111111");
  const recipient = new PublicKey("Vote111111111111111111111111111111111111111");

  const senderKey = Buffer.alloc(32, 7);
  const recipientKey = Buffer.alloc(32, 9);
  const nonce = Buffer.alloc(24, 3);
  const ciphertext = Buffer.from("encrypted-payload", "utf8");

  const data = Buffer.alloc(
    8 + 32 + 32 + 32 + 32 + 8 + 8 + 24 + 4 + ciphertext.length + 1,
  );

  let offset = 0;
  ENCRYPTED_MESSAGE_DISCRIMINATOR.copy(data, offset);
  offset += 8;

  sender.toBuffer().copy(data, offset);
  offset += 32;

  recipient.toBuffer().copy(data, offset);
  offset += 32;

  senderKey.copy(data, offset);
  offset += 32;

  recipientKey.copy(data, offset);
  offset += 32;

  data.writeBigUInt64LE(BigInt(42), offset);
  offset += 8;

  data.writeBigInt64LE(BigInt(1750000000), offset);
  offset += 8;

  nonce.copy(data, offset);
  offset += 24;

  data.writeUInt32LE(ciphertext.length, offset);
  offset += 4;

  ciphertext.copy(data, offset);

  return data;
}

describe("parseEncryptedMessageAccount", () => {
  it("parses valid encrypted account data", () => {
    const parsed = parseEncryptedMessageAccount(
      "11111111111111111111111111111111",
      makeAccountData(),
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.messageId).toBe("42");
    expect(parsed?.ciphertext).toBe("encrypted-payload");
    expect(parsed?.nonce).toEqual(Array(24).fill(3));
    expect(parsed?.senderPublicKey).toBe(
      Buffer.alloc(32, 7).toString("base64url"),
    );
    expect(parsed?.recipientPublicKey).toBe(
      Buffer.alloc(32, 9).toString("base64url"),
    );
  });

  it("rejects a wrong discriminator", () => {
    const data = makeAccountData();
    data[0] ^= 1;

    expect(
      parseEncryptedMessageAccount(
        "11111111111111111111111111111111",
        data,
      ),
    ).toBeNull();
  });

  it("rejects truncated account data", () => {
    const data = makeAccountData().subarray(0, 20);

    expect(
      parseEncryptedMessageAccount(
        "11111111111111111111111111111111",
        data,
      ),
    ).toBeNull();
  });
});
