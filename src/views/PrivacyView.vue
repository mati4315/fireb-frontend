<template>
  <div class="privacy-container">
    <div class="privacy-card">
      <header class="privacy-header">
        <div class="header-icon">🔒</div>
        <h1>Política de Privacidad</h1>
        <p class="app-reference">Plataforma: <strong>Cdelu.ar</strong> | Responsable: <strong>CdeluAR</strong></p>
        <p class="last-updated">Última actualización: 23 de septiembre de 2026</p>
      </header>

      <div class="privacy-content">
        <section class="policy-section">
          <h2>1. Introducción y Alcance</h2>
          <p>
            En <strong>Cdelu.ar</strong> nos comprometemos a proteger y respetar tu privacidad. Esta Política de Privacidad describe cómo recopilamos, utilizamos, almacenamos y protegemos tus datos personales cuando utilizas nuestra aplicación web y móvil, en cumplimiento con las directrices de privacidad y las Condiciones de la Plataforma de Meta (Facebook).
          </p>
        </section>

        <section class="policy-section">
          <h2>2. Información que Recopilamos</h2>
          <p>Recopilamos la información mínima y necesaria para brindarte el servicio:</p>
          <ul>
            <li>
              <strong>Autenticación mediante Facebook (Meta Login):</strong> Cuando decides iniciar sesión con Facebook, solicitamos únicamente los permisos básicos aprobados: tu nombre público, dirección de correo electrónico, foto de perfil y el identificador de usuario de la app (ASID).
            </li>
            <li>
              <strong>Autenticación mediante Google:</strong> Si inicias sesión con Google, recopilamos tu nombre, correo electrónico y foto de perfil proporcionados por el proveedor.
            </li>
            <li>
              <strong>Registro por Correo:</strong> Tu nombre, nombre de usuario y dirección de correo electrónico.
            </li>
            <li>
              <strong>Contenido generado por el usuario:</strong> Publicaciones, comentarios, reacciones y participación en actividades comunitarias (como encuestas o sorteos) que decides compartir de forma voluntaria en la plataforma.
            </li>
          </ul>
        </section>

        <section class="policy-section">
          <h2>3. Finalidad y Uso de la Información</h2>
          <p>Utilizamos tus datos exclusivamente para los siguientes propósitos:</p>
          <ul>
            <li>Autenticar y validar tu identidad al iniciar sesión.</li>
            <li>Crear y mantener tu perfil público dentro de la comunidad de Cdelu.ar.</li>
            <li>Permitirte interactuar, publicar contenido y comentar noticias.</li>
            <li>Enviarte notificaciones relacionadas con tu actividad en la plataforma (si las tienes habilitadas).</li>
            <li>Garantizar la seguridad, prevenir abusos y moderar conductas que infrinjan nuestras normas.</li>
          </ul>
          <p><strong>No vendemos, no alquilamos ni transferimos tus datos personales a terceros con fines comerciales ni de publicidad invasiva.</strong></p>
        </section>

        <section class="policy-section">
          <h2>4. Almacenamiento y Seguridad</h2>
          <p>
            Toda la infraestructura y base de datos de Cdelu.ar está alojada en <strong>Google Firebase</strong>, contando con cifrado de datos en tránsito (HTTPS/TLS) y en reposo, así como reglas estrictas de control de acceso y seguridad.
          </p>
        </section>

        <section class="policy-section">
          <h2>5. Retención de Datos</h2>
          <p>
            Conservamos tus datos personales únicamente mientras mantengas activa tu cuenta en Cdelu.ar o hasta que solicites su eliminación expresa.
          </p>
        </section>

        <section class="policy-section highlight-box">
          <h2>6. Eliminación de Datos y Derechos del Usuario (Facebook & Google)</h2>
          <p>
            Respetamos tu derecho a solicitar el acceso, rectificación o eliminación total de tus datos personales en cualquier momento.
          </p>
          <p><strong>Opciones para eliminar tus datos:</strong></p>
          <ol>
            <li>
              <strong>Portal de Solicitud Directa:</strong> Puedes ingresar a nuestra página oficial de eliminación en <router-link to="/eliminar-datos"><strong>cdelu.ar/eliminar-datos</strong></router-link> y solicitar la baja definitiva de tu cuenta y contenido asociado.
            </li>
            <li>
              <strong>Eliminar desde Facebook:</strong> Puedes revocar los permisos de Cdelu.ar desde tu cuenta de Facebook ingresando a <em>Configuración y privacidad &gt; Configuración &gt; Apps y sitios web</em>, seleccionando <strong>Cdelu.ar</strong> y haciendo clic en <strong>Eliminar</strong>.
            </li>
            <li>
              <strong>Contacto directo:</strong> Puedes enviar un correo a <a href="mailto:matias4315@gmail.com">matias4315@gmail.com</a> con el asunto <em>"Eliminación de Datos"</em> y procesaremos tu solicitud en un plazo máximo de 7 días hábiles.
            </li>
          </ol>
        </section>

        <section class="policy-section">
          <h2>7. Contacto</h2>
          <p>
            Si tienes dudas, consultas o inquietudes sobre esta Política de Privacidad o el tratamiento de tus datos, puedes escribirnos a <a href="mailto:matias4315@gmail.com">matias4315@gmail.com</a>.
          </p>
        </section>

        <footer class="privacy-footer">
          <router-link to="/" class="back-link">← Volver al inicio</router-link>
        </footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
