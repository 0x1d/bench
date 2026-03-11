/* eslint-disable react-refresh/only-export-components -- context exports provider and hook */
import { createContext, useContext, useState, useCallback } from 'react';
import yaml from 'js-yaml';
import { fetchConfig } from '@/services/api';
import { executePrompt, type PromptRequest, type PromptResponse } from '@/services/agent-service';

export interface ChatMessage {
    role: 'user' | 'agent';
    content: string;
    timestamp: number;
    success?: boolean;
}

interface AgentChatContextValue {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    messages: ChatMessage[];
    isLoading: boolean;
    sessionId: string | null;
    sendMessage: (prompt: string) => Promise<void>;
    clearMessages: () => void;
}

const AgentChatContext = createContext<AgentChatContextValue | null>(null);

export function AgentChatProvider({ children }: { children: React.ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);

    const sendMessage = useCallback(async (prompt: string) => {
        const userMessage: ChatMessage = {
            role: 'user',
            content: prompt,
            timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, userMessage]);
        setIsLoading(true);

        try {
            // Fetch configuration to get agent settings
            const rawConfig = await fetchConfig();
            const parsed = (yaml.load(rawConfig) as {
                agent?: {
                    endpoint?: string;
                    workingDirectory?: string;
                    agent?: string;
                    model?: string;
                };
            }) ?? {};

            const agentCfg = parsed.agent;
            if (!agentCfg || !agentCfg.workingDirectory) {
                throw new Error('Agent is not configured. Please configure it in the Resources page (mandatory: working directory).');
            }

            const request: PromptRequest = {
                prompt,
                sessionId: sessionId || undefined,
                agent: agentCfg.agent || 'cursor',
                model: agentCfg.model || undefined,
                workingDirectory: agentCfg.workingDirectory,
            };

            const response: PromptResponse = await executePrompt(request);

            if (response.session_id) {
                setSessionId(response.session_id);
            }

            const agentMessage: ChatMessage = {
                role: 'agent',
                content: response.output || response.error || 'No response from agent.',
                timestamp: Date.now(),
                success: response.success,
            };

            setMessages((prev) => [...prev, agentMessage]);
        } catch (error) {
            const errorMessage: ChatMessage = {
                role: 'agent',
                content: error instanceof Error ? error.message : 'An unknown error occurred.',
                timestamp: Date.now(),
                success: false,
            };
            setMessages((prev) => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    }, [sessionId]);

    const clearMessages = useCallback(() => {
        setMessages([]);
        setSessionId(null);
    }, []);

    return (
        <AgentChatContext.Provider
            value={{
                isOpen,
                setIsOpen,
                messages,
                isLoading,
                sessionId,
                sendMessage,
                clearMessages,
            }}
        >
            {children}
        </AgentChatContext.Provider>
    );
}

export function useAgentChat(): AgentChatContextValue {
    const ctx = useContext(AgentChatContext);
    if (!ctx) {
        throw new Error('useAgentChat must be used within AgentChatProvider');
    }
    return ctx;
}
