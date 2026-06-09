export interface AgentConfig {
  /** Meshbrow API key */
  apiKey: string;
  /** API base URL (default: https://api.meshbrow.dev) */
  apiUrl?: string;
  /** Default stealth level */
  stealth?: "none" | "basic" | "max";
  /** Default proxy configuration */
  proxy?: {
    type?: "residential" | "datacenter" | "isp" | "mobile";
    country?: string;
    sticky?: boolean;
  };
  /** Session timeout in minutes (default: 30) */
  timeout?: number;
  /** Whether to record sessions (HAR, screenshots) */
  recording?: boolean;
  /** Maximum concurrent sessions */
  maxConcurrency?: number;
}

export interface BrowseOptions {
  /** URL to navigate to */
  url: string;
  /** Wait condition */
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
  /** Specific proxy country for this request */
  proxyCountry?: string;
  /** Profile ID to restore */
  profileId?: string;
  /** Take screenshot after navigation */
  screenshot?: boolean;
}

export interface ExtractResult {
  /** Extracted text or data */
  data: unknown;
  /** Page URL after extraction */
  url: string;
  /** Page title */
  title: string;
  /** Screenshot (base64) if requested */
  screenshot?: string;
}

export interface PageInfo {
  url: string;
  title: string;
  text: string;
  links: Array<{ text: string; href: string }>;
  forms: Array<{ action: string; fields: string[] }>;
}

export interface AgentTask {
  /** Task description */
  description: string;
  /** Starting URL */
  url?: string;
  /** Steps to perform */
  steps: TaskStep[];
  /** Profile to use for persistence */
  profileId?: string;
}

export interface TaskStep {
  action: "navigate" | "click" | "type" | "extract" | "screenshot" | "wait" | "scroll";
  selector?: string;
  value?: string;
  url?: string;
  description?: string;
}

export interface TaskResult {
  success: boolean;
  steps: StepResult[];
  duration: number;
  screenshot?: string;
  error?: string;
}

export interface StepResult {
  action: string;
  success: boolean;
  result?: unknown;
  error?: string;
  duration: number;
}
