import { Bot, session, Context } from "grammy";
import {
  ConversationFlavor,
  conversations,
  createConversation,
  Conversation,
} from "@grammyjs/conversations";
import { main } from "../main.ts";
import type { SessionFlavor } from "grammy";
import { login } from "../login.ts";
const token = process.env.BOT_TOKEN;

type SessionData = {};
type MyContext = Context &
  SessionFlavor<SessionData> &
  ConversationFlavor<Context>;

const bot = new Bot<MyContext>(String(token));
const YOUR_CHAT_ID = 7090272717;
type MyConversation = Conversation<MyContext, MyContext>;

bot.use(session({ initial: (): SessionData => ({}) }));
bot.use(conversations());
bot.use(createConversation(splitFlow));
bot.use(createConversation(loginFlow));

async function splitFlow(conversation: MyConversation, ctx: MyContext) {
  await ctx.reply("📋 Send me the booking code:");
  const codeCtx = await conversation.wait();
  const bookingCode = codeCtx.message?.text;

  await ctx.reply("📋 How many slips do you want it to create:");
  const roundCtx = await conversation.wait();
  const rounds = roundCtx.message?.text;

  await ctx.reply("✂️ How many games per slip do you want?");
  const countCtx = await conversation.wait();
  const splitCount = Number(countCtx.message?.text);

  if (isNaN(splitCount) || splitCount < 2) {
    return ctx.reply("❌ Invalid number, start again with /split");
  }

  await ctx.reply("💰 How much stake per slip? (in ₦)");
  const stakeCtx = await conversation.wait();
  const stake = Number(stakeCtx.message?.text);

  if (isNaN(stake) || stake <= 0) {
    return ctx.reply("❌ Invalid stake, start again with /split");
  }

  await ctx.reply(
    `🔄 Splitting *${bookingCode}* into *${splitCount}* slips of *₦${stake}* each...`,
    { parse_mode: "Markdown" },
  );

  // pipe console.log to telegram
  const log = async (msg: string) => {
    await ctx.reply(msg);
    console.log(msg);
  };

  try {
    const results = await main(
      String(bookingCode),
      splitCount,
      Number(rounds),
      stake,
      log,
    );

    await ctx.reply(`*Done!*\n\n${results}`, { parse_mode: "Markdown" });
  } catch (err: any) {
    await ctx.reply(`❌ Error: ${err.message}`);
  }
}

async function loginFlow(conversation: MyConversation, ctx: MyContext) {
  await ctx.reply("📋 Send me the phone number:");
  const phoneCtx = await conversation.wait();
  const phoneCode = phoneCtx.message?.text;

  await ctx.reply("📋 Send the password:");
  const passwordCtx = await conversation.wait();
  const rounds = passwordCtx.message?.text;

  await ctx.reply(`🔄 Logging in at the moment ...`, {
    parse_mode: "Markdown",
  });

  const log = async (msg: string) => {
    await ctx.reply(msg);
    console.log(msg);
  };

  try {
    const results = await login(String(phoneCode), String(rounds), log);

    await ctx.reply(`*Done!*\n\n${results}`, { parse_mode: "Markdown" });
  } catch (err: any) {
    await ctx.reply(`❌ Error: ${err.message}`);
  }
}
bot.use(async (ctx, next) => {
  if (ctx.from?.id !== YOUR_CHAT_ID) return;
  await next();
});

// await bot.api.setMyCommands([
//   { command: 'split', description: 'Split a booking code into multiple slips' },
//   { command: 'login', description: 'Login Into Sporty Account' },
// ])

bot.command("split", async (ctx) => {
  console.log("split command received from", ctx.from?.id);
  await ctx.conversation.enter("splitFlow");
});

bot.command("login", async (ctx) => {
  console.log("Login command received from", ctx.from?.id);
  await ctx.conversation.enter("loginFlow");
});

bot.on("message", (ctx) => {
  console.log(ctx);
});

try {
  bot.start();
  console.log("Telegram Bot Started");
} catch (error) {
  console.error(error);
}
