import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Send, Bot, User, Loader2, Eraser } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAgentChat } from '@/contexts/agent-chat-context';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'bench-agent-chat-width';
const MIN_WIDTH = 320;
const MAX_WIDTH = 600;

function getInitialWidth(): number {
    if (typeof window === 'undefined') return 360;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        const n = parseInt(stored, 10);
        if (Number.isFinite(n)) return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, n));
    }
    return 360;
}

export function AgentChat() {
    const { isOpen, setIsOpen, messages, isLoading, sendMessage, clearMessages } = useAgentChat();
    const [input, setInput] = useState('');
    const [width, setWidth] = useState(getInitialWidth);
    const scrollRef = useRef<HTMLDivElement>(null);
    const startXRef = useRef(0);
    const startWidthRef = useRef(0);

    const scrollToBottom = useCallback(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim() || isLoading) return;
        const msg = input.trim();
        setInput('');
        await sendMessage(msg);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        startXRef.current = e.clientX;
        startWidthRef.current = width;
        const onMove = (moveEvent: MouseEvent) => {
            const delta = startXRef.current - moveEvent.clientX;
            const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidthRef.current + delta));
            setWidth(next);
            localStorage.setItem(STORAGE_KEY, String(next));
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [width]);

    if (!isOpen) return null;

    return (
        <div
            className={cn(
                'bg-sidebar text-sidebar-foreground relative flex min-h-0 flex-col overflow-hidden border-l transition-all duration-300 ease-in-out',
                isOpen ? 'fixed inset-y-0 right-0 z-40 lg:relative lg:inset-auto' : 'w-0 border-none'
            )}
            style={{ width: isOpen ? `${width}px` : '0px' }}
        >
            {/* Resize Handle */}
            <div
                role="separator"
                onMouseDown={handleResizeStart}
                className="absolute left-0 top-0 z-50 hidden h-full w-1 cursor-col-resize lg:block hover:bg-primary/50"
            />

            {/* Header */}
            <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-4">
                <div className="flex items-center gap-2">
                    <Bot className="size-5 text-primary" />
                    <span className="text-sm font-semibold">Agent Chat</span>
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={clearMessages}
                        title="Clear Chat"
                        disabled={messages.length === 0}
                    >
                        <Eraser className="size-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setIsOpen(false)}
                        aria-label="Close chat"
                    >
                        <X className="size-4" />
                    </Button>
                </div>
            </div>

            {/* Messages List */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth"
            >
                {messages.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-muted-foreground text-center space-y-2 opacity-50">
                        <Bot className="size-12 mb-2" />
                        <p className="text-sm">No messages yet.</p>
                        <p className="text-xs">Ask the agent to help with your tasks.</p>
                    </div>
                ) : (
                    messages.map((msg, i) => (
                        <div
                            key={i}
                            className={cn(
                                'flex gap-3 max-w-[90%]',
                                msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
                            )}
                        >
                            <div
                                className={cn(
                                    'size-8 shrink-0 rounded-full flex items-center justify-center border',
                                    msg.role === 'user'
                                        ? 'bg-primary/10 border-primary/20 text-primary'
                                        : 'bg-muted border-border text-muted-foreground'
                                )}
                            >
                                {msg.role === 'user' ? <User className="size-4" /> : <Bot className="size-4" />}
                            </div>
                            <div
                                className={cn(
                                    'rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words',
                                    msg.role === 'user'
                                        ? 'bg-primary text-primary-foreground'
                                        : msg.success === false
                                            ? 'bg-destructive/10 border border-destructive/20 text-destructive'
                                            : 'bg-accent/50 text-foreground'
                                )}
                            >
                                {msg.content}
                            </div>
                        </div>
                    ))
                )}
                {isLoading && (
                    <div className="flex gap-3 mr-auto max-w-[90%] animate-pulse">
                        <div className="size-8 shrink-0 rounded-full bg-muted border border-border flex items-center justify-center">
                            <Loader2 className="size-4 animate-spin text-muted-foreground" />
                        </div>
                        <div className="rounded-lg px-3 py-2 text-sm bg-accent/50 text-muted-foreground">
                            Thinking...
                        </div>
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-sidebar-border bg-sidebar-accent/20">
                <form onSubmit={handleSubmit} className="relative">
                    <Textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask anything..."
                        className="min-h-[80px] w-full resize-none pr-12 focus-visible:ring-primary/30"
                        disabled={isLoading}
                    />
                    <Button
                        type="submit"
                        size="icon"
                        variant="default"
                        className="absolute bottom-2 right-2 size-8"
                        disabled={!input.trim() || isLoading}
                    >
                        {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    </Button>
                </form>
                <p className="text-[10px] text-muted-foreground mt-2 text-center">
                    Press Enter to send, Shift+Enter for new line.
                </p>
            </div>
        </div>
    );
}
