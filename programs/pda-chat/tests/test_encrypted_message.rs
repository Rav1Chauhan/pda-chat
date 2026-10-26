use anchor_lang::AccountDeserialize;
use anchor_lang::{Id, InstructionData, ToAccountMetas};
use litesvm::LiteSVM;
use pda_chat::{accounts, instruction, ID};
use pda_chat::encrypted_message::EncryptedMessage;
use solana_keypair::{Keypair, Signer};
use solana_transaction::Transaction;
use anchor_lang::prelude::Pubkey;

fn setup() -> (LiteSVM, Keypair) {
    let mut svm = LiteSVM::new();

    svm.add_program_from_file(
        ID,
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../target/deploy/pda_chat.so"
        ),
    )
    .expect("Failed to load pda_chat program");

    let sender = Keypair::new();
    svm.airdrop(&sender.pubkey(), 2_000_000_000)
        .expect("Airdrop failed");

    (svm, sender)
}

fn encrypted_instruction(
    sender: &Keypair,
    recipient: Pubkey,
    message_id: u64,
    ciphertext: String,
) -> (Pubkey, anchor_lang::solana_program::instruction::Instruction) {
    let id_bytes = message_id.to_le_bytes();

    let (encrypted_message, _) = Pubkey::find_program_address(
        &[b"encrypted_message", sender.pubkey().as_ref(), &id_bytes],
        &ID,
    );

    let ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: ID,
        accounts: accounts::SendEncryptedMessage {
            encrypted_message,
            sender: sender.pubkey(),
            recipient,
            system_program: anchor_lang::prelude::System::id(),
        }
        .to_account_metas(None),
        data: instruction::SendEncryptedMessage {
            message_id,
            sender_encryption_key: [7; 32],
            recipient_encryption_key: [9; 32],
            nonce: [3; 24],
            ciphertext,
        }
        .data(),
    };

    (encrypted_message, ix)
}

fn submit(
    svm: &mut LiteSVM,
    sender: &Keypair,
    ix: anchor_lang::solana_program::instruction::Instruction,
) -> litesvm::types::TransactionResult {
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&sender.pubkey()),
        &[sender],
        svm.latest_blockhash(),
    );
    svm.send_transaction(tx)
}

#[test]
fn test_encrypted_message_stores_fields() {
    let (mut svm, sender) = setup();
    let recipient = Keypair::new().pubkey();
    let ciphertext = "encrypted-payload".to_string();

    let (pda, ix) =
        encrypted_instruction(&sender, recipient, 42, ciphertext.clone());

    submit(&mut svm, &sender, ix).expect("Encrypted message should succeed");

    let account = svm.get_account(&pda).expect("Encrypted account should exist");
    let mut data: &[u8] = &account.data;
    let message = EncryptedMessage::try_deserialize(&mut data)
        .expect("Encrypted account should deserialize");

    assert_eq!(message.sender, sender.pubkey());
    assert_eq!(message.recipient, recipient);
    assert_eq!(message.sender_encryption_key, [7; 32]);
    assert_eq!(message.recipient_encryption_key, [9; 32]);
    assert_eq!(message.message_id, 42);
    assert_eq!(message.nonce, [3; 24]);
    assert_eq!(message.ciphertext, ciphertext);
}

#[test]
fn test_duplicate_encrypted_message_id_is_rejected() {
    let (mut svm, sender) = setup();
    let recipient = Keypair::new().pubkey();

    let (_, first_ix) =
        encrypted_instruction(&sender, recipient, 7, "ciphertext-one".into());
    submit(&mut svm, &sender, first_ix).expect("First message should succeed");

    let (_, second_ix) =
        encrypted_instruction(&sender, recipient, 7, "ciphertext-two".into());
    assert!(
        submit(&mut svm, &sender, second_ix).is_err(),
        "Duplicate encrypted message ID should be rejected"
    );
}

#[test]
fn test_empty_ciphertext_is_rejected() {
    let (mut svm, sender) = setup();
    let recipient = Keypair::new().pubkey();

    let (_, ix) = encrypted_instruction(&sender, recipient, 8, String::new());

    assert!(
        submit(&mut svm, &sender, ix).is_err(),
        "Empty ciphertext should be rejected"
    );
}

#[test]
fn test_oversized_ciphertext_is_rejected() {
    let (mut svm, sender) = setup();
    let recipient = Keypair::new().pubkey();

    let (_, ix) =
        encrypted_instruction(&sender, recipient, 9, "x".repeat(513));

    assert!(
        submit(&mut svm, &sender, ix).is_err(),
        "Ciphertext over 512 bytes should be rejected"
    );
}
