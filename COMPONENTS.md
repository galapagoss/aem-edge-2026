# Guía de Desarrollo de Componentes

Este documento describe el proceso y estándares para crear componentes (bloques) en este proyecto AEM Edge Delivery.

## Estructura de un Componente

Cada componente debe crearse en su propia carpeta dentro de `blocks/`:

```
blocks/{nombre-componente}/
├── {nombre-componente}.js       # Lógica de decoración del bloque
├── {nombre-componente}.css      # Estilos del bloque
└── _{nombre-componente}.json    # Definición del modelo para Universal Editor
```

## 1. JavaScript (blocks/{nombre}/{nombre}.js)

### Patrón base:

```javascript
import { createOptimizedPicture } from '../../scripts/aem.js';

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default async function decorate(block) {
  // 1. Extraer contenido del DOM
  const rows = [...block.children];

  // 2. Transformar el DOM según el diseño
  // - Crear nuevos elementos
  // - Mover contenido existente
  // - Añadir clases CSS

  // 3. Optimizar imágenes si las hay
  block.querySelectorAll('picture > img').forEach((img) => {
    const optimizedPic = createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }]);
    img.closest('picture').replaceWith(optimizedPic);
  });
}
```

### Principios:

- **Extraer, no asumir**: El contenido viene del CMS en una estructura de filas/divs. Usa `console.log(block.innerHTML)` para inspeccionar.
- **Manejar casos opcionales**: Los autores pueden omitir campos. Verifica existencia antes de acceder.
- **Usar `createOptimizedPicture`**: Para todas las imágenes, usa la utilidad de `aem.js`.
- **Scope de selectores**: Todas las clases CSS deben estar scoped al bloque (ej: `.hero .title`, no solo `.title`).

## 2. CSS (blocks/{nombre}/{nombre}.css)

### Patrón base:

```css
/* Mobile first - estilos base */
.{nombre} {
  /* estilos base */
}

.{nombre} .{nombre}-title {
  /* estilos del título */
}

/* Tablet breakpoint */
@media (width >= 600px) {
  .{nombre} {
    /* ajustes tablet */
  }
}

/* Desktop breakpoint */
@media (width >= 900px) {
  .{nombre} {
    /* ajustes desktop */
  }
}

/* Large desktop */
@media (width >= 1200px) {
  .{nombre} {
    /* ajustes large desktop */
  }
}
```

### Reglas:

- **Mobile first**: Siempre empezar con estilos base para móvil.
- **Breakpoints estándar**: 600px, 900px, 1200px.
- **Selectores scoped**: Nunca usar selectores globales. Siempre prefix con `.{nombre}`.
- **Variables CSS**: Usar las variables del proyecto (`--link-color`, `--background-color`, etc.).
- **Evitar**: `rgba()`, usar `rgb()` con notación moderna.

## 3. Modelo JSON (blocks/{nombre}/_{nombre}.json)

Define la estructura para el Universal Editor:

```json
{
  "definitions": [
    {
      "title": "Nombre Componente",
      "id": "nombre",
      "plugins": {
        "xwalk": {
          "page": {
            "resourceType": "core/franklin/components/block/v1/block",
            "template": {
              "name": "Nombre Componente",
              "model": "nombre"
            }
          }
        }
      }
    }
  ],
  "models": [
    {
      "id": "nombre",
      "fields": [
        {
          "component": "text",
          "valueType": "string",
          "name": "title",
          "label": "Title"
        },
        {
          "component": "richtext",
          "name": "body",
          "label": "Body Text",
          "valueType": "string"
        },
        {
          "component": "image",
          "name": "image",
          "label": "Image",
          "valueType": "object"
        },
        {
          "component": "button",
          "name": "cta",
          "label": "CTA Button",
          "valueType": "object"
        }
      ]
    }
  ],
  "filters": []
}
```

### Tipos de campos comunes:

- `text`: Texto simple (títulos, headings)
- `richtext`: Contenido HTML enriquecido
- `image`: Imagen con soporte para alt text
- `button`: Enlace/botón con texto y URL
- `reference`: Referencia a otra página/asset
- `multiselect`: Selección múltiple

## 4. Flujo de Trabajo

