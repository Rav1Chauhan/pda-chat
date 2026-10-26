use anchor_lang::{AccountDeserialize, Id, InstructionData, ToAccountMetas};
use anchor_lang::prelude::Pubkey;
use litesvm::LiteSVM;
use solana_keypair::{Keypair, Signer};
use solana_transaction::Transaction;

use pda_chat::{accounts, instruction, EncryptionKey, ID};

fn setup() -> (LiteSVM, String) {
    let mut svm = LiteSVM::new();
    let program_path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../target/deploy/pda_chat.so"
    )
    .to_string();

    svm.add_program_from_file(ID, &program_path)
        .expect("Failed to load pda_chat program");

    (svm, program_path)
}

fn key_pda(owner: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[b"encryption_key", owner.as_ref()],
        &ID,
    ).0
}

#[test]
fn test_register_encryption_key_stores_public_key() {
    let (mut svm, _) = setup();
    let owner = Keypair::new();
    svm.airdrop(&owner.pubkey(), 2_000_000_000).unwrap();

    let public_key = [7u8; 32];
    let pda = key_pda(&owner.pubkey());

    let ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: ID,
        accounts: accounts::RegisterEncryptionKey {
            encryption_key: pda,
            owner: owner.pubkey(),
            system_program: anchor_lang::prelude::System::id(),
        }
        .to_account_metas(None),
        data: instruction::RegisterEncryptionKey {
            encryption_public_key: public_key,
        }
        .data(),
    };

    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&owner.pubkey()),
        &[&owner],
        svm.latest_blockhash(),
    );

    svm.send_transaction(tx).expect("Registration should succeed");

    let account = svm.get_account(&pda).expect("Registry PDA missing");
    let mut data: &[u8] = &account.data;
    let stored = EncryptionKey::try_deserialize(&mut data).unwrap();

    assert_eq!(stored.owner, owner.pubkey());
    assert_eq!(stored.encryption_public_key, public_key);
}

#[test]
fn test_duplicate_registration_is_rejected() {
    let (mut svm, _) = setup();
    let owner = Keypair::new();
    svm.airdrop(&owner.pubkey(), 2_000_000_000).unwrap();

    let pda = key_pda(&owner.pubkey());

    let ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: ID,
        accounts: accounts::RegisterEncryptionKey {
            encryption_key: pda,
            owner: owner.pubkey(),
            system_program: anchor_lang::prelude::System::id(),
        }
        .to_account_metas(None),
        data: instruction::RegisterEncryptionKey {
            encryption_public_key: [1u8; 32],
        }
        .data(),
    };

    let tx1 = Transaction::new_signed_with_payer(
        std::slice::from_ref(&ix),
        Some(&owner.pubkey()),
        &[&owner],
        svm.latest_blockhash(),
    );
    svm.send_transaction(tx1).expect("First registration should succeed");

    let tx2 = Transaction::new_signed_with_payer(
        &[ix],
        Some(&owner.pubkey()),
        &[&owner],
        svm.latest_blockhash(),
    );

    assert!(
        svm.send_transaction(tx2).is_err(),
        "Duplicate registration must fail"
    );
}

#[test]
fn test_owner_can_update_encryption_key() {
    let (mut svm, _) = setup();
    let owner = Keypair::new();
    svm.airdrop(&owner.pubkey(), 2_000_000_000).unwrap();

    let pda = key_pda(&owner.pubkey());

    let register_ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: ID,
        accounts: accounts::RegisterEncryptionKey {
            encryption_key: pda,
            owner: owner.pubkey(),
            system_program: anchor_lang::prelude::System::id(),
        }
        .to_account_metas(None),
        data: instruction::RegisterEncryptionKey {
            encryption_public_key: [1u8; 32],
        }
        .data(),
    };

    let tx = Transaction::new_signed_with_payer(
        &[register_ix],
        Some(&owner.pubkey()),
        &[&owner],
        svm.latest_blockhash(),
    );
    svm.send_transaction(tx).expect("Registration should succeed");

    let update_ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: ID,
        accounts: accounts::UpdateEncryptionKey {
            encryption_key: pda,
            owner: owner.pubkey(),
        }
        .to_account_metas(None),
        data: instruction::UpdateEncryptionKey {
            encryption_public_key: [9u8; 32],
        }
        .data(),
    };

    let tx = Transaction::new_signed_with_payer(
        &[update_ix],
        Some(&owner.pubkey()),
        &[&owner],
        svm.latest_blockhash(),
    );
    svm.send_transaction(tx).expect("Owner update should succeed");

    let account = svm.get_account(&pda).unwrap();
    let mut data: &[u8] = &account.data;
    let stored = EncryptionKey::try_deserialize(&mut data).unwrap();

    assert_eq!(stored.encryption_public_key, [9u8; 32]);
}

#[test]
fn test_other_wallet_cannot_update_encryption_key() {
    let (mut svm, _) = setup();
    let owner = Keypair::new();
    let attacker = Keypair::new();

    svm.airdrop(&owner.pubkey(), 2_000_000_000).unwrap();
    svm.airdrop(&attacker.pubkey(), 2_000_000_000).unwrap();

    let pda = key_pda(&owner.pubkey());

    let register_ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: ID,
        accounts: accounts::RegisterEncryptionKey {
            encryption_key: pda,
            owner: owner.pubkey(),
            system_program: anchor_lang::prelude::System::id(),
        }
        .to_account_metas(None),
        data: instruction::RegisterEncryptionKey {
            encryption_public_key: [2u8; 32],
        }
        .data(),
    };

    let tx = Transaction::new_signed_with_payer(
        &[register_ix],
        Some(&owner.pubkey()),
        &[&owner],
        svm.latest_blockhash(),
    );
    svm.send_transaction(tx).expect("Registration should succeed");

    // The attacker supplies their own public key as owner, so the PDA seeds
    // must match that attacker address. The owner's PDA cannot be substituted.
    let malicious_ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: ID,
        accounts: accounts::UpdateEncryptionKey {
            encryption_key: pda,
            owner: attacker.pubkey(),
        }
        .to_account_metas(None),
        data: instruction::UpdateEncryptionKey {
            encryption_public_key: [8u8; 32],
        }
        .data(),
    };

    let tx = Transaction::new_signed_with_payer(
        &[malicious_ix],
        Some(&attacker.pubkey()),
        &[&attacker],
        svm.latest_blockhash(),
    );

    assert!(
        svm.send_transaction(tx).is_err(),
        "Another wallet must not update the owner's registry PDA"
    );

    let account = svm.get_account(&pda).unwrap();
    let mut data: &[u8] = &account.data;
    let stored = EncryptionKey::try_deserialize(&mut data).unwrap();
    assert_eq!(stored.encryption_public_key, [2u8; 32]);
}
