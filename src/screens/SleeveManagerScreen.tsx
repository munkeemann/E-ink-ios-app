/**
 * Sleeve Manager — register sleeves, list with zone badges.
 * Fixed Pi response parsing to match actual format:
 *   GET /sleeves → { "sleeves": { "1": { "ip": "..." }, ... } }
 *   GET /zones   → { "zones": { "1": "LIB", "2": "GRV", ... } }
 */
import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList, Sleeve} from '../types';
import {listSleeves, registerSleeve, fetchZones} from '../api/piServer';

type Props = NativeStackScreenProps<RootStackParamList, 'SleeveManager'>;

export default function SleeveManagerScreen(_props: Props) {
  const [sleeves, setSleeves] = useState<Sleeve[]>([]);
  const [zones, setZones] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [regSleeveId, setRegSleeveId] = useState('');
  const [regIp, setRegIp] = useState('');
  const [registering, setRegistering] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const [fresh, freshZones] = await Promise.all([listSleeves(), fetchZones()]);
      setSleeves(fresh);
      setZones(freshZones);
    } catch (e) {
      Alert.alert(
        'Connection failed',
        `Cannot reach Pi at 192.168.4.1:5050\n\n${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRegister = async () => {
    const id = parseInt(regSleeveId, 10);
    if (isNaN(id) || id < 0) {
      Alert.alert('Invalid ID', 'Sleeve ID must be a non-negative integer.');
      return;
    }
    if (!regIp.trim()) {
      Alert.alert('Invalid IP', 'Enter the sleeve IP address.');
      return;
    }
    setRegistering(true);
    try {
      await registerSleeve(id, regIp.trim());
      setRegSleeveId('');
      setRegIp('');
      await refresh();
    } catch (e) {
      Alert.alert('Register failed', e instanceof Error ? e.message : String(e));
    } finally {
      setRegistering(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.formCard}>
        <Text style={styles.sectionTitle}>Register Sleeve</Text>
        <View style={styles.formRow}>
          <TextInput
            style={[styles.input, {width: 64}]}
            placeholder="ID"
            placeholderTextColor="#3a5060"
            value={regSleeveId}
            onChangeText={setRegSleeveId}
            keyboardType="number-pad"
            maxLength={4}
          />
          <TextInput
            style={[styles.input, {flex: 1}]}
            placeholder="IP  e.g. 192.168.4.20"
            placeholderTextColor="#3a5060"
            value={regIp}
            onChangeText={setRegIp}
            keyboardType="decimal-pad"
            autoCorrect={false}
          />
        </View>
        <TouchableOpacity
          style={[
            styles.registerBtn,
            (registering || !regSleeveId || !regIp) && styles.btnDisabled,
          ]}
          onPress={handleRegister}
          disabled={registering || !regSleeveId || !regIp}>
          {registering ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.registerBtnText}>Register</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.sectionTitle}>
          Registered ({sleeves.length})
        </Text>
        <TouchableOpacity onPress={refresh} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#8083D3" size="small" />
          ) : (
            <Text style={styles.refreshText}>↻ Refresh</Text>
          )}
        </TouchableOpacity>
      </View>

      <FlatList
        data={sleeves}
        keyExtractor={s => String(s.sleeve_id)}
        contentContainerStyle={styles.list}
        renderItem={({item}) => (
          <View style={styles.sleeveRow}>
            <View style={styles.sleeveInfo}>
              <Text style={styles.sleeveId}>Sleeve #{item.sleeve_id}</Text>
              <Text style={styles.sleeveIp}>{item.ip}</Text>
            </View>
            {zones[String(item.sleeve_id)] && (
              <View style={styles.zoneBadge}>
                <Text style={styles.zoneText}>{zones[String(item.sleeve_id)]}</Text>
              </View>
            )}
          </View>
        )}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.emptyText}>No sleeves registered.</Text>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#0C1F29'},
  formCard: {
    margin: 16,
    backgroundColor: '#132030',
    borderRadius: 10,
    padding: 14,
  },
  sectionTitle: {
    color: '#8083D3',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  formRow: {flexDirection: 'row', gap: 8, marginBottom: 10},
  input: {
    backgroundColor: '#0C1F29',
    borderRadius: 8,
    padding: 10,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#2a3e50',
  },
  registerBtn: {
    backgroundColor: '#8083D3',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  btnDisabled: {opacity: 0.4},
  registerBtnText: {color: '#fff', fontWeight: 'bold', fontSize: 14},
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  refreshText: {color: '#8083D3', fontSize: 13},
  list: {paddingHorizontal: 16, paddingBottom: 40},
  sleeveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#132030',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
  },
  sleeveInfo: {flex: 1},
  sleeveId: {color: '#8AA2AE', fontSize: 15, fontWeight: '600'},
  sleeveIp: {color: '#556', fontSize: 12, marginTop: 2},
  zoneBadge: {
    backgroundColor: '#1a3020',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  zoneText: {color: '#88DBD9', fontSize: 12, fontWeight: '600'},
  emptyText: {color: '#556', textAlign: 'center', marginTop: 40, fontSize: 14},
});
