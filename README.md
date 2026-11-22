# Open-Prism

Espacio de trabajo de código abierto para escribir documentos en LaTeX con asistencia de IA (Google Gemini) y vista previa de PDF en tiempo real.

![Open-Prism Screenshot](./assets/OpenPrism.png)

## Funcionalidades

- **Gestor de múltiples proyectos** - Crea proyectos desde plantillas (*Documento en blanco*, *Artículo científico*, *Tesis / Libro modular*, *Presentación Beamer* o *Documento de ejemplo*), fíjalos, ordénalos por fecha o nombre, renómbralos, duplícalos o elimínalos
- **Carpetas, archivos `.zip` y árbol jerárquico** - Sube archivos sueltos, carpetas completas o paquetes `.zip`, organiza subcarpetas, marca el archivo `.tex` principal y exporta tu proyecto como `.zip`
- **Preparado para libros de 100+ páginas y tesis modulares** - Visor PDF virtualizado con salto rápido por página (`Pág. X / N`), esquema global siguiendo `\input{}`/`\include{}`, buscador en todo el proyecto (`Ctrl/Cmd+Shift+F`), contador de palabras e importador automático de citas por **DOI / arXiv** hacia `.bib`
- **Revisión de cambios (Diff) antes de compilar** - Visualiza línea por línea las propuestas de edición de la IA con opciones de **Rechazar**, **Aceptar** o **Aceptar y compilar**
- **Diagnóstico, advertencias y log completo** - Visor de advertencias navegables (`Ir a línea X`) y salida `.log` completa, además de **Corregir con IA** ante errores fatales
- **Asistente IA multimodal (Google Gemini)** - Selector de modelos (`Gemini 4 Hydrogen`, `Gemini 3.5 Flash-Lite`, `Gemini 3.1 Flash-Lite`, etc.), contexto estructural optimizado para documentos largos, adjunto de imágenes y herramientas multiarchivo (`read_project_file`, `create_project_file`, `find_and_replace`)
- **Editor CodeMirror 6 inteligente** - Resaltado LaTeX y autocompletado contextual para `\cite{}`, `\ref{}`, `\includegraphics{}` e `\input{}` usando los archivos del proyecto activo
- **Compilación rápida con `pdflatex`, `lualatex` y `xelatex`** - Envío binario `multipart/form-data` con caché de imágenes por SHA-256, detección automática de `biber` (`biblatex`), `bibtex` y `makeindex`, y soporte de idioma español (`texlive-lang-spanish`)
- **Persistencia híbrida (`IndexedDB` + Supabase)** - Guardado local automático en el navegador (con caché de PDF por proyecto) y sincronización opcional en la nube con Supabase Auth, Postgres (RLS) y Storage privado

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
- `NEXT_PUBLIC_SUPABASE_URL` *(opcional)*: URL de tu proyecto en Supabase para habilitar la sincronización en la nube e inicio de sesión
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` *(opcional)*: Clave pública (*publishable* o *anon*) de tu proyecto en Supabase
- `UPSTASH_REDIS_REST_URL` *(opcional)*: URL de Upstash Redis para control de límite de peticiones
- `UPSTASH_REDIS_REST_TOKEN` *(opcional)*: Token de Upstash Redis

### Sincronización en la nube con Supabase *(opcional)*

Si deseas guardar y sincronizar tus proyectos entre distintas computadoras:

1. Crea un proyecto en [Supabase](https://supabase.com/) y ejecuta el script SQL [supabase/migrations/20261122000000_create_open_prism_cloud_sync.sql](./supabase/migrations/20261122000000_create_open_prism_cloud_sync.sql) en el **SQL Editor** (crea las tablas `projects`, `project_files`, `user_preferences`, el bucket privado `project-assets` y las políticas RLS por usuario). Si ya habías ejecutado una versión anterior, aplica también [20261122000001_allow_text_project_file_type.sql](./supabase/migrations/20261122000001_allow_text_project_file_type.sql).
2. Agrega `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` en `apps/web/.env.local`.
3. Inicia sesión o crea tu cuenta desde el botón **Conectar nube** en la parte inferior izquierda de la barra lateral.

*(Si no configuras Supabase, la aplicación funciona completamente en modo local usando IndexedDB).*

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
├── supabase/
│   └── migrations/   # Migración SQL para tablas, bucket privado y políticas RLS
├── packages/         # Paquetes compartidos (si aplica)
├── biome.json        # Configuración de linter y formateo con Biome
└── turbo.json        # Configuración de Turborepo
```

### apps/web

Aplicación Next.js 16 con:
- `assistant-ui` + `@ai-sdk/google` (modelos Gemini configurables e imágenes adjuntas)
- CodeMirror 6 con autocompletado LaTeX sensible al proyecto y visor Diff interactivo
- `react-pdf` para la vista previa de PDF y navegación directa a errores de compilación
- Almacenamiento local con `IndexedDB` (`idb` + Zustand) y sincronización opcional con `@supabase/supabase-js`
- `jszip` para importación y exportación de proyectos en `.zip`
- Upstash Redis *(opcional)* para límite de peticiones

### apps/latex-api

API basada en Hono para compilar LaTeX:
- Recibe el código fuente y archivos adjuntos (binario directo `multipart/form-data` con caché por hash SHA-256 o JSON) hasta **100 MB** por defecto (ajustable con `MAX_BODY_SIZE_BYTES`)
- Soporta archivos principales anidados en subcarpetas, `biber` (`biblatex`), `bibtex` y `makeindex` con pasadas automáticas (tiempo máximo por ejecución de `180 s`)
- Compila usando TeX Live (`pdflatex` / `lualatex` / `xelatex` + `texlive-lang-spanish`) y expone el log completo por build (`/builds/:id/log`)

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
   - `NEXT_PUBLIC_SUPABASE_URL` *(opcional)*
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` *(opcional)*
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
