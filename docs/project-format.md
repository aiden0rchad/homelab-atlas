# Project format

**File → Save project** downloads schema-version-8 JSON. **File → Import project** accepts schema versions 1 through 7 after strict validation. Version 1 gains automatic layout, versions 1 and 2 gain empty network-logo fields, versions 1 through 3 gain an empty `customLogos` array, versions 5 and 6 lose their discovery data, and version 7 gains an empty `favicon`. A schema-5 project that already has valid service links keeps them; other older services gain an empty `link`. A schema-7 project keeps its service links. Older Atlas versions cannot open schema version 8.

## Top-level fields

| Field | Type | Meaning |
|---|---|---|
| `schemaVersion` | integer | Must be `8` |
| `revision` | integer | Browser conflict/change revision, from 0 through 1,000,000,000 |
| `title`, `subtitle` | string | Diagram heading text, at most 120 characters each |
| `theme` | string | `navy`, `light`, or `midnight` |
| `columns` | integer | Device layout columns, 1–4 |
| `density` | string | `comfortable` or `compact` |
| `favicon` | string | Empty, or a stored PNG browser-tab icon |
| `layout` | object | Device-card layout mode and saved rectangles |
| `customLogos` | array | Uploaded PNG assets stored with the project |
| `networks` | array | Network node records |
| `vlans` | array | VLAN chip records |
| `devices` | array | Device cards, hardware facts, groups, and services |
| `connections` | array | Directed logical relationships between network/device endpoints |

Schema version 8 has no `discovery` field. A version-8 file containing one is rejected as an unknown key.

## Record fields

| Record | Exact fields |
|---|---|
| Network | `id`, `name`, `kind`, `accent`, `icon`, `secondaryIcon` |
| VLAN | `id`, `name`, `color` |
| Device | `id`, `name`, `role`, `icon`, `accent`, `network`, `hardware`, `groups` |
| Group | `id`, `name`, `services` |
| Service | `id`, `logo`, `name`, `count`, `link` |
| Connection | `id`, `from`, `to`, `label` |
| Layout | `mode`, `cards` |
| Layout card | `id`, `x`, `y`, `w`, `h` |
| Custom logo | `id`, `label`, `dataUrl`, `background` |

Colors use six-digit hexadecimal values such as `#55d6c9`. A device `icon`, service `logo`, or nonempty network logo field must exist in the bundled catalog or `customLogos`. An empty network `icon` selects the automatic kind-based mark; an empty `secondaryIcon` means no secondary mark. A service `count` must be an integer from 1 through 99.

## Service links

Every service has a `link` field. Use an empty string when the service has no link. Otherwise it must be a complete `http://` or `https://` URL no longer than 2,048 characters and containing no whitespace. The URL must include a hostname. Links such as `ftp://`, `javascript:`, relative paths, and bare hostnames are rejected.

Links appear only on the [dashboard](/dashboard). They are not rendered into SVG or PNG exports. They are stored in saved JSON and browser storage, so treat a project file as private when it contains internal service URLs.

## Migration

Imports are validated in their original schema before migration, then validated again as schema version 8. The current project stays open if any step fails.

| Old schema | Migration |
|---|---|
| 1 | Add `layout` with automatic mode and no saved cards |
| 1–2 | Add empty network `icon` and `secondaryIcon` fields |
| 1–3 | Add an empty `customLogos` array |
| 5–6 | Remove `discovery`; add empty service links except for valid schema-5 links, which are kept |
| 7 | Add an empty `favicon`; keep service links |
| 8 | No migration; the file must already match this schema |

Schema-5 projects came in two variants: upstream projects with discovery data and fork projects with service links. Both are accepted. Discovery bindings are validated before they are discarded, so malformed legacy data does not silently pass. Raw discovery snapshots were never stored in the project.

## Custom logos

Custom logo IDs start with `custom-` and use the same safe ASCII ID characters, with a total limit of 64 characters. Labels are trimmed, nonempty text up to 120 characters. `background` is `none`, `light`, or `dark`. `dataUrl` is a canonical `data:image/png;base64,...` value. Raw SVG, remote URLs, blob URLs, extra fields, duplicates, and IDs colliding with catalog or project records are rejected.

## Favicon

The optional project favicon is uploaded from **Diagram settings → Appearance → Upload favicon**. Atlas accepts PNG, JPG, WebP, SVG, or ICO files up to 2 MB, 4096px per side, and 16 million pixels. It converts the image to a square PNG with a maximum side of 128px and stores the canonical data URL in `favicon`. Leave the field empty to use the default Atlas mark. Favicons are shown in the editor and dashboard browser tabs, are part of saved JSON, and are never rendered into SVG or PNG diagrams.

## IDs and references

Every network, VLAN, device, group, service, and connection needs a unique ID across the whole project. IDs must match:

```text
^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$
```

Connection `from` and `to` values must point to two different existing network or device IDs. VLAN, group, and service IDs cannot be used as connection endpoints.

## Device layout

`layout.mode` is `auto` or `manual`. Automatic layout requires an empty `cards` array. Each manual card ID references one existing device, with no duplicates. A device may be omitted; Atlas places it below the saved cards until its position is saved.

Coordinates are integer diagram units relative to the upper-left of the device region, not browser pixels. `x` and `y` range from 0 through 100,000. Width ranges from 240 through 100,000 and height from 100 through 100,000. Atlas clamps cards to the poster width and treats the rendered content height as the effective minimum.

## Limits

| Item | Limit |
|---|---:|
| UTF-8 import file | 2,000,000 bytes |
| Any text field | 120 characters |
| Service link | 2,048 characters |
| Devices | 80 |
| Network nodes | 30 |
| VLAN chips | 30 |
| Connections | 160 |
| Service groups, total | 160 |
| Services, total | 800 |
| Hardware facts per device | 12 |
| Manual card rectangles | No more than the device count |
| Custom logos | 32 |
| Original upload | 2,000,000 bytes; 4096px per side; 16,000,000 pixels |
| Stored custom PNG | 512px per side; 200,000 data-URL characters |
| Custom data URLs, total | 1,200,000 characters |
| Stored favicon PNG | 128px per side; 120,000 data-URL characters |

The group limit applies to each device array and to the whole project. Each object only accepts the keys listed above. Extra fields are rejected rather than preserved.

## Minimal valid project

```json
{
  "schemaVersion": 8,
  "revision": 1,
  "title": "Small Lab",
  "subtitle": "Fictional example",
  "theme": "navy",
  "columns": 1,
  "density": "comfortable",
  "favicon": "",
  "layout": {
    "mode": "auto",
    "cards": []
  },
  "customLogos": [],
  "networks": [],
  "vlans": [],
  "devices": [],
  "connections": []
}
```

For a full example with every record type, see [`docs/example.json` on GitHub](https://github.com/AuthorShin/homelab-atlas/blob/main/docs/example.json). Atlas does not have a separate schema file or a project API endpoint.
