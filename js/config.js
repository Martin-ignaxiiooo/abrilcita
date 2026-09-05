/* ==================================================
   Abrilcita - config.js
   Configuración centralizada para Supabase + Vercel
   ==================================================
   MIGRACIÓN A SUPABASE:
   1. Crea un proyecto en https://supabase.com
   2. Ejecuta el script supabase/schema.sql (crea todas las tablas)
   3. Copia tu URL y anon key de (Settings -> API) a APP_CONFIG.supabase de abajo
   4. Cambia storageMode a 'supabase'
   ⚠️ La URL y la anon key son claves PÚBLICAS de diseño (se pueden dejar
      en el código). Nunca expongas tu service_role key.
   ================================================== */

const APP_CONFIG = {
    // Identificador de la aplicación
    appName: 'Abrilcita',
    version: '1.0.0',

    // ---- MODO DE ALMACENAMIENTO ----
    // Todo se guarda en Supabase (persistencia única en la nube).
    storageMode: 'supabase',

    // ---- SUPABASE ----
    supabase: {
        url: 'https://iwmfrkgrwircumwmaxve.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3bWZya2dyd2lyY3Vtd21heHZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzNTcyMjUsImV4cCI6MjEwMzkzMzIyNX0.NFYBJyVWz2MCoztLKMaLMFM7ILkL5NTTZYpnWny2fko',
        // ⚠️ DECISIÓN RLS: No se implementan políticas de Row-Level Security.
        // Motivo: app personal de un solo usuario/gato. La anon key es pública
        // por diseño de Supabase. Si se comparte el link ampliamente o se
        // agrega multi-usuario, implementar Supabase Auth + RLS por usuario.
        // Nombre de las tablas en Supabase (crear via script SQL)
        tables: {
            profile: 'profile',
            vaccines: 'vaccines',
            deworming: 'deworming',
            controls: 'controls',
            notes: 'notes',
            food: 'food',
            foodChanges: 'food_changes',
            weights: 'weights',
            medications: 'medications'
        }
    },

    // ---- REGLAS DE LA APP ----
    validation: {
        maxNameLength: 60,
        maxBreedLength: 60,
        minWeightKg: 0.1,
        maxWeightKg: 30,
        maxCostCLP: 100000000,
        minBirthYear: 1980
    }
};

// Si se definen variables de entorno (Vercel) se sobreescriben
if (typeof __SUPABASE_URL__ !== 'undefined' && __SUPABASE_URL__) {
    APP_CONFIG.supabase.url = __SUPABASE_URL__;
    APP_CONFIG.supabase.anonKey = __SUPABASE_ANON_KEY__;
    APP_CONFIG.storageMode = 'supabase';
}

window.APP_CONFIG = APP_CONFIG;
