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
    markdown?: { content?: string; length?: { shown: number; total: number } };
    html?: { content?: string; length?: { shown: number; total: number } };
    interactive_elements?: Array<{
      ref: string;
      tag: string;
      label: string;
      in?: string;
      near?: string;
      form?: string;
    }>;
    forms?: Array<{
      ref: string;
      id: string | null;
      action: string;
      method: string;
      fields: string[];
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
    const contentBlock = page.markdown || page.html;
    if (contentBlock?.content) {
      parts.push(`\n--- Page Content ---\n${contentBlock.content}`);
      if (contentBlock.length) {
        parts.push(`\n[content truncated: showing ${contentBlock.length.shown} of ${contentBlock.length.total} chars]`);
      }
    }
    if (page.interactive_elements?.length) {
      parts.push("\n--- Interactive Elements ---");
      for (const el of page.interactive_elements) {
        const ctx: string[] = [];
        if (el.in) ctx.push(`in:${el.in}`);
        if (el.near) ctx.push(`near:"${el.near}"`);
        if (el.form) ctx.push(`form:${el.form}`);
        const suffix = ctx.length ? `  (${ctx.join(", ")})` : "";
        parts.push(`  [${el.ref}] <${el.tag}> ${el.label}${suffix}`);
      }
    }
    if (page.forms?.length) {
      parts.push("\n--- Forms ---");
      for (const f of page.forms) {
        parts.push(`  [${f.ref}] ${(f.method || "GET").toUpperCase()} ${f.action || "/"}  fields: [${f.fields.join(", ")}]`);
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
  "Create a new browser session. Optionally navigate to a URL. The response already includes page markdown and interactive element refs -- use this as your first observation instead of calling observe separately.",
  {
    url: z.string().optional().describe("URL to navigate to after creating the session"),
    viewport_width: z.number().optional().describe("Viewport width in pixels (default: 1280)"),
    viewport_height: z.number().optional().describe("Viewport height in pixels (default: 720)"),
    timeout: z.number().optional().describe("Session lifetime in seconds (default: 300)"),
    auto_dismiss_blockers: z.boolean().optional().describe("Auto-dismiss cookie banners and popups (default: true)"),
    user_agent: z.string().optional().describe("Custom User-Agent string"),
    locale: z.string().optional().describe("Browser locale (e.g. 'en-US')"),
    timezone: z.string().optional().describe("Timezone ID (e.g. 'America/New_York')"),
    block_resources: z.array(z.string()).optional().describe("Resource types to block: 'image', 'font', 'media', 'stylesheet', 'script'"),
    cookies: z.array(z.record(z.string(), z.unknown())).optional().describe("Array of cookie objects to inject. Each needs 'name', 'value', and 'domain' or 'url'."),
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
    if (params.user_agent) body.user_agent = params.user_agent;
    if (params.locale) body.locale = params.locale;
    if (params.timezone) body.timezone = params.timezone;
    if (params.block_resources) body.block_resources = params.block_resources;
    if (params.cookies) body.cookies = params.cookies;
    const data = await apiRequest("POST", "/v1/sessions", body);
    return { content: [{ type: "text" as const, text: formatPageState(data) }] };
  },
);

server.tool(
  "browserbeam_navigate",
  "Navigate an existing session to a new URL. The response already includes page markdown and interactive element refs -- use this as your observation instead of calling observe again. Only call observe separately if you need HTML format, a scoped section, or increased max_text_length.",
  {
    session_id: z.string().describe("Session ID (ses_...)"),
    url: z.string().describe("URL to navigate to"),
    wait_for: z.string().optional().describe("CSS selector to wait for after navigation"),
    wait_until: z.string().optional().describe("JavaScript expression to wait for (must become truthy)"),
    wait_timeout: z.number().optional().describe("Max ms to wait for wait_for/wait_until (default: 10000)"),
  },
  async (params) => {
    const gotoParams: Record<string, unknown> = { url: params.url };
    if (params.wait_for) gotoParams.wait_for = params.wait_for;
    if (params.wait_until) gotoParams.wait_until = params.wait_until;
    if (params.wait_timeout) gotoParams.wait_timeout = params.wait_timeout;
    const data = await apiRequest("POST", `/v1/sessions/${params.session_id}/act`, {
      steps: [{ goto: gotoParams }],
    });
    return { content: [{ type: "text" as const, text: formatPageState(data) }] };
  },
);

server.tool(
  "browserbeam_observe",
  "Re-read the current page state. Skip this if create_session or navigate already returned what you need. Use 'scope' to limit to a CSS container and reduce output. Default format is markdown; switch to 'html' only when you need tag/class names for building extract selectors. Lower max_text_length (e.g. 3000) when probing structure.",
  {
    session_id: z.string().describe("Session ID (ses_...)"),
    scope: z.string().optional().describe("CSS selector to scope observation to a page section"),
    format: z.enum(["markdown", "html"]).optional().describe("Content format: 'markdown' (default) or 'html'"),
    max_text_length: z.number().optional().describe("Max content length in chars (default: 12000). Increase if content is truncated."),
  },
  async (params) => {
    const observeParams: Record<string, unknown> = {};
    if (params.scope) observeParams.scope = params.scope;
    if (params.format) observeParams.format = params.format;
    if (params.max_text_length) observeParams.max_text_length = params.max_text_length;
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
      if (params.value !== undefined) fillParams.value = params.value;
      if (params.submit) fillParams.submit = true;
      steps.push({ fill: fillParams });
    }
    const data = await apiRequest("POST", `/v1/sessions/${params.session_id}/act`, { steps });
    return { content: [{ type: "text" as const, text: formatPageState(data) }] };
  },
);

server.tool(
  "browserbeam_extract",
  "Extract structured data from the page using a declarative schema. Selectors use CSS >> attribute syntax (e.g. 'h1 >> text', 'a >> href'). For lists, wrap in an array with _parent for the repeating container. Use _limit to test with a small sample before extracting the full list.",
  {
    session_id: z.string().describe("Session ID (ses_...)"),
    schema: z.string().describe("JSON extraction schema. Scalar: '{\"title\": \"h1 >> text\"}'. List: '{\"items\": [{\"_parent\": \".card\", \"_limit\": 3, \"name\": \"h2 >> text\", \"url\": \"a >> href\"}]}'. Attributes: >> text, >> href, >> src, >> data-*, >> any HTML attribute."),
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
  "browserbeam_type",
  "Type text character-by-character into an input. Fires real keyboard events for each character. Use for autocomplete, search-as-you-type, or inputs that need keystroke events. Does NOT clear the field first (use fill for that).",
  {
    session_id: z.string().describe("Session ID (ses_...)"),
    ref: z.string().optional().describe("Element ref (e.g. 'e1')"),
    label: z.string().optional().describe("Field label to type into"),
    value: z.string().describe("Text to type"),
    delay: z.number().optional().describe("Milliseconds between keystrokes (default: 50)"),
  },
  async (params) => {
    const typeParams: Record<string, unknown> = { value: params.value };
    if (params.ref) typeParams.ref = params.ref;
    if (params.label) typeParams.label = params.label;
    if (params.delay) typeParams.delay = params.delay;
    const data = await apiRequest("POST", `/v1/sessions/${params.session_id}/act`, {
      steps: [{ type: typeParams }],
    });
    return { content: [{ type: "text" as const, text: formatPageState(data) }] };
  },
);

server.tool(
  "browserbeam_select",
  "Select an option from a <select> dropdown by its value.",
  {
    session_id: z.string().describe("Session ID (ses_...)"),
    ref: z.string().optional().describe("Element ref (e.g. 'e1')"),
    label: z.string().optional().describe("Field label of the select element"),
    value: z.string().describe("Option value to select"),
  },
  async (params) => {
    const selectParams: Record<string, unknown> = { value: params.value };
    if (params.ref) selectParams.ref = params.ref;
    if (params.label) selectParams.label = params.label;
    const data = await apiRequest("POST", `/v1/sessions/${params.session_id}/act`, {
      steps: [{ select: selectParams }],
    });
    return { content: [{ type: "text" as const, text: formatPageState(data) }] };
  },
);

server.tool(
  "browserbeam_check",
  "Check or uncheck a checkbox or radio button.",
  {
    session_id: z.string().describe("Session ID (ses_...)"),
    ref: z.string().optional().describe("Element ref (e.g. 'e1')"),
    label: z.string().optional().describe("Element label"),
    checked: z.boolean().optional().describe("Set to false to uncheck (default: true)"),
  },
  async (params) => {
    const checkParams: Record<string, unknown> = {};
    if (params.ref) checkParams.ref = params.ref;
    if (params.label) checkParams.label = params.label;
    if (params.checked !== undefined) checkParams.checked = params.checked;
    const data = await apiRequest("POST", `/v1/sessions/${params.session_id}/act`, {
      steps: [{ check: checkParams }],
    });
    return { content: [{ type: "text" as const, text: formatPageState(data) }] };
  },
);

server.tool(
  "browserbeam_scroll",
  "Scroll the page by direction, to top/bottom, or scroll an element into view.",
  {
    session_id: z.string().describe("Session ID (ses_...)"),
    direction: z.enum(["up", "down"]).optional().describe("Scroll direction"),
    amount: z.number().optional().describe("Pixels to scroll (default: 500)"),
    times: z.number().optional().describe("Repeat scroll N times (default: 1)"),
    to: z.enum(["top", "bottom"]).optional().describe("Jump to page top or bottom"),
    ref: z.string().optional().describe("Scroll element into view by ref"),
    text: z.string().optional().describe("Scroll element into view by text"),
    label: z.string().optional().describe("Scroll element into view by label"),
  },
  async (params) => {
    const scrollParams: Record<string, unknown> = {};
    if (params.direction) scrollParams.direction = params.direction;
    if (params.amount) scrollParams.amount = params.amount;
    if (params.times) scrollParams.times = params.times;
    if (params.to) scrollParams.to = params.to;
    if (params.ref) scrollParams.ref = params.ref;
    if (params.text) scrollParams.text = params.text;
    if (params.label) scrollParams.label = params.label;
    const data = await apiRequest("POST", `/v1/sessions/${params.session_id}/act`, {
      steps: [{ scroll: scrollParams }],
    });
    return { content: [{ type: "text" as const, text: formatPageState(data) }] };
  },
);

server.tool(
  "browserbeam_scroll_collect",
  "Scroll through the entire page to trigger lazy-loaded content, then return a unified observation. Ideal for infinite scroll or long pages.",
  {
    session_id: z.string().describe("Session ID (ses_...)"),
    max_scrolls: z.number().optional().describe("Safety limit on scroll iterations (default: 50)"),
    wait_ms: z.number().optional().describe("Pause between scrolls in ms (default: 500)"),
    timeout_ms: z.number().optional().describe("Total time budget in ms (default: 60000)"),
    max_text_length: z.number().optional().describe("Content length limit (default: 100000)"),
  },
  async (params) => {
    const scParams: Record<string, unknown> = {};
    if (params.max_scrolls) scParams.max_scrolls = params.max_scrolls;
    if (params.wait_ms) scParams.wait_ms = params.wait_ms;
    if (params.timeout_ms) scParams.timeout_ms = params.timeout_ms;
    if (params.max_text_length) scParams.max_text_length = params.max_text_length;
    const data = await apiRequest("POST", `/v1/sessions/${params.session_id}/act`, {
      steps: [{ scroll_collect: scParams }],
    });
    return { content: [{ type: "text" as const, text: formatPageState(data) }] };
  },
);

server.tool(
  "browserbeam_wait",
  "Wait for a condition before continuing. Provide exactly one of: ms, selector, text, or until.",
  {
    session_id: z.string().describe("Session ID (ses_...)"),
    ms: z.number().optional().describe("Fixed wait in milliseconds"),
    selector: z.string().optional().describe("CSS selector to wait for"),
    text: z.string().optional().describe("Wait for this text to appear on the page"),
    until: z.string().optional().describe("JavaScript expression to wait for (must become truthy)"),
    timeout: z.number().optional().describe("Max wait time in ms for selector/text/until (default: 10000)"),
  },
  async (params) => {
    const waitParams: Record<string, unknown> = {};
    if (params.ms) waitParams.ms = params.ms;
    if (params.selector) waitParams.selector = params.selector;
    if (params.text) waitParams.text = params.text;
    if (params.until) waitParams.until = params.until;
    if (params.timeout) waitParams.timeout = params.timeout;
    const data = await apiRequest("POST", `/v1/sessions/${params.session_id}/act`, {
      steps: [{ wait: waitParams }],
    });
    return { content: [{ type: "text" as const, text: formatPageState(data) }] };
  },
);

server.tool(
  "browserbeam_execute_js",
  "Run custom JavaScript in the browser page context. Use 'return' to send values back. The return value appears in the extraction field under result_key.",
  {
    session_id: z.string().describe("Session ID (ses_...)"),
    code: z.string().describe("JavaScript code to execute. Use 'return' to send values back."),
    result_key: z.string().optional().describe("Key name in extraction for the return value (default: 'js_result')"),
    timeout: z.number().optional().describe("Max execution time in ms (default: 10000)"),
  },
  async (params) => {
    const jsParams: Record<string, unknown> = { code: params.code };
    if (params.result_key) jsParams.result_key = params.result_key;
    if (params.timeout) jsParams.timeout = params.timeout;
    const data = await apiRequest("POST", `/v1/sessions/${params.session_id}/act`, {
      steps: [{ execute_js: jsParams }],
    });
    return { content: [{ type: "text" as const, text: formatPageState(data) }] };
  },
);

server.tool(
  "browserbeam_pdf",
  "Generate a PDF of the current page. Returns base64-encoded PDF data.",
  {
    session_id: z.string().describe("Session ID (ses_...)"),
    format: z.string().optional().describe("Paper size (default: 'A4')"),
    landscape: z.boolean().optional().describe("Landscape orientation (default: false)"),
    print_background: z.boolean().optional().describe("Print background graphics (default: true)"),
    scale: z.number().optional().describe("Scale factor 0.1-2 (default: 1)"),
  },
  async (params) => {
    const pdfParams: Record<string, unknown> = {};
    if (params.format) pdfParams.format = params.format;
    if (params.landscape !== undefined) pdfParams.landscape = params.landscape;
    if (params.print_background !== undefined) pdfParams.print_background = params.print_background;
    if (params.scale) pdfParams.scale = params.scale;
    const data = await apiRequest("POST", `/v1/sessions/${params.session_id}/act`, {
      steps: [{ pdf: pdfParams }],
    });
    return { content: [{ type: "text" as const, text: formatPageState(data) }] };
  },
);

server.tool(
  "browserbeam_upload",
  "Upload files to a <input type=\"file\"> element. Provide file URLs that Browserbeam will download and attach.",
  {
    session_id: z.string().describe("Session ID (ses_...)"),
    ref: z.string().optional().describe("Element ref of the file input (e.g. 'e1')"),
    label: z.string().optional().describe("Label of the file input"),
    files: z.array(z.string()).describe("Array of file URLs to download and attach"),
  },
  async (params) => {
    const uploadParams: Record<string, unknown> = { files: params.files };
    if (params.ref) uploadParams.ref = params.ref;
    if (params.label) uploadParams.label = params.label;
    const data = await apiRequest("POST", `/v1/sessions/${params.session_id}/act`, {
      steps: [{ upload: uploadParams }],
    });
    return { content: [{ type: "text" as const, text: formatPageState(data) }] };
  },
);

server.tool(
  "browserbeam_list_sessions",
  "List your active browser sessions.",
  {
    status: z.enum(["active", "closed"]).optional().describe("Filter by status (default: all)"),
    limit: z.number().optional().describe("Results per page, 1-100 (default: 25)"),
  },
  async (params) => {
    const queryParts: string[] = [];
    if (params.status) queryParts.push(`status=${params.status}`);
    if (params.limit) queryParts.push(`limit=${params.limit}`);
    const query = queryParts.length ? `?${queryParts.join("&")}` : "";
    const data = await apiRequest("GET", `/v1/sessions${query}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  },
);

server.tool(
  "browserbeam_get_session",
  "Get the current status and metadata of a session.",
  {
    session_id: z.string().describe("Session ID (ses_...)"),
  },
  async (params) => {
    const data = await apiRequest("GET", `/v1/sessions/${params.session_id}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
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
