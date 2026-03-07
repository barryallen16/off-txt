import { Pressable, StyleSheet } from "react-native";
import PixelIcon from "./PixelIcon";
import { colors, radius } from "../lib/theme";

export default function IconButton({
  icon,
  label,
  onPress,
  color = colors.text,
  size = 24,
  disabled = false,
  style,
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <PixelIcon name={icon} size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius,
  },
  pressed: {
    backgroundColor: colors.line,
  },
  disabled: {
    opacity: 0.4,
  },
});
