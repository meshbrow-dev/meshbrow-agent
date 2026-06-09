import { chromium, type Browser, type Page } from "playwright-core";

export interface SessionConfig {
  cdpUrl: string;
  sessionId: string;
}

/**
 * BrowserSession wraps a Playwright connection to a Meshbrow-managed browser.
 */
export class BrowserSession {
  private browser: Browser | null = null;
  private _page: Page | null = null;
  readonly sessionId: string;
  private cdpUrl: string;

  constructor(config: SessionConfig) {
    this.sessionId = config.sessionId;
    this.cdpUrl = config.cdpUrl;
  }

  /** Connect to the remote browser via CDP */
  async connect(): Promise<void> {
    this.browser = await chromium.connectOverCDP(this.cdpUrl);
    const contexts = this.browser.contexts();
    const context = contexts[0] || (await this.browser.newContext());
    const pages = context.pages();
    this._page = pages[0] || (await context.newPage());
  }

  /** Get the current page */
  get page(): Page {
    if (!this._page) {
      throw new Error("Session not connected. Call connect() first.");
    }
    return this._page;
  }

  /** Navigate to a URL */
  async goto(url: string, options?: { waitUntil?: "load" | "domcontentloaded" | "networkidle" }): Promise<void> {
    await this.page.goto(url, {
      waitUntil: options?.waitUntil || "load",
      timeout: 30000,
    });
  }

  /** Click an element */
  async click(selector: string): Promise<void> {
    await this.page.click(selector, { timeout: 10000 });
  }

  /** Type text into an element with human-like delay */
  async type(selector: string, text: string, options?: { delay?: number; clear?: boolean }): Promise<void> {
    if (options?.clear) {
      await this.page.fill(selector, "");
    }
    await this.page.click(selector);
    await this.page.keyboard.type(text, { delay: options?.delay || 50 });
  }

  /** Extract text from elements matching a selector */
  async extractText(selector?: string): Promise<string> {
    if (selector) {
      return this.page.evaluate((sel) => {
        return Array.from(document.querySelectorAll(sel))
          .map((el) => (el as HTMLElement).innerText)
          .join("\n");
      }, selector);
    }
    return this.page.evaluate(() => document.body.innerText);
  }

  /** Extract structured data using a JavaScript function */
  async extract<T>(fn: () => T): Promise<T> {
    return this.page.evaluate(fn);
  }

  /** Take a screenshot */
  async screenshot(options?: { fullPage?: boolean; path?: string }): Promise<Buffer> {
    return this.page.screenshot({
      fullPage: options?.fullPage,
      path: options?.path,
    });
  }

  /** Execute JavaScript in the browser */
  async evaluate<T>(script: string): Promise<T> {
    return this.page.evaluate(script) as Promise<T>;
  }

  /** Wait for a selector to appear */
  async waitFor(selector: string, options?: { timeout?: number }): Promise<void> {
    await this.page.waitForSelector(selector, {
      timeout: options?.timeout || 30000,
    });
  }

  /** Scroll the page */
  async scroll(options?: { direction?: "up" | "down"; amount?: number; selector?: string }): Promise<void> {
    if (options?.selector) {
      await this.page.evaluate((sel) => {
        document.querySelector(sel)?.scrollIntoView({ behavior: "smooth" });
      }, options.selector);
    } else {
      const amount = options?.amount || 500;
      const pixels = options?.direction === "up" ? -amount : amount;
      await this.page.evaluate((px) => window.scrollBy(0, px), pixels);
    }
  }

  /** Get page info (URL, title, links, forms) */
  async getPageInfo(): Promise<{
    url: string;
    title: string;
    links: Array<{ text: string; href: string }>;
    forms: Array<{ action: string; fields: string[] }>;
  }> {
    return this.page.evaluate(() => ({
      url: window.location.href,
      title: document.title,
      links: Array.from(document.querySelectorAll("a[href]"))
        .slice(0, 50)
        .map((a) => ({
          text: (a as HTMLAnchorElement).innerText.trim().slice(0, 100),
          href: (a as HTMLAnchorElement).href,
        })),
      forms: Array.from(document.querySelectorAll("form")).map((form) => ({
        action: (form as HTMLFormElement).action,
        fields: Array.from(form.querySelectorAll("input, select, textarea")).map(
          (el) => `${el.tagName.toLowerCase()}[name="${(el as HTMLInputElement).name}"]`
        ),
      })),
    }));
  }

  /** Disconnect from the browser (does not destroy the session) */
  async disconnect(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this._page = null;
    }
  }
}
