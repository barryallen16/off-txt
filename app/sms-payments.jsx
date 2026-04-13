import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  DeviceEventEmitter,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
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
import Loading from "../components/Loading";
import PixelIcon from "../components/PixelIcon";
import { colors, radius, space, type } from "../lib/theme";
import {
  listHistoryRequests,
  listRequests,
  setRequestStatus,
  toDate,
} from "../lib/db";
import { syncInbox, INBOX_SYNCED_EVENT } from "../lib/syncInbox";
import { dayLabel } from "../lib/time";
import { buildRequestLink, normalizeAmount, parseUpiLink } from "../lib/upi";

function dayKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function withLinkFallback(row) {
  const parsed = parseUpiLink(row.upi_link || "");
  return {
    ...row,
    payee_name: row.payee_name || parsed.pn || null,
    payee_vpa: row.payee_vpa || parsed.pa || null,
    amount: normalizeAmount(row.amount) || normalizeAmount(parsed.am) || null,
  };
}

function timeOf(date) {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SmsPaymentsScreen() {
  const [tab, setTab] = useState("open");
  const [openRequests, setOpenRequests] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notificationAccess, setNotificationAccess] = useState("checking");
  const [pushGranted, setPushGranted] = useState(true);
  const [askingPush, setAskingPush] = useState(false);
  const [payingId, setPayingId] = useState(null);
  const [busy, setBusy] = useState(null);
  const [undo, setUndo] = useState(null);
  const [error, setError] = useState(null);

  const undoTimer = useRef(null);

  const readStored = useCallback(() => {
    try {
      setOpenRequests(listRequests("open").map(withLinkFallback));
      setHistory(listHistoryRequests().map(withLinkFallback));
      setError(null);
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

  const load = useCallback(
    async (mode = "focus") => {
      if (mode === "refresh") setRefreshing(true);
      readStored();

      try {
        await syncInbox({ force: mode === "refresh" });
        readStored();
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [readStored],
  );

  useFocusEffect(
    useCallback(() => {
      load("focus");
      checkNotificationAccess();
    }, [load, checkNotificationAccess]),
  );

  // The background inbox poll can store a request while this screen is open.
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      INBOX_SYNCED_EVENT,
      readStored,
    );
    return () => subscription.remove();
  }, [readStored]);

  // Notification-listener access is granted in system settings. Re-check when
  // the user comes back to the app.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") checkNotificationAccess();
    });
    return () => subscription.remove();
  }, [checkNotificationAccess]);

  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
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
    const rows = tab === "open" ? openRequests : history;
    const groups = new Map();

    for (const request of rows) {
      const received = toDate(request.received_at);
      const date =
        tab === "open"
          ? received
          : new Date(Number(request.handled_at) || received.getTime());
      const key = dayKey(date);
      if (!groups.has(key)) groups.set(key, { title: dayLabel(date), data: [] });
      groups.get(key).data.push({ ...request, date });
    }

    return [...groups.values()];
  }, [tab, openRequests, history]);

  const pay = async (item) => {
    if (!item.upi_link) return;

    setError(null);
    setPayingId(item.id);
    try {
      const { link } = buildRequestLink(item.upi_link, item.amount);
      await Linking.openURL(link);
    } catch {
      setError("No UPI app could open this request.");
    } finally {
      setPayingId(null);
    }
  };

  const handle = (item, status) => {
    setBusy(`${item.id}:${status}`);
    try {
      setRequestStatus(item.id, status);
      setUndo({ id: item.id, previous: item.status || "open" });
      if (undoTimer.current) clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setUndo(null), 6000);
      readStored();
    } catch {
      setError("Could not update that request.");
    } finally {
      setBusy(null);
    }
  };

  const undoLast = () => {
    if (!undo) return;
    try {
      setRequestStatus(undo.id, undo.previous);
      readStored();
      if (undo.previous === "open") setTab("open");
    } catch {
      setError("Could not undo that change.");
    }
    setUndo(null);
  };

  const reopen = (item) => {
    try {
      setRequestStatus(item.id, "open");
      readStored();
      setTab("open");
    } catch {
      setError("Could not reopen that request.");
    }
  };

  const askPush = async () => {
    setAskingPush(true);
    try {
      const asked = await Notifications.requestPermissionsAsync();
      setPushGranted(asked.granted);
    } catch {
      // Leave the bar in place so the user can try again.
    } finally {
      setAskingPush(false);
    }
  };

  const allowNotificationAccess = () => {
    setNotificationAccess("checking");
    try {
      RNAndroidNotificationListener.requestPermission();
    } catch {
      setNotificationAccess("missing");
      setError("Could not open the notification access settings.");
    }
  };

  const rows = tab === "open" ? openRequests : history;
  const showLoading = loading && rows.length === 0;

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <AppHeader
        title="Requests"
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        right={
          refreshing ? (
            <ActivityIndicator color={colors.muted} style={styles.headerSpinner} />
          ) : (
            <IconButton
              icon="reload"
              label="Refresh requests"
              onPress={() => load("refresh")}
            />
          )
        }
      />

      <View style={styles.tabs}>
        <Pressable
          onPress={() => setTab("open")}
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === "open" }}
          style={[styles.tab, tab === "open" && styles.tabActive]}
        >
          <Text style={[type.label, tab === "open" && styles.tabActiveText]}>
            OPEN{openRequests.length > 0 ? ` ${openRequests.length}` : ""}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setTab("history")}
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === "history" }}
          style={[styles.tab, tab === "history" && styles.tabActive]}
        >
          <Text style={[type.label, tab === "history" && styles.tabActiveText]}>
            HISTORY{history.length > 0 ? ` ${history.length}` : ""}
          </Text>
        </Pressable>
      </View>

      {Platform.OS === "android" && notificationAccess !== "authorized" ? (
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
            label={
              notificationAccess === "checking" ? "Checking" : "Allow access"
            }
            variant={rows.length === 0 ? "primary" : "outline"}
            loading={notificationAccess === "checking"}
            onPress={allowNotificationAccess}
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
            loading={askingPush}
            onPress={askPush}
            style={styles.pushButton}
          />
        </View>
      ) : null}

      {undo ? (
        <View style={styles.undoBar}>
          <Text style={[type.muted, styles.undoText]}>
            Request moved to history.
          </Text>
          <Pressable
            onPress={undoLast}
            accessibilityRole="button"
            accessibilityLabel="Undo moving the request"
            hitSlop={8}
          >
            <Text style={type.label}>UNDO</Text>
          </Pressable>
        </View>
      ) : null}

      {error ? (
        <Text style={[type.muted, styles.error]}>{error}</Text>
      ) : null}

      {showLoading ? (
        <Loading label="Loading requests" style={styles.fill} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load("refresh")}
              tintColor={colors.muted}
              colors={[colors.accent]}
            />
          }
          renderSectionHeader={({ section }) => (
            <Text style={[type.label, styles.sectionHeader]}>
              {section.title}
            </Text>
          )}
          renderItem={({ item }) => {
            const handled = tab === "history";
            const paying = payingId === item.id;
            const working = busy != null;

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

                <View style={styles.meta}>
                  <Text style={type.muted} numberOfLines={1}>
                    {item.sender ? `From ${item.sender}` : "Unknown sender"}
                  </Text>
                  <Text style={type.muted}>
                    {timeOf(item.date)}
                    {handled ? ` · ${dayLabel(item.date)}` : ""}
                  </Text>
                </View>

                {handled ? (
                  <View style={styles.handledRow}>
                    <View style={styles.badge}>
                      <Text style={type.label}>
                        {item.status === "dismissed" ? "DISMISSED" : "DONE"}
                      </Text>
                    </View>
                    <AppButton
                      label="Reopen"
                      variant="outline"
                      onPress={() => reopen(item)}
                      style={styles.reopenButton}
                    />
                  </View>
                ) : (
                  <>
                    <AppButton
                      label={paying ? "Opening UPI" : "Pay"}
                      icon="arrow-right"
                      loading={paying}
                      disabled={working || !item.upi_link}
                      onPress={() => pay(item)}
                    />
                    <View style={styles.actions}>
                      <AppButton
                        label="Mark done"
                        icon="check"
                        variant="outline"
                        loading={busy === `${item.id}:done`}
                        disabled={working || paying}
                        onPress={() => handle(item, "done")}
                        style={styles.actionButton}
                      />
                      <AppButton
                        label="Dismiss"
                        icon="close"
                        variant="ghost"
                        loading={busy === `${item.id}:dismissed`}
                        disabled={working || paying}
                        onPress={() => handle(item, "dismissed")}
                        style={styles.actionButton}
                      />
                    </View>
                  </>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <PixelIcon
                name={tab === "open" ? "message-text" : "clock"}
                size={24}
                color={colors.muted}
              />
              <Text style={[type.body, styles.centerText]}>
                {tab === "open" ? "No open requests" : "Nothing in history yet"}
              </Text>
              <Text style={[type.muted, styles.centerText]}>
                {tab === "open"
                  ? "A request arrives when an SMS contains a :txt UPI link. The app checks messages on this phone every few seconds."
                  : "Mark a request done or dismiss it, and it lands here."}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  fill: {
    flex: 1,
  },
  headerSpinner: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  tabs: {
    flexDirection: "row",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: space.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
  },
  tabActive: {
    backgroundColor: colors.panel,
    borderColor: colors.text,
  },
  tabActiveText: {
    color: colors.text,
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
    minHeight: 40,
    paddingHorizontal: space.md,
  },
  undoBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginHorizontal: space.lg,
    marginTop: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
  },
  undoText: {
    flex: 1,
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
    gap: space.xs,
    paddingVertical: space.lg,
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
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginTop: space.sm,
  },
  actions: {
    flexDirection: "row",
    gap: space.sm,
    marginTop: space.sm,
  },
  actionButton: {
    flex: 1,
  },
  handledRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginTop: space.sm,
  },
  badge: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
  },
  reopenButton: {
    minHeight: 40,
    marginLeft: "auto",
    paddingHorizontal: space.md,
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
