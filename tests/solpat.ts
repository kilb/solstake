import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { Solpat } from '../target/types/solpat';
import { TOKEN_PROGRAM_ID, Token } from '@solana/spl-token';
// import { NodeWallet } from '@project-serum/anchor/dist/cjs/provider';
import { PublicKey, SystemProgram, Transaction, Connection, Commitment } from '@solana/web3.js';

const assert = require("assert");

describe('solpat', () => {
  // const commitment: Commitment = 'processed';
  // const connection = new Connection('https://rpc-mainnet-fork.dappio.xyz', { commitment, wsEndpoint: 'wss://rpc-mainnet-fork.dappio.xyz/ws' });
  // const options = anchor.Provider.defaultOptions();
  // const provider = new anchor.Provider(connection, wallet, options);

  const priceFeedAccount = "FmAmfoyPXiA8Vhhe6MZTr3U6rZfEZ1ctEHay1ysqCqcf";
  const AggregatorPublicKey = new PublicKey(priceFeedAccount);

  // Configure the client to use the local cluster.
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);
  // anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.Solpat as Program<Solpat>;
  const wallet = program.provider.wallet;

  let myMint = null as Token;
  let pool_account_pda = null as PublicKey;
  let token_user = null as PublicKey;
  const admin = anchor.web3.Keypair.generate();
  const user = anchor.web3.Keypair.generate();

  it('Initial Test', async () => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(admin.publicKey, 10000000000),
      "processed"
    );
  
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(user.publicKey, 10000000000),
      "processed"
    );
  
    myMint = await Token.createMint(
      provider.connection,
      admin,
      admin.publicKey,
      null,
      0,
      TOKEN_PROGRAM_ID
    );

    token_user = await myMint.createAccount(wallet.publicKey);
    await myMint.mintTo(
      token_user,
      admin.publicKey,
      [admin],
      1000000000
    );
  });
  
  it('Create Pool', async () => {
    let pool_id = new anchor.BN(1);
    const [_pool_account_pda, _pool_account_bump] = await PublicKey.findProgramAddress(
      [pool_id.toBuffer("be", 8)],
      program.programId
    );

    pool_account_pda = _pool_account_pda;
    // Add your test here.
    const tx = await program.rpc.createPool(
      pool_id,
      new anchor.BN(0), // duration: 0s 
      new anchor.BN(10), // fee_rate: 10/10000
      {
        accounts: {
          authority: wallet.publicKey,
          pool: pool_account_pda,
          feedAccount: AggregatorPublicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          tokenMint: myMint.publicKey,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        }
      });
    console.log("Your transaction signature", tx);
    let poolAccount = await program.account.pool.fetch(pool_account_pda);
    assert.ok(
      poolAccount.authority.equals(wallet.publicKey)
    );
    assert.ok(
      poolAccount.nextRound.toNumber() == 2
    );
  });

  it('start round', async () => {
    let poolAccount2 = await program.account.pool.fetch(pool_account_pda);
    assert.ok(
      poolAccount2.nextRound.toNumber() == 2
    );

    const [next_round_pda, _next_round_bump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("round")), pool_account_pda.toBuffer(), poolAccount2.nextRound.toBuffer("be", 8)],
      program.programId
    );

    const [token_vault_pda, _token_vault_bump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("token")), next_round_pda.toBuffer()],
      program.programId
    );
    // Add your test here.
    const tx = await program.rpc.startRound(
      {
        accounts: {
          authority: wallet.publicKey,
          pool: pool_account_pda,
          tokenVault: token_vault_pda,
          nextRound: next_round_pda,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          tokenMint: myMint.publicKey,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        }
      });
    console.log("Your transaction signature", tx);
    let roundAccount = await program.account.round.fetch(next_round_pda);
    assert.ok(
      roundAccount.bonus.toNumber() == 0
    );
  });

  it('betRound2', async () => {
    //可以将round id记录在后台中，减少链查询
    let poolAccount2 = await program.account.pool.fetch(pool_account_pda);

    const [cur_round_pda, _cur_round_bump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("round")), pool_account_pda.toBuffer(), poolAccount2.nextRound.subn(1).toBuffer("be", 8)],
      program.programId
    );

    const [token_vault_pda, _token_vault_bump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("token")), cur_round_pda.toBuffer()],
      program.programId
    );

    const [user_bet_pda, _user_bet_bump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("bet")), cur_round_pda.toBuffer(), wallet.publicKey.toBuffer()],
      program.programId
    );

    const tx = await program.rpc.bet(
      new anchor.BN(100000000), // bet amount
      0,
      {
        accounts: {
          authority: wallet.publicKey,
          tokenVault: token_vault_pda,
          tokenUser: token_user,
          curRound: cur_round_pda,
          userBet: user_bet_pda,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        }
      });
    console.log("Your transaction signature", tx);
    let userBet = await program.account.userBet.fetch(user_bet_pda);
    assert.ok(
      userBet.betDown.toNumber() == 100000000
    );
    let _tokenUser = await myMint.getAccountInfo(token_user);
    assert.ok(
      _tokenUser.amount.toNumber() == 900000000
    );
    let _tokenVault = await myMint.getAccountInfo(token_vault_pda);
    assert.ok(
      _tokenVault.amount.toNumber() == 100000000
    );
    let roundAccount = await program.account.round.fetch(cur_round_pda);
    assert.ok(
      roundAccount.depositDown.toNumber() == 100000000
    );

    // again bet
    const tx2 = await program.rpc.bet(
      new anchor.BN(200000000), // bet amount
      1,
      {
        accounts: {
          authority: wallet.publicKey,
          tokenVault: token_vault_pda,
          tokenUser: token_user,
          curRound: cur_round_pda,
          userBet: user_bet_pda,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        }
      });
    console.log("Your transaction signature", tx);
    let userBet2 = await program.account.userBet.fetch(user_bet_pda);
    assert.ok(
      userBet2.betUp.toNumber() == 200000000
    );
    let _tokenUser2 = await myMint.getAccountInfo(token_user);
    assert.ok(
      _tokenUser2.amount.toNumber() == 700000000
    );
    let _tokenVault2 = await myMint.getAccountInfo(token_vault_pda);
    assert.ok(
      _tokenVault2.amount.toNumber() == 300000000
    );
    let roundAccount2 = await program.account.round.fetch(cur_round_pda);
    assert.ok(
      roundAccount2.depositUp.toNumber() == 200000000
    );
  });

  it('lock round', async () => {
    let poolAccount2 = await program.account.pool.fetch(pool_account_pda);
    assert.ok(
      poolAccount2.nextRound.toNumber() == 3
    );

    const [cur_round_pda, _cur_round_bump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("round")), pool_account_pda.toBuffer(), poolAccount2.nextRound.subn(1).toBuffer("be", 8)],
      program.programId
    );

    const [next_round_pda, _next_round_bump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("round")), pool_account_pda.toBuffer(), poolAccount2.nextRound.toBuffer("be", 8)],
      program.programId
    );

    const [token_vault_pda, _token_vault_bump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("token")), next_round_pda.toBuffer()],
      program.programId
    );
    // Add your test here.
    const tx = await program.rpc.lockRound(
      {
        accounts: {
          authority: wallet.publicKey,
          pool: pool_account_pda,
          tokenVault: token_vault_pda,
          nextRound: next_round_pda,
          curRound: cur_round_pda,
          feedAccount: AggregatorPublicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          tokenMint: myMint.publicKey,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        }
      });
    console.log("Your transaction signature", tx);
    let roundAccount = await program.account.round.fetch(cur_round_pda);
    assert.ok(
      roundAccount.status == 1
    );
  });

  it('process round', async () => {
    let poolAccount2 = await program.account.pool.fetch(pool_account_pda);
    assert.ok(
      poolAccount2.nextRound.toNumber() == 4
    );

    const [pre_round_pda, _pre_round_bump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("round")), pool_account_pda.toBuffer(), poolAccount2.nextRound.subn(2).toBuffer("be", 8)],
      program.programId
    );

    const [cur_round_pda, _cur_round_bump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("round")), pool_account_pda.toBuffer(), poolAccount2.nextRound.subn(1).toBuffer("be", 8)],
      program.programId
    );

    const [next_round_pda, _next_round_bump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("round")), pool_account_pda.toBuffer(), poolAccount2.nextRound.toBuffer("be", 8)],
      program.programId
    );

    const [token_vault_pda, _token_vault_bump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("token")), next_round_pda.toBuffer()],
      program.programId
    );
    // Add your test here.
    const tx = await program.rpc.processRound(
      {
        accounts: {
          authority: wallet.publicKey,
          pool: pool_account_pda,
          tokenVault: token_vault_pda,
          nextRound: next_round_pda,
          curRound: cur_round_pda,
          preRound: pre_round_pda,
          feedAccount: AggregatorPublicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          tokenMint: myMint.publicKey,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        }
      });
    console.log("Your transaction signature", tx);
    let roundAccount = await program.account.round.fetch(next_round_pda);
    assert.ok(
      roundAccount.bonus.toNumber() == 0
    );
  });

  it('Claim Round2', async () => {
    //可以将round id记录在后台中，减少链查询

    const [claim_round_pda, _claim_round_bump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("round")), pool_account_pda.toBuffer(), new anchor.BN(2).toBuffer("be", 8)],
      program.programId
    );

    const [token_vault_pda, _token_vault_bump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("token")), claim_round_pda.toBuffer()],
      program.programId
    );

    const [user_bet_pda, _user_bet_bump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("bet")), claim_round_pda.toBuffer(), wallet.publicKey.toBuffer()],
      program.programId
    );

    const tx = await program.rpc.claim(
      {
        accounts: {
          authority: wallet.publicKey,
          pool: pool_account_pda,
          tokenVault: token_vault_pda,
          tokenUser: token_user,
          curRound: claim_round_pda,
          userBet: user_bet_pda,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        }
      });
    console.log("Your transaction signature", tx);
    let _tokenUser = await myMint.getAccountInfo(token_user);
    assert.ok(
      _tokenUser.amount.toNumber() == 999700000
    );
    let _tokenVault = await myMint.getAccountInfo(token_vault_pda);
    assert.ok(
      _tokenVault.amount.toNumber() == 300000
    );
    let roundAccount = await program.account.round.fetch(claim_round_pda);
    assert.ok(
      roundAccount.accountsAmount.toNumber() == 1
    );

  });

  it('Take fee Round2', async () => {
    //可以将round id记录在后台中，减少链查询

    const [claim_round_pda, _claim_round_bump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("round")), pool_account_pda.toBuffer(), new anchor.BN(2).toBuffer("be", 8)],
      program.programId
    );

    const [token_vault_pda, _token_vault_bump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("token")), claim_round_pda.toBuffer()],
      program.programId
    );

    const tx = await program.rpc.takeFee(
      new anchor.BN(2), // round id
      {
        accounts: {
          authority: wallet.publicKey,
          tokenVault: token_vault_pda,
          tokenUser: token_user,
          curRound: claim_round_pda,
          pool: pool_account_pda,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        }
      });
    console.log("Your transaction signature", tx);
    let _tokenUser = await myMint.getAccountInfo(token_user);
    assert.ok(
      _tokenUser.amount.toNumber() == 1000000000
    );
    let _tokenVault = await myMint.getAccountInfo(token_vault_pda);
    assert.ok(
      _tokenVault.amount.toNumber() == 0
    );
    let roundAccount = await program.account.round.fetch(claim_round_pda);
    assert.ok(
      roundAccount.status == 3
    );

  });

  it('pause round', async () => {
    let poolAccount2 = await program.account.pool.fetch(pool_account_pda);

    const [cur_round_pda, _cur_round_bump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("round")), pool_account_pda.toBuffer(), poolAccount2.nextRound.subn(1).toBuffer("be", 8)],
      program.programId
    );

    const [pre_round_pda, _pre_round_bump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("round")), pool_account_pda.toBuffer(), poolAccount2.nextRound.subn(2).toBuffer("be", 8)],
      program.programId
    );

    const tx = await program.rpc.pauseRound(
      {
        accounts: {
          authority: wallet.publicKey,
          pool: pool_account_pda,
          curRound: cur_round_pda,
          preRound: pre_round_pda,
          feedAccount: AggregatorPublicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        }
      });
    console.log("Your transaction signature", tx);
    let roundAccount = await program.account.round.fetch(cur_round_pda);
    assert.ok(
      roundAccount.status == 1
    );
  });

  it('close round', async () => {
    let poolAccount2 = await program.account.pool.fetch(pool_account_pda);

    const [cur_round_pda, _cur_round_bump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("round")), pool_account_pda.toBuffer(), poolAccount2.nextRound.subn(1).toBuffer("be", 8)],
      program.programId
    );

    const tx = await program.rpc.closeRound(
      {
        accounts: {
          authority: wallet.publicKey,
          pool: pool_account_pda,
          curRound: cur_round_pda,
          feedAccount: AggregatorPublicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        }
      });
    console.log("Your transaction signature", tx);
    let roundAccount = await program.account.round.fetch(cur_round_pda);
    assert.ok(
      roundAccount.status == 2
    );
  });

  // 关闭 round account 退回租金
  it('Free Round', async () => {
    //可以将round id记录在后台中，减少链查询
    let poolAccount2 = await program.account.pool.fetch(pool_account_pda);
    const [claim_round_pda, _claim_round_bump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("round")), pool_account_pda.toBuffer(), poolAccount2.nextRound.subn(1).toBuffer("be", 8)],
      program.programId
    );

    const [token_vault_pda, _token_vault_bump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("token")), claim_round_pda.toBuffer()],
      program.programId
    );

    // for test
    await myMint.mintTo(token_vault_pda, admin.publicKey, [admin], 1000000000);

    const tx = await program.rpc.freeRound(
      poolAccount2.nextRound.subn(1), // round id
      {
        accounts: {
          authority: wallet.publicKey,
          tokenVault: token_vault_pda,
          tokenUser: token_user,
          curRound: claim_round_pda,
          pool: pool_account_pda,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        }
      });
    console.log("Your transaction signature", tx);
    let _tokenUser = await myMint.getAccountInfo(token_user);
    assert.ok(
      _tokenUser.amount.toNumber() == 2000000000
    );

  });

  it('Update Pool', async () => {
    let pool_id = new anchor.BN(1);
    const [_pool_account_pda, _pool_account_bump] = await PublicKey.findProgramAddress(
      [pool_id.toBuffer("be", 8)],
      program.programId
    );

    pool_account_pda = _pool_account_pda;
    // Add your test here.
    const tx = await program.rpc.updatePool(
      new anchor.BN(300), // duration: 300s 
      new anchor.BN(10), // fee_rate: 10/10000
      {
        accounts: {
          authority: wallet.publicKey,
          newAuth: admin.publicKey,
          pool: pool_account_pda,
          feedAccount: AggregatorPublicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        }
      });
    console.log("Your transaction signature", tx);
    let poolAccount = await program.account.pool.fetch(pool_account_pda);
    assert.ok(
      poolAccount.authority.equals(admin.publicKey)
    );
    assert.ok(
      poolAccount.duration.toNumber() == 300
    );
  });

  
});
