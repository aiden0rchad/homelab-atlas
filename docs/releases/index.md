# Releases and packages

**v0.12.0** is the latest release. You can read the [release notes](/releases/v0.12.0) or get the files from the [GitHub release](https://github.com/aiden0rchad/homelab-atlas/releases/tag/v0.12.0). A release is published only after its tests, docs, image, and downloads pass the release workflow.

Release notes for earlier versions are kept for reference. They describe the upstream releases they were written for, and not every feature mentioned there is part of the current build.

## Release assets

| Asset | Platforms | Purpose |
|---|---|---|
| `ghcr.io/aiden0rchad/homelab-atlas:0.12.0` | Linux AMD64, ARM64 | Published editor and dashboard image |
| `homelab-atlas-0.12.0.zip` | Go 1.26+ and a current browser | App source, deployment files, and documentation |
| `compose.release.yaml` | Docker Compose v2 | Runs the released image with the standard safety settings |
| `SHA256SUMS` | Linux/macOS | Integrity checks for the ZIP and Compose file |

Download release files from the [GitHub releases page](https://github.com/aiden0rchad/homelab-atlas/releases). The [package page](https://github.com/users/aiden0rchad/packages/container/package/homelab-atlas) lists the Docker image versions.

## Verify downloads

Put the ZIP, Compose file, and `SHA256SUMS` in the same directory.

Linux:

```sh
sha256sum -c SHA256SUMS
```

macOS:

```sh
shasum -a 256 -c SHA256SUMS
```

Both covered files must report `OK`.

## Container tags and digests

| Tag | Behavior |
|---|---|
| `0.12.0` | Exact stable release |
| `v0.12.0` | Exact stable release, matching the Git tag |
| `0.12` | Newest stable patch in the 0.12 line |
| `latest` | Newest stable release |

The exact version tags keep pointing to the same release. The `0.12` and `latest` tags move when a newer matching release is published. If you need an image reference that cannot move, get the verified manifest digest from the registry or successful release workflow. Replace the colon and tag after the image name with `@` followed by that `sha256:` digest.

## Maintainer checklist

1. Update the version in the root `package.json`, the default image tag in `deploy/compose.release.yaml`, `docs/releases/vVERSION.md`, and `docs/changelog.md`.
2. Run `npm test`, the release-file tests, both Compose checks, and the docs build.
3. Make sure the release notes match the version and only describe behavior that exists. Refresh version-specific ZIP command examples for the new release layout.
4. Commit on `main`, create a strict stable tag in the form `vMAJOR.MINOR.PATCH`, and push it.
5. Watch the whole release workflow: validation, multi-architecture image publishing, anonymous image verification, and GitHub release creation.

The first time the image is published to GHCR, GitHub may make the package private. Change it to public, then rerun only the failed **Publish GitHub release** job. The workflow will not create the release until anyone can pull the versioned image, both architectures are present, and the digest matches the image it built.
