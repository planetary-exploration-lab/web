# PXL logo

The PXL badge was designed by Snigdha Nellutla for the lab and is used with permission.

## Files

- `pxl-logo-2tone.svg` is the source. It has two layers, the badge silhouette (`.paper`) and the line art (`.ink`). Their colors come from `--logo-paper` and `--logo-ink`.
- `pxl-logo-mono.svg` is a single layer in `currentColor`.

Both were traced with potrace from the original raster (a 730 × 800 JPEG inside `pxl.pdf`), scaled up 4× and thresholded at 50%.

## Colors

| Option | Paper | Ink | Use |
|---|---|---|---|
| D, gold (site default) | `#DEBD88` light gold | `#051E39` GT navy | header, tab icon, link-preview card |
| C, white (alternative) | `#FFFFFF` | `#051E39` GT navy | kept ready; switch in `scripts/make_brand_assets.mjs` and `src/layouts/Base.astro` |

`node scripts/make_brand_assets.mjs` writes the served files:

- `public/logo/pxl-logo-{gold,white}.svg`
- `public/favicon.svg`
- `public/favicon-32.png`
- `public/apple-touch-icon.png`
- `public/og.png`

Photo placeholders on the people page keep the plain hexagon mark (`src/components/Hexagon.astro`).
