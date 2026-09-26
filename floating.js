(() => {
  'use strict';
  const ID = 'chat-exporter-floating-v21';
  if (document.getElementById(ID)) return;

  const host = document.createElement('div');
  host.id = ID;
  const status = document.createElement('div');
  status.className = 'chat-exporter-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Export chat';
  host.append(status, button);
  (document.body || document.documentElement).append(host);
  // Keep the button present when ChatGPT updates the page without reloading it.
  new MutationObserver(() => {
    if (!host.isConnected) (document.body || document.documentElement).append(host);
  }).observe(document.documentElement, {childList: true, subtree: true});

  const baseName = name => (name || 'ChatGPT conversation').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 90) || 'chat';
  const markdown = data =>
    `# ${data.title}\n\nSource: ${data.url}\nExported: ${data.exportedAt}\nMessages: ${data.messages.length}\n\n` +
    data.messages.map((m, i) => `---\n\n## ${i + 1}. ${m.role === 'user' ? 'User' : 'Assistant'}\n\n${m.markdown.trim()}\n`).join('\n');
  const json = data => JSON.stringify({
    schemaVersion: 2,
    title: data.title,
    sourceUrl: data.url,
    exportedAt: data.exportedAt,
    messageCount: data.messages.length,
    messages: data.messages.map((m, i) => ({
      index: i + 1, role: m.role, contentFormat: 'markdown', content: m.markdown, images: m.images
    })),
    warnings: data.warnings
  }, null, 2) + '\n';

  async function writeOne(directory, filename, contents) {
    const handle = await directory.getFileHandle(filename, {create: true});
    const stream = await handle.createWritable();
    try { await stream.write(new Blob([contents], {type: 'text/plain;charset=utf-8'})); await stream.close(); }
    catch (error) { await stream.abort().catch(() => {}); throw error; }
  }

  button.addEventListener('click', async () => {
    if (button.disabled) return;
    if (typeof window.showDirectoryPicker !== 'function') {
      status.textContent = 'This Chrome installation does not offer folder selection. Update Chrome and try again.';
      return;
    }
    let directory;
    try { directory = await window.showDirectoryPicker({mode: 'readwrite'}); }
    catch (error) {
      status.textContent = error?.name === 'AbortError' ? 'Export cancelled.' : `Folder selection failed: ${error.message}`;
      return;
    }
    button.disabled = true;
    button.textContent = 'Exporting…';
    status.textContent = 'Scanning conversation…';
    let firstSaved = '';
    try {
      const data = await window.__chatExporterExtract();
      if (!data?.messages?.length) throw new Error('No conversation messages found on this page.');
      const stamp = data.exportedAt.replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
      const base = `${baseName(data.title)}-${stamp}-${crypto.randomUUID().slice(0, 12)}`;
      const mdName = `${base}.md`, jsonName = `${base}.json`;
      status.textContent = `Saving ${data.messages.length} messages to ${directory.name}…`;
      await writeOne(directory, mdName, markdown(data));
      firstSaved = mdName;
      await writeOne(directory, jsonName, json(data));
      status.textContent = `Saved ${mdName} and ${jsonName} in ${directory.name}.` +
        (data.warnings.length ? ` Check: ${data.warnings.join(' ')}` : '');
    } catch (error) {
      status.textContent = firstSaved
        ? `${firstSaved} was saved, but JSON failed: ${error.message}`
        : `Export failed; no files saved: ${error.message}`;
    } finally {
      button.disabled = false;
      button.textContent = 'Export chat';
    }
  });
})();
