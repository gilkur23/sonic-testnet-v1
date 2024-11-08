const fs = require('fs');
const { Keypair, Transaction } = require('@solana/web3.js');
const axios = require('axios').default;
const base58 = require('bs58');
const nacl = require('tweetnacl');
const { HEADERS } = require('./src/headers');
const { connection } = require('./src/solanaUtils');
const moment = require('moment');

let PRIVATE_KEYS;
try {
  PRIVATE_KEYS = JSON.parse(fs.readFileSync('privateKeys.json', 'utf-8'));
  if (!Array.isArray(PRIVATE_KEYS) || PRIVATE_KEYS.length === 0) {
    throw new Error('Format privateKeys.json tidak valid atau kosong');
  }
} catch (error) {
  console.error('Error membaca file privateKeys.json:', error.message);
  process.exit(1);
}

function getKeypair(privateKey) {
  try {
    const decodedPrivateKey = base58.decode(privateKey);
    return Keypair.fromSecretKey(decodedPrivateKey);
  } catch (error) {
    console.error(`Error decoding private key: ${error.message}`);
    throw error;
  }
}

async function getToken(privateKey) {
  try {
    const keypair = getKeypair(privateKey);
    const publicKey = keypair.publicKey;
    const { data } = await axios({
      url: `https://odyssey-api-beta.sonic.game/testnet-v1/auth/sonic/challenge?wallet=${publicKey}`,
      params: { wallet: keypair.publicKey.toBase58() },
      headers: HEADERS,
    });

    const sign = nacl.sign.detached(Buffer.from(data.data), keypair.secretKey);
    const signature = Buffer.from(sign).toString('base64');
    const encodedPublicKey = Buffer.from(publicKey.toBytes()).toString('base64');

    const response = await axios({
      url: 'https://odyssey-api-beta.sonic.game/testnet-v1/auth/sonic/authorize',
      method: 'POST',
      headers: HEADERS,
      data: {
        address: publicKey.toBase58(),
        address_encoded: encodedPublicKey,
        signature,
      },
    });

    return response.data.data.token;
  } catch (error) {
    console.log(`Error fetching token: ${error.response?.data?.message || error.message}`.red);
    throw error;
  }
}

async function doTransactions(tx, keypair, retries = 3) {
  try {
    const bufferTransaction = tx.serialize();
    const signature = await connection.sendRawTransaction(bufferTransaction);
    await connection.confirmTransaction(signature);
    return signature;
  } catch (error) {
    if (retries > 0) {
      console.log(`Retrying transaction... (${retries} retries left)`.yellow);
      await new Promise((res) => setTimeout(res, 1000));
      return doTransactions(tx, keypair, retries - 1);
    } else {
      console.log(`Error in transaction: ${error.message}`.red);
      throw error;
    }
  }
}

async function dailyLogin(token, keypair) {
  try {
    const { data } = await axios({
      url: 'https://odyssey-api-beta.sonic.game/testnet-v1/user/check-in/transaction',
      method: 'GET',
      headers: { ...HEADERS, Authorization: `Bearer ${token}` },
    });

    const txBuffer = Buffer.from(data.data.hash, 'base64');
    const tx = Transaction.from(txBuffer);
    tx.partialSign(keypair);
    const signature = await doTransactions(tx, keypair);

    const response = await axios({
      url: 'https://odyssey-api-beta.sonic.game/testnet-v1/user/check-in',
      method: 'POST',
      headers: { ...HEADERS, Authorization: `Bearer ${token}` },
      data: { hash: signature },
    });

    return response.data;
  } catch (error) {
    return null;
  }
}

(async () => {
  const successfulLogins = [];
  const failedLogins = [];

  try {
    for (const privateKey of PRIVATE_KEYS) {
      try {
        const keypair = getKeypair(privateKey);
        const publicKey = keypair.publicKey.toBase58();

        const token = await getToken(privateKey);
        
        if (!token) {
          console.log(`[ ${moment().format('HH:mm:ss')} ] Gagal mendapatkan token untuk ${publicKey.slice(0, 6)}...`.red);
          failedLogins.push(`Akun ${publicKey.slice(0, 6)}...: Gagal mendapatkan token`);
          continue;
        }

        const loginResult = await dailyLogin(token, keypair);

        if (loginResult) {
          successfulLogins.push(`Akun ${publicKey.slice(0, 6)}...: Berhasil Login`);
          console.log(`[ ${moment().format('HH:mm:ss')} ] Login harian berhasil untuk ${publicKey}: ${loginResult.status}`.green);
        } else {
          failedLogins.push(`Akun ${publicKey.slice(0, 6)}...: Gagal login harian`);
          console.log(`[ ${moment().format('HH:mm:ss')} ] Login harian gagal untuk ${publicKey}: ${error.response?.data?.message || error.message}`.red);
        }
      } catch (error) {
        const keypair = getKeypair(privateKey);
        const publicKey = keypair.publicKey.toBase58();
        console.log(`[ ${moment().format('HH:mm:ss')} ] Error dalam memproses private key ${publicKey.slice(0, 6)}...: ${error.message}`.red);
        failedLogins.push(`Akun ${publicKey.slice(0, 6)}...: ${error.message}`);
        continue;
      }
    }

    const totalSuccessful = successfulLogins.length;
    const totalFailed = failedLogins.length;

    const summaryMessage = `Daily Login\nSukses: ${totalSuccessful} Akun\nGagal: ${totalFailed} Akun\n`;
    fs.writeFileSync('summary_daily.json', JSON.stringify({ summaryMessage }));
    console.log(summaryMessage.green);
  } catch (error) {
    console.log(`Terjadi kesalahan: ${error.message}`.red);
  } finally {
    console.log('Bot By HCA'.magenta);
  }
})();
