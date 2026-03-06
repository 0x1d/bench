/**
 * Minimal Terraform (.tf) file parsing for diagram sync.
 * Uses regex for block extraction; full validation left to Terraform CLI.
 */

export interface TerraformProvider {
  id: string;
  name: string;
  source: string;
  version: string;
  sourceFile?: string;
}

export interface TerraformVariable {
  id: string;
  name: string;
  type?: string;
  default?: string;
  description?: string;
  sourceFile?: string;
}

export interface TerraformResource {
  id: string;
  type: string;
  name: string;
  body: string;
  dependsOn?: string[];
  sourceFile?: string;
}

export interface TerraformData {
  id: string;
  type: string;
  name: string;
  body: string;
  dependsOn?: string[];
  sourceFile?: string;
}

export interface TerraformModule {
  id: string;
  name: string;
  source: string;
}

export interface TerraformOutput {
  id: string;
  name: string;
  value?: string;
  sourceFile?: string;
}

export interface TerraformLocals {
  id: string;
  body: string;
}

export interface ParsedTerraform {
  providers: TerraformProvider[];
  variables: TerraformVariable[];
  resources: TerraformResource[];
  data: TerraformData[];
  modules: TerraformModule[];
  outputs: TerraformOutput[];
  locals: TerraformLocals[];
}

const DEPENDS_ON_RE = /depends_on\s*=\s*\[([^\]]+)\]/;

function extractDependsOn(body: string): string[] {
  const m = body.match(DEPENDS_ON_RE);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((s) => s.trim().replace(/^data\./, 'data.'))
    .filter(Boolean);
}

function extractBlockBody(content: string, start: number): { body: string } {
  let depth = 1;
  let i = start;
  const len = content.length;
  while (i < len && depth > 0) {
    const c = content[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    i++;
  }
  return { body: content.slice(start, i - 1) };
}

function parseRequiredProviders(terraformBody: string): TerraformProvider[] {
  const providers: TerraformProvider[] = [];
  const reqMatch = terraformBody.match(/required_providers\s*\{/);
  if (!reqMatch) return providers;
  const start = reqMatch.index! + reqMatch[0].length;
  let depth = 1;
  let i = start;
  while (i < terraformBody.length && depth > 0) {
    const c = terraformBody[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    i++;
  }
  const block = terraformBody.slice(start, i - 1);
  const providerBlockRe = /(\w+)\s*=\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = providerBlockRe.exec(block)) !== null) {
    const blockStart = m.index + m[0].length;
    let d = 1;
    let j = blockStart;
    while (j < block.length && d > 0) {
      if (block[j] === '{') d++;
      else if (block[j] === '}') d--;
      j++;
    }
    const inner = block.slice(blockStart, j - 1);
    const sourceMatch = inner.match(/source\s*=\s*"([^"]+)"/);
    const versionMatch = inner.match(/version\s*=\s*"([^"]+)"/);
    providers.push({
      id: `provider-${m[1]}`,
      name: m[1],
      source: sourceMatch?.[1] ?? '',
      version: versionMatch?.[1] ?? '',
    });
  }
  return providers;
}

/**
 * Extracts the editable block for a provider: terraform { required_providers { ... } } + provider "name" { }.
 */
