# Troubleshooting

Find the symptom that matches what you're seeing. Browser developer tools and `docker compose logs` can help, but remove private details before sharing any output.

Start with the [FAQ](/faq) for setup, dashboard, storage, layout, and saving explanations. The table below is the shorter symptom checklist.

| Symptom | Action |
|---|---|
| Project is empty at another URL | Use the same browser profile, hostname, port, and protocol. If you changed the address, import a saved JSON backup. |
| “Not saved — storage unavailable” | Allow site storage, leave private mode, and check the browser's storage quota or policy. If the project is still open, download JSON right away. |
| Another-tab conflict banner | Download the project in the current tab first. Then choose **Keep my edits** or **Load saved version** based on which copy you want. |
| Import rejected | Make sure it is valid Homelab Atlas schema-version-7 JSON, or schema version 1 through 6 for migration, no larger than 2 MB. Unknown keys, duplicate or unsafe IDs, unknown logo IDs, bad references, and malformed links are rejected. |
| Custom logo upload rejected | Use a PNG, JPG, WebP, or safe SVG no larger than 2 MB, 4096px per side, or 16 million pixels. Active or externally loaded SVG content is rejected. |
| Service link rejected | Leave the field empty or use a complete `http://` or `https://` URL up to 2,048 characters with no spaces. Bare hostnames, relative paths, and other schemes are rejected. |
| Dashboard tile does not open | The service has no valid link, or the saved project is invalid. Check the link in the editor's **Apps** tab. Only linked services become anchors. |
| Dashboard shows the example | This browser origin has no autosaved project and no browser default. Open the editor, import or create a project, or save a browser default. |
| Browser default does not load | Atlas uses the default only when no autosaved project exists. Clear the autosave or use a fresh browser profile. The default belongs to one hostname, port, protocol, and browser profile. |
| Port 8080 already in use | Stop the conflicting service or use a different local port as shown below. |
| Released container does not start | Run `docker compose -f compose.release.yaml config`, then use the same `-f compose.release.yaml` argument with `pull`, `ps`, and `logs atlas`. Also confirm the GHCR package is public. |
| Source-built container does not start | Run `docker compose config`, rebuild it, check `docker compose ps`, and read `docker compose logs atlas`. |
| Health check fails | Try `curl http://localhost:8080/healthz`. Make sure the container is running and listening on the interface you expected. |
| Labels collide or cards are too tall | Shorten labels, use Compact density, adjust 1–4 columns, reorder devices, arrange device cards, or use **Fit page**/**Fit width**. Device cards cannot be resized below their content. |
| PNG export fails or is reduced | Simplify the diagram, try another current browser, or export SVG. PNG is capped at 36 MP and 16,384 px per side. |

## Use another port

With the direct Go server:

```sh
PORT=8081 go run ./app
```

For a source build, build the image and publish a different host port:

```sh
docker compose build
docker compose run --rm -p 127.0.0.1:8081:8080 atlas
```

Open `http://localhost:8081`. The browser treats port 8081 as a different site from port 8080, so import a JSON backup instead of expecting the old autosave or browser default to appear.

For the released image, Compose `run` does not publish the service's normal ports. Add the alternate mapping yourself:

```sh
docker compose -f compose.release.yaml run --rm -p 127.0.0.1:8081:8080 atlas
```

Leave the port inside the container at 8080. There is no `ATLAS_PORT` setting.

## Import validation details

Atlas checks the entire import before replacing your current project. If the file is rejected, the current project stays open. Common causes include:

- unsupported or missing `schemaVersion`
- a file larger than 2,000,000 bytes
- unknown object keys or invalid field types
- a version-7 file with a `discovery` key
- IDs that are duplicated, longer than 64 characters, or contain unsupported characters
- unknown bundled or custom logo IDs
- service counts outside 1–99
- service links that are not empty or complete `http://`/`https://` URLs
- a connection to a missing endpoint or to itself
- collection or text limits described in [project format](/project-format)

Older projects are validated in their original schema before migration. Discovery data from schema 5 and 6 is removed; a malformed legacy binding still causes the import to be rejected. If the storage or import problem continues, replace any private details with fictional data before opening a [bug report](https://github.com/AuthorShin/homelab-atlas/issues/new?template=bug_report.yml).

## Dashboard and browser default

The dashboard reads browser storage directly. It is not a second project store.

- **Saved project** means an autosaved project was found.
- **Browser default** means no autosave existed and the saved default was used.
- **Example project** means neither existed.
- **Saved project unavailable** or **Storage unavailable** means the browser value could not be read or storage is blocked. The example is shown instead.

The dashboard falls back to the example when a saved project is corrupt. Open the editor to import a good backup. **Refresh** re-reads the current browser origin; it cannot load a project from another browser or device.

Saving a browser default does not overwrite the current autosave. To test the default, remove or clear the autosaved project, then reload. Editing a project loaded from the default creates a normal autosave.
