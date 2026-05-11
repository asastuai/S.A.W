use anchor_lang::prelude::*;

declare_id!("6wsPfHTs13KA3seca53S8sc4oW7ropypGU7PzA4345TB");

#[program]
pub mod agent_wallet {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
