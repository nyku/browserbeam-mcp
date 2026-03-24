#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = process.env.BROWSERBEAM_BASE_URL || "https://api.browserbeam.com";
const API_KEY = process.env.BROWSERBEAM_API_KEY || "";

interface ApiResponse {
  session_id?: string;
  page?: {
    url?: string;
    title?: string;
    stable?: boolean;
    markdown?: { content?: string };
    interactive_elements?: Array<{
      ref: string;
      tag: string;
      label: string;
    }>;
    changes?: Record<string, unknown>;
    scroll?: Record<string, unknown>;
  } | null;
  media?: Array<{ type: string; format: string; data: string }>;
  extraction?: Record<string, unknown> | null;
  error?: { step: number; action: string; code: string; message: string } | null;
  [key: string]: unknown;
}

async function apiRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<ApiResponse> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) return {};

  const json = await response.json();
  if (response.status >= 400) {
    const err = (json as Record<string, unknown>).error as Record<string, unknown> | undefined;
    throw new Error(`API error ${response.status}: ${err?.message || "Unknown error"}`);
  }
  return json as ApiResponse;
}

function formatPageState(data: ApiResponse): string {
  const parts: string[] = [];

  if (data.session_id) parts.push(`Session: ${data.session_id}`);

  const page = data.page;
  if (page) {
    if (page.url) parts.push(`URL: ${page.url}`);
    if (page.title) parts.push(`Title: ${page.title}`);
    if (page.stable !== undefined) parts.push(`Stable: ${page.stable}`);
    if (page.markdown?.content) {
      parts.push(`\n--- Page Content ---\n${page.markdown.content}`);
    }
    if (page.interactive_elements?.length) {
      parts.push("\n--- Interactive Elements ---");
      for (const el of page.interactive_elements) {
        parts.push(`  [${el.ref}] <${el.tag}> ${el.label}`);
      }
    }
    if (page.changes) {
      parts.push(`\nChanges: ${JSON.stringify(page.changes, null, 2)}`);
    }
  }

  if (data.extraction) {
    parts.push(`\n--- Extracted Data ---\n${JSON.stringify(data.extraction, null, 2)}`);
  }

  if (data.media?.length) {
    for (const m of data.media) {
      parts.push(`\n[${m.type}] format=${m.format}, ${m.data.length} chars base64`);
    }
  }

  if (data.error) {
    parts.push(`\nError at step ${data.error.step} (${data.error.action}): ${data.error.message}`);
  }

  return parts.join("\n");
}

const server = new McpServer({
  name: "browserbeam",
  version: "0.1.0",
});

server.tool(
  "browserbeam_create_session",
  "Create a new browser session. Optionally navigate to a URL. Returns page state with markdown content and interactive element refs.",
  {
    url: z.string().optional().describe("URL to navigate to after creating the session"),
    viewport_width: z.number().optional().describe("Viewport width in pixels (default: 1280)"),
    viewport_height: z.number().optional().describe("Viewport height in pixels (default: 720)"),
    timeout: z.number().optional().describe("Session lifetime in seconds (default: 300)"),
    auto_dismiss_blockers: z.boolean().optional().describe("Auto-dismiss cookie banners and popups (default: true)"),
  },
  async (params) => {
    const body: Record<string, unknown> = {};
    if (params.url) body.url = params.url;
    if (params.timeout) body.timeout = params.timeout;
    if (params.auto_dismiss_blockers !== undefined) body.auto_dismiss_blockers = params.auto_dismiss_blockers;
    if (params.viewport_width || params.viewport_height) {
      body.viewport = {
        width: params.viewport_width || 1280,
        height: params.viewport_height || 720,
      };
    }
    const data = await apiRequest("POST", "/v1/sessions", body);
    return { content: [{ type: "text" as const, text: formatPageState(data) }] };
  },
);

server.tool(
  "browserbeam_navigate",
  "Navigate an existing session to a new URL.",
  {
    session_id: z.string().describe("Session ID (ses_...)"),
    url: z.string().describe("URL to navigate to"),
  },
  async (params) => {
    const data = await apiRequest("POST", `/v1/sessions/${params.session_id}/act`, {
      steps: [{ goto: { url: params.url } }],
    });
    return { content: [{ type: "text" as const, text: formatPageState(data) }] };
  },
);

server.tool(
  "browserbeam_observe",
  "Get the current page state as markdown with interactive element refs. Optionally scope to a CSS selector.",
  {
    session_id: z.string().describe("Session ID (ses_...)"),
    scope: z.string().optional().describe("CSS selector to scope observation to a page section"),
  },
  async (params) => {
    const observeParams: Record<string, unknown> = {};
    if (params.scope) observeParams.scope = params.scope;
    const data = await apiRequest("POST", `/v1/sessions/${params.session_id}/act`, {
      steps: [{ observe: observeParams }],
    });
    return { content: [{ type: "text" as const, text: formatPageState(data) }] };
  },
);

