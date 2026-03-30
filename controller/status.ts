import { BrowserContext, Page } from "playwright-core";
import CreateBrowser from "../config/browser";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function launchBrowser(
  userid: string,
): Promise<{ browser: BrowserContext; page: Page }> {
  const { browser, page } = await CreateBrowser(userid);
  return { browser, page };
}

async function loadLogger(page: Page, log: Function): Promise<string> {
  await sleep(2500);
  const isLoggedIn = page.locator(".m-info.on");
  if (await isLoggedIn.isVisible()) {
    const balance = await page
      .locator("#j_balance")
      .innerText()
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
