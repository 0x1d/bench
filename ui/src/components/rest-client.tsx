import { useCallback } from 'react';
import yaml from 'js-yaml';
import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';
import './rest-client.css';

interface RestClientProps {
  restId: string;
  spec: string;
}

interface SwaggerRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export function RestClient({ restId, spec }: RestClientProps) {
  const specObj = (() => {
    const trimmed = spec.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return JSON.parse(spec) as object;
    }
    return yaml.load(spec) as object;
  })();

  const requestInterceptor = useCallback(
    (req: SwaggerRequest): SwaggerRequest => {
      const url = new URL(req.url);
      const path = url.pathname + url.search;

      return {
        url: `/api/rest/${encodeURIComponent(restId)}/proxy`,
        method: 'POST',
        headers: {
          ...req.headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          method: req.method,
          path: path || '/',
          headers: req.headers,
          body: req.body ?? null,
        }),
      };
    },
    [restId]
  );

  return (
    <div className="rest-client">
      <SwaggerUI
        spec={specObj}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Swagger UI uses custom Request type
        requestInterceptor={requestInterceptor as any}
      />
    </div>
  );
}
