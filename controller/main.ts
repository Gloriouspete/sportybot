import { chromium, BrowserContext, Page } from "playwright-core";
import * as path from "path";
import * as os from "os";

const CHROME_PATHS: Record<string, string> = {
  darwin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  linux: "/usr/bin/google-chrome",
};
const SPORTYBET_URL = "https://www.sportybet.com/ng/";

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
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function launchBrowser(
  userid: string,
  log: Function,
): Promise<{ browser: BrowserContext; page: Page }> {
  const USER_DATA_DIR = path.join(
    os.homedir(),
    `.sportybet-chrome-profile-${userid}`,
  );

  try {
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

    try {
      await page.waitForSelector(".m-info.on", { timeout: 15000 });
    } catch {
      await log("⚠️  Not logged in. Please log in manually.");
      throw new Error("Timed out waiting for login. Please try again.");
    }

    const balance = await page
      .locator("#j_balance")
      .innerText()
      .catch(() => "unknown");

    await log(`✅ Logged in — Balance: ${balance}`);
    return { browser, page };
  } catch (error: any) {
    throw new Error(error?.message || error);
  }
}

async function loadBookingCode(page: Page, code: string): Promise<void> {
  console.log(`\n📋 Loading booking code: ${code}`);

  await page.goto(SPORTYBET_URL, { waitUntil: "domcontentloaded" });
  await sleep(2000);
  // Click the booking code button
  const deleteBtn = await page.$$(".m-icon-delete");
  const clicked = await page.evaluate((): boolean => {
    const all = [
      ...document.querySelectorAll<HTMLElement>("button, a, span, div"),
    ];
    const target = all.find(
      (el) =>
        el.innerText?.toLowerCase().includes("booking") ||
        el.innerText?.toLowerCase().includes("load") ||
        el.getAttribute("data-i18n")?.toLowerCase().includes("booking"),
    );
    if (target) {
      target.click();
      return true;
    }
    return false;
  });

  if (!clicked && !deleteBtn)
    throw new Error(
      "Could not find the booking code button. Sportybet UI may have changed.",
    );
  await sleep(1500);
  if (!clicked && deleteBtn) {
    for (const btn of deleteBtn) {
      await btn.click();
      await sleep(300);
    }
  }
  const inputSel =
    'input[placeholder*="code" i], input[placeholder*="booking" i], input[class*="booking" i]';
  await page.waitForSelector(inputSel, { timeout: 10000 });
  await page.click(inputSel, { clickCount: 3 });
  await page.type(inputSel, code, { delay: 80 });
  await page.click('[data-op="desktop-booking-code-load-button"]');
  await sleep(2000);
  const input = page.locator(".m-input-com input");

  if (input) {
    await input?.click();
    await input.fill("10");
  }

  console.log("✅ Booking code loaded");
}

async function getGameCount(page: Page): Promise<number> {
  return page.evaluate((): number => {
    return document.querySelectorAll(
      '[class*="bet-item"], [class*="betslip-item"], [class*="slip-item"], [class*="outcome-item"]',
    ).length;
  });
}

async function removeGamesRandomly(
  page: Page,
  keepCount: number,
  stake: number,
): Promise<number> {
  console.log(`\n🎲 Keeping ${keepCount} random games, removing the rest...`);
  const deleteLocator = page.locator(".m-icon-delete");
  const totalGames = await deleteLocator.count();

  if (totalGames === 0)
    throw new Error(
      "No games found in betslip. Check the booking code or selectors.",
    );

  if (totalGames <= keepCount) {
    console.log(`   ⚠️  Only ${totalGames} games available, keeping all.`);
    return totalGames;
  }
  await page.locator('[data-cms-key="multiple"]').click();
  const input = await page.$(".m-input-com input");

  if (input) {
    await input.click({ clickCount: 3 });
    await input.fill(String(stake));
  }

  const removeCount = totalGames - keepCount;
  console.log("we remove ",removeCount)
  for (let i = 0; i < removeCount; i++) {
    const randomIndex = Math.floor(
      Math.random() * (await page.locator(".m-icon-delete").count()),
    );
    console.log(randomIndex,"random")
    await page.locator(".m-icon-delete").nth(randomIndex).click();
    await page.waitForTimeout(350);
  }
  
  await sleep(1000);
  const remaining = await getGameCount(page);
  return remaining;
}

type BetResult = "success" | "insufficient_funds" | "error" | "unknown";

async function placeBet(page: Page): Promise<BetResult> {
  console.log("💰 Placing bet...");

  const acceptChangeBtn = page.locator('[data-cms-key="accept_changes"]');
  await acceptChangeBtn.waitFor({ timeout: 1000 }).catch(() => null)
  if (acceptChangeBtn) {
    await acceptChangeBtn.click();
    await sleep(350);
  }
  
  const placeBetBtn = page.locator('[data-cms-key="place_bet"]');
  if (placeBetBtn) {
    await placeBetBtn.click();
    await sleep(350);
  } else {
    throw new Error("Cannot find the Place Bet Button");
  }
  
  const confirmBtn = page.locator('[data-cms-key="confirm"]');
  if (confirmBtn) {
    await confirmBtn.click();
  } else {
    throw new Error("Cannot find the confirm Button");
  }

  await sleep(1500);
  const success = await page.$('[data-op="desktop-betslip-success-dialog"]');
  const insufficient = await page.$(
    '.m-dialog-wrapper .m-pop-main [data-cms-key="deposit"]',
  );

  if (success) {
    const bookingCode = await page.$eval(".booking-code", (el) =>
      el.textContent?.trim(),
    );
    return "success";
  }

  if (insufficient) return "insufficient_funds";

  return "error";
}

export async function main(
  userId: string,
  bookingCode: string,
  splitCount: number,
  rounds: number,
  stake: number,
  log: Function,
): Promise<string> {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   🎯 Sportybet Booking Code Splitter     ║");
  console.log("╚══════════════════════════════════════════╝");

  if (!bookingCode) {
    await log("❌ No code provided.");
    return "Invalid Booking Code";
  }

  const { browser, page } = await launchBrowser(userId, log);

  try {
    let round = 1;
    let totalPlaced = 0;
    while (true) {
      console.log(`\n${"═".repeat(48)}`);
      console.log(`  Round ${round}`);
      console.log(`${"═".repeat(48)}`);

      try {
        await loadBookingCode(page, bookingCode);

        const remaining = await removeGamesRandomly(page, splitCount, stake);

        if (remaining === 0) {
          await log("❌ No games remain. Stopping.");
          break;
        }

        const result = await placeBet(page);

        if (result === "success") {
          totalPlaced++;
          await log(`✅ Bet placed! (${totalPlaced} games)`);
        } else if (result === "insufficient_funds") {
          await log("💸 Insufficient funds. Stopping.");
          break;
        } else {
          await log(`⚠️  Result: "${result}". Stopping to be safe.`);
          break;
        }

        round++;

        if (round > rounds) {
          break;
        }
        await sleep(2000);
      } catch (err) {
        await log(`\n❌ Error in round ${round}: ${(err as Error).message}`);
        break;
      }
    }

    await browser.close();
    console.log(`\n${"═".repeat(48)}`);
    return `📊 Done! Total bets placed: ${totalPlaced}`;
  } catch (error: any) {
    return error?.message || error;
  } finally {
    await browser.close();
  }
}
