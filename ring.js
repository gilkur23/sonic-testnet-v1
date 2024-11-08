const fs = require('fs');
const axios = require('axios').default;
const base58 = require('bs58');
const nacl = require('tweetnacl');
const colors = require('colors');
require('dotenv').config();
const { Keypair } = require('@solana/web3.js');
const { HEADERS } = require('./src/headers');

const PRIVATE_KEYS = JSON.parse(fs.readFileSync('privateKeys.json', 'utf-8'));
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const date = new Date().toLocaleDateString('id-ID');

function getKeypair(privateKey) {
  const decodedPrivateKey = base58.decode(privateKey);
  return Keypair.fromSecretKey(decodedPrivateKey);
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

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getTokenWithRetry(privateKey, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await getToken(privateKey);
    } catch (error) {
      if (error.response && (error.response.status === 502 || error.response.status === 504)) {
        console.warn(`Mencoba Ulang. Upaya ke-${i + 1}`);
        await delay(2000);
      } else {
        throw error;
      }
    }
  }
  throw new Error(`Gagal mendapatkan Saldo Ring setelah ${retries} percobaan.`);
}

async function getRing(token, publicKey) {
  try {
    const response = await axios({
      url: 'https://odyssey-api-beta.sonic.game/testnet-v1/user/rewards/info',
      method: 'GET',
      headers: { ...HEADERS, Authorization: `Bearer ${token}` },
    });

    const ring = response.data.data.ring;
    
    console.log(`Total Ring: ${ring} \n`.green);
    return ring;
  } catch (error) {
    console.log(`Error fetching ring: ${error.message}`);
    throw error;
  }
}

const sendTelegramMessage = async (totalAccounts, totalRings) => {
  const message = `🚀 *Sonic Testnet ${date}

      🤖 Total Akun: ${totalAccounts}
      💰 Total Ring: ${totalRings}

         ==SKW Airdrop Hunter==*`;

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await axios.post(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'Markdown',
    });

    if (response.status === 200) {
      console.log('Pesan berhasil dikirim ke Telegram.\n'.green);
    } else {
      console.error('Gagal mengirim pesan ke Telegram. Status:', response.status);
    }
  } catch (error) {
    console.error('Error sending message to Telegram:', error.message);
  }
};

(async () => {
  let totalRings = 0;
  let totalAccounts = 0;

  for (const privateKey of PRIVATE_KEYS) {
    try {
      const keypair = getKeypair(privateKey);
      const publicKey = keypair.publicKey.toBase58();
      console.log(`Memproses Akun\nPrivate key: ${privateKey.slice(0, 10)}...\nAddess: ${publicKey.slice(0, 10)}...`.blue);
      const token = await getTokenWithRetry(privateKey);
      await delay(1000);
      const ring = await getRing(token, publicKey);
      totalAccounts++;
      if (ring !== undefined) {
        totalRings += ring;
      } else {
        console.warn(`Ring is undefined for private key: ${privateKey}`);
      }
      await delay(1000);
    } catch (error) {
      console.error(`Terjadi kesalahan: ${error.message}`.red);
    }
  }

  const summaryMessage = `Total Semua Ring : ${totalRings}`;
  fs.writeFileSync('summary_ring.json', JSON.stringify({ summaryMessage }));
  console.log(summaryMessage.green);

  await sendTelegramMessage(totalAccounts, totalRings);
})();
