import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  DeviceEventEmitter,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import AppButton from "../components/AppButton";
import AppHeader from "../components/AppHeader";
import IconButton from "../components/IconButton";
import Loading from "../components/Loading";
import PixelIcon from "../components/PixelIcon";
import { listTransfers } from "../lib/db";
import { buildTrail, formatAge } from "../lib/geo";
import { decodeLocation } from "../lib/geo";
import { summariseQr } from "../lib/qr";
import { syncInbox, INBOX_SYNCED_EVENT } from "../lib/syncInbox";
import { colors, radius, space, type } from "../lib/theme";
import { dayLabel, formatClock } from "../lib/time";
import { KIND } from "../lib/transfer";

const LABEL = {
  [KIND.TEXT]: "MESSAGE",
  [KIND.QR]: "QR CODE",
  [KIND.LOCATION]: "LOCATION",
  [KIND.IMAGE]: "PICTURE",
};

const ICON = {
  [KIND.TEXT]: "message-text",
  [KIND.QR]: "qr",
  [KIND.LOCATION]: "location",
  [KIND.IMAGE]: "image",
};

function preview(item) {
  if (item.kind === KIND.QR) return summariseQr(item.payload);
  if (item.kind === KIND.TEXT) {
    return String(item.payload ?? "").slice(0, 80);
  }
  if (item.kind === KIND.IMAGE) {
    return item.payload_b64 ? "Tap to open the picture" : "Empty picture";
  }
  if (item.kind === KIND.LOCATION) {
    return null;
  }
  return String(item.payload ?? "");
}

function locationLine(item) {
  const point = decodeLocation(item.payload ?? "");
  if (!point) return "Unreadable fix";
  return `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`;
}

function groupByDay(items) {
  const groups = [];
  for (const item of items) {
    const label = dayLabel(item.received_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

export default function TransfersScreen() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (mode = "focus") => {
    if (mode === "refresh") setRefreshing(true);

    try {
      setItems(listTransfers());
      await syncInbox({ force: mode === "refresh" });
      setItems(listTransfers());
    } catch {
      // The stored list is still worth showing.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load("focus");
    }, [load]),
  );

  // The foreground inbox poll can store an item while this screen is open.
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      INBOX_SYNCED_EVENT,
      () => {
        try {
          setItems(listTransfers());
        } catch {
          // Keep the list that is already on screen.
        }
      },
    );
    return () => subscription.remove();
  }, []);

  const sections = useMemo(() => groupByDay(items), [items]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <AppHeader
        title="Shared items"
        onBack={goBack}
        right={
          refreshing ? (
            <ActivityIndicator color={colors.muted} style={styles.headerSpinner} />
          ) : (
            <View style={styles.headerActions}>
              <IconButton
                icon="message-text"
                label="Payment requests"
                onPress={() => router.push("/sms-payments")}
              />
              <IconButton
                icon="reload"
                label="Refresh shared items"
                onPress={() => load("refresh")}
              />
            </View>
          )
        }
      />

      {loading && items.length === 0 ? (
        <Loading label="Checking for new items" style={styles.fill} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <PixelIcon name="inbox" size={24} color={colors.muted} />
          <Text style={[type.body, styles.center]}>Nothing received yet.</Text>
          <Text style={[type.muted, styles.center]}>
            Pictures, QR codes and live location from your contacts land here.
          </Text>
          <AppButton label="Send something" onPress={() => router.push("/share")} />
        </View>
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(section) => section.label}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load("refresh")}
              tintColor={colors.muted}
              colors={[colors.accent]}
            />
          }
          renderItem={({ item: section }) => (
            <View style={styles.section}>
              <Text style={type.label}>{section.label.toUpperCase()}</Text>
              {section.items.map((item) => (
                <Row key={item.id} item={item} items={items} />
              ))}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function Row({ item, items }) {
  const open = () => router.push(`/transfers/${item.id}`);

  if (item.kind === KIND.LOCATION) {
    const point = decodeLocation(item.payload ?? "");
    const sameSession = items.filter(
      (other) =>
        other.kind === KIND.LOCATION &&
        other.sender === item.sender &&
        (other.session ?? "") === (item.session ?? ""),
    );
    const trail = buildTrail(
      sameSession.map((other) => decodeLocation(other.payload ?? "")).filter(Boolean),
    );

    return (
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel="Open shared location"
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        <PixelIcon name="location" size={24} color={colors.text} />
        <View style={styles.rowText}>
          <Text style={type.bodyMedium} numberOfLines={1}>
            {item.sender || "Unknown sender"}
          </Text>
          <Text style={type.muted} numberOfLines={1}>
            {point ? locationLine(item) : "Unreadable fix"}
            {trail.points.length > 1
              ? ` · ${trail.points.length} pings`
              : ""}
          </Text>
        </View>
        <View style={styles.trailing}>
          <Text style={type.label}>{LABEL[item.kind]}</Text>
          <Text style={type.muted}>{formatClock(item.received_at)}</Text>
          <Text style={type.muted}>{formatAge(trail.ageMs)}</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`Open ${LABEL[item.kind] ?? "item"}`}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {item.kind === KIND.IMAGE && item.payload_b64 ? (
        <Image
          source={{ uri: `data:image/jpeg;base64,${item.payload_b64}` }}
          style={styles.thumb}
        />
      ) : (
        <PixelIcon name={ICON[item.kind] ?? "message-text"} size={24} color={colors.text} />
      )}
      <View style={styles.rowText}>
        <Text style={type.bodyMedium} numberOfLines={1}>
          {item.sender || "Unknown sender"}
        </Text>
        <Text style={type.muted} numberOfLines={1}>
          {preview(item) ?? ""}
        </Text>
      </View>
      <View style={styles.trailing}>
        <Text style={type.label}>{LABEL[item.kind] ?? "ITEM"}</Text>
        <Text style={type.muted}>{formatClock(item.received_at)}</Text>
      </View>
    </Pressable>
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
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  headerSpinner: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    padding: space.lg,
    gap: space.xl,
  },
  section: {
    gap: space.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
    backgroundColor: colors.panel,
  },
  rowPressed: {
    backgroundColor: colors.line,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  trailing: {
    alignItems: "flex-end",
    gap: 2,
  },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: 4,
    backgroundColor: colors.bg,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.md,
    padding: space.xl,
  },
  center: {
    textAlign: "center",
  },
});
