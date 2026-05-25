<template>
  <div class="delete-container">
    <div class="delete-card">
      <header class="delete-header">
        <div class="logo-badge">🛡️</div>
        <h1>Solicitud de Eliminación de Datos</h1>
        <p class="app-reference">Aplicación: <strong>Cdelu.ar</strong> | Desarrollador: <strong>CdeluAR</strong></p>
      </header>

      <div class="delete-content">
        <p class="intro-text">
          De acuerdo con las políticas de seguridad de datos de Google Play, valoramos y respetamos tu privacidad. 
          Aquí puedes solicitar la eliminación permanente de tu cuenta y todos los datos personales asociados a ella.
        </p>

        <!-- Pasos a seguir -->
        <section class="section-block">
          <h2>📋 Pasos para solicitar la eliminación</h2>
          <div class="steps-grid">
            <div class="step-card">
              <span class="step-num">1</span>
              <h3>Completa tus datos</h3>
              <p>Rellena el formulario web a continuación con el correo electrónico y nombre de usuario registrado en tu cuenta.</p>
            </div>
            <div class="step-card">
              <span class="step-num">2</span>
              <h3>Envía tu solicitud</h3>
              <p>Presiona el botón de envío para generar el correo de confirmación de identidad a nuestro equipo de soporte.</p>
            </div>
            <div class="step-card">
              <span class="step-num">3</span>
              <h3>Procesamiento</h3>
              <p>Verificaremos tu identidad y eliminaremos permanentemente tu información en un plazo máximo de 7 días hábiles.</p>
            </div>
          </div>
        </section>

        <!-- Qué datos se eliminan o conservan -->
        <section class="section-block info-box-grid">
          <div class="info-box delete-box">
            <h3>🗑️ Datos que se eliminan permanentemente</h3>
            <ul>
              <li><strong>Perfil de Usuario:</strong> Nombre, nombre de usuario (@username), biografía, ubicación, sitio web y foto de perfil.</li>
              <li><strong>Credenciales de Autenticación:</strong> Tu perfil e inicio de sesión gestionado con Google, Facebook o correo electrónico.</li>
              <li><strong>Contenido Creado:</strong> Todas tus publicaciones, fotos subidas y comentarios realizados en la comunidad de Cdelu.ar.</li>
              <li><strong>Notificaciones y Dispositivos:</strong> Historial de alertas y tokens de notificaciones push de tu dispositivo móvil.</li>
            </ul>
          </div>

          <div class="info-box keep-box">
            <h3>🔒 Datos que se conservan y políticas de retención</h3>
            <p>
              No almacenamos ni conservamos ningún dato personal identificable después de procesada la eliminación de tu cuenta.
            </p>
            <p>
              <strong>Retención Adicional por Auditoría/Legalidad:</strong> 
              En el caso de haber participado en loterías y sorteos dentro de la aplicación, los registros históricos de ganadores y participantes se 
              <strong>anonimizan completamente</strong> (se disocian del usuario original) para mantener la validez, transparencia y legalidad técnica del sorteo frente a auditorías, sin comprometer tu privacidad.
            </p>
          </div>
        </section>

        <!-- Formulario de Solicitud -->
        <section class="section-block form-section">
          <h2>✍️ Formulario de Solicitud Directa</h2>
          <p class="form-hint">Puedes solicitar la eliminación sin necesidad de estar logueado o tener la app instalada en este momento.</p>

          <form @submit.prevent="submitMailRequest" class="request-form">
            <div class="form-group">
              <label for="fullName">Nombre completo / Nombre en el perfil</label>
              <input 
                type="text" 
                id="fullName" 
                v-model="form.name" 
                required 
                placeholder="Ej. Juan Pérez"
              />
            </div>

            <div class="form-group">
              <label for="email">Correo electrónico registrado</label>
              <input 
                type="email" 
                id="email" 
                v-model="form.email" 
                required 
                placeholder="Ej. juan.perez@example.com"
              />
            </div>

            <div class="form-group">
              <label for="username">Nombre de usuario (opcional)</label>
              <input 
                type="text" 
                id="username" 
                v-model="form.username" 
                placeholder="Ej. @juanperez"
              />
            </div>

            <div class="form-group">
              <label for="reason">Motivo de la eliminación (opcional)</label>
              <textarea 
                id="reason" 
                v-model="form.reason" 
                rows="3" 
                placeholder="Cuéntanos brevemente el motivo..."
              ></textarea>
            </div>

            <button type="submit" class="submit-btn">
              📨 Generar correo de solicitud de eliminación
            </button>
          </form>

          <div class="alternative-contact">
            <p>También puedes enviarnos un correo electrónico directamente a <a href="mailto:matias4315@gmail.com">matias4315@gmail.com</a> con el asunto <strong>"Eliminación de Datos - Cdelu.ar"</strong>.</p>
          </div>
        </section>

        <footer class="delete-footer">
          <router-link to="/" class="back-link">Volver al inicio</router-link>
        </footer>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const form = ref({
  name: '',
  email: '',
  username: '',
  reason: ''
})

