import { BrowserSession } from "./session.js";
import type {
  AgentConfig,
  BrowseOptions,
  ExtractResult,
  AgentTask,
  TaskResult,
  StepResult,
} from "./types.js";

/**
 * BrowserAgent is a high-level agent that manages browser sessions
 * and provides a simple interface for web automation tasks.
 */
export class BrowserAgent {
  private config: Required<
    Pick<AgentConfig, "apiKey" | "apiUrl" | "stealth" | "timeout" | "maxConcurrency">
  > & { proxy: AgentConfig["proxy"]; recording: boolean };
  private activeSessions: Map<string, BrowserSession> = new Map();

  constructor(config: AgentConfig) {
    this.config = {
      apiKey: config.apiKey,
      apiUrl: config.apiUrl || "https://api.meshbrow.dev",
      stealth: config.stealth || "max",
      proxy: config.proxy,
      timeout: config.timeout || 30,
      recording: config.recording || false,
      maxConcurrency: config.maxConcurrency || 5,
    };
  }

  /**
   * Browse a URL and return page content.
   */
  async browse(options: BrowseOptions): Promise<ExtractResult> {
    const session = await this.createSession({
      proxyCountry: options.proxyCountry,
      profileId: options.profileId,
    });

    try {
      await session.goto(options.url, { waitUntil: options.waitUntil || "networkidle" });

      const text = await session.extractText();
      const info = await session.getPageInfo();

      let screenshot: string | undefined;
      if (options.screenshot) {
        const buf = await session.screenshot();
        screenshot = buf.toString("base64");
      }

      return {
        data: text,
        url: info.url,
        title: info.title,
        screenshot,
      };
    } finally {
      await this.destroySession(session.sessionId);
    }
  }

  /**
   * Execute a multi-step task in the browser.
   */
  async runTask(task: AgentTask): Promise<TaskResult> {
    const startTime = Date.now();
    const stepResults: StepResult[] = [];

    const session = await this.createSession({
      profileId: task.profileId,
    });

    try {
      // Navigate to starting URL if provided
      if (task.url) {
        await session.goto(task.url, { waitUntil: "networkidle" });
      }

      for (const step of task.steps) {
        const stepStart = Date.now();
        try {
          let result: unknown;

          switch (step.action) {
            case "navigate":
              await session.goto(step.url || step.value || "", {
                waitUntil: "networkidle",
              });
              result = { url: step.url || step.value };
              break;

            case "click":
              await session.click(step.selector!);
              result = { clicked: step.selector };
              break;

            case "type":
              await session.type(step.selector!, step.value || "");
              result = { typed: step.value };
              break;

            case "extract":
              result = await session.extractText(step.selector);
              break;

            case "screenshot":
              const buf = await session.screenshot({ fullPage: true });
              result = { size: buf.length, base64: buf.toString("base64") };
              break;

            case "wait":
              if (step.selector) {
                await session.waitFor(step.selector);
              }
              result = { waited: step.selector };
              break;

            case "scroll":
              await session.scroll({ selector: step.selector });
              result = { scrolled: true };
              break;
          }

          stepResults.push({
            action: step.action,
            success: true,
            result,
            duration: Date.now() - stepStart,
          });
        } catch (error) {
          stepResults.push({
            action: step.action,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            duration: Date.now() - stepStart,
          });

          // Stop on failure
          return {
            success: false,
            steps: stepResults,
            duration: Date.now() - startTime,
            error: `Step "${step.action}" failed: ${error instanceof Error ? error.message : error}`,
          };
        }
      }

      return {
        success: true,
        steps: stepResults,
        duration: Date.now() - startTime,
      };
    } finally {
      await this.destroySession(session.sessionId);
    }
  }

  /**
   * Run multiple URLs in parallel (respects maxConcurrency).
   */
  async browseMany(urls: string[], options?: Partial<BrowseOptions>): Promise<ExtractResult[]> {
    const results: ExtractResult[] = [];
    const chunks = this.chunk(urls, this.config.maxConcurrency);

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map((url) =>
          this.browse({ ...options, url }).catch((error) => ({
            data: null,
            url,
            title: "",
            error: error instanceof Error ? error.message : String(error),
          }))
        )
      );
      results.push(...(chunkResults as ExtractResult[]));
    }

    return results;
  }

  /**
   * Get or create a browser session.
   */
  async createSession(options?: {
    proxyCountry?: string;
    profileId?: string;
  }): Promise<BrowserSession> {
    const body: Record<string, unknown> = {
      stealth: this.config.stealth,
      timeout: this.config.timeout,
    };

    if (this.config.proxy || options?.proxyCountry) {
      body.proxy = {
        type: this.config.proxy?.type || "residential",
        country: options?.proxyCountry || this.config.proxy?.country,
        sticky: this.config.proxy?.sticky,
      };
    }

    if (options?.profileId) {
      body.profile_id = options.profileId;
    }

    const response = await this.apiRequest<{
      id: string;
      cdp_endpoint: string;
    }>("POST", "/v1/sessions", body);

    const session = new BrowserSession({
      sessionId: response.id,
      cdpUrl: response.cdp_endpoint,
    });

    await session.connect();
    this.activeSessions.set(response.id, session);
    return session;
  }

  /**
   * Destroy a session.
   */
  async destroySession(sessionId: string, saveProfile?: boolean): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      await session.disconnect();
      this.activeSessions.delete(sessionId);
    }

    const query = saveProfile ? "?save_profile=true" : "";
    await this.apiRequest("DELETE", `/v1/sessions/${sessionId}${query}`);
  }

  /**
   * Destroy all active sessions.
   */
  async destroyAll(): Promise<void> {
    const ids = [...this.activeSessions.keys()];
    await Promise.all(ids.map((id) => this.destroySession(id)));
  }

  private async apiRequest<T = unknown>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.config.apiUrl}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "meshbrow-agent/0.1.0",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API error ${response.status}: ${text}`);
    }

    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
