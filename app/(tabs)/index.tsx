import AsyncStorage from '@react-native-async-storage/async-storage';
import { logoutUser } from "../../services/authService";
import { auth } from "../../services/firebase";
import { addTransaction, getTransactions, deleteTransaction} from "../../services/transactionService";
import { useRouter } from "expo-router";
import { onSnapshot, collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from "../../services/firebase";
import React, { useEffect, useMemo, useState } from 'react';
import { requestNotificationPermission, scheduleDailyReminder } from "../../services/notificationService";
import { predictFutureSpending } from "../../services/aiService";
import * as Notifications from "expo-notifications";
import {
  Alert,
  Keyboard,
  Modal,
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
};



export default function App() {
  useEffect(() => {
    const init = async () => {
      const granted = await requestNotificationPermission();
      if (granted) {
      
      }
    };

    init();
  }, []);

  const handleDelete = (item: Transaction) => {
    Alert.alert(
      "Delete Transaction",
      `Are you sure you want to delete "${item.detail}"?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
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
          },
        },
      ],
      { cancelable: true }
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

  const todayStr = new Date().toISOString().split('T')[0];
  const [currentMonth, setCurrentMonth] = useState(todayStr.substring(0, 7)); 
  const [selectedDate, setSelectedDate] = useState(''); 

  // === LOGIC ===
  const currentMonthName = MONTH_MAP[currentMonth.split('-')[1]] || '';

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newDetail, setNewDetail] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newType, setNewType] = useState<'income' | 'expense'>('expense');
  const [isLoan, setIsLoan] = useState(false);
  const [isRepeated, setIsRepeated] = useState(false);
  
  const [loanTotal, setLoanTotal] = useState('');
  const [loanMonthsLeft, setLoanMonthsLeft] = useState('');
  const [repeatDay, setRepeatDay] = useState('');

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

  const handleLogout = () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to logout?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Logout",
          style: "destructive",
          onPress: async () => {
            try {
              await logoutUser();
              setMenuVisible(false);
              router.replace("/login");
            } catch (error: any) {
              Alert.alert("Logout Error", error.message);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const handleSelectDate = (day: number) => {
    const monthKey = currentMonth.split('-')[1];
    const monthName = MONTH_MAP[monthKey] || '';

    const formatted = `${day}-${monthName}`;

    setNewDate(formatted);
    setDatePickerVisible(false);
  };

  // === INIT ===
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const ref = collection(db, "users", uid, "transactions");

    const unsub = onSnapshot(ref, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setItems(data as Transaction[]);
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
         const monthly = parseFloat(item.amount || '0');
         const bigTotal = parseFloat(item.totalLoanAmount || '0');
         const paidCount = item.paidMonths?.length || 0;
         const currentBalance = bigTotal - (paidCount * monthly);

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
      if (item.date.includes((MONTH_MAP[currentMonth.split('-')[1]] || ''))) return true;
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

  const toggleStatus = (id: string) => {
    const updated = items.map(item => {
      if (item.id === id) {
        const paidList = item.paidMonths || [];

        if (paidList.includes(currentMonth)) {
          return {
            ...item,
            paidMonths: paidList.filter(m => m !== currentMonth),
          };
        } else {
          return {
            ...item,
            paidMonths: [...paidList, currentMonth],
          };
        }
      }
      return item;
    });

  setItems(updated); // ✅ ONLY THIS
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
          const bigTotal = parseFloat(item.totalLoanAmount || '0');
          const monthly = parseFloat(item.amount || '0');
          const paidCount = item.paidMonths?.length || 0;
          const remaining = bigTotal - (paidCount * monthly);
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
      const bigTotal = parseFloat(item.totalLoanAmount || '0');
      const monthly = parseFloat(item.amount || '0');
      const paidCount = item.paidMonths?.length || 0;
      const remaining = bigTotal - (paidCount * monthly);
      return acc + (remaining > 0 ? remaining : 0);
  }, 0);

  const aiReport = useMemo(() => {
    return predictFutureSpending(items);
  }, [items]);

  useEffect(() => {
    if (!aiReport) return;

    const runAIAlert = async () => {
      if (aiReport.prediction > Number(monthlyBudget)) {
        await scheduleDailyReminder(
          "⚠️ Overspending Alert",
          aiReport.message
        );
      }
    };

    runAIAlert();
  }, [aiReport]);

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
    setRepeatDay('');
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
    setRepeatDay(item.repeatDay || '');
    setModalVisible(true);
  };

  const handleSaveItem = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const newItem = {
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
      paidMonths: [],
    };

    await addTransaction(uid, newItem);
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
    Alert.alert("Reset All Data", "Wipe everything?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "WIPE DATA",
        style: "destructive",
        onPress: async () => {
          try {
            const uid = auth.currentUser?.uid;
            if (!uid) return;

            // delete all Firestore transactions
            const ref = collection(db, "users", uid, "transactions");
            const snap = await getDocs(ref);

            snap.forEach(async (docItem) => {
              await deleteDoc(doc(db, "users", uid, "transactions", docItem.id));
            });

          // clear UI
          setItems([]);

          } catch (error) {
            console.log("Reset error:", error);
          }
        } 
      }
    ]);
  };

  const handleBackup = async () => {
    try {
      const json = JSON.stringify(items, null, 2);
      await Share.share({ message: json, title: 'FinancePro Backup' });
    } catch (error) { Alert.alert("Error sharing"); }
  };

  const handleRestore = () => {
    try {
        if (!restoreText) return;
        const parsed = JSON.parse(restoreText);
        if (Array.isArray(parsed)) {
            setItems(parsed);
            Alert.alert("Success", "Data Restored!");
            setRestoreVisible(false);
            setRestoreText('');
        } else {
            Alert.alert("Error", "Invalid Format");
        }
    } catch (e) {
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
                } else if (item.date.includes((MONTH_MAP[currentMonth.split('-')[1]] || ''))) {
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
  
          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => {
              const today = new Date().toISOString().split('T')[0];
              setSelectedDate(today);
            }}
          >
            <Text style={styles.quickBtnText}>Today</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => {
              const now = new Date();
              const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
              setSelectedDate(firstDay.toISOString().split('T')[0]);
            }}
          >
            <Text style={styles.quickBtnText}>This Month</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickBtn}
            onPress={() => setSelectedDate('')}
          >
            <Text style={styles.quickBtnText}>Clear</Text>
          </TouchableOpacity>

        </View>

        {/* DASHBOARD */}
        <View style={styles.dashboardContainer}>
            <View style={[styles.statCard, {borderLeftColor: COLORS.success}]}><Text style={styles.statLabel}>INCOME</Text><Text style={[styles.statValue, {color: COLORS.success}]}>RM {monthStats.income.toFixed(0)}</Text></View>
            <View style={[styles.statCard, {borderLeftColor: COLORS.danger}]}><Text style={styles.statLabel}>EXPENSES</Text><Text style={[styles.statValue, {color: COLORS.danger}]}>RM {monthStats.expense.toFixed(0)}</Text></View>
            <View style={[styles.statCard, {borderLeftColor: COLORS.primary}]}><Text style={styles.statLabel}>BALANCE</Text><Text style={[styles.statValue, {color: monthStats.balance>=0?COLORS.primary:COLORS.danger}]}>RM {monthStats.balance.toFixed(0)}</Text></View>
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
            onChangeText={saveBudget}
            keyboardType="decimal-pad"
            style={styles.budgetInput}
          />

          <View style={styles.budgetBar}>
            <View
              style={[
                styles.budgetFill,
                { width: `${Math.min(budgetUsedPercent, 100)}%` },
                budgetUsedPercent >= 100 && { backgroundColor: COLORS.danger },
                budgetUsedPercent >= 80 && budgetUsedPercent < 100 && { backgroundColor: COLORS.warning },
              ]}
            />
          </View>

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

        {/* TABS */}
        <View style={styles.tabContainer}>
            {['all', 'income', 'expense'].map(t => (
                <TouchableOpacity key={t} onPress={() => setActiveTab(t as any)} style={[styles.tab, activeTab === t && styles.activeTab]}>
                    <Text style={[styles.tabText, activeTab === t && styles.activeTabText]}>{t === 'expense' ? 'EXPENSES' : t.toUpperCase()}</Text>
                </TouchableOpacity>
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
           const monthly = parseFloat(item.amount || '0');
           const bigTotal = parseFloat(item.totalLoanAmount || '0');
           const paidCount = item.paidMonths?.length || 0;
           const currentBalance = bigTotal - (paidCount * monthly);
           
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
                        {item.isRepeated && <Text style={styles.tagBlue}>↻ Monthly</Text>}
                        {item.isLoan && <Text style={styles.tagPurple}>Loan</Text>}
                    </View>
                    {item.isLoan && (
                        <View style={{marginTop: 4}}>
                            <Text style={styles.loanSub}>Balance: <Text style={{fontWeight:'bold'}}>RM {currentBalance > 0 ? currentBalance.toFixed(0) : 0}</Text></Text>
                            <Text style={{fontSize:10, color:COLORS.gray}}>
                                Schedule: {timelineMonthsLeft > 0 ? timelineMonthsLeft : 0} months left
                            </Text>
                        </View>
                    )}
                </View>

                <View style={{alignItems:'flex-end'}}>
                    <Text style={[styles.itemPrice, { color: item.type === 'income' ? COLORS.success : COLORS.dark }]}>
                        {item.type === 'income' ? '+' : '-'} RM{parseFloat(item.amount).toFixed(0)}
                    </Text>
                    <TouchableOpacity onPress={() => toggleStatus(item.id)} style={[styles.checkboxBtn, paid && {backgroundColor: COLORS.success, borderColor: COLORS.success}]}>
                       {paid && <Text style={{color:'white', fontSize: 10}}>✓</Text>}
                    </TouchableOpacity>
                </View>

              </View>
            </TouchableOpacity>
          );
        })}
        <Text style={{textAlign:'center', color:'#adb5bd', fontSize:12, marginTop:20}}>Long press an item to Edit or Delete</Text>
        </View>
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={handleOpenAdd}><Text style={styles.fabIcon}>+</Text></TouchableOpacity>

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
                  
                  <TouchableOpacity onPress={handleResetData} style={[styles.drawerBtn, {backgroundColor: '#ffe3e3', marginBottom: 0}]}><Text style={[styles.drawerBtnText, {color: COLORS.danger}]}>⚠️ Reset All Data</Text></TouchableOpacity>
                  <TouchableOpacity onPress={handleLogout} style={[styles.drawerBtn, { backgroundColor: '#ffe3e3', borderColor: '#dc3545' }]}>
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

      {/* ADD/EDIT MODAL */}
      <Modal animationType="slide" transparent={true} visible={modalVisible}>
        <Pressable style={styles.modalBackdrop} onPress={Keyboard.dismiss}>
          <Pressable style={styles.addModal} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.addModalTitle}>{editingId ? 'Edit Entry' : `New Entry (${(MONTH_MAP[currentMonth.split('-')[1]] || '')})`}</Text>
            
            <View style={styles.typeToggle}>
              <TouchableOpacity onPress={() => setNewType('income')} style={[styles.typeBtn, newType === 'income' && {backgroundColor: COLORS.success}]}><Text style={{color: newType === 'income'?'white':COLORS.gray}}>Income</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setNewType('expense')} style={[styles.typeBtn, newType === 'expense' && {backgroundColor: COLORS.danger}]}><Text style={{color: newType === 'expense'?'white':COLORS.gray}}>Expense</Text></TouchableOpacity>
            </View>

            <TextInput placeholder="Detail (e.g. Car Loan)" value={newDetail} onChangeText={setNewDetail} style={styles.inputField} />
            <TextInput placeholder="This Month Payment (RM)" value={newAmount} onChangeText={setNewAmount} keyboardType="decimal-pad" style={styles.inputField} />
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
                                <Text style={{fontSize:10, color:COLORS.gray, marginBottom:5}}>Enter Total Debt & Months Remaining</Text>
                                <View style={{flexDirection:'row', gap:10}}>
                                    <TextInput placeholder="Total Loan Value (RM)" value={loanTotal} onChangeText={setLoanTotal} keyboardType="decimal-pad" style={[styles.inputSmall, {flex:1}]} />
                                    <TextInput placeholder="Total Months Duration" value={loanMonthsLeft} onChangeText={setLoanMonthsLeft} keyboardType="number-pad" style={[styles.inputSmall, {flex:1}]} />
                                </View>
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

  datePickerBox: {
    backgroundColor: 'white',
    margin: 30,
    borderRadius: 12,
    padding: 15,
    maxHeight: '70%',
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

  card: { backgroundColor: COLORS.white, margin: 15, borderRadius: 12, padding: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  dashboardContainer: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 15, marginBottom: 15 },
  statCard: { width: '31%', backgroundColor: COLORS.white, padding: 10, borderRadius: 8, borderLeftWidth: 4, elevation: 1 },
  statLabel: { fontSize: 10, fontWeight: '700', color: COLORS.gray, marginBottom: 5 },
  statValue: { fontSize: 14, fontWeight: 'bold' },
  budgetCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: 15,
    marginBottom: 15,
    borderRadius: 12,
    padding: 15,
    elevation: 1,
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
  budgetBar: {
    height: 10,
    backgroundColor: '#e9ecef',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 8,
  },
  budgetFill: {
    height: '100%',
    backgroundColor: COLORS.success,
  },
  budgetMessage: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.success,
  },
  tabContainer: { flexDirection: 'row', marginHorizontal: 15, backgroundColor: COLORS.white, borderRadius: 8, padding: 4, marginBottom: 10 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  activeTab: { backgroundColor: COLORS.dark },
  tabText: { fontSize: 12, fontWeight: '600', color: COLORS.gray },
  activeTabText: { color: COLORS.white },
  listContainer: { paddingHorizontal: 15 },
  
  transactionCard: { backgroundColor: COLORS.white, flexDirection: 'row', borderRadius: 12, marginBottom: 10, alignItems: 'center', elevation: 1, padding: 10 },
  dateBox: { backgroundColor: '#f1f5f9', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, alignItems: 'center', marginRight: 12 },
  dateNum: { fontSize: 18, fontWeight: 'bold', color: COLORS.dark },
  dateMonth: { fontSize: 10, color: COLORS.gray, textTransform: 'uppercase' },
  detailsBox: { flex: 1 },
  itemTitle: { fontSize: 15, fontWeight: '600', color: COLORS.dark, marginBottom: 4 },
  tagsRow: { flexDirection: 'row', gap: 5 },
  tagBlue: { fontSize: 10, color: COLORS.primary, backgroundColor: '#cfe2ff', paddingHorizontal: 6, borderRadius: 4, overflow: 'hidden' },
  tagPurple: { fontSize: 10, color: COLORS.purple, backgroundColor: COLORS.purpleLight, paddingHorizontal: 6, borderRadius: 4, overflow: 'hidden' },
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
  checkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, marginTop: 5 },
  checkBox: { width: 20, height: 20, borderWidth: 1, borderColor: COLORS.gray, borderRadius: 4, marginRight: 10 },
  inputSmall: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 8, marginBottom: 10 },
  loanBox: { backgroundColor: '#f8f9fa', padding: 10, borderRadius: 8 },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 15 },
  modalActionBtn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' },
  filterBadge: { backgroundColor: COLORS.dark, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginTop: 10 },
}); 