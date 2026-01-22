const net = require('net');
const path = require('path');

const SOCKET_PATH = process.env.PLAYWRIGHT_CLI_SOCKET || path.join(require('os').homedir(), '.playwright-cli.sock');

function sendCommand(command, code = null) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(SOCKET_PATH);
    
    socket.on('connect', () => {
      const request = { command };
      if (code !== null) {
        request.code = code;
      }
      socket.write(JSON.stringify(request) + '\n');
    });

    let data = '';
    socket.on('data', (chunk) => {
      data += chunk.toString();
    });

    socket.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new Error('Invalid response from server'));
      }
    });

    socket.on('error', (err) => {
      if (err.code === 'ENOENT' || err.code === 'ECONNREFUSED') {
        reject(new Error('Server not running. Start it with: playwright-cli start'));
      } else {
        reject(err);
      }
    });
  });
}

function isServerRunning() {
  return new Promise((resolve) => {
    const socket = net.createConnection(SOCKET_PATH);
    
    socket.on('connect', () => {
      socket.write(JSON.stringify({ command: 'ping' }) + '\n');
    });

    socket.on('data', () => {
      socket.end();
      resolve(true);
    });

    socket.on('error', () => {
      resolve(false);
    });
  });
}

module.exports = { sendCommand, isServerRunning, SOCKET_PATH };
