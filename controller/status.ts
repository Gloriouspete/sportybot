import { chromium, BrowserContext, Page } from "playwright-core";
import * as path from "path";
import * as os from "os";

const CHROME_PATHS: Record<string, string> = {
  darwin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  linux: "/usr/bin/google-chrome",
};

const SPORTYBET_URL = "https://www.sportybet.com/ng/";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getChromePath(): string {
  return (
    process.env.CHROME_PATH ??
    CHROME_PATHS[process.platform] ??
    (() => {
      throw new Error(
        `Unsupported platform: ${process.platform}. Set CHROME_PATH env var.`,
      );
    })()
  );
}

async function launchBrowser(
  userid: string,
): Promise<{ browser: BrowserContext; page: Page }> {
  const USER_DATA_DIR = path.join(
    os.homedir(),
    `.sportybet-chrome-profile-${userid}`,
  );
  console.log(`\n🚀 Launching Chrome...`);
  console.log(`   Profile dir: ${USER_DATA_DIR}\n`);
  const browser = await chromium.launchPersistentContext(USER_DATA_DIR, {
    executablePath: getChromePath(),
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
    viewport: null,
  });
  const page = await browser.newPage();
  await page.goto(SPORTYBET_URL, { waitUntil: "domcontentloaded" });
  await sleep(1000);
  return { browser, page };
}

async function loadLogger(page: Page, log: Function): Promise<string> {
  await page.goto(SPORTYBET_URL, { waitUntil: "domcontentloaded" });
  await sleep(500);
  const isLoggedIn = page.locator(".m-info.on");
  if (await isLoggedIn.isVisible()) {
    const balance = await page
      .locator("#j_balance").innerText()
      .catch(() => "unknown");

    log(`✅ Logged in — Balance: ${balance}`);

    return "You are currently logged in";
  } else {
    return "❌❌ You're Not Logged in ...❌❌";
  }
}

export async function Status(userId: string, log: Function): Promise<string> {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║          🎯 Sportybet Login              ║");
  console.log("╚══════════════════════════════════════════╝");

  const { browser, page } = await launchBrowser(userId);
  try {
    const result = await loadLogger(page, log);
    await browser.close();
    return result;
  } catch (err: any) {
    await log(`\n❌ Error checking status ${err?.message}`);
    await browser.close();
  }

  return `📊 Done! Fully logged in`;
}