server.tool(
  "browserbeam_click",
  "Click an element on the page. Use ref (e.g. 'e1') from the element list, or match by visible text or label.",
  {
    session_id: z.string().describe("Session ID (ses_...)"),
    ref: z.string().optional().describe("Element ref from interactive_elements (e.g. 'e1')"),
    text: z.string().optional().describe("Visible text to click"),
    label: z.string().optional().describe("Element label to click"),
  },
  async (params) => {
    const clickParams: Record<string, unknown> = {};
    if (params.ref) clickParams.ref = params.ref;
    if (params.text) clickParams.text = params.text;
    if (params.label) clickParams.label = params.label;
    const data = await apiRequest("POST", `/v1/sessions/${params.session_id}/act`, {
      steps: [{ click: clickParams }],
    });
    return { content: [{ type: "text" as const, text: formatPageState(data) }] };
  },
);

server.tool(
  "browserbeam_fill",
  "Fill a form field or type into an input. Can fill a single field or an entire form at once.",
  {
    session_id: z.string().describe("Session ID (ses_...)"),
    ref: z.string().optional().describe("Element ref to fill"),
    label: z.string().optional().describe("Field label to fill"),
    value: z.string().optional().describe("Value to fill into the field"),
    fields: z.record(z.string(), z.string()).optional().describe("Object of label->value pairs to fill an entire form"),
    submit: z.boolean().optional().describe("Submit the form after filling (default: false)"),
  },
  async (params) => {
    const steps: Record<string, unknown>[] = [];
    if (params.fields) {
      const fillFormParams: Record<string, unknown> = { fields: params.fields };
      if (params.submit) fillFormParams.submit = true;
      steps.push({ fill_form: fillFormParams });
    } else {
      const fillParams: Record<string, unknown> = {};
      if (params.ref) fillParams.ref = params.ref;
      if (params.label) fillParams.label = params.label;
      if (params.value) fillParams.value = params.value;
      steps.push({ fill: fillParams });
    }
    const data = await apiRequest("POST", `/v1/sessions/${params.session_id}/act`, { steps });
    return { content: [{ type: "text" as const, text: formatPageState(data) }] };
  },
);

server.tool(
  "browserbeam_extract",
  "Extract structured data from the page using a declarative schema. Define the shape of data you want and get clean JSON back.",
  {
    session_id: z.string().describe("Session ID (ses_...)"),
    schema: z.string().describe("JSON string of the extraction schema, e.g. '{\"title\": \"h1 >> text\", \"products\": [{\"_parent\": \".card\", \"name\": \"h2 >> text\"}]}'"),
  },
  async (params) => {
    const schema = JSON.parse(params.schema);
    const data = await apiRequest("POST", `/v1/sessions/${params.session_id}/act`, {
      steps: [{ extract: schema }],
    });
    return { content: [{ type: "text" as const, text: formatPageState(data) }] };
  },
);

server.tool(
  "browserbeam_screenshot",
  "Take a screenshot of the current page. Returns base64-encoded image data.",
  {
    session_id: z.string().describe("Session ID (ses_...)"),
    full_page: z.boolean().optional().describe("Capture the full scrollable page (default: false)"),
  },
  async (params) => {
    const screenshotParams: Record<string, unknown> = {};
    if (params.full_page !== undefined) screenshotParams.full_page = params.full_page;
    const data = await apiRequest("POST", `/v1/sessions/${params.session_id}/act`, {
      steps: [{ screenshot: screenshotParams }],
    });

    const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [];
    if (data.media?.length) {
      for (const m of data.media) {
        content.push({
          type: "image" as const,
          data: m.data,
          mimeType: m.format === "png" ? "image/png" : "image/jpeg",
        });
      }
    }
    content.push({ type: "text" as const, text: formatPageState(data) });
    return { content };
  },
);

server.tool(
  "browserbeam_close",
  "Close a browser session and release resources. Stops the billing clock.",
  {
    session_id: z.string().describe("Session ID (ses_...)"),
  },
  async (params) => {
    await apiRequest("DELETE", `/v1/sessions/${params.session_id}`);
    return { content: [{ type: "text" as const, text: `Session ${params.session_id} closed.` }] };
  },
);

async function main() {
  if (!API_KEY) {
    console.error("BROWSERBEAM_API_KEY environment variable is required.");
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
