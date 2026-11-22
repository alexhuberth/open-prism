# Open-Prism

Espacio de trabajo de código abierto para escribir documentos en LaTeX con asistencia de IA (Google Gemini) y vista previa de PDF en tiempo real.

![Open-Prism Screenshot](./assets/OpenPrism.png)

## Funcionalidades

- **Asistencia con IA (Google Gemini 4 Hydrogen)** - Integrado con `assistant-ui` y `@ai-sdk/google` para redactar, corregir y editar LaTeX directamente en tu documento
- **Vista previa de PDF en tiempo real** - Compilación en vivo con `pdflatex` y visualización con `react-pdf`
- **Editor CodeMirror** - Resaltado de sintaxis y soporte para LaTeX
- **Almacenamiento local** - Documentos guardados automáticamente en el IndexedDB del navegador
- **Tema claro/oscuro** - Cambio automático según el sistema o manual desde la barra lateral

## Requisitos previos

- **Node.js 26 LTS** (por ejemplo `26.13.x`)
- **pnpm 10+**
- **Docker** (recomendado para ejecutar `apps/latex-api` con TeX Live) o **TeX Live** instalado localmente

## Inicio rápido

```bash
# 1. Clonar el repositorio
git clone https://github.com/alexhuberth/open-prism.git
cd open-prism

# 2. Instalar dependencias
pnpm install

# 3. Copiar las variables de entorno
cp apps/web/.env.example apps/web/.env.local
```

Configura tus variables en `apps/web/.env.local`:

- `GOOGLE_GENERATIVE_AI_API_KEY`: Tu API key de Google AI Studio / Gemini (necesaria para el asistente de IA)
- `LATEX_API_URL`: URL del servicio de compilación LaTeX (por defecto `http://localhost:3001`)
- `UPSTASH_REDIS_REST_URL` *(opcional)*: URL de Upstash Redis para control de límite de peticiones
- `UPSTASH_REDIS_REST_TOKEN` *(opcional)*: Token de Upstash Redis

### Levantar el servicio de compilación LaTeX (Docker)

```bash
docker build -t open-prism-latex-api apps/latex-api
docker run -d --restart unless-stopped --name open-prism-latex-api -p 3001:3001 open-prism-latex-api
```

*(En macOS, si el comando `docker` no aparece en tu `PATH`, puedes usar `/Applications/Docker.app/Contents/Resources/bin/docker`).*

### Iniciar la aplicación web

```bash
pnpm dev:web
```

Luego abre `http://localhost:3000` en tu navegador.

## Estructura del proyecto

```
open-prism/
├── apps/
│   ├── web/          # Aplicación frontend en Next.js 16 (interfaz en español latinoamericano)
│   └── latex-api/    # API de compilación LaTeX (Hono + TeX Live)
├── packages/         # Paquetes compartidos (si aplica)
├── biome.json        # Configuración de linter y formateo con Biome
└── turbo.json        # Configuración de Turborepo
```

### apps/web

Aplicación Next.js 16 con:
- `assistant-ui` + `@ai-sdk/google` (`gemini-4-hydrogen`) para el chat de IA
- CodeMirror para edición en LaTeX
- `react-pdf` para la vista previa de PDF
- Upstash Redis (opcional) para límite de peticiones

### apps/latex-api

API basada en Hono para compilar LaTeX:
- Recibe el código fuente y archivos adjuntos (`.tex`, imágenes, `.bib`)
- Compila usando TeX Live (`pdflatex` / `xelatex` / `lualatex` y `bibtex`)
- Devuelve el PDF compilado

Para desarrollo local sin Docker (requiere TeX Live instalado en tu sistema):

```bash
cd apps/latex-api
pnpm dev
```

## Despliegue

### Web App (Vercel)

1. Importa el repositorio en Vercel
2. Define el directorio raíz en `apps/web`
3. Configura las variables de entorno:
   - `GOOGLE_GENERATIVE_AI_API_KEY`
   - `LATEX_API_URL`
   - `UPSTASH_REDIS_REST_URL` *(opcional)*
   - `UPSTASH_REDIS_REST_TOKEN` *(opcional)*

### LaTeX API (Docker)

```bash
cd apps/latex-api
docker build -t open-prism-latex-api .
docker run -p 3001:3001 open-prism-latex-api
```

## Contribuir

Consulta [CONTRIBUTING.md](./CONTRIBUTING.md) para ver la guía de desarrollo y contribución.

## Licencia

[MIT](./LICENSE)
