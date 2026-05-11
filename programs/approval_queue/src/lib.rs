use anchor_lang::prelude::*;

declare_id!("8HJpiQCaCHcvbDVX7K6shcHmNkUZJUfSEqm9mhVcXXnr");

#[program]
pub mod approval_queue {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
