/**
 * Minimal Terraform (.tf) file parsing for diagram sync.
 * Uses regex for block extraction; full validation left to Terraform CLI.
 */

export interface TerraformProvider {
  id: string;
  name: string;
  source: string;
  version: string;
}

export interface TerraformVariable {
  id: string;
  name: string;
  type?: string;
  default?: string;
  description?: string;
}

export interface TerraformResource {
  id: string;
  type: string;
  name: string;
  body: string;
  dependsOn?: string[];
}

export interface TerraformData {
  id: string;
  type: string;
  name: string;
  body: string;
  dependsOn?: string[];
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
 * Parse Terraform configuration content into structured blocks.
 */
export function parseTerraformContent(content: string): ParsedTerraform {
  const result: ParsedTerraform = {
    providers: [],
    variables: [],
    resources: [],
    data: [],
    modules: [],
    outputs: [],
    locals: [],
  };

  // Parse terraform block for required_providers
  const terraformMatch = content.match(/terraform\s*\{([\s\S]*?)^\}/m);
  if (terraformMatch) {
    result.providers = parseRequiredProviders(terraformMatch[1]);
  }

  // Parse provider blocks (standalone, not from required_providers)
  const providerBlockRe = /provider\s+"([^"]+)"\s*\{/g;
  let pm: RegExpExecArray | null;
  while ((pm = providerBlockRe.exec(content)) !== null) {
    const existing = result.providers.find((p) => p.name === pm![1]);
    if (!existing) {
      result.providers.push({
        id: `provider-${pm[1]}`,
        name: pm[1],
        source: '',
        version: '',
      });
    }
  }

  // Parse variable blocks
  const varRe = /variable\s+"([^"]+)"\s*\{/g;
  let vm: RegExpExecArray | null;
  while ((vm = varRe.exec(content)) !== null) {
    const { body } = extractBlockBody(content, vm.index + vm[0].length);
    const typeMatch = body.match(/type\s*=\s*([^\n]+)/);
    const defaultMatch = body.match(/default\s*=\s*([^\n]+)/);
    const descMatch = body.match(/description\s*=\s*"([^"]*)"/);
    result.variables.push({
      id: `var-${vm[1]}`,
      name: vm[1],
      type: typeMatch?.[1]?.trim(),
      default: defaultMatch?.[1]?.trim(),
      description: descMatch?.[1],
    });
  }

  // Parse resource blocks
  const resRe = /resource\s+"([^"]+)"\s+"([^"]+)"\s*\{/g;
  let rm: RegExpExecArray | null;
  while ((rm = resRe.exec(content)) !== null) {
    const { body } = extractBlockBody(content, rm.index + rm[0].length);
    const fullBlock = content.slice(rm.index, rm.index + rm[0].length + body.length + 2);
    result.resources.push({
      id: `resource-${rm[1]}-${rm[2]}`,
      type: rm[1],
      name: rm[2],
      body: fullBlock,
      dependsOn: extractDependsOn(body),
    });
  }

  // Parse data blocks
  const dataRe = /data\s+"([^"]+)"\s+"([^"]+)"\s*\{/g;
  let dm: RegExpExecArray | null;
  while ((dm = dataRe.exec(content)) !== null) {
    const { body } = extractBlockBody(content, dm.index + dm[0].length);
    const fullBlock = content.slice(dm.index, dm.index + dm[0].length + body.length + 2);
    result.data.push({
      id: `data-${dm[1]}-${dm[2]}`,
      type: dm[1],
      name: dm[2],
      body: fullBlock,
      dependsOn: extractDependsOn(body),
    });
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
  const outRe = /output\s+"([^"]+)"\s*\{/g;
  let om: RegExpExecArray | null;
  while ((om = outRe.exec(content)) !== null) {
    const { body } = extractBlockBody(content, om.index + om[0].length);
    const valueMatch = body.match(/value\s*=\s*([^\n]+)/);
    result.outputs.push({
      id: `output-${om[1]}`,
      name: om[1],
      value: valueMatch?.[1]?.trim(),
    });
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
