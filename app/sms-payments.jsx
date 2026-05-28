import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Button,
  PermissionsAndroid,
  Linking,
  Alert,
  FlatList,
} from "react-native";
import SmsListener from "react-native-android-sms-listener";
import * as SQLite from "expo-sqlite";
import * as Notifications from "expo-notifications";

// 1. Setup Notification Handler (Ensures it shows up even when app is open)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// 2. Initialize SQLite Database
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
    const allRows = db.getAllSync(
      "SELECT * FROM received_payments ORDER BY id DESC",
    );
    setMessages(allRows);
  };

  const requestPermissions = async () => {
    try {
      // SMS Permission
      const smsGranted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
        {
          title: "SMS Payment Permission",
          message:
            "This app needs to read incoming SMS to process offline UPI payment links.",
          buttonPositive: "OK",
        },
      );

      // Notification Permission
      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (
        smsGranted === PermissionsAndroid.RESULTS.GRANTED &&
        finalStatus === "granted"
      ) {
        console.log("Permissions granted");
        startListening();
      } else {
        Alert.alert(
          "Permissions Missing",
          "Need SMS and Notification access to function properly.",
        );
      }
    } catch (err) {
      console.warn(err);
    }
  };

  const startListening = () => {
    setListening(true);

    const subscription = SmsListener.addListener(async (message) => {
      console.log("New SMS received:", message.body);

      // Feature 1: Filter by prefix ":txt "
      if (message.body.startsWith(":txt ")) {
        const upiRegex = /(upi:\/\/pay\?[^\s]+)/i;
        const match = message.body.match(upiRegex);

        if (match && match[0]) {
          const upiLink = match[0];

          // Feature 2: Store in SQLite
          try {
            db.runSync(
              "INSERT INTO received_payments (original_text, upi_link) VALUES (?, ?)",
              [message.body, upiLink],
            );
            // Refresh list
            loadMessages();
          } catch (error) {
            console.error("Failed to save to DB:", error);
          }

          // Feature 3: Trigger Local Push Notification
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "💳 New Offline Payment Request",
              body: `Tap to view the payment request.`,
              data: { url: upiLink },
            },
            trigger: null, // trigger immediately
          });
        }
      }
    });

    return () => subscription.remove();
  };

  const launchUpiApp = async (url) => {
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert(
          "No UPI App Found",
          "Please install GPay, PhonePe, or Paytm.",
        );
      }
    } catch (error) {
      console.error("Error opening UPI link:", error);
    }
  };

  useEffect(() => {
    setupDatabase();
    requestPermissions();

    const responseListener =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const url = response.notification.request.content.data.url;
        if (url) launchUpiApp(url);
      });

    // ✅ CORRECT MODERN EXPO CLEANUP
    return () => {
      if (responseListener) {
        responseListener.remove();
      }
    };
  }, []);   

  return (
    <View style={{ flex: 1, padding: 20, paddingTop: 50 }}>
      <Text style={{ fontSize: 18, marginBottom: 20, textAlign: "center" }}>
        Offline UPI Listener: {listening ? "🟢 Active" : "🔴 Inactive"}
      </Text>

      <Text style={{ fontWeight: "bold", fontSize: 20, marginBottom: 10 }}>
        Stored Payments
      </Text>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View
            style={{
              padding: 15,
              backgroundColor: "#e0f7fa",
              borderRadius: 8,
              marginBottom: 10,
            }}
          >
            <Text style={{ fontSize: 12, color: "gray", marginBottom: 5 }}>
              {item.received_at}
            </Text>
            <Text numberOfLines={2} style={{ marginBottom: 10 }}>
              {item.original_text}
            </Text>
            <Button
              title="Pay Now"
              onPress={() => launchUpiApp(item.upi_link)}
            />
          </View>
        )}
        ListEmptyComponent={<Text>No payments received yet.</Text>}
      />
    </View>
  );
}
