/**
 * SGP — Parser e Importador de Planillas de Patcheras
 * Permite importar relevamientos desde archivos Excel (.xlsx), CSV, TSV
 * o celdas copiadas directamente desde Excel (Ctrl+C / Ctrl+V).
 */

'use strict';

const PlanillaParser = (function () {

    /**
     * Extrae archivos comprimidos de un archivo XLSX (formato ZIP)
     * utilizando la API nativa del navegador DecompressionStream.
     */
    async function unzipXlsx(arrayBuffer) {
        const u8 = new Uint8Array(arrayBuffer);
        const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
        const files = {};
        let offset = 0;

        while (offset + 30 <= u8.length) {
            const sig = view.getUint32(offset, true);
            if (sig !== 0x04034b50) {
                // Si encontramos cabecera de directorio central o fin de zip, salimos
                if (sig === 0x02014b50 || sig === 0x06054b50) break;
                offset++;
                continue;
            }

            const method = view.getUint16(offset + 8, true);
            const compSize = view.getUint32(offset + 18, true);
            const nameLen = view.getUint16(offset + 26, true);
            const extraLen = view.getUint16(offset + 28, true);
            const nameBuf = u8.subarray(offset + 30, offset + 30 + nameLen);
            const name = new TextDecoder('utf-8').decode(nameBuf);
            const dataStart = offset + 30 + nameLen + extraLen;
            const dataEnd = dataStart + compSize;

            if (dataEnd <= u8.length) {
                const rawData = u8.subarray(dataStart, dataEnd);
                let fileData = null;

                if (method === 0) {
                    fileData = new TextDecoder('utf-8').decode(rawData);
                } else if (method === 8 && typeof DecompressionStream !== 'undefined') {
                    try {
                        const ds = new DecompressionStream('deflate-raw');
                        const writer = ds.writable.getWriter();
                        writer.write(rawData);
                        writer.close();
                        const res = await new Response(ds.readable).arrayBuffer();
                        fileData = new TextDecoder('utf-8').decode(res);
                    } catch (err) {
                        console.warn('Error descomprimiendo entrada zip:', name, err);
                    }
                }

                if (fileData) files[name] = fileData;
                offset = dataEnd;
            } else {
                break;
            }
        }
        return files;
    }

    /**
     * Convierte referencias de celda Excel (ej. "A1", "B4", "AA12") a { col, row } base 0.
     */
    function _colLetraAIndice(ref) {
        const match = String(ref || '').match(/^([A-Za-z]+)(\d+)$/);
        if (!match) return { col: 0, row: 0 };
        const letters = match[1].toUpperCase();
        const rowNum = parseInt(match[2], 10) - 1;
        let colNum = 0;
        for (let i = 0; i < letters.length; i++) {
            colNum = colNum * 26 + (letters.charCodeAt(i) - 64);
        }
        return { col: colNum - 1, row: rowNum };
    }

    /**
     * Parsea strings compartidos de xl/sharedStrings.xml.
     */
    function _parsearSharedStrings(ssXml) {
        const sharedStrings = [];
        if (!ssXml) return sharedStrings;

        const siMatches = ssXml.match(/<si[\s\S]*?<\/si>/g) || [];
        for (const si of siMatches) {
            const tMatches = si.match(/<t(?:\s+[^>]*?)?>([\s\S]*?)<\/t>/g) || [];
            let s = '';
            for (const t of tMatches) {
                s += t.replace(/^<t(?:\s+[^>]*?)?>|<\/t>$/g, '')
                      .replace(/&amp;/g, '&')
                      .replace(/&lt;/g, '<')
                      .replace(/&gt;/g, '>')
                      .replace(/&quot;/g, '"')
                      .replace(/&#39;/g, "'");
            }
            sharedStrings.push(s);
        }
        return sharedStrings;
    }

    /**
     * Parsea una hoja de cálculo XML individual a una matriz 2D de celdas.
     */
    function _sheetXmlAMatriz(sheetXml, sharedStrings) {
        const grid = [];
        // Regex robusta para capturar todas las celdas <c ...>...</c> o <c .../>
        const cellRegex = /<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
        let m;

        while ((m = cellRegex.exec(sheetXml)) !== null) {
            const attrs = m[1];
            const body = m[2] || '';
            const rMatch = attrs.match(/r="([A-Za-z0-9]+)"/);
            if (!rMatch) continue;

            const { col, row } = _colLetraAIndice(rMatch[1]);
            const typeMatch = attrs.match(/t="([a-z]+)"/);
            const type = typeMatch ? typeMatch[1] : '';

            let val = '';
            if (type === 's') {
                const vMatch = body.match(/<v>(\d+)<\/v>/);
                if (vMatch) {
                    const idx = parseInt(vMatch[1], 10);
                    val = sharedStrings[idx] || '';
                }
            } else if (type === 'inlineStr') {
                const tMatch = body.match(/<t(?:\s+[^>]*?)?>([\s\S]*?)<\/t>/);
                val = tMatch ? tMatch[1] : '';
            } else {
                const vMatch = body.match(/<v>([\s\S]*?)<\/v>/);
                val = vMatch ? vMatch[1] : '';
            }

            if (!grid[row]) grid[row] = [];
            grid[row][col] = String(val).trim();
        }

        return grid;
    }

    /**
     * Parsea un buffer de archivo XLSX y retorna todos los racks encontrados en las hojas.
     */
    async function parsearXlsxBuffer(arrayBuffer) {
        const files = await unzipXlsx(arrayBuffer);
        const sharedStringsXml = files['xl/sharedStrings.xml'] || '';
        const sharedStrings = _parsearSharedStrings(sharedStringsXml);

        // Mapear relaciones de hojas desde workbook.xml.rels
        const relsXml = files['xl/_rels/workbook.xml.rels'] || '';
        const relMap = {};
        const relMatches = relsXml.match(/<Relationship\s+[^>]*?\/>/g) || [];
        for (const rel of relMatches) {
            const idMatch = rel.match(/Id="([^"]+)"/);
            const targetMatch = rel.match(/Target="([^"]+)"/);
            if (idMatch && targetMatch) {
                // Normalizar ruta interna
                let target = targetMatch[1].replace(/^\//, '');
                if (!target.startsWith('xl/')) target = 'xl/' + target;
                relMap[idMatch[1]] = target;
            }
        }

        // Descubrir hojas desde xl/workbook.xml
        const wbXml = files['xl/workbook.xml'] || '';
        const sheetList = [];
        const sheetMatches = wbXml.match(/<sheet\s+[^>]*?\/>/g) || [];
        for (const s of sheetMatches) {
            const nameMatch = s.match(/name="([^"]+)"/);
            const rIdMatch = s.match(/r:id="([^"]+)"/);
            const sheetName = nameMatch ? nameMatch[1] : 'Hoja';
            const rId = rIdMatch ? rIdMatch[1] : '';
            const path = relMap[rId] || '';
            if (path && files[path]) {
                sheetList.push({ name: sheetName, path });
            }
        }

        // Si no se encontraron por workbook.xml, buscar directamente en las claves de archivos
        if (!sheetList.length) {
            Object.keys(files)
                .filter(k => k.startsWith('xl/worksheets/sheet') && k.endsWith('.xml'))
                .sort()
                .forEach((k, idx) => sheetList.push({ name: `Hoja ${idx + 1}`, path: k }));
        }

        if (!sheetList.length) {
            throw new Error('No se encontró ninguna hoja de cálculo válida en el archivo Excel.');
        }

        // Procesar cada hoja buscando patcheras
        const racksEncontrados = [];
        for (const sheet of sheetList) {
            const sheetXml = files[sheet.path];
            if (!sheetXml) continue;

            const grid = _sheetXmlAMatriz(sheetXml, sharedStrings);
            if (!grid.length) continue;

            try {
                const res = parsearMatrizPatcheras(grid, sheet.name);
                if (res && res.patcheras && res.patcheras.length > 0) {
                    racksEncontrados.push({
                        sheetName: sheet.name,
                        rackNombre: res.rackNombre || `Rack ${sheet.name}`,
                        rackFecha: res.rackFecha,
                        patcheras: res.patcheras
                    });
                }
            } catch (_) {
                // Si la hoja no contiene patcheras (ej. hoja de notas o portada), se omite
            }
        }

        if (!racksEncontrados.length) {
            throw new Error('No se detectaron patcheras en el archivo Excel. Verificá que contenga filas con números de boca del 1 al 24.');
        }

        // Retornar el primer rack como principal, incluyendo todos los detectados
        const principal = racksEncontrados[0];
        return {
            rackNombre: principal.rackNombre,
            rackFecha: principal.rackFecha,
            patcheras: principal.patcheras,
            todosRacks: racksEncontrados
        };
    }

    /**
     * Parsea texto delimitado (TSV de portapapeles o archivo CSV).
     */
    function parsearTextoPlano(text) {
        if (!text || typeof text !== 'string') return [];
        const lines = text.split(/\r?\n/);
        
        // Detectar delimitador: tabulación preferente (copiado de Excel), o ';' / ','
        const sample = lines.slice(0, 10).join('\n');
        let sep = '\t';
        if (!sample.includes('\t')) {
            const semi = (sample.match(/;/g) || []).length;
            const comma = (sample.match(/,/g) || []).length;
            sep = semi >= comma ? ';' : ',';
        }

        return lines.map(line => {
            if (!line.includes('"')) {
                return line.split(sep).map(c => c.trim());
            }
            // Parseo con comillas para CSV
            const cells = [];
            let curr = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (ch === '"') {
                    inQuotes = !inQuotes;
                } else if (ch === sep && !inQuotes) {
                    cells.push(curr.trim());
                    curr = '';
                } else {
                    curr += ch;
                }
            }
            cells.push(curr.trim());
            return cells;
        });
    }

    /**
     * Asigna automáticamente un color de jack según el servicio detectado en la etiqueta.
     */
    function detectarColorServicio(label) {
        const s = String(label || '').toLowerCase();
        if (s.includes('cctv') || s.includes('camara') || s.includes('cámara') || s.includes('dvr') || s.includes('nvr') || s.includes('seguridad')) {
            return 'red';
        }
        if (s.includes('ap') || s.includes('wifi') || s.includes('wi-fi') || s.includes('access point') || s.includes('antena')) {
            return 'teal';
        }
        if (s.includes('fibra') || s.includes('fo') || s.includes('cco') || s.includes('optica') || s.includes('óptica') || s.includes('troncal')) {
            return 'yellow';
        }
        if (s.includes('piso') || s.includes('datos') || s.includes('pc') || s.includes('oficina') || s.includes('red') || s.includes('vlan')) {
            return 'blue';
        }
        if (s.includes('automotores') || s.includes('taller') || s.includes('pañol') || s.includes('aut of') || s.includes('mecanica')) {
            return 'purple';
        }
        if (s.includes('pintura') || s.includes('cortina') || s.includes('anexo') || s.includes('alarma')) {
            return 'orange';
        }
        if (s.includes('??') || s.includes('sin uso') || s.includes('reserva')) {
            return 'gray';
        }
        return 'blue';
    }

    /**
     * Une el grupo superior y el número/sub-etiqueta en una sola etiqueta coherente.
     */
    function unirEtiqueta(grupo, sub) {
        const g = String(grupo || '').trim();
        const s = String(sub || '').trim();
        if (!g && !s) return '';
        if (!g) return s;
        if (!s) return g;
        if (g.toLowerCase() === s.toLowerCase()) return g;
        if (s.toLowerCase().startsWith(g.toLowerCase())) return s;
        return `${g} ${s}`;
    }

    /**
     * Analiza la matriz 2D de celdas (proveniente de Excel o TSV/CSV) y extrae:
     * - Nombre del rack
     * - Lista de patcheras con sus 24/48 bocas, etiquetas y colores
     * Soporta columnas separadoras entre módulos de 6 bocas.
     */
    function parsearMatrizPatcheras(grid, sheetHint = '') {
        if (!Array.isArray(grid) || !grid.length) {
            throw new Error('La planilla no contiene datos legibles.');
        }

        let rackNombre = '';
        let rackFecha = '';

        // 1. Buscar nombre del rack y fecha en las filas iniciales
        for (let r = 0; r < Math.min(grid.length, 12); r++) {
            const row = grid[r] || [];
            for (let c = 0; c < row.length; c++) {
                const cell = String(row[c] || '').trim();
                const mRack = cell.match(/rack\s*([0-9a-z_-]+)/i);
                if (mRack && !rackNombre) {
                    rackNombre = `Rack ${mRack[1]}`;
                }
                if (/actualizado|fecha|\d{1,2}\/\d{1,2}\/\d{2,4}/i.test(cell) && !rackFecha) {
                    rackFecha = cell;
                }
            }
        }

        if (!rackNombre) {
            rackNombre = sheetHint ? `Rack ${sheetHint}` : 'Rack Importado';
        }

        // 2. Escanear filas en busca de la numeración de puertos (1..24 o 1..48)
        // Mapea dinámicamente cada número de puerto a su columna real en la fila
        // para soportar columnas separadoras / espaciadores entre módulos de 6 bocas
        const patcheraRows = [];

        for (let r = 0; r < grid.length; r++) {
            const row = grid[r] || [];
            const portColMap = {};

            for (let c = 0; c < row.length; c++) {
                const val = String(row[c] || '').trim();
                if (/^\d+$/.test(val)) {
                    const n = parseInt(val, 10);
                    if (n >= 1 && n <= 48 && !portColMap[n]) {
                        portColMap[n] = c;
                    }
                }
            }

            // Comprobar si contiene todos los puertos del 1 al 24
            let tiene1a24 = true;
            for (let p = 1; p <= 24; p++) {
                if (portColMap[p] === undefined) {
                    tiene1a24 = false;
                    break;
                }
            }

            if (tiene1a24) {
                // Verificar si se extiende hasta 48 bocas
                const tiene48 = Array.from({ length: 48 }, (_, i) => i + 1)
                    .every(p => portColMap[p] !== undefined);

                patcheraRows.push({
                    rowIdx: r,
                    totalPuertos: tiene48 ? 48 : 24,
                    portColMap
                });
            }
        }

        if (!patcheraRows.length) {
            throw new Error('No se detectaron patcheras en la planilla. Verificá que contenga la fila con los números de boca del 1 al 24.');
        }

        // 3. Procesar cada patchera detectada
        const patcheras = [];

        for (let i = 0; i < patcheraRows.length; i++) {
            const pr = patcheraRows[i];
            const r = pr.rowIdx;
            const prevR = i > 0 ? patcheraRows[i - 1].rowIdx + 1 : 0;

            // Buscar identificador de la patchera (letra A..Z, FIBRA, etc.) en filas anteriores
            let patcheraNombre = '';
            for (let searchR = prevR; searchR < r; searchR++) {
                const row = grid[searchR] || [];
                for (let c = 0; c < Math.min(row.length, 5); c++) {
                    const val = String(row[c] || '').trim();
                    if (!val) continue;
                    // Ignorar títulos generales, fechas o encabezados de rack largos
                    if (val.length > 20 || /rack|documentaci|actualiz/i.test(val)) continue;

                    if (/^[A-Za-z]$/.test(val) || /^patchera\s+[A-Za-z0-9_-]+$/i.test(val) || /^fibra(\s+optica)?$/i.test(val)) {
                        patcheraNombre = val;
                        break;
                    }
                }
                if (patcheraNombre) break;
            }

            if (!patcheraNombre) {
                patcheraNombre = `Patchera ${String.fromCharCode(65 + i)}`;
            } else if (/^[A-Za-z]$/.test(patcheraNombre)) {
                patcheraNombre = `Patchera ${patcheraNombre.toUpperCase()}`;
            }

            // Buscar filas de etiquetas entre prevR y r:
            // Omitir filas que sean cabecera general del rack (ej. fecha, título de rack)
            const labelRows = [];
            for (let searchR = r - 1; searchR >= prevR; searchR--) {
                const row = grid[searchR] || [];
                let isHeaderRow = false;
                for (let c = 0; c < row.length; c++) {
                    const val = String(row[c] || '').trim();
                    if (/actualizado|fecha|\d{1,2}\/\d{1,2}\/\d{2,4}/i.test(val) || /rack\s*\d+/i.test(val)) {
                        isHeaderRow = true;
                        break;
                    }
                }
                if (isHeaderRow) continue;

                let hasPortData = false;
                for (let p = 1; p <= pr.totalPuertos; p++) {
                    const col = pr.portColMap[p];
                    if (row[col] && row[col] !== patcheraNombre) {
                        hasPortData = true;
                        break;
                    }
                }
                if (hasPortData) {
                    labelRows.unshift(searchR); // Fila superior primero
                }
            }

            let filaGrupo = [];
            let filaSub = [];
            if (labelRows.length === 1) {
                filaGrupo = grid[labelRows[0]] || [];
            } else if (labelRows.length >= 2) {
                filaGrupo = grid[labelRows[labelRows.length - 2]] || [];
                filaSub = grid[labelRows[labelRows.length - 1]] || [];
            }

            const puertos = [];
            let activeGroup = '';

            for (let p = 1; p <= pr.totalPuertos; p++) {
                const col = pr.portColMap[p];
                const rawGrupo = String(filaGrupo[col] || '').trim();
                const rawSub = String(filaSub[col] || '').trim();

                if (rawGrupo) activeGroup = rawGrupo;
                const grupoEfectivo = rawGrupo || (rawSub ? activeGroup : '');
                const labelCompleto = unirEtiqueta(grupoEfectivo, rawSub);

                if (labelCompleto) {
                    const color = detectarColorServicio(labelCompleto);
                    puertos.push({
                        num: p,
                        label: labelCompleto,
                        notas: grupoEfectivo || labelCompleto,
                        color: color
                    });
                }
            }

            const esFibra = /fibra/i.test(patcheraNombre);
            patcheras.push({
                id: 'p_' + Date.now().toString(36) + '_' + i,
                nombre: patcheraNombre,
                tipo: esFibra ? 'fibra-v' : pr.totalPuertos,
                pos: i + 1,
                desc: rackFecha ? `Relevamiento: ${rackFecha}` : '',
                puertos: puertos
            });
        }

        return {
            rackNombre,
            rackFecha,
            patcheras
        };
    }

    /**
     * Procesa una entrada (File, ArrayBuffer o texto plano) y retorna el objeto estructurado.
     */
    async function procesarEntrada(input) {
        if (input instanceof ArrayBuffer) {
            return await parsearXlsxBuffer(input);
        } else if (typeof input === 'string') {
            const grid = parsearTextoPlano(input);
            return parsearMatrizPatcheras(grid);
        } else if (input instanceof File) {
            const fileName = input.name.toLowerCase();
            if (fileName.endsWith('.xlsx')) {
                const buffer = await input.arrayBuffer();
                return await parsearXlsxBuffer(buffer);
            } else {
                const text = await input.text();
                const grid = parsearTextoPlano(text);
                return parsearMatrizPatcheras(grid);
            }
        } else {
            throw new Error('Tipo de archivo o entrada no soportado.');
        }
    }

    return {
        unzipXlsx,
        parsearXlsxBuffer,
        parsearTextoPlano,
        detectarColorServicio,
        unirEtiqueta,
        parsearMatrizPatcheras,
        procesarEntrada
    };

})();

// Exportar para pruebas Node.js si aplica
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PlanillaParser;
}
