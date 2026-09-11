#!/usr/bin/env bash
# ==============================================================================
# scripts/build-arch.sh
# Script de compilacion e instalacion automatica de tronExplorer para Arch Linux
# Compatible con Arch Linux, Manjaro, EndeavourOS, Garuda, etc.
# ==============================================================================

set -e

# Colores para la salida en terminal
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # Sin color

echo -e "${CYAN}${BOLD}=====================================================${NC}"
echo -e "${CYAN}${BOLD}   tronExplorer - Compilador para Arch Linux / Manjaro  ${NC}"
echo -e "${CYAN}${BOLD}=====================================================${NC}"

# Directorio base del proyecto
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

INSTALL_MODE=false
for arg in "$@"; do
    if [ "$arg" == "--install" ] || [ "$arg" == "-i" ]; then
        INSTALL_MODE=true
    fi
done

# 1. Comprobar dependencias del sistema en Arch Linux
echo -e "\n${BLUE}[1/5] Verificando dependencias del sistema pacman...${NC}"

REQUIRED_PKGS=(
    "base-devel"
    "git"
    "curl"
    "wget"
    "openssl"
    "gtk3"
    "webkit2gtk-4.1"
    "libappindicator-gtk3"
    "librsvg"
    "patchelf"
)

MISSING_PKGS=()

for pkg in "${REQUIRED_PKGS[@]}"; do
    if ! pacman -Qi "$pkg" &>/dev/null; then
        if [ "$pkg" == "webkit2gtk-4.1" ] && pacman -Qi "webkit2gtk" &>/dev/null; then
            continue
        fi
        if [ "$pkg" == "libappindicator-gtk3" ] && (pacman -Qi "libayatana-appindicator" &>/dev/null || pacman -Qi "libappindicator" &>/dev/null); then
            continue
        fi
        MISSING_PKGS+=("$pkg")
    fi
done

