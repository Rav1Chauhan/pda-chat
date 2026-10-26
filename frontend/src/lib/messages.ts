import { AnchorProvider, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { getProgram, PROGRAM_ID } from "@/lib/anchor";

export function getMessagePda(sender: PublicKey, messageId: BN) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("message"),
      sender.toBuffer(),
      messageId.toArrayLike(Buffer, "le", 8),
    ],
    PROGRAM_ID
  )[0];
}

export async function sendMessage(
  provider: AnchorProvider,
  messageId: BN,
  content: string
) {
  const trimmedContent = content.trim();

  if (!trimmedContent) {
    throw new Error("Message cannot be empty.");
  }

  if (new TextEncoder().encode(trimmedContent).length > 280) {
    throw new Error("Message cannot exceed 280 bytes.");
  }

  const sender = provider.wallet.publicKey;
  const message = getMessagePda(sender, messageId);
  const program = getProgram(provider);

  const signature = await program.methods
    .sendMessage(messageId, trimmedContent)
    .accounts({
      message,
      sender,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return { signature, message: message.toBase58() };
}

export type ChatMessage = {
  address: string;
  sender: string;
  messageId: string;
  content: string;
  timestamp: number | null;
};

export async function fetchMessages(
  provider: AnchorProvider
): Promise<ChatMessage[]> {
  const connection = provider.connection;

  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    commitment: "confirmed",
  });

  const messages: ChatMessage[] = [];

  for (const item of accounts) {
    try {
      const data = item.account.data;
      const discriminator = Buffer.from([110, 151, 23, 110, 198, 6, 125, 181]);

      if (!data.subarray(0, 8).equals(discriminator)) continue;

      let offset = 8;

      const sender = new PublicKey(data.subarray(offset, offset + 32));
      offset += 32;

      const messageId = data.readBigUInt64LE(offset).toString();
      offset += 8;

      const contentLength = data.readUInt32LE(offset);
      offset += 4;

      if (contentLength > 280 || offset + contentLength > data.length) continue;

      const content = data.subarray(offset, offset + contentLength).toString("utf8");
      offset += contentLength;

      // Old accounts have a bump immediately after content.
      // New accounts have an i64 timestamp followed by the bump.
      const remaining = data.length - offset;
      let timestamp: number | null = null;

      if (remaining >= 9) {
        const candidate = Number(data.readBigInt64LE(offset));
        // Accept plausible Unix timestamps; otherwise treat this as an old layout.
        if (candidate > 1_600_000_000 && candidate < 4_102_444_800) {
          timestamp = candidate;
        }
      }

      messages.push({
        address: item.pubkey.toBase58(),
        sender: sender.toBase58(),
        messageId,
        content,
        timestamp,
      });
    } catch {
      // Skip accounts that do not match the expected Message layout.
    }
  }

  return messages.sort((a, b) => {
    const left = BigInt(a.messageId);
    const right = BigInt(b.messageId);
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

export async function deleteMessage(
  provider: AnchorProvider,
  messageAddress: string
) {
  const sender = provider.wallet.publicKey;
  const message = new PublicKey(messageAddress);
  const program = getProgram(provider);

  const signature = await program.methods
    .deleteMessage()
    .accounts({
      message,
      sender,
    })
    .rpc();

  return { signature };
}


export function getEncryptedMessagePda(sender: PublicKey, messageId: BN) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("encrypted_message"),
      sender.toBuffer(),
      messageId.toArrayLike(Buffer, "le", 8),
    ],
    PROGRAM_ID
  )[0];
}

