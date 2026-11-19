# Dashboard and browser default

The dashboard is a read-only view of the project stored in your browser. It uses the same diagram as the editor and turns linked service tiles into clickable links. It does not add a server-side project store, account, or API.

## Open the dashboard

Choose **Dashboard** in the editor's top bar, or open `/dashboard` on the same host and port. Use **Edit diagram** to return to the editor.

The dashboard reads:

1. the autosaved project in this browser origin
2. the browser default, when there is no autosaved project
3. the included example, when neither exists

The fallback is shown in the top bar and in a notice above the diagram. **Refresh** re-reads browser storage. The dashboard also updates when another tab saves the project, when storage changes, and when the tab becomes visible again. A custom browser-tab icon saved with the project is applied to the dashboard tab too; projects without one use the default Atlas mark.

## Service links

Add or edit a link in the device inspector's **Apps** tab. Leave it empty for a tile without a link, or use a complete `http://` or `https://` URL. Links are limited to 2,048 characters and cannot contain spaces.

On the dashboard, every valid link wraps its service tile. Selecting the tile opens the URL in a new tab with `noopener`, `noreferrer`, and `no-referrer` behavior. Atlas does not probe, proxy, or preload the address. A tile with an invalid or empty link stays visible but is not clickable.

Links are dashboard-only. They are part of saved JSON and browser storage, but SVG and PNG exports contain only the diagram. That separation keeps private admin URLs out of images you share.

The **status** in the dashboard top bar shows how many services have links, for example `3 of 58 services linked`. When the project comes from the fallback path it shows `Browser default` or `Example project` instead.

## Save a browser default

Use **File → Save as browser default** in the editor to store the current project as the starting project for this browser origin. Use **File → Clear browser default** to remove it. Atlas asks before replacing an existing default or clearing it.

The default is separate from autosave:

- If an autosaved project exists, Atlas opens that project and leaves the default alone.
- If no autosaved project exists, Atlas loads the default and shows **Using browser default**.
- Loading the default does not immediately create an autosave. The first edit creates one.
- **Load example** and **Start empty** remain explicit actions and do not change the default unless you save the new project as the default.
- Clearing the default does not change the project currently open in the editor.

Because this is browser storage, the default belongs to one hostname, port, protocol, and browser profile. It is not stored in the container and is not shared between browsers or devices.

## Privacy and limits

The dashboard runs entirely in your browser and makes no network requests for project data. Service links are stored in the project and in `localStorage`, so treat a saved JSON file as private when it contains internal addresses.

The dashboard is read-only on purpose. Layout edits, imports, exports, and default management stay in the editor. See [Sharing and backup](/sharing) for transfer and [Privacy and deployment](/privacy) for the deployment boundary.
