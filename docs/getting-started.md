# Getting started

Atlas runs a small server and opens the editor in your browser. It needs no account, AI service, or database. Choose the installation that matches the machine where Atlas will run.

| Your setup | Start here |
|---|---|
| Docker Desktop or Docker Engine with Compose | [Released Compose file](#docker-compose-recommended), recommended |
| Unraid | [Unraid Docker tab](/unraid) |
| Portainer, Dockge, or a Compose-compatible Hawser stack UI | [Stack manager](#stack-manager) |
| Docker without Compose | [One Docker command](#docker-run) |
| Build the container yourself | [Source build](#build-from-source) |
| No Docker | [Native Go](#direct-go-fallback) |

Install Docker from the [official Docker guide](https://docs.docker.com/get-started/get-docker/). Docker Desktop must be running. On Linux, the Docker daemon must be running and your user must have permission to use it. Unraid users do not need to install Compose.

<a id="requirements"></a>

## Which Compose file? {#which-compose-file}

> [!WARNING]
> Do not copy the root `compose.yaml` alone into a stack manager. It builds from source and needs the complete repository, including `deploy/Dockerfile` and `app/`.

| File | What it does | Use it when |
|---|---|---|
| Release asset `compose.release.yaml` | Pulls the ready-made `0.12.0` image | Downloading a file or pasting into a stack manager |
| Repository `deploy/compose.release.yaml` | Same release-image configuration | Running from a complete repository checkout |
| Root `compose.yaml` | Builds an image from the source tree | You cloned or extracted the complete source |

<a id="install-the-released-image"></a>

## Docker Compose, recommended {#docker-compose-recommended}

1. Create a dedicated folder on the machine that actually runs Docker, then open a terminal in it.
2. Download the released Compose file:

   Linux or macOS:

   ```sh
   curl -fsSLO https://github.com/aiden0rchad/homelab-atlas/releases/download/v0.12.0/compose.release.yaml
   ```

   Windows PowerShell:

   ```powershell
   curl.exe -fsSLO https://github.com/aiden0rchad/homelab-atlas/releases/download/v0.12.0/compose.release.yaml
   ```

   Or open the [Compose file](https://github.com/aiden0rchad/homelab-atlas/releases/download/v0.12.0/compose.release.yaml) in a browser and save it as `compose.release.yaml` in that folder.
3. Start Atlas:

   ```sh
   docker compose -f compose.release.yaml up -d
   docker compose -f compose.release.yaml ps
   ```

4. Open `http://localhost:8080`. Check the server if needed:

   ```sh
   curl http://localhost:8080/healthz
   ```

   A healthy response is `ok`.

The default binding is `127.0.0.1`, so only a browser on the Docker machine can connect. If Docker runs on Unraid or another server, `localhost` on your laptop means your laptop, not that server. Follow [trusted LAN access](#trusted-lan-access) instead.

## Open it from another computer {#trusted-lan-access}

Atlas has no login. Use this only on a trusted LAN or through a VPN.

1. Create `.env` beside `compose.release.yaml`:

   ```dotenv
   ATLAS_BIND=0.0.0.0
   ```

2. Recreate the container:

   ```sh
   docker compose -f compose.release.yaml up -d
   ```

3. Open `http://SERVER_IP:8080`, replacing `SERVER_IP` with the Docker machine's address.

Keep the setting in `.env`. A one-time shell variable can disappear on the next update and silently restore localhost-only access. To use a different host port, change the port mapping before deploying but keep container port `8080`.

The editor and static assets work remotely without discovery settings. The optional discovery API also requires the exact browser hostname or IP, with no scheme or port, plus a separate token:

```dotenv
ATLAS_BIND=0.0.0.0
ATLAS_ALLOWED_HOSTS=localhost,127.0.0.1,::1,192.168.1.20
ATLAS_API_TOKEN=replace-with-at-least-32-random-characters
```

Generate the token with `openssl rand -hex 32`. This token protects discovery API calls. It is not a login for the editor. See [remote editor access](/discovery#remote-editor-access).

## Stack manager {#stack-manager}

This path is for Docker Compose stacks in Portainer, Dockge, or a Compose-compatible Hawser stack UI. It does not describe Docker Swarm.

1. Download the complete [released `compose.release.yaml`](https://github.com/aiden0rchad/homelab-atlas/releases/download/v0.12.0/compose.release.yaml).
2. Create a stack or project in the manager. Paste the entire file into its editor or upload it.
3. For access from another computer, set `ATLAS_BIND=0.0.0.0` through the manager's stack environment or supported `.env` file. The release file otherwise binds to `127.0.0.1`.
4. Deploy the stack, then open `http://SERVER_IP:8080`.

Do not paste the root source-build `compose.yaml`. If the manager does not support profiles or the internal networks in the release file, use this editor-only Compose file or follow [Docker run](#docker-run):

```yaml
services:
  atlas:
    image: ghcr.io/aiden0rchad/homelab-atlas:0.12.0
    ports:
      - "8080:8080"
    read_only: true
    tmpfs:
      - /tmp:size=16m,mode=1777
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    restart: unless-stopped
```

No Docker socket is needed for the editor. For optional remote discovery, add the exact browser host to `ATLAS_ALLOWED_HOSTS` and configure a separate `ATLAS_API_TOKEN` later. Manual editing works without either setting.

## Docker run {#docker-run}

Linux and macOS, local access only:

```sh
docker run -d \
  --name homelab-atlas \
  --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  --read-only \
  --tmpfs /tmp:size=16m,mode=1777 \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  ghcr.io/aiden0rchad/homelab-atlas:0.12.0
```

For trusted-LAN access, use `-p 8080:8080` instead of the localhost mapping, then open `http://SERVER_IP:8080`. Do not use both mappings. On Windows, enter the command on one line or join the lines using PowerShell backticks instead of Unix backslashes.

Useful commands:

```sh
docker logs homelab-atlas
docker stop homelab-atlas
docker start homelab-atlas
```

Before upgrading, save project JSON. Pull the new versioned image, remove and recreate the container with the same flags. Project data lives in browser storage, so no app-data volume is required.

<a id="pin-and-update-versions"></a>

## Pin, update, and stop Compose

To pin a version, create `.env` beside `compose.release.yaml`:

```dotenv
ATLAS_VERSION=0.12.0
```

Update the version only after it is published, then run:

```sh
docker compose -f compose.release.yaml pull
docker compose -f compose.release.yaml up -d
```

Stop the release deployment with `docker compose -f compose.release.yaml down`. Save editable JSON before an update or downgrade. Atlas 0.12 uses schema version 6 and imports versions 1 through 5. It does not migrate projects backward.

Tags `0.12.0` and `v0.12.0` identify this release. `0.12` follows compatible patches, `latest` follows stable releases, and a published digest never changes. See [releases](/releases/).

## Build from source {#build-from-source}

Use a complete clone or the complete release ZIP. The source Compose file cannot build from a copied YAML file alone.

```sh
git clone https://github.com/aiden0rchad/homelab-atlas.git
cd homelab-atlas
docker compose up --build -d
```

To use the release ZIP, download `homelab-atlas-0.12.0.zip`, extract it with your file manager, open a terminal in the extracted `homelab-atlas-0.12.0` folder, and run the same `docker compose up --build -d` command. Stop with `docker compose down`.

Update a cloned source deployment with:

```sh
git pull --ff-only
docker compose up --build -d
```

## Run without Docker {#direct-go-fallback}

Install [Go 1.26 or newer](https://go.dev/doc/install). The release ZIP contains source code and requires Go. It is not a standalone binary. Node.js, npm, and Python are not needed at runtime.

1. Clone the repository or download and extract `homelab-atlas-0.12.0.zip`.
2. Open a terminal in its top-level folder.
3. Run:

   ```sh
   go run ./app
   ```

4. Keep the terminal open and visit `http://localhost:8080`. Press Ctrl+C to stop.

For trusted-LAN access, run `go run ./app --host 0.0.0.0 --port 8080`, then open `http://SERVER_IP:8080`. Atlas has no login, so keep it on a trusted LAN or VPN. Optionally build once with `go build -o atlas ./app`, then run `./atlas`.

## First diagram

1. Open **File** and choose **Load example** or **Start empty**.
2. Add a device and services.
3. Choose **File → Save project** before sharing, updating, or changing the URL.

Projects are stored in browser storage and exported as JSON. They are not stored in the container. Continue with the [editor guide](/editor), [sharing and backup](/sharing), or optional [discovery guide](/discovery).
