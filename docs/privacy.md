# Privacy and deployment

Atlas runs on your own machine, but you still need to think about where you expose it and what you type into it.

## Where your data goes {#data-flow}

The editor and dashboard have:

- no accounts or login
- no backend project store or database
- no telemetry, analytics, external fonts, or AI calls
- no background polling or network discovery
- a local bundled logo catalog

The Go process serves embedded editor and dashboard files. Your project stays in the browser's `localStorage`. Atlas creates JSON or image files only when you choose to download them. Service links are opened only when you select a linked tile on the dashboard.

## Browser storage

Autosave, the browser default, and dashboard fallback all use `localStorage` on the current browser origin. The browser keeps separate storage for each hostname, port, protocol, and profile. Clearing site data removes both the autosaved project and the browser default.

The browser default is a fallback, not a server-side setting. It is used only when no autosaved project exists. It can contain the same inventory and private service URLs as any other saved project.

## Documentation is separate

This GitHub Pages site only hosts the documentation. It does not run the editor or dashboard and cannot read or edit the project in your browser. GitHub handles its own hosting and access logs under its policies.

## Where to run it {#deployment-boundary}

Run the app on localhost or a LAN you trust. Atlas has no login screen, user roles, or built-in TLS. There is no API token or discovery endpoint to configure. Do not put Atlas directly on the public internet.

If you bind Compose to `0.0.0.0`, anyone who can reach port 8080 can open the editor and dashboard. Each browser still has its own project storage, but the app itself has no authentication. Keep the default localhost binding unless you need access from a trusted LAN.

## Before you share {#content-and-sharing}

Atlas only sees what you type or load from a project file. The SVG and PNG Export dialog hides IP addresses, MAC addresses, URLs, and emails by default. You can list custom hostnames, domains, or other names as literal terms. The preview shows the filtered result before download. Service links never appear in SVG or PNG exports, even when they are present in the dashboard.

That filter does not make a diagram anonymous. It does not guess which arbitrary names are private, inspect text baked into uploaded logos, filter screenshots, or change saved JSON. Before sharing any file, still check for:

- addresses, hostnames, and private domains
- device roles or hardware details
- VLAN and relationship labels
- service names that reveal sensitive capabilities
- private service links in saved JSON

The documentation screenshots use a fictional sample. See [sharing and backup](/sharing) for details about each file format.
