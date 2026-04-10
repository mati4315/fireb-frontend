import { defineStore } from 'pinia';
import { 
  doc, 
  setDoc, 
  deleteDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuthStore } from './authStore';

export const useInteractionStore = defineStore('interaction', () => {
  const authStore = useAuthStore();

  // LIKE
  const toggleLike = async (contentId: string, isLiked: boolean) => {
    if (!authStore.user) return;
    const userId = authStore.user.uid;
    const likeRef = doc(db, 'content', contentId, 'likes', userId);

    try {
      if (isLiked) {
        await deleteDoc(likeRef);
      } else {
        await setDoc(likeRef, {
          createdAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      throw error;
    }
  };

  // CHECK IF LIKED
  const checkIfLiked = async (_contentId: string) => {
    if (!authStore.user) return false;
    // const userId = authStore.user.uid;
    // const likeRef = doc(db, 'content', contentId, 'likes', userId);
    // return (await getDoc(likeRef)).exists(); 
    // Optimization: check local state if possible, but for now direct check
    return false; // Implement as needed
  };

  // FOLLOW
  const followUser = async (targetUserId: string) => {
    if (!authStore.user) return;
    const currentUserId = authStore.user.uid;

    const followerRef = doc(db, 'relationships', targetUserId, 'followers', currentUserId);
    const followingRef = doc(db, 'relationships', currentUserId, 'following', targetUserId);

    try {
      await setDoc(followerRef, { createdAt: serverTimestamp() });
      await setDoc(followingRef, { createdAt: serverTimestamp() });
    } catch (error) {
      console.error('Error following user:', error);
      throw error;
    }
  };

  const unfollowUser = async (targetUserId: string) => {
    if (!authStore.user) return;
    const currentUserId = authStore.user.uid;

    const followerRef = doc(db, 'relationships', targetUserId, 'followers', currentUserId);
    const followingRef = doc(db, 'relationships', currentUserId, 'following', targetUserId);

    try {
      await deleteDoc(followerRef);
      await deleteDoc(followingRef);
    } catch (error) {
      console.error('Error unfollowing user:', error);
      throw error;
    }
  };

  return {
    toggleLike,
    checkIfLiked,
    followUser,
    unfollowUser
  };
});
