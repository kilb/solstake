const web3 =  require('@solana/web3.js');
const splToken = require('@solana/spl-token');
const {Keypair} = require("@solana/web3.js");

function getKeypair() {
    let data = fs.readFileSync('/home/ke/.config/solana/id.json', 'utf8');
    let secretKey = Uint8Array.from(JSON.parse(data));
    return Keypair.fromSecretKey(secretKey);
}

(async () => {

    //create connection to devnet
    const connection = new web3.Connection(web3.clusterApiUrl("devnet"));
    global.TextEncoder = require("util").TextEncoder; 
    //generate keypair and airdrop 1000000000 Lamports (1 SOL)
    let myKeypair = getKeypair();
    await connection.requestAirdrop(myKeypair.publicKey, 1000000000);

    console.log('solana public address: ' + myKeypair.publicKey.toBase58());

    //set timeout to account for airdrop finalization
    let mint;
    var myToken
    setTimeout(async function(){ 

        //create mint
        mint = await splToken.Token.createMint(connection, myKeypair, myKeypair.publicKey, null, 6, splToken.TOKEN_PROGRAM_ID)

        console.log('mint public address: ' + mint.publicKey.toBase58());

        //get the token accont of this solana address, if it does not exist, create it
        myToken = await mint.getOrCreateAssociatedAccountInfo(
            myKeypair.publicKey
        )

        console.log('token public address: ' + myToken.address.toBase58());

        //minting 100 new tokens to the token address we just created
        await mint.mintTo(myToken.address, myKeypair.publicKey, [], 1000000000);

        console.log('done');

    }, 20000);

})();