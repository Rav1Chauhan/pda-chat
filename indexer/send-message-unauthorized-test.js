require("dotenv").config();

const fs = require("fs");
const os = require("os");
const {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
} = require("@solana/web3.js");

async function main() {
  const connection = new Connection(
    process.env.SOLANA_RPC_URL,
    "confirmed"
  );

  const programId = new PublicKey(process.env.PROGRAM_ID);

  // Read the existing Solana CLI keypair locally.
  const walletPath = `${os.homedir()}/.config/solana/id.json`;
  const secretKey = Uint8Array.from(
    JSON.parse(fs.readFileSync(walletPath, "utf8"))
  );
  const sender = Keypair.fromSecretKey(secretKey);

  // Use a public, non-sensitive test message.
  const messageId = 3n;
  const content = "PDA Chat unauthorized deletion test";

  // Encode message_id as little-endian u64.
  const messageIdBuffer = Buffer.alloc(8);
  messageIdBuffer.writeBigUInt64LE(messageId);

  // Anchor instruction discriminator for send_message.
  const discriminator = Buffer.from([
    57, 40, 34, 178, 189, 10, 65, 26,
  ]);

  // Borsh string = 4-byte length + UTF-8 bytes.
  const contentBuffer = Buffer.from(content, "utf8");
  const contentLength = Buffer.alloc(4);
  contentLength.writeUInt32LE(contentBuffer.length);

  const instructionData = Buffer.concat([
    discriminator,
    messageIdBuffer,
    contentLength,
    contentBuffer,
  ]);

  const [messagePda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("message"),
      sender.publicKey.toBuffer(),
      messageIdBuffer,
    ],
    programId
  );

  const instruction = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: messagePda, isSigner: false, isWritable: true },
      { pubkey: sender.publicKey, isSigner: true, isWritable: true },
      {
        pubkey: SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
    ],
    data: instructionData,
  });

  const transaction = new Transaction().add(instruction);
  transaction.feePayer = sender.publicKey;
  transaction.recentBlockhash = (
    await connection.getLatestBlockhash("confirmed")
  ).blockhash;

  console.log("Sender:", sender.publicKey.toBase58());
  console.log("Message PDA:", messagePda.toBase58());
  console.log("Submitting public test message to Devnet...");

  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [sender],
    { commitment: "confirmed" }
  );

  console.log("Transaction confirmed!");
  console.log("Signature:", signature);
  console.log(
    `Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`
  );
}

main().catch((error) => {
  console.error("Transaction failed:", error.message);
  process.exitCode = 1;
});
