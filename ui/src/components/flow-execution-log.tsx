import { useQuery } from '@tanstack/react-query';
import { fetchFlowExecution } from '@/services/api';
import {
    CheckCircle2,
    XCircle,
    Clock,
    Loader2,
    ChevronDown,
    ChevronRight,
    Globe,
    Database,
    MessageSquare,
    Terminal,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface StepExecution {
    pipeline_execution_id: string;
    id: string;
    name: string;
    status: string;
    input?: Record<string, any>;
    output?: {
        status: string;
        data?: Record<string, any>;
        flowpipe?: { started_at?: string; finished_at?: string };
    };
    start_time?: string;
    end_time?: string;
}

interface StepStatusEntry {
    step_executions?: StepExecution[];
    finished?: Record<string, boolean>;
    failed?: Record<string, boolean>;
}

function statusIcon(status: string) {
    switch (status) {
        case 'finished':
            return <CheckCircle2 className="size-4 text-green-400" />;
        case 'failed':
            return <XCircle className="size-4 text-red-400" />;
        case 'started':
        case 'queued':
            return <Loader2 className="size-4 text-yellow-400 animate-spin" />;
        default:
            return <Clock className="size-4 text-muted-foreground" />;
    }
}

function stepTypeIcon(name: string) {
    if (name.startsWith('http.')) return <Globe className="size-3.5 text-blue-400" />;
    if (name.startsWith('query.')) return <Database className="size-3.5 text-emerald-400" />;
    if (name.startsWith('message.')) return <MessageSquare className="size-3.5 text-purple-400" />;
    return <Terminal className="size-3.5 text-muted-foreground" />;
}

function formatDuration(startStr?: string, endStr?: string): string {
    if (!startStr || !endStr) return '—';
    const start = new Date(startStr).getTime();
    const end = new Date(endStr).getTime();
    const ms = Math.abs(end - start);
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
}

function formatTime(isoStr?: string): string {
    if (!isoStr) return '—';
    try {
        return new Date(isoStr).toLocaleTimeString();
    } catch {
        return isoStr;
    }
}

function StepDetail({ exec, defaultExpanded = false }: { exec: StepExecution; defaultExpanded?: boolean }) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const stepName = exec.name.split('.').pop() || exec.name;
    const duration = formatDuration(exec.start_time, exec.end_time);

    return (
        <div className="border border-border rounded-md overflow-hidden">
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
            >
                {expanded ? (
                    <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
                ) : (
                    <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                )}
                {stepTypeIcon(exec.name)}
                {statusIcon(exec.status)}
                <span className="text-xs font-medium truncate flex-1">{stepName}</span>
                <span className="text-xs text-muted-foreground font-mono shrink-0">{duration}</span>
            </button>

            {expanded && (
                <div className="border-t border-border bg-muted/30 p-3 space-y-3">
                    {/* Input */}
                    {exec.input && Object.keys(exec.input).length > 0 && (
                        <div>
                            <div className="text-xs font-medium text-muted-foreground mb-1">Input</div>
                            <div className="space-y-1">
                                {Object.entries(exec.input).map(([key, value]) => {
                                    if (value === null || value === undefined) return null;
                                    return (
                                        <div key={key} className="flex gap-2 text-xs">
                                            <span className="text-muted-foreground font-mono shrink-0">{key}:</span>
                                            <span className="font-mono text-foreground break-all">
                                                {typeof value === 'string' ? value : JSON.stringify(value)}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Output */}
                    {exec.output?.data && (
                        <div>
                            <div className="text-xs font-medium text-muted-foreground mb-1">Output</div>
                            {exec.output.data.status_code !== undefined && (
                                <div className="flex gap-2 text-xs mb-1">
                                    <span className="text-muted-foreground font-mono">status:</span>
                                    <span
                                        className={cn(
                                            'font-mono',
                                            exec.output.data.status_code < 300
                                                ? 'text-green-400'
                                                : exec.output.data.status_code < 500
                                                    ? 'text-yellow-400'
                                                    : 'text-red-400'
                                        )}
                                    >
                                        {exec.output.data.status}
                                    </span>
                                </div>
                            )}
                            {exec.output.data.response_body !== undefined && (
                                <pre className="p-2 rounded bg-background/50 border border-border font-mono text-xs overflow-auto max-h-48 whitespace-pre-wrap break-all text-foreground">
                                    {typeof exec.output.data.response_body === 'string'
                                        ? exec.output.data.response_body
                                        : JSON.stringify(exec.output.data.response_body, null, 2)}
                                </pre>
                            )}
                            {exec.output.data.rows !== undefined && (
                                <pre className="p-2 rounded bg-background/50 border border-border font-mono text-xs overflow-auto max-h-48 whitespace-pre-wrap break-all text-foreground">
                                    {JSON.stringify(exec.output.data.rows, null, 2)}
                                </pre>
                            )}
                            {/* Generic output for other step types */}
                            {exec.output.data.response_body === undefined &&
                                exec.output.data.rows === undefined &&
                                exec.output.data.status_code === undefined && (
                                    <pre className="p-2 rounded bg-background/50 border border-border font-mono text-xs overflow-auto max-h-48 whitespace-pre-wrap break-all text-foreground">
                                        {JSON.stringify(exec.output.data, null, 2)}
                                    </pre>
                                )}
                        </div>
                    )}

                    {/* Timing */}
                    <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>Started: {formatTime(exec.start_time)}</span>
                        <span>Duration: {duration}</span>
                    </div>
                </div>
            )}
        </div>
    );
}

interface ExecutionData {
    status?: string;
    pipeline_executions?: Record<string, unknown>;
    root_pipelines?: string[];
    errors?: Array<{ error?: { detail?: string }; message?: string }>;
}

export function FlowExecutionLog({ executionId, workspace, selectedStepId }: { executionId: string; workspace?: string; selectedStepId?: string | null }) {
    const { data, isLoading, error } = useQuery({
        queryKey: ['flow-execution', executionId, workspace],
        queryFn: () => fetchFlowExecution(executionId, workspace) as Promise<ExecutionData>,
        refetchInterval: (query) => {
            const d = query.state.data as ExecutionData | undefined;
            if (d && (d.status === 'finished' || d.status === 'failed')) return false;
            return 2000;
        },
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                <span className="text-sm">Loading execution...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center gap-2 p-4 text-red-400 text-sm">
                <XCircle className="size-4" />
                <span>{error instanceof Error ? error.message : 'Failed to load execution'}</span>
            </div>
        );
    }

    if (!data) return null;

    const execData = data as ExecutionData;
    const pipelineExecs = execData.pipeline_executions || {};
    const rootPexecId = execData.root_pipelines?.[0];
    const pexec = rootPexecId ? pipelineExecs[rootPexecId] : Object.values(pipelineExecs)[0] as any;

    if (!pexec) {
        return (
            <div className="p-4 text-sm text-muted-foreground">No pipeline execution data.</div>
        );
    }

    // Collect all step executions
    const allSteps: StepExecution[] = [];
    const stepStatus = pexec.step_status || {};
    for (const [, forEachEntries] of Object.entries(stepStatus)) {
        const entries = forEachEntries as Record<string, StepStatusEntry>;
        for (const [, entry] of Object.entries(entries)) {
            if (entry.step_executions) {
                allSteps.push(...entry.step_executions);
            }
        }
    }

    // Sort by start_time
    allSteps.sort((a, b) => {
        const ta = a.start_time ? new Date(a.start_time).getTime() : 0;
        const tb = b.start_time ? new Date(b.start_time).getTime() : 0;
        return ta - tb;
    });

    const pipelineName = pexec.name?.split('.')?.pop() || pexec.name;
    const pipelineDuration = formatDuration(pexec.start_time, pexec.end_time);

    return (
        <div className="space-y-3">
            {/* Pipeline header — only in full view */}
            {!selectedStepId && (
                <div className="flex items-center gap-2 pb-2 border-b border-border">
                    {statusIcon(pexec.status || execData.status)}
                    <span className="text-sm font-medium flex-1 truncate">{pipelineName}</span>
                    <span className="text-xs text-muted-foreground font-mono">{pipelineDuration}</span>
                </div>
            )}

            {/* Pipeline output — only in full view */}
            {!selectedStepId && pexec.pipeline_output && Object.keys(pexec.pipeline_output).length > 0 && (
                <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">Pipeline Output</div>
                    <pre className="p-2 rounded bg-muted/50 border border-border font-mono text-xs overflow-auto max-h-48 whitespace-pre-wrap break-all text-foreground">
                        {JSON.stringify(pexec.pipeline_output, null, 2)}
                    </pre>
                </div>
            )}

            {/* Errors — only in full view */}
            {!selectedStepId && execData.errors && execData.errors.length > 0 && (
                <div>
                    <div className="text-xs font-medium text-red-400 mb-1">Errors</div>
                    {execData.errors.map((err, i: number) => (
                        <div
                            key={i}
                            className="p-2 rounded bg-red-500/10 border border-red-500/30 font-mono text-xs text-red-400 mb-1"
                        >
                            {err.error?.detail || err.message || JSON.stringify(err)}
                        </div>
                    ))}
                </div>
            )}

            {/* Steps */}
            {(() => {
                const displaySteps = selectedStepId
                    ? allSteps.filter((s) => s.name.endsWith(selectedStepId))
                    : allSteps;
                if (displaySteps.length === 0 && selectedStepId) {
                    return (
                        <div className="text-sm text-muted-foreground py-4 text-center">
                            No execution data for this step yet.
                        </div>
                    );
                }
                return displaySteps.length > 0 ? (
                    <div>
                        {!selectedStepId && (
                            <div className="text-xs font-medium text-muted-foreground mb-2">
                                Steps ({displaySteps.length})
                            </div>
                        )}
                        <div className="space-y-2">
                            {displaySteps.map((exec) => (
                                <StepDetail key={exec.id} exec={exec} defaultExpanded={!!selectedStepId} />
                            ))}
                        </div>
                    </div>
                ) : null;
            })()}

            {/* Execution ID — only in full view */}
            {!selectedStepId && (
                <div className="pt-2 border-t border-border">
                    <div className="text-xs text-muted-foreground font-mono break-all">
                        ID: {executionId}
                    </div>
                </div>
            )}
        </div>
    );
}
