# Exporting

Choose **Export** to preview and download SVG or PNG. Use **File → Save project** for editable JSON.

<GuideFigure name="private-export" />

| Format | Best for | Behavior |
|---|---|---|
| JSON | Backup and later editing | Includes inventory, layout, and uploaded logo PNGs |
| SVG | Documentation, scaling, print | Self-contained image with bundled and uploaded logos embedded |
| PNG | Chats, wikis, broad compatibility | Rendered at 3× when possible, within browser limits |

**Hide network details** is checked whenever the Export dialog opens. It replaces valid IP addresses, MAC addresses, URLs, and email addresses with `[hidden]` in both image formats. Expand **Also hide text** to add up to 30 literal terms, one per line. Matching is case-insensitive; punctuation such as `.` or `+` has no special meaning.

The preview uses the same filtered SVG as the download. Filtering changes only the image being exported. It does not edit the canvas, autosaved project, undo history, JSON backup, or conflict backup.

This is a review aid, not complete anonymization. Add hostnames, private domains, or other custom names explicitly. Text baked into an uploaded logo is unchanged, and saved JSON always keeps the full project details.

Uploaded PNG, JPG, WebP, and SVG files are stored as PNG data in the project. SVG uploads do not remain vector. Their stored PNGs are at most 512px, so scaling the exported diagram does not recreate vector detail.

SVG and PNG exports work offline and do not contact the original file location. They cannot be imported to restore an editable project. Keep a JSON backup too.

Service links are dashboard-only. They remain in saved JSON and browser storage but never appear in SVG or PNG exports. See [Dashboard and browser default](/dashboard).
