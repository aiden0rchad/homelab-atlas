# Getting started

Homelab Atlas runs in your browser and is served from your own machine. The published Docker image is the easiest way to run it.

## Requirements

- Docker Engine or Docker Desktop with Compose v2
- A current desktop browser

You only need Git if you're building from source. Running without Docker requires Go 1.26 or newer. Node.js is only needed for tests, logo maintenance, and work on these docs. Python is used only by the release-file tests.

Manual diagrams need only Atlas and a browser. There is no scanner, collector, or external service to configure.

## Install the released image

Download the release Compose file, then start the container:

```sh
curl -fsSLO https://github.com/AuthorShin/homelab-atlas/releases/download/v0.12.1/compose.release.yaml
docker compose -f compose.release.yaml up -d
```

Open `http://localhost:8080`. Verify the server if needed:

```sh
curl http://localhost:8080/healthz
```

A healthy response is `ok`. By default, the Compose file pulls `ghcr.io/authorshin/homelab-atlas:0.12.1`. It only listens on the machine running Docker and keeps the container read-only, drops its capabilities, and enables the no-new-privileges setting.

## Pin and update versions

To pin a version, create `.env` next to `compose.release.yaml`:

```dotenv
ATLAS_VERSION=0.12.1
```

When you want to update, change `ATLAS_VERSION` in `.env` to a version that has been published. Then pull it and recreate the container without changing the hostname or port:

```sh
docker compose -f compose.release.yaml pull
docker compose -f compose.release.yaml up -d
```

Save an editable JSON project before you update or downgrade. Your project is stored by the browser, not in a container volume. Atlas 0.12.1 uses schema version 8 and imports schema versions 1 through 7. Existing inventory, uploaded logos, connections, manual layouts, and service links are preserved. Discovery data from older projects is discarded, and older service-link fields are kept or filled with an empty link. Schema-7 projects gain an empty favicon. Atlas does not migrate projects backward; older releases cannot open schema version 8.

The image tags work like this:

- `0.12.1` and `v0.12.1` identify this release.
- `0.12` moves to the newest compatible 0.12 patch.
- `latest` moves to the newest stable release.
- A published image digest never changes; the [release guide](/releases/) explains how to pin one.

## Build from source

Install Git, clone the repository, and build the current source:

```sh
git clone https://github.com/AuthorShin/homelab-atlas.git
cd homelab-atlas
docker compose up --build -d
```

Update a source deployment with:

```sh
git pull --ff-only
docker compose up --build -d
```

Stop a released-image deployment with:

```sh
docker compose -f compose.release.yaml down
```

Stop a source-built deployment from its checkout with:

```sh
docker compose down
```

## Run without Docker {#direct-go-fallback}

From a source checkout, run:

```sh
go run ./app
```

For the portable release, extract the ZIP and move into its top-level directory first:

```sh
unzip homelab-atlas-0.12.1.zip
cd homelab-atlas-0.12.1
go run ./app
```

Open `http://localhost:8080`. The server only exposes the embedded editor and dashboard assets and, by default, only listens on the same machine.

## Open it from another computer {#trusted-lan-access}

Atlas has no login system. Only make it available on a LAN you trust:

```sh
ATLAS_BIND=0.0.0.0 docker compose -f compose.release.yaml up -d
```

Open `http://<server-address>:8080` from the other computer. The browser sees that address as a different site from `localhost`, so it has separate browser storage. Save JSON before changing the hostname, port, or protocol. Do not expose Homelab Atlas directly to the public internet.

The server is static and has no API token or host allowlist to configure. Each browser keeps its own autosave and browser default for that origin, so a project opened from another computer starts from that browser's storage or the included example. Use **File → Save project** on the first computer and **Import project** on the other when you want to move a diagram. Do not expose Homelab Atlas directly to the public internet.

## First diagram

1. Open **File** and choose **Load example** to explore or **Start empty**.
2. Add a device from the inventory rail.
3. Select its card or inventory row to open the inspector.
4. Add a service group and local logo tiles.
5. Add an optional `http://` or `https://` link to a service in its **Apps** tab.
6. Choose **File → Save project** before sharing or changing origins.

Open **Dashboard** in the top bar to see the same project as a read-only tile view. If this browser has no autosaved project, the dashboard falls back to the browser default and then the example. Use **File → Save as browser default** when you want a project to open automatically in a fresh browser session on this origin.

The [annotated editor overview](/editor#editor-guide) covers the controls. The [dashboard guide](/dashboard) explains links and browser defaults. The [privacy and deployment page](/privacy) explains what stays in the browser and why Atlas should stay off the public internet. For setup or storage failures, check the [FAQ](/faq).
