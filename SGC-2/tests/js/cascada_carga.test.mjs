// Cascada de carga del dashboard: el retraso sale del lugar de la sección en el panel, no de su medida al pintar.
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque } from "./_bloque.mjs";

const { retrasoCascada, filaCascada } = cargarBloque("resumen.js", "CASCADA DE CARGA", { Math },
    ["retrasoCascada", "filaCascada"]);

const zonas = { arriba: ["monitoreo"], izq: ["disponibilidad", "canales", "activos"], der: ["favoritos", "alertas"] };

test("lo más cercano al encabezado entra antes", () => {
    assert.ok(retrasoCascada(zonas, "monitoreo", 100) < retrasoCascada(zonas, "disponibilidad", 100));
    assert.ok(retrasoCascada(zonas, "disponibilidad", 100) < retrasoCascada(zonas, "canales", 100));
    assert.ok(retrasoCascada(zonas, "canales", 100) < retrasoCascada(zonas, "activos", 100));
});

test("a igual fila, primero la columna izquierda", () => {
    assert.ok(retrasoCascada(zonas, "disponibilidad", 100) < retrasoCascada(zonas, "favoritos", 100));
    assert.equal(filaCascada(zonas, "favoritos"), filaCascada(zonas, "disponibilidad"));
});
