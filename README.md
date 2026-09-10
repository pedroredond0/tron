# tronExplorer — Gestor de Archivos Moderno y Ligero

[![Rust](https://img.shields.io/badge/Rust-2021-DEA584?style=flat&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-v2-24C8D8?style=flat&logo=tauri&logoColor=white)](https://tauri.app/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Platforms](https://img.shields.io/badge/Platforms-Windows%20%7C%20Linux%20%7C%20macOS-4EAA25?style=flat)](#-compatibilidad-multiplataforma-y-descargas)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**tronExplorer** es un gestor de archivos de alto rendimiento, libre de telemetría y enfocado en la productividad. Combina la estética limpia y elegante de **GNOME Files (Nautilus) / Adwaita** con la inmediatez funcional de **Quick Look de macOS** y **Sushi de GNOME**.

Construido sobre **Tauri v2**, **Rust** y una interfaz web ultrarrápida en **Vanilla JavaScript** y **Tailwind CSS**, tronExplorer está optimizado para ofrecer tiempos de inicio instantáneos, bajo consumo de memoria RAM y un control total de archivos mediante atajos de teclado.

---

## 🌟 Características Principales

### 🎨 Personalización Visual y Temas
- **14 Temas Integrados**: Disfruta de 7 temas oscuros y sus 7 equivalentes exactos en modo claro:
  - *Temas Oscuros*: Adwaita (predeterminado), Windows 10, Ubuntu, Manjaro, NvChad, TokyoNight, MatteBlack.
  - *Temas Claros*: Adwaita Light, Windows 10 Light, Ubuntu Light, Manjaro Light, NvChad Light, TokyoNight Light, MatteBlack Light.
- **6 Conjuntos de Iconos Vectoriales**:
  - `Default`: Emojis modernos y directos.
  - `Ubuntu Yaru`: Conjunto SVG oficial del escritorio Ubuntu.
  - `Windows 10`: Iconografía Fluent de Windows 10/11.
  - `macOS Big Sur`: Iconos vectoriales con la estética de macOS.
  - `Slot Dark` / `Slot Light`: Iconos minimalistas diseñados para alto contraste.
  - *Sincronización total*: Al alternar el pack, se actualiza simultáneamente la barra de herramientas, el panel lateral y el explorador de archivos con iconos dedicados para PDF, código, imágenes, vídeo, comprimidos y ejecutables.
- **Densidad de Visualización Dinámica**:
  - *Compacto*: Filas de 24px con iconos de 20px (máxima información en pantalla).
  - *Normal*: Filas de 32px con iconos de 28px (equilibrio perfecto).
  - *Espacioso*: Filas de 44px con iconos de 40px (diseño táctil y holgado).
- **Escala de Fuentes en Tiempo Real**: Control deslizante en Preferencias para ajustar el tamaño de fuente de la interfaz entre 12px y 20px.

---

### 👁️ QuickView Instantáneo (`ESPACIO`)
- **Previsualización Flotante Inmediata**: Pulsa la barra espaciadora sobre cualquier archivo para ver su contenido al instante sin salir del explorador.
- **Streaming Multimedia Local de Alta Eficiencia**: Incorpora un servidor HTTP interno en un puerto efímero (`127.0.0.1:0`) con soporte de peticiones parciales (`Range: bytes=start-end`), permitiendo reproducir archivos de audio y vídeo de varios gigabytes al instante y realizar saltos temporales (scrubbing) sin agotar la memoria RAM.
- **Soporte Completo de Formatos**:
  - *Imágenes*: PNG, JPG, JPEG, SVG, WebP, GIF animado, BMP, ICO, TIFF.
  - *Documentos*: Visor interactivo integrado para documentos PDF.
  - *Código y Texto*: Resaltado sintáctico con numeración de líneas para Rust, JavaScript, TypeScript, Python, JSON, Markdown, YAML, TOML, HTML, CSS, C/C++, Shell, etc. (con límite de seguridad de 5 MB).
  - *Directorios*: Cálculo asíncrono en tiempo real del tamaño ocupado en disco y conteo de archivos.
- **Acciones Rápidas en Visor**: Botones para abrir con la aplicación predeterminada, editar en el editor configurado, navegar con flechas y enviar a la papelera con `DELETE` pasando fluidamente al siguiente archivo.

---

### 🔍 Búsqueda Avanzada Sherlock (`Ctrl + Shift + F`)
- **Motor Recursivo Multihilo**: Indexación y escaneo en tiempo real de directorios profundos.
- **Presets Inteligentes**:
  - *Últimas 24 horas*: Localiza rápidamente los archivos creados o modificados en el último día.
  - *Top 25 Archivos Más Pesados*: Identifica qué ficheros están ocupando más espacio.
  - *Top 25 Carpetas Más Pesadas*: Descubre las carpetas que más almacenamiento consumen.
- **Filtros Multicriterio**: Búsqueda por subcadena, rango exacto de tamaño (Bytes, KB, MB, GB), rango de fechas de modificación (desde / hasta) y alcance (carpeta actual o unidad completa).

---

### 📦 Gestión de Archivos Comprimidos ZIP
- **Comprimir a ZIP**: Empaqueta rápidamente los archivos y carpetas seleccionados introduciendo el nombre deseado.
- **Extraer Aquí**: Descomprime el contenido directamente en el directorio de trabajo.
- **Extraer en `[Nombre]`**: Crea una subcarpeta dedicada y descomprime el archivo de forma organizada.
- **Inspeccionar ZIP**: Visualiza el contenido interno, tamaños y rutas de cualquier archivo ZIP en un diálogo modal con filtro de búsqueda sin necesidad de extraerlo a disco.
- **Seguridad Garantizada**: Algoritmo de extracción protegido contra ataques de desbordamiento de ruta (*Zip Slip*).

---

### 🌲 Generador de Listados y Árboles de Directorio
- **Exportación a Texto (`.txt`)**: Genera inventarios detallados del contenido de una carpeta.
- **Modo Árbol Estilo `tree`**: Representación jerárquica con conectores visuales (`├──`, `└──`, `│   `).
- **Modo Lista Plana**: Listado lineal ideal para scripts y documentación.
- **Opciones Configurables**:
  - Incluir o excluir ficheros (solo carpetas).
  - Incluir metadatos detallados (tamaño formateado y fecha de modificación).
  - Límite de profundidad de subcarpetas (por defecto 2 niveles o exploración completa).

---

### ⚙️ Integración con el Sistema y Aplicaciones Externas
- **Mostrar en Explorer / Finder / Gestor de Archivos**: Resalta el elemento seleccionado en el explorador nativo del sistema operativo.
- **Propiedades del Archivo**: Abre la ventana de propiedades nativa del sistema (`Alt + Enter`).
- **Menú "Abrir con..." Inteligente**: Desplegable contextual con sugerencias de software instalado.
- **Gestión de Aplicaciones Externas (Preferencias)**:
  - Casillas para mostrar u ocultar aplicaciones en el menú contextual.
  - Posibilidad de definir rutas ejecutables personalizadas para cualquier aplicación en caso de que no esté en el `PATH` del sistema.
- **Terminal Predeterminada**: Configura tu terminal preferida: PowerShell, CMD, Windows Terminal (`wt`), Kitty, Alacritty, Ghostty, Foot, WezTerm, Konsole o GNOME Terminal (`Ctrl + T`).
- **Editor de Texto Predeterminado**: Lanza al instante VS Code, Sublime Text, Notepad++, Gedit, Vim o Neovim.

---

### 📋 Operaciones de Ficheros y Navegación
- **Portapapeles Completo**: Copiar (`Ctrl + C`), Cortar (`Ctrl + X`), Pegar (`Ctrl + V`) con soporte de auto-renombrado anticolición `(copia X)` y atenuación visual de elementos cortados.
- **Duplicar al Instante (`Ctrl + D`)**: Crea una copia inmediata del elemento seleccionado.
- **Renombrado Inmediato (`F2`)**: Diálogo ágil de renombrado con selección automática del nombre sin la extensión.
- **Eliminación Segura (`DELETE`)**: Envía a la Papelera de reciclaje nativa del sistema operativo mediante el crate `trash` (nunca eliminación irreversible accidental).
- **Selección Avanzada**:
  - Selección continua por rangos con `Shift + Flechas` o `Shift + Clic`.
  - Selección múltiple con `Ctrl + Clic`.
  - Salto alfanumérico rápido (*Type-Ahead*): presiona cualquier letra o número para saltar al siguiente elemento que empiece por dicho carácter.
- **Panel Lateral**: Acceso directo a lugares del usuario (Descargas, Documentos, Escritorio, etc.), detección dinámica de unidades de disco, conexión a carpetas de red UNC (`\\servidor\recurso`) y gestión de favoritos anclados con reordenación y renombrado.

---

## ⌨️ Atajos de Teclado

| Atajo | Categoría | Acción |
| :--- | :--- | :--- |
| **`ESPACIO`** | Vista Previa | Abrir / Cerrar QuickView |
| **`ENTER`** | Navegación | Abrir archivo / Entrar en carpeta |
| **`Ctrl + N`** | Archivos | Crear nuevo archivo en blanco |
| **`Ctrl + Shift + N`** | Archivos | Crear nueva carpeta |
| **`F2`** | Archivos | Renombrar elemento seleccionado |
| **`Ctrl + D`** | Archivos | Duplicar archivo o carpeta seleccionada |
| **`Ctrl + C`** | Edición | Copiar elementos seleccionados |
| **`Ctrl + X`** | Edición | Cortar elementos seleccionados |
| **`Ctrl + V`** | Edición | Pegar elementos del portapapeles |
| **`Ctrl + A`** | Selección | Seleccionar todos los elementos |
| **`Shift + ↑ / ↓`** | Selección | Extender selección continua por rango |
| **`DELETE`** | Archivos | Mover elemento(s) a la Papelera de reciclaje |
| **`Ctrl + K`** | Búsqueda | Foco en la barra de filtro rápido de la carpeta |
| **`Ctrl + Shift + F`** | Búsqueda | Abrir motor de búsqueda avanzada Sherlock |
| **`Ctrl + B`** | Favoritos | Anclar carpeta actual a Favoritos |
| **`Ctrl + H`** | Ver | Mostrar / Ocultar archivos ocultos |
| **`Ctrl + T`** | Sistema | Abrir terminal predeterminada en la carpeta actual |
| **`Alt + Enter`** | Sistema | Ver propiedades nativas del archivo/carpeta |
| **`F5`** o **`Ctrl + R`** | Ver | Actualizar contenido del directorio |
| **`F1`** | Ayuda | Abrir panel de ayuda y atajos de teclado |
| **`Backspace`** / **`Alt + ←`** | Navegación | Ir atrás en el historial |
| **`Alt + →`** | Navegación | Ir adelante en el historial |
| **`Alt + ↑`** | Navegación | Subir al directorio padre |
| **`Home`** / **`End`** | Navegación | Ir al primer / último elemento de la lista |
| **`PageUp`** / **`PageDown`** | Navegación | Desplazarse 10 elementos arriba / abajo |
| **`A - Z`** / **`0 - 9`** | Navegación | Saltar al siguiente elemento que empiece por esa tecla |
| **`ESCAPE`** | General | Cerrar visores, modales o limpiar búsqueda |

---

## 🌐 Compatibilidad Multiplataforma y Descargas

Las compilaciones automáticas de cada versión están disponibles en la sección de [Releases de GitHub](https://github.com/pedroredondo/tron/releases):

| Plataforma | Paquete / Formato | Detalles de Compatibilidad |
| :--- | :--- | :--- |
| **Linux (Debian / Ubuntu / Mint)** | `.deb` | Instalador nativo para Ubuntu 20.04+, Debian 11+, Pop!_OS, Zorin OS, etc. |
| **Linux (Universal)** | `.AppImage` | Ejecutable portable universal para cualquier distribución Linux moderna. |
| **Arch Linux / Manjaro** | Binario / Script | Compilación nativa optimizada mediante `scripts/build-arch.sh`. |
| **Windows 10 / 11 (x64)** | `.exe` Portable | Ejecutable autónomo sin dependencias externas (requiere WebView2 integrado en Windows 10/11). |
| **macOS (Intel / Apple Silicon)** | `.app` / `.dmg` | Compilable mediante el toolchain estándar de Tauri en Darwin. |

---

## 🐧 Clonar y Compilar en Arch Linux / Manjaro

tronExplorer se integra de forma nativa en distribuciones basadas en Arch Linux (Arch, Manjaro, EndeavourOS, Garuda Linux, etc.).

### 1. Instalar Requisitos Previos

Ejecuta en tu terminal para instalar las herramientas de desarrollo, librerías de WebKitGTK y soporte para iconos de bandeja:

```bash
sudo pacman -S --needed \
    base-devel \
    git \
    curl \
    wget \
    openssl \
    gtk3 \
    webkit2gtk-4.1 \
    libappindicator-gtk3 \
    librsvg \
    patchelf \
    rust
```

*(Opcional: Si utilizas `rustup`, puedes asegurar el toolchain estable con `rustup default stable`).*

### 2. Clonar el Repositorio

```bash
git clone https://github.com/pedroredondo/tron.git
cd tron
```

### 3. Compilación e Instalación Automática

El proyecto incluye un script automatizado que verifica dependencias, compila el binario en modo release y, opcionalmente, crea el archivo `.desktop` y registra el icono en tu menú de aplicaciones:

```bash
# Dar permisos de ejecución
chmod +x scripts/build-arch.sh

# Ejecutar el script (agrega --install para instalar en ~/.local/bin y menú de aplicaciones)
./scripts/build-arch.sh --install
```

Al finalizar, podrás ejecutar la aplicación desde cualquier terminal con `tron` o buscar **"Tron Explorer"** en tu lanzador de aplicaciones favorito (GNOME Shell, KDE KRunner, Rofi, Wofi, etc.).

---

## 🪟 Compilación en Windows 11 / 10

### Requisitos:
- **Rust**: Toolchain `stable-x86_64-pc-windows-msvc`.
- **Visual Studio 2022**: C++ Build Tools (incluyendo Windows SDK y herramientas de compilación MSVC).
- **PowerShell**.

### Compilación con Script:
```powershell
.\scripts\build-windows.ps1
```
El script generará el binario optimizado `Tron.exe` en la raíz del proyecto.

---

## 📖 Documentación Técnica y Arquitectura Interna

Para desarrolladores y colaboradores que deseen conocer en profundidad el funcionamiento del motor en Rust, el servidor de streaming de medios, el protocolo de comandos IPC y el motor frontend, consulta la documentación técnica completa:

👉 **[Ver Documento de Arquitectura y Desarrollo (docs/ARCHITECTURE.md)](docs/ARCHITECTURE.md)**

---

## 🔒 Privacidad y Seguridad

- **100% Local**: No realiza llamadas remotas, telemetría ni analíticas.
- **Protección de Datos**: Todas las eliminaciones se realizan enviando los ficheros a la papelera de reciclaje nativa del sistema.
- **Seguridad en Apertura de Ficheros**: Invocación segura mediante APIs nativas (`ShellExecuteW` / `xdg-open`) sin interpolación vulnerable de comandos en terminales shell.

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Consulta el archivo `LICENSE` para más detalles.
