
require("dotenv").config();

const fs = require("fs");
const os = require("os");

const {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} = require("@solana/web3.js");

async function main() {
  const connection = new Connection(
    process.env.SOLANA_RPC_URL,
    "confirmed"
  );

  const programId = new PublicKey(process.env.PROGRAM_ID);

  const walletPath = `${os.homedir()}/.config/solana/id.json`;
  const secretKey = Uint8Array.from(
    JSON.parse(fs.readFileSync(walletPath, "utf8"))
  );
  const sender = Keypair.fromSecretKey(secretKey);

  // Target only the test message with ID 2.
  const messageId = 2n;
  const messageIdBuffer = Buffer.alloc(8);
  messageIdBuffer.writeBigUInt64LE(messageId);

  const [messagePda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("message"),
      sender.publicKey.toBuffer(),
      messageIdBuffer,
    ],
    programId
  );

  console.log("Sender:", sender.publicKey.toBase58());
  console.log("Message ID:", messageId.toString());
  console.log("Message PDA:", messagePda.toBase58());

  const accountBefore = await connection.getAccountInfo(
    messagePda,
    "confirmed"
  );

  if (!accountBefore) {
    throw new Error(
      "Message account does not exist. No transaction sent."
    );
  }

  if (!accountBefore.owner.equals(programId)) {
    throw new Error("Target account is not owned by the chat program.");
  }

  const senderBefore = await connection.getBalance(
    sender.publicKey,
    "confirmed"
  );

  console.log(
    "Account lamports to recover:",
    accountBefore.lamports
  );
  console.log(
    "Sender balance before:",
    senderBefore,
    "lamports"
  );

  // Anchor discriminator for delete_message.
  const discriminator = Buffer.from([
    // First 8 bytes of SHA256("global:delete_message")
    203, 18, 220, 想, 0, 0, 0, 0,
  ]);

  const instruction = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: messagePda, isSigner: false, isWritable: true },
      { pubkey: sender.publicKey, isSigner: true, isWritable: true },
    ],
    data: discriminator,
  });

  const transaction = new Transaction().add(instruction);

  console.log("Submitting delete transaction...");

  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [sender],
    { commitment: "confirmed" }
  );

  console.log("Delete transaction confirmed!");
  console.log("Signature:", signature);
  console.log(
    `Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`
  );

  const accountAfter = await connection.getAccountInfo(
    messagePda,
    "confirmed"
  );

  const senderAfter = await connection.getBalance(
    sender.publicKey,
    "confirmed"
  );

  console.log("Message account exists after delete:", !!accountAfter);
  console.log("Sender balance after:", senderAfter, "lamports");
  console.log(
    "Net balance change:",
    senderAfter - senderBefore,
    "lamports (includes transaction fee)"
  );

  if (accountAfter) {
    throw new Error("Expected the message account to be closed.");
  }

  console.log("SUCCESS: Message account closed; rent lamports refunded.");
}

main().catch((error) => {
  console.error("Deletion failed:", error.message);
  process.exitCode = 1;
});
