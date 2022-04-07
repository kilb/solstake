// export ANCHOR_WALLET=/home/ke/.config/solana/id.json
// export ANCHOR_PROVIDER_URL="https://api.devnet.solana.com"
import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { TOKEN_PROGRAM_ID, Token } from '@solana/spl-token';
// import NodeWallet from '@project-serum/anchor/dist/cjs/provider';
import { PublicKey, Keypair, clusterApiUrl, SystemProgram, Transaction, Connection, Commitment } from '@solana/web3.js';

const idl = require('./idl.json');
const programID = new PublicKey("AAAAAAhAcUFQXMCbRgFvGRwKjnjjASAipCvxpbYf2ieo");
const provider = anchor.Provider.env();
anchor.setProvider(provider);
const wallet = provider.wallet;
const program = new Program(idl, programID, provider);

const assert = require("assert");
const fs = require('fs');

function getKeypair() {
  let data = fs.readFileSync('/home/ke/.config/solana/id.json', 'utf8');
  let secretKey = Uint8Array.from(JSON.parse(data));
  return Keypair.fromSecretKey(secretKey);
}

let myKey = getKeypair();

const myMintAccount = "DCWj38SJkuZfy4UZDJkHsCEXZbJ3xBHQetw4oTX7z2uz";
const myMintPublickey = new PublicKey(myMintAccount);
const tokenUserAccount = "CMcmPxyd2m92f2GAUea1zTkparTZZQzkz8Fn2JFoAozB";
const token_user = new PublicKey(tokenUserAccount);

let pool_id = new anchor.BN(7);

async function createPool() {
  console.log("program id", program.programId.toBase58());
  const [_pool_account_pda, _pool_account_bump] = await PublicKey.findProgramAddress(
    [pool_id.toBuffer("be", 8)],
    program.programId
  );
  let pool_account_pda = _pool_account_pda;
  console.log("pool_account_pda", pool_account_pda.toBase58());

  const tx = await program.rpc.createPool(
    pool_id,
    new anchor.BN(60000), // 最小锁定时间: 60000s 
    new anchor.BN(1649145915), // start time
    new anchor.BN(1659145915), // end time
    {
      accounts: {
        authority: wallet.publicKey,
        pool: pool_account_pda,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      }
    });
  console.log("Your transaction signature", tx);
  let poolAccount = await program.account.pool.fetch(pool_account_pda);
  assert.ok(
    poolAccount.authority.equals(wallet.publicKey)
  );

  return "OK";
}

// 依次查询找到未使用的uid，从0开始增长
async function stake(uid: number) {
  const [_pool_account_pda, _pool_account_bump] = await PublicKey.findProgramAddress(
    [pool_id.toBuffer("be", 8)],
    program.programId
  );
  let pool_account_pda = _pool_account_pda;
  console.log("pool_account_pda", pool_account_pda.toBase58());

  const [user_stake_pda, _user_stake_bump] = await PublicKey.findProgramAddress(
    [Buffer.from(anchor.utils.bytes.utf8.encode("stake")), wallet.publicKey.toBuffer(), new anchor.BN(uid).toBuffer("be", 8)],
    program.programId
  );

  const [token_vault_pda, _token_vault_bump] = await PublicKey.findProgramAddress(
    [Buffer.from(anchor.utils.bytes.utf8.encode("token")), wallet.publicKey.toBuffer(), new anchor.BN(uid).toBuffer("be", 8)],
    program.programId
  );

  const tx = await program.rpc.stake(
    new anchor.BN(60000), // duration: 60000s 
    new anchor.BN(0), // uid
    {
      accounts: {
        authority: wallet.publicKey,
        pool: pool_account_pda,
        userStake: user_stake_pda,
        tokenVault: token_vault_pda,
        tokenUser: token_user,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenMint: myMintPublickey,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      }
    });
  console.log("Your transaction signature", tx);
  let stakeAccount = await program.account.userStake.fetch(user_stake_pda);
  assert.ok(
    stakeAccount.tokenMint == myMintPublickey
  );
  return "OK"
}

//unStake之前找到用户需求unStake的id
async function unStake(uid: number) {
  const [_pool_account_pda, _pool_account_bump] = await PublicKey.findProgramAddress(
    [pool_id.toBuffer("be", 8)],
    program.programId
  );
  let pool_account_pda = _pool_account_pda;

  const [user_stake_pda, _user_stake_bump] = await PublicKey.findProgramAddress(
    [Buffer.from(anchor.utils.bytes.utf8.encode("stake")), wallet.publicKey.toBuffer(), new anchor.BN(uid).toBuffer("be", 8)],
    program.programId
  );

  const [token_vault_pda, _token_vault_bump] = await PublicKey.findProgramAddress(
    [Buffer.from(anchor.utils.bytes.utf8.encode("token")), wallet.publicKey.toBuffer(), new anchor.BN(uid).toBuffer("be", 8)],
    program.programId
  );

  const tx = await program.rpc.unstake(
    new anchor.BN(0), // uid
    {
      accounts: {
        authority: wallet.publicKey,
        pool: pool_account_pda,
        userStake: user_stake_pda,
        tokenVault: token_vault_pda,
        tokenUser: token_user,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      }
    });
  console.log("Your transaction signature", tx);

  return "OK"
}

async function updatePool() {
  const [_pool_account_pda, _pool_account_bump] = await PublicKey.findProgramAddress(
    [pool_id.toBuffer("be", 8)],
    program.programId
  );
  let pool_account_pda = _pool_account_pda;
  

  const tx = await program.rpc.updatePool(
    new anchor.BN(80000), // 最小锁定时间
    new anchor.BN(1669145915), // 结束时间
    {
      accounts: {
        authority: wallet.publicKey,
        newAuth: wallet.publicKey,
        pool: pool_account_pda,
        systemProgram: anchor.web3.SystemProgram.programId
      }
    });
  console.log("Your transaction signature", tx);
  return "OK"
}

createPool().then(console.log);
stake(0).then(console.log);
unStake(2).then(console.log);on signature", tx);
  return "OK"
}

createPool().then(console.log);
stake(0).then(console.log);
unStake(2).then(console.log);