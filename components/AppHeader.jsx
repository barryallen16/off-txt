import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import IconButton from "./IconButton";
import { colors, space, type } from "../lib/theme";

export default function AppHeader({ title, onBack, backLabel = "Go back", right }) {
  const insets = useSafeAreaInsets();

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
      <View style={[styles.side, styles.right]}>{right}</View>
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
    alignItems: "flex-end",
  },
  title: {
    flex: 1,
    textAlign: "center",
    paddingHorizontal: space.sm,
  },
});
