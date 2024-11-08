const { spawn } = require('child_process');
const fs = require('fs');
const cron = require('node-cron');
const colors = require('colors');

function runCommand(command) {
  return new Promise((resolve, reject) => {
    const [cmd, ...args] = command.split(' ');

    const process = spawn(cmd, args, { stdio: 'pipe' });

    process.stdout.on('data', (data) => {
      console.log(`\n${data}`);
    });

    process.stderr.on('data', (data) => {
      console.error(`\n${data}`);
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve(`Completed: ${command}`);
      } else {
        reject(new Error(`Command ${command} failed with exit code ${code}`));
      }
    });
  });
}

async function runCommands() {
  try {
    console.log('Starting the sequence of commands...');

    console.log('Running node index.js...');
    await runCommand('node index.js');

    console.log('Running node daily.js...');
    await runCommand('node daily.js');

    console.log('Running node opentx.js...');
    await runCommand('node opentx.js');

    console.log('Running node openbox.js...');
    await runCommand('node openbox.js');

    console.log('Running node ring.js...');
    await runCommand('node ring.js');

    // Collecting all summaries
    const summaries = [];
    if (fs.existsSync('summary_index.json')) {
      const indexSummary = JSON.parse(fs.readFileSync('summary_index.json', 'utf-8'));
      summaries.push(indexSummary.summaryMessage);
    }
    if (fs.existsSync('summary_daily.json')) {
      const dailySummary = JSON.parse(fs.readFileSync('summary_daily.json', 'utf-8'));
      summaries.push(dailySummary.summaryMessage);
    }
    if (fs.existsSync('summary_opentx.json')) {
      const opentxSummary = JSON.parse(fs.readFileSync('summary_opentx.json', 'utf-8'));
      summaries.push(opentxSummary.summaryMessage);
    }
    if (fs.existsSync('summary_openbox.json')) {
      const openboxSummary = JSON.parse(fs.readFileSync('summary_openbox.json', 'utf-8'));
      summaries.push(openboxSummary.summaryMessage);
    }
    if (fs.existsSync('summary_ring.json')) {
      const ringSummary = JSON.parse(fs.readFileSync('summary_ring.json', 'utf-8'));
      summaries.push(ringSummary.summaryMessage);
    }
    const finalSummaryMessage = summaries.join('\n');
    console.log(`Ringkasan Terbaru:\n${finalSummaryMessage}`.blue);
  } catch (error) {
    console.error('Error running commands:', error);
  }
}

async function main() {
    cron.schedule('1 0 * * *', async () => { 
        await runCommands();
        console.log();
        console.log(`Cron AKTIF`.magenta);
        console.log('Jam 07:01 WIB Autobot Akan Run Ulang...'.magenta);
    });

    await runCommands();
    console.log();
    console.log(`Cron AKTIF`.magenta);
    console.log('Jam 07:01 WIB Autobot Akan Run Ulang...'.magenta);
}

main();