### Crear un nuevo componente:

1. **Crear archivos**: Crear la carpeta y los 3 archivos base.

2. **Desarrollar JS/CSS**: Implementar la lógica y estilos.

3. **Crear archivo de prueba**:
   ```bash
   mkdir -p drafts
   # Crear drafts/mi-componente.plain.html con markup de ejemplo
   ```

4. **Iniciar servidor**:
   ```bash
   npx -y @adobe/aem-cli up --html-folder drafts
   ```

5. **Probar**: Acceder a `http://localhost:3000/drafts/mi-componente`

6. **Linting**:
   ```bash
   npm run lint
   npm run lint:fix  # auto-corregir
   ```

7. **Reconstruir JSON** (si se modificó el modelo):
   ```bash
   npm run build:json
   ```

## 5. Estructura HTML Esperada

El CMS entrega el bloque con esta estructura base:

```html
<div class="{nombre}">
  <div>
    <div><!-- contenido campo 1 --></div>
  </div>
  <div>
    <div><!-- contenido campo 2 --></div>
  </div>
  <!-- ... más filas según campos -->
</div>
```

El JavaScript debe transformar esto al DOM final deseado.

## 6. Testing Local

### Archivo de prueba básico (drafts/ejemplo.plain.html):

```html
<!DOCTYPE html>
<html>
<head>
  <title>Test</title>
  <link rel="stylesheet" href="/styles/styles.css">
</head>
<body>
  <header></header>
  <main>
    <div>
      <div class="mi-componente">
        <div><div><!-- contenido --></div></div>
        <div><div><!-- contenido --></div></div>
      </div>
    </div>
  </main>
  <footer></footer>
  <script type="module" src="/scripts/scripts.js"></script>
</body>
</html>
```

## Variantes de Banner

El banner soporta las siguientes variantes (clases CSS):

| Variante | Descripción | Uso |
|----------|-------------|-----|
| `small` | Compacto (150-200px) | Avisos cortos |
| `large` | Prominente (400-600px) | Contenido destacado |
| `hero` | 80% viewport height | Landing pages |
| `left-aligned` | Contenido a la izquierda | Layouts asimétricos |
| `right-aligned` | Contenido a la derecha | Layouts asimétricos |
| `no-overlay` | Sin oscurecimiento de imagen | Imágenes claras |
| `rounded-none` | Esquinas cuadradas | Estilo moderno |
| `rounded-sm` | Esquinas ligeramente redondeadas (8px) | Subtle |
| `rounded-full` | Forma de píldora | Estilo único |

### Uso en el CMS

En el campo "Banner Style" del Universal Editor, seleccionar la variante deseada.

### Uso en HTML local

Añadir una fila con el nombre de la variante antes del contenido:

```html
<div class="banner">
  <div>small</div>  <!-- Aplica clase .small -->
  <div>
    <h2>Título</h2>
    <p>Contenido...</p>
  </div>
</div>
```

## 7. Checklist antes de commitear

- [ ] JavaScript sigue el patrón de export default
- [ ] CSS usa selectores scoped al bloque
- [ ] CSS es mobile-first con breakpoints correctos
- [ ] `npm run lint` pasa sin errores
- [ ] `npm run build:json` ejecutado (si hay cambios en modelos)
- [ ] Archivo de prueba funciona localmente
- [ ] Imágenes usan `createOptimizedPicture`
- [ ] Manejo de casos opcionales (campos vacíos)

## 8. Ejemplos de Referencia

Ver bloques existentes para patrones:

- **cards**: Múltiples items, imágenes optimizadas
- **hero**: Imagen de fondo, overlay, texto centrado
- **banner**: Combinación de imagen + contenido + CTA

## 9. Recursos

- Documentación AEM: https://www.aem.live/developer/markup-sections-blocks
- Ejemplos de modelos: https://github.com/adobe-rnd/aem-boilerplate-xwalk/pulls?q=is%3Aopen+is%3Apr+label%3AExample
- Buscar en docs: `curl -s https://www.aem.live/docpages-index.json | jq -r '.data[] | select(.content | test("KEYWORD"; "i")) | "\(.path): \(.title)"'`
