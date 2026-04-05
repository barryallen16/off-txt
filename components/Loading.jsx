import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, space, type } from "../lib/theme";

/**
 * Small centered spinner with a label. Used wherever a screen is still
 * fetching something, so an empty list never looks like "nothing here".
 */
export default function Loading({ label = "Loading", compact = false, style }) {
  return (
    <View style={[styles.base, compact && styles.compact, style]}>
      <ActivityIndicator color={colors.muted} />
      {label ? <Text style={type.muted}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    padding: space.xl,
  },
  compact: {
    flexDirection: "row",
    padding: space.sm,
  },
});
