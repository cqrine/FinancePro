import React, { useState } from "react";
import {
  Alert,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { registerUser } from "../services/authService";
import { useRouter } from "expo-router";

export default function Register() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);

  const handleRegister = async () => {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      Alert.alert(
        "Missing Information",
        "Please enter your email and password."
      );
      return;
    }

    if (password.length < 6) {
      Alert.alert(
        "Invalid Password",
        "Password must contain at least 6 characters."
      );
      return;
    }

    try {
      setIsRegistering(true);

      await registerUser(cleanEmail, password);

      Alert.alert(
        "Registration Successful",
        "Your account has been created.",
        [
          {
            text: "Continue",
            onPress: () => router.replace("/(tabs)"),
          },
        ]
      );
    } catch (err: any) {
      let title = "Registration Failed";
      let message = "Unable to create your account. Please try again.";

      switch (err?.code) {
        case "auth/email-already-in-use":
          title = "Account Already Exists";
          message =
            "This email is already registered. Please log in instead.";
          break;

        case "auth/invalid-email":
          title = "Invalid Email";
          message = "Please enter a valid email address.";
          break;

        case "auth/weak-password":
          title = "Weak Password";
          message = "Password must contain at least 6 characters.";
          break;

        case "auth/network-request-failed":
          title = "Connection Error";
          message =
            "Please check your internet connection and try again.";
          break;

        case "auth/too-many-requests":
          title = "Too Many Attempts";
          message =
            "Please wait for a while before trying again.";
          break;
      }

      Alert.alert(title, message);
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <View style={styles.container}>
      
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.wrapper}
      >

        {/*HEADER*/}
        <View style={styles.header}>
          <Text style={styles.brand}>
            Finance<Text style={{ color: "#60a5fa" }}>Pro</Text>
          </Text>
          <Text style={styles.tagline}>Smart Money • Simple Life</Text>
        </View>

        {/*CARD POSITION*/}
        <View style={styles.card}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join FinancePro today</Text>

          <TextInput
            placeholder="Email"
            placeholderTextColor="#9ca3af"
            style={styles.input}
            onChangeText={setEmail}
            autoCapitalize="none"
          />

          <TextInput
            placeholder="Password"
            placeholderTextColor="#9ca3af"
            style={styles.input}
            secureTextEntry
            onChangeText={setPassword}
          />

          <TouchableOpacity style={styles.button} onPress={handleRegister}>
            <Text style={styles.buttonText}>Register</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push("/login")}>
            <Text style={styles.link}>Already have an account? Login</Text>
          </TouchableOpacity>
        </View>

      </KeyboardAvoidingView>

    </View>
  );
}

const styles = StyleSheet.create({
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
});