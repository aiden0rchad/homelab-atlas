# FAQ

Short answers to common setup and discovery problems. See [Troubleshooting](/troubleshooting) for a symptom checklist.

## Getting started

### What do I need to draw manually or use discovery?

A manual diagram needs only a running Atlas server and a current browser. There is no account or AI service, and discovery is optional. Docker, live Nmap, and XML import have different prerequisites in the [requirements table](/discovery#requirements-by-method).

### Why does my stack report `resolve : lstat .../deploy: no such file or directory` or `deploy/Dockerfile: no such file or directory`? {#missing-deploy-dockerfile}

The root `compose.yaml` is a source-build file. It needs the complete repository, including `deploy/Dockerfile` and `app/`. A stack editor that received only that YAML cannot build it. Replace the stack contents with the complete released [`compose.release.yaml`](https://github.com/aiden0rchad/homelab-atlas/releases/download/v0.12.0/compose.release.yaml), which pulls the ready-made image. See [Which Compose file?](/getting-started#which-compose-file).

### Why is Nmap unavailable in the released image? {#nmap-unavailable}

The published GHCR image is intentionally scanner-free; setting an environment flag on that image cannot add Nmap. The in-app guide separates Docker Compose from native Go. From a source checkout or extracted release ZIP, open the existing `.env` or create it if absent, add or update `ATLAS_WITH_NMAP=true`, keep every other entry, then run `docker compose up -d --build`. For a native install, install Nmap and its detection data with the operating-system package manager, restart Atlas, then choose **Check setup**. **Import Nmap XML instead** remains available throughout. See [Network scan](/discovery#network-scan).

### Why is my project empty after changing the URL or updating Atlas?

Autosave belongs to the browser origin: protocol, hostname, and port. Use the same browser profile and origin, or import a JSON backup. Atlas does not synchronize projects through a container volume. See [trusted LAN access](/getting-started#trusted-lan-access) and [sharing and backup](/sharing).

Adding an appdata or `/config` volume does not move browser storage into the container. Save project JSON for a portable, editable backup.

### Why can’t I find or upload a custom logo?

Search filters the current catalog; clear it to see every tile. Uploads must be PNG, JPG, WebP, or safe SVG, at most 2 MB, 4096px per side, and 16 million pixels. Atlas converts them to PNG at up to 512px. See [Add service tiles](/editor#add-service-tiles) and [Troubleshooting](/troubleshooting).

### Why was my project import rejected?

The whole file must pass schema and reference validation before Atlas replaces the open project. Check its size, schema version, IDs, logos, connections, and discovery bindings. The current project stays unchanged after rejection. See [Import validation details](/troubleshooting#import-validation-details).

## Discovery

### Why are no Docker collectors listed? {#no-docker-collectors}

Open **Docker apps** and follow the setup guide for the server where Docker runs. For local Compose, open the existing `.env` or create it if absent, add or update `ATLAS_COLLECTOR_TOKEN` with the same value of at least 32 characters, and keep every other entry. Then start the profile with `docker compose --profile discovery up -d`. Include `-f compose.release.yaml` for the downloaded Compose file. An explicit `ATLAS_DISCOVERY_SOURCES` file overrides the local source. For another server, the guide recommends a one-time snapshot before the advanced remote collector path. Follow [Local Compose setup](/discovery#local-compose-setup).

### Why could Atlas not check discovery readiness?

Choose the blocked Docker or network method to see its diagnostic and **Check again** control. A `403` means the browser hostname or IP is missing from `ATLAS_ALLOWED_HOSTS`; fix that server setting before retrying. A failed readiness check does not mean Nmap is missing and never starts a scan.

### What can Docker discovery see?

Only inventory from the Docker daemon configured for that collector is listed. Other LAN hosts, Kubernetes, and Podman are not discovered automatically. A remote collector or [Hawser Standard mode](/discovery#hawser-standard-mode) can point at another daemon. Hawser Edge is not supported, and Atlas never needs an exposed unauthenticated Docker API.

Installing the editor alone does not enable discovery. It needs a separately configured collector, an explicit scan, or an imported snapshot or Nmap XML file.

### Are the API and collector tokens interchangeable? {#api-vs-collector-token}

No. `ATLAS_API_TOKEN` unlocks the editor server's discovery API. `ATLAS_COLLECTOR_TOKEN` authenticates a collector source. Keep both out of documentation and screenshots. For a remote editor hostname, add it to `ATLAS_ALLOWED_HOSTS` and configure a separate API token of at least 32 characters; the UI keeps that token in memory only. See [Remote editor access](/discovery#remote-editor-access).

### What do 401, 403, and 502 mean?

- `401`: enter the server's separate `ATLAS_API_TOKEN` in **Access token** and choose **Unlock**.
- `403`: add the exact browser hostname or IP to `ATLAS_ALLOWED_HOSTS`; a non-loopback host also requires an API token of at least 32 characters. Then reopen the affected method and choose **Check again**.
- `502`: for Docker, check collector reachability, token agreement, TLS, fixed source URL, socket access, and collector logs. For Nmap, narrow the targets or ports, then check Atlas's Nmap installation, detection data, and displayed scan error.

See the [troubleshooting table](/troubleshooting).

### Why does a scan find no host or no services? {#no-scan-results}

The scan runs from the Atlas server or container, not the browser. Check its route, VLAN and firewall path, the host's listening address, and published ports. Nmap host discovery stays enabled; Atlas does not force `-Pn`. Docker Desktop networking can differ from a native host. Nmap sees reachable open ports, but it cannot enumerate apps hidden behind a reverse proxy the way Docker inventory can. Do not disable a firewall or expose the Docker API to fix this.

### Which ports and protocols can a live scan use?

The default **Homelab app ports** preset checks common self-hosted services. **Common 100 TCP ports** sends a blank port list to Nmap, and custom ports or ranges may expand to at most 1,000 TCP ports. Only explicitly open results are offered; service identification is slower and imperfect, and an open port is not proof of a particular app. Live scanning has no UDP, IPv6, OS detection, custom scripts, or caller flags. Imported XML can contain explicitly open TCP/UDP and IPv4/IPv6 results.

### Why was my network target rejected?

Use a numeric IPv4 address or canonical IPv4 CIDR, not a hostname or URL, inside `ATLAS_NMAP_ALLOWED_CIDRS`. Defaults are the RFC 1918 ranges. A scan accepts at most 16 terms and 256 expanded addresses. See [Network scan](/discovery#network-scan).

### Why are hosts or endpoints missing after a slow scan?

One scan may run at a time, with 120 seconds total, 15 seconds per ordinary host, or 45 seconds per host with service identification. A timeout can omit a host and its endpoints. Narrow the targets or ports, or import separately produced complete XML.

### Why did a device appear again after its address changed?

Reuse a stable network name. Atlas prefers MAC identity, then falls back to IP; an address change without a MAC, or a change in MAC availability, can look new. Review it and explicitly choose the existing destination. Missing results never delete old cards or services.

### Why is Add selected to diagram disabled or asking me to make room? {#apply-disabled}

Check at least one row. Atlas always shows a destination diagram card and group suggestion; changing the destination clears selections. **Select all shown** affects only the filtered visible page and skips rows already on the diagram. Additions may need card height; if growth would collide, move a card or use a new card. New cards go below existing cards, while existing positions and widths stay fixed. Each **Add selected to diagram** is one session-only Undo.

### Can discovery build cabling, VLANs, or switch ports automatically?

No. Discovery offers hosts and services for review. Logical connections, VLAN labels, and topology are manually authored in the [networking editor](/networking); Atlas does not infer physical switch ports or cabling.

## Layout and saving

### Why did Undo stop working after a reload?

Undo history lasts only for the current page session. Save project JSON for durable editing and backup. Each **Add selected to diagram** creates one undo step, but reloading clears it.

### Does private export remove every secret? {#private-export-limits}

No. Image filtering hides recognized addresses, URLs, emails, and literal custom terms. Add private hostnames explicitly. Text baked into uploaded logos is unchanged, and editable JSON always retains the full facts. Inspect the preview and keep JSON private; see [Exporting](/exporting).
