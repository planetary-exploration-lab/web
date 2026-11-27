# Images

How to add images so pages load fast, stay accessible, and leak nothing.

## Vector or raster?

| Use | Format | Why |
| --- | --- | --- |
| Logos, icons, simple diagrams drawn as shapes | SVG | Sharp at any size, tiny files |
| Photos, renders, microscopy, maps | Raster (WebP) via `prepare_images.mjs --kind photo` | Vectors cannot hold photographic detail |
| Diagrams, charts or screenshots that only exist as PNG/JPEG | Raster via `--kind graphic` | Keeps text and thin lines crisp |

SVG rules: no `<script>`, no event attributes (`onload=`), no `<foreignObject>`, no external references
(fonts, images or styles from other sites). `npm run check:private` fails on these. Export "plain SVG" from
Illustrator or Inkscape, or run it through SVGO.

## Preparing raster images

```sh
node scripts/prepare_images.mjs --kind photo   --out src/assets/projects  ~/Desktop/field-site.jpg
node scripts/prepare_images.mjs --kind graphic --out src/assets/projects --name beacon-orbit orbit.png
```

The script auto-rotates, converts to sRGB, limits the long edge (2000 px photos, 2400 px graphics), encodes
WebP, and strips all metadata (EXIF, GPS location, camera serial, XMP). Keep each source file under 500 KB;
the script warns above that. `npm run check:private` also fails on any committed image with EXIF or XMP
data, or over 1.5 MB.

You do not need to make small versions. At build time Astro's `<Image>` makes several widths, serves the
right one for each screen (`srcset`/`sizes`), sets width and height so the page does not jump, and
lazy-loads images below the fold.

## Where images go

- Project images: `src/assets/projects/<project-id>-<n>.webp`, referenced from the project's front matter.
- People photos: only in `web-private/photos/`, never in this repo. Process them the same way first.
- Files in `public/` are served as-is with no optimization. Avoid it for images.

## Alt text (required)

Every image needs `alt` in the content file; the build fails without it. Describe what the image shows and
why it is there, in one or two sentences. For diagrams, state the main point, and put detail in a caption
or the body text. Use `decorative: true` (empty alt) only for images that add nothing, such as a background
texture. Do not start with "Image of".
