import { telegramTestCli } from "../apps/worker/src/telegram-test-cli";

await telegramTestCli(process.argv.slice(2));
