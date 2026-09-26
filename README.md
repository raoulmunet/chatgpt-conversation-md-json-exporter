# ChatGPT Conversation MD/JSON Exporter

A Chrome extension that saves the conversation currently open in ChatGPT as two local files: **Markdown (`.md`)** and **JSON (`.json`)**. A floating **Export chat** button appears on the ChatGPT page. You choose a destination folder once; the extension writes the Markdown file first and the JSON file second in that same folder. It does not open an export tab.

## Install

1. Download this repository with **Code → Download ZIP** and extract it to a folder you will keep, or clone the repository.
2. Open `chrome://extensions` in Chrome and turn on **Developer mode**.
3. Remove any older version of this extension to avoid duplicate buttons.
4. Click **Load unpacked** and select the folder containing this `manifest.json` file (the repository root, not the ZIP file).
5. Reload any ChatGPT tabs that were already open.

Chrome may remove an unpacked extension if you move or delete its folder. To update it later, replace the files in that folder and click **Reload** on its card at `chrome://extensions`, then reload ChatGPT.

## Use

1. Open a conversation at [chatgpt.com](https://chatgpt.com/), including a conversation within a custom GPT.
2. Click the floating **Export chat** button near the lower right of the page.
3. In Chrome's folder picker, choose the destination folder and grant write access if prompted.
4. Wait for the status message confirming both filenames. The two files have the same timestamped base name and different extensions.

The button is visible on ChatGPT even when no conversation is open; open a conversation before clicking it. Exporting again creates another pair of files with a random suffix.

## Output

| File | Contents |
| --- | --- |
| `.md` | Conversation title, source URL, export time, and numbered user/assistant messages. Headings, lists, tables, and code blocks are converted to Markdown. |
| `.json` | Metadata, message count, ordered messages with `role`, Markdown `content`, and `images`, plus any export warnings. No raw HTML. |

Images are embedded as data URLs when the browser can access them; otherwise source links are retained when available. Larger conversations or embedded images can produce large files.

## Privacy and limitations

- The extension reads the open ChatGPT page when you export and writes files to the folder you select. It does not use an API key or send the export to a separate service.
- It scans the rendered conversation while scrolling. ChatGPT can change its page structure; virtualized older messages, attachments, interactive content, inaccessible images, and embedded frames may be incomplete. Compare the message count and warnings with the source conversation before relying on an export as a complete archive.
- Chrome must support `showDirectoryPicker()` and allow write access to the selected folder. If the folder picker is cancelled, no files are written. If the JSON write fails after Markdown succeeds, the status message names the saved Markdown file.
- This exports one open conversation at a time, not the whole account. It does not generate HTML or PDF.

## Troubleshooting

**No button:** Check that the extension is enabled at `chrome://extensions`, select the folder containing `manifest.json` with **Load unpacked**, and reload the ChatGPT tab. Remove older versions first.

**No messages found:** Open the conversation fully and try again. If ChatGPT has changed its message layout, the extractor may need an update.

**Some messages or images are missing:** Review the on-page warning and compare the message count with the original. Try loading or scrolling through earlier parts of the conversation, then export again.

**Folder picker unavailable:** Use a recent desktop Chrome version on an HTTPS ChatGPT page.

## Files

- `manifest.json` — Manifest V3 configuration and ChatGPT page matching.
- `floating.js` / `floating.css` — floating button, folder picker, progress, and sequential file writing.
- `extract.js` — reads visible conversation turns and converts their content to Markdown.
