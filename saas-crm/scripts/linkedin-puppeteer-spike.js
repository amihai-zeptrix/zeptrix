#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");
const puppeteer = require("puppeteer-core");

const DEFAULT_CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function parseArgs(argv) {
  const args = {
    chromePath: process.env.CHROME_PATH || DEFAULT_CHROME_PATH,
    userDataDir: process.env.LINKEDIN_CHROME_PROFILE || path.join(os.tmpdir(), "zeptrix-linkedin-puppeteer-profile"),
    profileId: process.env.LINKEDIN_PROFILE_ID || "",
    conversationId: process.env.LINKEDIN_CONVERSATION_ID || "",
    limit: Number(process.env.LINKEDIN_LIMIT || 10),
    headless: process.env.HEADLESS === "1",
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--chrome-path") {
      args.chromePath = next;
      index += 1;
    } else if (arg === "--user-data-dir") {
      args.userDataDir = next;
      index += 1;
    } else if (arg === "--profile-id") {
      args.profileId = next;
      index += 1;
    } else if (arg === "--conversation-id") {
      args.conversationId = next;
      index += 1;
    } else if (arg === "--limit") {
      args.limit = Number(next);
      index += 1;
    } else if (arg === "--headless") {
      args.headless = true;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }

  if (!Number.isFinite(args.limit) || args.limit < 1 || args.limit > 50) args.limit = 10;
  return args;
}

function printHelp() {
  console.log(`
LinkedIn Puppeteer spike

Opens Chrome with an isolated user profile, lets you sign in manually, then queries
LinkedIn's logged-in web endpoints from the page context.

Usage:
  node scripts/linkedin-puppeteer-spike.js
  node scripts/linkedin-puppeteer-spike.js --profile-id <linkedinProfileId>
  node scripts/linkedin-puppeteer-spike.js --conversation-id <conversationId>

Options:
  --profile-id        Filter conversations by LinkedIn mini-profile ID.
  --conversation-id  Fetch message events for a specific conversation.
  --limit            Number of returned conversations/messages, 1-50. Default: 10.
  --user-data-dir    Chrome profile directory. Default: temp isolated profile.
  --chrome-path      Chrome executable path.
  --headless         Run without a visible browser. Requires an already-authenticated profile.
  --json             Print raw JSON only.
`);
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, () => {
      rl.close();
      resolve();
    });
  });
}

function summarizeConversation(conversation) {
  return {
    conversationId: conversation.entityUrn?.replace("urn:li:fs_conversation:", ""),
    entityUrn: conversation.entityUrn,
    lastActivityAt: conversation.lastActivityAt,
    lastActivityIso: conversation.lastActivityAt ? new Date(conversation.lastActivityAt).toISOString() : null,
    unreadCount: conversation.unreadCount,
    totalEventCount: conversation.totalEventCount,
    read: conversation.read,
    archived: conversation.archived,
    blocked: conversation.blocked,
    participantUrns: conversation["*participants"] || [],
  };
}

function summarizeMessage(event) {
  return {
    eventUrn: event.entityUrn,
    createdAt: event.createdAt,
    createdIso: event.createdAt ? new Date(event.createdAt).toISOString() : null,
    from: event["*from"],
    text: event.eventContent?.attributedBody?.text || "",
  };
}

async function waitForManualLogin(page, { json, headless }) {
  await page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded" });
  const currentUrl = page.url();
  if (!currentUrl.includes("/login") && !currentUrl.includes("/checkpoint") && !currentUrl.includes("/uas/")) return;

  if (headless) {
    throw new Error("LinkedIn Chrome profile is not logged in. Run the spike once without --headless and complete LinkedIn login.");
  }
  if (!json) {
    console.error("Chrome is open. Sign in to LinkedIn manually, complete any checkpoint, then return here.");
  }
  await ask("Press Enter after LinkedIn is logged in...");
  await page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded" });
}

async function linkedinFetch(page, endpoint, params = {}) {
  return page.evaluate(
    async ({ endpoint: endpointArg, params: paramsArg }) => {
      const jsession = document.cookie
        .split(";")
        .map((item) => item.trim())
        .find((item) => item.startsWith("JSESSIONID="))
        ?.split("=")
        .slice(1)
        .join("=")
        .replace(/^"|"$/g, "");

      const url = new URL(endpointArg, "https://www.linkedin.com/voyager/api/");
      Object.entries(paramsArg).forEach(([key, value]) => {
        if (value == null || value === "") return;
        if (Array.isArray(value)) {
          value.forEach((item) => url.searchParams.append(key, item));
        } else {
          url.searchParams.set(key, String(value));
        }
      });

      const response = await fetch(url.toString(), {
        credentials: "include",
        headers: {
          accept: "application/vnd.linkedin.normalized+json+2.1",
          "csrf-token": jsession || "",
          "x-restli-protocol-version": "2.0.0",
        },
      });

      const text = await response.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        body,
      };
    },
    { endpoint, params },
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (!fs.existsSync(args.chromePath)) {
    throw new Error(`Chrome executable not found: ${args.chromePath}`);
  }

  const browser = await puppeteer.launch({
    executablePath: args.chromePath,
    headless: args.headless,
    userDataDir: args.userDataDir,
    defaultViewport: { width: 1440, height: 1000 },
    args: ["--disable-blink-features=AutomationControlled"],
  });

  try {
    const [page] = await browser.pages();
    await waitForManualLogin(page, { json: args.json, headless: args.headless });

    let result;
    if (args.conversationId) {
      const response = await linkedinFetch(page, `messaging/conversations/${args.conversationId}/events`, {
        keyVersion: "LEGACY_INBOX",
      });
      const events = Array.isArray(response.body?.included)
        ? response.body.included.filter((item) => item.$type === "com.linkedin.voyager.messaging.Event")
        : [];
      result = {
        request: "messages",
        status: response.status,
        ok: response.ok,
        conversationId: args.conversationId,
        messages: events.slice(0, args.limit).map(summarizeMessage),
        rawCount: events.length,
      };
    } else {
      const params = {
        keyVersion: "LEGACY_INBOX",
        ...(args.profileId ? { q: "participants", recipients: args.profileId } : {}),
      };
      const response = await linkedinFetch(page, "messaging/conversations", params);
      const conversations = Array.isArray(response.body?.included)
        ? response.body.included.filter((item) => item.$type === "com.linkedin.voyager.messaging.Conversation")
        : [];
      result = {
        request: "conversations",
        status: response.status,
        ok: response.ok,
        profileId: args.profileId || null,
        conversations: conversations
          .sort((a, b) => Number(b.lastActivityAt || 0) - Number(a.lastActivityAt || 0))
          .slice(0, args.limit)
          .map(summarizeConversation),
        rawCount: conversations.length,
      };
    }

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
