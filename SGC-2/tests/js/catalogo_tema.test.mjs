// El modal de Catálogos usa los colores del tema (tokens --ui-*): con colores fijos de tema oscuro (#e6edf3, #30363d,
// rgba(255, 255, 255, ...)) en modo claro casi no se distinguía nada. Lo único fijo permitido es el texto blanco sobre
// el fondo --ui-primary (se lee en los dos temas) y el respaldo de var(--ui-primary, #0d6efd).
// Ejecutar: node --test tests/js/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { reglas } from "./_css.mjs";

const COLOR_FIJO = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/;

test("Catálogos: ningún color fijo, todo con los tokens del tema", () => {
  const propias = reglas("css/app/activos.css").filter((r) => r.selectores.some((s) => /\.stock-(cat|ubi)-/.test(s)));
  assert.ok(propias.length > 20, "no se encontraron las reglas del modal de Catálogos");
  const fijos = [];
  for (const r of propias) {
    const fondoPrimario = r.decls.some((d) => /^background(-color)?$/.test(d.prop) && /var\(--ui-primary\b/.test(d.valor));
    for (const d of r.decls) {
      const valor = d.valor.replace(/var\(--ui-primary,\s*#0d6efd\)/g, "var(--ui-primary)");
      if (!COLOR_FIJO.test(valor)) continue;
      if (fondoPrimario && d.prop === "color" && /^#fff(fff)?$/i.test(valor)) continue;
      fijos.push(`${r.selectores.join(", ")} { ${d.prop}: ${d.valor} }`);
    }
  }
  assert.deepEqual(fijos, []);
});
