import React, { useEffect, useState } from "react";
import { View, Text, Button, Linking, Alert, FlatList, StyleSheet } from "react-native";
import RNAndroidNotificationListener from "react-native-android-notification-listener";
import * as SQLite from "expo-sqlite";
import * as Notifications from "expo-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const db = SQLite.openDatabaseSync("payments.db");

export default function SmsPaymentsScreen() {
  const [listening, setListening] = useState(false);
  const [messages, setMessages] = useState([]);

  const setupDatabase = () => {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS received_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        original_text TEXT,
        upi_link TEXT,
        received_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    loadMessages();
  };

  const loadMessages = () => {
    try {
      const allRows = db.getAllSync("SELECT * FROM received_payments ORDER BY id DESC");
      setMessages(allRows);
    } catch (err) {
      console.error("Error reading database rows:", err);
    }
  };

  const checkNotificationAccess = async () => {
    const status = await RNAndroidNotificationListener.getPermissionStatus();
    if (status !== "authorized") {
      Alert.alert(
        "Notification Access Required",
        "Please grant Notification Access to this app.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => RNAndroidNotificationListener.requestPermission() }
        ]
      );
    } else {
      setListening(true);
    }
  };

  const launchUpiApp = async (url) => {
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert("No UPI App Found", "Please configure PhonePe, GPay, or Paytm.");
      }
    } catch (error) {
      console.error("Failed to redirect:", error);
    }
  };

  useEffect(() => {
    setupDatabase();
    checkNotificationAccess();

    // Foreground listener
    const systemSub = RNAndroidNotificationListener.onNotificationReceived((notification) => {
      try {
        const payload = JSON.parse(notification);
        const text = payload.text || "";

        if (text.startsWith(":txt ")) {
          loadMessages(); 
        }
      } catch (err) {
        console.error(err);
      }
    });

    // Tap handler for our custom Local Push Notification
    const pushSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      if (url) launchUpiApp(url);
    });

    return () => {
      if (systemSub) systemSub.remove();
      if (pushSub) pushSub.remove();
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.status}>
        System Interceptor Status: {listening ? "🟢 Connected" : "🔴 Setup Pending"}
      </Text>
      <Text style={styles.header}>Received Payments Logs</Text>
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.date}>{item.received_at}</Text>
            <Text numberOfLines={2} style={styles.msg}>{item.original_text}</Text>
            <Button title="Pay Securely" color="#00796b" onPress={() => launchUpiApp(item.upi_link)} />
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No transaction records stored in vault.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#fafafa" },
  status: { fontSize: 14, fontWeight: "600", textAlign: "center", marginBottom: 20, color: "#333" },
  header: { fontSize: 18, fontWeight: "700", marginBottom: 15, color: "#111" },
  card: { padding: 16, backgroundColor: "#fff", borderRadius: 12, marginBottom: 12, elevation: 2 },
  date: { fontSize: 11, color: "#777", marginBottom: 6 },
  msg: { fontSize: 14, color: "#333", marginBottom: 12 },
  empty: { textAlign: "center", marginTop: 40, color: "#999", fontSize: 14 }
});