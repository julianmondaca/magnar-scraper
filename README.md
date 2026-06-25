# Magnar Scraper 🔍

Este proyecto es un scraper desarrollado en **TypeScript** diseñado para extraer metadatos de documentos y descargar sus archivos PDF correspondientes desde el repositorio digital del **Organismo de Evaluación y Fiscalización Ambiental (OEFA)** de Perú.

Cumpliendo con los requerimientos técnicos del desafío, el scraper **no utiliza automatización de navegador** (como Puppeteer, Playwright o Selenium). En su lugar, emula directamente las peticiones HTTP (POST/GET) e interactúa con el estado de la sesión y el `ViewState` de JavaServer Faces (JSF), logrando una velocidad óptima y un consumo mínimo de recursos.

---

## 🛠️ Características del Proyecto

- **Extracción de Metadatos**: Obtiene campos clave como número de expediente, administrado, unidad fiscalizable, sector, resolución, número de orden y enlace del PDF.
- **Descarga Inteligente de PDFs**: Resuelve enlaces y formularios de descarga dinámicos obteniendo el identificador único (`param_uuid`) de cada documento.
- **Manejo de Errores y Reintentos**:
  - Implementa un sistema de reintentos con **Backoff Exponencial y Jitter** para mitigar errores HTTP `429 (Too Many Requests)`.
  - Omite documentos persistentes con fallas tras agotar los intentos y continúa con el flujo principal sin bloquear la ejecución.
- **Control de Tasa (Rate Limiting)**: Introduce retrasos aleatorios y configurables entre peticiones para prevenir bloqueos por parte del servidor.
- **Estructura Modular**: Separación clara entre el cliente HTTP ([oefaClient.ts](/magnar-scraper/src/httpClients/oefaClient.ts)), el scraper principal ([oefaScraper.ts](/magnar-scraper/src/scrapers/oefaScraper.ts)), los utilitarios de análisis ([oefaParser.ts](/magnar-scraper/src/utils/oefaParser.ts)) y la configuración ([config.ts](/magnar-scraper/src/config.ts)).

---

## 🚀 Guía de Instalación y Ejecución

### Requisitos Previos

- [Node.js](https://nodejs.org/) (versión 14 o superior recomendada)
- `npm` (administrador de paquetes de Node)

### 1. Instalación de Dependencias

Clona o descarga el proyecto, accede a la raíz del directorio y ejecuta el siguiente comando para instalar las dependencias necesarias (incluyendo TypeScript, `axios` y `cheerio`):

```bash
npm install
```

### 2. Ejecución del Scraper

El proyecto cuenta con scripts configurados en el [package.json](/magnar-scraper/package.json) para ejecutar los scrapers fácilmente. Puedes apuntar a dos portales distintos de la OEFA pasando el argumento correspondiente al script de ejecución:

#### Opción A: Scraper para el Tribunal de Fiscalización Ambiental (TFA)
Inicia la extracción y descarga de documentos de la mesa del TFA (`consultaTfa.xhtml`):

```bash
npm start tfa
# o bien
npm run dev tfa
```

#### Opción B: Scraper para la Dirección de Fiscalización y Sanción (DFSAI)
Inicia la extracción y descarga de documentos del portal de la DFSAI (`consultaDfsai.xhtml`):

```bash
npm start dfsai
# o bien
npm run dev dfsai
```

*(Si ejecutas `npm start` sin argumentos adicionales, por defecto iniciará el scraper del **TFA**).*

---

## 📁 Estructura de Salida

Una vez que el scraper comience a ejecutarse:
1. **Metadatos**: Los registros extraídos se guardarán en formato estructurado JSON dentro del archivo `data/documents.json`.
2. **Archivos PDF**: Los documentos descargados exitosamente se almacenarán en la carpeta `pdfs/` renombrados utilizando el número de expediente de manera sanitizada (por ejemplo: `001-2024-OEFA-TFA.pdf`).