# Troubleshooting

Find the symptom that matches what you're seeing. Browser developer tools and `docker compose logs` can help, but remove private details before sharing any output.

Start with the [FAQ](/faq) for setup, discovery, layout, and saving explanations. The table below is the shorter symptom checklist.

| Symptom | Action |
|---|---|
| `resolve : lstat .../deploy: no such file or directory` or `deploy/Dockerfile: no such file or directory` | The root `compose.yaml` builds from the complete source tree. Replace it with the complete released [`compose.release.yaml`](https://github.com/aiden0rchad/homelab-atlas/releases/download/v0.12.0/compose.release.yaml). See [Which Compose file?](/getting-started#which-compose-file). |
| Cannot connect to the Docker daemon | Start Docker Desktop, or start the Linux Docker daemon and confirm your user has permission to use it. |
| `localhost:8080` fails from a laptop | `localhost` means the laptop. Use `ATLAS_BIND=0.0.0.0` on the Docker server, recreate the container, and open `http://SERVER_IP:8080`. See [trusted LAN access](/getting-started#trusted-lan-access). |
| Project is empty at another URL | Use the same browser profile, hostname, port, and protocol. If you changed the address, import a saved JSON backup. |
| Project is missing after container recreation | Projects are in browser storage, not `/config` or appdata. Return to the same browser origin or import saved JSON. |
| “Not saved — storage unavailable” | Allow site storage, leave private mode, and check the browser's storage quota or policy. If the project is still open, download JSON right away. |
| Another-tab conflict banner | Download the project in the current tab first. Then choose **Keep my edits** or **Load saved version** based on which copy you want. |
| Import rejected | Make sure it is valid Homelab Atlas schema-version-6 JSON, or schema version 1 through 5 for migration, no larger than 2 MB. Unknown keys, duplicate or unsafe IDs, unknown logo IDs, and bad references are rejected. |
| Custom logo upload rejected | Use a PNG, JPG, WebP, or safe SVG no larger than 2 MB, 4096px per side, or 16 million pixels. Active or externally loaded SVG content is rejected. |
| Port 8080 already in use | Stop the conflicting service or use a different local port as shown below. |
| Released container does not start | Run `docker compose -f compose.release.yaml config`, then use the same `-f compose.release.yaml` argument with `pull`, `ps`, and `logs atlas`. Also confirm the GHCR package is public. |
| Source-built container does not start | Run `docker compose config`, rebuild it, check `docker compose ps`, and read `docker compose logs atlas`. |
| Health check fails | Try `curl http://localhost:8080/healthz`. Make sure the container is running and listening on the interface you expected. |
| No discovery servers listed | For local Compose, open `.env` or create it if absent, add or update `ATLAS_COLLECTOR_TOKEN`, keep every other entry, restart with the matching Compose command, then choose **Check setup**. For another server, import a snapshot or follow the remote collector guide. |
| Editor works but nothing is discovered | Discovery is optional and never automatic. Configure a restricted collector, start an explicit Nmap scan, or import Docker JSON or Nmap XML. The editor needs no Docker socket. |
| Collector exits immediately | `ATLAS_COLLECTOR_TOKEN` must be at least 32 characters. Check the read-only Docker socket mount and `docker compose logs collector`. |
| Scan returns 401 | Enter the separate `ATLAS_API_TOKEN` configured on the editor server. The UI keeps it in memory only. |
| Scan returns 403 from another hostname | Add the exact browser hostname or IP to `ATLAS_ALLOWED_HOSTS`. A non-loopback entry also requires `ATLAS_API_TOKEN` of at least 32 characters. |
| Network scan says Nmap is unavailable or service identification cannot find its data | Compose requires complete source. Open `.env` or create it if absent, add or update `ATLAS_WITH_NMAP=true`, keep every other entry, and rebuild. The published image cannot gain Nmap from that flag. Native installs need Nmap plus service data and a restart. Nmap XML import needs no scanner. |
| Network target is rejected | Use numeric IPv4 or a canonical CIDR within `ATLAS_NMAP_ALLOWED_CIDRS`. Live scans reject IPv6, hostnames, URLs, option syntax, link-local, multicast, unspecified, and more than 256 expanded addresses. |
| Network scan finds no host | Nmap host discovery can be blocked by a firewall. The scan runs from the server/container network and does not add `-Pn` automatically. Check that vantage and the configured allowed ranges. |
| Scan returns 502 | For Docker, check collector reachability, token agreement, TLS certificates, fixed source URL, Docker socket access, and collector logs. For Nmap, narrow targets or ports, then check Atlas's Nmap installation, detection data, and displayed scan error. |
| Discovery says to make room | The selected additions would grow a card into another card. Move the lower card, enlarge available space, or add the findings to a new device card. |
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

Open `http://localhost:8081`. The browser treats port 8081 as a different site from port 8080, so import a JSON backup instead of expecting the old autosave to appear.

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
- IDs that are duplicated, longer than 64 characters, or contain unsupported characters
- unknown bundled or custom logo IDs
- service counts outside 1–99
- a connection to a missing endpoint or to itself
- a discovery binding whose source/key is duplicated or whose service is not on its stated device
- collection or text limits described in [project format](/project-format)

If the storage or import problem continues, replace any private details with fictional data before opening a [bug report](https://github.com/aiden0rchad/homelab-atlas/issues/new?template=bug_report.yml).

## Docker discovery snapshot rejection

Docker snapshots must be at most 2,000,000 bytes and use `homelab-atlas.docker-discovery` version 1. Atlas rejects unknown fields, duplicate or malformed finding keys, invalid dates or counts, more than 1,000 containers, more than 20 ports per finding, oversized text, and source mismatches from a live collector. See [Discovery](/discovery) for Nmap scan and XML limits. A rejected scan or import does not change the project.
