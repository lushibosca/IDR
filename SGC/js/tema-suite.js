// El tema de SGC sigue al de la suite (IDR_dark, ../shared/idr-tema.js): si se cambia en otra app o ventana mientras esta está
// abierta, o si la página vuelve del caché de «atrás/adelante» con el tema viejo, se vuelve a aplicar. initTheme (app.js) lee la
// clave de la suite; acá solo se lo vuelve a llamar. Se carga después de app.js.
IDRTema.alCambiar(() => initTheme());
window.addEventListener('pageshow', (e) => { if (e.persisted) initTheme(); });
