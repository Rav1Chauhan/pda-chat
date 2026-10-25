
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

  // Original sender and a different wallet.
  const originalSender = Keypair.fromSecretKey(secretKey);
  const otherWallet = Keypair.generate();

  // Create a new message ID so this test doesn't target an old message.
  const messageId = 3n;
  const messageIdBuffer = Buffer.alloc(8);
  messageIdBuffer.writeBigUInt64LE(messageId);

  const [messagePda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("message"),
      originalSender.publicKey.toBuffer(),
      messageIdBuffer,
    ],
    programId
  );

  console.log("Original sender:", originalSender.publicKey.toBase58());
  console.log("Unauthorized wallet:", otherWallet.publicKey.toBase58());
  console.log("Test message ID:", messageId.toString());
  console.log("Message PDA:", messagePda.toBase58());

  // Confirm the target account exists before attempting deletion.
  const accountBefore = await connection.getAccountInfo(
    messagePda,
    "confirmed"
  );

  if (!accountBefore) {
    throw new Error(
      "Test message ID 3 does not exist. Stop: create a test message first."
    );
  }

  if (!accountBefore.owner.equals(programId)) {
    throw new Error("Target account is not owned by the chat program.");
  }

  // The original sender pays the transaction fee.
  // The unauthorized wallet still signs the deletion instruction.

  // Anchor discriminator for delete_message.
  const deleteDiscriminator = Buffer.from([
    198, 99, 22, 204, 200, 165, 54, 138,
  ]);

  const instruction = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: messagePda, isSigner: false, isWritable: true },
      { pubkey: otherWallet.publicKey, isSigner: true, isWritable: true },
    ],
    data: deleteDiscriminator,
  });

  const transaction = new Transaction().add(instruction);
  transaction.feePayer = originalSender.publicKey;

  console.log("Attempting deletion with the wrong wallet...");
  console.log("Fee payer:", originalSender.publicKey.toBase58());

  let transactionRejected = false;

  try {
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [originalSender, otherWallet],
      { commitment: "confirmed" }
    );

    console.log("Unexpected transaction success:", signature);
  } catch (error) {
    transactionRejected = true;
    console.log("Deletion transaction rejected as expected:", error.message);
  }

  if (!transactionRejected) {
    throw new Error("SECURITY FAILURE: unauthorized deletion succeeded.");
  }

  const accountAfter = await connection.getAccountInfo(
    messagePda,
    "confirmed"
  );

  if (!accountAfter) {
    throw new Error("SECURITY FAILURE: message account no longer exists.");
  }

  console.log("Message account still exists:", true);
  console.log("SUCCESS: unauthorized deletion did not close the account.");
}

main().catch((error) => {
  console.error("Test failed:", error.message);
  process.exitCode = 1;
});
