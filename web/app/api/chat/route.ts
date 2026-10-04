import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import { google } from "@ai-sdk/google";
import {
  convertToModelMessages,
  streamText,
  stepCountIs,
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

  let mcpClient: MCPClient | undefined;
  let mcpTools: ToolSet = {};
  try {
    mcpClient = await createMCPClient({
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
  const closeMcpClient = () => mcpClient?.close();

  const result = streamText({
    model: google("gemini-3.1-flash-lite"),
    maxRetries: 5,
    streamRetries: 2,
    stopWhen: stepCountIs(8),
    system:
      "You trace US community foundation grants through re-granting intermediaries. " +
      "Facts about grants (who funded whom, amounts, years, hop counts) must come from getGrantsByFunder, getGrantsByRecipient, findIntermediaries and traceChain, which read the exact grant records. " +
      "For any question about where a donation goes or how many hops it takes, call traceChain with the starting organization's EIN; do not estimate hops from the Knowledge Base. " +
      "State the hop count exactly as traceChain returned it: the number of hops it lists, and if endedReason is no_further_grants the chain really ends at that recipient in this dataset. Never say a recipient passes money on unless a tool result shows grants from it. " +
      "You may use the Knowledge Base for background on the organizations, but never contradict the grant tools with it. " +
      "Cite the sourceObjectId for every grant claim you make. " +
      "Write short answers: a one-sentence conclusion, then at most four bullet points. The app already shows the chain diagram and grant table, so do not repeat every row.",
    messages: await convertToModelMessages(messages),
    tools,
    onFinish: closeMcpClient,
    onError: closeMcpClient,
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream, tools }),
  });
}
