import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, BarChart3, Download, PanelRightOpen, Sparkles, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChartById } from "@/components/charts";
import { DynamicChart } from "@/components/charts/DynamicChart";
import { ArtifactPanel } from "@/components/ArtifactPanel";
import { ResultTable } from "@/components/ResultTable";
import { Card } from "@/components/ui/Card";
import { downloadChartPng, slugify } from "@/lib/downloadChart";
import { feedSliceFor, type ArtifactData } from "@/lib/artifact";
import { askBallast, type AskResponse } from "@/lib/askApi";
import {
  SEED_MESSAGES,
  SUGGESTED_PROMPTS,
  type ChatArtifact,
  type ChatMessage,
} from "@/data/chat";

interface Message extends ChatMessage {
  query?: AskResponse;
  error?: boolean;
}

type OpenPanel = (data: ArtifactData) => void;

function ArtifactShell({
  title,
  subtitle,
  footnote,
  icon,
  onDownload,
  onOpenDetails,
  children,
}: {
  title: string;
  subtitle: string;
  footnote: string;
  icon: ReactNode;
  onDownload?: () => void;
  onOpenDetails: () => void;
  children: ReactNode;
}) {
  return (
    <Card className="mt-3 overflow-hidden">
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
            {icon}
          </span>
          <div className="min-w-0">
            <h4 className="heading-tight truncate text-[13.5px] font-semibold text-text">{title}</h4>
            <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="Open details panel"
            title="Open details panel"
            onClick={onOpenDetails}
            className="rounded-md p-1.5 text-text-subtle transition-colors hover:bg-surface-overlay hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <PanelRightOpen className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          {onDownload ? (
            <button
              type="button"
              aria-label="Download chart as PNG"
              onClick={onDownload}
              className="rounded-md p-1.5 text-text-subtle transition-colors hover:bg-surface-overlay hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </header>
      {children}
      <footer className="border-t border-border bg-surface-raised px-4 py-2">
        <p className="break-all text-[11px] text-text-subtle">{footnote}</p>
      </footer>
    </Card>
  );
}

function ScriptedArtifactCard({ artifact, onOpenPanel }: { artifact: ChatArtifact; onOpenPanel: OpenPanel }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const openDetails = () => {
    const slice = feedSliceFor(artifact.chart);
    onOpenPanel({
      title: artifact.title,
      subtitle: artifact.subtitle,
      source: artifact.footnote,
      sourceKind: "feed",
      columns: slice.columns,
      rows: slice.rows,
      chart: null,
      chartId: artifact.chart,
      fileStem: slugify(artifact.title),
    });
  };
  return (
    <ArtifactShell
      title={artifact.title}
      subtitle={artifact.subtitle}
      footnote={artifact.footnote}
      icon={<BarChart3 className="h-4 w-4" aria-hidden="true" />}
      onDownload={() => {
        if (chartRef.current) void downloadChartPng(chartRef.current, slugify(artifact.title));
      }}
      onOpenDetails={openDetails}
    >
      <div ref={chartRef} className="px-4 pb-3 pt-4">
        <ChartById id={artifact.chart} height={250} />
      </div>
    </ArtifactShell>
  );
}

function QueryArtifactCard({
  query,
  question,
  onOpenPanel,
}: {
  query: AskResponse;
  question: string;
  onOpenPanel: OpenPanel;
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const title = query.chart?.title || query.intent || "Query result";
  const subtitle = `${query.rows.length} rows · ${(query.elapsedMs / 1000).toFixed(1)}s · live SQL over ballast.db`;
  const openDetails = () =>
    onOpenPanel({
      title,
      subtitle,
      source: query.sql,
      sourceKind: "sql",
      columns: query.columns,
      rows: query.rows,
      chart: query.chart,
      fileStem: slugify(question),
    });
  return (
    <ArtifactShell
      title={title}
      subtitle={subtitle}
      footnote={query.sql}
      icon={
        query.chart ? (
          <BarChart3 className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Table2 className="h-4 w-4" aria-hidden="true" />
        )
      }
      onDownload={
        query.chart
          ? () => {
              if (chartRef.current) void downloadChartPng(chartRef.current, slugify(question));
            }
          : undefined
      }
      onOpenDetails={openDetails}
    >
      {query.chart ? (
        <div ref={chartRef} className="px-4 pb-1 pt-4">
          <DynamicChart chart={query.chart} columns={query.columns} rows={query.rows} height={240} />
        </div>
      ) : null}
      <div className={cn("pb-2", query.chart && "border-t border-border/60 pt-1")}>
        <ResultTable columns={query.columns} rows={query.rows} maxRows={6} />
      </div>
    </ArtifactShell>
  );
}

function MessageBubble({
  message,
  question,
  onOpenPanel,
}: {
  message: Message;
  question: string;
  onOpenPanel: OpenPanel;
}) {
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
        <p
          className={cn(
            "text-[14px] leading-[1.65]",
            message.error ? "text-rose-700" : "text-text"
          )}
        >
          {message.content}
        </p>
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
        {message.query ? (
          <QueryArtifactCard query={message.query} question={question} onOpenPanel={onOpenPanel} />
        ) : null}
        {message.artifact ? (
          <ScriptedArtifactCard artifact={message.artifact} onOpenPanel={onOpenPanel} />
        ) : null}
      </div>
    </div>
  );
}

function TypingIndicator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3" role="status" aria-label="Assistant is responding">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/10 text-accent">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span className="flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-text-subtle"
            style={{ animation: `pulse-dot 1.2s ease-in-out ${i * 0.18}s infinite` }}
          />
        ))}
        <span className="text-[11.5px] text-text-subtle">{label}</span>
      </span>
    </div>
  );
}

export function ChatView() {
  const [messages, setMessages] = useState<Message[]>(SEED_MESSAGES);
  const [draft, setDraft] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [panel, setPanel] = useState<ArtifactData | null>(null);
  const lastQuestion = useRef("query");
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

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isThinking) return;
    setDraft("");
    lastQuestion.current = trimmed;
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", content: trimmed }]);
    setIsThinking(true);
    try {
      const result = await askBallast(trimmed);
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: result.answer,
          highlights: result.highlights.length ? result.highlights : undefined,
          query: result,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          content: `The query service did not answer: ${err instanceof Error ? err.message : String(err)}. Start it with "python server/run_local.py" and try again.`,
          error: true,
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <div className="flex h-full min-w-0">
      <div className="relative flex h-full min-w-0 flex-1 flex-col">
      <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-border bg-surface px-5">
        <div>
          <h1 className="heading-tight text-[14.5px] font-semibold text-text">
            Operations Assistant
          </h1>
          <p className="mt-0.5 text-[11.5px] text-text-subtle">
            Live SQL over the plant data layer: telemetry, maintenance, commercial
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
              <MessageBubble
                message={message}
                question={lastQuestion.current}
                onOpenPanel={setPanel}
              />
            </div>
          ))}
          {isThinking ? <TypingIndicator label="Writing SQL and querying the twin" /> : null}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 pb-5">
        <div className="pointer-events-auto mx-auto w-full max-w-[760px] px-4 sm:px-6">
          <div className="mb-2.5 flex flex-wrap gap-2">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => void send(prompt)}
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
              void send(draft);
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
                  void send(draft);
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

      {panel ? <ArtifactPanel data={panel} onClose={() => setPanel(null)} /> : null}
    </div>
  );
}
