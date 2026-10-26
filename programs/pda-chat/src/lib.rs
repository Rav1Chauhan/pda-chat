use anchor_lang::prelude::*;
pub mod encrypted_message;
use encrypted_message::{EncryptedMessage, MAX_CIPHERTEXT_LEN};

declare_id!("HGVJnqBu9BEaer3dfT2X3h4h3fG3VhoTMWzBamTUUTdS");

#[program]
pub mod pda_chat {
    use super::*;

    pub fn send_message(ctx: Context<SendMessage>, message_id: u64, content: String) -> Result<()> {
        require!(content.len() <= 280, ChatError::MessageTooLong);

        let message = &mut ctx.accounts.message;
        message.sender = ctx.accounts.sender.key();
        message.message_id = message_id;
        message.content = content;
        message.timestamp = Clock::get()?.unix_timestamp;
        message.bump = ctx.bumps.message;

        msg!("Message PDA created successfully!");
        Ok(())
    }

    pub fn delete_message(_ctx: Context<DeleteMessage>) -> Result<()> {
        msg!("Message deleted; account lamports refunded to sender.");
        Ok(())
    }

    pub fn register_encryption_key(
        ctx: Context<RegisterEncryptionKey>,
        encryption_public_key: [u8; 32],
    ) -> Result<()> {
        let key_account = &mut ctx.accounts.encryption_key;
        key_account.owner = ctx.accounts.owner.key();
        key_account.encryption_public_key = encryption_public_key;
        key_account.bump = ctx.bumps.encryption_key;

        msg!("Encryption public key registered.");
        Ok(())
    }

    pub fn update_encryption_key(
        ctx: Context<UpdateEncryptionKey>,
        encryption_public_key: [u8; 32],
    ) -> Result<()> {
        ctx.accounts.encryption_key.encryption_public_key = encryption_public_key;

        msg!("Encryption public key updated.");
        Ok(())
    }

    pub fn send_encrypted_message(
        ctx: Context<SendEncryptedMessage>,
        message_id: u64,
        sender_encryption_key: [u8; 32],
        recipient_encryption_key: [u8; 32],
        nonce: [u8; 24],
        ciphertext: String,
    ) -> Result<()> {
        require!(
            !ciphertext.is_empty() && ciphertext.len() <= MAX_CIPHERTEXT_LEN,
            ChatError::InvalidEncryptedMessage
        );

        let message = &mut ctx.accounts.encrypted_message;
        message.sender = ctx.accounts.sender.key();
        message.recipient = ctx.accounts.recipient.key();
        message.sender_encryption_key = sender_encryption_key;
        message.recipient_encryption_key = recipient_encryption_key;
        message.message_id = message_id;
        message.timestamp = Clock::get()?.unix_timestamp;
        message.nonce = nonce;
        message.ciphertext = ciphertext;
        message.bump = ctx.bumps.encrypted_message;

        msg!("Encrypted message stored successfully.");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct RegisterEncryptionKey<'info> {
    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + EncryptionKey::INIT_SPACE,
        seeds = [b"encryption_key", owner.key().as_ref()],
        bump
    )]
    pub encryption_key: Account<'info, EncryptionKey>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateEncryptionKey<'info> {
    #[account(
        mut,
        seeds = [b"encryption_key", owner.key().as_ref()],
        bump = encryption_key.bump,
        has_one = owner
    )]
    pub encryption_key: Account<'info, EncryptionKey>,

    pub owner: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct EncryptionKey {
    pub owner: Pubkey,
    pub encryption_public_key: [u8; 32],
    pub bump: u8,
}

#[derive(Accounts)]
#[instruction(message_id: u64)]
pub struct SendEncryptedMessage<'info> {
    #[account(
        init,
        payer = sender,
        space = 8 + EncryptedMessage::INIT_SPACE,
        seeds = [
            b"encrypted_message",
            sender.key().as_ref(),
            &message_id.to_le_bytes()
        ],
        bump
    )]
    pub encrypted_message: Account<'info, EncryptedMessage>,

    #[account(mut)]
    pub sender: Signer<'info>,

    /// CHECK: Recipient is stored as the intended destination.
    /// This account does not need to sign to receive a message.
    pub recipient: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(message_id: u64)]
pub struct SendMessage<'info> {
    #[account(
        init,
        payer = sender,
        space = 8 + Message::INIT_SPACE,
        seeds = [
            b"message",
            sender.key().as_ref(),
            &message_id.to_le_bytes()
        ],
        bump
    )]
    pub message: Account<'info, Message>,

    #[account(mut)]
    pub sender: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DeleteMessage<'info> {
    #[account(
        mut,
        close = sender,
        has_one = sender,
        seeds = [
            b"message",
            sender.key().as_ref(),
            &message.message_id.to_le_bytes()
        ],
        bump = message.bump
    )]
    pub message: Account<'info, Message>,

    #[account(mut)]
    pub sender: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Message {
    pub sender: Pubkey,
    pub message_id: u64,
    #[max_len(280)]
    pub content: String,
    pub timestamp: i64,
    pub bump: u8,
}

#[error_code]
pub enum ChatError {
    #[msg("Message content cannot exceed 280 bytes.")]
    MessageTooLong,
    #[msg("Encrypted message must be non-empty and within the size limit.")]
    InvalidEncryptedMessage,
}