export function getProviderEditableBlock(content: string, providerName: string): string {
  const parts: string[] = [];
  const terraformRe = /terraform\s*\{/;
  const tm = content.match(terraformRe);
  if (tm) {
    const start = tm.index!;
    let depth = 1;
    let i = start + tm[0].length;
    while (i < content.length && depth > 0) {
      if (content[i] === '{') depth++;
      else if (content[i] === '}') depth--;
      i++;
    }
    parts.push(content.slice(start, i));
  }
  const escaped = providerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const providerRe = new RegExp(`provider\\s+"${escaped}"\\s*\\{`);
  const pm = providerRe.exec(content);
  if (pm) {
    const { body } = extractBlockBody(content, pm.index + pm[0].length);
    const fullBlock = content.slice(
      pm.index,
      pm.index + pm[0].length + body.length + 2
    );
    parts.push(fullBlock);
  } else {
    parts.push(`provider "${providerName}" {}`);
  }
  return parts.join('\n\n');
}

/**
 * Replaces the terraform + provider block for a provider with new content.
 */
export function replaceProviderBlockInContent(
  content: string,
  providerName: string,
  newBlock: string
): string {
  const oldBlock = getProviderEditableBlock(content, providerName);
  return content.replace(oldBlock, newBlock);
}

/**
 * Replaces a resource or data block in content. The oldBody is the full block text.
 */
export function replaceBlockInContent(
  content: string,
  oldBody: string,
  newBody: string
): string {
  return content.replace(oldBody, newBody);
}

/**
 * Removes a block from file content and cleans up excess newlines.
 */
export function removeBlockFromContent(content: string, block: string): string {
  return content
    .replace(block, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Removes a provider block (provider "name" { }) from content.
 * Does not touch the terraform { required_providers } block.
 */
export function removeProviderBlockFromContent(content: string, providerName: string): string {
  const escaped = providerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const providerRe = new RegExp(`provider\\s+"${escaped}"\\s*\\{`);
  const pm = providerRe.exec(content);
  if (!pm) return content;
  const start = pm.index;
  const { body } = extractBlockBody(content, pm.index + pm[0].length);
  const fullBlock = content.slice(start, pm.index + pm[0].length + body.length + 2);
  return removeBlockFromContent(content, fullBlock);
}

/**
 * Parse Terraform configuration content into structured blocks.
 * When sourceFile is provided, it is attached to all blocks.
 */
export function parseTerraformContent(
  content: string,
  sourceFile?: string
): ParsedTerraform {
  const result: ParsedTerraform = {
    providers: [],
    variables: [],
    resources: [],
    data: [],
    modules: [],
    outputs: [],
    locals: [],
  };

  const attachSource = (p: TerraformProvider) =>
    sourceFile ? { ...p, sourceFile } : p;

  // Parse terraform block for required_providers
  const terraformMatch = content.match(/terraform\s*\{([\s\S]*?)^\}/m);
  if (terraformMatch) {
    result.providers = parseRequiredProviders(terraformMatch[1]).map(attachSource);
  }

  // Parse provider blocks (standalone, not from required_providers)
  const providerBlockRe = /provider\s+"([^"]+)"\s*\{/g;
  let pm: RegExpExecArray | null;
  while ((pm = providerBlockRe.exec(content)) !== null) {
    const existing = result.providers.find((p) => p.name === pm![1]);
    if (!existing) {
      result.providers.push(
        attachSource({
          id: `provider-${pm[1]}`,
          name: pm[1],
          source: '',
          version: '',
        })
      );
    }
  }

  const attachVar = (v: TerraformVariable) =>
    sourceFile ? { ...v, sourceFile } : v;

  // Parse variable blocks
  const varRe = /variable\s+"([^"]+)"\s*\{/g;
  let vm: RegExpExecArray | null;
  while ((vm = varRe.exec(content)) !== null) {
    const { body } = extractBlockBody(content, vm.index + vm[0].length);
    const typeMatch = body.match(/type\s*=\s*([^\n]+)/);
    const defaultMatch = body.match(/default\s*=\s*([^\n]+)/);
    const descMatch = body.match(/description\s*=\s*"([^"]*)"/);
    result.variables.push(
      attachVar({
        id: `var-${vm[1]}`,
        name: vm[1],
        type: typeMatch?.[1]?.trim(),
        default: defaultMatch?.[1]?.trim(),
        description: descMatch?.[1],
      })
    );
  }

  const attachRes = (r: TerraformResource) =>
    sourceFile ? { ...r, sourceFile } : r;
  const attachData = (d: TerraformData) =>
    sourceFile ? { ...d, sourceFile } : d;

  // Parse resource blocks
  const resRe = /resource\s+"([^"]+)"\s+"([^"]+)"\s*\{/g;
  let rm: RegExpExecArray | null;
  while ((rm = resRe.exec(content)) !== null) {
    const { body } = extractBlockBody(content, rm.index + rm[0].length);
    const fullBlock = content.slice(rm.index, rm.index + rm[0].length + body.length + 2);
    result.resources.push(
      attachRes({
        id: `resource-${rm[1]}-${rm[2]}`,
        type: rm[1],
        name: rm[2],
        body: fullBlock,
        dependsOn: extractDependsOn(body),
      })
    );
  }

  // Parse data blocks
  const dataRe = /data\s+"([^"]+)"\s+"([^"]+)"\s*\{/g;
  let dm: RegExpExecArray | null;
  while ((dm = dataRe.exec(content)) !== null) {
    const { body } = extractBlockBody(content, dm.index + dm[0].length);
    const fullBlock = content.slice(dm.index, dm.index + dm[0].length + body.length + 2);
    result.data.push(
      attachData({
        id: `data-${dm[1]}-${dm[2]}`,
        type: dm[1],
        name: dm[2],
        body: fullBlock,
        dependsOn: extractDependsOn(body),
      })
    );
  }

  // Parse module blocks
  const modRe = /module\s+"([^"]+)"\s*\{/g;
  let mm: RegExpExecArray | null;
  while ((mm = modRe.exec(content)) !== null) {
    const { body } = extractBlockBody(content, mm.index + mm[0].length);
    const sourceMatch = body.match(/source\s*=\s*"([^"]+)"/);
    result.modules.push({
      id: `module-${mm[1]}`,
      name: mm[1],
      source: sourceMatch?.[1] ?? './modules/' + mm[1],
    });
  }

  // Parse output blocks
  const attachOut = (o: TerraformOutput) =>
    sourceFile ? { ...o, sourceFile } : o;
  const outRe = /output\s+"([^"]+)"\s*\{/g;
  let om: RegExpExecArray | null;
  while ((om = outRe.exec(content)) !== null) {
    const { body } = extractBlockBody(content, om.index + om[0].length);
    const valueMatch = body.match(/value\s*=\s*([^\n]+)/);
    result.outputs.push(
      attachOut({
        id: `output-${om[1]}`,
        name: om[1],
        value: valueMatch?.[1]?.trim(),
      })
    );
  }

  // Parse locals block
  const locRe = /locals\s*\{/g;
  let lm: RegExpExecArray | null;
  if ((lm = locRe.exec(content)) !== null) {
    const { body } = extractBlockBody(content, lm.index + lm[0].length);
    const fullBlock = content.slice(lm.index, lm.index + lm[0].length + body.length + 2);
    result.locals.push({
      id: 'locals',
      body: fullBlock,
    });
  }

  return result;
}

