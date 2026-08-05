import { db } from "./firebase";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc
} from "firebase/firestore";

// ========================
// ADD TRANSACTION
// ========================
export const addTransaction = async (uid: string, data: any) => {
  return await addDoc(
    collection(db, "users", uid, "transactions"),
    data 
  );
};

// ========================
// GET TRANSACTIONS
// ========================
export const getTransactions = async (uid: string) => {
  const snap = await getDocs(collection(db, "users", uid, "transactions"));

  return snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
};

// ========================
// DELETE TRANSACTION
// ========================
export const deleteTransaction = async (
  userId: string,
  transactionId: string
) => {
  if (!userId || !transactionId) {
    throw new Error("User ID or transaction ID is missing.");
  }

  const transactionRef = doc(
    db,
    "users",
    userId,
    "transactions",
    transactionId
  );

  await deleteDoc(transactionRef);
};


// ========================
// UPDATE TRANSACTION
// ========================
export const updateTransaction = async (uid: string, id: string, data: any) => {
  return await updateDoc(doc(db, "users", uid, "transactions", id), data);
};