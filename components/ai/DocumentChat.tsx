"use client";

import { ChatPanel } from "@/components/ai/ChatPanel";

export function DocumentChat({ fileId, fileName }: { fileId: string; fileName: string }) {
  return <ChatPanel fileId={fileId} fileName={fileName} key={fileId} mode="file" />;
}
