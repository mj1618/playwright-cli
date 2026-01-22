const { chromium } = require('playwright');
const net = require('net');
const fs = require('fs');
const path = require('path');

const SOCKET_PATH = process.env.PLAYWRIGHT_CLI_SOCKET || path.join(require('os').homedir(), '.playwright-cli.sock');

let browser = null;
let context = null;
let page = null;

async function startServer(options = {}) {
  const headless = options.headless !== false; // headless by default
  
  // Clean up stale socket if it exists
  if (fs.existsSync(SOCKET_PATH)) {
    fs.unlinkSync(SOCKET_PATH);
  }

  // Launch browser
  browser = await chromium.launch({ headless });
  context = await browser.newContext();
  page = await context.newPage();
  
  await page.goto('about:blank');

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
        
        if (request.command === 'exec') {
          try {
            // Create a function with page, browser, context in scope
            const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
            const fn = new AsyncFunction('page', 'browser', 'context', `return (${request.code})`);
            const result = await fn(page, browser, context);
            
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
