import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppState,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  SectionList,
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
import Loading from "../components/Loading";
import PixelIcon from "../components/PixelIcon";
import { listFavorites, toggleFavorite } from "../lib/db";
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

  const [contactsState, setContactsState] = useState("loading");
  const [canAskContacts, setCanAskContacts] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [favorites, setFavorites] = useState(new Set());
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(null);

  const loadContacts = useCallback(async (ask) => {
    setContactsState("loading");

    try {
      const permission = await Contacts.getPermissionsAsync();
      let contactStatus = permission.status;
      let canAskAgain = permission.canAskAgain !== false;

      if (contactStatus !== "granted" && ask && canAskAgain) {
        const asked = await Contacts.requestPermissionsAsync();
        contactStatus = asked.status;
        canAskAgain = asked.canAskAgain !== false;
      }

      setCanAskContacts(canAskAgain);
      if (contactStatus !== "granted") {
        setContactsState("denied");
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
      });

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
      setFavorites(
        new Set(listFavorites().map((favorite) => favorite.number)),
      );
      setContactsState("granted");
    } catch {
      setContactsState("denied");
    }
  }, []);

  useEffect(() => {
    loadContacts(true);
  }, [loadContacts]);

  // Returning from system settings should reveal the contacts without a
  // manual refresh.
  useEffect(() => {
    if (contactsState !== "denied") return undefined;
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") loadContacts(false);
    });
    return () => subscription.remove();
  }, [contactsState, loadContacts]);

  const retry = async () => {
    setRetrying(true);
    try {
      if (canAskContacts) await loadContacts(true);
      else await Linking.openSettings();
    } catch {
      // The settings screen can fail to open; the button stays available.
    } finally {
      setRetrying(false);
    }
  };

  const sections = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = contacts.filter(
      (contact) =>
        !needle ||
        contact.name.toLowerCase().includes(needle) ||
        contact.number.includes(needle),
    );

    matching.sort((a, b) => a.name.localeCompare(b.name));

    const favoriteRows = matching.filter((contact) =>
      favorites.has(contact.number),
    );
    const otherRows = matching.filter(
      (contact) => !favorites.has(contact.number),
    );

    const result = [];
    if (favoriteRows.length > 0) {
      result.push({ title: "FAVORITES", data: favoriteRows });
    }
    if (otherRows.length > 0) {
      result.push({ title: "ALL CONTACTS", data: otherRows });
    }
    return result;
  }, [contacts, favorites, query]);

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

  const toggleFavoriteContact = (contact) => {
    const nowFavorite = toggleFavorite(contact);
    setFavorites((current) => {
      const next = new Set(current);
      if (nowFavorite) next.add(contact.number);
      else next.delete(contact.number);
      return next;
    });
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
            {parsed.am
              ? `Pay Rs ${parsed.am} to ${parsed.pn || parsed.pa}`
              : `Pay ${parsed.pn || parsed.pa}`}
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
            {parsed.am ? `Pay Rs ${parsed.am} · ${parsed.pa}` : parsed.pa}
          </Text>
        </View>

        {contactsState === "loading" ? (
          <Loading label="Loading contacts" style={styles.fill} />
        ) : contactsState === "denied" ? (
          <View style={styles.empty}>
            <PixelIcon name="user" size={24} color={colors.muted} />
            <Text style={[type.body, styles.centerText]}>
              Contact access is needed to pick who receives the request.
            </Text>
            <AppButton
              label={canAskContacts ? "Try again" : "Open settings"}
              loading={retrying}
              onPress={retry}
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

            <SectionList
              sections={sections}
              keyExtractor={(item) => item.id}
              initialNumToRender={20}
              keyboardShouldPersistTaps="handled"
              stickySectionHeadersEnabled={false}
              contentContainerStyle={styles.list}
              renderSectionHeader={({ section }) => (
                <Text style={[type.label, styles.sectionHeader]}>
                  {section.title}
                </Text>
              )}
              renderItem={({ item }) => {
                const selected = selectedIds.includes(item.id);
                const favorite = favorites.has(item.number);
                return (
                  <View
                    style={[styles.row, selected && styles.rowSelected]}
                  >
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={`${item.name}, ${item.number}`}
                      onPress={() => toggleContact(item.id)}
                      style={({ pressed }) => [
                        styles.rowMain,
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
                          style={[
                            styles.checkbox,
                            selected && styles.checkboxOn,
                          ]}
                        >
                          {selected ? (
                            <PixelIcon name="check" size={16} color={colors.bg} />
                          ) : null}
                        </View>
                      </View>
                    </Pressable>
                    <Pressable
                      onPress={() => toggleFavoriteContact(item)}
                      accessibilityRole="button"
                      accessibilityLabel={
                        favorite
                          ? `Remove ${item.name} from favorites`
                          : `Add ${item.name} to favorites`
                      }
                      hitSlop={8}
                      style={({ pressed }) => [
                        styles.star,
                        pressed && styles.starPressed,
                      ]}
                    >
                      <PixelIcon
                        name="star"
                        size={20}
                        color={favorite ? colors.accent : colors.muted}
                      />
                    </Pressable>
                  </View>
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
              sending
                ? "Sending"
                : selectedIds.length > 0
                  ? `Send to ${selectedIds.length}`
                  : "Send request"
            }
            icon="send"
            loading={sending}
            onPress={sendRequests}
            disabled={selectedIds.length === 0}
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
  fill: {
    flex: 1,
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
  sectionHeader: {
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowSelected: {
    backgroundColor: colors.panel,
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
    paddingVertical: space.sm,
  },
  rowPressed: {
    backgroundColor: colors.line,
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
  star: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius,
  },
  starPressed: {
    backgroundColor: colors.line,
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
