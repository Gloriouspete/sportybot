import { chromium, BrowserContext, Page } from "playwright-core";
import * as path from "path";
import * as os from "os";
import CreateBrowser from "../config/browser";

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
   const { browser, page } = await CreateBrowser(userid);
  await sleep(1000);
  return { browser, page };
}

async function loadLogger(
  page: Page,
  phonecode: string,
  password: string,
  log: Function,
): Promise<string> {
  console.log(`\n📋 Loading phone number: ${phonecode}`);
  await page.goto(SPORTYBET_URL, { waitUntil: "domcontentloaded" });
  await sleep(500);
  const isLoggedIn = page.locator(".m-info.on");
  console.log(phonecode, password);
  if (await isLoggedIn.isVisible()) {
    const balance = await page
      .locator("#j_balance").innerText()
      .catch(() => "unknown");

    log(`✅ Logged in — Balance: ${balance}`);

    return "logged in already";
  }

  await page.locator('input[name="phone"]').fill(phonecode);
  await page.locator('input[name="psd"]').fill(password);
  await page.locator('button[name="logIn"]').click();

  await Promise.race([
    page.waitForSelector(".m-info.on", { timeout: 15000 }),
    page.waitForSelector(".m-error-wrapper i", { timeout: 15000 }),
  ]);

  const errorCount = await page.locator(".m-error-wrapper i").count();
  if (errorCount > 0) {
    const msg = await page.locator(".m-error-wrapper").textContent();
    throw new Error(`Login failed: ${msg?.trim()}`);
  }

  const balance = await page
    .locator("#j_balance")
    .innerText()
    .catch(() => "unknown");
  log(`✅ Logged in — Balance: ${balance}`);
  return `✅ Logged in — Balance: ${balance}`;
}

export async function login(
  userId: string,
  phoneCode: string,
  password: string,
  log: Function,
): Promise<string> {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║          🎯 Sportybet Login              ║");
  console.log("╚══════════════════════════════════════════╝");

  if (!phoneCode) {
    await log("❌ No Phone Number provided.");
    return "Invalid Phone Number";
  }

  const { browser, page } = await launchBrowser(userId);
  console.log("dom loaded");
  try {
    const result = await loadLogger(page, phoneCode, String(password), log);
    await browser.close();
    return result;
  } catch (err: any) {
    await log(`\n❌ Error logging in ${err?.message}`);
    await browser.close();
  }

  return `📊 Done! Fully logged in`;
}
