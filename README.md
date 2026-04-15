# GYOSEI MEDICAL — JIN:R Child Theme

Prestige × Modern brushup for [gyosei-medical.com](https://gyosei-medical.com/).
Child theme of JIN:R (parent). Overrides typography, color, and layout while leaving parent functionality intact.

## Palette

| Token | Hex | Use |
| --- | --- | --- |
| `--gm-navy` | `#0A1F3D` | Primary, headings, footer |
| `--gm-gold` | `#B8935A` | Accent, hairlines, hover |
| `--gm-forest` | `#1F4D3A` | Medical accent |
| `--gm-ivory` | `#FAF7F1` | Page background |
| `--gm-ink` | `#141720` | Body text |

## Typography

- Headings (JP): Shippori Mincho B1
- Headings (Latin): Cormorant Garamond
- Body: Noto Sans JP

## Structure

```
gyosei-medical/
  style.css            child theme header
  functions.php        enqueue parent + brushup assets
  assets/
    css/brushup.css    full visual override
    js/brushup.js      scroll reveal
```

## Deploy

Path on XServer: `~/gyosei-medical.com/public_html/wp-content/themes/jinr-gyosei/`

```bash
ssh xserver-xagm
cd ~/gyosei-medical.com/public_html/wp-content/themes/
git clone https://github.com/nishida-coder/gyosei-medical.git jinr-gyosei
# Then activate via WP admin → Appearance → Themes
```

To update after a push:

```bash
ssh xserver-xagm "cd ~/gyosei-medical.com/public_html/wp-content/themes/jinr-gyosei && git pull"
```
