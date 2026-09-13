# Tron File Manager 🚀

Tron es un explorador de archivos ultrarrápido, de código abierto y multiplataforma (Windows y macOS) construido con **Rust, Tauri y Vanilla JavaScript**. Diseñado con la filosofía **Zero-Bloat**, Tron ofrece un rendimiento nativo excepcional sin sacrificar funcionalidades avanzadas, superando en velocidad a los exploradores tradicionales y a las alternativas basadas en Electron.

![Version](https://img.shields.io/badge/Versión-1.1.13-blue.svg)
![Plataforma](https://img.shields.io/badge/Plataformas-Windows%20%7C%20macOS-lightgrey.svg)
![Tecnología](https://img.shields.io/badge/Tecnología-Rust%20%2B%20Tauri-orange.svg)

---

## ✨ Características Principales

*   **Vistas Flexibles (Multi-Layout):**
    *   **Modo Normal:** Vista clásica de lista detallada.
    *   **Modo Panel Dual (F3):** Pantalla dividida tipo "Commander" para mover y copiar archivos rápidamente entre dos directorios.
    *   **Vista de Columnas Miller (F4):** Navegación en cascada idéntica al Finder de macOS. Soporta navegación por teclado y **Drag & Drop total** (arrastrar entre columnas, copiar manteniendo Ctrl).
*   **QuickView (Espaciadora):** Previsualización instantánea ultrarrápida de archivos (Imágenes, Vídeos, Audio, Código fuente, Markdown y PDFs) sin abrir aplicaciones externas. Soporta streaming nativo para PDFs gigantes sin consumir memoria RAM.
*   **Sherlock Search:** Buscador recursivo superpotente y rápido. Permite filtrar por nombre, múltiples extensiones, rango de fechas y tamaño (MB/GB).
*   **Jump to Folder (Ctrl + P):** Buscador difuso (Fuzzy search) hiperrápido para saltar instantáneamente a cualquier subcarpeta.
*   **Renombrado Masivo (F2):** Potente herramienta de renombrado por lotes que soporta Expresiones Regulares (Regex), buscar y reemplazar, o renombrado secuencial (ej. \oto-01.jpg\).
*   **Herramientas PDF Integradas:**
    *   Dividir PDFs en imágenes individuales de alta calidad.
    *   Comprimir PDFs (optimizando el tamaño).
    *   Extraer texto (OCR/Extracción directa) de documentos PDF.
*   **Modo Lite (Simplificado):** Oculta botones avanzados y herramientas complejas de la barra superior y menú contextual para usuarios que prefieran una interfaz limpia y minimalista.
*   **Etiquetas y Favoritos:** Sistema de Tags por colores (Rojo, Verde, Azul, etc.) y marcadores de carpetas favoritas para acceso rápido.

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

**Packs de Iconos:**
*   Windows 10, macOS, GNOME Adwaita.
*   **Princesa:** Pack de iconos en tonos rosados, pero que inteligentemente mantiene los colores originales y reconocibles de las aplicaciones principales (Rojo para PDF, Azul para Word/PSD, Verde para Excel, Naranja para PowerPoint, estilo WinRAR para comprimidos).

---

## ⌨️ Atajos de Teclado (Accesos Rápidos)

| Tecla / Combinación | Acción |
| :--- | :--- |
| \Espaciadora\ | Abrir / Cerrar previsualización (QuickView) |
| \F2\ | Renombrar archivo (o Renombrado Masivo si hay varios) |
| \F3\ / \Ctrl + \\\ | Alternar Modo Panel Dual (Split View) |
| \F4\ | Alternar Vista de Columnas (Miller View) |
| \F5\ | Copiar la selección al panel inactivo (En Split View) o Actualizar |
| \Tab\ | Alternar foco entre paneles (En Split View) |
| \Ctrl + P\ | Ir a carpeta (Jump to Folder - Buscador difuso) |
| \Ctrl + F\ | Buscar en el directorio actual |
| \Ctrl + Shift + F\ | Abrir buscador avanzado **Sherlock** |
| \Ctrl + N\ / \Shift+Ctrl+N\| Nuevo Archivo / Nueva Carpeta |
| \Ctrl + Shift + C\ | Copiar ruta absoluta del archivo/carpeta |
| \H\ (En QuickView) | Abrir el visor Hexadecimal (Raw) |
| \Shift + Click\ | Selección múltiple continua |
| \Arrastrar + Ctrl\ | Copiar archivo/carpeta en lugar de moverlo |

---

## 🛠️ Instalación y Compilación

Asegúrate de tener instalado [Rust](https://rustup.rs/) y Node.js.

### En Windows
1. Clona el repositorio.
2. Ve al directorio \src-tauri\.
3. Ejecuta \cargo build --release\.
4. El ejecutable compilado estará en \src-tauri/target/release/tron.exe\.

### En macOS
Debido a las restricciones de Gatekeeper en macOS al compilar localmente sin certificado de desarrollador de Apple, hemos incluido un script automatizado:
1. Ejecuta \cargo build --release\ en la carpeta \src-tauri\.
2. Ejecuta el script de la raíz del proyecto: \./Update_Tron_Mac.command\
   * *Este script copiará la aplicación a \/Applications\ y eliminará las firmas de cuarentena (\xattr -cr\) para que abra al instante.*

---

## ⚙️ Arquitectura y Optimizaciones Recientes (v1.1)

*   **Rendimiento Multihilo:** Las operaciones de E/S, búsqueda Sherlock y descompresión de archivos se hacen en subprocesos de Rust, sin bloquear la interfaz gráfica.
*   **Streaming HTTP Interno para PDFs:** Los documentos PDF grandes se sirven localmente por un servidor TCP integrado en Rust hacia el frontend, lo cual evita los cuelgues (Out-Of-Memory) habituales en navegadores al inyectar Base64 gigantes.
*   **Extracción de Iconos Nativos Optimizada:** Integración de íconos vectoriales SVG ultra-rápidos que imitan a la perfección el software nativo (Office, Adobe) para mantener un diseño consistente sin las ralentizaciones de extraer iconos \.ico\ de Windows (GDI).
*   **Soporte Multi-Selección Robusto:** El estado ancla (\selectionAnchor\) permite selecciones con \Shift\ coherentes a través del uso de ratón, flechas de teclado e integración visual.
*   **Drag & Drop Nativo Extendido:** Soporte completo inter-columnas y multi-panel con detecciones en caliente de atajos de teclado (\Ctrl\ para forzar copia).

---
Hecho con ❤️ enfocándose en la Velocidad y Simplicidad.