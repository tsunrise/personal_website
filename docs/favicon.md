# Landscape favicon

The active icon is a pale full moon above two blue mountain ridges, using the landscape's dusk palette. Large silhouettes preserve legibility at browser-tab sizes; restrained pigment texture appears at home-screen sizes.

Source: `src/images/moon-favicon.png`, generated with the built-in ImageGen tool. PNG exports use Lanczos downsampling without cropping or changing the artwork. The opaque, edge-to-edge artwork lets home-screen platforms apply their own corner masks.

Active files in `public/`:

- `favicon.ico`: 16, 24, 32, 48, and 64 px.
- `favicon-16x16.png` and `favicon-32x32.png`: browser-tab PNGs.
- `apple-touch-icon.png`: 180 px.
- `android-chrome-192x192.png` and `android-chrome-512x512.png`: web app icons.

`public/index.html` and `public/manifest.json` reference these filenames. The standard icon filenames contain the moon artwork; superseded bubble-logo assets and duplicate moon-suffixed files have been removed.

## Generation prompt

Use case: logo-brand.
Asset type: production favicon and home-screen icon for Tom Shen's personal website, a quiet interactive ink-wash landscape with a draggable full moon, hazy blue mountains, reeds, a willow and a stone garden bridge.
Create one exquisite, extremely simple square icon that distills that landscape to a large pale ivory-sage FULL MOON above TWO softly flowing mountain silhouettes. Think a miniature Japanese woodblock print, restrained and contemporary, tranquil and sophisticated.
Composition: edge-to-edge square artwork, no outside margin. A beautifully round full moon about 42% of the image width, centered slightly right and above center, fully separated from the mountains. The lower 35% contains just two broad, overlapping, gently asymmetric mountain ridgelines; use low, rounded natural forms, not triangular peaks. Generous quiet sky. The moon and broad silhouettes must remain instantly legible when reduced to 16 by 16 pixels.
Palette from the website: deep dusk slate blue #526f95 sky, dusty blue #87a5b8 distant ridge, deep river teal #345e70 foreground, luminous pale ivory/sage #e4ead8 moon. Clear tonal separation. Subtle soft pigment variation at large size only, crisp clean large-form edges. Flat print-like drawing, very restrained painterly texture.
Constraints: opaque square background reaching every edge; no inset tile, no rounded corners, no outer frame, no outline, no drop shadow, no gloss, no 3D. No text, initials, lettering, stars, crescent, clouds, trees, bridge, tiny details, watermark, presentation layout or mockup. Deliver only the single finished icon.
