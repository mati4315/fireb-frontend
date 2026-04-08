import { defineStore } from 'pinia';
import { ref } from 'vue';
import { 
  ref as storageRef, 
  uploadBytesResumable, 
  getDownloadURL 
} from 'firebase/storage';
import { storage } from '@/config/firebase';

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
