import * as net from 'net';
import * as path from 'path';
import * as os from 'os';
import type { CommandResponse } from './types.js';

export const SOCKET_PATH = process.env.PLAYWRIGHT_CLI_SOCKET || path.join(os.homedir(), '.playwright-cli.sock');

interface NodeError extends Error {
  code?: string;
}

export function sendCommand(command: string, options: Record<string, unknown> = {}): Promise<CommandResponse> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(SOCKET_PATH);
    
    socket.on('connect', () => {
      const request = { command, ...options };
      socket.write(JSON.stringify(request) + '\n');
    });

    let data = '';
    socket.on('data', (chunk: Buffer) => {
      data += chunk.toString();
    });

    socket.on('end', () => {
      try {
        resolve(JSON.parse(data) as CommandResponse);
      } catch {
        reject(new Error('Invalid response from server'));
      }
    });

    socket.on('error', (err: NodeError) => {
      if (err.code === 'ENOENT' || err.code === 'ECONNREFUSED') {
        reject(new Error('Server not running. Start it with: playwright-cli start'));
      } else {
        reject(err);
      }
    });
  });
}

export function isServerRunning(): Promise<boolean> {
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
