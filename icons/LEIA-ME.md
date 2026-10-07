# Ícones Meridian Performance Hub

Gerados a partir do logo original (geometria extraída do PNG de 5000 px, redesenhada em SVG vetorial).
Cor de fundo dos ícones: `#111A2E` (navy do logo).

## Qual arquivo usar onde

| Arquivo | Uso |
|---|---|
| `icon-192.png`, `icon-512.png` | Manifest do PWA, `purpose: any` |
| `icon-maskable-192.png`, `icon-maskable-512.png` | Manifest do PWA, `purpose: maskable` (conteúdo dentro da zona segura de 80%) |
| `apple-touch-icon.png` (180) | iPhone/iPad: ícone da tela inicial. O iOS ignora o manifest para isso e exige fundo opaco |
| `favicon.svg`, `favicon.ico`, `favicon-16/32/48.png` | Aba do navegador (site e app) |
| `icon-mono-512.png` | Opcional: `purpose: monochrome` (Android recolore) |
| `meridian-icon.svg` | Fonte vetorial do ícone padrão |
| `meridian-icon-maskable.svg` | Fonte vetorial do maskable |
| `meridian-icon-m.svg`, `icon-m-512.png` | Só o M, sem anel: alternativa mais legível em tamanho pequeno |
| `meridian-icon-gold.svg`, `icon-gold-512.png` | Variação dourada (paleta do Hub), opcional |
| `meridian-logo-transparent.svg`, `logo-transparent-1024.png` | Logo sem fundo para cabeçalhos em fundo escuro |
| `meridian-icon-mono.svg` | Versão branca sem fundo |
| `meridian-icon-1024.png` | Master em PNG (loja de apps no futuro) |

## Trecho do `<head>`

```html
<link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/icons/favicon.ico" sizes="16x16 32x32 48x48">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="theme-color" content="#111A2E">
```

## Trecho do `manifest`

```json
"background_color": "#111A2E",
"theme_color": "#111A2E",
"icons": [
  { "src": "/icons/icon-192.png",          "sizes": "192x192", "type": "image/png", "purpose": "any" },
  { "src": "/icons/icon-512.png",          "sizes": "512x512", "type": "image/png", "purpose": "any" },
  { "src": "/icons/icon-maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
  { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" },
  { "src": "/icons/icon-mono-512.png",     "sizes": "512x512", "type": "image/png", "purpose": "monochrome" }
]
```

Mantenha `any` e `maskable` em entradas separadas (não use `"any maskable"` junto).
