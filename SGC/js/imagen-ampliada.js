// Imagen ampliada: tocar la foto de un dispositivo (popup de Producción o ficha de Activos) la abre grande en #snapshotModal
// (produccion.js: abrirModalSnapshot), pero SOLO en escritorio: en el móvil tocarla no hace nada. Lo consultan los lugares que
// ofrecen ampliar (uiCarruselImagen en comun.js: el cursor, el título y el clic). Se carga después de comun.js; se llama al usar.

/** ¿Se puede ampliar la imagen en esta pantalla? (ancho de escritorio, >= 768 px; sin matchMedia se asume que sí) */
function uiAmpliarImagenPermitido() {
    return !window.matchMedia || window.matchMedia('(min-width: 768px)').matches;
}
