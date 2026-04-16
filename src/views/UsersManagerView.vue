<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  collection,
  doc,
  limit,
  orderBy,
  query,
  startAfter,
  getDocs,
  deleteDoc,
  getCountFromServer,
  type QueryDocumentSnapshot,
  Timestamp
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
import { useAuthStore } from '@/stores/authStore';
import { isAdminUser, isSuperAdminEmail, isSuperAdminUid } from '@/utils/roles';

type UserRole = 'usuario' | 'colaborador' | 'admin' | 'administrador' | 'super_admin' | 'Sistema-no-user';

type UserItem = {
  id: string;
  nombre: string;
  username: string;
  email: string;
  rol: UserRole;
  isVerified: boolean;
  createdAt: any;
};

type SocialProviderSummary = {
  providerIds: string[];
};

const authStore = useAuthStore();

const isAuthorized = computed(() => {
  const rol = authStore.userProfile?.rol;
  const email = authStore.user?.email || authStore.userProfile?.email;
  const uid = authStore.user?.uid;
  return authStore.isAuthenticated && isAdminUser(rol, email, uid, authStore.tokenClaims);
});
const isSystemAdministrator = computed(() => {
  const email = authStore.user?.email || authStore.userProfile?.email || '';
  const uid = authStore.user?.uid || '';
  const claims = (authStore.tokenClaims || {}) as Record<string, unknown>;
  return isSuperAdminEmail(email) ||
    isSuperAdminUid(uid) ||
    claims.superAdmin === true ||
    claims.super_admin === true;
});

const users = ref<UserItem[]>([]);
const socialByUserId = ref<Record<string, SocialProviderSummary>>({});
const totalUsers = ref(0);
const loading = ref(false);
const feedback = ref('');
const errorMessage = ref('');

// Pagination
const lastVisible = ref<QueryDocumentSnapshot | null>(null);
const firstVisible = ref<QueryDocumentSnapshot | null>(null);
const isFirstPage = ref(true);
const isLastPage = ref(false);
const pageSize = 10;
const SOCIAL_PROVIDERS = [
  { id: 'google.com', label: 'Google' },
  { id: 'facebook.com', label: 'Facebook' }
] as const;

// Edit Modal
const showEditModal = ref(false);
const editingUser = ref<UserItem | null>(null);
const editRole = ref<UserRole>('usuario');
const editIsVerified = ref(false);
const editNombre = ref('');
const editUsername = ref('');
const editEmail = ref('');
const savingEdit = ref(false);

const resetFeedback = () => {
  feedback.value = '';
  errorMessage.value = '';
};

const formatDate = (value: any) => {
  if (!value) return '-';
  const parsed = value instanceof Timestamp ? value.toDate() : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(parsed);
};

const fetchTotalCount = async () => {
  try {
    const coll = collection(db, 'users');
    const snapshot = await getCountFromServer(coll);
    totalUsers.value = snapshot.data().count;
  } catch (error: any) {
    console.error('Error fetching count:', error);
  }
};

const loadSocialConnections = async (userIds: string[]) => {
  if (!userIds.length) {
    socialByUserId.value = {};
    return;
  }

  try {
    const callable = httpsCallable(functions, 'getUsersSocialConnections');
    const response = await callable({ userIds });
    const payload = (response.data || {}) as {
      records?: Record<string, SocialProviderSummary>;
    };
    socialByUserId.value = payload.records || {};
  } catch (error) {
    console.error('Error loading social connections:', error);
    socialByUserId.value = {};
  }
};

const isSocialConnected = (userId: string, providerId: string): boolean => {
  const providers = socialByUserId.value[userId]?.providerIds || [];
  return providers.includes(providerId);
};

const loadUsers = async (direction: 'next' | 'prev' | 'initial' = 'initial') => {
  if (loading.value) return;
  loading.value = true;
  resetFeedback();

  try {
    const usersColl = collection(db, 'users');
    let q = query(usersColl, orderBy('createdAt', 'desc'), limit(pageSize));

    if (direction === 'next' && lastVisible.value) {
      q = query(usersColl, orderBy('createdAt', 'desc'), startAfter(lastVisible.value), limit(pageSize));
    } else if (direction === 'prev' && firstVisible.value) {
      // For prev, we usually need to re-fetch or use a different strategy.
      // Firestore pagination with "Prev" is tricky without storing cursors.
      // For now, I'll just support "Next" or reset to first.
      // Or I can store a history of cursors.
    }

    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      if (direction === 'initial') users.value = [];
      socialByUserId.value = {};
      isLastPage.value = true;
    } else {
      users.value = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as UserItem));
      await loadSocialConnections(users.value.map((user) => user.id));
      
      firstVisible.value = snapshot.docs[0];
      lastVisible.value = snapshot.docs[snapshot.docs.length - 1];
      
      isFirstPage.value = direction === 'initial';
      isLastPage.value = snapshot.docs.length < pageSize;
    }
  } catch (error: any) {
    errorMessage.value = `Error cargando usuarios: ${error.message}`;
  } finally {
    loading.value = false;
  }
};

