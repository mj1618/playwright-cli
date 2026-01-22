const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CLI_PATH = path.join(__dirname, '..', 'bin', 'playwright-cli.js');
const SOCKET_PATH = process.env.PLAYWRIGHT_CLI_SOCKET || path.join(os.homedir(), '.playwright-cli.sock');

// Helper to run CLI commands
function runCLI(args, options = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, PLAYWRIGHT_CLI_HEADLESS: 'true' };
    const proc = spawn('node', [CLI_PATH, ...args], { 
      env,
      timeout: options.timeout || 30000 
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    
    proc.on('close', (code) => {
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
    
    proc.on('error', reject);
  });
}

// Helper to wait for server to be ready
async function waitForServer(maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await runCLI(['status']);
    // Check for "is running" to avoid matching "not running"
    if (result.stdout.includes('is running')) {
      return true;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

// Cleanup helper
function cleanup() {
  try {
    execSync(`pkill -f "lib/server.js"`, { stdio: 'ignore' });
  } catch {}
  try {
    if (fs.existsSync(SOCKET_PATH)) {
      fs.unlinkSync(SOCKET_PATH);
    }
  } catch {}
}

describe('playwright-cli', () => {
  before(() => {
    cleanup();
  });

  after(() => {
    cleanup();
  });

  describe('help command', () => {
    it('should show help with no arguments', async () => {
      const result = await runCLI([]);
      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('Usage: playwright-cli'));
      assert.ok(result.stdout.includes('start'));
      assert.ok(result.stdout.includes('stop'));
      assert.ok(result.stdout.includes('-e'));
      assert.ok(result.stdout.includes('new-page'));
    });

    it('should show help with help command', async () => {
      const result = await runCLI(['help']);
      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('Usage: playwright-cli'));
    });

    it('should show help with --help flag', async () => {
      const result = await runCLI(['--help']);
      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('Usage: playwright-cli'));
    });
  });

  describe('unknown command', () => {
    it('should error on unknown command', async () => {
      const result = await runCLI(['unknowncmd']);
      assert.strictEqual(result.code, 1);
      assert.ok(result.stderr.includes('Unknown command'));
    });
  });

  describe('status command (server not running)', () => {
    it('should report server not running', async () => {
      cleanup();
      const result = await runCLI(['status']);
      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('not running'));
    });
  });

  describe('exec command (server not running)', () => {
    it('should error when server not running', async () => {
      cleanup();
      const result = await runCLI(['-e', 'page.url()', '--page', 'test123']);
      assert.strictEqual(result.code, 1);
      assert.ok(result.stdout.includes('not running') || result.stderr.includes('not running'));
    });

    it('should error when --page is not provided', async () => {
      const result = await runCLI(['-e', 'page.url()']);
      assert.strictEqual(result.code, 1);
      assert.ok(result.stderr.includes('--page') || result.stderr.includes('pageId'));
    });
  });

  describe('server lifecycle', () => {
    it('should start server', async () => {
      cleanup();
      const result = await runCLI(['start'], { timeout: 30000 });
      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('started') || result.stdout.includes('ready'));
    });

    it('should report server running after start', async () => {
      const ready = await waitForServer();
      assert.ok(ready, 'Server should be running');
      
      const result = await runCLI(['status']);
      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('running'));
      assert.ok(!result.stdout.includes('not running'));
    });

    it('should detect already running on second start', async () => {
      const result = await runCLI(['start']);
      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('already running'));
    });
  });

  describe('page management', () => {
    let pageId;

    it('should list no pages initially', async () => {
      const result = await runCLI(['list-pages']);
      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('No pages'));
    });

    it('should create a new page', async () => {
      const result = await runCLI(['new-page']);
      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.length === 8, 'pageId should be 8 characters');
      pageId = result.stdout;
    });

    it('should list the created page', async () => {
      const result = await runCLI(['list-pages']);
      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes(pageId));
      assert.ok(result.stdout.includes('about:blank'));
    });

    it('should create a second page', async () => {
      const result = await runCLI(['new-page']);
      assert.strictEqual(result.code, 0);
      const secondPageId = result.stdout;
      assert.ok(secondPageId.length === 8);
      assert.notStrictEqual(secondPageId, pageId, 'Page IDs should be unique');
    });

    it('should list multiple pages', async () => {
      const result = await runCLI(['list-pages']);
      assert.strictEqual(result.code, 0);
      const lines = result.stdout.split('\n');
      assert.ok(lines.length >= 2, 'Should have at least 2 pages listed');
    });
  });

  describe('code execution with pageId', () => {
    let pageId;

    before(async () => {
      // Create a fresh page for these tests
      const result = await runCLI(['new-page']);
      pageId = result.stdout;
    });

    it('should get page URL', async () => {
      const result = await runCLI(['-e', 'page.url()', '--page', pageId]);
      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('about:blank'));
    });

    it('should navigate to a page', async () => {
      const result = await runCLI(['-e', "await page.goto('https://example.com')", '--page', pageId], { timeout: 15000 });
      assert.strictEqual(result.code, 0);
    });

    it('should get page title', async () => {
      const result = await runCLI(['-e', 'await page.title()', '--page', pageId]);
      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('Example Domain'));
    });

    it('should get current URL after navigation', async () => {
      const result = await runCLI(['-e', 'page.url()', '--page', pageId]);
      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('example.com'));
    });

    it('should evaluate JavaScript in page context', async () => {
      const result = await runCLI(['-e', 'await page.evaluate(() => document.title)', '--page', pageId]);
      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('Example Domain'));
    });

    it('should take screenshot', async () => {
      const screenshotPath = path.join(os.tmpdir(), 'playwright-cli-test-screenshot.png');
      // Clean up any existing screenshot
      try { fs.unlinkSync(screenshotPath); } catch {}
      
      const result = await runCLI(['-e', `await page.screenshot({ path: '${screenshotPath}' })`, '--page', pageId]);
      assert.strictEqual(result.code, 0);
      assert.ok(fs.existsSync(screenshotPath), 'Screenshot file should exist');
      
      const stats = fs.statSync(screenshotPath);
      assert.ok(stats.size > 0, 'Screenshot should have content');
      
      // Clean up
      fs.unlinkSync(screenshotPath);
    });

    it('should handle syntax errors gracefully', async () => {
      const result = await runCLI(['-e', 'invalid syntax here', '--page', pageId]);
      assert.strictEqual(result.code, 1);
      assert.ok(result.stderr.includes('Error'));
    });

    it('should handle runtime errors gracefully', async () => {
      const result = await runCLI(['-e', 'await page.click("#nonexistent", { timeout: 1000 })', '--page', pageId], { timeout: 10000 });
      assert.strictEqual(result.code, 1);
      assert.ok(result.stderr.includes('Error'));
    });

    it('should error when -e has no code', async () => {
      const result = await runCLI(['-e', '--page', pageId]);
      assert.strictEqual(result.code, 1);
      assert.ok(result.stderr.includes('Usage') || result.stderr.includes('pageId'));
    });

    it('should error when page does not exist', async () => {
      const result = await runCLI(['-e', 'page.url()', '--page', 'nonexistent']);
      assert.strictEqual(result.code, 1);
      assert.ok(result.stderr.includes('not found') || result.stderr.includes('Page not found'));
    });
  });

  describe('page isolation', () => {
    it('should isolate pages from each other', async () => {
      // Create two pages
      const result1 = await runCLI(['new-page']);
      const page1 = result1.stdout;
      
      const result2 = await runCLI(['new-page']);
      const page2 = result2.stdout;
      
      // Navigate page1 to example.com
      await runCLI(['-e', "await page.goto('https://example.com')", '--page', page1], { timeout: 15000 });
      
      // Navigate page2 to a different URL
      await runCLI(['-e', "await page.goto('https://www.iana.org/')", '--page', page2], { timeout: 15000 });
      
      // Verify page1 is still on example.com
      const url1 = await runCLI(['-e', 'page.url()', '--page', page1]);
      assert.ok(url1.stdout.includes('example.com'), 'Page 1 should be on example.com');
      
      // Verify page2 is on iana.org
      const url2 = await runCLI(['-e', 'page.url()', '--page', page2]);
      assert.ok(url2.stdout.includes('iana.org'), 'Page 2 should be on iana.org');
    });
  });

  describe('close-page command', () => {
    it('should close a page', async () => {
      const newPageResult = await runCLI(['new-page']);
      const pageId = newPageResult.stdout;
      
      const result = await runCLI(['close-page', pageId]);
      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('closed'));
      
      // Verify the page is gone
      const execResult = await runCLI(['-e', 'page.url()', '--page', pageId]);
      assert.strictEqual(execResult.code, 1);
      assert.ok(execResult.stderr.includes('not found'));
    });

    it('should error when closing non-existent page', async () => {
      const result = await runCLI(['close-page', 'nonexistent']);
      assert.strictEqual(result.code, 1);
      assert.ok(result.stderr.includes('not found'));
    });

    it('should show usage when no pageId provided', async () => {
      const result = await runCLI(['close-page']);
      assert.strictEqual(result.code, 1);
      assert.ok(result.stderr.includes('Usage'));
    });
  });

  describe('browser management', () => {
    before(async () => {
      // Ensure server is running
      cleanup();
      await runCLI(['start'], { timeout: 30000 });
      await waitForServer();
    });

    it('should list no browsers initially', async () => {
      const result = await runCLI(['list-browsers']);
      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('No browsers'));
    });

    it('should create a new isolated browser', async () => {
      const result = await runCLI(['new-browser']);
      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.length === 8, 'browserId should be 8 characters');
    });

    it('should list the created browser', async () => {
      const result = await runCLI(['list-browsers']);
      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('0 pages'));
    });

    it('should create page in specific browser', async () => {
      // Create a new browser
      const browserResult = await runCLI(['new-browser']);
      const browserId = browserResult.stdout;
      
      // Create page in that browser
      const pageResult = await runCLI(['new-page', '--browser', browserId]);
      assert.strictEqual(pageResult.code, 0);
      const pageId = pageResult.stdout;
      
      // Verify the browser now has 1 page
      const listResult = await runCLI(['list-browsers']);
      assert.ok(listResult.stdout.includes('1 page'));
      
      // Verify list-pages shows the browser ID
      const pagesResult = await runCLI(['list-pages']);
      assert.ok(pagesResult.stdout.includes(pageId));
      assert.ok(pagesResult.stdout.includes(browserId));
    });

    it('should auto-create default browser when creating page without --browser', async () => {
      // Create a page without specifying browser (should go to default)
      const pageResult = await runCLI(['new-page']);
      assert.strictEqual(pageResult.code, 0);
      
      // Verify default browser appears in list
      const listResult = await runCLI(['list-browsers']);
      assert.ok(listResult.stdout.includes('default'));
      assert.ok(listResult.stdout.includes('(default)'));
    });

    it('should error when creating page in non-existent browser', async () => {
      const result = await runCLI(['new-page', '--browser', 'nonexistent']);
      assert.strictEqual(result.code, 1);
      assert.ok(result.stderr.includes('not found') || result.stderr.includes('Browser not found'));
    });

    it('should close a browser and all its pages', async () => {
      // Create a browser with a page
      const browserResult = await runCLI(['new-browser']);
      const browserId = browserResult.stdout;
      
      await runCLI(['new-page', '--browser', browserId]);
      await runCLI(['new-page', '--browser', browserId]);
      
      // Close the browser
      const closeResult = await runCLI(['close-browser', browserId]);
      assert.strictEqual(closeResult.code, 0);
      assert.ok(closeResult.stdout.includes('closed'));
      
      // Verify browser is gone
      const listResult = await runCLI(['list-browsers']);
      assert.ok(!listResult.stdout.includes(browserId));
    });

    it('should error when closing non-existent browser', async () => {
      const result = await runCLI(['close-browser', 'nonexistent']);
      assert.strictEqual(result.code, 1);
      assert.ok(result.stderr.includes('not found'));
    });

    it('should show usage when no browserId provided to close-browser', async () => {
      const result = await runCLI(['close-browser']);
      assert.strictEqual(result.code, 1);
      assert.ok(result.stderr.includes('Usage'));
    });
  });

  describe('browser isolation (auth/cookies)', () => {
    let browser1Id, browser2Id, page1Id, page2Id;

    before(async () => {
      // Ensure server is running
      if (!(await waitForServer(3))) {
        cleanup();
        await runCLI(['start'], { timeout: 30000 });
        await waitForServer();
      }
      
      // Create two isolated browsers
      const b1Result = await runCLI(['new-browser']);
      browser1Id = b1Result.stdout;
      
      const b2Result = await runCLI(['new-browser']);
      browser2Id = b2Result.stdout;
      
      // Create a page in each
      const p1Result = await runCLI(['new-page', '--browser', browser1Id]);
      page1Id = p1Result.stdout;
      
      const p2Result = await runCLI(['new-page', '--browser', browser2Id]);
      page2Id = p2Result.stdout;
    });

    it('should have separate localStorage between browsers', async () => {
      // Set localStorage in browser 1
      await runCLI(['-e', "await page.goto('https://example.com')", '--page', page1Id], { timeout: 15000 });
      await runCLI(['-e', "await page.evaluate(() => localStorage.setItem('test', 'browser1'))", '--page', page1Id]);
      
      // Navigate browser 2 to same site
      await runCLI(['-e', "await page.goto('https://example.com')", '--page', page2Id], { timeout: 15000 });
      
      // Verify browser 2 doesn't have the localStorage item
      const result = await runCLI(['-e', "await page.evaluate(() => localStorage.getItem('test'))", '--page', page2Id]);
      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout === 'null', 'Browser 2 should not see localStorage from Browser 1');
      
      // Verify browser 1 still has it
      const result1 = await runCLI(['-e', "await page.evaluate(() => localStorage.getItem('test'))", '--page', page1Id]);
      assert.strictEqual(result1.code, 0);
      assert.ok(result1.stdout === 'browser1', 'Browser 1 should still have its localStorage');
    });

    it('should have separate cookies between browsers', async () => {
      // Set a cookie in browser 1
      await runCLI(['-e', "await page.evaluate(() => document.cookie = 'session=abc123')", '--page', page1Id]);
      
      // Navigate browser 2 to same site (already there from previous test)
      // Check browser 2 doesn't have the cookie
      const result = await runCLI(['-e', "await page.evaluate(() => document.cookie)", '--page', page2Id]);
      assert.strictEqual(result.code, 0);
      assert.ok(!result.stdout.includes('session=abc123'), 'Browser 2 should not see cookies from Browser 1');
      
      // Verify browser 1 still has the cookie
      const result1 = await runCLI(['-e', "await page.evaluate(() => document.cookie)", '--page', page1Id]);
      assert.ok(result1.stdout.includes('session=abc123'), 'Browser 1 should still have its cookie');
    });

    after(async () => {
      // Clean up browsers
      if (browser1Id) await runCLI(['close-browser', browser1Id]);
      if (browser2Id) await runCLI(['close-browser', browser2Id]);
    });
  });

  describe('stop command', () => {
    it('should stop the server', async () => {
      const result = await runCLI(['stop']);
      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('stopped'));
    });

    it('should report not running after stop', async () => {
      // Give server time to fully shut down
      await new Promise(r => setTimeout(r, 1000));
      
      const result = await runCLI(['status']);
      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('not running'));
    });

    it('should handle stop when already stopped', async () => {
      const result = await runCLI(['stop']);
      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('not running'));
    });
  });
});
