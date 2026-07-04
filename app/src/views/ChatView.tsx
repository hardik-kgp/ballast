import { useEffect, useRef, useState } from "react";
import { ArrowUp, BarChart3, Download, Maximize2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChartById } from "@/components/charts";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { downloadChartPng, slugify } from "@/lib/downloadChart";
import {
  FOLLOW_UP_RESPONSES,
  SEED_MESSAGES,
  SUGGESTED_PROMPTS,
  type ChatArtifact,
  type ChatMessage,
} from "@/data/chat";

function ArtifactCard({ artifact }: { artifact: ChatArtifact }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);

  const handleDownload = () => {
    if (chartRef.current) {
      void downloadChartPng(chartRef.current, slugify(artifact.title));
    }
  };

  return (
    <Card className="mt-3 overflow-hidden">
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h4 className="heading-tight truncate text-[13.5px] font-semibold text-text">
              {artifact.title}
            </h4>
            <p className="mt-0.5 text-xs text-text-muted">{artifact.subtitle}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="Expand chart"
            onClick={() => setExpanded(true)}
            className="rounded-md p-1.5 text-text-subtle transition-colors hover:bg-surface-overlay hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Download chart as PNG"
            onClick={handleDownload}
            className="rounded-md p-1.5 text-text-subtle transition-colors hover:bg-surface-overlay hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </header>
      <div ref={chartRef} className="px-4 pb-3 pt-4">
        <ChartById id={artifact.chart} height={250} />
      </div>
      <footer className="border-t border-border bg-surface-raised px-4 py-2">
        <p className="text-[11px] text-text-subtle">{artifact.footnote}</p>
      </footer>
      <Dialog
        open={expanded}
        onClose={() => setExpanded(false)}
        title={artifact.title}
        subtitle={artifact.subtitle}
      >
        <ChartById id={artifact.chart} height={440} />
        <p className="mt-3 text-[11px] text-text-subtle">{artifact.footnote}</p>
      </Dialog>
    </Card>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] rounded-xl rounded-br-sm border border-border bg-surface-overlay px-4 py-2.5 text-[14px] leading-relaxed text-text">
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <div className="min-w-0 max-w-[calc(100%-40px)] flex-1">
        <p className="text-[14px] leading-[1.65] text-text">{message.content}</p>
        {message.highlights ? (
          <ul className="mt-3 space-y-1.5">
            {message.highlights.map((point) => (
              <li key={point} className="flex items-start gap-2 text-[13px] text-text-muted">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent" />
                {point}
              </li>
            ))}
          </ul>
        ) : null}
        {message.artifact ? <ArtifactCard artifact={message.artifact} /> : null}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-3" role="status" aria-label="Assistant is responding">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/10 text-accent">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-text-subtle"
            style={{ animation: `pulse-dot 1.2s ease-in-out ${i * 0.18}s infinite` }}
          />
        ))}
      </span>
    </div>
  );
}

export function ChatView() {
  const [messages, setMessages] = useState<ChatMessage[]>(SEED_MESSAGES);
  const [draft, setDraft] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const followUpIndex = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isThinking]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }, [draft]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isThinking) return;
    setDraft("");
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: "user", content: trimmed },
    ]);
    setIsThinking(true);
    const reply = FOLLOW_UP_RESPONSES[followUpIndex.current % FOLLOW_UP_RESPONSES.length];
    followUpIndex.current += 1;
    window.setTimeout(() => {
      setMessages((prev) => [...prev, { ...reply, id: `a-${Date.now()}` }]);
      setIsThinking(false);
    }, 1400);
  };

  return (
    <div className="relative flex h-full flex-col">
      <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div>
          <h1 className="heading-tight text-[14.5px] font-semibold text-text">
            Operations Assistant
          </h1>
          <p className="mt-0.5 text-[11.5px] text-text-subtle">
            Grounded in the plant data layer: telemetry, maintenance, commercial
          </p>
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[760px] space-y-7 px-4 pb-48 pt-8 sm:px-6">
          {messages.map((message, index) => (
            <div
              key={message.id}
              className="animate-fade-up"
              style={{ animationDelay: `${Math.min(index * 40, 240)}ms` }}
            >
              <MessageBubble message={message} />
            </div>
          ))}
          {isThinking ? <TypingIndicator /> : null}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 pb-5">
        <div className="pointer-events-auto mx-auto w-full max-w-[760px] px-4 sm:px-6">
          <div className="mb-2.5 flex flex-wrap gap-2">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => send(prompt)}
                className="rounded-full border border-border bg-surface/95 px-3 py-1.5 text-xs text-text-muted shadow-[0_1px_2px_rgba(16,24,40,0.06)] backdrop-blur transition-colors duration-150 hover:border-border-strong hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {prompt}
              </button>
            ))}
          </div>
          <form
            className="flex items-end gap-2 rounded-2xl border border-border-strong bg-surface p-2 shadow-[0_12px_32px_-12px_rgba(16,24,40,0.18),0_2px_6px_rgba(16,24,40,0.06)] transition-colors focus-within:border-accent/60 focus-within:ring-1 focus-within:ring-accent/30"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <label htmlFor="chat-input" className="sr-only">
              Ask about your plant
            </label>
            <textarea
              id="chat-input"
              ref={textareaRef}
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              placeholder="Ask about assets, schedule, exposure..."
              className="max-h-36 min-h-[40px] flex-1 resize-none bg-transparent px-3 py-2 text-[14px] text-text placeholder:text-text-subtle focus:outline-none"
            />
            <button
              type="submit"
              aria-label="Send message"
              disabled={!draft.trim() || isThinking}
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                draft.trim() && !isThinking
                  ? "bg-accent text-accent-foreground hover:bg-accent/90"
                  : "bg-surface-overlay text-text-subtle"
              )}
            >
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
