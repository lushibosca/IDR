'use strict';
// Ajustes > Datos: exportar el stock a un archivo JSON, importarlo (reemplaza lo de este navegador) y borrarlo todo.
// Lo que reemplaza o borra pide confirmar en dos pasos (como «Quitar todos» de Favoritos: un toque arma y otro, en
// 3 s, confirma). Los datos los maneja js/api-local.js; acá solo están los botones. Solo textContent.

(() => {
    const $ = (id) => document.getElementById(id);

    function titulo(fila) {
        return fila ? fila.querySelector('.ajuste-titulo') : null;
    }

    /** `fila` pasa a pedir confirmación; un segundo toque dentro del plazo hace `accion`. */
    function enDosPasos(fila, textoConfirmar, accion) {
        const t = titulo(fila);
        if (!fila || !t) return;
        const original = t.textContent;
        let armado = false;
        const pintar = (a) => {
            armado = a;
            t.textContent = a ? textoConfirmar : original;
            t.classList.toggle('text-danger', a);
        };
        const volver = uiConfirmacionTemporizada(() => pintar(false));
        const alActivar = () => {
            if (!armado) {
                pintar(true);
                volver.armar();
                return;
            }
            volver.cancelar();
            pintar(false);
            accion();
        };
        fila.addEventListener('click', alActivar);
        fila.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            alActivar();
        });
    }

    function alPulsar(fila, accion) {
        if (!fila) return;
        fila.addEventListener('click', accion);
        fila.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            accion();
        });
    }

    function exportar() {
        uiDescargarTexto(ApiLocal.exportar(), uiNombreArchivo('sgc2-stock', new Date(), 'json'),
            'application/json;charset=utf-8');
        mostrarToast('Datos exportados.', 'success', 2500);
    }

    async function importar(archivo) {
        if (!archivo) return;
        try {
            const r = ApiLocal.importar(await archivo.text());
            const avisos = r.avisos.length ? ` (${r.avisos.join('; ')})` : '';
            mostrarToast(`Datos importados: ${r.dispositivos} dispositivo(s)${avisos}.`, r.avisos.length ? 'warning' : 'success',
                r.avisos.length ? 8000 : 3000);
        } catch (e) {
            const detalle = e && typeof e.detalle === 'function' ? e.detalle() : 'No se pudo importar el archivo.';
            mostrarToast(detalle, 'error', 6000);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        alPulsar($('datos-exportar'), exportar);
        const archivo = $('datos-archivo');
        enDosPasos($('datos-importar'), 'Tocá de nuevo para elegir el archivo (reemplaza todo)', () => archivo && archivo.click());
        if (archivo) {
            archivo.addEventListener('change', async () => {
                const f = archivo.files && archivo.files[0];
                archivo.value = '';
                await importar(f);
            });
        }
        enDosPasos($('datos-borrar'), 'Tocá de nuevo para borrar todo', () => {
            ApiLocal.borrarTodo();
            mostrarToast('Se borraron los datos de este navegador.', 'info', 3000);
        });
        const avisos = ApiLocal.avisosCarga();
        if (avisos.length) mostrarToast(`Datos guardados con observaciones: ${avisos.join('; ')}.`, 'warning', 8000);
    });
})();
