import { chromium, Browser, Page } from 'playwright';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import type { BrowserData, FoundPage, ServerOptions, CommandRequest, PageInfo, BrowserInfo } from './types.js';

export const SOCKET_PATH = process.env.PLAYWRIGHT_CLI_SOCKET || path.join(os.homedir(), '.playwright-cli.sock');

let browser: Browser | null = null;
const DEFAULT_BROWSER_ID = 'default';
const browsers = new Map<string, BrowserData>();

function generateId(): string {
  return crypto.randomUUID().slice(0, 8);
}

// Helper to get or create the default browser context
async function getOrCreateDefaultBrowser(): Promise<BrowserData> {
  if (!browsers.has(DEFAULT_BROWSER_ID)) {
    if (!browser) {
      throw new Error('Browser not initialized');
    }
    const context = await browser.newContext();
    browsers.set(DEFAULT_BROWSER_ID, { context, pages: new Map() });
  }
  return browsers.get(DEFAULT_BROWSER_ID)!;
}

// Helper to find a page across all browsers
function findPage(pageId: string): FoundPage | null {
  for (const [browserId, browserData] of browsers) {
    if (browserData.pages.has(pageId)) {
      return { browserId, page: browserData.pages.get(pageId)!, browserData };
    }
  }
  return null;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

export async function startServer(options: ServerOptions = {}): Promise<void> {
  const headless = options.headless !== false; // headless by default
  
  // Clean up stale socket if it exists
  if (fs.existsSync(SOCKET_PATH)) {
    fs.unlinkSync(SOCKET_PATH);
  }

  // Launch browser (contexts created on demand)
  browser = await chromium.launch({ headless });

  const server = net.createServer((socket) => {
    let data = '';
    
    socket.on('data', async (chunk: Buffer) => {
      data += chunk.toString();
      
      // Check if we have a complete message (newline-delimited)
      const newlineIndex = data.indexOf('\n');
      if (newlineIndex === -1) return;
      
      const message = data.slice(0, newlineIndex);
      data = data.slice(newlineIndex + 1);
      
      try {
        const request = JSON.parse(message) as CommandRequest;
        
        // === Browser commands ===
        if (request.command === 'newBrowser') {
          try {
            if (!browser) {
              socket.end(JSON.stringify({ success: false, error: 'Browser not initialized' }));
              return;
            }
            const browserId = generateId();
            const context = await browser.newContext();
            browsers.set(browserId, { context, pages: new Map() });
            socket.end(JSON.stringify({ success: true, browserId }));
          } catch (err) {
            socket.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
        } else if (request.command === 'closeBrowser') {
          const browserId = request.browserId;
          if (!browserId) {
            socket.end(JSON.stringify({ success: false, error: 'browserId is required' }));
            return;
          }
          const browserData = browsers.get(browserId);
          if (!browserData) {
            socket.end(JSON.stringify({ success: false, error: `Browser not found: ${browserId}` }));
            return;
          }
          try {
            // Close all pages first
            for (const page of browserData.pages.values()) {
              await page.close();
            }
            await browserData.context.close();
            browsers.delete(browserId);
            socket.end(JSON.stringify({ success: true, result: 'Browser closed' }));
          } catch (err) {
            socket.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
        } else if (request.command === 'listBrowsers') {
          const browserList: BrowserInfo[] = [];
          for (const [id, browserData] of browsers) {
            browserList.push({ 
              browserId: id, 
              pageCount: browserData.pages.size,
              isDefault: id === DEFAULT_BROWSER_ID
            });
          }
          socket.end(JSON.stringify({ success: true, browsers: browserList }));
        
        // === Page commands ===
        } else if (request.command === 'newPage') {
          try {
            const browserId = request.browserId || DEFAULT_BROWSER_ID;
            let browserData: BrowserData;
            
            if (browserId === DEFAULT_BROWSER_ID) {
              browserData = await getOrCreateDefaultBrowser();
            } else {
              const found = browsers.get(browserId);
              if (!found) {
                socket.end(JSON.stringify({ success: false, error: `Browser not found: ${browserId}. Create one with: playwright-cli new-browser` }));
                return;
              }
              browserData = found;
            }
            
            const pageId = generateId();
            const page = await browserData.context.newPage();
            await page.goto('about:blank');
            browserData.pages.set(pageId, page);
            socket.end(JSON.stringify({ success: true, pageId, browserId }));
          } catch (err) {
            socket.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
        } else if (request.command === 'closePage') {
          const pageId = request.pageId;
          if (!pageId) {
            socket.end(JSON.stringify({ success: false, error: 'pageId is required' }));
            return;
          }
          const found = findPage(pageId);
          if (!found) {
            socket.end(JSON.stringify({ success: false, error: `Page not found: ${pageId}` }));
            return;
          }
          try {
            await found.page.close();
            found.browserData.pages.delete(pageId);
            socket.end(JSON.stringify({ success: true, result: 'Page closed' }));
          } catch (err) {
            socket.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
        } else if (request.command === 'listPages') {
          const pageList: PageInfo[] = [];
          for (const [browserId, browserData] of browsers) {
            for (const [pageId, page] of browserData.pages) {
              try {
                pageList.push({ pageId, browserId, url: page.url() });
              } catch {
                pageList.push({ pageId, browserId, url: 'unknown' });
              }
            }
          }
          socket.end(JSON.stringify({ success: true, pages: pageList }));
        } else if (request.command === 'exec') {
          const pageId = request.pageId;
          if (!pageId) {
            socket.end(JSON.stringify({ success: false, error: 'pageId is required. Create a page first with: playwright-cli new-page' }));
            return;
          }
          const found = findPage(pageId);
          if (!found) {
            socket.end(JSON.stringify({ success: false, error: `Page not found: ${pageId}` }));
            return;
          }
          try {
            // Create a function with page, browser, context in scope
            const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor as new (...args: string[]) => (...args: unknown[]) => Promise<unknown>;
            const fn = new AsyncFunction('page', 'browser', 'context', `return (${request.code})`);
            const result = await fn(found.page, browser, found.browserData.context);
            
            // Serialize result
            let serialized: string;
            if (result === undefined) {
              serialized = 'undefined';
            } else if (result === null) {
              serialized = 'null';
            } else if (typeof result === 'object') {
              try {
                serialized = JSON.stringify(result, null, 2);
              } catch {
                serialized = String(result);
              }
            } else {
              serialized = String(result);
            }
            
            socket.end(JSON.stringify({ success: true, result: serialized }));
          } catch (err) {
            socket.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
        } else if (request.command === 'ping') {
          socket.end(JSON.stringify({ success: true, result: 'pong' }));
        } else if (request.command === 'stop') {
          socket.end(JSON.stringify({ success: true, result: 'stopping' }));
          await shutdown();
        
        // === Tier 1: Core Navigation and Interaction ===
        } else if (request.command === 'goto') {
          const found = findPage(request.pageId);
          if (!found) {
            socket.end(JSON.stringify({ success: false, error: `Page not found: ${request.pageId}` }));
            return;
          }
          try {
            await found.page.goto(request.url);
            socket.end(JSON.stringify({ success: true, result: found.page.url() }));
          } catch (err) {
            socket.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
        } else if (request.command === 'click') {
          const found = findPage(request.pageId);
          if (!found) {
            socket.end(JSON.stringify({ success: false, error: `Page not found: ${request.pageId}` }));
            return;
          }
          try {
            await found.page.click(request.selector);
            socket.end(JSON.stringify({ success: true, result: 'clicked' }));
          } catch (err) {
            socket.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
        } else if (request.command === 'fill') {
          const found = findPage(request.pageId);
          if (!found) {
            socket.end(JSON.stringify({ success: false, error: `Page not found: ${request.pageId}` }));
            return;
          }
          try {
            await found.page.fill(request.selector, request.text);
            socket.end(JSON.stringify({ success: true, result: 'filled' }));
          } catch (err) {
            socket.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
        } else if (request.command === 'type') {
          const found = findPage(request.pageId);
          if (!found) {
            socket.end(JSON.stringify({ success: false, error: `Page not found: ${request.pageId}` }));
            return;
          }
          try {
            await found.page.type(request.selector, request.text);
            socket.end(JSON.stringify({ success: true, result: 'typed' }));
          } catch (err) {
            socket.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
        } else if (request.command === 'press') {
          const found = findPage(request.pageId);
          if (!found) {
            socket.end(JSON.stringify({ success: false, error: `Page not found: ${request.pageId}` }));
            return;
          }
          try {
            await found.page.keyboard.press(request.key);
            socket.end(JSON.stringify({ success: true, result: 'pressed' }));
          } catch (err) {
            socket.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
        } else if (request.command === 'hover') {
          const found = findPage(request.pageId);
          if (!found) {
            socket.end(JSON.stringify({ success: false, error: `Page not found: ${request.pageId}` }));
            return;
          }
          try {
            await found.page.hover(request.selector);
            socket.end(JSON.stringify({ success: true, result: 'hovered' }));
          } catch (err) {
            socket.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
        } else if (request.command === 'screenshot') {
          const found = findPage(request.pageId);
          if (!found) {
            socket.end(JSON.stringify({ success: false, error: `Page not found: ${request.pageId}` }));
            return;
          }
          try {
            const screenshotOptions = request.path ? { path: request.path } : {};
            const buffer = await found.page.screenshot(screenshotOptions);
            const result = request.path ? `Screenshot saved to ${request.path}` : `Screenshot captured (${buffer.length} bytes)`;
            socket.end(JSON.stringify({ success: true, result }));
          } catch (err) {
            socket.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
        
        // === Tier 2: Get Info Commands ===
        } else if (request.command === 'getText') {
          const found = findPage(request.pageId);
          if (!found) {
            socket.end(JSON.stringify({ success: false, error: `Page not found: ${request.pageId}` }));
            return;
          }
          try {
            const text = await found.page.textContent(request.selector);
            socket.end(JSON.stringify({ success: true, result: text }));
          } catch (err) {
            socket.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
        } else if (request.command === 'getHtml') {
          const found = findPage(request.pageId);
          if (!found) {
            socket.end(JSON.stringify({ success: false, error: `Page not found: ${request.pageId}` }));
            return;
          }
          try {
            const html = await found.page.innerHTML(request.selector);
            socket.end(JSON.stringify({ success: true, result: html }));
          } catch (err) {
            socket.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
        } else if (request.command === 'getValue') {
          const found = findPage(request.pageId);
          if (!found) {
            socket.end(JSON.stringify({ success: false, error: `Page not found: ${request.pageId}` }));
            return;
          }
          try {
            const value = await found.page.inputValue(request.selector);
            socket.end(JSON.stringify({ success: true, result: value }));
          } catch (err) {
            socket.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
        } else if (request.command === 'getTitle') {
          const found = findPage(request.pageId);
          if (!found) {
            socket.end(JSON.stringify({ success: false, error: `Page not found: ${request.pageId}` }));
            return;
          }
          try {
            const title = await found.page.title();
            socket.end(JSON.stringify({ success: true, result: title }));
          } catch (err) {
            socket.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
        } else if (request.command === 'getUrl') {
          const found = findPage(request.pageId);
          if (!found) {
            socket.end(JSON.stringify({ success: false, error: `Page not found: ${request.pageId}` }));
            return;
          }
          try {
            const url = found.page.url();
            socket.end(JSON.stringify({ success: true, result: url }));
          } catch (err) {
            socket.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
        
        // === Tier 3: Wait Commands ===
        } else if (request.command === 'wait') {
          const found = findPage(request.pageId);
          if (!found) {
            socket.end(JSON.stringify({ success: false, error: `Page not found: ${request.pageId}` }));
            return;
          }
          try {
            if (request.waitType === 'selector') {
              await found.page.waitForSelector(request.selector, { state: 'visible' });
              socket.end(JSON.stringify({ success: true, result: 'Element visible' }));
            } else if (request.waitType === 'timeout') {
              await found.page.waitForTimeout(request.ms);
              socket.end(JSON.stringify({ success: true, result: `Waited ${request.ms}ms` }));
            } else if (request.waitType === 'text') {
              await found.page.waitForSelector(`text=${request.text}`, { state: 'visible' });
              socket.end(JSON.stringify({ success: true, result: 'Text found' }));
            } else if (request.waitType === 'url') {
              await found.page.waitForURL(request.pattern);
              socket.end(JSON.stringify({ success: true, result: 'URL matched' }));
            } else if (request.waitType === 'load') {
              await found.page.waitForLoadState(request.state || 'load');
              socket.end(JSON.stringify({ success: true, result: `Load state: ${request.state || 'load'}` }));
            } else {
              socket.end(JSON.stringify({ success: false, error: 'Invalid wait type' }));
            }
          } catch (err) {
            socket.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
        
        // === Tier 4: Navigation ===
        } else if (request.command === 'back') {
          const found = findPage(request.pageId);
          if (!found) {
            socket.end(JSON.stringify({ success: false, error: `Page not found: ${request.pageId}` }));
            return;
          }
          try {
            await found.page.goBack();
            socket.end(JSON.stringify({ success: true, result: found.page.url() }));
          } catch (err) {
            socket.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
        } else if (request.command === 'forward') {
          const found = findPage(request.pageId);
          if (!found) {
            socket.end(JSON.stringify({ success: false, error: `Page not found: ${request.pageId}` }));
            return;
          }
          try {
            await found.page.goForward();
            socket.end(JSON.stringify({ success: true, result: found.page.url() }));
          } catch (err) {
            socket.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
        } else if (request.command === 'reload') {
          const found = findPage(request.pageId);
          if (!found) {
            socket.end(JSON.stringify({ success: false, error: `Page not found: ${request.pageId}` }));
            return;
          }
          try {
            await found.page.reload();
            socket.end(JSON.stringify({ success: true, result: 'Reloaded' }));
          } catch (err) {
            socket.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
        
        // === Tier 5: Accessibility Snapshot ===
        } else if (request.command === 'snapshot') {
          const found = findPage(request.pageId);
          if (!found) {
            socket.end(JSON.stringify({ success: false, error: `Page not found: ${request.pageId}` }));
            return;
          }
          try {
            // Use the modern ariaSnapshot API
            const snapshot = await found.page.locator('body').ariaSnapshot();
            
            // Add refs to each line for easier element selection
            let refCounter = 0;
            const lines = snapshot.split('\n');
            const linesWithRefs = lines.map(line => {
              if (line.trim()) {
                const ref = `@e${refCounter++}`;
                return `${ref} ${line}`;
              }
              return line;
            });
            
            // Apply depth limit if requested
            let result: string;
            if (request.maxDepth) {
              result = linesWithRefs.filter(line => {
                const indent = line.match(/^@e\d+ (\s*)/);
                if (!indent) return true;
                const depth = (indent[1]?.length ?? 0) / 2; // 2 spaces per level
                return depth < request.maxDepth!;
              }).join('\n');
            } else {
              result = linesWithRefs.join('\n');
            }
            
            // Compact mode returns single line
            if (request.compact) {
              result = result.replace(/\n/g, ' | ').replace(/\s+/g, ' ').trim();
            }
            
            socket.end(JSON.stringify({ success: true, result }));
          } catch (err) {
            socket.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
        
        // === Tier 6: State Checks ===
        } else if (request.command === 'isVisible') {
          const found = findPage(request.pageId);
          if (!found) {
            socket.end(JSON.stringify({ success: false, error: `Page not found: ${request.pageId}` }));
            return;
          }
          try {
            const visible = await found.page.isVisible(request.selector);
            socket.end(JSON.stringify({ success: true, result: visible }));
          } catch (err) {
            socket.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
        } else if (request.command === 'isEnabled') {
          const found = findPage(request.pageId);
          if (!found) {
            socket.end(JSON.stringify({ success: false, error: `Page not found: ${request.pageId}` }));
            return;
          }
          try {
            const enabled = await found.page.isEnabled(request.selector);
            socket.end(JSON.stringify({ success: true, result: enabled }));
          } catch (err) {
            socket.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
        } else if (request.command === 'isChecked') {
          const found = findPage(request.pageId);
          if (!found) {
            socket.end(JSON.stringify({ success: false, error: `Page not found: ${request.pageId}` }));
            return;
          }
          try {
            const checked = await found.page.isChecked(request.selector);
            socket.end(JSON.stringify({ success: true, result: checked }));
          } catch (err) {
            socket.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
        
        // === Tier 7: Additional Interaction ===
        } else if (request.command === 'check') {
          const found = findPage(request.pageId);
          if (!found) {
            socket.end(JSON.stringify({ success: false, error: `Page not found: ${request.pageId}` }));
            return;
          }
          try {
            await found.page.check(request.selector);
            socket.end(JSON.stringify({ success: true, result: 'checked' }));
          } catch (err) {
            socket.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
        } else if (request.command === 'uncheck') {
          const found = findPage(request.pageId);
          if (!found) {
            socket.end(JSON.stringify({ success: false, error: `Page not found: ${request.pageId}` }));
            return;
          }
          try {
            await found.page.uncheck(request.selector);
            socket.end(JSON.stringify({ success: true, result: 'unchecked' }));
          } catch (err) {
            socket.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
        } else if (request.command === 'select') {
          const found = findPage(request.pageId);
          if (!found) {
            socket.end(JSON.stringify({ success: false, error: `Page not found: ${request.pageId}` }));
            return;
          }
          try {
            await found.page.selectOption(request.selector, request.value);
            socket.end(JSON.stringify({ success: true, result: 'selected' }));
          } catch (err) {
            socket.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
        } else if (request.command === 'dblclick') {
          const found = findPage(request.pageId);
          if (!found) {
            socket.end(JSON.stringify({ success: false, error: `Page not found: ${request.pageId}` }));
            return;
          }
          try {
            await found.page.dblclick(request.selector);
            socket.end(JSON.stringify({ success: true, result: 'double-clicked' }));
          } catch (err) {
            socket.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
        } else if (request.command === 'scroll') {
          const found = findPage(request.pageId);
          if (!found) {
            socket.end(JSON.stringify({ success: false, error: `Page not found: ${request.pageId}` }));
            return;
          }
          try {
            const amount = request.amount || 300;
            let deltaX = 0, deltaY = 0;
            switch (request.direction) {
              case 'up': deltaY = -amount; break;
              case 'down': deltaY = amount; break;
              case 'left': deltaX = -amount; break;
              case 'right': deltaX = amount; break;
              default: deltaY = amount; // default to down
            }
            await found.page.mouse.wheel(deltaX, deltaY);
            socket.end(JSON.stringify({ success: true, result: `scrolled ${request.direction || 'down'} ${amount}px` }));
          } catch (err) {
            socket.end(JSON.stringify({ success: false, error: getErrorMessage(err) }));
          }
        
        } else {
          socket.end(JSON.stringify({ success: false, error: 'Unknown command' }));
        }
      } catch (err) {
        socket.end(JSON.stringify({ success: false, error: 'Invalid request: ' + getErrorMessage(err) }));
      }
    });
  });

  server.listen(SOCKET_PATH, () => {
    console.log(`Playwright server started (socket: ${SOCKET_PATH})`);
    console.log('Browser is ready. Use playwright-cli -e "code" to execute commands.');
  });

  // Handle graceful shutdown
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  async function shutdown(): Promise<void> {
    console.log('\nShutting down...');
    // Close all contexts first
    for (const browserData of browsers.values()) {
      try {
        await browserData.context.close();
      } catch { /* ignore */ }
    }
    browsers.clear();
    if (browser) {
      await browser.close();
    }
    if (fs.existsSync(SOCKET_PATH)) {
      fs.unlinkSync(SOCKET_PATH);
    }
    server.close();
    process.exit(0);
  }
}

// Run directly if called as main
// In ESM/TypeScript we check using import.meta.url but for CommonJS compatibility:
const isMain = require.main === module;
if (isMain) {
  const headless = process.env.PLAYWRIGHT_CLI_HEADLESS !== 'false';
  startServer({ headless }).catch(console.error);
}
