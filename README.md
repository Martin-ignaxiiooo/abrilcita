# 🐱 Abrilcita - Control de Salud Gatuno

Aplicación web **responsive** para llevar el control de salud de una gatita: vacunas, desparasitación, alimentación e historial médico.

El nombre **Abrilcita** es la gatita. Diseñado con un dashboard profesional (Perfil, Vacunas, Desparasitación, Alimentación, Historial).

---

## 📁 Estructura del proyecto

```
abrilcita/
├── index.html            → Página principal (ensambla header + 5 pantallas)
├── vercel.json           → Config de despliegue en Vercel
├── .gitignore            → Archivos que NO se suben al repo
├── .env.example          → Plantilla de variables de entorno
├── css/
│   └── styles.css        → Todo el diseño responsive
├── js/
│   ├── config.js         → Configuración (modo local / supabase + claves)
│   ├── db.js             → Capa de datos: localStorage ↔ Supabase
│   ├── validaciones.js   → Reglas de validación (RUT, teléfono, fechas, pesos...)
│   ├── router.js         → Navegación SPA por hash (#/vacunas)
│   └── app.js            → Lógica de cada pantalla (controllers)
├── supabase/
│   └── schema.sql        → Script que crea todas las tablas en Supabase
└── assets/               → Recursos (imágenes)
```

---

## 🚀 Cómo desplegar en Vercel (con Supabase)

### Paso 1: Crear el proyecto en Supabase

1. Ve a [supabase.com](https://supabase.com) → **Sign in** → **New project**
2. Ponle nombre (ej: `abrilcita`) y elige tu región de preferencia
3. Elige una contraseña de base de datos (guárdala)

### Paso 2: Crear las tablas

1. En el dashboard de Supabase, abre **SQL Editor** (menú izquierdo)
2. Abre el archivo local `supabase/schema.sql`
3. Pega TODO el contenido y haz clic en **Run**
4. Verás que se crean las tablas: `profile`, `vaccines`, `deworming`, `controls`, `notes`, `food`, `food_changes`, `weights`

### Paso 3: Copiar las claves (URL + anon key)

1. En Supabase, ve a **Settings** ⚙️ → **API** (a la izquierda)
2. Copia **Project URL** (ej: `https://xyzcompany.supabase.co`)
3. Copia la **anon public** key (la "clave pública", que está diseñada para ir en el cliente)

### Paso 4: Pegar las claves en `config.js`

Abre `js/config.js` y completa:

```js
storageMode: 'supabase',   // ← cambia de 'local' a 'supabase'

supabase: {
    url: 'https://TU-PROYECTO.supabase.co',   // ← tu Project URL
    anonKey: 'TU_CLAVE_ANON_AQUI'             // ← tu anon public key
}
```

> **Importante:** La URL y la anon key son **claves públicas por diseño** (van en el cliente). Pueden estar en el código. Lo que **nunca** debes exponer es tu `service_role key`.

### Paso 5: Subir a GitHub

```bash
cd "C:\Users\elmar\Desktop\Abril controlada"
git init
git add .
git commit -m "Feat: Abrilcita control de salud gatuno"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/abrilcita.git
git push -u origin main
```

> Reemplaza `TU_USUARIO/abrilcita` por tu nombre de usuario y nombre de repo.

### Paso 6: Conectar Vercel con GitHub

1. Ve a [vercel.com](https://vercel.com) → **Sign in with GitHub**
2. Clic en **Add New** → **Project**
3. Importa tu repositorio `abrilcita`
4. Deja todo por defecto (Framework: **Other / Static HTML**)
5. Clic en **Deploy**
6. ¡Listo! Vercel te da una URL tipo `https://abrilcita.vercel.app`

> Cada vez que hagas `git push` a la rama `main`, Vercel **vuelve a desplegar automáticamente**.

---

## 🔄 Versus: solo Vercel estático (sin Supabase)

Si quieres datos solo locales (sin nube), deja `storageMode: 'local'` en `config.js`.

| Modo | Datos | Persistencia |
|------|-------|--------------|
| `local` | localStorage del navegador | Solo en ese dispositivo |
| `supabase` | Base de datos en la nube | Multi-dispositivo, permanente |

> En modo `local` también puedes desplegar en Vercel (solo archivos estáticos). Pero cada navegador guarda sus propios datos.

---

## 🗂️ Exportar / Respaldar

Desde la pestaña **Historial** puedes:
- **📤 Exportar JSON** → descarga un backup de todos los datos
- **🗑️ Borrar Todo** → limpia la base (o el localStorage)

---

## 🧪 Probar en local (sin internet ni hosting)

Solo abre `index.html` con doble clic. Funciona 100% con localStorage.

> Si el navegador bloquea el archivo local por CORS, usa una extensión tipo "Live Server" de VS Code o sirve con `npx serve` .

---

## 🔐 Nota de seguridad (importante al usar Supabase)

El script `supabase/schema.sql` habilita **Row Level Security (RLS)** con políticas de acceso **público** ("allow all"). Esto es válido para **uso personal** de una sola gatita pero, si lo compartes en internet, cualquiera podría leer/escribir los datos.

Si vas a tener varios usuarios o datos que quieras proteger, hay que implementar **auth con login** (Supabase Auth) y cambiar las políticas por `auth.uid()`. Pregunta y te ayudo a montarlo.

---

## 🛠️ Validaciones implementadas

- **RUT chileno** con dígito verificador calculado
- **Teléfono chileno** (+56 9...)
- **Fecha de nacimiento** (no futura, año mínimo 1980)
- **Peso** (0.1 – 30 kg)
- **Costo** en CLP (rango válido)
- **Campos obligatorios** → se marcan en rojo
