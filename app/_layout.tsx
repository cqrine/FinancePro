import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { View, ActivityIndicator } from "react-native";
import "react-native-reanimated";

import { auth } from "../services/firebase";
import { useColorScheme } from "react-native";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // 🔐 AUTH LISTENER
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u: any) => {
      setUser(u);
      setLoading(false);
    });

    return unsub;
  }, []);

  // 🔁 ROUTE GUARD
  useEffect(() => {
    if (loading) return;

    const inAuthPages =
      segments[0] === "login" || segments[0] === "register";

    if (!user && !inAuthPages) {
      router.replace("./login");
    }

    if (user && inAuthPages) {
      router.replace("/(tabs)");
    }
  }, [user, loading, segments]);

  // ⏳ LOADING SCREEN
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // 🎨 APP WRAPPER
  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
      </Stack>

      <StatusBar style="auto" />
    </ThemeProvider>
  );
}