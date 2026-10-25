# PDA Chat — Solana On-Chain Messaging

A Solana messaging prototype built with Rust, Anchor, and Program Derived Addresses (PDAs).

## Features
- Create on-chain messages using unique PDAs.
- Store sender, message ID, content, and PDA bump.
- Validate message content up to 280 UTF-8 bytes.
- Prevent duplicate PDA initialization.
- Allow the original sender to delete their message.
- Refund account lamports when a message is closed.
- Listen to program account changes using @solana/web3.js.
- Test authorized and unauthorized deletion scenarios.

## Tech Stack
- Rust and Solana
- Anchor Framework
- JavaScript and Node.js
- @solana/web3.js
- LiteSVM

## PDA Derivation
Each message PDA uses the seeds: the string message, the sender public key, and the message ID encoded as a little-endian u64.

## Instructions
### send_message(message_id, content)
Creates a message account and stores its sender, ID, content, and PDA bump.

### delete_message()
Closes the message account and refunds its lamports to the original sender. Anchor validates PDA seeds and sender constraints.

## Devnet Deployment
Program ID: HGVJnqBu9BEaer3dfT2X3h4h3fG3VhoTMWzBamTUUTdS

[View program on Solana Explorer](https://explorer.solana.com/address/HGVJnqBu9BEaer3dfT2X3h4h3fG3VhoTMWzBamTUUTdS?cluster=devnet)

## Run Tests
From the project root:

```bash
cargo test -p pda-chat --test test_send_message -- --nocapture
```

The current LiteSVM tests cover message creation, duplicate IDs, multiple messages per sender, deletion with rent refund, and rejection of deletion by another wallet.

## Indexer Setup
```bash
cd indexer
npm install
```

Create indexer/.env locally with SOLANA_RPC_URL=https://api.devnet.solana.com and the program ID shown above.

Run the listener with:
```bash
node indexer.js
```

## Security Verification
A Devnet test attempted to delete a message using another wallet. Anchor rejected the transaction with ConstraintSeeds (error 2006), and the original message account remained present. This verifies the tested scenario; it is not a complete security audit.

## Important Notes
- On-chain message content is public. Do not store secrets or private messages.
- Message IDs must be unique per sender while their PDA exists.
- The 280-byte limit measures UTF-8 bytes, not characters.
- The listener tracks account changes; it is not a complete historical indexer.
- Closing an account does not erase its transaction history.

## Future Improvements
- Frontend chat interface
- Historical message indexing and pagination
- Additional security tests and CI automation

## License
No license has been added yet.
