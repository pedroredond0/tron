#!/bin/bash
echo "Instalando/Actualizando Tron..."
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

if [ -d "$DIR/tron.app" ]; then
    APP_NAME="tron.app"
elif [ -d "$DIR/Tron.app" ]; then
    APP_NAME="Tron.app"
else
    echo "Error: No se encontró Tron.app en $DIR"
    echo "Asegúrate de ejecutar este script desde dentro del DMG o junto al archivo .app"
    echo "Presiona Enter para salir..."
    read
    exit 1
fi

echo "Copiando $APP_NAME a /Applications..."
cp -R "$DIR/$APP_NAME" "/Applications/"
echo "Aplicando fixes de Gatekeeper..."
xattr -d com.apple.quarantine "/Applications/$APP_NAME" 2>/dev/null
xattr -cr "/Applications/$APP_NAME" 2>/dev/null
echo "¡Actualización completada! Ya puedes abrir Tron desde Aplicaciones."
echo ""
echo "Presiona Enter para salir..."
read
