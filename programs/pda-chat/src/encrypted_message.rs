use anchor_lang::prelude::*;

pub const MAX_CIPHERTEXT_LEN: usize = 512;

#[account]
#[derive(InitSpace)]
pub struct EncryptedMessage {
    pub sender: Pubkey,
    pub recipient: Pubkey,
    pub sender_encryption_key: [u8; 32],
    pub recipient_encryption_key: [u8; 32],
    pub message_id: u64,
    pub timestamp: i64,
    pub nonce: [u8; 24],

    #[max_len(512)]
    pub ciphertext: String,

    pub bump: u8,
}
