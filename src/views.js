// Text-format rendering per tool: `data` is the tool's typed result.
export const TEXT_VIEWS = {
  save: (d) => ({ text: `${d.replaced ? 'replaced' : 'saved'} ${d.name}` }),
  list: (d) => ({ text: d.modules.length ? d.modules.map((m) => `${m.name} — ${m.description}`).join('\n') : 'no modules saved' }),
  describe: (d) => ({ meta: { name: d.name, description: d.description }, text: d.source }),
};
