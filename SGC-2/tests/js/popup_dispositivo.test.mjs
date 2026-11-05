// Popup de un equipo (Producción y Activos): qué acciones ofrece y la URL de «Ir a la página».
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque, plano } from "./_bloque.mjs";

const api = cargarBloque("produccion.js", "POPUP DISPOSITIVO PURO", { String, RegExp }, ["urlPaginaEquipo", "popupAcciones", "equipoRedDelPopup"]);

test("Ir a la página: solo una IPv4 literal (nunca un nombre ni texto del equipo)", () => {
  assert.equal(api.urlPaginaEquipo("10.32.30.3"), "http://10.32.30.3/");
  assert.equal(api.urlPaginaEquipo(" 192.168.0.1 "), "http://192.168.0.1/");
  for (const malo of ["", null, undefined, "N/A", "-", "evil.example", "10.0.0.256", "10.0.0", "10.0.0.1/x",
    "10.0.0.1:8080", "javascript:alert(1)", "010.0.0.1", "::1"]) {
    assert.equal(api.urlPaginaEquipo(malo), null, String(malo));
  }
});

test("acciones: un canal en producción ofrece Auditoría (de la cámara) e Ir a la página", () => {
  assert.deepEqual(plano(api.popupAcciones({ enProduccion: true, nvrIp: "10.0.0.1", canal: "3", ip: "10.32.30.3" })),
    { auditoria: true, auditoriaCamara: true, caidas: true, pagina: true });
});

test("acciones en Activos: fuera de producción no hay Auditoría ni página; sin vínculo con el escaneo, no hay Auditoría", () => {
  assert.deepEqual(plano(api.popupAcciones({ enProduccion: false, nvrIp: "10.0.0.1", canal: "3", ip: "10.32.30.3" })),
    { auditoria: false, auditoriaCamara: true, caidas: false, pagina: false });
  assert.deepEqual(plano(api.popupAcciones({ enProduccion: true, ip: "10.32.30.3" })),
    { auditoria: false, auditoriaCamara: false, caidas: false, pagina: true });
  assert.deepEqual(plano(api.popupAcciones({ enProduccion: true, ip: "N/A" })), { auditoria: false, auditoriaCamara: false, caidas: false, pagina: false });
  assert.deepEqual(plano(api.popupAcciones(null)), { auditoria: false, auditoriaCamara: false, caidas: false, pagina: false });
});

test("acciones: un grabador en producción se audita en Auditoría > Grabador", () => {
  assert.deepEqual(plano(api.popupAcciones({ enProduccion: true, esGrabador: true, nvrIp: "10.0.0.1", ip: "10.0.0.1" })),
    { auditoria: true, auditoriaCamara: false, caidas: true, pagina: true });
});

test("acciones: un equipo de red instalado ofrece su historial de caídas pero no Auditoría", () => {
  assert.deepEqual(plano(api.popupAcciones({ enProduccion: true, equipoRed: true, ip: "10.0.5.9" })),
    { auditoria: false, auditoriaCamara: false, caidas: true, pagina: true });
  assert.equal(api.popupAcciones({ enProduccion: false, equipoRed: true, ip: "10.0.5.9" }).caidas, false);
  assert.equal(api.popupAcciones({ enProduccion: true, equipoRed: false, ip: "10.0.5.9" }).caidas, false);
});

test("equipo de red del popup: misma IP y sin grabador ni canal", () => {
  const equipos = [{ ip: "10.0.5.9", nombre: "Decoder 1" }, null, { ip: 7 }];
  assert.equal(api.equipoRedDelPopup({ ip_address: " 10.0.5.9 " }, equipos).nombre, "Decoder 1");
  assert.equal(api.equipoRedDelPopup({ ip_address: "10.0.5.9", channel_id: 3 }, equipos), null);
  assert.equal(api.equipoRedDelPopup({ ip_address: "10.0.5.9", nvr_ip: "10.0.0.1" }, equipos), null);
  assert.equal(api.equipoRedDelPopup({ ip_address: "10.0.5.10" }, equipos), null);
  assert.equal(api.equipoRedDelPopup({ ip_address: "" }, equipos), null);
  assert.equal(api.equipoRedDelPopup(null, null), null);
});
