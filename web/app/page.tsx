"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState } from "react";
import type { ChatMessage } from "./api/chat/route";
import { ChainTrace } from "@/components/ChainTrace";

export default function Page() {
  const [input, setInput] = useState("");
  const { messages, sendMessage } = useChat<ChatMessage>({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  return (
    <main>
      <h1>Money Flow Agent</h1>
      <div>
        {messages.map((message) => (
          <div key={message.id}>
            <strong>{message.role}: </strong>
            {message.parts.map((part, i) => {
              switch (part.type) {
                case "text":
                  return <span key={`${message.id}-${i}`}>{part.text}</span>;
                case "tool-traceChain":
                  return part.state === "output-available" ? (
                    <ChainTrace key={`${message.id}-${i}`} result={part.output} />
                  ) : null;
                default:
                  return null;
              }
            })}
          </div>
        ))}
      </div>
      <input
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && input.trim()) {
            sendMessage({ text: input });
            setInput("");
          }
        }}
        placeholder="Ask about a donation's path..."
      />
    </main>
  );
}
