
import { db, storage } from '../firebaseConfig';
import { collection, addDoc, query, where, orderBy, onSnapshot, setDoc, doc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import type { ActivityLogItem, User, ChatMessage } from '../types';

/**
 * Syncs user profile data to Firestore.
 */
export const saveUserProfile = async (user: User) => {
    try {
        const userRef = doc(db, 'users', user.phone);
        // We use setDoc with merge: true to update or create
        await setDoc(userRef, { ...user, last_login_at: new Date().toISOString() }, { merge: true });
    } catch (e) {
        console.error("Error saving user profile:", e);
    }
};

/**
 * Uploads a file to Firebase Storage and returns the download URL.
 */
export const uploadFile = async (file: File, path: string): Promise<string> => {
    try {
        const storageRef = ref(storage, path);
        const snapshot = await uploadBytes(storageRef, file);
        return await getDownloadURL(snapshot.ref);
    } catch (e) {
        console.error("Error uploading file:", e);
        throw e;
    }
};

/**
 * Adds an activity log to Firestore.
 */
export const addActivity = async (activity: ActivityLogItem) => {
    try {
        // Create a copy and remove the 'id' field before saving to let Firestore generate it.
        // This prevents storing empty "id": "" strings in the database or overwriting IDs incorrectly.
        const { id, ...activityData } = activity;
        await addDoc(collection(db, 'activities'), activityData);
    } catch (e) {
        console.error("Error adding activity:", e);
    }
};

/**
 * Subscribes to the user's activity history in real-time.
 */
export const subscribeToHistory = (userPhone: string, callback: (items: ActivityLogItem[]) => void) => {
    const q = query(
        collection(db, 'activities'),
        where('userPhone', '==', userPhone),
        orderBy('timestamp', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLogItem));
        callback(items);
    });
};

/**
 * Saves a chat message to Firestore.
 */
export const saveChatMessage = async (userPhone: string, message: ChatMessage) => {
    try {
        await addDoc(collection(db, 'chats'), {
            userPhone,
            ...message,
            timestamp: Date.now()
        });
    } catch (e) {
        console.error("Error saving chat message:", e);
    }
};

/**
 * Saves a globe interaction (tap/search) to Firestore.
 */
export const saveGlobeInteraction = async (userPhone: string, interaction: any) => {
    try {
        await addDoc(collection(db, 'globe_interactions'), {
            userPhone,
            ...interaction,
            timestamp: Date.now()
        });
    } catch (e) {
        console.error("Error saving globe interaction:", e);
    }
};
