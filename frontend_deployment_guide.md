# 🚀 Guía de Despliegue - CdeluAR Frontend

Esta guía explica cómo funciona el sistema de despliegue automático de CdeluAR y los pasos necesarios para migrar a un nuevo dominio (como `cdelu.ar`) en el futuro.

## 🏗️ Arquitectura de Despliegue
Hemos configurado un flujo de trabajo profesional que separa el código fuente de los archivos compilados:

1.  **Rama `main`**: Aquí es donde editamos el código fuente (Vue 3, TypeScript, assets).
2.  **GitHub Actions**: Cada vez que haces un `git push` a `main`, una automatización (`.github/workflows/deploy.yml`) se encarga de:
    *   Instalar dependencias (`npm install`).
    *   Compilar el proyecto (`npm run build`).
    *   Subir **solo** el resultado final a la rama **`deploy`**.
3.  **Hostinger**: Está configurado para escuchar la rama **`deploy`** y actualizar el sitio web automáticamente mediante un **Webhook**.

---

## 🛠️ Cómo migrar a un nuevo dominio (ej. `cdelu.ar`)

Cuando decidas dejar atrás `test.cdelu.ar` y pasar al dominio final, sigue estos 4 pasos:

### 1. Firebase Console (Autenticación)
Firebase bloqueará el login si el dominio no está autorizado.
*   Ve a: **Authentication > Settings > Authorized Domains**.
*   Añade el nuevo dominio: `cdelu.ar`.

### 2. Configuración en Hostinger
En el panel de control de tu nuevo sitio web en Hostinger:
*   Ve a la sección **GIT**.
*   Conecta el repositorio: `https://github.com/mati4315/fireb-frontend.git`.
*   **IMPORTANTE**: Selecciona la rama **`deploy`** (no la `main`).

### 3. Webhook de Hostinger
*   Copia la nueva **URL de Webhook** que te asigne Hostinger para el nuevo dominio.
*   En GitHub, ve a **Settings > Webhooks**.
*   Edita el Webhook actual o crea uno nuevo con la URL actualizada.

### 4. Variables de Entorno (`.env`)
Si el nuevo dominio requiere cambios en la configuración (como nuevas claves de API o IDs de proyecto), asegúrate de actualizar el archivo `.env` en tu computadora antes de hacer el próximo `git push`.

---

## 🆘 Resolución de Problemas (Gotchas)

*   **Error de Permisos en GitHub**: Si el Action falla al intentar subir a la rama `deploy`, asegúrate de que en **Settings > Actions > General > Workflow permissions** esté seleccionada la opción **"Read and write permissions"**.
*   **Archivos Ignorados**: El archivo `.env` **nunca** se sube a GitHub por seguridad. Debes tener una copia local siempre.
*   **Limpiar Cache**: Al cambiar de dominio, a veces los navegadores guardan versiones viejas. Si no ves los cambios, limpia el cache o usa una ventana de incógnito.

---

**Última actualización**: 7 de abril de 2026
**Preparado por**: Antigravity AI
