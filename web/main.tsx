import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import './styles.css';
import { App } from './App.js';
import { labStore } from './reference.js';
import { createLabTools } from './lab-tools.js';
import type { LabTool } from './lab-tools.js';

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);

const context = (document as Document & {
  modelContext?: { registerTool: (tool: LabTool, options: { signal: AbortSignal }) => void | Promise<void> };
}).modelContext;
if (context?.registerTool) {
  const lifecycle = new AbortController();
  for (const tool of createLabTools(labStore, action => flushSync(action))) {
    try {
      void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal }))
        .catch(() => console.warn('Optional flight tools could not be registered.'));
    } catch { console.warn('Optional flight tools are unavailable.'); }
  }
  import.meta.hot?.dispose(() => lifecycle.abort());
}