const submitMailRequest = () => {
  const recipient = 'matias4315@gmail.com'
  const subject = encodeURIComponent('Solicitud de Eliminación de Datos - Cdelu.ar')
  
  const bodyText = `Hola equipo de soporte de Cdelu.ar,

Solicito la eliminación definitiva y permanente de mi cuenta de usuario y de todos los datos personales asociados.

A continuación, detallo los datos de mi cuenta para verificar la identidad:
- Nombre completo: ${form.value.name}
- Correo electrónico registrado: ${form.value.email}
- Nombre de usuario: ${form.value.username || 'No especificado'}
- Motivo: ${form.value.reason || 'No especificado'}

Entiendo que esta acción es definitiva, irreversible y que se completará en un plazo máximo de 7 días hábiles de acuerdo a las directrices de privacidad de Google Play.

Atentamente,
${form.value.name}`

  const body = encodeURIComponent(bodyText)
  
  // Abre el cliente de correo predeterminado del usuario con el mailto estructurado
  window.location.href = `mailto:${recipient}?subject=${subject}&body=${body}`
}
</script>

<style scoped>
.delete-container {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 2rem 1rem;
  background: var(--bg);
  transition: background 0.3s ease;
}

.delete-card {
  max-width: 900px;
  width: 100%;
  background: var(--card-bg);
  backdrop-filter: blur(10px);
  padding: 2.5rem;
  border-radius: 24px;
  border: 1px solid var(--border);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
  color: var(--text);
  line-height: 1.6;
}

.delete-header {
  text-align: center;
  margin-bottom: 2.5rem;
  border-bottom: 1px solid var(--border);
  padding-bottom: 1.5rem;
}

.logo-badge {
  font-size: 3rem;
  margin-bottom: 0.5rem;
}

.delete-header h1 {
  font-size: clamp(1.6rem, 4vw, 2.2rem);
  color: var(--primary);
  margin: 0.5rem 0;
  font-weight: 800;
}

.app-reference {
  font-size: 0.95rem;
  opacity: 0.9;
  color: var(--text);
}

.intro-text {
  font-size: 1.05rem;
  margin-bottom: 2rem;
  text-align: center;
  opacity: 0.85;
}

.section-block {
  margin-bottom: 2.5rem;
}

.section-block h2 {
  font-size: 1.25rem;
  color: var(--text-h);
  border-bottom: 2px solid var(--primary);
  padding-bottom: 0.4rem;
  margin-bottom: 1.2rem;
}

/* Pasos */
.steps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.25rem;
}

.step-card {
  background: color-mix(in srgb, var(--card-bg) 95%, #fff 5%);
  border: 1px solid var(--border);
  padding: 1.5rem;
  border-radius: 16px;
  position: relative;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.step-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.05);
}

.step-num {
  position: absolute;
  top: 1rem;
  right: 1.2rem;
  font-size: 2rem;
  font-weight: 900;
  color: var(--primary);
  opacity: 0.15;
}

.step-card h3 {
  margin: 0 0 0.5rem;
  font-size: 1.05rem;
  color: var(--text-h);
}

.step-card p {
  margin: 0;
  font-size: 0.88rem;
  opacity: 0.8;
}

/* Datos */
.info-box-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1.5rem;
}

.info-box {
  padding: 1.5rem;
  border-radius: 18px;
  border: 1px solid var(--border);
}

.delete-box {
  background: color-mix(in srgb, var(--bg) 98%, #ef4444 2%);
  border-left: 4px solid #ef4444;
}

.delete-box h3 {
  color: #ef4444;
  margin-top: 0;
  margin-bottom: 1rem;
}

.delete-box ul {
  padding-left: 1.2rem;
  margin: 0;
  font-size: 0.88rem;
}

.delete-box li {
  margin-bottom: 0.6rem;
}

.keep-box {
  background: color-mix(in srgb, var(--bg) 98%, #10b981 2%);
  border-left: 4px solid #10b981;
}

.keep-box h3 {
  color: #10b981;
  margin-top: 0;
  margin-bottom: 1rem;
}

.keep-box p {
  font-size: 0.88rem;
  margin-bottom: 0.8rem;
}

/* Formulario */
.form-section {
  background: color-mix(in srgb, var(--card-bg) 96%, #fff 4%);
  padding: 2rem;
  border-radius: 20px;
  border: 1px solid var(--border);
}

.form-hint {
  font-size: 0.9rem;
  opacity: 0.8;
  margin-bottom: 1.5rem;
}

.request-form {
  display: grid;
  gap: 1.2rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.form-group label {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-h);
}

.form-group input,
.form-group textarea {
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 0.8rem 1rem;
  border-radius: 10px;
  font-family: inherit;
  font-size: 0.92rem;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 15%, transparent);
}

.submit-btn {
  background: var(--primary);
  color: #fff;
  border: none;
  padding: 1rem;
  border-radius: 12px;
  font-weight: 700;
  font-size: 1rem;
  cursor: pointer;
  transition: transform 0.2s, opacity 0.2s;
  margin-top: 0.5rem;
}

.submit-btn:hover {
  opacity: 0.95;
  transform: translateY(-1px);
}

.submit-btn:active {
  transform: translateY(0);
}

.alternative-contact {
  margin-top: 1.5rem;
  text-align: center;
  font-size: 0.88rem;
  opacity: 0.8;
}

.alternative-contact a {
  color: var(--primary);
  text-decoration: none;
  font-weight: 600;
}

.alternative-contact a:hover {
  text-decoration: underline;
}

/* Footer */
.delete-footer {
  text-align: center;
  margin-top: 3rem;
  border-top: 1px solid var(--border);
  padding-top: 1.5rem;
}

.back-link {
  display: inline-block;
  color: var(--primary);
  text-decoration: none;
  font-weight: 600;
  transition: opacity 0.2s;
}

.back-link:hover {
  text-decoration: underline;
  opacity: 0.9;
}

@media (max-width: 768px) {
  .delete-card {
    padding: 1.5rem;
  }
  
  .form-section {
    padding: 1.2rem;
  }
}
</style>
