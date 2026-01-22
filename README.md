# playwright-cli

[![npm version](https://img.shields.io/npm/v/@mj1618/playwright-cli.svg)](https://www.npmjs.com/package/@mj1618/playwright-cli)
[![npm downloads](https://img.shields.io/npm/dm/@mj1618/playwright-cli.svg)](https://www.npmjs.com/package/@mj1618/playwright-cli)
[![license](https://img.shields.io/npm/l/@mj1618/playwright-cli.svg)](https://github.com/mj1618/playwright-cli/blob/main/LICENSE)
[![node](https://img.shields.io/node/v/@mj1618/playwright-cli.svg)](https://www.npmjs.com/package/@mj1618/playwright-cli)
[![CI](https://github.com/mj1618/playwright-cli/actions/workflows/test.yml/badge.svg)](https://github.com/mj1618/playwright-cli/actions/workflows/test.yml)

A CLI for running Playwright commands against a persistent browser session.

## Why playwright-cli?

**playwright-cli** was created so that any AI agent can easily use a headless browser. By providing a simple command-line interface to a persistent browser session, agents can navigate the web, interact with pages, and extract information without needing to manage browser lifecycle or write complex integration code.

Key benefits for agents:
- **Multi-user support** - Each user gets their own page with a unique `pageId`, enabling concurrent usage
- **Isolated browser sessions** - Create separate browser contexts with independent cookies/auth for complete session isolation
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

# Create a new page and get its pageId
playwright-cli new-page
# Returns: abc12345

# Run commands against the browser (pageId required)
playwright-cli -e "await page.goto('https://example.com')" --page abc12345
playwright-cli -e "await page.title()" --page abc12345

# Close the page when done
playwright-cli close-page abc12345

# Stop the server when completely done
playwright-cli stop
```

## Commands

| Command | Description |
|---------|-------------|
| `start` | Launch the browser (headless) and start the server |
| `start --headed` | Launch with visible browser window |
| `stop` | Close the browser and stop the server |
| `status` | Check if the server is running |
| `new-browser` | Create a new isolated browser session, returns browserId |
| `close-browser <browserId>` | Close a browser and all its pages |
| `list-browsers` | List all browser sessions with page counts |
| `new-page [--browser <id>]` | Create a new page (in default browser if not specified) |
| `close-page <pageId>` | Close a page by its pageId |
| `list-pages` | List all active pages with their URLs and browser IDs |
| `-e "code" --page <pageId>` | Execute JavaScript code on a specific page |
| `repl --page <pageId>` | Start an interactive REPL for a specific page |

## Available Variables

When executing code, these variables are in scope:

- `page` - the current [Page](https://playwright.dev/docs/api/class-page) (for the specified pageId)
- `browser` - the [Browser](https://playwright.dev/docs/api/class-browser) instance
- `context` - the [BrowserContext](https://playwright.dev/docs/api/class-browsercontext)

## Examples

```bash
# Create a page first
PAGE_ID=$(playwright-cli new-page)

# Navigate and interact
playwright-cli -e "await page.goto('https://github.com')" --page $PAGE_ID
playwright-cli -e "await page.click('a[href=\"/login\"]')" --page $PAGE_ID
playwright-cli -e "await page.fill('#login_field', 'username')" --page $PAGE_ID

# Get page info
playwright-cli -e "await page.title()" --page $PAGE_ID
playwright-cli -e "await page.url()" --page $PAGE_ID

# Screenshots
playwright-cli -e "await page.screenshot({ path: 'screenshot.png' })" --page $PAGE_ID

# Evaluate in browser context
playwright-cli -e "await page.evaluate(() => document.body.innerText)" --page $PAGE_ID

# List all active pages
playwright-cli list-pages

# Close the page when done
playwright-cli close-page $PAGE_ID
```

## Multi-User Support

The `pageId` system allows multiple users or agents to use the same browser server concurrently without interfering with each other. Each page is isolated:

```bash
# User 1 creates their page
USER1_PAGE=$(playwright-cli new-page)
playwright-cli -e "await page.goto('https://github.com')" --page $USER1_PAGE

# User 2 creates their own page (at the same time)
USER2_PAGE=$(playwright-cli new-page)
playwright-cli -e "await page.goto('https://google.com')" --page $USER2_PAGE

# Both pages operate independently
playwright-cli list-pages
# abc12345    default    https://github.com/
# def67890    default    https://www.google.com/
```

## Isolated Browser Sessions

For complete session isolation (separate cookies, localStorage, and auth), create isolated browser sessions:

```bash
# Create an isolated browser for user authentication
BROWSER=$(playwright-cli new-browser)

# Create pages in the isolated browser
PAGE=$(playwright-cli new-page --browser $BROWSER)

# This page has completely separate cookies/auth from other browsers
playwright-cli -e "await page.goto('https://github.com/login')" --page $PAGE
playwright-cli -e "await page.fill('#login_field', 'user1')" --page $PAGE

# Create another isolated browser for a different account
BROWSER2=$(playwright-cli new-browser)
PAGE2=$(playwright-cli new-page --browser $BROWSER2)

# This browser won't see any cookies from BROWSER
playwright-cli -e "await page.goto('https://github.com')" --page $PAGE2
# User is not logged in here - completely isolated session

# List all browsers
playwright-cli list-browsers
# default     1 page (default)
# a1b2c3d4    1 page
# e5f6g7h8    1 page

# Close an isolated browser when done
playwright-cli close-browser $BROWSER
```

**When to use isolated browsers:**
- Testing multiple user accounts simultaneously
- Ensuring auth state doesn't leak between test scenarios
- Running parallel tasks that need independent sessions

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
