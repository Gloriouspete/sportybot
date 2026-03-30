import { BrowserContext, Page } from "playwright-core";
import CreateBrowser from "../config/browser";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function launchBrowser(
  userid: string,
  log: Function,
): Promise<{ browser: BrowserContext; page: Page }> {
  try {
    const { browser, page } = await CreateBrowser(userid);
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
  await page
    .locator('[data-op="desktop-betslip-success-dialog"]')
    .waitFor({ state: "hidden", timeout: 8000 })
    .catch(() => {});
  await sleep(500);

  const count = await page
    .locator(".m-item .m-icon-delete:not(.m-input-icon)")
    .count();
  console.log("see count", count);
  if (count > 0) {
    for (let i = 0; i < count; i++) {
      const btn = page
        .locator(".m-item .m-icon-delete:not(.m-input-icon)")
        .first();
      await btn.waitFor({ state: "visible", timeout: 5000 });
      await btn.click({ force: true });
      await sleep(300);
    }
  }

  await page.evaluate((): boolean => {
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
  await sleep(500);
  const inputSel =
    'input[placeholder*="code" i], input[placeholder*="booking" i], input[class*="booking" i]';

  await page.waitForSelector(inputSel, { timeout: 10000 });
  await page.click(inputSel, { clickCount: 3 });
  await page.fill(inputSel, code);
  await page.click('[data-op="desktop-booking-code-load-button"]');
  await sleep(2000);
  const input = page.locator(".m-input-com input");
  if (input) {
    await input?.click();
    await input.fill("10");
  }
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
  const deleteLocator = page.locator(".m-icon-delete:not(.m-input-icon)");
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
 
  console.log("reached here")
  const suspendedCount = await page.evaluate(() => {
    const items = [...document.querySelectorAll(".m-item")];
    const suspended = items.filter((item) =>
      item.querySelector('[data-cms-key="suspended"]'),
    );
    suspended.forEach((item) => {
      const btn = item.querySelector<HTMLElement>(
        ".m-icon-delete:not(.m-input-icon)",
      );
      btn?.click();
    });
    return suspended.length;
  });
  
  console.log("suspended removed:", suspendedCount);
  if (suspendedCount > 0) await sleep(300 * suspendedCount); // wait for DOM to settle


  const newLocator = page.locator(".m-icon-delete:not(.m-input-icon)");
  const newTotal = await newLocator.count();
  const removeCount = newTotal > keepCount ? newTotal - keepCount : 0;

  console.log("we remove ", removeCount);
  if (removeCount > 0) {
    for (let i = 0; i < removeCount; i++) {
      const deleteButtons = page.locator(".m-icon-delete:not(.m-input-icon)");
      const count = await deleteButtons.count();
      console.log("see count", count);
      if (count === 0) break;
      const randomIndex = Math.floor(Math.random() * count);
      const target = deleteButtons.nth(randomIndex);

      await target.scrollIntoViewIfNeeded();
      await target.click({ force: true });
      await page.waitForTimeout(350);
    }
  }
  await sleep(1000);
  const remaining = await getGameCount(page);
  return remaining;
}

type BetResult = "success" | "insufficient_funds" | "error" | "unknown";

async function placeBet(page: Page): Promise<BetResult> {
  console.log("💰 Placing bet...");

  const acceptChangeBtn = page.locator('[data-cms-key="accept_changes"]');
  const exists = await acceptChangeBtn.count();
  if (exists > 0) {
    await acceptChangeBtn.click({ force: true });
    await sleep(350);
  }

  const placeBetBtn = page.locator('[data-cms-key="place_bet"]');
  if (await placeBetBtn.isVisible()) {
    await placeBetBtn.click();
    await sleep(350);
  } else {
    throw new Error("Cannot find the Place Bet Button");
  }

  const confirmBtn = page.locator('[data-cms-key="confirm"]');
  if (await confirmBtn.isVisible()) {
    await confirmBtn.click();
  } else {
    throw new Error("Cannot find the confirm Button");
  }

  await sleep(1500);
  const success = page.locator('[data-op="desktop-betslip-success-dialog"]');
  if (success) {
    const bookingCode = await page.$eval(".booking-code", (el) =>
      el.textContent?.trim(),
    );
    await page
      .locator(
        '[data-op="desktop-betslip-success-dialog"] button[data-ret="close"]',
      )
      .click();
    return "success";
  }

  const insufficient = await page.$(
    '.m-dialog-wrapper .m-pop-main [data-cms-key="deposit"]',
  );

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