const openEditModal = (user: UserItem) => {
  editingUser.value = { ...user };
  editRole.value = user.rol || 'usuario';
  editIsVerified.value = user.isVerified || false;
  editNombre.value = user.nombre || '';
  editUsername.value = user.username || '';
  editEmail.value = user.email || '';
  showEditModal.value = true;
};

const closeEditModal = () => {
  showEditModal.value = false;
  editingUser.value = null;
};

const saveUserEdit = async () => {
  if (!editingUser.value) return;
  savingEdit.value = true;
  resetFeedback();

  try {
    const callable = httpsCallable(functions, 'updateUserManagement');
    const payload: Record<string, unknown> = {
      userId: editingUser.value.id,
      rol: editRole.value,
      isVerified: editIsVerified.value
    };
    if (isSystemAdministrator.value) {
      payload.nombre = editNombre.value.trim();
      payload.username = editUsername.value.trim();
      payload.email = editEmail.value.trim().toLowerCase();
    }
    const response = await callable(payload);
    const result = (response.data || {}) as {
      updated?: {
        rol?: UserRole;
        isVerified?: boolean;
        nombre?: string;
        username?: string;
        email?: string;
      };
    };
    
    // Update local state
    const index = users.value.findIndex(u => u.id === editingUser.value?.id);
    if (index !== -1) {
      users.value[index].rol = (result.updated?.rol || editRole.value) as UserRole;
      users.value[index].isVerified = result.updated?.isVerified ?? editIsVerified.value;
      users.value[index].nombre = result.updated?.nombre || users.value[index].nombre;
      users.value[index].username = result.updated?.username || users.value[index].username;
      users.value[index].email = result.updated?.email || users.value[index].email;
    }

    feedback.value = 'Usuario actualizado correctamente.';
    closeEditModal();
  } catch (error: any) {
    errorMessage.value = `Error al guardar: ${error.message}`;
  } finally {
    savingEdit.value = false;
  }
};

const deleteUser = async (user: UserItem) => {
  const confirmed = window.confirm(`¿Estás seguro de que deseas eliminar al usuario ${user.username}? Esta acción no se puede deshacer.`);
  if (!confirmed) return;

  resetFeedback();
  try {
    await deleteDoc(doc(db, 'users', user.id));
    users.value = users.value.filter(u => u.id !== user.id);
    totalUsers.value--;
    feedback.value = 'Usuario eliminado de Firestore.';
  } catch (error: any) {
    errorMessage.value = `Error al eliminar: ${error.message}`;
  }
};

onMounted(() => {
  if (isAuthorized.value) {
    fetchTotalCount();
    loadUsers();
  }
});
</script>

