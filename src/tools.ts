import { BrowserAgent } from "./agent.js";
import type { AgentConfig } from "./types.js";

/**
 * Tool definitions compatible with OpenAI function calling and
 * Anthropic tool use. Use these to give LLMs browser capabilities.
 */
export interface BrowserTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * Get tool definitions for LLM function calling.
 */
export function createBrowserTools(): BrowserTool[] {
  return [
    {
      name: "browse_url",
      description:
        "Open a URL in a stealth browser and return the page text content. Use this to read web pages, check information, or gather data from websites.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The URL to visit",
          },
          proxy_country: {
            type: "string",
            description: "Country to browse from (ISO alpha-2 code, e.g., US, GB, DE)",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "browse_and_extract",
      description:
        "Navigate to a URL and extract specific data using a CSS selector. Returns the text content of all matching elements.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The URL to visit",
          },
          selector: {
            type: "string",
            description: "CSS selector to extract text from (e.g., 'h1', '.price', 'table tr')",
          },
        },
        required: ["url", "selector"],
      },
    },
    {
      name: "browse_screenshot",
      description:
        "Take a screenshot of a web page. Returns a base64-encoded PNG image.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The URL to screenshot",
          },
          full_page: {
            type: "boolean",
            description: "Capture the entire scrollable page (default: false)",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "browse_interact",
      description:
        "Perform a multi-step interaction on a web page (click, type, navigate). Use this for filling forms, clicking buttons, or multi-page workflows.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "Starting URL",
          },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                action: {
                  type: "string",
                  enum: ["click", "type", "navigate", "wait", "extract", "scroll"],
                  description: "Action to perform",
                },
                selector: {
                  type: "string",
                  description: "CSS selector for the target element",
                },
                value: {
                  type: "string",
                  description: "Value to type or URL to navigate to",
                },
              },
              required: ["action"],
            },
            description: "Steps to perform in order",
          },
        },
        required: ["url", "steps"],
      },
    },
    {
      name: "browse_many",
      description:
        "Visit multiple URLs in parallel and return their content. Efficient for comparing pages or gathering data from multiple sources.",
      parameters: {
        type: "object",
        properties: {
          urls: {
            type: "array",
            items: { type: "string" },
            description: "URLs to visit in parallel",
          },
        },
        required: ["urls"],
      },
    },
  ];
}

/**
 * ToolExecutor handles function calls from LLMs.
 * Pass tool call results back to the LLM conversation.
 */
export class ToolExecutor {
  private agent: BrowserAgent;

  constructor(config: AgentConfig) {
    this.agent = new BrowserAgent(config);
  }

  /**
   * Execute a tool call from an LLM and return the result as a string.
   */
  async execute(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<string> {
    switch (toolName) {
      case "browse_url": {
        const result = await this.agent.browse({
          url: args.url as string,
          proxyCountry: args.proxy_country as string | undefined,
          waitUntil: "networkidle",
        });
        return `Title: ${result.title}\nURL: ${result.url}\n\n${(result.data as string).slice(0, 10000)}`;
      }

      case "browse_and_extract": {
        const session = await this.agent.createSession();
        try {
          await session.goto(args.url as string, { waitUntil: "networkidle" });
          const text = await session.extractText(args.selector as string);
          const info = await session.getPageInfo();
          return `Title: ${info.title}\nURL: ${info.url}\nExtracted (${args.selector}):\n${text}`;
        } finally {
          await this.agent.destroySession(session.sessionId);
        }
      }

      case "browse_screenshot": {
        const session = await this.agent.createSession();
        try {
          await session.goto(args.url as string, { waitUntil: "networkidle" });
          const buf = await session.screenshot({
            fullPage: args.full_page as boolean | undefined,
          });
          return `data:image/png;base64,${buf.toString("base64")}`;
        } finally {
          await this.agent.destroySession(session.sessionId);
        }
      }

      case "browse_interact": {
        const steps = (args.steps as Array<{ action: string; selector?: string; value?: string }>).map(
          (s) => ({
            action: s.action as "click" | "type" | "navigate" | "wait" | "extract" | "scroll",
            selector: s.selector,
            value: s.value,
            url: s.action === "navigate" ? s.value : undefined,
          })
        );

        const result = await this.agent.runTask({
          description: "LLM tool call",
          url: args.url as string,
          steps,
        });

        if (!result.success) {
          return `Task failed: ${result.error}`;
        }

        // Return the last extract result or success summary
        const extractStep = [...result.steps].reverse().find((s) => s.action === "extract");
        if (extractStep?.result) {
          return String(extractStep.result);
        }
        return `Task completed successfully in ${result.duration}ms (${result.steps.length} steps)`;
      }

      case "browse_many": {
        const results = await this.agent.browseMany(args.urls as string[]);
        return results
          .map((r) => `--- ${r.title} (${r.url}) ---\n${(r.data as string)?.slice(0, 3000) || ""}`)
          .join("\n\n");
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /** Cleanup all sessions */
  async cleanup(): Promise<void> {
    await this.agent.destroyAll();
  }
}
