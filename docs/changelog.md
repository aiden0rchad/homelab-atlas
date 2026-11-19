# Changelog

This file lists the notable changes in each Homelab Atlas release.

## [0.12.0] - 2026-11-18

### Added

- Added a read-only `/dashboard` view of the browser-stored project, with clickable service tiles and live updates when the project changes.
- Added optional `http://` and `https://` service links. Links stay dashboard-only and never appear in SVG or PNG exports.
- Added **File → Save as browser default** and **Clear browser default** actions. When no autosaved project exists, the editor and dashboard fall back to the browser default before the example.
- Added a dedicated dashboard guide and expanded project-format, storage, and troubleshooting documentation.

### Changed

- Removed discovery, scanning, Docker collector, Nmap, and Hawser features, including their UI, API, settings, deployment profiles, environment variables, tests, and documentation.
- Saved projects now use schema version 7. Imports from schema versions 1 through 6 drop discovery data, preserve valid schema-5 service links, and add empty links where needed.
- The Go server is now a static editor and dashboard server with no project, discovery, or collector API.
- Diagram and image export output for inventory, placement, and styling is otherwise unchanged.

## [0.11.1] - 2026-10-28

### Fixed

- Focus canvas now uses the full tablet width when the inspector was open.

## [0.11.0] - 2026-10-28

### Changed

- Reworked the editor into a calmer workspace with separate inventory, canvas, and inspector areas.
- Added a File menu and split device editing into **Details**, **Apps**, and **Layout** tabs.
- Clarified app rows, dialogs, canvas controls, and mobile access to Undo and Redo.
- Kept diagram and export output unchanged; schema version 6 projects, saved layouts, Docker collectors, and discovery imports remain compatible.
- Updated current downloads, image tags, Compose defaults, screenshots, and documentation for v0.11.0.
- Added no runtime dependency.

## [0.10.0] - 2026-10-28

### Added

- Added a guided Choose, Find, and Review discovery flow with method-specific setup, a Homelab ports preset, and collapsed advanced scan options.
- Added unchecked findings, **Select all shown** for the current filtered page, **Clear selection** for the current device, and retained choices while reviewing multiple devices.
- Added focused guide figures for Docker readiness, network scanning, and both review paths.

### Changed

- Discovery readiness failures now stay with their method and offer an in-place retry without misreporting missing setup.
- Repository source is consolidated under `app/`, `deploy/`, and `tools/`; the source ZIP uses `app/` and `deploy/` and omits development tools.
- Current downloads, image tags, Compose defaults, and documentation now point to v0.10.0.

## [0.9.0] - 2026-10-28

### Added

- Added explicit bounded IPv4 Nmap TCP scans with private-range defaults, fixed safety limits, Stop support, and the existing unchecked multi-host review.
- Added opt-in local Docker builds with Nmap while keeping the published image scanner-free.

### Changed

- Nmap XML import and live results now share the same normalized identities, explicit Apply flow, layout protection, bindings, and Undo behavior.

## [0.8.0] - 2026-10-27

### Added

- Added bounded Nmap XML import with multi-host, ping-only host, TCP/UDP endpoint, IPv6, and MAC-stable identity review.
- Added host cards and device-level discovery bindings without automatic scanning or diagram changes.

### Changed

- Discovery now keeps manual geometry fixed, supports reviewing several imported hosts, and applies each host as one undo step.
- Saved projects now use schema version 6; schema versions 1 through 5 migrate without changing existing inventory or layout.

## [0.7.0] - 2026-10-27

### Added

- Added previewed SVG and PNG privacy filtering for IP addresses, MAC addresses, URLs, emails, and optional literal custom terms.
- Added Hawser Standard-mode inventory compatibility through the existing restricted Docker collector.

### Changed

- Export filtering is session-only and preserves project JSON, autosave, undo history, uploaded image bytes, card geometry, and canvas dimensions.
- Hawser and Portainer credentials are mutually exclusive, validated at startup, and never forwarded across redirects.

## [0.6.0] - 2026-10-27

### Added

