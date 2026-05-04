import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import IconButton from "./IconButton";
import { useSmsQuota } from "../lib/quota";
import { colors, space, type } from "../lib/theme";

export default function AppHeader({ title, onBack, backLabel = "Go back", right }) {
  const insets = useSafeAreaInsets();
  const quota = useSmsQuota();

  return (
    <View style={[styles.container, { paddingTop: insets.top + space.sm }]}>
      <View style={styles.side}>
        {onBack ? (
          <IconButton icon="arrow-left" label={backLabel} onPress={onBack} />
        ) : null}
      </View>
      <Text style={[type.heading, styles.title]} numberOfLines={1}>
        {title}
      </Text>
      <View style={[styles.side, styles.right]}>
        {right}
        {quota ? (
          <Text
            style={[
              type.label,
              styles.quota,
              quota.remaining <= 10 && styles.quotaLow,
            ]}
            numberOfLines={1}
            accessibilityLabel={`${quota.remaining} of ${quota.limit} SMS left today`}
          >
            {quota.used}/{quota.limit} SMS
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.sm,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.bg,
  },
  side: {
    minWidth: 40,
    justifyContent: "center",
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: space.xs,
  },
  title: {
    flex: 1,
    textAlign: "center",
    paddingHorizontal: space.sm,
  },
  quota: {
    fontSize: 10,
    letterSpacing: 0.5,
    fontVariant: ["tabular-nums"],
  },
  quotaLow: {
    color: colors.danger,
  },
});
