# Recast

**Use it now: <https://uvoprod.github.io/recast/>**

Recast converts images, documents, spreadsheets and ebooks between 23 formats, entirely in your browser. Files are never uploaded, there's no account, and there's no size cap beyond your device's memory.

It's a static site: plain HTML, CSS and JavaScript with no build step and no server code.

## Use it

Open `index.html` through any static web server. For example, from this folder:

```bash
python3 -m http.server 8000
```

Then visit <http://localhost:8000>. Opening the file directly (`file://`) won't work, because browsers block loading the scripts that way.

To put it online, enable **GitHub Pages** for this repository (Settings → Pages → Deploy from branch → `main`, folder `/`). Any other static host works too.

## What it converts

| Kind | Opens | Saves as |
|---|---|---|
| Images | PNG, JPG, WebP, GIF, BMP, TIFF, ICO, HEIC, AVIF, SVG | PNG, JPG, WebP, GIF, BMP, TIFF, ICO, PDF |
| Documents | PDF, Word (.docx), OpenDocument (.odt), PowerPoint (.pptx, text only), HTML, Markdown, plain text | PDF, Word, HTML, Markdown, plain text, EPUB, or one image per page |
| Spreadsheets | Excel (.xlsx, .xls), OpenDocument (.ods), CSV, TSV | Excel, CSV, JSON, plus any document format |
| Ebooks | EPUB | Any document format, or images |

Several files can also be combined into one PDF.

### Limitations

- HEIC and AVIF can be opened but not saved, because browsers can't encode them. WebP output needs Chrome, Edge or Firefox.
- PDF → Word, Markdown or text rebuilds headings, paragraphs and lists from the PDF's text. Multi-column layouts, exact fonts and images aren't kept.
- Scanned PDFs have no text layer, so they can only be converted to images (there's no OCR).
- Documents converted to PDF are typeset fresh with clean styling, not copied pixel for pixel. Text in non-Latin scripts is saved as page images so it displays correctly.
- Each converter's code is downloaded from a public CDN the first time it's needed, so the first use of each kind of file needs an internet connection.

## How it works

| File | What it does |
|---|---|
| `index.html` | Page structure and all styles |
| `engine.js` | The conversion engine: format table, readers, writers. Loads libraries on demand. |
| `app.js` | The converter interface, the format matrix, and the hooks into the hero scene |
| `scene.js` | The three.js hero: sheets pass through a scanning gate that rewrites them from the input format to the output format, driven by real conversion progress |

Conversions run on these open-source libraries, each loaded from cdnjs, jsDelivr or unpkg only when needed: [pdf.js](https://github.com/mozilla/pdf.js), [pdf-lib](https://github.com/Hopding/pdf-lib), [mammoth](https://github.com/mwilliamson/mammoth.js), [SheetJS](https://sheetjs.com), [docx](https://github.com/dolanmiu/docx), [JSZip](https://github.com/Stuk/jszip), [heic2any](https://github.com/alexcorvi/heic2any), [UTIF.js](https://github.com/photopea/UTIF.js), [pako](https://github.com/nodeca/pako), [omggif](https://github.com/deanm/omggif), [marked](https://github.com/markedjs/marked), [Turndown](https://github.com/mixmark-io/turndown) and [three.js](https://github.com/mrdoob/three.js).

## Privacy

Files are read by the browser tab and never sent anywhere. The only network requests the page makes are for its fonts (Google Fonts) and the converter libraries above. Closing the tab discards everything.

## License

MIT, see [LICENSE](LICENSE). The libraries it loads keep their own licenses.
