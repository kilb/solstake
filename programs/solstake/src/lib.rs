use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer};

declare_id!("AAAAAAhAcUFQXMCbRgFvGRwKjnjjASAipCvxpbYf2ieo");

#[program]
pub mod solstake {
    use super::*;
    pub fn create_pool(
        ctx: Context<CreatePool>,
        pool_id: u64,
        min_duration: i64,
        start_time: i64,
        end_time: i64,
    ) -> ProgramResult {
        let pool = &mut ctx.accounts.pool;
        pool.pool_id = pool_id;
        pool.authority = ctx.accounts.authority.key();
        pool.token_program = ctx.accounts.token_program.key();
        pool.min_duration = min_duration;
        pool.start_time = start_time;
        pool.end_time = end_time;
        pool.is_paused = false;
        Ok(())
    }

    pub fn stake(ctx: Context<Stake>, duration: i64, _uid: u64) -> ProgramResult {
        let pool = &mut ctx.accounts.pool;
        let user_stake = &mut ctx.accounts.user_stake;
        pool.stake_count += 1;
        user_stake.start_time = ctx.accounts.clock.unix_timestamp;
        user_stake.end_time = ctx.accounts.clock.unix_timestamp + duration;
        user_stake.token_mint = ctx.accounts.token_mint.key();
        user_stake.is_valid = true;
        emit!(DidStake {
            pool_id: pool.pool_id,
            token_mint: ctx.accounts.token_mint.key(),
            user_pubkey: ctx.accounts.authority.key(),
            duration,
        });
        token::transfer(ctx.accounts.into_transfer_context(), 1)?;
        Ok(())
    }

    pub fn unstake(ctx: Context<Unstake>, _uid: u64) -> ProgramResult {
        let pool = &mut ctx.accounts.pool;
        pool.stake_count -= 1;
        let user_stake = &mut ctx.accounts.user_stake;
        user_stake.is_valid = false;
        let pool_id_bytes = pool.pool_id.to_be_bytes();
        let (_vault_authority, vault_authority_bump) =
            Pubkey::find_program_address(&[pool_id_bytes.as_ref()], ctx.program_id);
        let authority_seeds = [pool_id_bytes.as_ref(), &[vault_authority_bump]];
        
        emit!(DidUnstake {
            pool_id: pool.pool_id,
            token_mint: user_stake.token_mint,
            user_pubkey: ctx.accounts.authority.key(),
            start_time: user_stake.start_time,
            end_time: user_stake.end_time,
            release_time: ctx.accounts.clock.unix_timestamp
        });

        {
            token::transfer(
                ctx.accounts
                    .into_transfer_context()
                    .with_signer(&[&authority_seeds]),
                1,
            )?;
            token::close_account(
                ctx.accounts
                    .into_close_context()
                    .with_signer(&[&authority_seeds]),
            )?;
        }
        
        Ok(())
    }

    pub fn update_pool(ctx: Context<UpdatePool>, min_duration: i64, end_time: i64, is_paused: bool) -> ProgramResult {
        let pool = &mut ctx.accounts.pool;
        pool.min_duration = min_duration;
        pool.end_time = end_time;
        pool.is_paused = is_paused;
        pool.authority = ctx.accounts.new_auth.key();
        Ok(())
    }

}

#[derive(Accounts)]
#[instruction(pool_id: u64)]
pub struct CreatePool<'info> {
    pub authority: Signer<'info>,
    #[account(
        init,
        seeds = [pool_id.to_be_bytes().as_ref()],
        bump,
        payer = authority,
    )]
    pub pool: Box<Account<'info, Pool>>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(duration: i64, _uid: u64)]
pub struct Stake<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        has_one = token_program,
    )]
    pub pool: Account<'info, Pool>,
    #[account(
        init,
        seeds = [b"stake", authority.key().as_ref(), _uid.to_be_bytes().as_ref()],
        bump,
        payer = authority,
        constraint = (duration >= pool.min_duration) 
                  && (pool.start_time <= clock.unix_timestamp)
                  && (clock.unix_timestamp + duration <= pool.end_time)
                  && !pool.is_paused
    )]
    pub user_stake: Box<Account<'info, UserStake>>,
    #[account(
        init,
        seeds = [b"token", authority.key().as_ref(), _uid.to_be_bytes().as_ref()],
        bump,
        payer = authority,
        token::mint = token_mint,
        token::authority = pool,
    )]
    pub token_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = token_user.amount == 1
    )]
    pub token_user: Box<Account<'info, TokenAccount>>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub token_mint: Account<'info, Mint>,
    pub rent: Sysvar<'info, Rent>,
    pub clock: Sysvar<'info, Clock>,
}

impl<'info> Stake<'info> {
    fn into_transfer_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.token_user.to_account_info(),
            to: self.token_vault.to_account_info(),
            authority: self.authority.to_account_info(),
        };
        CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
    }
}

#[derive(Accounts)]
#[instruction(_uid: u64)]
pub struct Unstake<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        has_one = token_program,
    )]
    pub pool: Account<'info, Pool>,
    #[account(
        mut,
        seeds = [b"stake",  authority.key().as_ref(), _uid.to_be_bytes().as_ref()],
        bump,
        constraint = user_stake.end_time <= clock.unix_timestamp,
        constraint = user_stake.is_valid,
        close = authority
    )]
    pub user_stake: Box<Account<'info, UserStake>>,
    #[account(
        mut,
        seeds = [b"token",  authority.key().as_ref(), _uid.to_be_bytes().as_ref()],
        bump
    )]
    pub token_vault: Box<Account<'info, TokenAccount>>,
    pub token_user: Box<Account<'info, TokenAccount>>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
    pub clock: Sysvar<'info, Clock>,
}

impl<'info> Unstake<'info> {
    fn into_transfer_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.token_vault.to_account_info(),
            to: self.token_user.to_account_info(),
            authority: self.pool.to_account_info(),
        };
        CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
    }

    fn into_close_context(&self) -> CpiContext<'_, '_, '_, 'info, CloseAccount<'info>> {
        let cpi_accounts = CloseAccount {
            account: self.token_vault.to_account_info(),
            destination: self.authority.to_account_info(),
            authority: self.pool.to_account_info(),
        };
        CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
    }
}

#[derive(Accounts)]
pub struct UpdatePool<'info> {
    pub authority: Signer<'info>,
    pub new_auth: AccountInfo<'info>,
    #[account(
        mut,
        has_one = authority,
    )]
    pub pool: Account<'info, Pool>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(Default)]
pub struct Pool {
    pub pool_id: u64,
    // Priviledged account.
    pub authority: Pubkey,
    // duration of one round (s)
    pub min_duration: i64,
    pub start_time: i64,
    pub end_time: i64,
    pub is_paused: bool,
    pub stake_count: u64,
    pub token_program: Pubkey,
}

#[account]
#[derive(Default)]
pub struct UserStake {
    pub token_mint: Pubkey,
    pub start_time: i64,
    pub end_time: i64,
    pub is_valid: bool,
}

#[event]
pub struct DidStake {
    pool_id: u64,
    token_mint: Pubkey,
    user_pubkey: Pubkey,
    duration: i64,
}

#[event]
pub struct DidUnstake {
    pool_id: u64,
    token_mint: Pubkey,
    user_pubkey: Pubkey,
    start_time: i64,
    end_time: i64,
    release_time: i64
}


