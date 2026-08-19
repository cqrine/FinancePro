import AsyncStorage from '@react-native-async-storage/async-storage';
import { logoutUser } from "../../services/authService";
import { auth } from "../../services/firebase";
import { addTransaction, deleteTransaction, updateTransaction } from "../../services/transactionService";
import { useRouter } from "expo-router";
import { onSnapshot, collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from "../../services/firebase";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { requestNotificationPermission, scheduleDailyReminder } from "../../services/notificationService";
import { predictFutureSpending } from "../../services/aiService";
import * as Notifications from "expo-notifications";
import {
  Alert,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet, Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import { MaterialIcons } from '@expo/vector-icons';
import ReanimatedAnimated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { AnimatedPressable } from '../../components/animated-pressable';
import { AnimatedProgressBar } from '../../components/animated-progress-bar';

// === CONFIG & COLORS ===
const COLORS = {
  primary: '#0d6efd',   // Blue
  success: '#198754',   // Green
  danger: '#dc3545',    // Red
  warning: '#ffc107',   // Yellow
  dark: '#212529',      // Dark Text
  light: '#f8f9fa',     // Background
  white: '#ffffff',
  gray: '#6c757d',
  border: '#dee2e6',
  purple: '#6f42c1',
  purpleLight: '#e0cffc'
};

const MONTH_MAP: Record<string, string> = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'May', '06': 'Jun',
  '07': 'Jul', '08': 'Aug', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec'
};

const CATEGORIES = [
  { key: 'food', label: 'Food', emoji: '🍔' },
  { key: 'transport', label: 'Transport', emoji: '🚗' },
  { key: 'bills', label: 'Bills', emoji: '🧾' },
  { key: 'shopping', label: 'Shopping', emoji: '🛍️' },
  { key: 'entertainment', label: 'Entertainment', emoji: '🎬' },
  { key: 'health', label: 'Health', emoji: '🏥' },
  { key: 'education', label: 'Education', emoji: '🎓' },
  { key: 'salary', label: 'Salary', emoji: '💰' },
  { key: 'other', label: 'Other', emoji: '📦' },
] as const;

const DEFAULT_CATEGORY = 'other';

// Consistent depth across cards on both platforms — iOS only reads the shadow*
// props, Android only reads elevation, so both need to be set every time.
const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 6,
  elevation: 2,
} as const;

const getCategoryMeta = (key?: string) =>
  CATEGORIES.find(c => c.key === key) ?? CATEGORIES.find(c => c.key === DEFAULT_CATEGORY)!;

type Transaction = {
  id: string;
  type: 'income' | 'expense';
  detail: string;
  amount: string;
  date: string;
  startMonth?: string;
  isLoan: boolean;
  totalLoanAmount?: string;
  monthsLeft?: string;
  isRepeated: boolean;
  repeatDay?: string;
  paidMonths?: string[];
  category?: string;
};

// Firestore docs aren't guaranteed to match the Transaction shape (partial writes,
// legacy data, restores) — normalize them so required fields are never undefined.
const normalizeTransaction = (raw: any, id: string): Transaction => ({
  id,
  type: raw?.type === 'income' ? 'income' : 'expense',
  detail: typeof raw?.detail === 'string' ? raw.detail : '',
  amount: typeof raw?.amount === 'string' ? raw.amount : String(raw?.amount ?? '0'),
  date: typeof raw?.date === 'string' ? raw.date : '',
  startMonth: typeof raw?.startMonth === 'string' ? raw.startMonth : undefined,
  isLoan: !!raw?.isLoan,
  totalLoanAmount: typeof raw?.totalLoanAmount === 'string' ? raw.totalLoanAmount : undefined,
  monthsLeft: typeof raw?.monthsLeft === 'string' ? raw.monthsLeft : undefined,
  isRepeated: !!raw?.isRepeated,
  repeatDay: typeof raw?.repeatDay === 'string' ? raw.repeatDay : undefined,
  paidMonths: Array.isArray(raw?.paidMonths) ? raw.paidMonths : [],
  category: typeof raw?.category === 'string' ? raw.category : DEFAULT_CATEGORY,
});

// Shared by filteredItems, totalDebt, totalLoanBalance, and the list render —
// was previously reimplemented (and easy to accidentally desync) in all four places.
const getLoanRemainingBalance = (item: Pick<Transaction, 'totalLoanAmount' | 'amount' | 'paidMonths'>) => {
  const bigTotal = parseFloat(item.totalLoanAmount || '0');
  const monthly = parseFloat(item.amount || '0');
  const paidCount = item.paidMonths?.length || 0;
  return bigTotal - (paidCount * monthly);
};

// keyboardType="decimal-pad" only hints at which on-screen keyboard to show —
// it never blocks a hardware keyboard or paste, and has no effect at all on web
// (RN Web TextInput is a plain <input>). Strip anything that isn't a valid
// decimal/integer as the user types instead of relying on the keyboard type.
const sanitizeDecimalInput = (text: string) => {
  let cleaned = text.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
  }
  return cleaned;
};

const sanitizeIntegerInput = (text: string) => text.replace(/[^0-9]/g, '');

// React Native Web's Alert.alert() only ever shows a plain window.alert() message —
// it silently ignores the buttons array, so onPress handlers (Confirm/Cancel) never
// fire on web. That made Logout, Reset, and Delete appear to do nothing in a browser.
const confirmAction = (title: string, message: string, onConfirm: () => void) => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }

  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: "Confirm", style: "destructive", onPress: onConfirm },
  ]);
};

// Smooth color crossfade between active/inactive tab states instead of an
// abrupt background swap — kept intentionally simple (color-only, no layout
// measurement) to stay reliable across platforms.
function AnimatedTabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const progress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, { duration: 200 });
  }, [active, progress]);

  const animatedTabStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], ['transparent', COLORS.dark]),
  }));

  const animatedTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [COLORS.gray, COLORS.white]),
  }));

  return (
    <AnimatedPressable onPress={onPress} style={[styles.tab, animatedTabStyle]} scaleTo={0.94}>
      <ReanimatedAnimated.Text style={[styles.tabText, animatedTextStyle]}>{label}</ReanimatedAnimated.Text>
    </AnimatedPressable>
  );
}

