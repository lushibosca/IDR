// Datos de la ayuda de SGI (el modal #modal-atajos lo arma ../shared/ui/js/ayuda.js): atajos, secciones y buscador.
const ATAJOS = [
    // ---- Teclado
    { donde: 'General', tipo: 'teclado', teclas: ['?'], accion: 'Abrir ayuda y atajos (sin foco en campo de texto)' },
    { donde: 'General', tipo: 'teclado', teclas: ['a-z / 0-9'], accion: 'Empezar a buscar: lo que se escribe va al buscador global (con el foco fuera de un campo; Retroceso borra la última letra)' },
    { donde: 'General', tipo: 'teclado', teclas: ['Ctrl', '←'], accion: 'Volver al buscador global (abre el panel lateral si estaba oculto)' },
    { donde: 'General', tipo: 'teclado', teclas: ['Ctrl', '↑ / ↓'], accion: 'Recorrer las pestañas del panel lateral: Dashboard, Movimientos y Ajustes' },
    { donde: 'General', tipo: 'teclado', teclas: ['Esc'], accion: 'Salir paso a paso: limpia la búsqueda, saca el foco del buscador y quita el filtro por año' },
    { donde: 'General', tipo: 'teclado', teclas: ['Ctrl', 'Z'], accion: 'Deshacer el último cambio' },
    { donde: 'General', tipo: 'teclado', teclas: ['Ctrl', 'Y'], accion: 'Rehacer lo deshecho' },
    { donde: 'Movimientos', tipo: 'teclado', teclas: ['+'], accion: 'Registrar una entrada de materiales' },
    { donde: 'Movimientos', tipo: 'teclado', teclas: ['-'], accion: 'Registrar una salida de materiales' },
    { donde: 'Ventanas de movimiento', tipo: 'teclado', teclas: ['+'], accion: 'Agregar una línea de material' },
    { donde: 'Ventanas de movimiento', tipo: 'teclado', teclas: ['-'], accion: 'Quitar la última línea' },
    { donde: 'Ventanas de movimiento', tipo: 'teclado', teclas: ['Enter'], accion: 'Confirmar y guardar (con el foco fuera de un botón o de las notas)' },
    { donde: 'Ventanas', tipo: 'teclado', teclas: ['Esc'], accion: 'Cerrar la ventana de arriba (vuelve a la anterior si se abrió desde otra)' },
    { donde: 'Panel lateral', tipo: 'teclado', teclas: ['Alt', '← → ↑ ↓'], accion: 'En «Ocultar / Mover»: llevar el panel a la izquierda, derecha, arriba o abajo (solo escritorio)' },

    // ---- Mouse y toque
    { donde: 'Dashboard', tipo: 'mouse', gesto: 'Clic en un material', accion: 'Abrir su ficha para verlo o editarlo' },
    { donde: 'Dashboard', tipo: 'mouse', gesto: 'Clic en un encabezado de columna', accion: 'Ordenar por esa columna (otro clic invierte)' },
    { donde: 'Movimientos', tipo: 'mouse', gesto: 'Mantener presionado el mes', accion: 'Expandir o colapsar todos los meses del año' },
    { donde: 'Movimientos', tipo: 'mouse', gesto: 'Clic en un movimiento', accion: 'Abrirlo para verlo o editarlo' },
    { donde: 'Panel lateral', tipo: 'mouse', gesto: 'Rueda sobre el panel', accion: 'Recorrer las pestañas (se apaga en Ajustes > «Rueda sobre el panel lateral»)' },
    { donde: 'Panel lateral', tipo: 'mouse', gesto: 'Mantener presionado «Ocultar / Mover»', accion: 'Arrastrar el panel a otro borde y soltar (solo escritorio)' },
    { donde: 'Panel lateral', tipo: 'mouse', gesto: 'Clic en «Ocultar / Mover»', accion: 'Ocultar o mostrar el panel (solo íconos)' },
    { donde: 'Móvil', tipo: 'mouse', gesto: 'Deslizar a un costado', accion: 'Pasar a la pestaña de al lado' },
];

const AYUDA_SECCIONES = [
    { icono: 'bi-grid-1x2', titulo: 'Dashboard', insignia: 'Inventario', desc: 'Stock actual de materiales, con estadísticas y alertas por umbral.',
      items: [['Materiales', 'stock acumulado, último relevamiento y color según los umbrales bajo y alto.'], ['Año', 'el filtro de la tarjeta Inventario muestra entradas y salidas de un año.']] },
    { icono: 'bi-arrow-left-right', titulo: 'Movimientos', insignia: 'Historial', desc: 'Entradas y salidas, agrupadas por año y mes.',
      items: [['Búsqueda', 'material, ticket, tipo, rango de fechas (15/05, 03/2025, 01/2024 03/2024) y «duplicados» para tickets repetidos.'],
              ['Alta', 'con las teclas + (entrada) y - (salida), o desde Ajustes.']] },
    { icono: 'bi-gear', titulo: 'Ajustes', insignia: 'Configuración', desc: 'Movimientos, inventario, datos y sincronización.',
      items: [['Inventario', 'reporte, categorías de materiales y herramientas.'], ['Datos', 'respaldar, restaurar o restablecer.'],
              ['Sincronización', 'subir y bajar los datos con un Gist de GitHub.']] },
];

const AYUDA_BUSQUEDA = {
    intro: 'El buscador global filtra en tiempo real: en Dashboard por el nombre del material y en Movimientos por tipo, ticket, materiales y comentarios. '
        + 'No distingue mayúsculas ni acentos. Se puede empezar a escribir desde cualquier lugar con las teclas a-z o 0-9. '
        + 'Además entiende fechas (15/05/2024, 03/2025, 15/05) y rangos con dos fechas, y la palabra «duplicados».',
    consejos: [
        'Para ver los movimientos de un mes sin los relevamientos: escribí «03/2025 !relevamiento».',
        'Dos fechas arman un rango: «01/2024 03/2024» muestra de enero a marzo.',
        'Ctrl + ← lleva de inmediato al buscador desde cualquier pestaña.',
    ],
};