export async function sendEncryptedMessage(
  provider: AnchorProvider,
  messageId: BN,
  recipient: PublicKey,
  senderEncryptionPublicKey: Uint8Array,
  recipientEncryptionPublicKey: Uint8Array,
  nonce: Uint8Array,
  ciphertext: string
) {
  if (senderEncryptionPublicKey.length !== 32) {
    throw new Error("Sender encryption public key must be 32 bytes.");
  }
  if (recipientEncryptionPublicKey.length !== 32) {
    throw new Error("Recipient encryption public key must be 32 bytes.");
  }
  if (nonce.length !== 24) {
    throw new Error("Encryption nonce must be 24 bytes.");
  }
  if (!ciphertext || new TextEncoder().encode(ciphertext).length > 512) {
    throw new Error("Ciphertext must be non-empty and at most 512 bytes.");
  }

  const sender = provider.wallet.publicKey;
  const encryptedMessage = getEncryptedMessagePda(sender, messageId);
  const program = getProgram(provider);

  const signature = await program.methods
    .sendEncryptedMessage(
      messageId,
      Array.from(senderEncryptionPublicKey),
      Array.from(recipientEncryptionPublicKey),
      Array.from(nonce),
      ciphertext
    )
    .accounts({
      encryptedMessage,
      sender,
      recipient,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return {
    signature,
    message: encryptedMessage.toBase58(),
  };
}

export const ENCRYPTED_MESSAGE_DISCRIMINATOR = Buffer.from([
  42, 71, 3, 45, 202, 204, 49, 61,
]);

export function encodeEncryptionPublicKey(bytes: Uint8Array): string {
  if (bytes.length !== 32) {
    throw new Error("Encryption public key must be 32 bytes.");
  }

  // URL-safe Base64 without padding, matching libsodium's format.
  return Buffer.from(bytes).toString("base64url");
}

export type EncryptedChatMessage = {
  address: string;
  sender: string;
  recipient: string;
  messageId: string;
  senderPublicKey: string;
  recipientPublicKey: string;
  nonce: number[];
  ciphertext: string;
  timestamp: number;
};

export function parseEncryptedMessageAccount(
  address: string,
  data: Buffer
): EncryptedChatMessage | null {
  try {
    if (
      data.length < 8 ||
      !data.subarray(0, 8).equals(ENCRYPTED_MESSAGE_DISCRIMINATOR)
    ) {
      return null;
    }

    let offset = 8;

    const sender = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    const recipient = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    const senderPublicKey = data.subarray(offset, offset + 32);
    offset += 32;

    const recipientPublicKey = data.subarray(offset, offset + 32);
    offset += 32;

    const messageId = data.readBigUInt64LE(offset).toString();
    offset += 8;

    const timestamp = Number(data.readBigInt64LE(offset));
    offset += 8;

    const nonce = Array.from(data.subarray(offset, offset + 24));
    if (nonce.length !== 24) return null;
    offset += 24;

    if (offset + 4 > data.length) return null;

    const ciphertextLength = data.readUInt32LE(offset);
    offset += 4;

    if (
      ciphertextLength === 0 ||
      ciphertextLength > 512 ||
      offset + ciphertextLength > data.length
    ) {
      return null;
    }

    const ciphertext = data
      .subarray(offset, offset + ciphertextLength)
      .toString("utf8");

    return {
      address,
      sender: sender.toBase58(),
      recipient: recipient.toBase58(),
      messageId,
      senderPublicKey: encodeEncryptionPublicKey(senderPublicKey),
      recipientPublicKey: encodeEncryptionPublicKey(recipientPublicKey),
      nonce,
      ciphertext,
      timestamp,
    };
  } catch {
    return null;
  }
}

export async function fetchEncryptedMessages(
  provider: AnchorProvider
): Promise<EncryptedChatMessage[]> {
  const accounts = await provider.connection.getProgramAccounts(PROGRAM_ID, {
    commitment: "confirmed",
    filters: [
      {
        memcmp: {
          offset: 0,
          bytes: "859LHWdBX3a",
        },
      },
    ],
  });

  const messages: EncryptedChatMessage[] = [];

  for (const item of accounts) {
    const message = parseEncryptedMessageAccount(
      item.pubkey.toBase58(),
      item.account.data
    );

    if (message) messages.push(message);
  }

  return messages.sort((a, b) => a.timestamp - b.timestamp);
}
