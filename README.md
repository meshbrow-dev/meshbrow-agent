# @meshbrow/agent

A high-level AI agent framework with built-in stealth browser capabilities, powered by [Meshbrow](https://meshbrow.dev).

Give your AI agents the ability to browse the web undetected — scrape data, fill forms, take screenshots, and automate workflows.

## Installation

```bash
npm install @meshbrow/agent
```

## Quick Start

### Simple browsing

```typescript
import { BrowserAgent } from '@meshbrow/agent';

const agent = new BrowserAgent({
  apiKey: process.env.MESHBROW_API_KEY!,
  stealth: 'max',
  proxy: { type: 'residential', country: 'US' },
});

// Browse a page and get content
const result = await agent.browse({
  url: 'https://example.com',
  waitUntil: 'networkidle',
});

console.log(result.title);   // "Example Domain"
console.log(result.data);    // Page text content
```

### Multi-step task

```typescript
const result = await agent.runTask({
  description: 'Search for product prices',
  url: 'https://shop.example.com',
  steps: [
    { action: 'type', selector: 'input[name="search"]', value: 'laptop' },
    { action: 'click', selector: 'button[type="submit"]' },
    { action: 'wait', selector: '.results' },
    { action: 'extract', selector: '.product-card .price' },
  ],
});

console.log(result.success);  // true
console.log(result.steps[3].result);  // Extracted prices
```

### Parallel browsing

```typescript
const results = await agent.browseMany([
  'https://competitor-a.com/pricing',
  'https://competitor-b.com/pricing',
  'https://competitor-c.com/pricing',
]);

results.forEach((r) => {
  console.log(`${r.title}: ${(r.data as string).slice(0, 200)}`);
});
```

## LLM Tool Integration

Use the `ToolExecutor` to give LLMs browser capabilities via function calling:

### With OpenAI

```typescript
import { createBrowserTools, ToolExecutor } from '@meshbrow/agent';
import OpenAI from 'openai';

const openai = new OpenAI();
const executor = new ToolExecutor({ apiKey: process.env.MESHBROW_API_KEY! });
const tools = createBrowserTools();

// Convert to OpenAI format
const openaiTools = tools.map((t) => ({
  type: 'function' as const,
  function: {
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  },
}));

const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'What are the top stories on Hacker News right now?' }],
  tools: openaiTools,
});

// Handle tool calls
for (const toolCall of response.choices[0].message.tool_calls || []) {
  const result = await executor.execute(
    toolCall.function.name,
    JSON.parse(toolCall.function.arguments)
  );
  console.log(result);
}

await executor.cleanup();
```

### With Anthropic Claude

```typescript
import { createBrowserTools, ToolExecutor } from '@meshbrow/agent';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();
const executor = new ToolExecutor({ apiKey: process.env.MESHBROW_API_KEY! });
const tools = createBrowserTools();

// Convert to Anthropic format
const anthropicTools = tools.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.parameters,
}));

const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 4096,
  messages: [{ role: 'user', content: 'Check the current price of Bitcoin on coinbase.com' }],
  tools: anthropicTools,
});

// Handle tool use
for (const block of response.content) {
  if (block.type === 'tool_use') {
    const result = await executor.execute(block.name, block.input as Record<string, unknown>);
    console.log(result);
  }
}

await executor.cleanup();
```

## Low-Level Session Access

For full control, use `BrowserSession` directly:

```typescript
import { BrowserAgent } from '@meshbrow/agent';

const agent = new BrowserAgent({
  apiKey: process.env.MESHBROW_API_KEY!,
});

const session = await agent.createSession({ proxyCountry: 'GB' });

try {
  await session.goto('https://example.co.uk');
  
  // Full Playwright Page access
  const page = session.page;
  await page.click('button.accept-cookies');
  await page.waitForSelector('.content');
  
  const title = await page.title();
  console.log(title);
} finally {
  await agent.destroySession(session.sessionId);
}
```

## Configuration

```typescript
const agent = new BrowserAgent({
  apiKey: 'mb_live_...',           // Required
  apiUrl: 'https://api.meshbrow.dev',  // Optional
  stealth: 'max',                  // none | basic | max
  proxy: {
    type: 'residential',           // residential | datacenter | isp | mobile
    country: 'US',                 // ISO 3166-1 alpha-2
    sticky: true,                  // Same IP per session
  },
  timeout: 30,                     // Minutes
  maxConcurrency: 5,               // Parallel sessions
  recording: true,                 // Enable HAR/screenshots
});
```

## Available Tools (for LLMs)

| Tool | Description |
|------|-------------|
| `browse_url` | Visit a URL and return page content |
| `browse_and_extract` | Extract specific data using CSS selectors |
| `browse_screenshot` | Take a screenshot (returns base64 PNG) |
| `browse_interact` | Multi-step interaction (click, type, navigate) |
| `browse_many` | Visit multiple URLs in parallel |

## License

MIT