/**
 * Parse multiple Terraform files and merge blocks. Each block gets sourceFile from its file.
 */
export function parseTerraformFiles(
  files: { path: string; content: string }[]
): ParsedTerraform {
  const merged: ParsedTerraform = {
    providers: [],
    variables: [],
    resources: [],
    data: [],
    modules: [],
    outputs: [],
    locals: [],
  };
  for (const { path, content } of files) {
    const p = parseTerraformContent(content, path);
    merged.providers.push(...p.providers);
    merged.variables.push(...p.variables);
    merged.resources.push(...p.resources);
    merged.data.push(...p.data);
    merged.modules.push(...p.modules);
    merged.outputs.push(...p.outputs);
    merged.locals.push(...p.locals);
  }
  return merged;
}

/**
 * Resolve depends_on references to node IDs for edges.
 * e.g. "aws_vpc.main" -> resource-aws_vpc-main, "data.aws_ami.ubuntu" -> data-aws_ami-ubuntu
 */
export function resolveDependsOnToIds(refs: string[]): string[] {
  return refs.map((ref) => {
    const trimmed = ref.trim();
    if (trimmed.startsWith('data.')) {
      const rest = trimmed.slice(5).split('.');
      return rest.length >= 2 ? `data-${rest[0]}-${rest[1]}` : trimmed;
    }
    if (trimmed.startsWith('module.')) {
      const rest = trimmed.slice(7).split('.');
      return rest.length >= 1 ? `module-${rest[0]}` : trimmed;
    }
    const parts = trimmed.split('.');
    return parts.length >= 2 ? `resource-${parts[0]}-${parts[1]}` : trimmed;
  });
}

/**
 * Convert node ID to Terraform reference for depends_on.
 * e.g. resource-aws_vpc-main -> aws_vpc.main, data-aws_ami-ubuntu -> data.aws_ami.ubuntu
 */
export function nodeIdToRef(nodeId: string): string {
  if (nodeId.startsWith('data-')) {
    const rest = nodeId.slice(5).replace(/-/g, '.');
    return `data.${rest}`;
  }
  if (nodeId.startsWith('module-')) {
    const rest = nodeId.slice(7);
    return `module.${rest}`;
  }
  if (nodeId.startsWith('resource-')) {
    const rest = nodeId.slice(9).replace(/-/g, '.');
    return rest;
  }
  return nodeId;
}

/**
 * Inject or update depends_on in a resource/data block body.
 * Adds depends_on if missing; merges with existing refs and deduplicates.
 */
