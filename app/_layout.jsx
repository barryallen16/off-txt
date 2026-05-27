import { View, Text } from "react-native";
import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="ContactsScreen" options={{ headerShown: false }} />
      <Stack.Screen name="pay/[url]" options={{ headerShown: false }} />
    </Stack>
  );
}
