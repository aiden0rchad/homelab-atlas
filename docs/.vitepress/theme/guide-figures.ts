type Rect = { x: number; y: number; width: number; height: number }
type Mark = {
  rect: Rect
  circle: [number, number]
  target: [number, number]
  caption: string
  accent?: boolean
}

type GuideFigure = {
  title: string
  description: string
  image: string
  imageWidth: number
  imageHeight: number
  crop: Rect
  circleRadius: number
  gutter: number
  arrowSize: number
  numberFontSize: number
  marks: Mark[]
}

const editorStyle = { circleRadius: 17, gutter: 42, arrowSize: 11, numberFontSize: 20 }
const dialogStyle = { circleRadius: 17, gutter: 42, arrowSize: 11, numberFontSize: 20 }

export const guideFigures = {
  editor: {
    title: 'Editor overview',
    description: 'The Atlas workspace with its inventory, inspector tabs, canvas controls, File menu, dashboard action, and Export action highlighted.',
    image: 'editor.jpg',
    imageWidth: 1080,
    imageHeight: 675,
    crop: { x: 0, y: 0, width: 1080, height: 675 },
    ...editorStyle,
    marks: [
      { rect: { x: 0, y: 47.65, width: 196.94, height: 600 }, circle: [210, 300], target: [196.94, 300], caption: 'Select a device or use Add in the inventory.' },
      { rect: { x: 815.56, y: 147.71, width: 251.74, height: 30.18 }, circle: [1104, 162.8], target: [1067.3, 162.8], caption: 'Use Details, Apps, and Layout for the selected device.' },
      { rect: { x: 480.04, y: 53.6, width: 78.47, height: 25.41 }, circle: [563.5, -20], target: [519.3, 53.6], caption: 'Arrange moves and resizes device cards without changing automatic output rules.' },
      { rect: { x: 127.44, y: 9.93, width: 45.08, height: 27 }, circle: [149.98, -20], target: [149.98, 9.93], caption: 'Open File to import, save, set a browser default, or start from the example.' },
      { rect: { x: 895.23, y: 9.93, width: 93.33, height: 27 }, circle: [941.9, -20], target: [941.9, 9.93], caption: 'Open the dashboard for a read-only tile view with service links.' },
      { rect: { x: 991.74, y: 9.93, width: 75.55, height: 27 }, circle: [1029.5, -20], target: [1029.5, 9.93], caption: 'Export a reviewed SVG or PNG image. Service links are not included.' },
    ],
  },
  'service-logos': {
    title: 'Add service logos',
    description: 'The service logo picker with search, selected tiles, upload, and Add selected controls highlighted.',
    image: 'service-logos.jpg',
    imageWidth: 1124,
    imageHeight: 720,
    crop: { x: 290, y: 58.8203125, width: 700, height: 602.3515625 },
    ...dialogStyle,
    marks: [
      { rect: { x: 311, y: 169.515625, width: 419.3984375, height: 31.9453125 }, circle: [266, 185.5], target: [311, 185.5], caption: 'Search bundled and uploaded logos.' },
      { rect: { x: 311, y: 237.171875, width: 658, height: 336 }, circle: [266, 405], target: [311, 405], caption: 'Jellyfin and Plex are manually selected here. Selections persist across searches.' },
      { rect: { x: 871.9609375, y: 167.4609375, width: 97.0390625, height: 34 }, circle: [1014, 184.5], target: [969, 184.5], caption: 'Upload PNG, JPG, WebP, or SVG up to 2 MB. Atlas stores it as PNG at up to 512px.' },
      { rect: { x: 860.359375, y: 606.171875, width: 108.640625, height: 34 }, circle: [1014, 623], target: [969, 623], caption: 'Add the selected services. Cancel leaves the project unchanged.' },
    ],
  },
  'private-export': {
    title: 'Review a private export',
    description: 'The export dialog with privacy toggle, custom terms, visible preview, and image formats highlighted.',
    image: 'private-export.jpg',
    imageWidth: 1124,
    imageHeight: 720,
    crop: { x: 190, y: 16, width: 900, height: 688 },
    ...dialogStyle,
    marks: [
      { rect: { x: 225, y: 151.8046875, width: 308.796875, height: 50.8359375 }, circle: [166, 177], target: [225, 177], caption: 'Keep Hide network details checked unless the image should include addresses.' },
      { rect: { x: 225, y: 273.4296875, width: 308.796875, height: 72.53125 }, circle: [166, 309.5], target: [225, 309.5], caption: 'Relay is listed as a literal custom term for this image.' },
      { rect: { x: 577.796875, y: 150.8046875, width: 477.203125, height: 448.1953125 }, circle: [1114, 375], target: [1055, 375], caption: 'Inspect the filtered preview. Text baked into logos is not filtered.' },
      { rect: { x: 211, y: 625, width: 858, height: 58 }, circle: [166, 654], target: [211, 654], caption: 'Download SVG or PNG. Editable project JSON remains separate and keeps the full project.' },
    ],
  },
} satisfies Record<string, GuideFigure>

export type GuideFigureName = keyof typeof guideFigures
