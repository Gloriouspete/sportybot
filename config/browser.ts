import { BrowserContext, chromium, Page } from "playwright-core";
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

async function CreateBrowser(
  userid: string,
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
    return { browser, page };
  } catch (error: any) {
    throw new Error(error?.message || error);
  }
}

export default CreateBrowser;