<template>
  <section class="users-manager-page">
    <header class="page-head">
      <h1>Gestión de Usuarios</h1>
      <div v-if="isAuthorized" class="stats">
        <span class="stat-badge">Total Usuarios: {{ totalUsers }}</span>
      </div>
    </header>

    <div v-if="!isAuthorized" class="restricted-card">
      <h2>Acceso Denegado</h2>
      <p>No tienes permisos suficientes para acceder a esta sección.</p>
      <RouterLink to="/" class="go-home">Volver al inicio</RouterLink>
    </div>

    <template v-else>
      <div v-if="feedback" class="msg ok">{{ feedback }}</div>
      <div v-if="errorMessage" class="msg error">{{ errorMessage }}</div>

      <div class="card table-container">
        <table class="users-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Usuario</th>
              <th>Email</th>
              <th>Social</th>
              <th>Rol</th>
              <th>Verificado</th>
              <th>Creado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading && users.length === 0">
              <td colspan="8" class="loading-cell">Cargando usuarios...</td>
            </tr>
            <tr v-else-if="users.length === 0">
              <td colspan="8" class="empty-cell">No se encontraron usuarios.</td>
            </tr>
            <tr v-for="user in users" :key="user.id">
              <td class="bold">{{ user.nombre || '-' }}</td>
              <td>@{{ user.username }}</td>
              <td class="email">{{ user.email }}</td>
              <td>
                <div class="social-status">
                  <div
                    v-for="provider in SOCIAL_PROVIDERS"
                    :key="`${user.id}_${provider.id}`"
                    class="social-row"
                  >
                    <span class="social-name">{{ provider.label }}</span>
                    <span class="social-mark" :class="{ off: !isSocialConnected(user.id, provider.id) }">
                      {{ isSocialConnected(user.id, provider.id) ? '✅' : '❌' }}
                    </span>
                  </div>
                </div>
              </td>
              <td>
                <span class="role-badge" :class="user.rol">{{ user.rol }}</span>
              </td>
              <td>
                <span v-if="user.isVerified" class="verified-icon">✓</span>
                <span v-else class="not-verified">-</span>
              </td>
              <td class="date-cell">{{ formatDate(user.createdAt) }}</td>
              <td class="actions-cell">
                <button class="icon-btn edit" title="Editar" @click="openEditModal(user)">
                  ✏️
                </button>
                <button class="icon-btn delete" title="Eliminar" @click="deleteUser(user)">
                  🗑️
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <footer class="pagination">
          <button 
            class="ghost" 
            :disabled="isFirstPage || loading"
            @click="loadUsers('initial')"
          >
            Primera
          </button>
          <button 
            class="ghost" 
            :disabled="isLastPage || loading"
            @click="loadUsers('next')"
          >
            Siguiente
          </button>
        </footer>
      </div>
    </template>

    <!-- Edit Modal -->
    <Teleport to="body">
      <div v-if="showEditModal" class="modal-overlay" @click.self="closeEditModal">
        <div class="modal-card">
          <header class="modal-head">
            <h3>Editar Usuario: @{{ editingUser?.username }}</h3>
            <button class="close-btn" @click="closeEditModal">×</button>
          </header>
          
          <div class="modal-body">
            <div class="user-details-summary">
              <div class="detail-row">
                <span class="label">ID de Usuario</span>
                <span class="value code">{{ editingUser?.id }}</span>
              </div>
              <div class="detail-row">
                <span class="label">Nombre Completo</span>
                <span class="value">{{ editingUser?.nombre || '-' }}</span>
              </div>
              <div class="detail-row">
                <span class="label">Nombre de Usuario</span>
                <span class="value">@{{ editingUser?.username }}</span>
              </div>
              <div class="detail-row">
                <span class="label">Email</span>
                <span class="value">{{ editingUser?.email }}</span>
              </div>
              <div class="detail-row">
                <span class="label">Fecha de Registro</span>
                <span class="value">{{ formatDate(editingUser?.createdAt) }}</span>
              </div>
            </div>

            <hr class="divider" />

            <div class="form-field">
              <label>Nombre Completo</label>
              <input
                v-model="editNombre"
                type="text"
                maxlength="120"
                :disabled="!isSystemAdministrator"
              />
            </div>

            <div class="form-field">
              <label>Usuario</label>
              <input
                v-model="editUsername"
                type="text"
                maxlength="30"
                :disabled="!isSystemAdministrator"
              />
            </div>

            <div class="form-field">
              <label>Email</label>
              <input
                v-model="editEmail"
                type="email"
                maxlength="320"
                :disabled="!isSystemAdministrator"
              />
            </div>

            <p v-if="!isSystemAdministrator" class="helper-note">
              Solo el administrador del sistema puede editar nombre, usuario y email.
            </p>

            <div class="form-field">
              <label>Rol del Sistema</label>
              <select v-model="editRole">
                <option value="usuario">Usuario (Lector)</option>
                <option value="colaborador">Colaborador (Editor)</option>
                <option value="admin">Administrador</option>
                <option value="super_admin">Super Admin</option>
                <option value="Sistema-no-user">Sistema-no-user</option>
              </select>
            </div>
            
            <div class="form-field checkbox">
              <label>
                <input type="checkbox" v-model="editIsVerified" />
                <span>Cuenta Verificada (Insignia)</span>
              </label>
            </div>
          </div>

          <footer class="modal-foot">
            <button class="primary" :disabled="savingEdit" @click="saveUserEdit">
              {{ savingEdit ? 'Guardando...' : 'Guardar Cambios' }}
            </button>
            <button class="ghost" @click="closeEditModal">Cancelar</button>
          </footer>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.users-manager-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem 1rem 3rem;
}

.page-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.page-head h1 {
  margin: 0;
  color: var(--text-h);
}

.stat-badge {
  background: var(--accent);
  color: #fff;
  padding: 0.4rem 0.8rem;
  border-radius: 999px;
  font-weight: 700;
  font-size: 0.9rem;
}

.restricted-card, .card {
  border: 1px solid var(--border);
  background: var(--card-bg);
  border-radius: 20px;
  padding: 1.5rem;
}

.table-container {
  overflow-x: auto;
  padding: 0;
}

.users-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.users-table th {
  padding: 1rem;
  border-bottom: 1px solid var(--border);
  color: var(--text);
  font-weight: 700;
  text-transform: uppercase;
  font-size: 0.8rem;
}

.users-table td {
  padding: 1rem;
  border-bottom: 1px solid var(--border);
  color: var(--text-h);
  vertical-align: middle;
}

