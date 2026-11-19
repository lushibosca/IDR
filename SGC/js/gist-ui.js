'use strict';
// Modal Respaldo y sincronización (js/gist.js): paneles desplegables (Conexión y Frase), insignias de estado,
// botones de acción e interruptores. Solo textContent.

(() => {
    const $ = (id) => document.getElementById(id);

    function mostrarEstado(texto, tipo = 'info') {
        const el = $('gist-estado');
        if (!el) return;
        el.textContent = texto;
        el.classList.toggle('text-danger', tipo === 'error');
    }

    function alternarPanel(botonId, abrir) {
        const btn = $(botonId);
        const panel = btn && $(btn.getAttribute('aria-controls'));
        if (!btn || !panel) return;
        const abierto = abrir === undefined ? btn.getAttribute('aria-expanded') !== 'true' : Boolean(abrir);
        btn.setAttribute('aria-expanded', String(abierto));
        panel.classList.toggle('show', abierto);
    }

    function recordarFraseActivo() {
        const sw = $('gist-recordar-frase');
        return !!sw && sw.getAttribute('aria-checked') === 'true';
    }

    function pintarResumen() {
        const c = GistSync.config.leer();
        const gistId = ($('gist-id').value || '').trim() || c.gistId;
        const tieneToken = Boolean(($('gist-token').value || '').trim() || GistSync.secreto.leer('gist_token'));
        const ultimaTexto = c.ultima ? new Date(c.ultima).toLocaleString() : '';
        const est = gistEstadoDestino({ gistId, tieneToken, ultimaTexto });
        if ($('gist-ultima')) $('gist-ultima').textContent = est.detalle;
        const badge = $('gist-badge');
        if (badge) {
            badge.textContent = est.insignia;
            badge.className = `badge rounded-pill respaldo-pill ${est.clase}`;
        }
        if ($('respaldo-resumen')) {
            $('respaldo-resumen').textContent = gistResumenAjustes({ gistId, tieneToken, auto: c.auto });
        }
    }

    function pintarFrase() {
        const valor = $('gist-frase').value;
        const e = gistEvaluarFrase(valor);
        const aviso = $('gist-frase-aviso');
        if (aviso) {
            aviso.textContent = valor ? e.motivo : '';
            aviso.classList.toggle('text-danger', !e.ok);
        }
        const resumen = $('gist-cifrado-resumen');
        if (resumen) resumen.textContent = gistResumenCifrado(valor, recordarFraseActivo());
    }

    function pintarAuto() {
        uiInterruptor($('gist-auto'), GistSync.config.leer().auto);
    }

    function leerCampos({ validarToken = false } = {}) {
        const c = GistSync.config.leer();
        const gistId = ($('gist-id').value || '').trim();
        if (gistId && !GIST_RE_ID.test(gistId)) {
            throw new ErrorGist('El ID del Gist no es válido (letras a-f y números).', 'config');
        }
        const token = ($('gist-token').value || '').trim();
        if (validarToken && token && !GIST_RE_TOKEN.test(token)) {
            throw new ErrorGist('El token no parece válido (solo letras, números y «_»).', 'token');
        }
        const recordarToken = $('gist-recordar-token').checked;
        const recordarFrase = recordarFraseActivo();
        GistSync.secreto.guardar('gist_token', token, recordarToken);
        GistSync.secreto.guardar('gist_frase', gistNormalizarFrase($('gist-frase').value), recordarFrase);
        GistSync.config.guardar({ ...c, gistId, recordarToken, recordarFrase });
    }

    function senalarError(err) {
        if (!err || !err.codigo) return;
        if (err.codigo === 'frase') {
            alternarPanel('gist-cifrado-toggle', true);
            $('gist-frase').focus();
        } else if (err.codigo === 'token' || err.codigo === 'config') {
            alternarPanel('gist-conexion-toggle', true);
            $(err.codigo === 'token' ? 'gist-token' : 'gist-id').focus();
        }
    }

    async function ejecutar(opciones, { silencioso = false } = {}) {
        const botones = document.querySelectorAll('.gist-accion');
        botones.forEach((b) => { b.disabled = true; });
        mostrarEstado('Sincronizando…');
        try {
            const r = await GistSync.sincronizar(opciones);
            if (r.accion === 'pendiente') return;
            const resto = r.avisos.length ? ` Observaciones: ${r.avisos.join('; ')}.` : '';
            mostrarEstado(r.texto + resto, r.avisos.length ? 'warning' : 'success');
            if (!silencioso || r.avisos.length || r.accion === 'sincronizado') {
                mostrarToast(r.texto + resto, r.avisos.length ? 'warning' : 'success', r.avisos.length ? 8000 : 3500);
            }
            if (r.gistId && $('gist-id')) $('gist-id').value = r.gistId;
        } catch (e) {
            const m = e && typeof e.detalle === 'function' ? e.detalle() : e && e.message ? e.message : 'No se pudo sincronizar.';
            mostrarEstado(m, 'error');
            mostrarToast(m, 'error', 7000);
            if (!silencioso) senalarError(e);
        } finally {
            botones.forEach((b) => { b.disabled = false; });
            pintarResumen();
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        if (!$('gist-id') || typeof GistSync === 'undefined') return;
        GistSync.conEjecutor(ejecutar);

        const c = GistSync.config.leer();
        $('gist-id').value = c.gistId;
        $('gist-token').value = GistSync.secreto.leer('gist_token');
        $('gist-frase').value = GistSync.secreto.leer('gist_frase');
        $('gist-recordar-token').checked = c.recordarToken;
        uiInterruptor($('gist-recordar-frase'), c.recordarFrase);
        pintarAuto();
        pintarResumen();
        pintarFrase();

        $('gist-frase').addEventListener('input', pintarFrase);
        $('gist-id').addEventListener('input', pintarResumen);
        $('gist-token').addEventListener('input', pintarResumen);

        const alPulsar = (id, fn) => { if ($(id)) $(id).addEventListener('click', fn); };
        const verCampo = (boton, campo, ver) => {
            $(campo).type = ver ? 'text' : 'password';
            $(boton).querySelector('i').className = ver ? 'bi bi-eye-slash' : 'bi bi-eye';
        };
        const conCampos = (opciones) => () => {
            try { leerCampos(); } catch (e) { mostrarEstado(e.message, 'error'); mostrarToast(e.message, 'error', 5000); senalarError(e); return; }
            ejecutar(opciones);
        };

        alPulsar('gist-conexion-toggle', () => alternarPanel('gist-conexion-toggle'));
        alPulsar('gist-cifrado-toggle', () => alternarPanel('gist-cifrado-toggle'));
        alPulsar('gist-sincronizar', conCampos({}));
        alPulsar('gist-crear', conCampos({ crear: true }));

        alPulsar('gist-guardar-conexion', () => {
            try { leerCampos({ validarToken: true }); } catch (e) { mostrarToast(e.message, 'error', 5000); senalarError(e); return; }
            pintarResumen();
            alternarPanel('gist-conexion-toggle', false);
            mostrarToast('Conexión guardada.', 'success', 2500);
        });

        alPulsar('gist-guardar-frase', () => {
            const valor = $('gist-frase').value;
            const e = gistEvaluarFrase(valor);
            if (valor.trim() && !e.ok) {
                mostrarToast(e.motivo, 'error', 5000);
                $('gist-frase').focus();
                return;
            }
            try { leerCampos(); } catch (err) { mostrarToast(err.message, 'error', 5000); return; }
            pintarFrase();
            alternarPanel('gist-cifrado-toggle', false);
            mostrarToast(e.frase ? 'Frase de cifrado aplicada.' : 'Frase borrada.', 'success', 2500);
        });

        alPulsar('gist-generar', () => {
            const f = gistGenerarFrase((n) => [...crypto.getRandomValues(new Uint8Array(n))]);
            $('gist-frase').value = f;
            verCampo('gist-ver', 'gist-frase', true);
            pintarFrase();
            mostrarToast('Frase generada: anotala en un lugar seguro. Sin ella no se puede leer el Gist.', 'warning', 9000);
        });

        for (const [boton, campo] of [['gist-ver-token', 'gist-token'], ['gist-ver', 'gist-frase']]) {
            alPulsar(boton, () => verCampo(boton, campo, $(campo).type === 'password'));
        }

        alPulsar('gist-recordar-frase', () => {
            const recordar = !recordarFraseActivo();
            uiInterruptor($('gist-recordar-frase'), recordar);
            try { leerCampos(); } catch (e) { mostrarToast(e.message, 'error', 5000); return; }
            pintarFrase();
            mostrarToast(recordar ? 'La frase se recordará en este navegador.' : 'La frase valdrá solo hasta cerrar el navegador.', 'info', 3000);
        });

        alPulsar('gist-auto', () => {
            const auto = !GistSync.config.leer().auto;
            try { leerCampos(); } catch (e) { mostrarToast(e.message, 'error', 5000); return; }
            GistSync.config.guardar({ ...GistSync.config.leer(), auto });
            pintarAuto();
            pintarResumen();
            mostrarToast(auto ? 'Los cambios se suben solos a los pocos segundos.' : 'Sincronización automática desactivada.', 'info', 3000);
        });

        alPulsar('gist-olvidar', () => {
            GistSync.olvidarSecretos();
            $('gist-token').value = '';
            $('gist-frase').value = '';
            pintarAuto();
            pintarFrase();
            pintarResumen();
            mostrarToast('Token y frase olvidados en este navegador.', 'info', 3000);
        });

        document.addEventListener('sgc:gist-olvidado', () => {
            for (const id of ['gist-id', 'gist-token', 'gist-frase']) $(id).value = '';
            $('gist-recordar-token').checked = false;
            uiInterruptor($('gist-recordar-frase'), false);
            pintarAuto();
            pintarFrase();
            pintarResumen();
            mostrarEstado('');
        });

        const modal = $('respaldoModal');
        if (modal) {
            modal.addEventListener('ui:modal-abrir', () => {
                alternarPanel('gist-conexion-toggle', false);
                alternarPanel('gist-cifrado-toggle', false);
                pintarResumen();
                pintarFrase();
                pintarAuto();
            });
        }

        // al abrir: si está todo guardado y la automática activa, se baja lo que hayan subido otros
        if (GistSync.listoParaAuto()) ejecutar({}, { silencioso: true });
    });
})();
