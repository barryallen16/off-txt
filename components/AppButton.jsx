import { Pressable, StyleSheet, Text, View } from "react-native";
import PixelIcon from "./PixelIcon";
import { colors, controlHeight, radius, space, type } from "../lib/theme";

const VARIANTS = {
  primary: {
    container: { backgroundColor: colors.accent },
    pressed: { backgroundColor: colors.accentPressed },
    text: { color: colors.accentInk },
    icon: colors.accentInk,
  },
  outline: {
    container: { borderWidth: 1, borderColor: colors.line },
    pressed: { backgroundColor: colors.line },
    text: { color: colors.text },
    icon: colors.text,
  },
  ghost: {
    container: { backgroundColor: "transparent" },
    pressed: { backgroundColor: colors.line },
    text: { color: colors.muted },
    icon: colors.muted,
  },
};

export default function AppButton({
  label,
  onPress,
  variant = "primary",
  icon,
  disabled = false,
  style,
}) {
  const look = VARIANTS[variant] ?? VARIANTS.primary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        look.container,
        pressed && look.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.content}>
        {icon ? <PixelIcon name={icon} size={16} color={look.icon} /> : null}
        <Text style={[type.button, look.text]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: controlHeight,
    paddingHorizontal: space.lg,
    borderRadius: radius,
    justifyContent: "center",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
  disabled: {
    opacity: 0.4,
  },
});
