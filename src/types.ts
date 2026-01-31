import type { BrowserContext, Page } from 'playwright';

// ============================================
// Browser and Page Management Types
// ============================================

export interface BrowserData {
  context: BrowserContext;
  pages: Map<string, Page>;
}

export interface PageInfo {
  pageId: string;
  browserId: string;
  url: string;
}

export interface BrowserInfo {
  browserId: string;
  pageCount: number;
  isDefault: boolean;
}

export interface FoundPage {
  browserId: string;
  page: Page;
  browserData: BrowserData;
}

// ============================================
// Command Request Types
// ============================================

export interface BaseCommand {
  command: string;
}

// Browser commands
export interface NewBrowserCommand extends BaseCommand {
  command: 'newBrowser';
}

export interface CloseBrowserCommand extends BaseCommand {
  command: 'closeBrowser';
  browserId: string;
}

export interface ListBrowsersCommand extends BaseCommand {
  command: 'listBrowsers';
}

// Page commands
export interface NewPageCommand extends BaseCommand {
  command: 'newPage';
  browserId?: string;
}

export interface ClosePageCommand extends BaseCommand {
  command: 'closePage';
  pageId: string;
}

export interface ListPagesCommand extends BaseCommand {
  command: 'listPages';
}

// Exec command
export interface ExecCommand extends BaseCommand {
  command: 'exec';
  code: string;
  pageId: string;
}

// Control commands
export interface PingCommand extends BaseCommand {
  command: 'ping';
}

export interface StopCommand extends BaseCommand {
  command: 'stop';
}

// Navigation commands
export interface GotoCommand extends BaseCommand {
  command: 'goto';
  url: string;
  pageId: string;
}

export interface BackCommand extends BaseCommand {
  command: 'back';
  pageId: string;
}

export interface ForwardCommand extends BaseCommand {
  command: 'forward';
  pageId: string;
}

export interface ReloadCommand extends BaseCommand {
  command: 'reload';
  pageId: string;
}

// Interaction commands
export interface ClickCommand extends BaseCommand {
  command: 'click';
  selector: string;
  pageId: string;
}

export interface FillCommand extends BaseCommand {
  command: 'fill';
  selector: string;
  text: string;
  pageId: string;
}

export interface TypeCommand extends BaseCommand {
  command: 'type';
  selector: string;
  text: string;
  pageId: string;
}

export interface PressCommand extends BaseCommand {
  command: 'press';
  key: string;
  pageId: string;
}

export interface HoverCommand extends BaseCommand {
  command: 'hover';
  selector: string;
  pageId: string;
}

export interface ScreenshotCommand extends BaseCommand {
  command: 'screenshot';
  path?: string;
  pageId: string;
}

export interface CheckCommand extends BaseCommand {
  command: 'check';
  selector: string;
  pageId: string;
}

export interface UncheckCommand extends BaseCommand {
  command: 'uncheck';
  selector: string;
  pageId: string;
}

export interface SelectCommand extends BaseCommand {
  command: 'select';
  selector: string;
  value: string;
  pageId: string;
}

export interface DblclickCommand extends BaseCommand {
  command: 'dblclick';
  selector: string;
  pageId: string;
}

export interface ScrollCommand extends BaseCommand {
  command: 'scroll';
  direction: 'up' | 'down' | 'left' | 'right';
  amount?: number;
  pageId: string;
}

// Get info commands
export interface GetTextCommand extends BaseCommand {
  command: 'getText';
  selector: string;
  pageId: string;
}

export interface GetHtmlCommand extends BaseCommand {
  command: 'getHtml';
  selector: string;
  pageId: string;
}

export interface GetValueCommand extends BaseCommand {
  command: 'getValue';
  selector: string;
  pageId: string;
}

export interface GetTitleCommand extends BaseCommand {
  command: 'getTitle';
  pageId: string;
}

export interface GetUrlCommand extends BaseCommand {
  command: 'getUrl';
  pageId: string;
}

// Wait commands
export interface WaitSelectorCommand extends BaseCommand {
  command: 'wait';
  waitType: 'selector';
  selector: string;
  pageId: string;
}

export interface WaitTimeoutCommand extends BaseCommand {
  command: 'wait';
  waitType: 'timeout';
  ms: number;
  pageId: string;
}

export interface WaitTextCommand extends BaseCommand {
  command: 'wait';
  waitType: 'text';
  text: string;
  pageId: string;
}

export interface WaitUrlCommand extends BaseCommand {
  command: 'wait';
  waitType: 'url';
  pattern: string;
  pageId: string;
}

export interface WaitLoadCommand extends BaseCommand {
  command: 'wait';
  waitType: 'load';
  state?: 'load' | 'domcontentloaded' | 'networkidle';
  pageId: string;
}

export type WaitCommand = WaitSelectorCommand | WaitTimeoutCommand | WaitTextCommand | WaitUrlCommand | WaitLoadCommand;

// State check commands
export interface IsVisibleCommand extends BaseCommand {
  command: 'isVisible';
  selector: string;
  pageId: string;
}

export interface IsEnabledCommand extends BaseCommand {
  command: 'isEnabled';
  selector: string;
  pageId: string;
}

export interface IsCheckedCommand extends BaseCommand {
  command: 'isChecked';
  selector: string;
  pageId: string;
}

// Accessibility snapshot command
export interface SnapshotCommand extends BaseCommand {
  command: 'snapshot';
  pageId: string;
  interestingOnly?: boolean;
  compact?: boolean;
  maxDepth?: number;
}

// Union type for all commands
export type CommandRequest =
  | NewBrowserCommand
  | CloseBrowserCommand
  | ListBrowsersCommand
  | NewPageCommand
  | ClosePageCommand
  | ListPagesCommand
  | ExecCommand
  | PingCommand
  | StopCommand
  | GotoCommand
  | BackCommand
  | ForwardCommand
  | ReloadCommand
  | ClickCommand
  | FillCommand
  | TypeCommand
  | PressCommand
  | HoverCommand
  | ScreenshotCommand
  | CheckCommand
  | UncheckCommand
  | SelectCommand
  | DblclickCommand
  | ScrollCommand
  | GetTextCommand
  | GetHtmlCommand
  | GetValueCommand
  | GetTitleCommand
  | GetUrlCommand
  | WaitCommand
  | IsVisibleCommand
  | IsEnabledCommand
  | IsCheckedCommand
  | SnapshotCommand;

// ============================================
// Command Response Types
// ============================================

export interface SuccessResponse {
  success: true;
  result?: string;
  pageId?: string;
  browserId?: string;
  pages?: PageInfo[];
  browsers?: BrowserInfo[];
}

export interface ErrorResponse {
  success: false;
  error: string;
}

export type CommandResponse = SuccessResponse | ErrorResponse;

// ============================================
// Server Options
// ============================================

export interface ServerOptions {
  headless?: boolean;
}
