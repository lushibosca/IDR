'use strict';
// Páginas de modelos importadas de cctv_monitor (URLs públicas de fabricantes). Se siembran una sola vez en
// `sgc2/datos_v1` sin pisar enlaces que la persona ya haya cargado en Catálogos > Modelos.

// ==== MODELOS BASE PURO BEGIN ====
const MODELOS_PAGINA_BASE = [
    ['Dahua', 'DH-IPC-HDPW1230R1P-0280B-S5', 'https://www.dahuasecurity.com/la/products/Discontinued-Products/Network-Cameras/IPC-HDBW1230E'],
    ['Hikvision', 'DS-2CD1323G0E-I', 'https://www.hikvision.com/es-la/products/IP-Products/Network-Cameras/value-series/ds-2cd1323g0e-i/'],
    ['Hikvision', 'DS-2CD2023G0-I', 'https://www.hikvision.com/es-la/products/IP-Products/Network-Cameras/Pro-Series-EasyIP-/DS-2CD2023G0-I1/'],
    ['Hikvision', 'DS-2CD2112-I', 'https://www.hikvision.com/es-la/products/IP-Products/Network-Cameras/value-series/ds-2cd1121-i/'],
    ['Hikvision', 'DS-2CD2123G0-I', 'https://www.hikvision.com/es-la/products/IP-Products/Network-Cameras/Pro-Series-EasyIP-/DS-2CD2123G0-I-S-1/?subName=DS-2CD2123G0-I'],
    ['Hikvision', 'DS-2CD2625FHWD-IZS', 'https://www.hikvision.com/es-la/products/IP-Products/Network-Cameras/Pro-Series-EasyIP-/DS-2CD2625FHWD-IZS/'],
    ['Hikvision', 'DS-2CD2625FWD-IZS', 'https://www.hikvision.com/es-la/products/IP-Products/Network-Cameras/Pro-Series-EasyIP-/DS-2CD2625FWD-IZS/?subName=DS-2CD2625FWD-IZS'],
    ['Hikvision', 'DS-2CD2721G0-IS', 'https://www.hikvision.com/es-la/products/IP-Products/Network-Cameras/Pro-Series-EasyIP-/ds-2cd2721g0-i-z--s-/'],
    ['Hikvision', 'DS-2CD2746G2T-IZS', 'https://www.hikvision.com/es-la/products/IP-Products/Network-Cameras/Pro-Series-EasyIP-/ds-2cd2746g2t-izs/'],
    ['Hikvision', 'DS-2DE5225IW-AE', 'https://www.hikvision.com/es-la/products/IP-Products/PTZ-Cameras/Pro-Series/ds-2de5225iw-ae-s6-/'],
    ['Hikvision', 'DS-2DF6A236X-AEL', 'https://www.hikvision.com/mx/products/IP-Products/PTZ-Cameras/Ultra-Series/ds-2df6a236x-ael/'],
    ['Hikvision', 'DS-2DF6A436X-AEL', 'https://www.hikvision.com/es-la/products/IP-Products/PTZ-Cameras/Ultra-Series/ds-2df6a436x-ael-t5-/'],
    ['Hikvision', 'DS-6916UDI', 'https://www.hikvision.com/es-la/products/display-and-control/controllers/decoders/ds-6916udi-c-/'],
    ['Hikvision', 'DS-7616NI-k2', 'https://www.hikvision.com/es-co/products/IP-Products/Network-Video-Recorders/Pro-Series/ds-7616ni-k2/'],
    ['Hikvision', 'DS-96128NI-I16', 'https://www.hikvision.com/es-la/products/IP-Products/Network-Video-Recorders/Ultra-Series/ds-96128ni-i16/'],
    ['Hikvision', 'DS-9664NI-I16', 'https://www.hikvision.com/es-la/products/IP-Products/Network-Video-Recorders/Ultra-Series/ds-9664ni-i16/'],
    ['Hikvision', 'DS-D2046TL-2B', 'https://pro-av.hikvision.com/es/products/lcd-video-walls/lcd-video-walls/pro-series/ds-d2046tl-2b/'],
    ['Hikvision', 'DS-IX2002-A3U/X', 'https://www.hikvision.com/es-la/products/IP-Products/deepinmind-intelligence/deepinmind-server/ds-ix2002-a3u-x/'],
    ['Hikvision', 'ds-1200kl', 'https://www.hikvision.com/es-la/products/display-and-control/control-and-decode/keyboards/ds-1200ki/']
];

/** Agrega a `actuales` las páginas de `base` que falten (por modelo, sin distinguir mayúsculas ni pisar las existentes). */
function sembrarModelosPagina(actuales, base = MODELOS_PAGINA_BASE) {
    const lista = Array.isArray(actuales) ? actuales.map((p) => ({ ...p })) : [];
    const vistos = new Set(lista.map((p) => String(p && p.modelo || '').trim().toLowerCase()).filter(Boolean));
    let agregados = 0;
    for (const [marca, modelo, pagina] of Array.isArray(base) ? base : []) {
        const clave = String(modelo || '').trim().toLowerCase();
        if (!clave || vistos.has(clave)) continue;
        vistos.add(clave);
        lista.push({ marca, modelo, pagina });
        agregados++;
    }
    return { lista, agregados };
}
// ==== MODELOS BASE PURO END ====
