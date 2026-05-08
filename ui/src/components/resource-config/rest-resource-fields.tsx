import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { RestAuthConfig, RestResource, SchemaResourceEntry } from '@/lib/resource-config';
import type { Dispatch, SetStateAction } from 'react';

export function RestResourceFields({
  draft,
  onChange,
  openapiSchemas,
}: {
  draft: RestResource;
  onChange: Dispatch<SetStateAction<RestResource>>;
  openapiSchemas: SchemaResourceEntry[];
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>ID</Label>
        <Input
          value={draft.id}
          onChange={(e) => onChange((prev) => ({ ...prev, id: e.target.value }))}
          placeholder="petstore"
        />
      </div>
      <div className="space-y-1">
        <Label>Label</Label>
        <Input
          value={draft.label}
          onChange={(e) => onChange((prev) => ({ ...prev, label: e.target.value }))}
          placeholder="Petstore API"
        />
      </div>
      <div className="space-y-1">
        <Label>Base URL</Label>
        <Input
          value={draft.baseUrl}
          onChange={(e) => onChange((prev) => ({ ...prev, baseUrl: e.target.value }))}
          placeholder="https://api.example.com"
          className="font-mono"
        />
      </div>
      <div className="space-y-1">
        <Label>OpenAPI schema (registry)</Label>
        <Select
          value={draft.schemaId?.trim() ? draft.schemaId : '__none__'}
          onValueChange={(v) =>
            onChange((prev) => ({
              ...prev,
              schemaId: v === '__none__' ? '' : v,
            }))
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="None (use path below)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">None (use path below)</SelectItem>
            {openapiSchemas.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label?.trim() || s.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Use a registered OpenAPI schema (recommended) or specify a file path below. Registry schema
          takes precedence.
        </p>
      </div>
      <div className="space-y-1">
        <Label>OpenAPI spec path</Label>
        <Input
          value={draft.openapiSpec}
          onChange={(e) => onChange((prev) => ({ ...prev, openapiSpec: e.target.value }))}
          placeholder="specs/api.json"
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Path relative to config directory. Leave empty when using a registry schema above.
        </p>
      </div>
      <div className="space-y-1">
        <Label>Auth type</Label>
        <Select
          value={draft.auth?.type ?? 'none'}
          onValueChange={(v) =>
            onChange((prev) => ({
              ...prev,
              auth: {
                ...prev.auth,
                type: v as RestAuthConfig['type'],
              },
            }))
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="basic">Basic</SelectItem>
            <SelectItem value="bearer">Bearer</SelectItem>
            <SelectItem value="apiKey">API Key</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {draft.auth?.type === 'basic' && (
        <>
          <div className="space-y-1">
            <Label>Username</Label>
            <Input
              value={draft.auth.username ?? ''}
              onChange={(e) =>
                onChange((prev) => ({
                  ...prev,
                  auth: { ...prev.auth!, username: e.target.value },
                }))
              }
              placeholder={'${BENCH_REST_USER}'}
              className="font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label>Password</Label>
            <Input
              type="password"
              value={draft.auth.password ?? ''}
              onChange={(e) =>
                onChange((prev) => ({
                  ...prev,
                  auth: { ...prev.auth!, password: e.target.value },
                }))
              }
              placeholder={'${BENCH_REST_PASS}'}
              className="font-mono"
            />
          </div>
        </>
      )}
      {draft.auth?.type === 'bearer' && (
        <div className="space-y-1">
          <Label>Token</Label>
          <Input
            type="password"
            value={draft.auth.token ?? ''}
            onChange={(e) =>
              onChange((prev) => ({
                ...prev,
                auth: { ...prev.auth!, token: e.target.value },
              }))
            }
            placeholder={'${BENCH_REST_TOKEN}'}
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">Use env placeholders for secrets.</p>
        </div>
      )}
      {draft.auth?.type === 'apiKey' && (
        <>
          <div className="space-y-1">
            <Label>Header/param name</Label>
            <Input
              value={draft.auth.name ?? ''}
              onChange={(e) =>
                onChange((prev) => ({
                  ...prev,
                  auth: { ...prev.auth!, name: e.target.value },
                }))
              }
              placeholder="X-API-Key"
              className="font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label>Location</Label>
            <Select
              value={draft.auth.in ?? 'header'}
              onValueChange={(v) =>
                onChange((prev) => ({
                  ...prev,
                  auth: { ...prev.auth!, in: v },
                }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="header">Header</SelectItem>
                <SelectItem value="query">Query</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Value</Label>
            <Input
              type="password"
              value={draft.auth.value ?? ''}
              onChange={(e) =>
                onChange((prev) => ({
                  ...prev,
                  auth: { ...prev.auth!, value: e.target.value },
                }))
              }
              placeholder={'${BENCH_REST_API_KEY}'}
              className="font-mono"
            />
          </div>
        </>
      )}
    </div>
  );
}
