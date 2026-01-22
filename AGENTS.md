# playwright-cli

A CLI for running Playwright commands against a persistent browser session with multi-user support.

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
| `new-page` | Create a new page and return its pageId |
| `close-page <pageId>` | Close a page by its pageId |
| `list-pages` | List all active pages with their URLs |
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

## Configuration

Set `PLAYWRIGHT_CLI_SOCKET` to customize the socket path (default: `~/.playwright-cli.sock`).
