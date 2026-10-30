# Install on Unraid

Use Unraid's Docker tab to run the published image. This is a manual container setup. Homelab Atlas does not currently provide a Community Applications template.

## Add the container

1. In Unraid, open **Docker**, then choose **Add Container**.
2. Enter these values:

| Field | Value |
|---|---|
| Name | `homelab-atlas` |
| Repository | `ghcr.io/aiden0rchad/homelab-atlas:0.12.0` |
| Network Type | `Bridge` |
| Privileged | `Off` |

3. Choose **Add another Path, Port, Variable, Label or Device**, select **Port**, then enter:

| Port field | Value |
|---|---|
| Name | `Web UI` |
| Container Port | `8080` |
| Host Port | `8080`, or another unused port such as `8081` |
| Connection Type | `TCP` |

Change the host port if it is occupied. Keep the container port at `8080`.

4. If your Unraid version shows a WebUI field in advanced settings, set it to `http://[IP]:[PORT:8080]`. This field is optional.
5. Choose **Apply**, wait for the image download, and confirm the container is running.
6. Open `http://UNRAID_IP:HOST_PORT` manually, replacing both values. This works even when the WebUI field is unavailable.
7. Load the example, then choose **File → Save project** to make your first editable JSON backup.

Do not add `/config` or appdata storage. Atlas projects live in browser storage and JSON files, not in the container. Do not mount the Docker socket into the editor container. The published image already listens on `0.0.0.0`; `ATLAS_BIND` is only Compose interpolation and is not an image environment variable.

The [Unraid container guide](https://docs.unraid.net/unraid-os/using-unraid-to/run-docker-containers/managing-and-customizing-containers/) explains Bridge networking, host-port changes, and WebUI shortcuts.

## Update or remove

1. Save project JSON before changing the image or browser URL.
2. To update, edit the Repository tag to a published version and let Unraid pull the image, then restart the container.
3. To remove Atlas, stop and remove the container. There is no Atlas appdata directory to delete. Browser storage and downloaded JSON files are separate.

## Optional discovery

The editor works without discovery. Do not mount `/var/run/docker.sock` into it and expect apps to appear. For Docker inventory, use the [restricted collector setup](/discovery#local-compose-setup), Hawser Standard mode, or import a Docker snapshot.

The published Atlas image does not include the Nmap scanner. Import Nmap XML, build the documented source image with Nmap, or run a native Go installation with Nmap installed. See [network scan](/discovery#network-scan).

### Remote discovery API

The editor itself needs no API token. If you later enable discovery from a browser on another computer, add variables through **Add another Path, Port, Variable, Label or Device → Variable**:

| Variable | Value |
|---|---|
| `ATLAS_ALLOWED_HOSTS` | Exact browser hostname or IP, without `http://`, `https://`, or a port |
| `ATLAS_API_TOKEN` | A separate random value of at least 32 characters |

Generate a token in an Unraid terminal:

```sh
openssl rand -hex 32
```

Keep the real token out of documentation and screenshots. It protects discovery API requests. It is not a login for the whole editor. Keep Atlas on a trusted LAN or VPN.
