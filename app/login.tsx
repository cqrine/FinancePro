import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { loginUser } from "../services/authService";
import { useRouter } from "expo-router";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || password.length === 0) {
      Alert.alert(
        "Required",
        "Please enter your email and password."
      );
      return;
    }

    try {
      await loginUser(cleanEmail, password);
      router.replace("/(tabs)");
    } catch (error: any) {
      let message = "Unable to log in. Please try again.";

      switch (error?.code) {
        case "auth/invalid-credential":
        case "auth/wrong-password":
        case "auth/user-not-found":
          message =
           "Email or password is incorrect, or the account is not registered.";
          break;

        case "auth/invalid-email":
          message = "Please enter a valid email address.";
          break;

        case "auth/user-disabled":
            message = "This account has been disabled.";
          break;

        case "auth/too-many-requests":
          message =
            "Too many login attempts. Please wait and try again later.";
          break;

        case "auth/network-request-failed":
          message =
            "No internet connection. Please check your connection.";
          break;

        case "auth/operation-not-allowed":
          message =
            "Email and password login is currently unavailable.";
          break;

        default:
          message = "Login failed. Please try again.";
          break;
      }

      Alert.alert("Login Failed", message);
    }
  };

  return (
    <View style={styles.container}>
  
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.wrapper}
      >

        {/* BRAND (inside center block) */}
        <View style={styles.header}>
          <Text style={styles.brand}>
            Finance<Text style={{ color: "#60a5fa" }}>Pro</Text>
          </Text>
          <Text style={styles.tagline}>Smart Money • Simple Life</Text>
        </View>

        {/* CARD */}
        <View style={styles.card}>
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to continue</Text>

          <TextInput
          placeholder="Email"
            placeholderTextColor="#9ca3af"
            style={styles.input}
            onChangeText={setEmail}
          />

          <TextInput
            placeholder="Password"
            placeholderTextColor="#9ca3af"
            style={styles.input}
            secureTextEntry
            onChangeText={setPassword}
          />

          <TouchableOpacity style={styles.button} onPress={handleLogin}>
            <Text style={styles.buttonText}>Login</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push("/register")}>
            <Text style={styles.link}>Create new account</Text>
          </TouchableOpacity>
        </View>

      </KeyboardAvoidingView>

    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: "white",
    textAlign: "center",
  },

  subtitle: {
    color: "#9ca3af",
    textAlign: "center",
    marginBottom: 20,
  },

  input: {
    backgroundColor: "#1f2937",
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    color: "white",
  },

  button: {
    backgroundColor: "#2563eb",
    padding: 14,
    borderRadius: 12,
    marginTop: 10,
  },

  buttonText: {
    color: "white",
    textAlign: "center",
    fontWeight: "bold",
  },

  link: {
    color: "#60a5fa",
    textAlign: "center",
    marginTop: 15,
  },

  container: {
    flex: 1,
    backgroundColor: "#0b1220",
  },

  wrapper: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },

  header: {
    alignItems: "center",
    marginBottom: 25,
  },

  brand: {
    fontSize: 34,
    fontWeight: "bold",
    color: "white",
  },

  tagline: {
    color: "#94a3b8",
    marginTop: 5,
    fontSize: 13,
  },

  card: {
    backgroundColor: "#111827",
    borderRadius: 18,
    padding: 20,

    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
});