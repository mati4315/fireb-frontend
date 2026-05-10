import { defineStore } from 'pinia';
import { ref } from 'vue';
import { 
  ref as storageRef, 
  uploadBytesResumable, 
  getDownloadURL 
} from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { functions, storage } from '@/config/firebase';

export type UploadedFileResult = {
  url: string;
  path: string;
  sizeBytes: number;
  contentType: string;
};

export const useStorageStore = defineStore('storage', () => {
  const uploadProgress = ref<number>(0);
  const uploading = ref<boolean>(false);
  const error = ref<string | null>(null);
  const uploadProvider = String(import.meta.env.VITE_IMAGE_UPLOAD_PROVIDER || 'firebase').toLowerCase();
  const useHostingUpload = uploadProvider === 'hosting';

  const fileToBase64 = async (file: File): Promise<string> => (
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        const payload = result.includes(',') ? result.split(',')[1] : result;
        if (!payload) {
          reject(new Error('No se pudo leer el archivo.'));
          return;
        }
        resolve(payload);
      };
      reader.onerror = () => reject(new Error('No se pudo convertir la imagen.'));
      reader.readAsDataURL(file);
    })
  );

  /**
   * Uploads a file to Firebase Storage and returns details.
   * @param file The file to upload
   * @param path The path in storage (e.g., 'posts/uid/filename')
   */
  const uploadFileWithProgress = async (
    file: File,
    path: string,
    onProgress?: (progress: number) => void
  ): Promise<UploadedFileResult> => {
    uploading.value = true;
    uploadProgress.value = 0;
    error.value = null;

    try {
      if (useHostingUpload) {
        uploadProgress.value = 12;
        if (onProgress) onProgress(12);

        const base64Data = await fileToBase64(file);
        uploadProgress.value = 28;
        if (onProgress) onProgress(28);

        const uploadCallable = httpsCallable(functions, 'uploadCommunityImageToHosting');
        const response = await uploadCallable({
          path,
          fileName: file.name,
          contentType: file.type,
          base64Data
        });

        const payload = (response.data || {}) as Partial<UploadedFileResult>;
        if (!payload.url || !payload.path) {
          throw new Error('Respuesta invalida del servidor de imagenes.');
        }

        uploadProgress.value = 100;
        if (onProgress) onProgress(100);
        uploading.value = false;
        return {
          url: payload.url,
          path: payload.path,
          sizeBytes: Number(payload.sizeBytes || file.size),
          contentType: payload.contentType || file.type || 'application/octet-stream'
        };
      }

      const fileRef = storageRef(storage, path);
      const uploadTask = uploadBytesResumable(fileRef, file, {
        contentType: file.type || 'application/octet-stream'
      });

      return new Promise((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            uploadProgress.value = progress;
            if (onProgress) onProgress(progress);
          },
          (err) => {
            error.value = err.message;
            uploading.value = false;
            reject(err);
          },
          async () => {
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              uploading.value = false;
              resolve({
                url: downloadURL,
                path,
                sizeBytes: file.size,
                contentType: file.type || 'application/octet-stream'
              });
            } catch (err: any) {
              error.value = err.message;
              uploading.value = false;
              reject(err);
            }
          }
        );
      });
    } catch (err: any) {
      error.value = err.message;
      uploading.value = false;
      throw err;
    }
  };

  const uploadFile = async (file: File, path: string): Promise<string> => {
    const result = await uploadFileWithProgress(file, path);
    return result.url;
  };

  return {
    uploadProgress,
    uploading,
    error,
    uploadFile,
    uploadFileWithProgress
  };
});
