import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

// expo-notifications' scheduling APIs aren't implemented on web and throw
// if called there, so every entry point below short-circuits on Platform.OS === "web".
if (Platform.OS !== "web") {
  // ✅ REQUIRED: notification display handler
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// ======================
// REQUEST PERMISSION
// ======================
export const requestNotificationPermission = async () => {
  if (Platform.OS === "web") return false;

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
  if (Platform.OS === "web") {
    console.log(`[Notification skipped on web] ${title}: ${message}`);
    return;
  }

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