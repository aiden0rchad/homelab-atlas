# Editor guide

You enter your devices and services, and Atlas starts with an automatic layout. You can arrange device cards yourself when you need a specific composition. The same project also powers a read-only [dashboard](/dashboard) with clickable service links.

<GuideFigure name="editor" />

## Start from a sample or empty project

Open **File** and choose **Load example** to replace the current project with the included fictional sample, or **Start empty** for a blank project. Atlas asks before doing either one, and you can undo it until you reload the page. **Import project** opens editable JSON, and **Save project** downloads a JSON backup. **Save as browser default** stores the current project as the fallback for this browser origin, and **Clear browser default** removes it. See [Dashboard and browser default](/dashboard).

## Add and organize devices

Choose **Add device** in the inventory on the left, then pick a template such as Server, NAS, Hypervisor, Media server, AI server, Raspberry Pi, or Cloud server. The Router, Switch, Wi-Fi, and Internet templates add network nodes instead of device cards.

Use **Search inventory** to filter devices by name or role and network nodes by name or kind. It only changes the visible list. Your selection and project stay intact. On a narrow screen, open or close the inventory with the **Inventory** button in the canvas header.

Select a network node to edit its name, kind, accent, and logos. **Logo** starts on Auto, which follows the node kind. **Secondary logo** can show an optional backup provider in the same node. Both selectors include the bundled catalog and uploaded project logos. Choosing Auto or None clears the corresponding explicit choice.

Select a device to open its inspector:

- **Details** covers identity, the **Network / VLAN** label, device icon, and hardware facts
- **Apps** covers named service groups and their services
- **Layout** covers exact X, Y, Width, and Height position fields

The duplicate button copies a device and gives the copy new internal IDs. Use the arrow buttons to reorder devices or services. Deleting a device or network node also deletes its connections.

## Add service tiles

Open the device inspector's **Apps** tab and add a service group. The group-level **Apps** button opens the Add services flow, where you can search the logo catalog and select more than one service. Selections stay checked across searches. Click the logo beside an existing service to replace it without changing its name, count, ID, or position.

<GuideFigure name="service-logos" />

Choose **Upload logo** in any picker to add a PNG, JPG, WebP, or SVG file up to 2 MB. Check the preview, edit its name, and choose a transparent, light, or dark background. SVG is converted to PNG, and stored images are at most 512px. Uploaded logos appear first under **Uploaded** and can be reused throughout the project. In the multi-service picker, uploaded drafts are only saved when selected services are added. Cancel leaves the project unchanged.

You can change a service name and set its instance count from 1 through 99. **Add custom service** still adds a named tile with the included generic icon.

Groups with one or two services use readable horizontal rows. Groups with three or four services use a compact icon grid, and larger groups use a denser grid. Atlas keeps the service order you set.

## Service links

Each service can have an optional link in the device inspector's **Apps** tab. Leave the field empty for no link, or enter a complete URL beginning with `http://` or `https://`. Links are limited to 2,048 characters and cannot contain spaces. Invalid values are rejected when you leave the field.

Links are used only by the [dashboard](/dashboard). They are stored in project JSON and browser storage, and they are deliberately omitted from SVG and PNG exports. Atlas does not check whether a link is reachable or open it in the background.

## Dashboard and browser default

Choose **Dashboard** in the top bar, or open `/dashboard`, for a read-only view of the project saved in this browser. Linked service tiles open in a new tab. The dashboard falls back to the browser default when no autosaved project exists, then to the included example. See [Dashboard and browser default](/dashboard) for details.

Use **File → Save as browser default** to make the current project the starting point for this browser origin. The default is stored separately from autosave. When you open Atlas and no autosaved project exists, the default loads without immediately creating an autosave; your first edit does. **Clear browser default** removes it without changing the project currently open in the tab.

## Appearance

Choose **Diagram settings** in the canvas header to change:

- project subtitle
- Navy, Light, or Midnight diagram theme
- 1–4 columns
- Comfortable or Compact density
- browser tab icon
- VLAN chip names and colors

Use **Upload favicon** to give this project its own browser-tab icon. Atlas accepts PNG, JPG, WebP, SVG, or ICO files up to 2 MB and stores a square PNG up to 128px in the project. **Remove** restores the default Atlas mark. The favicon appears in the editor and dashboard tabs and is not drawn into SVG or PNG exports.

The project title is in the top bar. These settings change your diagram. They are separate from the light/dark switch on this documentation site.

## Preview and layout

Use zoom, **Fit page**, or **Fit width** at the bottom left of the canvas to adjust the preview. You can select devices and network nodes in the preview with a pointer or keyboard.

**Focus canvas** at the bottom right hides the inventory and inspector. Select a card or press `Escape` to leave focus view. On mobile, opening **Inventory** also leaves focus view so the drawer is visible.

Automatic layout uses inventory order, column count, content length, and density. Choose **Arrange** in the canvas header to move or resize device cards without moving network nodes or VLANs. Drag a card to move it or use its lower-right handle to resize it. Movement snaps to an 8-unit grid, nearby card edges and centers, and a 24-unit vertical gap. Hold `Alt` while dragging to bypass snapping.

With a card selected in Arrange mode, arrow keys move it by 8 units and `Shift` increases that to 32. `Alt` plus an arrow resizes it. The device inspector's **Layout** tab accepts exact X, Y, Width, and Height values.

**Columns** still controls the poster width. Cards stay inside that width, and their minimum height grows when their hardware or services need more room. A larger height adds whitespace. New or duplicated devices appear below existing manually placed cards. **Auto layout** in the canvas header clears all saved card rectangles; use **Undo** if you change your mind.

Manual positions are part of the project JSON and appear in SVG and PNG exports. Arrange handles, selection outlines, and alignment guides are editor-only.

## Undo and redo

Use the top-bar buttons or:

- Undo: `Ctrl+Z` on Windows/Linux, `Command+Z` on macOS
- Redo: `Ctrl+Shift+Z` on Windows/Linux, `Command+Shift+Z` on macOS

These shortcuts do not run while you are typing in a field. Undo history only lasts for the current page session, and reloading clears it. Read [sharing and backup](/sharing) before importing a project or updating Atlas.
