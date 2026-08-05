import * as Notifications from "expo-notifications";

// ✅ REQUIRED: notification display handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ======================
// REQUEST PERMISSION
// ======================
export const requestNotificationPermission = async () => {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
};

// ======================
// SEND NOTIFICATION
// ======================
export const scheduleDailyReminder = async (
  title: string,
  message: string
) => {
  return await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body: message,
    },
    trigger: {
      type: "timeInterval",
      seconds: 2,
      repeats: false,
    } as any,
  });
};