export default function App() {
  const handleDelete = (item: Transaction) => {
    confirmAction(
      "Delete Transaction",
      `Are you sure you want to delete "${item.detail}"?`,
      async () => {
        try {
          const uid = auth.currentUser?.uid;

          if (!uid) {
            Alert.alert(
              "Delete Failed",
              "You are not logged in. Please log in again."
            );
            return;
          }

          await deleteTransaction(uid, item.id);

          Alert.alert(
            "Deleted",
            "The transaction has been deleted successfully."
          );
        } catch (error: any) {
          console.error("Delete transaction error:", error);

          Alert.alert(
            "Delete Failed",
            "Unable to delete this transaction. Please try again."
          );
        }
      }
    );
  };

  const router = useRouter();

  // === STATE ===
  const [items, setItems] = useState<Transaction[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'income' | 'expense'>('all');
  const [monthlyBudget, setMonthlyBudget] = useState('1000');
  const [modalVisible, setModalVisible] = useState(false); 
  const [menuVisible, setMenuVisible] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  
  // RESTORE STATE
  const [restoreVisible, setRestoreVisible] = useState(false);
  const [restoreText, setRestoreText] = useState('');

  const [forecastVisible, setForecastVisible] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];
  const [currentMonth, setCurrentMonth] = useState(todayStr.substring(0, 7)); 
  const [selectedDate, setSelectedDate] = useState(''); 

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newDetail, setNewDetail] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newType, setNewType] = useState<'income' | 'expense'>('expense');
  const [isLoan, setIsLoan] = useState(false);
  const [isRepeated, setIsRepeated] = useState(false);
  
  const [loanTotal, setLoanTotal] = useState('');
  // loanMonthsLeft is always the canonical value in months (matches the stored
  // `monthsLeft` field and every months-based calculation elsewhere in this file).
  const [loanMonthsLeft, setLoanMonthsLeft] = useState('');
  // loanYearsText is a separate, freely-typed display buffer used only while
  // loanDurationUnit === 'years' — deriving it from loanMonthsLeft on every
  // keystroke would collapse fractional years (e.g. typing "2." -> "2") because
  // rounding to whole months and back loses the in-progress decimal.
  const [loanDurationUnit, setLoanDurationUnit] = useState<'months' | 'years'>('months');
  const [loanYearsText, setLoanYearsText] = useState('');
  const [repeatDay, setRepeatDay] = useState('');
  const [newCategory, setNewCategory] = useState<string>(DEFAULT_CATEGORY);

  useEffect(() => {
    const initNotification = async () => {
      const granted = await requestNotificationPermission();
      console.log("permission:", granted);

      if (granted) {
        console.log("Notification permission OK");
      }
    };

    initNotification();
  }, []);

  // === LOAD SAVED BUDGET ===
  useEffect(() => {
    const loadBudget = async () => {
      try {
        const saved = await AsyncStorage.getItem('@finance_pro_budget');
        if (saved !== null) setMonthlyBudget(saved);
      } catch (e) {
        console.error(e);
      }
    };

    loadBudget();
  }, []);

  const handleLogout = () => {
    confirmAction("Logout", "Are you sure you want to logout?", async () => {
      try {
        await logoutUser();
        setMenuVisible(false);
        router.replace("/login");
      } catch (error: any) {
        Alert.alert("Logout Error", error.message);
      }
    });
  };

  // === INIT ===
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const ref = collection(db, "users", uid, "transactions");

    const unsub = onSnapshot(ref, (snapshot) => {
      const data = snapshot.docs.map((doc) => normalizeTransaction(doc.data(), doc.id));

      setItems(data);
    });

    return () => unsub();
  }, []);

  const saveData = async (item: Transaction) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    await addTransaction(uid, item);
  };

  const saveBudget = async (value: string) => {
    try {
      setMonthlyBudget(value);
      await AsyncStorage.setItem('@finance_pro_budget', value);
    } catch (e) {
      console.error(e);
    }
  };

  // === HELPER: MONTH DIFF ===
  const getMonthDiff = (start: string, current: string) => {
    const sYear = parseInt(start.split('-')[0]);
    const sMonth = parseInt(start.split('-')[1]);
    const cYear = parseInt(current.split('-')[0]);
    const cMonth = parseInt(current.split('-')[1]);
    return ((cYear - sYear) * 12) + (cMonth - sMonth);
  };

  const isPaidThisMonth = (item: Transaction) => item.paidMonths?.includes(currentMonth) || false;

  

  const filteredItems = useMemo(() => {
    let filtered = items.filter(item => {
      // 1. Start Date Check
      if (item.startMonth && item.startMonth > currentMonth) return false; 

      // 2. Smart Loan Check
      if (item.isLoan) {
         const currentBalance = getLoanRemainingBalance(item);

         // Check Balance
         if (currentBalance <= 0.1) return item.paidMonths?.includes(currentMonth);

         // Check Time
         if (item.startMonth && item.monthsLeft) {
             const totalDuration = parseFloat(item.monthsLeft);
             const monthsPassed = getMonthDiff(item.startMonth, currentMonth);
             const timelineLeft = totalDuration - monthsPassed;
             if (timelineLeft <= 0) return item.paidMonths?.includes(currentMonth);
         }
         return true;
      }

      if (item.isRepeated) return true;
      // startMonth is "YYYY-MM" (year-aware); date is just "day-Mon" for display,
      // so matching on date's month name would incorrectly match every year.
      if (item.startMonth === currentMonth) return true;
      return false;
    });

    filtered.sort((a, b) => {
      const getDay = (item: Transaction) => {
        if ((item.isRepeated || item.isLoan) && item.repeatDay) return parseInt(item.repeatDay);
        return parseInt(item.date.split('-')[0]) || 99;
      };
      return getDay(a) - getDay(b);
    });
    return filtered;
  }, [items, currentMonth]);

  const toggleStatus = async (id: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const item = items.find(i => i.id === id);
    if (!item) return;

    const paidList = item.paidMonths || [];
    const updatedPaidMonths = paidList.includes(currentMonth)
      ? paidList.filter(m => m !== currentMonth)
      : [...paidList, currentMonth];

    try {
      await updateTransaction(uid, id, { paidMonths: updatedPaidMonths });
    } catch (error) {
      console.error("Toggle paid status error:", error);
      Alert.alert("Update Failed", "Unable to update payment status. Please try again.");
    }
  };

  // === CALCULATIONS ===
  const monthStats = useMemo(() => {
    let income = 0, expense = 0, fixedCommitments = 0, unpaidExpenses = 0;
    
    filteredItems.forEach(item => {
      const val = parseFloat(item.amount || '0');
      
      if (item.type === 'income') {
        income += val;
      } else {
        expense += val;
        // Fixed Bills Logic
        if (item.isLoan || item.isRepeated) fixedCommitments += val;
        
        // Unpaid Expenses Logic
        if (!isPaidThisMonth(item)) {
            unpaidExpenses += val;
        }
      }
    });
    return { income, expense, balance: income - expense, fixedCommitments, unpaidExpenses };
  }, [filteredItems, currentMonth]);

  const budgetLimit = parseFloat(monthlyBudget || '0');
  const budgetUsedPercent = budgetLimit > 0 ? (monthStats.expense / budgetLimit) * 100 : 0;

  const budgetAlert =
    budgetLimit <= 0
      ? 'Please set your monthly budget.'
      : budgetUsedPercent >= 100
        ? 'Budget exceeded. Please reduce spending.'
        : budgetUsedPercent >= 80
          ? 'Warning: You are close to your budget limit.'
          : 'Your spending is still under control.';

  // 1. TOTAL DEBT (Future + Unpaid Recurring + Unpaid One-Time)
  const totalDebt = items.reduce((acc, item) => {
      if (item.type !== 'expense') return acc;

      // LOAN: Remaining Balance
      if (item.isLoan) {
          const remaining = getLoanRemainingBalance(item);
          return acc + (remaining > 0 ? remaining : 0);
      }

      // RECURRING: If unpaid current month
      if (item.isRepeated) {
          if (!item.paidMonths?.includes(currentMonth) && item.startMonth && item.startMonth <= currentMonth) {
              return acc + parseFloat(item.amount || '0');
          }
          return acc;
      }

      // ONE-TIME: If unpaid and in current/future
      if (item.startMonth && item.startMonth >= currentMonth) {
          if ((item.paidMonths || []).length === 0) return acc + parseFloat(item.amount || '0');
      }
      return acc;
  }, 0);

  // 2. LOAN BALANCE
  const totalLoanBalance = items.filter(i => i.isLoan).reduce((acc, item) => {
      const remaining = getLoanRemainingBalance(item);
      return acc + (remaining > 0 ? remaining : 0);
  }, 0);

  const aiReport = useMemo(() => {
    return predictFutureSpending(items);
  }, [items]);

  // Only alert once per crossing into over-budget, not on every items change
  // while already over budget (was firing a notification per transaction edit).
  const hasAlertedOverspendRef = useRef(false);

  useEffect(() => {
    if (!aiReport) return;

    const overBudget = aiReport.prediction > Number(monthlyBudget);

    if (overBudget && !hasAlertedOverspendRef.current) {
      hasAlertedOverspendRef.current = true;
      scheduleDailyReminder("⚠️ Overspending Alert", aiReport.message);
    } else if (!overBudget) {
      hasAlertedOverspendRef.current = false;
    }
  }, [aiReport, monthlyBudget]);

  // === ACTIONS ===
  const handleOpenAdd = () => {
    setEditingId(null);
    setNewDetail('');
    setNewAmount('');
    setNewDate('');
    setNewType('expense');
    setIsLoan(false);
    setIsRepeated(false);
    setLoanTotal('');
    setLoanMonthsLeft('');
    setLoanDurationUnit('months');
    setLoanYearsText('');
    setRepeatDay('');
    setNewCategory(DEFAULT_CATEGORY);
    setDatePickerVisible(false);
    setModalVisible(true);
  };

  const handleOpenEdit = (item: Transaction) => {
    setEditingId(item.id);
    setNewDetail(item.detail);
    setNewAmount(item.amount);
    const dayOnly = item.date.split('-')[0];
    setNewDate(dayOnly);
    setNewType(item.type);
    setIsLoan(item.isLoan);
    setIsRepeated(item.isRepeated);
    setLoanTotal(item.totalLoanAmount || '');
    setLoanMonthsLeft(item.monthsLeft || '');
    setLoanDurationUnit('months');
    setLoanYearsText('');
    setRepeatDay(item.repeatDay || '');
    setNewCategory(item.category || DEFAULT_CATEGORY);
    setModalVisible(true);
  };

  // Switching units converts the CURRENT value once, rather than re-deriving it
  // on every keystroke (see loanYearsText comment above for why that matters).
  const handleToggleLoanDurationUnit = (unit: 'months' | 'years') => {
    if (unit === loanDurationUnit) return;

    if (unit === 'years') {
      const months = parseInt(loanMonthsLeft || '0', 10);
      setLoanYearsText(months ? String(Math.round((months / 12) * 10) / 10) : '');
    }

    setLoanDurationUnit(unit);
  };

  const handleSaveItem = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const payload = {
      type: newType,
      detail: newDetail,
      amount: newAmount,
      date: newDate,
      isLoan,
      isRepeated,
      startMonth: currentMonth,
      totalLoanAmount: loanTotal,
      monthsLeft: loanMonthsLeft,
      repeatDay,
      category: newCategory,
    };

    if (editingId) {
      await updateTransaction(uid, editingId, payload);
    } else {
      await addTransaction(uid, { ...payload, paidMonths: [] });
    }

    setModalVisible(false);
  };

  const handleLongPress = (item: Transaction) => {
    Alert.alert("Manage Item", item.detail, [
        { text: "Cancel", style: "cancel" },
        { text: "Edit", onPress: () => handleOpenEdit(item) },
        { text: "Delete", style: "destructive", onPress: () => handleDelete(item) }
      ],
      { cancelable: true }
    );
  };

  const handleResetData = () => {
    confirmAction("Reset All Data", "Wipe everything?", async () => {
      try {
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        // delete all Firestore transactions
        const ref = collection(db, "users", uid, "transactions");
        const snap = await getDocs(ref);

        await Promise.all(
          snap.docs.map((docItem) =>
            deleteDoc(doc(db, "users", uid, "transactions", docItem.id))
          )
        );

        // clear UI
        setItems([]);
      } catch (error) {
        console.error("Reset error:", error);
        Alert.alert("Reset Failed", "Unable to wipe all data. Please try again.");
      }
    });
  };

  const handleBackup = async () => {
    try {
      const json = JSON.stringify(items, null, 2);
      await Share.share({ message: json, title: 'FinancePro Backup' });
    } catch (error) { Alert.alert("Error sharing"); }
  };

  const handleRestore = async () => {
    try {
      if (!restoreText) return;
      const parsed = JSON.parse(restoreText);

      if (!Array.isArray(parsed)) {
        Alert.alert("Error", "Invalid Format");
        return;
      }

      const uid = auth.currentUser?.uid;
      if (!uid) {
        Alert.alert("Restore Failed", "You are not logged in. Please log in again.");
        return;
      }

      // Re-import each backed-up transaction into Firestore as a new document
      // (old ids from the backup aren't valid Firestore doc ids for this account).
      await Promise.all(
        parsed.map((item) => {
          const { id, ...data } = item;
          return addTransaction(uid, data);
        })
      );

      Alert.alert("Success", "Data Restored!");
      setRestoreVisible(false);
      setRestoreText('');
    } catch (e) {
      console.error("Restore error:", e);
      Alert.alert("Error", "Invalid JSON Code");
    }
  };

  // Safe Open for Restore
  const openRestoreModal = () => {
      setMenuVisible(false);
      setTimeout(() => setRestoreVisible(true), 300);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.light} />

      {/* NAVBAR */}
      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.menuBtn}><Text style={styles.menuText}>☰</Text></TouchableOpacity>
        <Text style={styles.navTitle}>Finance<Text style={{color: COLORS.primary}}>Pro</Text></Text>
        <View style={{width: 30}} />
      </View>

      <ScrollView contentContainerStyle={{paddingBottom: 100}} keyboardShouldPersistTaps="handled">
        
        {/* CALENDAR */}
        <View style={styles.card}>
          <Calendar 
            current={currentMonth + '-01'}
            onMonthChange={(month: DateData) => { setCurrentMonth(month.dateString.substring(0, 7)); setSelectedDate(''); }}
            onDayPress={(day) => {
              if (selectedDate === day.dateString) {
                setSelectedDate('');
              } else {
                setSelectedDate(day.dateString);
              }
            }}
            markingType={'multi-dot'}
            markedDates={{
              [todayStr]: {
                customStyles: {
                  container: { backgroundColor: COLORS.primary },
                  text: { color: 'white' }
                }
              },

              ...filteredItems.reduce((acc: any, item) => {
                let d = '';

                if ((item.isRepeated || item.isLoan) && item.repeatDay) {
                  d = `${currentMonth}-${item.repeatDay.padStart(2, '0')}`;
                } else if (item.date) {
                  // item is already filtered to belong to currentMonth (see filteredItems)
                  d = `${currentMonth}-${item.date.split('-')[0].padStart(2, '0')}`;
                }

                if (d) {
                  const color =
                    item.type === 'income'
                      ? COLORS.success
                      : item.isLoan
                      ? COLORS.purple
                      : COLORS.danger;

                  if (!acc[d]) acc[d] = { dots: [] };
                  acc[d].dots.push({ color });
                }

                return acc;
              }, {}),

              ...(selectedDate
                ? {
                    [selectedDate]: {
                      selected: true,
                      selectedColor: COLORS.primary,
                      selectedTextColor: 'white'
                    }
                  }
                : {})
            }}
            theme={{ selectedDayBackgroundColor: COLORS.dark, todayTextColor: COLORS.primary, arrowColor: COLORS.primary }}
          />
          {selectedDate ? <TouchableOpacity onPress={() => setSelectedDate('')} style={styles.filterBadge}><Text style={{color:'white', fontSize:12}}>Clear Filter ✕</Text></TouchableOpacity> : null}
        </View>

        {/* QUICK DATE FILTERS */}
        <View style={styles.quickFilterRow}>

          <AnimatedPressable
            style={styles.quickBtn}
            scaleTo={0.94}
            onPress={() => {
              const today = new Date().toISOString().split('T')[0];
              setSelectedDate(today);
            }}
          >
            <Text style={styles.quickBtnText}>Today</Text>
          </AnimatedPressable>

          <AnimatedPressable
            style={styles.quickBtn}
            scaleTo={0.94}
            onPress={() => {
              const now = new Date();
              const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
              setSelectedDate(firstDay.toISOString().split('T')[0]);
            }}
          >
            <Text style={styles.quickBtnText}>This Month</Text>
          </AnimatedPressable>

          <AnimatedPressable
            style={styles.quickBtn}
            scaleTo={0.94}
            onPress={() => setSelectedDate('')}
          >
            <Text style={styles.quickBtnText}>Clear</Text>
          </AnimatedPressable>

        </View>

        {/* DASHBOARD */}
        <View style={styles.dashboardContainer}>
            <View style={[styles.statCard, {borderLeftColor: COLORS.success}]}>
              <View style={styles.statCardHeader}>
                <MaterialIcons name="arrow-upward" size={13} color={COLORS.success} />
                <Text style={styles.statLabel}>INCOME</Text>
              </View>
              <Text style={[styles.statValue, {color: COLORS.success}]}>RM {monthStats.income.toFixed(0)}</Text>
            </View>
            <View style={[styles.statCard, {borderLeftColor: COLORS.danger}]}>
              <View style={styles.statCardHeader}>
                <MaterialIcons name="arrow-downward" size={13} color={COLORS.danger} />
                <Text style={styles.statLabel}>EXPENSES</Text>
              </View>
              <Text style={[styles.statValue, {color: COLORS.danger}]}>RM {monthStats.expense.toFixed(0)}</Text>
            </View>
            <View style={[styles.statCard, {borderLeftColor: COLORS.primary}]}>
              <View style={styles.statCardHeader}>
                <MaterialIcons name="account-balance-wallet" size={13} color={monthStats.balance>=0?COLORS.primary:COLORS.danger} />
                <Text style={styles.statLabel}>BALANCE</Text>
              </View>
              <Text style={[styles.statValue, {color: monthStats.balance>=0?COLORS.primary:COLORS.danger}]}>RM {monthStats.balance.toFixed(0)}</Text>
            </View>
        </View>

        {/* BUDGET SMART ALERT */}
        <View style={styles.budgetCard}>
          <View style={styles.budgetHeader}>
            <Text style={styles.budgetTitle}>Monthly Budget</Text>
            <Text style={styles.budgetPercent}>{budgetUsedPercent.toFixed(0)}%</Text>
          </View>

          <TextInput
            placeholder="Set budget e.g. 1000"
            value={monthlyBudget}
            onChangeText={(text) => saveBudget(sanitizeDecimalInput(text))}
            keyboardType="decimal-pad"
            style={styles.budgetInput}
          />

          <AnimatedProgressBar
            percent={budgetUsedPercent}
            height={10}
            style={{ marginBottom: 8 }}
            fillColors={[COLORS.success, COLORS.warning, COLORS.danger]}
          />

          <Text
            style={[
              styles.budgetMessage,
              budgetUsedPercent >= 100 && { color: COLORS.danger },
              budgetUsedPercent >= 80 && budgetUsedPercent < 100 && { color: COLORS.warning },
            ]}
          >
            {budgetAlert}
          </Text>
        </View>

        {/* SPENDING FORECAST */}
        <AnimatedPressable onPress={() => setForecastVisible(true)} style={styles.forecastCard} scaleTo={0.98}>
          <View style={styles.forecastHeaderRow}>
            <View style={styles.forecastTitleRow}>
              <MaterialIcons name="insights" size={16} color={COLORS.primary} />
              <Text style={styles.forecastTitle}>Spending Forecast</Text>
            </View>
            <MaterialIcons name="chevron-right" size={18} color={COLORS.gray} />
          </View>
          <Text
            style={[
              styles.forecastValue,
              budgetLimit > 0 && aiReport.prediction > budgetLimit && { color: COLORS.danger },
            ]}
          >
            RM {aiReport.prediction.toFixed(2)} <Text style={styles.forecastValueUnit}>/ month</Text>
          </Text>
          <Text style={styles.forecastHint} numberOfLines={1}>
            {budgetLimit > 0 && aiReport.prediction > budgetLimit ? '⚠️ Above your budget — tap for details' : 'Tap for details'}
          </Text>
        </AnimatedPressable>

        {/* TABS */}
        <View style={styles.tabContainer}>
            {(['all', 'income', 'expense'] as const).map(t => (
                <AnimatedTabButton
                  key={t}
                  label={t === 'expense' ? 'EXPENSES' : t.toUpperCase()}
                  active={activeTab === t}
                  onPress={() => setActiveTab(t)}
                />
            ))}
        </View>

        {/* LIST */}
        <View style={styles.listContainer}>
        {filteredItems
          .filter(item => activeTab === 'all' || item.type === activeTab)
          .filter(item => {
             if (!selectedDate) return true;
             const dayNum = parseInt(selectedDate.split('-')[2]).toString();
             if ((item.isRepeated || item.isLoan) && item.repeatDay === dayNum) return true;
             if (item.date.startsWith(dayNum + '-')) return true;
             return false;
          })
          .map((item) => {
           const currentBalance = getLoanRemainingBalance(item);

           let timelineMonthsLeft = 0;
           if (item.startMonth && item.monthsLeft) {
             const totalDuration = parseFloat(item.monthsLeft);
             const monthsPassed = getMonthDiff(item.startMonth, currentMonth);
             timelineMonthsLeft = totalDuration - monthsPassed;
           }

           const displayDay = ((item.isRepeated || item.isLoan) && item.repeatDay) ? item.repeatDay : item.date.split('-')[0];
           const paid = isPaidThisMonth(item);

           return (
            <TouchableOpacity key={item.id} onLongPress={() => handleLongPress(item)} activeOpacity={0.9}>
              <View style={[styles.transactionCard, { opacity: paid ? 0.6 : 1 }]}>
                
                <View style={styles.dateBox}>
                    <Text style={styles.dateNum}>{displayDay}</Text>
                    <Text style={styles.dateMonth}>{(MONTH_MAP[currentMonth.split('-')[1]] || '')}</Text>
                </View>

                <View style={styles.detailsBox}>
                    <Text style={[styles.itemTitle, paid && {textDecorationLine:'line-through', color: COLORS.gray}]}>{item.detail}</Text>
                    <View style={styles.tagsRow}>
                        <Text style={styles.tagCategory}>{getCategoryMeta(item.category).emoji} {getCategoryMeta(item.category).label}</Text>
                        {item.isRepeated && <Text style={styles.tagBlue}>↻ Monthly</Text>}
                        {item.isLoan && <Text style={styles.tagPurple}>Loan</Text>}
                    </View>
                    {item.isLoan && (
                        <View style={{marginTop: 4}}>
                            <Text style={styles.loanSub}>Balance: <Text style={{fontWeight:'bold'}}>RM {currentBalance > 0 ? currentBalance.toFixed(0) : 0}</Text></Text>
                            <Text style={{fontSize:10, color:COLORS.gray}}>
                                Schedule: {timelineMonthsLeft > 0 ? timelineMonthsLeft : 0} months left
                            </Text>
                            <AnimatedProgressBar
                              percent={(() => {
                                const bigTotal = parseFloat(item.totalLoanAmount || '0');
                                return bigTotal > 0 ? ((bigTotal - currentBalance) / bigTotal) * 100 : 0;
                              })()}
                              height={5}
                              style={{ marginTop: 6 }}
                              fillColors={[COLORS.purple, COLORS.purple, COLORS.purple]}
                            />
                        </View>
                    )}
                </View>

                <View style={{alignItems:'flex-end'}}>
                    <Text style={[styles.itemPrice, { color: item.type === 'income' ? COLORS.success : COLORS.dark }]}>
                        {item.type === 'income' ? '+' : '-'} RM{parseFloat(item.amount).toFixed(0)}
                    </Text>
                    <AnimatedPressable onPress={() => toggleStatus(item.id)} style={[styles.checkboxBtn, paid && {backgroundColor: COLORS.success, borderColor: COLORS.success}]} scaleTo={0.85}>
                       {paid && <Text style={{color:'white', fontSize: 10}}>✓</Text>}
                    </AnimatedPressable>
                </View>

              </View>
            </TouchableOpacity>
          );
        })}
        <Text style={{textAlign:'center', color:'#adb5bd', fontSize:12, marginTop:20}}>Long press an item to Edit or Delete</Text>
        </View>
      </ScrollView>

      {/* FAB */}
      <AnimatedPressable style={styles.fab} onPress={handleOpenAdd} scaleTo={0.9}><Text style={styles.fabIcon}>+</Text></AnimatedPressable>

      {/* SIDEBAR */}
      <Modal animationType="fade" transparent={true} visible={menuVisible}>
        <Pressable style={styles.modalOverlay} onPress={() => setMenuVisible(false)}>
           <Pressable style={styles.sideDrawer} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.drawerTitle}>Finance<Text style={{color: COLORS.primary}}>Pro</Text></Text>
              
              <View style={styles.drawerSection}>
                  <Text style={styles.drawerLabel}>YOUR HEALTH</Text>
                  
                  {/* 1. TOTAL DEBT (FUTURE + LOAN) */}
                  <View style={styles.drawerRow}>
                      <Text style={{color: COLORS.dark}}>Total Debt (Future):</Text>
                      <Text style={{color: COLORS.danger, fontWeight:'bold'}}>RM {totalDebt.toFixed(2)}</Text>
                  </View>

                  {/* 2. LOAN BALANCE */}
                  <View style={styles.drawerRow}>
                      <Text style={{color: COLORS.dark}}>Loan Balance:</Text>
                      <Text style={{color: COLORS.purple, fontWeight:'bold'}}>RM {totalLoanBalance.toFixed(2)}</Text>
                  </View>

                  {/* 3. MONTHLY FIXED */}
                  <View style={styles.drawerRow}>
                      <Text style={{color: COLORS.dark}}>Monthly Fixed:</Text>
                      <Text style={{color: COLORS.warning, fontWeight:'bold'}}>RM {monthStats.fixedCommitments.toFixed(2)}/mo</Text>
                  </View>

                  {/* 4. UNPAID THIS MONTH */}
                  <View style={styles.drawerRow}>
                      <Text style={{color: COLORS.dark}}>Unpaid This Month:</Text>
                      <Text style={{color: COLORS.dark, fontWeight:'bold'}}>RM {monthStats.unpaidExpenses.toFixed(2)}</Text>
                  </View>
              </View>

              <View style={styles.drawerSection}>
                  <Text style={styles.drawerLabel}>DATA MANAGER</Text>
                  <TouchableOpacity onPress={handleBackup} style={styles.drawerBtn}><Text style={styles.drawerBtnText}>📤 Backup / Share Data</Text></TouchableOpacity>
                  
                  {/* FIXED RESTORE BUTTON */}
                  <TouchableOpacity onPress={openRestoreModal} style={[styles.drawerBtn, {backgroundColor: COLORS.primary}]}>
                      <Text style={[styles.drawerBtnText, {color: 'white'}]}>📥 Restore Data</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity onPress={handleResetData} style={[styles.drawerBtn, {backgroundColor: '#ffe3e3'}]}><Text style={[styles.drawerBtnText, {color: COLORS.danger}]}>⚠️ Reset All Data</Text></TouchableOpacity>
                  <TouchableOpacity onPress={handleLogout} style={[styles.drawerBtn, { backgroundColor: '#ffe3e3', borderColor: '#dc3545', marginBottom: 0 }]}>
                    <Text style={[styles.drawerBtnText, { color: '#dc3545' }]}>🚪 Logout</Text>
                  </TouchableOpacity>
              </View>
              
              <Text style={{color: COLORS.gray, fontSize:10, textAlign:'center', marginTop: 20}}>Version 2.0.0 (Pro)</Text>
           </Pressable>
        </Pressable>
      </Modal>

      {/* RESTORE MODAL (FIXED) */}
      <Modal animationType="slide" transparent={true} visible={restoreVisible}>
        <Pressable style={styles.modalBackdrop} onPress={Keyboard.dismiss}>
          <Pressable style={[styles.addModal, {height: 300}]} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.addModalTitle}>Restore Data</Text>
            <Text style={{color:COLORS.gray, marginBottom:10, fontSize:12}}>Paste your backup code below:</Text>
            
            <TextInput 
                multiline 
                placeholder="{...} Paste code here" 
                value={restoreText} 
                onChangeText={setRestoreText} 
                style={[styles.inputField, {height: 150, textAlignVertical:'top'}]} 
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity onPress={() => setRestoreVisible(false)} style={[styles.modalActionBtn, {backgroundColor: COLORS.gray}]}><Text style={{color:'white'}}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={handleRestore} style={[styles.modalActionBtn, {backgroundColor: COLORS.primary}]}><Text style={{color:'white'}}>Load Data</Text></TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* SPENDING FORECAST MODAL */}
      <Modal animationType="fade" transparent={true} visible={forecastVisible}>
        <Pressable style={styles.modalBackdrop} onPress={() => setForecastVisible(false)}>
          <Pressable style={styles.addModal} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.addModalTitle}>📈 Spending Forecast</Text>
            <Text style={styles.forecastMessage}>{aiReport.message}</Text>

            <View style={styles.forecastCompareRow}>
              <View style={styles.forecastCompareItem}>
                <Text style={styles.forecastCompareLabel}>Predicted</Text>
                <Text style={[styles.forecastCompareValue, {color: COLORS.primary}]}>RM {aiReport.prediction.toFixed(2)}</Text>
              </View>
              <View style={styles.forecastCompareItem}>
                <Text style={styles.forecastCompareLabel}>Your Budget</Text>
                <Text style={[styles.forecastCompareValue, {color: COLORS.dark}]}>RM {budgetLimit.toFixed(2)}</Text>
              </View>
            </View>

            <AnimatedProgressBar
              percent={budgetLimit > 0 ? (aiReport.prediction / budgetLimit) * 100 : 0}
              height={10}
              style={{marginTop: 15, marginBottom: 10}}
              fillColors={[COLORS.success, COLORS.warning, COLORS.danger]}
            />

            <Text
              style={[
                styles.forecastStatus,
                { color: budgetLimit > 0 && aiReport.prediction > budgetLimit ? COLORS.danger : COLORS.success },
              ]}
            >
              {budgetLimit <= 0
                ? 'Set a monthly budget to compare against your forecast.'
                : aiReport.prediction > budgetLimit
                  ? `Forecast is RM ${(aiReport.prediction - budgetLimit).toFixed(2)} over your budget.`
                  : `Forecast is within budget, RM ${(budgetLimit - aiReport.prediction).toFixed(2)} to spare.`}
            </Text>

            <TouchableOpacity onPress={() => setForecastVisible(false)} style={[styles.modalActionBtn, {backgroundColor: COLORS.primary, marginTop: 20}]}>
              <Text style={{color:'white', fontWeight:'600'}}>Got it</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ADD/EDIT MODAL */}
      <Modal animationType="slide" transparent={true} visible={modalVisible}>
        <Pressable style={styles.modalBackdrop} onPress={Keyboard.dismiss}>
          <Pressable style={styles.addModal} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.addModalTitle}>{editingId ? 'Edit Entry' : `New Entry (${(MONTH_MAP[currentMonth.split('-')[1]] || '')})`}</Text>
            
            <View style={styles.typeToggle}>
              <AnimatedPressable onPress={() => setNewType('income')} style={[styles.typeBtn, newType === 'income' && {backgroundColor: COLORS.success}]} scaleTo={0.96}><Text style={{color: newType === 'income'?'white':COLORS.gray, fontWeight: '600'}}>Income</Text></AnimatedPressable>
              <AnimatedPressable onPress={() => setNewType('expense')} style={[styles.typeBtn, newType === 'expense' && {backgroundColor: COLORS.danger}]} scaleTo={0.96}><Text style={{color: newType === 'expense'?'white':COLORS.gray, fontWeight: '600'}}>Expense</Text></AnimatedPressable>
            </View>

            <TextInput placeholder="Detail (e.g. Car Loan)" value={newDetail} onChangeText={setNewDetail} style={styles.inputField} />
            <TextInput placeholder="This Month Payment (RM)" value={newAmount} onChangeText={(text) => setNewAmount(sanitizeDecimalInput(text))} keyboardType="decimal-pad" style={styles.inputField} />

            <Text style={styles.fieldLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
              {CATEGORIES.map(cat => (
                <AnimatedPressable
                  key={cat.key}
                  onPress={() => setNewCategory(cat.key)}
                  style={[styles.categoryChip, newCategory === cat.key && styles.categoryChipActive]}
                  scaleTo={0.92}
                >
                  <Text style={[styles.categoryChipText, newCategory === cat.key && styles.categoryChipTextActive]}>
                    {cat.emoji} {cat.label}
                  </Text>
                </AnimatedPressable>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={styles.datePickerBtn}
              onPress={() => setDatePickerVisible(!datePickerVisible)}
            >
              <Text style={styles.datePickerText}>
                {newDate ? `Date: ${newDate}` : 'Select Date'}
              </Text>
            </TouchableOpacity>

            {datePickerVisible && (
              <View style={styles.datePickerBoxInline}>
                <Text style={styles.dateTitle}>Select Day</Text>

                <View style={styles.dateGrid}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                    <TouchableOpacity
                      key={day}
                      style={styles.dateCell}
                      onPress={() => {
                        const formatted = `${day}-${MONTH_MAP[currentMonth.split('-')[1]]}`;
                        setNewDate(formatted);
                        setDatePickerVisible(false);
                      }}
                    >
                      <Text style={styles.dateCellText}>{day}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <View style={{maxHeight: 200}}>
                <ScrollView keyboardShouldPersistTaps="handled">
                <View style={styles.checkRow}><TouchableOpacity onPress={() => setIsRepeated(!isRepeated)} style={[styles.checkBox, isRepeated && {backgroundColor: COLORS.primary}]} /><Text>Repeated Monthly?</Text></View>
                {newType === 'expense' && (
                    <>
                        <View style={styles.checkRow}><TouchableOpacity onPress={() => setIsLoan(!isLoan)} style={[styles.checkBox, isLoan && {backgroundColor: COLORS.dark}]} /><Text>Is Loan?</Text></View>
                        {isLoan && (
                            <View style={styles.loanBox}>
                                <Text style={{fontSize:10, color:COLORS.gray, marginBottom:5}}>Enter Total Debt & Remaining Duration</Text>
                                <TextInput placeholder="Total Loan Value (RM)" value={loanTotal} onChangeText={(text) => setLoanTotal(sanitizeDecimalInput(text))} keyboardType="decimal-pad" style={styles.inputSmall} />

                                <View style={styles.durationRow}>
                                  {loanDurationUnit === 'years' ? (
                                    <TextInput
                                      placeholder="Duration (Years)"
                                      value={loanYearsText}
                                      onChangeText={(text) => {
                                        const cleaned = sanitizeDecimalInput(text);
                                        setLoanYearsText(cleaned);
                                        const years = parseFloat(cleaned || '0');
                                        setLoanMonthsLeft(cleaned === '' ? '' : String(Math.round(years * 12)));
                                      }}
                                      keyboardType="decimal-pad"
                                      style={[styles.inputSmall, {flex:1, marginBottom: 0}]}
                                    />
                                  ) : (
                                    <TextInput
                                      placeholder="Duration (Months)"
                                      value={loanMonthsLeft}
                                      onChangeText={(text) => setLoanMonthsLeft(sanitizeIntegerInput(text))}
                                      keyboardType="number-pad"
                                      style={[styles.inputSmall, {flex:1, marginBottom: 0}]}
                                    />
                                  )}

                                  <View style={styles.unitToggle}>
                                    <AnimatedPressable
                                      onPress={() => handleToggleLoanDurationUnit('months')}
                                      style={[styles.unitToggleBtn, loanDurationUnit === 'months' && styles.unitToggleBtnActive]}
                                      scaleTo={0.94}
                                    >
                                      <Text style={[styles.unitToggleText, loanDurationUnit === 'months' && styles.unitToggleTextActive]}>Mo</Text>
                                    </AnimatedPressable>
                                    <AnimatedPressable
                                      onPress={() => handleToggleLoanDurationUnit('years')}
                                      style={[styles.unitToggleBtn, loanDurationUnit === 'years' && styles.unitToggleBtnActive]}
                                      scaleTo={0.94}
                                    >
                                      <Text style={[styles.unitToggleText, loanDurationUnit === 'years' && styles.unitToggleTextActive]}>Yr</Text>
                                    </AnimatedPressable>
                                  </View>
                                </View>

                                {loanDurationUnit === 'years' && loanMonthsLeft !== '' && (
                                  <Text style={styles.durationHint}>= {loanMonthsLeft} months</Text>
                                )}
                            </View>
                        )}
                    </>
                )}
                </ScrollView>
            </View>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                onPress={() => {
                  setDatePickerVisible(false);
                  setModalVisible(false);
                }}
                style={[styles.modalActionBtn, { backgroundColor: COLORS.gray }]}
              ><Text style={{color:'white'}}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={handleSaveItem} style={[styles.modalActionBtn, {backgroundColor: COLORS.primary}]}><Text style={{color:'white'}}>{editingId ? 'Update' : 'Save'}</Text></TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  navbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 15, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  menuBtn: { padding: 5 },
  menuText: { fontSize: 24, color: COLORS.dark },
  navTitle: { fontSize: 20, fontWeight: '800', color: COLORS.dark },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'flex-start' }, 
  sideDrawer: { backgroundColor: COLORS.white, width: '80%', height: '90%', borderRadius: 20, padding: 25, paddingTop: 40, marginLeft: 10 },
  drawerTitle: { fontSize: 24, fontWeight: 'bold', color: COLORS.dark, marginBottom: 25 },
  drawerSection: { marginBottom: 25 },
  drawerLabel: { color: COLORS.gray, fontSize: 12, fontWeight: 'bold', marginBottom: 10 },
  drawerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  drawerBtn: { backgroundColor: '#f1f3f5', padding: 12, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#e9ecef' },
  drawerBtnText: { color: COLORS.dark, fontWeight: '600' },

  datePickerBtn: {
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: '#f8f9fa',
    alignItems: 'center',
  },

  datePickerText: {
    color: COLORS.dark,
    fontWeight: '600',
  },

  datePickerBoxInline: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },

  dateTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },

  dateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  dateCell: {
    width: '18%',
    padding: 10,
    margin: 3,
    backgroundColor: '#e9ecef',
    borderRadius: 6,
    alignItems: 'center',
  },

  dateCellText: {
    fontWeight: '600',
    color: COLORS.dark,
  },

  quickFilterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 15,
    marginTop: 10,
    marginBottom: 5,
  },

  quickBtn: {
    flex: 1,
    marginHorizontal: 5,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#e9ecef',
    alignItems: 'center',
    justifyContent: 'center',
  },

  quickBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#212529',
  },

  card: { backgroundColor: COLORS.white, margin: 15, borderRadius: 12, padding: 10, ...CARD_SHADOW },
  dashboardContainer: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 15, marginBottom: 15 },
  statCard: { width: '31%', backgroundColor: COLORS.white, padding: 10, borderRadius: 8, borderLeftWidth: 4, ...CARD_SHADOW },
  statCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 5 },
  statLabel: { fontSize: 10, fontWeight: '700', color: COLORS.gray },
  statValue: { fontSize: 14, fontWeight: 'bold' },
  budgetCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: 15,
    marginBottom: 15,
    borderRadius: 12,
    padding: 15,
    ...CARD_SHADOW,
  },
  budgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  budgetTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.dark,
  },
  budgetPercent: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  budgetInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  budgetMessage: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.success,
  },
  forecastCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: 15,
    marginBottom: 15,
    borderRadius: 12,
    padding: 15,
    ...CARD_SHADOW,
  },
  forecastHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  forecastTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  forecastTitle: { fontSize: 13, fontWeight: '700', color: COLORS.dark },
  forecastValue: { fontSize: 20, fontWeight: 'bold', color: COLORS.dark, marginBottom: 2 },
  forecastValueUnit: { fontSize: 12, fontWeight: '400', color: COLORS.gray },
  forecastHint: { fontSize: 11, color: COLORS.gray },
  forecastMessage: { textAlign: 'center', color: COLORS.gray, fontSize: 13, marginBottom: 15 },
  forecastCompareRow: { flexDirection: 'row', justifyContent: 'space-around' },
  forecastCompareItem: { alignItems: 'center' },
  forecastCompareLabel: { fontSize: 11, color: COLORS.gray, marginBottom: 4 },
  forecastCompareValue: { fontSize: 18, fontWeight: 'bold' },
  forecastStatus: { textAlign: 'center', fontSize: 12, fontWeight: '600' },
  tabContainer: { flexDirection: 'row', marginHorizontal: 15, backgroundColor: COLORS.white, borderRadius: 8, padding: 4, marginBottom: 10 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  tabText: { fontSize: 12, fontWeight: '600' },
  listContainer: { paddingHorizontal: 15 },
  
  transactionCard: { backgroundColor: COLORS.white, flexDirection: 'row', borderRadius: 12, marginBottom: 10, alignItems: 'center', padding: 10, ...CARD_SHADOW },
  dateBox: { backgroundColor: '#f1f5f9', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, alignItems: 'center', marginRight: 12 },
  dateNum: { fontSize: 18, fontWeight: 'bold', color: COLORS.dark },
  dateMonth: { fontSize: 10, color: COLORS.gray, textTransform: 'uppercase' },
  detailsBox: { flex: 1 },
  itemTitle: { fontSize: 15, fontWeight: '600', color: COLORS.dark, marginBottom: 4 },
  tagsRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  tagBlue: { fontSize: 10, color: COLORS.primary, backgroundColor: '#cfe2ff', paddingHorizontal: 6, borderRadius: 4, overflow: 'hidden' },
  tagPurple: { fontSize: 10, color: COLORS.purple, backgroundColor: COLORS.purpleLight, paddingHorizontal: 6, borderRadius: 4, overflow: 'hidden' },
  tagCategory: { fontSize: 10, color: COLORS.gray, backgroundColor: '#e9ecef', paddingHorizontal: 6, borderRadius: 4, overflow: 'hidden' },
  loanSub: { fontSize: 10, color: COLORS.danger, marginTop: 2 },
  itemPrice: { fontSize: 15, fontWeight: '700', marginBottom: 5 },
  checkboxBtn: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: '#adb5bd', justifyContent: 'center', alignItems: 'center', marginTop: 2 },

  fab: { position: 'absolute', bottom: 30, right: 30, backgroundColor: COLORS.primary, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: COLORS.primary, shadowOpacity: 0.3 },
  fabIcon: { fontSize: 30, color: 'white', marginTop: -2 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center' },
  addModal: { backgroundColor: COLORS.white, margin: 20, borderRadius: 15, padding: 20 },
  addModalTitle: { fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 15 },
  typeToggle: { flexDirection: 'row', marginBottom: 15 },
  typeBtn: { flex: 1, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  inputField: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 10, marginBottom: 10, backgroundColor: '#f8f9fa' },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: COLORS.gray, marginBottom: 8 },
  categoryScroll: { marginBottom: 10 },
  categoryChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f1f3f5', borderWidth: 1, borderColor: COLORS.border, marginRight: 8 },
  categoryChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  categoryChipText: { fontSize: 12, fontWeight: '600', color: COLORS.dark },
  categoryChipTextActive: { color: COLORS.white },
  checkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, marginTop: 5 },
  checkBox: { width: 20, height: 20, borderWidth: 1, borderColor: COLORS.gray, borderRadius: 4, marginRight: 10 },
  inputSmall: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 8, marginBottom: 10 },
  loanBox: { backgroundColor: '#f8f9fa', padding: 10, borderRadius: 8 },
  durationRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  unitToggle: { flexDirection: 'row', backgroundColor: '#e9ecef', borderRadius: 8, padding: 2 },
  unitToggleBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 6 },
  unitToggleBtnActive: { backgroundColor: COLORS.primary },
  unitToggleText: { fontSize: 12, fontWeight: '700', color: COLORS.gray },
  unitToggleTextActive: { color: COLORS.white },
  durationHint: { fontSize: 10, color: COLORS.gray, marginTop: -4, marginBottom: 4 },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 15 },
  modalActionBtn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' },
  filterBadge: { backgroundColor: COLORS.dark, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginTop: 10 },
}); 