import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Linking,
  Platform,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, router } from "expo-router";
import * as Notifications from "expo-notifications";
import RNAndroidNotificationListener from "react-native-android-notification-listener";
import AppButton from "../components/AppButton";
import AppHeader from "../components/AppHeader";
import IconButton from "../components/IconButton";
import PixelIcon from "../components/PixelIcon";
import { colors, radius, space, type } from "../lib/theme";
import { listRequests, toDate } from "../lib/db";
import { parseUpiLink } from "../lib/upi";

const DAY = 24 * 60 * 60 * 1000;

function dayKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(date) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const seen = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((start - seen) / DAY);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function withLinkFallback(row) {
  if (row.payee_vpa && row.payee_name) return row;
  const parsed = parseUpiLink(row.upi_link || "");
  return {
    ...row,
    payee_name: row.payee_name || parsed.pn || null,
    payee_vpa: row.payee_vpa || parsed.pa || null,
    amount: row.amount || parsed.am || null,
  };
}

export default function SmsPaymentsScreen() {
  const [requests, setRequests] = useState([]);
  const [notificationAccess, setNotificationAccess] = useState("checking");
  const [pushGranted, setPushGranted] = useState(true);
  const [error, setError] = useState(null);

  const loadRequests = useCallback(() => {
    try {
      setRequests(listRequests().map(withLinkFallback));
    } catch {
      setError("Could not read stored requests.");
    }
  }, []);

  const checkNotificationAccess = useCallback(async () => {
    try {
      const status = await RNAndroidNotificationListener.getPermissionStatus();
      setNotificationAccess(status === "authorized" ? "authorized" : "missing");
    } catch {
      setNotificationAccess("missing");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRequests();
      checkNotificationAccess();
    }, [loadRequests, checkNotificationAccess]),
  );

  // Android 13+ needs POST_NOTIFICATIONS before a local notification can show.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    Notifications.getPermissionsAsync()
      .then(async (settings) => {
        if (settings.granted) return;
        if (!settings.canAskAgain) {
          setPushGranted(false);
          return;
        }
        const asked = await Notifications.requestPermissionsAsync();
        setPushGranted(asked.granted);
      })
      .catch(() => {});
  }, []);

  const sections = useMemo(() => {
    const groups = new Map();
    for (const request of requests) {
      const date = toDate(request.received_at);
      const key = dayKey(date);
      if (!groups.has(key)) groups.set(key, { title: dayLabel(date), data: [] });
      groups.get(key).data.push({ ...request, date });
    }
    return [...groups.values()];
  }, [requests]);

  const pay = async (link) => {
    setError(null);
    try {
      await Linking.openURL(link);
    } catch {
      setError("No UPI app could open this request.");
    }
  };

  const newestId = requests.length > 0 ? requests[0].id : null;

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <AppHeader
        title="Requests"
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        right={
          <IconButton icon="reload" label="Refresh requests" onPress={loadRequests} />
        }
      />

      {notificationAccess !== "authorized" ? (
        <View style={styles.accessCard}>
          <View style={styles.accessText}>
            <PixelIcon name="bell" size={24} color={colors.muted} />
            <Text style={type.bodyMedium}>Notification access is off</Text>
            <Text style={type.muted}>
              Allow access so incoming SMS requests can be read while the app is
              closed.
            </Text>
          </View>
          <AppButton
            label={notificationAccess === "checking" ? "Checking" : "Allow access"}
            variant={requests.length === 0 ? "primary" : "outline"}
            onPress={() => RNAndroidNotificationListener.requestPermission()}
            disabled={notificationAccess === "checking"}
          />
        </View>
      ) : null}

      {!pushGranted ? (
        <View style={styles.pushBar}>
          <Text style={[type.muted, styles.pushText]}>
            Notifications are off. New requests still appear here.
          </Text>
          <AppButton
            label="Allow"
            variant="outline"
            onPress={() =>
              Notifications.requestPermissionsAsync()
                .then((asked) => setPushGranted(asked.granted))
                .catch(() => {})
            }
            style={styles.pushButton}
          />
        </View>
      ) : null}

      {error ? (
        <Text style={[type.muted, styles.error]}>{error}</Text>
      ) : null}

      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text style={[type.label, styles.sectionHeader]}>{section.title}</Text>
        )}
        renderItem={({ item }) => {
          const isNewest = item.id === newestId;
          return (
            <View style={styles.row}>
              <View style={styles.rowTop}>
                <Text style={[type.bodyMedium, styles.payee]} numberOfLines={1}>
                  {item.payee_name || "Unknown payee"}
                </Text>
                <Text style={type.amountSmall}>
                  {item.amount ? `₹${item.amount}` : "No amount"}
                </Text>
              </View>
              <Text style={type.muted} numberOfLines={1}>
                {item.payee_vpa || "No VPA"}
              </Text>
              <View style={styles.rowBottom}>
                <View style={styles.meta}>
                  <Text style={type.muted} numberOfLines={1}>
                    {item.sender ? `From ${item.sender}` : "Unknown sender"}
                  </Text>
                  <Text style={type.muted}>
                    {item.date.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
                <AppButton
                  label="Pay"
                  icon="arrow-right"
                  variant={isNewest ? "primary" : "outline"}
                  onPress={() => pay(item.upi_link)}
                  style={styles.payButton}
                />
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <PixelIcon name="message-text" size={24} color={colors.muted} />
            <Text style={[type.body, styles.centerText]}>No requests yet</Text>
            <Text style={[type.muted, styles.centerText]}>
              A request arrives when an SMS notification contains a :txt UPI
              link.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  accessCard: {
    margin: space.lg,
    marginBottom: 0,
    padding: space.lg,
    gap: space.lg,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
    backgroundColor: colors.panel,
  },
  accessText: {
    gap: space.sm,
  },
  pushBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginHorizontal: space.lg,
    marginTop: space.md,
  },
  pushText: {
    flex: 1,
  },
  pushButton: {
    paddingHorizontal: space.md,
  },
  error: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    color: colors.danger,
  },
  list: {
    padding: space.lg,
    paddingBottom: space.xxl,
  },
  sectionHeader: {
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  row: {
    paddingVertical: space.md,
    gap: space.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  payee: {
    flex: 1,
  },
  rowBottom: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: space.sm,
    gap: space.md,
  },
  meta: {
    flex: 1,
    gap: 2,
  },
  payButton: {
    minHeight: 40,
    paddingHorizontal: space.lg,
  },
  empty: {
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.xxl,
  },
  centerText: {
    textAlign: "center",
  },
});
