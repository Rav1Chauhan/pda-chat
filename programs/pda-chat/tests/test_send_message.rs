use anchor_lang::{AccountDeserialize, Id, InstructionData, ToAccountMetas};
use litesvm::LiteSVM;
use solana_keypair::{Keypair, Signer};
use solana_transaction::Transaction;

use pda_chat::{accounts, instruction, Message, ID};

#[test]
fn test_send_message_creates_pda() {
    let mut svm = LiteSVM::new();

    // Load the compiled Solana program.
    svm.add_program_from_file(
        ID,
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../target/deploy/pda_chat.so"
        ),
    )
    .expect("Failed to load pda_chat program");

    // Create and fund the sender.
    let sender = Keypair::new();
    svm.airdrop(&sender.pubkey(), 2_000_000_000)
        .expect("Airdrop failed");

    let message_id: u64 = 1;
    let content = "Hello from LiteSVM!".to_string();

    // Derive the Message PDA.
    let message_id_bytes = message_id.to_le_bytes();
    let (message_pda, _bump) = anchor_lang::prelude::Pubkey::find_program_address(
        &[b"message", sender.pubkey().as_ref(), &message_id_bytes],
        &ID,
    );

    // Build the Anchor instruction.
    let ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: ID,
        accounts: accounts::SendMessage {
            message: message_pda,
            sender: sender.pubkey(),
            system_program: anchor_lang::prelude::System::id(),
        }
        .to_account_metas(None),
        data: instruction::SendMessage {
            message_id,
            content: content.clone(),
        }
        .data(),
    };

    // Sign and submit the transaction.
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&sender.pubkey()),
        &[&sender],
        svm.latest_blockhash(),
    );

    svm.send_transaction(tx)
        .expect("send_message transaction failed");

    // Verify the PDA account exists.
    let account = svm
        .get_account(&message_pda)
        .expect("Message PDA was not created");

    // Deserialize and verify stored data.
    let mut data: &[u8] = &account.data;
    let message =
        Message::try_deserialize(&mut data).expect("Failed to deserialize Message account");

    assert_eq!(message.sender, sender.pubkey());
    assert_eq!(message.message_id, message_id);
    assert_eq!(message.content, content);

    println!("Read message: {}", message.content);

    println!("✅ Message PDA created and verified successfully!");
}

#[test]
fn test_duplicate_message_id_is_rejected() {
    let mut svm = LiteSVM::new();

    let program_path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../target/deploy/pda_chat.so"
    );

    svm.add_program_from_file(ID, program_path)
        .expect("Failed to load pda_chat program");

    let sender = Keypair::new();
    svm.airdrop(&sender.pubkey(), 2_000_000_000)
        .expect("Airdrop failed");

    let message_id: u64 = 1;
    let content = "Hello!".to_string();
    let message_id_bytes = message_id.to_le_bytes();

    let (message_pda, _) = anchor_lang::prelude::Pubkey::find_program_address(
        &[b"message", sender.pubkey().as_ref(), &message_id_bytes],
        &ID,
    );

    let ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: ID,
        accounts: accounts::SendMessage {
            message: message_pda,
            sender: sender.pubkey(),
            system_program: anchor_lang::prelude::System::id(),
        }
        .to_account_metas(None),
        data: instruction::SendMessage {
            message_id,
            content,
        }
        .data(),
    };

    let tx1 = Transaction::new_signed_with_payer(
        std::slice::from_ref(&ix),
        Some(&sender.pubkey()),
        &[&sender],
        svm.latest_blockhash(),
    );

    svm.send_transaction(tx1)
        .expect("First message should succeed");

    let tx2 = Transaction::new_signed_with_payer(
        &[ix],
        Some(&sender.pubkey()),
        &[&sender],
        svm.latest_blockhash(),
    );

    assert!(
        svm.send_transaction(tx2).is_err(),
        "Duplicate message ID should be rejected"
    );

    println!("Duplicate message ID correctly rejected!");
}

#[test]
fn test_same_sender_can_create_multiple_messages() {
    let mut svm = LiteSVM::new();

    let program_path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../target/deploy/pda_chat.so"
    );

    svm.add_program_from_file(ID, program_path)
        .expect("Failed to load pda_chat program");

    let sender = Keypair::new();
    svm.airdrop(&sender.pubkey(), 2_000_000_000)
        .expect("Airdrop failed");

    let content = "Hello!".to_string();
    let mut message_pdas = Vec::new();

    for message_id in [1_u64, 2_u64] {
        let message_id_bytes = message_id.to_le_bytes();

        let (message_pda, _) =
            anchor_lang::prelude::Pubkey::find_program_address(
                &[
                    b"message",
                    sender.pubkey().as_ref(),
                    &message_id_bytes,
                ],
                &ID,
            );

        let ix = anchor_lang::solana_program::instruction::Instruction {
            program_id: ID,
            accounts: accounts::SendMessage {
                message: message_pda,
                sender: sender.pubkey(),
                system_program: anchor_lang::prelude::System::id(),
            }
            .to_account_metas(None),
            data: instruction::SendMessage {
                message_id,
                content: content.clone(),
            }
            .data(),
        };

        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&sender.pubkey()),
            &[&sender],
            svm.latest_blockhash(),
        );

        svm.send_transaction(tx)
            .expect("Creating a distinct message should succeed");

        let account = svm
            .get_account(&message_pda)
            .expect("Message PDA was not created");

        let mut data: &[u8] = &account.data;
        let message = Message::try_deserialize(&mut data)
            .expect("Failed to deserialize Message");

        assert_eq!(message.sender, sender.pubkey());
        assert_eq!(message.message_id, message_id);
        assert_eq!(message.content, content);

        message_pdas.push(message_pda);
    }

    assert_ne!(message_pdas[0], message_pdas[1]);

    println!("Two messages created and verified at distinct PDAs!");
}

