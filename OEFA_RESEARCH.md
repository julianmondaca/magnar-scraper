# OEFA Scraper - Contexto Completo

## Objetivo

Construir un scraper en TypeScript para descargar masivamente los PDFs publicados en:

https://publico.oefa.gob.pe/repdig/consulta/consultaTfa.xhtml

Utilizando únicamente requests HTTP (Axios), sin Selenium, Playwright ni Puppeteer.

---

# Tecnología detectada

La aplicación está construida con:

- JavaServer Faces (JSF)
- PrimeFaces
- AJAX parcial (`Faces-Request: partial/ajax`)
- `javax.faces.ViewState`
- Cookie de sesión `JSESSIONID`

Esto implica que:

- No existen endpoints REST visibles.
- No existen URLs directas para listar PDFs.
- Todas las acciones importantes se realizan mediante POST.
- Es obligatorio mantener la sesión y el ViewState actualizado.

---

# Flujo general detectado

```text
GET página inicial
    ↓
Obtener JSESSIONID
Obtener ViewState
    ↓
POST búsqueda
    ↓
Obtener tabla de resultados
Obtener nuevo ViewState
    ↓
Extraer UUIDs de PDFs
    ↓
POST descarga PDF
    ↓
Guardar binario
    ↓
POST paginación
    ↓
Siguiente página
```

---

# Paso 1 - Obtener sesión

Request:

```http
GET https://publico.oefa.gob.pe/repdig/consulta/consultaTfa.xhtml
```

Permite obtener:

## Cookie

```http
Set-Cookie: JSESSIONID=...
```

Debe reutilizarse en todos los requests posteriores.

---

## ViewState inicial

Existe un input oculto:

```html
<input
  type="hidden"
  name="javax.faces.ViewState"
  value="..."
/>
```

Extraerlo usando Cheerio.

Ejemplo:

```ts
const viewState =
  $('input[name="javax.faces.ViewState"]').val();
```

---

# Paso 2 - Búsqueda

Request detectado:

```http
POST https://publico.oefa.gob.pe/repdig/consulta/consultaTfa.xhtml
```

Headers importantes:

```http
Faces-Request: partial/ajax
X-Requested-With: XMLHttpRequest
Content-Type: application/x-www-form-urlencoded
```

Payload observado:

```text
javax.faces.partial.ajax=true

javax.faces.source=listarDetalleInfraccionRAAForm:btnBuscar

javax.faces.partial.execute=@all

javax.faces.partial.render=
listarDetalleInfraccionRAAForm:pgLista
listarDetalleInfraccionRAAForm:txtNroexp

listarDetalleInfraccionRAAForm:btnBuscar=
listarDetalleInfraccionRAAForm:btnBuscar

listarDetalleInfraccionRAAForm=
listarDetalleInfraccionRAAForm

listarDetalleInfraccionRAAForm:txtNroexp=

listarDetalleInfraccionRAAForm:j_idt21=

listarDetalleInfraccionRAAForm:j_idt25=

listarDetalleInfraccionRAAForm:idsector=

listarDetalleInfraccionRAAForm:j_idt34=

listarDetalleInfraccionRAAForm:dt_scrollState=0,0

javax.faces.ViewState=<VIEWSTATE>
```

---

# Respuesta de búsqueda

La respuesta es XML JSF:

```xml
<partial-response>
    ...
</partial-response>
```

Contiene:

- Tabla HTML de resultados
- Nuevo ViewState

---

# Actualización de ViewState

Después de cada request AJAX aparece:

```xml
<update id="j_id1:javax.faces.ViewState:0">
<![CDATA[
NUEVO_VIEWSTATE
]]>
</update>
```

Regex recomendada:

```ts
/<update id="j_id1:javax\.faces\.ViewState:0"><!\[CDATA\[(.*?)\]\]><\/update>/
```

Actualizar siempre el ViewState antes del siguiente request.

---

# Información encontrada en los resultados

Se observó HTML similar a:

```html
onclick="mojarra.jsfcljs(
document.getElementById('listarDetalleInfraccionRAAForm'),
{
'listarDetalleInfraccionRAAForm:dt:1:j_idt63':
'listarDetalleInfraccionRAAForm:dt:1:j_idt63',

'param_uuid':
'9c8d4d4a-846f-4e41-b047-4dbb8b1d2571'
},
''
);return false"
```

---

# Datos útiles de cada PDF

## rowIndex

Proviene de:

```text
listarDetalleInfraccionRAAForm:dt:1:j_idt63
```

Valor:

```text
1
```

---

## UUID

Proviene de:

```text
param_uuid
```

Ejemplo:

```text
9c8d4d4a-846f-4e41-b047-4dbb8b1d2571
```

---

# Regex para extraer PDFs

