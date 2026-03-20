import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import AppHeader from "../components/AppHeader";
import PixelIcon from "../components/PixelIcon";
import { colors, radius, space, type } from "../lib/theme";

const OPTIONS = [
  {
    icon: "location",
    title: "Live location",
    detail: "Text your coordinates every 30 s, 1 min or 5 min.",
    href: "/share/location",
  },
  {
    icon: "image",
    title: "Picture",
    detail: "Compressed to a few KB, greyscale, sent as one message.",
    href: "/share/image",
  },
  {
    icon: "qr",
    title: "QR code",
    detail: "Tickets, passes, payment codes. The text travels, the code rebuilds.",
    href: "/share/qr",
  },
];

export default function ShareScreen() {
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <AppHeader
        title="Send"
        onBack={goBack}
        right={
          <Pressable
            onPress={() => router.push("/transfers")}
            accessibilityRole="button"
            accessibilityLabel="Open shared items"
            hitSlop={12}
            style={styles.linkButton}
          >
            <Text style={type.label}>INBOX</Text>
          </Pressable>
        }
      />

      <View style={styles.body}>
        {OPTIONS.map((option) => (
          <Pressable
            key={option.href}
            onPress={() => router.push(option.href)}
            accessibilityRole="button"
            accessibilityLabel={option.title}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <PixelIcon name={option.icon} size={24} color={colors.text} />
            <View style={styles.rowText}>
              <Text style={type.bodyMedium}>{option.title}</Text>
              <Text style={type.muted}>{option.detail}</Text>
            </View>
            <PixelIcon name="arrow-right" size={16} color={colors.muted} />
          </Pressable>
        ))}

        <Text style={[type.muted, styles.note]}>
          Everything leaves as plain SMS, so it works with no data plan and the
          other side needs nothing but the message.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  body: {
    flex: 1,
    padding: space.lg,
    gap: space.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.lg,
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
  linkButton: {
    justifyContent: "center",
    paddingHorizontal: space.sm,
    minHeight: 40,
  },
  note: {
    marginTop: "auto",
    paddingBottom: space.sm,
  },
});