.privacy-container {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 2.5rem 1rem;
  background: var(--bg);
  transition: background 0.3s ease;
}

.privacy-card {
  max-width: 850px;
  width: 100%;
  background: var(--card-bg);
  backdrop-filter: blur(10px);
  padding: 2.5rem;
  border-radius: 24px;
  border: 1px solid var(--border);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
  color: var(--text);
  line-height: 1.65;
}

.privacy-header {
  text-align: center;
  margin-bottom: 2rem;
  border-bottom: 1px solid var(--border);
  padding-bottom: 1.5rem;
}

.header-icon {
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
}

.privacy-header h1 {
  color: var(--primary);
  font-size: clamp(1.6rem, 4vw, 2.2rem);
  font-weight: 800;
  margin: 0.5rem 0;
}

.app-reference {
  font-size: 0.95rem;
  opacity: 0.9;
  margin: 0.2rem 0;
}

.last-updated {
  font-size: 0.85rem;
  opacity: 0.7;
  margin: 0;
}

.policy-section {
  margin-bottom: 1.8rem;
}

.policy-section h2 {
  font-size: 1.2rem;
  color: var(--text-h);
  border-bottom: 2px solid var(--primary);
  padding-bottom: 0.3rem;
  margin-bottom: 0.8rem;
}

.policy-section p {
  opacity: 0.9;
  margin-bottom: 0.8rem;
}

.policy-section ul,
.policy-section ol {
  padding-left: 1.4rem;
  margin-bottom: 0.8rem;
}

.policy-section li {
  margin-bottom: 0.5rem;
  opacity: 0.9;
}

.highlight-box {
  background: color-mix(in srgb, var(--primary) 6%, var(--card-bg));
  border-left: 4px solid var(--primary);
  padding: 1.25rem;
  border-radius: 12px;
}

a {
  color: var(--primary);
  text-decoration: none;
  font-weight: 600;
}

a:hover {
  text-decoration: underline;
}

.privacy-footer {
  margin-top: 2.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border);
  text-align: center;
}

.back-link {
  display: inline-block;
  color: var(--primary);
  font-weight: 600;
  transition: transform 0.2s ease;
}

.back-link:hover {
  transform: translateX(-3px);
}

@media (max-width: 768px) {
  .privacy-card {
    padding: 1.5rem;
  }
}
</style>
