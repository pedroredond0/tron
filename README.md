# tronExplorer — Gestor de Archivos Gnome-Style para Windows

**tronExplorer** es un explorador de archivos ligero, moderno y enfocado en la productividad para Windows 11 x64, inspirado visualmente en **GNOME Files (Nautilus) / Adwaita** y funcionalmente en **Quick Look de macOS** y **Sushi de GNOME**.

Desarrollado con **Tauri v2**, **Rust** y **Vanilla JavaScript + Tailwind CSS**, empaquetado en un único ejecutable portable sin dependencias pesadas ni telemetría.

---

## 🌟 Características Principales

- **Diseño GNOME Adwaita**: Interfaz oscura, limpia, minimalista y libre de distracciones con barra de menú y barra de acciones rápidas.
- **Ubicaciones del Sistema Infalibles**:
  - Descargas (`C:\Users\<usuario>\Downloads`), Escritorio, Documentos, Imágenes, Vídeos y Música resueltas de forma absoluta nativa desde Rust.
- **Operaciones de Portapapeles y Archivos**:
  - **Copiar** (`Ctrl + C`), **Cortar** (`Ctrl + X`), **Pegar** (`Ctrl + V`) con soporte para renombrado automático anticolición `(copia X)` y feedback visual de elementos atenuados al cortar.
  - **Nuevo Archivo** (`Ctrl + N`): Diálogo modal con selección rápida de extensiones (`.md`, `.txt`, `.yaml`, `.json`, etc.) y apertura automática inmediata en su editor predeterminado de Windows.
  - **Nueva Carpeta** (`Ctrl + Shift + N`): Diálogo modal para creación rápida de directorios.
- **Barra de Menús y Barra de Acciones**:
  - Menús desplegables estilo GNOME/Windows: **Archivo**, **Edición**, **Ver** y **Ayuda**.
  - Barra de herramientas con botones de acceso directo a todas las operaciones.
- **Panel Lateral Completo**:
  - **Favoritos**: Ancla y desancla cualquier carpeta (`Ctrl + D` o botón `+`), persistido localmente.
  - **Ubicaciones**: Rutas absolutas a los directorios clave del usuario.
  - **Red**: Conexión directa a recursos compartidos UNC (`\\servidor\recurso`).
  - **Unidades**: Detección dinámica de todas las letras de unidad disponibles (`C:\`, `D:\`, etc.).
- **QuickView Instantáneo (`ESPACIO`)**:
  - Vista previa flotante sobre backdrop translúcido.
  - **Imágenes**: `.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`, `.gif` (animado), `.bmp`, `.ico`, `.tiff` (renderizadas en base64 de alta velocidad).
  - **Documentos PDF**: `.pdf` con visor embebido interactivo.
  - **Texto y Código**: `.txt`, `.md`, `.rs`, `.json`, `.js`, `.py`, `.log`, `.css`, `.html`, `.xml`, `.yaml`, `.toml`, etc. con scroll y fuente monoespaciada (con límite de seguridad de 5 MB).
  - **Audio y Vídeo**: Reproducción directa utilizando streaming binario embebido en WebView2.
  - **Botón "Abrir"**: Botón directo en la barra superior de QuickView para abrir el archivo actual con su aplicación predeterminada de Windows sin salir del visor (o pulsando `Enter`).
  - **Fallback Inteligente de Códecs**: Si un formato o códec no está soportado o produce error, muestra elegantemente una ficha de metadatos completa sin romper la interfaz.
- **Purga Rápida (`DELETE`)**:
  - Mueve archivos a la **Papelera de Reciclaje de Windows** (mediante el crate nativo `trash`, nunca eliminación permanente).
  - En QuickView, avanza automáticamente al siguiente archivo y reproduce su preview sin cerrar el visor: `SPACE` -> `DEL` -> `DEL` -> `DEL`.

---

## ⌨️ Atajos de Teclado

| Atajo | Acción |
| :--- | :--- |
| **`ESPACIO`** | Abrir / Cerrar QuickView |
| **`ENTER`** o **`l`** | Abrir archivo / Entrar a carpeta |
| **`Ctrl + N`** | Crear nuevo archivo y abrir con editor predeterminado |
| **`Ctrl + Shift + N`** | Crear nueva carpeta |
| **`Ctrl + C`** | Copiar archivos/carpetas seleccionados |
| **`Ctrl + X`** | Cortar archivos/carpetas seleccionados |
| **`Ctrl + V`** | Pegar elementos del portapapeles |
| **`Ctrl + D`** | Añadir carpeta actual a Favoritos |
| **`F5`** o **`Ctrl + R`** | Actualizar directorio |
| **`F1`** | Ver guía de atajos de teclado y ayuda |
| **`DELETE`** | Mover elemento(s) a la papelera |
| **`BACKSPACE`** o **`Alt + ←`** o **`h`** | Volver atrás |
| **`Alt + →`** | Ir adelante |
| **`↓`** / **`↑`** o **`j`** / **`k`** | Seleccionar archivo siguiente / anterior |
| **`ESCAPE`** | Cerrar visor / cerrar modales / limpiar búsqueda |
| **`Ctrl + A`** | Seleccionar todos los elementos |

---

## 🛠️ Requisitos de Desarrollo y Compilación

- **Windows 11 x64**
- **Rust** (toolchain `stable-x86_64-pc-windows-msvc`)
- **Visual Studio 2022 Build Tools** (C++ Build Tools: `cl.exe`, `link.exe`, Windows SDK)
- **Tauri CLI v2** (`cargo install tauri-cli`)

---

## 🚀 Compilación y Generación del EXE Portable

Para compilar tronExplorer de forma 100% automática desde cualquier consola PowerShell:

```powershell
.\scripts\build-windows.ps1
```

El script se encarga de:
1. Detectar y configurar el entorno MSVC (`VsDevCmd.bat`).
2. Verificar el toolchain de Rust.
3. Ejecutar `cargo tauri build --no-bundle`.
4. Copiar el ejecutable optimizado a la raíz del proyecto como:
   `tronExplorer-Portable.exe`

### Ejecutable Generado
```
tronExplorer-Portable.exe (en la raíz del proyecto)
```

---

## 🔒 Privacidad y Seguridad

- **100% Local**: No realiza peticiones externas ni incorpora telemetría.
- **Operaciones Seguras**: Apertura de archivos mediante `ShellExecuteW` sin interpolación de cadenas en shell (`cmd.exe`/`powershell.exe`).
- **Eliminación Segura**: Todo borrado utiliza la API nativa de la papelera de Windows.
