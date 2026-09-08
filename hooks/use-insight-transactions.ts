import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import type { AnalyticsTransaction } from '../services/analytics';

export function useInsightTransactions() {
  const [items, setItems] = useState<AnalyticsTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let stopSnapshot = () => {};
    const stopAuth = onAuthStateChanged(auth, user => {
      stopSnapshot();
      setItems([]);
      setError('');
      setLoading(!!user);
      if (!user) return;
      stopSnapshot = onSnapshot(collection(db, 'users', user.uid, 'transactions'), snapshot => {
        setItems(snapshot.docs.map(doc => {
          const data = doc.data();
          return { ...data, id: doc.id, detail: String(data.detail || 'Untitled entry'), amount: String(data.amount ?? 0),
            type: data.type === 'income' ? 'income' : 'expense', date: String(data.date || ''),
            paidMonths: Array.isArray(data.paidMonths) ? data.paidMonths.filter((m: unknown) => typeof m === 'string') : [] };
        }));
        setLoading(false);
        setError('');
      }, () => { setError('We couldn’t load your transactions. Check your connection and try again.'); setLoading(false); });
    });
    return () => { stopAuth(); stopSnapshot(); };
  }, [attempt]);
  return { items, loading, error, retry: () => setAttempt(value => value + 1) };
}