if [ ${#MISSING_PKGS[@]} -gt 0 ]; then
    echo -e "${YELLOW}Aviso: Faltan los siguientes paquetes requeridos en tu sistema:${NC}"
    for p in "${MISSING_PKGS[@]}"; do
        echo -e "  - ${RED}$p${NC}"
    done
    echo -e "\n${YELLOW}Instalalos ejecutando:${NC}"
    echo -e "  ${BOLD}sudo pacman -S --needed ${MISSING_PKGS[*]}${NC}\n"
    
    read -p "Deseas instalarlos automaticamente ahora con sudo? (s/N): " answer
    if [[ "$answer" =~ ^[sSyY]$ ]]; then
        sudo pacman -S --needed "${MISSING_PKGS[@]}"
    else
        echo -e "${RED}Error: Se requieren las dependencias anteriores para compilar WebKit y GTK3.${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✓ Todas las dependencias nativas de Arch estan satisfechas.${NC}"
fi

# 2. Comprobar Rust y Cargo
echo -e "\n${BLUE}[2/5] Comprobando entorno de Rust y Cargo...${NC}"

if ! command -v cargo &>/dev/null; then
    if [ -f "$HOME/.cargo/env" ]; then
        source "$HOME/.cargo/env"
    fi
fi

if ! command -v cargo &>/dev/null; then
    echo -e "${YELLOW}Rust/Cargo no encontrado en PATH. Comprobando rustup...${NC}"
    if pacman -Qi "rust" &>/dev/null; then
        export PATH="$PATH:$HOME/.cargo/bin"
    else
        echo -e "${YELLOW}Instalando rust mediante pacman...${NC}"
        sudo pacman -S --needed rust
    fi
fi

RUSTC_VERSION=$(rustc --version 2>/dev/null || echo "Desconocido")
CARGO_VERSION=$(cargo --version 2>/dev/null || echo "Desconocido")
echo -e "${GREEN}✓ Rustc: $RUSTC_VERSION${NC}"
echo -e "${GREEN}✓ Cargo: $CARGO_VERSION${NC}"

# 3. Determinar herramienta de compilacion (Tauri CLI o Cargo directo)
echo -e "\n${BLUE}[3/5] Verificando herramienta de compilacion Tauri...${NC}"

TAURI_CMD=""
if command -v cargo-tauri &>/dev/null; then
    TAURI_CMD="cargo tauri"
elif cargo tauri --version &>/dev/null; then
    TAURI_CMD="cargo tauri"
else
    echo -e "${YELLOW}Tauri CLI no encontrado en el sistema. Puedes instalarlo con:${NC}"
    echo -e "  ${BOLD}pacman -S --needed cargo-tauri${NC} o ${BOLD}cargo install tauri-cli --version \"^2.0\"${NC}"
    echo -e "Intentaremos compilar directamente con ${BOLD}cargo build --release${NC}..."
    TAURI_CMD=""
fi

# 4. Compilacion del proyecto
echo -e "\n${BLUE}[4/5] Compilando tronExplorer en modo Release optimizado...${NC}"

if [ -n "$TAURI_CMD" ]; then
    echo -e "Ejecutando: ${BOLD}$TAURI_CMD build --no-bundle${NC}"
    cd "$PROJECT_ROOT"
    $TAURI_CMD build --no-bundle
    RELEASE_BIN="$PROJECT_ROOT/src-tauri/target/release/tron"
else
    echo -e "Ejecutando: ${BOLD}cargo build --release --manifest-path src-tauri/Cargo.toml${NC}"
    cd "$PROJECT_ROOT"
    cargo build --release --manifest-path src-tauri/Cargo.toml
    RELEASE_BIN="$PROJECT_ROOT/src-tauri/target/release/tron"
fi

if [ ! -f "$RELEASE_BIN" ]; then
    if [ -f "$PROJECT_ROOT/src-tauri/target/release/Tron" ]; then
        RELEASE_BIN="$PROJECT_ROOT/src-tauri/target/release/Tron"
    elif [ -f "$PROJECT_ROOT/src-tauri/target/release/tron-explorer" ]; then
        RELEASE_BIN="$PROJECT_ROOT/src-tauri/target/release/tron-explorer"
    fi
fi

if [ ! -f "$RELEASE_BIN" ]; then
    echo -e "${RED}Error: No se encontro el binario compilado en src-tauri/target/release/${NC}"
    exit 1
fi

# Copiar a la raiz del proyecto para uso portable
cp "$RELEASE_BIN" "$PROJECT_ROOT/tron"
chmod +x "$PROJECT_ROOT/tron"

BIN_SIZE=$(du -h "$PROJECT_ROOT/tron" | cut -f1)
echo -e "${GREEN}${BOLD}✓ Compilacion completada con exito!${NC}"
echo -e "Binario portable disponible en: ${BOLD}$PROJECT_ROOT/tron${NC} (${BIN_SIZE})"

# 5. Instalacion opcional en el sistema
echo -e "\n${BLUE}[5/5] Gestion de instalacion...${NC}"

if [ "$INSTALL_MODE" = true ]; then
    DO_INSTALL=true
else
    read -p "Deseas instalar tronExplorer en tu entorno de usuario (~/.local/bin y menu de aplicaciones)? (s/N): " do_inst
    if [[ "$do_inst" =~ ^[sSyY]$ ]]; then
        DO_INSTALL=true
    else
        DO_INSTALL=false
    fi
fi

if [ "$DO_INSTALL" = true ]; then
    echo -e "${CYAN}Instalando binario en ~/.local/bin...${NC}"
    mkdir -p "$HOME/.local/bin"
    cp "$PROJECT_ROOT/tron" "$HOME/.local/bin/tron"
    chmod +x "$HOME/.local/bin/tron"

    echo -e "${CYAN}Instalando icono en ~/.local/share/icons/hicolor/...${NC}"
    ICON_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"
    mkdir -p "$ICON_DIR"
    if [ -f "$PROJECT_ROOT/src-tauri/icons/icon.png" ]; then
        cp "$PROJECT_ROOT/src-tauri/icons/icon.png" "$ICON_DIR/tron.png"
    fi

    echo -e "${CYAN}Creando acceso de escritorio en ~/.local/share/applications/tron.desktop...${NC}"
    DESKTOP_DIR="$HOME/.local/share/applications"
    mkdir -p "$DESKTOP_DIR"

    cat <<EOF > "$DESKTOP_DIR/tron.desktop"
[Desktop Entry]
Name=Tron Explorer
Comment=Gestor de archivos moderno y ligero con QuickView
Exec=env WEBKIT_DISABLE_DMABUF_RENDERER=1 $HOME/.local/bin/tron %U
Icon=tron
Terminal=false
Type=Application
Categories=System;FileManager;Utility;
MimeType=inode/directory;
Keywords=files;explorer;nautilus;manager;arch;
StartupNotify=true
EOF

    chmod +x "$DESKTOP_DIR/tron.desktop"
    update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true

    echo -e "${GREEN}${BOLD}✓ tronExplorer ha sido instalado exitosamente!${NC}"
    echo -e "Puedes iniciarlo desde la terminal con ${BOLD}tron${NC} o buscar ${BOLD}'Tron Explorer'${NC} en tu lanzador de aplicaciones (GNOME, KDE, Rofi, Wofi, etc.)."
else
    echo -e "Instalacion omitida. Puedes ejecutarlo directamente con: ${BOLD}./tron${NC}"
fi

echo -e "\n${GREEN}Listo.${NC}"