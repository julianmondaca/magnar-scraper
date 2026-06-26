# Magnar Scraper

Este proyecto es un scraper desarrollado en **TypeScript** diseñado para extraer metadatos de documentos y descargar sus archivos PDF desde dos fuentes del gobierno peruano:

- **OEFA** (Organismo de Evaluación y Fiscalización Ambiental) — TFA y DFSAI
- **Jurisprudencia PJ** (Poder Judicial) — base de datos de jurisprudencia

El scraper **no utiliza automatización de navegador** (Puppeteer, Playwright o Selenium). En su lugar, emula directamente las peticiones HTTP (POST/GET) e interactúa con el estado de la sesión, cookies y el `ViewState` de JavaServer Faces (JSF), logrando una velocidad óptima y un consumo mínimo de recursos.

---

## Características

- **Dos scrapers independientes**: OEFA (TFA/DFSAI) y Jurisprudencia PJ, cada uno con su propia lógica de extracción.
- **Extracción de Metadatos (OEFA)**: Obtiene campos clave como número de expediente, administrado, unidad fiscalizable, sector, resolución y enlace del PDF.
- **Paginación completa**: Navega por todas las páginas de resultados mediante AJAX (PrimeFaces para OEFA, RichFaces para Jurisprudencia).
- **Manejo de sesión JSF**: Extrae y reenvía `javax.faces.ViewState` en cada petición, y mantiene cookies manualmente (JSESSIONID) para mantener la sesión.
- **Descarga inteligente de PDFs**: Resuelve enlaces de descarga dinámicos obteniendo el UUID de cada documento.
- **Sistema de deduplicación**: Verifica `data/documents.json` antes de descargar para evitar duplicados; registra cada descarga exitosa inmediatamente.
- **Reintentos con backoff**: Reintentos con Backoff Exponencial y Jitter para errores HTTP 429.
- **Control de concurrencia**: Descargas paralelas limitadas (5 simultáneas en Jurisprudencia) y rate limiting configurable (OEFA).
- **Estructura modular**: Separación clara entre cliente HTTP, scraper, parser, configuración y utilidades.

---

## Requisitos Previos

- Node.js (v14 o superior)
- npm

## Instalación

```bash
npm install
```

## Ejecución

### OEFA — Tribunal de Fiscalización Ambiental (TFA)

```bash
npm start tfa
```

### OEFA — Dirección de Fiscalización y Sanción (DFSAI)

```bash
npm start dfsai
```

### Jurisprudencia PJ

```bash
npm start jurisprudencia
```

*Sin argumento, por defecto ejecuta el scraper del TFA.*

---

## Estructura de Salida

```
data/documents.json      — Registro único de descargas (OEFA + Jurisprudencia)
pdf/                     — Todos los PDFs descargados
logs/
  failed-downloads.json  — Descargas fallidas
  failed-pages.json      — Páginas que no pudieron procesarse
```

### Sistema de Deduplicación

El archivo `data/documents.json` funciona como registro único compartido entre ambos scrapers. Antes de descargar un PDF, el scraper consulta este archivo por UUID. Si el documento ya fue descargado previamente (por cualquier scraper), se salta automáticamente.

Cada registro incluye:
- `uuid` — identificador único del documento
- `filename` — nombre del archivo guardado
- `source` — origen (`jurisprudencia`, `oefa-tfa`, `oefa-dfsai`)
- `downloadedAt` — timestamp ISO de la descarga
- `metadata` — (OEFA) campos del documento

---

## Estructura del Proyecto

```
src/
  index.ts                             — Punto de entrada
  config.ts                            — Configuración (rutas, rate limits, reintentos)
  types.ts                             — Interfaces TypeScript
  scrapers/
    jurisprudenciaScraper.ts           — Scraper para Jurisprudencia PJ
    oefaScraper.ts                     — Scraper para OEFA TFA/DFSAI
  httpClients/
    oefaClient.ts                      — Cliente HTTP con manejo de sesión JSF para OEFA
  utils/
    utils.ts                           — Utilidades generales (sleep, sanitizeFileName, loadDownloadedUuids, appendDownloadRecord)
    oefaParser.ts                      — Parseo de respuestas AJAX de OEFA
    logger.ts                          — Logger coloreado
```

---

## Detalles Técnicos

### Jurisprudencia PJ

- **Flujo**: GET `inicio.xhtml` → POST a `inicio.xhtml` con el formulario de búsqueda → 302 redirect → GET `resultado.xhtml` (datos de página 1 incluidos en el HTML).
- **Paginación**: AJAX POST a `resultado.xhtml` con `rich:datascroller:onscroll`, parámetro `formBuscador:data2:page=N`. Cada página devuelve XML con 10 UUIDs y un nuevo ViewState.
- **Descarga**: GET directo a `ServletDescarga?uuid=...`. El nombre del archivo se extrae del header `Content-Disposition`.
- **Cookies**: Manejo manual de JSESSIONID; se extrae de `Set-Cookie` y se reenvía en cada petición.

### OEFA (TFA / DFSAI)

- **Flujo**: GET de la página de consulta → AJAX POST con `btnBuscar` → PrimeFaces partial response.
- **Paginación**: AJAX POST con parámetros `_first` y `_rows` para navegar entre páginas.
- **Descarga**: POST al formulario con `param_uuid`; el PDF se devuelve como `arraybuffer`.
- **Rate limiting**: Retraso configurable de 2-3 segundos entre peticiones para evitar bloqueos.
