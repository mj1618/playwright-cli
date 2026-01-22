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
    if (result.stdout.includes('running')) {
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
      assert.ok(result.stdout.includes('-e, --eval'));
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
      const result = await runCLI(['-e', 'page.url()']);
      assert.strictEqual(result.code, 1);
      assert.ok(result.stdout.includes('not running') || result.stderr.includes('not running'));
    });
  });

  describe('server lifecycle', () => {
    it('should start server', async () => {
      cleanup();
      const result = await runCLI(['start'], { timeout: 15000 });
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

  describe('code execution', () => {
    it('should get page URL', async () => {
      const result = await runCLI(['-e', 'page.url()']);
      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('about:blank'));
    });

    it('should navigate to a page', async () => {
      const result = await runCLI(['-e', "await page.goto('https://example.com')"], { timeout: 15000 });
      assert.strictEqual(result.code, 0);
    });

    it('should get page title', async () => {
      const result = await runCLI(['-e', 'await page.title()']);
      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('Example Domain'));
    });

    it('should get current URL after navigation', async () => {
      const result = await runCLI(['-e', 'page.url()']);
      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('example.com'));
    });

    it('should evaluate JavaScript in page context', async () => {
      const result = await runCLI(['-e', 'await page.evaluate(() => document.title)']);
      assert.strictEqual(result.code, 0);
      assert.ok(result.stdout.includes('Example Domain'));
    });

    it('should take screenshot', async () => {
      const screenshotPath = path.join(os.tmpdir(), 'playwright-cli-test-screenshot.png');
      // Clean up any existing screenshot
      try { fs.unlinkSync(screenshotPath); } catch {}
      
      const result = await runCLI(['-e', `await page.screenshot({ path: '${screenshotPath}' })`]);
      assert.strictEqual(result.code, 0);
      assert.ok(fs.existsSync(screenshotPath), 'Screenshot file should exist');
      
      const stats = fs.statSync(screenshotPath);
      assert.ok(stats.size > 0, 'Screenshot should have content');
      
      // Clean up
      fs.unlinkSync(screenshotPath);
    });

    it('should handle syntax errors gracefully', async () => {
      const result = await runCLI(['-e', 'invalid syntax here']);
      assert.strictEqual(result.code, 1);
      assert.ok(result.stderr.includes('Error'));
    });

    it('should handle runtime errors gracefully', async () => {
      const result = await runCLI(['-e', 'await page.click("#nonexistent")', '--timeout=1000']);
      assert.strictEqual(result.code, 1);
    });

    it('should show error when -e has no code', async () => {
      const result = await runCLI(['-e']);
      assert.strictEqual(result.code, 1);
      assert.ok(result.stderr.includes('Usage'));
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
