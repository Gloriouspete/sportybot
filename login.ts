import puppeteer, { Browser, Page } from "puppeteer-core";
import * as path from "path";
import * as os from "os";

const CHROME_PATHS: Record<string, string> = {
  darwin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  linux: "/usr/bin/google-chrome",
};

const USER_DATA_DIR = path.join(os.homedir(), ".sportybet-chrome-profile");
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

async function launchBrowser(): Promise<{ browser: Browser; page: Page }> {
  console.log(`\n🚀 Launching Chrome...`);
  console.log(`   Profile dir: ${USER_DATA_DIR}\n`);

  // const browser = await puppeteer.launch({
  //   executablePath: getChromePath(),
  //   userDataDir: USER_DATA_DIR,
  //   headless: false,
  //   defaultViewport: null,
  //   args: ["--no-sandbox", "--disable-setuid-sandbox", "--start-maximized"],
  // });
  // 
  const browser = await puppeteer.launch({
    executablePath: getChromePath(),
    userDataDir: USER_DATA_DIR,
    headless: true,
    defaultViewport: null,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ]
  });

  const page = await browser.newPage();
  await page.goto(SPORTYBET_URL, { waitUntil: "domcontentloaded" });
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
  await page.goto(SPORTYBET_URL, { waitUntil: "networkidle2" });
  await sleep(500);
  const isLoggedIn = (await page.$(".m-info.on")) !== null;
  if (isLoggedIn) {
    const balance = await page
      .$eval("#j_balance", (el) => (el as HTMLElement).innerText)
      .catch(() => "unknown");

    log(`✅ Logged in — Balance: ${balance}`);

    return "logged in already";
  }

  await page.$eval(
    'input[name="phone"]',
    (el: HTMLInputElement) => (el.value = ""),
  );
  await page.type('input[name="phone"]', phonecode);

  await page.$eval(
    'input[name="psd"]',
    (el: HTMLInputElement) => (el.value = ""),
  );
  await page.type('input[name="psd"]', password);

  await page.click('button[name="logIn"]');
  await Promise.race([
    page.waitForSelector(".m-info.on", { timeout: 15000 }),
    page.waitForSelector(".m-error-wrapper i", { timeout: 15000 }),
  ]);

  const error = await page.$(".m-error-wrapper i");
  if (error) {
    const msg = await page.$eval(".m-error-wrapper", (el) =>
      el.textContent?.trim(),
    );
    throw new Error(`Login failed: ${msg}`);
  }

  const balance = await page
    .$eval("#j_balance", (el) => (el as HTMLElement).innerText)
    .catch(() => "unknown");
  console.log(`✅ Logged in — Balance: ${balance}`);
  log(`✅ Logged in — Balance: ${balance}`);


  return `✅ Logged in — Balance: ${balance}`;
}

export async function login(
  phoneCode: string,
  password: number,
  log: Function,
): Promise<string> {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║          🎯 Sportybet Login              ║");
  console.log("╚══════════════════════════════════════════╝");

  if (!phoneCode) {
    await log("❌ No Phone Number provided.");
    return "Invalid Phone Number";
  }

  const { browser, page } = await launchBrowser();
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
