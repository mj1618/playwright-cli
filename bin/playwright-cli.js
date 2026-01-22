#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const repl = require('repl');
const { sendCommand, isServerRunning, SOCKET_PATH } = require('../lib/client');

const args = process.argv.slice(2);
const command = args[0];

// Parse --page flag from args
function parsePageId(args) {
  const pageIndex = args.indexOf('--page');
  if (pageIndex !== -1 && args[pageIndex + 1]) {
    return args[pageIndex + 1];
  }
  return null;
}

// Parse --browser flag from args
function parseBrowserId(args) {
  const browserIndex = args.indexOf('--browser');
  if (browserIndex !== -1 && args[browserIndex + 1]) {
    return args[browserIndex + 1];
  }
  return null;
}

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
    
    // Poll for server to be ready (up to 10 seconds)
    const maxAttempts = 20;
    const pollInterval = 500;
    let started = false;
    
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      if (await isServerRunning()) {
        started = true;
        break;
      }
    }
    
    if (started) {
      console.log(`Playwright server started (socket: ${SOCKET_PATH})`);
      console.log('Browser is ready. Create a page with: playwright-cli new-page');
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
    
  } else if (command === 'new-page') {
    const browserId = parseBrowserId(args);
    try {
      const options = browserId ? { browserId } : {};
      const response = await sendCommand('newPage', options);
      if (response.success) {
        console.log(response.pageId);
      } else {
        console.error('Error:', response.error);
        process.exit(1);
      }
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
    
  } else if (command === 'close-page') {
    const pageId = args[1];
    if (!pageId) {
      console.error('Usage: playwright-cli close-page <pageId>');
      process.exit(1);
    }
    
    try {
      const response = await sendCommand('closePage', { pageId });
      if (response.success) {
        console.log('Page closed.');
      } else {
        console.error('Error:', response.error);
        process.exit(1);
      }
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
    
  } else if (command === 'list-pages') {
    try {
      const response = await sendCommand('listPages');
      if (response.success) {
        if (response.pages.length === 0) {
          console.log('No pages. Create one with: playwright-cli new-page');
        } else {
          for (const page of response.pages) {
            console.log(`${page.pageId}\t${page.browserId}\t${page.url}`);
          }
        }
      } else {
        console.error('Error:', response.error);
        process.exit(1);
      }
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
    
  } else if (command === 'new-browser') {
    try {
      const response = await sendCommand('newBrowser');
      if (response.success) {
        console.log(response.browserId);
      } else {
        console.error('Error:', response.error);
        process.exit(1);
      }
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
    
  } else if (command === 'close-browser') {
    const browserId = args[1];
    if (!browserId) {
      console.error('Usage: playwright-cli close-browser <browserId>');
      process.exit(1);
    }
    
    try {
      const response = await sendCommand('closeBrowser', { browserId });
      if (response.success) {
        console.log('Browser closed.');
      } else {
        console.error('Error:', response.error);
        process.exit(1);
      }
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
    
  } else if (command === 'list-browsers') {
    try {
      const response = await sendCommand('listBrowsers');
      if (response.success) {
        if (response.browsers.length === 0) {
          console.log('No browsers. Create one with: playwright-cli new-browser');
        } else {
          for (const browser of response.browsers) {
            const defaultMarker = browser.isDefault ? ' (default)' : '';
            const pageWord = browser.pageCount === 1 ? 'page' : 'pages';
            console.log(`${browser.browserId}\t${browser.pageCount} ${pageWord}${defaultMarker}`);
          }
        }
      } else {
        console.error('Error:', response.error);
        process.exit(1);
      }
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
    
  } else if (command === '-e' || command === '--eval') {
    const pageId = parsePageId(args);
    // Find code argument (skip --page and its value)
    let code = null;
    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--page') {
        i++; // skip page id
        continue;
      }
      code = args[i];
      break;
    }
    
    if (!code) {
      console.error('Usage: playwright-cli -e "code" --page <pageId>');
      process.exit(1);
    }
    
    if (!pageId) {
      console.error('Error: --page <pageId> is required. Create a page first with: playwright-cli new-page');
      process.exit(1);
    }
    
    try {
      const response = await sendCommand('exec', { code, pageId });
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
    
    const pageId = parsePageId(args);
    if (!pageId) {
      console.error('Error: --page <pageId> is required. Create a page first with: playwright-cli new-page');
      process.exit(1);
    }
    
    // Verify page exists
    try {
      const response = await sendCommand('listPages');
      if (!response.success || !response.pages.find(p => p.pageId === pageId)) {
        console.error(`Error: Page not found: ${pageId}`);
        process.exit(1);
      }
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
    
    console.log(`Playwright REPL (page: ${pageId}). Type JavaScript to execute against the browser.`);
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
          const response = await sendCommand('exec', { code, pageId });
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
  start              Start the Playwright server (launches browser in headless mode)
    --headed         Show the browser window (default: headless)
  stop               Stop the Playwright server
  status             Check if server is running

  Browser commands (for isolated sessions):
  new-browser        Create a new isolated browser session, returns browserId
  close-browser <id> Close a browser and all its pages
  list-browsers      List all browser sessions

  Page commands:
  new-page [--browser <id>]  Create a new page (in default browser if not specified)
  close-page <id>    Close a page by its pageId
  list-pages         List all active pages

  Execution:
  -e "code" --page <id>  Execute JavaScript code on a specific page
  repl --page <id>       Start interactive REPL for a specific page
  help                   Show this help message

Examples:
  # Basic usage (uses default browser)
  playwright-cli start --headed
  playwright-cli new-page                    # Returns: abc12345
  playwright-cli -e "await page.goto('https://example.com')" --page abc12345
  playwright-cli -e "await page.title()" --page abc12345
  playwright-cli list-pages
  playwright-cli close-page abc12345
  playwright-cli stop

  # Isolated browser session (separate cookies/auth)
  playwright-cli new-browser                 # Returns: xyz98765
  playwright-cli new-page --browser xyz98765 # Create page in isolated browser
  playwright-cli list-browsers
  playwright-cli close-browser xyz98765
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