export function injectDependsOn(
  body: string,
  newRefs: string[],
  nodeIdToRefFn: (id: string) => string = nodeIdToRef
): string {
  const refs = newRefs.map(nodeIdToRefFn);
  const existing = extractDependsOn(body);
  const merged = [...new Set([...existing, ...refs])].sort();
  if (merged.length === 0) return body;

  const depBlock = `depends_on = [${merged.join(', ')}]`;
  if (existing.length > 0) {
    return body.replace(DEPENDS_ON_RE, depBlock);
  }
  const lastBrace = body.lastIndexOf('}');
  const before = body.slice(0, lastBrace).trimEnd();
  const after = body.slice(lastBrace);
  const sep = before.endsWith('{') || before.endsWith(',') ? '\n  ' : ',\n  ';
  return `${before}${sep}${depBlock}\n${after}`;
}

/**
 * Remove refs from depends_on in a block body.
 * If depends_on becomes empty, removes the entire depends_on line.
 */
export function removeDependsOnRefs(
  body: string,
  refsToRemove: string[],
  nodeIdToRefFn: (id: string) => string = nodeIdToRef
): string {
  const toRemove = new Set(refsToRemove.map(nodeIdToRefFn));
  const existing = extractDependsOn(body);
  if (existing.length === 0) return body;

  const merged = existing.filter((r) => !toRemove.has(r));
  if (merged.length === 0) {
    return body
      .replace(/,?\s*depends_on\s*=\s*\[[^\]]*\]\s*/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  return body.replace(DEPENDS_ON_RE, `depends_on = [${merged.join(', ')}]`);
}

/** File path for a block type when splitting into multiple files. */
export const BLOCK_FILE_MAP = {
  provider: 'providers.tf',
  variable: 'variables.tf',
  resource: 'main.tf',
  data: 'main.tf',
  module: 'main.tf',
  output: 'outputs.tf',
  locals: 'main.tf',
} as const;

/** Generate a minimal Terraform block for a new node. */
export function createBlockTemplate(
  kind: 'provider' | 'variable' | 'resource' | 'data' | 'module' | 'output',
  name: string,
  options?: { type?: string; source?: string }
): string {
  switch (kind) {
    case 'provider':
      return `provider "${name}" {}`;
    case 'variable':
      return `variable "${name}" {\n  type = string\n}`;
    case 'resource':
      return `resource "${options?.type ?? 'null_resource'}" "${name}" {\n}`;
    case 'data':
      return `data "${options?.type ?? 'external'}" "${name}" {\n  program = ["echo", "{}"]\n}`;
    case 'module':
      return `module "${name}" {\n  source = "${options?.source ?? './modules/' + name}"\n}`;
    case 'output':
      return `output "${name}" {\n  value = null\n}`;
    default:
      return '';
  }
}

/** Generate node ID for a new block. */
export function blockToNodeId(
  kind: 'provider' | 'variable' | 'resource' | 'data' | 'module' | 'output',
  name: string,
  options?: { type?: string }
): string {
  switch (kind) {
    case 'provider':
      return `provider-${name}`;
    case 'variable':
      return `var-${name}`;
    case 'resource':
      return `resource-${options?.type ?? 'null_resource'}-${name}`;
    case 'data':
      return `data-${options?.type ?? 'external'}-${name}`;
    case 'module':
      return `module-${name}`;
    case 'output':
      return `output-${name}`;
    default:
      return name;
  }
}

/**
 * Append a block to file content. Ensures newline separation.
 * If content is empty, returns the block; otherwise appends with double newline.
 */
export function appendBlockToFileContent(content: string, block: string): string {
  const trimmed = content.trim();
  if (!trimmed) return block;
  return `${trimmed}\n\n${block}`;
}

/**
 * Ensure a terraform block exists when adding providers.
 * If content has no terraform { required_providers { } } block, we add a minimal one.
 * Provider blocks go after required_providers.
 */
export function ensureTerraformBlockForProvider(content: string, providerName: string): string {
  if (content.includes('terraform {') && content.includes('required_providers')) {
    return content;
  }
  const terraformBlock = `terraform {
  required_providers {
    ${providerName} = {
      source  = "hashicorp/${providerName}"
      version = "~> 1.0"
    }
  }
}`;
  const trimmed = content.trim();
  if (!trimmed) return `${terraformBlock}\n\nprovider "${providerName}" {}`;
  return `${terraformBlock}\n\n${trimmed}`;
}
