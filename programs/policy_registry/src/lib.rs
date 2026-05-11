use anchor_lang::prelude::*;

declare_id!("FGTkQ9C8zr7Rm9WFZ7rK6cDdY7Bju1dTsjSN5GuHqAJF");

#[program]
pub mod policy_registry {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
