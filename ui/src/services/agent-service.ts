const API_BASE = '/api';

export interface PromptRequest {
    prompt: string;
    sessionId?: string;
    agent?: string;
    model?: string;
    workingDirectory: string;
}

export interface PromptResponse {
    success: boolean;
    output: string;
    session_id?: string;
    error?: string;
    type?: string;
    subtype?: string;
    is_error?: boolean;
    duration_ms?: number;
    duration_api_ms?: number;
    request_id?: string;
}

export async function executePrompt(request: PromptRequest): Promise<PromptResponse> {
    const response = await fetch(`${API_BASE}/rest/agent/proxy`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            method: 'POST',
            path: '/api/prompt',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
        }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Agent prompt failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
}
