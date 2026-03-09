import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Contacts from "expo-contacts";
import * as SMS from "expo-sms";
import { router, useLocalSearchParams } from "expo-router";
import AppButton from "../components/AppButton";
import AppHeader from "../components/AppHeader";
import IconButton from "../components/IconButton";
import PixelIcon from "../components/PixelIcon";
import { colors, radius, space, type } from "../lib/theme";
import { buildRequestText, parseUpiLink } from "../lib/upi";

function cleanNumber(phoneNumbers) {
  const entry = phoneNumbers?.find((item) => item.number);
  if (!entry) return null;
  const digits = String(entry.number).replace(/[^\d+]/g, "");
  return digits.length >= 6 ? digits : null;
}

export default function RecipientsScreen() {
  const { link } = useLocalSearchParams();
  const requestLink = typeof link === "string" ? link : "";
  const parsed = useMemo(() => parseUpiLink(requestLink), [requestLink]);

  const [permission, setPermission] = useState("loading");
  const [contacts, setContacts] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let active = true;

    (async () => {
      const { status: contactStatus } = await Contacts.requestPermissionsAsync();
      if (!active) return;
      if (contactStatus !== "granted") {
        setPermission("denied");
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
      });
      if (!active) return;

      const usable = data
        .map((contact) => ({
          id: contact.id,
          name: (contact.name || "").trim(),
          number: cleanNumber(contact.phoneNumbers),
        }))
        .filter(
          (contact) =>
            contact.name &&
            contact.number &&
            !/^[\s\d+-]+$/.test(contact.name),
        );

      setContacts(usable);
      setPermission("granted");
    })().catch(() => {
      if (active) setPermission("denied");
    });

    return () => {
      active = false;
    };
  }, []);

  const visibleContacts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return contacts;
    return contacts.filter(
      (contact) =>
        contact.name.toLowerCase().includes(needle) ||
        contact.number.includes(needle),
    );
  }, [contacts, query]);

  const selectedContacts = useMemo(
    () => contacts.filter((contact) => selectedIds.includes(contact.id)),
    [contacts, selectedIds],
  );

  const toggleContact = (id) => {
    setStatus(null);
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  const sendRequests = async () => {
    if (selectedContacts.length === 0 || sending) return;

    const numbers = [
      ...new Set(selectedContacts.map((contact) => contact.number)),
    ];
    const message = buildRequestText(requestLink, parsed.am ?? "");

    setSending(true);
    setStatus(null);
    try {
      const available = await SMS.isAvailableAsync();
      if (!available) {
        setStatus("unavailable");
        return;
      }

      const { result } = await SMS.sendSMSAsync(numbers, message);
      if (result === "sent") {
        setStatus("sent");
        setSelectedIds([]);
      } else if (result === "cancelled") {
        setStatus("cancelled");
      } else {
        setStatus("unknown");
      }
    } catch {
      setStatus("failed");
    } finally {
      setSending(false);
    }
  };

  if (!parsed.valid) {
    return (
      <SafeAreaView style={styles.screen} edges={["bottom"]}>
        <AppHeader title="Send request" onBack={goBack} />
        <View style={styles.empty}>
          <PixelIcon name="shield" size={24} color={colors.muted} />
          <Text style={[type.body, styles.centerText]}>
            {parsed.reason || "This request link is not valid."}
          </Text>
          <AppButton label="Scan again" onPress={() => router.replace("/")} />
        </View>
      </SafeAreaView>
    );
  }

  if (status === "sent") {
    return (
      <SafeAreaView style={styles.screen} edges={["bottom"]}>
        <AppHeader title="Send request" />
        <View style={styles.empty}>
          <PixelIcon name="check" size={24} color={colors.text} />
          <Text style={[type.heading, styles.centerText]}>Request sent</Text>
          <Text style={[type.muted, styles.centerText]}>
            Pay Rs {parsed.am} to {parsed.pn || parsed.pa}
          </Text>
          <AppButton label="Done" onPress={() => router.navigate("/")} />
        </View>
      </SafeAreaView>
    );
  }

  const statusMessage = {
    cancelled: "Request cancelled. Nothing was sent.",
    unknown: "Check your Messages app to confirm the request was sent.",
    unavailable: "No SMS app is available on this device.",
    failed: "Could not open the Messages app. Try again.",
  }[status];

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <AppHeader title="Send request" onBack={goBack} />
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.summary}>
          <Text style={type.label}>REQUEST</Text>
          <Text style={type.bodyMedium} numberOfLines={1}>
            {parsed.pn || parsed.pa}
          </Text>
          <Text style={type.muted}>
            Pay Rs {parsed.am} · {parsed.pa}
          </Text>
        </View>

        {permission === "loading" ? (
          <View style={styles.empty}>
            <Text style={type.muted}>Loading contacts...</Text>
          </View>
        ) : permission === "denied" ? (
          <View style={styles.empty}>
            <PixelIcon name="user" size={24} color={colors.muted} />
            <Text style={[type.body, styles.centerText]}>
              Contact access is needed to pick who receives the request.
            </Text>
            <AppButton
              label="Open settings"
              onPress={() => Linking.openSettings()}
            />
          </View>
        ) : (
          <>
            <View style={styles.search}>
              <PixelIcon name="search" size={16} color={colors.muted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search name or number"
                placeholderTextColor={colors.muted}
                style={[type.body, styles.searchInput]}
                autoCorrect={false}
                accessibilityLabel="Search contacts"
              />
              {query.length > 0 ? (
                <IconButton
                  icon="close"
                  size={16}
                  label="Clear search"
                  onPress={() => setQuery("")}
                />
              ) : null}
            </View>

            <FlatList
              data={visibleContacts}
              keyExtractor={(item) => item.id}
              initialNumToRender={20}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.list}
              renderItem={({ item }) => {
                const selected = selectedIds.includes(item.id);
                return (
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`${item.name}, ${item.number}`}
                    onPress={() => toggleContact(item.id)}
                    style={({ pressed }) => [
                      styles.row,
                      pressed && styles.rowPressed,
                    ]}
                  >
                    <View style={styles.rowText}>
                      <Text style={type.body} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={type.muted} numberOfLines={1}>
                        {item.number}
                      </Text>
                    </View>
                    <View style={styles.checkTarget}>
                      <View
                        style={[styles.checkbox, selected && styles.checkboxOn]}
                      >
                        {selected ? (
                          <PixelIcon name="check" size={16} color={colors.bg} />
                        ) : null}
                      </View>
                    </View>
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <Text style={[type.muted, styles.listEmpty]}>
                  {contacts.length === 0
                    ? "No contacts with a phone number."
                    : "No contacts match this search."}
                </Text>
              }
            />
          </>
        )}

        {statusMessage ? (
          <View style={[styles.statusBar, status === "failed" && styles.failed]}>
            <Text
              style={[
                type.muted,
                status === "failed" && styles.failedText,
                styles.statusText,
              ]}
            >
              {statusMessage}
            </Text>
            <IconButton
              icon="close"
              size={16}
              label="Dismiss message"
              onPress={() => setStatus(null)}
            />
          </View>
        ) : null}

        <View style={styles.footer}>
          <AppButton
            label={
              selectedIds.length > 0
                ? `Send to ${selectedIds.length}`
                : "Send request"
            }
            icon="send"
            onPress={sendRequests}
            disabled={selectedIds.length === 0 || sending}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  summary: {
    gap: space.xs,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    margin: space.lg,
    marginBottom: space.sm,
    paddingLeft: space.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
  },
  searchInput: {
    flex: 1,
    paddingVertical: space.md,
  },
  list: {
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowPressed: {
    backgroundColor: colors.panel,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  checkTarget: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  footer: {
    padding: space.lg,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: space.lg,
    marginBottom: space.md,
    paddingLeft: space.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
  },
  statusText: {
    flex: 1,
    paddingVertical: space.sm,
  },
  failed: {
    borderColor: colors.danger,
  },
  failedText: {
    color: colors.danger,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.lg,
    padding: space.xl,
  },
  centerText: {
    textAlign: "center",
  },
  listEmpty: {
    paddingVertical: space.xl,
    textAlign: "center",
  },
});
