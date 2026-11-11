// Datos de la ayuda de SGP (el modal #modal-atajos lo arma ../shared/ui/js/ayuda.js): atajos, secciones y buscador.
const ATAJOS = [
    // ---- Teclado
    { donde: 'General', tipo: 'teclado', teclas: ['?'], accion: 'Abrir ayuda y atajos (sin foco en campo de texto)' },
    { donde: 'General', tipo: 'teclado', teclas: ['a-z / 0-9'], accion: 'Empezar a buscar: lo que se escribe va al buscador global (con el foco fuera de un campo)' },
    { donde: 'General', tipo: 'teclado', teclas: ['Ctrl', '←'], accion: 'Volver al buscador global (abre el panel lateral si estaba oculto)' },
    { donde: 'General', tipo: 'teclado', teclas: ['Ctrl', '↑ / ↓'], accion: 'Recorrer las pestañas del panel lateral: Estado, Racks y Ajustes' },
    { donde: 'General', tipo: 'teclado', teclas: ['Esc'], accion: 'En el buscador: limpia la búsqueda y saca el foco. En una ventana: la cierra (vuelve a la anterior si se abrió desde otra)' },
    { donde: 'General', tipo: 'teclado', teclas: ['Ctrl', 'Z'], accion: 'Deshacer el último cambio' },
    { donde: 'General', tipo: 'teclado', teclas: ['Ctrl', 'Y'], accion: 'Rehacer lo deshecho (también Ctrl + Mayús + Z)' },
    { donde: 'Ventanas', tipo: 'teclado', teclas: ['Enter'], accion: 'Guardar, en los campos de texto del rack, la patchera y el puerto' },
    { donde: 'Panel lateral', tipo: 'teclado', teclas: ['Alt', '← → ↑ ↓'], accion: 'En «Ocultar / Mover»: llevar el panel a la izquierda, derecha, arriba o abajo (solo escritorio)' },

    // ---- Mouse y toque
    { donde: 'Racks', tipo: 'mouse', gesto: 'Clic en el encabezado de un rack', accion: 'Abrirlo o cerrarlo (se abre de a uno)' },
    { donde: 'Racks', tipo: 'mouse', gesto: 'Clic en el lápiz', accion: 'Editar el rack, o eliminarlo desde la ventana' },
    { donde: 'Patcheras', tipo: 'mouse', gesto: 'Clic en «Editar» de una patchera', accion: 'Cambiar su nombre, posición o tipo, o eliminarla' },
    { donde: 'Puertos', tipo: 'mouse', gesto: 'Pasar el mouse por un puerto', accion: 'Ver su número, destino y notas' },
    { donde: 'Puertos', tipo: 'mouse', gesto: 'Tocar un puerto (pantalla táctil)', accion: 'Ver su destino; un segundo toque lo edita' },
    { donde: 'Puertos', tipo: 'mouse', gesto: 'Clic en un puerto', accion: 'Cargar o editar su etiqueta, notas y color' },
    { donde: 'Estado', tipo: 'mouse', gesto: 'Clic en un edificio', accion: 'Ir a los racks de ese edificio' },
    { donde: 'Panel lateral', tipo: 'mouse', gesto: 'Rueda sobre el panel', accion: 'Recorrer las pestañas (se apaga en Ajustes > «Rueda sobre el panel lateral»)' },
    { donde: 'Panel lateral', tipo: 'mouse', gesto: 'Mantener presionado «Ocultar / Mover»', accion: 'Arrastrar el panel a otro borde y soltar (solo escritorio)' },
    { donde: 'Panel lateral', tipo: 'mouse', gesto: 'Clic en «Ocultar / Mover»', accion: 'Ocultar o mostrar el panel (solo íconos)' },
    { donde: 'Móvil', tipo: 'mouse', gesto: 'Deslizar a un costado', accion: 'Pasar a la pestaña de al lado' },
];

const AYUDA_SECCIONES = [
    { icono: 'bi-grid-1x2', titulo: 'Estado', insignia: 'Resumen', desc: 'Totales de racks, patcheras y puertos con servicio, y el resumen por edificio.',
      items: [['Ocupación', 'el porcentaje de bocas con un servicio cargado (en naranja si pasa el 80 %).'], ['Edificios', 'un clic en un edificio lleva a sus racks.']] },
    { icono: 'bi-hdd-rack', titulo: 'Racks', insignia: 'Patcheras', desc: 'Los racks de telecomunicaciones con sus patcheras y bocas. Los datos se guardan en este navegador.',
      items: [['Rack', 'se crea a mano, trayéndolo de SGR o importando una planilla de Excel.'], ['Patcheras', 'de 24 o 48 puertos RJ45 y de fibra (dúplex verticales u horizontales).'],
              ['Puertos', 'cada boca guarda su destino, notas y un color de referencia.'], ['Filtro', 'por edificio, con el selector del encabezado.']] },
    { icono: 'bi-gear', titulo: 'Ajustes', insignia: 'Configuración', desc: 'Apariencia, racks, datos y sincronización.',
      items: [['Apariencia', 'tema claro u oscuro y reducción de animaciones.'], ['Racks', 'nuevo rack, importar planilla y la lista de edificios (compartida con SGR).'],
              ['Datos', 'respaldar, restaurar o restablecer.'], ['Sincronización', 'subir y bajar los datos con un Gist de GitHub.']] },
];

const AYUDA_BUSQUEDA = {
    intro: 'El buscador global filtra los racks en tiempo real por su nombre, edificio y descripción, y por el nombre de sus patcheras y el número, '
        + 'la etiqueta y las notas de sus puertos. Los racks que coinciden se muestran abiertos y los puertos encontrados se resaltan. '
        + 'No distingue mayúsculas ni acentos. Se puede empezar a escribir desde cualquier lugar con las teclas a-z o 0-9.',
    consejos: [
        'Para ver dónde está cableada una oficina: escribí su nombre, por ejemplo «oficina 102».',
        'Para los racks de un edificio sin las patcheras de fibra: «anexo !fibra».',
        'Ctrl + ← lleva de inmediato al buscador desde cualquier pestaña.',
    ],
};
