import { createMCPClient } from "@ai-sdk/mcp";
import { google } from "@ai-sdk/google";
import {
  convertToModelMessages,
  streamText,
  createUIMessageStreamResponse,
  toUIMessageStream,
  type InferUITools,
  type ToolSet,
  type UIDataTypes,
  type UIMessage,
} from "ai";
import { tools as customTools } from "@/lib/tools";

export type ChatTools = InferUITools<typeof customTools>;
export type ChatMessage = UIMessage<never, UIDataTypes, ChatTools>;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export async function POST(req: Request) {
  const { messages }: { messages: ChatMessage[] } = await req.json();

  const orgId = requireEnv("SANITY_ORG_ID");
  const contextToken = requireEnv("SANITY_CONTEXT_TOKEN");
  const mcpUrl = `https://api.sanity.io/v1/context/organizations/${orgId}/mcp/money-flow-agent`;

  let mcpTools: ToolSet = {};
  try {
    const mcpClient = await createMCPClient({
      transport: {
        type: "http",
        url: mcpUrl,
        headers: { Authorization: `Bearer ${contextToken}` },
      },
    });
    mcpTools = await mcpClient.tools();
  } catch (error) {
    console.error("Sanity Context MCP connection failed, continuing with custom tools only:", error);
  }

  const tools = { ...mcpTools, ...customTools };

  const result = streamText({
    model: google("gemini-3.5-flash-lite"),
    maxRetries: 5,
    streamRetries: 2,
    system:
      "You trace US community foundation grants through re-granting intermediaries. " +
      "Cite the sourceObjectId for every grant claim you make. " +
      "Use traceChain to answer questions about how many hops a donation takes before reaching a program.",
    messages: await convertToModelMessages(messages),
    tools,
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream, tools }),
  });
}