Regex utilizada:

```ts
/listarDetalleInfraccionRAAForm:dt:(\d+):j_idt63[\s\S]*?param_uuid':'([^']+)'/g
```

Resultado esperado:

```ts
[
  {
    rowIndex: 0,
    uuid: "153a6d2a-cbed-40ef-b8ef-cd2272b19867"
  },
  {
    rowIndex: 1,
    uuid: "9c8d4d4a-846f-4e41-b047-4dbb8b1d2571"
  }
]
```

---

# Descarga de PDF

Al hacer click en el icono PDF se detectó:

```http
POST https://publico.oefa.gob.pe/repdig/consulta/consultaTfa.xhtml
```

Payload relevante:

```text
javax.faces.ViewState=<VIEWSTATE>

listarDetalleInfraccionRAAForm:dt:1:j_idt63=
listarDetalleInfraccionRAAForm:dt:1:j_idt63

param_uuid=
9c8d4d4a-846f-4e41-b047-4dbb8b1d2571
```

---

# Respuesta de descarga

Headers observados:

```http
Status Code: 200 OK

Content-Type: application/octet-stream

Content-Disposition:
attachment;filename="Res 007-2016-OEFA-TFA-SEPIM.pdf"
```

Conclusiones:

- El PDF viene directamente en el body de la respuesta.
- No hay redirect.
- No existe una URL pública adicional.
- Basta guardar el contenido binario.

---

# Descarga en Axios

```ts
const response = await axios.post(
  url,
  payload,
  {
    responseType: "arraybuffer"
  }
);

fs.writeFileSync(
  filename,
  response.data
);
```

---

# Paginación

Al avanzar a la página 2 se detectó:

```http
POST https://publico.oefa.gob.pe/repdig/consulta/consultaTfa.xhtml
```

Payload:

```text
javax.faces.partial.ajax=true

javax.faces.source=
listarDetalleInfraccionRAAForm:dt

javax.faces.partial.execute=
listarDetalleInfraccionRAAForm:dt

javax.faces.partial.render=
listarDetalleInfraccionRAAForm:dt

listarDetalleInfraccionRAAForm:dt=
listarDetalleInfraccionRAAForm:dt

listarDetalleInfraccionRAAForm:dt_pagination=true

listarDetalleInfraccionRAAForm:dt_first=10

listarDetalleInfraccionRAAForm:dt_rows=10

listarDetalleInfraccionRAAForm:dt_skipChildren=true

listarDetalleInfraccionRAAForm:dt_encodeFeature=true

listarDetalleInfraccionRAAForm=
listarDetalleInfraccionRAAForm

javax.faces.ViewState=<VIEWSTATE>
```

---

# Cómo funciona la paginación

```text
Página 1 -> first = 0
Página 2 -> first = 10
Página 3 -> first = 20
Página 4 -> first = 30
...
```

Fórmula:

```ts
const first = page * 10;
```

---

# Datos detectados

La búsqueda devuelve:

```text
1753 registros
176 páginas
10 registros por página
```

---

# Estrategia recomendada

## Inicialización

```text
GET página inicial
↓
Guardar JSESSIONID
↓
Guardar ViewState
```

---

## Búsqueda

```text
POST búsqueda
↓
Guardar nuevo ViewState
↓
Extraer tabla
```

---

## Procesamiento de resultados

```text
Extraer rowIndex
Extraer param_uuid
```

---

## Descarga

```text
POST descarga PDF
↓
Guardar binario
```

---

## Paginación

```text
POST paginación
↓
Actualizar ViewState
↓
Extraer nuevos resultados
```

---

# Bucle general

```ts
for (let page = 0; page < totalPages; page++) {
  const first = page * 10;

  const pageData =
    await loadPage(first);

  const docs =
    extractDocuments(pageData);

  for (const doc of docs) {
    await downloadPdf(doc);
  }
}
```

---

# Consideraciones importantes

## Mantener siempre

```text
JSESSIONID
```

y

```text
javax.faces.ViewState
```

actualizados.

---

## Descargar con concurrencia limitada

No lanzar 1753 descargas simultáneamente.

Recomendado:

```ts
import pLimit from "p-limit";

const limit = pLimit(5);
```

Ejemplo:

```ts
await Promise.all(
  docs.map(doc =>
    limit(() => downloadPdf(doc))
  )
);
```

---

# Librerías recomendadas

```bash
npm install axios cheerio p-limit
```

Dependencias de Node:

```bash
npm install -D typescript ts-node @types/node
```

---

# Stack final

- TypeScript
- Axios
- Cheerio
- p-limit
- fs/promises

No es necesario utilizar:

- Selenium
- Playwright
- Puppeteer

Todo el flujo fue identificado y puede ejecutarse mediante requests HTTP tradicionales.