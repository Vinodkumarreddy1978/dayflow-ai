# App icons

These three PNG files are referenced by `public/manifest.webmanifest`, and
`icon-192.png` is also the icon and the badge for every push notification sent by
`public/sw.js`.

| File                    | Size    | Purpose                              |
| ----------------------- | ------- | ------------------------------------ |
| `icon-192.png`          | 192×192 | Home screen icon, notification badge |
| `icon-512.png`          | 512×512 | Splash screen and app listings       |
| `icon-maskable-512.png` | 512×512 | Android adaptive icon                |

## Regenerating them

```bash
npm run icons:generate
```

`scripts/generate-icons.mjs` draws all three from one description and writes them
here, overwriting whatever is present. They are generated rather than drawn by
hand so that the accent `#4f46e5` and background `#f8fafc` stay the product's own
colours: change them in the script and re-run, rather than editing a binary
nobody can review.

The mark is a dial two thirds elapsed - the same shape the analytics screens use -
in white on the accent. The two `any` icons are a rounded tile; the maskable one
fills its canvas and keeps the dial inside the central 80%, because Android crops
that icon to whatever shape the launcher uses and artwork reaching the edges gets
its corners cut off.

If you would rather start from artwork of your own, a generator such as
[realfavicongenerator.net](https://realfavicongenerator.net) or
[maskable.app](https://maskable.app) will produce the same three files from a
single square source image. Keep the filenames, or update the manifest and
`public/sw.js` to match.
