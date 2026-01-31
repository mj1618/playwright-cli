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

After installing, you need to install Playwright's Chromium browser:

```bash
npx playwright install chromium
```

On Linux, you may also need to install system dependencies:

```bash
npx playwright install-deps chromium
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

# Navigate and interact using simple commands
playwright-cli open https://example.com --page abc12345
playwright-cli click "button.submit" --page abc12345
playwright-cli fill "#email" "user@example.com" --page abc12345
playwright-cli get title --page abc12345

# Close the page when done
playwright-cli close-page abc12345

# Stop the server when completely done
playwright-cli stop
```

## Custom Playwright Scripts

For full flexibility, use `-e` to run any Playwright code directly:

```bash
PAGE_ID=$(playwright-cli new-page)

# Run any Playwright API call
playwright-cli -e "await page.goto('https://example.com')" --page $PAGE_ID
playwright-cli -e "await page.click('button')" --page $PAGE_ID
playwright-cli -e "await page.fill('#input', 'text')" --page $PAGE_ID
playwright-cli -e "await page.screenshot({ path: 'shot.png' })" --page $PAGE_ID

# Get values
playwright-cli -e "await page.title()" --page $PAGE_ID
playwright-cli -e "await page.url()" --page $PAGE_ID
playwright-cli -e "await page.textContent('.selector')" --page $PAGE_ID

# Evaluate JavaScript in browser context
playwright-cli -e "await page.evaluate(() => document.body.innerText)" --page $PAGE_ID
playwright-cli -e "await page.evaluate(() => localStorage.getItem('key'))" --page $PAGE_ID
```

Available variables: `page`, `browser`, `context` (standard Playwright objects)

## Commands

All commands that interact with the page require `--page <pageId>`.

### Server & Session Management

| Command | Description |
|---------|-------------|
| `start` | Launch the browser (headless) and start the server |
| `start --headed` | Launch with visible browser window |
| `stop` | Close the browser and stop the server |
| `status` | Check if the server is running |
| `new-browser` | Create a new isolated browser session, returns browserId |
| `close-browser <id>` | Close a browser and all its pages |
| `list-browsers` | List all browser sessions with page counts |
| `new-page [--browser <id>]` | Create a new page (in default browser if not specified) |
| `close-page <id>` | Close a page by its pageId |
| `list-pages` | List all active pages with their URLs and browser IDs |

### Navigation

| Command | Description |
|---------|-------------|
| `open <url>` | Navigate to URL (alias: `goto`) |
| `back` | Go back in history |
| `forward` | Go forward in history |
| `reload` | Reload the page |

### Interaction

| Command | Description |
|---------|-------------|
| `click <selector>` | Click an element |
| `fill <selector> <text>` | Fill input with text (clears first) |
| `type <selector> <text>` | Type text keystroke by keystroke |
| `press <key>` | Press keyboard key (Enter, Tab, Escape, etc.) |
| `hover <selector>` | Hover over an element |
| `dblclick <selector>` | Double-click an element |
| `check <selector>` | Check a checkbox |
| `uncheck <selector>` | Uncheck a checkbox |
| `select <selector> <value>` | Select dropdown option by value |
| `scroll <direction> [pixels]` | Scroll page (up/down/left/right), default 300px |

### Get Info

| Command | Description |
|---------|-------------|
| `get text <selector>` | Get text content of element |
| `get html <selector>` | Get innerHTML of element |
| `get value <selector>` | Get input value |
| `get title` | Get page title |
| `get url` | Get current URL |
| `screenshot [path]` | Take screenshot (saves to path if provided) |

### Wait

| Command | Description |
|---------|-------------|
| `wait <selector>` | Wait for element to be visible |
| `wait <ms>` | Wait for milliseconds |
| `wait --text "text"` | Wait for text to appear on page |
| `wait --url "pattern"` | Wait for URL to match pattern |
| `wait --load [state]` | Wait for load state (load, domcontentloaded, networkidle) |

### State Checks

| Command | Description |
|---------|-------------|
| `is visible <selector>` | Check if element is visible (returns true/false) |
| `is enabled <selector>` | Check if element is enabled |
| `is checked <selector>` | Check if checkbox is checked |

### Accessibility

| Command | Description |
|---------|-------------|
| `snapshot` | Get accessibility tree with refs (@e0, @e1, ...) |
| `snapshot -a` | Include all elements (not just interesting ones) |
| `snapshot -c` | Compact JSON output |
| `snapshot -d <depth>` | Limit tree depth |

### Raw Execution

| Command | Description |
|---------|-------------|
| `-e "code" --page <id>` | Execute any Playwright JavaScript code |
| `repl --page <id>` | Start an interactive REPL |

## Available Variables (for `-e` and `repl`)

When executing code with `-e`, these variables are in scope:

- `page` - the current [Page](https://playwright.dev/docs/api/class-page) (for the specified pageId)
- `browser` - the [Browser](https://playwright.dev/docs/api/class-browser) instance
- `context` - the [BrowserContext](https://playwright.dev/docs/api/class-browsercontext)

## Examples

```bash
# Create a page first
PAGE_ID=$(playwright-cli new-page)

# Navigate and interact
playwright-cli open https://github.com --page $PAGE_ID
playwright-cli click 'a[href="/login"]' --page $PAGE_ID
playwright-cli fill '#login_field' 'username' --page $PAGE_ID
playwright-cli fill '#password' 'password' --page $PAGE_ID
playwright-cli press Enter --page $PAGE_ID

# Wait for navigation
playwright-cli wait --load networkidle --page $PAGE_ID

# Get page info
playwright-cli get title --page $PAGE_ID
playwright-cli get url --page $PAGE_ID

# Screenshots
playwright-cli screenshot screenshot.png --page $PAGE_ID

# Form interactions
playwright-cli check '#remember-me' --page $PAGE_ID
playwright-cli select '#country' 'US' --page $PAGE_ID

# Scroll the page
playwright-cli scroll down 500 --page $PAGE_ID

# State checks
playwright-cli is visible '.success-message' --page $PAGE_ID

# For complex operations, use raw Playwright code
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
playwright-cli open https://github.com --page $USER1_PAGE

# User 2 creates their own page (at the same time)
USER2_PAGE=$(playwright-cli new-page)
playwright-cli open https://google.com --page $USER2_PAGE

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
playwright-cli open https://github.com/login --page $PAGE
playwright-cli fill '#login_field' 'user1' --page $PAGE

# Create another isolated browser for a different account
BROWSER2=$(playwright-cli new-browser)
PAGE2=$(playwright-cli new-page --browser $BROWSER2)

# This browser won't see any cookies from BROWSER
playwright-cli open https://github.com --page $PAGE2
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
- Full command reference (navigation, interaction, get info, wait, state checks, accessibility)
- Custom Playwright script examples using `-e`
- Common usage patterns

This enables AI agents to immediately start using playwright-cli for browser automation tasks in your project.

## License

MIT