- Added explicit Docker discovery through a restricted, authenticated collector or sanitized snapshot import.
- Added a review dialog for adding services or linking findings to existing services, with nothing selected initially and one-step undo.
- Added a Go server with embedded editor assets, discovery source proxying, and `healthcheck` and `collect` commands.

### Changed

- Saved projects now use schema version 5 with discovery bindings; schema versions 1 through 4 upgrade without changing existing inventory or manual layout.
- Container images now use a static Go binary and an optional isolated `discovery` Compose profile.
- The Go server now precompresses eligible embedded assets once and serves encoding-specific ETags with cache revalidation.

## [0.5.0] - 2026-10-25

### Added

- Added accessible visual pickers for device, service, and network logos.
- Added previewed PNG, JPG, WebP, and SVG uploads stored as reusable project PNGs.

### Changed

- Saved projects now use schema version 4 and embed uploaded assets for offline use and exports.
- Schema versions 1 through 3 now upgrade while preserving inventory, manual layouts, revisions, and existing network logo choices.

## [0.4.0] - 2026-10-25

### Added

- Added searchable primary and optional secondary logos for network nodes.
- Added 27 locally bundled marks for major US and European internet providers, including country and brand aliases.

### Changed

- Saved projects now use schema version 3. Schema-version-1 and schema-version-2 imports upgrade while preserving existing content and manual layouts.

## [0.3.0] - 2026-10-25

### Added

- Added Arrange mode for moving and resizing device cards with pointer, keyboard, numeric, grid, and alignment-guide controls.
- Added undoable **Auto layout** reset while preserving manual positions and sizes in saved projects and exports.

### Changed

- Saved projects now use schema version 2. Schema-version-1 imports upgrade automatically to automatic layout.

## [0.2.0] - 2026-10-25

### Changed

- Refined diagram typography, hardware facts, CPU badges, service groups, network cards, and multi-column layout.
- Reworked the editor with quieter controls, inventory search, focused canvas view, and a mobile inventory drawer.
- Combined SVG and PNG choices under **Export** while keeping editable JSON under **Save project**.
- Kept schema-version 1 project files compatible with the updated editor.

## [0.1.0] - 2026-10-25

### Added

- Editor for devices, hardware notes, grouped services, network nodes, VLAN chips, and connections.
- Automatic layouts with three diagram themes, two spacing options, and one to four columns.
- Browser autosave, multi-tab conflict handling, and checked JSON import/export.
- SVG and high-resolution PNG export with included local logos.
- Docker Compose deployment, a portable Python/static ZIP, and Linux AMD64 and ARM64 images on GHCR.
- Documentation for setup, editing, backups, privacy, troubleshooting, development, and the project format.

[0.1.0]: https://github.com/aiden0rchad/homelab-atlas/releases/tag/v0.1.0
[0.2.0]: https://github.com/aiden0rchad/homelab-atlas/releases/tag/v0.2.0
[0.3.0]: https://github.com/aiden0rchad/homelab-atlas/releases/tag/v0.3.0
[0.4.0]: https://github.com/aiden0rchad/homelab-atlas/releases/tag/v0.4.0
[0.5.0]: https://github.com/aiden0rchad/homelab-atlas/releases/tag/v0.5.0
[0.6.0]: https://github.com/aiden0rchad/homelab-atlas/releases/tag/v0.6.0
[0.7.0]: https://github.com/aiden0rchad/homelab-atlas/releases/tag/v0.7.0
[0.8.0]: https://github.com/aiden0rchad/homelab-atlas/releases/tag/v0.8.0
[0.9.0]: https://github.com/aiden0rchad/homelab-atlas/releases/tag/v0.9.0
[0.10.0]: https://github.com/aiden0rchad/homelab-atlas/releases/tag/v0.10.0
[0.11.0]: https://github.com/aiden0rchad/homelab-atlas/releases/tag/v0.11.0
[0.11.1]: https://github.com/aiden0rchad/homelab-atlas/releases/tag/v0.11.1
[0.12.0]: https://github.com/AuthorShin/homelab-atlas/releases/tag/v0.12.0
