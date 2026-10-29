"use client";

import { useState } from "react";
import { ChatPanel } from "@/components/ai/ChatPanel";
import type { ChatFileOption } from "@/types/ai";

export function ChatWorkspace({ files }: { files: ChatFileOption[] }) {
  const [selectedFileId, setSelectedFileId] = useState("");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
        <label className="text-xs text-slate-400" htmlFor="chat-file-scope">
          Document scope
        </label>
        <select
          className="h-9 max-w-full rounded-lg border border-white/10 bg-slate-950 px-2 text-xs text-slate-200 outline-none focus:border-blue-400/50 sm:max-w-[320px]"
          id="chat-file-scope"
          onChange={(event) => setSelectedFileId(event.target.value)}
          value={selectedFileId}
        >
          <option value="">Whole workspace</option>
          {files.map((file) => (
            <option key={file.id} value={file.id}>
              {file.originalName}
            </option>
          ))}
        </select>
      </div>
      <ChatPanel
        fileId={selectedFileId || undefined}
        files={files}
        key={selectedFileId || "workspace"}
        mode="workspace"
      />
    </div>
  );
}
