// Datos de la ayuda de SGR (el modal #modal-atajos lo arma ../shared/ui/js/ayuda.js): atajos, secciones y buscador.
const ATAJOS = [
    // ---- Teclado
    { donde: 'General', tipo: 'teclado', teclas: ['?'], accion: 'Abrir ayuda y atajos (sin foco en campo de texto)' },
    { donde: 'General', tipo: 'teclado', teclas: ['a-z / 0-9'], accion: 'Empezar a buscar: lo que se escribe va al buscador global (con el foco fuera de un campo; Retroceso borra la última letra)' },
    { donde: 'General', tipo: 'teclado', teclas: ['Ctrl', '←'], accion: 'Volver al buscador global (abre el panel lateral si estaba oculto)' },
    { donde: 'General', tipo: 'teclado', teclas: ['Ctrl', '↑ / ↓'], accion: 'Recorrer las pestañas del panel lateral: Dashboard, Inventario, Servicio y Ajustes' },
    { donde: 'General', tipo: 'teclado', teclas: ['Esc'], accion: 'Salir paso a paso: cierra el menú «+», limpia la búsqueda o saca el foco del buscador' },
    { donde: 'General', tipo: 'teclado', teclas: ['Ctrl', 'Z'], accion: 'Deshacer el último cambio' },
    { donde: 'General', tipo: 'teclado', teclas: ['Ctrl', 'Y'], accion: 'Rehacer lo deshecho' },
    { donde: 'Racks', tipo: 'teclado', teclas: ['+'], accion: 'Poner un rack en servicio (abre «Rack en servicio»)' },
    { donde: 'Ventanas', tipo: 'teclado', teclas: ['Enter'], accion: 'Guardar o confirmar la ventana abierta (con el foco fuera de un botón o del cuadro de notas)' },
    { donde: 'Ventanas', tipo: 'teclado', teclas: ['Esc'], accion: 'Cerrar la ventana de arriba (vuelve a la anterior si se abrió desde otra)' },
    { donde: 'Búsqueda', tipo: 'teclado', teclas: ['← → ↑ ↓'], accion: 'En el menú de campos del buscador: moverse entre las opciones (Esc lo cierra)' },
    { donde: 'Panel lateral', tipo: 'teclado', teclas: ['Alt', '← → ↑ ↓'], accion: 'En «Ocultar / Mover»: llevar el panel a la izquierda, derecha, arriba o abajo (solo escritorio)' },

    // ---- Mouse y toque
    { donde: 'Racks', tipo: 'mouse', gesto: 'Clic en una fila o tarjeta', accion: 'Abrir el rack para verlo o editarlo' },
    { donde: 'Racks', tipo: 'mouse', gesto: 'Clic en un encabezado de columna', accion: 'Ordenar por esa columna (otro clic invierte)' },
    { donde: 'Buscador', tipo: 'mouse', gesto: 'Clic en el ícono de filtros', accion: 'Elegir en qué campos busca (número, patrimonio, marca, edificio, estado...)' },
    { donde: 'Panel lateral', tipo: 'mouse', gesto: 'Rueda sobre el panel', accion: 'Recorrer las pestañas (se apaga en Ajustes > «Rueda sobre el panel lateral»)' },
    { donde: 'Panel lateral', tipo: 'mouse', gesto: 'Mantener presionado «Ocultar / Mover»', accion: 'Arrastrar el panel a otro borde y soltar (solo escritorio)' },
    { donde: 'Panel lateral', tipo: 'mouse', gesto: 'Clic en «Ocultar / Mover»', accion: 'Ocultar o mostrar el panel (solo íconos)' },
    { donde: 'Móvil', tipo: 'mouse', gesto: 'Deslizar a un costado', accion: 'Pasar a la pestaña de al lado' },
];

const AYUDA_SECCIONES = [
    { icono: 'bi-grid-1x2', titulo: 'Dashboard', insignia: 'Resumen', desc: 'Panorama de los racks: cuántos hay, en qué estado y dónde están.',
      items: [['Estados', 'disponibles, en servicio y dados de baja.'], ['Edificios', 'cuántos racks hay en cada edificio.']] },
    { icono: 'bi-box-seam', titulo: 'Inventario', insignia: 'Racks', desc: 'Todos los racks de la suite. Los datos se guardan en este navegador.',
      items: [['Búsqueda', 'palabras libres, frases entre comillas y exclusión con ! o -.'], ['Agrupar', 'por estado, patrimonio, edificio y más.'],
              ['Alta', 'el botón «+» (o la tecla +) agrega un rack nuevo o pone uno en servicio.']] },
    { icono: 'bi-hdd-rack', titulo: 'Servicio', insignia: 'Instalados', desc: 'Racks en servicio, con su edificio, piso y dependencia.',
      items: [['Ficha', 'número, ubicación, patrimonio y notas; desde ahí se da de baja o se vuelve a inventario.']] },
    { icono: 'bi-gear', titulo: 'Ajustes', insignia: 'Configuración', desc: 'Apariencia, datos y sincronización.',
      items: [['Apariencia', 'tema claro u oscuro y reducción de animaciones.'], ['Datos', 'respaldar, restaurar o restablecer.'],
              ['Edificios', 'la lista de edificios, compartida con las demás aplicaciones de la suite.'], ['Sincronización', 'subir y bajar los datos con un Gist de GitHub.']] },
];

const AYUDA_BUSQUEDA = {
    intro: 'El buscador global filtra en tiempo real por número, patrimonio, marca, modelo, identificador, edificio, dependencia, estado y notas '
        + '(se pueden elegir los campos con el ícono de filtros). No distingue mayúsculas ni acentos. Se puede empezar a escribir desde cualquier lugar con las teclas a-z o 0-9.',
    consejos: [
        'Para ver los racks de un edificio que no están en servicio: escribí «anexo !servicio».',
        'Con comillas o paréntesis la palabra tiene que estar completa: «"c"» no encuentra «anexo c».',
        'Ctrl + ← lleva de inmediato al buscador desde cualquier pestaña.',
    ],
};
