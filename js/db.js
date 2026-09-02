/* ==================================================
   Abrilcita - db.js
   Capa de datos: abstracción entre localStorage y Supabase
   ==================================================
   Diseñado para preparar la migración a Supabase + Vercel.
   Todas las operaciones de datos pasan por aquí.
   ================================================== */

const DB = (function () {
    const LOCAL_STORAGE_KEY = 'abrilcita_db_v1';

    // ---------- SCHEMA / TABLAS (mismo formato en ambos modos) ----------
    const defaultDoc = () => ({
        profile: {},
        vaccines: [],
        deworming: [],
        controls: [],
        notes: [],
        food: {},
        foodChanges: [],
        weights: []
    });

    // ---------- SUPABASE CLIENT (se inicializa solo si es necesario) ----------
    let supabaseClient = null;

    async function initSupabase() {
        if (!window.supabase) {
            throw new Error('Supabase client no cargado. Agrega el script de supabase-js en index.html');
        }
        const cfg = window.APP_CONFIG.supabase;
        if (!cfg.url || !cfg.anonKey) {
            throw new Error('Supabase config incompleta. Revisa config.js o las variables de entorno de Vercel.');
        }
        supabaseClient = window.supabase.createClient(cfg.url, cfg.anonKey);
        return supabaseClient;
    }

    // ---------- SERIALIZACIÓN PARCIAL (evita guardar photo en base) ----------
    // En Supabase la foto se guarda en Storage; aquí la mantenemos en localStorage.

    // ---------- MÉTODOS ----------
    function isSupabase() {
        return window.APP_CONFIG.storageMode === 'supabase';
    }

    // GET completo
    async function get() {
        if (isSupabase()) {
            return await getFromSupabase();
        }
        return getLocal();
    }

    // SAVE completo
    async function save(doc) {
        if (isSupabase()) {
            return await saveToSupabase(doc);
        }
        saveLocal(doc);
        return true;
    }

    // ---------- LOCAL STORAGE ----------
    function getLocal() {
        try {
            const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (!raw) return defaultDoc();
            const doc = JSON.parse(raw);
            // Merge con schema por si faltan colecciones nuevas
            return { ...defaultDoc(), ...doc };
        } catch (e) {
            console.error('Error leyendo localStorage', e);
            return defaultDoc();
        }
    }

    function saveLocal(doc) {
        try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(doc));
        } catch (e) {
            console.error('Error guardando localStorage', e);
        }
    }

    // ---------- SUPABASE ----------
    // Cada colección se guarda separada (múltiples filas por tabla).
    // El documento se reconstruye al leer todas las tablas.
    // IMPORTANTE: esta es la estrategia de migración a Supabase.

    // Mapeo entre claves de la app (camelCase) y columnas de Supabase (snake_case)
    const FIELD_MAPS = {
        profile: {
            name: 'name', birth: 'birth', breed: 'breed', weight: 'weight',
            sex: 'sex', color: 'color', vet: 'vet', vetPhone: 'vet_phone',
            rut: 'rut', photo: 'photo'
        },
        vaccines: {
            type: 'type', date: 'date', lot: 'lot', lab: 'lab', vet: 'vet',
            next: 'next', cost: 'cost', notes: 'notes'
        },
        deworming: {
            type: 'type', date: 'date', product: 'product', dose: 'dose',
            weight: 'weight', next: 'next', vet: 'vet', cost: 'cost', notes: 'notes'
        },
        controls: {
            date: 'date', type: 'type', vet: 'vet', vetName: 'vet_name',
            reason: 'reason', weight: 'weight', result: 'result', cost: 'cost', notes: 'notes'
        },
        notes: { date: 'date', title: 'title', desc: 'description' },
        food: {
            type: 'type', brand: 'brand', amount: 'amount', cost: 'cost',
            notes: 'notes', supplements: 'supplements', treats: 'treats',
            restrictions: 'restrictions', time1: 'time1', time2: 'time2',
            time3: 'time3', times: 'times'
        },
        foodChanges: { date: 'date', desc: 'description', reason: 'reason' },
        weights: { d: 'd', w: 'w' }
    };

    // Convierte fila de Supabase (snake) -> doc app (camel)
    function rowToApp(map, row) {
        const out = { id: row.id };
        for (const [appKey, col] of Object.entries(map)) {
            if (row[col] !== undefined && row[col] !== null) out[appKey] = row[col];
        }
        return out;
    }

    // Convierte doc app (camel) -> fila Supabase (snake)
    function appToRow(map, obj) {
        const out = {};
        for (const [appKey, col] of Object.entries(map)) {
            if (obj[appKey] !== undefined && obj[appKey] !== null) out[col] = obj[appKey];
        }
        return out;
    }

    async function getFromSupabase() {
        await initSupabase();
        const t = window.APP_CONFIG.supabase.tables;
        const doc = defaultDoc();

        // profile (una fila)
        const { data: profileRows } = await supabaseClient.from(t.profile).select('*').limit(1);
        // Garantizar solo una fila (usa la primera)
        doc.profile = profileRows && profileRows[0] ? rowToApp(FIELD_MAPS.profile, profileRows[0]) : {};

        // Colecciones "listas"
        const tablesMap = [
            [t.vaccines, 'vaccines', FIELD_MAPS.vaccines],
            [t.deworming, 'deworming', FIELD_MAPS.deworming],
            [t.controls, 'controls', FIELD_MAPS.controls],
            [t.notes, 'notes', FIELD_MAPS.notes],
            [t.foodChanges, 'foodChanges', FIELD_MAPS.foodChanges],
            [t.weights, 'weights', FIELD_MAPS.weights]
        ];
        for (const [table, key, map] of tablesMap) {
            const { data } = await supabaseClient.from(table).select('*');
            doc[key] = (data || []).map(r => rowToApp(map, r));
        }

        // food (una fila)
        const { data: foodRows } = await supabaseClient.from(t.food).select('*').limit(1);
        doc.food = foodRows && foodRows[0] ? rowToApp(FIELD_MAPS.food, foodRows[0]) : {};

        return doc;
    }

    async function saveToSupabase(doc) {
        await initSupabase();
        const t = window.APP_CONFIG.supabase.tables;

        // profile: upsert de una fila (mantiene un único registro)
        const profileRow = appToRow(FIELD_MAPS.profile, doc.profile || {});
        if (Object.keys(profileRow).length) {
            // Si no hay id, inserta; si hay, actualiza
            const { data: existing } = await supabaseClient.from(t.profile).select('id').limit(1);
            if (existing && existing[0]) {
                await supabaseClient.from(t.profile).update(profileRow).eq('id', existing[0].id);
            } else {
                await supabaseClient.from(t.profile).insert(profileRow);
            }
        }

        // food: upsert de una fila
        const foodRow = appToRow(FIELD_MAPS.food, doc.food || {});
        if (Object.keys(foodRow).length) {
            const { data: existing } = await supabaseClient.from(t.food).select('id').limit(1);
            if (existing && existing[0]) {
                await supabaseClient.from(t.food).update(foodRow).eq('id', existing[0].id);
            } else {
                await supabaseClient.from(t.food).insert(foodRow);
            }
        }

        // listas: borrar y reinsertar (sencillo y consistente)
        const tablesMap = [
            [t.vaccines, 'vaccines', FIELD_MAPS.vaccines],
            [t.deworming, 'deworming', FIELD_MAPS.deworming],
            [t.controls, 'controls', FIELD_MAPS.controls],
            [t.notes, 'notes', FIELD_MAPS.notes],
            [t.foodChanges, 'foodChanges', FIELD_MAPS.foodChanges],
            [t.weights, 'weights', FIELD_MAPS.weights]
        ];
        for (const [table, key, map] of tablesMap) {
            // Borrar todas las filas de la tabla
            const { data: all } = await supabaseClient.from(table).select('id');
            if (all && all.length) {
                const ids = all.map(r => r.id);
                // Borrar en lotes de 100 (límite de Supabase)
                for (let i = 0; i < ids.length; i += 100) {
                    await supabaseClient.from(table).delete().in('id', ids.slice(i, i + 100));
                }
            }
            // Insertar las actuales
            if ((doc[key] || []).length) {
                const rows = doc[key].map(item => appToRow(map, item));
                // Insertar en lotes de 100
                for (let i = 0; i < rows.length; i += 100) {
                    await supabaseClient.from(table).insert(rows.slice(i, i + 100));
                }
            }
        }
        return true;
    }

    // ---------- UTILIDADES ----------
    function genId() {
        if (isSupabase()) {
            // UUID v4 para Supabase (podría requerir uuid column type)
            return crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }

    // ---------- MIGRACIÓN UTILITARIA ----------
    // Exporta el documento local para poder migrarlo a Supabase
    function exportLocalDocument() {
        return getLocal();
    }

    // Importa un JSON externo al modo local (backup/restauración)
    function importLocalDocument(doc) {
        const merged = { ...defaultDoc(), ...doc };
        saveLocal(merged);
        return merged;
    }

    return {
        get, save, genId,
        isSupabase, exportLocalDocument, importLocalDocument,
        localStorageKey: LOCAL_STORAGE_KEY
    };
})();

window.DB = DB;
