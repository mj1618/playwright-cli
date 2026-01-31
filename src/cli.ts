import { spawn } from 'child_process';
import * as path from 'path';
import * as repl from 'repl';
import { sendCommand, isServerRunning, SOCKET_PATH } from './client.js';
import type { CommandResponse, PageInfo } from './types.js';

const args = process.argv.slice(2);
const command = args[0];

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

// Parse --page flag from args
function parsePageId(args: string[]): string | null {
  const pageIndex = args.indexOf('--page');
  if (pageIndex !== -1 && args[pageIndex + 1] !== undefined) {
    return args[pageIndex + 1]!;
  }
  return null;
}

// Parse --browser flag from args
function parseBrowserId(args: string[]): string | null {
  const browserIndex = args.indexOf('--browser');
  if (browserIndex !== -1 && args[browserIndex + 1] !== undefined) {
    return args[browserIndex + 1]!;
  }
  return null;
}

async function main(): Promise<void> {
  if (command === 'start') {
    // Check if server is already running
    if (await isServerRunning()) {
      console.log('Server is already running.');
      return;
    }
    
    // Check for --headed flag
    const headed = args.includes('--headed');
    
    // Start server in background
    const serverPath = path.join(__dirname, 'server.js');
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
      console.error('Error stopping server:', getErrorMessage(err));
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
      console.error(getErrorMessage(err));
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
      console.error(getErrorMessage(err));
      process.exit(1);
    }
    
  } else if (command === 'list-pages') {
    try {
      const response = await sendCommand('listPages');
      if (response.success) {
        if (!response.pages || response.pages.length === 0) {
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
      console.error(getErrorMessage(err));
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
      console.error(getErrorMessage(err));
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
      console.error(getErrorMessage(err));
      process.exit(1);
    }
    
  } else if (command === 'list-browsers') {
    try {
      const response = await sendCommand('listBrowsers');
      if (response.success) {
        if (!response.browsers || response.browsers.length === 0) {
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
      console.error(getErrorMessage(err));
      process.exit(1);
    }
    
  } else if (command === '-e' || command === '--eval') {
    const pageId = parsePageId(args);
    // Find code argument (skip --page and its value)
    let code: string | null = null;
    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--page') {
        i++; // skip page id
        continue;
      }
      code = args[i] ?? null;
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
      console.error(getErrorMessage(err));
      process.exit(1);
    }
    
  // === Tier 1: Core Navigation and Interaction ===
  } else if (command === 'open' || command === 'goto') {
    const pageId = parsePageId(args);
    const url = args[1];
    if (!url || url.startsWith('--')) {
      console.error('Usage: playwright-cli open <url> --page <pageId>');
      process.exit(1);
    }
    if (!pageId) {
      console.error('Error: --page <pageId> is required');
      process.exit(1);
    }
    try {
      const response = await sendCommand('goto', { url, pageId });
      if (response.success) {
        console.log(response.result);
      } else {
        console.error('Error:', response.error);
        process.exit(1);
      }
    } catch (err) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
    
  } else if (command === 'click') {
    const pageId = parsePageId(args);
    const selector = args[1];
    if (!selector || selector.startsWith('--')) {
      console.error('Usage: playwright-cli click <selector> --page <pageId>');
      process.exit(1);
    }
    if (!pageId) {
      console.error('Error: --page <pageId> is required');
      process.exit(1);
    }
    try {
      const response = await sendCommand('click', { selector, pageId });
      if (response.success) {
        console.log(response.result);
      } else {
        console.error('Error:', response.error);
        process.exit(1);
      }
    } catch (err) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
    
  } else if (command === 'fill') {
    const pageId = parsePageId(args);
    const selector = args[1];
    const text = args[2];
    if (!selector || selector.startsWith('--') || text === undefined) {
      console.error('Usage: playwright-cli fill <selector> <text> --page <pageId>');
      process.exit(1);
    }
    if (!pageId) {
      console.error('Error: --page <pageId> is required');
      process.exit(1);
    }
    try {
      const response = await sendCommand('fill', { selector, text, pageId });
      if (response.success) {
        console.log(response.result);
      } else {
        console.error('Error:', response.error);
        process.exit(1);
      }
    } catch (err) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
    
  } else if (command === 'type') {
    const pageId = parsePageId(args);
    const selector = args[1];
    const text = args[2];
    if (!selector || selector.startsWith('--') || text === undefined) {
      console.error('Usage: playwright-cli type <selector> <text> --page <pageId>');
      process.exit(1);
    }
    if (!pageId) {
      console.error('Error: --page <pageId> is required');
      process.exit(1);
    }
    try {
      const response = await sendCommand('type', { selector, text, pageId });
      if (response.success) {
        console.log(response.result);
      } else {
        console.error('Error:', response.error);
        process.exit(1);
      }
    } catch (err) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
    
  } else if (command === 'press') {
    const pageId = parsePageId(args);
    const key = args[1];
    if (!key || key.startsWith('--')) {
      console.error('Usage: playwright-cli press <key> --page <pageId>');
      console.error('Keys: Enter, Tab, Escape, ArrowUp, ArrowDown, etc.');
      process.exit(1);
    }
    if (!pageId) {
      console.error('Error: --page <pageId> is required');
      process.exit(1);
    }
    try {
      const response = await sendCommand('press', { key, pageId });
      if (response.success) {
        console.log(response.result);
      } else {
        console.error('Error:', response.error);
        process.exit(1);
      }
    } catch (err) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
    
  } else if (command === 'hover') {
    const pageId = parsePageId(args);
    const selector = args[1];
    if (!selector || selector.startsWith('--')) {
      console.error('Usage: playwright-cli hover <selector> --page <pageId>');
      process.exit(1);
    }
    if (!pageId) {
      console.error('Error: --page <pageId> is required');
      process.exit(1);
    }
    try {
      const response = await sendCommand('hover', { selector, pageId });
      if (response.success) {
        console.log(response.result);
      } else {
        console.error('Error:', response.error);
        process.exit(1);
      }
    } catch (err) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
    
  } else if (command === 'screenshot') {
    const pageId = parsePageId(args);
    const pathArg = args[1] && !args[1].startsWith('--') ? args[1] : null;
    if (!pageId) {
      console.error('Error: --page <pageId> is required');
      process.exit(1);
    }
    try {
      const response = await sendCommand('screenshot', { path: pathArg, pageId });
      if (response.success) {
        console.log(response.result);
      } else {
        console.error('Error:', response.error);
        process.exit(1);
      }
    } catch (err) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
    
  // === Tier 2: Get Info Commands ===
  } else if (command === 'get') {
    const pageId = parsePageId(args);
    const subCommand = args[1];
    
    if (!pageId) {
      console.error('Error: --page <pageId> is required');
      process.exit(1);
    }
    
    if (subCommand === 'text') {
      const selector = args[2];
      if (!selector || selector.startsWith('--')) {
        console.error('Usage: playwright-cli get text <selector> --page <pageId>');
        process.exit(1);
      }
      try {
        const response = await sendCommand('getText', { selector, pageId });
        if (response.success) {
          console.log(response.result);
        } else {
          console.error('Error:', response.error);
          process.exit(1);
        }
      } catch (err) {
        console.error(getErrorMessage(err));
        process.exit(1);
      }
    } else if (subCommand === 'html') {
      const selector = args[2];
      if (!selector || selector.startsWith('--')) {
        console.error('Usage: playwright-cli get html <selector> --page <pageId>');
        process.exit(1);
      }
      try {
        const response = await sendCommand('getHtml', { selector, pageId });
        if (response.success) {
          console.log(response.result);
        } else {
          console.error('Error:', response.error);
          process.exit(1);
        }
      } catch (err) {
        console.error(getErrorMessage(err));
        process.exit(1);
      }
    } else if (subCommand === 'value') {
      const selector = args[2];
      if (!selector || selector.startsWith('--')) {
        console.error('Usage: playwright-cli get value <selector> --page <pageId>');
        process.exit(1);
      }
      try {
        const response = await sendCommand('getValue', { selector, pageId });
        if (response.success) {
          console.log(response.result);
        } else {
          console.error('Error:', response.error);
          process.exit(1);
        }
      } catch (err) {
        console.error(getErrorMessage(err));
        process.exit(1);
      }
    } else if (subCommand === 'title') {
      try {
        const response = await sendCommand('getTitle', { pageId });
        if (response.success) {
          console.log(response.result);
        } else {
          console.error('Error:', response.error);
          process.exit(1);
        }
      } catch (err) {
        console.error(getErrorMessage(err));
        process.exit(1);
      }
    } else if (subCommand === 'url') {
      try {
        const response = await sendCommand('getUrl', { pageId });
        if (response.success) {
          console.log(response.result);
        } else {
          console.error('Error:', response.error);
          process.exit(1);
        }
      } catch (err) {
        console.error(getErrorMessage(err));
        process.exit(1);
      }
    } else {
      console.error('Usage: playwright-cli get <text|html|value|title|url> [selector] --page <pageId>');
      process.exit(1);
    }
    
  // === Tier 3: Wait Commands ===
  } else if (command === 'wait') {
    const pageId = parsePageId(args);
    if (!pageId) {
      console.error('Error: --page <pageId> is required');
      process.exit(1);
    }
    
    // Check for --text, --url, --load flags
    const textIndex = args.indexOf('--text');
    const urlIndex = args.indexOf('--url');
    const loadIndex = args.indexOf('--load');
    
    let waitOptions: Record<string, unknown>;
    
    if (textIndex !== -1 && args[textIndex + 1] !== undefined) {
      waitOptions = { waitType: 'text', text: args[textIndex + 1], pageId };
    } else if (urlIndex !== -1 && args[urlIndex + 1] !== undefined) {
      waitOptions = { waitType: 'url', pattern: args[urlIndex + 1], pageId };
    } else if (loadIndex !== -1) {
      const nextArg = args[loadIndex + 1];
      const state = nextArg && !nextArg.startsWith('--') ? nextArg : 'load';
      waitOptions = { waitType: 'load', state, pageId };
    } else {
      const arg = args[1];
      if (!arg || arg.startsWith('--')) {
        console.error('Usage: playwright-cli wait <selector|ms> --page <pageId>');
        console.error('       playwright-cli wait --text "text" --page <pageId>');
        console.error('       playwright-cli wait --url "pattern" --page <pageId>');
        console.error('       playwright-cli wait --load [state] --page <pageId>');
        process.exit(1);
      }
      // Check if it's a number (milliseconds) or a selector
      if (/^\d+$/.test(arg)) {
        waitOptions = { waitType: 'timeout', ms: parseInt(arg, 10), pageId };
      } else {
        waitOptions = { waitType: 'selector', selector: arg, pageId };
      }
    }
    
    try {
      const response = await sendCommand('wait', waitOptions);
      if (response.success) {
        console.log(response.result);
      } else {
        console.error('Error:', response.error);
        process.exit(1);
      }
    } catch (err) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
    
  // === Tier 4: Navigation ===
  } else if (command === 'back') {
    const pageId = parsePageId(args);
    if (!pageId) {
      console.error('Error: --page <pageId> is required');
      process.exit(1);
    }
    try {
      const response = await sendCommand('back', { pageId });
      if (response.success) {
        console.log(response.result);
      } else {
        console.error('Error:', response.error);
        process.exit(1);
      }
    } catch (err) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
    
  } else if (command === 'forward') {
    const pageId = parsePageId(args);
    if (!pageId) {
      console.error('Error: --page <pageId> is required');
      process.exit(1);
    }
    try {
      const response = await sendCommand('forward', { pageId });
      if (response.success) {
        console.log(response.result);
      } else {
        console.error('Error:', response.error);
        process.exit(1);
      }
    } catch (err) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
    
  } else if (command === 'reload') {
    const pageId = parsePageId(args);
    if (!pageId) {
      console.error('Error: --page <pageId> is required');
      process.exit(1);
    }
    try {
      const response = await sendCommand('reload', { pageId });
      if (response.success) {
        console.log(response.result);
      } else {
        console.error('Error:', response.error);
        process.exit(1);
      }
    } catch (err) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
    
  // === Tier 5: Accessibility Snapshot ===
  } else if (command === 'snapshot') {
    const pageId = parsePageId(args);
    if (!pageId) {
      console.error('Error: --page <pageId> is required');
      process.exit(1);
    }
    
    const interestingOnly = !args.includes('-a'); // -a for all elements
    const compact = args.includes('-c');
    const depthIndex = args.indexOf('-d');
    const depthArg = depthIndex !== -1 ? args[depthIndex + 1] : undefined;
    const maxDepth = depthArg ? parseInt(depthArg, 10) : null;
    
    try {
      const response = await sendCommand('snapshot', { pageId, interestingOnly, compact, maxDepth });
      if (response.success) {
        console.log(response.result);
      } else {
        console.error('Error:', response.error);
        process.exit(1);
      }
    } catch (err) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
    
  // === Tier 6: State Checks ===
  } else if (command === 'is') {
    const pageId = parsePageId(args);
    const subCommand = args[1];
    const selector = args[2];
    
    if (!pageId) {
      console.error('Error: --page <pageId> is required');
      process.exit(1);
    }
    
    if (!selector || selector.startsWith('--')) {
      console.error('Usage: playwright-cli is <visible|enabled|checked> <selector> --page <pageId>');
      process.exit(1);
    }
    
    let cmdName: string;
    if (subCommand === 'visible') {
      cmdName = 'isVisible';
    } else if (subCommand === 'enabled') {
      cmdName = 'isEnabled';
    } else if (subCommand === 'checked') {
      cmdName = 'isChecked';
    } else {
      console.error('Usage: playwright-cli is <visible|enabled|checked> <selector> --page <pageId>');
      process.exit(1);
    }
    
    try {
      const response = await sendCommand(cmdName, { selector, pageId });
      if (response.success) {
        console.log(response.result);
      } else {
        console.error('Error:', response.error);
        process.exit(1);
      }
    } catch (err) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
    
  // === Tier 7: Additional Interaction ===
  } else if (command === 'check') {
    const pageId = parsePageId(args);
    const selector = args[1];
    if (!selector || selector.startsWith('--')) {
      console.error('Usage: playwright-cli check <selector> --page <pageId>');
      process.exit(1);
    }
    if (!pageId) {
      console.error('Error: --page <pageId> is required');
      process.exit(1);
    }
    try {
      const response = await sendCommand('check', { selector, pageId });
      if (response.success) {
        console.log(response.result);
      } else {
        console.error('Error:', response.error);
        process.exit(1);
      }
    } catch (err) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
    
  } else if (command === 'uncheck') {
    const pageId = parsePageId(args);
    const selector = args[1];
    if (!selector || selector.startsWith('--')) {
      console.error('Usage: playwright-cli uncheck <selector> --page <pageId>');
      process.exit(1);
    }
    if (!pageId) {
      console.error('Error: --page <pageId> is required');
      process.exit(1);
    }
    try {
      const response = await sendCommand('uncheck', { selector, pageId });
      if (response.success) {
        console.log(response.result);
      } else {
        console.error('Error:', response.error);
        process.exit(1);
      }
    } catch (err) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
    
  } else if (command === 'select') {
    const pageId = parsePageId(args);
    const selector = args[1];
    const value = args[2];
    if (!selector || selector.startsWith('--') || value === undefined) {
      console.error('Usage: playwright-cli select <selector> <value> --page <pageId>');
      process.exit(1);
    }
    if (!pageId) {
      console.error('Error: --page <pageId> is required');
      process.exit(1);
    }
    try {
      const response = await sendCommand('select', { selector, value, pageId });
      if (response.success) {
        console.log(response.result);
      } else {
        console.error('Error:', response.error);
        process.exit(1);
      }
    } catch (err) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
    
  } else if (command === 'dblclick') {
    const pageId = parsePageId(args);
    const selector = args[1];
    if (!selector || selector.startsWith('--')) {
      console.error('Usage: playwright-cli dblclick <selector> --page <pageId>');
      process.exit(1);
    }
    if (!pageId) {
      console.error('Error: --page <pageId> is required');
      process.exit(1);
    }
    try {
      const response = await sendCommand('dblclick', { selector, pageId });
      if (response.success) {
        console.log(response.result);
      } else {
        console.error('Error:', response.error);
        process.exit(1);
      }
    } catch (err) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
    
  } else if (command === 'scroll') {
    const pageId = parsePageId(args);
    const direction = args[1] || 'down';
    const amount = args[2] && !args[2].startsWith('--') ? parseInt(args[2], 10) : 300;
    
    if (!pageId) {
      console.error('Error: --page <pageId> is required');
      process.exit(1);
    }
    
    if (!['up', 'down', 'left', 'right'].includes(direction)) {
      console.error('Usage: playwright-cli scroll <up|down|left|right> [pixels] --page <pageId>');
      process.exit(1);
    }
    
    try {
      const response = await sendCommand('scroll', { direction, amount, pageId });
      if (response.success) {
        console.log(response.result);
      } else {
        console.error('Error:', response.error);
        process.exit(1);
      }
    } catch (err) {
      console.error(getErrorMessage(err));
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
      if (!response.success || !response.pages?.find((p: PageInfo) => p.pageId === pageId)) {
        console.error(`Error: Page not found: ${pageId}`);
        process.exit(1);
      }
    } catch (err) {
      console.error(getErrorMessage(err));
      process.exit(1);
    }
    
    console.log(`Playwright REPL (page: ${pageId}). Type JavaScript to execute against the browser.`);
    console.log('Variables available: page, browser, context');
    console.log('Press Ctrl+C to exit.\n');
    
    repl.start({
      prompt: 'playwright> ',
      eval: async (input: string, _context: unknown, _filename: string, callback: (err: Error | null, result?: unknown) => void) => {
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
          callback(err instanceof Error ? err : new Error(String(err)));
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

  Navigation:
  open <url>         Navigate to URL (alias: goto)
  back               Go back in history
  forward            Go forward in history
  reload             Reload the page

  Interaction:
  click <selector>   Click an element
  fill <sel> <text>  Fill input with text (clears first)
  type <sel> <text>  Type text into element (keystroke by keystroke)
  press <key>        Press a keyboard key (Enter, Tab, Escape, etc.)
  hover <selector>   Hover over an element
  dblclick <sel>     Double-click an element
  check <selector>   Check a checkbox
  uncheck <selector> Uncheck a checkbox
  select <sel> <val> Select dropdown option by value

  Get info:
  get text <sel>     Get text content of element
  get html <sel>     Get innerHTML of element
  get value <sel>    Get input value
  get title          Get page title
  get url            Get current URL
  screenshot [path]  Take screenshot (saves to path if provided)

  Wait:
  wait <selector>    Wait for element to be visible
  wait <ms>          Wait for milliseconds
  wait --text "txt"  Wait for text to appear
  wait --url "pat"   Wait for URL to match pattern
  wait --load [st]   Wait for load state (load, domcontentloaded, networkidle)

  State checks:
  is visible <sel>   Check if element is visible
  is enabled <sel>   Check if element is enabled
  is checked <sel>   Check if checkbox is checked

  Accessibility:
  snapshot           Get accessibility tree with refs (@e0, @e1, ...)
    -a               Include all elements (not just interesting ones)
    -c               Compact JSON output
    -d <depth>       Limit tree depth

  Scroll:
  scroll <dir> [px]  Scroll page (up/down/left/right), default 300px

  Raw execution:
  -e "code" --page <id>  Execute JavaScript code on a specific page
  repl --page <id>       Start interactive REPL for a specific page
  help                   Show this help message

All commands that interact with the page require --page <pageId>.

Examples:
  # Basic workflow
  playwright-cli start --headed
  playwright-cli new-page                    # Returns: abc12345
  playwright-cli open https://example.com --page abc12345
  playwright-cli click "a.nav-link" --page abc12345
  playwright-cli fill "#search" "query" --page abc12345
  playwright-cli press Enter --page abc12345
  playwright-cli screenshot /tmp/shot.png --page abc12345
  playwright-cli get title --page abc12345
  playwright-cli close-page abc12345
  playwright-cli stop

  # Wait examples
  playwright-cli wait ".loading" --page abc12345
  playwright-cli wait 2000 --page abc12345
  playwright-cli wait --text "Success" --page abc12345
  playwright-cli wait --load networkidle --page abc12345

  # Accessibility snapshot
  playwright-cli snapshot --page abc12345
  playwright-cli snapshot -d 3 --page abc12345   # Depth limit

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
  console.error(getErrorMessage(err));
  process.exit(1);
});
