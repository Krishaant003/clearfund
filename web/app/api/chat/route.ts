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

  let mcpClient: MCPClient;
  let mcpTools: ToolSet;
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
    console.error("Sanity Context MCP connection failed:", error);
    return Response.json(
      { error: "Could not reach the Sanity Context MCP endpoint, so the agent can't read the Knowledge Base." },
      { status: 502 }
    );
  }

  const tools = { ...mcpTools, ...customTools };
  const closeMcpClient = () => mcpClient.close();

  const result = streamText({
    model: google("gemini-3.1-flash-lite"),
    maxRetries: 5,
    streamRetries: 2,
    stopWhen: stepCountIs(8),
    system:
      "You trace US community foundation grants through re-granting intermediaries. " +
      "Answer by querying the Sanity Context Knowledge Base through the MCP tools first, and base your answer on what they return. " +
      "Use traceChain only for multi-hop questions (how many hops a donation takes before reaching a program). " +
      "Cite the sourceObjectId for every grant claim you make.",
    messages: await convertToModelMessages(messages),
    tools,
    onFinish: closeMcpClient,
    onError: closeMcpClient,
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream, tools }),
  });
}
