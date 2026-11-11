// Botón «Instalar» de la barra superior (#btn-install-app, oculto con `hidden`): el navegador avisa con `beforeinstallprompt` que la
// app se puede instalar; se guarda el aviso, se muestra el botón y, al tocarlo, se abre el cuadro nativo de instalación (se usa una
// sola vez). Sin el aviso (ya instalada, o un navegador que no lo ofrece) el botón queda oculto.
(function () {
    'use strict';
    const boton = document.getElementById('btn-install-app');
    if (!boton) return;
    let aviso = null;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();               // sin el mini-cartel del navegador: el botón es el nuestro
        aviso = e;
        boton.hidden = false;
    });
    boton.addEventListener('click', async () => {
        if (!aviso) return;
        aviso.prompt();
        try { await aviso.userChoice; } catch (_) { /* cerrado sin elegir */ }
        aviso = null;
        boton.hidden = true;
    });
    window.addEventListener('appinstalled', () => { aviso = null; boton.hidden = true; });
})();
