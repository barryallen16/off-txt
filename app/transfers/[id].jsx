import { useMemo } from "react";
import {
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import AppButton from "../../components/AppButton";
import AppHeader from "../../components/AppHeader";
import PixelIcon from "../../components/PixelIcon";
import { getTransfer, listTransfers } from "../../lib/db";
import { formatAge, formatDistance } from "../../lib/geo";
import { buildTrail, decodeLocation } from "../../lib/geo";
import { classifyQr, summariseQr } from "../../lib/qr";
import { colors, radius, space, type } from "../../lib/theme";
import { formatClock } from "../../lib/time";
import { KIND } from "../../lib/transfer";

export default function TransferDetailScreen() {
  const { id } = useLocalSearchParams();
  const transfer = useMemo(
    () => getTransfer(Number(id)) ?? null,
    [id],
  );

  const trail = useMemo(() => {
    if (!transfer || transfer.kind !== KIND.LOCATION) return null;

    const points = listTransfers()
      .filter(
        (item) =>
          item.kind === KIND.LOCATION &&
          item.sender === transfer.sender &&
          (item.session ?? "") === (transfer.session ?? ""),
      )
      .map((item) => decodeLocation(item.payload ?? ""))
      .filter(Boolean);

    return buildTrail(points);
  }, [transfer]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/transfers");
  };

  if (!transfer) {
    return (
      <SafeAreaView style={styles.screen} edges={["bottom"]}>
        <AppHeader title="Item" onBack={goBack} />
        <View style={styles.empty}>
          <PixelIcon name="shield" size={24} color={colors.muted} />
          <Text style={[type.body, styles.center]}>
            That item is no longer stored.
          </Text>
          <AppButton label="Back to inbox" onPress={() => router.replace("/transfers")} />
        </View>
      </SafeAreaView>
    );
  }

  const openMaps = () => {
    if (!trail?.latest) return;
    const { lat, lon } = trail.latest;
    Linking.openURL(`geo:${lat},${lon}?q=${lat},${lon}`).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <AppHeader title="Item" onBack={goBack} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.meta}>
          <Text style={type.label}>FROM</Text>
          <Text style={type.bodyMedium}>{transfer.sender || "Unknown sender"}</Text>
          <Text style={type.muted}>
            {formatClock(transfer.received_at)}
            {trail?.ageMs != null ? ` · ${formatAge(trail.ageMs)}` : ""}
          </Text>
        </View>

        {transfer.kind === KIND.IMAGE && transfer.payload_b64 ? (
          <View style={styles.imageBox}>
            <Image
              source={{ uri: `data:image/jpeg;base64,${transfer.payload_b64}` }}
              style={styles.image}
              resizeMode="contain"
              accessibilityLabel="Received picture"
            />
          </View>
        ) : null}

        {transfer.kind === KIND.QR ? (
          <View style={styles.qrBlock}>
            <View style={styles.codeBox}>
              <QRCode
                value={String(transfer.payload ?? "")}
                size={220}
                color={colors.bg}
                backgroundColor="#ffffff"
              />
            </View>
            <Text style={type.label}>{classifyQr(transfer.payload).toUpperCase()}</Text>
            <Text style={[type.body, styles.wrap]}>
              {summariseQr(transfer.payload)}
            </Text>
          </View>
        ) : null}

        {transfer.kind === KIND.TEXT ? (
          <Text style={[type.body, styles.wrap]}>{transfer.payload}</Text>
        ) : null}

        {transfer.kind === KIND.LOCATION && trail ? (
          <View style={styles.locationBlock}>
            {trail.latest ? (
              <>
                <View style={styles.fixRow}>
                  <PixelIcon name="location" size={16} color={colors.text} />
                  <Text style={type.amountSmall}>
                    {trail.latest.lat.toFixed(5)}, {trail.latest.lon.toFixed(5)}
                  </Text>
                </View>

                <View style={styles.facts}>
                  <Fact label="FRESHNESS" value={formatAge(trail.ageMs)} />
                  <Fact label="PINGS" value={String(trail.points.length)} />
                  <Fact label="MOVED" value={formatDistance(trail.travelled)} />
                </View>

                {trail.stale ? (
                  <Text style={[type.muted, styles.warn]}>
                    No update lately. Treat this position as old.
                  </Text>
                ) : null}

                <AppButton label="Open in Maps" variant="outline" onPress={openMaps} />
              </>
            ) : (
              <Text style={type.muted}>No readable position in this message.</Text>
            )}

            <View style={styles.trail}>
              <Text style={type.label}>TRAIL</Text>
              {[...trail.points].reverse().map((point, index) => (
                <View key={`${point.timestamp}-${index}`} style={styles.pointRow}>
                  <Text style={type.muted}>{formatClock(point.timestamp)}</Text>
                  <Text style={[type.muted, styles.pointCoords]}>
                    {point.lat.toFixed(5)}, {point.lon.toFixed(5)}
                  </Text>
                  <Text style={type.muted}>
                    ±{Math.round(point.accuracy ?? 0)} m
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Fact({ label, value }) {
  return (
    <View style={styles.fact}>
      <Text style={type.label}>{label}</Text>
      <Text style={type.bodyMedium}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: space.lg,
    gap: space.xl,
  },
  meta: {
    gap: 2,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  imageBox: {
    height: 280,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
    backgroundColor: colors.panel,
    overflow: "hidden",
  },
  image: {
    flex: 1,
  },
  qrBlock: {
    alignItems: "center",
    gap: space.md,
  },
  codeBox: {
    padding: space.lg,
    backgroundColor: "#ffffff",
    borderRadius: radius,
  },
  wrap: {
    flexWrap: "wrap",
  },
  locationBlock: {
    gap: space.md,
  },
  fixRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  facts: {
    flexDirection: "row",
    gap: space.sm,
  },
  fact: {
    flex: 1,
    gap: 2,
    padding: space.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
  },
  warn: {
    color: colors.text,
  },
  trail: {
    gap: space.sm,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  pointRow: {
    flexDirection: "row",
    gap: space.md,
  },
  pointCoords: {
    flex: 1,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.lg,
    padding: space.xl,
  },
  center: {
    textAlign: "center",
  },
});
