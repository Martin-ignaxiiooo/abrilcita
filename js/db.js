/* ==================================================
   Abrilcita - db.js
   Capa de datos: Supabase (persistencia única en la nube)
   ==================================================
   Cada tabla se guarda con su propia función para evitar
   reescrituras completas y mantener integridad de datos.
   Las listas usan diff por id (upsert/delete) en vez de
   borrar-todo-e-insertar-todo.
   ================================================== */

const DB = (function () {

    // ---------- SCHEMA ----------
    const defaultDoc = () => ({
        profile: {},
        vaccines: [],
        deworming: [],
        controls: [],
        notes: [],
        food: {},
        foodChanges: [],
        weights: [],
        medications: []
    });

    // ---------- SUPABASE CLIENT (caché: una sola instancia) ----------
    let supabaseClient = null;

    async function initSupabase() {
        if (supabaseClient) return supabaseClient;
        if (!window.supabase) throw new Error('Supabase client no cargado.');
        const cfg = window.APP_CONFIG.supabase;
        if (!cfg.url || !cfg.anonKey) throw new Error('Supabase config incompleta.');
        supabaseClient = window.supabase.createClient(cfg.url, cfg.anonKey);
        return supabaseClient;
    }

    function checkError(res, op) {
        if (res && res.error) {
            const msg = res.error.message || res.error.code || 'error desconocido';
            console.error('[Supabase] ' + op + ': ' + msg);
            throw new Error('Supabase: ' + op + ' falló (' + msg + ')');
        }
        return res;
    }

    // ---------- FIELD MAPS ----------
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
        weights: { d: 'd', w: 'w' },
        medications: { name: 'name', dose: 'dose', inst: 'inst' }
    };

    // ---------- CONVERSORES ----------
    function rowToApp(map, row) {
        const out = { id: row.id };
        for (const [appKey, col] of Object.entries(map)) {
            if (row[col] !== undefined && row[col] !== null) out[appKey] = row[col];
        }
        return out;
    }

    function appToRow(map, obj) {
        const out = {};
        for (const [appKey, col] of Object.entries(map)) {
            if (obj[appKey] !== undefined && obj[appKey] !== null) {
                out[col] = obj[appKey] === '' ? null : obj[appKey];
            }
        }
        return out;
    }

    // Helper: tabla de config → nombre real
    function tableName(key) {
        return window.APP_CONFIG.supabase.tables[key] || key;
    }

    // ---------- GET ----------
    async function get() {
        await initSupabase();
        const doc = defaultDoc();

        const { data: profileRows } = checkError(
            await supabaseClient.from(tableName('profile')).select('*').limit(1), 'select profile'
        );
        doc.profile = profileRows && profileRows[0] ? rowToApp(FIELD_MAPS.profile, profileRows[0]) : {};

        const { data: foodRows } = checkError(
            await supabaseClient.from(tableName('food')).select('*').limit(1), 'select food'
        );
        doc.food = foodRows && foodRows[0] ? rowToApp(FIELD_MAPS.food, foodRows[0]) : {};

        const listKeys = ['vaccines', 'deworming', 'controls', 'notes', 'foodChanges', 'weights', 'medications'];
        for (const key of listKeys) {
            const { data } = checkError(
                await supabaseClient.from(tableName(key)).select('*'), 'select ' + key
            );
            doc[key] = (data || []).map(r => rowToApp(FIELD_MAPS[key], r));
        }

        return doc;
    }

    // ---------- SAVE POR SECCIÓN ----------

    // Tablas de una sola fila (profile, food)
    async function saveSingleRow(data, key) {
        await initSupabase();
        const map = FIELD_MAPS[key];
        const row = appToRow(map, data || {});
        const table = tableName(key);
        if (!Object.keys(row).length) return;

        const { data: existing } = checkError(await supabaseClient.from(table).select('id').limit(1), 'select ' + key + ' id');
        if (existing && existing[0]) {
            checkError(await supabaseClient.from(table).update(row).eq('id', existing[0].id), 'update ' + key);
        } else {
            checkError(await supabaseClient.from(table).insert(row), 'insert ' + key);
        }
    }

    // Tablas de lista (vaccines, deworming, controls, notes, foodChanges, weights, medications)
    // Estrategia: diff por id → insertar nuevos, actualizar existentes, borrar sobrantes
    async function saveList(localItems, key) {
        await initSupabase();
        const map = FIELD_MAPS[key];
        const table = tableName(key);
        const items = localItems || [];

        const { data: remoteRows } = checkError(
            await supabaseClient.from(table).select('*'), 'select ' + key + ' for diff'
        );
        const remote = (remoteRows || []).map(r => rowToApp(map, r));
        const localIds = new Set(items.map(x => x.id));
        const remoteIds = new Set(remote.map(x => x.id));

        // Filas a borrar (están en remoto pero no en local)
        const toDelete = remote.filter(x => !localIds.has(x.id)).map(x => x.id);
        if (toDelete.length) {
            for (let i = 0; i < toDelete.length; i += 100) {
                checkError(await supabaseClient.from(table).delete().in('id', toDelete.slice(i, i + 100)), 'delete ' + key);
            }
        }

        // Filas a upsert (están en local → insert si no existe, update si existe)
        const toUpsert = items.map(item => appToRow(map, item));
        for (let i = 0; i < toUpsert.length; i += 100) {
            checkError(await supabaseClient.from(table).upsert(toUpsert.slice(i, i + 100)), 'upsert ' + key);
        }
    }

    // ---------- SAVE PÚBLICO ----------
    // save(doc): guarda TODO el documento (usado por clearAllData)
    async function save(doc) {
        await saveSingleRow(doc.profile, 'profile');
        await saveSingleRow(doc.food, 'food');
        const listKeys = ['vaccines', 'deworming', 'controls', 'notes', 'foodChanges', 'weights', 'medications'];
        for (const key of listKeys) {
            await saveList(doc[key] || [], key);
        }
        return true;
    }

    // saveProfile(data): guarda solo profile
    async function saveProfile(data) { return await saveSingleRow(data, 'profile'); }

    // saveFoodData(data): guarda solo food
    async function saveFoodData(data) { return await saveSingleRow(data, 'food'); }

    // saveVaccines(items): guarda solo vaccines
    async function saveVaccines(items) { return await saveList(items, 'vaccines'); }

    // saveDeworming(items): guarda solo deworming
    async function saveDeworming(items) { return await saveList(items, 'deworming'); }

    // saveControls(items): guarda solo controls
    async function saveControls(items) { return await saveList(items, 'controls'); }

    // saveNotes(items): guarda solo notes
    async function saveNotes(items) { return await saveList(items, 'notes'); }

    // saveFoodChanges(items): guarda solo foodChanges
    async function saveFoodChanges(items) { return await saveList(items, 'foodChanges'); }

    // saveWeights(items): guarda solo weights
    async function saveWeights(items) { return await saveList(items, 'weights'); }

    // saveMedications(items): guarda solo medications
    async function saveMedications(items) { return await saveList(items, 'medications'); }

    // ---------- UTILIDADES ----------
    function genId() {
        return crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    return {
        get, save, genId,
        saveProfile, saveFoodData, saveVaccines, saveDeworming,
        saveControls, saveNotes, saveFoodChanges, saveWeights, saveMedications
    };
})();

window.DB = DB;
