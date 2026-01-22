#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const repl = require('repl');
const { sendCommand, isServerRunning, SOCKET_PATH } = require('../lib/client');

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  if (command === 'start') {
    // Check if server is already running
    if (await isServerRunning()) {
      console.log('Server is already running.');
      return;
    }
    
    // Check for --headed flag
    const headed = args.includes('--headed');
    
    // Start server in background
    const serverPath = path.join(__dirname, '..', 'lib', 'server.js');
    const child = spawn('node', [serverPath], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, PLAYWRIGHT_CLI_HEADLESS: headed ? 'false' : 'true' }
    });
    child.unref();
    
    // Wait a moment for server to start
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (await isServerRunning()) {
      console.log(`Playwright server started (socket: ${SOCKET_PATH})`);
      console.log('Browser is ready. Use playwright-cli -e "code" to execute commands.');
    } else {
      console.error('Failed to start server.');
      process.exit(1);
    }
    
  } else if (command === 'stop') {
    if (!(await isServerRunning())) {
      console.log('Server is not running.');
      return;
    }
    
    try {
      await sendCommand('stop');
      console.log('Server stopped.');
    } catch (err) {
      console.error('Error stopping server:', err.message);
      process.exit(1);
    }
    
  } else if (command === 'status') {
    if (await isServerRunning()) {
      console.log('Server is running.');
    } else {
      console.log('Server is not running.');
    }
    
  } else if (command === '-e' || command === '--eval') {
    const code = args[1];
    if (!code) {
      console.error('Usage: playwright-cli -e "code"');
      process.exit(1);
    }
    
    try {
      const response = await sendCommand('exec', code);
      if (response.success) {
        console.log(response.result);
      } else {
        console.error('Error:', response.error);
        process.exit(1);
      }
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
    
  } else if (command === 'repl') {
    if (!(await isServerRunning())) {
      console.error('Server not running. Start it with: playwright-cli start');
      process.exit(1);
    }
    
    console.log('Playwright REPL. Type JavaScript to execute against the browser.');
    console.log('Variables available: page, browser, context');
    console.log('Press Ctrl+C to exit.\n');
    
    const r = repl.start({
      prompt: 'playwright> ',
      eval: async (input, context, filename, callback) => {
        const code = input.trim();
        if (!code) {
          callback(null);
          return;
        }
        
        try {
          const response = await sendCommand('exec', code);
          if (response.success) {
            callback(null, response.result);
          } else {
            callback(new Error(response.error));
          }
        } catch (err) {
          callback(err);
        }
      }
    });
    
  } else if (command === 'help' || command === '--help' || command === '-h' || !command) {
    console.log(`
Usage: playwright-cli <command> [options]

Commands:
  start           Start the Playwright server (launches browser in headless mode)
    --headed      Show the browser window (default: headless)
  stop            Stop the Playwright server
  status          Check if server is running
  repl            Start interactive REPL
  -e, --eval      Execute JavaScript code
  help            Show this help message

Examples:
  playwright-cli start
  playwright-cli start --headed
  playwright-cli -e "await page.goto('https://example.com')"
  playwright-cli -e "await page.title()"
  playwright-cli -e "await page.screenshot({ path: 'screenshot.png' })"
  playwright-cli repl
  playwright-cli stop
`);
    
  } else {
    console.error(`Unknown command: ${command}`);
    console.error('Run "playwright-cli help" for usage.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
