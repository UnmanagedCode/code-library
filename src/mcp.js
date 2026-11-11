import { CODES, CodedError } from './errors.js';
import { TEXT_VIEWS } from './views.js';

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

// A caller-supplied value, shortened so a huge one is not echoed whole. Never throws.
function echo(v) {
  let text;
  try { text = v === undefined ? 'undefined' : JSON.stringify(v) ?? String(v); } catch { text = '[unprintable]'; }
  return text.slice(0, 80);
}

// cc's typed-tool wire contract: POST {tool, arguments, caller, format}; reply is always exactly one of
// {structured} (json), {text, meta?} (text, the default) or {error, code}.
export function createMcp({ library }) {
  const tools = {
    save: (args) => library.save(args),
    list: (args) => library.list(args),
    describe: (args) => library.describe(args),
  };

  // Never throws.
  async function handle(body) {
    const format = body?.format === undefined ? 'text' : body.format;
    if (format !== 'text' && format !== 'json') return { error: `format must be "text" or "json", got ${echo(body?.format)}`, code: CODES.FORMAT_UNKNOWN };
    const tool = body?.tool;
    if (typeof tool !== 'string' || !Object.hasOwn(tools, tool)) return { error: `no tool named ${echo(tool)}`, code: CODES.TOOL_UNKNOWN };
    const args = body.arguments ?? {};
    if (!isPlainObject(args)) return { error: 'arguments must be an object', code: CODES.BAD_REQUEST };
    try {
      const data = await tools[tool](args);
      return format === 'json' ? { structured: data } : TEXT_VIEWS[tool](data);
    } catch (err) {
      if (err instanceof CodedError) return { error: err.message, code: err.code };
      console.error(`code-library: tool ${tool} failed:`, err);
      return { error: `${tool} failed unexpectedly: ${String(err?.message ?? err)}`, code: CODES.INTERNAL };
    }
  }

  return { handle, toolNames: Object.keys(tools) };
}
