import { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { loadSettings, saveSettings } from '../src/storage/deckStorage';
import { configurePiDebug } from '../src/api/piServer';
import { AppSettings } from '../src/types';

const ZONE_OPTIONS: { id: string; label: string; note?: string }[] = [
  { id: 'LIB',   label: 'Library (top card)' },
  { id: 'HND',   label: 'Hand' },
  { id: 'BTFLD', label: 'Battlefield' },
  { id: 'GRV',   label: 'Graveyard', note: 'virtual by default' },
  { id: 'EXL',   label: 'Exile',     note: 'virtual by default' },
];

export default function SettingsScreen() {
  const [settings, setSettings] = useState<AppSettings>({
    sleeveCount: 5,
    physicalZones: ['LIB', 'HND', 'BTFLD'],
    librarySleeveDepth: 1,
    devMode: false,
    piDebugAlerts: false,
  });
  useFocusEffect(
    useCallback(() => {
      loadSettings().then(setSettings);
    }, []),
  );

  const setSleeveCount = (delta: number) => {
    setSettings(prev => ({
      ...prev,
      sleeveCount: Math.max(1, Math.min(60, prev.sleeveCount + delta)),
    }));
  };

  const setLibraryDepth = (delta: number) => {
    setSettings(prev => ({
      ...prev,
      librarySleeveDepth: Math.max(1, Math.min(10, (prev.librarySleeveDepth ?? 1) + delta)),
    }));
  };

  const toggleZone = (zoneId: string) => {
    setSettings(prev => {
      const has = prev.physicalZones.includes(zoneId);
      return {
        ...prev,
        physicalZones: has
          ? prev.physicalZones.filter(z => z !== zoneId)
          : [...prev.physicalZones, zoneId],
      };
    });
  };

  const handleSave = async () => {
    await saveSettings(settings);
    configurePiDebug(settings.devMode && settings.piDebugAlerts);
    router.back();
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Sleeve count */}
        <Text style={styles.sectionTitle}>Physical Sleeves</Text>
        <View style={styles.card}>
          <View style={styles.sleeveRow}>
            <Text style={styles.rowLabel}>Sleeve count</Text>
            <View style={styles.stepper}>
              <Pressable
                style={[styles.stepBtn, settings.sleeveCount <= 1 && styles.stepBtnDisabled]}
                onPress={() => setSleeveCount(-1)}
                disabled={settings.sleeveCount <= 1}
              >
                <Text style={styles.stepBtnText}>−</Text>
              </Pressable>
              <Text style={styles.stepValue}>{settings.sleeveCount}</Text>
              <Pressable
                style={[styles.stepBtn, settings.sleeveCount >= 60 && styles.stepBtnDisabled]}
                onPress={() => setSleeveCount(1)}
                disabled={settings.sleeveCount >= 60}
              >
                <Text style={styles.stepBtnText}>+</Text>
              </Pressable>
            </View>
          </View>
          <View style={[styles.sleeveRow, styles.sleeveRowBorder]}>
            <View style={styles.depthLabelCol}>
              <Text style={styles.rowLabel}>Library depth (sleeves)</Text>
              <Text style={styles.rowSublabel}>How many top-of-library cards get a physical sleeve</Text>
            </View>
            <View style={styles.stepper}>
              <Pressable
                style={[styles.stepBtn, (settings.librarySleeveDepth ?? 1) <= 1 && styles.stepBtnDisabled]}
                onPress={() => setLibraryDepth(-1)}
                disabled={(settings.librarySleeveDepth ?? 1) <= 1}
              >
                <Text style={styles.stepBtnText}>−</Text>
              </Pressable>
              <Text style={styles.stepValue}>{settings.librarySleeveDepth ?? 1}</Text>
              <Pressable
                style={[styles.stepBtn, (settings.librarySleeveDepth ?? 1) >= 10 && styles.stepBtnDisabled]}
                onPress={() => setLibraryDepth(1)}
                disabled={(settings.librarySleeveDepth ?? 1) >= 10}
              >
                <Text style={styles.stepBtnText}>+</Text>
              </Pressable>
            </View>
          </View>
        </View>
        <Text style={styles.hint}>
          Commander always occupies sleeve 1. Remaining {settings.sleeveCount - 1} sleeve{settings.sleeveCount - 1 !== 1 ? 's' : ''} are filled from physical zones below.
        </Text>

        {/* Physical zones */}
        <Text style={styles.sectionTitle}>Physical Zones</Text>
        <Text style={styles.hint}>
          Cards in physical zones are pushed to sleeves. Cards in virtual zones are tracked in the app only.
        </Text>
        <View style={styles.card}>
          {ZONE_OPTIONS.map((zone, i) => (
            <View
              key={zone.id}
              style={[styles.toggleRow, i < ZONE_OPTIONS.length - 1 && styles.toggleRowBorder]}
            >
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleLabel}>{zone.label}</Text>
                {zone.note && <Text style={styles.toggleNote}>{zone.note}</Text>}
              </View>
              <Switch
                value={settings.physicalZones.includes(zone.id)}
                onValueChange={() => toggleZone(zone.id)}
                trackColor={{ false: '#4a4f55', true: '#6650a4' }}
                thumbColor={settings.physicalZones.includes(zone.id) ? '#D0BCFF' : '#9ca3af'}
              />
            </View>
          ))}
        </View>

        {/* Dev Mode */}
        <Text style={styles.sectionTitle}>Developer</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Dev Mode</Text>
              <Text style={styles.toggleNote}>Reveals hidden game information</Text>
            </View>
            <Switch
              value={settings.devMode}
              onValueChange={v => setSettings(prev => ({
                ...prev,
                devMode: v,
                piDebugAlerts: v ? prev.piDebugAlerts : false,
              }))}
              trackColor={{ false: '#4a4f55', true: '#6650a4' }}
              thumbColor={settings.devMode ? '#D0BCFF' : '#9ca3af'}
            />
          </View>
          {settings.devMode && (
            <View style={[styles.toggleRow, styles.toggleRowBorder, styles.subToggleRow]}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleLabel}>Pi Debug Alerts</Text>
                <Text style={styles.toggleNote}>Show blocking step-by-step alerts for all Pi network calls</Text>
              </View>
              <Switch
                value={settings.piDebugAlerts}
                onValueChange={v => setSettings(prev => ({ ...prev, piDebugAlerts: v }))}
                trackColor={{ false: '#4a4f55', true: '#6650a4' }}
                thumbColor={settings.piDebugAlerts ? '#D0BCFF' : '#9ca3af'}
              />
            </View>
          )}
        </View>

      </ScrollView>

      <Pressable style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>Save Settings</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#292E32' },
  scroll: { padding: 16, paddingBottom: 8 },

  sectionTitle: {
    color: '#D0BCFF',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },
  hint: {
    color: '#625b71',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
    marginLeft: 4,
  },

  card: {
    backgroundColor: '#353A40',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4a4f55',
    overflow: 'hidden',
  },

  sleeveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sleeveRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#4a4f55',
  },
  depthLabelCol: { flex: 1, marginRight: 12 },
  rowLabel: { color: '#D4CDC1', fontSize: 16 },
  rowSublabel: { color: '#625b71', fontSize: 12, marginTop: 2 },

  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  stepBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#6650a4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnDisabled: { opacity: 0.35 },
  stepBtnText: { color: '#D0BCFF', fontSize: 22, fontWeight: '700', lineHeight: 26 },
  stepValue: {
    color: '#D0BCFF',
    fontSize: 22,
    fontWeight: '800',
    minWidth: 48,
    textAlign: 'center',
  },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  toggleRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#4a4f55',
  },
  subToggleRow: { backgroundColor: '#2e333a' },
  toggleInfo: { flex: 1 },
  toggleLabel: { color: '#D4CDC1', fontSize: 15 },
  toggleNote: { color: '#625b71', fontSize: 12, marginTop: 2 },

  saveBtn: {
    margin: 16,
    backgroundColor: '#6650a4',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnText: { color: '#D0BCFF', fontSize: 17, fontWeight: '800' },

  variantBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#6650a4',
  },
  variantBtnText: { color: '#D0BCFF', fontSize: 13, fontWeight: '700', minWidth: 72, textAlign: 'center' },
  variantBtnArrow: { color: '#D0BCFF', fontSize: 18 },
});
