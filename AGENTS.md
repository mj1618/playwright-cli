# playwright-cli

A CLI for running Playwright commands against a persistent browser session.

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
