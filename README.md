# playwright-cli

A CLI for running Playwright commands against a persistent browser session.

## Why playwright-cli?

**playwright-cli** was created so that any AI agent can easily use a headless browser. By providing a simple command-line interface to a persistent browser session, agents can navigate the web, interact with pages, and extract information without needing to manage browser lifecycle or write complex integration code.

Key benefits for agents:
- **Persistent sessions** - The browser stays open between commands, maintaining cookies, auth state, and page context
- **Simple shell interface** - Execute Playwright commands via `-e` flag, perfect for agents that can run shell commands
- **Headless by default** - Runs without a visible window, ideal for server environments and CI/CD
- **Full Playwright API** - Access to `page`, `browser`, and `context` objects for complete browser control

## Installation

```bash
npm install -g @mj1618/playwright-cli
```

## Quick Start

```bash
# Start the browser server (headless by default)
playwright-cli start

# Or start with visible browser window
playwright-cli start --headed

# Run commands against the browser
playwright-cli -e "await page.goto('https://example.com')"
playwright-cli -e "await page.title()"

# Stop when done
playwright-cli stop
```

## Commands

| Command | Description |
|---------|-------------|
| `start` | Launch the browser (headless) and start the server |
| `start --headed` | Launch with visible browser window |
| `stop` | Close the browser and stop the server |
| `status` | Check if the server is running |
| `-e "code"` | Execute JavaScript code |
| `repl` | Start an interactive REPL |

## Available Variables

When executing code, these variables are in scope:

- `page` - the current [Page](https://playwright.dev/docs/api/class-page)
- `browser` - the [Browser](https://playwright.dev/docs/api/class-browser) instance
- `context` - the [BrowserContext](https://playwright.dev/docs/api/class-browsercontext)

## Examples

```bash
# Navigate and interact
playwright-cli -e "await page.goto('https://github.com')"
playwright-cli -e "await page.click('a[href=\"/login\"]')"
playwright-cli -e "await page.fill('#login_field', 'username')"

# Get page info
playwright-cli -e "await page.title()"
playwright-cli -e "await page.url()"

# Screenshots
playwright-cli -e "await page.screenshot({ path: 'screenshot.png' })"

# Evaluate in browser context
playwright-cli -e "await page.evaluate(() => document.body.innerText)"
```

## Configuration

Set `PLAYWRIGHT_CLI_SOCKET` to customize the socket path (default: `~/.playwright-cli.sock`).

## Using with AI Agents

To help AI agents understand how to use playwright-cli in your project, copy the [`AGENTS.md`](./AGENTS.md) file into your repository. This file contains documentation that AI coding assistants (like Cursor, Codex, Claude, etc.) will automatically read to understand how to use the tool.

```bash
# Copy AGENTS.md to your project
curl -o AGENTS.md https://raw.githubusercontent.com/mj1618/playwright-cli/main/AGENTS.md
```

The `AGENTS.md` file provides:
- Quick start commands
- Command reference
- Available variables and their Playwright docs links
- Common usage examples

This enables AI agents to immediately start using playwright-cli for browser automation tasks in your project.

## License

MIT
