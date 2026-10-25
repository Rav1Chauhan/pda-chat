use anchor_lang::prelude::*;

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
        message.bump = ctx.bumps.message;

        msg!("Message PDA created successfully!");
        Ok(())
    }

    pub fn delete_message(_ctx: Context<DeleteMessage>) -> Result<()> {
        msg!("Message deleted; account lamports refunded to sender.");
        Ok(())
    }
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
    pub bump: u8,
}

#[error_code]
pub enum ChatError {
    #[msg("Message content cannot exceed 280 bytes.")]
    MessageTooLong,
}
