# Development

The app uses browser JavaScript and the Go standard library, with no runtime packages to install. Node.js is used for tests, building logo data, and this documentation site. Python is retained for deterministic release packaging tests.

At startup, the Go server prepares reusable gzip representations for compressible embedded assets when they are smaller than the originals. Static responses use encoding-specific ETags and `Cache-Control: no-cache` revalidation. The server has no project API or other backend endpoints.

The final container includes `LICENSE` and `THIRD_PARTY_NOTICES.md` under `/usr/share/licenses/homelab-atlas/`.

## Source layout

| Path | Purpose |
|---|---|
| `app/public/` | Embedded editor, dashboard, logos, sources, and upstream licenses |
| `app/main.go` | Embedded assets and the server plus the `healthcheck` command |
| `app/server.go` | Restricted static server for the editor and dashboard |
| `deploy/` | Dockerfile and source/released Compose recipes |
| `tools/scripts/` | Repeatable icon and release artifact tools |
| `tools/tests/` | Node model/storage/dashboard tests and Python release tests |
| `docs/` | VitePress documentation and sample files |
| `compose.yaml` | Default source Compose configuration |

## Checks

Use Go 1.26, Node.js 20 or newer, and Python 3.10 or newer:

```sh
npm test
go test -race ./...
go vet ./...
npm run build:icons
npm run check:icons
docker compose config
docker compose --project-directory . -f deploy/compose.release.yaml config
python3 tools/scripts/release.py v0.12.0 --output dist
```

`npm test` checks logo data, runs the Node tests, runs `go test ./...`, and runs the Python release tests. Release files go into the ignored `dist/` directory, and the release workflow checks their checksums too.

Node tests cover the project schema, migrations, link validation, storage decoding, dashboard links, custom logos, and layout calculations. Go tests cover static serving, `/dashboard`, compression, caching, security headers, and legacy API 404s.

## Documentation

The docs keep their VitePress dependency inside `docs/`:

```sh
npm --prefix docs ci
npm --prefix docs run dev
npm --prefix docs run build
npm --prefix docs run preview
```

The configured base path is `/homelab-atlas/`, even when you run the docs locally. The dev server prints the full local URL. Use that URL when checking links and images.

### Guide screenshots

Annotated guide screenshots live in `docs/public/guides/`; their crops, marks, arrows, and captions live in `docs/.vitepress/theme/guide-figures.ts`. Capture only fictional data at a disposable origin. Never use a user lab, credentials, or private addresses. When the UI changes, update the source image dimensions, crop, and marks together. No separate capture toolchain is required.

## Adding or updating logos

1. Use a legitimate, pinned SVG source with a license that allows it to be included.
2. Add or replace the SVG in `app/public/logos/`.
3. Add its metadata to `app/public/catalog.js`, including the light/dark contrast plate sets if it needs them.
4. Add the exact source and license information to `app/public/licenses/logo-sources.json`.
5. Update `docs/THIRD_PARTY_NOTICES.md` and add any license file that applies.
6. Run `npm run build:icons` and `npm run check:icons`.
7. Include the generated `app/public/icon-data.js` change.

Keep the logos in the repository. Do not load them, fonts, or other images from a CDN at runtime. Product names and trademarks still belong to their owners; see [THIRD_PARTY_NOTICES.md on GitHub](https://github.com/aiden0rchad/homelab-atlas/blob/main/docs/THIRD_PARTY_NOTICES.md).

Project uploads are different from bundled logos. They are decoded by the browser, converted to PNG, limited to 512px and 200,000 data-URL characters each, and stored only in project JSON. Imports validate PNG structure, native zlib output within a fixed bound, and native browser image decoding. Projects allow 32 uploads and 1,200,000 total custom data-URL characters. Original files are limited to 2,000,000 bytes, 4096px per side, and 16 million pixels.

## Preparing a release

Update the root package version, the default tag in `deploy/compose.release.yaml`, the release notes, and `docs/changelog.md` together. Run the app, docs, Compose, and release-file checks before pushing a strict `vMAJOR.MINOR.PATCH` tag. The [release guide](/releases/) has the full checklist and the first-package visibility step.