.bold { font-weight: 700; }
.email { color: var(--text); font-size: 0.9rem; }

.social-status {
  display: grid;
  gap: 0.2rem;
}

.social-row {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.82rem;
}

.social-name {
  color: var(--text);
  font-weight: 600;
}

.social-mark {
  line-height: 1;
}

.social-mark.off {
  opacity: 0.8;
}

.role-badge {
  padding: 0.2rem 0.6rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 800;
  text-transform: uppercase;
}

.role-badge.admin, .role-badge.administrador, .role-badge.super_admin {
  background: #fef3c7;
  color: #92400e;
}

.role-badge.colaborador {
  background: #dcfce7;
  color: #166534;
}

.role-badge.usuario {
  background: #f3f4f6;
  color: #374151;
}

.verified-icon {
  color: var(--accent);
  font-weight: 900;
  font-size: 1.2rem;
}

.not-verified {
  color: var(--text-muted, #999);
}

.date-cell {
  font-size: 0.85rem;
  color: var(--text);
  white-space: nowrap;
}

.actions-cell {
  display: flex;
  gap: 0.5rem;
}

.icon-btn {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.icon-btn:hover { background: var(--border); }
.icon-btn.delete:hover { border-color: #ef4444; color: #ef4444; }

.pagination {
  display: flex;
  justify-content: center;
  gap: 1rem;
  padding: 1.5rem;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 1rem;
  overflow-y: auto;
  z-index: 1000;
}

.modal-card {
  background: var(--card-bg);
  width: 100%;
  max-width: 520px;
  max-height: calc(100vh - 2rem);
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
  margin: auto 0;
}

.modal-head {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-head h3 { margin: 0; }
.close-btn { 
  background: none; 
  border: none; 
  font-size: 1.5rem; 
  cursor: pointer;
  color: var(--text);
}

.modal-body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  overflow-y: auto;
  min-height: 0;
}

.user-details-summary {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: var(--bg);
  padding: 1rem;
  border-radius: 16px;
  border: 1px solid var(--border);
}

.detail-row {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.detail-row .label {
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--text-s, #64748b);
  letter-spacing: 0.05em;
}

.detail-row .value {
  font-size: 0.95rem;
  color: var(--text-h);
  word-break: break-all;
}

.detail-row .value.code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.82rem;
  background: var(--card-bg);
  padding: 0.1rem 0.3rem;
  border-radius: 4px;
}

.divider {
  border: 0;
  border-top: 1px solid var(--border);
  margin: 0;
  opacity: 0.5;
}

.form-field label {
  display: block;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.form-field select {
  width: 100%;
  padding: 0.75rem;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-h);
}

.form-field input {
  width: 100%;
  padding: 0.75rem;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-h);
}

.form-field input:disabled {
  opacity: 0.75;
  cursor: not-allowed;
}

.form-field.checkbox label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.helper-note {
  margin: -0.2rem 0 0;
  color: var(--text-s, #64748b);
  font-size: 0.84rem;
}

.modal-foot {
  padding: 1.25rem 1.5rem;
  border-top: 1px solid var(--border);
  display: flex;
  gap: 0.75rem;
  background: var(--card-bg);
  position: sticky;
  bottom: 0;
  z-index: 1;
}

.msg {
  padding: 1rem;
  border-radius: 12px;
  margin-bottom: 1rem;
  font-weight: 600;
}

.msg.ok { background: #dcfce7; color: #166534; }
.msg.error { background: #fee2e2; color: #991b1b; }

button.primary {
  background: var(--accent);
  color: #fff;
  border: none;
  padding: 0.7rem 1.2rem;
  border-radius: 12px;
  font-weight: 700;
  cursor: pointer;
}

button.ghost {
  background: var(--bg);
  color: var(--text-h);
  border: 1px solid var(--border);
  padding: 0.7rem 1.2rem;
  border-radius: 12px;
  font-weight: 700;
  cursor: pointer;
}

button:disabled { opacity: 0.5; cursor: not-allowed; }

.go-home { color: var(--accent); text-decoration: none; font-weight: 700; }

@media (max-width: 768px) {
  .users-table th:nth-child(1), .users-table td:nth-child(1) { display: none; }
  .users-table th:nth-child(7), .users-table td:nth-child(7) { display: none; }

  .modal-overlay {
    padding: 0.5rem;
  }

  .modal-card {
    max-height: calc(100vh - 1rem);
    border-radius: 16px;
  }

  .modal-head,
  .modal-body,
  .modal-foot {
    padding-left: 1rem;
    padding-right: 1rem;
  }

  .modal-foot {
    flex-direction: column-reverse;
  }

  .modal-foot button {
    width: 100%;
  }
}
</style>
