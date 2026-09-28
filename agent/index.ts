import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { loadConfig } from "./config.ts";

async function main() {
  loadConfig(); // fails fast if required env vars are missing

  const prompt = process.argv.slice(2).join(" ") || "Say hello in one sentence.";

  const { text } = await generateText({
    model: google("gemini-3.8-flash"),
    prompt,
  });

  console.log(text);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
