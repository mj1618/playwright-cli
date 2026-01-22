const { chromium } = require('playwright');
const net = require('net');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SOCKET_PATH = process.env.PLAYWRIGHT_CLI_SOCKET || path.join(require('os').homedir(), '.playwright-cli.sock');

let browser = null;
const DEFAULT_BROWSER_ID = 'default';
const browsers = new Map(); // browserId -> { context, pages: Map<pageId, page> }

function generateId() {
  return crypto.randomUUID().slice(0, 8);
}

// Helper to get or create the default browser context
async function getOrCreateDefaultBrowser() {
  if (!browsers.has(DEFAULT_BROWSER_ID)) {
    const context = await browser.newContext();
    browsers.set(DEFAULT_BROWSER_ID, { context, pages: new Map() });
  }
  return browsers.get(DEFAULT_BROWSER_ID);
}

// Helper to find a page across all browsers
function findPage(pageId) {
  for (const [browserId, browserData] of browsers) {
    if (browserData.pages.has(pageId)) {
      return { browserId, page: browserData.pages.get(pageId), browserData };
    }
  }
  return null;
}

async function startServer(options = {}) {
  const headless = options.headless !== false; // headless by default
  
  // Clean up stale socket if it exists
  if (fs.existsSync(SOCKET_PATH)) {
    fs.unlinkSync(SOCKET_PATH);
  }

  // Launch browser (contexts created on demand)
  browser = await chromium.launch({ headless });

  const server = net.createServer((socket) => {
    let data = '';
    
    socket.on('data', async (chunk) => {
      data += chunk.toString();
      
      // Check if we have a complete message (newline-delimited)
      const newlineIndex = data.indexOf('\n');
      if (newlineIndex === -1) return;
      
      const message = data.slice(0, newlineIndex);
      data = data.slice(newlineIndex + 1);
      
      try {
        const request = JSON.parse(message);
        
        // === Browser commands ===
        if (request.command === 'newBrowser') {
          try {
            const browserId = generateId();
            const context = await browser.newContext();
            browsers.set(browserId, { context, pages: new Map() });
            socket.end(JSON.stringify({ success: true, browserId }));
          } catch (err) {
            socket.end(JSON.stringify({ success: false, error: err.message }));
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
            socket.end(JSON.stringify({ success: false, error: err.message }));
          }
        } else if (request.command === 'listBrowsers') {
          const browserList = [];
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
            let browserData;
            
            if (browserId === DEFAULT_BROWSER_ID) {
              browserData = await getOrCreateDefaultBrowser();
            } else {
              browserData = browsers.get(browserId);
              if (!browserData) {
                socket.end(JSON.stringify({ success: false, error: `Browser not found: ${browserId}. Create one with: playwright-cli new-browser` }));
                return;
              }
            }
            
            const pageId = generateId();
            const page = await browserData.context.newPage();
            await page.goto('about:blank');
            browserData.pages.set(pageId, page);
            socket.end(JSON.stringify({ success: true, pageId, browserId }));
          } catch (err) {
            socket.end(JSON.stringify({ success: false, error: err.message }));
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
            socket.end(JSON.stringify({ success: false, error: err.message }));
          }
        } else if (request.command === 'listPages') {
          const pageList = [];
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
            const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
            const fn = new AsyncFunction('page', 'browser', 'context', `return (${request.code})`);
            const result = await fn(found.page, browser, found.browserData.context);
            
            // Serialize result
            let serialized;
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
            socket.end(JSON.stringify({ success: false, error: err.message }));
          }
        } else if (request.command === 'ping') {
          socket.end(JSON.stringify({ success: true, result: 'pong' }));
        } else if (request.command === 'stop') {
          socket.end(JSON.stringify({ success: true, result: 'stopping' }));
          await shutdown();
        } else {
          socket.end(JSON.stringify({ success: false, error: 'Unknown command' }));
        }
      } catch (err) {
        socket.end(JSON.stringify({ success: false, error: 'Invalid request: ' + err.message }));
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

  async function shutdown() {
    console.log('\nShutting down...');
    // Close all contexts first
    for (const browserData of browsers.values()) {
      try {
        await browserData.context.close();
      } catch {}
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

module.exports = { startServer, SOCKET_PATH };

// Run directly if called as main
if (require.main === module) {
  const headless = process.env.PLAYWRIGHT_CLI_HEADLESS !== 'false';
  startServer({ headless }).catch(console.error);
}
