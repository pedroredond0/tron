# Tron File Manager ⚡

Tron es un explorador de archivos ultrarrápido, de código abierto y multiplataforma (Windows y macOS) construido con **Rust, Tauri y Vanilla JavaScript**. Diseñado con la filosofía **KISS** (Keep It Simple, Stupid) y **Zero-Bloat**, Tron ofrece un rendimiento nativo excepcional sin sacrificar funcionalidades avanzadas, superando en velocidad a los exploradores tradicionales y a las alternativas basadas en Electron.

![Version](https://img.shields.io/badge/Versión-1.1.21-blue.svg)
![Plataforma](https://img.shields.io/badge/Plataformas-Windows%20%7C%20macOS-lightgrey.svg)
![Tecnología](https://img.shields.io/badge/Tecnología-Rust%20%2B%20Tauri-orange.svg)

---

## 🚀 Características Principales

*   **Vistas Flexibles (Multi-Layout):**
    *   **Modo Normal:** Vista clásica de lista detallada.
    *   **Modo Panel Dual (F3):** Pantalla dividida tipo "Commander" para mover y copiar archivos rápidamente entre dos directorios.
    *   **Vista de Columnas Miller (F4):** Navegación en cascada idéntica al Finder de macOS. Soporta navegación por teclado inteligente, **clic en el espacio vacío del nivel padre para retroceder**, y **Drag & Drop total** (arrastrar entre columnas, copiar manteniendo Ctrl).
*   **QuickView (Espaciadora):** Previsualización instantánea ultrarrápida de archivos (Imágenes, Vídeos, Audio, Código fuente, Markdown y PDFs) sin abrir aplicaciones externas. Soporta streaming nativo para PDFs gigantes sin consumir memoria RAM.
*   **Sherlock Search:** Buscador recursivo superpotente y rápido. Permite filtrar por nombre, múltiples extensiones, rango de fechas y tamaño (MB/GB).
*   **Jump to Folder (Ctrl + P):** Buscador difuso (Fuzzy search) hiperrápido para saltar instantáneamente a cualquier subcarpeta.
*   **Renombrado Masivo (F2):** Potente herramienta de renombrado por lotes que soporta Expresiones Regulares (Regex), buscar y reemplazar, o renombrado secuencial (ej. `foto-01.jpg`).
*   **Herramientas PDF Integradas (Optimizadas para Windows):**
    *   Dividir PDFs en imágenes individuales con selección de calidad (DPI) (Solo Windows usando API nativa). *Nota: En macOS se omite esta opción por filosofía KISS para evitar instalación de paquetes externos.*
    *   Comprimir PDFs (optimizando el tamaño).
    *   Extraer texto (OCR/Extracción directa) de documentos PDF.
*   **Modo Lite (Simplificado):** Oculta botones avanzados y herramientas complejas de la barra superior y menú contextual para usuarios que preferieran una interfaz limpia y minimalista.
*   **Historial y Frecuentes:** Panel lateral con acceso rápido a carpetas frecuentes con diseño temático (ej. iconos rosados en el tema Princesas).

---

## 🎨 Temas y Personalización

Tron soporta un sistema de temas dinámicos aplicables en caliente y guarda su estado de forma nativa. 

**12 Temas Incluidos:**
1. Adwaita (Light / Dark) - *Estilo GNOME*
2. Yaru (Light / Dark) - *Estilo Ubuntu*
3. Windows 10 (Light / Dark) - *Estilo nativo Microsoft*
4. macOS (Light / Dark) - *Estilo nativo Apple*
5. Tokyo Night & Dracula - *Para programadores y nocturnos*
6. **8m (Morado)** - *Tema morado de alto contraste*
7. **Princesas (Fucsia/Rosa)** - *Tema en tonos rosa pastel y fucsia intenso*

**Packs de Iconos Semánticos:**
*   Windows 10, macOS, GNOME Adwaita.
*   **Princesa:** Pack de iconos en tonos rosados, pero que inteligentemente mantiene los colores originales y reconocibles de las aplicaciones principales (Rojo para PDF, Azul para Word/PSD, Verde para Excel, Naranja para PowerPoint).
*   **Iconos de Medición Exclusivos:** Nuevos iconos dedicados a métricas y utilidades (ej. carpeta con calibre de medición para la herramienta Size).

---

## ⌨️ Atajos de Teclado (Accesos Rápidos)

| Tecla / Combinación | Acción |
| :--- | :--- |
| `Espaciadora` | Abrir / Cerrar previsualización (QuickView) |
| `F2` | Renombrar archivo (o Renombrado Masivo si hay varios) |
| `F3` / `Ctrl + \` | Alternar Modo Panel Dual (Split View) |
| `F4` | Alternar Vista de Columnas (Miller View) |
| `F5` | Copiar la selección al panel inactivo (En Split View) o Actualizar |
| `Tab` | Alternar foco entre paneles (En Split View) |
| `Ctrl + P` | Ir a carpeta (Jump to Folder - Buscador difuso) |
| `Ctrl + F` | Buscar en el directorio actual |
| `Ctrl + Shift + F` | Abrir buscador avanzado **Sherlock** |
| `Ctrl + N` / `Shift+Ctrl+N`| Nuevo Archivo / Nueva Carpeta |
| `Ctrl + Shift + C` | Copiar ruta absoluta del archivo/carpeta |
| `H` (En QuickView) | Abrir el visor Hexadecimal (Raw) |
| `Shift + Click` | Selección múltiple continua |
| `Arrastrar + Ctrl` | Copiar archivo/carpeta en lugar de moverlo |

---

## 🛠️ Instalación y Compilación

Asegúrate de tener instalado [Rust](https://rustup.rs/) y Node.js.

### En Windows
1. Clona el repositorio.
2. Ve al directorio `src-tauri`.
3. Ejecuta `cargo build --release`.
4. El ejecutable compilado estará en `src-tauri/target/release/tron.exe`.

### En macOS (Solución a Gatekeeper)
Debido a las estrictas políticas de Gatekeeper en macOS al compilar localmente o descargar la app sin certificado de desarrollador de Apple firmado y notariado, tu Mac te indicará que la aplicación "está dañada" y no dejará abrirla.

Para solucionar esto, después de haber descargado o compilado y haber movido `Tron.app` a tu carpeta de Aplicaciones, **abre la Terminal de tu Mac y pega exactamente estos dos comandos**:

```bash
xattr -d com.apple.quarantine "/Applications/Tron.app"
xattr -cr "/Applications/Tron.app"
```
*Estos comandos limpian los atributos de cuarentena que macOS descarga de internet, validando la aplicación y permitiéndote ejecutarla con total normalidad.*

---

## 🧠 Arquitectura y Optimizaciones Recientes (v1.1.21)

*   **Rendimiento Multihilo:** Las operaciones de E/S, búsqueda Sherlock y descompresión de archivos se hacen en subprocesos de Rust, sin bloquear la interfaz gráfica.
*   **Renderizador PDF Windows WinRT:** Integración directa con el motor de Microsoft (`Windows.Data.Pdf`) para rasterización nativa de PDF a imágenes sin depender de binarios externos.
*   **Filosofía KISS:** Omisión intencional de dependencias problemáticas en macOS para mantener una experiencia limpia y *Zero-Bloat*.
*   **Streaming HTTP Interno para PDFs:** Los documentos PDF grandes se sirven localmente por un servidor TCP integrado en Rust hacia el frontend, lo cual evita los cuelgues (Out-Of-Memory) habituales en navegadores al inyectar Base64 gigantes.
*   **Navegación Miller Avanzada:** Interfaz de ratón perfeccionada que permite saltar entre niveles de directorios instintivamente replicando el comportamiento del Finder.
*   **Drag & Drop Nativo Extendido:** Soporte completo inter-columnas y multi-panel con detecciones en caliente de atajos de teclado (`Ctrl` para forzar copia).

---
Hecho con ❤️ enfocándose en la Velocidad, la Simplicidad y la Filosofía KISS.