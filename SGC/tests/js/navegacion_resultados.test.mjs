// Funciones puras de static/app.js para navegación espacial y secuencial de resultados por teclado.
// Ejecutar: node --test tests/js/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { cargarBloque } from "./_bloque.mjs";

const api = cargarBloque(
    "app.js",
    "NAVEGACION RESULTADOS PURO",
    { Array, Math, Infinity },
    ["overlapVertical", "calcularSiguienteItemResultado"]
);

test("overlapVertical detecta solapamiento vertical entre rectángulos", () => {
    const a = { top: 10, bottom: 60, height: 50 };
    const b = { top: 20, bottom: 70, height: 50 };
    const c = { top: 100, bottom: 150, height: 50 };

    assert.equal(api.overlapVertical(a, b), true);
    assert.equal(api.overlapVertical(a, c), false);
    assert.equal(api.overlapVertical(null, b), false);
});

test("calcularSiguienteItemResultado: lista vacía retorna -1", () => {
    assert.equal(api.calcularSiguienteItemResultado([], 0, "ArrowRight"), -1);
    assert.equal(api.calcularSiguienteItemResultado(null, 0, "ArrowRight"), -1);
});

test("calcularSiguienteItemResultado: sin foco previo selecciona el primer o último elemento", () => {
    const items = [
        { id: 1, rect: { top: 0, bottom: 50, left: 0, right: 100, width: 100, height: 50 } },
        { id: 2, rect: { top: 0, bottom: 50, left: 110, right: 210, width: 100, height: 50 } },
    ];
    assert.equal(api.calcularSiguienteItemResultado(items, -1, "ArrowRight"), 0);
    assert.equal(api.calcularSiguienteItemResultado(items, -1, "ArrowDown"), 0);
    assert.equal(api.calcularSiguienteItemResultado(items, -1, "ArrowLeft"), 1);
    assert.equal(api.calcularSiguienteItemResultado(items, -1, "ArrowUp"), 1);
});

test("calcularSiguienteItemResultado: lista 1D (sin rects o tabla vertical)", () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
    // Desde el primero (0)
    assert.equal(api.calcularSiguienteItemResultado(items, 0, "ArrowDown"), 1);
    assert.equal(api.calcularSiguienteItemResultado(items, 0, "ArrowRight"), 1);
    assert.equal(api.calcularSiguienteItemResultado(items, 0, "ArrowUp"), -1); // Sale hacia el buscador
    assert.equal(api.calcularSiguienteItemResultado(items, 0, "ArrowLeft"), -1);

    // Desde el del medio (1)
    assert.equal(api.calcularSiguienteItemResultado(items, 1, "ArrowDown"), 2);
    assert.equal(api.calcularSiguienteItemResultado(items, 1, "ArrowUp"), 0);

    // Desde el último (2)
    assert.equal(api.calcularSiguienteItemResultado(items, 2, "ArrowDown"), 2);
    assert.equal(api.calcularSiguienteItemResultado(items, 2, "ArrowUp"), 1);
});

test("calcularSiguienteItemResultado: cuadrícula 2D de tarjetas", () => {
    // 2 filas x 3 columnas
    // Fila 0: 0, 1, 2
    // Fila 1: 3, 4, 5
    const items = [
        { id: 0, rect: { top: 0, bottom: 50, left: 0, right: 100, width: 100, height: 50 } },
        { id: 1, rect: { top: 0, bottom: 50, left: 110, right: 210, width: 100, height: 50 } },
        { id: 2, rect: { top: 0, bottom: 50, left: 220, right: 320, width: 100, height: 50 } },
        { id: 3, rect: { top: 70, bottom: 120, left: 0, right: 100, width: 100, height: 50 } },
        { id: 4, rect: { top: 70, bottom: 120, left: 110, right: 210, width: 100, height: 50 } },
        { id: 5, rect: { top: 70, bottom: 120, left: 220, right: 320, width: 100, height: 50 } },
    ];

    // Navegación horizontal en fila 0
    assert.equal(api.calcularSiguienteItemResultado(items, 0, "ArrowRight"), 1);
    assert.equal(api.calcularSiguienteItemResultado(items, 1, "ArrowRight"), 2);
    assert.equal(api.calcularSiguienteItemResultado(items, 2, "ArrowRight"), 3); // Salto a la siguiente fila

    assert.equal(api.calcularSiguienteItemResultado(items, 1, "ArrowLeft"), 0);
    assert.equal(api.calcularSiguienteItemResultado(items, 0, "ArrowLeft"), -1); // Retrocede antes de la primera
    assert.equal(api.calcularSiguienteItemResultado(items, 3, "ArrowLeft"), 2); // Retrocede a fin de fila anterior

    // Navegación vertical directa (columna correspondiente)
    assert.equal(api.calcularSiguienteItemResultado(items, 0, "ArrowDown"), 3);
    assert.equal(api.calcularSiguienteItemResultado(items, 1, "ArrowDown"), 4);
    assert.equal(api.calcularSiguienteItemResultado(items, 2, "ArrowDown"), 5);

    assert.equal(api.calcularSiguienteItemResultado(items, 3, "ArrowUp"), 0);
    assert.equal(api.calcularSiguienteItemResultado(items, 4, "ArrowUp"), 1);
    assert.equal(api.calcularSiguienteItemResultado(items, 5, "ArrowUp"), 2);

    // Desde fila superior hacia arriba sale al buscador (-1)
    assert.equal(api.calcularSiguienteItemResultado(items, 1, "ArrowUp"), -1);
    // En la última fila hacia abajo se queda en el mismo
    assert.equal(api.calcularSiguienteItemResultado(items, 4, "ArrowDown"), 4);
});

test("calcularSiguienteItemResultado: cruce entre diferentes secciones/acordeones", () => {
    // Acordeón 1: 0, 1 (top: 50)
    // Acordeón 2: 2, 3 (top: 200)
    const items = [
        { id: 'acc1-0', rect: { top: 50, bottom: 100, left: 0, right: 100, width: 100, height: 50 } },
        { id: 'acc1-1', rect: { top: 50, bottom: 100, left: 110, right: 210, width: 100, height: 50 } },
        { id: 'acc2-0', rect: { top: 200, bottom: 250, left: 0, right: 100, width: 100, height: 50 } },
        { id: 'acc2-1', rect: { top: 200, bottom: 250, left: 110, right: 210, width: 100, height: 50 } },
    ];

    // Al avanzar a la derecha desde el último del acordeón 1 entra al primero del acordeón 2
    assert.equal(api.calcularSiguienteItemResultado(items, 1, "ArrowRight"), 2);
    // Al retroceder a la izquierda desde el primero del acordeón 2 va al último del acordeón 1
    assert.equal(api.calcularSiguienteItemResultado(items, 2, "ArrowLeft"), 1);

    // Hacia abajo salta a la tarjeta directamente abajo en el siguiente acordeón
    assert.equal(api.calcularSiguienteItemResultado(items, 0, "ArrowDown"), 2);
    assert.equal(api.calcularSiguienteItemResultado(items, 1, "ArrowDown"), 3);

    // Hacia arriba salta al correspondiente en el acordeón superior
    assert.equal(api.calcularSiguienteItemResultado(items, 3, "ArrowUp"), 1);
});