#[test]
fn test_sender_can_delete_message_and_recover_lamports() {
    let mut svm = LiteSVM::new();

    let program_path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../target/deploy/pda_chat.so"
    );

    svm.add_program_from_file(ID, program_path)
        .expect("Failed to load pda_chat program");

    let sender = Keypair::new();
    svm.airdrop(&sender.pubkey(), 2_000_000_000)
        .expect("Airdrop failed");

    let message_id: u64 = 10;
    let message_id_bytes = message_id.to_le_bytes();

    let (message_pda, _) = anchor_lang::prelude::Pubkey::find_program_address(
        &[b"message", sender.pubkey().as_ref(), &message_id_bytes],
        &ID,
    );

    let create_ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: ID,
        accounts: accounts::SendMessage {
            message: message_pda,
            sender: sender.pubkey(),
            system_program: anchor_lang::prelude::System::id(),
        }
        .to_account_metas(None),
        data: instruction::SendMessage {
            message_id,
            content: "Delete my own message".to_string(),
        }
        .data(),
    };

    let create_tx = Transaction::new_signed_with_payer(
        &[create_ix],
        Some(&sender.pubkey()),
        &[&sender],
        svm.latest_blockhash(),
    );

    svm.send_transaction(create_tx)
        .expect("Message creation should succeed");

    let account_before = svm
        .get_account(&message_pda)
        .expect("Message account should exist");

    let sender_balance_before_delete = svm
        .get_account(&sender.pubkey())
        .expect("Sender account should exist")
        .lamports;

    let delete_ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: ID,
        accounts: accounts::DeleteMessage {
            message: message_pda,
            sender: sender.pubkey(),
        }
        .to_account_metas(None),
        data: instruction::DeleteMessage {}.data(),
    };

    let delete_tx = Transaction::new_signed_with_payer(
        &[delete_ix],
        Some(&sender.pubkey()),
        &[&sender],
        svm.latest_blockhash(),
    );

    svm.send_transaction(delete_tx)
        .expect("Original sender should be able to delete the message");

    assert!(
        svm.get_account(&message_pda).is_none(),
        "Message account should be closed"
    );

    let sender_balance_after_delete = svm
        .get_account(&sender.pubkey())
        .expect("Sender account should still exist")
        .lamports;

    assert!(
        sender_balance_after_delete > sender_balance_before_delete,
        "Sender should recover the account lamports after transaction fee"
    );

    assert!(account_before.lamports > 0);

    println!("Sender deleted the message and recovered its account lamports!");
}

#[test]
fn test_another_wallet_cannot_delete_message() {
    let mut svm = LiteSVM::new();

    let program_path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../target/deploy/pda_chat.so"
    );

    svm.add_program_from_file(ID, program_path)
        .expect("Failed to load pda_chat program");

    let sender = Keypair::new();
    let other_wallet = Keypair::new();

    svm.airdrop(&sender.pubkey(), 2_000_000_000)
        .expect("Sender airdrop failed");
    svm.airdrop(&other_wallet.pubkey(), 2_000_000_000)
        .expect("Other wallet airdrop failed");

    let message_id: u64 = 11;
    let message_id_bytes = message_id.to_le_bytes();

    let (message_pda, _) = anchor_lang::prelude::Pubkey::find_program_address(
        &[b"message", sender.pubkey().as_ref(), &message_id_bytes],
        &ID,
    );

    let create_ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: ID,
        accounts: accounts::SendMessage {
            message: message_pda,
            sender: sender.pubkey(),
            system_program: anchor_lang::prelude::System::id(),
        }
        .to_account_metas(None),
        data: instruction::SendMessage {
            message_id,
            content: "Only my sender can delete this".to_string(),
        }
        .data(),
    };

    let create_tx = Transaction::new_signed_with_payer(
        &[create_ix],
        Some(&sender.pubkey()),
        &[&sender],
        svm.latest_blockhash(),
    );

    svm.send_transaction(create_tx)
        .expect("Message creation should succeed");

    let delete_ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: ID,
        accounts: accounts::DeleteMessage {
            message: message_pda,
            sender: other_wallet.pubkey(),
        }
        .to_account_metas(None),
        data: instruction::DeleteMessage {}.data(),
    };

    let delete_tx = Transaction::new_signed_with_payer(
        &[delete_ix],
        Some(&other_wallet.pubkey()),
        &[&other_wallet],
        svm.latest_blockhash(),
    );

    assert!(
        svm.send_transaction(delete_tx).is_err(),
        "Another wallet must not be able to delete the sender's message"
    );

    assert!(
        svm.get_account(&message_pda).is_some(),
        "Message account must remain after unauthorized deletion"
    );

    println!("Unauthorized deletion correctly rejected!");
}
